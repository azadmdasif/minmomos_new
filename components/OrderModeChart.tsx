
import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CompletedOrder } from '../types';

interface OrderModeChartProps {
  orders: CompletedOrder[];
}

const OrderModeChart: React.FC<OrderModeChartProps> = ({ orders }) => {
  const data = useMemo(() => {
    let dineInRev = 0;
    let takeawayRev = 0;
    let deliveryRev = 0;

    orders.forEach(o => {
      const rev = o.type === 'DELIVERY' && o.manualTotal !== undefined ? o.manualTotal : o.total;
      if (o.type === 'DINE_IN') dineInRev += rev;
      else if (o.type === 'TAKEAWAY') takeawayRev += rev;
      else if (o.type === 'DELIVERY') deliveryRev += rev;
    });

    const total = dineInRev + takeawayRev + deliveryRev;
    
    return [
      { name: 'Dine-In', value: dineInRev, color: '#EF4444', pct: total > 0 ? (dineInRev/total*100).toFixed(1) : "0" },
      { name: 'Takeaway', value: takeawayRev, color: '#4F46E5', pct: total > 0 ? (takeawayRev/total*100).toFixed(1) : "0" },
      { name: 'Delivery', value: deliveryRev, color: '#db2777', pct: total > 0 ? (deliveryRev/total*100).toFixed(1) : "0" },
    ].filter(d => d.value > 0);
  }, [orders]);

  const totalValue = data.reduce((sum, item) => sum + item.value, 0);

  if (data.length === 0) return null;

  return (
    <div className="bg-white p-6 lg:p-8 rounded-[2rem] lg:rounded-[3rem] shadow-xl border border-brand-stone">
      <div className="mb-8">
        <h3 className="text-xl font-black text-brand-brown uppercase italic tracking-tighter">Order <span className="text-brand-red">Channels</span></h3>
        <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">Revenue distribution by ordering mode</p>
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
                  <p className="text-[12px] font-black text-brand-brown/60 tracking-tight">{item.pct}% of Revenue</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-brand-brown">₹{item.value.toLocaleString()}</p>
              </div>
            </div>
          ))}
          <div className="pt-4 mt-4 border-t border-brand-stone/50 flex justify-between items-center px-4">
            <p className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest">Total Sales</p>
            <p className="text-xl font-black text-brand-brown tracking-tighter">₹{totalValue.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderModeChart;
