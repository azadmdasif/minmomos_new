
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { RawMaterial, User, CentralMaterial, Station, MaterialCategory, StockAllocation } from '../types';
import { 
  getInventory, 
  getCentralInventory, 
  recordCentralPurchase, 
  allocateStock, 
  getStations, 
  createCentralItem, 
  markCentralFinished, 
  markStoreItemFinished, 
  raiseRestockRequest, 
  seedStandardInventory,
  fetchProcurements,
  logProcurement,
  fetchAllocations,
  getISTDate,
  getISTDateString,
  getISTISOString
} from '../utils/storage';

interface InventoryProps {
  user: User;
  currentBranch: string | null;
}

type InventoryTab = 'HUB' | 'LEDGER';
type LedgerType = 'BUYING' | 'ALLOCATION';
type DatePreset = 'today' | 'yesterday' | 'week' | 'custom';
type SortBy = 'date' | 'quantity' | 'cost';

const Inventory: React.FC<InventoryProps> = ({ user }) => {
  const isAdmin = user.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState<InventoryTab>('HUB');
  const [materialCategory, setMaterialCategory] = useState<MaterialCategory>('MOMO');
  
  // Ledger States
  const [ledgerType, setLedgerType] = useState<LedgerType>('BUYING');
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [startDate, setStartDate] = useState(getISTDateString());
  const [endDate, setEndDate] = useState(getISTDateString());
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [stations, setStations] = useState<Station[]>([]);
  const [centralStock, setCentralStock] = useState<CentralMaterial[]>([]);
  const [storeStock, setStoreStock] = useState<RawMaterial[]>([]);
  const [procurements, setProcurements] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<StockAllocation[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [isTableMissing, setIsTableMissing] = useState(false);
  const pollIntervalRef = useRef<number | null>(null);
  
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [vendor, setVendor] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('pcs');
  const [isLoading, setIsLoading] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      if (isAdmin) {
        // Fetch Stations
        const s = await getStations();
        setStations(s);

        // Fetch Central Inventory
        try {
          const c = await getCentralInventory();
          setCentralStock(c);
        } catch (e: any) {
          if (e.code === '42P01') setIsTableMissing(true);
        }

        // Fetch Procurements
        try {
          const pRes = await fetchProcurements(startDate, endDate);
          setProcurements(pRes.data || []);
        } catch (e: any) {
          if (e.code === '42P01') setIsTableMissing(true);
        }

        // Fetch Allocations
        try {
          const aRes = await fetchAllocations(startDate, endDate);
          if (aRes.error && aRes.error.code === '42P01') {
             setIsTableMissing(true);
          } else {
             setAllocations(aRes.data || []);
          }
        } catch (e: any) {
          if (e.code === '42P01') setIsTableMissing(true);
        }

        if (selectedStation) {
          const inv = await getInventory(selectedStation.name);
          setStoreStock(inv);
        }
      } else if (user.stationName) {
        const inv = await getInventory(user.stationName);
        setStoreStock(inv);
      }
    } catch (e: any) {
      console.error("General Fetch failed", e);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [isAdmin, selectedStation, user.stationName, startDate, endDate]);

  useEffect(() => {
    fetchData();
    pollIntervalRef.current = window.setInterval(() => fetchData(true), 15000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchData]);

  const handleInitializeStock = async () => {
    setIsSeeding(true);
    try {
      await seedStandardInventory();
      await fetchData();
      alert("SUCCESS: Standard raw materials have been pre-filled!");
    } catch (e: any) {
      alert("Seeding failed: " + e.message);
    } finally {
      setIsSeeding(false);
    }
  };

  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    const today = getISTDate();
    let start = getISTDate();
    let end = getISTDate();

    if (preset === 'today') {
      start = today;
    } else if (preset === 'yesterday') {
      start.setDate(today.getDate() - 1);
      end.setDate(today.getDate() - 1);
    } else if (preset === 'week') {
      start.setDate(today.getDate() - 7);
    }

    setStartDate(getISTDateString(start));
    setEndDate(getISTDateString(end));
  };

  const sortedProcurements = useMemo(() => {
    const list = [...procurements];
    return list.sort((a, b) => {
      let valA: any = a[sortBy === 'cost' ? 'total_cost' : sortBy];
      let valB: any = b[sortBy === 'cost' ? 'total_cost' : sortBy];
      if (sortBy === 'date') { valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime(); }
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [procurements, sortBy, sortOrder]);

  const sortedAllocations = useMemo(() => {
    const list = [...allocations];
    return list.sort((a, b) => {
      let valA: any = a[sortBy === 'cost' || sortBy === 'quantity' ? 'quantity' : sortBy]; 
      let valB: any = b[sortBy === 'cost' || sortBy === 'quantity' ? 'quantity' : sortBy];
      if (sortBy === 'date') { valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime(); }
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [allocations, sortBy, sortOrder]);

  const handleAddNewItem = async () => {
    if (newItemName && newItemUnit && qty && cost) {
      try {
        await createCentralItem(newItemName, newItemUnit, parseFloat(qty), parseFloat(cost), materialCategory);
        setIsAddItemModalOpen(false);
        resetForm();
        await fetchData();
      } catch (e: any) {
        alert("CRITICAL ERROR: " + e.message);
      }
    } else {
      alert("Please fill all required fields.");
    }
  };

  const handleCentralPurchase = async () => {
    if (selectedItem?.id && qty && cost) {
      try {
        await logProcurement({
          item_id: selectedItem.id,
          item_name: selectedItem.name,
          quantity: parseFloat(qty),
          unit: selectedItem.unit,
          total_cost: parseFloat(cost),
          vendor: vendor || 'Local Market',
          date: getISTISOString()
        });
        await recordCentralPurchase(selectedItem.id, parseFloat(qty), parseFloat(cost));
        setIsRestockModalOpen(false);
        resetForm();
        await fetchData();
      } catch (e: any) {
        alert("STOCK ADDITION FAILED: " + e.message);
      }
    }
  };

  const handleAllocation = async () => {
    if (selectedItem?.id && selectedStation && qty) {
      try {
        await allocateStock(selectedItem.id, selectedStation.name, parseFloat(qty));
        setIsAllocateModalOpen(false);
        resetForm();
        await fetchData();
      } catch (e: any) {
        alert("Allocation Failed: " + e.message);
      }
    }
  };

  const handleStoreAction = async (itemId: string, action: 'finish' | 'request') => {
    if (!user.stationName) return;
    if (action === 'finish') {
      const item = storeStock.find(i => i.id === itemId);
      // Ensure store manager can only finish, not restock
      if (!item?.is_finished) {
        await markStoreItemFinished(itemId, user.stationName, true);
      }
    } else {
      await raiseRestockRequest(itemId, user.stationName);
      alert("Restock request sent to Admin.");
    }
    fetchData();
  };

  const resetForm = () => {
    setQty('');
    setCost('');
    setVendor('');
    setNewItemName('');
    setNewItemUnit(materialCategory === 'MOMO' ? 'pcs' : materialCategory === 'PACKET' ? 'pkt' : 'kg');
    setSelectedItem(null);
  };

  if (isTableMissing) {
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center text-center bg-brand-cream overflow-y-auto no-scrollbar">
        <div className="max-w-4xl bg-white p-12 rounded-[3rem] shadow-2xl border-4 border-brand-red">
          <h2 className="text-4xl font-black text-brand-brown mb-4 uppercase italic">Database <span className="text-brand-red">Update Required</span></h2>
          <p className="text-brand-brown/60 mb-6 font-bold uppercase tracking-widest text-xs">Run this SQL in Supabase Editor to support the new Allocation Ledger:</p>
          <div className="text-left bg-slate-900 p-8 rounded-3xl mb-8 overflow-x-auto border-4 border-brand-stone">
            <pre className="text-emerald-400 text-[10px] md:text-[11px] font-mono leading-relaxed">
{`CREATE TABLE IF NOT EXISTS stock_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id TEXT NOT NULL,
  material_name TEXT NOT NULL,
  station_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE stock_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Allocations" ON stock_allocations FOR ALL TO anon USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';`}
            </pre>
          </div>
          <button onClick={() => fetchData()} className="bg-brand-brown text-brand-yellow px-12 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest">Refresh Inventory View</button>
        </div>
      </div>
    );
  }

  const inputClasses = "w-full p-4 rounded-2xl border border-brand-stone bg-white text-brand-brown font-bold focus:ring-2 focus:ring-brand-yellow outline-none transition-all placeholder:text-brand-brown/30";

  return (
    <div className="p-8 h-full bg-brand-cream overflow-y-auto no-scrollbar">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start gap-6">
        <div>
          <h2 className="text-5xl font-black text-brand-brown italic tracking-tighter uppercase">SUPPLY <span className="text-brand-yellow">HUB</span></h2>
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">Real-time Stock & movement Tracking</p>
        </div>
        
        <div className="flex gap-4">
          {isAdmin && (
            <div className="bg-white p-1 rounded-2xl border border-brand-stone flex shadow-sm">
              <button onClick={() => setActiveTab('HUB')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'HUB' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Active Stock</button>
              <button onClick={() => setActiveTab('LEDGER')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LEDGER' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Transaction Ledger</button>
            </div>
          )}
          {isAdmin && activeTab === 'HUB' && (
            <button onClick={() => { resetForm(); setIsAddItemModalOpen(true); }} className="bg-brand-brown text-brand-yellow px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform">Register New Item</button>
          )}
        </div>
      </header>

      {activeTab === 'HUB' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {[
              { id: 'MOMO' as MaterialCategory, title: 'Category A: Momos', desc: 'Auto-deducts per bill.', icon: '🥟', color: 'bg-brand-brown' },
              { id: 'PACKET' as MaterialCategory, title: 'Category B: Packets', desc: 'Manual mark-as-finished.', icon: '🥫', color: 'bg-brand-red' },
              { id: 'INGREDIENT' as MaterialCategory, title: 'Category C: Veggies', desc: 'Hub usage only.', icon: '🥬', color: 'bg-mountain-green' },
            ].map(cat => (
              <button key={cat.id} onClick={() => setMaterialCategory(cat.id)} className={`text-left p-8 rounded-[3rem] border-4 transition-all duration-500 shadow-xl ${materialCategory === cat.id ? `${cat.color} text-white scale-105 border-brand-yellow` : 'bg-white border-brand-stone text-brand-brown hover:border-brand-yellow/30'}`}>
                <div className="text-5xl mb-6">{cat.icon}</div>
                <h3 className="text-2xl font-black mb-2">{cat.title}</h3>
                <p className={`text-[11px] font-bold uppercase tracking-tight leading-relaxed ${materialCategory === cat.id ? 'text-brand-yellow' : 'text-brand-brown/40'}`}>{cat.desc}</p>
              </button>
            ))}
          </div>

          {isAdmin && (
            <section className="mb-12 animate-in fade-in duration-500">
              <h3 className="text-2xl font-black text-brand-brown underline decoration-brand-yellow decoration-4 underline-offset-8 uppercase tracking-tighter italic mb-8">Central Inventory: {materialCategory}</h3>
              
              {centralStock.length === 0 ? (
                <div className="bg-white rounded-[3rem] p-16 text-center border-4 border-dashed border-brand-stone">
                   <div className="text-6xl mb-6">📦</div>
                   <h4 className="text-2xl font-black text-brand-brown uppercase italic mb-4">The Hub is Empty</h4>
                   <p className="text-brand-brown/40 font-bold uppercase tracking-widest text-xs mb-8">You haven't added any base materials yet. Would you like to pre-fill the stock with standard Momo types and supplies?</p>
                   <button 
                    onClick={handleInitializeStock}
                    disabled={isSeeding}
                    className="bg-brand-brown text-brand-yellow px-12 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                   >
                     {isSeeding ? 'Pre-filling...' : 'Initialize Hub Stock'}
                   </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {centralStock.filter(i => i.category === materialCategory).map(item => (
                    <div key={item.id} className={`bg-white p-8 rounded-[2.5rem] shadow-sm border-2 border-brand-stone group transition-all ${item.is_finished ? 'bg-red-50 border-brand-red/50' : 'hover:border-brand-brown shadow-lg'}`}>
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h4 className="text-lg font-black text-brand-brown">{item.name}</h4>
                          <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${item.is_finished ? 'text-brand-red' : 'text-brand-brown/40'}`}>HUB: {item.current_stock.toFixed(2)} {item.unit}</p>
                        </div>
                        <button onClick={() => { setSelectedItem(item); setIsRestockModalOpen(true); }} className="p-3 bg-brand-stone/30 rounded-xl hover:bg-brand-yellow transition-colors group-hover:bg-brand-yellow shadow-sm">
                          <svg className="w-5 h-5 text-brand-brown" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        {materialCategory !== 'INGREDIENT' ? (
                          <button onClick={() => { setSelectedItem(item); setIsAllocateModalOpen(true); }} className="w-full py-4 bg-brand-brown text-brand-yellow rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">Dispatch to Store</button>
                        ) : (
                          <button onClick={() => { markCentralFinished(item.id, !item.is_finished); fetchData(); }} className={`full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg ${item.is_finished ? 'bg-brand-brown text-brand-yellow' : 'bg-brand-red text-white'}`}>{item.is_finished ? 'Receive Hub Stock' : 'Mark as Used Up'}</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {centralStock.filter(i => i.category === materialCategory).length === 0 && (
                    <div className="lg:col-span-4 p-12 text-center text-brand-brown/20 uppercase font-black text-[10px] tracking-widest">No materials found in this category</div>
                  )}
                </div>
              )}
            </section>
          )}

          {materialCategory !== 'INGREDIENT' && (
            <section className="animate-in fade-in duration-500 delay-150">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-brand-brown italic uppercase">{isAdmin ? `Branch Monitor: ${selectedStation?.name || '...'}` : `Store Stock: ${user.stationName}`}</h3>
                {isAdmin && (
                  <select onChange={(e) => setSelectedStation(stations.find(s => s.id === e.target.value) || null)} className="bg-white border-4 border-brand-brown p-4 rounded-2xl text-[10px] font-black uppercase text-brand-brown shadow-xl outline-none">
                    <option value="">Select Branch Station...</option>
                    {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
              <div className="bg-white rounded-[3rem] shadow-2xl border-4 border-brand-brown overflow-hidden">
                <table className="w-full">
                  <thead className="bg-brand-brown text-brand-yellow">
                    <tr><th className="px-10 py-6 text-[11px] font-black uppercase text-left tracking-widest">Item</th><th className="px-10 py-6 text-[11px] font-black uppercase text-center tracking-widest">Stock Level</th><th className="px-10 py-6 text-[11px] font-black uppercase text-right tracking-widest">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-brand-stone">
                    {storeStock.filter(i => i.category === materialCategory).map(item => (
                      <tr key={item.id} className={`${item.is_finished ? 'bg-red-50' : 'bg-white'} transition-colors`}>
                        <td className="px-10 py-8"><p className="text-xl font-black text-brand-brown">{item.name}</p>{item.request_pending && <span className="text-[9px] font-black text-brand-red uppercase bg-brand-red/10 px-3 py-1 rounded-full inline-block mt-2 animate-pulse">Low Stock Alert</span>}</td>
                        <td className="px-10 py-8 text-center"><span className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${item.is_finished ? 'bg-brand-red text-white' : 'bg-brand-brown/5 text-brand-brown'}`}>{item.is_finished ? 'FINISHED' : `${item.current_stock.toFixed(2)} ${item.unit}`}</span></td>
                        <td className="px-10 py-8 text-right">
                          {!isAdmin && materialCategory === 'PACKET' && (
                            <>
                              {!item.is_finished ? (
                                <button 
                                  onClick={() => handleStoreAction(item.id, 'finish')} 
                                  className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all bg-brand-red/10 text-brand-red hover:bg-brand-red hover:text-white"
                                >
                                  Mark as Empty
                                </button>
                              ) : (
                                <span className="text-[10px] font-black text-brand-red uppercase tracking-widest animate-pulse italic">Awaiting Hub Supply</span>
                              )}
                            </>
                          )}
                          {materialCategory === 'MOMO' && <span className="text-[10px] font-black text-brand-brown/20 italic tracking-widest">DEDUCTED PER SALE</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="animate-in slide-in-from-bottom-6 duration-700">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-6 mb-10 p-8 bg-white rounded-[3rem] border border-brand-stone shadow-sm">
            <div className="flex bg-brand-brown/5 p-1 rounded-2xl">
              <button onClick={() => setLedgerType('BUYING')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${ledgerType === 'BUYING' ? 'bg-emerald-600 text-white shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Buying (Purchases)</button>
              <button onClick={() => setLedgerType('ALLOCATION')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${ledgerType === 'ALLOCATION' ? 'bg-peak-amber text-white shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Allocation (Dispatches)</button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => fetchData()} className="bg-brand-stone/30 p-2 rounded-xl hover:bg-brand-yellow transition-colors mr-4" title="Reload History">
                <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
              {(['today', 'yesterday', 'week', 'custom'] as DatePreset[]).map(p => (
                <button key={p} onClick={() => handlePresetChange(p)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${datePreset === p ? 'bg-brand-brown border-brand-brown text-brand-yellow' : 'bg-white border-brand-stone text-brand-brown/40 hover:border-brand-brown/20'}`}>{p}</button>
              ))}
              {datePreset === 'custom' && (
                <div className="flex items-center gap-2 pl-4 border-l-2 border-brand-stone">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-[10px] font-black p-1" />
                  <span className="text-brand-brown/20">-</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-[10px] font-black p-1" />
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-[3rem] shadow-2xl border-4 border-brand-brown overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-brand-brown text-brand-yellow">
                <tr>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:underline" onClick={() => { setSortBy('date'); setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); }}>Date & Time {sortBy === 'date' && (sortOrder === 'desc' ? '▼' : '▲')}</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest">Item Name</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:underline text-center" onClick={() => { setSortBy('quantity'); setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); }}>Quantity {sortBy === 'quantity' && (sortOrder === 'desc' ? '▼' : '▲')}</th>
                  <th className="px-8 py-6 text-[10px) font-black uppercase tracking-widest">{ledgerType === 'BUYING' ? 'Vendor' : 'Store Station'}</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-right cursor-pointer hover:underline" onClick={() => { setSortBy('cost'); setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); }}>{ledgerType === 'BUYING' ? 'Total Cost' : 'Action'} {sortBy === 'cost' && (sortOrder === 'desc' ? '▼' : '▲')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-stone">
                {ledgerType === 'BUYING' ? (
                  sortedProcurements.map((p, idx) => (
                    <tr key={idx} className="hover:bg-brand-cream transition-colors">
                      <td className="px-8 py-6 text-xs font-bold text-brand-brown/40">{p.date ? new Date(p.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}</td>
                      <td className="px-8 py-6 font-black text-brand-brown">{p.item_name}</td>
                      <td className="px-8 py-6 text-center font-black text-brand-brown">{p.quantity} {p.unit}</td>
                      <td className="px-8 py-6 text-[10px] font-black text-brand-red uppercase">{p.vendor || 'Local Market'}</td>
                      <td className="px-8 py-6 text-right font-black text-brand-brown text-lg">₹{(p.total_cost ?? 0).toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  sortedAllocations.map((a, idx) => (
                    <tr key={idx} className="hover:bg-brand-cream transition-colors">
                      <td className="px-8 py-6 text-xs font-bold text-brand-brown/40">{a.date ? new Date(a.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}</td>
                      <td className="px-8 py-6 font-black text-brand-brown">{a.material_name}</td>
                      <td className="px-8 py-6 text-center font-black text-brand-brown">{a.quantity} {a.unit}</td>
                      <td className="px-8 py-6 text-[10px] font-black uppercase text-peak-amber">{a.station_name}</td>
                      <td className="px-8 py-6 text-right font-black text-brand-brown/40 uppercase text-[10px]">Dispatch</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {(ledgerType === 'BUYING' ? sortedProcurements : sortedAllocations).length === 0 && (
              <div className="p-32 text-center text-brand-brown/10 uppercase font-black text-xs tracking-[0.5em]">Zero Ledger Activity Found</div>
            )}
          </div>
        </section>
      )}

      {/* Modals */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[110] p-4">
          <div className="bg-brand-cream rounded-[4rem] p-12 w-full max-w-md border-8 border-brand-yellow shadow-2xl">
            <h3 className="text-3xl font-black mb-8 italic text-brand-brown uppercase italic">Register {materialCategory}</h3>
            <div className="space-y-5">
              <input type="text" placeholder="Item Name" value={newItemName} onChange={e => setNewItemName(e.target.value)} className={inputClasses} />
              <div className="grid grid-cols-2 gap-4">
                <select value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)} className={inputClasses}><option value="pcs">Pieces</option><option value="kg">KG</option><option value="ltr">LTR</option><option value="pkt">Packets</option></select>
                <input type="number" placeholder="Initial Qty" value={qty} onChange={e => setQty(e.target.value)} className={inputClasses} />
              </div>
              <input type="number" placeholder="Purchase Cost (₹)" value={cost} onChange={e => setCost(e.target.value)} className={inputClasses} />
              <button onClick={handleAddNewItem} className="w-full py-5 bg-brand-brown text-brand-yellow rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-transform">Add to Hub Database</button>
              <button onClick={() => setIsAddItemModalOpen(false)} className="w-full py-2 text-brand-brown/40 font-black uppercase text-[11px] tracking-widest">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {isRestockModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[110] p-4">
          <div className="bg-brand-cream rounded-[4rem] p-12 w-full max-w-sm border-8 border-brand-yellow shadow-2xl">
            <h3 className="text-3xl font-black mb-2 italic text-brand-brown uppercase">QUICK <span className="text-brand-yellow">BUY</span></h3>
            <p className="text-[10px] font-bold text-brand-brown/40 uppercase mb-8 tracking-widest">Adding entry for {selectedItem?.name}</p>
            <div className="space-y-5">
              <input type="number" placeholder={`Quantity (${selectedItem?.unit})`} value={qty} onChange={e => setQty(e.target.value)} className={inputClasses} />
              <input type="number" placeholder="Total Bill (₹)" value={cost} onChange={e => setCost(e.target.value)} className={inputClasses} />
              <input type="text" placeholder="Vendor" value={vendor} onChange={e => setVendor(e.target.value)} className={inputClasses} />
              <button onClick={handleCentralPurchase} className="w-full py-5 bg-brand-brown text-brand-yellow rounded-3xl font-black uppercase tracking-widest shadow-2xl">Log Transaction</button>
              <button onClick={() => setIsRestockModalOpen(false)} className="w-full py-2 text-brand-brown/40 font-black uppercase text-[11px] tracking-widest">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isAllocateModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[110] p-4">
          <div className="bg-brand-cream rounded-[4rem] p-12 w-full max-w-sm border-8 border-brand-red shadow-2xl">
            <h3 className="text-3xl font-black mb-8 italic text-brand-brown uppercase underline decoration-brand-red decoration-8 underline-offset-8 italic">SEND <span className="text-brand-red">STOCK</span></h3>
            <div className="space-y-5">
              <select onChange={(e) => setSelectedStation(stations.find(s => s.id === e.target.value) || null)} className={inputClasses}>
                <option value="">Target Store...</option>
                {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input type="number" placeholder={`Quantity (${selectedItem?.unit})`} value={qty} onChange={e => setQty(e.target.value)} className={inputClasses} />
              <button onClick={handleAllocation} className="w-full py-5 bg-brand-red text-white rounded-3xl font-black uppercase tracking-widest shadow-2xl">Dispatch Items</button>
              <button onClick={() => setIsAllocateModalOpen(false)} className="w-full py-2 text-brand-brown/40 font-black uppercase text-[11px] tracking-widest">Cancel Dispatch</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
