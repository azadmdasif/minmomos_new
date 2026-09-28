import React, { useMemo, useState, useEffect } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { CompletedOrder, MenuItem, MenuSection } from '../types';
import { 
  PieChart as PieChartIcon, 
  TrendingUp, 
  DollarSign, 
  X, 
  Search, 
  Download, 
  Layers,
  ChevronRight
} from 'lucide-react';
import { resolveCategoryName } from '../utils/categoryHelper';
import { isDiscountOrNonProductItem } from './ItemSalesReport';

interface ItemCategoryPieChartProps {
  orders: CompletedOrder[];
  title?: string;
  colorTheme?: string;
  disabled?: boolean;
  groupMode?: 'item' | 'category';
  menuItems?: MenuItem[];
  menuSections?: MenuSection[];
}

const COLORS = [
  '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6', 
  '#EC4899', '#06B6D4', '#84CC16', '#6366F1', '#F43F5E',
  '#14B8A6', '#F97316', '#EAB308', '#22C55E', '#60A5FA',
  '#F87171', '#A855F7', '#F472B6', '#38BDF8', '#A3E635'
];

const getBaseName = (name: string): string => {
  return name
    .replace(/\s*\(?(Small|Medium|Large|Regular|Full|Half|Extra|Premium|\d+\s*Pcs)\)?\s*/gi, '')
    .replace(/\s*-\s*(Small|Medium|Large|Regular|Full|Half|Extra|Premium)/gi, '')
    .replace(/^(Small|Medium|Large|Regular|Full|Half|Extra|Premium)\s+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const ItemCategoryPieChart: React.FC<ItemCategoryPieChartProps> = ({ 
  orders, 
  title, 
  colorTheme, 
  disabled,
  groupMode = 'item',
  menuItems = [],
  menuSections = []
}) => {
  const [viewMode, setViewMode] = useState<'revenue' | 'profit'>('revenue');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Sub-view Drill-down State
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [subViewSort, setSubViewSort] = useState<'revenue' | 'quantity' | 'profit' | 'name'>('revenue');
  const [subViewSearch, setSubViewSearch] = useState<string>('');
  const [subViewGrouping, setSubViewGrouping] = useState<'variant' | 'base'>('variant');
  const [subViewHoveredIdx, setSubViewHoveredIdx] = useState<number | null>(null);

  // Close subview on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedCategory) {
        setSelectedCategory(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCategory]);

  const chartData = useMemo(() => {
    const categoryMap = new Map<string, { name: string; revenue: number; profit: number; quantity: number }>();

    const safeOrders = Array.isArray(orders) ? orders : [];
    safeOrders.forEach(order => {
      const items = Array.isArray(order?.items) ? order.items : [];
      items.forEach(item => {
        if (isDiscountOrNonProductItem(item)) return;

        const quantity = Number(item.quantity) || 0;
        if (quantity <= 0) return;

        const groupKey = groupMode === 'category'
          ? resolveCategoryName(item, menuItems, menuSections)
          : getBaseName(item.name || '');

        const price = Number(item.price) || 0;
        const cost = Number(item.cost ?? 0) || 0;
        const revenue = price * quantity;
        const profit = revenue - (cost * quantity);

        const existing = categoryMap.get(groupKey);
        if (existing) {
          existing.revenue += revenue;
          existing.profit += profit;
          existing.quantity += quantity;
        } else {
          categoryMap.set(groupKey, {
            name: groupKey,
            revenue,
            profit,
            quantity
          });
        }
      });
    });

    return Array.from(categoryMap.values())
      .map(item => ({
        name: item.name,
        value: Math.round(viewMode === 'revenue' ? item.revenue : item.profit),
        revenue: item.revenue,
        profit: item.profit,
        quantity: item.quantity
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [orders, viewMode, groupMode, menuItems, menuSections]);

  const totalValue = useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.value, 0);
  }, [chartData]);

  // Open drill-down subview modal for the selected category
  const openCategoryDrillDown = (rawName: any) => {
    if (groupMode !== 'category') return;
    let name = '';
    if (typeof rawName === 'string') name = rawName;
    else if (rawName?.name && typeof rawName.name === 'string') name = rawName.name;
    else if (rawName?.payload?.name && typeof rawName.payload.name === 'string') name = rawName.payload.name;
    else if (rawName?.value && typeof rawName.value === 'string') name = rawName.value;

    if (name.trim()) {
      setSelectedCategory(name.trim());
    }
  };



  // Sub-view items calculation for the selected category
  const subViewData = useMemo(() => {
    if (!selectedCategory) return null;

    const itemMap = new Map<string, {
      name: string;
      baseName: string;
      revenue: number;
      profit: number;
      quantity: number;
      avgPrice: number;
    }>();

    let totalCategoryRevenue = 0;
    let totalCategoryProfit = 0;
    let totalCategoryQuantity = 0;

    const safeOrders = Array.isArray(orders) ? orders : [];
    safeOrders.forEach(order => {
      const items = Array.isArray(order?.items) ? order.items : [];
      items.forEach(item => {
        if (isDiscountOrNonProductItem(item)) return;

        const quantity = Number(item.quantity) || 0;
        if (quantity <= 0) return;

        const catName = resolveCategoryName(item, menuItems, menuSections);
        if (catName.trim().toLowerCase() !== selectedCategory.trim().toLowerCase()) {
          return;
        }

        const rawName = (item.name || '').trim();
        const base = getBaseName(rawName);
        const keyName = subViewGrouping === 'base' ? base : rawName;

        const price = Number(item.price) || 0;
        const cost = Number(item.cost ?? 0) || 0;
        const revenue = price * quantity;
        const profit = revenue - (cost * quantity);

        totalCategoryRevenue += revenue;
        totalCategoryProfit += profit;
        totalCategoryQuantity += quantity;

        const existing = itemMap.get(keyName);
        if (existing) {
          existing.revenue += revenue;
          existing.profit += profit;
          existing.quantity += quantity;
        } else {
          itemMap.set(keyName, {
            name: keyName,
            baseName: base,
            revenue,
            profit,
            quantity,
            avgPrice: price
          });
        }
      });
    });

    // Compute shares and sort
    const rawItems = Array.from(itemMap.values()).map(it => {
      const revenueShare = totalCategoryRevenue > 0 ? (it.revenue / totalCategoryRevenue) * 100 : 0;
      const profitShare = totalCategoryProfit > 0 ? (it.profit / totalCategoryProfit) * 100 : 0;
      const quantityShare = totalCategoryQuantity > 0 ? (it.quantity / totalCategoryQuantity) * 100 : 0;
      const effectiveAvgPrice = it.quantity > 0 ? it.revenue / it.quantity : it.avgPrice;
      const value = Math.round(viewMode === 'revenue' ? it.revenue : it.profit);

      return {
        ...it,
        avgPrice: effectiveAvgPrice,
        revenueShare,
        profitShare,
        quantityShare,
        value
      };
    });

    // Apply search filter
    const filtered = rawItems.filter(it => 
      !subViewSearch || it.name.toLowerCase().includes(subViewSearch.toLowerCase().trim())
    );

    // Apply sort
    filtered.sort((a, b) => {
      if (subViewSort === 'quantity') return b.quantity - a.quantity;
      if (subViewSort === 'profit') return b.profit - a.profit;
      if (subViewSort === 'name') return a.name.localeCompare(b.name);
      return b.revenue - a.revenue;
    });

    const profitMargin = totalCategoryRevenue > 0 ? (totalCategoryProfit / totalCategoryRevenue) * 100 : 0;

    return {
      categoryName: selectedCategory,
      totalRevenue: totalCategoryRevenue,
      totalProfit: totalCategoryProfit,
      totalQuantity: totalCategoryQuantity,
      profitMargin,
      items: filtered,
      allItemsCount: rawItems.length
    };
  }, [selectedCategory, orders, menuItems, menuSections, subViewGrouping, subViewSearch, subViewSort, viewMode]);

  // CSV export for the drill-down subview
  const handleExportSubViewCsv = () => {
    if (!subViewData || subViewData.items.length === 0) return;
    const headers = ['Rank', 'Item Name', 'Category', 'Channel', 'Units Sold', 'Revenue (₹)', '% of Category Revenue', 'Profit (₹)', '% of Category Profit', 'Avg Price (₹)'];
    const rows = subViewData.items.map((it, idx) => [
      idx + 1,
      `"${it.name.replace(/"/g, '""')}"`,
      `"${selectedCategory}"`,
      `"${title || 'All'}"`,
      it.quantity,
      it.revenue,
      `${it.revenueShare.toFixed(2)}%`,
      it.profit,
      `${it.profitShare.toFixed(2)}%`,
      Math.round(it.avgPrice)
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${title ? title.replace(/\s+/g, '_') : 'Channel'}_${selectedCategory}_Items_Breakdown.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className={`bg-white rounded-[2.5rem] lg:rounded-[3rem] shadow-xl p-6 sm:p-7 xl:p-8 border border-brand-stone h-full flex flex-col transition-all min-w-0 ${disabled ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
               <PieChartIcon className="w-5 h-5" style={{ color: colorTheme || '#EF4444' }} />
               <h3 className="text-xl font-black text-brand-brown uppercase italic tracking-tighter">
                 {title ? (
                   <>
                     {title.split(' ')[0]} <span style={{ color: colorTheme || '#EF4444' }}>{title.split(' ').slice(1).join(' ') || 'Performance'}</span>
                   </>
                 ) : (
                   <>Item <span className="text-brand-red">Performance</span></>
                 )}
               </h3>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest">
                {groupMode === 'category' ? 'Rev/Prof share by menu category' : 'Rev/Prof share by item'}
              </p>
              {groupMode === 'category' && (
                <span className="text-[8px] font-black text-brand-brown/50 bg-brand-brown/5 px-2.5 py-0.5 rounded-full uppercase tracking-wider hidden sm:inline-block">
                  Click slice or category to drill down
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 bg-brand-brown/5 p-1 rounded-2xl border border-brand-stone/30 self-start">
            <button 
              type="button"
              onClick={() => setViewMode('revenue')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                viewMode === 'revenue' ? 'bg-brand-brown text-brand-yellow shadow-md' : 'text-brand-brown/40 hover:bg-brand-brown/10'
              }`}
            >
              <DollarSign className="w-3 h-3" />
              Rev
            </button>
            <button 
              type="button"
              onClick={() => setViewMode('profit')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                viewMode === 'profit' ? 'bg-brand-red text-white shadow-md' : 'text-brand-brown/40 hover:bg-brand-brown/10'
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              Prof
            </button>
          </div>
        </div>

        {/* Donut Chart Container */}
        <div className="relative w-full h-[240px] flex items-center justify-center shrink-0">
          {chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart onMouseLeave={() => setHoveredIndex(null)}>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={4}
                    dataKey="value"
                    nameKey="name"
                    stroke="none"
                    isAnimationActive={false}
                    onMouseEnter={(_, index) => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={(entry, index) => {
                      const cat = (entry && (entry.name || entry.payload?.name || entry.value)) || (index !== undefined && chartData[index] ? chartData[index].name : '');
                      if (cat) openCategoryDrillDown(cat);
                    }}
                  >
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]} 
                        className="transition-opacity duration-200 cursor-pointer"
                        opacity={hoveredIndex === null || hoveredIndex === index ? 1 : 0.4}
                        onClick={() => openCategoryDrillDown(entry.name)}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Center Donut Info - Perfectly Centered, No Overlapping Floating Popups */}
              <div 
                onClick={() => {
                  if (hoveredIndex !== null && chartData[hoveredIndex] && groupMode === 'category') {
                    openCategoryDrillDown(chartData[hoveredIndex].name);
                  }
                }}
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none w-[115px] flex flex-col items-center justify-center transition-all duration-200 ${
                  hoveredIndex !== null && groupMode === 'category' ? 'pointer-events-auto cursor-pointer' : ''
                }`}
              >
                {hoveredIndex !== null && chartData[hoveredIndex] ? (
                  <div className="flex flex-col items-center px-1">
                    <span 
                      className="text-[9px] font-black uppercase tracking-wider text-brand-brown truncate max-w-[110px] block leading-tight mb-0.5" 
                      title={chartData[hoveredIndex].name}
                    >
                      {chartData[hoveredIndex].name}
                    </span>
                    <span className="text-base sm:text-lg font-black text-brand-brown tracking-tighter italic leading-none">
                      ₹{chartData[hoveredIndex].value.toLocaleString()}
                    </span>
                    <div className="flex items-center gap-1 mt-1 text-[8px] font-black">
                      <span className="text-brand-red">
                        {totalValue > 0 ? ((chartData[hoveredIndex].value / totalValue) * 100).toFixed(1) : 0}%
                      </span>
                      <span className="text-brand-brown/40 font-bold">
                        • {chartData[hoveredIndex].quantity} sold
                      </span>
                    </div>
                    {groupMode === 'category' && (
                      <span className="inline-flex items-center gap-0.5 text-[7px] font-black text-brand-red uppercase tracking-wider mt-1 opacity-90">
                        View items <ChevronRight className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center px-1">
                    <span className="text-[8px] font-black text-brand-brown/40 uppercase tracking-widest block leading-none mb-1">
                      Total {viewMode === 'revenue' ? 'Rev' : 'Profit'}
                    </span>
                    <span className="text-lg sm:text-xl font-black text-brand-brown tracking-tighter italic leading-none">
                      ₹{totalValue.toLocaleString()}
                    </span>
                    <span className="text-[8px] font-bold text-brand-brown/40 uppercase tracking-wider mt-1">
                      {chartData.length} {groupMode === 'category' ? 'Categories' : 'Items'}
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs font-black text-brand-brown/20 uppercase tracking-widest">No matching sales records</p>
            </div>
          )}
        </div>

        {/* Clean, Unified Category Share Breakdown (Zero Overlap, No Duplicate Pills) */}
        {chartData.length > 0 && (
          <div className="mt-4 pt-4 border-t border-brand-stone/40 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2.5 shrink-0">
              <span className="text-[9px] font-black uppercase tracking-widest text-brand-brown/50 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-brand-brown/40" />
                {groupMode === 'category' ? 'Category Share' : 'Item Share'}
              </span>
              {groupMode === 'category' && (
                <span className="text-[8px] font-bold text-brand-brown/40 uppercase tracking-wider hidden sm:inline-block">
                  Click to inspect
                </span>
              )}
            </div>

            <div className="overflow-y-auto max-h-[160px] no-scrollbar space-y-1.5 pr-0.5">
              {chartData.map((cat, idx) => {
                const color = COLORS[idx % COLORS.length];
                const isHovered = hoveredIndex === idx;
                const pct = totalValue > 0 ? ((cat.value / totalValue) * 100).toFixed(1) : '0';

                return (
                  <div
                    key={cat.name}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => openCategoryDrillDown(cat.name)}
                    className={`flex items-center justify-between p-2 rounded-xl text-[9px] transition-all cursor-pointer border ${
                      isHovered
                        ? 'bg-brand-brown text-white border-brand-brown shadow-sm scale-[1.01]'
                        : 'bg-brand-brown/5 hover:bg-brand-brown/10 text-brand-brown border-brand-stone/40'
                    }`}
                    title={groupMode === 'category' ? `Click to view all ${cat.name} items` : undefined}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: color }}
                      />
                      <span className={`font-black uppercase tracking-tight truncate ${isHovered ? 'text-brand-yellow' : 'text-brand-brown'}`}>
                        {cat.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 text-right">
                      <span className={`font-black text-[10px] ${isHovered ? 'text-white' : 'text-brand-brown'}`}>
                        ₹{cat.value.toLocaleString()}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black ${
                        isHovered ? 'bg-white/20 text-white' : 'bg-brand-brown/10 text-brand-red'
                      }`}>
                        {pct}%
                      </span>
                      {groupMode === 'category' && (
                        <ChevronRight className={`w-3 h-3 transition-transform ${
                          isHovered ? 'text-brand-yellow translate-x-0.5' : 'text-brand-brown/30'
                        }`} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SUB-VIEW MODAL: Granular Item Breakdown for Selected Category (e.g. MOMOS) */}
      {/* ========================================================================= */}
      {selectedCategory && subViewData && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-6 lg:p-8 animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-brand-brown/75 backdrop-blur-md" 
            onClick={() => setSelectedCategory(null)} 
          />

          {/* Modal Container */}
          <div className="bg-white rounded-[2.5rem] lg:rounded-[3rem] p-6 lg:p-8 border-4 border-brand-brown shadow-2xl relative z-10 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-brand-stone/60 shrink-0">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  {title && (
                    <span 
                      className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-white shadow-sm"
                      style={{ backgroundColor: colorTheme || '#3B82F6' }}
                    >
                      {title}
                    </span>
                  )}
                  <span className="text-[10px] font-black uppercase text-brand-brown/50 tracking-widest flex items-center gap-1">
                    <Layers className="w-3 h-3 text-brand-brown/40" />
                    Category Sub-View
                  </span>
                </div>
                <h3 className="text-2xl lg:text-3xl font-black text-brand-brown uppercase tracking-tighter italic mt-1">
                  {selectedCategory} <span style={{ color: colorTheme || '#3B82F6' }}>Item Breakdown</span>
                </h3>
                <p className="text-[10px] font-bold text-brand-brown/50 uppercase tracking-widest mt-0.5">
                  Percentage and revenue share of each individual {selectedCategory.toLowerCase()} item
                </p>
              </div>

              <div className="flex items-center gap-2.5 self-end sm:self-center">
                <button
                  type="button"
                  onClick={handleExportSubViewCsv}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-brown/5 hover:bg-brand-brown hover:text-brand-yellow text-brand-brown rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer border border-brand-stone"
                  title="Download CSV breakdown of items"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setSelectedCategory(null)} 
                  className="p-2.5 hover:bg-brand-stone/40 text-brand-brown rounded-2xl transition-colors cursor-pointer border border-brand-stone"
                  title="Close Sub-View (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick KPI Stats Chips Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b border-brand-stone/40 shrink-0">
              <div className="bg-brand-cream/60 p-3 rounded-2xl border border-brand-stone/40">
                <span className="text-[8px] font-black text-brand-brown/40 uppercase tracking-widest block">Total {selectedCategory} Rev</span>
                <span className="text-lg lg:text-xl font-black text-brand-brown italic">
                  ₹{subViewData.totalRevenue.toLocaleString()}
                </span>
                <span className="text-[8px] font-black text-emerald-600 block mt-0.5">100% of category</span>
              </div>
              <div className="bg-brand-cream/60 p-3 rounded-2xl border border-brand-stone/40">
                <span className="text-[8px] font-black text-brand-brown/40 uppercase tracking-widest block">Units Sold</span>
                <span className="text-lg lg:text-xl font-black text-brand-brown italic">
                  {subViewData.totalQuantity.toLocaleString()}
                </span>
                <span className="text-[8px] font-bold text-brand-brown/40 block mt-0.5">{subViewData.allItemsCount} distinct varieties</span>
              </div>
              <div className="bg-brand-cream/60 p-3 rounded-2xl border border-brand-stone/40">
                <span className="text-[8px] font-black text-brand-brown/40 uppercase tracking-widest block">Category Gross Profit</span>
                <span className="text-lg lg:text-xl font-black text-emerald-600 italic">
                  ₹{subViewData.totalProfit.toLocaleString()}
                </span>
                <span className="text-[8px] font-black text-brand-brown/60 block mt-0.5">{subViewData.profitMargin.toFixed(1)}% gross margin</span>
              </div>
              <div className="bg-brand-cream/60 p-3 rounded-2xl border border-brand-stone/40">
                <span className="text-[8px] font-black text-brand-brown/40 uppercase tracking-widest block">Avg. Price / Item</span>
                <span className="text-lg lg:text-xl font-black text-brand-brown italic">
                  ₹{subViewData.totalQuantity > 0 ? (subViewData.totalRevenue / subViewData.totalQuantity).toFixed(1) : '0'}
                </span>
                <span className="text-[8px] font-bold text-brand-brown/40 block mt-0.5">weighted average</span>
              </div>
            </div>

            {/* Filter & Options Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-brand-stone/40 shrink-0">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-brand-brown/40" />
                  <input
                    type="text"
                    placeholder={`Search ${selectedCategory.toLowerCase()} items...`}
                    value={subViewSearch}
                    onChange={(e) => setSubViewSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-brand-cream/60 rounded-xl text-[10px] font-bold uppercase text-brand-brown placeholder-brand-brown/30 outline-none border border-brand-stone/50 focus:border-brand-brown transition-all"
                  />
                  {subViewSearch && (
                    <button
                      type="button"
                      onClick={() => setSubViewSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-brown/40 hover:text-brand-brown"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Grouping mode: exact variant vs base item */}
                <div className="flex items-center bg-brand-brown/5 p-0.5 rounded-xl border border-brand-stone/40">
                  <button
                    type="button"
                    onClick={() => setSubViewGrouping('variant')}
                    className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      subViewGrouping === 'variant' ? 'bg-brand-brown text-brand-yellow shadow-sm' : 'text-brand-brown/50 hover:text-brand-brown'
                    }`}
                    title="Show distinct preparation variants and sizes"
                  >
                    By Variant
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubViewGrouping('base')}
                    className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      subViewGrouping === 'base' ? 'bg-brand-brown text-brand-yellow shadow-sm' : 'text-brand-brown/50 hover:text-brand-brown'
                    }`}
                    title="Combine sizes and preparations into base item name"
                  >
                    Group Base
                  </button>
                </div>
              </div>

              {/* Sort pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[8px] font-black uppercase text-brand-brown/40 tracking-widest mr-1">Sort:</span>
                {(['revenue', 'quantity', 'profit', 'name'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubViewSort(s)}
                    className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      subViewSort === s ? 'bg-brand-brown text-brand-yellow shadow-sm' : 'bg-brand-cream/60 text-brand-brown/50 hover:text-brand-brown border border-brand-stone/30'
                    }`}
                  >
                    {s === 'revenue' ? '% Share' : s === 'quantity' ? 'Units' : s === 'profit' ? 'Profit' : 'A-Z'}
                  </button>
                ))}
              </div>
            </div>

            {/* Sub-view Content: Split Donut + Ranked Contribution Breakdown */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4 min-h-0">
              {/* Left Column: Visual Donut Chart of Items */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center bg-brand-cream/30 rounded-3xl p-4 border border-brand-stone/40 relative min-h-[260px] lg:min-h-0">
                <div className="w-full h-full relative min-h-[240px]">
                  {subViewData.items.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                      <PieChart onMouseLeave={() => setSubViewHoveredIdx(null)}>
                        <Pie
                          data={subViewData.items}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={95}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                          isAnimationActive={false}
                          onMouseEnter={(_, index) => setSubViewHoveredIdx(index)}
                          onMouseLeave={() => setSubViewHoveredIdx(null)}
                        >
                          {subViewData.items.map((_, index) => (
                            <Cell
                              key={`sub-cell-${index}`}
                              fill={COLORS[index % COLORS.length]}
                              opacity={subViewHoveredIdx === null || subViewHoveredIdx === index ? 1 : 0.4}
                              className="transition-opacity duration-200 cursor-pointer"
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          wrapperStyle={{ zIndex: 100 }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const it = payload[0].payload;
                              return (
                                <div className="bg-[#1A1817] p-3 rounded-2xl shadow-2xl border border-white/10 text-white min-w-[160px]">
                                  <p className="text-[9px] font-black uppercase text-brand-yellow mb-1 border-b border-white/10 pb-1">{it.name}</p>
                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[9px]">
                                      <span className="text-white/50 uppercase">Category Share:</span>
                                      <span className="font-black text-brand-red text-xs">{it.revenueShare.toFixed(1)}%</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[9px]">
                                      <span className="text-white/50 uppercase">Revenue:</span>
                                      <span className="font-black text-white">₹{it.revenue.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[9px]">
                                      <span className="text-white/50 uppercase">Units Sold:</span>
                                      <span className="font-black text-white">{it.quantity}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[9px]">
                                      <span className="text-white/50 uppercase">Gross Profit:</span>
                                      <span className="font-black text-emerald-400">₹{it.profit.toLocaleString()}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-xs font-black text-brand-brown/30 uppercase tracking-widest">No items matching search</p>
                    </div>
                  )}

                  {/* Donut Center Display */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                    <p className="text-[7px] font-black uppercase tracking-widest text-brand-brown/40">Total {selectedCategory}</p>
                    <p className="text-xl font-black text-brand-brown tracking-tighter italic">
                      ₹{subViewData.totalRevenue.toLocaleString()}
                    </p>
                    <p className="text-[8px] font-black text-brand-red uppercase">
                      {subViewData.items.length} items
                    </p>
                  </div>
                </div>

                <p className="text-[8px] font-bold text-brand-brown/40 uppercase tracking-widest text-center mt-2">
                  Hover over slices or items to cross-inspect revenue share
                </p>
              </div>

              {/* Right Column: Ranked Items Contribution List */}
              <div className="lg:col-span-7 flex flex-col overflow-hidden min-h-0">
                <div className="flex items-center justify-between pb-2 px-1 text-[9px] font-black uppercase tracking-widest text-brand-brown/40 border-b border-brand-stone/30 shrink-0">
                  <span>Item & Volume</span>
                  <div className="flex items-center gap-6">
                    <span>Revenue (₹)</span>
                    <span className="text-brand-brown font-black">% of {selectedCategory}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 py-3 pr-1">
                  {subViewData.items.length === 0 ? (
                    <div className="text-center py-12 text-brand-brown/40">
                      <p className="text-xs font-black uppercase tracking-widest">No items found</p>
                      <p className="text-[10px] mt-1 font-bold">Try adjusting your search query</p>
                    </div>
                  ) : (
                    subViewData.items.map((it, idx) => {
                      const color = COLORS[idx % COLORS.length];
                      const isHovered = subViewHoveredIdx === idx;

                      return (
                        <div
                          key={`sub-item-${idx}`}
                          onMouseEnter={() => setSubViewHoveredIdx(idx)}
                          onMouseLeave={() => setSubViewHoveredIdx(null)}
                          className={`p-3 rounded-2xl border transition-all ${
                            isHovered 
                              ? 'bg-brand-brown text-white border-brand-brown shadow-lg scale-[1.01]' 
                              : 'bg-brand-cream/30 hover:bg-brand-cream border-brand-stone/40 text-brand-brown'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span 
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0 shadow-sm"
                                style={{ backgroundColor: color }}
                              >
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <h4 className={`text-xs font-black uppercase truncate tracking-tight ${isHovered ? 'text-brand-yellow' : 'text-brand-brown'}`}>
                                  {it.name}
                                </h4>
                                <div className="flex items-center gap-2 text-[8px] font-bold opacity-60 uppercase mt-0.5">
                                  <span>{it.quantity} sold</span>
                                  <span>•</span>
                                  <span>Avg ₹{it.avgPrice.toFixed(0)}</span>
                                  <span>•</span>
                                  <span>Profit ₹{it.profit.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 text-right shrink-0">
                              <div className="text-right">
                                <span className={`text-xs font-black block leading-none ${isHovered ? 'text-white' : 'text-brand-brown'}`}>
                                  ₹{it.revenue.toLocaleString()}
                                </span>
                                <span className="text-[8px] font-bold opacity-60 block mt-0.5">
                                  {it.quantityShare.toFixed(1)}% qty
                                </span>
                              </div>

                              <div className="min-w-[65px] text-right">
                                <span className={`text-sm font-black italic block leading-none ${isHovered ? 'text-brand-yellow' : 'text-brand-red'}`}>
                                  {it.revenueShare.toFixed(1)}%
                                </span>
                                <span className="text-[7px] font-black uppercase tracking-wider opacity-60 block mt-0.5">
                                  share
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Visual Progress Bar of % Share */}
                          <div className="mt-2.5 w-full bg-black/10 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{ 
                                width: `${Math.min(100, Math.max(1, it.revenueShare))}%`,
                                backgroundColor: color
                              }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Subview Summary Footer */}
                <div className="pt-3 border-t border-brand-stone/40 flex items-center justify-between text-[9px] font-bold text-brand-brown/50 uppercase tracking-widest shrink-0">
                  <span>Showing {subViewData.items.length} items accounting for 100% of {selectedCategory}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className="text-brand-brown font-black hover:text-brand-red transition-colors cursor-pointer"
                  >
                    Done • Close View
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ItemCategoryPieChart;
