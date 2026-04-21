
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getOrdersForDateRange, getOrderByBillNumber, deleteOrderByBillNumber, getDeletedOrdersForDateRange, getStations, fetchProcurements, getCentralInventory, fetchCustomers, fetchCustomerHistory } from '../utils/storage';
import { CompletedOrder, PaymentMethod, Station, User, CentralMaterial, Customer } from '../types';
import PrintReceipt from './PrintReceipt';
import DeleteBillModal from './DeleteBillModal';
import ItemSalesReport from './ItemSalesReport';
import PerformanceChart from './PerformanceChart';
import TimeWiseRevenueChart from './TimeWiseRevenueChart';
import { Search, User as UserIcon, MapPin, Receipt, History, X } from 'lucide-react';

const getTodaysDateString = () => new Date().toISOString().split('T')[0];
const getDateString = (date: Date) => date.toISOString().split('T')[0];
const getHistoricalStartDate = (dateStr: string, daysToSubtract: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - daysToSubtract);
  return d.toISOString().split('T')[0];
};

interface AnalyticsProps {
  user: User;
}

type DatePreset = 'today' | 'yesterday' | 'last7' | 'last14' | 'last30' | 'lastMonth' | 'custom';
type ActiveTab = 'active' | 'deleted';
type ReportView = 'revenue' | 'trends' | 'itemSales' | 'comparison' | 'profitability' | 'customers';

