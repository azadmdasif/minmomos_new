
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
  voidProcurement,
  voidAllocation,
  getISTDate,
  getISTDateString,
  getISTISOString,
  fetchMenuItems,
  manuallyAdjustStock,
  manuallyAdjustCentralStock,
  fetchManualAdjustments,
  resetAllStockToZero
} from '../utils/storage';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';

interface InventoryProps {
  user: User;
  currentBranch: string | null;
}

type InventoryTab = 'HUB' | 'LEDGER' | 'FINANCE';
type LedgerType = 'BUYING' | 'ALLOCATION' | 'ADJUSTMENT';
type DatePreset = 'today' | 'yesterday' | 'week' | 'last-week' | 'month' | 'last-month' | 'custom';
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
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [storeStock, setStoreStock] = useState<RawMaterial[]>([]);
  const [procurements, setProcurements] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<StockAllocation[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [isTableMissing, setIsTableMissing] = useState(false);
  const pollIntervalRef = useRef<number | null>(null);
  
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isMasterResetModalOpen, setIsMasterResetModalOpen] = useState(false);
  const [masterResetReason, setMasterResetReason] = useState('');
  const [masterResetType, setMasterResetType] = useState<'HUB' | 'BRANCH'>('HUB');

  const [voidReason, setVoidReason] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustValue, setAdjustValue] = useState('');
  const [itemToVoid, setItemToVoid] = useState<{ id: string, type: LedgerType } | null>(null);
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
          const [c, m] = await Promise.all([
            getCentralInventory(),
            fetchMenuItems()
          ]);
          setCentralStock(c);
          if (m.data) setMenuItems(m.data);
        } catch (e: any) {
          if (e.code === '42P01') setIsTableMissing(true);
        }

        // Fetch Procurements
        try {
          const pRes = await fetchProcurements(startDate, endDate);
          if (pRes.error && pRes.error.code !== '42P01') {
            console.error("Procurement fetch failed:", pRes.error);
          }
          setProcurements(pRes.data || []);
        } catch (e: any) {
          if (e.code === '42P01') setIsTableMissing(true);
          else console.error("Procurements error", e);
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
          else console.error("Allocations error", e);
        }

        // Fetch Adjustments
        try {
          const adjRes = await fetchManualAdjustments(startDate, endDate);
          setAdjustments(adjRes.data || []);
        } catch (e: any) {
          console.error("Adjustments error", e);
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
      // This Week: Monday to Sunday
      const day = today.getDay();
      const diff = today.getDate() - (day === 0 ? 6 : day - 1); // 0 is Sunday, 1 is Monday
      start.setDate(diff);
    } else if (preset === 'last-week') {
      // Last Week: Previous Monday to Sunday
      const day = today.getDay();
      const diffToThisMonday = today.getDate() - (day === 0 ? 6 : day - 1);
      start.setDate(diffToThisMonday - 7);
      end.setDate(diffToThisMonday - 1);
    } else if (preset === 'month') {
      start.setDate(1);
    } else if (preset === 'last-month') {
      start.setMonth(today.getMonth() - 1);
      start.setDate(1);
      end.setMonth(today.getMonth());
      end.setDate(0);
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

  const sortedAdjustments = useMemo(() => {
    const list = [...adjustments];
    return list.sort((a, b) => {
      let valA: any = a[sortBy === 'cost' || sortBy === 'quantity' ? 'quantity_change' : sortBy]; 
      let valB: any = b[sortBy === 'cost' || sortBy === 'quantity' ? 'quantity_change' : sortBy];
      if (sortBy === 'date') { valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime(); }
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [adjustments, sortBy, sortOrder]);

  const handleAddNewItem = async () => {
    if (newItemName && newItemUnit) {
      const q = parseFloat(qty) || 0;
      const c = parseFloat(cost) || 0;
      
      if (isNaN(q) || isNaN(c)) {
        alert("Please enter valid numeric values for Quantity and Cost.");
        return;
      }

      try {
        const id = newItemName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        
        // Only log procurement if there's actual stock or cost being added
        if (q > 0 || c > 0) {
          try {
            await logProcurement({
              item_id: id,
              item_name: newItemName,
              quantity: q,
              unit: newItemUnit,
              total_cost: c,
              vendor: 'Initial Stock / Registration',
              date: getISTISOString()
            });
          } catch (logErr: any) {
            console.error("Failed to log initial procurement:", logErr);
            // We might continue if createCentralItem is more important, 
            // but let's fail fast to be safe and inform user
            throw new Error(`Procurement Log Failed: ${logErr.message}`);
          }
        }

        try {
          await createCentralItem(newItemName, newItemUnit, q, c, materialCategory, id);
        } catch (createErr: any) {
          console.error("Failed to create central item:", createErr);
          throw new Error(`Database Entry Failed: ${createErr.message}`);
        }

        setIsAddItemModalOpen(false);
        resetForm();
        await fetchData();
      } catch (e: any) {
        alert("ITEM REGISTRATION FAILED\n\nReason: " + e.message + "\n\nIf the error is 'Failed to fetch', please check your internet connection.");
      }
    } else {
      alert("Please fill Name and Unit.");
    }
  };

  const handleCentralPurchase = async () => {
    if (selectedItem?.id && qty && cost) {
      const qNum = parseFloat(qty);
      const cNum = parseFloat(cost);

      if (isNaN(qNum) || isNaN(cNum)) {
        alert("Please enter valid numeric values.");
        return;
      }

      try {
        // Step 1: Log to procurement ledger
        try {
          await logProcurement({
            item_id: selectedItem.id,
            item_name: selectedItem.name,
            quantity: qNum,
            unit: selectedItem.unit,
            total_cost: cNum,
            vendor: vendor || 'Local Market',
            date: getISTISOString()
          });
        } catch (logErr: any) {
          console.error("LogProcurement failed:", logErr);
          throw new Error(`Step 1 (Ledger Log) Failed: ${logErr.message}`);
        }

        // Step 2: Update central inventory
        try {
          await recordCentralPurchase(selectedItem.id, qNum, cNum);
        } catch (recErr: any) {
          console.error("recordCentralPurchase failed:", recErr);
          throw new Error(`Step 2 (Stock Update) Failed: ${recErr.message}`);
        }
        
        setIsRestockModalOpen(false);
        resetForm();
        await fetchData();
      } catch (e: any) {
        alert("STOCK ADDITION FAILED\n\n" + e.message + "\n\nTry refreshing the page if the issue persists.");
      }
    } else {
      alert("Please fill all required fields (Qty and Cost).");
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

  const handleVoidTransaction = async () => {
    if (!itemToVoid || !voidReason) {
      alert("Please provide a reason for voiding.");
      return;
    }
    try {
      if (itemToVoid.type === 'BUYING') {
        await voidProcurement(itemToVoid.id, voidReason, user.username);
      } else {
        await voidAllocation(itemToVoid.id, voidReason, user.username);
      }
      setIsVoidModalOpen(false);
      setVoidReason('');
      setItemToVoid(null);
      await fetchData();
    } catch (e: any) {
      alert("Void operation failed: " + e.message);
    }
  };

  const handleManualAdjust = async () => {
    if (!selectedItem || adjustValue === '' || !adjustReason) {
      alert("Please enter a new quantity and a reason.");
      return;
    }
    
    const newVal = parseFloat(adjustValue);
    if (isNaN(newVal)) {
      alert("Please enter a valid number.");
      return;
    }

    try {
      if ('branch_name' in selectedItem) {
        // Station/Branch Adjustment
        await manuallyAdjustStock(
          selectedItem.id, 
          selectedItem.branch_name || user.stationName || 'Main Station', 
          newVal, 
          adjustReason,
          user.username
        );
      } else {
        // Central Hub Adjustment
        await manuallyAdjustCentralStock(
          selectedItem.id,
          newVal,
          adjustReason,
          user.username
        );
      }
      setIsAdjustModalOpen(false);
      setAdjustValue('');
      setAdjustReason('');
      setSelectedItem(null);
      await fetchData();
      alert("Stock adjusted successfully.");
    } catch (e: any) {
      alert("Adjustment failed: " + e.message);
    }
  };

  const handleMasterReset = async () => {
    if (!masterResetReason) {
      alert("Please provide a reason for the master reset.");
      return;
    }

    if (!confirm(`CRITICAL WARNING: This will set EVERY single item in the ${masterResetType === 'HUB' ? 'Central Hub' : selectedStation?.name || 'Store'} to ZERO. This action is logged and cannot be undone via this button. Continue?`)) {
      return;
    }

    setIsLoading(true);
    try {
      await resetAllStockToZero(
        masterResetType,
        masterResetReason,
        user.username,
        masterResetType === 'BRANCH' ? selectedStation?.name : undefined
      );
      setIsMasterResetModalOpen(false);
      setMasterResetReason('');
      await fetchData();
      alert("MASTER RESET SUCCESSFUL: All targeted stock levels are now zero.");
    } catch (e: any) {
      alert("Master Reset Failed: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setQty('');
    setCost('');
    setVendor('');
    setNewItemName('');
    setNewItemUnit(materialCategory === 'MOMO' ? 'pcs' : materialCategory === 'PACKET' ? 'pkt' : 'kg');
    setSelectedItem(null);
  };

  const financialData = useMemo(() => {
    if (activeTab !== 'FINANCE') return null;

    const totalSpend = procurements.reduce((sum, p) => sum + (p.total_cost || 0), 0);
    
    // Category Breakdown
    const categoryMap: { [key: string]: number } = {};
    procurements.forEach(p => {
      const centralItem = centralStock.find(c => c.id === p.item_id);
      const cat = centralItem?.category || 'Uncategorized';
      categoryMap[cat] = (categoryMap[cat] || 0) + (p.total_cost || 0);
    });
    
    const categoryData = Object.entries(categoryMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Item Breakdown
    const itemMap: { [key: string]: { name: string, category: string, total: number, qty: number, unit: string } } = {};
    procurements.forEach(p => {
      if (!itemMap[p.item_name]) {
        const centralItem = centralStock.find(c => c.id === p.item_id);
        itemMap[p.item_name] = { 
          name: p.item_name, 
          category: centralItem?.category || 'Uncategorized', 
          total: 0, 
          qty: 0, 
          unit: p.unit 
        };
      }
      itemMap[p.item_name].total += (p.total_cost || 0);
      itemMap[p.item_name].qty += (p.quantity || 0);
    });

    const itemData = Object.values(itemMap).sort((a, b) => b.total - a.total);

    return { totalSpend, categoryData, itemData };
  }, [procurements, activeTab, centralStock]);

  const handleExportFinance = () => {
    if (!financialData) return;
    
    let csv = 'Date,Item Name,Category,Quantity,Unit,Total Spend (INR),Vendor\n';
    procurements.forEach(p => {
      csv += `${p.date},${p.item_name},${p.item_info?.category || 'Uncategorized'},${p.quantity},${p.unit},${p.total_cost},${p.vendor || 'Local Market'}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-spend-${startDate}-to-${endDate}.csv`;
    a.click();
  };

  const COLORS = ['#5D4037', '#D84315', '#FF8F00', '#2E7D32', '#1565C0', '#4527A0', '#C62828'];

  if (isTableMissing) {
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center text-center bg-brand-cream overflow-y-auto no-scrollbar">
        <div className="max-w-4xl bg-white p-12 rounded-[3rem] shadow-2xl border-4 border-brand-red">
          <h2 className="text-4xl font-black text-brand-brown mb-4 uppercase italic">Database <span className="text-brand-red">Update Required</span></h2>
          <p className="text-brand-brown/60 mb-6 font-bold uppercase tracking-widest text-xs">Run this SQL in Supabase Editor to support the new Allocation Ledger:</p>
          <div className="text-left bg-slate-900 p-8 rounded-3xl mb-8 overflow-x-auto border-4 border-brand-stone">
            <pre className="text-emerald-400 text-[10px] md:text-[11px] font-mono leading-relaxed">
{`-- MASTER INVENTORY SYNC SCRIPT
-- Run this in Supabase SQL Editor if you see errors or missing tables.

-- 1. Base Tables
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'MOMO',
  current_stock NUMERIC DEFAULT 0,
  reorder_level NUMERIC DEFAULT 10,
  last_purchase_date TIMESTAMP WITH TIME ZONE,
  last_purchase_cost NUMERIC,
  is_finished BOOLEAN DEFAULT false,
  request_pending BOOLEAN DEFAULT false,
  PRIMARY KEY (id, branch_name)
);

CREATE TABLE IF NOT EXISTS central_inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'MOMO',
  current_stock NUMERIC DEFAULT 0,
  last_purchase_cost NUMERIC DEFAULT 0,
  last_purchase_date TIMESTAMPTZ DEFAULT NOW(),
  is_finished BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id TEXT NOT NULL,
  item_name TEXT,
  branch_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  quantity_change NUMERIC NOT NULL,
  cost NUMERIC,
  performed_by TEXT,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id TEXT,
  item_name TEXT,
  quantity NUMERIC,
  unit TEXT,
  total_cost NUMERIC,
  vendor TEXT,
  date TIMESTAMPTZ DEFAULT NOW(),
  is_voided BOOLEAN DEFAULT false,
  void_reason TEXT
);

CREATE TABLE IF NOT EXISTS stock_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id TEXT NOT NULL,
  material_name TEXT NOT NULL,
  station_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  is_voided BOOLEAN DEFAULT false,
  void_reason TEXT
);

-- 2. Schema Evolution
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_logs' AND column_name='performed_by') THEN
        ALTER TABLE inventory_logs ADD COLUMN performed_by TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_logs' AND column_name='item_name') THEN
        ALTER TABLE inventory_logs ADD COLUMN item_name TEXT;
    END IF;
END $$;

-- 3. Security
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE central_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Inventory" ON inventory;
DROP POLICY IF EXISTS "Public Central" ON central_inventory;
DROP POLICY IF EXISTS "Public Logs" ON inventory_logs;
DROP POLICY IF EXISTS "Public Proc" ON procurements;
DROP POLICY IF EXISTS "Public Alloc" ON stock_allocations;

CREATE POLICY "Public Inventory" ON inventory FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Central" ON central_inventory FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Logs" ON inventory_logs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Proc" ON procurements FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Alloc" ON stock_allocations FOR ALL TO anon USING (true) WITH CHECK (true);

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
        
        <div className="flex flex-wrap gap-4">
          {isAdmin && (
            <div className="bg-white p-1 rounded-2xl border border-brand-stone flex shadow-sm flex-wrap items-center">
              <button onClick={() => setActiveTab('HUB')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'HUB' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Active Stock</button>
              <button onClick={() => setActiveTab('LEDGER')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LEDGER' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Transaction Ledger</button>
              <button onClick={() => setActiveTab('FINANCE')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'FINANCE' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Financial View</button>
              
              <div className="h-6 w-[2px] bg-brand-stone mx-2 hidden md:block"></div>
              
              <button 
                onClick={() => { setMasterResetType('HUB'); setIsMasterResetModalOpen(true); }}
                className="px-6 py-3 text-brand-red hover:bg-red-50 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
              >
                Reset Hub to Zero
              </button>
            </div>
          )}
          {isAdmin && (activeTab === 'HUB' || activeTab === 'FINANCE') && (
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
                    {centralStock.filter(i => i.category === materialCategory).map(item => {
                      const linkedItems = menuItems.filter(mi => {
                        const recipe = mi.recipe || {};
                        const hasInMainRecipe = Object.values(recipe).some((r: any) => r.materialId === item.id);
                        const hasInSizeRecipes = mi.sizeRecipes ? Object.values(mi.sizeRecipes).some((sr: any) => 
                          sr && typeof sr === 'object' && Object.values(sr).some((r: any) => r && (r as any).materialId === item.id)
                        ) : false;
                        return hasInMainRecipe || hasInSizeRecipes;
                      });

                      return (
                        <div key={item.id} className={`bg-white p-8 rounded-[2.5rem] shadow-sm border-2 border-brand-stone group transition-all flex flex-col ${item.is_finished ? 'bg-red-50 border-brand-red/50' : 'hover:border-brand-brown shadow-lg'}`}>
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h4 className="text-lg font-black text-brand-brown line-clamp-1">{item.name}</h4>
                              <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${item.is_finished ? 'text-brand-red' : 'text-brand-brown/40'}`}>HUB: {item.current_stock.toFixed(2)} {item.unit}</p>
                            </div>
                            <button onClick={() => { setSelectedItem(item); setIsRestockModalOpen(true); }} className="p-3 bg-brand-stone/30 rounded-xl hover:bg-brand-yellow transition-colors group-hover:bg-brand-yellow shadow-sm flex-shrink-0">
                              <svg className="w-5 h-5 text-brand-brown" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                            </button>
                          </div>

                          {linkedItems.length > 0 && (
                            <div className="mb-6">
                              <p className="text-[8px] font-black text-brand-brown/30 uppercase tracking-widest mb-2 flex items-center gap-1">
                                <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3L4 9v12h16V9l-8-6zm0 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
                                Used in Recipes
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {linkedItems.slice(0, 3).map(mi => (
                                  <span key={mi.id} className="px-2 py-0.5 bg-brand-stone/40 text-brand-brown/60 text-[7px] font-black rounded-md uppercase whitespace-nowrap">
                                    {mi.name}
                                  </span>
                                ))}
                                {linkedItems.length > 3 && (
                                  <span className="px-2 py-0.5 bg-brand-stone/20 text-brand-brown/30 text-[7px] font-black rounded-md uppercase">
                                    +{linkedItems.length - 3} More
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="mt-auto grid grid-cols-1 gap-3">
                            <div className="grid grid-cols-2 gap-2">
                              {materialCategory !== 'INGREDIENT' ? (
                                <button onClick={() => { setSelectedItem(item); setIsAllocateModalOpen(true); }} className="w-full py-4 bg-brand-brown text-brand-yellow rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">Dispatch</button>
                              ) : (
                                <button onClick={() => { markCentralFinished(item.id, !item.is_finished); fetchData(); }} className={`full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg ${item.is_finished ? 'bg-brand-brown text-brand-yellow' : 'bg-brand-red text-white'}`}>{item.is_finished ? 'Receive' : 'Finish'}</button>
                              )}
                              <button 
                                onClick={() => { setSelectedItem(item); setAdjustValue(item.current_stock.toString()); setIsAdjustModalOpen(true); }}
                                className="w-full py-4 bg-brand-stone text-brand-brown rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all border border-brand-brown/10"
                              >
                                Adjust
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                <div className="flex items-center gap-4">
                  {isAdmin && (
                    <>
                      <button 
                        onClick={() => { 
                          if (!selectedStation) { alert("Please select a branch first."); return; }
                          setMasterResetType('BRANCH'); 
                          setIsMasterResetModalOpen(true); 
                        }}
                        className="bg-brand-red/10 text-brand-red border border-brand-red/20 px-6 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-brand-red hover:text-white transition-all shadow-sm"
                      >
                        Reset Branch to Zero
                      </button>
                      <select onChange={(e) => setSelectedStation(stations.find(s => s.id === e.target.value) || null)} className="bg-white border-4 border-brand-brown p-4 rounded-2xl text-[10px] font-black uppercase text-brand-brown shadow-xl outline-none">
                        <option value="">Select Branch Station...</option>
                        {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </>
                  )}
                </div>
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
                          <div className="flex justify-end gap-2">
                            {(isAdmin || user.role === 'STORE_MANAGER') && (
                              <button 
                                onClick={() => { setSelectedItem(item); setAdjustValue(item.current_stock.toString()); setIsAdjustModalOpen(true); }}
                                className="px-4 py-2 bg-brand-brown text-brand-yellow rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-sm"
                              >
                                Set Stock
                              </button>
                            )}
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
                            {materialCategory === 'MOMO' && !isAdmin && user.role !== 'STORE_MANAGER' && <span className="text-[10px] font-black text-brand-brown/20 italic tracking-widest">DEDUCTED PER SALE</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : activeTab === 'LEDGER' ? (
        <section className="animate-in slide-in-from-bottom-6 duration-700">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-6 mb-10 p-8 bg-white rounded-[3rem] border border-brand-stone shadow-sm">
            <div className="flex bg-brand-brown/5 p-1 rounded-2xl flex-wrap">
              <button onClick={() => setLedgerType('BUYING')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${ledgerType === 'BUYING' ? 'bg-emerald-600 text-white shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Buying (Purchases)</button>
              <button onClick={() => setLedgerType('ALLOCATION')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${ledgerType === 'ALLOCATION' ? 'bg-peak-amber text-white shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Allocation (Dispatches)</button>
              <button onClick={() => setLedgerType('ADJUSTMENT')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${ledgerType === 'ADJUSTMENT' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Adjustments (Manual)</button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => fetchData()} className="bg-brand-stone/30 p-2 rounded-xl hover:bg-brand-yellow transition-colors mr-4" title="Reload History">
                <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
              {(['today', 'yesterday', 'week', 'last-week', 'month', 'last-month', 'custom'] as DatePreset[]).map(p => (
                <button key={p} onClick={() => handlePresetChange(p)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${datePreset === p ? 'bg-brand-brown border-brand-brown text-brand-yellow' : 'bg-white border-brand-stone text-brand-brown/40 hover:border-brand-brown/20'}`}>{p === 'week' ? 'this week' : p.replace('-', ' ')}</button>
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
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-center" onClick={() => { setSortBy('quantity'); setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); }}>Quantity {sortBy === 'quantity' && (sortOrder === 'desc' ? '▼' : '▲')}</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest">{ledgerType === 'BUYING' ? 'Vendor' : ledgerType === 'ALLOCATION' ? 'Store Station' : 'Branch'}</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-right cursor-pointer hover:underline" onClick={() => { setSortBy('cost'); setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); }}>{ledgerType === 'BUYING' ? 'Total Cost' : ledgerType === 'ALLOCATION' ? 'Action' : 'Reason'} {sortBy === 'cost' && (sortOrder === 'desc' ? '▼' : '▲')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-stone">
                {ledgerType === 'BUYING' ? (
                  sortedProcurements.map((p, idx) => (
                    <tr key={idx} className={`hover:bg-brand-cream transition-colors ${p.is_voided ? 'bg-red-50/50 grayscale-[0.5]' : ''}`}>
                      <td className="px-8 py-6 text-xs font-bold text-brand-brown/40">
                        {p.date ? new Date(p.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                        {p.is_voided && <span className="block text-[8px] text-brand-red font-black uppercase mt-1">Voided</span>}
                      </td>
                      <td className="px-8 py-6">
                        <p className={`font-black ${p.is_voided ? 'text-brand-brown/40 line-through' : 'text-brand-brown'}`}>{p.item_name}</p>
                        {p.is_voided && p.void_reason && <p className="text-[9px] font-bold text-brand-red mt-1 italic">Reason: {p.void_reason}</p>}
                      </td>
                      <td className={`px-8 py-6 text-center font-black ${p.is_voided ? 'text-brand-brown/40' : 'text-brand-brown'}`}>{p.quantity} {p.unit}</td>
                      <td className={`px-8 py-6 text-[10px] font-black uppercase ${p.is_voided ? 'text-brand-red/40' : 'text-brand-red'}`}>{p.vendor || 'Local Market'}</td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex flex-col items-end">
                          <span className={`font-black text-lg ${p.is_voided ? 'text-brand-brown/20 line-through' : 'text-brand-brown'}`}>₹{(p.total_cost ?? 0).toLocaleString()}</span>
                          {!p.is_voided && (
                            <button 
                              onClick={() => { setItemToVoid({ id: p.id, type: 'BUYING' }); setIsVoidModalOpen(true); }}
                              className="text-[9px] font-black text-brand-red/40 uppercase hover:text-brand-red mt-1"
                            >
                              Void Transaction
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : ledgerType === 'ALLOCATION' ? (
                  sortedAllocations.map((a, idx) => (
                    <tr key={idx} className={`hover:bg-brand-cream transition-colors ${a.is_voided ? 'bg-red-50/50 grayscale-[0.5]' : ''}`}>
                      <td className="px-8 py-6 text-xs font-bold text-brand-brown/40">
                        {a.date ? new Date(a.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                        {a.is_voided && <span className="block text-[8px] text-brand-red font-black uppercase mt-1">Voided</span>}
                      </td>
                      <td className="px-8 py-6">
                        <p className={`font-black ${a.is_voided ? 'text-brand-brown/40 line-through' : 'text-brand-brown'}`}>{a.material_name}</p>
                        {a.is_voided && a.void_reason && <p className="text-[9px] font-bold text-brand-red mt-1 italic">Reason: {a.void_reason}</p>}
                      </td>
                      <td className={`px-8 py-6 text-center font-black ${a.is_voided ? 'text-brand-brown/40' : 'text-brand-brown'}`}>{a.quantity} {a.unit}</td>
                      <td className={`px-8 py-6 text-[10px] font-black uppercase ${a.is_voided ? 'text-peak-amber/40' : 'text-peak-amber'}`}>{a.station_name}</td>
                      <td className="px-8 py-6 text-right">
                        {!a.is_voided ? (
                          <button 
                            onClick={() => { setItemToVoid({ id: a.id, type: 'ALLOCATION' }); setIsVoidModalOpen(true); }}
                            className="text-[9px] font-black text-brand-red/40 uppercase hover:text-brand-red"
                          >
                            Void Dispatch
                          </button>
                        ) : (
                          <span className="text-[9px] font-black text-brand-brown/20 uppercase">Returned to Hub</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  sortedAdjustments.map((adj, idx) => (
                    <tr key={idx} className="hover:bg-brand-cream transition-colors">
                      <td className="px-8 py-6 text-xs font-bold text-brand-brown/40">
                        {adj.date ? new Date(adj.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                      </td>
                      <td className="px-8 py-6">
                        <p className="font-black text-brand-brown">{adj.item_name || adj.inventory_id}</p>
                        <p className="text-[8px] font-black text-brand-brown/40 uppercase">By: {adj.performed_by || 'Unknown'}</p>
                      </td>
                      <td className="px-8 py-6 text-center font-black">
                        <span className={adj.quantity_change > 0 ? 'text-mountain-green' : 'text-brand-red'}>
                          {adj.quantity_change > 0 ? '+' : ''}{adj.quantity_change}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-[10px] font-black uppercase text-brand-brown/60">{adj.branch_name}</td>
                      <td className="px-8 py-6 text-right">
                         <p className="text-[10px] font-bold text-brand-brown italic leading-tight max-w-[150px] ml-auto">{adj.reason}</p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {(ledgerType === 'BUYING' ? sortedProcurements : ledgerType === 'ALLOCATION' ? sortedAllocations : sortedAdjustments).length === 0 && (
              <div className="p-32 text-center text-brand-brown/10 uppercase font-black text-xs tracking-[0.5em]">Zero Ledger Activity Found</div>
            )}
          </div>
        </section>
      ) : activeTab === 'FINANCE' ? (
        <section className="animate-in slide-in-from-bottom-6 duration-700">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-6 mb-10 p-8 bg-white rounded-[3rem] border border-brand-stone shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              {(['today', 'yesterday', 'week', 'last-week', 'month', 'last-month', 'custom'] as DatePreset[]).map(p => (
                <button key={p} onClick={() => handlePresetChange(p)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${datePreset === p ? 'bg-brand-brown border-brand-brown text-brand-yellow' : 'bg-white border-brand-stone text-brand-brown/40 hover:border-brand-brown/20'}`}>{p === 'week' ? 'this week' : p.replace('-', ' ')}</button>
              ))}
              {datePreset === 'custom' && (
                <div className="flex items-center gap-2 pl-4 border-l-2 border-brand-stone">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-[10px] font-black p-1" />
                  <span className="text-brand-brown/20">-</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-[10px] font-black p-1" />
                </div>
              )}
            </div>
            <button onClick={handleExportFinance} className="bg-emerald-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:scale-105 transition-transform flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Export CSV Report
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
            <div className="lg:col-span-1 bg-white p-8 rounded-[2.5rem] shadow-xl border border-brand-stone text-center md:text-left">
              <p className="text-[10px] font-black text-brand-brown/40 uppercase tracking-widest mb-2">Total Spend</p>
              <h4 className="text-4xl font-black text-brand-brown">₹{financialData?.totalSpend.toLocaleString()}</h4>
              <p className="text-[10px] font-bold text-mountain-green uppercase mt-4">Selected Period</p>
            </div>
            
            <div className="lg:col-span-3 bg-white p-8 rounded-[2.5rem] shadow-xl border border-brand-stone flex flex-col md:flex-row gap-8">
              <div className="flex-1 min-h-[300px]">
                <p className="text-[10px] font-black text-brand-brown/40 uppercase tracking-widest mb-6 text-center">Spend by Category</p>
                <div className="h-full w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={financialData?.categoryData || []}
                        cx="50%"
                        cy="45%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {(financialData?.categoryData || []).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any) => `₹${Number(value || 0).toLocaleString()}`}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '20px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className="flex-1 min-h-[300px]">
                <p className="text-[10px] font-black text-brand-brown/40 uppercase tracking-widest mb-6 text-center">Top Items (Investment)</p>
                <div className="h-full w-full">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart 
                      data={(financialData?.itemData || []).slice(0, 5)}
                      margin={{ top: 10, right: 10, left: 0, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fontWeight: 800, fill: '#5D4037' }}
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis hide />
                      <Tooltip 
                        cursor={{ fill: 'rgba(93, 64, 55, 0.05)' }}
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any) => `₹${Number(value || 0).toLocaleString()}`}
                      />
                      <Bar dataKey="total" fill="#5D4037" radius={[8, 8, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[3rem] shadow-2xl border-4 border-brand-brown overflow-hidden">
            <div className="px-10 py-8 bg-brand-brown flex justify-between items-center">
              <h4 className="text-xl font-black text-brand-yellow italic uppercase">Cost Breakdown</h4>
            </div>
            <table className="w-full">
              <thead className="bg-brand-brown/95 text-brand-yellow/80 border-t border-brand-yellow/10">
                <tr>
                  <th className="px-10 py-6 text-[10px] font-black uppercase text-left tracking-widest">Material Name</th>
                  <th className="px-10 py-6 text-[10px] font-black uppercase text-center tracking-widest">Category</th>
                  <th className="px-10 py-6 text-[10px] font-black uppercase text-center tracking-widest">Qty</th>
                  <th className="px-10 py-6 text-[10px] font-black uppercase text-right tracking-widest">Total Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-stone">
                {financialData?.itemData.map((item, idx) => (
                  <tr key={idx} className="hover:bg-brand-cream transition-colors">
                    <td className="px-10 py-6 font-black text-brand-brown">{item.name}</td>
                    <td className="px-10 py-6 text-center"><span className="px-3 py-1 bg-brand-brown/5 rounded-full text-[9px] font-black text-brand-brown/40 uppercase">{item.category}</span></td>
                    <td className="px-10 py-6 text-center font-black text-brand-brown/60 text-xs">{item.qty.toFixed(2)} {item.unit}</td>
                    <td className="px-10 py-6 text-right font-black text-brand-brown">₹{item.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

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

      {isVoidModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[120] p-4">
          <div className="bg-brand-cream rounded-[4rem] p-12 w-full max-w-md border-8 border-brand-red shadow-2xl">
            <h3 className="text-3xl font-black mb-2 italic text-brand-brown uppercase italic">Void <span className="text-brand-red">Transaction</span></h3>
            <p className="text-[10px] font-black text-brand-brown/40 uppercase mb-8 tracking-widest">This will revert the stock and financial effect.</p>
            <div className="space-y-5">
              <textarea 
                placeholder="Reason for voiding (Required)" 
                value={voidReason} 
                onChange={e => setVoidReason(e.target.value)} 
                className={`${inputClasses} min-h-[100px] resize-none`}
              />
              <button 
                onClick={handleVoidTransaction} 
                className="w-full py-5 bg-brand-red text-white rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-transform"
              >
                Confirm Void
              </button>
              <button onClick={() => { setIsVoidModalOpen(false); setItemToVoid(null); setVoidReason(''); }} className="w-full py-2 text-brand-brown/40 font-black uppercase text-[11px] tracking-widest">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isAdjustModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[120] p-4">
          <div className="bg-brand-cream rounded-[4rem] p-12 w-full max-w-md border-8 border-brand-yellow shadow-2xl">
            <h3 className="text-3xl font-black mb-2 italic text-brand-brown uppercase italic">Manual <span className="text-brand-yellow">Correction</span></h3>
            <p className="text-[10px] font-black text-brand-brown/40 uppercase mb-8 tracking-widest">Adjust stock level for {selectedItem?.name}</p>
            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">New Quantity ({selectedItem?.unit})</label>
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="Enter new absolute quantity" 
                  value={adjustValue} 
                  onChange={e => setAdjustValue(e.target.value)} 
                  className={inputClasses} 
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Reason for adjustment</label>
                <textarea 
                  placeholder="Explain why this change is needed..." 
                  value={adjustReason} 
                  onChange={e => setAdjustReason(e.target.value)} 
                  className={`${inputClasses} min-h-[100px] resize-none`}
                />
              </div>
              <button 
                onClick={handleManualAdjust} 
                className="w-full py-5 bg-brand-brown text-brand-yellow rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-transform"
              >
                Apply New Stock Level
              </button>
              <button onClick={() => { setIsAdjustModalOpen(false); setSelectedItem(null); setAdjustReason(''); setAdjustValue(''); }} className="w-full py-2 text-brand-brown/40 font-black uppercase text-[11px] tracking-widest text-center">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isMasterResetModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[130] p-4">
          <div className="bg-brand-cream rounded-[4rem] p-12 w-full max-w-md border-8 border-brand-red shadow-2xl">
            <h3 className="text-3xl font-black mb-2 italic text-brand-brown uppercase italic underline decoration-brand-red decoration-8 underline-offset-8">MASTER <span className="text-brand-red">RESET</span></h3>
            <p className="text-[10px] font-black text-brand-brown/40 uppercase mb-8 tracking-widest leading-relaxed">
              Target: <span className="text-brand-red font-black">{masterResetType === 'HUB' ? 'CENTRAL HUB' : selectedStation?.name}</span><br />
              This will set all stock items in this location to zero.
            </p>
            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Mandatory Reason</label>
                <textarea 
                  placeholder="Why are you resetting the entire stock to zero?" 
                  value={masterResetReason} 
                  onChange={e => setMasterResetReason(e.target.value)} 
                  className={`${inputClasses} min-h-[120px] resize-none border-brand-red/20 focus:ring-brand-red`}
                />
              </div>
              <button 
                onClick={handleMasterReset} 
                disabled={isLoading}
                className="w-full py-5 bg-brand-red text-white rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                {isLoading ? 'Processing...' : 'Execute Master Reset'}
              </button>
              <button onClick={() => { setIsMasterResetModalOpen(false); setMasterResetReason(''); }} className="w-full py-2 text-brand-brown/40 font-black uppercase text-[11px] tracking-widest text-center">Abort Operation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
