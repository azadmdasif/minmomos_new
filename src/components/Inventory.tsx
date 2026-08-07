
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { RawMaterial, User, CentralMaterial, Station, MaterialCategory, StockAllocation, Vendor, VendorMapping } from '../types';
import { 
  getInventory, 
  getAllInventories,
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
  getProcurementPaymentHistory,
  fetchAllNonVoidedProcurements,
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
  resetAllStockToZero,
  updateProcurementPayment,
  bulkPayProcurements,
  getItemSubcategory,
  updateCentralItem,
  saveItemSubcategory,
  getVendors,
  createVendor,
  deleteVendor,
  updateVendor,
  getVendorMappings,
  mapItemToVendor,
  removeVendorMapping
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
import { ConsumptionReport } from './ConsumptionReport';

interface InventoryProps {
  user: User;
  currentBranch: string | null;
}

type InventoryTab = 'HUB' | 'LEDGER' | 'FINANCE' | 'VENDORS' | 'CONSUMPTION';
type LedgerType = 'BUYING' | 'ALLOCATION' | 'ADJUSTMENT';
type DatePreset = 'today' | 'yesterday' | 'week' | 'last-week' | 'month' | 'last-month' | 'custom';
type VendorDatePreset = 'all' | 'today' | 'yesterday' | 'week' | 'last-week' | 'month' | 'last-month' | 'custom';
type SortBy = 'date' | 'quantity' | 'cost';

interface SubcategoryOption {
  id: string;
  label: string;
  icon: string;
  parentCategory: MaterialCategory;
}

const DEFAULT_SUBCATEGORIES: Record<MaterialCategory, Array<{ id: string, label: string, icon: string }>> = {
  MOMO: [
    { id: 'momo', label: 'Momo', icon: '🥟' },
    { id: 'buns', label: 'Burger Buns', icon: '🍔' },
    { id: 'cola', label: 'Cola', icon: '🥤' },
    { id: 'drinks', label: 'Drinks', icon: '🍹' },
  ],
  PACKET: [
    { id: 'syrups', label: 'Syrups', icon: '🍹' },
    { id: 'sauces', label: 'Sauces', icon: '🥫' },
    { id: 'packaging', label: 'Packaging', icon: '📦' },
    { id: 'oil-butter', label: 'Oil & Butter', icon: '🧈' },
    { id: 'spices', label: 'Spices', icon: '🌶️' },
    { id: 'fries', label: 'Fries', icon: '🍟' },
    { id: 'others', label: 'Others', icon: '🏷️' },
  ],
  INGREDIENT: [
    { id: 'veggies', label: 'Veggies', icon: '🥬' },
    { id: 'others', label: 'Others', icon: '🏷️' },
  ]
};

const VALUATION_COLORS = ['#5D4037', '#D84315', '#FF8F00', '#2E7D32', '#1565C0', '#4527A0', '#C62828'];

const Inventory: React.FC<InventoryProps> = ({ user }) => {
  const isAdmin = user.role === 'ADMIN' || user.role === 'COFOUNDER';
  const [activeTab, setActiveTab] = useState<InventoryTab>('HUB');
  const [materialCategory, setMaterialCategory] = useState<MaterialCategory>('MOMO');
  const [activeSubcategory, setActiveSubcategory] = useState<string>('all');
  
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
  const [allInventories, setAllInventories] = useState<RawMaterial[]>([]);
  const [allNonVoidedProcurements, setAllNonVoidedProcurements] = useState<any[]>([]);
  const [isValuationExpanded, setIsValuationExpanded] = useState<boolean>(true);
  const [procurements, setProcurements] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<StockAllocation[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [isTableMissing, setIsTableMissing] = useState(false);

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
  const [adjustCategoryReason, setAdjustCategoryReason] = useState<'rotten stock' | 'quantity mismatch' | 'others'>('others');
  const [itemToVoid, setItemToVoid] = useState<{ id: string, type: LedgerType } | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [financialPaidFilter, setFinancialPaidFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [ledgerPaidFilter, setLedgerPaidFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [ledgerItemFilter, setLedgerItemFilter] = useState<string>('all');
  const [ledgerVendorFilter, setLedgerVendorFilter] = useState<string>('all');
  const [ledgerSubcategoryFilter, setLedgerSubcategoryFilter] = useState<string>('all');

  // Payment Details & Audit States
  const [selectedProcurementForPayment, setSelectedProcurementForPayment] = useState<any>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paidByInput, setPaidByInput] = useState('');
  const [paymentNotesInput, setPaymentNotesInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [paymentActionReason, setPaymentActionReason] = useState('');
  const [paymentMode, setPaymentMode] = useState<'PAY' | 'EDIT' | 'UNPAY'>('PAY');
  
  // Camera & Bill Image States
  const [capturedBillUrl, setCapturedBillUrl] = useState<string | null>(null);
  const [bulkCapturedBillUrl, setBulkCapturedBillUrl] = useState<string | null>(null);
  const [showLiveCamera, setShowLiveCamera] = useState(false);
  const [isBulkCamera, setIsBulkCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [newItemVendor, setNewItemVendor] = useState('');

  // Bulk Payment States
  const [isBulkPaymentModalOpen, setIsBulkPaymentModalOpen] = useState(false);
  const [bulkPaymentVendorName, setBulkPaymentVendorName] = useState('');
  const [bulkPaymentIds, setBulkPaymentIds] = useState<string[]>([]);
  const [bulkPaymentTotal, setBulkPaymentTotal] = useState(0);
  const [bulkPaymentDate, setBulkPaymentDate] = useState('');
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState('CASH');
  const [bulkPaymentNotes, setBulkPaymentNotes] = useState('');
  const [bulkPaidBy, setBulkPaidBy] = useState('');
  const [bulkPaymentSubcategory, setBulkPaymentSubcategory] = useState<string>('');

  // Checklist Selection for Unpaid Items per Vendor
  const [selectedProcurementIds, setSelectedProcurementIds] = useState<Record<string, string[]>>({});

  // Split Payment input states
  const [singleSplitCash, setSingleSplitCash] = useState<string>('');
  const [singleSplitUpi, setSingleSplitUpi] = useState<string>('');
  const [bulkSplitCash, setBulkSplitCash] = useState<string>('');
  const [bulkSplitUpi, setBulkSplitUpi] = useState<string>('');

  // Fund Source states
  const [singleFundSource, setSingleFundSource] = useState<string>('Revenue');
  const [bulkFundSource, setBulkFundSource] = useState<string>('Revenue');
  
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [vendor, setVendor] = useState('');
  const [transactionDate, setTransactionDate] = useState<string>(getISTDateString());
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('pcs');
  const [newItemSubcategory, setNewItemSubcategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // Vendor states
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorMappings, setVendorMappings] = useState<VendorMapping[]>([]);
  const [isAddVendorModalOpen, setIsAddVendorModalOpen] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [expandedVendorUnpaidId, setExpandedVendorUnpaidId] = useState<string | null>(null);
  const [vendorDatePreset, setVendorDatePreset] = useState<VendorDatePreset>('all');
  const [vendorStartDate, setVendorStartDate] = useState(getISTDateString());
  const [vendorEndDate, setVendorEndDate] = useState(getISTDateString());
  const [vendorProcurements, setVendorProcurements] = useState<any[]>([]);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorContact, setNewVendorContact] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [newVendorAddress, setNewVendorAddress] = useState('');

  // Item to Vendor Mapping search/filters
  const [vendorMappingSearch, setVendorMappingSearch] = useState('');
  const [vendorMappingSubcategoryFilter, setVendorMappingSubcategoryFilter] = useState('all');
  const [bulkVendorId, setBulkVendorId] = useState('');
  const [isBulkMappingInProgress, setIsBulkMappingInProgress] = useState(false);
  const [bulkMappingConfirm, setBulkMappingConfirm] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Active Stock item search state
  const [activeStockSearch, setActiveStockSearch] = useState('');

  // Active Stock item sorting state
  const [stockSortField, setStockSortField] = useState<'none' | 'stock' | 'value'>('none');
  const [stockSortOrder, setStockSortOrder] = useState<'asc' | 'desc'>('desc');

  // Custom Subcategories and Editing States
  const [customSubcategories, setCustomSubcategories] = useState<SubcategoryOption[]>([]);
  const [isCreateSubcategoryModalOpen, setIsCreateSubcategoryModalOpen] = useState(false);
  const [newSubcatName, setNewSubcatName] = useState('');
  const [newSubcatIcon, setNewSubcatIcon] = useState('🏷️');
  const [newSubcatParent, setNewSubcatParent] = useState<MaterialCategory>('MOMO');

  const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CentralMaterial | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemUnit, setEditItemUnit] = useState('');
  const [editItemSubcategory, setEditItemSubcategory] = useState('');
  const [editItemCategory, setEditItemCategory] = useState<MaterialCategory>('MOMO');

  const loadCustomSubcategories = useCallback(() => {
    try {
      const saved = localStorage.getItem('custom_created_subcategories');
      if (saved) {
        setCustomSubcategories(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load custom subcategories:", e);
    }
  }, []);

  const getSubcategoriesForCategory = useCallback((cat: MaterialCategory) => {
    const defaults = DEFAULT_SUBCATEGORIES[cat] || [];
    const custom = customSubcategories.filter(s => s.parentCategory === cat);
    return [...defaults, ...custom];
  }, [customSubcategories]);

  const getSubcategoryMeta = useCallback((subId: string) => {
    for (const cat of Object.keys(DEFAULT_SUBCATEGORIES) as MaterialCategory[]) {
      const found = DEFAULT_SUBCATEGORIES[cat].find(s => s.id === subId);
      if (found) return found;
    }
    const foundCustom = customSubcategories.find(s => s.id === subId);
    if (foundCustom) return { id: foundCustom.id, label: foundCustom.label, icon: foundCustom.icon };
    return { id: subId, label: subId.toUpperCase(), icon: '🏷️' };
  }, [customSubcategories]);

  const estimatedUnitCostMap = useMemo(() => {
    const map: Record<string, number> = {};
    
    // Process procurements in chronological order (or reverse and keep the first one seen)
    // allNonVoidedProcurements are ordered by date descending, so the first entry per item_id we see is the most recent purchase.
    allNonVoidedProcurements.forEach(proc => {
      const itemId = proc.item_id;
      if (!itemId) return;
      if (map[itemId] !== undefined) return;
      
      const qty = parseFloat(proc.quantity) || 0;
      const totalCost = parseFloat(proc.total_cost) || 0;
      if (qty > 0 && totalCost > 0) {
        map[itemId] = totalCost / qty;
      }
    });

    // Fallback to centralStock last_purchase_cost
    centralStock.forEach(item => {
      if (map[item.id] === undefined) {
        map[item.id] = item.last_purchase_cost || 0;
      }
    });

    return map;
  }, [allNonVoidedProcurements, centralStock]);

  const hubStockValuation = useMemo(() => {
    return centralStock.reduce((acc, item) => {
      const cost = estimatedUnitCostMap[item.id] || 0;
      const isActive = (item.current_stock || 0) > 0 && !item.is_finished;
      const value = isActive ? (item.current_stock * cost) : 0;
      return acc + value;
    }, 0);
  }, [centralStock, estimatedUnitCostMap]);

  const storeWiseValuation = useMemo(() => {
    const valuations: Record<string, number> = {
      'Supply Hub (Central)': hubStockValuation
    };
    const targetInventories = isAdmin ? allInventories : storeStock;
    targetInventories.forEach(item => {
      const cost = estimatedUnitCostMap[item.id] || 0;
      const isActive = (item.current_stock || 0) > 0 && !item.is_finished;
      const value = isActive ? (item.current_stock * cost) : 0;
      if (value <= 0) return;
      const storeName = item.branch_name || 'Unknown Store';
      valuations[storeName] = (valuations[storeName] || 0) + value;
    });
    return Object.entries(valuations)
      .map(([store, value]) => ({ store, value }))
      .sort((a, b) => b.value - a.value);
  }, [hubStockValuation, allInventories, storeStock, isAdmin, estimatedUnitCostMap]);

  const subcategoryWiseValuation = useMemo(() => {
    const subcatValues: Record<string, number> = {};
    
    // Central Hub items
    centralStock.forEach(item => {
      const cost = estimatedUnitCostMap[item.id] || 0;
      const isActive = (item.current_stock || 0) > 0 && !item.is_finished;
      const value = isActive ? (item.current_stock * cost) : 0;
      if (value <= 0) return;
      const subId = getItemSubcategory(item.name, item.id, item.category);
      subcatValues[subId] = (subcatValues[subId] || 0) + value;
    });
    
    // Store items
    const targetInventories = isAdmin ? allInventories : storeStock;
    targetInventories.forEach(item => {
      const cost = estimatedUnitCostMap[item.id] || 0;
      const isActive = (item.current_stock || 0) > 0 && !item.is_finished;
      const value = isActive ? (item.current_stock * cost) : 0;
      if (value <= 0) return;
      const subId = getItemSubcategory(item.name, item.id, item.category);
      subcatValues[subId] = (subcatValues[subId] || 0) + value;
    });
    
    return Object.entries(subcatValues)
      .map(([subId, value]) => {
        const meta = getSubcategoryMeta(subId);
        return {
          id: subId,
          label: meta.label,
          icon: meta.icon,
          value
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [centralStock, allInventories, storeStock, isAdmin, estimatedUnitCostMap, getSubcategoryMeta]);

  const totalStockValuation = useMemo(() => {
    const hubTotal = hubStockValuation;
    const targetInventories = isAdmin ? allInventories : storeStock;
    const storeTotal = targetInventories.reduce((acc, item) => {
      const cost = estimatedUnitCostMap[item.id] || 0;
      const isActive = (item.current_stock || 0) > 0 && !item.is_finished;
      const value = isActive ? (item.current_stock * cost) : 0;
      return acc + value;
    }, 0);
    return hubTotal + storeTotal;
  }, [hubStockValuation, allInventories, storeStock, isAdmin, estimatedUnitCostMap]);

  const filteredStoreStock = useMemo(() => {
    const baseList = storeStock.filter(i => {
      if (i.category !== materialCategory) return false;
      if (activeSubcategory !== 'all') {
        if (getItemSubcategory(i.name, i.id, i.category) !== activeSubcategory) return false;
      }
      if (activeStockSearch.trim() !== '') {
        const terms = activeStockSearch.toLowerCase().split(/\s+/).filter(Boolean);
        const nameLower = i.name.toLowerCase();
        const matchesAll = terms.every(term => nameLower.includes(term));
        if (!matchesAll) return false;
      }
      return true;
    });

    if (stockSortField === 'none') {
      return baseList;
    }

    return [...baseList].sort((a, b) => {
      let valA = 0;
      let valB = 0;

      if (stockSortField === 'stock') {
        valA = a.is_finished ? 0 : a.current_stock;
        valB = b.is_finished ? 0 : b.current_stock;
      } else if (stockSortField === 'value') {
        const costA = estimatedUnitCostMap[a.id] || 0;
        const costB = estimatedUnitCostMap[b.id] || 0;
        valA = (!a.is_finished && a.current_stock > 0) ? (a.current_stock * costA) : 0;
        valB = (!b.is_finished && b.current_stock > 0) ? (b.current_stock * costB) : 0;
      }

      if (valA === valB) {
        return a.name.localeCompare(b.name);
      }

      return stockSortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }, [storeStock, materialCategory, activeSubcategory, activeStockSearch, stockSortField, stockSortOrder, estimatedUnitCostMap]);

  const selectedBranchValuation = useMemo(() => {
    return filteredStoreStock.reduce((acc, item) => {
      const cost = estimatedUnitCostMap[item.id] || 0;
      const isActive = (item.current_stock || 0) > 0 && !item.is_finished;
      const value = isActive ? (item.current_stock * cost) : 0;
      return acc + value;
    }, 0);
  }, [filteredStoreStock, estimatedUnitCostMap]);

  useEffect(() => {
    loadCustomSubcategories();
  }, [loadCustomSubcategories]);

  const handleCreateSubcategory = () => {
    if (!newSubcatName.trim()) {
      alert("Please enter a subcategory name.");
      return;
    }
    const slug = newSubcatName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!slug) {
      alert("Please enter a valid subcategory name.");
      return;
    }

    const existing = getSubcategoriesForCategory(newSubcatParent);
    if (existing.some(s => s.id === slug)) {
      alert("A subcategory with this name already exists under this category.");
      return;
    }

    const newSubcat: SubcategoryOption = {
      id: slug,
      label: newSubcatName.trim(),
      icon: newSubcatIcon.trim() || '🏷️',
      parentCategory: newSubcatParent
    };

    try {
      const saved = localStorage.getItem('custom_created_subcategories') || '[]';
      const list = JSON.parse(saved);
      list.push(newSubcat);
      localStorage.setItem('custom_created_subcategories', JSON.stringify(list));
      setCustomSubcategories(list);
      setNewSubcatName('');
      setNewSubcatIcon('🏷️');
      setIsCreateSubcategoryModalOpen(false);
    } catch (e) {
      console.error("Failed to save custom subcategory:", e);
      alert("Failed to save custom subcategory.");
    }
  };

  const handleOpenEditModal = (item: CentralMaterial) => {
    setEditingItem(item);
    setEditItemName(item.name);
    setEditItemUnit(item.unit);
    setEditItemCategory(item.category as MaterialCategory);
    setEditItemSubcategory(getItemSubcategory(item.name, item.id, item.category));
    setIsEditItemModalOpen(true);
  };

  const handleSaveEditItem = async () => {
    if (!editingItem) return;
    if (!editItemName.trim() || !editItemUnit.trim()) {
      alert("Name and unit cannot be empty.");
      return;
    }
    if (!editItemSubcategory) {
      alert("Please select a subcategory.");
      return;
    }

    try {
      setIsLoading(true);
      await updateCentralItem(editingItem.id, editItemName.trim(), editItemUnit.trim(), editItemCategory, editItemSubcategory);
      await saveItemSubcategory(editingItem.id, editItemSubcategory);
      setIsEditItemModalOpen(false);
      setEditingItem(null);
      await fetchData();
      alert("Item updated successfully!");
    } catch (e: any) {
      console.error("Failed to update item:", e);
      alert(`Failed to update item: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      // Fetch central inventory and menu items for ALL users
      try {
        const [c, m, nvp] = await Promise.all([
          getCentralInventory().catch(err => {
            if (err?.code === '42P01') setIsTableMissing(true);
            else console.warn("Failed to fetch central inventory:", err);
            return [];
          }),
          fetchMenuItems().catch(err => {
            console.warn("Failed to fetch menu items:", err);
            return { data: [], error: err };
          }),
          fetchAllNonVoidedProcurements().catch(err => {
            console.warn("Failed to fetch procurements:", err);
            return [];
          })
        ]);
        if (c && c.length > 0) setCentralStock(c);
        if (m && m.data) setMenuItems(m.data);
        if (nvp) setAllNonVoidedProcurements(nvp);
      } catch (e: any) {
        if (e?.code === '42P01') setIsTableMissing(true);
        else console.error("Error fetching central inventory/menu items:", e);
      }

      if (isAdmin) {
        // Fetch Vendors and Mappings
        try {
          const [vList, mList] = await Promise.all([
            getVendors(),
            getVendorMappings()
          ]);
          setVendors(vList || []);
          setVendorMappings(mList || []);
        } catch (vErr) {
          console.error("Failed to load vendors / mappings:", vErr);
        }

        // Fetch Stations
        const s = await getStations();
        setStations(s);

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

        // Fetch Procurements for Vendors Tab using separate range
        try {
          const vStart = vendorDatePreset === 'all' ? '2020-01-01' : vendorStartDate;
          const vEnd = vendorDatePreset === 'all' ? '2030-12-31' : vendorEndDate;
          const vpRes = await fetchProcurements(vStart, vEnd);
          setVendorProcurements(vpRes.data || []);
        } catch (e: any) {
          console.error("Vendor Procurements fetch failed:", e);
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

        // Fetch All Branch Inventories (for valuation)
        try {
          const allInv = await getAllInventories();
          setAllInventories(allInv || []);
        } catch (e) {
          console.error("All inventories fetch failed:", e);
        }

        let currentStation = selectedStation;
        if (!currentStation && s.length > 0) {
          currentStation = s[0];
          setSelectedStation(s[0]);
        }

        if (currentStation) {
          const inv = await getInventory(currentStation.name);
          setStoreStock(inv);
        } else if (user.stationName) {
          const inv = await getInventory(user.stationName);
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
  }, [isAdmin, selectedStation, user.stationName, startDate, endDate, vendorDatePreset, vendorStartDate, vendorEndDate]);

  useEffect(() => {
    // Load once on mount / when filters change. The previous 15s auto-poll re-downloaded the
    // entire inventory + all-time procurements dataset repeatedly and was a major egress source.
    // Refresh is now manual (see the Refresh button in the header) via handleManualRefresh().
    fetchData();
  }, [fetchData]);

  const handleManualRefresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setActiveSubcategory('all');
  }, [materialCategory]);

  useEffect(() => {
    setLedgerVendorFilter('all');
    setLedgerSubcategoryFilter('all');
  }, [ledgerType]);

  useEffect(() => {
    if (isRestockModalOpen && selectedItem) {
      const mapping = vendorMappings.find(m => m.item_id === selectedItem.id);
      if (mapping) {
        const mappedVendor = vendors.find(v => v.id === mapping.vendor_id);
        if (mappedVendor) {
          setVendor(mappedVendor.name);
          return;
        }
      }
      setVendor('');
    }
  }, [isRestockModalOpen, selectedItem, vendorMappings, vendors]);

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

  const handleVendorPresetChange = (preset: VendorDatePreset) => {
    setVendorDatePreset(preset);
    if (preset === 'all') return;
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

    setVendorStartDate(getISTDateString(start));
    setVendorEndDate(getISTDateString(end));
  };

  const availableVendors = useMemo(() => {
    const names = vendors.map(v => v.name);
    return Array.from(new Set(names)).sort();
  }, [vendors]);

  const availableSubcategories = useMemo(() => {
    const subIds = new Set<string>();
    const subList: { id: string; label: string }[] = [];
    
    const subcatLabels: Record<string, string> = {
      momo: 'Momo',
      buns: 'Burger Buns',
      cola: 'Cola',
      drinks: 'Drinks',
      syrups: 'Syrups',
      sauces: 'Sauces',
      packaging: 'Packaging',
      'oil-butter': 'Oil & Butter',
      spices: 'Spices',
      fries: 'Fries',
      veggies: 'Veggies',
      others: 'Others'
    };

    centralStock.forEach(item => {
      const subId = getItemSubcategory(item.name, item.id, item.category);
      if (!subIds.has(subId)) {
        subIds.add(subId);
        subList.push({
          id: subId,
          label: subcatLabels[subId] || subId.toUpperCase()
        });
      }
    });

    return subList.sort((a, b) => a.label.localeCompare(b.label));
  }, [centralStock]);

  const sortedProcurements = useMemo(() => {
    let list = [...procurements];
    if (ledgerPaidFilter === 'paid') {
      list = list.filter(p => p.is_paid !== false);
    } else if (ledgerPaidFilter === 'unpaid') {
      list = list.filter(p => p.is_paid === false);
    }
    if (ledgerItemFilter !== 'all') {
      list = list.filter(p => p.item_id === ledgerItemFilter || p.item_name === ledgerItemFilter);
    }
    if (ledgerVendorFilter !== 'all') {
      list = list.filter(p => {
        const v = p.vendor || 'Local Market';
        return v === ledgerVendorFilter;
      });
    }
    if (ledgerSubcategoryFilter !== 'all') {
      list = list.filter(p => {
        const centralItem = centralStock.find(c => c.id === p.item_id);
        const subId = getItemSubcategory(p.item_name, p.item_id, centralItem?.category);
        return subId === ledgerSubcategoryFilter;
      });
    }
    return list.sort((a, b) => {
      let valA: any = a[sortBy === 'cost' ? 'total_cost' : sortBy];
      let valB: any = b[sortBy === 'cost' ? 'total_cost' : sortBy];
      if (sortBy === 'date') { valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime(); }
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [procurements, sortBy, sortOrder, ledgerPaidFilter, ledgerItemFilter, ledgerVendorFilter, ledgerSubcategoryFilter, centralStock]);

  const sortedAllocations = useMemo(() => {
    let list = [...allocations];
    if (ledgerItemFilter !== 'all') {
      list = list.filter(a => a.material_id === ledgerItemFilter || a.material_name === ledgerItemFilter);
    }
    return list.sort((a, b) => {
      let valA: any = a[sortBy === 'cost' || sortBy === 'quantity' ? 'quantity' : sortBy]; 
      let valB: any = b[sortBy === 'cost' || sortBy === 'quantity' ? 'quantity' : sortBy];
      if (sortBy === 'date') { valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime(); }
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [allocations, sortBy, sortOrder, ledgerItemFilter]);

  const sortedAdjustments = useMemo(() => {
    let list = [...adjustments];
    if (ledgerItemFilter !== 'all') {
      list = list.filter(adj => adj.inventory_id === ledgerItemFilter || adj.item_name === ledgerItemFilter);
    }
    return list.sort((a, b) => {
      let valA: any = a[sortBy === 'cost' || sortBy === 'quantity' ? 'quantity_change' : sortBy]; 
      let valB: any = b[sortBy === 'cost' || sortBy === 'quantity' ? 'quantity_change' : sortBy];
      if (sortBy === 'date') { valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime(); }
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [adjustments, sortBy, sortOrder, ledgerItemFilter]);

  const handleAddNewItem = async () => {
    if (newItemName && newItemUnit) {
      if (!newItemSubcategory) {
        alert("Please select a subcategory for the new item.");
        return;
      }

      const q = 0;
      const c = 0;

      try {
        const id = newItemName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        
        // 1. Create the central item first so it exists in central_inventory
        try {
          await createCentralItem(newItemName, newItemUnit, q, c, materialCategory, id, newItemSubcategory);
          await saveItemSubcategory(id, newItemSubcategory);
          
          if (newItemVendor) {
            await mapItemToVendor(id, newItemVendor);
          }
        } catch (createErr: any) {
          console.error("Failed to create central item:", createErr);
          throw new Error(`Database Entry Failed: ${createErr.message}`);
        }

        // 2. Only log procurement if there's actual stock or cost being added, and now the FK is satisfied!
        if (q > 0 || c > 0) {
          const selectedVendorObj = vendors.find(v => v.id === newItemVendor);
          const vendorLabel = selectedVendorObj ? selectedVendorObj.name : 'Initial Stock / Registration';
          const selectedDateISO = transactionDate 
            ? new Date(`${transactionDate}T12:00:00`).toISOString() 
            : getISTISOString();
          
          try {
            await logProcurement({
              item_id: id,
              item_name: newItemName,
              quantity: q,
              unit: newItemUnit,
              total_cost: c,
              vendor: vendorLabel,
              date: selectedDateISO,
              is_paid: false
            });
          } catch (logErr: any) {
            console.error("Failed to log initial procurement:", logErr);
            throw new Error(`Procurement Log Failed: ${logErr.message}`);
          }
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
        const selectedDateISO = transactionDate 
          ? new Date(`${transactionDate}T12:00:00`).toISOString() 
          : getISTISOString();

        // Step 1: Log to procurement ledger
        try {
          await logProcurement({
            item_id: selectedItem.id,
            item_name: selectedItem.name,
            quantity: qNum,
            unit: selectedItem.unit,
            total_cost: cNum,
            vendor: vendor || 'Local Market',
            date: selectedDateISO,
            is_paid: false
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

  const handleAddVendor = async () => {
    if (!newVendorName.trim()) {
      alert("Please enter a vendor name.");
      return;
    }
    try {
      const vendorPayload = {
        name: newVendorName.trim(),
        contact_person: newVendorContact.trim() || undefined,
        phone: newVendorPhone.trim() || undefined,
        email: newVendorEmail.trim() || undefined,
        address: newVendorAddress.trim() || undefined
      };

      if (editingVendorId) {
        await updateVendor(editingVendorId, vendorPayload);
      } else {
        await createVendor(vendorPayload);
      }
      setIsAddVendorModalOpen(false);
      setEditingVendorId(null);
      // Clear fields
      setNewVendorName('');
      setNewVendorContact('');
      setNewVendorPhone('');
      setNewVendorEmail('');
      setNewVendorAddress('');
      await fetchData();
    } catch (err: any) {
      alert(`Failed to ${editingVendorId ? 'update' : 'register'} vendor: ` + err.message);
    }
  };

  const openAddVendorModal = () => {
    setEditingVendorId(null);
    setNewVendorName('');
    setNewVendorContact('');
    setNewVendorPhone('');
    setNewVendorEmail('');
    setNewVendorAddress('');
    setIsAddVendorModalOpen(true);
  };

  const openEditVendorModal = (v: Vendor) => {
    setEditingVendorId(v.id);
    setNewVendorName(v.name);
    setNewVendorContact(v.contact_person || '');
    setNewVendorPhone(v.phone || '');
    setNewVendorEmail(v.email || '');
    setNewVendorAddress(v.address || '');
    setIsAddVendorModalOpen(true);
  };

  const handleDeleteVendor = async (id: string) => {
    if (confirm("Are you sure you want to delete this vendor? This will also unmap any items mapped to them.")) {
      try {
        await deleteVendor(id);
        await fetchData();
      } catch (err: any) {
        alert("Failed to delete vendor: " + err.message);
      }
    }
  };

  const handleMapItem = async (itemId: string, vendorId: string) => {
    try {
      if (!vendorId) {
        await removeVendorMapping(itemId);
      } else {
        await mapItemToVendor(itemId, vendorId);
      }
      await fetchData();
    } catch (err: any) {
      alert("Failed to update vendor mapping: " + err.message);
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

  const openBulkPaymentModal = (vendorName: string, unpaidProcs: any[], subcategory?: string) => {
    setBulkPaymentVendorName(vendorName);
    const ids = unpaidProcs.map(p => p.id);
    setBulkPaymentIds(ids);
    const total = unpaidProcs.reduce((acc, p) => acc + (p.total_cost || 0), 0);
    setBulkPaymentTotal(total);
    setBulkPaymentSubcategory(subcategory || '');
    
    let defaultDate = '';
    try {
      const tzoffset = (new Date()).getTimezoneOffset() * 60000;
      defaultDate = (new Date(Date.now() - tzoffset)).toISOString().substring(0, 16);
    } catch (e) {
      defaultDate = getISTISOString().substring(0, 16);
    }
    
    setBulkPaymentDate(defaultDate);
    setBulkPaidBy(user.username);
    setBulkPaymentNotes('');
    setBulkPaymentMethod('CASH');
    setBulkSplitCash((total / 2).toFixed(2));
    setBulkSplitUpi((total / 2).toFixed(2));
    setBulkFundSource('Revenue');
    setIsBulkPaymentModalOpen(true);
  };

  const handleSaveBulkPayment = async () => {
    if (bulkPaymentIds.length === 0) return;
    try {
      let cashAmt: number | undefined;
      let upiAmt: number | undefined;
      let nextPaymentNotes = bulkPaymentNotes.trim() || null;

      if (bulkPaymentMethod === 'SPLIT') {
        const cVal = parseFloat(bulkSplitCash) || 0;
        const uVal = parseFloat(bulkSplitUpi) || 0;
        if (Math.abs((cVal + uVal) - bulkPaymentTotal) > 0.05) {
          alert(`The sum of Cash (₹${cVal}) and UPI (₹${uVal}) must equal the total amount (₹${bulkPaymentTotal}).`);
          return;
        }
        cashAmt = cVal;
        upiAmt = uVal;
        const splitNotes = `(Split: Cash ₹${cVal}, UPI ₹${uVal})`;
        nextPaymentNotes = bulkPaymentNotes.trim() ? `${bulkPaymentNotes.trim()} ${splitNotes}` : splitNotes;
      }

      const formattedDate = bulkPaymentDate ? new Date(bulkPaymentDate).toISOString() : getISTISOString();
      await bulkPayProcurements(
        bulkPaymentIds,
        formattedDate,
        bulkPaidBy.trim() || user.username,
        nextPaymentNotes,
        bulkPaymentMethod,
        cashAmt,
        upiAmt,
        bulkFundSource,
        bulkPaymentSubcategory || undefined,
        bulkCapturedBillUrl || null
      );
      
      setIsBulkPaymentModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert("Failed to record bulk payment: " + err.message);
    }
  };

  const filterUnpaidProcurements = (items: any[]) => {
    if (vendorDatePreset === 'all') return items;

    // helper to get start of a day
    const getStartOfDay = (dStr: string) => {
      const d = new Date(dStr);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    // helper to get end of a day
    const getEndOfDay = (dStr: string) => {
      const d = new Date(dStr);
      d.setHours(23, 59, 59, 999);
      return d;
    };

    const startDate = vendorStartDate ? getStartOfDay(vendorStartDate) : null;
    const endDate = vendorEndDate ? getEndOfDay(vendorEndDate) : null;

    return items.filter(item => {
      const itemDate = new Date(item.date);
      if (startDate && itemDate < startDate) return false;
      if (endDate && itemDate > endDate) return false;
      return true;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, isBulk = false) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (isBulk) {
          setBulkCapturedBillUrl(reader.result as string);
        } else {
          setCapturedBillUrl(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async (isBulk = false) => {
    setIsBulkCamera(isBulk);
    setShowLiveCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setMediaStream(stream);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 300);
    } catch (err: any) {
      console.error("Camera access failed:", err);
      alert("Could not access camera. Please upload an image file instead.");
      setShowLiveCamera(false);
    }
  };

  const stopCamera = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
    setShowLiveCamera(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (isBulkCamera) {
          setBulkCapturedBillUrl(dataUrl);
        } else {
          setCapturedBillUrl(dataUrl);
        }
        stopCamera();
      }
    }
  };

  const openPaymentModal = async (proc: any, mode: 'PAY' | 'EDIT' | 'UNPAY') => {
    // payment_history is intentionally excluded from list fetches (large jsonb blob, egress hog).
    // Hydrate it on demand for just this procurement before opening the modal.
    let history = Array.isArray(proc.payment_history) ? proc.payment_history : null;
    if (history === null) {
      history = await getProcurementPaymentHistory(proc.id);
    }
    const procWithHistory = { ...proc, payment_history: history };

    setSelectedProcurementForPayment(procWithHistory);
    setPaymentMode(mode);

    // Find the latest payment event containing a bill_image in history, or default to null
    const historyWithBill = Array.isArray(procWithHistory.payment_history)
      ? [...procWithHistory.payment_history].reverse().find(h => h.bill_image)
      : null;
    setCapturedBillUrl(historyWithBill?.bill_image || null);
    
    let defaultDate = '';
    if (proc.paid_at) {
      try {
        defaultDate = new Date(proc.paid_at).toISOString().substring(0, 16);
      } catch (e) {
        defaultDate = proc.paid_at.substring(0, 16);
      }
    } else {
      try {
        // Adjust for browser timezone display
        const tzoffset = (new Date()).getTimezoneOffset() * 60000;
        defaultDate = (new Date(Date.now() - tzoffset)).toISOString().substring(0, 16);
      } catch (e) {
        defaultDate = getISTISOString().substring(0, 16);
      }
    }
    
    setPaymentDate(defaultDate);
    const costVal = proc.total_cost || 0;
    setPaymentAmount(costVal.toString());
    setPaidByInput(proc.paid_by || user.username);
    setPaymentNotesInput(proc.payment_notes || '');
    setPaymentMethod(proc.payment_mode || 'CASH');
    setSingleSplitCash((costVal / 2).toFixed(2));
    setSingleSplitUpi((costVal / 2).toFixed(2));
    setSingleFundSource('Revenue');
    setPaymentActionReason('');
    setIsPaymentModalOpen(true);
  };

  const handleSavePaymentDetails = async () => {
    if (!selectedProcurementForPayment) return;
    const p = selectedProcurementForPayment;

    try {
      let nextIsPaid = p.is_paid;
      let nextPaidAt = p.paid_at || null;
      let nextPaidBy = p.paid_by || null;
      let nextPaymentNotes = p.payment_notes || null;
      let nextPaymentMode = p.payment_mode || null;
      let nextHistory = Array.isArray(p.payment_history) ? [...p.payment_history] : [];

      let cashAmt: number | undefined;
      let upiAmt: number | undefined;

      if (paymentMode === 'PAY') {
        const amt = parseFloat(paymentAmount);
        if (isNaN(amt) || amt < 0) {
          alert("Please enter a valid payment amount.");
          return;
        }

        if (paymentMethod === 'SPLIT') {
          const cVal = parseFloat(singleSplitCash) || 0;
          const uVal = parseFloat(singleSplitUpi) || 0;
          if (Math.abs((cVal + uVal) - amt) > 0.05) {
            alert(`The sum of Cash (₹${cVal}) and UPI (₹${uVal}) must equal the total amount (₹${amt}).`);
            return;
          }
          cashAmt = cVal;
          upiAmt = uVal;
          const splitNotes = `(Split: Cash ₹${cVal}, UPI ₹${uVal})`;
          nextPaymentNotes = paymentNotesInput.trim() ? `${paymentNotesInput.trim()} ${splitNotes}` : splitNotes;
        } else {
          nextPaymentNotes = paymentNotesInput.trim() || null;
        }

        nextIsPaid = true;
        nextPaidAt = paymentDate ? new Date(paymentDate).toISOString() : getISTISOString();
        nextPaidBy = paidByInput.trim() || user.username;
        nextPaymentMode = paymentMethod;

        const newHistoryEntry = {
          event: 'payment' as const,
          amount: amt,
          date: getISTISOString(),
          performed_by: user.username,
          notes: nextPaymentNotes,
          payment_mode: nextPaymentMode,
          reason: paymentActionReason.trim() || 'Initial Payment',
          fund_source: singleFundSource,
          bill_image: capturedBillUrl || undefined
        };
        nextHistory.push(newHistoryEntry);
      } else if (paymentMode === 'EDIT') {
        if (!paymentActionReason.trim()) {
          alert("Reason for editing is required to track changes.");
          return;
        }
        const amt = parseFloat(paymentAmount);
        if (isNaN(amt) || amt < 0) {
          alert("Please enter a valid payment amount.");
          return;
        }

        if (paymentMethod === 'SPLIT') {
          const cVal = parseFloat(singleSplitCash) || 0;
          const uVal = parseFloat(singleSplitUpi) || 0;
          if (Math.abs((cVal + uVal) - amt) > 0.05) {
            alert(`The sum of Cash (₹${cVal}) and UPI (₹${uVal}) must equal the total amount (₹${amt}).`);
            return;
          }
          cashAmt = cVal;
          upiAmt = uVal;
          const splitNotes = `(Split: Cash ₹${cVal}, UPI ₹${uVal})`;
          nextPaymentNotes = paymentNotesInput.trim() ? `${paymentNotesInput.trim()} ${splitNotes}` : splitNotes;
        } else {
          nextPaymentNotes = paymentNotesInput.trim() || null;
        }
        
        const prevDetails = {
          paid_at: p.paid_at,
          paid_by: p.paid_by,
          payment_notes: p.payment_notes,
          amount: p.total_cost,
          payment_mode: p.payment_mode
        };

        nextPaidAt = paymentDate ? new Date(paymentDate).toISOString() : getISTISOString();
        nextPaidBy = paidByInput.trim() || user.username;
        nextPaymentMode = paymentMethod;

        const newHistoryEntry = {
          event: 'edit' as const,
          amount: amt,
          date: getISTISOString(),
          performed_by: user.username,
          notes: nextPaymentNotes,
          payment_mode: nextPaymentMode,
          reason: paymentActionReason.trim(),
          previous_details: prevDetails,
          fund_source: singleFundSource,
          bill_image: capturedBillUrl || undefined
        };
        nextHistory.push(newHistoryEntry);
      } else if (paymentMode === 'UNPAY') {
        if (!paymentActionReason.trim()) {
          alert("Reason for marking back as unpaid is required.");
          return;
        }
        nextIsPaid = false;
        nextPaidAt = null;
        nextPaidBy = null;
        nextPaymentNotes = null;
        nextPaymentMode = null;

        const newHistoryEntry = {
          event: 'unpay' as const,
          date: getISTISOString(),
          performed_by: user.username,
          reason: paymentActionReason.trim()
        };
        nextHistory.push(newHistoryEntry);
      }

      await updateProcurementPayment(
        p.id,
        nextIsPaid,
        nextPaidAt,
        nextPaidBy,
        nextPaymentNotes,
        nextPaymentMode,
        nextHistory,
        cashAmt,
        upiAmt,
        singleFundSource,
        capturedBillUrl || null
      );

      setIsPaymentModalOpen(false);
      setSelectedProcurementForPayment(null);
      setPaymentActionReason('');
      await fetchData();
    } catch (err: any) {
      alert("Failed to update payment details: " + err.message);
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
          user.username,
          adjustCategoryReason
        );
      } else {
        // Central Hub Adjustment
        await manuallyAdjustCentralStock(
          selectedItem.id,
          newVal,
          adjustReason,
          user.username,
          adjustCategoryReason
        );
      }
      setIsAdjustModalOpen(false);
      setAdjustValue('');
      setAdjustReason('');
      setAdjustCategoryReason('others');
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
    setTransactionDate(getISTDateString());
    setNewItemVendor('');
    setNewItemName('');
    setNewItemUnit(materialCategory === 'MOMO' ? 'pcs' : materialCategory === 'PACKET' ? 'pkt' : 'kg');
    setNewItemSubcategory('');
    setSelectedItem(null);
  };

  const financialData = useMemo(() => {
    if (activeTab !== 'FINANCE') return null;

    const filteredProcurements = procurements.filter(p => {
      if (financialPaidFilter === 'paid') return p.is_paid !== false;
      if (financialPaidFilter === 'unpaid') return p.is_paid === false;
      return true;
    });

    const totalSpend = filteredProcurements.reduce((sum, p) => sum + (p.total_cost || 0), 0);
    
    // Category Breakdown (using Subcategories)
    const categoryMap: { [key: string]: number } = {};
    filteredProcurements.forEach(p => {
      const centralItem = centralStock.find(c => c.id === p.item_id);
      const cat = centralItem?.category || 'Uncategorized';
      let subcat = cat;
      if (cat === 'MOMO') {
        const subId = getItemSubcategory(p.item_name, p.item_id);
        if (subId === 'momo') subcat = 'Momo';
        else if (subId === 'buns') subcat = 'Burger Buns';
        else if (subId === 'cola') subcat = 'Cola';
        else if (subId === 'drinks') subcat = 'Drinks';
        else subcat = 'Momo';
      } else if (cat === 'PACKET') {
        const subId = getItemSubcategory(p.item_name, p.item_id);
        if (subId === 'syrups') subcat = 'Syrups';
        else if (subId === 'sauces') subcat = 'Sauces';
        else if (subId === 'packaging') subcat = 'Packaging';
        else if (subId === 'oil-butter') subcat = 'Oil & Butter';
        else if (subId === 'spices') subcat = 'Spices';
        else if (subId === 'fries') subcat = 'French Fries';
        else subcat = 'Other Packets';
      } else if (cat === 'INGREDIENT') {
        subcat = 'Veggies';
      }
      categoryMap[subcat] = (categoryMap[subcat] || 0) + (p.total_cost || 0);
    });
    
    const categoryData = Object.entries(categoryMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Item Breakdown
    const itemMap: { [key: string]: { name: string, category: string, total: number, qty: number, unit: string } } = {};
    filteredProcurements.forEach(p => {
      if (!itemMap[p.item_name]) {
        const centralItem = centralStock.find(c => c.id === p.item_id);
        const cat = centralItem?.category || 'Uncategorized';
        let subcat = cat;
        if (cat === 'MOMO') {
          const subId = getItemSubcategory(p.item_name, p.item_id);
          if (subId === 'momo') subcat = 'Momo';
          else if (subId === 'buns') subcat = 'Burger Buns';
          else if (subId === 'cola') subcat = 'Cola';
          else if (subId === 'drinks') subcat = 'Drinks';
          else subcat = 'Momo';
        } else if (cat === 'PACKET') {
          const subId = getItemSubcategory(p.item_name, p.item_id);
          if (subId === 'syrups') subcat = 'Syrups';
          else if (subId === 'sauces') subcat = 'Sauces';
          else if (subId === 'packaging') subcat = 'Packaging';
          else if (subId === 'oil-butter') subcat = 'Oil & Butter';
          else if (subId === 'spices') subcat = 'Spices';
          else if (subId === 'fries') subcat = 'French Fries';
          else subcat = 'Other Packets';
        } else if (cat === 'INGREDIENT') {
          subcat = 'Veggies';
        }
        itemMap[p.item_name] = { 
          name: p.item_name, 
          category: subcat, 
          total: 0, 
          qty: 0, 
          unit: p.unit 
        };
      }
      itemMap[p.item_name].total += (p.total_cost || 0);
      itemMap[p.item_name].qty += (p.quantity || 0);
    });

    const itemData = Object.values(itemMap).sort((a, b) => b.total - a.total);

    // Rotten Stock analysis: filter where log is rotten stock or reason indicates it
    const rottenAdjustments = adjustments.filter(adj => {
      const reasonLower = (adj.reason || '').toLowerCase();
      const catLower = (adj.adjustment_category || '').toLowerCase();
      return catLower === 'rotten stock' || reasonLower.includes('rotten stock') || reasonLower.includes('[rotten stock]');
    });

    let totalRottenQty = 0;
    let totalRottenValueLoss = 0;
    const rottenItemsMap: { [key: string]: { name: string, qty: number, estimatedLoss: number, unit: string } } = {};

    rottenAdjustments.forEach(adj => {
      const spoiledQty = Math.abs(adj.quantity_change || 0);
      
      // Let's estimate unit cost from procurements
      const matchProc = procurements.find(p => p.item_id === adj.inventory_id || p.item_name === adj.item_name);
      let unitCost = 0;
      if (matchProc && matchProc.quantity > 0) {
        unitCost = (matchProc.total_cost || 0) / matchProc.quantity;
      } else {
        // Fallback: check matching central material
        const centralItem = centralStock.find(c => c.id === adj.inventory_id);
        if (centralItem && centralItem.last_purchase_cost) {
          unitCost = centralItem.last_purchase_cost;
        }
      }

      const estimatedLoss = spoiledQty * unitCost;
      totalRottenQty += spoiledQty;
      totalRottenValueLoss += estimatedLoss;

      const keyName = adj.item_name || adj.inventory_id;
      if (!rottenItemsMap[keyName]) {
        rottenItemsMap[keyName] = {
          name: keyName,
          qty: 0,
          estimatedLoss: 0,
          unit: adj.unit || matchProc?.unit || 'pcs'
        };
      }
      rottenItemsMap[keyName].qty += spoiledQty;
      rottenItemsMap[keyName].estimatedLoss += estimatedLoss;
    });

    const rottenData = Object.values(rottenItemsMap).sort((a, b) => b.estimatedLoss - a.estimatedLoss);

    return { totalSpend, categoryData, itemData, totalRottenQty, totalRottenValueLoss, rottenData };
  }, [procurements, activeTab, centralStock, adjustments, financialPaidFilter]);

  const handleExportFinance = () => {
    if (!financialData) return;
    
    const filteredProcurementsForExport = procurements.filter(p => {
      if (financialPaidFilter === 'paid') return p.is_paid !== false;
      if (financialPaidFilter === 'unpaid') return p.is_paid === false;
      return true;
    });

    let csv = 'Date,Item Name,Category,Quantity,Unit,Total Spend (INR),Vendor,Payment Status\n';
    filteredProcurementsForExport.forEach(p => {
      const payStatus = p.is_paid === false ? 'Unpaid' : 'Paid';
      csv += `${p.date},${p.item_name},${p.item_info?.category || 'Uncategorized'},${p.quantity},${p.unit},${p.total_cost},${p.vendor || 'Local Market'},${payStatus}\n`;
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
  adjustment_category TEXT,
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
  void_reason TEXT,
  is_paid BOOLEAN DEFAULT true,
  paid_at TIMESTAMPTZ,
  paid_by TEXT,
  payment_notes TEXT,
  payment_mode TEXT,
  payment_history JSONB DEFAULT '[]'::jsonb
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
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_logs' AND column_name='adjustment_category') THEN
        ALTER TABLE inventory_logs ADD COLUMN adjustment_category TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='procurements' AND column_name='is_paid') THEN
        ALTER TABLE procurements ADD COLUMN is_paid BOOLEAN DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='procurements' AND column_name='paid_at') THEN
        ALTER TABLE procurements ADD COLUMN paid_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='procurements' AND column_name='paid_by') THEN
        ALTER TABLE procurements ADD COLUMN paid_by TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='procurements' AND column_name='payment_notes') THEN
        ALTER TABLE procurements ADD COLUMN payment_notes TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='procurements' AND column_name='payment_mode') THEN
        ALTER TABLE procurements ADD COLUMN payment_mode TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='procurements' AND column_name='payment_history') THEN
        ALTER TABLE procurements ADD COLUMN payment_history JSONB DEFAULT '[]'::jsonb;
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
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">Stock & movement Tracking</p>
        </div>

        <div className="flex flex-wrap gap-4">
          <button
            onClick={handleManualRefresh}
            disabled={isLoading}
            title="Reload inventory data"
            className="bg-white border border-brand-stone text-brand-brown px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-brand-yellow transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
          {(isAdmin || user.role === 'STORE_MANAGER') && (
            <div className="bg-white p-1 rounded-2xl border border-brand-stone flex shadow-sm flex-wrap items-center">
              <button onClick={() => setActiveTab('HUB')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'HUB' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Active Stock</button>
              {isAdmin && (
                <>
                  <button onClick={() => setActiveTab('LEDGER')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'LEDGER' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Transaction Ledger</button>
                  <button onClick={() => setActiveTab('FINANCE')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'FINANCE' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Financial View</button>
                  <button onClick={() => setActiveTab('VENDORS')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'VENDORS' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Vendors</button>
                </>
              )}
              <button onClick={() => setActiveTab('CONSUMPTION')} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'CONSUMPTION' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/5'}`}>Consumption Speed</button>
              
              {isAdmin && (
                <>
                  <div className="h-6 w-[2px] bg-brand-stone mx-2 hidden md:block"></div>
                  
                  <button 
                    onClick={() => { setMasterResetType('HUB'); setIsMasterResetModalOpen(true); }}
                    className="px-6 py-3 text-brand-red hover:bg-red-50 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                  >
                    Reset Hub to Zero
                  </button>
                </>
              )}
            </div>
          )}
          {isAdmin && (activeTab === 'HUB' || activeTab === 'FINANCE') && (
            <button onClick={() => { resetForm(); setIsAddItemModalOpen(true); }} className="bg-brand-brown text-brand-yellow px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform">Register New Item</button>
          )}
          {isAdmin && activeTab === 'VENDORS' && (
            <button onClick={openAddVendorModal} className="bg-brand-brown text-brand-yellow px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform">Register New Vendor</button>
          )}
        </div>
      </header>

      {activeTab === 'HUB' ? (
        <>
          {/* Stock Valuation Summary Panel */}
          <div className="bg-white rounded-[3rem] border-4 border-brand-brown p-8 shadow-xl mb-12 animate-in fade-in slide-in-from-top duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h3 className="text-3xl font-black text-brand-brown uppercase italic tracking-tighter flex items-center gap-3">
                  <span>💰</span> Stock Valuation Dashboard
                </h3>
                <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
                  Real-time monetary worth of existing stocks based on last purchase costs
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-brand-cream border border-brand-stone/30 rounded-2xl px-6 py-3 flex flex-col items-end">
                  <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-wider">Total Existing Stock Value</span>
                  <span className="text-2xl font-black text-brand-red">
                    ₹{totalStockValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <button
                  onClick={() => setIsValuationExpanded(!isValuationExpanded)}
                  className="px-6 py-3 bg-brand-stone/30 text-brand-brown hover:bg-brand-yellow rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  {isValuationExpanded ? 'Collapse Details ▲' : 'Expand Details ▼'}
                </button>
              </div>
            </div>

            {isValuationExpanded && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 pt-4 border-t border-brand-stone animate-in fade-in duration-300">
                {/* Store Wise Valuation */}
                <div className="bg-brand-cream/30 border border-brand-stone rounded-[2.5rem] p-6 flex flex-col">
                  <h4 className="text-sm font-black text-brand-brown uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span>🏪</span> Store-Wise Valuation
                  </h4>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-2">
                    <div className="w-[180px] h-[180px] flex-shrink-0 relative flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={storeWiseValuation}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={70}
                            paddingAngle={3}
                            dataKey="value"
                            nameKey="store"
                          >
                            {storeWiseValuation.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={VALUATION_COLORS[index % VALUATION_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px', textTransform: 'uppercase' }}
                            formatter={(value: any) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[9px] font-black uppercase text-brand-brown/40">Stores</span>
                        <span className="text-sm font-black text-brand-brown">{storeWiseValuation.filter(s => s.value > 0).length}</span>
                      </div>
                    </div>

                    <div className="flex-1 space-y-3 w-full max-h-[180px] overflow-y-auto no-scrollbar pr-2">
                      {storeWiseValuation.map((store, index) => {
                        const pct = totalStockValuation > 0 ? (store.value / totalStockValuation) * 100 : 0;
                        const color = VALUATION_COLORS[index % VALUATION_COLORS.length];
                        return (
                          <div key={store.store} className="flex justify-between items-center text-xs font-black uppercase text-brand-brown">
                            <div className="flex items-center gap-2 truncate max-w-[200px]">
                              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="truncate">{store.store}</span>
                            </div>
                            <div className="text-right flex flex-col items-end flex-shrink-0">
                              <span>₹{store.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <span className="text-[9px] text-brand-brown/40">({pct.toFixed(1)}%)</span>
                            </div>
                          </div>
                        );
                      })}
                      {storeWiseValuation.length === 0 && (
                        <p className="text-center text-[10px] font-black uppercase text-brand-brown/30 py-8">No stock value found</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subcategory Wise Valuation */}
                <div className="bg-brand-cream/30 border border-brand-stone rounded-[2.5rem] p-6 flex flex-col">
                  <h4 className="text-sm font-black text-brand-brown uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span>📁</span> Subcategory-Wise Valuation
                  </h4>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-2">
                    <div className="w-[180px] h-[180px] flex-shrink-0 relative flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={subcategoryWiseValuation}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={70}
                            paddingAngle={3}
                            dataKey="value"
                            nameKey="label"
                          >
                            {subcategoryWiseValuation.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={VALUATION_COLORS[index % VALUATION_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px', textTransform: 'uppercase' }}
                            formatter={(value: any) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[9px] font-black uppercase text-brand-brown/40">Categories</span>
                        <span className="text-sm font-black text-brand-brown">{subcategoryWiseValuation.filter(s => s.value > 0).length}</span>
                      </div>
                    </div>

                    <div className="flex-1 space-y-3 w-full max-h-[180px] overflow-y-auto no-scrollbar pr-2">
                      {subcategoryWiseValuation.map((sub, index) => {
                        const pct = totalStockValuation > 0 ? (sub.value / totalStockValuation) * 100 : 0;
                        const color = VALUATION_COLORS[index % VALUATION_COLORS.length];
                        return (
                          <div key={sub.id} className="flex justify-between items-center text-xs font-black uppercase text-brand-brown">
                            <div className="flex items-center gap-2 truncate max-w-[200px]">
                              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="truncate flex items-center gap-1.5">
                                <span>{sub.icon}</span>
                                <span>{sub.label}</span>
                              </span>
                            </div>
                            <div className="text-right flex flex-col items-end flex-shrink-0">
                              <span>₹{sub.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <span className="text-[9px] text-brand-brown/40">({pct.toFixed(1)}%)</span>
                            </div>
                          </div>
                        );
                      })}
                      {subcategoryWiseValuation.length === 0 && (
                        <p className="text-center text-[10px] font-black uppercase text-brand-brown/30 py-8">No subcategory value found</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {[
              { id: 'MOMO' as MaterialCategory, title: 'Category A: Auto Deduct', desc: 'Auto-deducts per bill.', icon: '🥟', color: 'bg-brand-brown' },
              { id: 'PACKET' as MaterialCategory, title: 'Category B: Packets', desc: 'Manual mark-as-finished.', icon: '🥫', color: 'bg-brand-red' },
              { id: 'INGREDIENT' as MaterialCategory, title: 'Category C: Veggies', desc: 'Hub usage only.', icon: '🥬', color: 'bg-mountain-green' },
            ].map(cat => (
              <button key={cat.id} onClick={() => { setMaterialCategory(cat.id); setActiveSubcategory('all'); }} className={`text-left p-8 rounded-[3rem] border-4 transition-all duration-500 shadow-xl ${materialCategory === cat.id ? `${cat.color} text-white scale-105 border-brand-yellow` : 'bg-white border-brand-stone text-brand-brown hover:border-brand-yellow/30'}`}>
                <div className="text-5xl mb-6">{cat.icon}</div>
                <h3 className="text-2xl font-black mb-2">{cat.title}</h3>
                <p className={`text-[11px] font-bold uppercase tracking-tight leading-relaxed ${materialCategory === cat.id ? 'text-brand-yellow' : 'text-brand-brown/40'}`}>{cat.desc}</p>
              </button>
            ))}
          </div>

          {isAdmin && (
            <section className="mb-12 animate-in fade-in duration-500">
              <h3 className="text-2xl font-black text-brand-brown underline decoration-brand-yellow decoration-4 underline-offset-8 uppercase tracking-tighter italic mb-8">Central Inventory: {materialCategory === 'MOMO' ? 'Category A (Auto-Deduct)' : materialCategory}</h3>
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex flex-wrap gap-2 bg-brand-stone/10 p-2 rounded-2xl border border-brand-stone/20 w-fit items-center">
                  {[
                    { id: 'all', label: 'All Items', icon: '🔍' },
                    ...getSubcategoriesForCategory(materialCategory)
                  ].map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setActiveSubcategory(sub.id)}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        activeSubcategory === sub.id
                          ? 'bg-brand-brown text-brand-yellow shadow-md border-transparent'
                          : 'bg-white hover:bg-brand-cream/50 text-brand-brown/60 border border-brand-stone'
                      }`}
                    >
                      <span>{sub.icon}</span>
                      <span>{sub.label}</span>
                    </button>
                  ))}
                  
                  {isAdmin && (
                    <button
                      onClick={() => {
                        setNewSubcatParent(materialCategory);
                        setIsCreateSubcategoryModalOpen(true);
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-brand-yellow hover:bg-brand-yellow/80 text-brand-brown border border-brand-brown/10 shadow-sm transition-all"
                    >
                      <span>➕</span>
                      <span>New Subcat</span>
                    </button>
                  )}
                </div>

                {/* Active Stock Search Bar */}
                <div className="relative w-full md:max-w-xs flex-shrink-0">
                  <input
                    type="text"
                    placeholder="Search stock items..."
                    value={activeStockSearch}
                    onChange={(e) => setActiveStockSearch(e.target.value)}
                    className="w-full pl-10 pr-16 py-3 bg-white border border-brand-stone rounded-2xl text-xs font-bold text-brand-brown outline-none focus:ring-2 focus:ring-brand-yellow placeholder:text-brand-brown/30"
                  />
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-brown/40">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  {activeStockSearch && (
                    <button
                      onClick={() => setActiveStockSearch('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-brown/40 hover:text-brand-brown text-[10px] font-black uppercase tracking-widest"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

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
                    {centralStock.filter(i => {
                      if (i.category !== materialCategory) return false;
                      if (activeSubcategory !== 'all') {
                        if (getItemSubcategory(i.name, i.id, i.category) !== activeSubcategory) return false;
                      }
                      if (activeStockSearch.trim() !== '') {
                        const terms = activeStockSearch.toLowerCase().split(/\s+/).filter(Boolean);
                        const nameLower = i.name.toLowerCase();
                        const matchesAll = terms.every(term => nameLower.includes(term));
                        if (!matchesAll) return false;
                      }
                      return true;
                    }).map(item => {
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
                            <div className="flex gap-2">
                              {isAdmin && (
                                <button 
                                  onClick={() => handleOpenEditModal(item)} 
                                  className="p-3 bg-brand-stone/20 rounded-xl hover:bg-brand-yellow hover:text-brand-brown text-brand-brown/60 transition-all shadow-sm"
                                  title="Edit Item"
                                >
                                  ✏️
                                </button>
                              )}
                              <button onClick={() => { setSelectedItem(item); setIsRestockModalOpen(true); }} className="p-3 bg-brand-stone/30 rounded-xl hover:bg-brand-yellow transition-colors group-hover:bg-brand-yellow shadow-sm flex-shrink-0">
                                <svg className="w-5 h-5 text-brand-brown" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                              </button>
                            </div>
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
                  {centralStock.filter(i => {
                    if (i.category !== materialCategory) return false;
                    if (activeSubcategory !== 'all') {
                      if (getItemSubcategory(i.name, i.id, i.category) !== activeSubcategory) return false;
                    }
                    if (activeStockSearch.trim() !== '') {
                      const terms = activeStockSearch.toLowerCase().split(/\s+/).filter(Boolean);
                      const nameLower = i.name.toLowerCase();
                      const matchesAll = terms.every(term => nameLower.includes(term));
                      if (!matchesAll) return false;
                    }
                    return true;
                  }).length === 0 && (
                    <div className="lg:col-span-4 p-12 text-center text-brand-brown/20 uppercase font-black text-[10px] tracking-widest">
                      {activeStockSearch ? "No materials match your search" : "No materials found in this subcategory"}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {materialCategory !== 'INGREDIENT' && (
            <section className="animate-in fade-in duration-500 delay-150">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                  <h3 className="text-2xl font-black text-brand-brown italic uppercase">{isAdmin ? `Branch Monitor: ${selectedStation?.name || '...'}` : `Store Stock: ${user.stationName}`}</h3>
                  <div className="flex items-center gap-2 mt-2 bg-brand-cream border border-brand-stone rounded-2xl px-5 py-2 w-fit shadow-sm">
                    <span className="text-[9px] font-black uppercase text-brand-brown/50 tracking-wider">Total Branch Stock Value:</span>
                    <span className="text-sm font-black text-brand-red">
                      ₹{selectedBranchValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
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
                      <select 
                        value={selectedStation?.id || ''} 
                        onChange={async (e) => {
                          const found = stations.find(s => s.id === e.target.value) || null;
                          setSelectedStation(found);
                          if (found) {
                            const inv = await getInventory(found.name);
                            setStoreStock(inv);
                          }
                        }} 
                        className="bg-white border-4 border-brand-brown p-4 rounded-2xl text-[10px] font-black uppercase text-brand-brown shadow-xl outline-none"
                      >
                        <option value="">Select Branch Station...</option>
                        {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex flex-wrap gap-2 bg-brand-stone/10 p-2 rounded-2xl border border-brand-stone/20 w-fit">
                  {[
                    { id: 'all', label: 'All Items', icon: '🔍' },
                    ...getSubcategoriesForCategory(materialCategory)
                  ].map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setActiveSubcategory(sub.id)}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        activeSubcategory === sub.id
                          ? 'bg-brand-brown text-brand-yellow shadow-md border-transparent'
                          : 'bg-white hover:bg-brand-cream/50 text-brand-brown/60 border border-brand-stone'
                      }`}
                    >
                      <span>{sub.icon}</span>
                      <span>{sub.label}</span>
                    </button>
                  ))}
                </div>

                {/* Active Stock Search Bar (Store Stock view) */}
                <div className="relative w-full md:max-w-xs flex-shrink-0">
                  <input
                    type="text"
                    placeholder="Search stock items..."
                    value={activeStockSearch}
                    onChange={(e) => setActiveStockSearch(e.target.value)}
                    className="w-full pl-10 pr-16 py-3 bg-white border border-brand-stone rounded-2xl text-xs font-bold text-brand-brown outline-none focus:ring-2 focus:ring-brand-yellow placeholder:text-brand-brown/30"
                  />
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-brown/40">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  {activeStockSearch && (
                    <button
                      onClick={() => setActiveStockSearch('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-brown/40 hover:text-brand-brown text-[10px] font-black uppercase tracking-widest"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-[3rem] shadow-2xl border-4 border-brand-brown overflow-hidden">
                <table className="w-full">
                  <thead className="bg-brand-brown text-brand-yellow">
                    <tr>
                      <th className="px-10 py-6 text-[11px] font-black uppercase text-left tracking-widest">Item</th>
                      <th className="px-10 py-6 text-[11px] font-black uppercase text-center tracking-widest select-none">
                        <button
                          onClick={() => {
                            if (stockSortField === 'stock') {
                              if (stockSortOrder === 'desc') {
                                setStockSortOrder('asc');
                              } else {
                                setStockSortField('none');
                              }
                            } else {
                              setStockSortField('stock');
                              setStockSortOrder('desc');
                            }
                          }}
                          className="mx-auto flex items-center justify-center gap-1.5 hover:text-white transition-colors focus:outline-none"
                        >
                          <span>Stock Level</span>
                          {stockSortField === 'stock' ? (
                            stockSortOrder === 'desc' ? (
                              <ArrowDown className="w-3.5 h-3.5 text-brand-yellow flex-shrink-0" />
                            ) : (
                              <ArrowUp className="w-3.5 h-3.5 text-brand-yellow flex-shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100 flex-shrink-0" />
                          )}
                        </button>
                      </th>
                      <th className="px-10 py-6 text-[11px] font-black uppercase text-center tracking-widest select-none">
                        <button
                          onClick={() => {
                            if (stockSortField === 'value') {
                              if (stockSortOrder === 'desc') {
                                setStockSortOrder('asc');
                              } else {
                                setStockSortField('none');
                              }
                            } else {
                              setStockSortField('value');
                              setStockSortOrder('desc');
                            }
                          }}
                          className="mx-auto flex items-center justify-center gap-1.5 hover:text-white transition-colors focus:outline-none"
                        >
                          <span>Live Value</span>
                          {stockSortField === 'value' ? (
                            stockSortOrder === 'desc' ? (
                              <ArrowDown className="w-3.5 h-3.5 text-brand-yellow flex-shrink-0" />
                            ) : (
                              <ArrowUp className="w-3.5 h-3.5 text-brand-yellow flex-shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100 flex-shrink-0" />
                          )}
                        </button>
                      </th>
                      <th className="px-10 py-6 text-[11px] font-black uppercase text-right tracking-widest">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-stone">
                    {(() => {
                      if (filteredStoreStock.length === 0) {
                        return (
                          <tr>
                            <td colSpan={4} className="px-10 py-12 text-center text-brand-brown/20 uppercase font-black text-[10px] tracking-widest">
                              {activeStockSearch ? "No materials match your search" : "No materials found in this subcategory"}
                            </td>
                          </tr>
                        );
                      }

                      return filteredStoreStock.map(item => {
                        const itemCost = estimatedUnitCostMap[item.id] || 0;
                        const itemActiveValuation = (!item.is_finished && item.current_stock > 0) ? (item.current_stock * itemCost) : 0;
                        
                        return (
                          <tr key={item.id} className={`${item.is_finished ? 'bg-red-50' : 'bg-white'} transition-colors`}>
                            <td className="px-10 py-8">
                              <p className="text-xl font-black text-brand-brown">{item.name}</p>
                              {item.request_pending && <span className="text-[9px] font-black text-brand-red uppercase bg-brand-red/10 px-3 py-1 rounded-full inline-block mt-2 animate-pulse">Low Stock Alert</span>}
                            </td>
                            <td className="px-10 py-8 text-center">
                              <span className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${item.is_finished ? 'bg-brand-red text-white' : 'bg-brand-brown/5 text-brand-brown'}`}>
                                {item.is_finished ? 'FINISHED' : `${item.current_stock.toFixed(2)} ${item.unit}`}
                              </span>
                            </td>
                            <td className="px-10 py-8 text-center">
                              <div className="flex flex-col items-center">
                                <span className="text-sm font-black text-brand-red">
                                  ₹{itemActiveValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                {itemCost > 0 && (
                                  <span className="text-[9px] font-bold text-brand-brown/40 uppercase tracking-wider mt-0.5">
                                    ₹{itemCost.toFixed(2)} / {item.unit}
                                  </span>
                                )}
                              </div>
                            </td>
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
                        );
                      });
                    })()}
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

          <div className="flex flex-wrap items-center gap-4 mb-8">
            {ledgerType === 'BUYING' && (
              <div className="flex justify-start items-center gap-3 bg-white p-4 rounded-[1.5rem] border border-brand-stone shadow-sm w-fit animate-in fade-in slide-in-from-top-4 duration-300">
                <span className="text-[10px] font-black uppercase text-brand-brown/50 tracking-widest mr-2">Payment:</span>
                <div className="flex bg-brand-brown/5 p-1 rounded-xl">
                  <button
                    onClick={() => setLedgerPaidFilter('all')}
                    className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      ledgerPaidFilter === 'all'
                        ? 'bg-brand-brown text-brand-yellow shadow-md'
                        : 'text-brand-brown/40 hover:text-brand-brown'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setLedgerPaidFilter('paid')}
                    className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      ledgerPaidFilter === 'paid'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-brand-brown/40 hover:text-brand-brown'
                    }`}
                  >
                    Paid
                  </button>
                  <button
                    onClick={() => setLedgerPaidFilter('unpaid')}
                    className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      ledgerPaidFilter === 'unpaid'
                        ? 'bg-amber-600 text-white shadow-md'
                        : 'text-brand-brown/40 hover:text-brand-brown'
                    }`}
                  >
                    Unpaid
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-start items-center gap-3 bg-white p-4 rounded-[1.5rem] border border-brand-stone shadow-sm w-fit animate-in fade-in slide-in-from-top-4 duration-300">
              <span className="text-[10px] font-black uppercase text-brand-brown/50 tracking-widest mr-2">Filter Item:</span>
              <select
                value={ledgerItemFilter}
                onChange={(e) => setLedgerItemFilter(e.target.value)}
                className="bg-brand-brown/5 text-[10px] font-black uppercase text-brand-brown py-2 px-4 rounded-xl border border-brand-brown/10 outline-none cursor-pointer focus:ring-2 focus:ring-brand-yellow"
              >
                <option value="all">🔍 Show All Items</option>
                {centralStock.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            {ledgerType === 'BUYING' && (
              <>
                <div className="flex justify-start items-center gap-3 bg-white p-4 rounded-[1.5rem] border border-brand-stone shadow-sm w-fit animate-in fade-in slide-in-from-top-4 duration-300">
                  <span className="text-[10px] font-black uppercase text-brand-brown/50 tracking-widest mr-2">Filter Vendor:</span>
                  <select
                    value={ledgerVendorFilter}
                    onChange={(e) => setLedgerVendorFilter(e.target.value)}
                    className="bg-brand-brown/5 text-[10px] font-black uppercase text-brand-brown py-2 px-4 rounded-xl border border-brand-brown/10 outline-none cursor-pointer focus:ring-2 focus:ring-brand-yellow"
                  >
                    <option value="all">🤝 Show All Vendors</option>
                    {availableVendors.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-start items-center gap-3 bg-white p-4 rounded-[1.5rem] border border-brand-stone shadow-sm w-fit animate-in fade-in slide-in-from-top-4 duration-300">
                  <span className="text-[10px] font-black uppercase text-brand-brown/50 tracking-widest mr-2">Subcategory:</span>
                  <select
                    value={ledgerSubcategoryFilter}
                    onChange={(e) => setLedgerSubcategoryFilter(e.target.value)}
                    className="bg-brand-brown/5 text-[10px] font-black uppercase text-brand-brown py-2 px-4 rounded-xl border border-brand-brown/10 outline-none cursor-pointer focus:ring-2 focus:ring-brand-yellow"
                  >
                    <option value="all">📁 All Subcategories</option>
                    {availableSubcategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="bg-white rounded-[3rem] shadow-2xl border-4 border-brand-brown overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-brand-brown text-brand-yellow">
                <tr>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:underline" onClick={() => { setSortBy('date'); setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); }}>Date & Time {sortBy === 'date' && (sortOrder === 'desc' ? '▼' : '▲')}</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest">Item Name</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-center" onClick={() => { setSortBy('quantity'); setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); }}>Quantity {sortBy === 'quantity' && (sortOrder === 'desc' ? '▼' : '▲')}</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest">{ledgerType === 'BUYING' ? 'Vendor & Payment' : ledgerType === 'ALLOCATION' ? 'Store Station' : 'Branch'}</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-right cursor-pointer hover:underline" onClick={() => { setSortBy('date'); setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); }}>{ledgerType === 'BUYING' ? 'Total Cost' : ledgerType === 'ALLOCATION' ? 'Action' : 'Reason'} {sortBy === 'date' && (sortOrder === 'desc' ? '▼' : '▲')}</th>
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
                      <td className="px-8 py-6">
                        <div className="flex flex-col items-start">
                          <span className={`text-[10px] font-black uppercase ${p.is_voided ? 'text-brand-brown/40' : 'text-brand-red'}`}>{p.vendor || 'Local Market'}</span>
                           {!p.is_voided && (
                            <button 
                              onClick={() => {
                                if (p.is_paid === false) {
                                  openPaymentModal(p, 'PAY');
                                } else {
                                  openPaymentModal(p, 'EDIT');
                                }
                              }}
                              className={`mt-1.5 px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-full transition-all border ${
                                p.is_paid === false
                                  ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                              }`}
                            >
                              {p.is_paid === false ? '🔴 Unpaid' : `🟢 Paid (${p.payment_mode ? p.payment_mode.toUpperCase() : 'CASH'})`}
                            </button>
                          )}
                          {!p.is_voided && p.is_paid && p.payment_notes && (
                            <span className="text-[8px] font-semibold text-brand-brown/50 mt-1 block max-w-[150px] truncate" title={p.payment_notes}>
                              Ref: {p.payment_notes}
                            </span>
                          )}
                          {p.is_voided && (
                            <span className="text-[9px] font-bold text-brand-brown/30 uppercase mt-1 block">
                              {p.is_paid === false ? 'Unpaid' : `Paid (${p.payment_mode ? p.payment_mode.toUpperCase() : 'CASH'})`}
                            </span>
                          )}
                        </div>
                      </td>
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
            <div className="flex flex-wrap items-center gap-6">
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

              {/* Paid / Unpaid Status Filter */}
              <div className="flex items-center gap-1.5 bg-brand-stone/20 p-1.5 rounded-2xl border border-brand-stone">
                <button
                  onClick={() => setFinancialPaidFilter('all')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    financialPaidFilter === 'all'
                      ? 'bg-brand-brown border border-brand-brown text-brand-yellow shadow-sm'
                      : 'text-brand-brown/40 hover:text-brand-brown border border-transparent'
                  }`}
                >
                  Total Stock
                </button>
                <button
                  onClick={() => setFinancialPaidFilter('paid')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    financialPaidFilter === 'paid'
                      ? 'bg-emerald-700 border border-emerald-700 text-white shadow-sm'
                      : 'text-brand-brown/40 hover:text-brand-brown border border-transparent'
                  }`}
                >
                  Paid Stock
                </button>
                <button
                  onClick={() => setFinancialPaidFilter('unpaid')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    financialPaidFilter === 'unpaid'
                      ? 'bg-amber-600 border border-amber-600 text-white shadow-sm'
                      : 'text-brand-brown/40 hover:text-brand-brown border border-transparent'
                  }`}
                >
                  Unpaid Stock
                </button>
              </div>
            </div>
            <button onClick={handleExportFinance} className="bg-emerald-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:scale-105 transition-transform flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Export CSV Report
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
            <div className="lg:col-span-1 flex flex-col gap-6">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-brand-stone text-center md:text-left flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-black text-brand-brown/40 uppercase tracking-widest mb-2">
                    {financialPaidFilter === 'all' ? 'Total Spend' : financialPaidFilter === 'paid' ? 'Paid Stock Spend' : 'Unpaid Stock Spend'}
                  </p>
                  <h4 className="text-4xl font-black text-brand-brown">₹{financialData?.totalSpend.toLocaleString()}</h4>
                </div>
                <p className="text-[10px] font-bold text-mountain-green uppercase mt-4">Selected Period</p>
              </div>

              <div className="bg-amber-50 p-8 rounded-[2.5rem] shadow-xl border-2 border-amber-500/20 text-center md:text-left flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-black text-amber-800/80 uppercase tracking-widest mb-2">Rotten Stock Loss</p>
                  <h4 className="text-4xl font-black text-amber-900">₹{(financialData?.totalRottenValueLoss || 0).toLocaleString(undefined, {maximumFractionDigits: 2})}</h4>
                </div>
                <p className="text-[10px] font-bold text-amber-700 uppercase mt-4">
                  {(financialData?.totalRottenQty || 0).toFixed(2)} units rotten
                </p>
              </div>
            </div>
            
            <div className="lg:col-span-3 bg-white p-8 rounded-[2.5rem] shadow-xl border border-brand-stone flex flex-col md:flex-row gap-8">
              <div className="flex-1 min-h-[300px]">
                <p className="text-[10px] font-black text-brand-brown/40 uppercase tracking-widest mb-6 text-center">Spend by Category / Subcategory</p>
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
                <p className="text-[10px] font-black text-brand-brown/40 uppercase tracking-widest mb-6 text-center">Category / Subcategory Spend Breakdown</p>
                <div className="h-full w-full">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart 
                      data={financialData?.categoryData || []}
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
                      <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={40}>
                        {(financialData?.categoryData || []).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
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

          {/* Rotten Stock Waste Breakdown Table */}
          {financialData?.rottenData && financialData.rottenData.length > 0 && (
            <div className="bg-amber-50/40 rounded-[3rem] shadow-2xl border-4 border-amber-800 overflow-hidden mt-12 animate-in slide-in-from-bottom duration-500">
              <div className="px-10 py-8 bg-amber-800 flex justify-between items-center">
                <h4 className="text-xl font-black text-amber-50 italic uppercase">Rotten Stock Waste Breakdown</h4>
                <span className="bg-amber-200 text-amber-950 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full">
                  Loss: ₹{financialData.totalRottenValueLoss.toLocaleString(undefined, {maximumFractionDigits: 2})}
                </span>
              </div>
              <table className="w-full">
                <thead className="bg-amber-900/95 text-amber-100 border-t border-amber-800">
                  <tr>
                    <th className="px-10 py-6 text-[10px] font-black uppercase text-left tracking-widest">Material Name</th>
                    <th className="px-10 py-6 text-[10px] font-black uppercase text-center tracking-widest">Rotten Quantity</th>
                    <th className="px-10 py-6 text-[10px] font-black uppercase text-right tracking-widest">Estimated Loss Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-200/50">
                  {financialData.rottenData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-amber-100/40 transition-colors">
                      <td className="px-10 py-6 font-black text-amber-950">{item.name}</td>
                      <td className="px-10 py-6 text-center font-black text-amber-800 text-xs">{item.qty.toFixed(2)} {item.unit}</td>
                      <td className="px-10 py-6 text-right font-black text-amber-900">₹{item.estimatedLoss.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : activeTab === 'VENDORS' ? (
        <section className="animate-in slide-in-from-bottom-6 duration-700 space-y-8">
          {/* Top-level Vendors Date Filter */}
          <div className="flex flex-col lg:flex-row justify-between items-center gap-6 p-8 bg-white rounded-[3rem] border border-brand-stone shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center gap-4 w-full justify-between">
              <div>
                <h3 className="text-sm font-black text-brand-brown uppercase tracking-widest">Filter by Purchase Period</h3>
                <p className="text-[9px] font-bold text-brand-brown/40 uppercase tracking-wider mt-0.5">Filter unpaid vendor procurements by order date</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => fetchData()} className="bg-brand-stone/30 p-2 rounded-xl hover:bg-brand-yellow transition-colors mr-2" title="Reload Vendors Data">
                  <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
                {(['all', 'today', 'yesterday', 'week', 'last-week', 'month', 'last-month', 'custom'] as VendorDatePreset[]).map(p => (
                  <button
                    key={p}
                    onClick={() => handleVendorPresetChange(p)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${vendorDatePreset === p ? 'bg-brand-brown border-brand-brown text-brand-yellow' : 'bg-white border-brand-stone text-brand-brown/40 hover:border-brand-brown/20'}`}
                  >
                    {p === 'week' ? 'this week' : p === 'all' ? 'show all' : p.replace('-', ' ')}
                  </button>
                ))}
                {vendorDatePreset === 'custom' && (
                  <div className="flex items-center gap-2 pl-4 border-l-2 border-brand-stone animate-in slide-in-from-left duration-200">
                    <input type="date" value={vendorStartDate} onChange={e => setVendorStartDate(e.target.value)} className="bg-transparent text-[10px] font-black p-1 outline-none" />
                    <span className="text-brand-brown/20">-</span>
                    <input type="date" value={vendorEndDate} onChange={e => setVendorEndDate(e.target.value)} className="bg-transparent text-[10px] font-black p-1 outline-none" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Grid: Vendors List (Left/Left-Center) and Item-to-Vendor Mapping (Right/Right-Center) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* COLUMN 1: Vendors List (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white p-8 rounded-[3rem] border border-brand-stone shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-brand-brown uppercase italic">Registered Suppliers</h3>
                    <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
                      Manage vendors, manufacturers and suppliers
                    </p>
                  </div>
                  <button 
                    onClick={openAddVendorModal}
                    className="bg-brand-brown text-brand-yellow px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform"
                  >
                    Add Vendor
                  </button>
                </div>

                {vendors.length === 0 ? (
                  <div className="p-16 text-center text-brand-brown/10 uppercase font-black text-xs tracking-[0.3em]">
                    No vendors registered yet
                  </div>
                ) : (
                  <div className="divide-y divide-brand-stone">
                    {vendors.map((v) => {
                      // Find items mapped to this vendor
                      const mappedItems = centralStock.filter(item => 
                        vendorMappings.some(m => m.item_id === item.id && m.vendor_id === v.id)
                      );

                      const unpaidItemsForVendor = vendorProcurements.filter(p => 
                        p.vendor === v.name && 
                        p.is_paid === false && 
                        p.is_voided !== true
                      );
                      const filteredUnpaidItemsForVendor = filterUnpaidProcurements(unpaidItemsForVendor);
                      const unpaidTotalForVendor = filteredUnpaidItemsForVendor.reduce((sum, p) => sum + (p.total_cost || 0), 0);
                      const unpaidCountForVendor = filteredUnpaidItemsForVendor.length;

                      return (
                        <div key={v.id} className="py-6 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="space-y-2 flex-grow">
                            <div className="flex items-center gap-2">
                              <h4 className="text-lg font-black text-brand-brown">{v.name}</h4>
                              {v.contact_person && (
                                <span className="px-2.5 py-0.5 bg-brand-stone text-brand-brown/70 text-[8px] font-black uppercase rounded-md">
                                  {v.contact_person}
                                </span>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-brand-brown/60 font-medium">
                              {v.phone && (
                                <p className="flex items-center gap-1.5">
                                  <span className="font-bold">Phone:</span> {v.phone}
                                </p>
                              )}
                              {v.email && (
                                <p className="flex items-center gap-1.5">
                                  <span className="font-bold">Email:</span> {v.email}
                                </p>
                              )}
                              {v.address && (
                                <p className="sm:col-span-2 flex items-start gap-1.5 mt-0.5">
                                  <span className="font-bold flex-shrink-0">Address:</span> {v.address}
                                </p>
                              )}
                            </div>

                            {/* Mapped Items Badges */}
                            {mappedItems.length > 0 && (
                              <div className="pt-2">
                                <p className="text-[8px] font-black text-brand-brown/30 uppercase tracking-widest mb-1">
                                  Mapped Items:
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {mappedItems.map(item => (
                                    <span key={item.id} className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[8px] font-bold rounded-md">
                                      {item.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Unpaid Items Collapsible Section */}
                            {unpaidItemsForVendor.length > 0 ? (
                              <div className="pt-2">
                                <button
                                  onClick={() => setExpandedVendorUnpaidId(expandedVendorUnpaidId === v.id ? null : v.id)}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-[9px] font-black uppercase tracking-wider text-amber-800 transition-all cursor-pointer"
                                >
                                  <span>⚠️ {unpaidCountForVendor} Unpaid {unpaidCountForVendor === 1 ? 'Item' : 'Items'} (₹{unpaidTotalForVendor.toLocaleString()})</span>
                                  <span className="text-[8px] font-bold">{expandedVendorUnpaidId === v.id ? '▲ Hide' : '▼ See Items'}</span>
                                </button>
                                
                                {expandedVendorUnpaidId === v.id && (() => {
                                  const selectedIds = selectedProcurementIds[v.id] ?? filteredUnpaidItemsForVendor.map(item => item.id);
                                  
                                  const subcatLabels: Record<string, string> = {
                                    momo: 'Momo',
                                    buns: 'Burger Buns',
                                    cola: 'Cola',
                                    drinks: 'Drinks',
                                    syrups: 'Syrups',
                                    sauces: 'Sauces',
                                    packaging: 'Packaging',
                                    'oil-butter': 'Oil & Butter',
                                    spices: 'Spices',
                                    fries: 'Fries',
                                    veggies: 'Veggies',
                                    others: 'Others'
                                  };

                                  // Group filtered unpaid items by subcategory
                                  const groups: Record<string, typeof filteredUnpaidItemsForVendor> = {};
                                  filteredUnpaidItemsForVendor.forEach(item => {
                                    const subcat = getItemSubcategory(item.item_name, item.item_id);
                                    if (!groups[subcat]) {
                                      groups[subcat] = [];
                                    }
                                    groups[subcat].push(item);
                                  });

                                  const groupKeys = Object.keys(groups).sort();

                                  return (
                                    <div className="mt-3 space-y-4 max-w-xl animate-in fade-in duration-200">
                                      {filteredUnpaidItemsForVendor.length > 0 && (
                                        <div className="flex justify-between items-center bg-brand-cream/30 p-3 rounded-2xl border border-brand-stone/50">
                                          <div className="flex items-center gap-2">
                                            <input 
                                              type="checkbox"
                                              checked={selectedIds.length === filteredUnpaidItemsForVendor.length && filteredUnpaidItemsForVendor.length > 0}
                                              onChange={() => {
                                                const allSelected = selectedIds.length === filteredUnpaidItemsForVendor.length;
                                                setSelectedProcurementIds(prev => ({
                                                  ...prev,
                                                  [v.id]: allSelected ? [] : filteredUnpaidItemsForVendor.map(item => item.id)
                                                }));
                                              }}
                                              className="w-4 h-4 rounded border-brand-stone text-brand-brown focus:ring-brand-yellow cursor-pointer"
                                              id={`select-all-${v.id}`}
                                            />
                                            <label htmlFor={`select-all-${v.id}`} className="text-[10px] font-black text-brand-brown uppercase tracking-wider cursor-pointer">
                                              Select All Unpaid ({selectedIds.length}/{filteredUnpaidItemsForVendor.length})
                                            </label>
                                          </div>
                                          {selectedIds.length > 0 && (
                                            <button
                                              onClick={() => {
                                                const selectedProcs = filteredUnpaidItemsForVendor.filter(item => selectedIds.includes(item.id));
                                                // If all selected belong to a single subcategory, use it. Otherwise leave empty (considers fallback or mixed)
                                                const uniqueSubcats = Array.from(new Set(selectedProcs.map(item => getItemSubcategory(item.item_name, item.item_id))));
                                                const bulkSubcat = uniqueSubcats.length === 1 ? uniqueSubcats[0] : undefined;
                                                openBulkPaymentModal(v.name, selectedProcs, bulkSubcat);
                                              }}
                                              className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-brand-brown hover:bg-brand-brown/90 text-brand-yellow shadow-sm flex items-center gap-1.5 cursor-pointer"
                                            >
                                              💸 Pay Selected (₹{filteredUnpaidItemsForVendor.filter(item => selectedIds.includes(item.id)).reduce((sum, item) => sum + (item.total_cost || 0), 0).toLocaleString()})
                                            </button>
                                          )}
                                        </div>
                                      )}

                                      {filteredUnpaidItemsForVendor.length === 0 ? (
                                        <div className="p-8 text-center text-brand-brown/40 uppercase font-black text-[9px] tracking-wider bg-white rounded-xl border border-brand-stone/30">
                                          No unpaid items found in this date range
                                        </div>
                                      ) : (
                                        <div className="space-y-4">
                                          {groupKeys.map((subcat) => {
                                            const groupItems = groups[subcat];
                                            const groupSelectedIds = groupItems.filter(item => selectedIds.includes(item.id)).map(item => item.id);
                                            const groupTotal = groupItems.reduce((sum, item) => sum + (item.total_cost || 0), 0);
                                            const groupSelectedTotal = groupItems.filter(item => selectedIds.includes(item.id)).reduce((sum, item) => sum + (item.total_cost || 0), 0);
                                            const label = subcatLabels[subcat] || subcat.toUpperCase();

                                            return (
                                              <div key={subcat} className="p-4 bg-white rounded-2xl border border-brand-stone/80 shadow-sm space-y-3">
                                                {/* Group Header as "One Bill per Subcategory" */}
                                                <div className="flex justify-between items-center pb-2 border-b border-brand-stone/30">
                                                  <div className="flex items-center gap-2">
                                                    <input 
                                                      type="checkbox"
                                                      checked={groupSelectedIds.length === groupItems.length}
                                                      onChange={() => {
                                                        const allSelectedInGroup = groupSelectedIds.length === groupItems.length;
                                                        const groupItemIds = groupItems.map(item => item.id);
                                                        const nextSelectedIds = allSelectedInGroup
                                                          ? selectedIds.filter(id => !groupItemIds.includes(id))
                                                          : Array.from(new Set([...selectedIds, ...groupItemIds]));
                                                        
                                                        setSelectedProcurementIds(prev => ({
                                                          ...prev,
                                                          [v.id]: nextSelectedIds
                                                        }));
                                                      }}
                                                      className="w-4 h-4 rounded border-brand-stone text-brand-brown focus:ring-brand-yellow cursor-pointer"
                                                      id={`select-group-${v.id}-${subcat}`}
                                                    />
                                                    <label htmlFor={`select-group-${v.id}-${subcat}`} className="text-xs font-black text-brand-brown uppercase tracking-wider cursor-pointer">
                                                      🧾 {label} Bill (₹{groupTotal.toLocaleString()})
                                                    </label>
                                                  </div>
                                                  {groupSelectedIds.length > 0 && (
                                                    <button
                                                      onClick={() => {
                                                        const selectedGroupProcs = groupItems.filter(item => selectedIds.includes(item.id));
                                                        openBulkPaymentModal(v.name, selectedGroupProcs, subcat);
                                                      }}
                                                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm cursor-pointer transition-all"
                                                    >
                                                      Pay {label} Bill (₹{groupSelectedTotal.toLocaleString()})
                                                    </button>
                                                  )}
                                                </div>

                                                {/* Group Unpaid Items List */}
                                                <div className="space-y-1.5 max-h-[150px] overflow-y-auto no-scrollbar">
                                                  {groupItems.map((item) => (
                                                    <div key={item.id} className="flex gap-3 items-center bg-brand-cream/10 p-2 rounded-xl border border-brand-stone/20 hover:bg-brand-cream/20 transition-all">
                                                      <input 
                                                        type="checkbox"
                                                        checked={selectedIds.includes(item.id)}
                                                        onChange={() => {
                                                          const nextSelected = selectedIds.includes(item.id)
                                                            ? selectedIds.filter(id => id !== item.id)
                                                            : [...selectedIds, item.id];
                                                          setSelectedProcurementIds(prev => ({
                                                            ...prev,
                                                            [v.id]: nextSelected
                                                          }));
                                                        }}
                                                        className="w-3.5 h-3.5 rounded border-brand-stone text-brand-brown focus:ring-brand-yellow cursor-pointer flex-shrink-0"
                                                      />
                                                      <div className="flex-grow flex justify-between items-center text-[11px] font-medium text-brand-brown">
                                                        <div>
                                                          <p className="font-bold text-[11px] text-brand-brown">{item.item_name}</p>
                                                          <p className="text-[9px] text-brand-brown/40 font-bold uppercase mt-0.5">
                                                            Qty: {item.quantity} {item.unit} • {new Date(item.date).toLocaleDateString([], { dateStyle: 'short' })}
                                                          </p>
                                                        </div>
                                                        <div className="text-right font-black text-brand-brown text-[11px]">
                                                          ₹{(item.total_cost ?? 0).toLocaleString()}
                                                        </div>
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            ) : (
                              <div className="pt-2">
                                <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-[9px] font-black uppercase tracking-wider text-emerald-800 inline-flex items-center gap-1">
                                  🟢 All Procurements Paid
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-1.5 self-end md:self-start flex-shrink-0">
                            <button
                              onClick={() => openEditVendorModal(v)}
                              className="px-3 py-2 text-brand-brown hover:bg-brand-brown/5 border border-transparent hover:border-brand-stone rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteVendor(v.id)}
                              className="px-3 py-2 text-brand-red hover:bg-red-50 border border-transparent hover:border-brand-red/15 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* COLUMN 2: Item-to-Vendor Mapping Table (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-8 rounded-[3rem] border border-brand-stone shadow-sm">
                <div>
                  <h3 className="text-2xl font-black text-brand-brown uppercase italic">Item-to-Vendor Mapping</h3>
                  <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1 mb-6">
                    Map hub items to auto-fill their vendor during Quick Buy restocks
                  </p>
                </div>

                {/* Filters Row */}
                <div className="flex flex-col gap-3 mb-6">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search items..."
                      value={vendorMappingSearch}
                      onChange={(e) => setVendorMappingSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-brand-cream/40 border border-brand-stone rounded-2xl text-xs font-bold text-brand-brown outline-none focus:ring-2 focus:ring-brand-yellow"
                    />
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-brown/40">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    {vendorMappingSearch && (
                      <button
                        onClick={() => setVendorMappingSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-brown/40 hover:text-brand-brown text-xs font-bold"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <select
                    value={vendorMappingSubcategoryFilter}
                    onChange={(e) => {
                      setVendorMappingSubcategoryFilter(e.target.value);
                      setBulkVendorId('');
                    }}
                    className="w-full p-3 bg-brand-cream/40 border border-brand-stone rounded-2xl text-xs font-bold text-brand-brown outline-none focus:ring-2 focus:ring-brand-yellow"
                  >
                    <option value="all">All Subcategories</option>
                    <optgroup label="Category A (Auto Deduct)">
                      <option value="momo">🥟 Momo Types</option>
                      <option value="buns">🍔 Burger Buns</option>
                      <option value="cola">🥤 Cola</option>
                      <option value="drinks">🍹 Drinks / Beverages</option>
                    </optgroup>
                    <optgroup label="Category B (Packets)">
                      <option value="syrups">🍹 Syrups</option>
                      <option value="sauces">🥫 Sauces / Dips</option>
                      <option value="packaging">📦 Packaging Materials</option>
                      <option value="oil-butter">🧈 Oil & Butter</option>
                      <option value="spices">🌶️ Spices</option>
                      <option value="fries">🍟 French Fries</option>
                      <option value="others">🏷️ Others</option>
                    </optgroup>
                    <optgroup label="Category C (Raw Ingredients)">
                      <option value="veggies">🥬 Veggies / Ingredients</option>
                    </optgroup>
                  </select>

                  {vendorMappingSubcategoryFilter !== 'all' && (
                    <div className="p-4 bg-brand-yellow/10 border border-brand-yellow/30 rounded-2xl flex flex-col gap-3 mt-1 animate-in slide-in-from-top-2 duration-300">
                      <p className="text-[9px] font-black text-brand-brown uppercase tracking-widest">
                        ⚡ Quick Bulk Subcategory Mapper
                      </p>
                      
                      {bulkFeedback && (
                        <div className={`p-3 rounded-xl text-[10px] font-bold ${
                          bulkFeedback.type === 'success' 
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                            : bulkFeedback.type === 'error'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : 'bg-blue-50 text-blue-800 border border-blue-200'
                        }`}>
                          {bulkFeedback.message}
                        </div>
                      )}

                      {isBulkMappingInProgress ? (
                        <div className="flex items-center justify-center py-4 gap-2">
                          <svg className="w-5 h-5 animate-spin text-brand-brown" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span className="text-[10px] font-black uppercase text-brand-brown tracking-widest">Applying Mapping...</span>
                        </div>
                      ) : bulkMappingConfirm ? (
                        (() => {
                          const targetItems = centralStock.filter(item => 
                            getItemSubcategory(item.name, item.id, item.category) === vendorMappingSubcategoryFilter
                          );
                          const vendorName = bulkVendorId === 'CLEAR_ALL_MAPPINGS' 
                            ? 'Unmapped' 
                            : vendors.find(v => v.id === bulkVendorId)?.name || 'Selected Vendor';

                          return (
                            <div className="space-y-3 p-3 bg-white/60 rounded-xl border border-brand-stone/30">
                              <p className="text-[10px] font-black uppercase tracking-wider text-brand-brown">
                                Confirm Bulk Action
                              </p>
                              <p className="text-[11px] text-brand-brown/80 font-bold leading-normal">
                                {bulkVendorId === 'CLEAR_ALL_MAPPINGS'
                                  ? `This will remove vendor mapping for all ${targetItems.length} items in "${vendorMappingSubcategoryFilter.toUpperCase()}" subcategory.`
                                  : `This will map all ${targetItems.length} items in "${vendorMappingSubcategoryFilter.toUpperCase()}" subcategory to "${vendorName}".`}
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={async () => {
                                    setIsBulkMappingInProgress(true);
                                    setBulkMappingConfirm(false);
                                    setBulkFeedback(null);
                                    try {
                                      if (bulkVendorId === 'CLEAR_ALL_MAPPINGS') {
                                        for (const item of targetItems) {
                                          await removeVendorMapping(item.id);
                                        }
                                      } else {
                                        for (const item of targetItems) {
                                          await mapItemToVendor(item.id, bulkVendorId);
                                        }
                                      }
                                      await fetchData(true);
                                      setBulkFeedback({
                                        type: 'success',
                                        message: `Successfully mapped all ${targetItems.length} items in "${vendorMappingSubcategoryFilter.toUpperCase()}" subcategory!`
                                      });
                                      setBulkVendorId('');
                                      // Auto clear feedback after 5 seconds
                                      setTimeout(() => setBulkFeedback(null), 5000);
                                    } catch (err: any) {
                                      setBulkFeedback({
                                        type: 'error',
                                        message: "Failed to map: " + err.message
                                      });
                                    } finally {
                                      setIsBulkMappingInProgress(false);
                                    }
                                  }}
                                  className="flex-grow bg-brand-brown text-brand-yellow py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                                >
                                  Yes, Apply Now
                                </button>
                                <button
                                  onClick={() => {
                                    setBulkMappingConfirm(false);
                                  }}
                                  className="px-4 py-2.5 bg-transparent border border-brand-stone/40 text-brand-brown/70 hover:bg-black/5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[10px] text-brand-brown/70 leading-relaxed font-bold">
                            Assign all items in "{vendorMappingSubcategoryFilter.toUpperCase()}" to:
                          </p>
                          <div className="flex gap-2">
                            <select
                              value={bulkVendorId}
                              onChange={(e) => {
                                setBulkVendorId(e.target.value);
                                setBulkFeedback(null);
                              }}
                              className="flex-grow p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-brand-brown outline-none focus:ring-2 focus:ring-brand-yellow"
                            >
                              <option value="">Choose vendor...</option>
                              <option value="CLEAR_ALL_MAPPINGS">-- Unmap All Items --</option>
                              {vendors.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                setBulkFeedback(null);
                                if (!bulkVendorId) {
                                  setBulkFeedback({ type: 'error', message: "Please select a vendor or clear option first." });
                                  return;
                                }
                                
                                const targetItems = centralStock.filter(item => 
                                  getItemSubcategory(item.name, item.id, item.category) === vendorMappingSubcategoryFilter
                                );
                                
                                if (targetItems.length === 0) {
                                  setBulkFeedback({ type: 'info', message: `No items found in "${vendorMappingSubcategoryFilter.toUpperCase()}" subcategory.` });
                                  return;
                                }

                                setBulkMappingConfirm(true);
                              }}
                              className="bg-brand-brown text-brand-yellow px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all flex-shrink-0"
                            >
                              Map All
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {centralStock.length === 0 ? (
                  <div className="p-16 text-center text-brand-brown/10 uppercase font-black text-xs tracking-[0.3em]">
                    No items in central stock
                  </div>
                ) : (
                  (() => {
                    const filteredList = centralStock.filter(item => {
                      if (vendorMappingSearch.trim() !== '') {
                        const terms = vendorMappingSearch.toLowerCase().split(/\s+/).filter(Boolean);
                        const nameLower = item.name.toLowerCase();
                        const matchesAll = terms.every(term => nameLower.includes(term));
                        if (!matchesAll) return false;
                      }
                      if (vendorMappingSubcategoryFilter !== 'all') {
                        if (getItemSubcategory(item.name, item.id, item.category) !== vendorMappingSubcategoryFilter) {
                          return false;
                        }
                      }
                      return true;
                    });

                    if (filteredList.length === 0) {
                      return (
                        <div className="p-16 text-center text-brand-brown/30 uppercase font-black text-xs tracking-wider">
                          No matching items found
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4 max-h-[500px] overflow-y-auto no-scrollbar pr-1">
                        {filteredList.map((item) => {
                          const currentMapping = vendorMappings.find(m => m.item_id === item.id);
                          return (
                            <div key={item.id} className="p-4 bg-brand-cream/40 rounded-2xl border border-brand-stone flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <p className="font-bold text-brand-brown text-sm leading-snug">{item.name}</p>
                                <p className="text-[8px] font-black text-brand-brown/30 uppercase tracking-widest mt-0.5">{item.category} • {item.unit}</p>
                              </div>
                              
                              <select
                                value={currentMapping?.vendor_id || ''}
                                onChange={(e) => handleMapItem(item.id, e.target.value)}
                                className="p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-brand-brown outline-none focus:ring-2 focus:ring-brand-yellow min-w-[140px] max-w-[200px]"
                              >
                                <option value="">No vendor mapped</option>
                                {vendors.map(v => (
                                  <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </div>
            </div>

          </div>
        </section>
      ) : activeTab === 'CONSUMPTION' ? (
        <ConsumptionReport 
          startDate={startDate}
          endDate={endDate}
          selectedStore={isAdmin ? (selectedStation?.name || 'All') : (user.stationName || 'All')}
        />
      ) : null}

      {/* Modals */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[110] p-4">
          <div className="bg-brand-cream rounded-[4rem] p-12 w-full max-w-md border-8 border-brand-yellow shadow-2xl">
            <h3 className="text-3xl font-black mb-8 italic text-brand-brown uppercase italic">Register {materialCategory}</h3>
            <div className="space-y-5">
              <input type="text" placeholder="Item Name" value={newItemName} onChange={e => setNewItemName(e.target.value)} className={inputClasses} />
              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Unit of Measurement</label>
                <select value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)} className={inputClasses}>
                  <option value="pcs">Pieces</option>
                  <option value="kg">KG</option>
                  <option value="ltr">LTR</option>
                  <option value="pkt">Packets</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Subcategory (Required)</label>
                <select 
                  value={newItemSubcategory} 
                  onChange={e => setNewItemSubcategory(e.target.value)} 
                  className={inputClasses}
                >
                  <option value="">Select Subcategory...</option>
                  {getSubcategoriesForCategory(materialCategory).map(sub => (
                    <option key={sub.id} value={sub.id}>
                      {sub.icon} {sub.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Primary Vendor (Optional)</label>
                <select 
                  value={newItemVendor} 
                  onChange={e => setNewItemVendor(e.target.value)} 
                  className={inputClasses}
                >
                  <option value="">No Primary Vendor / Local Market</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>
                      🤝 {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Transaction Date (Default: Today)</label>
                <input 
                  type="date" 
                  value={transactionDate} 
                  onChange={e => setTransactionDate(e.target.value)} 
                  className={inputClasses} 
                />
              </div>
              <button onClick={handleAddNewItem} className="w-full py-5 bg-brand-brown text-brand-yellow rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-transform">Add to Hub Database</button>
              <button onClick={() => setIsAddItemModalOpen(false)} className="w-full py-2 text-brand-brown/40 font-black uppercase text-[11px] tracking-widest">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {isCreateSubcategoryModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
          <div className="bg-brand-cream rounded-[4rem] p-12 w-full max-w-md border-8 border-brand-yellow shadow-2xl">
            <h3 className="text-3xl font-black mb-8 italic text-brand-brown uppercase">
              Create Subcategory
            </h3>
            <p className="text-[10px] font-bold text-brand-brown/60 uppercase tracking-wider mb-6">
              Parent Category: {newSubcatParent}
            </p>
            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Subcategory Name *</label>
                <input 
                  type="text" 
                  placeholder="e.g. Garlic & Cheese" 
                  value={newSubcatName} 
                  onChange={e => setNewSubcatName(e.target.value)} 
                  className={inputClasses} 
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Emoji Icon</label>
                <input 
                  type="text" 
                  placeholder="e.g. 🥟" 
                  value={newSubcatIcon} 
                  onChange={e => setNewSubcatIcon(e.target.value)} 
                  className={inputClasses} 
                />
              </div>

              <button 
                onClick={handleCreateSubcategory} 
                className="w-full py-5 bg-brand-brown text-brand-yellow rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-transform mt-2"
              >
                Create Subcategory
              </button>
              
              <button 
                onClick={() => setIsCreateSubcategoryModalOpen(false)} 
                className="w-full py-2 text-brand-brown/40 font-black uppercase text-[11px] tracking-widest"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditItemModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
          <div className="bg-brand-cream rounded-[4rem] p-12 w-full max-w-md border-8 border-brand-yellow shadow-2xl">
            <h3 className="text-3xl font-black mb-8 italic text-brand-brown uppercase">
              Edit Stock Item
            </h3>
            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Item Name *</label>
                <input 
                  type="text" 
                  placeholder="Item Name" 
                  value={editItemName} 
                  onChange={e => setEditItemName(e.target.value)} 
                  className={inputClasses} 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Unit *</label>
                  <select 
                    value={editItemUnit} 
                    onChange={e => setEditItemUnit(e.target.value)} 
                    className={inputClasses}
                  >
                    <option value="pcs">Pieces</option>
                    <option value="kg">KG</option>
                    <option value="ltr">LTR</option>
                    <option value="pkt">Packets</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Parent Category</label>
                  <select 
                    value={editItemCategory} 
                    onChange={e => {
                      const cat = e.target.value as MaterialCategory;
                      setEditItemCategory(cat);
                      // Auto-select first subcategory of new category
                      const subcats = getSubcategoriesForCategory(cat);
                      if (subcats.length > 0) {
                        setEditItemSubcategory(subcats[0].id);
                      } else {
                        setEditItemSubcategory('');
                      }
                    }} 
                    className={inputClasses}
                  >
                    <option value="MOMO">Category A (MOMO)</option>
                    <option value="PACKET">Category B (PACKET)</option>
                    <option value="INGREDIENT">Category C (INGREDIENT)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Subcategory *</label>
                <select 
                  value={editItemSubcategory} 
                  onChange={e => setEditItemSubcategory(e.target.value)} 
                  className={inputClasses}
                >
                  <option value="">Select Subcategory...</option>
                  {getSubcategoriesForCategory(editItemCategory).map(sub => (
                    <option key={sub.id} value={sub.id}>
                      {sub.icon} {sub.label}
                    </option>
                  ))}
                </select>
              </div>

              <button 
                onClick={handleSaveEditItem} 
                className="w-full py-5 bg-brand-brown text-brand-yellow rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-transform mt-2"
                disabled={isLoading}
              >
                {isLoading ? "Saving..." : "Save Changes"}
              </button>
              
              <button 
                onClick={() => { setIsEditItemModalOpen(false); setEditingItem(null); }} 
                className="w-full py-2 text-brand-brown/40 font-black uppercase text-[11px] tracking-widest"
                disabled={isLoading}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddVendorModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
          <div className="bg-brand-cream rounded-[4rem] p-12 w-full max-w-md border-8 border-brand-yellow shadow-2xl">
            <h3 className="text-3xl font-black mb-8 italic text-brand-brown uppercase">
              {editingVendorId ? 'Edit Vendor Details' : 'Register New Vendor'}
            </h3>
            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Vendor Name *</label>
                <input 
                  type="text" 
                  placeholder="e.g. Peak Momo Supplies Ltd." 
                  value={newVendorName} 
                  onChange={e => setNewVendorName(e.target.value)} 
                  className={inputClasses} 
                />
              </div>
              
              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Contact Person</label>
                <input 
                  type="text" 
                  placeholder="e.g. John Doe" 
                  value={newVendorContact} 
                  onChange={e => setNewVendorContact(e.target.value)} 
                  className={inputClasses} 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Phone</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 9876543210" 
                    value={newVendorPhone} 
                    onChange={e => setNewVendorPhone(e.target.value)} 
                    className={inputClasses} 
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Email</label>
                  <input 
                    type="email" 
                    placeholder="e.g. contact@vendor.com" 
                    value={newVendorEmail} 
                    onChange={e => setNewVendorEmail(e.target.value)} 
                    className={inputClasses} 
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Address</label>
                <textarea 
                  placeholder="e.g. 123 Industrial Area, Phase 1" 
                  value={newVendorAddress} 
                  onChange={e => setNewVendorAddress(e.target.value)} 
                  className={`${inputClasses} h-20 resize-none py-3`} 
                />
              </div>

              <button 
                onClick={handleAddVendor} 
                className="w-full py-5 bg-brand-brown text-brand-yellow rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-transform mt-2"
              >
                {editingVendorId ? 'Update Vendor' : 'Register Vendor'}
              </button>
              
              <button 
                onClick={() => setIsAddVendorModalOpen(false)} 
                className="w-full py-2 text-brand-brown/40 font-black uppercase text-[11px] tracking-widest"
              >
                Dismiss
              </button>
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
              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Transaction Date</label>
                <input 
                  type="date" 
                  value={transactionDate} 
                  onChange={e => setTransactionDate(e.target.value)} 
                  className={inputClasses} 
                />
              </div>
              <input type="number" placeholder={`Quantity (${selectedItem?.unit})`} value={qty} onChange={e => setQty(e.target.value)} className={inputClasses} />
              <input type="number" placeholder="Total Bill (₹)" value={cost} onChange={e => setCost(e.target.value)} className={inputClasses} />
              
              <div>
                {vendors.length > 0 ? (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 block">Vendor / Supplier</label>
                    <select 
                      value={vendors.some(v => v.name === vendor) ? vendor : vendor ? 'CUSTOM_VENDOR_VAL' : ''} 
                      onChange={e => {
                        if (e.target.value === 'CUSTOM_VENDOR_VAL') {
                          setVendor('');
                        } else {
                          setVendor(e.target.value);
                        }
                      }} 
                      className={inputClasses}
                    >
                      <option value="">Select Vendor...</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.name}>{v.name}</option>
                      ))}
                      <option value="CUSTOM_VENDOR_VAL">-- Custom / Other Vendor --</option>
                    </select>
                    {(!vendors.some(v => v.name === vendor) && vendor !== '') && (
                      <input 
                        type="text" 
                        placeholder="Enter Vendor Name" 
                        value={vendor} 
                        onChange={e => setVendor(e.target.value)} 
                        className={`${inputClasses} mt-2`} 
                      />
                    )}
                  </div>
                ) : (
                  <input type="text" placeholder="Vendor Name" value={vendor} onChange={e => setVendor(e.target.value)} className={inputClasses} />
                )}
              </div>
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
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Reason Category</label>
                <select
                  value={adjustCategoryReason}
                  onChange={e => setAdjustCategoryReason(e.target.value as any)}
                  className={inputClasses}
                >
                  <option value="rotten stock">Rotten Stock</option>
                  <option value="quantity mismatch">Quantity Mismatch</option>
                  <option value="others">Others</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Adjustment Details</label>
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
              <button onClick={() => { setIsAdjustModalOpen(false); setSelectedItem(null); setAdjustReason(''); setAdjustValue(''); setAdjustCategoryReason('others'); }} className="w-full py-2 text-brand-brown/40 font-black uppercase text-[11px] tracking-widest text-center">Cancel</button>
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

      {isPaymentModalOpen && selectedProcurementForPayment && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[120] p-4 overflow-y-auto">
          <div className="bg-brand-cream rounded-[3rem] p-8 md:p-10 w-full max-w-xl border-8 border-brand-brown shadow-2xl my-8">
            <h3 className="text-2xl md:text-3xl font-black mb-2 italic text-brand-brown uppercase">
              {paymentMode === 'PAY' ? '💸 Process' : '✏️ Edit'} <span className="text-brand-red">Payment</span>
            </h3>
            <p className="text-[10px] font-black text-brand-brown/40 uppercase mb-6 tracking-widest">
              Manage financial transactions for this procurement
            </p>

            {/* Quick summary of the item */}
            <div className="bg-white p-5 rounded-2xl border border-brand-stone mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest block">Item & Vendor</span>
                  <p className="text-sm font-black text-brand-brown">{selectedProcurementForPayment.item_name}</p>
                  <p className="text-xs font-bold text-brand-red uppercase">{selectedProcurementForPayment.vendor || 'Local Market'}</p>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest block">Total Cost & Qty</span>
                  <p className="text-lg font-black text-brand-brown">₹{(selectedProcurementForPayment.total_cost ?? 0).toLocaleString()}</p>
                  <p className="text-xs font-bold text-brand-brown/60">{selectedProcurementForPayment.quantity} {selectedProcurementForPayment.unit}</p>
                </div>
              </div>
            </div>

            {/* Mode selection if already Paid */}
            {selectedProcurementForPayment.is_paid && (
              <div className="grid grid-cols-2 gap-2 mb-6 bg-brand-brown/5 p-1 rounded-2xl border border-brand-brown/10">
                <button
                  type="button"
                  onClick={() => setPaymentMode('EDIT')}
                  className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    paymentMode === 'EDIT'
                      ? 'bg-brand-brown text-brand-yellow shadow'
                      : 'text-brand-brown/60 hover:bg-brand-brown/5'
                  }`}
                >
                  ✏️ Edit Payment Info
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('UNPAY')}
                  className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    paymentMode === 'UNPAY'
                      ? 'bg-brand-red text-white shadow'
                      : 'text-brand-red/60 hover:bg-brand-red/5'
                  }`}
                >
                  ⚠️ Mark as Unpaid
                </button>
              </div>
            )}

            {/* Form inputs */}
            <div className="space-y-4">
              {paymentMode !== 'UNPAY' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Paid At (Date & Time)</label>
                      <input 
                        type="datetime-local" 
                        value={paymentDate} 
                        onChange={e => setPaymentDate(e.target.value)} 
                        className={inputClasses} 
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Amount Paid (₹)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="Amount" 
                        value={paymentAmount} 
                        onChange={e => setPaymentAmount(e.target.value)} 
                        className={inputClasses} 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Payment Mode</label>
                    <div className="grid grid-cols-4 gap-2">
                      {['CASH', 'CARD', 'UPI', 'SPLIT'].map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          className={`py-3 px-1 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                            paymentMethod === method
                              ? 'bg-brand-brown text-brand-yellow border-brand-brown shadow-sm scale-[1.02]'
                              : 'bg-white text-brand-brown/60 border-brand-stone hover:bg-brand-stone/10'
                          }`}
                        >
                          {method === 'CASH' ? '💵 Cash' : method === 'CARD' ? '💳 Card' : method === 'UPI' ? '📱 UPI' : '🥞 Split'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {paymentMethod === 'SPLIT' && (
                    <div className="bg-white p-4 rounded-2xl border border-brand-stone space-y-3 mt-3 animate-in fade-in duration-200">
                      <p className="text-[9px] font-black uppercase text-brand-brown/50 tracking-wider">Split Payment Details</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[8px] font-black text-brand-brown/60 uppercase ml-1 mb-1 block">Cash Amount (₹)</label>
                          <input 
                            type="number" 
                            step="0.01"
                            placeholder="Cash Portion" 
                            value={singleSplitCash} 
                            onChange={e => {
                              const cash = e.target.value;
                              setSingleSplitCash(cash);
                              const total = parseFloat(paymentAmount) || 0;
                              const cashVal = parseFloat(cash) || 0;
                              if (total >= cashVal) {
                                setSingleSplitUpi((total - cashVal).toFixed(2));
                              }
                            }} 
                            className={inputClasses} 
                          />
                        </div>
                        <div>
                          <label className="text-[8px] font-black text-brand-brown/60 uppercase ml-1 mb-1 block">UPI Amount (₹)</label>
                          <input 
                            type="number" 
                            step="0.01"
                            placeholder="UPI Portion" 
                            value={singleSplitUpi} 
                            onChange={e => {
                              const upi = e.target.value;
                              setSingleSplitUpi(upi);
                              const total = parseFloat(paymentAmount) || 0;
                              const upiVal = parseFloat(upi) || 0;
                              if (total >= upiVal) {
                                setSingleSplitCash((total - upiVal).toFixed(2));
                              }
                            }} 
                            className={inputClasses} 
                          />
                        </div>
                      </div>
                      <p className="text-[9px] font-bold text-brand-brown/40 italic">
                        The sum must equal the total amount ₹{(parseFloat(paymentAmount) || 0).toLocaleString()}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Registered / Paid By</label>
                    <input 
                      type="text" 
                      placeholder="Username / Staff Name" 
                      value={paidByInput} 
                      onChange={e => setPaidByInput(e.target.value)} 
                      className={inputClasses} 
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Payment notes / Reference</label>
                    <input 
                      type="text" 
                      placeholder="e.g. GPay, Cash, Bank Transfer, Txn ID..." 
                      value={paymentNotesInput} 
                      onChange={e => setPaymentNotesInput(e.target.value)} 
                      className={inputClasses} 
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Paid From (Fund Source)</label>
                    <select 
                      value={singleFundSource} 
                      onChange={e => setSingleFundSource(e.target.value)} 
                      className={inputClasses}
                    >
                      <option value="Revenue">Revenue</option>
                      <option value="Investment Fund">Investment Fund</option>
                    </select>
                  </div>

                  {/* Bill Attachment / Camera Section */}
                  <div className="bg-brand-stone/10 p-4 rounded-2xl border border-brand-stone/30 space-y-3">
                    <label className="text-[10px] font-black text-brand-brown uppercase tracking-wider block">📸 Bill Copy / Receipt Photo</label>
                    
                    {capturedBillUrl ? (
                      <div className="space-y-2">
                        <div className="relative inline-block">
                          <img 
                            src={capturedBillUrl} 
                            alt="Bill Copy" 
                            className="w-full max-h-40 object-contain rounded-xl border border-brand-stone/50 bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => setCapturedBillUrl(null)}
                            className="absolute -top-2 -right-2 bg-brand-red text-white w-6 h-6 rounded-full font-bold flex items-center justify-center text-xs shadow hover:bg-red-700 hover:scale-110 transition-transform cursor-pointer"
                            title="Remove Photo"
                          >
                            ×
                          </button>
                        </div>
                        <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">✓ Photo attached successfully</p>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          onClick={() => startCamera(false)}
                          className="flex-1 py-3 bg-brand-brown text-brand-yellow rounded-xl font-bold uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 border border-brand-brown hover:scale-102 transition-all shadow-md cursor-pointer"
                        >
                          📷 Capture Photo
                        </button>
                        
                        <label className="flex-1 py-3 bg-white text-brand-brown rounded-xl font-bold uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 border border-brand-stone hover:bg-brand-stone/10 cursor-pointer text-center shadow-md">
                          📁 Upload File
                          <input 
                            type="file" 
                            accept="image/*" 
                            capture="environment" 
                            onChange={(e) => handleFileChange(e, false)} 
                            className="hidden" 
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {paymentMode === 'EDIT' && (
                    <div>
                      <label className="text-[9px] font-black text-brand-red uppercase ml-2 mb-1 block">Reason for Editing (Required for History)</label>
                      <input 
                        type="text" 
                        placeholder="Why is this payment details being changed?" 
                        value={paymentActionReason} 
                        onChange={e => setPaymentActionReason(e.target.value)} 
                        className={`${inputClasses} border-brand-red/30 focus:ring-brand-red`} 
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-red-50 p-5 rounded-2xl border border-brand-red/20 space-y-3">
                  <p className="text-xs font-bold text-brand-red uppercase leading-relaxed">
                    ⚠️ You are changing this transaction to UNPAID. All registered payment information will be removed, and a reversal entry will be logged.
                  </p>
                  <div>
                    <label className="text-[9px] font-black text-brand-red uppercase ml-2 mb-1 block">Reason for Reversal (Required)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Bounced cheque, wrong payment registered..." 
                      value={paymentActionReason} 
                      onChange={e => setPaymentActionReason(e.target.value)} 
                      className={`${inputClasses} border-brand-red focus:ring-brand-red`} 
                    />
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  onClick={() => { setIsPaymentModalOpen(false); setSelectedProcurementForPayment(null); }} 
                  className="py-4 bg-white text-brand-brown rounded-2xl font-black uppercase tracking-widest text-[10px] border border-brand-stone hover:bg-brand-stone/10"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSavePaymentDetails} 
                  className={`py-4 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${
                    paymentMode === 'UNPAY' ? 'bg-brand-red hover:bg-red-700' : 'bg-brand-brown text-brand-yellow hover:scale-102'
                  }`}
                >
                  {paymentMode === 'PAY' ? 'Confirm Payment' : paymentMode === 'EDIT' ? 'Save Changes' : 'Confirm Reversal'}
                </button>
              </div>
            </div>

            {/* Audit History Timeline */}
            <div className="mt-8 pt-6 border-t border-brand-stone">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-brand-brown/60 mb-4">📜 Payment Audit Trail & Edit History</h4>
              
              {(!selectedProcurementForPayment.payment_history || selectedProcurementForPayment.payment_history.length === 0) ? (
                <div className="text-center py-4 bg-brand-stone/5 rounded-xl border border-dashed border-brand-stone/30">
                  <p className="text-[10px] font-black text-brand-brown/30 uppercase tracking-widest">No previous payment events logged.</p>
                </div>
              ) : (
                <div className="relative border-l border-brand-stone pl-4 ml-2 space-y-4 max-h-[160px] overflow-y-auto no-scrollbar">
                  {selectedProcurementForPayment.payment_history.map((hist: any, hIdx: number) => (
                    <div key={hIdx} className="relative">
                      {/* Bullet */}
                      <span className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-brand-cream ${
                        hist.event === 'payment' ? 'bg-emerald-500' : hist.event === 'edit' ? 'bg-amber-500' : 'bg-brand-red'
                      }`} />
                      
                      <div className="bg-white p-3 rounded-xl border border-brand-stone/40 text-[11px] text-brand-brown font-medium">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-black uppercase text-[9px] tracking-widest text-brand-brown/50">
                            {hist.event === 'payment' ? '🟢 Payment Logged' : hist.event === 'edit' ? '✏️ Payment Edited' : '🔴 Marked Unpaid'}
                          </span>
                          <span className="text-[9px] text-brand-brown/40 font-bold">
                            {new Date(hist.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                        {hist.amount !== undefined && (
                          <p className="font-black mb-1 text-xs text-brand-brown">Amount: ₹{(hist.amount ?? 0).toLocaleString()}</p>
                        )}
                        {hist.payment_mode && (
                          <p className="text-[10px] text-brand-brown/70 font-bold">Mode: <span className="font-black text-brand-brown">{hist.payment_mode.toUpperCase()}</span></p>
                        )}
                        {hist.notes && (
                          <p className="text-[10px] text-brand-brown/70 font-bold">Ref/Notes: <span className="font-black text-brand-brown">{hist.notes}</span></p>
                        )}
                        {hist.reason && (
                          <p className="text-[10px] italic text-brand-red font-semibold mt-1">Reason: "{hist.reason}"</p>
                        )}
                        {hist.bill_image && (
                          <div className="mt-2 pt-2 border-t border-brand-stone/30">
                            <p className="text-[9px] font-black uppercase tracking-wider text-brand-brown/40 mb-1">📸 Attached Bill Copy:</p>
                            <img 
                              src={hist.bill_image} 
                              alt="Captured Bill" 
                              className="w-24 h-24 object-cover rounded-xl border border-brand-stone hover:scale-105 transition-transform cursor-pointer"
                              onClick={() => {
                                const w = window.open();
                                if (w) {
                                  w.document.write(`<img src="${hist.bill_image}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                                  w.document.title = "Attached Bill Copy";
                                } else {
                                  alert("Could not open image in new tab. Please allow popups.");
                                }
                              }}
                            />
                          </div>
                        )}
                        <p className="text-[8px] font-black uppercase text-brand-brown/30 mt-1.5 tracking-wider">By {hist.performed_by || 'Unknown'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Payment Modal */}
      {isBulkPaymentModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[120] p-4 overflow-y-auto">
          <div className="bg-brand-cream rounded-[3rem] p-8 md:p-10 w-full max-w-xl border-8 border-brand-brown shadow-2xl my-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl md:text-3xl font-black mb-2 italic text-brand-brown uppercase">
              💸 Bulk <span className="text-brand-red">Payment</span>
            </h3>
            <p className="text-[10px] font-black text-brand-brown/40 uppercase mb-6 tracking-widest">
              Process combined payments for multiple procurements from this vendor
            </p>

            {/* Quick summary of the items */}
            <div className="bg-white p-5 rounded-2xl border border-brand-stone mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest block">Supplier / Vendor</span>
                  <p className="text-lg font-black text-brand-brown">{bulkPaymentVendorName}</p>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest block">Total Pending Amount</span>
                  <p className="text-2xl font-black text-brand-red">₹{bulkPaymentTotal.toLocaleString()}</p>
                  <p className="text-xs font-bold text-brand-brown/60">{bulkPaymentIds.length} procurements combined</p>
                </div>
              </div>
            </div>

            {/* Form inputs */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Paid At (Date & Time)</label>
                  <input 
                    type="datetime-local" 
                    value={bulkPaymentDate} 
                    onChange={e => setBulkPaymentDate(e.target.value)} 
                    className={inputClasses} 
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Registered / Paid By</label>
                  <input 
                    type="text" 
                    placeholder="Username / Staff Name" 
                    value={bulkPaidBy} 
                    onChange={e => setBulkPaidBy(e.target.value)} 
                    className={inputClasses} 
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Payment Mode</label>
                <div className="grid grid-cols-4 gap-2">
                  {['CASH', 'CARD', 'UPI', 'SPLIT'].map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setBulkPaymentMethod(method)}
                      className={`py-3 px-1 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                        bulkPaymentMethod === method
                          ? 'bg-brand-brown text-brand-yellow border-brand-brown shadow-sm scale-[1.02]'
                          : 'bg-white text-brand-brown/60 border-brand-stone hover:bg-brand-stone/10'
                      }`}
                    >
                      {method === 'CASH' ? '💵 Cash' : method === 'CARD' ? '💳 Card' : method === 'UPI' ? '📱 UPI' : '🥞 Split'}
                    </button>
                  ))}
                </div>
              </div>

              {bulkPaymentMethod === 'SPLIT' && (
                <div className="bg-white p-4 rounded-2xl border border-brand-stone space-y-3 mt-3 animate-in fade-in duration-200">
                  <p className="text-[9px] font-black uppercase text-brand-brown/50 tracking-wider">Split Payment Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[8px] font-black text-brand-brown/60 uppercase ml-1 mb-1 block">Cash Amount (₹)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="Cash Portion" 
                        value={bulkSplitCash} 
                        onChange={e => {
                          const cash = e.target.value;
                          setBulkSplitCash(cash);
                          const total = bulkPaymentTotal;
                          const cashVal = parseFloat(cash) || 0;
                          if (total >= cashVal) {
                            setBulkSplitUpi((total - cashVal).toFixed(2));
                          }
                        }} 
                        className={inputClasses} 
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-brand-brown/60 uppercase ml-1 mb-1 block">UPI Amount (₹)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="UPI Portion" 
                        value={bulkSplitUpi} 
                        onChange={e => {
                          const upi = e.target.value;
                          setBulkSplitUpi(upi);
                          const total = bulkPaymentTotal;
                          const upiVal = parseFloat(upi) || 0;
                          if (total >= upiVal) {
                            setBulkSplitCash((total - upiVal).toFixed(2));
                          }
                        }} 
                        className={inputClasses} 
                      />
                    </div>
                  </div>
                  <p className="text-[9px] font-bold text-brand-brown/40 italic">
                    The sum must equal the total amount ₹{bulkPaymentTotal.toLocaleString()}
                  </p>
                </div>
              )}

              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Payment notes / Reference</label>
                <input 
                  type="text" 
                  placeholder="e.g. Bulk GPay, Cash, Bank Transfer, Ref ID..." 
                  value={bulkPaymentNotes} 
                  onChange={e => setBulkPaymentNotes(e.target.value)} 
                  className={inputClasses} 
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-brand-brown/60 uppercase ml-2 mb-1 block">Paid From (Fund Source)</label>
                <select 
                  value={bulkFundSource} 
                  onChange={e => setBulkFundSource(e.target.value)} 
                  className={inputClasses}
                >
                  <option value="Revenue">Revenue</option>
                  <option value="Investment Fund">Investment Fund</option>
                </select>
              </div>

              {/* Bulk Bill Attachment / Camera Section */}
              <div className="bg-brand-stone/10 p-4 rounded-2xl border border-brand-stone/30 space-y-3">
                <label className="text-[10px] font-black text-brand-brown uppercase tracking-wider block">📸 Bill Copy / Receipt Photo</label>
                
                {bulkCapturedBillUrl ? (
                  <div className="space-y-2">
                    <div className="relative inline-block">
                      <img 
                        src={bulkCapturedBillUrl} 
                        alt="Bill Copy" 
                        className="w-full max-h-40 object-contain rounded-xl border border-brand-stone/50 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setBulkCapturedBillUrl(null)}
                        className="absolute -top-2 -right-2 bg-brand-red text-white w-6 h-6 rounded-full font-bold flex items-center justify-center text-xs shadow hover:bg-red-700 hover:scale-110 transition-transform cursor-pointer"
                        title="Remove Photo"
                      >
                        ×
                      </button>
                    </div>
                    <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">✓ Photo attached successfully</p>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => startCamera(true)}
                      className="flex-1 py-3 bg-brand-brown text-brand-yellow rounded-xl font-bold uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 border border-brand-brown hover:scale-102 transition-all shadow-md cursor-pointer"
                    >
                      📷 Capture Photo
                    </button>
                    
                    <label className="flex-1 py-3 bg-white text-brand-brown rounded-xl font-bold uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 border border-brand-stone hover:bg-brand-stone/10 cursor-pointer text-center shadow-md">
                      📁 Upload File
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment" 
                        onChange={(e) => handleFileChange(e, true)} 
                        className="hidden" 
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  onClick={() => { setIsBulkPaymentModalOpen(false); }} 
                  className="py-4 bg-white text-brand-brown rounded-2xl font-black uppercase tracking-widest text-[10px] border border-brand-stone hover:bg-brand-stone/10 cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveBulkPayment} 
                  className="py-4 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all bg-brand-brown text-brand-yellow hover:scale-[1.02] cursor-pointer"
                >
                  Confirm Bulk Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Viewfinder Overlay */}
      {showLiveCamera && (
        <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[200] p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl flex flex-col">
            {/* Header */}
            <div className="p-4 bg-zinc-950/80 border-b border-zinc-800 flex justify-between items-center text-white">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-400">📷 Real-time Camera Viewfinder</span>
              <button 
                onClick={stopCamera} 
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 font-bold text-lg flex items-center justify-center transition-all cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Video Feed */}
            <div className="relative bg-black aspect-video flex items-center justify-center">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              {/* Overlay frames */}
              <div className="absolute inset-6 border-2 border-dashed border-white/20 rounded-2xl pointer-events-none flex items-center justify-center">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest bg-black/40 px-3 py-1 rounded-full">Align Receipt inside frame</span>
              </div>
            </div>

            {/* Controls */}
            <div className="p-6 bg-zinc-950 border-t border-zinc-800 flex flex-col items-center justify-center gap-4">
              {/* Shutter Button */}
              <button
                onClick={capturePhoto}
                className="w-16 h-16 rounded-full bg-white border-4 border-zinc-300 active:scale-95 transition-transform flex items-center justify-center hover:bg-zinc-100 cursor-pointer shadow-xl"
                title="Capture Photo"
              >
                <span className="w-10 h-10 rounded-full bg-zinc-900" />
              </button>
              
              <button
                onClick={stopCamera}
                className="text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel / Close Camera
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
