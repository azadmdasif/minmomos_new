import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  Legend
} from 'recharts';
import {
  BarChart2,
  DollarSign,
  ShoppingBag,
  Layers,
  ChevronDown,
  ChevronUp,
  Plus,
  RotateCcw,
  CheckSquare,
  Trash2,
  X,
  SlidersHorizontal,
  Check
} from 'lucide-react';
import { CompletedOrder, OrderType } from '../types';

interface OrderValueHistogramProps {
  orders: CompletedOrder[];
  title?: string;
}

export type HistogramMetric = 'orders' | 'revenue' | 'comparison';
export type ChannelFilter = 'ALL' | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

export interface BucketDefinition {
  id: string;
  label: string;
  min: number;
  max: number; // Infinity for open-ended e.g. 500+
  isCustom?: boolean;
}

// Present default 9 ranges
const DEFAULT_ORDER_VALUE_BUCKETS: BucketDefinition[] = [
  { id: 'b0_50', label: '₹0 - 50', min: 0, max: 50 },
  { id: 'b50_100', label: '₹50 - 100', min: 50, max: 100 },
  { id: 'b100_150', label: '₹100 - 150', min: 100, max: 150 },
  { id: 'b150_200', label: '₹150 - 200', min: 150, max: 200 },
  { id: 'b200_250', label: '₹200 - 250', min: 200, max: 250 },
  { id: 'b250_300', label: '₹250 - 300', min: 250, max: 300 },
  { id: 'b300_400', label: '₹300 - 400', min: 300, max: 400 },
  { id: 'b400_500', label: '₹400 - 500', min: 400, max: 500 },
  { id: 'b500_plus', label: '₹500+', min: 500, max: Infinity }
];

const STORAGE_KEY_RANGES = 'MOMOMAYA_ORDER_VALUE_CUSTOM_RANGES_V1';
const STORAGE_KEY_SELECTED = 'MOMOMAYA_ORDER_VALUE_SELECTED_RANGES_V1';

