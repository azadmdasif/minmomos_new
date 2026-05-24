import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { Users, BarChart3, HelpCircle } from 'lucide-react';
import { Customer } from '../types';

interface CustomerHistogramProps {
  customers: Customer[];
}

export const CustomerHistogram: React.FC<CustomerHistogramProps> = ({ customers }) => {
  const [metric, setMetric] = useState<'ltv' | 'orders'>('ltv');

  const chartData = useMemo(() => {
    if (!customers || customers.length === 0) return [];

    if (metric === 'ltv') {
      // Define LTV buckets
      const buckets = [
        { label: '₹0 - 500', min: 0, max: 500, count: 0, ltvSum: 0 },
        { label: '₹500 - 1K', min: 500, max: 1000, count: 0, ltvSum: 0 },
        { label: '₹1K - 2.5K', min: 1000, max: 2500, count: 0, ltvSum: 0 },
        { label: '₹2.5K - 5K', min: 2500, max: 5000, count: 0, ltvSum: 0 },
        { label: '₹5K - 10K', min: 5000, max: 10000, count: 0, ltvSum: 0 },
        { label: '₹10K+', min: 10000, max: Infinity, count: 0, ltvSum: 0 },
      ];

      customers.forEach(c => {
        const spent = c.totalSpent ?? 0;
        const bucket = buckets.find(b => spent >= b.min && spent < b.max);
        if (bucket) {
          bucket.count += 1;
          bucket.ltvSum += spent;
        }
      });

      const totalCount = customers.length;
      return buckets.map(b => ({
        range: b.label,
        'Number of Customers': b.count,
        'Percentage': totalCount > 0 ? ((b.count / totalCount) * 100).toFixed(1) : '0',
        'Total Revenue': b.ltvSum,
        'Average Spent': b.count > 0 ? Math.round(b.ltvSum / b.count) : 0,
      }));
    } else {
      // Define Order count buckets
      const buckets = [
        { label: '1 Order', min: 1, max: 1, count: 0, ltvSum: 0 },
        { label: '2 Orders', min: 2, max: 2, count: 0, ltvSum: 0 },
        { label: '3 Orders', min: 3, max: 3, count: 0, ltvSum: 0 },
        { label: '4 Orders', min: 4, max: 4, count: 0, ltvSum: 0 },
        { label: '5 - 9 Orders', min: 5, max: 9, count: 0, ltvSum: 0 },
        { label: '10 - 19 Orders', min: 10, max: 19, count: 0, ltvSum: 0 },
        { label: '20+ Orders', min: 20, max: Infinity, count: 0, ltvSum: 0 },
      ];

      customers.forEach(c => {
        const orders = c.totalOrders ?? 0;
        const bucket = buckets.find(b => orders >= b.min && orders <= b.max);
        if (bucket) {
          bucket.count += 1;
          bucket.ltvSum += (c.totalSpent ?? 0);
        }
      });

      const totalCount = customers.length;
      return buckets.map(b => ({
        range: b.label,
        'Number of Customers': b.count,
        'Percentage': totalCount > 0 ? ((b.count / totalCount) * 100).toFixed(1) : '0',
        'Total Revenue': b.ltvSum,
        'Average Spent': b.count > 0 ? Math.round(b.ltvSum / b.count) : 0,
      }));
    }
  }, [customers, metric]);

  const totalSegmentCustomers = useMemo(() => {
    return customers.length;
  }, [customers]);

  const highestSegment = useMemo(() => {
    if (chartData.length === 0) return null;
    return [...chartData].sort((a, b) => b['Number of Customers'] - a['Number of Customers'])[0];
  }, [chartData]);

  // Brand color scheme colors
  const activeColor = metric === 'ltv' ? '#A2593E' : '#C83232'; // brand-brown vs brand-red

  return (
    <div className="bg-white rounded-[2.5rem] p-6 lg:p-8 border-2 border-brand-stone shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-brown" />
            <h3 className="text-xl font-black text-brand-brown uppercase italic">
              Cohort <span className={metric === 'ltv' ? 'text-brand-brown' : 'text-brand-red'}>Distribution</span>
            </h3>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-brand-brown/40 mt-1">
            Analyzing customer counts segmented by {metric === 'ltv' ? 'lifetime value (LTV)' : 'purchase frequency'}
          </p>
        </div>

        {/* Toggle option */}
        <div className="bg-brand-brown/5 p-1 rounded-2xl flex items-center border border-brand-stone self-start sm:self-auto shadow-inner">
          <button
            onClick={() => setMetric('ltv')}
            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              metric === 'ltv'
                ? 'bg-brand-brown text-brand-yellow shadow-md'
                : 'text-brand-brown/50 hover:bg-brand-stone/30'
            }`}
          >
            LTV Distribution
          </button>
          <button
            onClick={() => setMetric('orders')}
            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              metric === 'orders'
                ? 'bg-brand-red text-white shadow-md'
                : 'text-brand-brown/50 hover:bg-brand-stone/30'
            }`}
          >
            Orders Count
          </button>
        </div>
      </div>

      {/* Overview insights tags */}
      {totalSegmentCustomers > 0 && highestSegment && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-brand-cream/10 p-4 rounded-3xl border border-brand-stone/40">
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase text-brand-brown/40 tracking-widest">Selected Group Size</span>
            <p className="text-lg font-black text-brand-brown flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-brown/40" />
              {totalSegmentCustomers} Customers
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase text-brand-brown/40 tracking-widest">Peak Segment</span>
            <p className="text-lg font-black text-brand-brown">
              {highestSegment.range}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase text-brand-brown/40 tracking-widest">Concentration</span>
            <p className="text-lg font-black text-brand-brown">
              {highestSegment['Percentage']}% of network
            </p>
          </div>
        </div>
      )}

      {/* Main Histogram Chart */}
      <div className="h-80 w-full bg-brand-cream/5 rounded-[2rem] border border-brand-stone/30 p-4 flex flex-col justify-end">
        {totalSegmentCustomers === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <HelpCircle className="w-10 h-10 text-brand-brown/20 mb-2" />
            <p className="text-xs font-black uppercase text-brand-brown/40 tracking-widest">No customer profiles match active filters</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
              <XAxis
                dataKey="range"
                tick={{ fill: '#4E3A2F', fontSize: 10, fontWeight: 900 }}
                axisLine={{ stroke: '#DFD8D0', strokeWidth: 1.5 }}
                tickLine={{ stroke: '#DFD8D0' }}
              />
              <YAxis
                tick={{ fill: '#4E3A2F', fontSize: 10, fontWeight: 900 }}
                axisLine={{ stroke: '#DFD8D0', strokeWidth: 1.5 }}
                tickLine={{ stroke: '#DFD8D0' }}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(78, 58, 47, 0.03)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white border-2 border-brand-stone rounded-2xl p-4 shadow-xl text-brand-brown max-w-xs unicode-bidi">
                        <p className="text-xs font-black uppercase tracking-tight mb-2 text-brand-brown/50 border-b pb-1">
                          Bracket: {data.range}
                        </p>
                        <div className="space-y-1.5 font-bold text-xs">
                          <p className="flex justify-between gap-6">
                            <span>Customers:</span>
                            <span className="font-black text-brand-red">{data['Number of Customers']}</span>
                          </p>
                          <p className="flex justify-between gap-6">
                            <span>Percentage:</span>
                            <span className="font-black">{data['Percentage']}%</span>
                          </p>
                          <p className="flex justify-between gap-6">
                            <span>Contribution:</span>
                            <span className="font-black text-emerald-600">₹{(data['Total Revenue'] || 0).toLocaleString()}</span>
                          </p>
                          <p className="flex justify-between gap-6 border-t pt-1.5 mt-1.5">
                            <span>Avg Spent/User:</span>
                            <span className="font-black text-brand-brown">₹{(data['Average Spent'] || 0).toLocaleString()}</span>
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey="Number of Customers"
                radius={[12, 12, 0, 0]}
                maxBarSize={60}
              >
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={activeColor}
                    fillOpacity={0.85 + (index % 2 === 0 ? 0.15 : 0)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      
      {/* Legend & Instructions */}
      <div className="flex flex-wrap items-center justify-between text-[9px] font-black uppercase tracking-widest text-brand-brown/40 border-t pt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-md" style={{ backgroundColor: activeColor }} />
          <span>Active Cohort Bracket Customer Counter</span>
        </div>
        <div>
          <span>Filtered on {filteredCustomersLabel(metric, chartData)}</span>
        </div>
      </div>
    </div>
  );
};

function filteredCustomersLabel(_metric: 'ltv' | 'orders', chartData: any[]) {
  const sum = chartData.reduce((acc, curr) => acc + curr['Number of Customers'], 0);
  return `${sum} Active Profiles`;
}
