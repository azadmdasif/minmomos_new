
import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { CompletedOrder } from '../types';
import { PieChart as PieChartIcon, TrendingUp, DollarSign } from 'lucide-react';

interface ItemCategoryPieChartProps {
  orders: CompletedOrder[];
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

const ItemCategoryPieChart: React.FC<ItemCategoryPieChartProps> = ({ orders }) => {
  const [viewMode, setViewMode] = useState<'revenue' | 'profit'>('revenue');

  const chartData = useMemo(() => {
    const categoryMap = new Map<string, { name: string; revenue: number; profit: number }>();

    orders.forEach(order => {
      order.items.forEach(item => {
        const baseName = getBaseName(item.name);
        const revenue = item.price * item.quantity;
        const cost = (item.cost ?? 0) * item.quantity;
        const profit = revenue - cost;

        const existing = categoryMap.get(baseName);
        if (existing) {
          existing.revenue += revenue;
          existing.profit += profit;
        } else {
          categoryMap.set(baseName, {
            name: baseName,
            revenue,
            profit
          });
        }
      });
    });

    return Array.from(categoryMap.values())
      .map(item => ({
        name: item.name,
        value: Math.round(viewMode === 'revenue' ? item.revenue : item.profit)
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [orders, viewMode]);

  const totalValue = useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.value, 0);
  }, [chartData]);

  return (
    <div className="bg-white rounded-[3rem] shadow-xl p-8 border border-brand-stone h-full flex flex-col">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <PieChartIcon className="w-5 h-5 text-brand-red" />
             <h3 className="text-xl font-black text-brand-brown uppercase italic tracking-tighter">Item <span className="text-brand-red">Performance</span></h3>
          </div>
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest">Revenue/Profit share by item category</p>
        </div>

        <div className="flex items-center gap-2 bg-brand-brown/5 p-1 rounded-2xl border border-brand-stone/30 self-start">
          <button 
            onClick={() => setViewMode('revenue')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              viewMode === 'revenue' ? 'bg-brand-brown text-brand-yellow shadow-md' : 'text-brand-brown/40 hover:bg-brand-brown/10'
            }`}
          >
            <DollarSign className="w-3 h-3" />
            Revenue
          </button>
          <button 
            onClick={() => setViewMode('profit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              viewMode === 'profit' ? 'bg-brand-red text-white shadow-md' : 'text-brand-brown/40 hover:bg-brand-brown/10'
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            Profit
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-[350px] relative">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    const val = payload[0].value;
                    const percentage = totalValue > 0 ? ((Number(val) / totalValue) * 100).toFixed(1) : '0';
                    return (
                      <div className="bg-white p-4 shadow-2xl rounded-2xl border border-brand-stone/20">
                        <p className="text-[10px] font-black text-brand-brown/40 uppercase tracking-widest mb-1">{data.name}</p>
                        <p className="text-sm font-black text-brand-brown">
                          ₹{Number(val).toLocaleString()} {viewMode}
                        </p>
                        <p className="text-[10px] font-bold text-brand-red uppercase tracking-tight mt-1">
                          {percentage}% of total {viewMode}
                        </p>
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
                    <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 mt-8 px-4 overflow-y-auto max-h-[150px] no-scrollbar">
                      {sortedPayload.map((entry: any, index: number) => {
                        const itemValue = entry.payload?.value ?? 0;
                        const percentage = totalValue > 0 ? ((itemValue / totalValue) * 100).toFixed(1) : '0';
                        return (
                          <div key={`legend-${index}`} className="flex items-center gap-3 group cursor-pointer">
                            <div className="w-2.5 h-2.5 rounded-full transition-transform group-hover:scale-125 shadow-sm" style={{ backgroundColor: entry.color }} />
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-brand-brown uppercase tracking-tight leading-none">
                                {entry.value}
                              </span>
                              <span className="text-[8px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
                                {percentage}% Share
                              </span>
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

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60px] text-center pointer-events-none">
           <p className="text-[8px] font-black text-brand-brown/30 uppercase tracking-[0.2em] mb-1">Total {viewMode}</p>
           <p className="text-2xl font-black text-brand-brown tracking-tighter italic">₹{totalValue.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

export default ItemCategoryPieChart;