export const OrderValueHistogram: React.FC<OrderValueHistogramProps> = ({
  orders,
  title = 'Order Ticket Size & Value Distribution'
}) => {
  // Toggle between 'orders' (number of orders), 'revenue' (rupees), or 'comparison' (% share)
  const [metric, setMetric] = useState<HistogramMetric>('orders');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('ALL');
  const [showTable, setShowTable] = useState<boolean>(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);

  // Range definitions state (defaults or loaded from local storage)
  const [buckets, setBuckets] = useState<BucketDefinition[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RANGES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // ensure Infinity is reconstructed properly from JSON
          return parsed.map((b: any) => ({
            ...b,
            max: b.max === null || b.max === 'Infinity' ? Infinity : Number(b.max)
          }));
        }
      }
    } catch (e) {
      console.warn('Could not load custom order value ranges:', e);
    }
    return DEFAULT_ORDER_VALUE_BUCKETS;
  });

  // Selected range IDs for dynamic filtering
  const [selectedBucketIds, setSelectedBucketIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SELECTED);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not load selected ranges:', e);
    }
    return DEFAULT_ORDER_VALUE_BUCKETS.map(b => b.id);
  });

  // Save changes to localStorage
  useEffect(() => {
    try {
      const toSave = buckets.map(b => ({
        ...b,
        max: b.max === Infinity ? 'Infinity' : b.max
      }));
      localStorage.setItem(STORAGE_KEY_RANGES, JSON.stringify(toSave));
    } catch (e) {
      console.warn('Failed to save order value ranges:', e);
    }
  }, [buckets]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SELECTED, JSON.stringify(selectedBucketIds));
    } catch (e) {
      console.warn('Failed to save selected range IDs:', e);
    }
  }, [selectedBucketIds]);

  // Form states for "Add New Range"
  const [newRangeMin, setNewRangeMin] = useState<string>('');
  const [newRangeMax, setNewRangeMax] = useState<string>('');
  const [newRangeNoLimit, setNewRangeNoLimit] = useState<boolean>(false);
  const [newRangeCustomLabel, setNewRangeCustomLabel] = useState<string>('');
  const [addRangeError, setAddRangeError] = useState<string>('');

  // Auto-generate suggested label for new range
  useEffect(() => {
    if (newRangeMin !== '') {
      if (newRangeNoLimit) {
        setNewRangeCustomLabel(`₹${newRangeMin}+`);
      } else if (newRangeMax !== '') {
        setNewRangeCustomLabel(`₹${newRangeMin} - ${newRangeMax}`);
      }
    }
  }, [newRangeMin, newRangeMax, newRangeNoLimit]);

  // Filter orders by channel if selected
  const filteredOrders = useMemo(() => {
    if (channelFilter === 'ALL') return orders;
    return orders.filter(o => {
      const type = (o.type || '').toUpperCase();
      return type === channelFilter;
    });
  }, [orders, channelFilter]);

  // Active buckets: only buckets that the user has selected
  const activeBuckets = useMemo(() => {
    const selectedSet = new Set(selectedBucketIds);
    // Return selected buckets sorted by min value ascending
    return buckets
      .filter(b => selectedSet.has(b.id))
      .sort((a, b) => a.min - b.min);
  }, [buckets, selectedBucketIds]);

  // Aggregate bucket calculations
  const { chartData, totals, peakOrdersBucket, peakRevenueBucket } = useMemo(() => {
    const bucketStats = activeBuckets.map(b => ({
      ...b,
      orderCount: 0,
      totalRevenue: 0,
      dineInCount: 0,
      dineInRevenue: 0,
      takeawayCount: 0,
      takeawayRevenue: 0,
      deliveryCount: 0,
      deliveryRevenue: 0
    }));

    let totalSelectedOrders = 0;
    let totalSelectedRevenue = 0;
    let allOrdersCount = filteredOrders.length;
    let allOrdersRevenue = 0;

    filteredOrders.forEach(order => {
      // Determine actual monetary value (handling delivery manual totals)
      const val = order.type === 'DELIVERY' && order.manualTotal != null
        ? Number(order.manualTotal)
        : Number(order.total || 0);

      const effectiveVal = Math.max(0, val);
      allOrdersRevenue += effectiveVal;

      // Find matching range in active buckets
      const bucket = bucketStats.find(b => effectiveVal >= b.min && effectiveVal < b.max);
      if (bucket) {
        bucket.orderCount += 1;
        bucket.totalRevenue += effectiveVal;
        totalSelectedOrders += 1;
        totalSelectedRevenue += effectiveVal;

        const type = (order.type || '').toUpperCase() as OrderType;
        if (type === 'DINE_IN') {
          bucket.dineInCount += 1;
          bucket.dineInRevenue += effectiveVal;
        } else if (type === 'TAKEAWAY') {
          bucket.takeawayCount += 1;
          bucket.takeawayRevenue += effectiveVal;
        } else if (type === 'DELIVERY') {
          bucket.deliveryCount += 1;
          bucket.deliveryRevenue += effectiveVal;
        }
      }
    });

    const data = bucketStats.map(b => {
      const orderShare = totalSelectedOrders > 0 ? (b.orderCount / totalSelectedOrders) * 100 : 0;
      const revenueShare = totalSelectedRevenue > 0 ? (b.totalRevenue / totalSelectedRevenue) * 100 : 0;
      const overallOrderShare = allOrdersCount > 0 ? (b.orderCount / allOrdersCount) * 100 : 0;
      const overallRevenueShare = allOrdersRevenue > 0 ? (b.totalRevenue / allOrdersRevenue) * 100 : 0;
      const avgOrderValue = b.orderCount > 0 ? Math.round(b.totalRevenue / b.orderCount) : 0;

      return {
        id: b.id,
        range: b.label,
        orderCount: b.orderCount,
        totalRevenue: Math.round(b.totalRevenue),
        orderShare: parseFloat(orderShare.toFixed(1)),
        revenueShare: parseFloat(revenueShare.toFixed(1)),
        overallOrderShare: parseFloat(overallOrderShare.toFixed(1)),
        overallRevenueShare: parseFloat(overallRevenueShare.toFixed(1)),
        avgOrderValue,
        dineInCount: b.dineInCount,
        dineInRevenue: Math.round(b.dineInRevenue),
        takeawayCount: b.takeawayCount,
        takeawayRevenue: Math.round(b.takeawayRevenue),
        deliveryCount: b.deliveryCount,
        deliveryRevenue: Math.round(b.deliveryRevenue)
      };
    });

    const peakOrders = [...data].sort((a, b) => b.orderCount - a.orderCount)[0];
    const peakRevenue = [...data].sort((a, b) => b.totalRevenue - a.totalRevenue)[0];
    const aov = totalSelectedOrders > 0 ? Math.round(totalSelectedRevenue / totalSelectedOrders) : 0;

    return {
      chartData: data,
      totals: {
        totalOrders: totalSelectedOrders,
        totalRevenue: Math.round(totalSelectedRevenue),
        aov,
        allOrdersCount,
        allOrdersRevenue: Math.round(allOrdersRevenue)
      },
      peakOrdersBucket: peakOrders && peakOrders.orderCount > 0 ? peakOrders : null,
      peakRevenueBucket: peakRevenue && peakRevenue.totalRevenue > 0 ? peakRevenue : null
    };
  }, [activeBuckets, filteredOrders]);

  // Range Selection Toggles
  const toggleBucket = (id: string) => {
    setSelectedBucketIds(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter(bId => bId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleSelectAll = () => {
    setSelectedBucketIds(buckets.map(b => b.id));
  };

  const handleResetToDefault = () => {
    setBuckets(DEFAULT_ORDER_VALUE_BUCKETS);
    setSelectedBucketIds(DEFAULT_ORDER_VALUE_BUCKETS.map(b => b.id));
  };

  const handleDeleteBucket = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (buckets.length <= 1) return;
    setBuckets(prev => prev.filter(b => b.id !== id));
    setSelectedBucketIds(prev => prev.filter(bId => bId !== id));
  };

  // Add new range submission
  const handleAddNewRange = (e: React.FormEvent) => {
    e.preventDefault();
    setAddRangeError('');

    const minVal = parseFloat(newRangeMin);
    if (isNaN(minVal) || minVal < 0) {
      setAddRangeError('Please enter a valid non-negative minimum value (e.g. 500).');
      return;
    }

    let maxVal = Infinity;
    if (!newRangeNoLimit) {
      const parsedMax = parseFloat(newRangeMax);
      if (isNaN(parsedMax)) {
        setAddRangeError('Please enter a valid maximum value or check "No upper limit".');
        return;
      }
      if (parsedMax <= minVal) {
        setAddRangeError(`Maximum value (₹${parsedMax}) must be greater than minimum value (₹${minVal}).`);
        return;
      }
      maxVal = parsedMax;
    }

    const label = newRangeCustomLabel.trim() || (newRangeNoLimit ? `₹${minVal}+` : `₹${minVal} - ${maxVal}`);

    // Generate unique ID
    const newId = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newBucket: BucketDefinition = {
      id: newId,
      label,
      min: minVal,
      max: maxVal,
      isCustom: true
    };

    const updated = [...buckets, newBucket].sort((a, b) => a.min - b.min);
    setBuckets(updated);
    setSelectedBucketIds(prev => [...prev, newId]);

    // Reset and close form
    setNewRangeMin('');
    setNewRangeMax('');
    setNewRangeNoLimit(false);
    setNewRangeCustomLabel('');
    setIsAddModalOpen(false);
  };

  // Custom label renderers to display both count/revenue AND percentage above bars
  const renderSingleBarLabel = (props: any) => {
    const { x, y, width, index, payload } = props;
    const d = payload || chartData[index];
    if (!d) return null;

    const centerX = Number(x) + Number(width) / 2;
    const topY = Number(y);

    if (metric === 'orders') {
      if (!d.orderCount || d.orderCount <= 0) return null;
      const countStr = d.orderCount.toLocaleString();
      const pctStr = `(${d.orderShare}%)`;

      return (
        <text
          x={centerX}
          y={topY}
          textAnchor="middle"
          className="select-none pointer-events-none"
        >
          <tspan x={centerX} dy="-14" fill="#EF4444" fontSize={11} fontWeight={900}>
            {countStr}
          </tspan>
          <tspan x={centerX} dy="12" fill="#B91C1C" fontSize={9} fontWeight={800}>
            {pctStr}
          </tspan>
        </text>
      );
    } else {
      if (!d.totalRevenue || d.totalRevenue <= 0) return null;
      const revStr = d.totalRevenue >= 1000 ? `₹${(d.totalRevenue / 1000).toFixed(1)}k` : `₹${d.totalRevenue.toLocaleString()}`;
      const pctStr = `(${d.revenueShare}%)`;

      return (
        <text
          x={centerX}
          y={topY}
          textAnchor="middle"
          className="select-none pointer-events-none"
        >
          <tspan x={centerX} dy="-14" fill="#3C2A21" fontSize={11} fontWeight={900}>
            {revStr}
          </tspan>
          <tspan x={centerX} dy="12" fill="#B45309" fontSize={9} fontWeight={800}>
            {pctStr}
          </tspan>
        </text>
      );
    }
  };

  const renderComparisonOrderLabel = (props: any) => {
    const { x, y, width, index, payload } = props;
    const d = payload || chartData[index];
    if (!d || !d.orderCount || d.orderCount <= 0) return null;
    const centerX = Number(x) + Number(width) / 2;
    const topY = Number(y);
    return (
      <text x={centerX} y={topY} textAnchor="middle" className="select-none pointer-events-none">
        <tspan x={centerX} dy="-13" fill="#EF4444" fontSize={10} fontWeight={900}>
          {d.orderShare}%
        </tspan>
        <tspan x={centerX} dy="11" fill="#991B1B" fontSize={8} fontWeight={800}>
          ({d.orderCount})
        </tspan>
      </text>
    );
  };

  const renderComparisonRevenueLabel = (props: any) => {
    const { x, y, width, index, payload } = props;
    const d = payload || chartData[index];
    if (!d || !d.totalRevenue || d.totalRevenue <= 0) return null;
    const centerX = Number(x) + Number(width) / 2;
    const topY = Number(y);
    const revShort = d.totalRevenue >= 1000 ? `₹${(d.totalRevenue / 1000).toFixed(1)}k` : `₹${d.totalRevenue.toLocaleString()}`;
    return (
      <text x={centerX} y={topY} textAnchor="middle" className="select-none pointer-events-none">
        <tspan x={centerX} dy="-13" fill="#3C2A21" fontSize={10} fontWeight={900}>
          {d.revenueShare}%
        </tspan>
        <tspan x={centerX} dy="11" fill="#78350F" fontSize={8} fontWeight={800}>
          ({revShort})
        </tspan>
      </text>
    );
  };

  return (
    <div className="bg-white p-6 lg:p-10 rounded-[2.5rem] lg:rounded-[3rem] shadow-xl border border-brand-stone mb-10 overflow-hidden transition-all duration-300">
      {/* Header section with Titles & Master Toggle */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-brown/5 flex items-center justify-center text-brand-brown">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl lg:text-2xl font-black text-brand-brown uppercase italic leading-none">
                {title ? (
                  <span>{title}</span>
                ) : (
                  <>ORDER VALUE <span className="text-brand-red">HISTOGRAM</span></>
                )}
              </h3>
              <p className="text-[9px] lg:text-[10px] font-bold text-brand-brown/40 uppercase tracking-[0.25em] mt-1.5">
                Ticket size distribution with customizable range buckets
              </p>
            </div>
          </div>
        </div>

        {/* Controls: Mode Toggle, Channel Selector & Customize Button */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Channel Filter */}
          <div className="flex items-center bg-brand-brown/5 p-1 rounded-2xl border border-brand-brown/10">
            {(['ALL', 'DINE_IN', 'TAKEAWAY', 'DELIVERY'] as ChannelFilter[]).map(ch => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className={`px-3 py-1.5 text-[8px] lg:text-[9px] font-black uppercase tracking-wider rounded-xl transition-all ${
                  channelFilter === ch
                    ? 'bg-brand-brown text-brand-yellow shadow-sm'
                    : 'text-brand-brown/50 hover:text-brand-brown hover:bg-brand-brown/5'
                }`}
              >
                {ch === 'ALL' ? 'All Channels' : ch.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Primary View Toggle: Orders vs Revenue vs Combined Share */}
          <div className="flex items-center bg-brand-stone/40 p-1.5 rounded-2xl border border-brand-brown/15 shadow-inner">
            <button
              onClick={() => setMetric('orders')}
              className={`px-4 py-2 text-[9px] lg:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-1.5 ${
                metric === 'orders'
                  ? 'bg-brand-red text-white shadow-md'
                  : 'text-brand-brown/50 hover:text-brand-brown hover:bg-white/50'
              }`}
              title="View number of orders in each ticket size range"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>No. of Orders</span>
            </button>
            <button
              onClick={() => setMetric('revenue')}
              className={`px-4 py-2 text-[9px] lg:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-1.5 ${
                metric === 'revenue'
                  ? 'bg-brand-brown text-brand-yellow shadow-md'
                  : 'text-brand-brown/50 hover:text-brand-brown hover:bg-white/50'
              }`}
              title="View total rupee revenue from orders in each ticket size range"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Revenue (₹)</span>
            </button>
            <button
              onClick={() => setMetric('comparison')}
              className={`px-3.5 py-2 text-[9px] lg:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-1.5 ${
                metric === 'comparison'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-brand-brown/50 hover:text-brand-brown hover:bg-white/50'
              }`}
              title="Side-by-side percentage comparison of volume vs revenue"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>% Share</span>
            </button>
          </div>

          {/* Customize Ranges Button */}
          <button
            onClick={() => setIsCustomizeOpen(!isCustomizeOpen)}
            className={`px-3.5 py-2 text-[9px] lg:text-[10px] font-black uppercase tracking-widest rounded-2xl border transition-all flex items-center gap-1.5 ${
              isCustomizeOpen
                ? 'bg-brand-brown text-brand-yellow border-brand-brown shadow-sm'
                : 'bg-white text-brand-brown border-brand-stone hover:bg-brand-brown/5'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Customize Ranges ({selectedBucketIds.length}/{buckets.length})</span>
            {isCustomizeOpen ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
          </button>
        </div>
      </div>

      {/* Interactive Range Customizer & Selector Panel */}
      {isCustomizeOpen && (
        <div className="bg-brand-cream/70 border border-brand-brown/15 p-5 rounded-3xl mb-8 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-brand-brown">
                Select Ranges to Display in Histogram
              </p>
              <p className="text-[9px] font-medium text-brand-brown/60 mt-0.5">
                Click any range to toggle it in the chart and table. Add new custom ranges or reset to default anytime.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSelectAll}
                className="px-3 py-1.5 text-[8.5px] font-black uppercase tracking-wider rounded-xl bg-white border border-brand-stone text-brand-brown hover:bg-brand-brown/5 transition-colors flex items-center gap-1"
              >
                <CheckSquare className="w-3 h-3 text-brand-brown" />
                Select All
              </button>
              <button
                onClick={handleResetToDefault}
                className="px-3 py-1.5 text-[8.5px] font-black uppercase tracking-wider rounded-xl bg-white border border-brand-stone text-brand-brown hover:bg-brand-brown/5 transition-colors flex items-center gap-1"
                title="Reset to default 9 ranges: 0-50, 50-100, 100-150, 150-200, 200-250, 250-300, 300-400, 400-500, 500+"
              >
                <RotateCcw className="w-3 h-3 text-brand-brown" />
                Reset to Default
              </button>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-3.5 py-1.5 text-[8.5px] font-black uppercase tracking-wider rounded-xl bg-brand-red text-white hover:bg-brand-red/90 transition-colors flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Add New Range
              </button>
            </div>
          </div>

          {/* Interactive Range Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-brand-brown/10">
            {buckets.map(b => {
              const isSelected = selectedBucketIds.includes(b.id);
              return (
                <div
                  key={b.id}
                  onClick={() => toggleBucket(b.id)}
                  className={`cursor-pointer group select-none flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black transition-all border ${
                    isSelected
                      ? 'bg-brand-brown text-brand-yellow border-brand-brown shadow-sm'
                      : 'bg-white/80 text-brand-brown/50 border-brand-stone hover:border-brand-brown/40 hover:text-brand-brown'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-brand-yellow text-brand-brown' : 'border border-brand-brown/30 bg-white'
                  }`}>
                    {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <span>{b.label}</span>
                  {b.isCustom && (
                    <button
                      onClick={(e) => handleDeleteBucket(b.id, e)}
                      title="Remove custom range"
                      className="ml-1 p-0.5 rounded text-white/50 hover:text-rose-300 hover:bg-white/10 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary KPI Highlights */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-brand-cream/60 border border-brand-stone/60 p-4 rounded-2xl">
          <p className="text-[8px] font-black uppercase tracking-widest text-brand-brown/40">Selected Orders</p>
          <p className="text-xl lg:text-2xl font-black text-brand-brown tracking-tight mt-0.5">
            {totals.totalOrders.toLocaleString()}
          </p>
          <p className="text-[8px] font-bold text-brand-brown/50 mt-1">
            {totals.allOrdersCount > 0 ? (
              <span>{((totals.totalOrders / totals.allOrdersCount) * 100).toFixed(1)}% of total orders ({totals.allOrdersCount})</span>
            ) : (
              '0% of total'
            )}
          </p>
        </div>

        <div className="bg-brand-cream/60 border border-brand-stone/60 p-4 rounded-2xl">
          <p className="text-[8px] font-black uppercase tracking-widest text-brand-brown/40">Selected Revenue</p>
          <p className="text-xl lg:text-2xl font-black text-brand-red tracking-tight mt-0.5">
            ₹{totals.totalRevenue.toLocaleString()}
          </p>
          <p className="text-[8px] font-bold text-brand-brown/50 mt-1">
            Avg Ticket: ₹{totals.aov}
          </p>
        </div>

        <div className="bg-brand-cream/60 border border-brand-stone/60 p-4 rounded-2xl">
          <p className="text-[8px] font-black uppercase tracking-widest text-brand-brown/40">Peak Order Volume</p>
          <p className="text-lg lg:text-xl font-black text-brand-brown tracking-tight mt-0.5 truncate">
            {peakOrdersBucket ? peakOrdersBucket.range : 'N/A'}
          </p>
          <p className="text-[8px] font-bold text-brand-brown/50 mt-1">
            {peakOrdersBucket ? `${peakOrdersBucket.orderCount} orders (${peakOrdersBucket.orderShare}%)` : 'No data'}
          </p>
        </div>

        <div className="bg-brand-cream/60 border border-brand-stone/60 p-4 rounded-2xl">
          <p className="text-[8px] font-black uppercase tracking-widest text-brand-brown/40">Peak Revenue Generator</p>
          <p className="text-lg lg:text-xl font-black text-amber-700 tracking-tight mt-0.5 truncate">
            {peakRevenueBucket ? peakRevenueBucket.range : 'N/A'}
          </p>
          <p className="text-[8px] font-bold text-brand-brown/50 mt-1">
            {peakRevenueBucket ? `₹${peakRevenueBucket.totalRevenue.toLocaleString()} (${peakRevenueBucket.revenueShare}%)` : 'No data'}
          </p>
        </div>
      </div>

      {/* Main Chart Rendering */}
      {chartData.length === 0 ? (
        <div className="h-[300px] flex flex-col items-center justify-center bg-brand-cream/30 rounded-3xl border border-dashed border-brand-stone p-6 text-center">
          <p className="text-sm font-black uppercase tracking-wider text-brand-brown">No Ranges Selected</p>
          <p className="text-xs text-brand-brown/50 mt-1">Please select one or more order value ranges above to display data.</p>
          <button
            onClick={handleSelectAll}
            className="mt-4 px-4 py-2 bg-brand-brown text-brand-yellow rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90"
          >
            Select All Ranges
          </button>
        </div>
      ) : (
        <div className="h-[340px] lg:h-[420px] w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            {metric === 'comparison' ? (
              /* Comparison Mode: Both Order Share % and Revenue Share % side by side */
              <BarChart
                data={chartData}
                margin={{ top: 38, right: 15, left: -10, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eae6df" />
                <XAxis
                  dataKey="range"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#3c2a21', fontSize: 10, fontWeight: '800' }}
                  interval={0}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#3c2a21', fontSize: 10, fontWeight: '800' }}
                  tickFormatter={(val) => `${val}%`}
                  domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.18)]}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(60, 42, 33, 0.04)' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-brand-brown p-4 rounded-2xl shadow-2xl border-2 border-brand-stone min-w-[220px] text-white">
                          <p className="text-brand-yellow text-[11px] font-black uppercase tracking-widest mb-3 italic">
                            Ticket Range: {label}
                          </p>
                          <div className="space-y-2.5 text-xs">
                            <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                              <span className="text-[9px] uppercase tracking-wider text-rose-300 font-bold">Order Count:</span>
                              <span className="font-black text-white">{d.orderCount} orders ({d.orderShare}%)</span>
                            </div>
                            <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                              <span className="text-[9px] uppercase tracking-wider text-amber-300 font-bold">Total Revenue:</span>
                              <span className="font-black text-white">₹{d.totalRevenue.toLocaleString()} ({d.revenueShare}%)</span>
                            </div>
                            <div className="flex items-center justify-between pt-0.5">
                              <span className="text-[9px] uppercase tracking-wider text-white/50 font-bold">Avg Ticket:</span>
                              <span className="font-black text-brand-yellow">₹{d.avgOrderValue}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: '12px' }}
                  formatter={(value) => (
                    <span className="text-[10px] font-black uppercase tracking-wider text-brand-brown">
                      {value === 'orderShare' ? 'Orders Share (%)' : 'Revenue Share (%)'}
                    </span>
                  )}
                />
                <Bar
                  dataKey="orderShare"
                  name="orderShare"
                  fill="#EF4444"
                  radius={[6, 6, 0, 0]}
                  barSize={Math.max(12, Math.min(30, Math.floor(600 / (chartData.length * 2.5))))}
                >
                  <LabelList
                    content={renderComparisonOrderLabel}
                  />
                </Bar>
                <Bar
                  dataKey="revenueShare"
                  name="revenueShare"
                  fill="#3C2A21"
                  radius={[6, 6, 0, 0]}
                  barSize={Math.max(12, Math.min(30, Math.floor(600 / (chartData.length * 2.5))))}
                >
                  <LabelList
                    content={renderComparisonRevenueLabel}
                  />
                </Bar>
              </BarChart>
            ) : (
              /* Single Metric Mode: Either 'orders' (No. of Orders) or 'revenue' (Rupees) */
              <BarChart
                data={chartData}
                margin={{ top: 38, right: 15, left: 0, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eae6df" />
                <XAxis
                  dataKey="range"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#3c2a21', fontSize: 10, fontWeight: '800' }}
                  interval={0}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#3c2a21', fontSize: 10, fontWeight: '800' }}
                  domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.18)]}
                  tickFormatter={(val) => {
                    if (metric === 'revenue') {
                      return `₹${val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val}`;
                    }
                    return val.toLocaleString();
                  }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(60, 42, 33, 0.04)' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-brand-brown p-4 rounded-2xl shadow-2xl border-2 border-brand-stone min-w-[230px] text-white">
                          <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                            <p className="text-brand-yellow text-[11px] font-black uppercase tracking-widest italic">
                              {label}
                            </p>
                            <span className="text-[9px] font-black text-white/50 uppercase">
                              Avg ₹{d.avgOrderValue}
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            {/* Primary Metric */}
                            <div>
                              <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-0.5">
                                {metric === 'orders' ? 'Number of Orders' : 'Total Revenue'}
                              </p>
                              <p className="text-xl font-black leading-none text-white flex items-baseline gap-2">
                                {metric === 'orders' ? (
                                  <>
                                    <span>{d.orderCount.toLocaleString()}</span>
                                    <span className="text-xs font-bold text-rose-300">({d.orderShare}% of selected)</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-brand-yellow">₹{d.totalRevenue.toLocaleString()}</span>
                                    <span className="text-xs font-bold text-amber-200">({d.revenueShare}% of selected)</span>
                                  </>
                                )}
                              </p>
                            </div>

                            {/* Secondary Metric */}
                            <div className="pt-2 border-t border-white/10">
                              <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-0.5">
                                {metric === 'orders' ? 'Revenue from this range' : 'Orders count'}
                              </p>
                              <p className="text-sm font-bold text-white/80">
                                {metric === 'orders'
                                  ? `₹${d.totalRevenue.toLocaleString()} (${d.revenueShare}%)`
                                  : `${d.orderCount.toLocaleString()} orders (${d.orderShare}%)`}
                              </p>
                            </div>

                            {/* Channel Split in Tooltip */}
                            <div className="pt-2 border-t border-white/10 text-[9px] space-y-1 text-white/70">
                              <div className="flex justify-between">
                                <span>Dine-In:</span>
                                <span className="font-bold text-white">
                                  {d.dineInCount} ord (₹{d.dineInRevenue.toLocaleString()})
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Takeaway:</span>
                                <span className="font-bold text-white">
                                  {d.takeawayCount} ord (₹{d.takeawayRevenue.toLocaleString()})
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Delivery:</span>
                                <span className="font-bold text-white">
                                  {d.deliveryCount} ord (₹{d.deliveryRevenue.toLocaleString()})
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey={metric === 'orders' ? 'orderCount' : 'totalRevenue'}
                  radius={[6, 6, 0, 0]}
                  barSize={Math.max(16, Math.min(48, Math.floor(700 / (chartData.length * 1.6))))}
                >
                  {chartData.map((entry, index) => {
                    const isPeak =
                      metric === 'orders'
                        ? peakOrdersBucket && entry.id === peakOrdersBucket.id
                        : peakRevenueBucket && entry.id === peakRevenueBucket.id;

                    let fillColor = metric === 'orders' ? '#EF4444' : '#3C2A21';
                    if (isPeak) {
                      fillColor = metric === 'orders' ? '#B91C1C' : '#D97706';
                    }

                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={fillColor}
                        className="transition-all duration-300 hover:opacity-85"
                      />
                    );
                  })}
                  <LabelList
                    content={renderSingleBarLabel}
                  />
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* Expandable Breakdown Data Table */}
      <div className="mt-6 pt-4 border-t border-brand-stone/60">
        <button
          onClick={() => setShowTable(!showTable)}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-brown hover:text-brand-red transition-colors"
        >
          {showTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span>{showTable ? 'Hide Range Data Table' : 'Show Detailed Range Breakdown Table'}</span>
        </button>

        {showTable && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-brand-stone/80">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-brand-brown/5 text-brand-brown text-[9px] font-black uppercase tracking-wider border-b border-brand-stone">
                  <th className="py-3 px-4">Order Value Range</th>
                  <th className="py-3 px-4 text-right">Orders Count</th>
                  <th className="py-3 px-4 text-right">% of Selected Orders</th>
                  <th className="py-3 px-4 text-right">Total Revenue</th>
                  <th className="py-3 px-4 text-right">% of Selected Revenue</th>
                  <th className="py-3 px-4 text-right">Avg Ticket Size</th>
                  <th className="py-3 px-4 text-right">Dine-In / Takeaway / Delivery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-stone/40">
                {chartData.map(b => (
                  <tr key={b.id} className="hover:bg-brand-brown/5 transition-colors">
                    <td className="py-3 px-4 font-black text-brand-brown">{b.range}</td>
                    <td className="py-3 px-4 text-right font-bold text-gray-800">{b.orderCount}</td>
                    <td className="py-3 px-4 text-right font-medium text-gray-600">{b.orderShare}%</td>
                    <td className="py-3 px-4 text-right font-black text-brand-red">₹{b.totalRevenue.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-medium text-gray-600">{b.revenueShare}%</td>
                    <td className="py-3 px-4 text-right font-bold text-brand-brown">₹{b.avgOrderValue}</td>
                    <td className="py-3 px-4 text-right text-[10px] text-gray-500">
                      {b.dineInCount} / {b.takeawayCount} / {b.deliveryCount}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-brand-brown/10 text-brand-brown font-black text-xs border-t-2 border-brand-stone">
                  <td className="py-3 px-4 uppercase">Total Selected</td>
                  <td className="py-3 px-4 text-right">{totals.totalOrders}</td>
                  <td className="py-3 px-4 text-right">100%</td>
                  <td className="py-3 px-4 text-right text-brand-red">₹{totals.totalRevenue.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">100%</td>
                  <td className="py-3 px-4 text-right">₹{totals.aov}</td>
                  <td className="py-3 px-4 text-right text-[10px] text-brand-brown/70">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add New Custom Range */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-brand-brown/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setIsAddModalOpen(false)}
          />
          <div className="relative bg-white w-full max-w-md rounded-[2.5rem] p-6 lg:p-8 shadow-2xl border-2 border-brand-stone animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-brand-stone">
              <div>
                <h4 className="text-xl font-black text-brand-brown uppercase italic leading-none">
                  ADD NEW <span className="text-brand-red">RANGE</span>
                </h4>
                <p className="text-[9px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
                  Define custom ticket value boundaries
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-full bg-brand-brown/5 flex items-center justify-center text-brand-brown hover:bg-brand-brown/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNewRange} className="space-y-4">
              {addRangeError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold leading-relaxed">
                  {addRangeError}
                </div>
              )}

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown block mb-1">
                  Minimum Value (₹) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  placeholder="e.g. 500"
                  value={newRangeMin}
                  onChange={(e) => setNewRangeMin(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-brand-stone bg-brand-cream/30 text-sm font-bold text-brand-brown outline-none focus:border-brand-brown transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown block">
                    Maximum Value (₹)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[9px] font-bold text-brand-brown/70">
                    <input
                      type="checkbox"
                      checked={newRangeNoLimit}
                      onChange={(e) => setNewRangeNoLimit(e.target.checked)}
                      className="rounded border-brand-stone text-brand-brown focus:ring-0"
                    />
                    <span>No upper limit (e.g. 500+)</span>
                  </label>
                </div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={newRangeNoLimit}
                  required={!newRangeNoLimit}
                  placeholder={newRangeNoLimit ? "Unlimited (Infinity)" : "e.g. 750"}
                  value={newRangeNoLimit ? '' : newRangeMax}
                  onChange={(e) => setNewRangeMax(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm font-bold outline-none transition-colors ${
                    newRangeNoLimit
                      ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'border-brand-stone bg-brand-cream/30 text-brand-brown focus:border-brand-brown'
                  }`}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown block mb-1">
                  Display Label
                </label>
                <input
                  type="text"
                  placeholder="e.g. ₹500 - 750"
                  value={newRangeCustomLabel}
                  onChange={(e) => setNewRangeCustomLabel(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-brand-stone bg-brand-cream/30 text-sm font-bold text-brand-brown outline-none focus:border-brand-brown transition-colors"
                />
                <p className="text-[8px] text-brand-brown/50 mt-1 font-medium">
                  Auto-generated label: {newRangeMin ? (newRangeNoLimit ? `₹${newRangeMin}+` : `₹${newRangeMin} - ${newRangeMax || '...'}`) : '—'}
                </p>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-brand-stone text-xs font-bold text-brand-brown hover:bg-brand-brown/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-brand-red text-white text-xs font-black uppercase tracking-wider hover:bg-brand-red/90 transition-colors shadow-md"
                >
                  Add Range
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderValueHistogram;
