import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CompletedOrder, MenuItem, MenuSection } from '../types';
import { 
  TrendingUp, 
  Calendar, 
  Layers, 
  Utensils, 
  Search, 
  Users, 
  ShoppingBag, 
  Truck, 
  Clock, 
  Flame, 
  Activity, 
  ArrowUpRight, 
  Table as TableIcon,
  RefreshCw,
  Award
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  getISTDateString, 
  getOrdersForDateRange, 
  isOrderFromStudent 
} from '../utils/storage';
import { resolveCategoryName } from '../utils/categoryHelper';
import { isDiscountOrNonProductItem } from './ItemSalesReport';

export type TimeWindowPreset = 'today' | 'yesterday' | 'last7' | 'last14' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';

interface ItemSalesTrendProps {
  orders: CompletedOrder[];
  allOrdersRaw?: CompletedOrder[];
  currentStartDate?: string;
  currentEndDate?: string;
  studentPhoneSet?: Set<string>;
  menuItems: MenuItem[];
  menuSections: MenuSection[];
}

export const ItemSalesTrend: React.FC<ItemSalesTrendProps> = ({
  orders,
  allOrdersRaw = [],
  currentStartDate,
  currentEndDate,
  studentPhoneSet,
  menuItems,
  menuSections,
}) => {
  // Preset & Time Window State
  const [timePreset, setTimePreset] = useState<TimeWindowPreset>('last14');
  
  // Compute initial date window based on preset
  const calculatePresetDates = (preset: TimeWindowPreset): { start: string; end: string } => {
    const today = getISTDateString();
    const todayDate = new Date(today);

    if (preset === 'today') {
      return { start: today, end: today };
    }
    if (preset === 'yesterday') {
      const y = new Date(todayDate);
      y.setDate(y.getDate() - 1);
      const yStr = getISTDateString(y);
      return { start: yStr, end: yStr };
    }
    if (preset === 'last7') {
      const s = new Date(todayDate);
      s.setDate(s.getDate() - 6);
      return { start: getISTDateString(s), end: today };
    }
    if (preset === 'last14') {
      const s = new Date(todayDate);
      s.setDate(s.getDate() - 13);
      return { start: getISTDateString(s), end: today };
    }
    if (preset === 'last30') {
      const s = new Date(todayDate);
      s.setDate(s.getDate() - 29);
      return { start: getISTDateString(s), end: today };
    }
    if (preset === 'thisMonth') {
      const s = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
      return { start: getISTDateString(s), end: today };
    }
    if (preset === 'lastMonth') {
      const s = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1);
      const e = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0);
      return { start: getISTDateString(s), end: getISTDateString(e) };
    }
    return { start: currentStartDate || today, end: currentEndDate || today };
  };

  const initialRange = calculatePresetDates('last14');
  const [startDate, setStartDate] = useState<string>(initialRange.start);
  const [endDate, setEndDate] = useState<string>(initialRange.end);
  const [customStart, setCustomStart] = useState<string>(initialRange.start);
  const [customEnd, setCustomEnd] = useState<string>(initialRange.end);

  // Dynamic order loading for ranges not covered by passed orders
  const [fetchedOrders, setFetchedOrders] = useState<CompletedOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
  const fetchedRangeRef = useRef<Map<string, CompletedOrder[]>>(new Map());

  // Target Mode: 'item' vs 'category'
  const [targetMode, setTargetMode] = useState<'item' | 'category'>('item');
  const [selectedItemName, setSelectedItemName] = useState<string>('ALL_ITEMS');
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('ALL_CATEGORIES');
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');

  // Channel & Segment Filters
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'>('ALL');
  const [segmentFilter, setSegmentFilter] = useState<'ALL' | 'STUDENT' | 'REGULAR'>('ALL');

  // Curve Breakdowns
  const [curveMode, setCurveMode] = useState<'unified' | 'splitChannel' | 'splitSegment'>('unified');
  const [chartType, setChartType] = useState<'area' | 'line' | 'bar'>('area');
  const [showTableBreakdown, setShowTableBreakdown] = useState<boolean>(false);

  // Handle Preset Change
  const handlePresetChange = (preset: TimeWindowPreset) => {
    setTimePreset(preset);
    if (preset !== 'custom') {
      const dates = calculatePresetDates(preset);
      setStartDate(dates.start);
      setEndDate(dates.end);
      setCustomStart(dates.start);
      setCustomEnd(dates.end);
    }
  };

  const handleApplyCustomDates = () => {
    if (!customStart || !customEnd) return;
    if (customStart > customEnd) {
      setStartDate(customEnd);
      setEndDate(customStart);
    } else {
      setStartDate(customStart);
      setEndDate(customEnd);
    }
    setTimePreset('custom');
  };

  // Ensure orders are loaded for the requested range
  useEffect(() => {
    let isCancelled = false;

    const ensureOrdersInRange = async () => {
      // Check if allOrdersRaw or orders already covers the range
      const pool = allOrdersRaw.length > 0 ? allOrdersRaw : orders;
      if (pool.length > 0) {
        let poolMin = '9999-99-99';
        let poolMax = '0000-00-00';
        for (const o of pool) {
          if (!o || !o.date) continue;
          const d = getISTDateString(o.date);
          if (d < poolMin) poolMin = d;
          if (d > poolMax) poolMax = d;
        }

        // If the pool covers the required window, use pool directly with zero network calls!
        if (startDate >= poolMin && endDate <= poolMax) {
          if (fetchedOrders.length > 0) setFetchedOrders([]);
          return;
        }
      }

      // If pool is empty (e.g. initial mount while parent loads), wait for parent data
      if (pool.length === 0) {
        return;
      }

      // Check cache
      const cacheKey = `${startDate}_${endDate}`;
      if (fetchedRangeRef.current.has(cacheKey)) {
        setFetchedOrders(fetchedRangeRef.current.get(cacheKey)!);
        return;
      }

      // Fetch from Supabase only if date window goes beyond parent pool
      try {
        setIsLoadingOrders(true);
        const data = await getOrdersForDateRange(startDate, endDate, false);
        if (!isCancelled) {
          fetchedRangeRef.current.set(cacheKey, data);
          setFetchedOrders(data);
        }
      } catch (err) {
        console.error('Failed to load orders for trend date range:', err);
      } finally {
        if (!isCancelled) {
          setIsLoadingOrders(false);
        }
      }
    };

    ensureOrdersInRange();

    return () => {
      isCancelled = true;
    };
  }, [startDate, endDate, allOrdersRaw.length, orders.length]);

  // Combine orders pool for the date window
  const activeOrdersInWindow = useMemo(() => {
    const rawList = fetchedOrders.length > 0 
      ? fetchedOrders 
      : (allOrdersRaw.length > 0 ? allOrdersRaw : orders);

    return rawList.filter(o => {
      if (!o || !o.date) return false;
      const d = getISTDateString(o.date);
      return d >= startDate && d <= endDate;
    });
  }, [fetchedOrders, allOrdersRaw, orders, startDate, endDate]);

  // Extract all available items and categories with total volume in current window
  const { availableItems, availableCategories, topItems } = useMemo(() => {
    const itemMap = new Map<string, number>();
    const catMap = new Map<string, number>();

    // Also prime from menu items & sections
    menuItems.forEach(m => {
      if (m.name) itemMap.set(m.name, 0);
    });
    menuSections.forEach(s => {
      if (s.name) catMap.set(s.name, 0);
    });

    activeOrdersInWindow.forEach(order => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach(item => {
        if (isDiscountOrNonProductItem(item)) return;
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) return;

        const itemName = (item.name || '').trim();
        if (itemName) {
          itemMap.set(itemName, (itemMap.get(itemName) || 0) + qty);
        }

        const catName = resolveCategoryName(item, menuItems, menuSections);
        if (catName) {
          catMap.set(catName, (catMap.get(catName) || 0) + qty);
        }
      });
    });

    const items = Array.from(itemMap.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

    const categories = Array.from(catMap.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

    const top = items.filter(i => i.qty > 0).slice(0, 8);

    return {
      availableItems: items,
      availableCategories: categories,
      topItems: top
    };
  }, [activeOrdersInWindow, menuItems, menuSections]);

  // Filter items matching the search query
  const filteredItemChoices = useMemo(() => {
    if (!itemSearchQuery.trim()) return availableItems;
    const q = itemSearchQuery.toLowerCase().trim();
    return availableItems.filter(i => i.name.toLowerCase().includes(q));
  }, [availableItems, itemSearchQuery]);

  // Build the day-by-day chronological trend data
  const { trendData, summaryMetrics } = useMemo(() => {
    // Generate chronological array of dates between startDate and endDate
    const dateMap = new Map<string, {
      date: string;
      formattedDate: string;
      dayOfWeek: string;
      totalUnits: number;
      dineInUnits: number;
      takeawayUnits: number;
      deliveryUnits: number;
      studentUnits: number;
      regularUnits: number;
      revenue: number;
    }>();

    const curr = new Date(startDate);
    const last = new Date(endDate);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    while (curr <= last) {
      const dStr = getISTDateString(curr);
      const dObj = new Date(dStr);
      const formatted = `${dObj.getDate()} ${monthNames[dObj.getMonth()]}`;
      const dayOfWeek = dayNames[dObj.getDay()];

      dateMap.set(dStr, {
        date: dStr,
        formattedDate: formatted,
        dayOfWeek,
        totalUnits: 0,
        dineInUnits: 0,
        takeawayUnits: 0,
        deliveryUnits: 0,
        studentUnits: 0,
        regularUnits: 0,
        revenue: 0,
      });
      curr.setDate(curr.getDate() + 1);
    }

    let overallUnits = 0;
    let overallRevenue = 0;
    let overallDineIn = 0;
    let overallTakeaway = 0;
    let overallDelivery = 0;
    let overallStudent = 0;
    let overallRegular = 0;

    activeOrdersInWindow.forEach(order => {
      const orderDateStr = getISTDateString(order.date);
      const dayEntry = dateMap.get(orderDateStr);
      if (!dayEntry) return;

      // Channel Filter check
      if (channelFilter !== 'ALL' && order.type !== channelFilter) {
        return;
      }

      // Segment Filter check
      const isStudent = isOrderFromStudent(order, studentPhoneSet);
      if (segmentFilter === 'STUDENT' && !isStudent) return;
      if (segmentFilter === 'REGULAR' && isStudent) return;

      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach(item => {
        if (isDiscountOrNonProductItem(item)) return;
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) return;

        // Check Target Filter
        if (targetMode === 'item') {
          if (selectedItemName !== 'ALL_ITEMS' && item.name !== selectedItemName) {
            return;
          }
        } else {
          // Category mode
          if (selectedCategoryName !== 'ALL_CATEGORIES') {
            const cat = resolveCategoryName(item, menuItems, menuSections);
            if (cat.toLowerCase() !== selectedCategoryName.toLowerCase()) {
              return;
            }
          }
        }

        const price = Number(item.price) || 0;
        const rev = price * qty;

        dayEntry.totalUnits += qty;
        dayEntry.revenue += rev;

        if (order.type === 'DINE_IN') dayEntry.dineInUnits += qty;
        else if (order.type === 'TAKEAWAY') dayEntry.takeawayUnits += qty;
        else if (order.type === 'DELIVERY') dayEntry.deliveryUnits += qty;

        if (isStudent) dayEntry.studentUnits += qty;
        else dayEntry.regularUnits += qty;

        overallUnits += qty;
        overallRevenue += rev;
        if (order.type === 'DINE_IN') overallDineIn += qty;
        else if (order.type === 'TAKEAWAY') overallTakeaway += qty;
        else if (order.type === 'DELIVERY') overallDelivery += qty;

        if (isStudent) overallStudent += qty;
        else overallRegular += qty;
      });
    });

    const list = Array.from(dateMap.values());
    const totalDays = list.length || 1;
    const avgDailyUnits = overallUnits / totalDays;

    let peakDay: { date: string; formattedDate: string; units: number } = {
      date: '-',
      formattedDate: '-',
      units: 0
    };

    list.forEach(d => {
      if (d.totalUnits > peakDay.units) {
        peakDay = {
          date: d.date,
          formattedDate: `${d.formattedDate} (${d.dayOfWeek})`,
          units: d.totalUnits
        };
      }
    });

    return {
      trendData: list,
      summaryMetrics: {
        totalUnits: overallUnits,
        totalRevenue: overallRevenue,
        avgDailyUnits: parseFloat(avgDailyUnits.toFixed(1)),
        peakDay,
        channelSplit: {
          dineIn: overallDineIn,
          takeaway: overallTakeaway,
          delivery: overallDelivery,
          dineInPct: overallUnits > 0 ? Math.round((overallDineIn / overallUnits) * 100) : 0,
          takeawayPct: overallUnits > 0 ? Math.round((overallTakeaway / overallUnits) * 100) : 0,
          deliveryPct: overallUnits > 0 ? Math.round((overallDelivery / overallUnits) * 100) : 0,
        },
        segmentSplit: {
          student: overallStudent,
          regular: overallRegular,
          studentPct: overallUnits > 0 ? Math.round((overallStudent / overallUnits) * 100) : 0,
          regularPct: overallUnits > 0 ? Math.round((overallRegular / overallUnits) * 100) : 0,
        }
      }
    };
  }, [
    activeOrdersInWindow,
    startDate,
    endDate,
    targetMode,
    selectedItemName,
    selectedCategoryName,
    channelFilter,
    segmentFilter,
    studentPhoneSet,
    menuItems,
    menuSections
  ]);

  // Current title display
  const targetLabel = targetMode === 'item' 
    ? (selectedItemName === 'ALL_ITEMS' ? 'All Menu Items' : selectedItemName)
    : (selectedCategoryName === 'ALL_CATEGORIES' ? 'All Categories' : selectedCategoryName);

  return (
    <div className="bg-white rounded-[3rem] shadow-xl border border-brand-stone p-6 sm:p-10 space-y-8 animate-in fade-in duration-500">
      {/* Header & Title Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-brand-stone">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-yellow/15 border-2 border-brand-yellow/30 flex items-center justify-center text-brand-brown shrink-0 shadow-sm">
            <TrendingUp className="w-6 h-6 text-brand-brown" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-2xl font-black text-brand-brown uppercase italic tracking-tight">
                Units Sold <span className="text-brand-red">Trend Explorer</span>
              </h2>
              <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-brand-yellow/20 text-brand-brown border border-brand-yellow/30">
                Live Velocity
              </span>
              {isLoadingOrders && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-blue-50 text-blue-600 border border-blue-200">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Loading range...
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-brand-brown/50 mt-1">
              Historical units sold trajectory for <span className="text-brand-brown font-black underline decoration-brand-yellow decoration-2">{targetLabel}</span> across selected channel and customer segments.
            </p>
          </div>
        </div>

        {/* Target Mode Toggle: Item vs Category */}
        <div className="flex items-center gap-2 self-start lg:self-auto bg-brand-brown/5 p-1.5 rounded-2xl border border-brand-stone">
          <button
            type="button"
            onClick={() => setTargetMode('item')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              targetMode === 'item'
                ? 'bg-brand-brown text-brand-yellow shadow-md scale-102'
                : 'text-brand-brown/60 hover:text-brand-brown hover:bg-white/60'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>Item Trend</span>
          </button>

          <button
            type="button"
            onClick={() => setTargetMode('category')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              targetMode === 'category'
                ? 'bg-brand-brown text-brand-yellow shadow-md scale-102'
                : 'text-brand-brown/60 hover:text-brand-brown hover:bg-white/60'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Category Trend</span>
          </button>
        </div>
      </div>

      {/* Control Grid: Time Window, Target Selectors, Channels & Segments */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 bg-brand-cream/40 p-5 rounded-3xl border border-brand-stone/60">
        {/* 1. Time Window Selector */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown/60 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-brand-brown" />
            <span>Time Window</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(['today', 'last7', 'last14', 'last30', 'thisMonth', 'custom'] as TimeWindowPreset[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => handlePresetChange(p)}
                className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all cursor-pointer border ${
                  timePreset === p
                    ? 'bg-brand-brown text-brand-yellow border-brand-brown shadow-xs'
                    : 'bg-white text-brand-brown/70 border-brand-stone hover:border-brand-brown/30'
                }`}
              >
                {p === 'today' ? 'Today' : p === 'last7' ? '7D' : p === 'last14' ? '14D' : p === 'last30' ? '30D' : p === 'thisMonth' ? 'This Mo' : 'Custom'}
              </button>
            ))}
          </div>

          {timePreset === 'custom' && (
            <div className="pt-2 flex items-center gap-1.5">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="w-full text-[11px] p-1.5 rounded-lg border border-brand-stone bg-white font-bold text-brand-brown"
              />
              <span className="text-xs font-black text-brand-brown/40">-</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="w-full text-[11px] p-1.5 rounded-lg border border-brand-stone bg-white font-bold text-brand-brown"
              />
              <button
                type="button"
                onClick={handleApplyCustomDates}
                className="px-2.5 py-1.5 bg-brand-yellow text-brand-brown font-black text-[10px] uppercase rounded-lg border border-brand-brown/20 hover:scale-105"
              >
                Set
              </button>
            </div>
          )}

          <div className="text-[9px] font-bold text-brand-brown/40 uppercase tracking-tight">
            {startDate} to {endDate}
          </div>
        </div>

        {/* 2. Target Selector (Item or Category) */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown/60 flex items-center gap-1.5">
            {targetMode === 'item' ? <Utensils className="w-3.5 h-3.5 text-brand-brown" /> : <Layers className="w-3.5 h-3.5 text-brand-brown" />}
            <span>Select {targetMode === 'item' ? 'Menu Item' : 'Category'}</span>
          </label>

          {targetMode === 'item' ? (
            <div className="space-y-1.5">
              <select
                value={selectedItemName}
                onChange={e => setSelectedItemName(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-brand-brown outline-none focus:border-brand-brown transition-all cursor-pointer"
              >
                <option value="ALL_ITEMS">🌟 All Menu Items (Combined)</option>
                {availableItems.map(item => (
                  <option key={item.name} value={item.name}>
                    {item.name} ({item.qty} units)
                  </option>
                ))}
              </select>

              {/* Search item helper */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Quick search item..."
                  value={itemSearchQuery}
                  onChange={e => setItemSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 rounded-lg border border-brand-stone/80 bg-white/90 text-[10px] font-bold placeholder:text-brand-brown/30"
                />
                <Search className="w-3 h-3 absolute left-2 top-2 text-brand-brown/40" />
              </div>

              {itemSearchQuery.trim() && (
                <div className="max-h-24 overflow-y-auto bg-white rounded-lg border border-brand-stone p-1 space-y-0.5">
                  {filteredItemChoices.slice(0, 5).map(i => (
                    <button
                      key={i.name}
                      type="button"
                      onClick={() => {
                        setSelectedItemName(i.name);
                        setItemSearchQuery('');
                      }}
                      className="w-full text-left px-2 py-1 rounded text-[10px] font-bold text-brand-brown hover:bg-brand-yellow/20 flex justify-between"
                    >
                      <span className="truncate">{i.name}</span>
                      <span className="text-brand-brown/40 font-mono">{i.qty}u</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <select
                value={selectedCategoryName}
                onChange={e => setSelectedCategoryName(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-brand-brown outline-none focus:border-brand-brown transition-all cursor-pointer"
              >
                <option value="ALL_CATEGORIES">🌈 All Categories (Combined)</option>
                {availableCategories.map(cat => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name} ({cat.qty} units)
                  </option>
                ))}
              </select>

              <div className="text-[9px] font-bold text-brand-brown/40 uppercase tracking-tight">
                {availableCategories.length} categories active
              </div>
            </div>
          )}
        </div>

        {/* 3. Channel Selector */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown/60 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-brand-brown" />
              <span>Channel Filter</span>
            </span>
            <button
              type="button"
              onClick={() => setCurveMode(prev => prev === 'splitChannel' ? 'unified' : 'splitChannel')}
              className={`text-[8.5px] font-black uppercase tracking-tight px-1.5 py-0.5 rounded cursor-pointer ${
                curveMode === 'splitChannel' ? 'bg-[#3B82F6] text-white' : 'text-blue-600 hover:underline'
              }`}
            >
              {curveMode === 'splitChannel' ? 'Split Active' : 'Split Curves'}
            </button>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setChannelFilter('ALL');
                if (curveMode === 'splitChannel') setCurveMode('unified');
              }}
              className={`px-2.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border cursor-pointer ${
                channelFilter === 'ALL' && curveMode !== 'splitChannel'
                  ? 'bg-brand-brown text-brand-yellow border-brand-brown shadow-xs'
                  : 'bg-white text-brand-brown/70 border-brand-stone hover:border-brand-brown/30'
              }`}
            >
              All Channels
            </button>

            <button
              type="button"
              onClick={() => setChannelFilter('DINE_IN')}
              className={`px-2.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border cursor-pointer flex items-center justify-center gap-1 ${
                channelFilter === 'DINE_IN'
                  ? 'bg-[#10B981] text-white border-[#10B981] shadow-xs'
                  : 'bg-white text-emerald-800 border-brand-stone hover:border-emerald-500/40'
              }`}
            >
              <Utensils className="w-3 h-3" />
              Dine In
            </button>

            <button
              type="button"
              onClick={() => setChannelFilter('TAKEAWAY')}
              className={`px-2.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border cursor-pointer flex items-center justify-center gap-1 ${
                channelFilter === 'TAKEAWAY'
                  ? 'bg-[#3B82F6] text-white border-[#3B82F6] shadow-xs'
                  : 'bg-white text-blue-800 border-brand-stone hover:border-blue-500/40'
              }`}
            >
              <ShoppingBag className="w-3 h-3" />
              Takeaway
            </button>

            <button
              type="button"
              onClick={() => setChannelFilter('DELIVERY')}
              className={`px-2.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border cursor-pointer flex items-center justify-center gap-1 ${
                channelFilter === 'DELIVERY'
                  ? 'bg-[#E11D48] text-white border-[#E11D48] shadow-xs'
                  : 'bg-white text-rose-800 border-brand-stone hover:border-rose-500/40'
              }`}
            >
              <Truck className="w-3 h-3" />
              Delivery
            </button>
          </div>
        </div>

        {/* 4. Segment Selector */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown/60 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-brand-brown" />
              <span>Segment Filter</span>
            </span>
            <button
              type="button"
              onClick={() => setCurveMode(prev => prev === 'splitSegment' ? 'unified' : 'splitSegment')}
              className={`text-[8.5px] font-black uppercase tracking-tight px-1.5 py-0.5 rounded cursor-pointer ${
                curveMode === 'splitSegment' ? 'bg-[#8B5CF6] text-white' : 'text-purple-600 hover:underline'
              }`}
            >
              {curveMode === 'splitSegment' ? 'Split Active' : 'Split Curves'}
            </button>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSegmentFilter('ALL');
                if (curveMode === 'splitSegment') setCurveMode('unified');
              }}
              className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border cursor-pointer ${
                segmentFilter === 'ALL' && curveMode !== 'splitSegment'
                  ? 'bg-brand-brown text-brand-yellow border-brand-brown shadow-xs'
                  : 'bg-white text-brand-brown/70 border-brand-stone hover:border-brand-brown/30'
              }`}
            >
              All Segments
            </button>

            <button
              type="button"
              onClick={() => setSegmentFilter('STUDENT')}
              className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border cursor-pointer ${
                segmentFilter === 'STUDENT'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                  : 'bg-white text-purple-700 border-brand-stone hover:border-purple-400'
              }`}
            >
              Student
            </button>

            <button
              type="button"
              onClick={() => setSegmentFilter('REGULAR')}
              className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border cursor-pointer ${
                segmentFilter === 'REGULAR'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white text-amber-800 border-brand-stone hover:border-amber-400'
              }`}
            >
              Regular
            </button>
          </div>

          <div className="text-[9px] font-bold text-brand-brown/40 uppercase tracking-tight flex items-center gap-1">
            <span>Student Share:</span>
            <span className="text-purple-600 font-black">{summaryMetrics.segmentSplit.studentPct}%</span>
            <span>• Regular:</span>
            <span className="text-amber-600 font-black">{summaryMetrics.segmentSplit.regularPct}%</span>
          </div>
        </div>
      </div>

      {/* Quick Access Chips for Top Selling Items or Popular Categories */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[9px] font-black uppercase tracking-wider text-brand-brown/40 flex items-center gap-1 mr-1">
          <Flame className="w-3 h-3 text-brand-red" />
          <span>Quick Select:</span>
        </span>

        {targetMode === 'item' ? (
          <>
            <button
              type="button"
              onClick={() => setSelectedItemName('ALL_ITEMS')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight border transition-all cursor-pointer ${
                selectedItemName === 'ALL_ITEMS'
                  ? 'bg-brand-brown text-brand-yellow border-brand-brown shadow-xs'
                  : 'bg-white text-brand-brown/70 border-brand-stone hover:bg-brand-yellow/10'
              }`}
            >
              🌟 All Items
            </button>
            {topItems.map(item => (
              <button
                key={item.name}
                type="button"
                onClick={() => setSelectedItemName(item.name)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight border transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedItemName === item.name
                    ? 'bg-brand-brown text-brand-yellow border-brand-brown shadow-xs scale-105'
                    : 'bg-white text-brand-brown/70 border-brand-stone hover:bg-brand-yellow/10'
                }`}
              >
                <span>{item.name}</span>
                <span className="text-[9px] opacity-60 font-mono">({item.qty}u)</span>
              </button>
            ))}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSelectedCategoryName('ALL_CATEGORIES')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight border transition-all cursor-pointer ${
                selectedCategoryName === 'ALL_CATEGORIES'
                  ? 'bg-brand-brown text-brand-yellow border-brand-brown shadow-xs'
                  : 'bg-white text-brand-brown/70 border-brand-stone hover:bg-brand-yellow/10'
              }`}
            >
              🌈 All Categories
            </button>
            {availableCategories.slice(0, 7).map(cat => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setSelectedCategoryName(cat.name)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight border transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedCategoryName === cat.name
                    ? 'bg-brand-brown text-brand-yellow border-brand-brown shadow-xs scale-105'
                    : 'bg-white text-brand-brown/70 border-brand-stone hover:bg-brand-yellow/10'
                }`}
              >
                <span>{cat.name}</span>
                <span className="text-[9px] opacity-60 font-mono">({cat.qty}u)</span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Summary KPI Cards for Selected Entity */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Units */}
        <div className="bg-brand-brown text-white p-4 rounded-2xl border border-brand-brown/20 shadow-md">
          <div className="flex items-center justify-between text-white/50 text-[9px] font-black uppercase tracking-wider mb-1">
            <span>Total Units Sold</span>
            <Activity className="w-3 h-3 text-brand-yellow" />
          </div>
          <div className="text-2xl font-black text-brand-yellow font-mono">
            {summaryMetrics.totalUnits.toLocaleString()}
          </div>
          <p className="text-[9px] text-white/40 mt-1 uppercase font-bold">In selected window</p>
        </div>

        {/* Avg Run Rate / Day */}
        <div className="bg-white p-4 rounded-2xl border border-brand-stone shadow-sm">
          <div className="flex items-center justify-between text-brand-brown/40 text-[9px] font-black uppercase tracking-wider mb-1">
            <span>Run Rate / Day</span>
            <Clock className="w-3 h-3 text-brand-brown" />
          </div>
          <div className="text-2xl font-black text-brand-brown font-mono">
            {summaryMetrics.avgDailyUnits}
          </div>
          <p className="text-[9px] text-brand-brown/40 mt-1 uppercase font-bold">Avg units per day</p>
        </div>

        {/* Peak Selling Day */}
        <div className="bg-white p-4 rounded-2xl border border-brand-stone shadow-sm">
          <div className="flex items-center justify-between text-brand-brown/40 text-[9px] font-black uppercase tracking-wider mb-1">
            <span>Peak Day</span>
            <Award className="w-3 h-3 text-amber-500" />
          </div>
          <div className="text-lg font-black text-brand-brown truncate">
            {summaryMetrics.peakDay.units > 0 ? `${summaryMetrics.peakDay.units} units` : '0 units'}
          </div>
          <p className="text-[9px] text-brand-brown/40 mt-1 uppercase font-bold truncate">
            {summaryMetrics.peakDay.formattedDate}
          </p>
        </div>

        {/* Revenue Generated */}
        <div className="bg-white p-4 rounded-2xl border border-brand-stone shadow-sm">
          <div className="flex items-center justify-between text-brand-brown/40 text-[9px] font-black uppercase tracking-wider mb-1">
            <span>Gross Sales</span>
            <ArrowUpRight className="w-3 h-3 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600 font-mono">
            ₹{Math.round(summaryMetrics.totalRevenue).toLocaleString()}
          </div>
          <p className="text-[9px] text-brand-brown/40 mt-1 uppercase font-bold">Period revenue</p>
        </div>

        {/* Channel Volume Breakdown */}
        <div className="bg-white p-4 rounded-2xl border border-brand-stone shadow-sm">
          <div className="flex items-center justify-between text-brand-brown/40 text-[9px] font-black uppercase tracking-wider mb-1">
            <span>Channel Split</span>
            <ShoppingBag className="w-3 h-3 text-blue-500" />
          </div>
          <div className="text-xs font-black text-brand-brown space-y-0.5">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-emerald-700">Dine:</span>
              <span className="font-mono">{summaryMetrics.channelSplit.dineInPct}% ({summaryMetrics.channelSplit.dineIn}u)</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-blue-700">Take:</span>
              <span className="font-mono">{summaryMetrics.channelSplit.takeawayPct}% ({summaryMetrics.channelSplit.takeaway}u)</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-rose-700">Delv:</span>
              <span className="font-mono">{summaryMetrics.channelSplit.deliveryPct}% ({summaryMetrics.channelSplit.delivery}u)</span>
            </div>
          </div>
        </div>

        {/* Segment Volume Breakdown */}
        <div className="bg-white p-4 rounded-2xl border border-brand-stone shadow-sm">
          <div className="flex items-center justify-between text-brand-brown/40 text-[9px] font-black uppercase tracking-wider mb-1">
            <span>Segment Split</span>
            <Users className="w-3 h-3 text-purple-500" />
          </div>
          <div className="text-xs font-black text-brand-brown space-y-0.5">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-purple-700">Student:</span>
              <span className="font-mono">{summaryMetrics.segmentSplit.studentPct}% ({summaryMetrics.segmentSplit.student}u)</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-amber-700">Regular:</span>
              <span className="font-mono">{summaryMetrics.segmentSplit.regularPct}% ({summaryMetrics.segmentSplit.regular}u)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Trend Chart Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-black text-brand-brown uppercase italic tracking-tight">
            Volume Trajectory Over Time
          </h3>
          <span className="text-[10px] font-bold text-brand-brown/40 uppercase">
            ({trendData.length} Days)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Chart Type Selector */}
          <div className="flex items-center bg-brand-brown/5 p-1 rounded-xl border border-brand-stone text-[10px] font-black uppercase">
            <button
              type="button"
              onClick={() => setChartType('area')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                chartType === 'area' ? 'bg-brand-brown text-brand-yellow shadow-xs' : 'text-brand-brown/50 hover:text-brand-brown'
              }`}
            >
              Area
            </button>
            <button
              type="button"
              onClick={() => setChartType('line')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                chartType === 'line' ? 'bg-brand-brown text-brand-yellow shadow-xs' : 'text-brand-brown/50 hover:text-brand-brown'
              }`}
            >
              Line
            </button>
            <button
              type="button"
              onClick={() => setChartType('bar')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                chartType === 'bar' ? 'bg-brand-brown text-brand-yellow shadow-xs' : 'text-brand-brown/50 hover:text-brand-brown'
              }`}
            >
              Bar
            </button>
          </div>

          {/* Curve Splitting Options */}
          <div className="flex items-center bg-brand-brown/5 p-1 rounded-xl border border-brand-stone text-[10px] font-black uppercase">
            <button
              type="button"
              onClick={() => setCurveMode('unified')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                curveMode === 'unified' ? 'bg-brand-brown text-brand-yellow shadow-xs' : 'text-brand-brown/50 hover:text-brand-brown'
              }`}
            >
              Total
            </button>
            <button
              type="button"
              onClick={() => setCurveMode('splitChannel')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                curveMode === 'splitChannel' ? 'bg-brand-brown text-brand-yellow shadow-xs' : 'text-brand-brown/50 hover:text-brand-brown'
              }`}
            >
              Channels
            </button>
            <button
              type="button"
              onClick={() => setCurveMode('splitSegment')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                curveMode === 'splitSegment' ? 'bg-brand-brown text-brand-yellow shadow-xs' : 'text-brand-brown/50 hover:text-brand-brown'
              }`}
            >
              Segments
            </button>
          </div>

          {/* Toggle Table Breakdown */}
          <button
            type="button"
            onClick={() => setShowTableBreakdown(!showTableBreakdown)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border cursor-pointer transition-all ${
              showTableBreakdown
                ? 'bg-brand-brown text-brand-yellow border-brand-brown'
                : 'bg-white text-brand-brown/70 border-brand-stone hover:border-brand-brown/30'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>{showTableBreakdown ? 'Hide Table' : 'Show Daily Table'}</span>
          </button>
        </div>
      </div>

      {/* Main Responsive Trend Chart */}
      <div className="h-[380px] w-full min-w-0 bg-brand-cream/20 p-4 rounded-3xl border border-brand-stone/60">
        {summaryMetrics.totalUnits > 0 || trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
            {chartType === 'bar' ? (
              <BarChart data={trendData} margin={{ top: 20, right: 20, left: 0, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="formattedDate" 
                  tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 800 }}
                  interval={trendData.length > 20 ? Math.ceil(trendData.length / 10) : 0}
                />
                <YAxis 
                  domain={[0, 'auto']} 
                  allowDecimals={false} 
                  tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 900 }} 
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1A1817', 
                    border: 'none', 
                    borderRadius: '1rem',
                    color: '#fff',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)'
                  }}
                  itemStyle={{ color: '#fff', fontSize: '11px', fontWeight: 900 }}
                  labelStyle={{ color: '#F59E0B', fontWeight: 900, marginBottom: '4px' }}
                />
                <Legend verticalAlign="top" align="right" iconType="circle" />
                
                {curveMode === 'unified' && (
                  <Bar 
                    dataKey="totalUnits" 
                    name="Units Sold" 
                    fill="#F59E0B" 
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false} 
                  />
                )}

                {curveMode === 'splitChannel' && (
                  <>
                    <Bar dataKey="dineInUnits" name="Dine In" stackId="a" fill="#10B981" isAnimationActive={false} />
                    <Bar dataKey="takeawayUnits" name="Takeaway" stackId="a" fill="#3B82F6" isAnimationActive={false} />
                    <Bar dataKey="deliveryUnits" name="Delivery" stackId="a" fill="#E11D48" isAnimationActive={false} />
                  </>
                )}

                {curveMode === 'splitSegment' && (
                  <>
                    <Bar dataKey="studentUnits" name="Student" stackId="s" fill="#8B5CF6" isAnimationActive={false} />
                    <Bar dataKey="regularUnits" name="Regular" stackId="s" fill="#F59E0B" isAnimationActive={false} />
                  </>
                )}
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={trendData} margin={{ top: 20, right: 20, left: 0, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="formattedDate" 
                  tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 800 }}
                  interval={trendData.length > 20 ? Math.ceil(trendData.length / 10) : 0}
                />
                <YAxis 
                  domain={[0, 'auto']} 
                  allowDecimals={false} 
                  tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 900 }} 
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1A1817', 
                    border: 'none', 
                    borderRadius: '1rem',
                    color: '#fff',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)'
                  }}
                  itemStyle={{ color: '#fff', fontSize: '11px', fontWeight: 900 }}
                  labelStyle={{ color: '#F59E0B', fontWeight: 900, marginBottom: '4px' }}
                />
                <Legend verticalAlign="top" align="right" iconType="circle" />
                
                {curveMode === 'unified' && (
                  <Line 
                    type="monotone" 
                    dataKey="totalUnits" 
                    name="Units Sold" 
                    stroke="#D97706" 
                    strokeWidth={3}
                    dot={{ fill: '#F59E0B', r: 4 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false} 
                  />
                )}

                {curveMode === 'splitChannel' && (
                  <>
                    <Line type="monotone" dataKey="dineInUnits" name="Dine In" stroke="#10B981" strokeWidth={2.5} dot={{ fill: '#10B981', r: 3 }} isAnimationActive={false} />
                    <Line type="monotone" dataKey="takeawayUnits" name="Takeaway" stroke="#3B82F6" strokeWidth={2.5} dot={{ fill: '#3B82F6', r: 3 }} isAnimationActive={false} />
                    <Line type="monotone" dataKey="deliveryUnits" name="Delivery" stroke="#E11D48" strokeWidth={2.5} dot={{ fill: '#E11D48', r: 3 }} isAnimationActive={false} />
                  </>
                )}

                {curveMode === 'splitSegment' && (
                  <>
                    <Line type="monotone" dataKey="studentUnits" name="Student Segment" stroke="#8B5CF6" strokeWidth={2.5} dot={{ fill: '#8B5CF6', r: 3 }} isAnimationActive={false} />
                    <Line type="monotone" dataKey="regularUnits" name="Regular Customers" stroke="#F59E0B" strokeWidth={2.5} dot={{ fill: '#F59E0B', r: 3 }} isAnimationActive={false} />
                  </>
                )}
              </LineChart>
            ) : (
              <AreaChart data={trendData} margin={{ top: 20, right: 20, left: 0, bottom: 25 }}>
                <defs>
                  <linearGradient id="colorTotalUnits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.05}/>
                  </linearGradient>
                  <linearGradient id="colorDine" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.05}/>
                  </linearGradient>
                  <linearGradient id="colorTake" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05}/>
                  </linearGradient>
                  <linearGradient id="colorDelv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E11D48" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#E11D48" stopOpacity={0.05}/>
                  </linearGradient>
                  <linearGradient id="colorStudent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.05}/>
                  </linearGradient>
                  <linearGradient id="colorRegular" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="formattedDate" 
                  tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 800 }}
                  interval={trendData.length > 20 ? Math.ceil(trendData.length / 10) : 0}
                />
                <YAxis 
                  domain={[0, 'auto']} 
                  allowDecimals={false} 
                  tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 900 }} 
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1A1817', 
                    border: 'none', 
                    borderRadius: '1rem',
                    color: '#fff',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)'
                  }}
                  itemStyle={{ color: '#fff', fontSize: '11px', fontWeight: 900 }}
                  labelStyle={{ color: '#F59E0B', fontWeight: 900, marginBottom: '4px' }}
                />
                <Legend verticalAlign="top" align="right" iconType="circle" />
                
                {curveMode === 'unified' && (
                  <Area 
                    type="monotone" 
                    dataKey="totalUnits" 
                    name="Units Sold" 
                    stroke="#D97706" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#colorTotalUnits)" 
                    isAnimationActive={false} 
                  />
                )}

                {curveMode === 'splitChannel' && (
                  <>
                    <Area type="monotone" dataKey="dineInUnits" name="Dine In" stroke="#10B981" strokeWidth={2} fillOpacity={0.6} fill="url(#colorDine)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="takeawayUnits" name="Takeaway" stroke="#3B82F6" strokeWidth={2} fillOpacity={0.6} fill="url(#colorTake)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="deliveryUnits" name="Delivery" stroke="#E11D48" strokeWidth={2} fillOpacity={0.6} fill="url(#colorDelv)" isAnimationActive={false} />
                  </>
                )}

                {curveMode === 'splitSegment' && (
                  <>
                    <Area type="monotone" dataKey="studentUnits" name="Student Segment" stroke="#8B5CF6" strokeWidth={2} fillOpacity={0.6} fill="url(#colorStudent)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="regularUnits" name="Regular Segment" stroke="#F59E0B" strokeWidth={2} fillOpacity={0.6} fill="url(#colorRegular)" isAnimationActive={false} />
                  </>
                )}
              </AreaChart>
            )}
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <p className="text-sm font-black text-brand-brown/40 uppercase tracking-widest">
              No unit sales recorded for {targetLabel} in this time window
            </p>
            <p className="text-xs font-bold text-brand-brown/30 mt-1">
              Try choosing a broader time window or selecting "All Menu Items"
            </p>
          </div>
        )}
      </div>

      {/* Daily Breakdown Table (Expandable) */}
      {showTableBreakdown && (
        <div className="overflow-hidden rounded-2xl border border-brand-stone bg-white shadow-sm animate-in fade-in duration-300">
          <div className="bg-brand-brown/5 px-6 py-4 flex items-center justify-between border-b border-brand-stone">
            <div>
              <h4 className="text-xs font-black uppercase text-brand-brown tracking-wider">
                Daily Granular Breakdown: {targetLabel}
              </h4>
              <p className="text-[10px] text-brand-brown/50 font-bold">
                Detailed units sold split by channel and customer segment day-by-day
              </p>
            </div>
            <span className="text-[10px] font-black uppercase bg-white px-2.5 py-1 rounded-lg border border-brand-stone text-brand-brown">
              {trendData.length} records
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto no-scrollbar">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-brand-cream/60 text-[9px] uppercase font-black text-brand-brown/60 tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-center">Total Units</th>
                  <th className="px-4 py-3 text-center text-emerald-700">Dine In</th>
                  <th className="px-4 py-3 text-center text-blue-700">Takeaway</th>
                  <th className="px-4 py-3 text-center text-rose-700">Delivery</th>
                  <th className="px-4 py-3 text-center text-purple-700">Student</th>
                  <th className="px-4 py-3 text-center text-amber-700">Regular</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-stone/60 font-bold text-brand-brown">
                {trendData.map(day => (
                  <tr key={day.date} className="hover:bg-brand-cream/40 transition-colors">
                    <td className="px-4 py-2.5 font-black">
                      {day.formattedDate} <span className="text-[10px] text-brand-brown/40 font-mono">({day.dayOfWeek})</span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-black">
                      <span className={`px-2 py-0.5 rounded-md ${day.totalUnits > summaryMetrics.avgDailyUnits ? 'bg-amber-100 text-amber-900' : 'text-brand-brown/70'}`}>
                        {day.totalUnits}u
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-emerald-800">{day.dineInUnits}</td>
                    <td className="px-4 py-2.5 text-center text-blue-800">{day.takeawayUnits}</td>
                    <td className="px-4 py-2.5 text-center text-rose-800">{day.deliveryUnits}</td>
                    <td className="px-4 py-2.5 text-center text-purple-800">{day.studentUnits}</td>
                    <td className="px-4 py-2.5 text-center text-amber-800">{day.regularUnits}</td>
                    <td className="px-4 py-2.5 text-right font-black font-mono">₹{Math.round(day.revenue).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
