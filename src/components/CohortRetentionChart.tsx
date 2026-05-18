
import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Info, TrendingUp as TrendingUpIcon, CalendarDays, CalendarRange } from 'lucide-react';

interface CohortData {
  customer_phone: string;
  order_date: string;
  joined_date: string;
}

interface CohortRetentionChartProps {
  data: CohortData[];
  onSelectPeriod?: (periodKey: string, granularity: 'MONTH' | 'WEEK') => void;
  selectedPeriodKey?: string | null;
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
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  date.setDate(diff);
  return date;
};

const CohortRetentionChart: React.FC<CohortRetentionChartProps> = ({ data, onSelectPeriod, selectedPeriodKey }) => {
  const [granularity, setGranularity] = useState<'MONTH' | 'WEEK'>('MONTH');
  const [hiddenCohorts, setHiddenCohorts] = useState<Set<string>>(new Set());

  const handlePointSelection = (dataPoint: any, cohortLabel: string) => {
    if (!onSelectPeriod) return;
    
    const periodIndex = dataPoint.periodIndex;
    const rawCohortKey = dataPoint._rawKeys[cohortLabel];
    
    if (rawCohortKey) {
      let targetKey = '';
      if (granularity === 'MONTH') {
        const [y, m] = rawCohortKey.split('-').map(Number);
        const date = new Date(y, m - 1 + periodIndex, 1);
        targetKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        const [y, w] = rawCohortKey.split('-W').map(Number);
        const d = new Date(y, 0, 4);
        d.setDate(d.getDate() - (d.getDay() + 6) % 7);
        d.setDate(d.getDate() + (w - 1) * 7 + (periodIndex * 7));
        
        const weekNum = getWeekNumber(d);
        let yearForWeek = d.getFullYear();
        if (weekNum === 1 && d.getMonth() === 11) yearForWeek++;
        if (weekNum >= 52 && d.getMonth() === 0) yearForWeek--;
        targetKey = `${yearForWeek}-W${String(weekNum).padStart(2, '0')}`;
      }
      onSelectPeriod(targetKey, granularity);
    }
  };

  const isPeriodSelected = (dataPoint: any, cohortLabel: string) => {
    if (!selectedPeriodKey) return false;
    
    const periodIndex = dataPoint.periodIndex;
    const rawCohortKey = dataPoint._rawKeys[cohortLabel];
    
    if (!rawCohortKey) return false;

    let targetKey = '';
    if (granularity === 'MONTH') {
      const [y, m] = rawCohortKey.split('-').map(Number);
      const date = new Date(y, m - 1 + periodIndex, 1);
      targetKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    } else {
      const [y, w] = rawCohortKey.split('-W').map(Number);
      const d = new Date(y, 0, 4);
      d.setDate(d.getDate() - (d.getDay() + 6) % 7);
      d.setDate(d.getDate() + (w - 1) * 7 + (periodIndex * 7));
      
      const weekNum = getWeekNumber(d);
      let yearForWeek = d.getFullYear();
      if (weekNum === 1 && d.getMonth() === 11) yearForWeek++;
      if (weekNum >= 52 && d.getMonth() === 0) yearForWeek--;
      targetKey = `${yearForWeek}-W${String(weekNum).padStart(2, '0')}`;
    }
    
    return targetKey === selectedPeriodKey;
  };

  const { cohortData, cohortMetadata, cohortTotalSize } = useMemo(() => {
    if (data.length === 0) return { cohortData: [], cohortMetadata: {}, cohortTotalSize: 0 };

    // 1. Map customers to their true cohorts and store their order dates
    const customerJoinDate: Record<string, Date> = {};
    const customerOrders: Record<string, Date[]> = {};
    const cohorts: Record<string, Set<string>> = {};

    data.forEach(order => {
      const phone = order.customer_phone;
      const orderDate = new Date(order.order_date);
      const joinedDate = new Date(order.joined_date);
      
      // Normalize dates to start of period to prevent boundary issues
      const normalizedJoin = granularity === 'MONTH' 
        ? new Date(joinedDate.getFullYear(), joinedDate.getMonth(), 1)
        : getStartOfWeek(joinedDate);
        
      if (!customerJoinDate[phone]) {
        customerJoinDate[phone] = normalizedJoin;
        
        let cohortKey = '';
        if (granularity === 'MONTH') {
          cohortKey = `${normalizedJoin.getFullYear()}-${String(normalizedJoin.getMonth() + 1).padStart(2, '0')}`;
        } else {
          const weekNum = getWeekNumber(normalizedJoin);
          let yearForWeek = normalizedJoin.getFullYear();
          // ISO Year correction for week 1 / week 53
          if (weekNum === 1 && normalizedJoin.getMonth() === 11) yearForWeek++;
          if (weekNum >= 52 && normalizedJoin.getMonth() === 0) yearForWeek--;
          cohortKey = `${yearForWeek}-W${String(weekNum).padStart(2, '0')}`;
        }
        
        if (!cohorts[cohortKey]) cohorts[cohortKey] = new Set();
        cohorts[cohortKey].add(phone);
      }
      
      if (!customerOrders[phone]) customerOrders[phone] = [];
      customerOrders[phone].push(orderDate);
    });

    // 2. Fetch all valid kohort keys and sort them
    const cohortKeys = Object.keys(cohorts).sort();
    
    // We want to analyze the last 6 cohorts
    const recentCohorts = cohortKeys.slice(-6);
    const cohortResults: any[] = [];
    const metadata: Record<string, { size: number, label: string, month1Retention: number, delta?: number }> = {};
    let totalSize = 0;

    recentCohorts.forEach((cohortKey) => {
      const cohortCustomers = cohorts[cohortKey];
      const cohortSize = cohortCustomers.size;
      totalSize += cohortSize;
      
      // Retention is calculated as: how many of these specific customers returned X periods after their join week
      const returningCustomersPerPeriod: Record<number, Set<string>> = {};
      
      cohortCustomers.forEach(phone => {
        const joinStart = customerJoinDate[phone];
        const orders = customerOrders[phone];
        
        orders.forEach(orderDate => {
          let diff = 0;
          if (granularity === 'MONTH') {
            diff = (orderDate.getFullYear() - joinStart.getFullYear()) * 12 + (orderDate.getMonth() - joinStart.getMonth());
          } else {
            const orderStart = getStartOfWeek(orderDate);
            // Time diff snapped to weeks
            const msDiff = orderStart.getTime() - joinStart.getTime();
            diff = Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000));
          }
          
          if (diff >= 0 && diff <= 5) {
            if (!returningCustomersPerPeriod[diff]) returningCustomersPerPeriod[diff] = new Set();
            returningCustomersPerPeriod[diff].add(phone);
          }
        });

        // SAFETY: Always ensure P0 is 100% for the customers we just placed in this cohort
        if (!returningCustomersPerPeriod[0]) returningCustomersPerPeriod[0] = new Set();
        returningCustomersPerPeriod[0].add(phone);
      });

      const dataPoints: any = { name: cohortKey };
      for (let i = 0; i <= 5; i++) {
        const count = returningCustomersPerPeriod[i]?.size || 0;
        dataPoints[`Period ${i}`] = cohortSize > 0 ? Math.round((count / cohortSize) * 100) : 0;
      }
      cohortResults.push(dataPoints);

      // Label Generation
      let label = cohortKey;
      if (granularity === 'MONTH') {
        const [y, mm] = cohortKey.split('-');
        const date = new Date(parseInt(y), parseInt(mm) - 1);
        label = date.toLocaleString('default', { month: 'short', year: '2-digit' }).replace('20', "'");
      }

      metadata[label] = {
        size: cohortSize,
        label,
        month1Retention: dataPoints[`Period 1`]
      };
    });

    // Calculate deltas in a second pass for recent cohorts
    recentCohorts.forEach((key, idx) => {
      let currentLabel = '';
      if (granularity === 'MONTH') {
        const [y, mm] = key.split('-');
        const date = new Date(parseInt(y), parseInt(mm) - 1);
        currentLabel = date.toLocaleString('default', { month: 'short', year: '2-digit' }).replace('20', "'");
      } else {
        currentLabel = key;
      }

      if (idx > 0) {
        const prevKey = recentCohorts[idx - 1];
        let prevLabel = '';
        if (granularity === 'MONTH') {
          const [py, pmm] = prevKey.split('-');
          const pDate = new Date(parseInt(py), parseInt(pmm) - 1);
          prevLabel = pDate.toLocaleString('default', { month: 'short', year: '2-digit' }).replace('20', "'");
        } else {
          prevLabel = prevKey;
        }
        
        if (metadata[currentLabel] && metadata[prevLabel]) {
          metadata[currentLabel].delta = metadata[currentLabel].month1Retention - metadata[prevLabel].month1Retention;
        }
      }
    });

    // Transpose for Recharts
    const finalData = [0, 1, 2, 3, 4, 5].map(p => {
      const point: any = { 
        period: granularity === 'MONTH' ? `Month ${p}` : `Week ${p}`,
        periodIndex: p,
        _rawKeys: {}
      };
      cohortResults.forEach(res => {
        let label = '';
        if (granularity === 'MONTH') {
          const [y, mm] = res.name.split('-');
          const date = new Date(parseInt(y), parseInt(mm) - 1);
          label = date.toLocaleString('default', { month: 'short', year: '2-digit' }).replace('20', "'");
        } else {
          label = res.name; 
        }
        point[label] = res[`Period ${p}`];
        point._rawKeys[label] = res.name; // Store the original cohort key
      });
      return point;
    });

    return { cohortData: finalData, cohortMetadata: metadata, cohortTotalSize: totalSize };
  }, [data, granularity]);


  const cohortLabels = useMemo(() => {
    if (cohortData.length === 0) return [];
    return Object.keys(cohortData[0]).filter(k => k !== 'period' && k !== 'periodIndex' && k !== '_rawKeys');
  }, [cohortData]);

  const toggleCohort = (label: string) => {
    setHiddenCohorts(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const colors = ['#8B4513', '#D2691E', '#FF4500', '#FF8C00', '#DAA520', '#2F4F4F'];

  return (
    <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-brand-stone space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-brown/5 rounded-2xl">
            <TrendingUpIcon className="w-5 h-5 text-brand-brown" />
          </div>
          <div>
            <h3 className="text-xl font-black text-brand-brown uppercase italic">Cohort <span className="text-brand-red">Retention</span></h3>
            <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest">Customer loyalty over time</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Granularity Toggle */}
          <div className="flex bg-brand-brown/5 p-1 rounded-xl">
            <button 
              onClick={() => {
                setGranularity('MONTH');
                setHiddenCohorts(new Set());
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${granularity === 'MONTH' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/10'}`}
            >
              <CalendarRange className="w-3 h-3" />
              Monthly
            </button>
            <button 
              onClick={() => {
                setGranularity('WEEK');
                setHiddenCohorts(new Set());
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${granularity === 'WEEK' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/10'}`}
            >
              <CalendarDays className="w-3 h-3" />
              Weekly
            </button>
          </div>
        </div>
      </div>

      {/* Cohort Toggles & Comparison */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-brand-stone/50">
        <div className="w-full flex justify-between items-end mb-1 ml-1">
          <p className="text-[8px] font-black uppercase text-brand-brown/30 tracking-widest">Cohort Comparison (P0 → P1)</p>
          <div className="text-[8px] font-black uppercase text-brand-brown/50">Total Sample: {cohortTotalSize}</div>
        </div>
        {cohortLabels.map((label, index) => {
          const meta = cohortMetadata[label];
          const hasDelta = meta?.delta !== undefined;
          const deltaColor = (meta?.delta || 0) >= 0 ? 'text-green-500' : 'text-red-500';
          
          return (
            <button
              key={label}
              onClick={() => toggleCohort(label)}
              className={`flex flex-col items-start gap-1 px-4 py-2.5 rounded-2xl border transition-all ${
                hiddenCohorts.has(label) 
                  ? 'bg-white border-brand-stone text-brand-brown/30 grayscale' 
                  : 'bg-white border-brand-brown/20 text-brand-brown shadow-sm'
              }`}
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: !hiddenCohorts.has(label) ? colors[index % colors.length] : '#ccc' }} 
                />
                <span className="text-[10px] font-black uppercase tracking-tight">{label}</span>
                <span className="text-[8px] font-bold text-brand-brown/40">({meta?.size || 0})</span>
              </div>
              
              {hasDelta && !hiddenCohorts.has(label) && (
                <div className={`text-[7px] font-black uppercase flex items-center gap-0.5 ${deltaColor}`}>
                  {meta.delta! >= 0 ? '↑' : '↓'} {Math.abs(meta.delta!)}% vs Prev
                </div>
              )}
            </button>
          );
        })}
      </div>


      <div className="h-[350px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart 
            data={cohortData} 
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis 
              dataKey="period" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 700 }}
            />
            <YAxis 
              unit="%" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 700 }}
              domain={[0, 100]}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#ffffff', 
                borderRadius: '16px', 
                border: '1px solid #E5E7EB',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                padding: '12px'
              }}
              labelStyle={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '12px', marginBottom: '8px', color: '#8B4513' }}
              itemStyle={{ fontWeight: 700, fontSize: '11px', padding: '2px 0' }}
            />
            <Legend 
              verticalAlign="top" 
              align="right"
              iconType="circle"
              wrapperStyle={{ paddingTop: '0px', paddingBottom: '20px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}
            />
            {cohortLabels.map((label, index) => {
              const color = colors[index % colors.length];
              const isHidden = hiddenCohorts.has(label);
              return (
                <Line 
                  key={label}
                  type="monotone" 
                  dataKey={label} 
                  stroke={color} 
                  strokeWidth={3}
                  hide={isHidden}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    const isSelected = isPeriodSelected(payload, label);
                    if (isHidden) return null;
                    return (
                      <circle 
                        cx={cx} 
                        cy={cy} 
                        r={isSelected ? 6 : 4} 
                        fill={isSelected ? color : '#fff'} 
                        stroke={color} 
                        strokeWidth={2} 
                        onClick={(e) => {
                           e.stopPropagation();
                           handlePointSelection(payload, label);
                        }}
                        onMouseDown={(e) => e.stopPropagation()} 
                         style={{ cursor: 'pointer' }}
                      />
                    );
                  }}
                  activeDot={(props: any) => {
                    const { cx, cy, payload } = props;
                    return (
                      <circle 
                        cx={cx} 
                        cy={cy} 
                        r={8} 
                        fill={color} 
                        stroke="#fff" 
                        strokeWidth={2} 
                        onClick={(e) => {
                           e.stopPropagation();
                           handlePointSelection(payload, label);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{ cursor: 'pointer' }}
                      />
                    );
                  }}
                  animationDuration={1000}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-brand-cream/50 p-6 rounded-3xl border border-brand-stone/50 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-brand-brown text-brand-yellow rounded-lg shrink-0">
            <Info className="w-4 h-4" />
          </div>
          <div className="space-y-2">
            <h4 className="text-[11px] font-black uppercase text-brand-brown tracking-wider">How to read this chart?</h4>
            <ul className="space-y-2">
               <li className="text-[10px] font-medium text-brand-brown/70 leading-relaxed">
                 <span className="font-bold text-brand-brown">Cohorts:</span> Each line represents a group of customers who visited for the first time in that specific {granularity === 'MONTH' ? 'month' : 'week'}.
               </li>
               <li className="text-[10px] font-medium text-brand-brown/70 leading-relaxed">
                 <span className="font-bold text-brand-brown">Retention Curve:</span> We track what percentage of those same customers came back in {granularity === 'MONTH' ? 'Month' : 'Week'} 1, 2, etc. after their inaugural visit.
               </li>
               <li className="text-[10px] font-medium text-brand-brown/70 leading-relaxed">
                 <span className="font-bold text-brand-brown">Dips & Plateaus:</span> A steep drop after Period 0 is typical (the "retention valley"), but flatter lines indicate healthy long-term customer habit formation.
               </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CohortRetentionChart;
