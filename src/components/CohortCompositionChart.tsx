
import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from 'recharts';
import { Layers, Calendar } from 'lucide-react';

interface CohortData {
  customer_phone: string;
  order_date: string;
  joined_date: string;
}

interface CohortCompositionChartProps {
  data: CohortData[];
  targetPeriod: string | null;
  granularity: 'MONTH' | 'WEEK';
}

const getWeekNumber = (d: Date) => {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

const getStartOfWeek = (d: Date) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date;
};

const CohortCompositionChart: React.FC<CohortCompositionChartProps> = ({ data, targetPeriod, granularity }) => {
  const chartData = useMemo(() => {
    if (!targetPeriod || data.length === 0) return [];

    // 1. Filter orders that happened in the target period
    const ordersInPeriod = data.filter(order => {
      const orderDate = new Date(order.order_date);
      let periodKey = '';
      if (granularity === 'MONTH') {
        periodKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
      } else {
        const normalized = getStartOfWeek(orderDate);
        const weekNum = getWeekNumber(normalized);
        let yearForWeek = normalized.getFullYear();
        if (weekNum === 1 && normalized.getMonth() === 11) yearForWeek++;
        if (weekNum >= 52 && normalized.getMonth() === 0) yearForWeek--;
        periodKey = `${yearForWeek}-W${String(weekNum).padStart(2, '0')}`;
      }
      return periodKey === targetPeriod;
    });

    if (ordersInPeriod.length === 0) return [];

    // 2. Identify repeat vs new orders
    // New: joined_date cohort === targetPeriod
    // Repeat: joined_date cohort < targetPeriod
    
    const composition: Record<string, { count: number, label: string }> = {};
    let totalRepeat = 0;

    ordersInPeriod.forEach(order => {
      const joinDate = new Date(order.joined_date);
      let joinCohortKey = '';
      let label = '';
      
      if (granularity === 'MONTH') {
        joinCohortKey = `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, '0')}`;
        const date = new Date(joinDate.getFullYear(), joinDate.getMonth(), 1);
        label = date.toLocaleString('default', { month: 'short', year: '2-digit' }).replace('20', "'");
      } else {
        const normalized = getStartOfWeek(joinDate);
        const weekNum = getWeekNumber(normalized);
        let yearForWeek = normalized.getFullYear();
        if (weekNum === 1 && normalized.getMonth() === 11) yearForWeek++;
        if (weekNum >= 52 && normalized.getMonth() === 0) yearForWeek--;
        joinCohortKey = `${yearForWeek}-W${String(weekNum).padStart(2, '0')}`;
        label = joinCohortKey;
      }

      // Only count repeat orders (joined before the target period)
      if (joinCohortKey < targetPeriod) {
        if (!composition[joinCohortKey]) {
          composition[joinCohortKey] = { count: 0, label };
        }
        composition[joinCohortKey].count++;
        totalRepeat++;
      }
    });

    const results = Object.entries(composition)
      .map(([key, val]) => ({
        key,
        name: val.label,
        value: val.count,
        percentage: totalRepeat > 0 ? Math.round((val.count / totalRepeat) * 100) : 0
      }))
      .sort((a, b) => a.key.localeCompare(b.key));

    return results;
  }, [data, targetPeriod, granularity]);

  const colors = ['#8B4513', '#D2691E', '#FF4500', '#FF8C00', '#DAA520', '#2F4F4F', '#A0522D'];

  if (!targetPeriod) return null;

  return (
    <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-brand-stone space-y-6 animate-in slide-in-from-right-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-red/5 rounded-2xl">
            <Layers className="w-5 h-5 text-brand-red" />
          </div>
          <div>
            <h3 className="text-xl font-black text-brand-brown uppercase italic">Repeat <span className="text-brand-red">Composition</span></h3>
            <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest">Where do {targetPeriod} repeat orders come from?</p>
          </div>
        </div>
        
        <div className="px-4 py-2 bg-brand-brown text-brand-yellow rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
           <Calendar className="w-3 h-3" />
           {targetPeriod}
        </div>
      </div>

      {chartData.length > 0 ? (
        <div className="space-y-8">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 700 }}
                  label={{ value: 'Cohort (Join Period)', position: 'insideBottom', offset: -10, fontSize: 8, fontWeight: 900, fill: '#8B4513' }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 700 }}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(139, 69, 19, 0.05)' }}
                  contentStyle={{ 
                    backgroundColor: '#ffffff', 
                    borderRadius: '16px', 
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  }}
                  labelStyle={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '12px', marginBottom: '4px', color: '#8B4513' }}
                  itemStyle={{ fontWeight: 700, fontSize: '11px' }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                  <LabelList 
                    dataKey="percentage" 
                    position="top" 
                    formatter={(v: any) => `${v}%`}
                    style={{ fontSize: 10, fontWeight: 900, fill: '#8B4513' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             {chartData.map((item, idx) => (
               <div key={item.key} className="flex items-center justify-between p-4 bg-brand-brown/5 rounded-2xl border border-brand-brown/10 group hover:border-brand-red transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black text-white" style={{ backgroundColor: colors[idx % colors.length] }}>
                      {idx + 1}
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-brand-brown uppercase italic leading-none mb-1">Cohort {item.name}</p>
                      <p className="text-[8px] font-bold text-brand-brown/40 uppercase tracking-widest">{item.value} Repeat Orders</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-brand-brown leading-none">{item.percentage}%</p>
                    <p className="text-[8px] font-black text-brand-red uppercase tracking-tighter">Contribution</p>
                  </div>
               </div>
             ))}
          </div>
        </div>
      ) : (
        <div className="py-20 text-center space-y-4">
          <div className="w-16 h-16 bg-brand-brown/5 rounded-full flex items-center justify-center mx-auto">
            <Layers className="w-8 h-8 text-brand-brown/20" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-black text-brand-brown/60 uppercase">No Repeat Data Found</p>
            <p className="text-[10px] font-bold text-brand-brown/30 uppercase tracking-widest">Try selecting a more recent period</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CohortCompositionChart;
