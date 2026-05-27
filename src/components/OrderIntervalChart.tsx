import React, { useMemo, useState, useEffect } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } from 'recharts';
import { Clock, Users, HelpCircle, Flame, Filter, BarChart3, Info } from 'lucide-react';
import { CohortOrder } from '../utils/storage';

interface OrderIntervalChartProps {
  data: CohortOrder[];
}

export const OrderIntervalChart: React.FC<OrderIntervalChartProps> = ({ data }) => {
  const [maxInterval, setMaxInterval] = useState<number>(10);
  const [minSampleCount, setMinSampleCount] = useState<number>(3);
  const [selectedSeq, setSelectedSeq] = useState<number>(1);
  const [isCumulative, setIsCumulative] = useState<boolean>(false);

  const { chartData, statistics, intervalDiffs } = useMemo(() => {
    if (!data || data.length === 0) {
      return { 
        chartData: [], 
        statistics: { 
          val0To1: null as number | null,
          val1To2: null as number | null, 
          fastestStep: null as { step: string; days: number } | null, 
          overallAvg: 0, 
          customersWithRepeat: 0 
        },
        intervalDiffs: {} as Record<number, number[]>
      };
    }

    // Group order dates by customer phone
    const ordersByPhone: Record<string, { date: Date; bill: number; joinedDate: Date }[]> = {};
    
    data.forEach(o => {
      const phone = o.customer_phone;
      if (!phone || phone === 'GUEST') return;
      
      const billNum = Number(o.bill_number);
      if (!ordersByPhone[phone]) {
        ordersByPhone[phone] = [];
      }
      ordersByPhone[phone].push({
        date: new Date(o.order_date),
        bill: billNum,
        joinedDate: new Date(o.joined_date)
      });
    });

    // For each customer, sort orders chronologically
    const intervalDiffs: Record<number, number[]> = {}; // i -> array of days diff

    Object.keys(ordersByPhone).forEach(phone => {
      const orders = ordersByPhone[phone];
      // Sort chronologically. If timestamps are identical, sort by bill number
      orders.sort((a, b) => {
        const timeA = a.date.getTime();
        const timeB = b.date.getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.bill - b.bill;
      });

      // Interval 0: Acquisition to 1st order
      if (orders.length > 0) {
        const joinedDate = orders[0].joinedDate;
        const firstOrderDate = orders[0].date;

        const dJoin = new Date(joinedDate.getFullYear(), joinedDate.getMonth(), joinedDate.getDate());
        const dFirst = new Date(firstOrderDate.getFullYear(), firstOrderDate.getMonth(), firstOrderDate.getDate());

        const msDiff0 = dFirst.getTime() - dJoin.getTime();
        const daysDiff0 = Math.max(0, Math.round(msDiff0 / (1000 * 60 * 60 * 24)));

        const intervalIndex = 0;
        if (!intervalDiffs[intervalIndex]) {
          intervalDiffs[intervalIndex] = [];
        }
        intervalDiffs[intervalIndex].push(daysDiff0);
      }

      for (let i = 0; i < orders.length - 1; i++) {
        const dateA = orders[i].date;
        const dateB = orders[i + 1].date;

        // Zero out time components to calculate exact calendar date difference
        const d1 = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
        const d2 = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());

        const msDiff = d2.getTime() - d1.getTime();
        const daysDiff = Math.max(0, Math.round(msDiff / (1000 * 60 * 60 * 24)));
        
        const intervalIndex = i + 1; // 1st to 2nd is index 1
        if (!intervalDiffs[intervalIndex]) {
          intervalDiffs[intervalIndex] = [];
        }
        intervalDiffs[intervalIndex].push(daysDiff);
      }
    });

    // Compute averages and retention percentages
    const allProcessed = Object.entries(intervalDiffs).map(([intervalStr, diffs]) => {
      const interval = parseInt(intervalStr);
      const sum = diffs.reduce((a, b) => a + b, 0);
      const count = diffs.length;
      const avg = count > 0 ? (sum / count) : 0;

      // Calculate retention percentage:
      // Interval 0 (Acquisition -> Order 1): conversion of all registered to having >= 1 order (100% in this dataset)
      // Interval i (Order i -> Order i + 1): conversion of customers with >= i orders to >= i + 1 orders
      let retentionPercent = 0;
      if (interval === 0) {
        const totalCust = Object.keys(ordersByPhone).length;
        const convertedCust = Object.values(ordersByPhone).filter(orders => orders.length >= 1).length;
        retentionPercent = totalCust > 0 ? Math.round((convertedCust / totalCust) * 100) : 0;
      } else {
        const prevMinCount = Object.values(ordersByPhone).filter(orders => orders.length >= interval).length;
        const currMinCount = Object.values(ordersByPhone).filter(orders => orders.length >= interval + 1).length;
        retentionPercent = prevMinCount > 0 ? Math.round((currMinCount / prevMinCount) * 100) : 0;
      }

      return {
        interval,
        avgDays: parseFloat(avg.toFixed(1)),
        customerCount: count,
        rangeLabel: interval === 0 ? 'Acquisition ➔ Order 1' : `Order ${interval} ➔ ${interval + 1}`,
        retentionPercent
      };
    }).sort((a, b) => a.interval - b.interval);

    // Limit sequence view by maxInterval, including interval 0 up to maxInterval
    const filtered = allProcessed.filter(p => p.customerCount >= minSampleCount && p.interval <= maxInterval);

    // Calculate aggregated statistics
    const val0To1 = allProcessed.find(p => p.interval === 0)?.avgDays ?? null;
    const val1To2 = allProcessed.find(p => p.interval === 1)?.avgDays ?? null;
    
    let fastestStep: { step: string; days: number } | null = null;
    let sumTotal = 0;
    let countTotal = 0;
    let customersWithRepeat = 0;

    Object.values(ordersByPhone).forEach(orders => {
      if (orders.length > 1) {
        customersWithRepeat += 1;
      }
    });

    allProcessed.forEach(p => {
      // Ignore interval 0 (Acquisition -> Order 1) for calculating overall average and fastest return interval
      if (p.interval !== 0 && p.customerCount >= minSampleCount) {
        sumTotal += p.avgDays * p.customerCount;
        countTotal += p.customerCount;
        if (!fastestStep || p.avgDays < fastestStep.days) {
          fastestStep = { step: p.rangeLabel, days: p.avgDays };
        }
      }
    });

    const overallAvg = countTotal > 0 ? parseFloat((sumTotal / countTotal).toFixed(1)) : 0;

    return {
      chartData: filtered,
      statistics: {
        val0To1,
        val1To2,
        fastestStep,
        overallAvg,
        customersWithRepeat
      },
      intervalDiffs
    };
  }, [data, maxInterval, minSampleCount]);

  const brandRed = '#C83232';
  const brandBrown = '#8B4513';

  // Find all keys in intervalDiffs to check if selectedSeq is valid
  const availableSeqs = useMemo(() => {
    return Object.keys(intervalDiffs || {})
      .map(Number)
      .sort((a, b) => a - b);
  }, [intervalDiffs]);

  // Sync selected sequence once availableSeqs updates
  useEffect(() => {
    if (availableSeqs.length > 0 && !availableSeqs.includes(selectedSeq)) {
      if (availableSeqs.includes(1)) {
        setSelectedSeq(1);
      } else {
        setSelectedSeq(availableSeqs[0]);
      }
    }
  }, [availableSeqs, selectedSeq]);

  const histogramData = useMemo(() => {
    const diffs = intervalDiffs[selectedSeq] || [];
    if (diffs.length === 0) return [];

    // Custom buckets appropriate for order recurrence behavior
    const buckets = [
      { label: 'Same Day', min: 0, max: 0 },
      { label: '1 Day', min: 1, max: 1 },
      { label: '2 Days', min: 2, max: 2 },
      { label: '3 Days', min: 3, max: 3 },
      { label: '4 Days', min: 4, max: 5 }, // Group slightly for better visual balance
      { label: '5-7 Days', min: 5, max: 7 },
      { label: '8-10 Days', min: 8, max: 10 },
      { label: '11-14 Days', min: 11, max: 14 },
      { label: '15-21 Days', min: 15, max: 21 },
      { label: '22-30 Days', min: 22, max: 30 },
      { label: '31+ Days', min: 31, max: Infinity }
    ];

    const counts = buckets.map(b => ({
      binLabel: b.label,
      customerCount: 0,
      percentage: 0,
      cumulativeCount: 0,
      cumulativePercent: 0
    }));

    diffs.forEach(val => {
      for (let i = 0; i < buckets.length; i++) {
        if (val >= buckets[i].min && val <= buckets[i].max) {
          counts[i].customerCount += 1;
          break;
        }
      }
    });

    const totalInSequence = diffs.length;
    let runningSum = 0;
    counts.forEach(c => {
      c.percentage = totalInSequence > 0 ? Math.round((c.customerCount / totalInSequence) * 100) : 0;
      runningSum += c.customerCount;
      c.cumulativeCount = runningSum;
      c.cumulativePercent = totalInSequence > 0 ? Math.round((runningSum / totalInSequence) * 100) : 0;
    });

    // Remove trailing empty bins to keep the visual balanced and clean, but preserve first 6 bins minimum
    let lastNonZeroIdx = counts.length - 1;
    while (lastNonZeroIdx > 5 && counts[lastNonZeroIdx].customerCount === 0) {
      lastNonZeroIdx--;
    }

    return counts.slice(0, lastNonZeroIdx + 1);
  }, [intervalDiffs, selectedSeq]);

  return (
    <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-brand-stone space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-brown/5 rounded-2xl text-brand-brown">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-black text-brand-brown uppercase italic">
              Order-to-Order <span className="text-brand-red">Velocity</span>
            </h3>
            <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest">
              Average days elapsed between consecutive order sequences
            </p>
          </div>
        </div>

        {/* Dynamic Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Min customer volume filter */}
          <div className="flex items-center gap-2 bg-brand-brown/5 px-3 py-1.5 rounded-xl border border-brand-stone">
            <Filter className="w-3.5 h-3.5 text-brand-brown/40" />
            <span className="text-[8px] font-black text-brand-brown uppercase tracking-wider">Min Cohort Size:</span>
            <select
              value={minSampleCount}
              onChange={(e) => setMinSampleCount(Number(e.target.value))}
              className="bg-transparent text-[9px] font-black uppercase text-brand-brown focus:outline-none cursor-pointer"
            >
              <option value="1">1 Customer</option>
              <option value="2">2 Customers</option>
              <option value="3">3 Customers (Default)</option>
              <option value="5">5 Customers</option>
              <option value="10">10 Customers</option>
            </select>
          </div>

          {/* Sequence Limit Filter */}
          <div className="flex items-center gap-2 bg-brand-brown/5 px-3 py-1.5 rounded-xl border border-brand-stone">
            <span className="text-[8px] font-black text-brand-brown uppercase tracking-wider">Seq Capped at:</span>
            <select
              value={maxInterval}
              onChange={(e) => setMaxInterval(Number(e.target.value))}
              className="bg-transparent text-[9px] font-black text-brand-brown focus:outline-none cursor-pointer font-black"
            >
              <option value="5">5 Orders</option>
              <option value="10">10 Orders (Default)</option>
              <option value="15">15 Orders</option>
              <option value="20">20 Orders</option>
            </select>
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      {data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-brand-cream/10 p-5 rounded-[2rem] border border-brand-stone/40 space-y-1">
            <span className="text-[8px] font-black uppercase text-brand-brown/40 tracking-widest block">Time to First Order</span>
            <p className="text-2xl font-black text-brand-brown">
              {statistics.val0To1 != null ? `${statistics.val0To1} Days` : 'N/A'}
            </p>
            <p className="text-[9px] font-bold text-brand-brown/40 uppercase tracking-tighter">
              Acquisition to 1st Conversion
            </p>
          </div>
          <div className="bg-brand-cream/10 p-5 rounded-[2rem] border border-brand-stone/40 space-y-1">
            <span className="text-[8px] font-black uppercase text-brand-brown/40 tracking-widest block">First Re-purchase Speed</span>
            <p className="text-2xl font-black text-brand-brown">
              {statistics.val1To2 != null ? `${statistics.val1To2} Days` : 'N/A'}
            </p>
            <p className="text-[9px] font-bold text-brand-brown/40 uppercase tracking-tighter">
              Average gap between 1st & 2nd Order
            </p>
          </div>
          <div className="bg-brand-cream/10 p-5 rounded-[2rem] border border-brand-stone/40 space-y-1">
            <span className="text-[8px] font-black uppercase text-brand-brown/40 tracking-widest block">Highest Velocity Interval</span>
            <p className="text-2xl font-black text-brand-red">
              {statistics.fastestStep ? `${statistics.fastestStep.days} Days` : 'N/A'}
            </p>
            <p className="text-[9px] font-bold text-brand-brown/40 uppercase tracking-tighter">
              Fastest return: {statistics.fastestStep ? statistics.fastestStep.step : 'N/A'}
            </p>
          </div>
          <div className="bg-brand-cream/10 p-5 rounded-[2rem] border border-brand-stone/40 space-y-1">
            <span className="text-[8px] font-black uppercase text-brand-brown/40 tracking-widest block">Overall Average Tempo</span>
            <p className="text-2xl font-black text-brand-brown">
              {statistics.overallAvg > 0 ? `${statistics.overallAvg} Days` : 'N/A'}
            </p>
            <p className="text-[9px] font-bold text-brand-brown/40 uppercase tracking-tighter">
              Mean intervals across repeating buyers
            </p>
          </div>
        </div>
      )}

      {/* Main Chart Canvas */}
      <div className="h-[350px] w-full bg-brand-cream/5 rounded-[2rem] border border-brand-stone/30 p-4">
        {chartData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <HelpCircle className="w-10 h-10 text-brand-brown/20 mb-2" />
            <p className="text-xs font-black uppercase text-brand-brown/40 tracking-widest">
              Insufficient repeating customer sample sizes to represent velocity metrics
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 10, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" vertical={false} />
              <XAxis
                dataKey="rangeLabel"
                tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 700 }}
                axisLine={{ stroke: '#DFD8D0', strokeWidth: 1.5 }}
                tickLine={{ stroke: '#DFD8D0' }}
              />
              <YAxis
                yAxisId="left"
                unit=" Days"
                tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 700 }}
                axisLine={{ stroke: '#DFD8D0', strokeWidth: 1.5 }}
                tickLine={{ stroke: '#DFD8D0' }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                unit=" Cust"
                tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 700 }}
                axisLine={{ stroke: '#DFD8D0', strokeWidth: 1.5 }}
                tickLine={{ stroke: '#DFD8D0' }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const dataPoint = payload[0].payload;
                    return (
                      <div className="bg-white p-4 rounded-2xl shadow-xl border border-brand-stone space-y-2">
                        <p className="text-xs font-black text-brand-brown uppercase tracking-wider border-b border-brand-stone/30 pb-1.5">
                          {dataPoint.rangeLabel}
                        </p>
                        <div className="space-y-1 text-[11px] font-bold">
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-brand-brown/50 uppercase text-[9px] tracking-wider">Average Delay:</span>
                            <span className="text-brand-red font-black">{dataPoint.avgDays} Days</span>
                          </div>
                          <div className="flex items-center justify-between gap-6">
                            <span className="text-brand-brown/50 uppercase text-[9px] tracking-wider">Cohort Size:</span>
                            <span className="text-brand-brown font-black">{dataPoint.customerCount} Customers</span>
                          </div>
                          <div className="flex items-center justify-between gap-6 pt-1 border-t border-dashed border-brand-stone/20">
                            <span className="text-brand-brown/50 uppercase text-[9px] tracking-wider">Step Retention:</span>
                            <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] font-extrabold">{dataPoint.retentionPercent}% conversion</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingTop: '0px', paddingBottom: '20px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}
              />
              <Line
                yAxisId="left"
                name="Average Days to Return"
                type="monotone"
                dataKey="avgDays"
                stroke={brandRed}
                strokeWidth={4}
                dot={{ r: 5, fill: brandBrown, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 8, fill: '#fff', strokeWidth: 3, stroke: brandRed }}
                animationDuration={1000}
              >
                <LabelList 
                  dataKey="retentionPercent" 
                  position="top" 
                  offset={10}
                  style={{ fill: '#8B4513', fontSize: 10, fontWeight: 900 }}
                  formatter={(v: any) => `${v}%`}
                />
              </Line>
              <Line
                yAxisId="right"
                name="Repeating Customers"
                type="monotone"
                dataKey="customerCount"
                stroke="#6B7280"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 4, fill: '#fff', strokeWidth: 1.5, stroke: '#6B7280' }}
                activeDot={{ r: 6, fill: '#fff', strokeWidth: 2, stroke: '#6B7280' }}
                animationDuration={1000}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-brand-stone/30 my-6"></div>

      {/* Histogram Section */}
      <div className="space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-brand-brown/5 rounded-2xl text-brand-brown">
              <BarChart3 className="w-5 h-5 text-brand-red" />
            </div>
            <div>
              <h4 className="text-lg font-black text-brand-brown uppercase italic">
                Velocity <span className="text-brand-red">Distribution Histogram</span>
              </h4>
              <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest">
                Deep dive: frequency distribution of days till order conversion
              </p>
            </div>
          </div>

          {/* View Toggles and Sequence Selection Pills */}
          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Toggle: Standard / Cumulative */}
            <div className="flex bg-brand-brown/5 p-1 rounded-2xl border border-brand-stone/30 shrink-0">
              <button
                onClick={() => setIsCumulative(false)}
                className={`px-3.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all duration-150 ${
                  !isCumulative
                    ? 'bg-brand-brown text-white shadow-sm'
                    : 'text-brand-brown/60 hover:text-brand-brown'
                }`}
              >
                Standard
              </button>
              <button
                onClick={() => setIsCumulative(true)}
                className={`px-3.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all duration-150 ${
                  isCumulative
                    ? 'bg-brand-brown text-white shadow-sm'
                    : 'text-brand-brown/60 hover:text-brand-brown'
                }`}
              >
                Cumulative
              </button>
            </div>

            {/* Sequence Selection Pills */}
            {availableSeqs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 bg-brand-brown/5 p-1.5 rounded-2xl border border-brand-stone/30 max-w-full overflow-x-auto">
                {availableSeqs.map((seq) => {
                  const label = seq === 0 ? 'Acq ➔ Ord 1' : `Ord ${seq} ➔ ${seq + 1}`;
                  const isActive = selectedSeq === seq;
                  return (
                    <button
                      key={seq}
                      onClick={() => setSelectedSeq(seq)}
                      className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all duration-200 ${
                        isActive
                          ? 'bg-brand-brown text-white shadow-sm font-black'
                          : 'text-brand-brown/60 hover:text-brand-brown hover:bg-brand-brown/10'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Selected sequence metadata banner */}
        <div className="bg-brand-brown/[0.02] border border-brand-stone/40 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-brand-brown/60 mt-0.5 shrink-0" />
            <div className="text-left">
              <p className="text-[10px] font-black uppercase text-brand-brown tracking-wider">
                Analyzing Interval: <span className="text-brand-red">{selectedSeq === 0 ? 'Acquisition to 1st Order' : `Order ${selectedSeq} to Order ${selectedSeq + 1}`}</span>
              </p>
              <p className="text-[9px] font-medium text-brand-brown/60">
                {isCumulative
                  ? `This cumulative distribution tracking shows what percentage of converted customers made their ${selectedSeq === 0 ? 'first purchase' : `${selectedSeq + 1}-th purchase`} on or before a given day of registration/prior-order.`
                  : `This histogram displays the exact duration (in calendar days) it took for ${(intervalDiffs[selectedSeq] || []).length} customers who successfully advanced through this stage to convert.`}
              </p>
            </div>
          </div>
          <div className="bg-white px-4 py-2 rounded-xl border border-brand-stone shadow-sm shrink-0 text-center">
            <p className="text-[9px] font-black uppercase text-brand-brown/40 tracking-wider">Cohort Base</p>
            <p className="text-lg font-black text-brand-brown">{(intervalDiffs[selectedSeq] || []).length} Guests</p>
          </div>
        </div>

        {/* Histogram Chart Container */}
        <div className="h-[300px] w-full bg-brand-cream/5 rounded-[2rem] border border-brand-stone/30 p-4">
          {histogramData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <HelpCircle className="w-8 h-8 text-brand-brown/20 mb-2" />
              <p className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest">
                No customer velocity data recorded for this sequence interval
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={histogramData}
                margin={{ top: 20, right: 10, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" vertical={false} />
                <XAxis
                  dataKey="binLabel"
                  tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 700 }}
                  axisLine={{ stroke: '#DFD8D0', strokeWidth: 1.5 }}
                  tickLine={{ stroke: '#DFD8D0' }}
                />
                <YAxis
                  unit={isCumulative ? " %" : " Customers"}
                  tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 700 }}
                  axisLine={{ stroke: '#DFD8D0', strokeWidth: 1.5 }}
                  tickLine={{ stroke: '#DFD8D0' }}
                  allowDecimals={!isCumulative}
                  domain={isCumulative ? [0, 100] : undefined}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const dataPoint = payload[0].payload;
                      return (
                        <div className="bg-white p-3.5 rounded-2xl shadow-xl border border-brand-stone space-y-1">
                          <p className="text-xs font-black text-brand-brown uppercase tracking-wider">
                            Duration: {dataPoint.binLabel}
                          </p>
                          <div className="space-y-0.5 text-[11px] font-bold">
                            {isCumulative ? (
                              <>
                                <div className="flex items-center justify-between gap-6">
                                  <span className="text-brand-brown/50 uppercase text-[9px] tracking-wider font-semibold">Cumulative Converted:</span>
                                  <span className="text-brand-red font-black">{dataPoint.cumulativePercent}%</span>
                                </div>
                                <div className="flex items-center justify-between gap-6">
                                  <span className="text-brand-brown/50 uppercase text-[9px] tracking-wider font-semibold">Cumulative Count:</span>
                                  <span className="text-brand-brown font-black">{dataPoint.cumulativeCount} of {(intervalDiffs[selectedSeq] || []).length}</span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center justify-between gap-6">
                                  <span className="text-brand-brown/50 uppercase text-[9px] tracking-wider font-semibold">Customers:</span>
                                  <span className="text-brand-brown font-black">{dataPoint.customerCount}</span>
                                </div>
                                <div className="flex items-center justify-between gap-6">
                                  <span className="text-brand-brown/50 uppercase text-[9px] tracking-wider font-semibold">Share of Segment:</span>
                                  <span className="text-brand-red font-black">{dataPoint.percentage}%</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey={isCumulative ? "cumulativePercent" : "customerCount"}
                  name={isCumulative ? "Cumulative Percent" : "Customers count"}
                  fill={isCumulative ? brandRed : brandBrown}
                  radius={[8, 8, 0, 0]}
                  maxBarSize={45}
                  animationDuration={1000}
                >
                  <LabelList
                    dataKey={isCumulative ? "cumulativePercent" : "customerCount"}
                    position="top"
                    offset={6}
                    style={{ fill: '#8B4513', fontSize: 9, fontWeight: 900 }}
                    formatter={(v: any) => v > 0 ? (isCumulative ? `${v}%` : `${v}`) : ''}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Legend & Advice */}
      <div className="bg-brand-cream/50 p-6 rounded-3xl border border-brand-stone/50 space-y-4">
        <h4 className="text-[11px] font-black uppercase text-brand-brown tracking-wider">
          Understanding Retention Velocity (Inter-Purchase Speed)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[10px] font-medium text-brand-brown/70 leading-relaxed">
          <div className="space-y-1.5">
            <p className="font-bold text-brand-brown flex items-center gap-1.5 uppercase tracking-tighter">
              <Flame className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              The Churn Valley Indicator
            </p>
            <p>
              Typically, the first delay is the longest. If the average drops from 1st ➔ 2nd order to consecutive sequences, it signals the customer has successfully formed a dining habit. Spikes in later periods require targeted campaign action.
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="font-bold text-brand-brown flex items-center gap-1.5 uppercase tracking-tighter">
              <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              Campaign Acceleration Target
            </p>
            <p>
              Use these values to schedule discount automated flows. If transition 2 ➔ 3 is usually 12 days, dispatch a customized prompt or coupon around day 10 to accelerate their visit frequency.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
