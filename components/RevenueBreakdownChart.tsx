
import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CompletedOrder, Customer } from '../types';
import { getISTDateString } from '../utils/storage';

interface RevenueBreakdownChartProps {
  orders: CompletedOrder[];
  customers: Customer[];
}

const RevenueBreakdownChart: React.FC<RevenueBreakdownChartProps> = ({ orders, customers }) => {
  const data = useMemo(() => {
    let repeatRev = 0;
    let newRegRev = 0;
    let unregRev = 0;

    orders.forEach(o => {
      const total = Math.round(o.total);
      if (!o.customerPhone) {
        unregRev += total;
      } else {
        const cust = customers.find(c => c.phone === o.customerPhone);
        if (cust) {
          const joinDate = getISTDateString(cust.joinedDate);
          const orderDate = getISTDateString(o.date);
          if (joinDate === orderDate) {
            newRegRev += total;
          } else {
            repeatRev += total;
          }
        } else {
          // If customer not in list (maybe multi-store overlap or missing sync), treat as new if it's the first time we see it in this range?
          // For now, assume it's a new registration if not found in the customers state.
          newRegRev += total;
        }
      }
    });

    const total = repeatRev + newRegRev + unregRev;
    
    return [
      { name: 'Repeat Customers', value: repeatRev, color: '#10B981', pct: total > 0 ? (repeatRev/total*100).toFixed(1) : "0" },
      { name: 'New Registered', value: newRegRev, color: '#F59E0B', pct: total > 0 ? (newRegRev/total*100).toFixed(1) : "0" },
      { name: 'Unregistered', value: unregRev, color: '#EF4444', pct: total > 0 ? (unregRev/total*100).toFixed(1) : "0" },
    ];
  }, [orders, customers]);

  const totalValue = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white p-6 lg:p-8 rounded-[2rem] lg:rounded-[3rem] shadow-xl border border-brand-stone">
      <div className="mb-8">
        <h3 className="text-xl font-black text-brand-brown uppercase italic tracking-tighter">Revenue <span className="text-brand-red">Composition</span></h3>
        <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">Classification of sales by customer origin</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div className="h-[250px] lg:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                animationDuration={1000}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any) => `₹${Number(value).toLocaleString()}`}
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-4">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between p-4 bg-brand-brown/5 rounded-2xl border border-brand-stone/30 group hover:border-brand-brown/20 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                <div>
                  <p className="text-[10px] font-black uppercase text-brand-brown tracking-widest">{item.name}</p>
                  <p className="text-[12px] font-black text-brand-brown/60 tracking-tight">{item.pct}% of Total</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-brand-brown">₹{item.value.toLocaleString()}</p>
              </div>
            </div>
          ))}
          <div className="pt-4 mt-4 border-t border-brand-stone/50 flex justify-between items-center px-4">
            <p className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest">Selected Revenue</p>
            <p className="text-xl font-black text-brand-brown tracking-tighter">₹{totalValue.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RevenueBreakdownChart;
