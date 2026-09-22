
import React, { useMemo, useState, useEffect } from 'react';
import { CompletedOrder, MenuItem, MenuSection } from '../types';
import ItemCategoryPieChart from './ItemCategoryPieChart';
import { Truck, Scissors, LayoutGrid, Filter, Utensils, ShoppingBag, BarChart3, Layers, Tag, ChevronUp, ChevronDown, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getLocalMenuSections, fetchMenuSections, fetchMenuItems } from '../utils/storage';
import { resolveCategoryName } from '../utils/categoryHelper';

interface ItemSalesReportProps {
  orders: CompletedOrder[];
}

interface SalesData {
  id: string; // Grouping identifier (usually menuItemId or Name)
  name: string;
  quantity: number;
  revenue: number;
  cogs: number;
  profit: number;
  dineInQty: number;
  takeawayQty: number;
  deliveryQty: number;
}

type SortKey = 'name' | 'quantity' | 'revenue' | 'share' | 'cogs' | 'profit';
type SortDirection = 'ascending' | 'descending';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

interface SortableColumnHeaderProps {
  label: string;
  sortKey: SortKey;
  currentSortKey: SortKey;
  currentDirection: SortDirection;
  align?: 'left' | 'center' | 'right';
  onToggleSort: (key: SortKey) => void;
  onSetDirection: (key: SortKey, direction: SortDirection) => void;
}

