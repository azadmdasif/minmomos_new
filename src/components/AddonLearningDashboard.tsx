import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  ShieldCheck, 
  Settings2, 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  Percent, 
  DollarSign, 
  Layers, 
  Info
} from 'lucide-react';
import { 
  getAllStoredImpressions, 
  fetchAndSyncAllImpressions,
  fetchRemoteStatsSnapshot,
  getAddonEngineConfig, 
  saveAddonEngineConfig 
} from '../utils/addonStorageQueue';
import { runFullOfflineRebuild } from '../utils/addonEngineRebuild';
import { runAddonSimulation, SimulationResult } from '../utils/addonEngineSimulator';
import { betaCredibleInterval90 } from '../utils/seededRandom';
import { AddonImpression, AddonEngineConfig } from '../types/addonEngine';

export const AddonLearningDashboard: React.FC = () => {
  const [impressions, setImpressions] = useState<AddonImpression[]>([]);
  const [config, setConfig] = useState<AddonEngineConfig>(getAddonEngineConfig());
  const [isRebuilding, setIsRebuilding] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [rebuildStatus, setRebuildStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'performance' | 'holdout' | 'health' | 'simulation' | 'config'>('performance');

  const reloadData = async (_forceCloud = false) => {
    // 1. Instant local read so UI is never blocked
    const local = getAllStoredImpressions();
    setImpressions(local);
    setConfig(getAddonEngineConfig());

    // 2. Cross-device Cloud sync from Supabase
    setIsSyncing(true);
    try {
      const [liveImps] = await Promise.all([
        fetchAndSyncAllImpressions(),
        fetchRemoteStatsSnapshot()
      ]);
      setImpressions(liveImps);
      setConfig(getAddonEngineConfig());
    } catch (e) {
      console.warn('Dashboard cloud sync fallback:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    reloadData(true);
  }, []);

  const handleRunRebuild = async () => {
    setIsRebuilding(true);
    setRebuildStatus('Rebuilding hierarchical statistics and customer profiles from raw logs...');
    try {
      await runFullOfflineRebuild();
      reloadData();
      setRebuildStatus('Nightly rebuild completed successfully! Statistics updated.');
      setTimeout(() => setRebuildStatus(null), 4000);
    } catch (err: any) {
      setRebuildStatus(`Rebuild failed: ${err?.message || err}`);
    } finally {
      setIsRebuilding(false);
    }
  };

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      const res = runAddonSimulation(1000);
      setSimulationResult(res);
      setIsSimulating(false);
      setActiveTab('simulation');
    }, 150);
  };

  const handleConfigChange = (key: keyof AddonEngineConfig, value: any) => {
    const updated = saveAddonEngineConfig({ [key]: value });
    setConfig(updated);
  };

  // --- COMPUTE REAL-TIME DASHBOARD METRICS ---
  const validObservations = impressions.filter(i => i.outcome === 'accepted' || i.outcome === 'declined');
  const totalShown = impressions.filter(i => i.outcome !== 'not_shown_holdout').length;
  const totalAccepted = impressions.filter(i => i.outcome === 'accepted').length;
  const overallAcceptRate = validObservations.length > 0 ? (totalAccepted / validObservations.length) * 100 : 0;
  
  const totalGrossProfit = impressions
    .filter(i => i.outcome === 'accepted')
    .reduce((acc, i) => acc + (i.offer_price - i.offer_cost), 0);

  const profitPerImpression = totalShown > 0 ? totalGrossProfit / totalShown : 0;

  // --- PER OFFER_KEY PERFORMANCE TABLE ---
  const offerStatsMap: Record<string, {
    impressions: number;
    accepts: number;
    declines: number;
    grossProfit: number;
    last4WeeksCounts: [number, number, number, number];
  }> = {};

  const now = new Date();
  const msInWeek = 7 * 24 * 60 * 60 * 1000;

  impressions.forEach(imp => {
    if (imp.outcome === 'not_shown_holdout') return;
    const key = imp.offer_key;
    if (!offerStatsMap[key]) {
      offerStatsMap[key] = {
        impressions: 0,
        accepts: 0,
        declines: 0,
        grossProfit: 0,
        last4WeeksCounts: [0, 0, 0, 0]
      };
    }
    const stat = offerStatsMap[key];
    stat.impressions += 1;
    if (imp.outcome === 'accepted') {
      stat.accepts += 1;
      stat.grossProfit += (imp.offer_price - imp.offer_cost);
    } else if (imp.outcome === 'declined') {
      stat.declines += 1;
    }

    // 4-week trend binning
    const ageMs = now.getTime() - new Date(imp.created_at).getTime();
    const weekIdx = Math.min(3, Math.max(0, Math.floor(ageMs / msInWeek)));
    if (imp.outcome === 'accepted') {
      stat.last4WeeksCounts[3 - weekIdx] += 1;
    }
  });

  const offerTableData = Object.entries(offerStatsMap).map(([offerKey, data]) => {
    const totalDecisions = data.accepts + data.declines;
    const rate = totalDecisions > 0 ? (data.accepts / totalDecisions) : 0.1625;
    // Hierarchical posterior interval
    const { mean, low90, high90 } = betaCredibleInterval90(15 * 0.1625 + data.accepts, 15 * (1 - 0.1625) + data.declines);
    const gpPerImp = data.impressions > 0 ? data.grossProfit / data.impressions : 0;

    return {
      offerKey,
      impressions: data.impressions,
      accepts: data.accepts,
      declines: data.declines,
      rawRate: (rate * 100).toFixed(1),
      posteriorMean: (mean * 100).toFixed(1),
      ci90: `[${(low90 * 100).toFixed(1)}% - ${(high90 * 100).toFixed(1)}%]`,
      grossProfit: data.grossProfit,
      gpPerImp: `₹${gpPerImp.toFixed(2)}`,
      trend: data.last4WeeksCounts
    };
  }).sort((a, b) => b.grossProfit - a.grossProfit);

  // --- HOLDOUT COMPARISON (AOV & Gross Profit with vs without variable offer) ---
  const holdoutImpressions = impressions.filter(i => i.source === 'holdout');
  const variableImpressions = impressions.filter(i => i.source !== 'holdout');

  const holdoutAov = holdoutImpressions.length > 0 
    ? holdoutImpressions.reduce((acc, i) => acc + i.cart_total, 0) / holdoutImpressions.length 
    : 0;

  const variableAov = variableImpressions.length > 0
    ? variableImpressions.reduce((acc, i) => acc + i.cart_total + (i.outcome === 'accepted' ? i.offer_price : 0), 0) / variableImpressions.length
    : 0;

  const aovUplift = holdoutAov > 0 ? ((variableAov - holdoutAov) / holdoutAov) * 100 : 0;

  // --- LEARNING HEALTH ---
  const sourceDistribution: Record<string, number> = {};
  let identifiedCount = 0;
  let anonymousCount = 0;

  impressions.forEach(i => {
    if (i.outcome === 'not_shown_holdout') return;
    sourceDistribution[i.source] = (sourceDistribution[i.source] || 0) + 1;
    if (i.customer_phone || i.customer_id) identifiedCount++;
    else anonymousCount++;
  });

  const totalHealthDecisions = totalShown || 1;

  return (
    <div className="h-full flex flex-col bg-stone-50 overflow-y-auto p-4 sm:p-6 lg:p-8 no-scrollbar">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-brand-yellow/20 text-brand-brown">
              <BarChart3 className="w-6 h-6 text-brand-brown" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-brand-brown uppercase italic tracking-tighter">
                Add-on <span className="text-brand-red">Statistical Engine</span>
              </h1>
              <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mt-0.5">
                Slow Bayesian Learning & Customer Memory · Zero LLM In Loop
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => reloadData(true)}
            disabled={isSyncing}
            className="py-2.5 px-3 rounded-xl bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            title="Sync latest live impressions and stats across all devices from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brand-red ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Cloud'}</span>
          </button>

          <button
            type="button"
            onClick={handleRunRebuild}
            disabled={isRebuilding}
            className="py-2.5 px-4 rounded-xl bg-white border border-stone-200 text-brand-brown hover:bg-stone-100 font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRebuilding ? 'animate-spin text-brand-red' : ''}`} />
            <span>{isRebuilding ? 'Rebuilding...' : 'Run Rebuild Now'}</span>
          </button>

          <button
            type="button"
            onClick={handleRunSimulation}
            disabled={isSimulating}
            className="py-2.5 px-4 rounded-xl bg-brand-brown hover:bg-stone-800 text-brand-yellow font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Play className={`w-4 h-4 fill-brand-yellow ${isSimulating ? 'animate-pulse' : ''}`} />
            <span>{isSimulating ? 'Auditing...' : 'Run 1,000 Cart Audit'}</span>
          </button>
        </div>
      </div>

      {rebuildStatus && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3 animate-in fade-in duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-xs font-bold">{rebuildStatus}</p>
        </div>
      )}

      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider">Total Impressions</span>
            <Layers className="w-4 h-4 text-brand-yellow" />
          </div>
          <div>
            <span className="text-3xl font-black text-brand-brown tracking-tight">{totalShown.toLocaleString()}</span>
            <span className="text-[10px] font-bold text-stone-400 block mt-1">Logged live at POS Bill & Print</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider">Acceptance Rate</span>
            <Percent className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <span className="text-3xl font-black text-mountain-green tracking-tight">{overallAcceptRate.toFixed(1)}%</span>
            <span className="text-[10px] font-bold text-stone-400 block mt-1">
              {totalAccepted} accepts of {validObservations.length} decided
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider">Gross Profit Added</span>
            <DollarSign className="w-4 h-4 text-brand-red" />
          </div>
          <div>
            <span className="text-3xl font-black text-brand-red tracking-tight">₹{Math.round(totalGrossProfit).toLocaleString()}</span>
            <span className="text-[10px] font-bold text-stone-400 block mt-1">
              ₹{profitPerImpression.toFixed(2)} GP / impression
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider">Holdout Control Uplift</span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <span className="text-3xl font-black text-indigo-600 tracking-tight">
              {aovUplift >= 0 ? `+${aovUplift.toFixed(1)}%` : `${aovUplift.toFixed(1)}%`}
            </span>
            <span className="text-[10px] font-bold text-stone-400 block mt-1">
              AOV vs 10% unprompted holdout
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-3 mb-6 overflow-x-auto no-scrollbar">
        {[
          { id: 'performance', label: 'Offer Key Performance', icon: BarChart3 },
          { id: 'holdout', label: 'Holdout Comparison (A/B)', icon: TrendingUp },
          { id: 'health', label: 'Learning Health & Hierarchy', icon: Layers },
          { id: 'simulation', label: 'Simulation & Invariant Audit', icon: ShieldCheck },
          { id: 'config', label: 'Engine Configuration', icon: Settings2 }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                isActive 
                  ? 'bg-brand-yellow text-brand-brown shadow-sm' 
                  : 'text-stone-500 hover:text-brand-brown hover:bg-stone-200/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OFFER KEY PERFORMANCE */}
      {activeTab === 'performance' && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-black text-lg text-brand-brown uppercase tracking-tight">
                Offer Performance & Bayesian Posteriors
              </h3>
              <p className="text-xs text-stone-500">
                Hierarchical Beta-Binomial estimates with 90% Bayesian Credible Intervals (CI)
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-stone-100 text-[10px] font-mono font-bold text-stone-600">
              k = {config.K_PRIOR} prior strength
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 text-stone-400 font-black uppercase tracking-wider border-b border-stone-100">
                <tr>
                  <th className="py-3 px-3">Offer Key</th>
                  <th className="py-3 px-3 text-right">Shown</th>
                  <th className="py-3 px-3 text-right">Accepted</th>
                  <th className="py-3 px-3 text-right">Raw Rate</th>
                  <th className="py-3 px-3 text-center">90% Credible Interval</th>
                  <th className="py-3 px-3 text-right">Gross Profit</th>
                  <th className="py-3 px-3 text-right">GP / Impression</th>
                  <th className="py-3 px-3 text-center">4-Wk Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium">
                {offerTableData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-stone-400 font-bold">
                      No add-on impressions recorded yet. Bill an order in the POS or run the simulation to see live statistics.
                    </td>
                  </tr>
                ) : (
                  offerTableData.map(row => (
                    <tr key={row.offerKey} className="hover:bg-stone-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-brand-brown">
                        {row.offerKey}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-stone-600">
                        {row.impressions}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-600 font-bold">
                        {row.accepts}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-stone-700 font-bold">
                        {row.rawRate}%
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 font-mono text-[11px] text-stone-700">
                          {row.ci90}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-brand-red">
                        ₹{row.grossProfit}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-stone-700">
                        {row.gpPerImp}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {row.trend.map((val, idx) => (
                            <span 
                              key={idx} 
                              className="w-1.5 bg-brand-yellow rounded-t"
                              style={{ height: `${Math.min(18, Math.max(4, val * 3))}px` }}
                              title={`Wk ${idx + 1}: ${val} accepts`}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: HOLDOUT COMPARISON (A/B) */}
      {activeTab === 'holdout' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-lg text-brand-brown uppercase tracking-tight">
                Prompted Variable Add-on (90% of Orders)
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                Active Arm
              </span>
            </div>
            <p className="text-xs text-stone-500 mb-6">
              Customers shown the dynamic statistical add-on card alongside fixed sides.
            </p>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-stone-50 flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500 uppercase">Average Order Value (AOV)</span>
                <span className="text-xl font-black text-brand-brown">₹{Math.round(variableAov)}</span>
              </div>
              <div className="p-4 rounded-xl bg-stone-50 flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500 uppercase">Total Orders Evaluated</span>
                <span className="text-xl font-black text-brand-brown">{variableImpressions.length}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-lg text-stone-700 uppercase tracking-tight">
                Holdout Control Group (10% of Orders)
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-stone-200 text-stone-700 text-[10px] font-black uppercase">
                Control Arm
              </span>
            </div>
            <p className="text-xs text-stone-500 mb-6">
              Customers shown ONLY the fixed section (no variable add-on card) to measure true revenue incrementality.
            </p>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-stone-50 flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500 uppercase">Average Order Value (AOV)</span>
                <span className="text-xl font-black text-stone-700">₹{Math.round(holdoutAov)}</span>
              </div>
              <div className="p-4 rounded-xl bg-stone-50 flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500 uppercase">Total Orders Evaluated</span>
                <span className="text-xl font-black text-stone-700">{holdoutImpressions.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LEARNING HEALTH & HIERARCHY */}
      {activeTab === 'health' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
            <h3 className="font-black text-lg text-brand-brown uppercase tracking-tight mb-2">
              Decision Source Distribution
            </h3>
            <p className="text-xs text-stone-500 mb-6">
              Shows how the engine transitions from conservative priors to L1 contextual learning and customer memory.
            </p>

            <div className="space-y-3">
              {[
                { label: 'Customer Memory (Personalized)', key: 'history', color: 'bg-emerald-500' },
                { label: 'Level 1: Contextual (Cart x Value Band)', key: 'thompson_l1', color: 'bg-indigo-500' },
                { label: 'Level 0: Global Offer Key', key: 'thompson_l0', color: 'bg-blue-500' },
                { label: 'Complement Prior / Rule Fallback', key: 'complement', color: 'bg-amber-500' },
                { label: 'Pinned Rule (Steamed Chicken Large)', key: 'pinned', color: 'bg-stone-500' },
                { label: 'Pure Exploration (5% ε-arm)', key: 'explore', color: 'bg-purple-500' }
              ].map(item => {
                const count = sourceDistribution[item.key] || 0;
                const pct = (count / totalHealthDecisions) * 100;
                return (
                  <div key={item.key}>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-stone-600">{item.label}</span>
                      <span className="font-mono">{count} ({pct.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-stone-100 rounded-full h-2.5 overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="font-black text-lg text-brand-brown uppercase tracking-tight mb-2">
                Customer Identification Status
              </h3>
              <p className="text-xs text-stone-500 mb-6">
                Personalized customer memory activates once a phone number is attached and customer has $\ge 3$ visits.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                  <span className="text-xs font-bold text-emerald-800 uppercase block mb-1">Identified Orders</span>
                  <span className="text-2xl font-black text-emerald-900 font-mono">{identifiedCount}</span>
                  <span className="text-[10px] text-emerald-600 font-bold block mt-1">
                    {((identifiedCount / totalHealthDecisions) * 100).toFixed(1)}% of total
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-center">
                  <span className="text-xs font-bold text-stone-600 uppercase block mb-1">Anonymous Orders</span>
                  <span className="text-2xl font-black text-stone-800 font-mono">{anonymousCount}</span>
                  <span className="text-[10px] text-stone-400 font-bold block mt-1">
                    Uses L0 / L1 Contextual
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 font-medium leading-relaxed">
                <strong>Exposure Cap & Decline Cooldown:</strong> The engine automatically caps any single offer key at 40% of shown impressions in rolling 7 days, and damps declined offers by 60% for 14 days.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SIMULATION & INVARIANT AUDIT */}
      {activeTab === 'simulation' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-black text-lg text-brand-brown uppercase tracking-tight">
                  1,000 Synthetic Cart Invariant Audit
                </h3>
                <p className="text-xs text-stone-500">
                  Tests 10,000 permutations of random carts to rigorously prove zero constraint violations.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRunSimulation}
                disabled={isSimulating}
                className="py-2.5 px-4 rounded-xl bg-brand-brown text-brand-yellow font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer hover:bg-stone-800 transition-all active:scale-95"
              >
                <Play className="w-4 h-4 fill-brand-yellow" />
                <span>Rerun Audit (1,000 Carts)</span>
              </button>
            </div>

            {simulationResult ? (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className={`p-4 rounded-xl border text-center ${
                    simulationResult.constraintViolations.total === 0 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}>
                    <span className="text-[10px] font-black uppercase tracking-wider block mb-1">Total Rule Violations</span>
                    <span className="text-3xl font-black font-mono">{simulationResult.constraintViolations.total}</span>
                    <span className="text-[10px] font-bold block mt-1">
                      {simulationResult.constraintViolations.total === 0 ? '✓ 100% Invariant Compliant' : 'Violations Detected'}
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 block mb-1">&lt;25% Price Cap</span>
                    <span className="text-3xl font-black text-emerald-700 font-mono">
                      {simulationResult.constraintViolations.under20PercentViolations}
                    </span>
                    <span className="text-[10px] font-bold text-stone-400 block mt-1">Violations</span>
                  </div>

                  <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 block mb-1">&ge;1.4x Cost Margin</span>
                    <span className="text-3xl font-black text-emerald-700 font-mono">
                      {simulationResult.constraintViolations.marginViolations}
                    </span>
                    <span className="text-[10px] font-bold text-stone-400 block mt-1">Violations</span>
                  </div>

                  <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 block mb-1">Exposure Cap (40%)</span>
                    <span className="text-3xl font-black text-brand-brown font-mono">
                      {(simulationResult.exposureCapStatus.maxSingleOfferShare * 100).toFixed(1)}%
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 block mt-1">
                      {simulationResult.exposureCapStatus.passed ? '✓ Within Safe Cap' : 'Exceeded'}
                    </span>
                  </div>
                </div>

                {/* Sample Decisions from Audit */}
                <div>
                  <h4 className="font-black text-xs uppercase tracking-wider text-stone-400 mb-3">
                    Sample Automated Decisions Audited
                  </h4>
                  <div className="overflow-x-auto border border-stone-100 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-stone-50 font-black uppercase text-stone-400">
                        <tr>
                          <th className="p-2.5">Customer Cart</th>
                          <th className="p-2.5 text-right">Cart Total</th>
                          <th className="p-2.5">Suggested Add-on</th>
                          <th className="p-2.5 text-right">Offer Price</th>
                          <th className="p-2.5 text-right">% of Cart</th>
                          <th className="p-2.5 text-center">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 font-medium">
                        {simulationResult.sampleDecisions.map((s, idx) => (
                          <tr key={idx} className="hover:bg-stone-50/50">
                            <td className="p-2.5 font-bold text-brand-brown max-w-xs truncate">{s.cartDesc}</td>
                            <td className="p-2.5 text-right font-mono font-bold">₹{s.cartTotal}</td>
                            <td className="p-2.5 font-bold text-emerald-700">{s.offerChosen}</td>
                            <td className="p-2.5 text-right font-mono font-bold">₹{s.offerPrice}</td>
                            <td className="p-2.5 text-right font-mono text-stone-500">{s.pctOfCart}</td>
                            <td className="p-2.5 text-center">
                              <span className="px-2 py-0.5 rounded bg-stone-100 text-[10px] font-mono text-stone-600">
                                {s.source}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-stone-400 font-bold border-2 border-dashed border-stone-200 rounded-2xl">
                Click "Run 1,000 Cart Audit" to execute the synthetic simulator and verify all invariant checks.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: ENGINE CONFIGURATION */}
      {activeTab === 'config' && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm max-w-3xl">
          <h3 className="font-black text-lg text-brand-brown uppercase tracking-tight mb-2">
            Statistical Engine Policy Parameters
          </h3>
          <p className="text-xs text-stone-500 mb-6">
            Fine-tune exploration rates, holdout split, margin targets, and pinned rules.
          </p>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-stone-50 border border-stone-200">
              <div>
                <span className="font-bold text-xs uppercase text-brand-brown block">Pinned Rule Mode</span>
                <span className="text-[11px] text-stone-500">
                  Steamed Chicken Large +2 Momos for ₹15 behavior
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleConfigChange('PINNED_RULE_MODE', 'always')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    config.PINNED_RULE_MODE === 'always'
                      ? 'bg-brand-brown text-white shadow-sm'
                      : 'bg-white border border-stone-300 text-stone-600'
                  }`}
                >
                  Always Pinned
                </button>
                <button
                  type="button"
                  onClick={() => handleConfigChange('PINNED_RULE_MODE', 'prior_only')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    config.PINNED_RULE_MODE === 'prior_only'
                      ? 'bg-brand-brown text-white shadow-sm'
                      : 'bg-white border border-stone-300 text-stone-600'
                  }`}
                >
                  Prior Only (Let Data Decide)
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-stone-50 border border-stone-200">
              <div>
                <span className="font-bold text-xs uppercase text-brand-brown block">Soft Target Multiple</span>
                <span className="text-[11px] text-stone-500">
                  Penalize offers with price/cost below this ratio (default: 1.8x)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number"
                  step="0.1"
                  min="1.4"
                  max="3.0"
                  value={config.SOFT_TARGET_MULTIPLE}
                  onChange={(e) => handleConfigChange('SOFT_TARGET_MULTIPLE', parseFloat(e.target.value) || 1.8)}
                  className="w-20 p-2 rounded-lg bg-white border border-stone-300 text-center font-bold font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-stone-50 border border-stone-200">
              <div>
                <span className="font-bold text-xs uppercase text-brand-brown block">Maximum Hierarchy Level</span>
                <span className="text-[11px] text-stone-500">
                  Allow Level 1 contextual conditioning (Cart Type x Value Band)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleConfigChange('MAX_LEVEL', 'L0')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    config.MAX_LEVEL === 'L0'
                      ? 'bg-brand-brown text-white shadow-sm'
                      : 'bg-white border border-stone-300 text-stone-600'
                  }`}
                >
                  L0 (Global Only)
                </button>
                <button
                  type="button"
                  onClick={() => handleConfigChange('MAX_LEVEL', 'L1')}
                  className={`py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    config.MAX_LEVEL === 'L1'
                      ? 'bg-brand-brown text-white shadow-sm'
                      : 'bg-white border border-stone-300 text-stone-600'
                  }`}
                >
                  L1 (Contextual)
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-stone-50 border border-stone-200">
              <div>
                <span className="font-bold text-xs uppercase text-brand-brown block">Holdout Rate (Control Group)</span>
                <span className="text-[11px] text-stone-500">
                  Fraction of orders that see only fixed sides (default: 10%)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number"
                  step="0.05"
                  min="0.0"
                  max="0.5"
                  value={config.HOLDOUT_RATE}
                  onChange={(e) => handleConfigChange('HOLDOUT_RATE', parseFloat(e.target.value) || 0.10)}
                  className="w-20 p-2 rounded-lg bg-white border border-stone-300 text-center font-bold font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-stone-50 border border-stone-200">
              <div>
                <span className="font-bold text-xs uppercase text-brand-brown block">Cart Price Cap Limit</span>
                <span className="text-[11px] text-stone-500">
                  Maximum ratio of cart total allowed for add-on price (default: 25%)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number"
                  step="0.05"
                  min="0.10"
                  max="0.50"
                  value={config.PRICE_CAP_RATIO ?? 0.25}
                  onChange={(e) => handleConfigChange('PRICE_CAP_RATIO', parseFloat(e.target.value) || 0.25)}
                  className="w-20 p-2 rounded-lg bg-white border border-stone-300 text-center font-bold font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-stone-50 border border-stone-200">
              <div>
                <span className="font-bold text-xs uppercase text-brand-brown block">Pure Exploration Rate (ε-arm)</span>
                <span className="text-[11px] text-stone-500">
                  Random valid candidate exploration fraction (default: 5%)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number"
                  step="0.01"
                  min="0.0"
                  max="0.2"
                  value={config.EXPLORE_RATE}
                  onChange={(e) => handleConfigChange('EXPLORE_RATE', parseFloat(e.target.value) || 0.05)}
                  className="w-20 p-2 rounded-lg bg-white border border-stone-300 text-center font-bold font-mono text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