const Analytics: React.FC<AnalyticsProps> = ({ user }) => {
  const isAdmin = user.role === 'ADMIN';
  
  const [startDate, setStartDate] = useState<string>(getTodaysDateString());
  const [endDate, setEndDate] = useState<string>(getTodaysDateString());
  const [activePreset, setActivePreset] = useState<DatePreset>('today');
  const [activeTab, setActiveTab] = useState<ActiveTab>('active');
  const [reportView, setReportView] = useState<ReportView>('revenue');
  const [selectedStore, setSelectedStore] = useState<string>(isAdmin ? 'All' : (user.stationName || 'All'));
  const [availableStations, setAvailableStations] = useState<Station[]>([]);
  
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [chartOrders, setChartOrders] = useState<CompletedOrder[]>([]);
  const [allOrdersRaw, setAllOrdersRaw] = useState<CompletedOrder[]>([]);
  const [deletedOrders, setDeletedOrders] = useState<CompletedOrder[]>([]);
  const [procurements, setProcurements] = useState<any[]>([]);
  const [centralInv, setCentralInv] = useState<CentralMaterial[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerHistory, setSelectedCustomerHistory] = useState<CompletedOrder[]>([]);
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [foundOrder, setFoundOrder] = useState<CompletedOrder | null>(null);
  const [searchMessage, setSearchMessage] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');

  // Fixed Costs (Persisted in localStorage for convenience)
  const [salaryRate, setSalaryRate] = useState<number>(Number(localStorage.getItem('momo_salary_rate') || 1200));
  const [rentRate, setRentRate] = useState<number>(Number(localStorage.getItem('momo_rent_rate') || 800));

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<CompletedOrder | null>(null);

  const fetchStaticData = useCallback(async () => {
    if (isAdmin) {
      const [s, c, cust] = await Promise.all([getStations(), getCentralInventory(), fetchCustomers()]);
      setAvailableStations(s);
      setCentralInv(c);
      setCustomers(cust);
    }
  }, [isAdmin]);

  const fetchOrders = useCallback(async () => {
    // Expand start date by 32 days to ensure 30-day SMA is accurate for the start of the visible range
    const expandedStart = getHistoricalStartDate(startDate, 32);
    const fetchedOrders = await getOrdersForDateRange(expandedStart, endDate);
    setAllOrdersRaw(fetchedOrders);
    
    // Filter by store - Managers only see their own
    const storeToFilter = isAdmin ? selectedStore : (user.stationName || 'All');
    
    // Process Chart Data (Historical + Visible range, Station Filtered)
    const stationFiltered = storeToFilter === 'All' 
      ? fetchedOrders 
      : fetchedOrders.filter(o => o.branchName === storeToFilter);
    setChartOrders(stationFiltered);

    // Process View Data (Visible range ONLY, Station Filtered)
    const inRange = stationFiltered.filter(o => {
      const d = o.date.split('T')[0];
      return d >= startDate && d <= endDate;
    });
      
    setOrders([...inRange].sort((a, b) => b.billNumber - a.billNumber));
  }, [startDate, endDate, selectedStore, isAdmin, user.stationName]);

  const fetchFinanceData = useCallback(async () => {
    if (!isAdmin) return;
    const pRes = await fetchProcurements(startDate, endDate);
    setProcurements(pRes.data || []);
  }, [isAdmin, startDate, endDate]);

  const fetchDeletedOrders = useCallback(async () => {
    const fetchedOrders = await getDeletedOrdersForDateRange(startDate, endDate);
    const storeToFilter = isAdmin ? selectedStore : (user.stationName || 'All');
    const filtered = storeToFilter === 'All' 
      ? fetchedOrders 
      : fetchedOrders.filter(o => o.branchName === storeToFilter);
    setDeletedOrders([...filtered].sort((a, b) => b.billNumber - a.billNumber));
  }, [startDate, endDate, selectedStore, isAdmin, user.stationName]);

  const handleCustomerClick = async (customer: Customer) => {
    setActiveCustomer(customer);
    const history = await fetchCustomerHistory(customer.phone);
    setSelectedCustomerHistory(history);
  };

  useEffect(() => {
    fetchStaticData();
  }, [fetchStaticData]);

  useEffect(() => {
    fetchOrders();
    fetchDeletedOrders();
    fetchFinanceData();
  }, [fetchOrders, fetchDeletedOrders, fetchFinanceData]);

  const handlePresetChange = (preset: DatePreset) => {
    setActivePreset(preset);
    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (preset) {
      case 'today':
        start = today;
        end = today;
        break;
      case 'yesterday':
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        start = yesterday;
        end = yesterday;
        break;
      case 'last7':
        const weekAgo = new Date();
        weekAgo.setDate(today.getDate() - 6);
        start = weekAgo;
        end = today;
        break;
      case 'last14':
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(today.getDate() - 13);
        start = twoWeeksAgo;
        end = today;
        break;
      case 'last30':
        const monthAgo = new Date();
        monthAgo.setDate(today.getDate() - 29);
        start = monthAgo;
        end = today;
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
    }
    setStartDate(getDateString(start));
    setEndDate(getDateString(end));
  };

  const handleSearch = async (forcedBillNum?: number) => {
    setFoundOrder(null);
    setSearchMessage('');
    
    const query = forcedBillNum?.toString() || searchTerm;
    if (!query.trim()) return;

    const billNum = parseInt(query, 10);
    if (isNaN(billNum)) {
      setSearchMessage('Please enter a valid bill number.');
      return;
    };

    const order = await getOrderByBillNumber(billNum);
    if (order) {
      setFoundOrder(order);
    } else {
      setSearchMessage(`Bill #${billNum} was not found in the records.`);
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
    let cogs = 0;
    const breakdown: Record<PaymentMethod, number> = { 'Cash': 0, 'UPI': 0, 'Card': 0 };

    orders.forEach(order => {
      revenue += order.total;
      const orderCogs = order.items.reduce((acc, item) => acc + (item.cost ?? 0) * item.quantity, 0);
      cogs += orderCogs;
      if (order.paymentMethod && order.paymentMethod in breakdown) {
        breakdown[order.paymentMethod as PaymentMethod] += order.total;
      }
    });
    
    const grossProfit = revenue - cogs;
    return { 
      totalRevenue: revenue, 
      totalCogs: cogs,
      grossProfit,
      profitMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
      averageOrderValue: orders.length > 0 ? revenue / orders.length : 0,
      paymentBreakdown: breakdown,
      totalOrders: orders.length,
    };
  }, [orders]);

  const pnlData = useMemo(() => {
    if (!isAdmin) return null;

    const indirectCogs = procurements.reduce((acc, p) => {
      const item = centralInv.find(ci => ci.id === p.item_id);
      if (item && (item.category === 'PACKET' || item.category === 'INGREDIENT')) {
        return acc + (p.total_cost || 0);
      }
      return acc;
    }, 0);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysCount = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const totalSalary = daysCount * salaryRate;
    const totalRent = daysCount * rentRate;
    const fixedCosts = totalSalary + totalRent;
    
    const netProfit = financialData.grossProfit - indirectCogs - fixedCosts;

    return {
      indirectCogs,
      fixedCosts,
      salary: totalSalary,
      rent: totalRent,
      netProfit,
      days: daysCount
    };
  }, [isAdmin, procurements, centralInv, financialData, startDate, endDate, salaryRate, rentRate]);

  const comparisonData = useMemo(() => {
    if (!isAdmin) return [];
    const stores: Record<string, { revenue: number, orders: number, profit: number }> = {};
    const visibleRaw = allOrdersRaw.filter(o => {
      const d = o.date.split('T')[0];
      return d >= startDate && d <= endDate;
    });

    visibleRaw.forEach(order => {
      if (!stores[order.branchName]) stores[order.branchName] = { revenue: 0, orders: 0, profit: 0 };
      stores[order.branchName].revenue += order.total;
      stores[order.branchName].orders += 1;
      const orderCogs = order.items.reduce((acc, item) => acc + (item.cost ?? 0) * item.quantity, 0);
      stores[order.branchName].profit += (order.total - orderCogs);
    });
    return Object.entries(stores).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.revenue - a.revenue);
  }, [isAdmin, allOrdersRaw]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => c.phone.includes(customerSearchTerm));
  }, [customers, customerSearchTerm]);

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
            <div className="flex items-center gap-2 bg-white shadow-xl p-2 rounded-2xl border-4 border-brand-brown">
               <input 
                  type="number" 
                  placeholder="SEARCH BILL #" 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="bg-transparent text-[10px] font-black uppercase px-4 py-2 outline-none w-32"
               />
               <button onClick={() => handleSearch()} className="bg-brand-brown text-brand-yellow px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">Find</button>
            </div>

            <div className="flex flex-wrap items-center gap-2 bg-white/50 p-2 rounded-2xl lg:rounded-3xl border border-brand-stone">
              {(['today', 'yesterday', 'last7', 'last14', 'last30', 'lastMonth', 'custom'] as DatePreset[]).map(p => (
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
                         <p className="font-black text-brand-red italic text-xl">₹{(foundOrder.total ?? 0).toLocaleString()}</p>
                      </div>
                   </div>

                   <div className="mt-10 space-y-3">
                      <p className="text-[10px] font-black uppercase text-brand-brown/30 tracking-widest px-1">Order Breakdown</p>
                      <div className="max-h-[250px] overflow-y-auto no-scrollbar pr-2">
                        {foundOrder.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between items-center border-b border-brand-stone/50 py-3 group/item">
                              <div>
                                <span className="font-black text-brand-brown uppercase text-xs lg:text-sm block">x{it.quantity} {it.name}</span>
                              </div>
                              <span className="font-black text-brand-brown text-xs lg:text-sm">₹{(it.price * it.quantity).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                   </div>

                   {foundOrder.deletionInfo && (
                      <div className="mt-10 p-6 bg-red-50 rounded-3xl border-2 border-brand-red/10">
                         <p className="text-[10px] font-black text-brand-red uppercase mb-2 tracking-widest">Deletion Record</p>
                         <p className="text-xs font-bold text-brand-brown italic">" {foundOrder.deletionInfo.reason} "</p>
                         <div className="flex justify-between items-center mt-3 pt-3 border-t border-brand-red/10">
                           <p className="text-[9px] font-black text-brand-brown/40 uppercase">Timestamp: {foundOrder.deletionInfo.date ? new Date(foundOrder.deletionInfo.date).toLocaleString() : 'N/A'}</p>
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
                    orderType={foundOrder.type}
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
          <button onClick={() => setReportView('trends')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'trends' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Trends</button>
          <button onClick={() => setReportView('itemSales')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'itemSales' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Items</button>
          {isAdmin && (
            <>
              <button onClick={() => setReportView('customers')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'customers' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Customers</button>
              <button onClick={() => setReportView('comparison')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'comparison' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Compare</button>
              <button onClick={() => setReportView('profitability')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'profitability' ? 'bg-brand-red text-white' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>P&L</button>
            </>
          )}
        </div>

        {reportView === 'revenue' && (
          <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              <SummaryCard title="Total Revenue" value={financialData.totalRevenue} sub={`${financialData.totalOrders} Orders`} color="bg-brand-yellow" />
              <SummaryCard title="Gross Profit" value={financialData.grossProfit} sub="Direct Margin" color="bg-emerald-500" textWhite />
              <SummaryCard title="Order COGS" value={financialData.totalCogs} sub="Materials" color="bg-brand-red" textWhite />
              <SummaryCard title="Avg Ticket" value={financialData.averageOrderValue} sub="Per Order" color="bg-brand-brown" textWhite />
            </div>

            <TimeWiseRevenueChart orders={orders} />
            
            <div className="bg-white rounded-2xl lg:rounded-[3rem] p-4 lg:p-10 shadow-xl border border-brand-stone overflow-x-auto">
              <div className="flex justify-between items-center mb-6">
                <div className="flex bg-brand-brown/5 p-1 rounded-2xl">
                  <button onClick={() => setActiveTab('active')} className={`px-4 lg:px-8 py-2 lg:py-3 rounded-xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'active' ? 'bg-brand-brown text-brand-yellow' : 'text-brand-brown/40'}`}>Active</button>
                  <button onClick={() => setActiveTab('deleted')} className={`px-4 lg:px-8 py-2 lg:py-3 rounded-xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'deleted' ? 'bg-brand-brown text-brand-yellow' : 'text-brand-brown/40'}`}>Voided</button>
                </div>
              </div>
              <div className="min-w-[600px]">
                <table className="w-full text-left">
                  <thead><tr className="bg-brand-brown/5 text-brand-brown/40 text-[9px] lg:text-[10px] font-black uppercase"><th className="px-4 lg:px-8 py-4">Bill #</th><th className="px-4 lg:px-8 py-4">Date</th><th className="px-4 lg:px-8 py-4">Branch</th><th className="px-4 lg:px-8 py-4">Type</th><th className="px-4 lg:px-8 py-4 text-right">Total</th><th className="px-4 lg:px-8 py-4 text-right">Action</th></tr></thead>
                  <tbody className="divide-y divide-brand-stone">
                    {(activeTab === 'active' ? orders : deletedOrders).map(o => (
                      <tr key={o.id} className="hover:bg-brand-cream/50 transition-colors group">
                        <td className="px-4 lg:px-8 py-4 font-black text-xs lg:text-sm">#{o.billNumber}</td>
                        <td className="px-4 lg:px-8 py-4 text-[10px] lg:text-xs">{new Date(o.date).toLocaleDateString()}</td>
                        <td className="px-4 lg:px-8 py-4 text-[9px] lg:text-[10px] font-bold uppercase">{o.branchName}</td>
                        <td className="px-4 lg:px-8 py-4">
                           <span className="px-2 py-0.5 bg-brand-brown/5 rounded text-[8px] font-black uppercase text-brand-brown/40">{o.type.replace('_', ' ')}</span>
                        </td>
                        <td className="px-4 lg:px-8 py-4 text-right font-black text-xs lg:text-sm">₹{o.total}</td>
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
              </div>
            </div>
          </div>
        )}

        {reportView === 'trends' && (
          <div className="animate-in fade-in duration-500">
            <PerformanceChart orders={chartOrders} startDate={startDate} endDate={endDate} />
          </div>
        )}

        {reportView === 'customers' && isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
            {/* Customer List */}
            <div className="lg:col-span-1 bg-white rounded-[2.5rem] p-6 shadow-xl border border-brand-stone flex flex-col h-[700px]">
              <div className="mb-6">
                <h3 className="text-xl font-black text-brand-brown uppercase italic mb-4">Customer <span className="text-brand-red">Base</span></h3>
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
              </div>
              
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
                {filteredCustomers.map(c => (
                  <button 
                    key={c.id}
                    onClick={() => handleCustomerClick(c)}
                    className={`w-full p-4 rounded-2xl flex items-center justify-between border-2 transition-all ${activeCustomer?.id === c.id ? 'bg-brand-brown border-brand-brown text-brand-yellow' : 'bg-white border-brand-stone text-brand-brown hover:border-brand-brown/20'}`}
                  >
                    <div className="text-left">
                      <p className="text-sm font-black tracking-tight">{c.phone}</p>
                      <p className={`text-[9px] font-bold uppercase tracking-widest ${activeCustomer?.id === c.id ? 'text-brand-yellow/60' : 'text-brand-brown/40'}`}>Joined {c.joinedDate ? new Date(c.joinedDate).toLocaleDateString() : 'N/A'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black">LTV: ₹{(c.totalSpent ?? 0).toLocaleString()}</p>
                      <p className={`text-[8px] font-black uppercase ${activeCustomer?.id === c.id ? 'text-brand-yellow/60' : 'text-brand-brown/40'}`}>{c.totalOrders} Orders</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Customer Details & History */}
            <div className="lg:col-span-2 space-y-6 overflow-y-auto h-[700px] no-scrollbar">
              {activeCustomer ? (
                <>
                  <div className="bg-brand-brown rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
                    <UserIcon className="absolute -right-10 -bottom-10 w-64 h-64 text-white/5" />
                    <div className="relative z-10">
                      <p className="text-[10px] font-black uppercase text-brand-yellow tracking-[0.3em] mb-2 font-primary">Profile Record</p>
                      <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-8 font-primary">{activeCustomer.phone}</h2>
                      
                      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="bg-brand-yellow/20 p-4 rounded-2xl backdrop-blur-md border border-brand-yellow/30">
                          <p className="text-[8px] font-black uppercase text-brand-yellow tracking-widest mb-1">Lifetime Value (LTV)</p>
                          <p className="text-lg font-black text-brand-yellow">₹{(activeCustomer.totalSpent ?? 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Visits</p>
                          <p className="text-lg font-black text-brand-yellow">{activeCustomer.totalOrders ?? 0}</p>
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Avg. Bill</p>
                          <p className="text-lg font-black text-brand-yellow">₹{activeCustomer.totalOrders ? (activeCustomer.totalSpent / activeCustomer.totalOrders).toFixed(0) : '0'}</p>
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Last Seen</p>
                          <p className="text-xs font-black uppercase">{activeCustomer.lastVisit ? new Date(activeCustomer.lastVisit).toLocaleDateString() : 'N/A'}</p>
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Member Since</p>
                          <p className="text-xs font-black uppercase">{activeCustomer.joinedDate ? new Date(activeCustomer.joinedDate).toLocaleDateString() : 'N/A'}</p>
                        </div>
                      </div>
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
                                <p className="text-sm font-black text-brand-brown uppercase">{new Date(o.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
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
                                <p className="text-lg font-black text-brand-brown">₹{(o.total ?? 0).toLocaleString()}</p>
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
                <div className="bg-white rounded-[2.5rem] p-20 shadow-xl border border-brand-stone flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 bg-brand-brown/5 rounded-full flex items-center justify-center mb-6">
                    <UserIcon className="w-10 h-10 text-brand-brown/20" />
                  </div>
                  <h3 className="text-2xl font-black text-brand-brown uppercase italic mb-2 tracking-tighter">Select a <span className="text-brand-red">Customer</span></h3>
                  <p className="text-xs font-bold text-brand-brown/40 uppercase tracking-widest max-w-xs">Please choose a profile from the left pane to view detailed history and analytics.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {reportView === 'comparison' && isAdmin && (
          <div className="grid grid-cols-1 gap-4 lg:gap-8 animate-in slide-in-from-bottom-6 duration-700">
            {comparisonData.map((store, idx) => (
              <div key={store.name} className="bg-white p-6 lg:p-8 rounded-2xl lg:rounded-[3rem] border-2 border-brand-stone flex items-center justify-between shadow-xl">
                <div className="flex items-center gap-4 lg:gap-8">
                  <span className="text-2xl lg:text-4xl font-black text-brand-brown/10 italic">#{idx + 1}</span>
                  <div>
                    <h4 className="text-lg lg:text-2xl font-black text-brand-brown uppercase leading-none">{store.name}</h4>
                    <p className="text-[8px] lg:text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">{store.orders} Orders</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xl lg:text-3xl font-black text-brand-brown">₹{(store.revenue ?? 0).toLocaleString()}</span>
                  <p className="text-[8px] lg:text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-1">₹{(store.profit ?? 0).toLocaleString()} GP</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {reportView === 'profitability' && isAdmin && pnlData && (
          <div className="animate-in fade-in zoom-in-95 duration-700 space-y-6 lg:space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
              <div className="bg-white p-6 lg:p-10 rounded-[2.5rem] lg:rounded-[4rem] border-2 lg:border-4 border-brand-stone shadow-xl">
                <h3 className="text-lg lg:text-xl font-black italic text-brand-brown uppercase mb-6 lg:mb-8 underline decoration-brand-yellow decoration-4 lg:decoration-8 underline-offset-4 lg:underline-offset-8">Fixed Cost <span className="text-brand-yellow">Params</span></h3>
                <div className="space-y-4 lg:space-y-6">
                  <div>
                    <label className="text-[8px] lg:text-[10px] font-black uppercase text-brand-brown/40 tracking-widest ml-4 mb-2 block">Daily Salary (₹)</label>
                    <input type="number" value={salaryRate} onChange={e => { const val = Number(e.target.value); setSalaryRate(val); localStorage.setItem('momo_salary_rate', val.toString()); }} className="w-full p-4 lg:p-6 rounded-2xl lg:rounded-3xl border-2 border-brand-stone bg-brand-cream/30 font-black text-lg lg:text-xl text-brand-brown outline-none focus:border-brand-yellow transition-all" />
                  </div>
                  <div>
                    <label className="text-[8px] lg:text-[10px] font-black uppercase text-brand-brown/40 tracking-widest ml-4 mb-2 block">Daily Rent (₹)</label>
                    <input type="number" value={rentRate} onChange={e => { const val = Number(e.target.value); setRentRate(val); localStorage.setItem('momo_rent_rate', val.toString()); }} className="w-full p-4 lg:p-6 rounded-2xl lg:rounded-3xl border-2 border-brand-stone bg-brand-cream/30 font-black text-lg lg:text-xl text-brand-brown outline-none focus:border-brand-yellow transition-all" />
                  </div>
                  <p className="text-[8px] lg:text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest text-center mt-4 italic">Period: {pnlData.days} days</p>
                </div>
              </div>

              <div className="bg-brand-brown rounded-[2.5rem] lg:rounded-[4rem] p-8 lg:p-12 text-brand-cream shadow-2xl relative overflow-hidden">
                <h3 className="text-2xl lg:text-3xl font-black italic text-brand-yellow uppercase mb-8 lg:mb-10 tracking-tighter">Net <span className="text-white">Profit</span></h3>
                <div className="space-y-6 lg:space-y-8">
                  <div className="flex justify-between items-end border-b border-white/10 pb-2 lg:pb-4">
                    <span className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-white/40">Gross Profit</span>
                    <span className="text-xl lg:text-2xl font-black text-brand-yellow">₹{(financialData.grossProfit ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-white/10 pb-2 lg:pb-4">
                    <span className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-white/40">Indirect COGS</span>
                    <span className="text-xl lg:text-2xl font-black text-brand-red">- ₹{(pnlData.indirectCogs ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-white/10 pb-2 lg:pb-4">
                    <span className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-white/40">Fixed Costs</span>
                    <span className="text-xl lg:text-2xl font-black text-brand-red">- ₹{(pnlData.fixedCosts ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="pt-4 flex justify-between items-center">
                    <span className="text-base lg:text-xl font-black uppercase tracking-tighter italic">Net Profit</span>
                    <span className={`text-4xl lg:text-5xl font-black tracking-tighter ${pnlData.netProfit >= 0 ? 'text-emerald-400' : 'text-brand-red'}`}>₹{(pnlData.netProfit ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 lg:p-12 rounded-[2.5rem] lg:rounded-[4rem] border border-brand-stone shadow-sm overflow-x-auto">
              <h4 className="text-[10px] lg:text-sm font-black uppercase text-brand-brown/30 tracking-[0.5em] text-center mb-10">Flow Cascade</h4>
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 min-w-[800px] max-w-5xl mx-auto">
                <div className="text-center"><p className="text-[10px] font-black uppercase text-brand-brown/40 mb-2">Revenue</p><p className="text-2xl lg:text-3xl font-black">₹{(financialData.totalRevenue ?? 0).toLocaleString()}</p></div>
                <div className="w-8 h-8 lg:w-10 lg:h-10 bg-brand-brown/5 rounded-full flex items-center justify-center font-black opacity-20">-</div>
                <div className="text-center"><p className="text-[10px] font-black uppercase text-brand-brown/40 mb-2">Order COGS</p><p className="text-xl lg:text-2xl font-black">₹{(financialData.totalCogs ?? 0).toLocaleString()}</p></div>
                <div className="w-8 h-8 lg:w-10 lg:h-10 bg-brand-brown/5 rounded-full flex items-center justify-center font-black opacity-20">=</div>
                <div className="text-center"><p className="text-[10px] font-black uppercase text-brand-brown/40 mb-2">Gross Profit</p><p className="text-xl lg:text-2xl font-black text-emerald-600">₹{(financialData.grossProfit ?? 0).toLocaleString()}</p></div>
                <div className="w-8 h-8 lg:w-10 lg:h-10 bg-brand-brown/5 rounded-full flex items-center justify-center font-black opacity-20">-</div>
                <div className="text-center"><p className="text-[10px] font-black uppercase text-brand-brown/40 mb-2">Ind/Fixed</p><p className="text-xl lg:text-2xl font-black text-brand-red">₹{((pnlData.indirectCogs ?? 0) + (pnlData.fixedCosts ?? 0)).toLocaleString()}</p></div>
                <div className="w-8 h-8 lg:w-10 lg:h-10 bg-brand-brown/5 rounded-full flex items-center justify-center font-black opacity-20">=</div>
                <div className="text-center"><p className="text-[10px] font-black uppercase text-emerald-600 mb-2">Final Result</p><p className="text-3xl lg:text-4xl font-black text-brand-brown">₹{(pnlData.netProfit ?? 0).toLocaleString()}</p></div>
              </div>
            </div>
          </div>
        )}

        {reportView === 'itemSales' && <ItemSalesReport orders={orders} />}
      </div>
      
      <DeleteBillModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={confirmDelete} billNumber={orderToDelete?.billNumber || null} />
    </div>
  );
};

export default Analytics;
