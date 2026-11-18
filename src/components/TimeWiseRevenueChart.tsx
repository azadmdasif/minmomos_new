import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { CompletedOrder } from '../types';
import { getISTHour, getISTDay, isStudentFreeMojitoOrder } from '../utils/storage';

interface TimeWiseRevenueChartProps {
  orders: CompletedOrder[];
}

type DeliveryViewMode = 'ALL' | 'SPLIT' | 'MINMOMOS' | 'MINCHICKEN';

const TimeWiseRevenueChart: React.FC<TimeWiseRevenueChartProps> = ({ orders }) => {
  const [viewMode, setViewMode] = useState<'hourly' | 'daily'>('hourly');
  const [deliveryView, setDeliveryView] = useState<DeliveryViewMode>('ALL');

  const visibleOrders = useMemo(() => {
    if (deliveryView === 'MINMOMOS') {
      return orders.filter(
        o => o.type !== 'DELIVERY' || (o.deliveryBrand || '').toUpperCase() !== 'MINCHICKEN'
      );
    }
    if (deliveryView === 'MINCHICKEN') {
      return orders.filter(
        o => o.type !== 'DELIVERY' || (o.deliveryBrand || '').toUpperCase() === 'MINCHICKEN'
      );
    }
    return orders;
  }, [orders, deliveryView]);

  const nonStudentOrdersCount = useMemo(() => {
    return visibleOrders.filter(o => !isStudentFreeMojitoOrder(o)).length;
  }, [visibleOrders]);

  const chartData = useMemo(() => {
    const createBucket = (key: number, label: string) => ({
      key,
      label,
      revenue: 0,
      deliveryRevenue: 0,
      minmomosRevenue: 0,
      minchickenRevenue: 0,
      unassignedDeliveryRevenue: 0,
      orders: 0
    });

    const addOrderToBucket = (bucket: ReturnType<typeof createBucket>, order: CompletedOrder) => {
      if (order.type === 'DELIVERY') {
        const rev = order.manualTotal != null ? order.manualTotal : order.total;
        const brand = (order.deliveryBrand || '').toUpperCase();
        bucket.deliveryRevenue += rev;
        if (brand === 'MINCHICKEN') bucket.minchickenRevenue += rev;
        else bucket.minmomosRevenue += rev;
      } else {
        bucket.revenue += order.total || 0;
      }
      if (!isStudentFreeMojitoOrder(order)) {
        bucket.orders += 1;
      }
    };

    if (viewMode === 'hourly') {
      const hours = Array.from({ length: 24 }, (_, i) =>
        createBucket(i, `${i % 12 || 12}${i >= 12 ? 'PM' : 'AM'}`)
      );

      visibleOrders.forEach(order => {
        try {
          const h = getISTHour(order.date);
          if (h >= 0 && h < 24) {
            addOrderToBucket(hours[h], order);
          }
        } catch (e) {
          console.error('Date parsing error in chart:', e);
        }
      });

      const activeHours = hours.filter(h => h.revenue > 0 || h.deliveryRevenue > 0);
      if (activeHours.length === 0) {
        return hours.filter(h => h.key >= 10 && h.key <= 22);
      }

      const minHour = Math.max(0, Math.min(...activeHours.map(h => h.key)) - 1);
      const maxHour = Math.min(23, Math.max(...activeHours.map(h => h.key)) + 1);

      return hours.filter(h => h.key >= minHour && h.key <= maxHour);
    } else {
      const days = [
        createBucket(1, 'Monday'),
        createBucket(2, 'Tuesday'),
        createBucket(3, 'Wednesday'),
        createBucket(4, 'Thursday'),
        createBucket(5, 'Friday'),
        createBucket(6, 'Saturday'),
        createBucket(0, 'Sunday')
      ];

      visibleOrders.forEach(order => {
        try {
          const d = getISTDay(order.date);
          const day = days.find(item => item.key === d);
          if (day) {
            addOrderToBucket(day, order);
          }
        } catch (e) {
          console.error('Date parsing error in chart:', e);
        }
      });

      return [...days.slice(0, 6), days[6]];
    }
  }, [visibleOrders, viewMode]);

  const peakLabel =
    chartData.length > 0
      ? chartData.reduce((prev, current) =>
          prev.revenue + prev.deliveryRevenue > current.revenue + current.deliveryRevenue
            ? prev
            : current
        ).label
      : 'N/A';

  return (
    <div className="bg-white p-6 lg:p-10 rounded-[2.5rem] lg:rounded-[3rem] shadow-xl border border-brand-stone mb-10 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h3 className="text-xl lg:text-2xl font-black text-brand-brown uppercase italic leading-none">
              {viewMode === 'hourly' ? 'TIME-WISE' : 'DAY-WISE'}{' '}
              <span className="text-brand-red">REVENUE</span>
            </h3>
            <div className="flex bg-brand-stone/30 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('hourly')}
                className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${
                  viewMode === 'hourly' ? 'bg-brand-brown text-brand-yellow shadow-md' : 'text-brand-brown/40'
                }`}
              >
                Hourly
              </button>
              <button
                onClick={() => setViewMode('daily')}
                className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${
                  viewMode === 'daily' ? 'bg-brand-brown text-brand-yellow shadow-md' : 'text-brand-brown/40'
                }`}
              >
                Daily
              </button>
            </div>
            <div className="flex flex-wrap bg-brand-brown/5 p-1 rounded-xl border border-brand-stone/60 gap-0.5">
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
                  className={`px-2.5 py-1 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                    deliveryView === opt.id
                      ? 'bg-brand-red text-white shadow-sm'
                      : 'text-brand-brown/50 hover:text-brand-brown'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[9px] lg:text-[10px] font-bold text-brand-brown/40 uppercase tracking-[0.3em] mt-1">
            {viewMode === 'hourly' ? 'Hourly sales distribution' : 'Revenue by day of week'}
          </p>
        </div>
        <div className="flex gap-4">
          <div className="bg-brand-brown/5 px-4 py-2 rounded-xl">
            <p className="text-[8px] font-black text-brand-brown/40 uppercase tracking-widest">
              {viewMode === 'hourly' ? 'Peak Hour' : 'Best Day'}
            </p>
            <p className="text-sm font-black text-brand-brown uppercase">{peakLabel}</p>
          </div>
          <div className="bg-brand-red/5 px-4 py-2 rounded-xl">
            <p className="text-[8px] font-black text-brand-red/60 uppercase tracking-widest">Orders</p>
            <p className="text-sm font-black text-brand-red uppercase">
              {nonStudentOrdersCount}
              {visibleOrders.length - nonStudentOrdersCount > 0 && (
                <span
                  className="text-[9px] text-emerald-600 block font-bold leading-none mt-0.5"
                  title="Student free mojito orders excluded from main count"
                >
                  +{visibleOrders.length - nonStudentOrdersCount} Students
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="h-[300px] lg:h-[400px] w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#3c2a21', fontSize: 10, fontWeight: '800' }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#3c2a21', fontSize: 10, fontWeight: '800' }}
              tickFormatter={value => `₹${value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value}`}
            />
            <Tooltip
              cursor={{ fill: 'rgba(239, 68, 68, 0.03)' }}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-brand-brown p-4 rounded-2xl shadow-2xl border-2 border-brand-stone min-w-[190px]">
                      <p className="text-brand-yellow text-[10px] font-black uppercase tracking-widest mb-3 italic">
                        {label}
                      </p>
                      <div className="space-y-3">
                        <div>
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-0.5">
                            In-Store Rev
                          </p>
                          <p className="text-white text-lg font-black leading-none">
                            ₹{Number(data.revenue).toLocaleString()}
                          </p>
                        </div>
                        <div className="pt-2 border-t border-white/5">
                          <p className="text-[8px] font-black uppercase text-brand-red tracking-widest mb-0.5">
                            {deliveryView === 'MINMOMOS'
                              ? 'Delivery (🥟 MinMomos)'
                              : deliveryView === 'MINCHICKEN'
                              ? 'Delivery (🍗 MinChicken)'
                              : 'Delivery Rev'}
                          </p>
                          <p className="text-white text-lg font-black leading-none">
                            ₹{Number(data.deliveryRevenue).toLocaleString()}
                          </p>
                          {(deliveryView === 'ALL' || deliveryView === 'SPLIT') &&
                            (data.minmomosRevenue > 0 || data.minchickenRevenue > 0) && (
                              <div className="mt-1.5 space-y-0.5 text-[9.5px] font-bold text-white/75">
                                <div className="flex justify-between">
                                  <span>🥟 MinMomos:</span>
                                  <span>₹{Number(data.minmomosRevenue).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>🍗 MinChicken:</span>
                                  <span>₹{Number(data.minchickenRevenue).toLocaleString()}</span>
                                </div>
                              </div>
                            )}
                        </div>
                        <div className="pt-2 border-t border-white/5 bg-white/5 -mx-4 px-4 py-2">
                          <p className="text-[8px] font-black uppercase text-brand-yellow tracking-widest mb-0.5">
                            Combined
                          </p>
                          <p className="text-brand-yellow text-lg font-black leading-none">
                            ₹{Number(data.revenue + data.deliveryRevenue).toLocaleString()}
                          </p>
                        </div>
                        <div className="pt-2 border-t border-white/5">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-0.5">
                            Total Orders
                          </p>
                          <p className="text-white text-sm font-black leading-none">{data.orders}</p>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar
              dataKey="revenue"
              stackId="a"
              fill="#EF4444"
              barSize={viewMode === 'daily' ? 60 : 40}
              radius={viewMode === 'hourly' ? [0, 0, 0, 0] : undefined}
            />
            {deliveryView === 'SPLIT' ? (
              <>
                <Bar
                  dataKey="minmomosRevenue"
                  name="MinMomos Delivery"
                  stackId="a"
                  fill="#D95323"
                  barSize={viewMode === 'daily' ? 60 : 40}
                />
                <Bar
                  dataKey="minchickenRevenue"
                  name="MinChicken Delivery"
                  stackId="a"
                  fill="#D97706"
                  barSize={viewMode === 'daily' ? 60 : 40}
                  radius={[4, 4, 0, 0]}
                />
              </>
            ) : (
              <Bar
                dataKey="deliveryRevenue"
                stackId="a"
                fill={
                  deliveryView === 'MINMOMOS'
                    ? '#D95323'
                    : deliveryView === 'MINCHICKEN'
                    ? '#D97706'
                    : '#fbbf24'
                }
                barSize={viewMode === 'daily' ? 60 : 40}
                radius={[4, 4, 0, 0]}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TimeWiseRevenueChart;
