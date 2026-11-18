import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CompletedOrder } from '../types';
import { isStudentFreeMojitoOrder } from '../utils/storage';

interface OrderModeChartProps {
  orders: CompletedOrder[];
  analysisBasis: 'REVENUE' | 'ORDERS';
}

type DeliveryViewMode = 'ALL' | 'SPLIT' | 'MINMOMOS' | 'MINCHICKEN';

const OrderModeChart: React.FC<OrderModeChartProps> = ({ orders, analysisBasis }) => {
  const [deliveryView, setDeliveryView] = useState<DeliveryViewMode>('ALL');

  const data = useMemo(() => {
    let dineInVal = 0;
    let takeawayVal = 0;
    let deliveryVal = 0;
    let minmomosVal = 0;
    let minchickenVal = 0;
    let studentVal = 0;

    orders.forEach(o => {
      const amount = o.type === 'DELIVERY' && o.manualTotal != null ? o.manualTotal : o.total;
      const valToAdd = analysisBasis === 'REVENUE' ? amount : 1;

      if (isStudentFreeMojitoOrder(o)) {
        studentVal += valToAdd;
      } else if (o.type === 'DINE_IN') {
        dineInVal += valToAdd;
      } else if (o.type === 'TAKEAWAY') {
        takeawayVal += valToAdd;
      } else if (o.type === 'DELIVERY') {
        const brand = (o.deliveryBrand || '').toUpperCase();
        if (brand === 'MINCHICKEN') {
          minchickenVal += valToAdd;
          if (deliveryView === 'ALL' || deliveryView === 'MINCHICKEN') deliveryVal += valToAdd;
        } else {
          minmomosVal += valToAdd;
          if (deliveryView === 'ALL' || deliveryView === 'MINMOMOS') deliveryVal += valToAdd;
        }
      }
    });

    const total =
      deliveryView === 'SPLIT'
        ? dineInVal + takeawayVal + minmomosVal + minchickenVal + studentVal
        : dineInVal + takeawayVal + deliveryVal + studentVal;

    const pct = (v: number) => (total > 0 ? ((v / total) * 100).toFixed(1) : '0');

    const slices = [
      { name: 'Dine-In', value: dineInVal, color: '#EF4444', pct: pct(dineInVal) },
      { name: 'Takeaway', value: takeawayVal, color: '#4F46E5', pct: pct(takeawayVal) }
    ];

    if (deliveryView === 'SPLIT') {
      slices.push(
        { name: 'Delivery • 🥟 MinMomos', value: minmomosVal, color: '#D95323', pct: pct(minmomosVal) },
        { name: 'Delivery • 🍗 MinChicken', value: minchickenVal, color: '#D97706', pct: pct(minchickenVal) }
      );
    } else {
      const deliveryLabel =
        deliveryView === 'MINMOMOS'
          ? 'Delivery • 🥟 MinMomos'
          : deliveryView === 'MINCHICKEN'
          ? 'Delivery • 🍗 MinChicken'
          : 'Delivery';
      const deliveryColor =
        deliveryView === 'MINMOMOS'
          ? '#D95323'
          : deliveryView === 'MINCHICKEN'
          ? '#D97706'
          : '#db2777';
      slices.push({ name: deliveryLabel, value: deliveryVal, color: deliveryColor, pct: pct(deliveryVal) });
    }

    slices.push({ name: 'Students', value: studentVal, color: '#10B981', pct: pct(studentVal) });

    return slices.filter(d => d.value > 0);
  }, [orders, analysisBasis, deliveryView]);

  const totalValue = data.reduce((sum, item) => sum + item.value, 0);

  if (orders.length === 0) return null;

  return (
    <div className="bg-white p-6 lg:p-8 rounded-[2rem] lg:rounded-[3rem] shadow-xl border border-brand-stone">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h3 className="text-xl font-black text-brand-brown uppercase italic tracking-tighter">
            Order <span className="text-brand-red">Channels</span>
          </h3>
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
            {analysisBasis === 'REVENUE' ? 'Revenue' : 'Order volume'} distribution by ordering mode
          </p>
        </div>

        <div className="flex flex-wrap items-center bg-brand-brown/5 p-1 rounded-xl border border-brand-stone/60 gap-0.5 self-start sm:self-auto">
          {(
            [
              { id: 'ALL', label: 'All Delivery' },
              { id: 'SPLIT', label: 'Split Brands' },
              { id: 'MINMOMOS', label: '🥟 MinMomos' },
              { id: 'MINCHICKEN', label: '🍗 MinChicken' }
            ] as Array<{ id: DeliveryViewMode; label: string }>
          ).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setDeliveryView(opt.id)}
              className={`px-2.5 py-1 text-[8.5px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                deliveryView === opt.id
                  ? 'bg-brand-brown text-brand-yellow shadow-sm'
                  : 'text-brand-brown/50 hover:text-brand-brown'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-xs font-black uppercase tracking-widest text-brand-brown/30">
          No orders match selected filter
        </div>
      ) : (
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
                  formatter={(value: any) =>
                    analysisBasis === 'REVENUE'
                      ? `₹${Number(value).toLocaleString()}`
                      : `${Number(value).toLocaleString()} Orders`
                  }
                  contentStyle={{
                    borderRadius: '16px',
                    border: 'none',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                    fontWeight: 'bold'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-4">
            {data.map(item => (
              <div
                key={item.name}
                className="flex items-center justify-between p-4 bg-brand-brown/5 rounded-2xl border border-brand-stone/30 group hover:border-brand-brown/20 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                  <div>
                    <p className="text-[10px] font-black uppercase text-brand-brown tracking-widest">{item.name}</p>
                    <p className="text-[12px] font-black text-brand-brown/60 tracking-tight">
                      {item.pct}% of {analysisBasis === 'REVENUE' ? 'Revenue' : 'Total Orders'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-brand-brown">
                    {analysisBasis === 'REVENUE' ? `₹${item.value.toLocaleString()}` : item.value.toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
            <div className="pt-4 mt-4 border-t border-brand-stone/50 flex justify-between items-center px-4">
              <p className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest">
                {analysisBasis === 'REVENUE' ? 'Total Sales' : 'Total Orders'}
              </p>
              <p className="text-xl font-black text-brand-brown tracking-tighter">
                {analysisBasis === 'REVENUE' ? `₹${totalValue.toLocaleString()}` : totalValue.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderModeChart;
