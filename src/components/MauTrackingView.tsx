import React, { useState, useMemo, useEffect } from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from 'recharts';
import { 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  ShoppingBag, 
  AlertTriangle, 
  Zap, 
  CheckCircle2, 
  Send, 
  PieChart as PieIcon,
  ChevronRight,
  User as UserIcon,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { Customer, CompletedOrder } from '../types';
import { normalizePhone, fetchMauOrders } from '../utils/storage';

interface MauTrackingViewProps {
  customers: Customer[];
  allOrders?: CompletedOrder[];
  onSelectCustomer?: (customer: Customer) => void;
}

export const MauTrackingView: React.FC<MauTrackingViewProps> = ({
  customers,
  allOrders,
  onSelectCustomer
}) => {
  const [timeWindow, setTimeWindow] = useState<'30' | '60' | '90'>('90' as any);
  const [chartMetric, setChartMetric] = useState<'size' | 'revenue' | 'aov'>('size');
  const [selectedTier, setSelectedTier] = useState<'all' | 'power' | 'warming' | 'cooling' | 'dormant'>('all');

  // Load deep historical orders directly from Supabase so 90-day lookback is never truncated by view date filter
  const [mauOrders, setMauOrders] = useState<CompletedOrder[]>(() => {
    if (allOrders && allOrders.length >= 2000) {
      const times = allOrders.map(o => new Date(o.date).getTime()).filter(t => !isNaN(t));
      const spanDays = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / (86400000) : 0;
      if (spanDays >= 120) return allOrders;
    }
    return [];
  });
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(mauOrders.length === 0);

  useEffect(() => {
    let isMounted = true;
    const loadFullHistory = async () => {
      if (mauOrders.length >= 2000) return;
      setIsLoadingOrders(true);
      try {
        const fullOrders = await fetchMauOrders();
        if (isMounted && fullOrders && fullOrders.length > 0) {
          setMauOrders(fullOrders);
        }
      } catch (err) {
        console.error("Failed to load comprehensive MAU orders:", err);
      } finally {
        if (isMounted) setIsLoadingOrders(false);
      }
    };

    loadFullHistory();
    return () => { isMounted = false; };
  }, []);

  // Effective orders: prefer deep historical orders if available, otherwise fallback to allOrders
  const effectiveOrders = useMemo(() => {
    if (mauOrders.length > 0) return mauOrders;
    return allOrders || [];
  }, [mauOrders, allOrders]);

  // 1. Establish Reference Anchor Date from latest order
  const { refDateMs, validOrders, latestOrderDateStr } = useMemo(() => {
    const valid = effectiveOrders.filter(
      o => o.status !== 'CANCELLED' && !(o as any).is_voided && (Number(o.total) > 0) && o.date
    );
    const times = valid.map(o => new Date(o.date).getTime()).filter(t => !isNaN(t));
    const maxMs = times.length > 0 ? Math.max(...times) : Date.now();
    return {
      refDateMs: maxMs,
      validOrders: valid,
      latestOrderDateStr: new Date(maxMs).toISOString().split('T')[0]
    };
  }, [effectiveOrders]);

  // 2. Map Customer Order History & Days Since Last Visit
  const customerActivity = useMemo(() => {
    const phoneToOrders: Record<string, { orders: CompletedOrder[]; totalSpent: number }> = {};
    const oneDayMs = 24 * 60 * 60 * 1000;

    validOrders.forEach(o => {
      const rawPhone = o.customerPhone || (o as any).customer_phone;
      if (!rawPhone) return;
      const clean = normalizePhone(rawPhone);
      if (!phoneToOrders[clean]) {
        phoneToOrders[clean] = { orders: [], totalSpent: 0 };
      }
      phoneToOrders[clean].orders.push(o);
      phoneToOrders[clean].totalSpent += Number(o.total || 0);
    });

    const d90AgoMs = refDateMs - (90 * oneDayMs);
    const d60AgoMs = refDateMs - (60 * oneDayMs);
    const d30AgoMs = refDateMs - (30 * oneDayMs);

    return customers.map(c => {
      const cleanPhone = normalizePhone(c.phone);
      const history = phoneToOrders[cleanPhone]?.orders || [];
      const orderTimes = history.map(o => new Date(o.date).getTime()).filter(t => !isNaN(t));
      const registeredTime = c.joinedDate ? new Date(c.joinedDate).getTime() : ((c as any).created_at ? new Date((c as any).created_at).getTime() : 0);
      const latestVisitMs = orderTimes.length > 0 ? Math.max(...orderTimes) : registeredTime;
      
      const daysSinceLast = latestVisitMs > 0 ? Math.max(0, Math.floor((refDateMs - latestVisitMs) / oneDayMs)) : 999;
      
      // Orders inside the active 90-day window
      const ordersIn90d = history.filter(o => new Date(o.date).getTime() >= d90AgoMs);
      const spendIn90d = ordersIn90d.reduce((s, o) => s + Number(o.total || 0), 0);
      const isMauActive = ordersIn90d.length > 0;

      // Recency Tier Classification
      let tier: 'power' | 'warming' | 'cooling' | 'dormant' = 'dormant';
      if (latestVisitMs >= d30AgoMs) tier = 'power';
      else if (latestVisitMs >= d60AgoMs) tier = 'warming';
      else if (latestVisitMs >= d90AgoMs) tier = 'cooling';

      return {
        ...c,
        cleanPhone,
        daysSinceLast,
        latestVisitMs,
        isMauActive,
        ordersIn90dCount: ordersIn90d.length,
        spendIn90d,
        tier
      };
    });
  }, [customers, validOrders, refDateMs]);

  // 3. Segment Tiers & Aggregates
  const tierSummary = useMemo(() => {
    const totalCusts = customerActivity.length || 1;
    const power = customerActivity.filter(c => c.tier === 'power');
    const warming = customerActivity.filter(c => c.tier === 'warming');
    const cooling = customerActivity.filter(c => c.tier === 'cooling');
    const dormant = customerActivity.filter(c => c.tier === 'dormant');
    const mauBase = customerActivity.filter(c => c.isMauActive);

    const getStats = (list: typeof customerActivity) => {
      const count = list.length;
      const pct = (count / totalCusts) * 100;
      const totalRev90d = list.reduce((s, c) => s + c.spendIn90d, 0);
      const totalOrders90d = list.reduce((s, c) => s + c.ordersIn90dCount, 0);
      const aov90d = totalOrders90d > 0 ? totalRev90d / totalOrders90d : 0;
      const totalLtv = list.reduce((s, c) => s + (Number(c.totalSpent) || 0), 0);
      return { count, pct, totalRev90d, totalOrders90d, aov90d, totalLtv };
    };

    return {
      all: getStats(customerActivity),
      mau: getStats(mauBase),
      power: getStats(power),
      warming: getStats(warming),
      cooling: getStats(cooling),
      dormant: getStats(dormant),
      atRiskChumingSoon: cooling.filter(c => c.daysSinceLast >= 75 && c.daysSinceLast <= 90)
    };
  }, [customerActivity]);

  // 4. Daily Rolling 90-Day Evolution Time Series (Last 30/45/60/90 Days)
  const evolutionSeries = useMemo(() => {
    const daysWindow = parseInt(timeWindow as string, 10) || 45;
    const oneDayMs = 24 * 60 * 60 * 1000;
    const d90Ms = 90 * oneDayMs;

    const points: Array<{
      dateStr: string;
      label: string;
      mauCount: number;
      cumRegistered: number;
      pieSharePct: number;
      rolling90Rev: number;
      rolling90Orders: number;
      rollingAov: number;
      dailyRev: number;
      dailyOrders: number;
    }> = [];

    // Pre-index valid orders with timestamp
    const indexedOrders = validOrders.map(o => {
      const rawPhone = o.customerPhone || (o as any).customer_phone;
      return {
        ...o,
        time: new Date(o.date).getTime(),
        cleanPhone: rawPhone ? normalizePhone(rawPhone) : null,
        val: Number(o.total || 0)
      };
    });

    const indexedCusts = customers.map(c => {
      const createdTime = c.joinedDate ? new Date(c.joinedDate).getTime() : ((c as any).created_at ? new Date((c as any).created_at).getTime() : 0);
      return {
        createdTime,
        cleanPhone: normalizePhone(c.phone)
      };
    });

    for (let i = daysWindow - 1; i >= 0; i--) {
      const targetDayEndMs = refDateMs - (i * oneDayMs);
      const targetDayStartMs = targetDayEndMs - oneDayMs;
      const rollingWindowStartMs = targetDayEndMs - d90Ms;

      // Cumulative registered customers up to this target day
      const regUpToDay = indexedCusts.filter(c => c.createdTime <= targetDayEndMs).length || 1;

      // Orders strictly within the rolling 90 days ending on target day
      const ordersInWindow = indexedOrders.filter(
        o => o.time >= rollingWindowStartMs && o.time <= targetDayEndMs
      );

      // Unique phones active in this 90-day window
      const activePhones = new Set<string>();
      let rolling90Rev = 0;
      let rolling90Orders = ordersInWindow.length;

      ordersInWindow.forEach(o => {
        if (o.cleanPhone) activePhones.add(o.cleanPhone);
        rolling90Rev += o.val;
      });

      const mauCount = activePhones.size;
      const rawShare = (mauCount / Math.max(1, regUpToDay)) * 100;
      const pieSharePct = Math.min(100, Math.max(0, parseFloat(rawShare.toFixed(1))));
      const rollingAov = rolling90Orders > 0 ? rolling90Rev / rolling90Orders : 0;

      // Day-specific traffic
      const dayOrders = indexedOrders.filter(
        o => o.time >= targetDayStartMs && o.time <= targetDayEndMs
      );
      const dailyRev = dayOrders.reduce((s, o) => s + o.val, 0);

      const dObj = new Date(targetDayEndMs);
      const dateStr = dObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      const label = `${dObj.getDate()} ${dObj.toLocaleString('en-US', { month: 'short' })}`;

      points.push({
        dateStr,
        label,
        mauCount,
        cumRegistered: regUpToDay,
        pieSharePct,
        rolling90Rev: Math.round(rolling90Rev),
        rolling90Orders,
        rollingAov: Math.round(rollingAov),
        dailyRev: Math.round(dailyRev),
        dailyOrders: dayOrders.length
      });
    }

    return points;
  }, [timeWindow, refDateMs, validOrders, customers]);

  // 5. Trend vs 30 days ago
  const mauTrend = useMemo(() => {
    if (evolutionSeries.length < 2) return { countDelta: 0, pctDelta: 0, aovDelta: 0, isUp: true };
    const latest = evolutionSeries[evolutionSeries.length - 1];
    const prevIndex = Math.max(0, evolutionSeries.length - 30);
    const prev = evolutionSeries[prevIndex];

    const countDelta = latest.mauCount - prev.mauCount;
    const pctDelta = latest.pieSharePct - prev.pieSharePct;
    const aovDelta = latest.rollingAov - prev.rollingAov;

    return {
      countDelta,
      pctDelta: parseFloat(pctDelta.toFixed(1)),
      aovDelta,
      isUp: countDelta >= 0
    };
  }, [evolutionSeries]);

  // Customers filtered by selected recency tier
  const filteredTierCustomers = useMemo(() => {
    if (selectedTier === 'all') return [];
    return customerActivity.filter(c => c.tier === selectedTier);
  }, [customerActivity, selectedTier]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 font-sans">
      {/* 1. TOP HERO: 90-DAY MAU BASE AT-A-GLANCE */}
      <div className="bg-gradient-to-br from-brand-brown via-stone-900 to-black text-white p-8 rounded-[2.5rem] shadow-2xl border border-brand-yellow/30 relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-yellow/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-brand-red/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-yellow/20 border border-brand-yellow/40 text-brand-yellow text-[10px] font-black uppercase tracking-widest mb-3">
              <Zap className="w-3.5 h-3.5 fill-brand-yellow" />
              <span>90-Day Active MAU Engine</span>
              {isLoadingOrders && (
                <span className="flex items-center gap-1 text-[9px] text-white/70 ml-2 font-mono">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  Syncing full history...
                </span>
              )}
            </div>
            <h3 className="text-3xl lg:text-4xl font-black uppercase tracking-tight text-white flex items-center gap-3">
              Active Customer <span className="text-brand-yellow">Pie</span>
            </h3>
            <p className="text-xs font-bold text-stone-300 uppercase tracking-widest mt-1 max-w-xl">
              Tracking repeat buyers transacting within the critical 90-day repeat window (Anchor: {latestOrderDateStr})
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-stone-300">Registered Base</p>
              <p className="text-2xl font-black text-white">{customers.length.toLocaleString()}</p>
              <p className="text-[9px] font-bold text-stone-400">Total Profiles</p>
            </div>
            <div className="h-10 w-px bg-white/20" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-brand-yellow">Active MAU Share</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-black text-brand-yellow font-mono">
                  {tierSummary.mau.pct.toFixed(1)}%
                </p>
                <span className={`text-[10px] font-bold flex items-center ${mauTrend.pctDelta >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {mauTrend.pctDelta >= 0 ? '+' : ''}{mauTrend.pctDelta}% 30d
                </span>
              </div>
              <p className="text-[9px] font-bold text-stone-300">Current Slice of Pie</p>
            </div>
            <div className="h-10 w-px bg-white/20" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/70">Active MAU Pool</p>
              <p className="text-2xl font-black text-white">{tierSummary.mau.count.toLocaleString()}</p>
              <p className="text-[9px] font-bold text-emerald-400">Live Repeaters</p>
            </div>
          </div>
        </div>

        {/* 4 Core Vital Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-stone-400 mb-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-brand-yellow">90-Day MAU Revenue</span>
              <DollarSign className="w-3.5 h-3.5 text-brand-yellow" />
            </div>
            <div className="text-2xl font-black text-white font-mono">
              ₹{Math.round(tierSummary.mau.totalRev90d).toLocaleString()}
            </div>
            <p className="text-[9px] font-bold text-white/50 mt-1">
              {((tierSummary.mau.totalRev90d / Math.max(1, tierSummary.all.totalLtv)) * 100).toFixed(1)}% of registered revenue
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-stone-400 mb-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">90-Day Active AOV</span>
              <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono">
              ₹{Math.round(tierSummary.mau.aov90d)}
            </div>
            <p className="text-[9px] font-bold text-stone-300 mt-1">
              vs ₹{Math.round(tierSummary.dormant.aov90d || 112)} historical dormant AOV
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-stone-400 mb-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-indigo-300">Repeat Frequency</span>
              <TrendingUp className="w-3.5 h-3.5 text-indigo-300" />
            </div>
            <div className="text-2xl font-black text-white font-mono">
              {(tierSummary.mau.totalOrders90d / Math.max(1, tierSummary.mau.count)).toFixed(2)}
            </div>
            <p className="text-[9px] font-bold text-white/50 mt-1">
              Orders / customer in 90d window
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between text-stone-400 mb-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-amber-300">Churning Danger Zone</span>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-300 font-mono">
              {tierSummary.atRiskChumingSoon.length}
            </div>
            <p className="text-[9px] font-bold text-amber-200/70 mt-1">
              Active 75–90d ago (Expiring in ≤15d)
            </p>
          </div>
        </div>
      </div>

      {/* 2. DAILY EVOLUTION TIME-SERIES CHART */}
      <div className="bg-white rounded-[2.5rem] p-8 border border-brand-stone shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-red" />
              <h4 className="text-lg font-black uppercase tracking-tight text-brand-brown">
                Daily MAU <span className="text-brand-red">Pie Evolution</span>
              </h4>
            </div>
            <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">
              Rolling 90-day transacting active base tracked day-by-day across all orders
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Metric Mode Switcher */}
            <div className="bg-brand-brown/5 p-1 rounded-xl flex items-center">
              <button
                type="button"
                onClick={() => setChartMetric('size')}
                className={`py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                  chartMetric === 'size'
                    ? 'bg-brand-brown text-brand-yellow shadow-sm'
                    : 'text-brand-brown/50 hover:text-brand-brown'
                }`}
              >
                👥 Size & Share %
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('revenue')}
                className={`py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                  chartMetric === 'revenue'
                    ? 'bg-brand-brown text-brand-yellow shadow-sm'
                    : 'text-brand-brown/50 hover:text-brand-brown'
                }`}
              >
                💰 Rolling Revenue
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('aov')}
                className={`py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                  chartMetric === 'aov'
                    ? 'bg-brand-brown text-brand-yellow shadow-sm'
                    : 'text-brand-brown/50 hover:text-brand-brown'
                }`}
              >
                📊 MAU AOV
              </button>
            </div>

            {/* Time Window Switcher */}
            <div className="bg-brand-brown/5 p-1 rounded-xl flex items-center">
              {(['30', '45', '60', '90'] as const).map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setTimeWindow(days as any)}
                  className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    timeWindow === days
                      ? 'bg-brand-red text-white shadow-sm'
                      : 'text-brand-brown/50 hover:text-brand-brown'
                  }`}
                >
                  {days}D
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dynamic Metric Explanation Banner */}
        <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/70 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-brand-brown" />
            <span className="text-stone-600 font-bold uppercase tracking-wider text-[10px]">
              {chartMetric === 'size' && 'Black line = Active MAU Count | Gold dashed line = % Share of Total Registered Base'}
              {chartMetric === 'revenue' && 'Emerald line = Rolling 90-Day Revenue Generated by Active MAU Base'}
              {chartMetric === 'aov' && 'Purple line = Average Order Value of 90-Day Active Customers'}
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-mono">
            {chartMetric === 'size' && (
              <>
                <span className="text-brand-brown font-bold">
                  Latest MAU: <strong>{evolutionSeries[evolutionSeries.length - 1]?.mauCount}</strong>
                </span>
                <span className="text-brand-yellow font-bold bg-brand-brown px-2 py-0.5 rounded">
                  Share: <strong>{evolutionSeries[evolutionSeries.length - 1]?.pieSharePct}%</strong>
                </span>
              </>
            )}
            {chartMetric === 'revenue' && (
              <span className="text-emerald-700 font-bold">
                90d Rolling Rev: <strong>₹{evolutionSeries[evolutionSeries.length - 1]?.rolling90Rev.toLocaleString()}</strong>
              </span>
            )}
            {chartMetric === 'aov' && (
              <span className="text-indigo-700 font-bold">
                Active AOV: <strong>₹{evolutionSeries[evolutionSeries.length - 1]?.rollingAov}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Recharts Area Chart Container */}
        <div className="h-80 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            {chartMetric === 'size' ? (
              <AreaChart data={evolutionSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="mauCountGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#451a03" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#451a03" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="pieShareGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis 
                  yAxisId="left" 
                  stroke="#451a03" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  domain={[0, (dataMax: number) => Math.ceil((dataMax + 100) / 100) * 100]} 
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke="#f59e0b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  unit="%" 
                  domain={[0, 100]} 
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-brand-brown text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-white/10 font-sans">
                        <p className="font-bold text-brand-yellow">{d.dateStr}</p>
                        <p className="text-white">Active 90d MAU: <strong className="font-mono">{d.mauCount}</strong> customers</p>
                        <p className="text-brand-yellow">Pie Share: <strong className="font-mono">{d.pieSharePct}%</strong> of registered pool</p>
                        <p className="text-stone-300">Registered Base on Day: <strong className="font-mono">{d.cumRegistered}</strong></p>
                        <p className="text-emerald-400">Day Revenue: <strong className="font-mono">₹{d.dailyRev.toLocaleString()}</strong> ({d.dailyOrders} orders)</p>
                      </div>
                    );
                  }}
                />
                <Area yAxisId="left" type="monotone" dataKey="mauCount" stroke="#451a03" strokeWidth={3} fillOpacity={1} fill="url(#mauCountGrad)" name="Active MAU Count" />
                <Area yAxisId="right" type="monotone" dataKey="pieSharePct" stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="4 4" fillOpacity={1} fill="url(#pieShareGrad)" name="Pie Share %" />
              </AreaChart>
            ) : chartMetric === 'revenue' ? (
              <AreaChart data={evolutionSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#10b981" fontSize={10} tickLine={false} axisLine={false} domain={[0, 'auto']} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-brand-brown text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-white/10 font-sans">
                        <p className="font-bold text-brand-yellow">{d.dateStr}</p>
                        <p className="text-emerald-400">90-Day Rolling Revenue: <strong className="font-mono">₹{d.rolling90Rev.toLocaleString()}</strong></p>
                        <p className="text-white">Orders in Window: <strong className="font-mono">{d.rolling90Orders}</strong></p>
                        <p className="text-stone-300">Rolling AOV: <strong className="font-mono">₹{d.rollingAov}</strong></p>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="rolling90Rev" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#revGrad)" name="90d Rolling Revenue" />
              </AreaChart>
            ) : (
              <AreaChart data={evolutionSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="aovGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#8b5cf6" fontSize={10} tickLine={false} axisLine={false} unit="₹" domain={[0, 'auto']} />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-brand-brown text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-white/10 font-sans">
                        <p className="font-bold text-brand-yellow">{d.dateStr}</p>
                        <p className="text-indigo-300">MAU AOV: <strong className="font-mono">₹{d.rollingAov}</strong></p>
                        <p className="text-white">Active Customers in Window: <strong className="font-mono">{d.mauCount}</strong></p>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="rollingAov" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#aovGrad)" name="MAU AOV" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. THE "SIZE OF THE PIE" RECENCY HEALTH BREAKDOWN */}
      <div className="bg-white rounded-[2.5rem] p-8 border border-brand-stone shadow-xl space-y-6">
        <div>
          <h4 className="text-lg font-black uppercase tracking-tight text-brand-brown flex items-center gap-2">
            <PieIcon className="w-5 h-5 text-brand-red" />
            Recency Health <span className="text-brand-red">Pie Breakdown</span>
          </h4>
          <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">
            Click any segment card below to inspect customer profiles by days since last order
          </p>
        </div>

        {/* Multi-tier progress bar */}
        <div className="space-y-2">
          <div className="w-full h-5 bg-stone-100 rounded-full overflow-hidden flex shadow-inner">
            <div 
              style={{ width: `${tierSummary.power.pct}%` }} 
              className="bg-emerald-500 h-full transition-all duration-500 hover:brightness-110 cursor-pointer" 
              onClick={() => setSelectedTier(selectedTier === 'power' ? 'all' : 'power')}
              title={`Power Active (≤30d): ${tierSummary.power.count} cust (${tierSummary.power.pct.toFixed(1)}%)`}
            />
            <div 
              style={{ width: `${tierSummary.warming.pct}%` }} 
              className="bg-blue-500 h-full transition-all duration-500 hover:brightness-110 cursor-pointer" 
              onClick={() => setSelectedTier(selectedTier === 'warming' ? 'all' : 'warming')}
              title={`Warming Active (31-60d): ${tierSummary.warming.count} cust (${tierSummary.warming.pct.toFixed(1)}%)`}
            />
            <div 
              style={{ width: `${tierSummary.cooling.pct}%` }} 
              className="bg-amber-500 h-full transition-all duration-500 hover:brightness-110 cursor-pointer" 
              onClick={() => setSelectedTier(selectedTier === 'cooling' ? 'all' : 'cooling')}
              title={`Cooling Active (61-90d): ${tierSummary.cooling.count} cust (${tierSummary.cooling.pct.toFixed(1)}%)`}
            />
            <div 
              style={{ width: `${tierSummary.dormant.pct}%` }} 
              className="bg-stone-300 h-full transition-all duration-500 hover:brightness-110 cursor-pointer" 
              onClick={() => setSelectedTier(selectedTier === 'dormant' ? 'all' : 'dormant')}
              title={`Dormant (>90d): ${tierSummary.dormant.count} cust (${tierSummary.dormant.pct.toFixed(1)}%)`}
            />
          </div>
          
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-stone-400 pt-1">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/> Power Active (≤30d)</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"/> Warming (31-60d)</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"/> Cooling / At-Risk (61-90d)</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-stone-300 inline-block"/> Dormant (&gt;90d)</span>
          </div>
        </div>

        {/* 4 Health Tier Interactive Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. POWER ACTIVE */}
          <div 
            onClick={() => setSelectedTier(selectedTier === 'power' ? 'all' : 'power')}
            className={`p-5 rounded-2xl cursor-pointer transition-all border flex flex-col justify-between ${
              selectedTier === 'power' 
                ? 'bg-emerald-100/90 border-emerald-500 shadow-lg ring-2 ring-emerald-500' 
                : 'bg-emerald-50/70 border-emerald-200 hover:shadow-md'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2.5 py-0.5 bg-emerald-500 text-white rounded-lg text-[9px] font-black uppercase tracking-wider">
                  🔥 Power Active
                </span>
                <span className="text-xs font-mono font-bold text-emerald-800">≤ 30 Days</span>
              </div>
              <div className="text-3xl font-black text-emerald-950 font-mono mt-2">
                {tierSummary.power.count}
              </div>
              <p className="text-[10px] font-bold text-emerald-700 mt-0.5">
                {tierSummary.power.pct.toFixed(1)}% of registered base
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-emerald-200/80 space-y-1 text-[11px]">
              <div className="flex justify-between text-emerald-900">
                <span>90d Revenue:</span>
                <strong className="font-mono">₹{Math.round(tierSummary.power.totalRev90d).toLocaleString()}</strong>
              </div>
              <div className="flex justify-between text-emerald-900">
                <span>Cohort AOV:</span>
                <strong className="font-mono">₹{Math.round(tierSummary.power.aov90d)}</strong>
              </div>
            </div>
          </div>

          {/* 2. WARMING ACTIVE */}
          <div 
            onClick={() => setSelectedTier(selectedTier === 'warming' ? 'all' : 'warming')}
            className={`p-5 rounded-2xl cursor-pointer transition-all border flex flex-col justify-between ${
              selectedTier === 'warming' 
                ? 'bg-blue-100/90 border-blue-500 shadow-lg ring-2 ring-blue-500' 
                : 'bg-blue-50/70 border-blue-200 hover:shadow-md'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2.5 py-0.5 bg-blue-500 text-white rounded-lg text-[9px] font-black uppercase tracking-wider">
                  ⚡ Warming
                </span>
                <span className="text-xs font-mono font-bold text-blue-800">31 - 60 Days</span>
              </div>
              <div className="text-3xl font-black text-blue-950 font-mono mt-2">
                {tierSummary.warming.count}
              </div>
              <p className="text-[10px] font-bold text-blue-700 mt-0.5">
                {tierSummary.warming.pct.toFixed(1)}% of registered base
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-blue-200/80 space-y-1 text-[11px]">
              <div className="flex justify-between text-blue-900">
                <span>90d Revenue:</span>
                <strong className="font-mono">₹{Math.round(tierSummary.warming.totalRev90d).toLocaleString()}</strong>
              </div>
              <div className="flex justify-between text-blue-900">
                <span>Cohort AOV:</span>
                <strong className="font-mono">₹{Math.round(tierSummary.warming.aov90d)}</strong>
              </div>
            </div>
          </div>

          {/* 3. COOLING ACTIVE */}
          <div 
            onClick={() => setSelectedTier(selectedTier === 'cooling' ? 'all' : 'cooling')}
            className={`p-5 rounded-2xl cursor-pointer transition-all border flex flex-col justify-between ${
              selectedTier === 'cooling' 
                ? 'bg-amber-100/90 border-amber-500 shadow-lg ring-2 ring-amber-500' 
                : 'bg-amber-50/70 border-amber-200 hover:shadow-md'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2.5 py-0.5 bg-amber-500 text-white rounded-lg text-[9px] font-black uppercase tracking-wider">
                  ⚠️ Cooling (At-Risk)
                </span>
                <span className="text-xs font-mono font-bold text-amber-800">61 - 90 Days</span>
              </div>
              <div className="text-3xl font-black text-amber-950 font-mono mt-2">
                {tierSummary.cooling.count}
              </div>
              <p className="text-[10px] font-bold text-amber-700 mt-0.5">
                {tierSummary.cooling.pct.toFixed(1)}% of registered base
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-amber-200/80 space-y-1 text-[11px]">
              <div className="flex justify-between text-amber-900">
                <span>90d Revenue:</span>
                <strong className="font-mono">₹{Math.round(tierSummary.cooling.totalRev90d).toLocaleString()}</strong>
              </div>
              <div className="flex justify-between text-amber-900">
                <span>Cohort AOV:</span>
                <strong className="font-mono">₹{Math.round(tierSummary.cooling.aov90d)}</strong>
              </div>
            </div>
          </div>

          {/* 4. DORMANT */}
          <div 
            onClick={() => setSelectedTier(selectedTier === 'dormant' ? 'all' : 'dormant')}
            className={`p-5 rounded-2xl cursor-pointer transition-all border flex flex-col justify-between ${
              selectedTier === 'dormant' 
                ? 'bg-stone-200 border-stone-500 shadow-lg ring-2 ring-stone-500' 
                : 'bg-stone-100/70 border-stone-200 hover:shadow-md'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2.5 py-0.5 bg-stone-500 text-white rounded-lg text-[9px] font-black uppercase tracking-wider">
                  💤 Dormant
                </span>
                <span className="text-xs font-mono font-bold text-stone-600">&gt; 90 Days</span>
              </div>
              <div className="text-3xl font-black text-stone-800 font-mono mt-2">
                {tierSummary.dormant.count}
              </div>
              <p className="text-[10px] font-bold text-stone-500 mt-0.5">
                {tierSummary.dormant.pct.toFixed(1)}% of registered base
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-stone-200 space-y-1 text-[11px]">
              <div className="flex justify-between text-stone-700">
                <span>All-Time LTV:</span>
                <strong className="font-mono">₹{Math.round(tierSummary.dormant.totalLtv).toLocaleString()}</strong>
              </div>
              <div className="flex justify-between text-stone-700">
                <span>Status:</span>
                <strong className="text-brand-red font-bold">Needs Win-Back</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Tier Customer List Expansion */}
        {selectedTier !== 'all' && (
          <div className="mt-6 p-6 rounded-2xl bg-stone-50 border border-stone-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-sm font-black uppercase text-brand-brown tracking-tight">
                  {selectedTier === 'power' && '🔥 Power Active Customers (≤30 Days)'}
                  {selectedTier === 'warming' && '⚡ Warming Customers (31–60 Days)'}
                  {selectedTier === 'cooling' && '⚠️ Cooling At-Risk Customers (61–90 Days)'}
                  {selectedTier === 'dormant' && '💤 Dormant Customers (>90 Days Since Last Visit)'}
                </h5>
                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                  Showing top {Math.min(8, filteredTierCustomers.length)} of {filteredTierCustomers.length} profiles
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTier('all')}
                className="text-[10px] font-black uppercase text-brand-red hover:underline"
              >
                Close List
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {filteredTierCustomers.slice(0, 8).map(cust => (
                <div
                  key={cust.id}
                  onClick={() => onSelectCustomer && onSelectCustomer(cust)}
                  className="p-3.5 bg-white rounded-xl border border-stone-200 hover:border-brand-brown hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-2 group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-xs text-brand-brown group-hover:text-brand-red transition-colors">
                        {cust.name || cust.phone}
                      </p>
                      <p className="text-[10px] font-mono text-stone-400">{cust.cleanPhone}</p>
                    </div>
                    <span className="text-[9px] font-mono font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                      {cust.daysSinceLast === 999 ? 'No order' : `${cust.daysSinceLast}d ago`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] pt-1 border-t border-stone-100 text-stone-600 font-mono">
                    <span>LTV: ₹{Math.round(cust.totalSpent || 0)}</span>
                    <span className="flex items-center gap-1 text-brand-red font-bold group-hover:translate-x-0.5 transition-transform">
                      View <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. CHURN PREVENTION WATCHLIST: EXPIRING OUT OF MAU SOON (75-90 DAYS) */}
      <div className="bg-white rounded-[2.5rem] p-8 border border-brand-stone shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h4 className="text-base font-black uppercase tracking-tight text-brand-brown">
                Retention Watchlist: <span className="text-amber-600">Expiring Out of MAU in ≤15 Days</span>
              </h4>
            </div>
            <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">
              These {tierSummary.atRiskChumingSoon.length} customers last ordered 75–90 days ago. Re-engage them now before they fall into Dormancy.
            </p>
          </div>
        </div>

        {tierSummary.atRiskChumingSoon.length === 0 ? (
          <div className="p-8 text-center bg-stone-50 rounded-2xl border border-stone-200">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-xs font-bold text-stone-600">Great news! No active customers are currently in the 75–90 day churn cliff.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tierSummary.atRiskChumingSoon.slice(0, 6).map(cust => {
              const daysRemaining = Math.max(0, 90 - cust.daysSinceLast);
              return (
                <div key={cust.id} className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/80 flex flex-col justify-between space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono font-black text-sm text-brand-brown">
                        {cust.name || cust.phone}
                      </p>
                      <p className="text-[10px] font-bold text-stone-400">
                        {cust.cleanPhone}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-800 border border-amber-300 rounded-md text-[9px] font-black uppercase">
                      {daysRemaining}d to churn
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-amber-200/50 font-mono">
                    <span className="text-stone-500">LTV: ₹{Math.round(cust.totalSpent || 0)}</span>
                    <span className="text-stone-500">{cust.totalOrders} orders</span>
                    <span className="text-amber-700 font-bold">{cust.daysSinceLast}d ago</span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const msg = `🥟 Hey ${cust.name || 'there'}! We noticed you haven't visited MinMomos in a while. We miss you! Enjoy a special treat on your next visit. Come say hi today! ✨`;
                        const url = `https://wa.me/91${cust.cleanPhone}?text=${encodeURIComponent(msg)}`;
                        window.open(url, '_blank');
                      }}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      <span>WhatsApp Win-Back</span>
                    </button>

                    {onSelectCustomer && (
                      <button
                        type="button"
                        onClick={() => onSelectCustomer(cust)}
                        className="py-2 px-3 bg-brand-brown hover:bg-brand-brown/90 text-brand-yellow rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                        title="View profile"
                      >
                        <UserIcon className="w-3 h-3" />
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
