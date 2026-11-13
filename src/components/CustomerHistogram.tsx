import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { 
  Users, 
  BarChart3, 
  HelpCircle, 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  MessageSquare, 
  Copy, 
  Check, 
  Download, 
  Flame, 
  Coins, 
  UtensilsCrossed, 
  GraduationCap
} from 'lucide-react';
import { Customer, CompletedOrder } from '../types';
import { normalizePhone } from '../utils/storage';

interface CustomerHistogramProps {
  customers: Customer[];
  allCustomers?: Customer[];
  allOrders?: CompletedOrder[];
  customerOrderStats?: Record<string, { DINE_IN: number; TAKEAWAY: number; DELIVERY: number; total: number }>;
}

export const CustomerHistogram: React.FC<CustomerHistogramProps> = ({ 
  customers, 
  allCustomers, 
  allOrders,
  customerOrderStats = {}
}) => {
  const [metric, setMetric] = useState<'ltv' | 'orders'>('ltv');
  const [activeTab, setActiveTab] = useState<'distribution' | 'category_map' | 'marketing'>('distribution');
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);

  // 1. MACRO METRICS & TOTALS
  const cohortCustomersCount = customers.length;

  const cohortTotalSpend = useMemo(() => {
    return customers.reduce((sum, c) => sum + (Number(c.totalSpent) || 0), 0);
  }, [customers]);

  const cohortTotalOrders = useMemo(() => {
    return customers.reduce((sum, c) => sum + (Number(c.totalOrders) || 0), 0);
  }, [customers]);

  // Denominators for Registered Base
  const registeredPool = useMemo(() => {
    return (allCustomers && allCustomers.length > 0) ? allCustomers : customers;
  }, [allCustomers, customers]);

  const totalRegisteredCustomersCount = registeredPool.length;

  const totalRegisteredRevenue = useMemo(() => {
    return registeredPool.reduce((sum, c) => sum + (Number(c.totalSpent) || 0), 0);
  }, [registeredPool]);

  const totalRegisteredOrders = useMemo(() => {
    return registeredPool.reduce((sum, c) => sum + (Number(c.totalOrders) || 0), 0);
  }, [registeredPool]);

  // Denominators for Total Store (Orders table including unregistered walk-ins)
  const totalStoreRevenue = useMemo(() => {
    if (allOrders && allOrders.length > 0) {
      return allOrders.reduce((sum, o) => sum + (Number(o.manualTotal != null ? o.manualTotal : o.total) || 0), 0);
    }
    // Fallback if allOrders not populated
    return totalRegisteredRevenue;
  }, [allOrders, totalRegisteredRevenue]);

  const totalStoreOrders = useMemo(() => {
    if (allOrders && allOrders.length > 0) {
      return allOrders.length;
    }
    return totalRegisteredOrders;
  }, [allOrders, totalRegisteredOrders]);

  // Percentage Calculations
  const pctOfRegRev = totalRegisteredRevenue > 0 
    ? Number(((cohortTotalSpend / totalRegisteredRevenue) * 100).toFixed(1)) 
    : 0;

  const pctOfTotalRev = totalStoreRevenue > 0 
    ? Number(((cohortTotalSpend / totalStoreRevenue) * 100).toFixed(1)) 
    : pctOfRegRev;

  const pctOfRegOrders = totalRegisteredOrders > 0 
    ? Number(((cohortTotalOrders / totalRegisteredOrders) * 100).toFixed(1)) 
    : 0;

  const pctOfTotalOrders = totalStoreOrders > 0 
    ? Number(((cohortTotalOrders / totalStoreOrders) * 100).toFixed(1)) 
    : pctOfRegOrders;

  const pctOfRegCust = totalRegisteredCustomersCount > 0 
    ? Number(((cohortCustomersCount / totalRegisteredCustomersCount) * 100).toFixed(1)) 
    : 100;

  // Averages
  const avgRevenuePerCustomer = cohortCustomersCount > 0 
    ? Math.round(cohortTotalSpend / cohortCustomersCount) 
    : 0;

  const avgOrdersPerCustomer = cohortCustomersCount > 0 
    ? Number((cohortTotalOrders / cohortCustomersCount).toFixed(1)) 
    : 0;

  const cohortAOV = cohortTotalOrders > 0 
    ? Math.round(cohortTotalSpend / cohortTotalOrders) 
    : 0;

  // Store-wide benchmarks for comparison
  const networkAvgLtv = totalRegisteredCustomersCount > 0 
    ? Math.round(totalRegisteredRevenue / totalRegisteredCustomersCount) 
    : 0;

  const networkAvgOrders = totalRegisteredCustomersCount > 0 
    ? Number((totalRegisteredOrders / totalRegisteredCustomersCount).toFixed(1)) 
    : 0;

  // 2. OVERALL CATEGORY MAP PROFILE (Archetype & Demographics)
  const categoryMap = useMemo(() => {
    if (cohortCustomersCount === 0) return null;

    // Student vs Regular
    const students = customers.filter(c => c.note === 'STUDENT' || c.note?.startsWith('STUDENT|'));
    const studentCount = students.length;
    const regularCount = cohortCustomersCount - studentCount;
    const studentPct = Math.round((studentCount / cohortCustomersCount) * 100);
    const regularPct = 100 - studentPct;

    // Service Mode Affinity (from customerOrderStats or fallback)
    let totalDineIn = 0;
    let totalTakeaway = 0;
    let totalDelivery = 0;
    let customersWithStats = 0;

    customers.forEach(c => {
      const phone = normalizePhone(c.phone);
      const st = customerOrderStats[phone];
      if (st && st.total > 0) {
        totalDineIn += st.DINE_IN || 0;
        totalTakeaway += st.TAKEAWAY || 0;
        totalDelivery += st.DELIVERY || 0;
        customersWithStats++;
      }
    });

    const totalModeOrders = totalDineIn + totalTakeaway + totalDelivery;
    const dineInPct = totalModeOrders > 0 ? Math.round((totalDineIn / totalModeOrders) * 100) : 45;
    const takeawayPct = totalModeOrders > 0 ? Math.round((totalTakeaway / totalModeOrders) * 100) : 45;
    const deliveryPct = totalModeOrders > 0 ? Math.max(0, 100 - dineInPct - takeawayPct) : 10;

    // Recency / Retention Health
    const now = Date.now();
    let active30d = 0;
    let atRisk60d = 0;
    let dormant = 0;

    customers.forEach(c => {
      if (!c.lastVisit) {
        dormant++;
        return;
      }
      const visitTime = new Date(c.lastVisit).getTime();
      const diffDays = (now - visitTime) / (1000 * 60 * 60 * 24);
      if (diffDays <= 30) active30d++;
      else if (diffDays <= 60) atRisk60d++;
      else dormant++;
    });

    // MinCoins & VIP Referrals
    const totalMinCoins = customers.reduce((sum, c) => sum + (c.minCoins || 0), 0);
    const avgMinCoins = Math.round(totalMinCoins / cohortCustomersCount);
    const referralAdvocates = customers.filter(c => c.isReferralActive || c.referralCode).length;

    // Strategic Archetype Classification
    let archetype = {
      title: 'Core Momo Enthusiasts',
      badgeColor: 'bg-brand-brown text-brand-yellow',
      description: 'Steady repeat customers with balanced dining habits and high appreciation for authentic steamed and crispy momos.',
      topStrategy: 'Basket expander add-ons (+2 Steamed Momos for ₹15 or Fries add-on)',
      giftIdea: 'Complimentary Campa Cola with orders above ₹150'
    };

    if (studentPct >= 50) {
      archetype = {
        title: 'Campus Foodies & Student Network',
        badgeColor: 'bg-emerald-600 text-white',
        description: 'High-frequency campus crowd sensitive to deals, group sharing, and late-afternoon snacks.',
        topStrategy: 'Student Gang 50% Off challenge (GANG-XXXX) & peer referral rewards',
        giftIdea: 'Free Virgin Mojito on student group visits with ₹99+ cart'
      };
    } else if (avgOrdersPerCustomer >= 10 || avgRevenuePerCustomer >= 2500) {
      archetype = {
        title: 'VIP Mountain Champions',
        badgeColor: 'bg-amber-500 text-brand-brown',
        description: 'Elite top-tier patrons who account for exceptional revenue and frequent regular visits.',
        topStrategy: 'VIP Referral Club invite (earn 50% match as MinCoins) & secret tasting invites',
        giftIdea: 'Surprise Kurkure Momos tasting plate & personalized handwritten note'
      };
    } else if (dormant / cohortCustomersCount >= 0.5) {
      archetype = {
        title: 'At-Risk / Lapsed Patrons',
        badgeColor: 'bg-rose-600 text-white',
        description: 'Previously regular customers who have not ordered in over 60 days. Immediate win-back needed.',
        topStrategy: 'Win-Back Exclusive Voucher (Flat ₹50 OFF or Free Momo plate on return)',
        giftIdea: 'Flat ₹50 We-Miss-You revival credit on their next bill'
      };
    } else if (avgOrdersPerCustomer <= 1.5) {
      archetype = {
        title: 'New Explorers (1st-2nd Visit)',
        badgeColor: 'bg-indigo-600 text-white',
        description: 'Recently acquired diners. The prime window to lock in habit formation and 2nd visit retention.',
        topStrategy: 'Promote 2nd Visit 15% Welcome Discount (DISC15-XXXX) & MinCoins sign-up',
        giftIdea: 'Welcome Campa Cola can & MinCoins welcome bonus'
      };
    }

    return {
      studentCount,
      regularCount,
      studentPct,
      regularPct,
      dineInPct,
      takeawayPct,
      deliveryPct,
      active30d,
      atRisk60d,
      dormant,
      totalMinCoins,
      avgMinCoins,
      referralAdvocates,
      archetype
    };
  }, [customers, cohortCustomersCount, customerOrderStats, avgOrdersPerCustomer, avgRevenuePerCustomer]);

  // 3. HISTOGRAM CHART DATA
  const chartData = useMemo(() => {
    if (!customers || customers.length === 0) return [];

    if (metric === 'ltv') {
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

  const highestSegment = useMemo(() => {
    if (chartData.length === 0) return null;
    return [...chartData].sort((a, b) => b['Number of Customers'] - a['Number of Customers'])[0];
  }, [chartData]);

  // Handle Copy Template
  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTemplate(key);
    setTimeout(() => setCopiedTemplate(null), 2500);
  };

  // Handle Export Cohort CSV
  const handleExportCohortCsv = () => {
    if (customers.length === 0) return;
    const headers = ['Phone', 'Name', 'Total Orders', 'Lifetime Spend (INR)', 'MinCoins Balance', 'Customer Type', 'Last Visit', 'Referral Code'];
    const rows = customers.map(c => [
      c.phone,
      `"${(c.name || 'Valued Customer').replace(/"/g, '""')}"`,
      c.totalOrders || 0,
      c.totalSpent || 0,
      c.minCoins || 0,
      c.note?.includes('STUDENT') ? 'Student' : 'Regular',
      c.lastVisit ? c.lastVisit.slice(0, 10) : 'Never',
      c.referralCode || 'None'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `minmomos-cohort-${customers.length}-customers.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeColor = metric === 'ltv' ? '#A2593E' : '#C83232';

  return (
    <div className="bg-white rounded-[2.5rem] p-6 lg:p-8 border-2 border-brand-stone shadow-xl space-y-8">
      {/* HEADER & VIEW CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-brand-stone/60 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-red" />
            <h3 className="text-xl lg:text-2xl font-black text-brand-brown uppercase italic tracking-tight">
              COHORT <span className="text-brand-red">DISTRIBUTION & INTELLIGENCE MAP</span>
            </h3>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-brand-brown/40 mt-1">
            Analyzing customer counts segmented by {metric === 'ltv' ? 'lifetime value (LTV)' : 'purchase frequency'} • Category Footprint & Marketing
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-brand-brown/5 p-1 rounded-2xl flex items-center border border-brand-stone">
            <button
              onClick={() => setActiveTab('distribution')}
              className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'distribution'
                  ? 'bg-brand-brown text-brand-yellow shadow-md'
                  : 'text-brand-brown/50 hover:bg-brand-stone/30'
              }`}
            >
              📊 Histogram
            </button>
            <button
              onClick={() => setActiveTab('category_map')}
              className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'category_map'
                  ? 'bg-brand-brown text-brand-yellow shadow-md'
                  : 'text-brand-brown/50 hover:bg-brand-stone/30'
              }`}
            >
              🗺️ Category Map
            </button>
            <button
              onClick={() => setActiveTab('marketing')}
              className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'marketing'
                  ? 'bg-brand-red text-white shadow-md'
                  : 'text-brand-brown/50 hover:bg-brand-stone/30'
              }`}
            >
              🎯 Marketing Playbook
            </button>
          </div>

          <button
            onClick={handleExportCohortCsv}
            disabled={cohortCustomersCount === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 disabled:opacity-40 cursor-pointer"
            title="Download CSV of this cohort for WhatsApp or SMS campaign"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export ({cohortCustomersCount})</span>
          </button>
        </div>
      </div>

      {/* CORE FINANCIAL & CONTRIBUTION METRICS TILES (Requested by User) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TILE 1: GROUP SIZE & REACH */}
        <div className="bg-gradient-to-br from-brand-cream/30 to-amber-50/40 p-5 rounded-3xl border border-brand-stone/70 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-black uppercase tracking-widest text-brand-brown/50">Cohort Audience</span>
            <Users className="w-4 h-4 text-brand-brown/40" />
          </div>
          <div>
            <p className="text-2xl font-black text-brand-brown tracking-tight">
              {cohortCustomersCount.toLocaleString()} <span className="text-xs font-bold text-brand-brown/50 uppercase">Cust</span>
            </p>
            <p className="text-[10px] font-black text-brand-red uppercase tracking-wider mt-0.5">
              {pctOfRegCust}% of registered base
            </p>
          </div>
          {highestSegment && (
            <div className="pt-2 border-t border-brand-stone/40 flex items-center justify-between text-[9px] font-bold text-brand-brown/60">
              <span>Peak: <strong>{highestSegment.range}</strong></span>
              <span className="bg-brand-brown/10 px-1.5 py-0.5 rounded font-black text-brand-brown">{highestSegment['Percentage']}%</span>
            </div>
          )}
        </div>

        {/* TILE 2: TOTAL MONEY SPENT (Revenue Contribution) */}
        <div className="bg-gradient-to-br from-emerald-50/60 to-teal-50/40 p-5 rounded-3xl border border-emerald-200/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-black uppercase tracking-widest text-emerald-800">Total Money Spent</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-emerald-900 tracking-tight">
              ₹{cohortTotalSpend.toLocaleString()}
            </p>
            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider mt-0.5">
              {pctOfRegRev}% of Registered Revenue
            </p>
          </div>
          <div className="pt-2 border-t border-emerald-200/60 space-y-1">
            <div className="flex justify-between text-[9px] font-bold text-emerald-800">
              <span>Share of Total Revenue:</span>
              <span className="font-black">{pctOfTotalRev}%</span>
            </div>
            {/* Visual dual-progress bar */}
            <div className="w-full bg-emerald-200/60 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, pctOfTotalRev)}%` }} 
              />
            </div>
          </div>
        </div>

        {/* TILE 3: TOTAL ORDERS COUNT (Volume Contribution) */}
        <div className="bg-gradient-to-br from-rose-50/60 to-orange-50/40 p-5 rounded-3xl border border-rose-200/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-black uppercase tracking-widest text-rose-800">Total Orders Placed</span>
            <ShoppingBag className="w-4 h-4 text-rose-600" />
          </div>
          <div>
            <p className="text-2xl font-black text-rose-900 tracking-tight">
              {cohortTotalOrders.toLocaleString()} <span className="text-xs font-bold text-rose-600 uppercase">Orders</span>
            </p>
            <p className="text-[10px] font-black text-rose-700 uppercase tracking-wider mt-0.5">
              {pctOfRegOrders}% of Registered Orders
            </p>
          </div>
          <div className="pt-2 border-t border-rose-200/60 space-y-1">
            <div className="flex justify-between text-[9px] font-bold text-rose-800">
              <span>Share of Total Orders:</span>
              <span className="font-black">{pctOfTotalOrders}%</span>
            </div>
            <div className="w-full bg-rose-200/60 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-rose-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, pctOfTotalOrders)}%` }} 
              />
            </div>
          </div>
        </div>

        {/* TILE 4: UNIT ECONOMICS (Averages) */}
        <div className="bg-gradient-to-br from-indigo-50/60 to-blue-50/40 p-5 rounded-3xl border border-indigo-200/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-black uppercase tracking-widest text-indigo-800">Cohort Unit Economics</span>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] font-bold text-indigo-900/60 uppercase">Avg Spend / Cust:</span>
              <span className="text-base font-black text-indigo-950">₹{avgRevenuePerCustomer.toLocaleString()}</span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-[9px] font-bold text-indigo-900/60 uppercase">Avg Orders / Cust:</span>
              <span className="text-base font-black text-indigo-950">{avgOrdersPerCustomer} orders</span>
            </div>
          </div>
          <div className="pt-2 border-t border-indigo-200/60 flex items-center justify-between text-[9px] font-bold text-indigo-800">
            <span>Avg Order Value (AOV):</span>
            <span className="font-black text-indigo-950">₹{cohortAOV.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* TAB CONTENT: 1. DISTRIBUTION HISTOGRAM */}
      {activeTab === 'distribution' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-brown/50">
              Segment Frequency Distribution
            </span>
            <div className="bg-brand-brown/5 p-1 rounded-xl flex items-center border border-brand-stone shadow-inner">
              <button
                onClick={() => setMetric('ltv')}
                className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                  metric === 'ltv'
                    ? 'bg-brand-brown text-brand-yellow shadow-sm'
                    : 'text-brand-brown/50 hover:bg-brand-stone/30'
                }`}
              >
                By LTV Band
              </button>
              <button
                onClick={() => setMetric('orders')}
                className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                  metric === 'orders'
                    ? 'bg-brand-red text-white shadow-sm'
                    : 'text-brand-brown/50 hover:bg-brand-stone/30'
                }`}
              >
                By Order Count
              </button>
            </div>
          </div>

          <div className="h-80 w-full bg-brand-cream/5 rounded-[2rem] border border-brand-stone/30 p-4 flex flex-col justify-end">
            {cohortCustomersCount === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <HelpCircle className="w-10 h-10 text-brand-brown/20 mb-2" />
                <p className="text-xs font-black uppercase text-brand-brown/40 tracking-widest">No customer profiles match active filters</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
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
                          <div className="bg-white border-2 border-brand-stone rounded-2xl p-4 shadow-xl text-brand-brown max-w-xs">
                            <p className="text-xs font-black uppercase tracking-tight mb-2 text-brand-brown/50 border-b pb-1">
                              Bracket: {data.range}
                            </p>
                            <div className="space-y-1.5 font-bold text-xs">
                              <p className="flex justify-between gap-6">
                                <span>Customers:</span>
                                <span className="font-black text-brand-red">{data['Number of Customers']}</span>
                              </p>
                              <p className="flex justify-between gap-6">
                                <span>Cohort Share:</span>
                                <span className="font-black">{data['Percentage']}%</span>
                              </p>
                              <p className="flex justify-between gap-6">
                                <span>Bracket Revenue:</span>
                                <span className="font-black text-emerald-600">₹{(data['Total Revenue'] || 0).toLocaleString()}</span>
                              </p>
                              <p className="flex justify-between gap-6 border-t pt-1.5 mt-1.5">
                                <span>Avg Spent / User:</span>
                                <span className="font-black text-brand-brown">₹{(data['Average Spent'] || 0).toLocaleString()}</span>
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="Number of Customers" radius={[12, 12, 0, 0]} maxBarSize={60}>
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
        </div>
      )}

      {/* TAB CONTENT: 2. OVERALL CATEGORY MAP PROFILE */}
      {activeTab === 'category_map' && categoryMap && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* ARCHETYPE BANNER */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-brand-brown to-stone-900 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl relative overflow-hidden">
            <div className="space-y-2 z-10 max-w-xl">
              <div className="flex items-center gap-3">
                <span className={`text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${categoryMap.archetype.badgeColor}`}>
                  {categoryMap.archetype.title}
                </span>
                <span className="text-[10px] font-bold text-brand-yellow uppercase tracking-widest">Category Archetype</span>
              </div>
              <p className="text-xs text-white/80 font-medium leading-relaxed">
                {categoryMap.archetype.description}
              </p>
            </div>
            <div className="z-10 bg-white/10 p-4 rounded-2xl border border-white/15 backdrop-blur-md shrink-0 text-right">
              <span className="text-[8px] font-black uppercase tracking-wider text-brand-yellow block">Primary Growth Focus</span>
              <span className="text-xs font-black text-white">{categoryMap.archetype.topStrategy}</span>
            </div>
          </div>

          {/* 4 PILLARS OF CATEGORY MAP */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* PILLAR 1: Student vs Regular */}
            <div className="p-5 rounded-3xl bg-brand-cream/20 border border-brand-stone/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase text-brand-brown/60 tracking-wider">Demographic Mix</span>
                <GraduationCap className="w-4 h-4 text-brand-brown/40" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-black text-brand-brown">
                  <span>🎓 Students:</span>
                  <span>{categoryMap.studentCount} ({categoryMap.studentPct}%)</span>
                </div>
                <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${categoryMap.studentPct}%` }} />
                </div>
                <div className="flex justify-between items-center text-xs font-black text-brand-brown">
                  <span>👤 Regulars:</span>
                  <span>{categoryMap.regularCount} ({categoryMap.regularPct}%)</span>
                </div>
              </div>
            </div>

            {/* PILLAR 2: Service Mode Affinity */}
            <div className="p-5 rounded-3xl bg-brand-cream/20 border border-brand-stone/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase text-brand-brown/60 tracking-wider">Service Mode Split</span>
                <UtensilsCrossed className="w-4 h-4 text-brand-brown/40" />
              </div>
              <div className="space-y-1.5 text-xs font-bold text-brand-brown">
                <div className="flex justify-between">
                  <span>🍽️ Dine-in:</span>
                  <span className="font-black text-brand-brown">{categoryMap.dineInPct}%</span>
                </div>
                <div className="flex justify-between">
                  <span>🥡 Takeaway:</span>
                  <span className="font-black text-brand-red">{categoryMap.takeawayPct}%</span>
                </div>
                <div className="flex justify-between">
                  <span>🛵 Delivery:</span>
                  <span className="font-black text-blue-600">{categoryMap.deliveryPct}%</span>
                </div>
              </div>
            </div>

            {/* PILLAR 3: Recency & Activity Health */}
            <div className="p-5 rounded-3xl bg-brand-cream/20 border border-brand-stone/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase text-brand-brown/60 tracking-wider">Retention Health</span>
                <Flame className="w-4 h-4 text-brand-brown/40" />
              </div>
              <div className="space-y-1.5 text-xs font-bold">
                <div className="flex justify-between text-emerald-700">
                  <span>🟢 Active (≤30d):</span>
                  <span className="font-black">{categoryMap.active30d}</span>
                </div>
                <div className="flex justify-between text-amber-700">
                  <span>🟡 At-Risk (31-60d):</span>
                  <span className="font-black">{categoryMap.atRisk60d}</span>
                </div>
                <div className="flex justify-between text-rose-700">
                  <span>🔴 Dormant (&gt;60d):</span>
                  <span className="font-black">{categoryMap.dormant}</span>
                </div>
              </div>
            </div>

            {/* PILLAR 4: MinCoins & VIP Referral Power */}
            <div className="p-5 rounded-3xl bg-brand-cream/20 border border-brand-stone/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase text-brand-brown/60 tracking-wider">Loyalty & Referrals</span>
                <Coins className="w-4 h-4 text-brand-brown/40" />
              </div>
              <div className="space-y-1.5 text-xs font-bold text-brand-brown">
                <div className="flex justify-between">
                  <span>🪙 Total MinCoins:</span>
                  <span className="font-black text-indigo-700">{categoryMap.totalMinCoins.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg per Customer:</span>
                  <span className="font-black text-brand-brown">{categoryMap.avgMinCoins} Coins</span>
                </div>
                <div className="flex justify-between">
                  <span>🎟️ VIP Advocates:</span>
                  <span className="font-black text-emerald-700">{categoryMap.referralAdvocates} active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 3. MARKETING & GIFTING PLAYBOOK */}
      {activeTab === 'marketing' && categoryMap && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* GIFTING & UPSELL STRATEGY CARD */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center text-sm shadow-md">
                  🎁
                </div>
                <div>
                  <h4 className="text-xs font-black text-amber-950 uppercase tracking-wider">Recommended Gifting Strategy</h4>
                  <p className="text-[9px] font-bold text-amber-800">High-ROI incentive to boost basket size</p>
                </div>
              </div>
              <p className="text-xs font-black text-brand-brown bg-white/80 p-3 rounded-2xl border border-amber-200">
                &ldquo;{categoryMap.archetype.giftIdea}&rdquo;
              </p>
              <p className="text-[9px] text-amber-900/70 font-medium">
                Tip: Instruct cashiers or add a promotional coupon tag to delight this cohort when their cart hits the target threshold.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-300 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-sm shadow-md">
                  🚀
                </div>
                <div>
                  <h4 className="text-xs font-black text-emerald-950 uppercase tracking-wider">Spend Expansion Strategy</h4>
                  <p className="text-[9px] font-bold text-emerald-800">Maximizing lifetime value from this cohort</p>
                </div>
              </div>
              <p className="text-xs font-black text-emerald-900 bg-white/80 p-3 rounded-2xl border border-emerald-200">
                &ldquo;{categoryMap.archetype.topStrategy}&rdquo;
              </p>
              <p className="text-[9px] text-emerald-900/70 font-medium">
                Recommendation engine will prioritize non-overlapping complementary add-ons (under 20% cart value) for this group.
              </p>
            </div>
          </div>

          {/* READY-TO-SEND WHATSAPP BROADCAST TEMPLATES */}
          <div className="bg-brand-cream/20 p-6 rounded-3xl border border-brand-stone space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-black uppercase text-brand-brown tracking-wider">
                  Ready-to-Send WhatsApp Broadcast Copy ({cohortCustomersCount} Recipients)
                </h4>
              </div>
              <span className="text-[8px] font-black uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                1-Click Copy
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* TEMPLATE A: VIP SPECIAL GIFT */}
              <div className="bg-white p-4 rounded-2xl border border-brand-stone/60 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[8px] font-black uppercase text-brand-red tracking-wider">Campaign A: Secret Momo Perk</span>
                    <span className="text-[8px] font-bold text-stone-400">High Conversion</span>
                  </div>
                  <p className="text-[11px] font-mono bg-stone-50 p-3 rounded-xl border border-stone-200 text-stone-700 whitespace-pre-line leading-relaxed">
{`Hey from MinMomos! 🥟✨
Because you're one of our absolute favorite regulars, we've loaded a surprise treat for your next visit!

Show this message at the counter to claim a FREE Chilled Campa Cola on any hot momo platter. 🥤❤️

Fresh from the Himalayan peaks — see you soon!`}
                  </p>
                </div>
                <button
                  onClick={() => handleCopy('A', `Hey from MinMomos! 🥟✨\nBecause you're one of our absolute favorite regulars, we've loaded a surprise treat for your next visit!\n\nShow this message at the counter to claim a FREE Chilled Campa Cola on any hot momo platter. 🥤❤️\n\nFresh from the Himalayan peaks — see you soon!`)}
                  className="w-full py-2 bg-brand-brown hover:bg-brand-red text-brand-yellow hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedTemplate === 'A' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedTemplate === 'A' ? 'Copied to Clipboard!' : 'Copy Broadcast Message'}</span>
                </button>
              </div>

              {/* TEMPLATE B: REFERRAL & GANG SHARING */}
              <div className="bg-white p-4 rounded-2xl border border-brand-stone/60 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[8px] font-black uppercase text-indigo-700 tracking-wider">Campaign B: VIP Referral Club</span>
                    <span className="text-[8px] font-bold text-stone-400">Viral Growth</span>
                  </div>
                  <p className="text-[11px] font-mono bg-stone-50 p-3 rounded-xl border border-stone-200 text-stone-700 whitespace-pre-line leading-relaxed">
{`Momo Craving Alert! 🥟🔥
Did you know your MinMomos VIP Referral code gives your friends Flat 50% OFF (up to ₹100), and you get 100% matched MinCoins back?

Ask our cashier for your unique coupon code next time you drop by, or bring your crew along! 🎒✨`}
                  </p>
                </div>
                <button
                  onClick={() => handleCopy('B', `Momo Craving Alert! 🥟🔥\nDid you know your MinMomos VIP Referral code gives your friends Flat 50% OFF (up to ₹100), and you get 100% matched MinCoins back?\n\nAsk our cashier for your unique coupon code next time you drop by, or bring your crew along! 🎒✨`)}
                  className="w-full py-2 bg-brand-brown hover:bg-brand-red text-brand-yellow hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedTemplate === 'B' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedTemplate === 'B' ? 'Copied to Clipboard!' : 'Copy Broadcast Message'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER & BENCHMARK SUMMARY */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-[9px] font-black uppercase tracking-widest text-brand-brown/40 border-t border-brand-stone/60 pt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-md" style={{ backgroundColor: activeColor }} />
          <span>Cohort Footprint: {cohortCustomersCount} Customers ({pctOfRegCust}% of Network)</span>
        </div>
        <div>
          <span>Network Benchmarks: ₹{networkAvgLtv.toLocaleString()} Avg Spend • {networkAvgOrders} Orders/Cust</span>
        </div>
      </div>
    </div>
  );
};
