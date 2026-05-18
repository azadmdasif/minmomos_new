
import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CompletedOrder, Customer } from '../types';
import { getISTDateString } from '../utils/storage';

interface RevenueBreakdownChartProps {
  orders: CompletedOrder[];
  customers: Customer[];
  analysisBasis: 'REVENUE' | 'ORDERS';
  compositionData?: {
    repeat: { count: number, revenue: number };
    new: { count: number, revenue: number };
    unregistered: { count: number, revenue: number };
    delivery: { count: number, revenue: number };
  };
}

const RevenueBreakdownChart: React.FC<RevenueBreakdownChartProps> = ({ orders, customers, analysisBasis, compositionData }) => {
  const data = useMemo(() => {
    if (compositionData) {
      const total = analysisBasis === 'REVENUE' 
        ? compositionData.repeat.revenue + compositionData.new.revenue + compositionData.unregistered.revenue + compositionData.delivery.revenue
        : compositionData.repeat.count + compositionData.new.count + compositionData.unregistered.count + compositionData.delivery.count;

      const getVal = (type: 'repeat' | 'new' | 'unregistered' | 'delivery') => 
        analysisBasis === 'REVENUE' ? compositionData[type].revenue : compositionData[type].count;

      return [
        { name: 'Repeat Customers', value: getVal('repeat'), color: '#10B981', pct: total > 0 ? (getVal('repeat')/total*100).toFixed(1) : "0" },
        { name: 'New Registered', value: getVal('new'), color: '#F59E0B', pct: total > 0 ? (getVal('new')/total*100).toFixed(1) : "0" },
        { name: 'Unregistered', value: getVal('unregistered'), color: '#6B7280', pct: total > 0 ? (getVal('unregistered')/total*100).toFixed(1) : "0" },
        { name: 'Zomato Users', value: getVal('delivery'), color: '#E11D48', pct: total > 0 ? (getVal('delivery')/total*100).toFixed(1) : "0" },
      ];
    }
    
    let repeatVal = 0;
    let newRegVal = 0;
    let unregVal = 0;
    let zomatoVal = 0;

    orders.forEach(o => {
      const amount = o.type === 'DELIVERY' && o.manualTotal != null ? Math.round(o.manualTotal) : Math.round(o.total);
      const valToAdd = analysisBasis === 'REVENUE' ? amount : 1;
      
      if (o.type === 'DELIVERY') {
        zomatoVal += valToAdd;
      } else if (!o.customerPhone) {
        unregVal += valToAdd;
      } else {
        const cust = customers.find(c => c.phone === o.customerPhone);
        if (cust) {
          const joinDate = getISTDateString(cust.joinedDate);
          const orderDate = getISTDateString(o.date);
          if (joinDate === orderDate) {
            newRegVal += valToAdd;
          } else {
            repeatVal += valToAdd;
          }
        } else {
          newRegVal += valToAdd;
        }
      }
    });

    const total = repeatVal + newRegVal + unregVal + zomatoVal;
    
    return [
      { name: 'Repeat Customers', value: repeatVal, color: '#10B981', pct: total > 0 ? (repeatVal/total*100).toFixed(1) : "0" },
      { name: 'New Registered', value: newRegVal, color: '#F59E0B', pct: total > 0 ? (newRegVal/total*100).toFixed(1) : "0" },
      { name: 'Unregistered', value: unregVal, color: '#6B7280', pct: total > 0 ? (unregVal/total*100).toFixed(1) : "0" },
      { name: 'Zomato Users', value: zomatoVal, color: '#E11D48', pct: total > 0 ? (zomatoVal/total*100).toFixed(1) : "0" },
    ];
  }, [orders, customers, analysisBasis]);

  const totalValue = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white p-6 lg:p-8 rounded-[2rem] lg:rounded-[3rem] shadow-xl border border-brand-stone">
      <div className="mb-8">
        <h3 className="text-xl font-black text-brand-brown uppercase italic tracking-tighter">{analysisBasis === 'REVENUE' ? 'Revenue' : 'Order Count'} <span className="text-brand-red">Composition</span></h3>
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
                formatter={(value: any) => analysisBasis === 'REVENUE' ? `₹${Number(value).toLocaleString()}` : `${Number(value).toLocaleString()} Orders`}
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
                <p className="text-lg font-black text-brand-brown">
                  {analysisBasis === 'REVENUE' ? `₹${item.value.toLocaleString()}` : `${item.value.toLocaleString()}`}
                </p>
              </div>
            </div>
          ))}
          <div className="pt-4 mt-4 border-t border-brand-stone/50 flex justify-between items-center px-4">
            <p className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest">Selected {analysisBasis === 'REVENUE' ? 'Revenue' : 'Orders'}</p>
            <p className="text-xl font-black text-brand-brown tracking-tighter">
              {analysisBasis === 'REVENUE' ? `₹${totalValue.toLocaleString()}` : totalValue.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RevenueBreakdownChart;
