import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CompletedOrder, Customer } from '../types';
import { getISTDateString } from '../utils/storage';

interface RevenueBreakdownChartProps {
  orders: CompletedOrder[];
  customers: Customer[];
  analysisBasis: 'REVENUE' | 'ORDERS';
  compositionData?: {
    repeat: { count: number; revenue: number };
    new: { count: number; revenue: number };
    unregistered: { count: number; revenue: number };
    delivery: { count: number; revenue: number };
    deliveryMinMomos?: { count: number; revenue: number };
    deliveryMinChicken?: { count: number; revenue: number };
    deliveryUnassigned?: { count: number; revenue: number };
  };
}

type DeliveryViewMode = 'ALL' | 'SPLIT' | 'MINMOMOS' | 'MINCHICKEN';

const RevenueBreakdownChart: React.FC<RevenueBreakdownChartProps> = ({
  orders,
  customers,
  analysisBasis,
  compositionData
}) => {
  const [deliveryView, setDeliveryView] = useState<DeliveryViewMode>('ALL');

  const data = useMemo(() => {
    const pick = (entry?: { count: number; revenue: number }) =>
      entry ? (analysisBasis === 'REVENUE' ? entry.revenue : entry.count) : 0;

    let repeatVal = 0;
    let newRegVal = 0;
    let unregVal = 0;
    let zomatoAllVal = 0;
    let minmomosVal = 0;
    let minchickenVal = 0;

    if (compositionData) {
      repeatVal = pick(compositionData.repeat);
      newRegVal = pick(compositionData.new);
      unregVal = pick(compositionData.unregistered);
      zomatoAllVal = pick(compositionData.delivery);

      if (compositionData.deliveryMinMomos || compositionData.deliveryMinChicken) {
        minchickenVal = pick(compositionData.deliveryMinChicken);
        minmomosVal = Math.max(pick(compositionData.deliveryMinMomos), Math.max(0, zomatoAllVal - minchickenVal));
      } else {
        // Fallback compute from orders array
        orders.forEach(o => {
          if (o.type !== 'DELIVERY') return;
          const amount = o.manualTotal != null ? Math.round(o.manualTotal) : Math.round(o.total);
          const v = analysisBasis === 'REVENUE' ? amount : 1;
          const brand = (o.deliveryBrand || '').toUpperCase();
          if (brand === 'MINCHICKEN') minchickenVal += v;
          else minmomosVal += v;
        });
      }
    } else {
      orders.forEach(o => {
        const amount = o.type === 'DELIVERY' && o.manualTotal != null ? Math.round(o.manualTotal) : Math.round(o.total);
        const valToAdd = analysisBasis === 'REVENUE' ? amount : 1;

        if (o.type === 'DELIVERY') {
          zomatoAllVal += valToAdd;
          const brand = (o.deliveryBrand || '').toUpperCase();
          if (brand === 'MINCHICKEN') minchickenVal += valToAdd;
          else minmomosVal += valToAdd;
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
    }

    const deliveryPortion =
      deliveryView === 'MINMOMOS'
        ? minmomosVal
        : deliveryView === 'MINCHICKEN'
        ? minchickenVal
        : zomatoAllVal;

    const total = repeatVal + newRegVal + unregVal + deliveryPortion;
    const pct = (v: number) => (total > 0 ? ((v / total) * 100).toFixed(1) : '0');

    const rows = [
      { name: 'Repeat Customers', value: repeatVal, color: '#10B981', pct: pct(repeatVal) },
      { name: 'New Registered', value: newRegVal, color: '#F59E0B', pct: pct(newRegVal) },
      { name: 'Unregistered', value: unregVal, color: '#6B7280', pct: pct(unregVal) }
    ];

    if (deliveryView === 'SPLIT') {
      rows.push(
        { name: 'Zomato • 🥟 MinMomos', value: minmomosVal, color: '#D95323', pct: pct(minmomosVal) },
        { name: 'Zomato • 🍗 MinChicken', value: minchickenVal, color: '#D97706', pct: pct(minchickenVal) }
      );
    } else if (deliveryView === 'MINMOMOS') {
      rows.push({ name: 'Zomato • 🥟 MinMomos', value: minmomosVal, color: '#D95323', pct: pct(minmomosVal) });
    } else if (deliveryView === 'MINCHICKEN') {
      rows.push({ name: 'Zomato • 🍗 MinChicken', value: minchickenVal, color: '#D97706', pct: pct(minchickenVal) });
    } else {
      rows.push({ name: 'Zomato Users', value: zomatoAllVal, color: '#E11D48', pct: pct(zomatoAllVal) });
    }

    return rows;
  }, [orders, customers, analysisBasis, compositionData, deliveryView]);

  const totalValue = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white p-6 lg:p-8 rounded-[2rem] lg:rounded-[3rem] shadow-xl border border-brand-stone">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h3 className="text-xl font-black text-brand-brown uppercase italic tracking-tighter">
            {analysisBasis === 'REVENUE' ? 'Revenue' : 'Order Count'}{' '}
            <span className="text-brand-red">Composition</span>
          </h3>
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
            Classification of sales by customer origin
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

        <div className="space-y-3">
          {data.map(item => (
            <div
              key={item.name}
              className="flex items-center justify-between p-4 bg-brand-brown/5 rounded-2xl border border-brand-stone/30 group hover:border-brand-brown/20 transition-all"
            >
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
            <p className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest">
              Selected {analysisBasis === 'REVENUE' ? 'Revenue' : 'Orders'}
            </p>
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
