
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
import { CompletedOrder, Customer } from '../types';
import { TrendingUp, DollarSign, ShoppingBag, BarChart2, Users } from 'lucide-react';
import { getISTDate, getISTDateString } from '../utils/storage';

interface PerformanceChartProps {
  orders: CompletedOrder[];
  customers: Customer[];
  startDate: string;
  endDate: string;
}

const PerformanceChart: React.FC<PerformanceChartProps> = ({ orders, customers, startDate, endDate }) => {
  const [showSMA, setShowSMA] = useState(false);
  const [showSegments, setShowSegments] = useState(false);
  const [showSitTake, setShowSitTake] = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);
  const [showRevenue, setShowRevenue] = useState(true);
  const [showProfit, setShowProfit] = useState(true);
  const [showAvgTicket, setShowAvgTicket] = useState(true);
  const [viewType, setViewType] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const chartData = useMemo(() => {
    // 1. Determine date range for data population
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);

    if (viewType === 'daily') {
      startObj.setDate(startObj.getDate() - 31);
      
      const dailyData: Record<string, { 
        totalRevenue: number; dineInRevenue: number; takeawayRevenue: number; deliveryRevenue: number;
        totalCogs: number; dineInCogs: number; takeawayCogs: number; deliveryCogs: number;
        totalOrders: number; dineInOrders: number; takeawayOrders: number; deliveryOrders: number;
        repeatRev: number; newRegRev: number; unregRev: number; zomatoRev: number;
        repeatOrders: number; newRegOrders: number; unregOrders: number; zomatoOrders: number;
      }> = {};
      
      // Initialize all dates in range to 0
      let curr = getISTDate(startObj);
      while (curr <= endObj) {
          const ds = getISTDateString(curr);
          dailyData[ds] = { 
            totalRevenue: 0, dineInRevenue: 0, takeawayRevenue: 0, deliveryRevenue: 0,
            totalCogs: 0, dineInCogs: 0, takeawayCogs: 0, deliveryCogs: 0,
            totalOrders: 0, dineInOrders: 0, takeawayOrders: 0, deliveryOrders: 0,
            repeatRev: 0, newRegRev: 0, unregRev: 0, zomatoRev: 0,
            repeatOrders: 0, newRegOrders: 0, unregOrders: 0, zomatoOrders: 0,
          };
          curr.setDate(curr.getDate() + 1);
      }

      // Populate with actual data
      orders.forEach(order => {
        const dateStr = getISTDateString(order.date);
        if (dailyData[dateStr]) {
          const totalCost = order.items.reduce((sum, item) => sum + (item.cost || 0) * item.quantity, 0);
          const actualRev = order.type === 'DELIVERY' && order.manualTotal != null ? order.manualTotal : order.total;
          
          dailyData[dateStr].totalRevenue += actualRev;
          dailyData[dateStr].totalOrders += 1;
          dailyData[dateStr].totalCogs += totalCost;

          // Segment Breakdown logic
          if (order.type === 'DELIVERY') {
            dailyData[dateStr].zomatoRev += actualRev;
            dailyData[dateStr].zomatoOrders += 1;
          } else if (!order.customerPhone) {
            dailyData[dateStr].unregRev += actualRev;
            dailyData[dateStr].unregOrders += 1;
          } else {
            const cust = customers.find(c => c.phone === order.customerPhone);
            if (cust) {
              const joinDateStr = getISTDateString(cust.joinedDate);
              const orderDateStr = getISTDateString(order.date);
              if (joinDateStr === orderDateStr) {
                dailyData[dateStr].newRegRev += actualRev;
                dailyData[dateStr].newRegOrders += 1;
              } else {
                dailyData[dateStr].repeatRev += actualRev;
                dailyData[dateStr].repeatOrders += 1;
              }
            } else {
              dailyData[dateStr].newRegRev += actualRev;
              dailyData[dateStr].newRegOrders += 1;
            }
          }

          if (order.type === 'DINE_IN') {
            dailyData[dateStr].dineInRevenue += order.total;
            dailyData[dateStr].dineInOrders += 1;
            dailyData[dateStr].dineInCogs += totalCost;
          } else if (order.type === 'TAKEAWAY') {
            dailyData[dateStr].takeawayRevenue += order.total;
            dailyData[dateStr].takeawayOrders += 1;
            dailyData[dateStr].takeawayCogs += totalCost;
          } else if (order.type === 'DELIVERY') {
            dailyData[dateStr].deliveryRevenue += actualRev;
            dailyData[dateStr].deliveryOrders += 1;
            dailyData[dateStr].deliveryCogs += totalCost;
          }
        }
      });

      const fullSortedData = Object.entries(dailyData)
        .map(([date, values]) => {
          const revenue = values.totalRevenue;
          const cogs = values.totalCogs;
          const count = values.totalOrders;

          return {
            date,
            formattedDate: new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
            fullDate: new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' }),
            revenue,
            profit: revenue - cogs,
            avgTicket: count > 0 ? revenue / count : 0,
            orderCount: count,
            dineInRev: values.dineInRevenue,
            takeawayRev: values.takeawayRevenue,
            deliveryRev: values.deliveryRevenue,
            dineInProfit: values.dineInRevenue - values.dineInCogs,
            takeawayProfit: values.takeawayRevenue - values.takeawayCogs,
            deliveryProfit: values.deliveryRevenue - values.deliveryCogs,
            dineInAOV: values.dineInOrders > 0 ? values.dineInRevenue / values.dineInOrders : 0,
            takeawayAOV: values.takeawayOrders > 0 ? values.takeawayRevenue / values.takeawayOrders : 0,
            deliveryAOV: values.deliveryOrders > 0 ? values.deliveryRevenue / values.deliveryOrders : 0,
            repeatRev: values.repeatRev,
            newRegRev: values.newRegRev,
            unregRev: values.unregRev,
            zomatoRev: values.zomatoRev,
            repeatAOV: values.repeatOrders > 0 ? values.repeatRev / values.repeatOrders : 0,
            newRegAOV: values.newRegOrders > 0 ? values.newRegRev / values.newRegOrders : 0,
            unregAOV: values.unregOrders > 0 ? values.unregRev / values.unregOrders : 0,
            zomatoAOV: values.zomatoOrders > 0 ? values.zomatoRev / values.zomatoOrders : 0
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
          // Segments WMA
          repeatRevSMA: calculateWMA(arr, idx, 'repeatRev'),
          newRegRevSMA: calculateWMA(arr, idx, 'newRegRev'),
          unregRevSMA: calculateWMA(arr, idx, 'unregRev'),
          zomatoRevSMA: calculateWMA(arr, idx, 'zomatoRev'),
          repeatAOVSMA: calculateWMA(arr, idx, 'repeatAOV'),
          newRegAOVSMA: calculateWMA(arr, idx, 'newRegAOV'),
          unregAOVSMA: calculateWMA(arr, idx, 'unregAOV'),
          zomatoAOVSMA: calculateWMA(arr, idx, 'zomatoAOV'),
          // Sit-Take WMA
          dineInRevSMA: calculateWMA(arr, idx, 'dineInRev'),
          takeawayRevSMA: calculateWMA(arr, idx, 'takeawayRev'),
          dineInProfitSMA: calculateWMA(arr, idx, 'dineInProfit'),
          takeawayProfitSMA: calculateWMA(arr, idx, 'takeawayProfit'),
          deliveryRevSMA: calculateWMA(arr, idx, 'deliveryRev'),
          deliveryProfitSMA: calculateWMA(arr, idx, 'deliveryProfit'),
          dineInAOVSMA: calculateWMA(arr, idx, 'dineInAOV'),
          takeawayAOVSMA: calculateWMA(arr, idx, 'takeawayAOV'),
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
        totalRevenue: number; dineInRevenue: number; takeawayRevenue: number; deliveryRevenue: number;
        totalCogs: number; dineInCogs: number; takeawayCogs: number; deliveryCogs: number;
        totalOrders: number; dineInOrders: number; takeawayOrders: number; deliveryOrders: number;
        repeatRev: number; newRegRev: number; unregRev: number; zomatoRev: number;
        repeatOrders: number; newRegOrders: number; unregOrders: number; zomatoOrders: number;
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
            totalRevenue: 0, dineInRevenue: 0, takeawayRevenue: 0, deliveryRevenue: 0,
            totalCogs: 0, dineInCogs: 0, takeawayCogs: 0, deliveryCogs: 0,
            totalOrders: 0, dineInOrders: 0, takeawayOrders: 0, deliveryOrders: 0,
            repeatRev: 0, newRegRev: 0, unregRev: 0, zomatoRev: 0,
            repeatOrders: 0, newRegOrders: 0, unregOrders: 0, zomatoOrders: 0,
            weekNum: w,
            year: y,
            monday: mon.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
            sunday: sun.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
          };
        }

        const totalCost = order.items.reduce((sum, item) => sum + (item.cost || 0) * item.quantity, 0);
        const actualRev = order.type === 'DELIVERY' && order.manualTotal != null ? order.manualTotal : order.total;
        
        weeklyData[key].totalRevenue += actualRev;
        weeklyData[key].totalOrders += 1;
        weeklyData[key].totalCogs += totalCost;

        // Segment Breakdown
        if (order.type === 'DELIVERY') {
          weeklyData[key].zomatoRev += actualRev;
          weeklyData[key].zomatoOrders += 1;
        } else if (!order.customerPhone) {
          weeklyData[key].unregRev += actualRev;
          weeklyData[key].unregOrders += 1;
        } else {
          const cust = customers.find(c => c.phone === order.customerPhone);
          if (cust) {
            const joinDateStr = getISTDateString(cust.joinedDate);
            const orderDateStr = getISTDateString(order.date);
            if (joinDateStr === orderDateStr) {
              weeklyData[key].newRegRev += actualRev;
              weeklyData[key].newRegOrders += 1;
            } else {
              weeklyData[key].repeatRev += actualRev;
              weeklyData[key].repeatOrders += 1;
            }
          } else {
            weeklyData[key].newRegRev += actualRev;
            weeklyData[key].newRegOrders += 1;
          }
        }

        if (order.type === 'DINE_IN') {
          weeklyData[key].dineInRevenue += order.total;
          weeklyData[key].dineInOrders += 1;
          weeklyData[key].dineInCogs += totalCost;
        } else if (order.type === 'TAKEAWAY') {
          weeklyData[key].takeawayRevenue += order.total;
          weeklyData[key].takeawayOrders += 1;
          weeklyData[key].takeawayCogs += totalCost;
        } else if (order.type === 'DELIVERY') {
          weeklyData[key].deliveryRevenue += actualRev;
          weeklyData[key].deliveryOrders += 1;
          weeklyData[key].deliveryCogs += totalCost;
        }
      });

      return Object.entries(weeklyData)
        .map(([key, values]) => {
          const revenue = values.totalRevenue;
          const cogs = values.totalCogs;
          const count = values.totalOrders;

          return {
            date: key,
            formattedDate: `W${values.weekNum}`,
            fullDate: `Week ${values.weekNum} (${values.monday} - ${values.sunday})`,
            revenue,
            profit: revenue - cogs,
            avgTicket: count > 0 ? revenue / count : 0,
            orderCount: count,
            dineInRev: values.dineInRevenue,
            takeawayRev: values.takeawayRevenue,
            deliveryRev: values.deliveryRevenue,
            dineInProfit: values.dineInRevenue - values.dineInCogs,
            takeawayProfit: values.takeawayRevenue - values.takeawayCogs,
            deliveryProfit: values.deliveryRevenue - values.deliveryCogs,
            dineInAOV: values.dineInOrders > 0 ? values.dineInRevenue / values.dineInOrders : 0,
            takeawayAOV: values.takeawayOrders > 0 ? values.takeawayRevenue / values.takeawayOrders : 0,
            deliveryAOV: values.deliveryOrders > 0 ? values.deliveryRevenue / values.deliveryOrders : 0,
            repeatRev: values.repeatRev,
            newRegRev: values.newRegRev,
            unregRev: values.unregRev,
            zomatoRev: values.zomatoRev,
            repeatAOV: values.repeatOrders > 0 ? values.repeatRev / values.repeatOrders : 0,
            newRegAOV: values.newRegOrders > 0 ? values.newRegRev / values.newRegOrders : 0,
            unregAOV: values.unregOrders > 0 ? values.unregRev / values.unregOrders : 0,
            zomatoAOV: values.zomatoOrders > 0 ? values.zomatoRev / values.zomatoOrders : 0,
            revenueSMA: 0, // SMA not supported in weekly view yet
            profitSMA: 0,
            ticketSMA: 0
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    } else {
      // Monthly view
      const monthlyData: Record<string, { 
        totalRevenue: number; dineInRevenue: number; takeawayRevenue: number; deliveryRevenue: number;
        totalCogs: number; dineInCogs: number; takeawayCogs: number; deliveryCogs: number;
        totalOrders: number; dineInOrders: number; takeawayOrders: number; deliveryOrders: number;
        repeatRev: number; newRegRev: number; unregRev: number; zomatoRev: number;
        repeatOrders: number; newRegOrders: number; unregOrders: number; zomatoOrders: number;
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
            totalRevenue: 0, dineInRevenue: 0, takeawayRevenue: 0, deliveryRevenue: 0,
            totalCogs: 0, dineInCogs: 0, takeawayCogs: 0, deliveryCogs: 0,
            totalOrders: 0, dineInOrders: 0, takeawayOrders: 0, deliveryOrders: 0,
            repeatRev: 0, newRegRev: 0, unregRev: 0, zomatoRev: 0,
            repeatOrders: 0, newRegOrders: 0, unregOrders: 0, zomatoOrders: 0,
            month: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', month: 'short' }).format(date),
            year: year
          };
        }

        const totalCost = order.items.reduce((sum, item) => sum + (item.cost || 0) * item.quantity, 0);
        const actualRev = order.type === 'DELIVERY' && order.manualTotal != null ? order.manualTotal : order.total;
        
        monthlyData[key].totalRevenue += actualRev;
        monthlyData[key].totalOrders += 1;
        monthlyData[key].totalCogs += totalCost;

        // Segment Breakdown
        if (order.type === 'DELIVERY') {
          monthlyData[key].zomatoRev += actualRev;
          monthlyData[key].zomatoOrders += 1;
        } else if (!order.customerPhone) {
          monthlyData[key].unregRev += actualRev;
          monthlyData[key].unregOrders += 1;
        } else {
          const cust = customers.find(c => c.phone === order.customerPhone);
          if (cust) {
            const joinDateStr = getISTDateString(cust.joinedDate);
            const orderDateStr = getISTDateString(order.date);
            if (joinDateStr === orderDateStr) {
              monthlyData[key].newRegRev += actualRev;
              monthlyData[key].newRegOrders += 1;
            } else {
              monthlyData[key].repeatRev += actualRev;
              monthlyData[key].repeatOrders += 1;
            }
          } else {
            monthlyData[key].newRegRev += actualRev;
            monthlyData[key].newRegOrders += 1;
          }
        }

        if (order.type === 'DINE_IN') {
          monthlyData[key].dineInRevenue += order.total;
          monthlyData[key].dineInOrders += 1;
          monthlyData[key].dineInCogs += totalCost;
        } else if (order.type === 'TAKEAWAY') {
          monthlyData[key].takeawayRevenue += order.total;
          monthlyData[key].takeawayOrders += 1;
          monthlyData[key].takeawayCogs += totalCost;
        } else if (order.type === 'DELIVERY') {
          monthlyData[key].deliveryRevenue += actualRev;
          monthlyData[key].deliveryOrders += 1;
          monthlyData[key].deliveryCogs += totalCost;
        }
      });

      return Object.entries(monthlyData)
        .map(([key, values]) => {
          const revenue = values.totalRevenue;
          const cogs = values.totalCogs;
          const count = values.totalOrders;

          return {
            date: key,
            formattedDate: `${values.month} ${values.year.toString().slice(-2)}`,
            fullDate: `${new Date(key + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
            revenue,
            profit: revenue - cogs,
            avgTicket: count > 0 ? revenue / count : 0,
            orderCount: count,
            dineInRev: values.dineInRevenue,
            takeawayRev: values.takeawayRevenue,
            deliveryRev: values.deliveryRevenue,
            dineInProfit: values.dineInRevenue - values.dineInCogs,
            takeawayProfit: values.takeawayRevenue - values.takeawayCogs,
            deliveryProfit: values.deliveryRevenue - values.deliveryCogs,
            dineInAOV: values.dineInOrders > 0 ? values.dineInRevenue / values.dineInOrders : 0,
            takeawayAOV: values.takeawayOrders > 0 ? values.takeawayRevenue / values.takeawayOrders : 0,
            deliveryAOV: values.deliveryOrders > 0 ? values.deliveryRevenue / values.deliveryOrders : 0,
            repeatRev: values.repeatRev,
            newRegRev: values.newRegRev,
            unregRev: values.unregRev,
            zomatoRev: values.zomatoRev,
            repeatAOV: values.repeatOrders > 0 ? values.repeatRev / values.repeatOrders : 0,
            newRegAOV: values.newRegOrders > 0 ? values.newRegRev / values.newRegOrders : 0,
            unregAOV: values.unregOrders > 0 ? values.unregRev / values.unregOrders : 0,
            zomatoAOV: values.zomatoOrders > 0 ? values.zomatoRev / values.zomatoOrders : 0,
            revenueSMA: 0,
            profitSMA: 0,
            ticketSMA: 0
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  }, [orders, startDate, endDate, showSMA, viewType]);

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

          <button 
            onClick={() => setShowSegments(!showSegments)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full shadow-sm border transition-all active:scale-95 ${
              showSegments ? 'bg-amber-500 border-amber-600 text-white shadow-amber-200' : 'bg-white border-brand-stone/50 text-brand-brown/40'
            }`}
          >
            <Users className="w-3 h-3" />
            <span className="text-[10px] font-black uppercase tracking-wider">Segments</span>
          </button>

          <button 
            onClick={() => setShowSitTake(!showSitTake)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full shadow-sm border transition-all active:scale-95 ${
              showSitTake ? 'bg-brand-brown border-brand-brown text-brand-yellow shadow-brand-yellow/20' : 'bg-white border-brand-stone/50 text-brand-brown/40'
            }`}
          >
            <ShoppingBag className="w-3 h-3" />
            <span className="text-[10px] font-black uppercase tracking-wider">Sit-Take</span>
          </button>

          <button 
            onClick={() => setShowDelivery(!showDelivery)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full shadow-sm border transition-all active:scale-95 ${
              showDelivery ? 'bg-brand-red border-brand-red text-white shadow-brand-red/20' : 'bg-white border-brand-stone/50 text-brand-brown/40'
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            <span className="text-[10px] font-black uppercase tracking-wider">Delivery</span>
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

      {(showSegments || showSitTake || showDelivery) && (
        <div className="flex flex-col gap-6 p-6 bg-brand-brown/5 rounded-2xl border border-brand-brown/10 mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex flex-wrap gap-x-8 gap-y-6">
            {showSegments && (
              <div className="flex flex-wrap gap-x-8 gap-y-4 pb-4 border-b border-brand-brown/5 last:border-0 last:pb-0">
                {showRevenue && (
                  <>
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-[#10B981] shadow-sm" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Repeat Revenue</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-[#F59E0B] shadow-sm" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">New Reg. Revenue</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-[#6B7280] shadow-sm" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Unreg. Revenue</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-[#E11D48] shadow-sm" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Zomato Rev.</span>
                    </div>
                  </>
                )}
                {showAvgTicket && (
                  <>
                    <div className="flex items-center gap-2.5 opacity-80">
                      <div className="w-3 h-3 rounded-full border-2 border-dashed border-[#10B981]" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Repeat AOV</span>
                    </div>
                    <div className="flex items-center gap-2.5 opacity-80">
                      <div className="w-3 h-3 rounded-full border-2 border-dashed border-[#F59E0B]" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">New Reg. AOV</span>
                    </div>
                    <div className="flex items-center gap-2.5 opacity-80">
                      <div className="w-3 h-3 rounded-full border-2 border-dashed border-[#6B7280]" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Unreg. AOV</span>
                    </div>
                    <div className="flex items-center gap-2.5 opacity-80">
                      <div className="w-3 h-3 rounded-full border-2 border-dashed border-[#E11D48]" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Zomato AOV</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {showSitTake && (
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                {showRevenue && (
                  <>
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-[#EF4444] shadow-sm" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Dine-In Revenue</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-[#4F46E5] shadow-sm" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Takeaway Revenue</span>
                    </div>
                  </>
                )}
                {showAvgTicket && (
                  <>
                    <div className="flex items-center gap-2.5 opacity-80">
                      <div className="w-3 h-3 rounded-full border-2 border-dashed border-[#EF4444]" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Dine-In AOV</span>
                    </div>
                    <div className="flex items-center gap-2.5 opacity-80">
                      <div className="w-3 h-3 rounded-full border-2 border-dashed border-[#4F46E5]" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Takeaway AOV</span>
                    </div>
                  </>
                )}
                {showProfit && (
                   <>
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 bg-[#EF4444] opacity-20 rounded-sm" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Dine-In Profit</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 bg-[#4F46E5] opacity-20 rounded-sm" />
                      <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Takeaway Profit</span>
                    </div>
                   </>
                )}
              </div>
            )}
            {showDelivery && (
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                {showRevenue && (
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full bg-[#db2777] shadow-sm" />
                    <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Delivery Revenue</span>
                  </div>
                )}
                {showAvgTicket && (
                  <div className="flex items-center gap-2.5 opacity-80">
                    <div className="w-3 h-3 rounded-full border-2 border-dashed border-[#db2777]" />
                    <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Delivery AOV</span>
                  </div>
                )}
                {showProfit && (
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 bg-[#db2777] opacity-20 rounded-sm" />
                    <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Delivery Profit</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  const totalRevenue = data.revenue;
                  
                  return (
                    <div className="bg-white p-4 rounded-xl shadow-xl border border-brand-brown/10 min-w-[220px]">
                      <p className="text-brand-brown font-black italic mb-3 border-b border-brand-brown/5 pb-2 text-sm">{data.fullDate}</p>
                      <div className="space-y-4">
                        {/* Main Metrics */}
                        <div className="space-y-1.5">
                          {payload.filter((p: any) => !['repeatRev', 'newRegRev', 'unregRev', 'zomatoRev', 'repeatAOV', 'newRegAOV', 'unregAOV', 'zomatoAOV'].includes(p.dataKey)).map((entry: any, index: number) => (
                            <div key={`main-${index}`} className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                <span className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider whitespace-nowrap">
                                  {entry.name}
                                </span>
                              </div>
                              <p className="text-xs font-black text-brand-brown tracking-tighter">
                                ₹{typeof entry.value === 'number' ? entry.value.toLocaleString(undefined, { minimumFractionDigits: 1 }) : '0.0'}
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* Segment Breakdown */}
                        {showSegments && (
                          <div className="pt-2 border-t border-brand-brown/5 space-y-3">
                            <p className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest">Customer Segments</p>
                            {[
                              { label: 'Repeat', rev: data.repeatRev, aov: data.repeatAOV, color: '#10B981' },
                              { label: 'New Registered', rev: data.newRegRev, aov: data.newRegAOV, color: '#F59E0B' },
                              { label: 'Unregistered', rev: data.unregRev, aov: data.unregAOV, color: '#6B7280' },
                              { label: 'Zomato User', rev: data.zomatoRev, aov: data.zomatoAOV, color: '#E11D48' }
                            ].map((seg, idx) => (
                              <div key={idx} className="flex flex-col gap-1 bg-brand-brown/5 p-2 rounded-lg">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: seg.color }} />
                                    <span className="text-[9px] font-black uppercase text-brand-brown tracking-wider">{seg.label}</span>
                                  </div>
                                  {showRevenue && (
                                    <span className="text-[9px] font-black text-brand-brown/40">{totalRevenue > 0 ? ((seg.rev / totalRevenue) * 100).toFixed(0) : 0}%</span>
                                  )}
                                </div>
                                <div className="flex justify-between items-baseline">
                                  {showRevenue && (
                                    <span className="text-[11px] font-black text-brand-brown">₹{seg.rev.toLocaleString()}</span>
                                  )}
                                  {true && ( /* Always show AOV in segments if space permits, or follow showAvgTicket */
                                    <span className="text-[9px] font-bold text-brand-brown/40 uppercase">AOV: ₹{(seg.aov || 0).toFixed(1)}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Sit-Take Breakdown */}
                        {showSitTake && (
                          <div className="pt-2 border-t border-brand-brown/5 space-y-3">
                            <p className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest">Sit-Take Breakdown</p>
                            {[
                              { label: 'Dine-In', rev: data.dineInRev, aov: data.dineInAOV, profit: data.dineInProfit, color: '#EF4444' },
                              { label: 'Takeaway', rev: data.takeawayRev, aov: data.takeawayAOV, profit: data.takeawayProfit, color: '#4F46E5' }
                            ].map((seg, idx) => (
                              <div key={idx} className="flex flex-col gap-1 bg-brand-brown/5 p-2 rounded-lg">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: seg.color }} />
                                    <span className="text-[9px] font-black uppercase text-brand-brown tracking-wider">{seg.label}</span>
                                  </div>
                                  {showRevenue && (
                                    <span className="text-[9px] font-black text-brand-brown/40">{totalRevenue > 0 ? ((seg.rev / totalRevenue) * 100).toFixed(0) : 0}%</span>
                                  )}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  {showRevenue && <div className="flex justify-between items-baseline px-1">
                                    <span className="text-[8px] font-bold text-brand-brown/40 uppercase">Revenue</span>
                                    <span className="text-[10px] font-black text-brand-brown">₹{seg.rev.toLocaleString()}</span>
                                  </div>}
                                  {showProfit && <div className="flex justify-between items-baseline px-1">
                                    <span className="text-[8px] font-bold text-brand-brown/40 uppercase">Profit</span>
                                    <span className="text-[10px] font-black text-emerald-600">₹{seg.profit.toLocaleString()}</span>
                                  </div>}
                                  {showAvgTicket && <div className="flex justify-between items-baseline px-1">
                                    <span className="text-[8px] font-bold text-brand-brown/40 uppercase">AOV</span>
                                    <span className="text-[10px] font-black text-indigo-600">₹{seg.aov.toFixed(1)}</span>
                                  </div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Delivery Breakdown */}
                        {showDelivery && (
                          <div className="pt-2 border-t border-brand-brown/5 space-y-3">
                            <p className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest">Delivery Breakdown</p>
                            <div className="flex flex-col gap-1 bg-brand-brown/5 p-2 rounded-lg">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-[#db2777]" />
                                  <span className="text-[9px] font-black uppercase text-brand-brown tracking-wider">Zomato/Delivery</span>
                                </div>
                                {showRevenue && (
                                  <span className="text-[9px] font-black text-brand-brown/40">{totalRevenue > 0 ? ((data.deliveryRev / totalRevenue) * 100).toFixed(0) : 0}%</span>
                                )}
                              </div>
                              <div className="flex flex-col gap-0.5">
                                {showRevenue && <div className="flex justify-between items-baseline px-1">
                                  <span className="text-[8px] font-bold text-brand-brown/40 uppercase">Revenue</span>
                                  <span className="text-[10px] font-black text-brand-brown">₹{data.deliveryRev.toLocaleString()}</span>
                                </div>}
                                {showProfit && <div className="flex justify-between items-baseline px-1">
                                  <span className="text-[8px] font-bold text-brand-brown/40 uppercase">Profit</span>
                                  <span className="text-[10px] font-black text-pink-600">₹{data.deliveryProfit.toLocaleString()}</span>
                                </div>}
                                {showAvgTicket && <div className="flex justify-between items-baseline px-1">
                                  <span className="text-[8px] font-bold text-brand-brown/40 uppercase">AOV</span>
                                  <span className="text-[10px] font-black text-pink-600">₹{data.deliveryAOV.toFixed(1)}</span>
                                </div>}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
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
            
            {showSegments && (
              <>
                {/* Revenue Lines - Only if Revenue metric is on */}
                {showRevenue && (
                  <>
                    <Line 
                       yAxisId="left"
                       type="monotone" 
                       dataKey="repeatRev" 
                       name="Repeat Customers Revenue" 
                       stroke="#10B981" 
                       strokeWidth={3}
                       dot={{ r: 3, fill: '#10B981' }}
                    />
                    <Line 
                       yAxisId="left"
                       type="monotone" 
                       dataKey="newRegRev" 
                       name="New Registered Revenue" 
                       stroke="#F59E0B" 
                       strokeWidth={3}
                       dot={{ r: 3, fill: '#F59E0B' }}
                    />
                    <Line 
                       yAxisId="left"
                       type="monotone" 
                       dataKey="unregRev" 
                       name="Unregistered Revenue" 
                       stroke="#6B7280" 
                       strokeWidth={3}
                       dot={{ r: 3, fill: '#6B7280' }}
                    />
                    <Line 
                       yAxisId="left"
                       type="monotone" 
                       dataKey="zomatoRev" 
                       name="Zomato Revenue" 
                       stroke="#E11D48" 
                       strokeWidth={3}
                       dot={{ r: 3, fill: '#E11D48' }}
                    />
                  </>
                )}

                {/* AOV Lines (Dashed) - Only if Ticket metric is on */}
                {showAvgTicket && (
                  <>
                    <Line 
                       yAxisId="right"
                       type="monotone" 
                       dataKey="repeatAOV" 
                       name="Repeat AOV" 
                       stroke="#10B981" 
                       strokeWidth={2}
                       strokeDasharray="5 5"
                       dot={false}
                    />
                    <Line 
                       yAxisId="right"
                       type="monotone" 
                       dataKey="newRegAOV" 
                       name="New Registered AOV" 
                       stroke="#F59E0B" 
                       strokeWidth={2}
                       strokeDasharray="5 5"
                       dot={false}
                    />
                    <Line 
                       yAxisId="right"
                       type="monotone" 
                       dataKey="unregAOV" 
                       name="Unregistered AOV" 
                       stroke="#6B7280" 
                       strokeWidth={2}
                       strokeDasharray="5 5"
                       dot={false}
                    />
                    <Line 
                       yAxisId="right"
                       type="monotone" 
                       dataKey="zomatoAOV" 
                       name="Zomato AOV" 
                       stroke="#E11D48" 
                       strokeWidth={2}
                       strokeDasharray="5 5"
                       dot={false}
                    />
                  </>
                )}
              </>
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
                 fillOpacity={showSitTake ? 0.3 : 1}
              />
            )}

            {showSitTake && (
              <>
                {/* Sit-Take Revenue Lines */}
                {showRevenue && (
                  <>
                    <Line 
                       yAxisId="left"
                       type="monotone" 
                       dataKey="dineInRev" 
                       name="Dine-In Revenue" 
                       stroke="#EF4444" 
                       strokeWidth={2}
                       dot={{ r: 2, fill: '#EF4444' }}
                    />
                    <Line 
                       yAxisId="left"
                       type="monotone" 
                       dataKey="takeawayRev" 
                       name="Takeaway Revenue" 
                       stroke="#4F46E5" 
                       strokeWidth={2}
                       dot={{ r: 2, fill: '#4F46E5' }}
                    />
                  </>
                )}

                {/* Sit-Take Profit Lines */}
                {showProfit && (
                  <>
                    <Line 
                       yAxisId="left"
                       type="monotone" 
                       dataKey="dineInProfit" 
                       name="Dine-In Profit" 
                       stroke="#EF4444" 
                       strokeWidth={2}
                       strokeDasharray="2 2"
                       dot={false}
                    />
                    <Line 
                       yAxisId="left"
                       type="monotone" 
                       dataKey="takeawayProfit" 
                       name="Takeaway Profit" 
                       stroke="#4F46E5" 
                       strokeWidth={2}
                       strokeDasharray="2 2"
                       dot={false}
                    />
                  </>
                )}

                {/* Sit-Take AOV Lines */}
                {showAvgTicket && (
                  <>
                    <Line 
                       yAxisId="right"
                       type="monotone" 
                       dataKey="dineInAOV" 
                       name="Dine-In AOV" 
                       stroke="#EF4444" 
                       strokeWidth={2}
                       strokeDasharray="4 4"
                       dot={false}
                    />
                    <Line 
                       yAxisId="right"
                       type="monotone" 
                       dataKey="takeawayAOV" 
                       name="Takeaway AOV" 
                       stroke="#4F46E5" 
                       strokeWidth={2}
                       strokeDasharray="4 4"
                       dot={false}
                    />
                  </>
                )}
              </>
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

                {/* Segment WMAs */}
                {showSegments && (
                  <>
                    {showRevenue && (
                      <>
                        <Line yAxisId="left" type="monotone" dataKey="repeatRevSMA" name="Repeat Rev (WMA)" stroke="#10B981" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                        <Line yAxisId="left" type="monotone" dataKey="newRegRevSMA" name="New Reg Rev (WMA)" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                        <Line yAxisId="left" type="monotone" dataKey="unregRevSMA" name="Unreg Rev (WMA)" stroke="#6B7280" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                      </>
                    )}
                    {showAvgTicket && (
                      <>
                        <Line yAxisId="right" type="monotone" dataKey="repeatAOVSMA" name="Repeat AOV (WMA)" stroke="#10B981" strokeWidth={1} strokeDasharray="2 4" dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="newRegAOVSMA" name="New Reg AOV (WMA)" stroke="#F59E0B" strokeWidth={1} strokeDasharray="2 4" dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="unregAOVSMA" name="Unreg AOV (WMA)" stroke="#6B7280" strokeWidth={1} strokeDasharray="2 4" dot={false} />
                      </>
                    )}
                  </>
                )}

                {/* Sit-Take WMAs */}
                {showSitTake && (
                  <>
                    {showRevenue && (
                      <>
                        <Line yAxisId="left" type="monotone" dataKey="dineInRevSMA" name="Dine-In Rev (WMA)" stroke="#EF4444" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                        <Line yAxisId="left" type="monotone" dataKey="takeawayRevSMA" name="Takeaway Rev (WMA)" stroke="#4F46E5" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                      </>
                    )}
                    {showProfit && (
                      <>
                        <Line yAxisId="left" type="monotone" dataKey="dineInProfitSMA" name="Dine-In Profit (WMA)" stroke="#EF4444" strokeWidth={1} strokeDasharray="1 3" dot={false} />
                        <Line yAxisId="left" type="monotone" dataKey="takeawayProfitSMA" name="Takeaway Profit (WMA)" stroke="#4F46E5" strokeWidth={1} strokeDasharray="1 3" dot={false} />
                      </>
                    )}
                    {showAvgTicket && (
                      <>
                        <Line yAxisId="right" type="monotone" dataKey="dineInAOVSMA" name="Dine-In AOV (WMA)" stroke="#EF4444" strokeWidth={1} strokeDasharray="2 4" dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="takeawayAOVSMA" name="Takeaway AOV (WMA)" stroke="#4F46E5" strokeWidth={1} strokeDasharray="2 4" dot={false} />
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {showDelivery && (
              <>
                {showRevenue && (
                  <Area 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="deliveryRev" 
                    name="Delivery Revenue" 
                    stroke="#db2777" 
                    fill="#fce7f3" 
                    strokeWidth={2}
                    fillOpacity={0.2}
                  />
                )}
                {showProfit && (
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="deliveryProfit" 
                    name="Delivery Profit" 
                    stroke="#db2777" 
                    strokeWidth={2}
                    strokeDasharray="2 2"
                    dot={false}
                  />
                )}
                {showAvgTicket && (
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="deliveryAOV" 
                    name="Delivery AOV" 
                    stroke="#db2777" 
                    strokeWidth={2}
                    strokeDasharray="4 4"
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
