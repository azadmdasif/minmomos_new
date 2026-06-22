
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getOrdersForDateRange, getOrderByBillNumber, getOrdersByItemName, getMatchingMenuItems, deleteOrderByBillNumber, getDeletedOrdersForDateRange, getStations, fetchCustomers, fetchCustomerHistory, updateCustomer, fetchUsualOrder, getTierInfo, calculateTotalMinCoins, getISTDate, getISTDateString, getISTFullDateTime, getISTHour, getISTDay, fetchManualAdjustments, fetchCustomerClassificationStats, fetchCohortRawData, CohortOrder, normalizePhone, syncCustomerStats } from '../utils/storage';
import { CompletedOrder, PaymentMethod, Station, User, Customer } from '../types';
import PrintReceipt from './PrintReceipt';
import DeleteBillModal from './DeleteBillModal';
import ItemSalesReport from './ItemSalesReport';
import PerformanceChart from './PerformanceChart';
import RevenueBreakdownChart from './RevenueBreakdownChart';
import OrderModeChart from './OrderModeChart';
import TimeWiseRevenueChart from './TimeWiseRevenueChart';
import CustomerInsights from './CustomerInsights';
import CohortRetentionChart from './CohortRetentionChart';
import CohortCompositionChart from './CohortCompositionChart';
import { CustomerHistogram } from './CustomerHistogram';
import { OrderIntervalChart } from './OrderIntervalChart';
import { Search, User as UserIcon, MapPin, Receipt, History, X, Send, MessageSquare, Edit3, Save, Calendar, Mail, FileText, Star, Users, TrendingUp as TrendingUpIcon, Gift, DollarSign, ShoppingBag, Download, RefreshCw } from 'lucide-react';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

const getTodaysDateString = () => {
  return getISTDateString();
};

const getDateString = (date: Date) => {
  return getISTDateString(date);
};

const getHistoricalStartDate = (dateStr: string, daysToSubtract: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - daysToSubtract);
  return getDateString(d);
};

const colorStops = [
  { p: 0.0, r: 79, g: 70, b: 229 },   // Indigo
  { p: 0.1, r: 37, g: 99, b: 235 },   // Blue
  { p: 0.2, r: 2, g: 132, b: 199 },    // Sky
  { p: 0.3, r: 8, g: 145, b: 178 },    // Cyan
  { p: 0.4, r: 13, g: 148, b: 136 },   // Teal
  { p: 0.5, r: 22, g: 163, b: 74 },    // Green
  { p: 0.6, r: 101, g: 163, b: 13 },   // Lime
  { p: 0.7, r: 202, g: 138, b: 4 },    // Yellow
  { p: 0.8, r: 234, g: 88, b: 12 },    // Orange
  { p: 0.9, r: 220, g: 38, b: 38 },    // Red
  { p: 1.0, r: 153, g: 27, b: 27 }     // Deep Red
];

const getHeatmapColor = (intensity: number) => {
  if (intensity <= 0) return 'rgba(0,0,0,0.03)';
  const t = Math.min(1, Math.max(0, intensity));
  
  let lower = colorStops[0];
  let upper = colorStops[colorStops.length - 1];
  
  for (let i = 0; i < colorStops.length - 1; i++) {
    if (t >= colorStops[i].p && t <= colorStops[i+1].p) {
      lower = colorStops[i];
      upper = colorStops[i+1];
      break;
    }
  }
  
  const range = upper.p - lower.p;
  const factor = range <= 0 ? 0 : (t - lower.p) / range;
  
  const r = Math.round(lower.r + factor * (upper.r - lower.r));
  const g = Math.round(lower.g + factor * (upper.g - lower.g));
  const b = Math.round(lower.b + factor * (upper.b - lower.b));
  
  return `rgb(${r}, ${g}, ${b})`;
};

const heatmapGradient = `linear-gradient(to right, ${colorStops.map(s => `rgb(${s.r}, ${s.g}, ${s.b}) ${s.p * 100}%`).join(', ')})`;

interface AnalyticsProps {
  user: User;
}

type DatePreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'last7' | 'last14' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';
type ActiveTab = 'active' | 'deleted' | 'adjustments';
type ReportView = 'revenue' | 'trends' | 'itemSales' | 'comparison' | 'profitability' | 'customers';