const SortableColumnHeader: React.FC<SortableColumnHeaderProps> = ({
  label,
  sortKey,
  currentSortKey,
  currentDirection,
  align = 'left',
  onToggleSort,
  onSetDirection,
}) => {
  const isActive = currentSortKey === sortKey;
  const isAsc = isActive && currentDirection === 'ascending';
  const isDesc = isActive && currentDirection === 'descending';

  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const flexAlignClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <th
      scope="col"
      role="columnheader"
      aria-sort={isActive ? (isAsc ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-3.5 select-none border-b-2 border-brand-stone transition-all hover:bg-brand-brown/10 group cursor-pointer ${alignClass} ${
        isActive ? 'bg-brand-brown/5' : ''
      }`}
      onClick={() => onToggleSort(sortKey)}
      title={`Click column to toggle sort by ${label}`}
    >
      <div className={`inline-flex items-center gap-1.5 ${flexAlignClass}`}>
        <span
          className={`text-[10px] font-black uppercase tracking-widest transition-colors ${
            isActive ? 'text-brand-brown' : 'text-brand-brown/40 group-hover:text-brand-brown'
          }`}
        >
          {label}
        </span>

        {/* Dedicated, clickable up & down arrow controls */}
        <div className="inline-flex flex-col -space-y-1 shrink-0 p-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSetDirection(sortKey, 'ascending');
            }}
            className={`p-0.5 rounded transition-all cursor-pointer hover:bg-brand-brown/15 focus:outline-none ${
              isAsc
                ? 'text-brand-red scale-110 opacity-100'
                : 'text-brand-brown/25 hover:text-brand-brown hover:opacity-100'
            }`}
            title={`Sort ${label} ascending (A-Z / lowest to highest)`}
            aria-label={`Sort ${label} ascending`}
          >
            <ChevronUp className={`w-3.5 h-3.5 ${isAsc ? 'stroke-[3.5]' : 'stroke-[2]'}`} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSetDirection(sortKey, 'descending');
            }}
            className={`p-0.5 rounded transition-all cursor-pointer hover:bg-brand-brown/15 focus:outline-none ${
              isDesc
                ? 'text-brand-red scale-110 opacity-100'
                : 'text-brand-brown/25 hover:text-brand-brown hover:opacity-100'
            }`}
            title={`Sort ${label} descending (Z-A / highest to lowest)`}
            aria-label={`Sort ${label} descending`}
          >
            <ChevronDown className={`w-3.5 h-3.5 ${isDesc ? 'stroke-[3.5]' : 'stroke-[2]'}`} />
          </button>
        </div>
      </div>
    </th>
  );
};

export const isDiscountOrNonProductItem = (item: any): boolean => {
  if (!item) return true;
  if (typeof item.price === 'number' && item.price < 0) return true;
  const name = (item.name || '').trim().toLowerCase();
  if (
    name.includes('loyalty') || 
    name.includes('discount') || 
    name.includes('offer voucher') || 
    name.includes('coupon') ||
    name.includes('promotional')
  ) {
    return true;
  }
  return false;
};

export interface DiscountBreakdownItem {
  id: string;
  name: string;
  category: string;
  categoryType: 'student' | 'loyalty' | 'welcome' | 'voucher' | 'promotion' | 'manual' | 'other';
  count: number;
  totalDiscount: number;
  ordersCount: number;
  averageDiscount: number;
  percentageOfTotal: number;
  countPercentage: number;
}

export interface DiscountStats {
  count: number;
  totalDiscount: number;
  ordersCount: number;
  averagePerOrder: number;
  averagePerApplication: number;
  items: DiscountBreakdownItem[];
}

export function extractDiscountDetails(item: any): { cleanName: string; category: string; categoryType: DiscountBreakdownItem['categoryType'] } {
  const rawName = (item.name || '').trim();
  const lowerName = rawName.toLowerCase();
  const id = (item.id || '').toLowerCase();

  let categoryType: DiscountBreakdownItem['categoryType'] = 'other';
  let category = 'General Discount';
  let cleanName = rawName;

  if (lowerName.includes('student') || id.includes('student')) {
    categoryType = 'student';
    category = 'Student';
    cleanName = rawName || 'Student Loyalty Discount';
  } else if (lowerName.includes('loyalty') || id === 'loyalty-discount') {
    categoryType = 'loyalty';
    category = 'Loyalty';
    cleanName = rawName || 'Loyalty Member Discount';
  } else if (lowerName.includes('welcome') || id === 'welcome-discount') {
    categoryType = 'welcome';
    category = 'Welcome Offer';
    cleanName = rawName || 'Welcome Offer Discount';
  } else if (lowerName.includes('coupon') || lowerName.includes('voucher') || id.includes('voucher') || id.includes('coupon')) {
    categoryType = 'voucher';
    category = 'Voucher';
    cleanName = rawName || 'Coupon Voucher Discount';
  } else if (lowerName.includes('promo') || id.startsWith('promo-discount-') || id.startsWith('custom-discount-') || lowerName.includes('offer')) {
    categoryType = 'promotion';
    category = 'Promotion';
    cleanName = rawName || 'Promotional Offer';
  } else if (typeof item.price === 'number' && item.price < 0) {
    categoryType = 'manual';
    category = 'Custom';
    cleanName = rawName || 'Cashier / Bill Discount';
  }

  // Clean leading emojis or excessive punctuation
  cleanName = cleanName.replace(/^🏷️\s*/, '').replace(/^🎁\s*/, '').trim();
  if (!cleanName || cleanName.toLowerCase() === 'discount') {
    cleanName = category !== 'General Discount' ? `${category} Discount` : 'Custom Bill Discount';
  }

  return { cleanName, category, categoryType };
}

const ItemSalesReport: React.FC<ItemSalesReportProps> = ({ orders = [] }) => {
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['DINE_IN', 'TAKEAWAY', 'DELIVERY']);
  const [isSplit, setIsSplit] = useState(false);
  const [isDiscountExpanded, setIsDiscountExpanded] = useState(false);
  const [discountSortBy, setDiscountSortBy] = useState<'amount' | 'count' | 'name'>('amount');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'profit', direction: 'descending' });
  const [distributionView, setDistributionView] = useState<'category' | 'item'>('item');
  const [sections, setSections] = useState<MenuSection[]>(() => getLocalMenuSections());
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // Dynamically load menu sections and menu items in sync with the menu manager
  useEffect(() => {
    let isMounted = true;

    const loadMenuData = async () => {
      try {
        const [secRes, itemRes] = await Promise.all([
          fetchMenuSections(),
          fetchMenuItems()
        ]);
        if (!isMounted) return;
        if (secRes.data && secRes.data.length > 0) {
          setSections(secRes.data);
        }
        if (itemRes.data && itemRes.data.length > 0) {
          setMenuItems(itemRes.data);
        }
      } catch (err) {
        console.warn("Failed to load menu sections or items in ItemSalesReport:", err);
      }
    };

    loadMenuData();

    const handleUpdate = () => {
      loadMenuData();
    };

    window.addEventListener('menu-sections-updated', handleUpdate);
    window.addEventListener('menu-items-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener('menu-sections-updated', handleUpdate);
      window.removeEventListener('menu-items-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const toggleChannel = (channel: string) => {
    setSelectedChannels(prev => {
      if (prev.includes(channel)) {
        if (prev.length === 1) return prev; // Keep at least one channel selected to prevent empty chart
        return prev.filter(c => c !== channel);
      }
      return [...prev, channel];
    });
  };

  const safeOrders = useMemo(() => Array.isArray(orders) ? orders : [], [orders]);

  const filteredOrders = useMemo(() => {
    return safeOrders.filter(o => o && selectedChannels.includes(o.type));
  }, [safeOrders, selectedChannels]);

  // Track loyalty discounts and promotional vouchers applied with granular breakdown
  const discountStats = useMemo<DiscountStats>(() => {
    let count = 0;
    let totalDiscount = 0;
    const ordersWithDiscounts = new Set<string>();
    const breakdownMap = new Map<string, {
      name: string;
      category: string;
      categoryType: DiscountBreakdownItem['categoryType'];
      count: number;
      totalDiscount: number;
      orderIds: Set<string>;
    }>();

    filteredOrders.forEach((order, orderIdx) => {
      const orderId = order.id || `${order.billNumber || orderIdx}`;
      const items = Array.isArray(order.items) ? order.items : [];

      items.forEach(item => {
        if (isDiscountOrNonProductItem(item)) {
          const qty = Number(item.quantity) || 1;
          const price = Number(item.price) || 0;
          const amount = Math.abs(price * qty);

          const { cleanName, category, categoryType } = extractDiscountDetails(item);
          const key = cleanName;

          let existing = breakdownMap.get(key);
          if (!existing) {
            existing = {
              name: cleanName,
              category,
              categoryType,
              count: 0,
              totalDiscount: 0,
              orderIds: new Set()
            };
            breakdownMap.set(key, existing);
          }

          existing.count += qty;
          existing.totalDiscount += amount;
          existing.orderIds.add(orderId);
          ordersWithDiscounts.add(orderId);

          count += qty;
          totalDiscount += amount;
        }
      });

      // Also check if order has a distinct manualDiscount not captured in line items
      if (typeof order.manualDiscount === 'number' && order.manualDiscount > 0) {
        const alreadyInItems = items.some(i => 
          isDiscountOrNonProductItem(i) && 
          Math.abs(Math.abs((Number(i.price) || 0) * (Number(i.quantity) || 1)) - order.manualDiscount!) < 0.01
        );

        if (!alreadyInItems) {
          const key = 'Manual Cashier Discount';
          let existing = breakdownMap.get(key);
          if (!existing) {
            existing = {
              name: key,
              category: 'Cashier Manual',
              categoryType: 'manual',
              count: 0,
              totalDiscount: 0,
              orderIds: new Set()
            };
            breakdownMap.set(key, existing);
          }

          existing.count += 1;
          existing.totalDiscount += order.manualDiscount;
          existing.orderIds.add(orderId);
          ordersWithDiscounts.add(orderId);

          count += 1;
          totalDiscount += order.manualDiscount;
        }
      }
    });

    const items: DiscountBreakdownItem[] = Array.from(breakdownMap.values()).map(b => ({
      id: b.name,
      name: b.name,
      category: b.category,
      categoryType: b.categoryType,
      count: b.count,
      totalDiscount: b.totalDiscount,
      ordersCount: b.orderIds.size,
      averageDiscount: b.count > 0 ? b.totalDiscount / b.count : 0,
      percentageOfTotal: totalDiscount > 0 ? (b.totalDiscount / totalDiscount) * 100 : 0,
      countPercentage: count > 0 ? (b.count / count) * 100 : 0,
    }));

    return {
      count,
      totalDiscount,
      ordersCount: ordersWithDiscounts.size,
      averagePerOrder: ordersWithDiscounts.size > 0 ? totalDiscount / ordersWithDiscounts.size : 0,
      averagePerApplication: count > 0 ? totalDiscount / count : 0,
      items
    };
  }, [filteredOrders]);

  const sortedDiscountItems = useMemo(() => {
    return [...discountStats.items].sort((a, b) => {
      if (discountSortBy === 'amount') {
        return b.totalDiscount - a.totalDiscount;
      }
      if (discountSortBy === 'count') {
        return b.count - a.count;
      }
      return a.name.localeCompare(b.name);
    });
  }, [discountStats.items, discountSortBy]);

  // Item-level aggregation
  const salesData = useMemo<SalesData[]>(() => {
    const itemMap = new Map<string, { 
      name: string; 
      quantity: number; 
      revenue: number; 
      cogs: number;
      dineInQty: number;
      takeawayQty: number;
      deliveryQty: number;
    }>();

    filteredOrders.forEach(order => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach(item => {
        // Exclude discount line items from product inventory reports
        if (isDiscountOrNonProductItem(item)) return;

        const quantity = Number(item.quantity) || 0;
        if (quantity <= 0) return;

        const price = Number(item.price) || 0;
        const cost = Number(item.cost ?? 0) || 0;
        const itemRevenue = price * quantity;
        const itemCogs = cost * quantity;
        const existing = itemMap.get(item.name);

        const dineQty = order.type === 'DINE_IN' ? quantity : 0;
        const takeQty = order.type === 'TAKEAWAY' ? quantity : 0;
        const delQty = order.type === 'DELIVERY' ? quantity : 0;

        if (existing) {
          existing.quantity += quantity;
          existing.revenue += itemRevenue;
          existing.cogs += itemCogs;
          existing.dineInQty += dineQty;
          existing.takeawayQty += takeQty;
          existing.deliveryQty += delQty;
        } else {
          itemMap.set(item.name, {
            name: item.name,
            quantity,
            revenue: itemRevenue,
            cogs: itemCogs,
            dineInQty: dineQty,
            takeawayQty: takeQty,
            deliveryQty: delQty,
          });
        }
      });
    });
    
    return Array.from(itemMap.entries()).map(([name, data]) => ({ 
      id: name,
      ...data,
      dineInQty: Math.max(0, data.dineInQty),
      takeawayQty: Math.max(0, data.takeawayQty),
      deliveryQty: Math.max(0, data.deliveryQty),
      profit: data.revenue - data.cogs,
    }));
  }, [filteredOrders]);

  // Dynamic category-level aggregation synced with Menu Sections & Items
  const categorySalesData = useMemo<SalesData[]>(() => {
    const categoryMap = new Map<string, { 
      name: string; 
      quantity: number; 
      revenue: number; 
      cogs: number;
      dineInQty: number;
      takeawayQty: number;
      deliveryQty: number;
    }>();

    filteredOrders.forEach(order => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach(item => {
        // Exclude discount line items from product category reports
        if (isDiscountOrNonProductItem(item)) return;

        const quantity = Number(item.quantity) || 0;
        if (quantity <= 0) return;

        const categoryName = resolveCategoryName(item, menuItems, sections);
        const price = Number(item.price) || 0;
        const cost = Number(item.cost ?? 0) || 0;
        const itemRevenue = price * quantity;
        const itemCogs = cost * quantity;
        const existing = categoryMap.get(categoryName);

        const dineQty = order.type === 'DINE_IN' ? quantity : 0;
        const takeQty = order.type === 'TAKEAWAY' ? quantity : 0;
        const delQty = order.type === 'DELIVERY' ? quantity : 0;

        if (existing) {
          existing.quantity += quantity;
          existing.revenue += itemRevenue;
          existing.cogs += itemCogs;
          existing.dineInQty += dineQty;
          existing.takeawayQty += takeQty;
          existing.deliveryQty += delQty;
        } else {
          categoryMap.set(categoryName, {
            name: categoryName,
            quantity,
            revenue: itemRevenue,
            cogs: itemCogs,
            dineInQty: dineQty,
            takeawayQty: takeQty,
            deliveryQty: delQty,
          });
        }
      });
    });
    
    return Array.from(categoryMap.entries()).map(([name, data]) => ({ 
      id: name,
      ...data,
      dineInQty: Math.max(0, data.dineInQty),
      takeawayQty: Math.max(0, data.takeawayQty),
      deliveryQty: Math.max(0, data.deliveryQty),
      profit: data.revenue - data.cogs,
    }));
  }, [filteredOrders, menuItems, sections]);

  const activeSalesData = distributionView === 'category' ? categorySalesData : salesData;

  const chartData = useMemo(() => {
    if (distributionView === 'category') {
      return [...categorySalesData]
        .sort((a, b) => b.quantity - a.quantity)
        .map(d => ({
          ...d,
          dineInQty: Number(d.dineInQty) || 0,
          takeawayQty: Number(d.takeawayQty) || 0,
          deliveryQty: Number(d.deliveryQty) || 0,
        }));
    }
    return [...salesData]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 15)
      .map(d => ({
        ...d,
        dineInQty: Number(d.dineInQty) || 0,
        takeawayQty: Number(d.takeawayQty) || 0,
        deliveryQty: Number(d.deliveryQty) || 0,
      }));
  }, [distributionView, categorySalesData, salesData]);

  const sortedSalesData = useMemo(() => {
    const sortableItems = [...activeSalesData];
    sortableItems.sort((a, b) => {
      let comparison = 0;
      if (sortConfig.key === 'name') {
        comparison = (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortConfig.key === 'share' || sortConfig.key === 'revenue') {
        comparison = (Number(a.revenue) || 0) - (Number(b.revenue) || 0);
      } else if (sortConfig.key === 'quantity') {
        comparison = (Number(a.quantity) || 0) - (Number(b.quantity) || 0);
      } else if (sortConfig.key === 'cogs') {
        comparison = (Number(a.cogs) || 0) - (Number(b.cogs) || 0);
      } else if (sortConfig.key === 'profit') {
        comparison = (Number(a.profit) || 0) - (Number(b.profit) || 0);
      }

      return sortConfig.direction === 'ascending' ? comparison : -comparison;
    });
    return sortableItems;
  }, [activeSalesData, sortConfig]);
  
  const handleToggleSort = (key: SortKey) => {
    let direction: SortDirection = 'descending';
    if (sortConfig.key === key) {
      direction = sortConfig.direction === 'descending' ? 'ascending' : 'descending';
    } else {
      // Default to ascending for alphabetical name, descending for numerical metrics
      direction = key === 'name' ? 'ascending' : 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleSetDirection = (key: SortKey, direction: SortDirection) => {
    setSortConfig({ key, direction });
  };

  const totalSalesRevenue = useMemo(() => {
    return activeSalesData.reduce((acc, curr) => acc + curr.revenue, 0);
  }, [activeSalesData]);

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 min-w-0">
      {/* Header Controls & Expandable Discounts Panel */}
      <div className="bg-white p-6 rounded-[3rem] shadow-xl border border-brand-stone transition-all duration-300">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => toggleChannel('DINE_IN')}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 cursor-pointer ${
                selectedChannels.includes('DINE_IN') 
                  ? 'bg-[#10B981] text-white border-[#10B981] shadow-lg scale-105' 
                  : 'bg-white text-brand-brown/40 border-brand-stone hover:border-[#10B981]/30'
              }`}
            >
              <Utensils className="w-4 h-4" />
              Dine In
            </button>

            <button
              type="button"
              onClick={() => toggleChannel('TAKEAWAY')}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 cursor-pointer ${
                selectedChannels.includes('TAKEAWAY') 
                  ? 'bg-[#3B82F6] text-white border-[#3B82F6] shadow-lg scale-105' 
                  : 'bg-white text-brand-brown/40 border-brand-stone hover:border-[#3B82F6]/30'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              Takeaway
            </button>

            <button
              type="button"
              onClick={() => toggleChannel('DELIVERY')}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 cursor-pointer ${
                selectedChannels.includes('DELIVERY') 
                  ? 'bg-[#E11D48] text-white border-[#E11D48] shadow-lg scale-105' 
                  : 'bg-white text-brand-brown/40 border-brand-stone hover:border-[#E11D48]/30'
              }`}
            >
              <Truck className="w-4 h-4" />
              Delivery
            </button>

            <div className="w-[2px] h-8 bg-brand-stone mx-2 hidden sm:block" />

            <button
              type="button"
              onClick={() => setIsSplit(!isSplit)}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 cursor-pointer ${
                isSplit 
                  ? 'bg-brand-red text-white border-brand-red shadow-lg' 
                  : 'bg-white text-brand-brown/40 border-brand-stone hover:border-brand-brown/30'
              }`}
            >
              {isSplit ? <LayoutGrid className="w-4 h-4" /> : <Scissors className="w-4 h-4" />}
              {isSplit ? 'Unified View' : 'Split Charts'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {discountStats.count > 0 && (
              <button
                type="button"
                id="expandable-discounts-tag-btn"
                onClick={() => setIsDiscountExpanded(prev => !prev)}
                aria-expanded={isDiscountExpanded}
                aria-controls="discount-breakdown-details-panel"
                className={`group flex items-center gap-2 px-3.5 py-2 rounded-xl text-[10px] font-black tracking-tight transition-all cursor-pointer border select-none ${
                  isDiscountExpanded
                    ? 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-400/40'
                    : 'bg-amber-500/10 border-amber-500/25 text-amber-800 hover:bg-amber-500/20 hover:border-amber-500/40 hover:text-amber-900 active:scale-95'
                }`}
                title={isDiscountExpanded ? "Click to collapse discount breakdown" : "Click to expand discount breakdown"}
              >
                <Tag className={`w-3.5 h-3.5 transition-transform duration-200 ${isDiscountExpanded ? 'scale-110 text-white' : 'text-amber-600 group-hover:scale-110'}`} />
                <span>₹{discountStats.totalDiscount.toLocaleString()} Discounts ({discountStats.count} applied)</span>
                <span className={`inline-flex items-center transition-transform duration-200 ${isDiscountExpanded ? 'rotate-180 text-white' : 'text-amber-700/60 group-hover:text-amber-900'}`}>
                  <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
                </span>
              </button>
            )}
            <div className="flex items-center gap-2 text-brand-brown/40 italic text-[10px] font-bold uppercase tracking-tight">
              <Filter className="w-3 h-3" />
              Analyzing {filteredOrders.length} orders
            </div>
          </div>
        </div>

        {/* Expandable Discounts Breakdown Drawer */}
        <AnimatePresence>
          {isDiscountExpanded && discountStats.count > 0 && (
            <motion.div
              id="discount-breakdown-details-panel"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="pt-6 border-t border-brand-stone/80">
                {/* Panel Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 shrink-0 shadow-xs">
                      <Tag className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h4 className="text-sm font-black uppercase italic tracking-wider text-brand-brown">
                          Discounts & Vouchers Applied Breakdown
                        </h4>
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-800 border border-amber-500/30">
                          {discountStats.items.length} {discountStats.items.length === 1 ? 'type' : 'types'} identified
                        </span>
                      </div>
                      <p className="text-[11px] font-bold text-brand-brown/50 tracking-tight mt-0.5">
                        Breakdown showing which discount type was applied, how many times, and how much total off was given
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    {/* Sort buttons */}
                    <div className="flex items-center bg-brand-stone/40 p-1 rounded-xl border border-brand-stone text-[9px] font-black uppercase">
                      <span className="text-brand-brown/40 px-2 select-none text-[8.5px]">Sort:</span>
                      <button
                        type="button"
                        onClick={() => setDiscountSortBy('amount')}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                          discountSortBy === 'amount' 
                            ? 'bg-white text-brand-brown shadow-xs font-black' 
                            : 'text-brand-brown/50 hover:text-brand-brown'
                        }`}
                      >
                        Top ₹ Off
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountSortBy('count')}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                          discountSortBy === 'count' 
                            ? 'bg-white text-brand-brown shadow-xs font-black' 
                            : 'text-brand-brown/50 hover:text-brand-brown'
                        }`}
                      >
                        Most Used
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountSortBy('name')}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                          discountSortBy === 'name' 
                            ? 'bg-white text-brand-brown shadow-xs font-black' 
                            : 'text-brand-brown/50 hover:text-brand-brown'
                        }`}
                      >
                        A-Z
                      </button>
                    </div>

                    {/* Close button */}
                    <button
                      type="button"
                      onClick={() => setIsDiscountExpanded(false)}
                      className="p-2 rounded-xl text-brand-brown/40 hover:text-brand-brown hover:bg-brand-brown/10 transition-colors cursor-pointer"
                      title="Collapse breakdown"
                      aria-label="Collapse discount breakdown"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* KPI Stat Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                  <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3.5 shadow-xs">
                    <div className="text-[9.5px] font-black uppercase tracking-wider text-amber-800/80">Total Off Given</div>
                    <div className="text-xl font-black text-amber-800 tracking-tight mt-0.5">
                      ₹{discountStats.totalDiscount.toLocaleString()}
                    </div>
                    <div className="text-[9.5px] font-bold text-amber-700/70 mt-0.5">
                      Cumulative value saved
                    </div>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3.5 shadow-xs">
                    <div className="text-[9.5px] font-black uppercase tracking-wider text-amber-800/80">Total Applications</div>
                    <div className="text-xl font-black text-amber-800 tracking-tight mt-0.5">
                      {discountStats.count.toLocaleString()}
                      <span className="text-xs font-bold ml-1 text-amber-800/60">times</span>
                    </div>
                    <div className="text-[9.5px] font-bold text-amber-700/70 mt-0.5">
                      Across all filtered bills
                    </div>
                  </div>

                  <div className="bg-brand-stone/30 border border-brand-stone rounded-2xl p-3.5 shadow-xs">
                    <div className="text-[9.5px] font-black uppercase tracking-wider text-brand-brown/60">Discounted Orders</div>
                    <div className="text-xl font-black text-brand-brown tracking-tight mt-0.5">
                      {discountStats.ordersCount.toLocaleString()}
                      <span className="text-xs font-bold ml-1 text-brand-brown/50">bills</span>
                    </div>
                    <div className="text-[9.5px] font-bold text-brand-brown/40 mt-0.5">
                      {filteredOrders.length > 0 ? `${((discountStats.ordersCount / filteredOrders.length) * 100).toFixed(1)}% of total orders` : '0%'}
                    </div>
                  </div>

                  <div className="bg-brand-stone/30 border border-brand-stone rounded-2xl p-3.5 shadow-xs">
                    <div className="text-[9.5px] font-black uppercase tracking-wider text-brand-brown/60">Avg Off / Application</div>
                    <div className="text-xl font-black text-brand-brown tracking-tight mt-0.5">
                      ₹{Math.round(discountStats.averagePerApplication).toLocaleString()}
                    </div>
                    <div className="text-[9.5px] font-bold text-brand-brown/40 mt-0.5">
                      Average deduction per use
                    </div>
                  </div>
                </div>

                {/* Segmented Value Distribution Bar */}
                {discountStats.items.length > 1 && (
                  <div className="mb-5 bg-brand-stone/20 rounded-2xl p-3 border border-brand-stone/60">
                    <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-brand-brown/50 mb-2">
                      <span>Discount Value Share Distribution</span>
                      <span>100% of ₹{discountStats.totalDiscount.toLocaleString()} Off</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-brand-stone/40 overflow-hidden flex gap-0.5 p-0.5">
                      {sortedDiscountItems.map((item, idx) => {
                        const colors = [
                          'bg-amber-500',
                          'bg-emerald-500',
                          'bg-indigo-500',
                          'bg-rose-500',
                          'bg-sky-500',
                          'bg-purple-500',
                          'bg-orange-500'
                        ];
                        const color = colors[idx % colors.length];
                        return (
                          <div
                            key={item.id}
                            style={{ width: `${Math.max(item.percentageOfTotal, 2)}%` }}
                            className={`h-full ${color} rounded-full transition-all duration-300`}
                            title={`${item.name}: ₹${item.totalDiscount.toLocaleString()} (${item.percentageOfTotal.toFixed(1)}%) • ${item.count} applied`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Detailed Breakdown Table */}
                <div className="overflow-x-auto rounded-2xl border border-brand-stone bg-white shadow-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-brand-brown/5 text-[9.5px] text-brand-brown/70 font-black uppercase tracking-widest border-b border-brand-stone">
                      <tr>
                        <th className="px-4 py-3">Discount Type</th>
                        <th className="px-4 py-3 text-center">Times Applied</th>
                        <th className="px-4 py-3 text-right">Total Off Given</th>
                        <th className="px-4 py-3 text-right">Avg. Off / Use</th>
                        <th className="px-4 py-3 text-right">Orders Impacted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-stone/60">
                      {sortedDiscountItems.map((item) => {
                        const categoryBadgeColors: Record<string, string> = {
                          student: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/25',
                          loyalty: 'bg-amber-500/10 text-amber-800 border-amber-500/25',
                          welcome: 'bg-purple-500/10 text-purple-800 border-purple-500/25',
                          voucher: 'bg-sky-500/10 text-sky-800 border-sky-500/25',
                          promotion: 'bg-rose-500/10 text-rose-800 border-rose-500/25',
                          manual: 'bg-orange-500/10 text-orange-800 border-orange-500/25',
                          other: 'bg-stone-500/10 text-stone-800 border-stone-500/25',
                        };

                        const badgeClass = categoryBadgeColors[item.categoryType] || categoryBadgeColors.other;

                        return (
                          <tr key={item.id} className="hover:bg-amber-500/5 transition-colors">
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border shrink-0 ${badgeClass}`}>
                                  {item.category}
                                </span>
                                <span className="font-bold text-brand-brown tracking-tight text-xs sm:text-sm">
                                  {item.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="inline-flex items-center gap-1 font-black text-brand-brown text-sm">
                                {item.count.toLocaleString()}
                                <span className="text-[11px] text-brand-brown/40 font-bold">×</span>
                              </span>
                              <div className="text-[9.5px] text-brand-brown/40 font-bold mt-0.5">
                                {item.countPercentage.toFixed(1)}% of all applied
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="font-black text-amber-800 text-sm tracking-tight">
                                ₹{item.totalDiscount.toLocaleString()}
                              </div>
                              <div className="flex items-center justify-end gap-1.5 mt-1">
                                <div className="w-14 h-1.5 rounded-full bg-amber-500/15 overflow-hidden">
                                  <div 
                                    className="h-full bg-amber-500 rounded-full"
                                    style={{ width: `${Math.min(item.percentageOfTotal, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[9.5px] text-amber-700/90 font-black">
                                  {item.percentageOfTotal.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-brand-brown text-xs sm:text-sm">
                              ₹{Math.round(item.averageDiscount).toLocaleString()}
                              <span className="text-[10px] text-brand-brown/40 font-medium block">per use</span>
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-brand-brown/80 text-xs sm:text-sm">
                              {item.ordersCount.toLocaleString()}
                              <span className="text-[10px] text-brand-brown/40 font-medium ml-1">bills</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-amber-500/10 border-t-2 border-amber-500/30 font-black text-brand-brown">
                      <tr>
                        <td className="px-4 py-3 text-[10px] uppercase tracking-wider text-amber-950">
                          Total Deductions
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-amber-950">
                          {discountStats.count.toLocaleString()} applied
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-amber-950 font-black">
                          ₹{discountStats.totalDiscount.toLocaleString()} Total Off
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-amber-950">
                          ₹{Math.round(discountStats.averagePerApplication).toLocaleString()} avg
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-amber-950">
                          {discountStats.ordersCount.toLocaleString()} bills
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stacked Quantity Bar Chart */}
      <div className="bg-white rounded-[3rem] shadow-xl p-6 sm:p-10 border border-brand-stone min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-brand-red shrink-0" />
            <div>
              <h3 className="text-2xl font-black text-brand-brown uppercase italic tracking-tighter">
                Quantity <span className="text-brand-red">Distribution</span>
              </h3>
              <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest">
                {distributionView === 'category' ? 'Category sales volume split by channel' : 'Item sales volume split by channel'}
              </p>
            </div>
          </div>

          {/* Category Wise vs Itemwise Toggle */}
          <div className="inline-flex items-center bg-brand-brown/5 p-1 rounded-2xl border border-brand-stone self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setDistributionView('category')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                distributionView === 'category'
                  ? 'bg-brand-brown text-brand-yellow shadow-md'
                  : 'text-brand-brown/50 hover:text-brand-brown hover:bg-white/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Category Wise</span>
            </button>

            <button
              type="button"
              onClick={() => setDistributionView('item')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                distributionView === 'item'
                  ? 'bg-brand-brown text-brand-yellow shadow-md'
                  : 'text-brand-brown/50 hover:text-brand-brown hover:bg-white/60'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Itemwise</span>
            </button>
          </div>
        </div>
        
        <div className="h-[420px] w-full min-w-0">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 20, left: 10, bottom: distributionView === 'category' ? 35 : 75 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="name" 
                  angle={distributionView === 'category' ? 0 : -35} 
                  textAnchor={distributionView === 'category' ? 'middle' : 'end'} 
                  interval={0}
                  height={distributionView === 'category' ? 45 : 85}
                  tick={{ fill: '#4B5563', fontSize: distributionView === 'category' ? 11 : 9.5, fontWeight: 800 }}
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
                  itemStyle={{ color: '#fff', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}
                  cursor={{ fill: '#F3F4F6' }}
                />
                <Legend verticalAlign="top" align="right" iconType="circle" />
                {selectedChannels.includes('DINE_IN') && (
                  <Bar 
                    dataKey="dineInQty" 
                    name="Dine In" 
                    stackId="salesStack" 
                    fill="#10B981" 
                    isAnimationActive={false}
                  />
                )}
                {selectedChannels.includes('TAKEAWAY') && (
                  <Bar 
                    dataKey="takeawayQty" 
                    name="Takeaway" 
                    stackId="salesStack" 
                    fill="#3B82F6" 
                    isAnimationActive={false}
                  />
                )}
                {selectedChannels.includes('DELIVERY') && (
                  <Bar 
                    dataKey="deliveryQty" 
                    name="Delivery" 
                    stackId="salesStack" 
                    fill="#E11D48" 
                    isAnimationActive={false}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs font-black text-brand-brown/30 uppercase tracking-widest">No order data matching selected channels</p>
            </div>
          )}
        </div>
      </div>

      {/* Visual Analytics */}
      <div className={`grid gap-12 min-w-0 ${isSplit ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
        {!isSplit ? (
          <ItemCategoryPieChart 
            orders={filteredOrders} 
            title="Performance Overview"
            groupMode={distributionView}
            menuItems={menuItems}
            menuSections={sections}
          />
        ) : (
          <>
            <ItemCategoryPieChart 
              orders={filteredOrders.filter(o => o.type === 'DINE_IN')} 
              title="Dine In"
              colorTheme="#10B981"
              groupMode={distributionView}
              menuItems={menuItems}
              menuSections={sections}
            />
            <ItemCategoryPieChart 
              orders={filteredOrders.filter(o => o.type === 'TAKEAWAY')} 
              title="Takeaway"
              colorTheme="#3B82F6"
              groupMode={distributionView}
              menuItems={menuItems}
              menuSections={sections}
            />
            <ItemCategoryPieChart 
              orders={filteredOrders.filter(o => o.type === 'DELIVERY')} 
              title="Delivery"
              colorTheme="#E11D48"
              disabled={!selectedChannels.includes('DELIVERY')}
              groupMode={distributionView}
              menuItems={menuItems}
              menuSections={sections}
            />
          </>
        )}
      </div>

      {/* Inventory Velocity Table */}
      <div className="bg-white rounded-[3rem] shadow-xl p-6 sm:p-10 border border-brand-stone overflow-hidden min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-2xl font-black text-brand-brown italic uppercase tracking-tighter">
              Inventory <span className="text-brand-red">Velocity</span>
            </h3>
            <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
              {distributionView === 'category' ? 'Category performance and margin breakdown' : 'Item performance and margin breakdown'}
            </p>
          </div>

          <div className="text-[10px] font-black uppercase tracking-wider text-brand-brown/40 bg-brand-brown/5 px-3 py-1.5 rounded-xl border border-brand-stone self-start sm:self-auto">
            {sortedSalesData.length} {distributionView === 'category' ? 'Categories' : 'Items'} Recorded
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-brand-brown/5 text-[10px] text-brand-brown/40 font-black uppercase tracking-widest">
              <tr>
                <SortableColumnHeader 
                  label={distributionView === 'category' ? 'Category' : 'Item Name'} 
                  sortKey="name" 
                  currentSortKey={sortConfig.key}
                  currentDirection={sortConfig.direction}
                  onToggleSort={handleToggleSort}
                  onSetDirection={handleSetDirection}
                />
                <SortableColumnHeader 
                  label="Qty Sold" 
                  sortKey="quantity" 
                  align="center" 
                  currentSortKey={sortConfig.key}
                  currentDirection={sortConfig.direction}
                  onToggleSort={handleToggleSort}
                  onSetDirection={handleSetDirection}
                />
                <SortableColumnHeader 
                  label="Total Rev" 
                  sortKey="revenue" 
                  align="right" 
                  currentSortKey={sortConfig.key}
                  currentDirection={sortConfig.direction}
                  onToggleSort={handleToggleSort}
                  onSetDirection={handleSetDirection}
                />
                <SortableColumnHeader 
                  label="Share %" 
                  sortKey="share" 
                  align="right" 
                  currentSortKey={sortConfig.key}
                  currentDirection={sortConfig.direction}
                  onToggleSort={handleToggleSort}
                  onSetDirection={handleSetDirection}
                />
                <SortableColumnHeader 
                  label="Total Cost" 
                  sortKey="cogs" 
                  align="right" 
                  currentSortKey={sortConfig.key}
                  currentDirection={sortConfig.direction}
                  onToggleSort={handleToggleSort}
                  onSetDirection={handleSetDirection}
                />
                <SortableColumnHeader 
                  label="Gross Prof" 
                  sortKey="profit" 
                  align="right" 
                  currentSortKey={sortConfig.key}
                  currentDirection={sortConfig.direction}
                  onToggleSort={handleToggleSort}
                  onSetDirection={handleSetDirection}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-stone">
              {sortedSalesData.map(item => (
                <tr key={item.id} className="hover:bg-brand-cream/50 transition-colors">
                  <td className="px-4 py-6 font-black text-brand-brown">{item.name}</td>
                  <td className="px-4 py-6 text-center font-bold text-brand-brown/60 italic">{item.quantity} units</td>
                  <td className="px-4 py-6 text-right font-black text-brand-brown">₹{item.revenue.toFixed(2)}</td>
                  <td className="px-4 py-6 text-right font-bold text-brand-red italic text-xs">
                    {totalSalesRevenue > 0 ? ((item.revenue / totalSalesRevenue) * 100).toFixed(1) : 0}%
                  </td>
                  <td className="px-4 py-6 text-right font-bold text-brand-red/60">₹{item.cogs.toFixed(2)}</td>
                  <td className="px-4 py-6 text-right font-black text-emerald-600 text-lg">₹{item.profit.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedSalesData.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-brand-brown/20 font-black uppercase text-xs tracking-widest">No Sales Data for this Period</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ItemSalesReport;
