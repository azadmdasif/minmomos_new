import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line
} from 'recharts';
import { CompletedOrder } from '../types';
import { getISTHour, getISTDay } from '../utils/storage';

interface CustomerInsightsProps {
  history: CompletedOrder[];
}

const CustomerInsights: React.FC<CustomerInsightsProps> = ({ history }) => {
  // 1. Purchase Pattern: Items vs Frequency
  const purchasePatternData = useMemo(() => {
    const itemCounts: Record<string, number> = {};
    history.forEach(order => {
      order.items.forEach(item => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
      });
    });

    return Object.entries(itemCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 items
  }, [history]);

  // 2. Heatmap: Days vs Time Slots (7x4 Grid)
  const heatmapData = useMemo(() => {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const slots = [
      { id: 'afternoon', label: 'Afternoon', range: '12p-4p' },
      { id: 'evening', label: 'Evening', range: '4p-8p' },
      { id: 'night', label: 'Night', range: '8p-10p' },
      { id: 'lateNight', label: 'Late Night', range: '10p-12a' }
    ];

    // Initialize 7x4 matrix
    const matrix: Record<string, Record<string, number>> = {};
    days.forEach(d => {
      matrix[d] = {};
      slots.forEach(s => matrix[d][s.id] = 0);
    });

    history.forEach(order => {
      const hour = getISTHour(order.date);
      const dayIndex = getISTDay(order.date);
      const dayName = days[dayIndex];

      let slotId = '';
      if (hour >= 12 && hour < 16) slotId = 'afternoon';
      else if (hour >= 16 && hour < 20) slotId = 'evening';
      else if (hour >= 20 && hour < 22) slotId = 'night';
      else if (hour >= 22 && hour < 24) slotId = 'lateNight';

      if (slotId && matrix[dayName]) {
        matrix[dayName][slotId]++;
      }
    });

    let max = 0;
    Object.values(matrix).forEach(dayObj => {
      Object.values(dayObj).forEach(val => {
        if (val > max) max = val;
      });
    });

    return { matrix, days, slots, max: max || 1 };
  }, [history]);

  // 3. Purchase Frequency: Days between orders as a function of order number
  const purchaseFrequencyData = useMemo(() => {
    if (history.length < 2) return [];

    const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const intervals = [];

    for (let i = 1; i < sortedHistory.length; i++) {
      const prevDate = new Date(sortedHistory[i - 1].date);
      const currDate = new Date(sortedHistory[i].date);
      const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      intervals.push({
        orderIndex: i + 1,
        daysSinceLast: diffDays,
        date: new Date(sortedHistory[i].date).toLocaleDateString()
      });
    }

    return intervals;
  }, [history]);

  if (history.length === 0) return null;

  return (
    <div className="space-y-10 mt-8">
      {/* Chart 1: Purchase Pattern */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-lg">
        <h4 className="text-[10px] font-black uppercase text-brand-yellow tracking-[0.2em] mb-6 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-brand-yellow animate-pulse" />
          Favorite Items (Purchase Pattern)
        </h4>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={purchasePatternData} layout="vertical" margin={{ left: 40, right: 20 }}>
              <XAxis type="number" hide />
              <YAxis 
                dataKey="name" 
                type="category" 
                width={100} 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#ffffff', fontSize: 9, fontWeight: 900 }}
              />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                contentStyle={{ backgroundColor: '#4A2C2A', border: 'none', borderRadius: '12px', fontSize: '10px', color: '#fff' }}
                itemStyle={{ color: '#FBBF24', fontWeight: 900 }}
              />
              <Bar dataKey="count" fill="#FBBF24" radius={[0, 8, 8, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Day vs Time Heatmap Grid */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-lg">
        <h4 className="text-[10px] font-black uppercase text-brand-yellow tracking-[0.2em] mb-1 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-brand-yellow animate-pulse" />
          Visit Heatmap (Day vs Shift)
        </h4>
        <p className="text-[8px] font-black uppercase text-white/30 tracking-widest mb-6 ml-4">
          Order volume across specific days and time shifts
        </p>

        <div className="overflow-x-auto no-scrollbar pb-4">
          <div className="min-w-[450px]">
            {/* Header: Days */}
            <div className="grid grid-cols-8 gap-2 mb-2">
              <div className="col-span-1" />
              {heatmapData.days.map(day => (
                <div key={day} className="text-center">
                  <span className="text-[8px] font-black text-brand-yellow/60 uppercase">{day}</span>
                </div>
              ))}
            </div>

            {/* Rows: Shifts */}
            <div className="space-y-2">
              {heatmapData.slots.map(slot => (
                <div key={slot.id} className="grid grid-cols-8 gap-2 items-center">
                  <div className="col-span-1 text-right pr-2">
                    <p className="text-[7px] font-black text-white/40 uppercase tracking-tighter truncate">{slot.label}</p>
                    <p className="text-[6px] font-bold text-white/20 uppercase tracking-tighter">{slot.range}</p>
                  </div>
                  {heatmapData.days.map(day => {
                    const count = heatmapData.matrix[day][slot.id] || 0;
                    const intensity = count / heatmapData.max;
                    const opacity = count > 0 ? Math.max(0.1, intensity) : 0;

                    return (
                      <div 
                        key={`${day}-${slot.id}`}
                        className="aspect-square rounded-lg border border-white/5 flex items-center justify-center relative group transition-transform hover:scale-110"
                        style={{ 
                          backgroundColor: count > 0 ? `rgba(251, 191, 36, ${opacity})` : 'rgba(255,255,255,0.02)',
                          boxShadow: intensity > 0.7 ? `0 0 15px rgba(251, 191, 36, ${intensity * 0.4})` : 'none'
                        }}
                      >
                        <span className={`text-[10px] font-black ${count > 0 ? (opacity > 0.5 ? 'text-brand-brown' : 'text-white') : 'text-white/5'}`}>
                          {count > 0 ? count : ''}
                        </span>
                        
                        {/* Tooltip hint on hover */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:block bg-brand-brown p-1.5 rounded-lg text-[7px] font-black text-white border border-brand-yellow/30 whitespace-nowrap z-50 pointer-events-none">
                          {day} {slot.range}: {count} Order(s)
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chart 3: Purchase Frequency */}
      {purchaseFrequencyData.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-lg">
          <h4 className="text-[10px] font-black uppercase text-brand-yellow tracking-[0.2em] mb-6 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand-yellow animate-pulse" />
            Retention Velocity (Days Between Orders)
          </h4>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={purchaseFrequencyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis 
                  dataKey="orderIndex" 
                  label={{ value: 'Order #', position: 'insideBottom', offset: -5, fill: '#fff', fontSize: 8, fontWeight: 900 }}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#ffffff60', fontSize: 9, fontWeight: 900 }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#ffffff60', fontSize: 9, fontWeight: 900 }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#4A2C2A', border: 'none', borderRadius: '12px', fontSize: '10px', color: '#fff' }}
                  itemStyle={{ color: '#FBBF24', fontWeight: 900 }}
                />
                <Line 
                  type="stepAfter" 
                  dataKey="daysSinceLast" 
                  stroke="#FBBF24" 
                  strokeWidth={4} 
                  dot={{ r: 4, fill: '#D95323' }}
                  activeDot={{ r: 6, fill: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[7px] font-black uppercase text-white/30 tracking-[0.2em] mt-4 text-center">
            Lower numbers indicate higher frequency. Spikes suggest churn risks.
          </p>
        </div>
      )}
    </div>
  );
};

export default CustomerInsights;