const Analytics: React.FC<AnalyticsProps> = ({ user }) => {
  const isAdmin = user.role === 'ADMIN';
  
  const [startDate, setStartDate] = useState<string>(getTodaysDateString());
  const [endDate, setEndDate] = useState<string>(getTodaysDateString());
  const [activePreset, setActivePreset] = useState<DatePreset>('today');
  const [activeTab, setActiveTab] = useState<ActiveTab>('active');
  const [reportView, setReportView] = useState<ReportView>('revenue');
  const [compareBy, setCompareBy] = useState<'STORE' | 'CASHIER'>('STORE');
  const [selectedStore, setSelectedStore] = useState<string>(isAdmin ? 'All' : (user.stationName || 'All'));
  const [availableStations, setAvailableStations] = useState<Station[]>([]);
  
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [chartOrders, setChartOrders] = useState<CompletedOrder[]>([]);
  const [allOrdersRaw, setAllOrdersRaw] = useState<CompletedOrder[]>([]);
  const [deletedOrders, setDeletedOrders] = useState<CompletedOrder[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerHistory, setSelectedCustomerHistory] = useState<CompletedOrder[]>([]);
  const [customMessage, setCustomMessage] = useState('');
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [usualOrder, setUsualOrder] = useState<{ name: string, quantity: number } | null>(null);
  const [cohortRawData, setCohortRawData] = useState<CohortOrder[]>([]);
  const [compositionPeriod, setCompositionPeriod] = useState<string | null>(null);
  const [analysisBasis, setAnalysisBasis] = useState<'REVENUE' | 'ORDERS'>('REVENUE');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<Customer>>({});
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMode, setSearchMode] = useState<'bill' | 'item'>('bill');
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [itemSuggestions, setItemSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [foundOrder, setFoundOrder] = useState<CompletedOrder | null>(null);
  const [foundOrdersList, setFoundOrdersList] = useState<CompletedOrder[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [foundOrderInitialBalance, setFoundOrderInitialBalance] = useState<number | undefined>(undefined);
  const [foundOrderFinalBalance, setFoundOrderFinalBalance] = useState<number | undefined>(undefined);
  const [foundOrderEarnedCoins, setFoundOrderEarnedCoins] = useState<number | undefined>(undefined);
  const [foundOrderNextCoupon, setFoundOrderNextCoupon] = useState<any>(null);
  const [searchMessage, setSearchMessage] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerSortField, setCustomerSortField] = useState<'totalSpent' | 'joinedDate' | 'totalOrders' | 'lastVisit'>('totalSpent');
  const [customerSortOrder, setCustomerSortOrder] = useState<'asc' | 'desc'>('desc');
  const [customerClassFilter, setCustomerClassFilter] = useState<'ALL' | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'UNCLASSIFIED'>('ALL');
  const [customerOrderStats, setCustomerOrderStats] = useState<Record<string, { DINE_IN: number, TAKEAWAY: number, DELIVERY: number, total: number }>>({});
  const [minLtv, setMinLtv] = useState<string>('');
  const [maxLtv, setMaxLtv] = useState<string>('');
  const [minOrders, setMinOrders] = useState<string>('');
  const [maxOrders, setMaxOrders] = useState<string>('');
  const [customerActivityStart, setCustomerActivityStart] = useState<string>('');
  const [customerActivityEnd, setCustomerActivityEnd] = useState<string>('');
  const [selectedDayInsights, setSelectedDayInsights] = useState<number | null>(null);
  const [selectedSequenceDetail, setSelectedSequenceDetail] = useState<{ seq: number | string, orders: CompletedOrder[], label: string } | null>(null);

  // Sorting & Filtering states for Revenue table
  const [revSortField, setRevSortField] = useState<'date' | 'total' | 'billNumber'>('date');
  const [revSortOrder, setRevSortOrder] = useState<'asc' | 'desc'>('desc');
  const [revTypeFilter, setRevTypeFilter] = useState<string>('all');
  const [revBranchFilter, setRevBranchFilter] = useState<string>('all');
  const [revMinAmount, setRevMinAmount] = useState<string>('');
  const [revMaxAmount, setRevMaxAmount] = useState<string>('');
  const [revSearchQuery, setRevSearchQuery] = useState<string>('');

  const handleToggleRevSort = (field: 'date' | 'total' | 'billNumber') => {
    if (revSortField === field) {
      setRevSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setRevSortField(field);
      setRevSortOrder('desc');
    }
  };

  // Sorting & Filtering for Stock Adjustments tab
  const [adjSortField, setAdjSortField] = useState<'date' | 'quantity_change'>('date');
  const [adjSortOrder, setAdjSortOrder] = useState<'asc' | 'desc'>('desc');
  const [adjBranchFilter, setAdjBranchFilter] = useState<string>('all');
  const [adjSearchQuery, setAdjSearchQuery] = useState<string>('');

  const handleToggleAdjSort = (field: 'date' | 'quantity_change') => {
    if (adjSortField === field) {
      setAdjSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setAdjSortField(field);
      setAdjSortOrder('desc');
    }
  };

  // Helper to extract unique branches from dataset dynamically
  const uniqueBranches = useMemo(() => {
    const branches = new Set<string>();
    orders.forEach(o => { if (o.branchName) branches.add(o.branchName); });
    deletedOrders.forEach(o => { if (o.branchName) branches.add(o.branchName); });
    adjustments.forEach(a => { if (a.branch_name) branches.add(a.branch_name); });
    return Array.from(branches);
  }, [orders, deletedOrders, adjustments]);

  // Computed Active or Voided orders filtered and sorted
  const filteredAndSortedOrders = useMemo(() => {
    const rawList = activeTab === 'active' ? orders : deletedOrders;
    
    // 1. Filter
    let result = rawList.filter(o => {
      // Search Query
      if (revSearchQuery.trim()) {
        const query = revSearchQuery.toLowerCase().trim();
        const matchesBillNum = o.billNumber.toString().includes(query);
        const matchesItem = o.items && o.items.some(item => item.name.toLowerCase().includes(query));
        const matchesCashier = o.cashierName && o.cashierName.toLowerCase().includes(query);
        const matchesPayment = o.paymentMethod && o.paymentMethod.toLowerCase().includes(query);
        
        if (!matchesBillNum && !matchesItem && !matchesCashier && !matchesPayment) {
          return false;
        }
      }

      // Order Mode / Type
      if (revTypeFilter !== 'all') {
        if (o.type.toLowerCase() !== revTypeFilter.toLowerCase()) {
          return false;
        }
      }

      // Branch / Store
      if (revBranchFilter !== 'all') {
        if (o.branchName.toLowerCase() !== revBranchFilter.toLowerCase()) {
          return false;
        }
      }

      // Amount Range
      const val = o.type === 'DELIVERY' && o.manualTotal != null ? o.manualTotal : o.total;
      if (revMinAmount.trim() !== '') {
        const minVal = parseFloat(revMinAmount);
        if (!isNaN(minVal) && val < minVal) return false;
      }
      if (revMaxAmount.trim() !== '') {
        const maxVal = parseFloat(revMaxAmount);
        if (!isNaN(maxVal) && val > maxVal) return false;
      }

      return true;
    });

    // 2. Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;
      if (revSortField === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (revSortField === 'total') {
        const totalA = a.type === 'DELIVERY' && a.manualTotal != null ? a.manualTotal : a.total;
        const totalB = b.type === 'DELIVERY' && b.manualTotal != null ? b.manualTotal : b.total;
        comparison = totalA - totalB;
      } else if (revSortField === 'billNumber') {
        comparison = a.billNumber - b.billNumber;
      }

      return revSortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [activeTab, orders, deletedOrders, revSearchQuery, revTypeFilter, revBranchFilter, revMinAmount, revMaxAmount, revSortField, revSortOrder]);

  // Computed Stock Adjustments filtered and sorted
  const filteredAndSortedAdjustments = useMemo(() => {
    // 1. Filter
    let result = adjustments.filter(adj => {
      if (adjSearchQuery.trim()) {
        const query = adjSearchQuery.toLowerCase().trim();
        const matchesItem = adj.inventory_id && adj.inventory_id.toLowerCase().includes(query);
        const matchesUser = adj.performed_by && adj.performed_by.toLowerCase().includes(query);
        const matchesReason = adj.reason && adj.reason.toLowerCase().includes(query);

        if (!matchesItem && !matchesUser && !matchesReason) {
          return false;
        }
      }

      if (adjBranchFilter !== 'all') {
        if (adj.branch_name.toLowerCase() !== adjBranchFilter.toLowerCase()) {
          return false;
        }
      }

      return true;
    });

    // 2. Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;
      if (adjSortField === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (adjSortField === 'quantity_change') {
        comparison = Math.abs(a.quantity_change) - Math.abs(b.quantity_change);
      }

      return adjSortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [adjustments, adjSearchQuery, adjBranchFilter, adjSortField, adjSortOrder]);

  const behaviorData = useMemo(() => {
    if (!orders.length || !cohortRawData.length) return null;

    // 1. Unique customers in the selected period
    const periodUids = new Set<string>();
    const periodOrdersByUid: Record<string, CompletedOrder[]> = {};
    
    orders.forEach(o => {
      const uid = o.customerPhone || 'GUEST';
      if (uid === 'GUEST') return; // Exclude non-registered for sequence precision if preferred, but following "unique customers"
      periodUids.add(uid);
      if (!periodOrdersByUid[uid]) periodOrdersByUid[uid] = [];
      periodOrdersByUid[uid].push(o);
    });

    const uniqueCustomerCount = periodUids.size;

    // 2. Map all historical orders to sequence numbers for every customer
    const historicalOrdersByUid: Record<string, CohortOrder[]> = {};
    cohortRawData.forEach(o => {
      const uid = normalizePhone(o.customer_phone);
      if (!uid || uid === 'GUEST') return;
      
      const bNum = Number(o.bill_number);
      if (isNaN(bNum) || bNum <= 0) return;

      if (!historicalOrdersByUid[uid]) historicalOrdersByUid[uid] = [];
      
      // De-duplicate by bill number in history - use numeric comparison for robustness
      if (!historicalOrdersByUid[uid].some(h => Number(h.bill_number) === bNum)) {
        historicalOrdersByUid[uid].push({
          ...o,
          customer_phone: uid,
          bill_number: bNum
        });
      }
    });

    // Sort historical orders to find sequences
    Object.keys(historicalOrdersByUid).forEach(uid => {
      historicalOrdersByUid[uid].sort((a, b) => {
        const dateA = new Date(a.order_date).getTime();
        const dateB = new Date(b.order_date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return a.bill_number - b.bill_number;
      });
    });

    // Analyze orders IN THE PERIOD
    const sequenceStats: Record<number | string, { count: number, totalRevenue: number }> = {};
    const compositionStats = {
      repeat: { count: 0, revenue: 0 },
      new: { count: 0, revenue: 0 },
      unregistered: { count: 0, revenue: 0 },
      delivery: { count: 0, revenue: 0 }
    };

    let matchedRevenue = 0;
    let matchedOrders = 0;
    const processedBillNumbers = new Set<string | number>();

    orders.forEach(o => {
      const rev = o.type === 'DELIVERY' && o.manualTotal != null ? o.manualTotal : o.total;
      const uid = normalizePhone(o.customerPhone);
      const bNum = Number(o.billNumber);
      
      // Prevent double counting the same bill in the period (if duplicates exist in orders array)
      if (processedBillNumbers.has(bNum)) return;
      processedBillNumbers.add(bNum);

      // 1. Composition Logic (aligned with Sequence where possible)
      if (o.type === 'DELIVERY') {
        compositionStats.delivery.count++;
        compositionStats.delivery.revenue += rev;
      } else if (!uid || uid === 'GUEST') {
        compositionStats.unregistered.count++;
        compositionStats.unregistered.revenue += rev;
      }

      // 2. Sequence Logic
      if (!uid || uid === 'GUEST') return;
      
      const userHistory = historicalOrdersByUid[uid];
      let seq: number | string = 'Other';
      if (userHistory) {
        const indexInHistory = userHistory.findIndex(h => Number(h.bill_number) === bNum);
        if (indexInHistory !== -1) {
          seq = indexInHistory + 1;
        }
      }

      if (!sequenceStats[seq]) sequenceStats[seq] = { count: 0, totalRevenue: 0 };
      sequenceStats[seq].count++;
      sequenceStats[seq].totalRevenue += rev;
      matchedRevenue += rev;
      matchedOrders++;

      // 3. Fill Composition from Sequence (if not already handled by Delivery/Unreg)
      if (o.type !== 'DELIVERY') {
        if (seq === 1) {
          compositionStats.new.count++;
          compositionStats.new.revenue += rev;
        } else {
          compositionStats.repeat.count++;
          compositionStats.repeat.revenue += rev;
        }
      }
    });

    const sortedSequences = Object.entries(sequenceStats)
      .filter(([seq]) => seq !== 'Other')
      .map(([seq, stats]) => ({
        seq: parseInt(seq),
        customers: stats.count,
        revenue: stats.totalRevenue,
        aov: stats.count > 0 ? stats.totalRevenue / stats.count : 0,
        orders: orders.filter(o => {
          const oUid = normalizePhone(o.customerPhone);
          if (!oUid || oUid === 'GUEST') return false;
          const hist = historicalOrdersByUid[oUid];
          if (!hist) return false;
          const idx = hist.findIndex(h => Number(h.bill_number) === Number(o.billNumber));
          return idx + 1 === parseInt(seq);
        })
      }))
      .sort((a, b) => a.seq - b.seq);
    
    // Add "Other" if there are unmatched profile orders
    if (sequenceStats['Other']) {
      sortedSequences.push({
        seq: 999, // Special key for display
        customers: sequenceStats['Other'].count,
        revenue: sequenceStats['Other'].totalRevenue,
        aov: sequenceStats['Other'].count > 0 ? sequenceStats['Other'].totalRevenue / sequenceStats['Other'].count : 0,
        orders: orders.filter(o => {
           const oUid = normalizePhone(o.customerPhone);
           if (!oUid || oUid === 'GUEST') return false;
           const hist = historicalOrdersByUid[oUid];
           if (!hist) return true; // It was 'Other' because it wasn't in history
           const idx = hist.findIndex(h => Number(h.bill_number) === Number(o.billNumber));
           return idx === -1;
        })
      });
    }

    return {
      uniqueCustomers: uniqueCustomerCount,
      totalOrders: matchedOrders,
      sequences: sortedSequences,
      avgOrdersPerUser: uniqueCustomerCount > 0 ? matchedOrders / uniqueCustomerCount : 0,
      avgSpendPerUser: uniqueCustomerCount > 0 ? matchedRevenue / uniqueCustomerCount : 0,
      composition: compositionStats
    };
  }, [orders, cohortRawData]);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<CompletedOrder | null>(null);

  const fetchStaticData = useCallback(async () => {
    const s = isAdmin ? await getStations() : [];
    
    // Fetch customers for both Admin and Manager
    // Managers only see their own branch customers
    const custFilter = isAdmin ? undefined : user.stationName;
    const [cust, stats, cohort] = await Promise.all([
      fetchCustomers(custFilter),
      fetchCustomerClassificationStats(),
      fetchCohortRawData()
    ]);
    
    if (isAdmin) {
      setAvailableStations(s);
    }
    setCustomers(cust);
    setCustomerOrderStats(stats);
    setCohortRawData(cohort);
  }, [isAdmin, user.stationName, user.role]);

  const fetchOrders = useCallback(async () => {
    // Expand start date by 32 days to ensure 30-day SMA is accurate for the start of the visible range
    const expandedStart = getHistoricalStartDate(startDate, 32);
    const [fetchedOrders, freshCohortData] = await Promise.all([
      getOrdersForDateRange(expandedStart, endDate),
      fetchCohortRawData()
    ]);

    setAllOrdersRaw(fetchedOrders);
    setCohortRawData(freshCohortData);
    
    // Filter by store - Managers only see their own
    const storeToFilter = isAdmin ? selectedStore : (user.stationName || 'All');
    
    // Process Chart Data (Historical + Visible range, Station Filtered)
    const stationFiltered = storeToFilter === 'All' 
      ? fetchedOrders 
      : fetchedOrders.filter(o => o.branchName === storeToFilter);
    setChartOrders(stationFiltered);

    // Process View Data (Visible range ONLY, Station Filtered)
    const inRange = stationFiltered.filter(o => {
      const d = getISTDateString(o.date);
      return d >= startDate && d <= endDate;
    });
      
    setOrders([...inRange].sort((a, b) => b.billNumber - a.billNumber));
  }, [startDate, endDate, selectedStore, isAdmin, user.stationName]);

  const fetchFinanceData = useCallback(async () => {
    // Relocated to ledger statements
  }, []);

  const fetchDeletedOrders = useCallback(async () => {
    const expandedStart = getHistoricalStartDate(startDate, 32);
    const fetchedOrders = await getDeletedOrdersForDateRange(expandedStart, endDate);
    
    // Filter by store - Managers only see their own
    const storeToFilter = isAdmin ? selectedStore : (user.stationName || 'All');
    const stationFiltered = storeToFilter === 'All' 
      ? fetchedOrders 
      : fetchedOrders.filter(o => o.branchName === storeToFilter);

    // Process View Data (Visible range ONLY)
    const inVisibleRange = stationFiltered.filter(o => {
      const d = getISTDateString(o.date);
      return d >= startDate && d <= endDate;
    });
    
    setDeletedOrders([...inVisibleRange].sort((a, b) => b.billNumber - a.billNumber));
  }, [startDate, endDate, selectedStore, isAdmin, user.stationName]);

  const fetchAdjustments = useCallback(async () => {
    const adjRes = await fetchManualAdjustments(startDate, endDate);
    if (!adjRes.error) {
      setAdjustments(adjRes.data || []);
    }
  }, [startDate, endDate]);

  const handleSequenceDetailClick = (seq: any) => {
    const label = seq.seq === 999 ? 'Others' : seq.seq === 1 ? 'New / 1st Order' : `${seq.seq}th Purchase`;
    setSelectedSequenceDetail({
      seq: seq.seq,
      orders: seq.orders || [],
      label
    });
  };

  const handleExportCustomers = () => {
    if (filteredCustomers.length === 0) return;

    const headers = ['Phone', 'Name', 'Email', 'Birthday', 'Total Spent (LTV)', 'Total Orders', 'MinCoins Balance', 'Joined Date', 'Last Visit', 'Note'];
    const csvContent = [
      headers.join(','),
      ...filteredCustomers.map(c => [
        c.phone,
        `"${(c.name || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        c.birthday || '',
        c.totalSpent || 0,
        c.totalOrders || 0,
        c.minCoins || 0,
        c.joinedDate ? new Date(c.joinedDate).toLocaleDateString() : '',
        c.lastVisit ? new Date(c.lastVisit).toLocaleDateString() : '',
        `"${(c.note || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `customers_export_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [isSyncingStats, setIsSyncingStats] = useState(false);
  const handleSyncAllStats = async () => {
    if (isSyncingStats || !filteredCustomers.length) return;
    setIsSyncingStats(true);
    try {
      // Sync in small batches to avoid timeouts or issues
      const batchSize = 5;
      for (let i = 0; i < filteredCustomers.length; i += batchSize) {
        const batch = filteredCustomers.slice(i, i + batchSize);
        await Promise.all(batch.map(c => syncCustomerStats(c.phone)));
      }
      alert(`Successfully synced stats for ${filteredCustomers.length} customers.`);
      // Refresh local data by reloading
      window.location.reload(); 
    } catch (e) {
      console.error("Sync Error:", e);
      alert("Error syncing stats. Check console.");
    } finally {
      setIsSyncingStats(false);
    }
  };

  const handleCustomerClick = async (customer: Customer) => {
    setActiveCustomer(customer);
    setIsEditingProfile(false);
    setEditedProfile({
      name: customer.name,
      email: customer.email,
      birthday: customer.birthday,
      note: customer.note
    });
    
    // Fetch parallelly
    const [history, usual] = await Promise.all([
      fetchCustomerHistory(customer.phone),
      fetchUsualOrder(customer.phone)
    ]);
    
    setSelectedCustomerHistory(history);
    setUsualOrder(usual);
  };

  const handleSaveProfile = async () => {
    if (!activeCustomer) return;
    setIsSavingProfile(true);
    try {
      await updateCustomer(activeCustomer.id, editedProfile);
      
      // Update local state
      const updatedCustomer = { ...activeCustomer, ...editedProfile };
      setActiveCustomer(updatedCustomer);
      setCustomers(prev => prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
      setIsEditingProfile(false);
    } catch (err) {
      console.error("Failed to update customer profile:", err);
      alert("Failed to save profile changes.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    fetchStaticData();
  }, [fetchStaticData]);

  useEffect(() => {
    fetchOrders();
    fetchDeletedOrders();
    fetchFinanceData();
    fetchAdjustments();
  }, [fetchOrders, fetchDeletedOrders, fetchFinanceData, fetchAdjustments]);

  const handlePresetChange = (preset: DatePreset) => {
    setActivePreset(preset);
    const today = getISTDate();
    let start = getISTDate();
    let end = getISTDate();

    switch (preset) {
      case 'today':
        start = today;
        end = today;
        break;
      case 'yesterday':
        const yesterday = getISTDate();
        yesterday.setDate(today.getDate() - 1);
        start = yesterday;
        end = yesterday;
        break;
      case 'last7':
        const weekAgo = getISTDate();
        weekAgo.setDate(today.getDate() - 6);
        start = weekAgo;
        end = today;
        break;
      case 'last14':
        const twoWeeksAgo = getISTDate();
        twoWeeksAgo.setDate(today.getDate() - 13);
        start = twoWeeksAgo;
        end = today;
        break;
      case 'last30':
        const monthAgo = getISTDate();
        monthAgo.setDate(today.getDate() - 29);
        start = monthAgo;
        end = today;
        break;
      case 'thisMonth':
        const tmStart = new Date(today.getFullYear(), today.getMonth(), 1);
        start = new Date(getDateString(tmStart));
        end = today;
        break;
      case 'lastMonth':
        const lmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        start = new Date(getDateString(lmStart));
        end = new Date(getDateString(lmEnd));
        end.setHours(23, 59, 59, 999);
        break;
      case 'thisWeek':
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
        const thisMon = new Date(today);
        thisMon.setDate(diff);
        start = thisMon;
        end = getISTDate();
        break;
      case 'lastWeek':
        const lDay = today.getDay();
        const lDiff = today.getDate() - lDay + (lDay === 0 ? -13 : -6);
        const lastMon = new Date(today);
        lastMon.setDate(lDiff);
        start = lastMon;
        const lastSun = new Date(start);
        lastSun.setDate(start.getDate() + 6);
        end = lastSun;
        break;
    }
    setStartDate(getDateString(start));
    setEndDate(getDateString(end));
  };

  useEffect(() => {
    if (searchMode === 'item' && searchTerm.length >= 2) {
      const timer = setTimeout(async () => {
        const results = await getMatchingMenuItems(searchTerm);
        setItemSuggestions(results);
        setShowSuggestions(results.length > 0);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setItemSuggestions([]);
      setShowSuggestions(false);
    }
  }, [searchTerm, searchMode]);

  const handleSearch = async (forcedBillNum?: number, forcedItemName?: string) => {
    setFoundOrder(null);
    setFoundOrdersList([]);
    setFoundOrderInitialBalance(undefined);
    setFoundOrderFinalBalance(undefined);
    setFoundOrderEarnedCoins(undefined);
    setFoundOrderNextCoupon(null);
    setSearchMessage('');
    setShowSuggestions(false);
    setIsSearching(true);
    
    try {
      const mode = forcedItemName ? 'item' : (forcedBillNum ? 'bill' : searchMode);
      const query = forcedBillNum?.toString() || forcedItemName || searchTerm;
      
      if (!query.trim()) {
        setIsSearching(false);
        return;
      }

      const sDate = useDateFilter ? startDate : undefined;
      const eDate = useDateFilter ? endDate : undefined;

      if (mode === 'bill') {
        const billNum = parseInt(query, 10);
        if (isNaN(billNum)) {
          setSearchMessage('Please enter a valid bill number.');
          setIsSearching(false);
          return;
        };

        const order = await getOrderByBillNumber(billNum);
        // Filter by date if needed
        if (order) {
          if (useDateFilter) {
            const oDate = getISTDateString(order.date);
            if (oDate >= (sDate || '') && oDate <= (eDate || '')) {
              await displayOrderDetails(order);
            } else {
              setSearchMessage(`Bill #${billNum} exists but is outside the selected date range (${sDate} to ${eDate}).`);
            }
          } else {
            await displayOrderDetails(order);
          }
        } else {
          setSearchMessage(`Bill #${billNum} was not found in the records.`);
        }
      } else {
        const results = await getOrdersByItemName(query, sDate, eDate);
        if (results.length > 0) {
          setFoundOrdersList(results);
          if (results.length === 1) {
            await displayOrderDetails(results[0]);
          }
        } else {
          setSearchMessage(`No orders found containing "${query}"${useDateFilter ? ` between ${sDate} and ${eDate}` : ''}.`);
        }
      }
    } catch (err) {
      console.error("Search failed:", err);
      setSearchMessage('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const displayOrderDetails = async (order: CompletedOrder) => {
    setFoundOrder(order);
    setSearchTerm('');
    
    // Calculate historical balance at the time of this order
    if (order.customerPhone) {
      const history = await fetchCustomerHistory(order.customerPhone);
      const sortedHistory = [...history].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const orderIndex = sortedHistory.findIndex(h => h.id === order.id);
      const totalAfter = orderIndex + 1;

      const orderDate = new Date(order.date).getTime();
      
      // Orders strictly before
      const pastOrders = history.filter(h => new Date(h.date).getTime() < orderDate);
      const spentBefore = pastOrders.reduce((acc, o) => acc + o.total, 0);
      const redeemedBefore = pastOrders.reduce((acc, o) => {
        return acc + o.items.reduce((sum, item) => sum + (item.paidWithCoins ? (item.coinsPrice || 0) * item.quantity : 0), 0);
      }, 0);
      
      // This order
      const currentRedeemed = order.items.reduce((acc, item) => acc + (item.paidWithCoins ? (item.coinsPrice || 0) * item.quantity : 0), 0);
      const currentTotal = order.total;

      const initialBal = calculateTotalMinCoins(spentBefore, redeemedBefore);
      const finalBal = calculateTotalMinCoins(spentBefore + currentTotal, redeemedBefore + currentRedeemed);
      const earned = finalBal - (initialBal - currentRedeemed);

      setFoundOrderInitialBalance(initialBal);
      setFoundOrderFinalBalance(finalBal);
      setFoundOrderEarnedCoins(earned);

      // Next order coupon historical state
      let nextCoupon = null;
      if (totalAfter === 1) nextCoupon = { code: `DISC15-${order.customerPhone.slice(-4)}`, discount: '15%', forOrder: 2 };
      else if (totalAfter === 2) nextCoupon = { code: `DISC10-${order.customerPhone.slice(-4)}`, discount: '10%', forOrder: 3 };
      else if (totalAfter === 3) nextCoupon = { code: `DISC5-${order.customerPhone.slice(-4)}`, discount: '5%', forOrder: 4 };
      
      setFoundOrderNextCoupon(nextCoupon);
    }
  };

  const confirmDelete = async (reason: string) => {
    if (orderToDelete) {
      await deleteOrderByBillNumber(orderToDelete.billNumber, reason);
      setIsDeleteModalOpen(false);
      fetchOrders();
      fetchDeletedOrders();
    }
  };

  const financialData = useMemo(() => {
    let revenue = 0;
    let deliveryRevenue = 0;
    let deliveryDiscount = 0;
    let deliveryMenuTotal = 0;
    let cogs = 0;
    const breakdown: Record<PaymentMethod, number> = { 'Cash': 0, 'UPI': 0, 'Card': 0 };

    orders.forEach(order => {
      const orderCogs = order.items.reduce((acc, item) => acc + (item.cost ?? 0) * item.quantity, 0);
      cogs += Math.round(orderCogs);

      if (order.type === 'DELIVERY') {
        const dRev = order.manualTotal != null ? Math.round(order.manualTotal) : Math.round(order.total);
        deliveryRevenue += dRev;
        deliveryDiscount += (order.manualDiscount || 0);
        deliveryMenuTotal += Math.round(order.total || 0);
        
        // Use manual total for breakdown for consistency if it's a delivery order
        if (order.paymentMethod && order.paymentMethod in breakdown) {
          breakdown[order.paymentMethod as PaymentMethod] += dRev;
        }
      } else {
        const roundedTotal = Math.round(order.total);
        revenue += roundedTotal;
        if (order.paymentMethod && order.paymentMethod in breakdown) {
          breakdown[order.paymentMethod as PaymentMethod] += roundedTotal;
        }
      }
    });

    const grossProfit = (revenue + deliveryRevenue) - cogs;
    return { 
      totalRevenue: revenue, 
      deliveryRevenue: deliveryRevenue,
      deliveryDiscount: deliveryDiscount,
      deliveryMenuTotal: deliveryMenuTotal,
      totalCogs: cogs,
      grossProfit,
      profitMargin: (revenue + deliveryRevenue) > 0 ? (grossProfit / (revenue + deliveryRevenue)) * 100 : 0,
      averageOrderValue: orders.length > 0 ? (revenue + deliveryRevenue) / orders.length : 0,
      paymentBreakdown: breakdown,
      totalOrders: orders.length,
    };
  }, [orders]);

  const comparisonData = useMemo(() => {
    if (!isAdmin) return [];
    const groups: Record<string, { revenue: number, orders: number, profit: number }> = {};
    const visibleRaw = allOrdersRaw.filter(o => {
      const d = getISTDateString(o.date);
      return d >= startDate && d <= endDate;
    });

    visibleRaw.forEach(order => {
      const actualRev = order.type === 'DELIVERY' && order.manualTotal != null ? order.manualTotal : order.total;
      const roundedTotal = Math.round(actualRev);
      const groupKey = compareBy === 'STORE' ? order.branchName : (order.cashierName || 'System/Unknown');
      
      if (!groups[groupKey]) groups[groupKey] = { revenue: 0, orders: 0, profit: 0 };
      groups[groupKey].revenue += roundedTotal;
      groups[groupKey].orders += 1;
      const orderCogs = order.items?.reduce((acc, item) => acc + (item.cost ?? 0) * item.quantity, 0) || 0;
      groups[groupKey].profit += (roundedTotal - Math.round(orderCogs));
    });
    return Object.entries(groups).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.revenue - a.revenue);
  }, [isAdmin, allOrdersRaw, startDate, endDate, compareBy]);

  const customerOverview = useMemo(() => {
    const totalCount = customers.length;
    const totalLTV = customers.reduce((acc, c) => acc + (c.totalSpent || 0), 0);
    const avgLTV = totalCount > 0 ? totalLTV / totalCount : 0;
    const repeatCount = customers.filter(c => (c.totalOrders || 0) > 1).length;
    const retentionRate = totalCount > 0 ? (repeatCount / totalCount) * 100 : 0;
    
    // New customers in range
    const newInRange = customers.filter(c => {
      if (!c.joinedDate) return false;
      const d = getISTDateString(c.joinedDate);
      return d >= startDate && d <= endDate;
    }).length;

    return {
      totalCount,
      totalLTV,
      avgLTV,
      retentionRate,
      newInRange
    };
  }, [customers, startDate, endDate]);

  const realBalance = useMemo(() => {
    if (!activeCustomer) return 0;
    const spent = selectedCustomerHistory.reduce((acc, order) => {
      return acc + order.items.reduce((sum, item) => sum + (item.paidWithCoins ? (item.coinsPrice || 0) * item.quantity : 0), 0);
    }, 0);
    return Math.round(calculateTotalMinCoins(activeCustomer.totalSpent || 0, spent));
  }, [selectedCustomerHistory, activeCustomer]);

  const insightData = useMemo(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const heatmap: Record<number, Record<number, { revenue: number, orders: number }>> = {};
    
    // Initialize heatmap
    for (let d = 0; d < 7; d++) {
      heatmap[d] = {};
      for (let h = 0; h < 24; h++) {
        heatmap[d][h] = { revenue: 0, orders: 0 };
      }
    }

    orders.forEach(o => {
      const day = getISTDay(o.date);
      const hour = getISTHour(o.date);
      if (heatmap[day] && heatmap[day][hour]) {
        heatmap[day][hour].revenue += o.total;
        heatmap[day][hour].orders += 1;
      }
    });

    // Summary Stats
    let bestDayIdx = 0;
    let maxDayRev = 0;
    let bestSlot = { day: 0, hour: 0, rev: 0 };
    let busiestDayIdx = 0;
    let maxOrdersCount = 0;

    for (let d = 0; d < 7; d++) {
      let dayTotal = 0;
      let dayOrders = 0;
      for (let h = 0; h < 24; h++) {
        dayTotal += heatmap[d][h].revenue;
        dayOrders += heatmap[d][h].orders;
        if (heatmap[d][h].revenue > bestSlot.rev) {
          bestSlot = { day: d, hour: h, rev: heatmap[d][h].revenue };
        }
      }
      if (dayTotal > maxDayRev) {
        maxDayRev = dayTotal;
        bestDayIdx = d;
      }
      if (dayOrders > maxOrdersCount) {
        maxOrdersCount = dayOrders;
        busiestDayIdx = d;
      }
    }

    return {
      heatmap,
      bestDay: days[bestDayIdx],
      bestSlot: `${days[bestSlot.day]} @ ${bestSlot.hour}:00`,
      busiestDay: days[busiestDayIdx],
      days
    };
  }, [orders]);

  const filteredCustomers = useMemo(() => {
    let filtered = customers.filter(c => c.phone.includes(customerSearchTerm));
    
    // Classification Filter
    if (customerClassFilter !== 'ALL') {
      filtered = filtered.filter(c => {
        const phone = normalizePhone(c.phone);
        const stats = customerOrderStats[phone];
        if (!stats || stats.total === 0) return customerClassFilter === 'UNCLASSIFIED';
        
        const dineInRate = stats.DINE_IN / stats.total;
        const takeawayRate = stats.TAKEAWAY / stats.total;
        const deliveryRate = stats.DELIVERY / stats.total;
        
        // Use a 70% threshold for classification. 
        // For customers with only 1 order, rate will be 100%, so they will be correctly classified.
        if (dineInRate > 0.7) return customerClassFilter === 'DINE_IN';
        if (takeawayRate > 0.7) return customerClassFilter === 'TAKEAWAY';
        if (deliveryRate > 0.7) return customerClassFilter === 'DELIVERY';
        return customerClassFilter === 'UNCLASSIFIED';
      });
    }

    // Range Filters
    if (minLtv) filtered = filtered.filter(c => (c.totalSpent ?? 0) >= Number(minLtv));
    if (maxLtv) filtered = filtered.filter(c => (c.totalSpent ?? 0) <= Number(maxLtv));
    if (minOrders) filtered = filtered.filter(c => (c.totalOrders ?? 0) >= Number(minOrders));
    if (maxOrders) filtered = filtered.filter(c => (c.totalOrders ?? 0) <= Number(maxOrders));

    // Ordered Between Dates Filter
    if (customerActivityStart || customerActivityEnd) {
      const activePhones = new Set<string>();
      allOrdersRaw.forEach(o => {
        if (!o.customerPhone) return;
        const d = getISTDateString(o.date);
        const startMatch = customerActivityStart ? d >= customerActivityStart : true;
        const endMatch = customerActivityEnd ? d <= customerActivityEnd : true;
        if (startMatch && endMatch) {
          activePhones.add(o.customerPhone);
        }
      });
      filtered = filtered.filter(c => activePhones.has(c.phone));
    }

    // Sorting
    return filtered.sort((a, b) => {
      let valA: any = a[customerSortField];
      let valB: any = b[customerSortField];

      if (customerSortField === 'joinedDate' || customerSortField === 'lastVisit') {
        valA = new Date(valA || 0).getTime();
        valB = new Date(valB || 0).getTime();
      } else {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
      }

      return customerSortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [customers, customerSearchTerm, customerSortField, customerSortOrder, minLtv, maxLtv, minOrders, maxOrders, customerActivityStart, customerActivityEnd, allOrdersRaw, customerClassFilter, customerOrderStats]);

  const SummaryCard = ({ title, value, sub, color, textWhite }: any) => (
    <div className={`${color} p-6 lg:p-8 rounded-[2rem] lg:rounded-[3rem] shadow-sm relative overflow-hidden group border border-black/5`}>
      <p className={`text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${textWhite ? 'text-white/60' : 'text-brand-brown/40'}`}>{title}</p>
      <h3 className={`text-3xl lg:text-4xl font-black tracking-tighter ${textWhite ? 'text-white' : 'text-brand-brown'}`}>₹{(value ?? 0).toLocaleString()}</h3>
      <p className={`text-[8px] lg:text-[9px] font-bold uppercase tracking-widest mt-2 ${textWhite ? 'text-white/40' : 'text-brand-brown/60'}`}>{sub}</p>
    </div>
  );

  return (
    <div className="p-4 lg:p-8 h-full bg-brand-cream overflow-y-auto no-scrollbar pb-24 lg:pb-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
          <div>
            <h2 className="text-3xl lg:text-5xl font-black text-brand-brown tracking-tighter italic uppercase leading-none">BUSINESS <span className="text-brand-red">PEAK</span></h2>
            <p className="text-[8px] lg:text-[10px] font-bold text-brand-brown/40 uppercase tracking-[0.4em] mt-2">Intelligence Dashboard</p>
          </div>
          
          <div className="flex flex-col gap-4 w-full lg:w-auto">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1 bg-white/50 p-1 rounded-xl self-start border border-brand-stone">
                  <button 
                    onClick={() => setSearchMode('bill')}
                    className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${searchMode === 'bill' ? 'bg-brand-brown text-brand-yellow shadow-sm' : 'text-brand-brown/40 hover:bg-brand-brown/10'}`}
                  >
                    By Bill #
                  </button>
                  <button 
                    onClick={() => setSearchMode('item')}
                    className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${searchMode === 'item' ? 'bg-brand-brown text-brand-yellow shadow-sm' : 'text-brand-brown/40 hover:bg-brand-brown/10'}`}
                  >
                    By Item
                  </button>
                </div>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-8 h-4 rounded-full relative transition-colors ${useDateFilter ? 'bg-brand-red' : 'bg-brand-stone'}`}>
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={useDateFilter} 
                      onChange={() => setUseDateFilter(!useDateFilter)} 
                    />
                    <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${useDateFilter ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                  <span className="text-[8px] font-black text-brand-brown uppercase tracking-widest">Filter by Dashboard Range</span>
                </label>
              </div>

              <div className="relative">
                <div className="flex items-center gap-2 bg-white shadow-xl p-2 rounded-2xl border-4 border-brand-brown">
                  <input 
                      type={searchMode === 'bill' ? "number" : "text"} 
                      placeholder={searchMode === 'bill' ? "SEARCH BILL #" : "SEARCH ITEM NAME"} 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      onFocus={() => searchMode === 'item' && itemSuggestions.length > 0 && setShowSuggestions(true)}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      className="bg-transparent text-[10px] font-black uppercase px-4 py-2 outline-none w-48"
                  />
                  <button 
                    onClick={() => handleSearch()} 
                    disabled={isSearching}
                    className="bg-brand-brown text-brand-yellow px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {isSearching ? '...' : 'Find'}
                  </button>
                </div>

                {showSuggestions && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-brand-brown rounded-xl shadow-2xl z-[110] overflow-hidden max-h-60 overflow-y-auto no-scrollbar">
                    {itemSuggestions.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setSearchTerm(item);
                          handleSearch(undefined, item);
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-5 py-3 text-[10px] font-black text-brand-brown uppercase tracking-wider hover:bg-brand-brown hover:text-brand-yellow transition-colors border-b border-brand-stone last:border-0"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 bg-white/50 p-2 rounded-2xl lg:rounded-3xl border border-brand-stone">
              {(['today', 'yesterday', 'thisWeek', 'lastWeek', 'last7', 'last14', 'last30', 'thisMonth', 'lastMonth', 'custom'] as DatePreset[]).map(p => (
                <button key={p} onClick={() => handlePresetChange(p)} className={`px-3 lg:px-4 py-2 text-[8px] lg:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activePreset === p ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/10'}`}>{p}</button>
              ))}
              {activePreset === 'custom' && (
                <div className="flex items-center gap-2 pl-2 lg:pl-4 border-l border-brand-stone ml-2">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-[8px] lg:text-[10px] font-black uppercase p-1 outline-none" />
                  <span className="text-brand-brown/20">-</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-[8px] lg:text-[10px] font-black uppercase p-1 outline-none" />
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2 bg-white/50 p-2 rounded-2xl lg:rounded-3xl border border-brand-stone w-full lg:w-auto lg:self-end">
                <span className="text-[8px] lg:text-[10px] font-black uppercase text-brand-brown/40 tracking-widest pl-2 lg:pl-4">Filter:</span>
                <select value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)} className="flex-1 bg-transparent text-[8px] lg:text-[10px] font-black uppercase p-2 outline-none border-0 text-brand-brown font-bold">
                  <option value="All">All Stores</option>
                  {availableStations.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </header>

        {foundOrdersList.length > 1 && !foundOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-10 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-brand-brown/80 backdrop-blur-md" onClick={() => setFoundOrdersList([])}></div>
            <div className="bg-white rounded-[2rem] lg:rounded-[3rem] p-8 border-4 border-brand-brown shadow-2xl relative z-10 w-full max-w-4xl max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-black text-brand-brown uppercase tracking-tighter">Search Results</h3>
                  <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest">Found {foundOrdersList.length} orders containing "{searchTerm}"</p>
                </div>
                <button onClick={() => setFoundOrdersList([])} className="p-2 hover:bg-brand-stone/20 rounded-full transition-colors">
                  <X className="w-6 h-6 text-brand-brown" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                {foundOrdersList.map((order) => (
                  <button 
                    key={order.id} 
                    onClick={() => displayOrderDetails(order)}
                    className="flex items-center justify-between p-5 bg-brand-brown/5 rounded-2xl border border-brand-brown/10 hover:border-brand-red hover:bg-white transition-all group text-left"
                  >
                    <div>
                      <p className="text-[10px] font-black text-brand-red uppercase tracking-widest leading-none mb-1">Bill #{order.billNumber}</p>
                      <p className="text-sm font-black text-brand-brown uppercase">{getISTDateString(order.date)}</p>
                      <p className="text-[10px] font-bold text-brand-brown/40 uppercase">{order.branchName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-brand-brown">₹{order.total.toLocaleString()}</p>
                      <p className="text-[8px] font-black text-brand-brown/40 uppercase tracking-widest">{order.items.length} Items</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {foundOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-10 animate-in fade-in duration-300">
             <div className="absolute inset-0 bg-brand-brown/80 backdrop-blur-md" onClick={() => setFoundOrder(null)}></div>
             <div className="bg-white rounded-[2rem] lg:rounded-[3.5rem] p-6 lg:p-12 border-4 lg:border-[12px] border-brand-red shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] flex flex-col lg:flex-row gap-6 lg:gap-12 relative z-10 w-full max-w-5xl max-h-[90vh] overflow-y-auto no-scrollbar">
                <button 
                  onClick={() => setFoundOrder(null)}
                  className="absolute top-4 right-4 lg:top-8 lg:right-8 p-3 bg-brand-brown/5 rounded-full hover:bg-brand-red hover:text-white transition-all text-brand-brown group"
                >
                  <X className="w-6 h-6 lg:w-8 h-8 group-hover:rotate-90 transition-transform duration-300" />
                </button>

                <div className="flex-1">
                   <div className="flex items-center gap-4 mb-8">
                      <span className="bg-brand-red text-white px-6 py-2 rounded-full font-black text-[10px] tracking-widest uppercase italic">Invoice Details</span>
                   </div>
                   <h3 className="text-4xl lg:text-6xl font-black text-brand-brown tracking-tighter uppercase mb-4 leading-none">BILL <span className="text-brand-red">#{foundOrder.billNumber}</span></h3>
                   
                   <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
                      <div className="bg-brand-brown/5 p-5 rounded-2xl border border-brand-brown/5">
                         <p className="text-[9px] font-black text-brand-brown/40 uppercase tracking-widest mb-1">Status</p>
                         <p className="font-black text-brand-brown uppercase italic text-sm">{foundOrder.deletionInfo ? 'Voided / Deleted' : foundOrder.status}</p>
                      </div>
                      <div className="bg-brand-brown/5 p-5 rounded-2xl border border-brand-brown/5">
                         <p className="text-[9px] font-black text-brand-brown/40 uppercase tracking-widest mb-1">Type</p>
                         <p className="font-black text-brand-red uppercase italic text-sm">{foundOrder.type.replace('_', ' ')}</p>
                      </div>
                      <div className="bg-brand-brown/5 p-5 rounded-2xl border border-brand-brown/5">
                         <p className="text-[9px] font-black text-brand-brown/40 uppercase tracking-widest mb-1">Method</p>
                         <p className="font-black text-brand-brown uppercase italic text-sm">{foundOrder.paymentMethod || 'N/A'}</p>
                      </div>
                      <div className="bg-brand-brown/5 p-5 rounded-2xl border border-brand-brown/5">
                         <p className="text-[9px] font-black text-brand-brown/40 uppercase tracking-widest mb-1">Amount</p>
                         <p className="font-black text-brand-brown italic text-xl">
                           ₹{(foundOrder.type === 'DELIVERY' && foundOrder.manualTotal != null ? foundOrder.manualTotal : (foundOrder.total ?? 0)).toLocaleString()}
                         </p>
                      </div>
                   </div>

                   <div className="mt-10 space-y-3">
                      <p className="text-[10px] font-black uppercase text-brand-brown/30 tracking-widest px-1">Order Breakdown</p>
                      <div className="max-h-[250px] overflow-y-auto no-scrollbar pr-2">
                        {foundOrder.items.length > 0 ? (
                          foundOrder.items.map((it, idx) => {
                            const isGift = it.name.includes('(Gift)') || it.id === 'gift-campa-cola';
                            return (
                              <div key={idx} className={`flex justify-between items-center border-b border-brand-stone/50 py-3 group/item ${isGift ? 'bg-brand-red/5 p-2 rounded-lg my-1 border-none' : ''}`}>
                                  <div>
                                    <span className={`font-black uppercase text-xs lg:text-sm block ${isGift ? 'text-brand-red' : 'text-brand-brown'}`}>
                                      x{it.quantity} {it.name}
                                      {isGift && <span className="ml-2 bg-brand-red text-white text-[7px] px-1.5 py-0.5 rounded-full ring-2 ring-brand-red/10 animate-pulse uppercase">FREE GIFT</span>}
                                    </span>
                                    {it.paidWithCoins && <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest leading-none">Redeemed with Coins</span>}
                                  </div>
                                  <span className={`font-black text-xs lg:text-sm ${isGift ? 'text-brand-red' : 'text-brand-brown'}`}>
                                    {isGift ? '₹0' : (it.paidWithCoins ? '0 (Coins)' : `₹${(it.price * it.quantity).toLocaleString()}`)}
                                  </span>
                              </div>
                            );
                          })
                        ) : (
                          <div className="py-10 text-center bg-brand-brown/5 rounded-2xl border-2 border-dashed border-brand-stone/30">
                            <p className="text-xs font-black text-brand-brown/40 uppercase tracking-widest">Item details missing from record</p>
                            <p className="text-[10px] font-bold text-brand-brown/20 uppercase mt-2">
                              Total amount ₹{(foundOrder.type === 'DELIVERY' && foundOrder.manualTotal != null ? foundOrder.manualTotal : (foundOrder.total ?? 0)).toLocaleString()} confirmed
                            </p>
                          </div>
                        )}
                      </div>
                   </div>

                   {foundOrder.deletionInfo && (
                      <div className="mt-10 p-6 bg-red-50 rounded-3xl border-2 border-brand-red/10">
                         <p className="text-[10px] font-black text-brand-red uppercase mb-2 tracking-widest">Deletion Record</p>
                         <p className="text-xs font-bold text-brand-brown italic">" {foundOrder.deletionInfo.reason} "</p>
                         <div className="flex justify-between items-center mt-3 pt-3 border-t border-brand-red/10">
                           <p className="text-[9px] font-black text-brand-brown/40 uppercase">Timestamp: {foundOrder.deletionInfo.date ? getISTFullDateTime(foundOrder.deletionInfo.date) : 'N/A'}</p>
                         </div>
                      </div>
                   )}
                   
                   {!foundOrder.deletionInfo && (
                      <button 
                        onClick={() => { setOrderToDelete(foundOrder); setIsDeleteModalOpen(true); }} 
                        className="mt-10 w-full py-5 bg-red-50 text-brand-red rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-red hover:text-white transition-all shadow-sm active:scale-[0.98]"
                      >
                        Void Transaction
                      </button>
                   )}
                </div>

                <div className="w-full lg:w-96 bg-brand-cream/50 rounded-[2rem] p-6 border-2 border-brand-stone shadow-inner">
                   <div className="mb-4 text-center">
                     <p className="text-[10px] font-black text-brand-brown/30 uppercase tracking-widest">Digital Copy</p>
                   </div>
                    <PrintReceipt 
                     orderItems={foundOrder.items} 
                     billNumber={foundOrder.billNumber} 
                     branchName={foundOrder.branchName} 
                     date={foundOrder.date} 
                     paymentMethod={foundOrder.paymentMethod}
                     customerPhone={foundOrder.customerPhone}
                     customerInitialBalance={foundOrderInitialBalance}
                     customerFinalBalance={foundOrderFinalBalance}
                     earnedCoinsValue={foundOrderEarnedCoins}
                     nextOrderCoupon={foundOrderNextCoupon}
                     orderType={foundOrder.type}
                     totalValue={foundOrder.type === 'DELIVERY' && foundOrder.manualTotal != null ? foundOrder.manualTotal : foundOrder.total}
                    />

                </div>
             </div>
          </div>
        )}

        {searchMessage && (
           <div className="mb-10 p-6 bg-brand-red/10 rounded-3xl text-center border-2 border-brand-red/20 text-brand-red font-black text-xs uppercase tracking-widest">
              {searchMessage}
           </div>
        )}
        
        <div className="flex flex-wrap rounded-2xl lg:rounded-[2rem] overflow-hidden border-2 lg:border-4 border-brand-brown shadow-xl mb-10">
          <button onClick={() => setReportView('revenue')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'revenue' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Revenue</button>
          {user.role !== 'CASHIER' && (
            <button onClick={() => setReportView('trends')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'trends' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Trends</button>
          )}
          <button onClick={() => setReportView('itemSales')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'itemSales' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Items</button>
          {(isAdmin || user.role === 'STORE_MANAGER') && (
            <button onClick={() => setReportView('customers')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'customers' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Customers</button>
          )}
          {isAdmin && (
            <>
              <button onClick={() => setReportView('comparison')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'comparison' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Compare</button>
              <button onClick={() => setReportView('profitability')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'profitability' ? 'bg-brand-red text-white' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>P&L</button>
            </>
          )}
        </div>

        {reportView === 'trends' && (
          <div className="space-y-12 animate-in fade-in duration-700">
            {/* Master Toggle */}
            <div className="flex justify-center mb-8">
              <div className="bg-brand-brown/5 p-2 rounded-[2rem] border-2 border-brand-brown/10 flex items-center gap-2 shadow-inner">
                <button 
                  onClick={() => setAnalysisBasis('REVENUE')}
                  className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-3 ${analysisBasis === 'REVENUE' ? 'bg-brand-brown text-brand-yellow shadow-xl' : 'text-brand-brown/40 hover:bg-brand-brown/10'}`}
                >
                  <DollarSign className="w-4 h-4" />
                  Revenue Analysis
                </button>
                <button 
                  onClick={() => setAnalysisBasis('ORDERS')}
                  className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-3 ${analysisBasis === 'ORDERS' ? 'bg-brand-brown text-brand-yellow shadow-xl' : 'text-brand-brown/40 hover:bg-brand-brown/10'}`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  Order Volume
                </button>
              </div>
            </div>

            {/* 1. Main Line Chart */}
            <PerformanceChart orders={chartOrders} customers={customers} startDate={startDate} endDate={endDate} analysisBasis={analysisBasis} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <RevenueBreakdownChart 
                orders={orders} 
                customers={customers} 
                analysisBasis={analysisBasis} 
                compositionData={behaviorData?.composition}
              />
              <OrderModeChart orders={orders} analysisBasis={analysisBasis} />
            </div>

            {/* 2. Insight Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-brand-brown p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-3 text-brand-yellow">Strongest Day</p>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl font-black italic uppercase italic tracking-tighter">{insightData.bestDay}</h3>
                  <Star className="w-10 h-10 text-brand-yellow/20" />
                </div>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-brand-stone group">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-brown/30 mb-3">Peak Performance Slot</p>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl font-black text-brand-brown tracking-tighter">{insightData.bestSlot}</h3>
                </div>
              </div>
              <div className="bg-brand-red p-8 rounded-[2.5rem] shadow-xl text-white group">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-3 text-brand-yellow">Highest Footfall Day</p>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl font-black uppercase italic tracking-tighter">{insightData.busiestDay}</h3>
                </div>
              </div>
            </div>

            {/* 3. Customer Behavior Analysis */}
            {behaviorData && (
              <div className="bg-brand-brown p-8 lg:p-12 rounded-[3.5rem] shadow-2xl text-white relative overflow-hidden">
                {/* Background Accent */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-brand-yellow/5 rounded-full blur-3xl -mr-48 -mt-48" />
                
                <div className="relative z-10">
                  <div className="mb-12">
                    <h3 className="text-3xl font-black italic uppercase tracking-tighter text-brand-yellow">Customer <span className="text-white">Behavior</span> Analysis</h3>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mt-2">Purchase frequency & sequence performance for selected period</p>
                  </div>

                  {/* Top Level Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
                    <div className="bg-white/5 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10">
                      <div className="flex items-center gap-3 mb-4">
                        <Users className="w-5 h-5 text-brand-yellow" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Unique Customers</span>
                      </div>
                      <p className="text-4xl font-black tracking-tighter text-white">{behaviorData.uniqueCustomers.toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-white/30 uppercase mt-2">Active in this period</p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/20">
                      <div className="flex items-center gap-3 mb-4">
                        <ShoppingBag className="w-5 h-5 text-brand-red" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Total Orders</span>
                      </div>
                      <p className="text-4xl font-black tracking-tighter text-white">{behaviorData.totalOrders.toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-white/30 uppercase mt-2">Placed by profile owners</p>
                    </div>

                    <div className="bg-white/5 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10">
                      <div className="flex items-center gap-3 mb-4">
                        <Receipt className="w-5 h-5 text-brand-yellow" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Frequency Index</span>
                      </div>
                      <p className="text-4xl font-black tracking-tighter text-white">{behaviorData.avgOrdersPerUser.toFixed(2)}</p>
                      <p className="text-[10px] font-bold text-white/30 uppercase mt-2">Orders per unique user</p>
                    </div>

                    <div className="bg-white/5 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10">
                      <div className="flex items-center gap-3 mb-4">
                        <DollarSign className="w-5 h-5 text-emerald-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Period Yield</span>
                      </div>
                      <p className="text-4xl font-black tracking-tighter text-white">₹{Math.round(behaviorData.avgSpendPerUser).toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-white/30 uppercase mt-2">Spend per unique user</p>
                    </div>
                  </div>

                  {/* Purchase Sequence Breakdown - Chart Form */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-8">
                      <h4 className="text-sm font-black uppercase tracking-widest text-white/60">Order Sequence Breakdown</h4>
                      <div className="h-[1px] flex-1 bg-white/10 mx-6" />
                    </div>

                    <div className="bg-white/5 rounded-[3rem] p-8 border border-white/10 h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={behaviorData.sequences.slice(0, 12)} 
                          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                          style={{ cursor: 'pointer' }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis 
                            dataKey="seq" 
                            stroke="rgba(255,255,255,0.4)" 
                            fontSize={10} 
                            tickFormatter={(v) => v === 999 ? 'Others' : v === 1 ? '1st' : v === 2 ? '2nd' : v === 3 ? '3rd' : `${v}th`}
                            axisLine={false}
                            tickLine={false}
                            dy={10}
                          />
                          <YAxis hide />
                          <RechartsTooltip 
                             contentStyle={{ backgroundColor: '#2D1D13', border: 'none', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', color: '#fff' }}
                             itemStyle={{ color: '#FACC15', fontWeight: '900', fontSize: '12px' }}
                             cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                             formatter={(value: any, name: any, props: any) => {
                               const seq = props.payload.seq;
                               const label = seq === 999 ? 'Unmatched Sequence' : seq === 1 ? 'New / 1st Order' : `${seq}th Purchase`;
                               return name === 'customers' ? [`${value} Orders`, label] : [`₹${Math.round(value)}`, 'Avg Ticket'];
                             }}
                          />
                          <Bar dataKey="customers" radius={[12, 12, 0, 0]} maxBarSize={60}>
                            {behaviorData.sequences.slice(0, 12).map((s, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={s.seq === 999 ? '#6B7280' : index === 0 ? '#EF4444' : index === 1 ? '#F59E0B' : index === 2 ? '#10B981' : index === 3 ? '#3B82F6' : index === 4 ? '#8B5CF6' : '#EC4899'} 
                                fillOpacity={0.9}
                                onClick={() => handleSequenceDetailClick(s)}
                              />
                            ))}
                            <LabelList 
                              dataKey="customers" 
                              position="top" 
                              style={{ fill: 'white', fontSize: '12px', fontWeight: '900', opacity: 0.9 }} 
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                      {behaviorData.sequences.slice(0, 6).map((seq, idx) => (
                        <div key={idx} className="bg-white/5 p-5 rounded-[2rem] border border-white/5 flex flex-col justify-between">
                           <div>
                             <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">{seq.seq === 999 ? 'Other' : seq.seq === 1 ? 'New' : `${seq.seq}th`} AOV</p>
                             <p className="text-xl font-black text-white tracking-tighter">₹{Math.round(seq.aov).toLocaleString()}</p>
                           </div>
                           <button 
                             onClick={() => handleSequenceDetailClick(seq)}
                             className="mt-4 w-full py-2 bg-white/5 hover:bg-brand-yellow hover:text-brand-brown rounded-xl text-[8px] font-black uppercase tracking-widest transition-all border border-white/5"
                           >
                             View Bills
                           </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Improved Rainbow Heatmap */}
            <div className="bg-white rounded-[3rem] p-8 shadow-2xl border border-brand-stone">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-6">
                <div>
                  <h3 className="text-2xl font-black text-brand-brown uppercase italic">Strategic <span className="text-brand-red">Heatmap</span></h3>
                  <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
                    {analysisBasis === 'REVENUE' ? 'Revenue distribution' : 'Order frequency'} by day and hour
                  </p>
                </div>

                {/* Color Legend Bar */}
                <div className="flex flex-col gap-2 bg-brand-brown/5 p-4 rounded-3xl border border-brand-stone/30">
                  <div className="flex items-center justify-between text-[8px] font-black text-brand-brown/60 uppercase tracking-widest mb-1 px-1">
                    <span>MIN (LOW)</span>
                    <span>MAX (HIGH {analysisBasis})</span>
                  </div>
                  <div className="h-3 w-48 lg:w-64 rounded-full" style={{ background: heatmapGradient }} />
                  <div className="flex justify-between px-1">
                     <span className="text-[8px] font-bold text-brand-brown/30">{analysisBasis === 'REVENUE' ? '₹0' : '0'}</span>
                     <span className="text-[8px] font-bold text-brand-brown/30">
                       {analysisBasis === 'REVENUE' 
                         ? `₹${Math.round(Math.max(...Object.values(insightData.heatmap).flatMap(d => Object.values(d).map(v => v.revenue)))).toLocaleString()}`
                         : `${Math.round(Math.max(...Object.values(insightData.heatmap).flatMap(d => Object.values(d).map(v => v.orders)))).toLocaleString()}`}
                     </span>
                  </div>
                </div>

                {selectedDayInsights !== null && (
                  <button 
                    onClick={() => setSelectedDayInsights(null)}
                    className="flex items-center gap-2 bg-brand-brown text-brand-yellow px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-brand-red hover:text-white transition-all active:scale-95"
                  >
                    Back to Overview
                  </button>
                )}
              </div>

              {selectedDayInsights === null ? (
                <div className="overflow-x-auto no-scrollbar pb-4">
                  <div className="min-w-[800px]">
                    <div className="flex mb-4">
                      <div className="w-24 shrink-0" />
                      <div className="flex-1 flex">
                        {[5, 6, 7, 8, 9].map(h => (
                          <div key={h} className="flex-1 text-center text-[9px] font-black uppercase text-brand-brown/30">{h} PM</div>
                        ))}
                        <div className="flex-1 text-center text-[9px] font-black uppercase text-brand-brown/30">Other</div>
                      </div>
                    </div>
                    {insightData.days.map((dayName, dIdx) => {
                      const daySlotData = insightData.heatmap[dIdx];
                      const slots = [{ h: 17 }, { h: 18 }, { h: 19 }, { h: 20 }, { h: 21 }];
                      const otherValue = Object.entries(daySlotData)
                        .filter(([h]) => !slots.map(s => s.h).includes(parseInt(h)))
                        .reduce((sum, [_, data]) => sum + (analysisBasis === 'REVENUE' ? data.revenue : data.orders), 0);

                      const maxValue = Math.max(...Object.values(insightData.heatmap).flatMap(d => Object.values(d).map(v => analysisBasis === 'REVENUE' ? v.revenue : v.orders)), 1);

                      return (
                        <div 
                          key={dayName} 
                          className="flex items-center gap-2 mb-3 group/row cursor-pointer"
                          onClick={() => setSelectedDayInsights(dIdx)}
                        >
                          <div className="w-24 shrink-0 text-[11px] font-black uppercase text-brand-brown group-hover/row:text-brand-red transition-colors">{dayName}</div>
                          <div className="flex-1 flex gap-2 h-14">
                            {slots.map(s => {
                              const val = analysisBasis === 'REVENUE' ? daySlotData[s.h].revenue : daySlotData[s.h].orders;
                              const intensity = val / maxValue;
                              const bg = getHeatmapColor(intensity);
                              return (
                                <div 
                                  key={s.h}
                                  className="flex-1 rounded-2xl relative group/slot transition-all hover:scale-[1.03] border border-black/5 shadow-sm"
                                  style={{ 
                                    backgroundColor: bg
                                  }}
                                >
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity z-10 pointer-events-none">
                                    <span className="text-[10px] font-black text-white px-3 py-1.5 bg-brand-brown rounded-xl shadow-2xl ring-2 ring-white/10">
                                      {analysisBasis === 'REVENUE' ? `₹${Math.round(val).toLocaleString()}` : val}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                            <div 
                              className="flex-1 rounded-2xl relative group/slot transition-all hover:scale-[1.03] border border-black/5 shadow-sm"
                              style={{ 
                                backgroundColor: getHeatmapColor(otherValue / maxValue)
                              }}
                            >
                               <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity z-10 pointer-events-none">
                                    <span className="text-[10px] font-black text-white px-3 py-1.5 bg-brand-brown rounded-xl shadow-2xl ring-2 ring-white/10">
                                      {analysisBasis === 'REVENUE' ? `₹${Math.round(otherValue).toLocaleString()}` : otherValue}
                                    </span>
                                </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                  <h4 className="text-sm font-black uppercase tracking-widest text-brand-brown mb-8 flex items-center gap-3">
                    <div className="p-2 bg-brand-red rounded-xl shadow-lg ring-4 ring-brand-red/10">
                      <Calendar className="w-5 h-5 text-white" />
                    </div>
                    {insightData.days[selectedDayInsights]} Hourly Breakdown
                  </h4>
                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-4">
                    {Object.entries(insightData.heatmap[selectedDayInsights]).map(([h, data]) => {
                      const hour = parseInt(h);
                      const displayHour = hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
                      const maxValue = Math.max(...Object.values(insightData.heatmap).flatMap(d => Object.values(d).map(v => analysisBasis === 'REVENUE' ? v.revenue : v.orders)), 1);
                      const val = analysisBasis === 'REVENUE' ? data.revenue : data.orders;
                      const intensity = val / maxValue;
                      const bg = getHeatmapColor(intensity);

                      return (
                        <div key={h} className="group/hour relative">
                          <div 
                            className="aspect-square rounded-[1.5rem] flex flex-col items-center justify-center border transition-all hover:scale-105 hover:shadow-xl group-hover/hour:ring-4 group-hover/hour:ring-brand-brown/5"
                            style={{ 
                              backgroundColor: bg,
                              borderColor: val > 0 ? 'transparent' : 'rgba(0,0,0,0.05)'
                            }}
                          >
                            <span className={`text-[9px] font-black uppercase text-center ${intensity > 0.4 ? 'text-white' : 'text-brand-brown/40'}`}>{displayHour}</span>
                            {val > 0 && (
                              <span className={`text-[11px] font-black mt-1 ${intensity > 0.4 ? 'text-white' : 'text-brand-brown'}`}>
                                {analysisBasis === 'REVENUE' ? `₹${Math.round(val / 1000)}k` : val}
                              </span>
                            )}
                          </div>
                          {val > 0 && (
                             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover/hour:opacity-100 transition-opacity pointer-events-none z-10">
                               <div className="bg-brand-brown text-white text-[10px] font-black px-4 py-2 rounded-xl shadow-2xl whitespace-nowrap ring-2 ring-white/10">
                                  {analysisBasis === 'REVENUE' 
                                    ? `${data.orders} Orders • ₹${Math.round(data.revenue).toLocaleString()}`
                                    : `${data.orders} Orders`}
                               </div>
                             </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {reportView === 'revenue' && (
          <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 lg:gap-6">
              <SummaryCard title="In-Store Sales" value={financialData.totalRevenue} sub="Dine-in / Takeaway" color="bg-brand-yellow" />
              <SummaryCard title="Delivery Sales" value={financialData.deliveryRevenue} sub={`Menu Price Total: ₹${financialData.deliveryMenuTotal.toLocaleString()}`} color="bg-brand-red" textWhite />
              <SummaryCard title="Combined Revenue" value={financialData.totalRevenue + financialData.deliveryRevenue} sub="Total Collected" color="bg-brand-brown" textWhite />
              <SummaryCard title="Gross Profit" value={financialData.grossProfit} sub="Direct Margin" color="bg-emerald-500" textWhite />
              <SummaryCard title="Order COGS" value={financialData.totalCogs} sub="Materials Used" color="bg-brand-stone" />
            </div>

            <TimeWiseRevenueChart orders={orders} />
            
            <div className="bg-white rounded-2xl lg:rounded-[3rem] p-4 lg:p-10 shadow-xl border border-brand-stone overflow-x-auto">
              <div className="flex flex-col gap-6 mb-6">
                <div className="flex justify-between items-center">
                  <div className="flex bg-brand-brown/5 p-1 rounded-2xl">
                    <button onClick={() => setActiveTab('active')} className={`px-4 lg:px-8 py-2 lg:py-3 rounded-xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'active' ? 'bg-brand-brown text-brand-yellow' : 'text-brand-brown/40'}`}>Active</button>
                    <button onClick={() => setActiveTab('deleted')} className={`px-4 lg:px-8 py-2 lg:py-3 rounded-xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'deleted' ? 'bg-brand-brown text-brand-yellow' : 'text-brand-brown/40'}`}>Voided</button>
                    <button onClick={() => setActiveTab('adjustments')} className={`px-4 lg:px-8 py-2 lg:py-3 rounded-xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'adjustments' ? 'bg-brand-brown text-brand-yellow' : 'text-brand-brown/40'}`}>Stock Adjustments</button>
                  </div>
                </div>

                {activeTab !== 'adjustments' ? (
                  /* Active & Voided Orders Filter Bar */
                  <div className="bg-brand-brown/5 border border-brand-stone p-5 rounded-2xl space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {/* Search Query */}
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Search Orders</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={revSearchQuery}
                            onChange={e => setRevSearchQuery(e.target.value)}
                            placeholder="Search Bill #, Item name, etc..."
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                          />
                          <Search className="w-3.5 h-3.5 text-brand-brown/40 absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>
                      </div>

                      {/* Sort Field */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Sort By</label>
                        <select
                          value={revSortField}
                          onChange={e => setRevSortField(e.target.value as any)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                        >
                          <option value="date">Date & Time</option>
                          <option value="total">Order Total</option>
                          <option value="billNumber">Bill Number</option>
                        </select>
                      </div>

                      {/* Sort Order */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Direction</label>
                        <select
                          value={revSortOrder}
                          onChange={e => setRevSortOrder(e.target.value as any)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                        >
                          <option value="desc">Descending (New/High)</option>
                          <option value="asc">Ascending (Old/Low)</option>
                        </select>
                      </div>

                      {/* Type Filter */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Order Mode</label>
                        <select
                          value={revTypeFilter}
                          onChange={e => setRevTypeFilter(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                        >
                          <option value="all">All Modes</option>
                          <option value="dine_in">Dine-In</option>
                          <option value="takeaway">Takeaway</option>
                          <option value="delivery">Delivery</option>
                        </select>
                      </div>

                      {/* Branch Filter */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Branch</label>
                        <select
                          disabled={!isAdmin}
                          value={revBranchFilter}
                          onChange={e => setRevBranchFilter(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all disabled:opacity-50"
                        >
                          <option value="all">All Branches</option>
                          {uniqueBranches.map(branchName => (
                            <option key={branchName} value={branchName}>{branchName}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-brand-brown/10">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider">Amount Range:</span>
                        <input
                          type="number"
                          placeholder="Min ₹"
                          value={revMinAmount}
                          onChange={e => setRevMinAmount(e.target.value)}
                          className="w-24 p-2 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010]"
                        />
                        <span className="text-xs text-brand-brown/40">to</span>
                        <input
                          type="number"
                          placeholder="Max ₹"
                          value={revMaxAmount}
                          onChange={e => setRevMaxAmount(e.target.value)}
                          className="w-24 p-2 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010]"
                        />
                      </div>

                      {(revSearchQuery || revTypeFilter !== 'all' || revBranchFilter !== 'all' || revMinAmount || revMaxAmount) && (
                        <button
                          onClick={() => {
                            setRevSearchQuery('');
                            setRevTypeFilter('all');
                            setRevBranchFilter('all');
                            setRevMinAmount('');
                            setRevMaxAmount('');
                          }}
                          className="text-[10px] font-black uppercase text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-all"
                        >
                          Clear Filters
                        </button>
                      )}

                      <div className="ml-auto text-[10px] font-bold text-brand-brown/60 bg-white/50 border border-brand-stone px-3 py-1.5 rounded-lg">
                        Showing <span className="font-extrabold text-brand-brown">{filteredAndSortedOrders.length}</span> of {activeTab === 'active' ? orders.length : deletedOrders.length} orders
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Stock Adjustments Filter Bar */
                  <div className="bg-brand-brown/5 border border-brand-stone p-5 rounded-2xl space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      {/* Search Query */}
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Search Adjustments</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={adjSearchQuery}
                            onChange={e => setAdjSearchQuery(e.target.value)}
                            placeholder="Search Item ID, reason, or name..."
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                          />
                          <Search className="w-3.5 h-3.5 text-brand-brown/40 absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>
                      </div>

                      {/* Sort Field */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Sort By</label>
                        <select
                          value={adjSortField}
                          onChange={e => setAdjSortField(e.target.value as any)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                        >
                          <option value="date">Date & Time</option>
                          <option value="quantity_change">Absolute Change</option>
                        </select>
                      </div>

                      {/* Sort Direction */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Direction</label>
                        <select
                          value={adjSortOrder}
                          onChange={e => setAdjSortOrder(e.target.value as any)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                        >
                          <option value="desc">Descending (Newest/Highest)</option>
                          <option value="asc">Ascending (Oldest/Lowest)</option>
                        </select>
                      </div>

                      {/* Branch Filter */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Branch</label>
                        <select
                          disabled={!isAdmin}
                          value={adjBranchFilter}
                          onChange={e => setAdjBranchFilter(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all disabled:opacity-50"
                        >
                          <option value="all">All Branches</option>
                          {uniqueBranches.map(branchName => (
                            <option key={branchName} value={branchName}>{branchName}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-brand-brown/10">
                      {(adjSearchQuery || adjBranchFilter !== 'all') && (
                        <button
                          onClick={() => {
                            setAdjSearchQuery('');
                            setAdjBranchFilter('all');
                          }}
                          className="text-[10px] font-black uppercase text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-all"
                        >
                          Clear Filters
                        </button>
                      )}

                      <div className="ml-auto text-[10px] font-bold text-brand-brown/60 bg-white/50 border border-brand-stone px-3 py-1.5 rounded-lg">
                        Showing <span className="font-extrabold text-brand-brown">{filteredAndSortedAdjustments.length}</span> of {adjustments.length} records
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="min-w-[600px]">
                {activeTab !== 'adjustments' ? (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-brand-brown/5 text-brand-brown/40 text-[9px] lg:text-[10px] font-black uppercase">
                        <th 
                          onClick={() => handleToggleRevSort('billNumber')} 
                          className="px-4 lg:px-8 py-4 cursor-pointer hover:bg-brand-brown/10 select-none transition-colors"
                        >
                          Bill # {revSortField === 'billNumber' ? (revSortOrder === 'desc' ? '▼' : '▲') : '↕'}
                        </th>
                        <th 
                          onClick={() => handleToggleRevSort('date')} 
                          className="px-4 lg:px-8 py-4 cursor-pointer hover:bg-brand-brown/10 select-none transition-colors"
                        >
                          Date {revSortField === 'date' ? (revSortOrder === 'desc' ? '▼' : '▲') : '↕'}
                        </th>
                        <th className="px-4 lg:px-8 py-4">Branch</th>
                        <th className="px-4 lg:px-8 py-4">Type</th>
                        <th 
                          onClick={() => handleToggleRevSort('total')} 
                          className="px-4 lg:px-8 py-4 cursor-pointer hover:bg-brand-brown/10 select-none transition-colors text-right"
                        >
                          Total {revSortField === 'total' ? (revSortOrder === 'desc' ? '▼' : '▲') : '↕'}
                        </th>
                        <th className="px-4 lg:px-8 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-stone">
                      {filteredAndSortedOrders.map(o => (
                        <tr key={o.id} className="hover:bg-brand-cream/50 transition-colors group">
                          <td className="px-4 lg:px-8 py-4 font-black text-xs lg:text-sm">#{o.billNumber}</td>
                          <td className="px-4 lg:px-8 py-4 text-[10px] lg:text-xs">{getISTFullDateTime(o.date)}</td>
                          <td className="px-4 lg:px-8 py-4 text-[9px] lg:text-[10px] font-bold uppercase">{o.branchName}</td>
                          <td className="px-4 lg:px-8 py-4">
                             <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${o.type === 'DELIVERY' ? 'bg-brand-red text-white' : 'bg-brand-brown/5 text-brand-brown/40'}`}>
                               {o.type.replace('_', ' ')}
                             </span>
                          </td>
                          <td className="px-4 lg:px-8 py-4 text-right font-black text-xs lg:text-sm">
                             {o.type === 'DELIVERY' && o.manualTotal != null ? (
                               <div className="flex flex-col items-end">
                                 <span>₹{o.manualTotal}</span>
                                 <span className="text-[7px] text-brand-brown/30 font-bold uppercase tracking-tighter">Menu Price: ₹{o.total}</span>
                               </div>
                             ) : (
                               <span>₹{o.total}</span>
                             )}
                          </td>
                          <td className="px-4 lg:px-8 py-4 text-right">
                            <button 
                              onClick={() => handleSearch(o.billNumber)}
                              className="bg-brand-brown text-brand-yellow px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-brand-red hover:text-white transition-all shadow-md active:scale-95"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-brand-brown/5 text-brand-brown/40 text-[9px] lg:text-[10px] font-black uppercase">
                        <th 
                          onClick={() => handleToggleAdjSort('date')} 
                          className="px-4 lg:px-8 py-4 cursor-pointer hover:bg-brand-brown/10 select-none transition-colors"
                        >
                          Date {adjSortField === 'date' ? (adjSortOrder === 'desc' ? '▼' : '▲') : '↕'}
                        </th>
                        <th className="px-4 lg:px-8 py-4">Item ID</th>
                        <th className="px-4 lg:px-8 py-4">Branch</th>
                        <th 
                          onClick={() => handleToggleAdjSort('quantity_change')} 
                          className="px-4 lg:px-8 py-4 cursor-pointer hover:bg-brand-brown/10 select-none transition-colors text-center"
                        >
                          Change {adjSortField === 'quantity_change' ? (adjSortOrder === 'desc' ? '▼' : '▲') : '↕'}
                        </th>
                        <th className="px-4 lg:px-8 py-4">Performed By</th>
                        <th className="px-4 lg:px-8 py-4 text-right">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-stone">
                      {filteredAndSortedAdjustments.map((adj, idx) => (
                        <tr key={idx} className="hover:bg-brand-cream/50 transition-colors">
                          <td className="px-4 lg:px-8 py-4 text-[10px] lg:text-xs">{getISTFullDateTime(adj.date)}</td>
                          <td className="px-4 lg:px-8 py-4 font-black text-xs lg:text-sm uppercase">{adj.inventory_id}</td>
                          <td className="px-4 lg:px-8 py-4 text-[9px] lg:text-[10px] font-bold uppercase">{adj.branch_name}</td>
                          <td className="px-4 lg:px-8 py-4 text-center">
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black ${adj.quantity_change > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-brand-red'}`}>
                              {adj.quantity_change > 0 ? '+' : ''}{adj.quantity_change}
                            </span>
                          </td>
                          <td className="px-4 lg:px-8 py-4 text-[10px] font-bold uppercase text-brand-brown/60">{adj.performed_by || 'System'}</td>
                          <td className="px-4 lg:px-8 py-4 text-right text-[10px] font-medium italic text-brand-brown/50 italic max-w-[200px] truncate ml-auto" title={adj.reason}>{adj.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}


        {reportView === 'customers' && (isAdmin || user.role === 'STORE_MANAGER') && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Customer Overview Bar */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
               <div className="bg-white p-6 rounded-[2rem] border border-brand-stone shadow-xl group">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-brand-red" />
                    <p className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest">Base</p>
                  </div>
                  <h4 className="text-3xl font-black text-brand-brown tracking-tighter">{customerOverview.totalCount}</h4>
                  <p className="text-[9px] font-bold text-brand-brown/30 uppercase mt-1">Total Profiles</p>
               </div>
               <div className="bg-brand-brown p-6 rounded-[2rem] shadow-xl text-white">
                  <div className="flex items-center gap-2 mb-3">
                    <History className="w-4 h-4 text-brand-yellow" />
                    <p className="text-[10px] font-black uppercase text-white/40 tracking-widest">System LTV</p>
                  </div>
                  <h4 className="text-3xl font-black text-brand-yellow tracking-tighter">₹{Math.round(customerOverview.totalLTV).toLocaleString()}</h4>
                  <p className="text-[9px] font-bold text-white/40 uppercase mt-1">Lifetime Value</p>
               </div>
               <div className="bg-white p-6 rounded-[2rem] border border-brand-stone shadow-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUpIcon className="w-4 h-4 text-emerald-500" />
                    <p className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest">Avg LTV</p>
                  </div>
                  <h4 className="text-3xl font-black text-brand-brown tracking-tighter">₹{Math.round(customerOverview.avgLTV).toLocaleString()}</h4>
                  <p className="text-[9px] font-bold text-brand-brown/30 uppercase mt-1">Per Profile</p>
               </div>
               <div className="bg-white p-6 rounded-[2rem] border border-brand-stone shadow-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Star className="w-4 h-4 text-indigo-500" />
                    <p className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest">Retention</p>
                  </div>
                  <h4 className="text-3xl font-black text-brand-brown tracking-tighter">{customerOverview.retentionRate.toFixed(1)}%</h4>
                  <p className="text-[9px] font-bold text-brand-brown/30 uppercase mt-1">Repeat Rate</p>
               </div>
               <div className="bg-brand-red p-6 rounded-[2rem] shadow-xl text-white">
                  <div className="flex items-center gap-2 mb-3">
                    <Gift className="w-4 h-4 text-brand-yellow" />
                    <p className="text-[10px] font-black uppercase text-white/40 tracking-widest">New Signups</p>
                  </div>
                  <h4 className="text-3xl font-black text-white tracking-tighter">{customerOverview.newInRange}</h4>
                  <p className="text-[9px] font-bold text-brand-yellow/60 uppercase mt-1">This Period</p>
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Customer List */}
            <div className="lg:col-span-1 bg-white rounded-[2.5rem] p-6 shadow-xl border border-brand-stone flex flex-col h-[700px]">
              <div className="mb-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-brand-brown uppercase italic">Customer <span className="text-brand-red">Base</span></h3>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={handleSyncAllStats}
                      disabled={isSyncingStats}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md active:scale-95 disabled:opacity-50"
                      title="Recalculate LTV/Orders for all listed customers"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncingStats ? 'animate-spin' : ''}`} />
                      {isSyncingStats ? 'Syncing...' : 'Sync Stats'}
                    </button>
                    <button 
                      onClick={handleExportCustomers}
                      className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md active:scale-95"
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </button>
                    <span className="text-[10px] font-black text-brand-brown/40 uppercase tracking-widest">{filteredCustomers.length} Found</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-brown/30" />
                    <input 
                      type="tel"
                      placeholder="Search Phone..."
                      value={customerSearchTerm}
                      onChange={e => setCustomerSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-brand-brown/5 rounded-xl text-xs font-black uppercase outline-none focus:ring-2 ring-brand-yellow/50 transition-all"
                    />
                  </div>

                  {/* Sorting Controls */}
                  <div className="flex gap-2">
                    <select 
                      value={customerSortField}
                      onChange={(e) => setCustomerSortField(e.target.value as any)}
                      className="flex-1 bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none cursor-pointer"
                    >
                      <option value="totalSpent">Sort by LTV</option>
                      <option value="totalOrders">Sort by Orders</option>
                      <option value="joinedDate">Sort by Joined Date</option>
                      <option value="lastVisit">Sort by Recently Ordered</option>
                    </select>
                    <button 
                      onClick={() => setCustomerSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="bg-brand-brown/5 p-2 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-brand-brown/10 transition-all"
                    >
                      {customerSortOrder === 'asc' ? 'ASC' : 'DESC'}
                    </button>
                  </div>

                  {/* Range Filters */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <p className="text-[8px] font-black uppercase text-brand-brown/30 tracking-widest ml-1">LTV Range</p>
                        <div className="flex items-center gap-1">
                          <input 
                            type="number" 
                            placeholder="Min" 
                            value={minLtv} 
                            onChange={e => setMinLtv(e.target.value)}
                            className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                          />
                          <input 
                            type="number" 
                            placeholder="Max" 
                            value={maxLtv} 
                            onChange={e => setMaxLtv(e.target.value)}
                            className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[8px] font-black uppercase text-brand-brown/30 tracking-widest ml-1">Orders Range</p>
                        <div className="flex items-center gap-1">
                          <input 
                            type="number" 
                            placeholder="Min" 
                            value={minOrders} 
                            onChange={e => setMinOrders(e.target.value)}
                            className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                          />
                          <input 
                            type="number" 
                            placeholder="Max" 
                            value={maxOrders} 
                            onChange={e => setMaxOrders(e.target.value)}
                            className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[8px] font-black uppercase text-brand-brown/30 tracking-widest ml-1">Ordered Between Dates</p>
                      <div className="flex items-center gap-1">
                        <input 
                          type="date" 
                          value={customerActivityStart} 
                          onChange={e => setCustomerActivityStart(e.target.value)}
                          className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                        />
                        <span className="text-brand-brown/20">-</span>
                        <input 
                          type="date" 
                          value={customerActivityEnd} 
                          onChange={e => setCustomerActivityEnd(e.target.value)}
                          className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                        />
                        {(customerActivityStart || customerActivityEnd) && (
                          <button 
                            onClick={() => { setCustomerActivityStart(''); setCustomerActivityEnd(''); }}
                            className="p-2 bg-brand-red/10 text-brand-red rounded-lg"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[8px] font-black uppercase text-brand-brown/30 tracking-widest ml-1">Order Mode Filter</p>
                      <select 
                        value={customerClassFilter}
                        onChange={(e) => setCustomerClassFilter(e.target.value as any)}
                        className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none cursor-pointer"
                      >
                        <option value="ALL">All Modes</option>
                        <option value="DINE_IN">Dine-in Enthusiast (&gt;70%)</option>
                        <option value="TAKEAWAY">Takeaway Focused (&gt;70%)</option>
                        <option value="DELIVERY">Delivery Only (&gt;70%)</option>
                        <option value="UNCLASSIFIED">Unclassified / Mixed</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              
               <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
                {filteredCustomers.map(c => {
                   const phone = normalizePhone(c.phone);
                   const stats = customerOrderStats[phone];
                   const dineInRate = stats ? stats.DINE_IN / stats.total : 0;
                   const takeawayRate = stats ? stats.TAKEAWAY / stats.total : 0;
                   const deliveryRate = stats ? stats.DELIVERY / stats.total : 0;
                   let label = '';
                   let labelColor = 'bg-brand-red text-white';
                   
                   if (dineInRate > 0.7) label = 'Dine-in';
                   else if (takeawayRate > 0.7) label = 'Takeaway';
                   else if (deliveryRate > 0.7) {
                     label = 'Delivery';
                     labelColor = 'bg-blue-500 text-white';
                   }

                   return (
                     <button 
                       key={c.id}
                       onClick={() => handleCustomerClick(c)}
                       className={`w-full p-4 rounded-2xl flex items-center justify-between border-2 transition-all ${activeCustomer?.id === c.id ? 'bg-brand-brown border-brand-brown text-brand-yellow' : 'bg-white border-brand-stone text-brand-brown hover:border-brand-brown/20'}`}
                     >
                       <div className="text-left">
                         <div className="flex items-center gap-2">
                           <p className="text-sm font-black tracking-tight">{c.phone}</p>
                           {label && (
                             <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full ${activeCustomer?.id === c.id ? 'bg-brand-yellow text-brand-brown' : labelColor}`}>
                               {label}
                             </span>
                           )}
                         </div>
                         <p className={`text-[9px] font-bold uppercase tracking-widest ${activeCustomer?.id === c.id ? 'text-brand-yellow/60' : 'text-brand-brown/40'}`}>Joined {c.joinedDate ? getISTDateString(c.joinedDate) : 'N/A'}</p>
                       </div>
                       <div className="text-right">
                         <p className="text-xs font-black">LTV: ₹{(c.totalSpent ?? 0).toLocaleString()}</p>
                         <p className={`text-[8px] font-black uppercase ${activeCustomer?.id === c.id ? 'text-brand-yellow/60' : 'text-brand-brown/40'}`}>{c.totalOrders} Orders</p>
                       </div>
                     </button>
                   );
                 })}
               </div>
            </div>

            {/* Customer Details & History */}
            <div className="lg:col-span-2 space-y-6 overflow-y-auto h-[700px] no-scrollbar">
              {activeCustomer ? (
                <>
                  <div className="bg-brand-brown rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
                    <UserIcon className="absolute -right-10 -bottom-10 w-64 h-64 text-white/5" />
                    <div className="relative z-10">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-2">
                        <div className="flex items-center gap-3">
                          <p className="text-[10px] font-black uppercase text-brand-yellow tracking-[0.3em] font-primary">Profile Record</p>
                          {(() => {
                            const phone = normalizePhone(activeCustomer.phone);
                            const stats = customerOrderStats[phone];
                            const dineInRate = stats ? stats.DINE_IN / stats.total : 0;
                            const takeawayRate = stats ? stats.TAKEAWAY / stats.total : 0;
                            const deliveryRate = stats ? stats.DELIVERY / stats.total : 0;

                            if (dineInRate > 0.7) return <span className="bg-brand-yellow text-brand-brown text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Dine-in Enthusiast</span>;
                            if (takeawayRate > 0.7) return <span className="bg-brand-yellow text-brand-brown text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Takeaway Focused</span>;
                            if (deliveryRate > 0.7) return <span className="bg-blue-400 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Delivery Only</span>;
                            return <span className="bg-white/10 text-white/60 text-[8px] font-black px-2 py-0.5 rounded-full uppercase italic">Mixed Preferences</span>;
                          })()}
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setActiveCustomer(null)}
                            className="flex items-center gap-2 bg-brand-red/20 hover:bg-brand-red text-white px-4 py-2 rounded-xl transition-all border border-brand-red/30 group"
                          >
                            <X className="w-4 h-4" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Close</span>
                          </button>
                          {!isEditingProfile ? (
                            <button 
                              onClick={() => setIsEditingProfile(true)}
                              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-all border border-white/10 group"
                            >
                              <Edit3 className="w-4 h-4 text-brand-yellow" />
                              <span className="text-[9px] font-black uppercase tracking-widest">Edit Profile</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => setIsEditingProfile(false)}
                                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl transition-all text-white/40"
                              >
                                <span className="text-[9px] font-black uppercase tracking-widest">Cancel</span>
                              </button>
                              <button 
                                onClick={handleSaveProfile}
                                disabled={isSavingProfile}
                                className="flex items-center gap-2 bg-brand-yellow text-brand-brown px-6 py-2 rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50"
                              >
                                <Save className="w-4 h-4" />
                                <span className="text-[9px] font-black uppercase tracking-widest">{isSavingProfile ? 'Saving...' : 'Save Changes'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mb-8">
                        {isEditingProfile ? (
                          <div className="space-y-4 max-w-lg mt-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[8px] font-black uppercase text-white/40 tracking-widest ml-1">Full Name</label>
                                <input 
                                  value={editedProfile.name || ''} 
                                  onChange={e => setEditedProfile(prev => ({ ...prev, name: e.target.value }))}
                                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-brand-yellow"
                                  placeholder="John Doe"
                                />
                                <p className="text-[10px] font-black text-white italic">{activeCustomer.phone}</p>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[8px] font-black uppercase text-white/40 tracking-widest ml-1">Email Address</label>
                                <input 
                                  value={editedProfile.email || ''} 
                                  onChange={e => setEditedProfile(prev => ({ ...prev, email: e.target.value }))}
                                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-brand-yellow"
                                  placeholder="john@example.com"
                                  type="email"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[8px] font-black uppercase text-white/40 tracking-widest ml-1">Birthday</label>
                                <input 
                                  type="date"
                                  value={editedProfile.birthday || ''} 
                                  onChange={e => setEditedProfile(prev => ({ ...prev, birthday: e.target.value }))}
                                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-brand-yellow"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[8px] font-black uppercase text-white/40 tracking-widest ml-1">Customer Note</label>
                                <textarea 
                                  value={editedProfile.note || ''} 
                                  onChange={e => setEditedProfile(prev => ({ ...prev, note: e.target.value }))}
                                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-brand-yellow h-10 resize-none"
                                  placeholder="e.g. VIP guest, likes extra spice..."
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <h2 className="text-4xl font-black italic uppercase tracking-tighter font-primary leading-none">
                              {activeCustomer.name || 'Anonymous Guest'}
                            </h2>
                            <p className="text-brand-yellow font-black text-xs tracking-widest flex items-center gap-2">
                              {activeCustomer.phone}
                              <span className="text-white/20">•</span>
                              <span className="text-[10px] uppercase font-black px-2 py-0.5 bg-brand-yellow/20 rounded border border-brand-yellow/30 text-brand-yellow">
                                {getTierInfo(activeCustomer.totalSpent || 0).name} Stage
                              </span>
                              {activeCustomer.email && (
                                <>
                                  <span className="text-white/20">•</span>
                                  <span className="flex items-center gap-1 text-[10px] text-white/60 lowercase font-bold tracking-normal"><Mail className="w-3 h-3" /> {activeCustomer.email}</span>
                                </>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                        <div className="bg-brand-yellow/20 p-4 rounded-2xl backdrop-blur-md border border-brand-yellow/30">
                          <p className="text-[8px] font-black uppercase text-brand-yellow tracking-widest mb-1">Lifetime Value (LTV)</p>
                          <p className="text-lg font-black text-brand-yellow">₹{(activeCustomer.totalSpent ?? 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Visits</p>
                          <p className="text-lg font-black text-brand-yellow">{activeCustomer.totalOrders ?? 0}</p>
                        </div>
                        <div className="bg-brand-yellow p-4 rounded-2xl backdrop-blur-md border border-brand-brown/20 shadow-lg">
                          <p className="text-[8px] font-black uppercase text-brand-brown/60 tracking-widest mb-1">MinCoins Balance</p>
                          <p className="text-lg font-black text-brand-brown">🪙 {realBalance}</p>
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Last Seen</p>
                          <p className="text-xs font-black uppercase">{activeCustomer.lastVisit ? getISTFullDateTime(activeCustomer.lastVisit) : 'N/A'}</p>
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Coupon</p>
                          {activeCustomer.welcomeCouponUsed ? (
                            <p className="text-[10px] font-black text-white/60 uppercase">Used</p>
                          ) : activeCustomer.totalOrders >= 1 ? (
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-brand-yellow uppercase">🔥 {activeCustomer.welcomeCouponCode || 'Avail'}</p>
                            </div>
                          ) : (
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-tighter italic">Earn next</p>
                          )}
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Member Since</p>
                          <p className="text-xs font-black uppercase">{activeCustomer.joinedDate ? getISTDateString(activeCustomer.joinedDate) : 'N/A'}</p>
                        </div>
                      </div>

                      {/* Mode Split */}
                      {(() => {
                        const stats = customerOrderStats[activeCustomer.phone.trim()];
                        if (!stats || stats.total === 0) return null;
                        
                        const diPercent = (stats.DINE_IN / stats.total) * 100;
                        const taPercent = (stats.TAKEAWAY / stats.total) * 100;
                        const dePercent = (stats.DELIVERY / stats.total) * 100;
                        
                        return (
                          <div className="mb-8 bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-lg">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-[10px] font-black uppercase text-white tracking-[0.2em]">Service Mode Affinity</h4>
                              <div className="flex flex-wrap gap-x-4 gap-y-2">
                                 <div className="flex items-center gap-2">
                                   <div className="w-2 h-2 rounded-full bg-brand-yellow" />
                                   <span className="text-[8px] font-black uppercase text-white/60">Dine-in</span>
                                 </div>
                                 <div className="flex items-center gap-2">
                                   <div className="w-2 h-2 rounded-full bg-brand-red" />
                                   <span className="text-[8px] font-black uppercase text-white/60">Takeaway</span>
                                 </div>
                                 <div className="flex items-center gap-2">
                                   <div className="w-2 h-2 rounded-full bg-blue-500" />
                                   <span className="text-[8px] font-black uppercase text-white/60">Delivery</span>
                                 </div>
                              </div>
                            </div>
                            <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden flex">
                              <div style={{ width: `${diPercent}%` }} className="h-full bg-brand-yellow transition-all duration-500" />
                              <div style={{ width: `${taPercent}%` }} className="h-full bg-brand-red transition-all duration-500" />
                              <div style={{ width: `${dePercent}%` }} className="h-full bg-blue-500 transition-all duration-500" />
                            </div>
                            <div className="flex justify-between mt-2">
                              <div className="text-left">
                                <p className="text-xs font-black text-brand-yellow">{Math.round(diPercent)}%</p>
                                <p className="text-[7px] font-bold text-white/30 uppercase">Dine-in ({stats.DINE_IN})</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs font-black text-brand-red">{Math.round(taPercent)}%</p>
                                <p className="text-[7px] font-bold text-white/30 uppercase">Takeaway ({stats.TAKEAWAY})</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-black text-blue-400">{Math.round(dePercent)}%</p>
                                <p className="text-[7px] font-bold text-white/30 uppercase">Delivery ({stats.DELIVERY})</p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Info Bar */}
                      {!isEditingProfile && (
                        <div className="flex flex-wrap gap-4 mb-8">
                          {activeCustomer.birthday && (
                             <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                               <Calendar className="w-3.5 h-3.5 text-brand-yellow" />
                               <span className="text-[9px] font-black uppercase tracking-widest">DOB: {getISTDateString(activeCustomer.birthday)}</span>
                             </div>
                          )}
                          {activeCustomer.note && (
                             <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                               <FileText className="w-3.5 h-3.5 text-brand-yellow" />
                               <span className="text-[9px] font-black uppercase tracking-widest italic truncate max-w-[200px]">"{activeCustomer.note}"</span>
                             </div>
                          )}
                          {usualOrder && (
                            <div className="flex items-center gap-2 bg-brand-yellow text-brand-brown px-4 py-2 rounded-xl shadow-lg animate-in fade-in zoom-in-95 duration-500">
                               <Star className="w-3.5 h-3.5 fill-current" />
                               <span className="text-[9px] font-black uppercase tracking-widest">Usual: {usualOrder.name}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Messaging Widget */}
                      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-lg">
                        <div className="flex items-center gap-2 mb-4">
                           <MessageSquare className="w-4 h-4 text-brand-yellow" />
                           <h4 className="text-[10px] font-black uppercase text-white tracking-[0.2em]">Quick Connect</h4>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <textarea 
                            value={customMessage}
                            onChange={(e) => setCustomMessage(e.target.value)}
                            placeholder="Type a custom message (e.g. Special offer for you!)..."
                            className="flex-1 bg-white/10 border border-white/20 rounded-2xl p-4 text-white text-xs font-bold placeholder:text-white/20 focus:outline-none focus:border-brand-yellow transition-all resize-none h-20"
                          />
                          <button 
                            onClick={() => {
                              if (!customMessage.trim()) return;
                              const url = `https://wa.me/${activeCustomer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(customMessage)}`;
                              window.open(url, '_blank');
                            }}
                            className="bg-brand-yellow text-brand-brown px-8 py-4 sm:w-24 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-white transition-all active:scale-95 group shadow-xl"
                          >
                            <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                            <span className="text-[8px] font-black uppercase">Send</span>
                          </button>
                        </div>
                      </div>

                      {/* AI Driven Customer Insights */}
                      <CustomerInsights history={selectedCustomerHistory} />
                    </div>
                  </div>

                  <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-brand-stone">
                    <div className="flex items-center gap-3 mb-8">
                       <History className="w-5 h-5 text-brand-red" />
                       <h3 className="text-xl font-black text-brand-brown uppercase italic">Purchase <span className="text-brand-red">Log</span></h3>
                    </div>

                    <div className="space-y-4">
                      {selectedCustomerHistory.length === 0 ? (
                        <p className="text-center py-10 text-brand-brown/40 font-bold uppercase text-[10px] tracking-widest">No transaction history found</p>
                      ) : (
                        selectedCustomerHistory.map(o => (
                          <div 
                            key={o.id}
                            className="bg-brand-cream/30 border border-brand-stone p-5 rounded-2xl flex items-center justify-between hover:bg-brand-cream transition-all group"
                          >
                            <div className="flex items-center gap-4">
                              <div className="bg-white shadow-sm w-12 h-12 rounded-xl flex items-center justify-center font-black text-brand-brown text-xs border border-brand-stone">#{o.billNumber}</div>
                              <div>
                                <p className="text-sm font-black text-brand-brown uppercase">{getISTFullDateTime(o.date)}</p>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="flex items-center gap-1 text-[8px] font-black uppercase text-brand-brown/40 tracking-widest">
                                    <MapPin className="w-2.5 h-2.5" /> {o.branchName}
                                  </span>
                                  <span className="flex items-center gap-1 text-[8px] font-black uppercase text-brand-brown/40 tracking-widest">
                                    <Receipt className="w-2.5 h-2.5" /> {o.paymentMethod}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-6">
                              <div className="text-right hidden sm:block">
                                <p className="text-lg font-black text-brand-brown">
                                  ₹{(o.type === 'DELIVERY' && o.manualTotal != null ? o.manualTotal : (o.total ?? 0)).toLocaleString()}
                                </p>
                                {o.items.some(i => i.paidWithCoins) && (
                                  <p className="text-[8px] font-black uppercase text-indigo-600 tracking-tighter mt-1">
                                     -{o.items.reduce((sum, item) => sum + (item.paidWithCoins ? (item.coinsPrice || 0) * item.quantity : 0), 0)} Coins
                                  </p>
                                )}
                                <p className="text-[8px] font-black uppercase text-emerald-600 tracking-tighter">Verified Order</p>
                              </div>
                              <button 
                                onClick={() => handleSearch(o.billNumber)}
                                className="bg-brand-brown text-brand-yellow px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-red hover:text-white transition-all shadow-md active:scale-95"
                              >
                                View Bill
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                  <div className="bg-white rounded-[2.5rem] p-10 shadow-xl border border-brand-stone space-y-12">
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="w-20 h-20 bg-brand-brown/5 rounded-full flex items-center justify-center mb-6">
                        <Users className="w-10 h-10 text-brand-brown/20" />
                      </div>
                      <h3 className="text-2xl font-black text-brand-brown uppercase italic mb-2 tracking-tighter">Customer <span className="text-brand-red">Network</span></h3>
                      <p className="text-xs font-bold text-brand-brown/40 uppercase tracking-widest max-w-sm mx-auto">Select a profile to view deep insights, or analyze the cohort performance below.</p>
                    </div>

                    <div className="pt-8 border-t border-brand-stone space-y-12">
                      <CustomerHistogram customers={filteredCustomers} />

                      <CohortRetentionChart 
                        data={cohortRawData} 
                        onSelectPeriod={(key) => {
                          setCompositionPeriod(key);
                        }}
                        selectedPeriodKey={compositionPeriod}
                      />

                      <OrderIntervalChart data={cohortRawData} />

                      {compositionPeriod && (
                        <div className="space-y-4">
                           <div className="flex items-center justify-between px-2">
                             <div className="flex items-center gap-2">
                               <TrendingUpIcon className="w-4 h-4 text-brand-red" />
                               <h4 className="text-xs font-black uppercase text-brand-brown tracking-widest">Selected Week Breakdown</h4>
                             </div>
                             <button 
                               onClick={() => setCompositionPeriod(null)}
                               className="text-[9px] font-black uppercase text-brand-red hover:underline"
                             >
                               Clear Selection
                             </button>
                           </div>
                           <CohortCompositionChart 
                              data={cohortRawData} 
                              targetPeriod={compositionPeriod} 
                              granularity={compositionPeriod.includes('W') ? 'WEEK' : 'MONTH'} 
                           />
                        </div>
                      )}
                    </div>
                  </div>
              )}
            </div>
          </div>
        </div>
        )}

        {reportView === 'comparison' && isAdmin && (
          <div className="space-y-8 animate-in slide-in-from-bottom-6 duration-700">
            <div className="flex justify-center">
              <div className="bg-white p-1 rounded-2xl border-2 border-brand-stone inline-flex gap-1 shadow-md">
                <button 
                  onClick={() => setCompareBy('STORE')}
                  className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${compareBy === 'STORE' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-stone/30'}`}
                >
                  By Store
                </button>
                <button 
                  onClick={() => setCompareBy('CASHIER')}
                  className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${compareBy === 'CASHIER' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-stone/30'}`}
                >
                  By Cashier
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:gap-8">
              {comparisonData.map((group, idx) => (
                <div key={group.name} className="bg-white p-6 lg:p-8 rounded-2xl lg:rounded-[3rem] border-2 border-brand-stone flex items-center justify-between shadow-xl">
                  <div className="flex items-center gap-4 lg:gap-8">
                    <span className="text-2xl lg:text-4xl font-black text-brand-brown/10 italic">#{idx + 1}</span>
                    <div>
                      <h4 className="text-lg lg:text-2xl font-black text-brand-brown uppercase leading-none">{group.name}</h4>
                      <p className="text-[8px] lg:text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">{group.orders} Orders</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xl lg:text-3xl font-black text-brand-brown">₹{(group.revenue ?? 0).toLocaleString()}</span>
                    <p className="text-[8px] lg:text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-1">₹{(group.profit ?? 0).toLocaleString()} GP</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {reportView === 'profitability' && isAdmin && (
          <div className="animate-in fade-in zoom-in-95 duration-700 bg-white border border-brand-brown/10 p-12 rounded-[2.5rem] lg:rounded-[4rem] shadow-sm max-w-2xl mx-auto text-center space-y-6">
            <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <TrendingUpIcon className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl lg:text-2xl font-black uppercase text-brand-brown tracking-tight">Financial Statements Relocated</h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-semibold max-w-md mx-auto">
                Detailed Profit & Loss analytics have been shifted to the <span className="font-bold text-brand-brown">Finance Ledger</span> to enable precise real-time transaction tracking, Accrual vs Cash-flow adjustments, and Investment fund auditing.
              </p>
            </div>
            <div className="pt-4 border-t border-brand-brown/5 text-zinc-500 text-[10px] leading-relaxed max-w-sm mx-auto font-medium">
              Please click on the main <span className="font-bold uppercase">Finance Ledger</span> tab in the top navigation panel, then toggle the view to <span className="font-bold uppercase text-emerald-600">P&L Statement</span> to access live charts.
            </div>
          </div>
        )}

        {reportView === 'itemSales' && <ItemSalesReport orders={orders} />}
      </div>
      
      <DeleteBillModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={confirmDelete} billNumber={orderToDelete?.billNumber || null} />

      {/* Sequence Detail Modal */}
      {selectedSequenceDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-brown/80 backdrop-blur-md" onClick={() => setSelectedSequenceDetail(null)} />
          <div className="relative bg-white w-full max-w-2xl max-h-[85vh] rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="bg-brand-brown p-8 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-brand-yellow uppercase italic">{selectedSequenceDetail.label} <span className="text-white">Orders</span></h3>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">{selectedSequenceDetail.orders.length} transaction found in this period</p>
              </div>
              <button onClick={() => setSelectedSequenceDetail(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-4 no-scrollbar">
              {selectedSequenceDetail.orders.length === 0 ? (
                <div className="py-20 text-center">
                   <Receipt className="w-12 h-12 text-brand-brown/10 mx-auto mb-4" />
                   <p className="text-[10px] font-black uppercase text-brand-brown/30 tracking-widest">No detailed order data available</p>
                </div>
              ) : (
                selectedSequenceDetail.orders.map(o => (
                  <div 
                    key={o.id}
                    className="bg-brand-cream/30 border border-brand-stone p-5 rounded-[2rem] flex items-center justify-between hover:bg-brand-cream transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-white shadow-sm w-12 h-12 rounded-xl flex items-center justify-center font-black text-brand-brown text-xs border border-brand-stone">#{o.billNumber}</div>
                      <div>
                        <p className="text-sm font-black text-brand-brown uppercase">{getISTFullDateTime(o.date)}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[8px] font-black uppercase text-brand-brown/40 tracking-widest flex items-center gap-1">
                            <UserIcon className="w-2.5 h-2.5" /> {o.customerPhone || 'GUEST'}
                          </span>
                          <span className="text-[8px] font-black uppercase text-brand-brown/40 tracking-widest flex items-center gap-1" title={o.paymentMethod}>
                            <Receipt className="w-2.5 h-2.5" /> {o.paymentMethod}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right flex items-center gap-6">
                      <div>
                        <p className="text-lg font-black text-brand-brown">₹{(o.type === 'DELIVERY' && o.manualTotal != null ? o.manualTotal : (o.total ?? 0)).toLocaleString()}</p>
                        <p className="text-[8px] font-black uppercase text-brand-brown/40 tracking-tighter">
                          {o.items.length} items
                        </p>
                      </div>
                      <button 
                        onClick={() => {
                          handleSearch(o.billNumber);
                          setSelectedSequenceDetail(null);
                        }}
                        className="bg-brand-brown text-brand-yellow p-3 rounded-xl hover:bg-brand-red hover:text-white transition-all shadow-md active:scale-95"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;
