import React, { useMemo, useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { fetchMenuItems, getISTDate, getISTDateString } from '../utils/storage';
import { 
  RefreshCw, 
  AlertTriangle, 
  Search, 
  Boxes, 
  BarChart3
} from 'lucide-react';
import { CompletedOrder, RecipeRequirement } from '../types';

interface ConsumptionReportProps {
  orders?: CompletedOrder[];
  startDate?: string;
  endDate?: string;
  selectedStore: string;
}

interface AllocationRecord {
  id: string;
  material_id: string;
  material_name: string;
  station_name: string;
  quantity: number;
  unit: string;
  date: string;
  is_voided: boolean;
}

interface InventoryLogRecord {
  id: string;
  inventory_id: string;
  item_name: string;
  branch_name: string;
  quantity_change: number;
  reason: string;
  date: string;
}

interface MaterialCatalogItem {
  id: string;
  name: string;
  unit: string;
  category: string;
}

interface ConsumedItemSummary {
  id: string;
  name: string;
  unit: string;
  category: string;
  
  // Theoretical Recipe-based consumption
  theoreticalQty: number;
  
  // Actual allocation-to-finished estimated consumption
  actualQty: number;
  
  // Speed metrics
  allocationsCount: number;
  averagePacketLifespan: number; // in days
  activeStock: number;
  isFinished: boolean;
  
  // Detail history of packets allocated and completed
  history: {
    allocId: string;
    allocatedQty: number;
    allocatedDate: string;
    finishedDate: string | null;
    isFinished: boolean;
    durationDays: number;
    dailyRate: number;
    selectedPeriodDaysOverlap: number;
    estimatedConsumedInPeriod: number;
  }[];
}

export const ConsumptionReport: React.FC<ConsumptionReportProps> = ({ 
  orders, 
  startDate, 
  endDate, 
  selectedStore 
 }) => {
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'week' | 'last-week' | 'month' | 'last-month' | 'last30' | 'custom'>('today');
  const [startDateLocal, setStartDateLocal] = useState<string>(startDate || getISTDateString());
  const [endDateLocal, setEndDateLocal] = useState<string>(endDate || getISTDateString());
  const [fetchedOrders, setFetchedOrders] = useState<CompletedOrder[]>([]);
  const [allocations, setAllocations] = useState<AllocationRecord[]>([]);
  const [finishedLogs, setFinishedLogs] = useState<InventoryLogRecord[]>([]);
  const [catalog, setCatalog] = useState<MaterialCatalogItem[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters within the report view
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [discrepancySort, setDiscrepancySort] = useState<'none' | 'high' | 'low'>('none');

  const handlePresetChange = (preset: typeof datePreset) => {
    setDatePreset(preset);
    const today = getISTDate();
    let start = getISTDate();
    let end = getISTDate();

    if (preset === 'today') {
      start = today;
    } else if (preset === 'yesterday') {
      start.setDate(today.getDate() - 1);
      end.setDate(today.getDate() - 1);
    } else if (preset === 'week') {
      // This Week: Monday to Sunday
      const day = today.getDay();
      const diff = today.getDate() - (day === 0 ? 6 : day - 1); // 0 is Sunday, 1 is Monday
      start.setDate(diff);
    } else if (preset === 'last-week') {
      // Last Week: Previous Monday to Sunday
      const day = today.getDay();
      const diffToThisMonday = today.getDate() - (day === 0 ? 6 : day - 1);
      start.setDate(diffToThisMonday - 7);
      end.setDate(diffToThisMonday - 1);
    } else if (preset === 'month') {
      start.setDate(1);
    } else if (preset === 'last-month') {
      start.setMonth(today.getMonth() - 1);
      start.setDate(1);
      end.setMonth(today.getMonth());
      end.setDate(0);
    } else if (preset === 'last30') {
      start.setDate(today.getDate() - 30);
    }

    setStartDateLocal(getISTDateString(start));
    setEndDateLocal(getISTDateString(end));
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch allocations
      let allocationsQuery = supabase
        .from('stock_allocations')
        .select('*')
        .eq('is_voided', false);

      if (selectedStore !== 'All') {
        allocationsQuery = allocationsQuery.eq('station_name', selectedStore);
      }
      
      const { data: allocData, error: allocErr } = await allocationsQuery;
      if (allocErr) throw allocErr;

      // 2. Fetch stock-over/finished logs
      let logsQuery = supabase
        .from('inventory_logs')
        .select('*')
        .eq('reason', 'STOCK_OVER');

      if (selectedStore !== 'All') {
        logsQuery = logsQuery.eq('branch_name', selectedStore);
      }
      
      const { data: logsData, error: logsErr } = await logsQuery;
      if (logsErr) throw logsErr;

      // 3. Fetch central inventory for catalog category mappings
      const { data: catalogData, error: catalogErr } = await supabase
        .from('central_inventory')
        .select('id, name, unit, category');
      if (catalogErr) throw catalogErr;

      // 4. Fetch menu items to resolve recipes
      const { data: menuData } = await fetchMenuItems();

      setAllocations((allocData || []) as AllocationRecord[]);
      setFinishedLogs((logsData || []) as InventoryLogRecord[]);
      setCatalog((catalogData || []) as MaterialCatalogItem[]);
      if (menuData) {
        setMenuItems(menuData);
      }
      
      // 5. Fetch orders if not provided explicitly
      if (!orders) {
        const { getOrdersForDateRange } = await import('../utils/storage');
        const ords = await getOrdersForDateRange(startDateLocal, endDateLocal);
        setFetchedOrders(ords);
      }
    } catch (err: any) {
      console.error("Error loading consumption report data:", err);
      setError(err.message || 'Failed to load report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedStore, startDateLocal, endDateLocal, orders]);

  // CORE LOGIC: Parse and calculate the Side-by-Side Consumption Metrics!
  const consumptionData = useMemo<ConsumedItemSummary[]>(() => {
    if (catalog.length === 0) return [];

    // Map ingredients to catalog details for easy lookups
    const catalogMap = new Map<string, MaterialCatalogItem>();
    catalog.forEach(item => catalogMap.set(item.id, item));

    // A. CALCULATE THEORETICAL CONSUMPTION (From Orders & Recipes)
    const theoreticalMap = new Map<string, number>();

    // Filter orders by date range and selected store
    const startMs = new Date(startDate + 'T00:00:00').getTime();
    const endMs = new Date(endDate + 'T23:59:59').getTime();

    const activeOrders = orders || fetchedOrders;
    const filteredOrders = activeOrders.filter(o => {
      const orderTime = new Date(o.date).getTime();
      const inDate = orderTime >= startMs && orderTime <= endMs;
      const inStore = selectedStore === 'All' || o.branchName === selectedStore;
      return inDate && inStore;
    });

    filteredOrders.forEach(order => {
      order.items.forEach(item => {
        if (!item.menuItemId || item.menuItemId === 'discount') return;

        // Find the recipe
        let menuDetail = menuItems.find(m => m.id === item.menuItemId);
        if (!menuDetail) {
          // Fallback matching by name
          const baseName = item.name.replace(/^(Steamed|Fried|Pan Fried|Pan-Fried|Peri-Peri|Peri peri|Normal)\s+/i, '').split(' (')[0].trim();
          menuDetail = menuItems.find(m => m.name.toLowerCase() === baseName.toLowerCase() || m.name.toLowerCase() === item.name.toLowerCase());
        }

        if (menuDetail) {
          // Resolve size recipe if applicable, or fallback to default recipe
          const size = ((item as any).size || 'medium').toLowerCase();
          const sizeRecipe = menuDetail.sizeRecipes?.[size];
          let activeRecipe: RecipeRequirement[] = (sizeRecipe && Array.isArray(sizeRecipe) && sizeRecipe.length > 0) ? sizeRecipe : [];
          
          if (activeRecipe.length === 0 && menuDetail.recipe && Array.isArray(menuDetail.recipe) && menuDetail.recipe.length > 0) {
            activeRecipe = menuDetail.recipe;
          }

          activeRecipe.forEach(req => {
            const consumedQty = (req.quantity || 0) * (item.quantity || 0);
            theoreticalMap.set(req.materialId, (theoreticalMap.get(req.materialId) || 0) + consumedQty);
          });
        }
      });
    });

    // B. CALCULATE ESTIMATED ACTUAL PACKET-BASED CONSUMPTION (The assigned-to-finished-duration overlapping logic!)
    const itemsSummaryMap = new Map<string, ConsumedItemSummary>();

    // Group allocations by material_id
    const allocationsByMaterial = new Map<string, AllocationRecord[]>();
    allocations.forEach(alloc => {
      const list = allocationsByMaterial.get(alloc.material_id) || [];
      list.push(alloc);
      allocationsByMaterial.set(alloc.material_id, list);
    });

    // Group STOCK_OVER logs by material_id + branch_name
    const finishedLogsByMaterialAndBranch = new Map<string, InventoryLogRecord[]>();
    finishedLogs.forEach(log => {
      const key = `${log.inventory_id}_${log.branch_name}`;
      const list = finishedLogsByMaterialAndBranch.get(key) || [];
      list.push(log);
      finishedLogsByMaterialAndBranch.set(key, list);
    });

    // Define selected period boundary dates
    const pStart = new Date(startDate + 'T00:00:00');
    const pEnd = new Date(endDate + 'T23:59:59');

    catalog.forEach(material => {
      const materialAllocs = allocationsByMaterial.get(material.id) || [];
      const materialSummaryHistory: any[] = [];
      let totalActualQty = 0;
      let totalLifespanDays = 0;
      let finishedAllocationsCount = 0;

      materialAllocs.forEach(alloc => {
        const key = `${alloc.material_id}_${alloc.station_name}`;
        const itemFinishedLogs = finishedLogsByMaterialAndBranch.get(key) || [];

        // Find the earliest STOCK_OVER log that occurred strictly after this allocation date
        const allocTime = new Date(alloc.date).getTime();
        const futureFinishedLogs = itemFinishedLogs
          .filter(log => new Date(log.date).getTime() > allocTime)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const hasFinishedLog = futureFinishedLogs.length > 0;
        const finishedDate = hasFinishedLog ? futureFinishedLogs[0].date : null;

        // If no STOCK_OVER log, but we are looking at this, it is considered "ongoing" till today
        const calcEndStr = finishedDate || new Date().toISOString();
        const dAlloc = new Date(alloc.date);
        const dOver = new Date(calcEndStr);

        // Lifespan calculation: difference in days (minimum 1 day to avoid division by zero)
        const lifespanMs = dOver.getTime() - dAlloc.getTime();
        const durationDays = Math.max(1, Math.round(lifespanMs / (1000 * 60 * 60 * 24)));
        const dailyRate = alloc.quantity / durationDays;

        if (hasFinishedLog) {
          totalLifespanDays += durationDays;
          finishedAllocationsCount++;
        }

        // Calculate overlap with selected period [P_start, P_end]
        const overlapStart = Math.max(dAlloc.getTime(), pStart.getTime());
        const overlapEnd = Math.min(dOver.getTime(), pEnd.getTime());
        const overlapMs = Math.max(0, overlapEnd - overlapStart);
        const selectedPeriodDaysOverlap = overlapMs / (1000 * 60 * 60 * 24);

        // Estimated consumed in the period
        const estimatedConsumedInPeriod = selectedPeriodDaysOverlap * dailyRate;
        totalActualQty += estimatedConsumedInPeriod;

        materialSummaryHistory.push({
          allocId: alloc.id,
          allocatedQty: alloc.quantity,
          allocatedDate: alloc.date,
          finishedDate,
          isFinished: hasFinishedLog,
          durationDays,
          dailyRate,
          selectedPeriodDaysOverlap,
          estimatedConsumedInPeriod
        });
      });

      const averagePacketLifespan = finishedAllocationsCount > 0 
        ? Math.round((totalLifespanDays / finishedAllocationsCount) * 10) / 10 
        : 0;

      const theoreticalQty = theoreticalMap.get(material.id) || 0;

      itemsSummaryMap.set(material.id, {
        id: material.id,
        name: material.name,
        unit: material.unit,
        category: material.category,
        theoreticalQty,
        actualQty: totalActualQty,
        allocationsCount: materialAllocs.length,
        averagePacketLifespan,
        activeStock: 0, // Placeholder
        isFinished: materialAllocs.every(a => materialSummaryHistory.find(h => h.allocId === a.id)?.isFinished),
        history: materialSummaryHistory
      });
    });

    return Array.from(itemsSummaryMap.values());
  }, [catalog, allocations, finishedLogs, menuItems, orders, startDate, endDate, selectedStore]);

  // Filter and search handling
  const filteredData = useMemo(() => {
    let result = consumptionData.filter(item => {
      const matchCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    });

    if (discrepancySort === 'high') {
      result.sort((a, b) => (b.actualQty - b.theoreticalQty) - (a.actualQty - a.theoreticalQty));
    } else if (discrepancySort === 'low') {
      result.sort((a, b) => (a.actualQty - a.theoreticalQty) - (b.actualQty - b.theoreticalQty));
    }

    return result;
  }, [consumptionData, categoryFilter, searchQuery, discrepancySort]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totalAssignedPackets = 0;
    let completedPacketsCount = 0;
    let totalTheoreticalValue = 0;
    let totalActualValue = 0;

    consumptionData.forEach(item => {
      totalAssignedPackets += item.history.reduce((sum, h) => sum + h.allocatedQty, 0);
      completedPacketsCount += item.history.filter(h => h.isFinished).length;
      totalTheoreticalValue += item.theoreticalQty;
      totalActualValue += item.actualQty;
    });

    return {
      totalAssignedPackets,
      completedPacketsCount,
      totalTheoreticalValue,
      totalActualValue,
      avgLifespan: consumptionData.filter(item => item.averagePacketLifespan > 0).reduce((acc, curr) => acc + curr.averagePacketLifespan, 0) / (consumptionData.filter(item => item.averagePacketLifespan > 0).length || 1)
    };
  }, [consumptionData]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {loading ? (
        <div className="bg-white rounded-[3rem] p-24 border-4 border-brand-brown shadow-xl text-center space-y-6 flex flex-col items-center justify-center">
          <RefreshCw className="w-12 h-12 text-brand-brown animate-spin" />
          <p className="text-xs font-black uppercase text-brand-brown tracking-widest">
            Calculating Packet Durations and Overlaps...
          </p>
        </div>
      ) : error ? (
        <div className="bg-rose-50 border-4 border-rose-900 rounded-[2.5rem] p-8 text-center text-rose-900 space-y-4">
          <AlertTriangle className="w-12 h-12 text-rose-600 mx-auto" />
          <h4 className="text-lg font-black uppercase">Computation Interrupted</h4>
          <p className="text-xs font-bold max-w-md mx-auto">{error}</p>
          <button 
            onClick={loadData}
            className="bg-rose-900 text-white rounded-xl px-6 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-rose-850"
          >
            Retry Now
          </button>
        </div>
      ) : (
        <>
          {/* Key Metric Blocks */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-[2rem] border-2 border-brand-stone shadow-sm">
              <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest block mb-1">
                Total Assigned Stock
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-brand-brown">
                  {stats.totalAssignedPackets.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-zinc-400 uppercase">units</span>
              </div>
              <p className="text-[10px] font-bold text-emerald-600 mt-2">
                Across all raw material categories
              </p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border-2 border-brand-stone shadow-sm">
              <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest block mb-1">
                Finished Packets
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-brand-brown">
                  {stats.completedPacketsCount}
                </span>
                <span className="text-xs font-bold text-zinc-400 uppercase">fully closed</span>
              </div>
              <p className="text-[10px] font-bold text-brand-brown/40 mt-2">
                With historical STOCK_OVER logs
              </p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border-2 border-brand-stone shadow-sm">
              <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest block mb-1">
                Avg. Packet Lifespan
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-brand-brown">
                  {stats.avgLifespan ? stats.avgLifespan.toFixed(1) : 'N/A'}
                </span>
                <span className="text-xs font-bold text-zinc-400 uppercase">days</span>
              </div>
              <p className="text-[10px] font-bold text-brand-brown/60 mt-2 flex items-center gap-1">
                From assignment to empty
              </p>
            </div>

            <div className="bg-brand-yellow/10 p-6 rounded-[2rem] border-2 border-brand-yellow/40">
              <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest block mb-1">
                Selected Period Consumption
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-brand-brown">
                  {Math.round(stats.totalActualValue).toLocaleString()}
                </span>
                <span className="text-xs font-bold text-brand-brown uppercase">est. units</span>
              </div>
              <p className="text-[10px] font-bold text-brand-brown/60 mt-2">
                Used in [{startDate} to {endDate}]
              </p>
            </div>
          </div>

          {/* Table Toolbar / Filters */}
          <div className="bg-white p-6 rounded-3xl border-2 border-brand-stone flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
            
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-brown/30" />
              <input 
                type="text" 
                placeholder="Search raw material ID or name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-brand-stone bg-brand-stone/10 font-bold text-xs text-brand-brown placeholder:text-brand-brown/30 focus:outline-none focus:border-brand-brown"
              />
            </div>

            {/* Category Toggle */}
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              {['ALL', 'PACKET', 'INGREDIENT', 'MOMO'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                    categoryFilter === cat 
                      ? 'bg-brand-brown text-brand-yellow border-brand-brown' 
                      : 'bg-white text-brand-brown/50 border-brand-stone hover:bg-brand-brown/5'
                  }`}
                >
                  {cat === 'ALL' ? 'All Categories' : cat}
                </button>
              ))}
            </div>

            {/* Discrepancy Sorter */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Reconciliation:</span>
              <select
                value={discrepancySort}
                onChange={e => setDiscrepancySort(e.target.value as any)}
                className="bg-white text-xs font-bold text-brand-brown border border-brand-stone px-3 py-2 rounded-xl focus:outline-none"
              >
                <option value="none">Standard Catalog</option>
                <option value="high">Actual Over Theoretical (Discrepancies)</option>
                <option value="low">Theoretical Over Actual</option>
              </select>
            </div>

          </div>

          {/* Consumption Reconciliation Table */}
          <div className="bg-white rounded-[2.5rem] border-2 border-brand-stone shadow-sm overflow-hidden">
            <div className="p-8 border-b border-brand-stone bg-brand-stone/10 flex items-center justify-between">
              <div>
                <h3 className="text-md font-black uppercase text-brand-brown">Reconciliation Ledger</h3>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                  Comparing recipes (sales) vs packet tracking allocations
                </p>
              </div>
              <span className="bg-white px-4 py-1.5 rounded-full text-[9px] font-black uppercase text-brand-brown border-2 border-brand-stone shadow-sm">
                Showing {filteredData.length} active raw items
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-stone text-[9px] font-black uppercase text-zinc-400 tracking-wider">
                    <th className="py-5 px-8">Material / ID</th>
                    <th className="py-5 px-6">Category</th>
                    <th className="py-5 px-6 text-right">Recipe-Based (Theoretical)</th>
                    <th className="py-5 px-6 text-right">Packet-Based (Estimated Actual)</th>
                    <th className="py-5 px-6 text-right">Variance / Waste</th>
                    <th className="py-5 px-6 text-center">Avg Lifespan</th>
                    <th className="py-5 px-8 text-center">Allocations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-stone/40">
                  {filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-20 text-center">
                        <Boxes className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                        <h4 className="text-xs font-black uppercase text-brand-brown">No items match criteria</h4>
                        <p className="text-[10px] text-zinc-400">Try choosing a different category filter or date range.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredData.map(item => {
                      const variance = item.actualQty - item.theoreticalQty;
                      
                      return (
                        <tr key={item.id} className="hover:bg-brand-stone/10 transition-colors">
                          <td className="py-5 px-8">
                            <div className="font-extrabold text-sm text-brand-brown uppercase">{item.name}</div>
                            <div className="font-mono text-[9px] text-zinc-400 mt-0.5">{item.id}</div>
                          </td>
                          <td className="py-5 px-6">
                            <span className={`px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-wider ${
                              item.category === 'PACKET' ? 'bg-indigo-50 text-indigo-700' :
                              item.category === 'INGREDIENT' ? 'bg-amber-50 text-amber-700' :
                              'bg-rose-50 text-rose-700'
                            }`}>
                              {item.category}
                            </span>
                          </td>
                          <td className="py-5 px-6 text-right font-bold text-sm text-brand-brown">
                            {item.theoreticalQty > 0 ? (
                              <>
                                {item.theoreticalQty.toFixed(1)}{' '}
                                <span className="text-[10px] text-zinc-400 uppercase">{item.unit}</span>
                              </>
                            ) : (
                              <span className="text-zinc-300 font-medium">—</span>
                            )}
                          </td>
                          <td className="py-5 px-6 text-right font-black text-sm text-zinc-900">
                            {item.actualQty > 0 ? (
                              <>
                                {item.actualQty.toFixed(1)}{' '}
                                <span className="text-[10px] text-brand-brown uppercase">{item.unit}</span>
                              </>
                            ) : (
                              <span className="text-zinc-300 font-medium">—</span>
                            )}
                          </td>
                          <td className="py-5 px-6 text-right">
                            {item.actualQty > 0 || item.theoreticalQty > 0 ? (
                              <div className="flex flex-col items-end">
                                <span className={`font-black text-xs ${
                                  variance > 0 ? 'text-brand-red' : variance < 0 ? 'text-emerald-600' : 'text-zinc-500'
                                }`}>
                                  {variance > 0 ? '+' : ''}{variance.toFixed(1)} {item.unit}
                                </span>
                                {item.theoreticalQty > 0 && (
                                  <span className="text-[9px] text-zinc-400 font-bold mt-0.5">
                                    ({((variance / item.theoreticalQty) * 100).toFixed(0)}% var)
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-zinc-300 font-medium">—</span>
                            )}
                          </td>
                          <td className="py-5 px-6 text-center font-bold text-xs text-brand-brown">
                            {item.averagePacketLifespan > 0 ? (
                              <span>{item.averagePacketLifespan} days</span>
                            ) : (
                              <span className="text-zinc-300 font-medium">—</span>
                            )}
                          </td>
                          <td className="py-5 px-8 text-center font-extrabold text-xs text-brand-brown">
                            {item.allocationsCount} allocation{item.allocationsCount !== 1 ? 's' : ''}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Deep-Dive History Explorer for Packet Tracking */}
          <div className="bg-brand-stone/10 rounded-[2.5rem] p-8 border-2 border-brand-stone">
            <h3 className="text-lg font-black uppercase text-brand-brown mb-2 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-brand-brown" />
              PACKET ALLOCATION ALLOCATED-TO-FINISHED DRILLDOWN
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed max-w-2xl mb-8">
              Click on any item in your catalog to trace its allocation lifespans, the daily consumption velocities, and exactly which allocations contributed to consumption within the selected period.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {filteredData.slice(0, 3).map(item => (
                <div key={item.id} className="bg-white p-6 rounded-2xl border-2 border-brand-stone shadow-sm space-y-4 flex flex-col">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-extrabold text-md text-brand-brown uppercase">{item.name}</h4>
                      <p className="text-[9px] text-zinc-400 font-mono">{item.id}</p>
                    </div>
                    <span className="bg-brand-brown/5 text-brand-brown text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded">
                      {item.unit}
                    </span>
                  </div>

                  <div className="flex-1 space-y-3 pt-3 border-t border-brand-stone/40">
                    <h5 className="text-[9px] font-black text-zinc-400 uppercase tracking-wider mb-2">Allocation Lifespans</h5>
                    
                    {item.history.length === 0 ? (
                      <p className="text-[10px] text-zinc-400 italic py-4">No allocations logged yet.</p>
                    ) : (
                      item.history.map((hist, idx) => (
                        <div key={hist.allocId} className="bg-brand-stone/20 p-3 rounded-xl border border-brand-stone/30 space-y-2">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-brand-brown">Alloc #{idx + 1} ({hist.allocatedQty} {item.unit})</span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                              hist.isFinished ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {hist.isFinished ? 'Closed' : 'Active'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[9px] text-zinc-500">
                            <div>Assigned: <strong className="text-zinc-700">{new Date(hist.allocatedDate).toLocaleDateString()}</strong></div>
                            <div>Stock Over: <strong className="text-zinc-700">{hist.finishedDate ? new Date(hist.finishedDate).toLocaleDateString() : 'Active/Ongoing'}</strong></div>
                            <div>Lifespan: <strong className="text-zinc-700">{hist.durationDays} days</strong></div>
                            <div>Daily Velocity: <strong className="text-zinc-700">{(hist.dailyRate).toFixed(1)} / day</strong></div>
                          </div>
                          <div className="pt-2 border-t border-brand-stone/40 flex items-center justify-between text-[10px] font-black">
                            <span className="text-zinc-400 uppercase">Period Consumption:</span>
                            <span className="text-brand-brown">{hist.estimatedConsumedInPeriod.toFixed(1)} {item.unit}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

    </div>
  );
};
