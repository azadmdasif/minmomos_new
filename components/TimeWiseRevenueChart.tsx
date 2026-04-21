
import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { CompletedOrder } from '../types';

interface TimeWiseRevenueChartProps {
  orders: CompletedOrder[];
}

const TimeWiseRevenueChart: React.FC<TimeWiseRevenueChartProps> = ({ orders }) => {
  const chartData = useMemo(() => {
    // Initialize 24 hours
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i % 12 || 12}${i >= 12 ? 'PM' : 'AM'}`,
      revenue: 0,
      orders: 0
    }));

    orders.forEach(order => {
      try {
        const date = new Date(order.date);
        const h = date.getHours();
        if (h >= 0 && h < 24) {
          hours[h].revenue += (order.total || 0);
          hours[h].orders += 1;
        }
      } catch (e) {
        console.error("Date parsing error in chart:", e);
      }
    });

    // Filter to show active hours (where there's revenue) or a sensible range (10AM - 11PM)
    const activeHours = hours.filter(h => h.revenue > 0);
    if (activeHours.length === 0) {
        return hours.filter(h => h.hour >= 10 && h.hour <= 22);
    }
    
    const minHour = Math.max(0, Math.min(...activeHours.map(h => h.hour)) - 1);
    const maxHour = Math.min(23, Math.max(...activeHours.map(h => h.hour)) + 1);
    
    return hours.filter(h => h.hour >= minHour && h.hour <= maxHour);
  }, [orders]);

  return (
    <div className="bg-white p-6 lg:p-10 rounded-[2.5rem] lg:rounded-[3rem] shadow-xl border border-brand-stone mb-10 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h3 className="text-xl lg:text-2xl font-black text-brand-brown uppercase italic leading-none">TIME-WISE <span className="text-brand-red">REVENUE</span></h3>
          <p className="text-[9px] lg:text-[10px] font-bold text-brand-brown/40 uppercase tracking-[0.3em] mt-2">Hourly sales distribution</p>
        </div>
        <div className="flex gap-4">
            <div className="bg-brand-brown/5 px-4 py-2 rounded-xl">
                <p className="text-[8px] font-black text-brand-brown/40 uppercase tracking-widest">Peak Hour</p>
                <p className="text-sm font-black text-brand-brown uppercase">
                    {chartData.length > 0 ? chartData.reduce((prev, current) => (prev.revenue > current.revenue) ? prev : current).label : 'N/A'}
                </p>
            </div>
            <div className="bg-brand-red/5 px-4 py-2 rounded-xl">
                <p className="text-[8px] font-black text-brand-red/60 uppercase tracking-widest">Orders</p>
                <p className="text-sm font-black text-brand-red uppercase">
                    {orders.length}
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
               tickFormatter={(value) => `₹${value >= 1000 ? (value/1000).toFixed(1) + 'k' : value}`}
            />
            <Tooltip 
              cursor={{ fill: 'rgba(239, 68, 68, 0.03)' }}
              contentStyle={{ 
                borderRadius: '20px', 
                border: '4px solid #3c2a21', 
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                padding: '16px' 
              }}
              labelStyle={{ fontWeight: '900', color: '#3c2a21', fontSize: '12px', marginBottom: '4px', textTransform: 'uppercase', fontStyle: 'italic' }}
              formatter={(value: any) => [`₹${Number(value).toLocaleString()}`, 'REVENUE']}
            />
            <Bar 
              dataKey="revenue" 
              animationBegin={0}
              animationDuration={1000}
              barSize={40}
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.revenue > 0 ? '#EF4444' : '#e5e1da'}
                  className="transition-all hover:opacity-80"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TimeWiseRevenueChart;
