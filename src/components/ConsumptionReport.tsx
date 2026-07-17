import React, { useMemo, useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { 
  fetchMenuItems, 
  getISTDate, 
  getISTDateString, 
  fetchAllNonVoidedProcurements,
  getOrdersForDateRange,
  getItemSubcategory
} from '../utils/storage';
import { 
  RefreshCw, 
  AlertTriangle, 
  Search, 
  Boxes, 
  BarChart3,
  Calendar,
  DollarSign,
  ShoppingBag,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Info
} from 'lucide-react';
import { CompletedOrder, RecipeRequirement } from '../types';

interface ConsumptionReportProps {
  orders?: CompletedOrder[];
  startDate?: string;
  endDate?: string;
  selectedStore: string;
}

interface MaterialCatalogItem {
  id: string;
  name: string;
  unit: string;
  category: string;
  last_purchase_cost?: number;
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

interface ConsumedItemInfo {
  id: string;
  name: string;
  unit: string;
  category: string; // 'MOMO' | 'PACKET' | 'INGREDIENT'
  subcategory: string;
  unitCost: number;
  consumedQty: number; // For MOMO: recipe sold qty. For others: count of STOCK_OVER logs
  consumedWorth: number;
  
  // Drilldown records
  orderContributions: {
    billNumber: number;
    orderId: string;
    branchName: string;
    date: string;
    menuItemName: string;
    multiplier: number; // number of products sold
    recipeQuantity: number; // recipe qty per product
    totalContribution: number; // multiplier * recipeQuantity
  }[];
  
  stockOverEvents: {
    id: string;
    branchName: string;
    date: string;
  }[];
}

// Subcategory metadata with customized display styling
const SUBCATEGORIES_META: Record<string, { label: string, icon: string, color: string }> = {
  momo: { label: 'Momo & Dim Sums', icon: '🥟', color: 'bg-orange-500' },
  buns: { label: 'Burger Buns', icon: '🍔', color: 'bg-amber-500' },
  cola: { label: 'Cola Drinks', icon: '🥤', color: 'bg-red-500' },
  drinks: { label: 'Drinks & Beverages', icon: '🍹', color: 'bg-blue-500' },
  syrups: { label: 'Syrups & Mojitos', icon: '🍹', color: 'bg-pink-500' },
  sauces: { label: 'Sauces & Chutneys', icon: '🥫', color: 'bg-rose-500' },
  packaging: { label: 'Packaging Materials', icon: '📦', color: 'bg-indigo-500' },
  'oil-butter': { label: 'Oil & Butter', icon: '🧈', color: 'bg-yellow-500' },
  spices: { label: 'Spices & Seasonings', icon: '🌶️', color: 'bg-red-600' },
  fries: { label: 'Fries & Sides', icon: '🍟', color: 'bg-yellow-600' },
  veggies: { label: 'Veggies & Greens', icon: '🥬', color: 'bg-emerald-500' },
  others: { label: 'Other Items', icon: '🏷️', color: 'bg-zinc-500' }
};

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
  const [finishedLogs, setFinishedLogs] = useState<InventoryLogRecord[]>([]);
  const [catalog, setCatalog] = useState<MaterialCatalogItem[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [procurements, setProcurements] = useState<any[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Drilldown interactive state
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(null);
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Handle syncing of prop-passed dates
  useEffect(() => {
    if (startDate) setStartDateLocal(startDate);
    if (endDate) setEndDateLocal(endDate);
  }, [startDate, endDate]);

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
      const day = today.getDay();
      const diff = today.getDate() - (day === 0 ? 6 : day - 1);
      start.setDate(diff);
    } else if (preset === 'last-week') {
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
      // 1. Fetch catalog
      const { data: catalogData, error: catalogErr } = await supabase
        .from('central_inventory')
        .select('id, name, unit, category, last_purchase_cost');
      if (catalogErr) throw catalogErr;
      setCatalog((catalogData || []) as MaterialCatalogItem[]);

      // 2. Fetch non-voided procurements to find latest cost
      const procData = await fetchAllNonVoidedProcurements();
      setProcurements(procData || []);

      // 3. Fetch menu items to resolve recipes
      const { data: menuData } = await fetchMenuItems();
      if (menuData) setMenuItems(menuData);

      // 4. Fetch stock-over/finished logs
      let logsQuery = supabase
        .from('inventory_logs')
        .select('*')
        .eq('reason', 'STOCK_OVER');

      if (selectedStore !== 'All') {
        logsQuery = logsQuery.eq('branch_name', selectedStore);
      }
      
      const { data: logsData, error: logsErr } = await logsQuery;
      if (logsErr) throw logsErr;
      setFinishedLogs((logsData || []) as InventoryLogRecord[]);

      // 5. Fetch orders if not provided explicitly
      if (!orders) {
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

  // A. CALCULATE UNIT COST MAP
  const estimatedUnitCostMap = useMemo(() => {
    const costMap: Record<string, number> = {};

    // First pass: latest procurement cost
    procurements.forEach(proc => {
      const itemId = proc.item_id;
      if (!itemId) return;
      if (costMap[itemId] !== undefined) return;

      const qty = parseFloat(proc.quantity) || 0;
      const totalCost = parseFloat(proc.total_cost) || 0;
      if (qty > 0 && totalCost > 0) {
        costMap[itemId] = totalCost / qty;
      }
    });

    // Fallback: central catalog last_purchase_cost
    catalog.forEach(item => {
      if (costMap[item.id] === undefined) {
        costMap[item.id] = item.last_purchase_cost || 0;
      }
    });

    return costMap;
  }, [catalog, procurements]);

  // B. MAIN CALCULATOR OF CONSUMPTION
  const consumptionData = useMemo(() => {
    // 1. Setup date ranges
    const startMs = new Date(startDateLocal + 'T00:00:00').getTime();
    const endMs = new Date(endDateLocal + 'T23:59:59').getTime();

    // 2. Filter orders
    const activeOrders = orders || fetchedOrders;
    const filteredOrders = activeOrders.filter(o => {
      const orderTime = new Date(o.date).getTime();
      const inDate = orderTime >= startMs && orderTime <= endMs;
      const inStore = selectedStore === 'All' || o.branchName === selectedStore;
      return inDate && inStore;
    });

    // 3. Filter STOCK_OVER logs
    const filteredLogs = finishedLogs.filter(log => {
      const logTime = new Date(log.date).getTime();
      const inDate = logTime >= startMs && logTime <= endMs;
      
      let inStore = true;
      if (selectedStore !== 'All') {
        inStore = log.branch_name === selectedStore || (selectedStore === 'Supply Hub' && log.branch_name === 'CENTRAL_HUB');
      }
      return inDate && inStore;
    });

    // 4. Initialize consumed items map
    const itemsMap: Record<string, ConsumedItemInfo> = {};
    catalog.forEach(item => {
      const sub = getItemSubcategory(item.name, item.id, item.category);
      itemsMap[item.id] = {
        id: item.id,
        name: item.name,
        unit: item.unit,
        category: item.category,
        subcategory: sub,
        unitCost: estimatedUnitCostMap[item.id] || 0,
        consumedQty: 0,
        consumedWorth: 0,
        orderContributions: [],
        stockOverEvents: []
      };
    });

    // 5. Category A Consumption (MOMO auto-deduct recipe-based sales)
    filteredOrders.forEach(order => {
      order.items.forEach(item => {
        if (!item.menuItemId || item.menuItemId === 'discount') return;

        let menuDetail = menuItems.find(m => m.id === item.menuItemId);
        if (!menuDetail) {
          const baseName = item.name.replace(/^(Steamed|Fried|Pan Fried|Pan-Fried|Peri-Peri|Peri peri|Normal)\s+/i, '').split(' (')[0].trim();
          menuDetail = menuItems.find(m => m.name.toLowerCase() === baseName.toLowerCase() || m.name.toLowerCase() === item.name.toLowerCase());
        }

        if (menuDetail) {
          const size = ((item as any).size || 'medium').toLowerCase();
          const sizeRecipe = menuDetail.sizeRecipes?.[size];
          let activeRecipe: RecipeRequirement[] = (sizeRecipe && Array.isArray(sizeRecipe) && sizeRecipe.length > 0) ? sizeRecipe : [];
          
          if (activeRecipe.length === 0 && menuDetail.recipe && Array.isArray(menuDetail.recipe) && menuDetail.recipe.length > 0) {
            activeRecipe = menuDetail.recipe;
          }

          activeRecipe.forEach(req => {
            const materialId = req.materialId;
            const recipeQty = req.quantity || 0;
            const soldQty = item.quantity || 0;
            const consumed = recipeQty * soldQty;

            const currentItem = itemsMap[materialId];
            // Only MOMO category items are auto-deducted
            if (currentItem && currentItem.category === 'MOMO') {
              currentItem.consumedQty += consumed;
              currentItem.orderContributions.push({
                billNumber: order.billNumber,
                orderId: order.id,
                branchName: order.branchName,
                date: order.date,
                menuItemName: `${item.name} (${size})`,
                multiplier: soldQty,
                recipeQuantity: recipeQty,
                totalContribution: consumed
              });
            }
          });
        }
      });
    });

    // 6. Category B/C Consumption (PACKET / INGREDIENT based on Clicked STOCK_OVER Logs)
    filteredLogs.forEach(log => {
      const materialId = log.inventory_id;
      const currentItem = itemsMap[materialId];
      if (currentItem && currentItem.category !== 'MOMO') {
        currentItem.consumedQty += 1;
        currentItem.stockOverEvents.push({
          id: log.id,
          branchName: log.branch_name,
          date: log.date
        });
      }
    });

    // 7. Compute total worths
    Object.values(itemsMap).forEach(item => {
      item.consumedWorth = item.consumedQty * item.unitCost;
    });

    return itemsMap;
  }, [catalog, menuItems, orders, fetchedOrders, finishedLogs, estimatedUnitCostMap, startDateLocal, endDateLocal, selectedStore]);

  // C. GROUP & AGGREGATE BY SUBCATEGORY
  const subcategoryData = useMemo(() => {
    const subGroups: Record<string, {
      id: string;
      label: string;
      icon: string;
      color: string;
      parentCategory: string;
      totalWorth: number;
      totalQty: number;
      items: ConsumedItemInfo[];
    }> = {};

    Object.values(consumptionData).forEach(item => {
      const subId = item.subcategory;
      if (!subGroups[subId]) {
        const meta = SUBCATEGORIES_META[subId] || { label: subId.charAt(0).toUpperCase() + subId.slice(1), icon: '🏷️', color: 'bg-zinc-500' };
        subGroups[subId] = {
          id: subId,
          label: meta.label,
          icon: meta.icon,
          color: meta.color,
          parentCategory: item.category,
          totalWorth: 0,
          totalQty: 0,
          items: []
        };
      }
      subGroups[subId].totalWorth += item.consumedWorth;
      subGroups[subId].totalQty += item.consumedQty;
      subGroups[subId].items.push(item);
    });

    // Sort subcategories: first by total worth (highest first), then alphabetically
    return Object.values(subGroups).sort((a, b) => {
      if (b.totalWorth !== a.totalWorth) return b.totalWorth - a.totalWorth;
      return a.label.localeCompare(b.label);
    });
  }, [consumptionData]);

  // D. GLOBAL STATS FOR THE HIGHLIGHT BLOCKS
  const stats = useMemo(() => {
    let totalWorthAll = 0;
    let totalWorthCategoryA = 0;
    let totalWorthCategoryB = 0;
    let totalCategoryAUnits = 0;
    let totalCategoryBPackets = 0;

    Object.values(consumptionData).forEach(item => {
      totalWorthAll += item.consumedWorth;
      if (item.category === 'MOMO') {
        totalWorthCategoryA += item.consumedWorth;
        totalCategoryAUnits += item.consumedQty;
      } else {
        totalWorthCategoryB += item.consumedWorth;
        totalCategoryBPackets += item.consumedQty;
      }
    });

    return {
      totalWorthAll,
      totalWorthCategoryA,
      totalWorthCategoryB,
      totalCategoryAUnits,
      totalCategoryBPackets
    };
  }, [consumptionData]);

  // Set default selected subcategory on first load
  useEffect(() => {
    if (subcategoryData.length > 0 && !selectedSubcategoryId) {
      setSelectedSubcategoryId(subcategoryData[0].id);
    }
  }, [subcategoryData, selectedSubcategoryId]);

  // Get active subcategory object
  const selectedSub = useMemo(() => {
    return subcategoryData.find(s => s.id === selectedSubcategoryId) || null;
  }, [subcategoryData, selectedSubcategoryId]);

  // Filter items inside active subcategory by search query and sort by consumed worth
  const displayedItems = useMemo(() => {
    if (!selectedSub) return [];
    return selectedSub.items
      .filter(item => 
        item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
        item.id.toLowerCase().includes(itemSearchQuery.toLowerCase())
      )
      .sort((a, b) => b.consumedWorth - a.consumedWorth);
  }, [selectedSub, itemSearchQuery]);

  const toggleItemExpanded = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Date Preset Selector */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-6 p-8 bg-white rounded-[3rem] border border-brand-stone shadow-sm">
        <div className="flex flex-col gap-1.5 self-start lg:self-center">
          <h3 className="text-2xl font-black text-brand-brown italic uppercase flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-brand-brown" />
            Consumption & Cost Insights
          </h3>
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest">
            Evaluate exact stock monetary worth consumed during the selected period
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-start lg:justify-end">
          <button 
            onClick={() => loadData()} 
            className="bg-brand-stone/30 p-2.5 rounded-xl hover:bg-brand-yellow transition-colors" 
            title="Reload Data"
          >
            <RefreshCw className={`w-5 h-5 text-brand-brown ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          {(['today', 'yesterday', 'week', 'last-week', 'month', 'last-month', 'last30', 'custom'] as const).map(p => (
            <button 
              key={p} 
              onClick={() => handlePresetChange(p)} 
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                datePreset === p 
                  ? 'bg-brand-brown border-brand-brown text-brand-yellow shadow-sm' 
                  : 'bg-white border-brand-stone text-brand-brown/40 hover:border-brand-brown/20'
              }`}
            >
              {p === 'week' ? 'this week' : p === 'last-week' ? 'last week' : p === 'last30' ? 'last 30 days' : p === 'last-month' ? 'last month' : p}
            </button>
          ))}
          
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 pl-4 border-l-2 border-brand-stone">
              <input 
                type="date" 
                value={startDateLocal} 
                onChange={e => setStartDateLocal(e.target.value)} 
                className="bg-transparent text-[10px] font-black p-1.5 outline-none border border-brand-stone rounded-md text-brand-brown" 
              />
              <span className="text-brand-brown/20">-</span>
              <input 
                type="date" 
                value={endDateLocal} 
                onChange={e => setEndDateLocal(e.target.value)} 
                className="bg-transparent text-[10px] font-black p-1.5 outline-none border border-brand-stone rounded-md text-brand-brown" 
              />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-[3rem] p-24 border-4 border-brand-brown shadow-xl text-center space-y-6 flex flex-col items-center justify-center">
          <RefreshCw className="w-12 h-12 text-brand-brown animate-spin" />
          <p className="text-xs font-black uppercase text-brand-brown tracking-widest animate-pulse">
            Calculating Subcategory Consumption Worth...
          </p>
        </div>
      ) : error ? (
        <div className="bg-rose-50 border-4 border-rose-950 rounded-[2.5rem] p-8 text-center text-rose-950 space-y-4">
          <AlertTriangle className="w-12 h-12 text-rose-600 mx-auto" />
          <h4 className="text-lg font-black uppercase">Calculation Interrupted</h4>
          <p className="text-xs font-bold max-w-md mx-auto">{error}</p>
          <button 
            onClick={loadData}
            className="bg-rose-950 text-white rounded-xl px-6 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-rose-900"
          >
            Retry Now
          </button>
        </div>
      ) : (
        <>
          {/* Key Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-[2rem] border-2 border-brand-stone shadow-sm hover:scale-[1.02] transition-transform">
              <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest block mb-1 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-brand-brown/50" />
                Capital Consumed
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-black text-brand-brown">₹</span>
                <span className="text-3xl font-black text-brand-brown">
                  {stats.totalWorthAll.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <p className="text-[10px] font-bold text-brand-brown/40 mt-2 uppercase tracking-wide">
                Total stock value finished
              </p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border-2 border-brand-stone shadow-sm hover:scale-[1.02] transition-transform">
              <span className="text-[9px] font-black uppercase text-orange-500 tracking-widest block mb-1 flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-orange-500/50" />
                Category A Consumption
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-black text-brand-brown">₹</span>
                <span className="text-3xl font-black text-brand-brown">
                  {stats.totalWorthCategoryA.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <p className="text-[10px] font-bold text-emerald-600 mt-2 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                {stats.totalCategoryAUnits.toLocaleString()} units auto-deducted
              </p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border-2 border-brand-stone shadow-sm hover:scale-[1.02] transition-transform">
              <span className="text-[9px] font-black uppercase text-indigo-500 tracking-widest block mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500/50" />
                Category B/C Consumption
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-black text-brand-brown">₹</span>
                <span className="text-3xl font-black text-brand-brown">
                  {stats.totalWorthCategoryB.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <p className="text-[10px] font-bold text-indigo-500 mt-2">
                {stats.totalCategoryBPackets} packets marked stock finish
              </p>
            </div>

            <div className="bg-brand-yellow/10 p-6 rounded-[2rem] border-2 border-brand-yellow/40">
              <span className="text-[9px] font-black uppercase text-brand-brown/50 tracking-widest block mb-1">
                Selected Period Active Store
              </span>
              <div className="text-xl font-black text-brand-brown mt-1 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-brand-brown/50" />
                {selectedStore}
              </div>
              <p className="text-[9px] font-bold text-brand-brown/60 mt-3 bg-brand-yellow/30 px-3 py-1 rounded-full inline-block uppercase tracking-wider">
                [{startDateLocal} to {endDateLocal}]
              </p>
            </div>
          </div>

          {/* Interactive Split Explorer */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left side: Subcategories List */}
            <div className="lg:col-span-4 space-y-4">
              <div className="p-4 bg-brand-stone/10 rounded-2xl">
                <h4 className="text-[10px] font-black uppercase text-brand-brown tracking-widest block text-center">
                  Subcategories Capital Share
                </h4>
              </div>

              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {subcategoryData.map(sub => {
                  const percent = stats.totalWorthAll > 0 ? (sub.totalWorth / stats.totalWorthAll) * 100 : 0;
                  const isSelected = selectedSubcategoryId === sub.id;

                  return (
                    <button
                      key={sub.id}
                      onClick={() => {
                        setSelectedSubcategoryId(sub.id);
                        setItemSearchQuery('');
                        setExpandedItemId(null);
                      }}
                      className={`w-full text-left p-5 rounded-[2rem] border-2 transition-all relative overflow-hidden flex flex-col gap-3 group ${
                        isSelected 
                          ? 'bg-brand-brown border-brand-brown text-brand-yellow shadow-md scale-[1.02]' 
                          : 'bg-white border-brand-stone text-brand-brown hover:border-brand-brown/30'
                      }`}
                    >
                      {/* Interactive click splash indicator */}
                      {isSelected && (
                        <div className="absolute right-0 top-0 bottom-0 w-2 bg-brand-yellow" />
                      )}

                      <div className="flex justify-between items-start w-full">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{sub.icon}</span>
                          <div>
                            <span className="font-extrabold text-sm uppercase block">
                              {sub.label}
                            </span>
                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded tracking-widest mt-1 inline-block ${
                              isSelected ? 'bg-white/20 text-brand-yellow' : 'bg-brand-stone/40 text-brand-brown/60'
                            }`}>
                              {sub.parentCategory === 'MOMO' ? 'Category A: Auto' : 'Category B/C: Manual'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className={`font-black text-sm ${isSelected ? 'text-brand-yellow' : 'text-brand-brown'}`}>
                            ₹{sub.totalWorth.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </div>
                          <div className={`text-[9px] font-bold ${isSelected ? 'text-brand-yellow/60' : 'text-zinc-400'}`}>
                            {percent.toFixed(1)}% share
                          </div>
                        </div>
                      </div>

                      {/* Visual progress bar */}
                      <div className="w-full bg-brand-stone/20 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${isSelected ? 'bg-brand-yellow' : 'bg-brand-brown'}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right side: Subcategory Items Drilldown */}
            <div className="lg:col-span-8 bg-white p-8 rounded-[3rem] border-2 border-brand-stone shadow-sm space-y-6">
              
              {selectedSub ? (
                <>
                  {/* Selected Subcategory Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-brand-stone">
                    <div className="flex items-center gap-4">
                      <span className="text-4xl p-3 bg-brand-stone/20 rounded-2xl">{selectedSub.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-black text-brand-brown uppercase italic">
                            {selectedSub.label}
                          </h3>
                          <span className="bg-brand-stone/30 text-brand-brown px-2.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">
                            {selectedSub.parentCategory === 'MOMO' ? 'Auto-Deduct' : 'Stock Finish'}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                          Consumed stock list in this subcategory
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest block">Subcategory Cost</span>
                      <span className="text-2xl font-black text-brand-brown">
                        ₹{selectedSub.totalWorth.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Search inside this subcategory */}
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-brown/30" />
                    <input 
                      type="text" 
                      placeholder={`Search within ${selectedSub.label}...`}
                      value={itemSearchQuery}
                      onChange={e => setItemSearchQuery(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-brand-stone bg-brand-stone/10 font-bold text-xs text-brand-brown placeholder:text-brand-brown/30 focus:outline-none focus:border-brand-brown"
                    />
                  </div>

                  {/* Items List Table */}
                  <div className="overflow-hidden border border-brand-stone rounded-2xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-brand-stone/20 border-b border-brand-stone text-[9px] font-black uppercase text-brand-brown/50 tracking-wider">
                          <th className="py-4 px-6">Product / Material</th>
                          <th className="py-4 px-4 text-right">Unit Cost</th>
                          <th className="py-4 px-4 text-right">Qty Consumed</th>
                          <th className="py-4 px-6 text-right">Total Worth</th>
                          <th className="py-4 px-4"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-stone/30">
                        {displayedItems.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center">
                              <Boxes className="w-10 h-10 text-zinc-200 mx-auto mb-3" />
                              <h4 className="text-xs font-black uppercase text-brand-brown">No products consumed</h4>
                              <p className="text-[10px] text-zinc-400">Either no orders/stock-finish occurred, or search didn't match.</p>
                            </td>
                          </tr>
                        ) : (
                          displayedItems.map(item => {
                            const isExpanded = expandedItemId === item.id;
                            const hasEvents = item.category === 'MOMO' ? item.orderContributions.length > 0 : item.stockOverEvents.length > 0;

                            return (
                              <React.Fragment key={item.id}>
                                <tr 
                                  onClick={() => hasEvents && toggleItemExpanded(item.id)}
                                  className={`transition-colors group ${hasEvents ? 'cursor-pointer hover:bg-brand-stone/5' : ''}`}
                                >
                                  <td className="py-4 px-6">
                                    <div className="font-extrabold text-sm text-brand-brown group-hover:text-brand-brown/80">{item.name}</div>
                                    <div className="font-mono text-[9px] text-zinc-400 mt-0.5">{item.id}</div>
                                  </td>
                                  <td className="py-4 px-4 text-right font-bold text-xs text-zinc-600">
                                    ₹{item.unitCost.toFixed(2)} / {item.unit}
                                  </td>
                                  <td className="py-4 px-4 text-right">
                                    <span className="font-black text-xs text-brand-brown">
                                      {item.consumedQty.toLocaleString()}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 ml-1 uppercase">{item.unit}</span>
                                  </td>
                                  <td className="py-4 px-6 text-right">
                                    <span className="font-black text-sm text-zinc-950">
                                      ₹{item.consumedWorth.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 text-center">
                                    {hasEvents ? (
                                      isExpanded ? <ChevronDown className="w-4 h-4 text-brand-brown" /> : <ChevronRight className="w-4 h-4 text-brand-brown/40" />
                                    ) : null}
                                  </td>
                                </tr>

                                {/* Expanded Events Logs */}
                                {isExpanded && hasEvents && (
                                  <tr>
                                    <td colSpan={5} className="bg-brand-stone/10 p-6 border-t border-b border-brand-stone">
                                      {item.category === 'MOMO' ? (
                                        <div className="space-y-3">
                                          <div className="flex items-center justify-between">
                                            <h5 className="text-[10px] font-black uppercase text-brand-brown tracking-wider flex items-center gap-1.5">
                                              <ShoppingBag className="w-4 h-4 text-brand-brown" />
                                              Sales Recipe Contributions ({item.orderContributions.length} completed sales)
                                            </h5>
                                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                                              *Auto-deducted on billing
                                            </span>
                                          </div>
                                          
                                          <div className="max-h-60 overflow-y-auto rounded-xl border border-brand-stone bg-white">
                                            <table className="w-full text-left text-xs">
                                              <thead className="bg-brand-stone/20 text-[9px] font-black uppercase text-brand-brown/50 border-b border-brand-stone sticky top-0">
                                                <tr>
                                                  <th className="py-2 px-4">Bill No</th>
                                                  <th className="py-2 px-4">Store</th>
                                                  <th className="py-2 px-4">Date/Time</th>
                                                  <th className="py-2 px-4">Sold Item</th>
                                                  <th className="py-2 px-4 text-right">Qty Consumed</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-brand-stone/30">
                                                {item.orderContributions.map((contrib, cidx) => (
                                                  <tr key={`${contrib.orderId}-${cidx}`} className="hover:bg-brand-stone/5">
                                                    <td className="py-2 px-4 font-bold text-brand-brown">#{contrib.billNumber}</td>
                                                    <td className="py-2 px-4 font-semibold text-zinc-600">{contrib.branchName}</td>
                                                    <td className="py-2 px-4 text-zinc-500">
                                                      {new Date(contrib.date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                                                    </td>
                                                    <td className="py-2 px-4 font-bold text-zinc-800">{contrib.menuItemName}</td>
                                                    <td className="py-2 px-4 text-right font-black text-brand-brown">
                                                      {contrib.totalContribution.toFixed(1)} {item.unit}
                                                      <div className="text-[9px] text-zinc-400 font-bold">
                                                        ({contrib.multiplier} sold × {contrib.recipeQuantity})
                                                      </div>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-3">
                                          <div className="flex items-center justify-between">
                                            <h5 className="text-[10px] font-black uppercase text-brand-brown tracking-wider flex items-center gap-1.5">
                                              <CheckCircle2 className="w-4 h-4 text-brand-brown" />
                                              Manual Stock Finish Logs ({item.stockOverEvents.length} times finished)
                                            </h5>
                                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                                              *Logged when Branch clicked "Finish"
                                            </span>
                                          </div>
                                          
                                          <div className="max-h-60 overflow-y-auto rounded-xl border border-brand-stone bg-white">
                                            <table className="w-full text-left text-xs">
                                              <thead className="bg-brand-stone/20 text-[9px] font-black uppercase text-brand-brown/50 border-b border-brand-stone sticky top-0">
                                                <tr>
                                                  <th className="py-2 px-4">Log Event ID</th>
                                                  <th className="py-2 px-4">Store Location</th>
                                                  <th className="py-2 px-4">Date/Time Finished</th>
                                                  <th className="py-2 px-4 text-right">Units Finished</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-brand-stone/30">
                                                {item.stockOverEvents.map((evt) => (
                                                  <tr key={evt.id} className="hover:bg-brand-stone/5">
                                                    <td className="py-2 px-4 font-mono text-[9px] text-zinc-400">
                                                      #{evt.id.substring(0, 8).toUpperCase()}
                                                    </td>
                                                    <td className="py-2 px-4 font-semibold text-zinc-600">{evt.branchName}</td>
                                                    <td className="py-2 px-4 text-zinc-500">
                                                      {new Date(evt.date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                                                    </td>
                                                    <td className="py-2 px-4 text-right font-black text-brand-brown">
                                                      1 {item.unit}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="py-20 text-center">
                  <Boxes className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
                  <h4 className="text-md font-black uppercase text-brand-brown">No subcategories available</h4>
                  <p className="text-xs text-zinc-400">Please make sure there is active stock registered in your catalog.</p>
                </div>
              )}

            </div>

          </div>

          {/* Guidelines info card footer */}
          <div className="bg-brand-brown/5 p-6 rounded-[2rem] border-2 border-brand-stone flex flex-col md:flex-row items-start md:items-center gap-4 text-brand-brown">
            <Info className="w-6 h-6 text-brand-brown shrink-0" />
            <p className="text-xs leading-relaxed font-semibold">
              <strong>Calculation Rules:</strong> Items belonging to <span className="underline decoration-orange-500 decoration-2">Category A (MOMO category)</span> are computed from recipes connected to completed sales bills inside the date range. Items belonging to <span className="underline decoration-indigo-500 decoration-2">Category B (PACKET/INGREDIENT)</span> are tracked based on the manual "item finished/stock over" logs generated in the date range. Cost value is computed from the most recent non-voided procurement cost (or catalog fallback).
            </p>
          </div>
        </>
      )}

    </div>
  );
};
