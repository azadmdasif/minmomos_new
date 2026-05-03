
import React, { useState, useMemo } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart
} from 'recharts';
import { CompletedOrder } from '../types';
import { TrendingUp, DollarSign, ShoppingBag, BarChart2 } from 'lucide-react';
import { getISTDate, getISTDateString } from '../utils/storage';

interface PerformanceChartProps {
  orders: CompletedOrder[];
  startDate: string;
  endDate: string;
}

const PerformanceChart: React.FC<PerformanceChartProps> = ({ orders, startDate, endDate }) => {
  const [showSMA, setShowSMA] = useState(false);
  const [showRevenue, setShowRevenue] = useState(true);
  const [showProfit, setShowProfit] = useState(true);
  const [showAvgTicket, setShowAvgTicket] = useState(true);
  const [revenueType, setRevenueType] = useState<'ALL' | 'DINE_IN' | 'TAKEAWAY'>('ALL');
  const [viewType, setViewType] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const chartData = useMemo(() => {
    // 1. Determine date range for data population
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);

    if (viewType === 'daily') {
      startObj.setDate(startObj.getDate() - 31);
      
      const dailyData: Record<string, { 
        totalRevenue: number; dineInRevenue: number; takeawayRevenue: number; 
        totalCogs: number; dineInCogs: number; takeawayCogs: number; 
        totalOrders: number; dineInOrders: number; takeawayOrders: number 
      }> = {};
      
      // Initialize all dates in range to 0
      let curr = getISTDate(startObj);
      while (curr <= endObj) {
          const ds = getISTDateString(curr);
          dailyData[ds] = { 
            totalRevenue: 0, dineInRevenue: 0, takeawayRevenue: 0, 
            totalCogs: 0, dineInCogs: 0, takeawayCogs: 0, 
            totalOrders: 0, dineInOrders: 0, takeawayOrders: 0 
          };
          curr.setDate(curr.getDate() + 1);
      }

      // Populate with actual data
      orders.forEach(order => {
        const dateStr = getISTDateString(order.date);
        if (dailyData[dateStr]) {
          const totalCost = order.items.reduce((sum, item) => sum + (item.cost || 0) * item.quantity, 0);
          
          dailyData[dateStr].totalRevenue += order.total;
          dailyData[dateStr].totalOrders += 1;
          dailyData[dateStr].totalCogs += totalCost;

          if (order.type === 'DINE_IN') {
            dailyData[dateStr].dineInRevenue += order.total;
            dailyData[dateStr].dineInOrders += 1;
            dailyData[dateStr].dineInCogs += totalCost;
          } else if (order.type === 'TAKEAWAY') {
            dailyData[dateStr].takeawayRevenue += order.total;
            dailyData[dateStr].takeawayOrders += 1;
            dailyData[dateStr].takeawayCogs += totalCost;
          }
        }
      });

      const fullSortedData = Object.entries(dailyData)
        .map(([date, values]) => {
          let revenue = values.totalRevenue;
          let cogs = values.totalCogs;
          let count = values.totalOrders;

          if (revenueType === 'DINE_IN') {
            revenue = values.dineInRevenue;
            cogs = values.dineInCogs;
            count = values.dineInOrders;
          } else if (revenueType === 'TAKEAWAY') {
            revenue = values.takeawayRevenue;
            cogs = values.takeawayCogs;
            count = values.takeawayOrders;
          }

          return {
            date,
            formattedDate: new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
            fullDate: new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' }),
            revenue,
            profit: revenue - cogs,
            avgTicket: count > 0 ? revenue / count : 0,
            orderCount: count
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      // Calculate WMA-28 on the full dataset
      const calculateWMA = (arr: any[], idx: number, key: string) => {
        const window = arr.slice(Math.max(0, idx - 27), idx + 1).reverse();
        
        const getAvg = (start: number, end: number) => {
          const slice = window.slice(start, end);
          if (slice.length === 0) return 0;
          return slice.reduce((sum, d) => sum + d[key], 0) / slice.length;
        };

        const w1 = getAvg(0, 7);
        const w2 = getAvg(7, 14);
        const w3 = getAvg(14, 21);
        const w4 = getAvg(21, 28);
        
        let totalWeight = 0;
        if (window.length > 0) totalWeight += 0.4;
        if (window.length > 7) totalWeight += 0.3;
        if (window.length > 14) totalWeight += 0.2;
        if (window.length > 21) totalWeight += 0.1;
        
        if (totalWeight === 0) return 0;
        
        const rawWMA = (w1 * 0.4) + (w2 * 0.3) + (w3 * 0.2) + (w4 * 0.1);
        return rawWMA / totalWeight;
      };

      const dataWithSMA = fullSortedData.map((day, idx, arr) => {
        return {
          ...day,
          revenueSMA: calculateWMA(arr, idx, 'revenue'),
          profitSMA: calculateWMA(arr, idx, 'profit'),
          ticketSMA: calculateWMA(arr, idx, 'avgTicket'),
        };
      });

      return dataWithSMA.filter(d => d.date >= startDate && d.date <= endDate);
    } else if (viewType === 'weekly') {
      // Weekly view [Monday to Sunday]
      const getISOWeek = (date: Date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      };

      const getISOWeekYear = (date: Date) => {
        const d = new Date(date.getTime());
        d.setDate(d.getDate() + 4 - (d.getDay() || 7));
        return d.getFullYear();
      };

      const weeklyData: Record<string, { 
        totalRevenue: number; dineInRevenue: number; takeawayRevenue: number; 
        totalCogs: number; dineInCogs: number; takeawayCogs: number; 
        totalOrders: number; dineInOrders: number; takeawayOrders: number;
        weekNum: number;
        year: number;
        monday: string;
        sunday: string;
      }> = {};

      // Helper to get Monday of the week
      const getMonday = (d: Date) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(date.setDate(diff));
      };

      // Helper to get Sunday of the week
      const getSunday = (d: Date) => {
        const monday = getMonday(d);
        return new Date(monday.setDate(monday.getDate() + 6));
      };

      orders.forEach(order => {
        const dateStr = getISTDateString(order.date);
        if (dateStr < startDate || dateStr > endDate) return;

        const w = getISOWeek(getISTDate(order.date));
        const y = getISOWeekYear(getISTDate(order.date));
        const key = `${y}-W${w.toString().padStart(2, '0')}`;

        if (!weeklyData[key]) {
          const orderDate = getISTDate(order.date);
          const mon = getMonday(orderDate);
          const sun = getSunday(orderDate);
          weeklyData[key] = {
            totalRevenue: 0, dineInRevenue: 0, takeawayRevenue: 0,
            totalCogs: 0, dineInCogs: 0, takeawayCogs: 0,
            totalOrders: 0, dineInOrders: 0, takeawayOrders: 0,
            weekNum: w,
            year: y,
            monday: mon.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
            sunday: sun.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
          };
        }

        const totalCost = order.items.reduce((sum, item) => sum + (item.cost || 0) * item.quantity, 0);
        weeklyData[key].totalRevenue += order.total;
        weeklyData[key].totalOrders += 1;
        weeklyData[key].totalCogs += totalCost;

        if (order.type === 'DINE_IN') {
          weeklyData[key].dineInRevenue += order.total;
          weeklyData[key].dineInOrders += 1;
          weeklyData[key].dineInCogs += totalCost;
        } else if (order.type === 'TAKEAWAY') {
          weeklyData[key].takeawayRevenue += order.total;
          weeklyData[key].takeawayOrders += 1;
          weeklyData[key].takeawayCogs += totalCost;
        }
      });

      return Object.entries(weeklyData)
        .map(([key, values]) => {
          let revenue = values.totalRevenue;
          let cogs = values.totalCogs;
          let count = values.totalOrders;

          if (revenueType === 'DINE_IN') {
            revenue = values.dineInRevenue;
            cogs = values.dineInCogs;
            count = values.dineInOrders;
          } else if (revenueType === 'TAKEAWAY') {
            revenue = values.takeawayRevenue;
            cogs = values.takeawayCogs;
            count = values.takeawayOrders;
          }

          return {
            date: key,
            formattedDate: `W${values.weekNum}`,
            fullDate: `Week ${values.weekNum} (${values.monday} - ${values.sunday})`,
            revenue,
            profit: revenue - cogs,
            avgTicket: count > 0 ? revenue / count : 0,
            orderCount: count,
            revenueSMA: 0, // SMA not supported in weekly view yet
            profitSMA: 0,
            ticketSMA: 0
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    } else {
      // Monthly view
      const monthlyData: Record<string, { 
        totalRevenue: number; dineInRevenue: number; takeawayRevenue: number; 
        totalCogs: number; dineInCogs: number; takeawayCogs: number; 
        totalOrders: number; dineInOrders: number; takeawayOrders: number;
        month: string;
        year: number;
      }> = {};

      orders.forEach(order => {
        const dateStr = getISTDateString(order.date);
        if (dateStr < startDate || dateStr > endDate) return;

        // Use IST date parts for monthly grouping
        const date = getISTDate(order.date);
        const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', month: 'numeric', year: 'numeric' });
        const parts = formatter.formatToParts(date);
        const month = parseInt(parts.find(p => p.type === 'month')?.value || '1');
        const year = parseInt(parts.find(p => p.type === 'year')?.value || '2024');
        const key = `${year}-${month.toString().padStart(2, '0')}`;

        if (!monthlyData[key]) {
          monthlyData[key] = {
            totalRevenue: 0, dineInRevenue: 0, takeawayRevenue: 0,
            totalCogs: 0, dineInCogs: 0, takeawayCogs: 0,
            totalOrders: 0, dineInOrders: 0, takeawayOrders: 0,
            month: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', month: 'short' }).format(date),
            year: year
          };
        }

        const totalCost = order.items.reduce((sum, item) => sum + (item.cost || 0) * item.quantity, 0);
        monthlyData[key].totalRevenue += order.total;
        monthlyData[key].totalOrders += 1;
        monthlyData[key].totalCogs += totalCost;

        if (order.type === 'DINE_IN') {
          monthlyData[key].dineInRevenue += order.total;
          monthlyData[key].dineInOrders += 1;
          monthlyData[key].dineInCogs += totalCost;
        } else if (order.type === 'TAKEAWAY') {
          monthlyData[key].takeawayRevenue += order.total;
          monthlyData[key].takeawayOrders += 1;
          monthlyData[key].takeawayCogs += totalCost;
        }
      });

      return Object.entries(monthlyData)
        .map(([key, values]) => {
          let revenue = values.totalRevenue;
          let cogs = values.totalCogs;
          let count = values.totalOrders;

          if (revenueType === 'DINE_IN') {
            revenue = values.dineInRevenue;
            cogs = values.dineInCogs;
            count = values.dineInOrders;
          } else if (revenueType === 'TAKEAWAY') {
            revenue = values.takeawayRevenue;
            cogs = values.takeawayCogs;
            count = values.takeawayOrders;
          }

          return {
            date: key,
            formattedDate: `${values.month} ${values.year.toString().slice(-2)}`,
            fullDate: `${new Date(key + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
            revenue,
            profit: revenue - cogs,
            avgTicket: count > 0 ? revenue / count : 0,
            orderCount: count,
            revenueSMA: 0,
            profitSMA: 0,
            ticketSMA: 0
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  }, [orders, startDate, endDate, showSMA, revenueType, viewType]);

  const stats = useMemo(() => {
    const totalRevenue = chartData.reduce((sum, d) => sum + d.revenue, 0);
    const totalProfit = chartData.reduce((sum, d) => sum + d.profit, 0);
    const totalOrders = chartData.reduce((sum, d) => sum + d.orderCount, 0);
    
    return {
      totalRevenue,
      totalProfit,
      avgTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0
    };
  }, [chartData]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-brand-brown/10 mb-6 font-primary">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h3 className="text-xl font-bold text-brand-brown flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-brand-red" />
            Performance Trends
          </h3>
          <p className="text-sm text-brand-brown/60">Revenue, Profit, and Average Order Value</p>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-2 bg-brand-brown/5 p-1 rounded-full w-fit">
              <button 
                onClick={() => setRevenueType('ALL')}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${revenueType === 'ALL' ? 'bg-brand-brown text-brand-yellow' : 'text-brand-brown/40'}`}
              >All</button>
              <button 
                onClick={() => setRevenueType('DINE_IN')}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${revenueType === 'DINE_IN' ? 'bg-brand-red text-white' : 'text-brand-brown/40'}`}
              >Dine-In</button>
              <button 
                onClick={() => setRevenueType('TAKEAWAY')}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${revenueType === 'TAKEAWAY' ? 'bg-indigo-600 text-white' : 'text-brand-brown/40'}`}
              >Takeaway</button>
            </div>

            <div className="flex items-center gap-2 bg-brand-brown/5 p-1 rounded-full w-fit">
              <button 
                onClick={() => setViewType('daily')}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${viewType === 'daily' ? 'bg-brand-brown text-brand-yellow shadow-sm' : 'text-brand-brown/40'}`}
              >Daily</button>
              <button 
                onClick={() => setViewType('weekly')}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${viewType === 'weekly' ? 'bg-brand-brown text-brand-yellow shadow-sm' : 'text-brand-brown/40'}`}
              >Weekly</button>
              <button 
                onClick={() => setViewType('monthly')}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${viewType === 'monthly' ? 'bg-brand-brown text-brand-yellow shadow-sm' : 'text-brand-brown/40'}`}
              >Monthly</button>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-brand-brown/5 p-2 rounded-[1.5rem] border border-brand-brown/10">
          <button 
            onClick={() => setShowRevenue(!showRevenue)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full shadow-sm border transition-all active:scale-95 ${
              showRevenue ? 'bg-red-500 border-red-600 text-white shadow-red-200' : 'bg-white border-brand-stone/50 text-brand-brown/40'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${showRevenue ? 'bg-white' : 'bg-gray-300'}`} />
            <span className="text-[10px] font-black uppercase tracking-wider">Revenue</span>
          </button>

          <button 
            onClick={() => setShowProfit(!showProfit)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full shadow-sm border transition-all active:scale-95 ${
              showProfit ? 'bg-green-500 border-green-600 text-white shadow-green-200' : 'bg-white border-brand-stone/50 text-brand-brown/40'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${showProfit ? 'bg-white' : 'bg-gray-300'}`} />
            <span className="text-[10px] font-black uppercase tracking-wider">Profit</span>
          </button>

          <button 
            onClick={() => setShowAvgTicket(!showAvgTicket)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full shadow-sm border transition-all active:scale-95 ${
              showAvgTicket ? 'bg-indigo-500 border-indigo-600 text-white shadow-indigo-200' : 'bg-white border-brand-stone/50 text-brand-brown/40'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${showAvgTicket ? 'bg-white' : 'bg-gray-300'}`} />
            <span className="text-[10px] font-black uppercase tracking-wider">Ticket</span>
          </button>

          {viewType === 'daily' && (
            <>
              <div className="w-[1px] h-4 bg-brand-brown/10 mx-1 hidden md:block" />
              <button 
                onClick={() => setShowSMA(!showSMA)}
                className="flex items-center gap-2 group outline-none"
              >
                <span className={`text-[10px] font-black uppercase tracking-wider transition-colors ${showSMA ? 'text-brand-red' : 'text-brand-brown/30'}`}>WMA (28d)</span>
                <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                   showSMA ? 'bg-brand-red' : 'bg-gray-200'
                }`}>
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                     showSMA ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </div>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis 
              dataKey="formattedDate" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#6B7280', fontSize: 12 }} 
            />
            <YAxis 
               yAxisId="left"
               axisLine={false} 
               tickLine={false} 
               tick={{ fill: '#6B7280', fontSize: 12 }}
               tickFormatter={(value) => `₹${value}`}
            />
            <YAxis 
               yAxisId="right"
               orientation="right"
               axisLine={false} 
               tickLine={false} 
               tick={{ fill: '#6B7280', fontSize: 12 }}
               tickFormatter={(value) => `₹${value}`}
            />
            <Tooltip 
              contentStyle={{ 
                borderRadius: '12px', 
                border: 'none', 
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                padding: '12px' 
              }}
              labelFormatter={(_, payload) => {
                if (payload && payload.length > 0) {
                  return <span className="text-brand-brown font-black italic">{payload[0].payload.fullDate}</span>;
                }
                return '';
              }}
              formatter={(value: any) => [`₹${Number(value).toFixed(2)}`, '']}
            />
            {/* Legend removed in favor of custom interactive toggles above */}
            
            {showRevenue && (
              <Area 
                 yAxisId="left"
                 type="monotone" 
                 dataKey="revenue" 
                 name="Revenue" 
                 stroke="#EF4444" 
                 fill="#FEE2E2" 
                 strokeWidth={3}
              />
            )}
            {showProfit && (
              <Area 
                 yAxisId="left"
                 type="monotone" 
                 dataKey="profit" 
                 name="Gross Profit" 
                 stroke="#10B981" 
                 fill="#D1FAE5" 
                 strokeWidth={3}
              />
            )}
            {showAvgTicket && (
              <Line 
                 yAxisId="right"
                 type="monotone" 
                 dataKey="avgTicket" 
                 name="Avg Ticket" 
                 stroke="#6366F1" 
                 strokeWidth={3}
                 dot={{ r: 4, fill: '#6366F1', strokeWidth: 2, stroke: '#fff' }}
              />
            )}

            {showSMA && (
              <>
                {showRevenue && (
                  <Line 
                     yAxisId="left"
                     type="monotone" 
                     dataKey="revenueSMA" 
                     name="Revenue (WMA)" 
                     stroke="#B91C1C" 
                     strokeWidth={2}
                     strokeDasharray="5 5"
                     dot={false}
                  />
                )}
                {showProfit && (
                  <Line 
                     yAxisId="left"
                     type="monotone" 
                     dataKey="profitSMA" 
                     name="Profit (WMA)" 
                     stroke="#047857" 
                     strokeWidth={2}
                     strokeDasharray="5 5"
                     dot={false}
                  />
                )}
                {showAvgTicket && (
                  <Line 
                     yAxisId="right"
                     type="monotone" 
                     dataKey="ticketSMA" 
                     name="Ticket (WMA)" 
                     stroke="#4338CA" 
                     strokeWidth={2}
                     strokeDasharray="5 5"
                     dot={false}
                  />
                )}
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-brand-red/5 p-4 rounded-xl border border-brand-red/10">
              <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-brand-red" />
                  <span className="text-xs font-bold text-brand-brown/60 uppercase">Total Revenue</span>
              </div>
              <p className="text-2xl font-black text-brand-red">
                  ₹{stats.totalRevenue.toFixed(2)}
              </p>
          </div>
          <div className="bg-green-50 p-4 rounded-xl border border-green-100">
              <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-bold text-brand-brown/60 uppercase">Gross Profit</span>
              </div>
              <p className="text-2xl font-black text-green-600">
                  ₹{stats.totalProfit.toFixed(2)}
              </p>
          </div>
          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
              <div className="flex items-center gap-2 mb-1">
                  <ShoppingBag className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-brand-brown/60 uppercase">Avg. Ticket</span>
              </div>
              <p className="text-2xl font-black text-indigo-600">
                  ₹{stats.avgTicket.toFixed(2)}
              </p>
          </div>
      </div>
    </div>
  );
};

export default PerformanceChart;
