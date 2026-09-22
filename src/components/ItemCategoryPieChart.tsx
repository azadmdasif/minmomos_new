
import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { CompletedOrder, MenuItem, MenuSection } from '../types';
import { PieChart as PieChartIcon, TrendingUp, DollarSign } from 'lucide-react';
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
  '#14B8A6', '#F97316'
];

const getBaseName = (name: string): string => {
  // Enhanced regex to remove common size markers both at start, end, and in punctuation
  return name
    .replace(/\s*\(?(Small|Medium|Large|Regular|Full|Half|Extra|Premium)\)?\s*/gi, '')
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

  return (
    <div className={`bg-white rounded-[3rem] shadow-xl p-8 border border-brand-stone h-full flex flex-col transition-all min-w-0 lg:hover:scale-[1.01] ${disabled ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
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
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest">
            {groupMode === 'category' ? 'Rev/Prof share by menu category' : 'Rev/Prof share by item'}
          </p>
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

      <div className="flex-1 min-h-[350px] relative min-w-0">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280} className="relative z-10">
            <PieChart onMouseLeave={() => setHoveredIndex(null)}>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
                isAnimationActive={false}
                onMouseEnter={(_, index) => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {chartData.map((_, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[index % COLORS.length]} 
                    className="transition-opacity duration-200 cursor-pointer"
                    opacity={hoveredIndex === null || hoveredIndex === index ? 1 : 0.45}
                  />
                ))}
              </Pie>
              <Tooltip 
                wrapperStyle={{ zIndex: 50, pointerEvents: 'none' }}
                allowEscapeViewBox={{ x: true, y: true }}
                offset={15}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    const val = payload[0].value;
                    const percentage = totalValue > 0 ? ((Number(val) / totalValue) * 100).toFixed(1) : '0';
                    return (
                      <div className="bg-[#1A1817] p-4 shadow-2xl rounded-2xl border border-white/10 backdrop-blur-xl">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 border-b border-white/5 pb-2">{data.name}</p>
                        <div className="space-y-1.5">
                          <p className="text-sm font-black text-white">
                            ₹{Number(val).toLocaleString()} <span className="text-brand-yellow font-bold uppercase text-[9px] ml-1">{viewMode === 'revenue' ? 'Rev' : 'Prof'}</span>
                          </p>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[9px] font-bold text-white/50 uppercase tracking-tighter">Units Sold</span>
                            <span className="text-[10px] font-black text-white">{data.quantity}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[9px] font-bold text-white/50 uppercase tracking-tighter">Contribution</span>
                            <span className="text-[10px] font-black text-brand-red">{percentage}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend 
                verticalAlign="bottom" 
                height={80}
                content={(props) => {
                  const { payload } = props;
                  // Explicitly sort legend items by their value in descending order
                  const sortedPayload = [...(payload || [])].sort((a: any, b: any) => {
                    const valA = a.payload?.value ?? 0;
                    const valB = b.payload?.value ?? 0;
                    return valB - valA;
                  });
                  return (
                    <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 mt-8 px-4 overflow-y-auto max-h-[140px] no-scrollbar">
                      {sortedPayload.map((entry: any, index: number) => {
                        const itemData = entry.payload;
                        const itemValue = itemData?.value ?? 0;
                        const percentage = totalValue > 0 ? ((itemValue / totalValue) * 100).toFixed(1) : '0';
                        return (
                          <div 
                            key={`legend-${index}`} 
                            className="flex items-center gap-3 group cursor-pointer relative"
                            onMouseEnter={() => setHoveredIndex(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                          >
                            <div className="w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-125 shadow-sm" style={{ backgroundColor: entry.color }} />
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-brand-brown uppercase tracking-tight leading-none group-hover:text-brand-red transition-colors">
                                {entry.value}
                              </span>
                              <span className="text-[8px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
                                {percentage}% Share
                              </span>
                            </div>
                            
                            {/* Hover Details Popover */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-[100]">
                               <div className="bg-[#1A1817] text-white p-3 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/20 min-w-[130px] backdrop-blur-xl">
                                  <p className="text-[8px] font-black uppercase tracking-widest text-brand-yellow/80 border-b border-white/10 pb-2 mb-2">{entry.value}</p>
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-[9px] font-bold text-white/40 uppercase tracking-tighter">Qty Sold</span>
                                      <span className="text-[11px] font-black">{itemData.quantity}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-[9px] font-bold text-white/40 uppercase tracking-tighter">Total Rev</span>
                                      <span className="text-[11px] font-black text-brand-yellow">₹{itemData.revenue?.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-[9px] font-bold text-white/40 uppercase tracking-tighter">Market Share</span>
                                      <span className="text-[11px] font-black text-brand-red">{percentage}%</span>
                                    </div>
                                  </div>
                               </div>
                               <div className="w-3 h-3 bg-[#1A1817] rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-r border-b border-white/20" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
             <p className="text-xs font-black text-brand-brown/20 uppercase tracking-widest">No matching sales records</p>
          </div>
        )}

        <div 
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60px] text-center pointer-events-none transition-opacity duration-200 z-0 ${
            hoveredIndex !== null ? 'opacity-0' : 'opacity-100'
          }`}
        >
           <p className="text-[8px] font-black text-brand-brown/30 uppercase tracking-[0.2em] mb-1">Total {viewMode === 'revenue' ? 'Rev' : 'Prof'}</p>
           <p className="text-2xl font-black text-brand-brown tracking-tighter italic">₹{totalValue.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

export default ItemCategoryPieChart;
