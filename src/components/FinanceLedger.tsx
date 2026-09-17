import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Plus, 
  RefreshCw, 
  Calendar, 
  AlertCircle, 
  Link,
  Info,
  Trash2,
  Upload,
  BarChart2,
  PieChart as PieChartIcon,
  TrendingUp,
  Filter,
  ArrowRight,
  TrendingDown,
  Database,
  Pencil,
  History,
  Download,
  Briefcase,
  Camera,
  RotateCw,
  CameraOff,
  PlusCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  FileText,
  X,
  Search,
  Eye,
  Receipt,
  Check,
  Layers,
  ChevronDown,
  ChevronRight,
  Printer,
  ShoppingBag,
  Building2,
  Flame,
  ArrowDownLeft,
  ArrowUpRight,
  Activity,
  Wallet
} from 'lucide-react';
import { 
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { supabase } from '../utils/supabase';
import { addTodaysRevenueToLedger } from '../utils/storage';
import ConfirmationModal from './ConfirmationModal';

interface TabInfo {
  title: string;
  id: number;
}

interface FinanceLedgerProps {
  user: {
    id: string;
    username: string;
    role: 'ADMIN' | 'COFOUNDER' | 'STORE_MANAGER' | 'CASHIER';
    stationName?: string;
  };
}

const DEBIT_CATEGORIES = [
  'gas', 'rent', 'salary', 'momo', 'store investment', 'zomato commission and ads', 'debt',
  'grocery', 'soft drinks', 'ice', 'packaging', 'packaginf', 'veggies', 'burger buns', 'chicken', 'other stock', 'syrups', 'others'
];

const CREDIT_CATEGORIES = [
  'revenue', 'zomato payout', 'investment', 'debt', 'previous balance', 'other'
];

const DEFAULT_STOCK_SUBCATEGORIES = [
  { id: 'momo', label: 'Momo', icon: '🥟', category: 'MOMO' },
  { id: 'buns', label: 'Burger Buns', icon: '🍔', category: 'MOMO' },
  { id: 'cola', label: 'Cola', icon: '🥤', category: 'MOMO' },
  { id: 'drinks', label: 'Drinks', icon: '🍹', category: 'MOMO' },
  { id: 'syrups', label: 'Syrups', icon: '🍹', category: 'PACKET' },
  { id: 'sauces', label: 'Sauces', icon: '🥫', category: 'PACKET' },
  { id: 'packaging', label: 'Packaging', icon: '📦', category: 'PACKET' },
  { id: 'oil-butter', label: 'Oil & Butter', icon: '🧈', category: 'PACKET' },
  { id: 'spices', label: 'Spices', icon: '🌶️', category: 'PACKET' },
  { id: 'fries', label: 'Fries', icon: '🍟', category: 'PACKET' },
  { id: 'chicken', label: 'Chicken', icon: '🍗', category: 'INGREDIENT' },
  { id: 'ice', label: 'Ice', icon: '🧊', category: 'INGREDIENT' },
  { id: 'veggies', label: 'Veggies', icon: '🥬', category: 'INGREDIENT' },
  { id: 'other-stock', label: 'Other Stock', icon: '📦', category: 'PACKET' },
  { id: 'others', label: 'Others', icon: '🏷️', category: 'PACKET' },
  { id: 'others-ingredient', label: 'Others (Ingredient)', icon: '🏷️', category: 'INGREDIENT' },
];

const DEFAULT_CATEGORY_MAPPINGS: Record<string, string[]> = {
  'grocery': ['spices', 'oil-butter', 'fries', 'sauces'],
  'soft drinks': ['cola', 'drinks'],
  'syrups': ['syrups'],
  'packaging': ['packaging'],
  'packaginf': ['packaging'],
  'veggies': ['veggies'],
  'momo': ['momo'],
  'burger buns': ['buns'],
  'chicken': ['chicken'],
  'ice': ['ice'],
  'other stock': ['other-stock'],
  'others': ['others', 'others-ingredient'],
};

// 10 Canonical COGS Meta (Direct Cost of Goods Sold)
const CANONICAL_COGS_META: Record<string, { label: string; icon: string; code: string }> = {
  'momo': { label: 'Momo Ingredients & Stock', icon: '🥟', code: 'COGS-01' },
  'grocery': { label: 'Grocery (Spices, Oil, Sauces)', icon: '🥫', code: 'COGS-02' },
  'soft drinks': { label: 'Soft Drinks & Beverages', icon: '🥤', code: 'COGS-03' },
  'ice': { label: 'Ice & Cooling Blocks', icon: '🧊', code: 'COGS-04' },
  'packaging': { label: 'Packaging Materials', icon: '📦', code: 'COGS-05' },
  'veggies': { label: 'Fresh Vegetables & Greens', icon: '🥬', code: 'COGS-06' },
  'burger buns': { label: 'Burger Buns & Breads', icon: '🍔', code: 'COGS-07' },
  'chicken': { label: 'Chicken & Fresh Meat', icon: '🍗', code: 'COGS-08' },
  'other stock': { label: 'Other Stock & Inventory', icon: '🏷️', code: 'COGS-09' },
  'syrups': { label: 'Flavored Syrups & Concentrates', icon: '🍹', code: 'COGS-10' },
};

const HEADERS = [
  "Date",
  "Credit cash",
  "details",
  "credit bank",
  "details",
  "debit cash",
  "details",
  "debit bank",
  "details",
  "Total rem cash ",
  "Total bank ",
  "Total All"
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

export const FinanceLedger: React.FC<FinanceLedgerProps> = ({ user }) => {
  // Dynamic categories and mappings
  const [debitCategories, setDebitCategories] = useState<string[]>(DEBIT_CATEGORIES);
  const [creditCategories, setCreditCategories] = useState<string[]>(CREDIT_CATEGORIES);
  const [categoryMappings, setCategoryMappings] = useState<Record<string, string[]>>({});
  
  // Category & Subcategory management UI states
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [modalActiveTab, setModalActiveTab] = useState<'subcategories' | 'ledger-categories'>('subcategories');

  // Subcategory Creation & Management States
  const [customStockSubcategories, setCustomStockSubcategories] = useState<any[]>([]);
  const [newSubcatName, setNewSubcatName] = useState('');
  const [newSubcatIcon, setNewSubcatIcon] = useState('🏷️');
  const [newSubcatParent, setNewSubcatParent] = useState<'PACKET' | 'INGREDIENT' | 'MOMO'>('PACKET');
  const [newSubcatExpenseMapping, setNewSubcatExpenseMapping] = useState('');
  const [isCreatingSubcat, setIsCreatingSubcat] = useState(false);
  const [subcatSearchTerm, setSubcatSearchTerm] = useState('');
  const [subcatCategoryFilter, setSubcatCategoryFilter] = useState<'ALL' | 'PACKET' | 'INGREDIENT' | 'MOMO'>('ALL');
  const [subcatMappingFilter, setSubcatMappingFilter] = useState<'ALL' | 'MAPPED' | 'UNMAPPED' | 'CUSTOM'>('ALL');
  const [editingSubcat, setEditingSubcat] = useState<{ id: string; label: string; icon: string; category: string; isCustom?: boolean } | null>(null);
  const [subcatFeedback, setSubcatFeedback] = useState<{ id: string; text: string } | null>(null);
  const [subcatNotification, setSubcatNotification] = useState<string | null>(null);

  // Deleted/hidden subcategories tracking (supports deleting any subcategory)
  const [deletedSubcategories, setDeletedSubcategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('deleted_subcategories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Category management UI states
  const [newLedgerCatName, setNewLedgerCatName] = useState('');
  const [newLedgerCatType, setNewLedgerCatType] = useState<'credit' | 'debit'>('debit');
  const [newLedgerCatMappings, setNewLedgerCatMappings] = useState<string[]>([]);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Load custom subcategories from storage
  const loadCustomStockSubcategories = React.useCallback(() => {
    try {
      const saved = localStorage.getItem('custom_created_subcategories');
      if (saved) {
        setCustomStockSubcategories(JSON.parse(saved));
      } else {
        setCustomStockSubcategories([]);
      }
    } catch (e) {
      console.error("Error reading custom subcategories:", e);
    }
  }, []);

  useEffect(() => {
    loadCustomStockSubcategories();
  }, [loadCustomStockSubcategories]);

  const getStockSubcategoriesList = React.useCallback(() => {
    const list: Array<{ id: string; label: string; icon: string; category: string; isCustom?: boolean }> = 
      DEFAULT_STOCK_SUBCATEGORIES
        .filter(item => !deletedSubcategories.includes(item.id))
        .map(item => ({ ...item, isCustom: false }));

    customStockSubcategories.forEach((s: any) => {
      if (deletedSubcategories.includes(s.id)) return;
      const parent = s.parentCategory || s.category || 'PACKET';
      const existing = list.find(item => item.id === s.id && item.category === parent);
      if (!existing) {
        list.push({
          id: s.id,
          label: s.label,
          icon: s.icon || '🏷️',
          category: parent,
          isCustom: true
        });
      } else {
        existing.isCustom = true;
      }
    });
    return list;
  }, [customStockSubcategories, deletedSubcategories]);

  // Determine which expense category a subcategory maps to
  const getSubcategoryMappedExpense = React.useCallback((subId: string): string => {
    if (categoryMappings['__unmapped__']?.includes(subId)) {
      return '';
    }
    for (const [catName, mappedList] of Object.entries(categoryMappings)) {
      if (catName !== '__unmapped__' && Array.isArray(mappedList) && mappedList.includes(subId)) {
        return catName;
      }
    }
    // Fall back to default mapping if not explicitly unmapped
    for (const [catName, mappedList] of Object.entries(DEFAULT_CATEGORY_MAPPINGS)) {
      if (mappedList.includes(subId)) {
        return catName;
      }
    }
    return '';
  }, [categoryMappings]);

  // Handle live updates to a subcategory's expense mapping
  const handleUpdateSubcategoryMapping = async (subId: string, targetExpenseCat: string, subLabel?: string) => {
    const currentMappings: Record<string, string[]> = { ...categoryMappings };

    // Remove subId from ALL categories
    for (const [cat, list] of Object.entries(currentMappings)) {
      if (Array.isArray(list)) {
        currentMappings[cat] = list.filter(id => id !== subId);
      }
    }

    if (targetExpenseCat && targetExpenseCat !== 'unmapped') {
      if (!currentMappings[targetExpenseCat]) {
        currentMappings[targetExpenseCat] = [];
      }
      if (!currentMappings[targetExpenseCat].includes(subId)) {
        currentMappings[targetExpenseCat].push(subId);
      }
    } else {
      if (!currentMappings['__unmapped__']) {
        currentMappings['__unmapped__'] = [];
      }
      if (!currentMappings['__unmapped__'].includes(subId)) {
        currentMappings['__unmapped__'].push(subId);
      }
    }

    setCategoryMappings(currentMappings);

    // Save to localStorage
    try {
      const payload = {
        debit: debitCategories,
        credit: creditCategories,
        mappings: currentMappings
      };
      localStorage.setItem('custom_ledger_categories', JSON.stringify(payload));
    } catch (e) {
      console.error("Failed to save custom ledger categories locally:", e);
    }

    // Save to Supabase
    try {
      if (targetExpenseCat && targetExpenseCat !== 'unmapped') {
        await supabase.from('ledger_categories').upsert({
          name: targetExpenseCat,
          type: 'debit',
          mapped_stock_subcategories: currentMappings[targetExpenseCat] || []
        }, { onConflict: 'name' });
      }
    } catch (err) {
      console.warn("Supabase category update warning:", err);
    }

    const label = subLabel || subId;
    const msg = targetExpenseCat && targetExpenseCat !== 'unmapped'
      ? `Mapped "${label}" → ${targetExpenseCat.toUpperCase()}`
      : `Unmapped "${label}" (Defaults to OTHERS)`;

    setSubcatFeedback({ id: subId, text: targetExpenseCat && targetExpenseCat !== 'unmapped' ? targetExpenseCat : 'Unmapped' });
    setSubcatNotification(msg);
    setTimeout(() => {
      setSubcatFeedback(null);
      setSubcatNotification(null);
    }, 3000);
  };

  // Create a brand new custom stock subcategory
  const handleCreateCustomSubcategory = async (arg?: React.FormEvent | { name: string; icon: string; parentCategory: 'PACKET' | 'INGREDIENT' | 'MOMO'; expenseMapping: string }) => {
    if (arg && 'preventDefault' in arg) {
      arg.preventDefault();
    }
    const isDirectArg = arg && !('preventDefault' in arg);
    const cleanName = (isDirectArg ? arg.name : newSubcatName).trim();
    const subIcon = (isDirectArg ? arg.icon : newSubcatIcon).trim() || '🏷️';
    const subParent = (isDirectArg ? arg.parentCategory : newSubcatParent);
    const subExpenseMapping = (isDirectArg ? arg.expenseMapping : newSubcatExpenseMapping);

    if (!cleanName) {
      alert("Subcategory name is required.");
      return;
    }
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) {
      alert("Please provide a valid subcategory name.");
      return;
    }

    const existingList = getStockSubcategoriesList();
    if (existingList.some(s => s.id === slug && s.category === subParent)) {
      alert(`A subcategory with this name already exists under ${subParent}.`);
      return;
    }

    setIsCreatingSubcat(true);
    try {
      const saved = localStorage.getItem('custom_created_subcategories') || '[]';
      const list = JSON.parse(saved);
      const newSubcatItem = {
        id: slug,
        label: cleanName,
        icon: subIcon,
        parentCategory: subParent,
        category: subParent,
        isCustom: true
      };
      list.push(newSubcatItem);
      localStorage.setItem('custom_created_subcategories', JSON.stringify(list));
      setCustomStockSubcategories(list);

      // If user selected an expense category mapping, map it immediately
      if (subExpenseMapping && subExpenseMapping !== 'unmapped') {
        await handleUpdateSubcategoryMapping(slug, subExpenseMapping, cleanName);
      }

      setNewSubcatName('');
      setNewSubcatIcon('🏷️');
      setNewSubcatExpenseMapping('');
      setSubcatNotification(`Subcategory "${cleanName}" created successfully!`);
      setTimeout(() => setSubcatNotification(null), 3500);
    } catch (err: any) {
      console.error("Failed to create custom subcategory:", err);
      alert(`Failed to create subcategory: ${err.message || 'Unknown error'}`);
    } finally {
      setIsCreatingSubcat(false);
    }
  };

  // Delete stock subcategory (custom or built-in)
  const handleDeleteSubcategory = async (subId: string, subLabel: string, isCustom?: boolean) => {
    if (!window.confirm(`Delete subcategory "${subLabel}"?\n\nThis will remove it from warehouse stock options and remove all associated expense category mappings.`)) {
      return;
    }

    try {
      if (isCustom) {
        const saved = localStorage.getItem('custom_created_subcategories') || '[]';
        const list = JSON.parse(saved);
        const updatedList = list.filter((s: any) => s.id !== subId);
        localStorage.setItem('custom_created_subcategories', JSON.stringify(updatedList));
        setCustomStockSubcategories(updatedList);
      }
      // Also add to deletedSubcategories list so it is filtered out
      const updatedDeleted = Array.from(new Set([...deletedSubcategories, subId]));
      localStorage.setItem('deleted_subcategories', JSON.stringify(updatedDeleted));
      setDeletedSubcategories(updatedDeleted);

      await handleUpdateSubcategoryMapping(subId, 'unmapped', subLabel);

      setSubcatNotification(`Subcategory "${subLabel}" has been deleted.`);
      setTimeout(() => setSubcatNotification(null), 3500);
    } catch (e: any) {
      console.error("Failed to delete subcategory:", e);
      alert(`Error deleting subcategory: ${e.message || 'Unknown error'}`);
    }
  };

  const handleDeleteCustomSubcategory = (subId: string, subLabel: string) => {
    return handleDeleteSubcategory(subId, subLabel, true);
  };

  const handleRestoreDefaultSubcategories = () => {
    localStorage.removeItem('deleted_subcategories');
    setDeletedSubcategories([]);
    setSubcatNotification('All default built-in subcategories have been restored.');
    setTimeout(() => setSubcatNotification(null), 3500);
  };

  // Save edit on subcategory (custom or built-in override)
  const handleSaveEditSubcategory = async (editedSub?: { id: string; label: string; icon: string; category: string; isCustom?: boolean }) => {
    const target = editedSub || editingSubcat;
    if (!target) return;
    const cleanName = target.label.trim();
    if (!cleanName) {
      alert("Subcategory name cannot be empty.");
      return;
    }

    try {
      const saved = localStorage.getItem('custom_created_subcategories') || '[]';
      const list = JSON.parse(saved);
      const existingIdx = list.findIndex((s: any) => s.id === target.id);
      if (existingIdx >= 0) {
        list[existingIdx] = {
          ...list[existingIdx],
          label: cleanName,
          icon: target.icon || '🏷️',
          parentCategory: target.category,
          category: target.category,
          isCustom: true
        };
      } else {
        list.push({
          id: target.id,
          label: cleanName,
          icon: target.icon || '🏷️',
          parentCategory: target.category,
          category: target.category,
          isCustom: true
        });
      }
      localStorage.setItem('custom_created_subcategories', JSON.stringify(list));
      setCustomStockSubcategories(list);
      setEditingSubcat(null);
      setSubcatNotification(`Updated subcategory "${cleanName}".`);
      setTimeout(() => setSubcatNotification(null), 3500);
    } catch (e: any) {
      console.error("Failed to edit subcategory:", e);
      alert(`Error editing subcategory: ${e.message || 'Unknown error'}`);
    }
  };

  const fetchLedgerCategories = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ledger_categories')
        .select('*')
        .order('name');
      
      if (error) {
        console.warn("Could not fetch custom ledger categories from Supabase, loading fallback:", error);
        const savedCustom = localStorage.getItem('custom_ledger_categories');
        if (savedCustom) {
          const { debit, credit, mappings } = JSON.parse(savedCustom);
          if (debit) setDebitCategories(debit);
          if (credit) setCreditCategories(credit);
          if (mappings) setCategoryMappings({ ...DEFAULT_CATEGORY_MAPPINGS, ...mappings });
        } else {
          setCategoryMappings(DEFAULT_CATEGORY_MAPPINGS);
        }
        return;
      }

      if (data && data.length > 0) {
        const debit = data.filter(c => c.type === 'debit').map(c => c.name);
        const credit = data.filter(c => c.type === 'credit').map(c => c.name);
        const mappings: Record<string, string[]> = {};
        data.forEach(c => {
          mappings[c.name] = c.mapped_stock_subcategories || [];
        });

        // Ensure defaults are included
        const finalDebit = Array.from(new Set([...DEBIT_CATEGORIES, ...debit]));
        const finalCredit = Array.from(new Set([...CREDIT_CATEGORIES, ...credit]));
        const mergedMappings = { ...DEFAULT_CATEGORY_MAPPINGS, ...mappings };

        setDebitCategories(finalDebit);
        setCreditCategories(finalCredit);
        setCategoryMappings(mergedMappings);

        try {
          localStorage.setItem('custom_ledger_categories', JSON.stringify({
            debit: finalDebit,
            credit: finalCredit,
            mappings: mergedMappings
          }));
        } catch (storageErr) {
          console.error("Failed to cache custom ledger categories:", storageErr);
        }
      } else {
        // Fallback to defaults
        setDebitCategories(DEBIT_CATEGORIES);
        setCreditCategories(CREDIT_CATEGORIES);
        setCategoryMappings(DEFAULT_CATEGORY_MAPPINGS);
      }
    } catch (e) {
      console.error("Error in fetchLedgerCategories:", e);
    }
  }, []);

  useEffect(() => {
    fetchLedgerCategories();
  }, [fetchLedgerCategories]);

  const handleSaveLedgerCategory = async () => {
    const nameClean = newLedgerCatName.trim().toLowerCase();
    if (!nameClean) {
      alert("Category name cannot be empty.");
      return;
    }

    setIsSavingCategory(true);
    try {
      const { error } = await supabase
        .from('ledger_categories')
        .upsert({
          name: nameClean,
          type: newLedgerCatType,
          mapped_stock_subcategories: newLedgerCatMappings
        }, { onConflict: 'name' });

      if (error) {
        console.warn("Supabase upsert failed, saving to LocalStorage fallback:", error);
        
        // Fallback to local storage
        const currentDebit = [...debitCategories];
        const currentCredit = [...creditCategories];
        const currentMappings = { ...categoryMappings };

        if (newLedgerCatType === 'debit') {
          if (!currentDebit.includes(nameClean)) currentDebit.push(nameClean);
        } else {
          if (!currentCredit.includes(nameClean)) currentCredit.push(nameClean);
        }
        currentMappings[nameClean] = newLedgerCatMappings;

        const payload = {
          debit: currentDebit,
          credit: currentCredit,
          mappings: currentMappings
        };
        localStorage.setItem('custom_ledger_categories', JSON.stringify(payload));
        
        setDebitCategories(currentDebit);
        setCreditCategories(currentCredit);
        setCategoryMappings(currentMappings);
      } else {
        // Reload from db
        await fetchLedgerCategories();
      }

      setNewLedgerCatName('');
      setNewLedgerCatMappings([]);
      alert(`Ledger category "${nameClean}" saved successfully!`);
    } catch (e: any) {
      console.error("Failed to save ledger category:", e);
      alert(`Error saving: ${e.message}`);
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteLedgerCategory = async (name: string) => {
    if (!window.confirm(`Are you sure you want to delete ledger category "${name}"?`)) return;

    try {
      const { error } = await supabase
        .from('ledger_categories')
        .delete()
        .eq('name', name);

      if (error) {
        console.warn("Supabase delete failed, removing from LocalStorage fallback:", error);
        
        // Fallback removal
        const finalDebit = debitCategories.filter(c => c !== name);
        const finalCredit = creditCategories.filter(c => c !== name);
        const finalMappings = { ...categoryMappings };
        delete finalMappings[name];

        const payload = {
          debit: finalDebit,
          credit: finalCredit,
          mappings: finalMappings
        };
        localStorage.setItem('custom_ledger_categories', JSON.stringify(payload));

        setDebitCategories(finalDebit);
        setCreditCategories(finalCredit);
        setCategoryMappings(finalMappings);
      } else {
        await fetchLedgerCategories();
      }
      alert(`Ledger category "${name}" deleted.`);
    } catch (e: any) {
      console.error(e);
      alert(`Failed to delete: ${e.message}`);
    }
  };

  // Database configuration state
  const [availableTabs, setAvailableTabs] = useState<TabInfo[]>([]);

  // Current selected month & year (for tabs)
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState<string>(MONTHS[new Date().getMonth()]);
  const selectedYear = currentYear;

  // Active tab sheet state
  const activeTabName = `${selectedMonth} ${selectedYear}`;
  const [sheetRows, setSheetRows] = useState<any[][]>([]);
  const [isSheetLoading, setIsSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Form states and config
  const [txType, setTxType] = useState<'credit' | 'debit'>('credit');
  const [txMethod, setTxMethod] = useState<'cash' | 'bank'>('cash');
  const [txCategory, setTxCategory] = useState<string>(CREDIT_CATEGORIES[0]);
  const [txNotes, setTxNotes] = useState<string>('');
  const [txAmount, setTxAmount] = useState<number>(0);
  const [txDate, setTxDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isAddingTx, setIsAddingTx] = useState(false);
  const [txFundingSource, setTxFundingSource] = useState<'revenue' | 'investment'>('revenue');
  const [editTxFundingSource, setEditTxFundingSource] = useState<'revenue' | 'investment'>('revenue');

  // Dashboard & Analytics states
  const [activeLedgerView, setActiveLedgerView] = useState<'sheet' | 'pnl' | 'dashboard'>('sheet');
  const [expandedPnlSections, setExpandedPnlSections] = useState<Record<string, boolean>>({
    revenue: false,
    cogs: false,
    variable: false,
    fixed: false,
    other: false,
    cfInflows: false,
    cfOutflows: false
  });

  const togglePnlSection = (section: string) => {
    setExpandedPnlSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  const [dashboardPeriod, setDashboardPeriod] = useState<'month' | 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState<string>(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [pieFocusType, setPieFocusType] = useState<'revenue' | 'expense'>('expense');
  const [revSortField, setRevSortField] = useState<'amount' | 'name' | 'percentage' | 'transactions'>('amount');
  const [revSortOrder, setRevSortOrder] = useState<'desc' | 'asc'>('desc');
  const [expSortField, setExpSortField] = useState<'amount' | 'name' | 'percentage' | 'transactions'>('amount');
  const [expSortOrder, setExpSortOrder] = useState<'desc' | 'asc'>('desc');

  // Category Ledger Entries Drilldown Modal States
  const [selectedCategoryDetails, setSelectedCategoryDetails] = useState<{
    categoryName: string;
    type: 'credit' | 'debit';
  } | null>(null);
  const [activePreviewBillUrl, setActivePreviewBillUrl] = useState<string | null>(null);
  const [catModalSearch, setCatModalSearch] = useState('');
  const [catModalMethodFilter, setCatModalMethodFilter] = useState<'all' | 'cash' | 'bank'>('all');
  const [catModalBillFilter, setCatModalBillFilter] = useState<'all' | 'with_bill' | 'no_bill'>('all');
  const [catModalScope, setCatModalScope] = useState<'period' | 'all'>('period');

  // Bill file states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Camera Capture States
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('environment');
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Custom Confirmation Dialog States
  const [deletingTxIdx, setDeletingTxIdx] = useState<number | null>(null);

  // Balance edits
  const [isEditingOpening, setIsEditingOpening] = useState(false);
  const [editOpeningCash, setEditOpeningCash] = useState<number>(0);
  const [editOpeningBank, setEditOpeningBank] = useState<number>(0);
  const [editOpeningReason, setEditOpeningReason] = useState<string>('');
  const [isSavingOpening, setIsSavingOpening] = useState(false);

  // Editing standard transactions states
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [editTxDate, setEditTxDate] = useState<string>('');
  const [editTxType, setEditTxType] = useState<'credit' | 'debit'>('credit');
  const [editTxMethod, setEditTxMethod] = useState<'cash' | 'bank'>('cash');
  const [editTxAmount, setEditTxAmount] = useState<number>(0);
  const [editTxDetails, setEditTxDetails] = useState<string>('');
  const [editTxReason, setEditTxReason] = useState<string>('');
  const [isSavingTxEdit, setIsSavingTxEdit] = useState<boolean>(false);

  // Soft Deletion Reason
  const [deleteReasonText, setDeleteReasonText] = useState<string>('');

  // Deleted / Voided log list representation
  const [deletedRecords, setDeletedRecords] = useState<any[]>([]);
  const [showDeletedLog, setShowDeletedLog] = useState<boolean>(false);
  const [activeAuditRec, setActiveAuditRec] = useState<any | null>(null);

  const loadDeletedRecords = async () => {
    try {
      let query = supabase
        .from('finance_ledger')
        .select('*')
        .eq('is_deleted', true)
        .order('deleted_at', { ascending: false });

      if (dashboardPeriod === 'month') {
        query = query.eq('tab_name', activeTabName);
      } else {
        const { start, end } = getDashboardDateRange();
        query = query.gte('date', start).lte('date', end);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDeletedRecords(data || []);
    } catch (err) {
      console.error('Error fetching deleted items:', err);
    }
  };

  // Calculations from sheet
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [openingBank, setOpeningBank] = useState<number>(0);
  const [totalCreditCash, setTotalCreditCash] = useState<number>(0);
  const [totalCreditBank, setTotalCreditBank] = useState<number>(0);
  const [totalDebitCash, setTotalDebitCash] = useState<number>(0);
  const [totalDebitBank, setTotalDebitBank] = useState<number>(0);

  // Fetch available month tabs on mount and whenever months are initialized
  useEffect(() => {
    loadSpreadsheetMeta();
  }, []);

  // Effect to load active tab whenever we switch months/years, date interval, or availableTabs list updates
  useEffect(() => {
    loadSheetRows();
  }, [selectedMonth, selectedYear, availableTabs, dashboardPeriod, customStartDate, customEndDate]);

  // Re-sync categories when active transaction type changes or creditCategories/debitCategories updates
  useEffect(() => {
    if (txType === 'credit') {
      setTxCategory(creditCategories[0] || 'revenue');
    } else {
      setTxCategory(debitCategories[0] || 'others');
    }
  }, [txType, creditCategories, debitCategories]);

  // Reactive camera media lifecycle hook
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    
    const initCamera = async () => {
      if (!isCameraModalOpen) return;
      setCameraError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: cameraFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
        
        activeStream = stream;
        setCameraStream(stream);

        // Enumerate devices to check for multiple cameras
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        setHasMultipleCameras(videoDevices.length > 1);
      } catch (err: any) {
        console.error("Camera access error:", err);
        setCameraError(err.message || "Failed to access camera. Please confirm permissions and connection.");
      }
    };

    if (isCameraModalOpen) {
      initCamera();
    }

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
      setCameraStream(null);
    };
  }, [isCameraModalOpen, cameraFacingMode]);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // Play stream through video tag once stream is available
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream, isCameraModalOpen]);

  // Load existing tabs (equivalent inside Supabase flow)
  const loadSpreadsheetMeta = async () => {
    try {
      const { data, error } = await supabase
        .from('finance_ledger')
        .select('tab_name')
        .eq('is_opening', true)
        .neq('is_deleted', true);

      if (error) throw error;

      const tabTitles = Array.from(new Set((data || []).map(r => r.tab_name)));
      const tabs = tabTitles.map((t, idx) => ({
        title: t,
        id: idx
      }));
      setAvailableTabs(tabs);

      // Auto-select latest available initialized month tab if current month is not yet initialized
      if (tabs.length > 0) {
        const currentActive = `${selectedMonth} ${selectedYear}`;
        if (!tabs.some(t => t.title === currentActive)) {
          const lastTab = tabs[tabs.length - 1].title;
          const parts = lastTab.split(' ');
          if (parts.length >= 2 && MONTHS.includes(parts[0])) {
            setSelectedMonth(parts[0]);
            setSelectedYear(parseInt(parts[1]) || selectedYear);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching meta:', err);
    }
  };

  // Manual revenue addition state
  const [isAddingRevenue, setIsAddingRevenue] = useState(false);

  const handleAddTodaysRevenue = async () => {
    setIsAddingRevenue(true);
    try {
      const res = await addTodaysRevenueToLedger();
      if (res.success) {
        alert(res.message);
        await loadSheetRows();
      } else {
        alert("Error: " + res.message);
      }
    } catch (err: any) {
      console.error("Failed to add today's revenue:", err);
      alert("Failed to add revenue: " + (err?.message || "Unknown error"));
    } finally {
      setIsAddingRevenue(false);
    }
  };

  // Load rows from Supabase on-the-fly and compute running balances to feed into grid
  const loadSheetRows = async () => {
    setIsSheetLoading(true);
    setSheetError(null);
    try {
      let data: any[] = [];
      let openingCashVal = 0;
      let openingBankVal = 0;
      let defaultDate = '';

      if (dashboardPeriod === 'month') {
        const { data: monthData, error } = await supabase
          .from('finance_ledger')
          .select('*')
          .eq('tab_name', activeTabName)
          .neq('is_deleted', true)
          .order('is_opening', { ascending: false })
          .order('date', { ascending: true })
          .order('created_at', { ascending: true });

        if (error) throw error;
        data = monthData || [];

        const openingRecord = data.find(r => r.is_opening);
        openingCashVal = openingRecord ? (parseFloat(openingRecord.credit_cash) || 0) : 0;
        openingBankVal = openingRecord ? (parseFloat(openingRecord.credit_bank) || 0) : 0;
        defaultDate = `${selectedYear}-${String(MONTHS.indexOf(selectedMonth) + 1).padStart(2, '0')}-01`;
      } else {
        const { start, end } = getDashboardDateRange();
        defaultDate = start;

        // Fetch non-deleted records within date range
        const { data: rangeData, error: rangeError } = await supabase
          .from('finance_ledger')
          .select('*')
          .gte('date', start)
          .lte('date', end)
          .neq('is_deleted', true)
          .order('is_opening', { ascending: false })
          .order('date', { ascending: true })
          .order('created_at', { ascending: true });

        if (rangeError) throw rangeError;
        data = rangeData || [];

        // Check if there is an opening record within the range
        const openingRecord = data.find(r => r.is_opening);
        if (openingRecord) {
          openingCashVal = parseFloat(openingRecord.credit_cash) || 0;
          openingBankVal = parseFloat(openingRecord.credit_bank) || 0;
        } else {
          // Calculate cumulative starting balance before start date across all previous ledger records
          const { data: priorData, error: priorError } = await supabase
            .from('finance_ledger')
            .select('credit_cash, credit_bank, debit_cash, debit_bank, is_opening')
            .lt('date', start)
            .neq('is_deleted', true);

          if (!priorError && priorData && priorData.length > 0) {
            priorData.forEach(r => {
              openingCashVal += (parseFloat(r.credit_cash) || 0) - (parseFloat(r.debit_cash) || 0);
              openingBankVal += (parseFloat(r.credit_bank) || 0) - (parseFloat(r.debit_bank) || 0);
            });
          }
        }
      }

      // Also load deleted records for the audit log in background
      loadDeletedRecords();

      const periodOpeningLabel = dashboardPeriod === 'month' ? "Opening Balance" : "Period Starting Balance";

      if (!data || data.length === 0) {
        const openingRow = [
          defaultDate,
          "",
          periodOpeningLabel,
          "",
          periodOpeningLabel,
          "",
          periodOpeningLabel,
          "",
          periodOpeningLabel,
          openingCashVal,
          openingBankVal,
          openingCashVal + openingBankVal,
          "synth_opening",
          { is_opening: true, date: defaultDate, credit_cash: openingCashVal, credit_bank: openingBankVal }
        ];
        const emptyRows = [HEADERS, openingRow];
        setSheetRows(emptyRows);
        calculateSummaries(emptyRows);
        return;
      }

      const formattedRows: any[][] = [HEADERS];

      const openingRecord = data.find(r => r.is_opening);
      const transactionRecords = data.filter(r => !r.is_opening);

      const openingRow = [
        openingRecord ? openingRecord.date : defaultDate,
        "",
        periodOpeningLabel,
        "",
        periodOpeningLabel,
        "",
        periodOpeningLabel,
        "",
        periodOpeningLabel,
        openingCashVal,
        openingBankVal,
        openingCashVal + openingBankVal,
        openingRecord ? openingRecord.id : "synth_opening",
        openingRecord || { is_opening: true, date: defaultDate, credit_cash: openingCashVal, credit_bank: openingBankVal }
      ];
      formattedRows.push(openingRow);

      let currentCash = openingCashVal;
      let currentBank = openingBankVal;

      transactionRecords.forEach(rec => {
        const crCash = parseFloat(rec.credit_cash) || 0;
        const crBank = parseFloat(rec.credit_bank) || 0;
        const dbCash = parseFloat(rec.debit_cash) || 0;
        const dbBank = parseFloat(rec.debit_bank) || 0;

        currentCash = currentCash + crCash - dbCash;
        currentBank = currentBank + crBank - dbBank;

        const row = [
          rec.date,
          rec.credit_cash > 0 ? rec.credit_cash.toString() : "",
          rec.credit_cash_details || "",
          rec.credit_bank > 0 ? rec.credit_bank.toString() : "",
          rec.credit_bank_details || "",
          rec.debit_cash > 0 ? rec.debit_cash.toString() : "",
          rec.debit_cash_details || "",
          rec.debit_bank > 0 ? rec.debit_bank.toString() : "",
          rec.debit_bank_details || "",
          currentCash,
          currentBank,
          currentCash + currentBank,
          rec.id,
          rec
        ];
        formattedRows.push(row);
      });

      setSheetRows(formattedRows);
      calculateSummaries(formattedRows);
    } catch (err: any) {
      setSheetError(err.message || 'Unknown error occurred while loading ledger grid');
    } finally {
      setIsSheetLoading(false);
    }
  };

  // Help calculate summaries based on retrieved values
  const calculateSummaries = (rows: any[][]) => {
    if (rows.length < 2) {
      // No rows beyond headers or completely empty
      setOpeningCash(0);
      setOpeningBank(0);
      setTotalCreditCash(0);
      setTotalCreditBank(0);
      setTotalDebitCash(0);
      setTotalDebitBank(0);
      return;
    }

    // Row 1 is Headers
    // Row 2 is typically the "Opening Balance" row
    const openingRow = rows[1];
    const opCash = parseFloat(openingRow[9]) || 0; // Column J (0-indexed 9)
    const opBank = parseFloat(openingRow[10]) || 0; // Column K (0-indexed 10)
    setOpeningCash(opCash);
    setOpeningBank(opBank);
    setEditOpeningCash(opCash);
    setEditOpeningBank(opBank);

    // Sum transactions from Row 3 onwards
    let creditCash = 0;
    let creditBank = 0;
    let debitCash = 0;
    let debitBank = 0;

    for (let i = 2; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      
      creditCash += parseFloat(r[1]) || 0; // Column B (Credit cash)
      creditBank += parseFloat(r[3]) || 0; // Column D (credit bank)
      debitCash += parseFloat(r[5]) || 0;  // Column F (debit cash)
      debitBank += parseFloat(r[7]) || 0;  // Column H (debit bank)
    }

    setTotalCreditCash(creditCash);
    setTotalCreditBank(creditBank);
    setTotalDebitCash(debitCash);
    setTotalDebitBank(debitBank);
  };

  // Initialize a new month sheet tab with columns and starter balances
  const handleInitializeMonth = async () => {
    setIsSheetLoading(true);
    try {
      const { error } = await supabase
        .from('finance_ledger')
        .insert({
          tab_name: activeTabName,
          date: new Date().toISOString().split('T')[0],
          credit_cash: 0,
          credit_bank: 0,
          is_opening: true
        });

      if (error) throw error;

      // Refresh available tabs and reload rows
      await loadSpreadsheetMeta();
    } catch (err: any) {
      alert(`Initialization failed: ${err.message}`);
    } finally {
      setIsSheetLoading(false);
    }
  };

  // Save changes to Opening Balances
  const handleSaveOpeningBalances = async () => {
    if (!editOpeningReason.trim()) {
      alert("Please provide a proper reason for editing the opening balance.");
      return;
    }

    setIsSavingOpening(true);

    try {
      // Find the opening record id and original object from sheetRows
      const openingRow = sheetRows[1];
      const openingRecordId = openingRow[12];
      const openingRecord = openingRow[13];

      if (!openingRecordId) {
        throw new Error("Opening record ID not found");
      }

      const prevHistory = openingRecord?.edit_history || [];
      const newHistoryItem = {
        edited_at: new Date().toISOString(),
        edited_by: user.username,
        reason: editOpeningReason,
        previous_values: {
          credit_cash: parseFloat(openingRecord?.credit_cash) || 0,
          credit_bank: parseFloat(openingRecord?.credit_bank) || 0
        },
        new_values: {
          credit_cash: editOpeningCash,
          credit_bank: editOpeningBank
        }
      };

      const { error } = await supabase
        .from('finance_ledger')
        .update({
          credit_cash: editOpeningCash,
          credit_bank: editOpeningBank,
          edit_history: [...prevHistory, newHistoryItem]
        })
        .eq('id', openingRecordId);

      if (error) throw error;

      setEditOpeningReason('');
      setIsEditingOpening(false);
      await loadSheetRows();
    } catch (err: any) {
      alert(`Save opening balances failed: ${err.message}`);
    } finally {
      setIsSavingOpening(false);
    }
  };

  const handleDeleteTransaction = (idxInSlice: number) => {
    setDeleteReasonText('');
    setDeletingTxIdx(idxInSlice);
  };

  const triggerDeleteTransaction = async (idxInSlice: number) => {
    const row = sheetRows[idxInSlice + 1];
    const recordId = row[12];

    if (!recordId) return;

    if (!deleteReasonText.trim()) {
      alert("Please provide a proper reason for deleted transaction.");
      return;
    }

    setIsSheetLoading(true);
    try {
      const { error } = await supabase
        .from('finance_ledger')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          delete_reason: deleteReasonText
        })
        .eq('id', recordId);

      if (error) throw error;

      setDeleteReasonText('');
      await loadSheetRows();
    } catch (err: any) {
      alert(`Deletion failed: ${err.message}`);
    } finally {
      setIsSheetLoading(false);
      setDeletingTxIdx(null);
    }
  };

  const handleInitiateEditTransaction = (idxInSlice: number) => {
    const row = sheetRows[idxInSlice + 1];
    const rec = row[13]; // raw record
    if (!rec) return;

    let type: 'credit' | 'debit' = 'credit';
    let method: 'cash' | 'bank' = 'cash';
    let amount = 0;
    let details = '';

    if (parseFloat(rec.credit_cash) > 0) {
      type = 'credit';
      method = 'cash';
      amount = parseFloat(rec.credit_cash);
      details = rec.credit_cash_details || '';
    } else if (parseFloat(rec.credit_bank) > 0) {
      type = 'credit';
      method = 'bank';
      amount = parseFloat(rec.credit_bank);
      details = rec.credit_bank_details || '';
    } else if (parseFloat(rec.debit_cash) > 0) {
      type = 'debit';
      method = 'cash';
      amount = parseFloat(rec.debit_cash);
      details = rec.debit_cash_details || '';
    } else if (parseFloat(rec.debit_bank) > 0) {
      type = 'debit';
      method = 'bank';
      amount = parseFloat(rec.debit_bank);
      details = rec.debit_bank_details || '';
    }

    setEditingRowIdx(idxInSlice);
    setEditTxDate(rec.date);
    setEditTxType(type);
    setEditTxMethod(method);
    setEditTxAmount(amount);
    setEditTxDetails(details);
    const isInv = (details || '').toLowerCase().includes('[funding: investment]');
    setEditTxFundingSource(isInv ? 'investment' : 'revenue');
    setEditTxReason('');
  };

  const handleSaveTransactionEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editTxReason.trim()) {
      alert('Please specify a proper reason for editing this transaction.');
      return;
    }
    if (editTxAmount <= 0) {
      alert('Transaction amount must be greater than 0.');
      return;
    }
    if (editingRowIdx === null) return;

    const row = sheetRows[editingRowIdx + 1];
    const rec = row[13];
    const recordId = row[12];
    if (!rec || !recordId) return;

    setIsSavingTxEdit(true);
    try {
      const updatePayload: any = {
        date: editTxDate,
        credit_cash: 0,
        credit_cash_details: '',
        credit_bank: 0,
        credit_bank_details: '',
        debit_cash: 0,
        debit_cash_details: '',
        debit_bank: 0,
        debit_bank_details: ''
      };

      const cleanedDetails = (editTxDetails || '').replace(/\s*\[funding:\s*investment\]/gi, '').trim();
      const finalDetails = editTxFundingSource === 'investment'
        ? `${cleanedDetails} [Funding: Investment]`
        : cleanedDetails;

      if (editTxType === 'credit') {
        if (editTxMethod === 'cash') {
          updatePayload.credit_cash = editTxAmount;
          updatePayload.credit_cash_details = finalDetails;
        } else {
          updatePayload.credit_bank = editTxAmount;
          updatePayload.credit_bank_details = finalDetails;
        }
      } else {
        if (editTxMethod === 'cash') {
          updatePayload.debit_cash = editTxAmount;
          updatePayload.debit_cash_details = finalDetails;
        } else {
          updatePayload.debit_bank = editTxAmount;
          updatePayload.debit_bank_details = finalDetails;
        }
      }

      const prevHistory = rec.edit_history || [];
      const newHistoryItem = {
        edited_at: new Date().toISOString(),
        edited_by: user.username,
        reason: editTxReason,
        previous_values: {
          date: rec.date,
          credit_cash: parseFloat(rec.credit_cash) || 0,
          credit_cash_details: rec.credit_cash_details || '',
          credit_bank: parseFloat(rec.credit_bank) || 0,
          credit_bank_details: rec.credit_bank_details || '',
          debit_cash: parseFloat(rec.debit_cash) || 0,
          debit_cash_details: rec.debit_cash_details || '',
          debit_bank: parseFloat(rec.debit_bank) || 0,
          debit_bank_details: rec.debit_bank_details || ''
        },
        new_values: {
          date: editTxDate,
          type: editTxType,
          method: editTxMethod,
          amount: editTxAmount,
          details: editTxDetails
        }
      };

      updatePayload.edit_history = [...prevHistory, newHistoryItem];

      const { error } = await supabase
        .from('finance_ledger')
        .update(updatePayload)
        .eq('id', recordId);

      if (error) throw error;

      setEditingRowIdx(null);
      await loadSheetRows();
    } catch (err: any) {
      alert(`Editing transaction failed: ${err.message}`);
    } finally {
      setIsSavingTxEdit(false);
    }
  };

  // Capture photo from video element
  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    
    // Create temporary canvas
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Mirror image horizontally if front camera is used for standard natural preview
      if (cameraFacingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setPhotoPreviewUrl(dataUrl);
    }
  };

  // Convert preview base64 to File object and set selectedFile
  const handleUsePhoto = async () => {
    if (!photoPreviewUrl) return;

    try {
      // Fetch base64 data and convert to blob
      const res = await fetch(photoPreviewUrl);
      const blob = await res.blob();
      
      const file = new File([blob], `receipt_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setSelectedFile(file);
      
      // Close modal and reset state
      setIsCameraModalOpen(false);
      setPhotoPreviewUrl(null);
    } catch (err: any) {
      console.error("Error preparing file from captured photo:", err);
      alert("Failed to prepare photo for upload. Please try again.");
    }
  };

  // Append a transaction row
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (txAmount <= 0) return;

    setIsAddingTx(true);
    setIsUploadingFile(true);
    try {
      let billUrl = '';
      let billLink = '';

      let derivedTabName = activeTabName;
      if (txDate) {
        const dParts = txDate.split('-');
        if (dParts.length === 3) {
          const mIndex = parseInt(dParts[1], 10) - 1;
          const yNum = parseInt(dParts[0], 10);
          if (MONTHS[mIndex] && yNum) {
            derivedTabName = `${MONTHS[mIndex]} ${yNum}`;
          }
        }
      }

      if (selectedFile) {
        // Sanitize filename to avoid weird character issues in public URLs
        const fileExt = selectedFile.name.split('.').pop();
        const rawBaseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.'));
        const cleanBaseName = rawBaseName.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${Date.now()}_${cleanBaseName}.${fileExt}`;
        const filePath = `${derivedTabName}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, selectedFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw new Error(`Upload error: ${uploadError.message}`);

        const { data: publicUrlData } = supabase.storage
          .from('receipts')
          .getPublicUrl(filePath);

        billUrl = publicUrlData?.publicUrl || '';
        billLink = `Receipt: ${billUrl}`;
      }

      const detailsPart = txNotes ? `${txCategory}: ${txNotes}` : txCategory;
      const combinedDetailsBase = `${detailsPart}${billLink ? ` • ${billLink}` : ''}`;
      const combinedDetails = txFundingSource === 'investment'
        ? `${combinedDetailsBase} [Funding: Investment]`
        : combinedDetailsBase;

      const rec: any = {
        tab_name: derivedTabName,
        date: txDate,
        is_opening: false,
        bill_url: billUrl || null
      };

      if (txType === 'credit') {
        if (txMethod === 'cash') {
          rec.credit_cash = txAmount;
          rec.credit_cash_details = combinedDetails;
        } else {
          rec.credit_bank = txAmount;
          rec.credit_bank_details = combinedDetails;
        }
      } else {
        if (txMethod === 'cash') {
          rec.debit_cash = txAmount;
          rec.debit_cash_details = combinedDetails;
        } else {
          rec.debit_bank = txAmount;
          rec.debit_bank_details = combinedDetails;
        }
      }

      const { error } = await supabase
        .from('finance_ledger')
        .insert(rec);

      if (error) throw error;

      // Clean form state
      setTxAmount(0);
      setTxNotes('');
      setSelectedFile(null);
      
      // Reload active tab rows
      await loadSheetRows();
    } catch (err: any) {
      alert(`Add transaction failed: ${err.message}`);
    } finally {
      setIsAddingTx(false);
      setIsUploadingFile(false);
    }
  };

  const isCurrentMonthLoaded = availableTabs.some(t => t.title === activeTabName);

  // Computed closing balances
  const closingCash = openingCash + totalCreditCash - totalDebitCash;
  const closingBank = openingBank + totalCreditBank - totalDebitBank;
  const closingTotal = closingCash + closingBank;

  const renderDetailsWithLink = (text: string) => {
    if (!text) return '-';

    // Check if contains a link
    const urlRegex = /(https?:\/\/[^\s\)]+)/i;
    const match = text.match(urlRegex);
    if (match) {
      const url = match[0];
      // Clean text by stripping out "Receipt: url" or "Link: url"
      let cleanText = text.replace(/•?\s*(Receipt|Link):\s*https?:\/\/[^\s\)]+/gi, '').trim();
      if (cleanText.endsWith('•')) {
        cleanText = cleanText.slice(0, -1).trim();
      }
      if (!cleanText) {
        cleanText = 'Receipt';
      }
      return (
        <span className="flex items-center gap-1.5 flex-wrap">
          <span className="truncate max-w-[100px]" title={cleanText}>{cleanText}</span>
          <a 
            href={url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 text-[10px] font-black rounded uppercase tracking-wider transition-colors duration-150 animate-in fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <Link className="w-2.5 h-2.5" />
            Bill
          </a>
        </span>
      );
    }

    return <span className="truncate max-w-[120px] block" title={text}>{text}</span>;
  };

  const parseDetails = (detailsTxt: string, type: 'credit' | 'debit') => {
    if (!detailsTxt) {
      return { category: type === 'credit' ? 'revenue' : 'others', notes: '' };
    }
    const idx = detailsTxt.indexOf(':');
    if (idx !== -1) {
      const cat = detailsTxt.substring(0, idx).trim().toLowerCase();
      const validCategories = type === 'credit' ? creditCategories : debitCategories;
      if (validCategories.includes(cat)) {
        const rest = detailsTxt.substring(idx + 1).trim();
        return { category: cat, notes: rest };
      }
    }
    // Search words fallback
    const lowerTxt = detailsTxt.toLowerCase();
    const validCategories = type === 'credit' ? creditCategories : debitCategories;
    for (const cat of validCategories) {
      if (lowerTxt.includes(cat)) {
        return { category: cat, notes: detailsTxt };
      }
    }
    return { category: type === 'credit' ? 'revenue' : 'others', notes: detailsTxt };
  };

  const parseAllTransactions = () => {
    if (!sheetRows || sheetRows.length < 3) return [];

    const extractInfo = (details: string, defaultType: 'credit' | 'debit', rowRec?: any) => {
      const parsed = parseDetails(details, defaultType);
      const urlMatch = (details || '').match(/(https?:\/\/[^\s\)]+)/i);
      const billUrl = urlMatch ? urlMatch[0] : (rowRec?.bill_url || null);
      let cleanNotes = (parsed.notes || '').replace(/•?\s*(Receipt|Link):\s*https?:\/\/[^\s\)]+/gi, '').trim();
      if (cleanNotes.endsWith('•')) {
        cleanNotes = cleanNotes.slice(0, -1).trim();
      }
      return {
        category: parsed.category,
        notes: cleanNotes,
        rawDetails: details,
        billUrl
      };
    };

    const list: any[] = [];
    // Start from Row 3 (index 2)
    for (let i = 2; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      if (!row || !row[0]) continue;

      const dateStr = row[0].trim();
      // Ensure date format "YYYY-MM-DD"
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

      const dateParts = dateStr.split('-');
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]);
      const day = parseInt(dateParts[2]);

      const crCash = parseFloat(row[1]) || 0;
      const crCashDetails = row[2] || '';
      const crBank = parseFloat(row[3]) || 0;
      const crBankDetails = row[4] || '';

      const dbCash = parseFloat(row[5]) || 0;
      const dbDetails = row[6] || '';
      const dbBank = parseFloat(row[7]) || 0;
      const dbBDetails = row[8] || '';

      const rowId = row[12];
      const rec = row[13];

      // We can have credit and debit in the same row or separated
      if (crCash > 0) {
        const info = extractInfo(crCashDetails, 'credit', rec);
        list.push({
          id: rowId ? `${rowId}-cr-cash` : `row-${i}-cr-cash`,
          dateStr,
          year,
          month,
          day,
          type: 'credit',
          method: 'cash',
          amount: crCash,
          category: info.category,
          notes: info.notes,
          rawDetails: info.rawDetails,
          billUrl: info.billUrl,
          rec,
          rowIndex: i - 1,
          rowId
        });
      }
      if (crBank > 0) {
        const info = extractInfo(crBankDetails, 'credit', rec);
        list.push({
          id: rowId ? `${rowId}-cr-bank` : `row-${i}-cr-bank`,
          dateStr,
          year,
          month,
          day,
          type: 'credit',
          method: 'bank',
          amount: crBank,
          category: info.category,
          notes: info.notes,
          rawDetails: info.rawDetails,
          billUrl: info.billUrl,
          rec,
          rowIndex: i - 1,
          rowId
        });
      }
      if (dbCash > 0) {
        const info = extractInfo(dbDetails, 'debit', rec);
        list.push({
          id: rowId ? `${rowId}-db-cash` : `row-${i}-db-cash`,
          dateStr,
          year,
          month,
          day,
          type: 'debit',
          method: 'cash',
          amount: dbCash,
          category: info.category,
          notes: info.notes,
          rawDetails: info.rawDetails,
          billUrl: info.billUrl,
          rec,
          rowIndex: i - 1,
          rowId
        });
      }
      if (dbBank > 0) {
        const info = extractInfo(dbBDetails, 'debit', rec);
        list.push({
          id: rowId ? `${rowId}-db-bank` : `row-${i}-db-bank`,
          dateStr,
          year,
          month,
          day,
          type: 'debit',
          method: 'bank',
          amount: dbBank,
          category: info.category,
          notes: info.notes,
          rawDetails: info.rawDetails,
          billUrl: info.billUrl,
          rec,
          rowIndex: i - 1,
          rowId
        });
      }
    }
    return list;
  };

  const getDatesInRange = (startStr: string, endStr: string) => {
    const dates: string[] = [];
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
    
    const curr = new Date(start);
    // Cap at 366 days to avoid infinite loops or memory limits
    let cap = 0;
    while (curr <= end && cap < 366) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
      cap++;
    }
    return dates;
  };

  const getLocalDateString = (d: Date = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getDashboardDateRange = (): { start: string; end: string } => {
    const now = new Date();
    
    switch (dashboardPeriod) {
      case 'today': {
        const todayStr = getLocalDateString(now);
        return { start: todayStr, end: todayStr };
      }
      case 'yesterday': {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const yestStr = getLocalDateString(yesterday);
        return { start: yestStr, end: yestStr };
      }
      case 'this_week': {
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMonday);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { start: getLocalDateString(monday), end: getLocalDateString(sunday) };
      }
      case 'last_week': {
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMonday);
        
        const lastMonday = new Date(monday);
        lastMonday.setDate(monday.getDate() - 7);
        const lastSunday = new Date(lastMonday);
        lastSunday.setDate(lastMonday.getDate() + 6);
        return { start: getLocalDateString(lastMonday), end: getLocalDateString(lastSunday) };
      }
      case 'this_month': {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { start: getLocalDateString(firstDay), end: getLocalDateString(lastDay) };
      }
      case 'last_month': {
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        return { start: getLocalDateString(firstDayLastMonth), end: getLocalDateString(lastDayLastMonth) };
      }
      case 'month': {
        const monthIdx = MONTHS.indexOf(selectedMonth);
        const m = monthIdx >= 0 ? monthIdx : now.getMonth();
        const firstDay = new Date(selectedYear, m, 1);
        const lastDay = new Date(selectedYear, m + 1, 0);
        return { start: getLocalDateString(firstDay), end: getLocalDateString(lastDay) };
      }
      case 'custom':
      default: {
        const s = customStartDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const e = customEndDate || getLocalDateString(now);
        return { start: s <= e ? s : e, end: s <= e ? e : s };
      }
    }
  };

  const getDateRangeDisplayLabel = (): string => {
    const { start, end } = getDashboardDateRange();
    if (dashboardPeriod === 'month') {
      return `${activeTabName} (${start} to ${end})`;
    }
    if (dashboardPeriod === 'today') {
      return `Today (${start})`;
    }
    if (dashboardPeriod === 'yesterday') {
      return `Yesterday (${start})`;
    }
    if (dashboardPeriod === 'this_week') {
      return `This Week (${start} to ${end})`;
    }
    if (dashboardPeriod === 'last_week') {
      return `Last Week (${start} to ${end})`;
    }
    if (dashboardPeriod === 'this_month') {
      return `Current Month (${start} to ${end})`;
    }
    if (dashboardPeriod === 'last_month') {
      return `Last Month (${start} to ${end})`;
    }
    return `Custom: ${start} to ${end}`;
  };

  const getFilteredTransactions = (allTxs: any[]) => {
    const { start, end } = getDashboardDateRange();
    return allTxs.filter(tx => {
      return tx.dateStr >= start && tx.dateStr <= end;
    });
  };

  const getDashboardTrendData = (filteredTxs: any[]) => {
    const { start, end } = getDashboardDateRange();
    const datesToGenerate = getDatesInRange(start, end);

    const trendList = datesToGenerate.map(dateStr => {
      const dayTxs = filteredTxs.filter(t => t.dateStr === dateStr);
      const revenue = dayTxs
        .filter(t => t.type === 'credit')
        .reduce((sum, t) => sum + t.amount, 0);
      const expense = dayTxs
        .filter(t => t.type === 'debit')
        .reduce((sum, t) => sum + t.amount, 0);
      const profit = revenue - expense;

      const dVal = new Date(dateStr);
      const label = dVal.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

      return {
        dateStr,
        label,
        revenue,
        expense,
        profit
      };
    });

    return trendList;
  };

  const exportToCSV = () => {
    let headers: string[] = [];
    let csvRows: any[][] = [];
    let fileName = `Ledger_${activeTabName}`;

    if (activeLedgerView === 'sheet') {
      headers = [
        "Date",
        "Credit Cash",
        "Credit Cash Details",
        "Credit Bank",
        "Credit Bank Details",
        "Debit Cash",
        "Debit Cash Details",
        "Debit Bank",
        "Debit Bank Details",
        "Total Cash Balance",
        "Total Bank Balance",
        "Total Combined Balance"
      ];

      const actualRows = sheetRows.slice(1);
      csvRows = actualRows.map((row) => {
        return [
          row[0] || '', // Date
          row[1] || '', // Credit Cash
          row[2] || '', // Cash Details
          row[3] || '', // Credit Bank
          row[4] || '', // Bank Details
          row[5] || '', // Debit Cash
          row[6] || '', // Debit Details
          row[7] || '', // Debit Bank
          row[8] || '', // Debit Details
          row[9] !== undefined ? row[9].toString() : '', // Total Cash
          row[10] !== undefined ? row[10].toString() : '', // Total Bank
          row[11] !== undefined ? row[11].toString() : ''  // Total All
        ];
      });
    } else {
      // dashboard view is active
      const allTxs = parseAllTransactions();
      const filteredTxs = getFilteredTransactions(allTxs);

      headers = [
        "Date",
        "Transaction Type",
        "Payment Method",
        "Amount (INR)",
        "Category",
        "Notes",
        "Details Summary"
      ];

      fileName = `Ledger_Dashboard_${dashboardPeriod}_${activeTabName}`;

      csvRows = filteredTxs.map(tx => {
        const detailsSummary = tx.notes ? `${tx.category}: ${tx.notes}` : tx.category;
        return [
          tx.dateStr || '',
          tx.type || '',
          tx.method || '',
          tx.amount || 0,
          tx.category || '',
          tx.notes || '',
          detailsSummary || ''
        ];
      });
    }

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '';
      let str = typeof val === 'string' ? val : String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...csvRows.map(row => row.map(escapeCSV).join(','))
    ].join('\r\n');

    // Create download trigger
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${fileName.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export P&L Statement as CSV
  const exportPnlToCSV = () => {
    const { accrual } = pnlBreakdown;
    const { start, end } = getDashboardDateRange();
    const periodLabel = dashboardPeriod === 'this_month' ? `Monthly Aggregate (${activeTabName})` : `${start} to ${end}`;

    const rows: (string | number)[][] = [
      ['ACCRUAL PROFIT & LOSS STATEMENT', '', ''],
      ['Reporting Period', periodLabel, ''],
      ['Store / Entity', activeTabName, ''],
      ['Generated At', new Date().toLocaleString(), ''],
      ['', '', ''],
      ['METRIC / LINE ITEM', 'AMOUNT (INR)', '% OF GROSS REVENUE'],
      ['In-Store Live Sales Turnover', accrual.inStoreRev, `${accrual.inStoreRevPct.toFixed(2)}%`],
      ['Zomato Delivery Revenue (Accrued)', accrual.zomatoRev, `${accrual.zomatoRevPct.toFixed(2)}%`],
      ['GROSS INCOME TURNOVER', accrual.totalRev, '100.00%'],
      ['', '', ''],
      ['COST OF GOODS SOLD (COGS) [Direct Materials]', -accrual.totalCogs, `${accrual.cogsPctOfRev.toFixed(2)}%`],
      ...accrual.cogsList.map(item => [`  ${item.label} (${item.code})`, -item.amount, `${item.pctOfRev.toFixed(2)}%`]),
      ['', '', ''],
      ['CONTRIBUTION MARGIN 1 (CM1)', accrual.cm1, `${accrual.cm1Pct.toFixed(2)}%`],
      ['', '', ''],
      ['VARIABLE OPERATING EXPENSES', -accrual.totalVariableExp, `${accrual.variableExpPct.toFixed(2)}%`],
      ['  i) Zomato Commission & Direct Ads', -accrual.zomatoExp, `${accrual.zomatoExpPct.toFixed(2)}%`],
      ['  ii) Utilities {Kitchen Gas / Fuel}', -accrual.utilitiesExp, `${accrual.utilitiesExpPct.toFixed(2)}%`],
      ['', '', ''],
      ['CONTRIBUTION MARGIN 2 (CM2)', accrual.cm2, `${accrual.cm2Pct.toFixed(2)}%`],
      ['', '', ''],
      ['FIXED OVERHEAD EXPENSES', -accrual.totalFixedExp, `${accrual.fixedExpPct.toFixed(2)}%`],
      ['  Store Rent', -accrual.rentExp, `${accrual.rentExpPct.toFixed(2)}%`],
      ['  Staff Salary & Wages', -accrual.salaryExp, `${accrual.salaryExpPct.toFixed(2)}%`],
      ['', '', ''],
      ['STORE CORE OPERATING MARGIN (Pre-Other)', accrual.operatingProfitPreOther, `${accrual.operatingProfitPreOtherPct.toFixed(2)}%`],
      ['', '', ''],
      ['OTHER OPERATING EXPENSES', -accrual.otherExp, `${accrual.otherExpPct.toFixed(2)}%`],
      ...accrual.otherExpBreakdown.map(item => [`  Other: ${item.category}`, -item.amount, `${item.pctOfRev.toFixed(2)}%`]),
      ['', '', ''],
      ['ACCRUAL NET OPERATING PROFIT', accrual.netProfit, `${accrual.netMarginPct.toFixed(2)}%`]
    ];

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return `"${str}"`;
    };

    const csvContent = rows.map(r => r.map(escapeCSV).join(',')).join('\r\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PnL_${activeTabName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  const pnlBreakdown = React.useMemo(() => {
    const emptyCogsList = Object.keys(CANONICAL_COGS_META).map(k => ({
      key: k,
      label: CANONICAL_COGS_META[k].label,
      icon: CANONICAL_COGS_META[k].icon,
      code: CANONICAL_COGS_META[k].code,
      amount: 0,
      pctOfRev: 0
    }));

    if (!sheetRows || sheetRows.length < 3) {
      return {
        accrual: {
          inStoreRev: 0,
          inStoreRevPct: 0,
          zomatoRev: 0,
          zomatoRevPct: 0,
          totalRev: 0,
          cogsList: emptyCogsList,
          totalCogs: 0,
          cogsPctOfRev: 0,
          cm1: 0,
          cm1Pct: 0,
          zomatoExp: 0,
          zomatoExpPct: 0,
          utilitiesExp: 0,
          utilitiesExpPct: 0,
          totalVariableExp: 0,
          variableExpPct: 0,
          cm2: 0,
          cm2Pct: 0,
          rentExp: 0,
          rentExpPct: 0,
          salaryExp: 0,
          salaryExpPct: 0,
          totalFixedExp: 0,
          fixedExpPct: 0,
          operatingProfitPreOther: 0,
          operatingProfitPreOtherPct: 0,
          otherExp: 0,
          otherExpPct: 0,
          otherExpBreakdown: [] as any[],
          investmentCapExp: 0,
          debtCapExp: 0,
          totalExp: 0,
          netProfit: 0,
          netMarginPct: 0,
          momoCost: 0,
          operatingExp: 0,
          grossProfit: 0,
          operatingProfit: 0,
          margin: 0
        },
        cashFlow: {
          inStoreInflow: 0,
          inStoreInflowPct: 0,
          zomatoInflow: 0,
          zomatoInflowPct: 0,
          investmentInflow: 0,
          investmentInflowPct: 0,
          totalInflows: 0,
          cogsOutflow: 0,
          cogsOutflowPct: 0,
          cogsList: emptyCogsList,
          zomatoOutflow: 0,
          zomatoOutflowPct: 0,
          utilitiesOutflow: 0,
          utilitiesOutflowPct: 0,
          variableOutflow: 0,
          variableOutflowPct: 0,
          rentOutflow: 0,
          salaryOutflow: 0,
          fixedOutflow: 0,
          fixedOutflowPct: 0,
          otherOutflow: 0,
          otherOutflowPct: 0,
          investmentOutflow: 0,
          investmentOutflowPct: 0,
          totalOutflows: 0,
          netPosition: 0,
          openingBal: 0,
          closingBal: 0,
          momoOutflow: 0,
          operatingOutflow: 0
        },
        investmentSpentList: [] as any[]
      };
    }

    const allTxs = parseAllTransactions();
    const { start, end } = getDashboardDateRange();

    // Helper to bucket debit expenses into Unit Economics categories
    const categorizeExpense = (category: string, notes: string = '') => {
      const cat = (category || '').toLowerCase().trim();
      const nts = (notes || '').toLowerCase();

      // i) Zomato Commission & Ads
      if (
        cat === 'zomato commission and ads' || 
        cat.includes('zomato commission') || 
        cat.includes('zomato ads') ||
        (cat === 'others' && (nts.includes('zomato commission') || nts.includes('zomato ads')))
      ) {
        return { bucket: 'variable_zomato', cogsKey: null };
      }

      // ii) Utilities {gas}
      if (
        cat === 'gas' || 
        cat === 'utilities' || 
        cat === 'kitchen gas' || 
        cat === 'lpg' || 
        cat === 'electricity' ||
        cat.includes('gas cylinder') ||
        (cat === 'others' && (nts.includes('gas cylinder') || nts.includes('lpg') || nts.includes('kitchen gas')))
      ) {
        return { bucket: 'variable_utility', cogsKey: null };
      }

      // Fixed: Rent
      if (cat === 'rent' || cat.includes('store rent') || cat.includes('shop rent')) {
        return { bucket: 'fixed_rent', cogsKey: null };
      }

      // Fixed: Salary
      if (cat === 'salary' || cat === 'salaries' || cat === 'wage' || cat === 'wages' || cat.includes('staff salary')) {
        return { bucket: 'fixed_salary', cogsKey: null };
      }

      // 10 Canonical COGS Categories:
      // momo, grocery, soft drinks, ice, packaging, veggies, burger buns, chicken, other stock, syrups
      if (cat === 'momo' || cat.includes('momo')) {
        return { bucket: 'cogs', cogsKey: 'momo' };
      }
      if (cat === 'grocery' || cat === 'groceries' || cat === 'spices' || cat === 'sauces' || cat === 'oil-butter' || cat === 'fries') {
        return { bucket: 'cogs', cogsKey: 'grocery' };
      }
      if (cat === 'soft drinks' || cat === 'drinks' || cat === 'cola' || cat === 'beverage' || cat.includes('drink') || cat.includes('cola')) {
        return { bucket: 'cogs', cogsKey: 'soft drinks' };
      }
      if (cat === 'ice' || cat.includes('ice block')) {
        return { bucket: 'cogs', cogsKey: 'ice' };
      }
      if (cat === 'packaging' || cat === 'packaginf' || cat.includes('packag')) {
        return { bucket: 'cogs', cogsKey: 'packaging' };
      }
      if (cat === 'veggies' || cat === 'vegetables' || cat === 'vegetable' || cat.includes('veggie')) {
        return { bucket: 'cogs', cogsKey: 'veggies' };
      }
      if (cat === 'burger buns' || cat === 'buns' || cat === 'burger bun' || cat.includes('bun')) {
        return { bucket: 'cogs', cogsKey: 'burger buns' };
      }
      if (cat === 'chicken' || cat.includes('chicken') || cat.includes('meat') || cat.includes('raw chicken')) {
        return { bucket: 'cogs', cogsKey: 'chicken' };
      }
      if (cat === 'syrups' || cat === 'syrup' || cat.includes('syrup')) {
        return { bucket: 'cogs', cogsKey: 'syrups' };
      }
      if (cat === 'other stock' || cat === 'other-stock' || cat === 'inventory' || cat === 'raw materials') {
        return { bucket: 'cogs', cogsKey: 'other stock' };
      }

      // Check category mappings to see if mapped to a stock subcategory
      const mappedSubcats = categoryMappings[cat];
      if (mappedSubcats && mappedSubcats.length > 0) {
        if (mappedSubcats.includes('chicken')) return { bucket: 'cogs', cogsKey: 'chicken' };
        if (mappedSubcats.includes('ice')) return { bucket: 'cogs', cogsKey: 'ice' };
        if (mappedSubcats.includes('buns')) return { bucket: 'cogs', cogsKey: 'burger buns' };
        if (mappedSubcats.includes('momo')) return { bucket: 'cogs', cogsKey: 'momo' };
        if (mappedSubcats.includes('packaging')) return { bucket: 'cogs', cogsKey: 'packaging' };
        if (mappedSubcats.includes('veggies')) return { bucket: 'cogs', cogsKey: 'veggies' };
        if (mappedSubcats.includes('syrups')) return { bucket: 'cogs', cogsKey: 'syrups' };
        if (mappedSubcats.includes('cola') || mappedSubcats.includes('drinks')) return { bucket: 'cogs', cogsKey: 'soft drinks' };
        if (mappedSubcats.includes('spices') || mappedSubcats.includes('oil-butter') || mappedSubcats.includes('sauces') || mappedSubcats.includes('fries')) {
          return { bucket: 'cogs', cogsKey: 'grocery' };
        }
        return { bucket: 'cogs', cogsKey: 'other stock' };
      }

      return { bucket: 'other_expense', cogsKey: null };
    };

    // Map each transaction with its Accrual Date assignment based on Wednesday settlements
    const accrualTxs = allTxs.map(tx => {
      let accrualDateStr = tx.dateStr;
      const d = new Date(tx.dateStr);
      const isWednesday = d.getDay() === 3;
      
      if (isWednesday) {
        if (tx.type === 'credit' && tx.category === 'zomato payout') {
          // Accrue to previous Monday-to-Sunday, tag to the Sunday (3 days prior)
          const prevSunday = new Date(d);
          prevSunday.setDate(d.getDate() - 3);
          accrualDateStr = prevSunday.toISOString().split('T')[0];
        } else if (tx.type === 'debit') {
          const expClas = categorizeExpense(tx.category, tx.notes);
          if (expClas.bucket === 'variable_zomato' || expClas.bucket === 'cogs') {
            // Accrue vendor COGS & Zomato commission settlements to previous Sunday
            const prevSunday = new Date(d);
            prevSunday.setDate(d.getDate() - 3);
            accrualDateStr = prevSunday.toISOString().split('T')[0];
          }
        }
      }

      const lowerNotesAndDetails = `${tx.category || ''} ${tx.notes || ''}`.toLowerCase();
      const isInvestmentSpend = lowerNotesAndDetails.includes('[funding: investment]') || 
                                tx.category === 'store investment';

      return {
        ...tx,
        accrualDateStr,
        isInvestmentSpend
      };
    });

    // 1. Accrual Calculations (filter by accrual date)
    const filteredAccrual = accrualTxs.filter(tx => tx.accrualDateStr >= start && tx.accrualDateStr <= end);

    let accrualInStoreRev = 0;
    let accrualZomatoRev = 0;
    let accrualInvestmentCapExp = 0;
    let accrualDebtCapExp = 0;
    let accrualZomatoExp = 0;
    let accrualUtilitiesExp = 0;
    let accrualRentExp = 0;
    let accrualSalaryExp = 0;
    let accrualOtherExp = 0;

    const accrualCogsMap: Record<string, number> = {
      'momo': 0,
      'grocery': 0,
      'soft drinks': 0,
      'ice': 0,
      'packaging': 0,
      'veggies': 0,
      'burger buns': 0,
      'chicken': 0,
      'other stock': 0,
      'syrups': 0
    };
    const accrualOtherExpMap: Record<string, number> = {};

    filteredAccrual.forEach(tx => {
      if (tx.type === 'credit') {
        if (tx.category === 'zomato payout') {
          accrualZomatoRev += tx.amount;
        } else if (tx.category !== 'investment' && tx.category !== 'previous balance' && tx.category !== 'debt') {
          accrualInStoreRev += tx.amount;
        }
      } else {
        if (tx.isInvestmentSpend) {
          accrualInvestmentCapExp += tx.amount;
        } else if (tx.category === 'debt') {
          accrualDebtCapExp += tx.amount;
        } else {
          const expClas = categorizeExpense(tx.category, tx.notes);
          if (expClas.bucket === 'variable_zomato') {
            accrualZomatoExp += tx.amount;
          } else if (expClas.bucket === 'variable_utility') {
            accrualUtilitiesExp += tx.amount;
          } else if (expClas.bucket === 'fixed_rent') {
            accrualRentExp += tx.amount;
          } else if (expClas.bucket === 'fixed_salary') {
            accrualSalaryExp += tx.amount;
          } else if (expClas.bucket === 'cogs' && expClas.cogsKey) {
            accrualCogsMap[expClas.cogsKey] = (accrualCogsMap[expClas.cogsKey] || 0) + tx.amount;
          } else {
            accrualOtherExp += tx.amount;
            const cleanKey = tx.category || 'others';
            accrualOtherExpMap[cleanKey] = (accrualOtherExpMap[cleanKey] || 0) + tx.amount;
          }
        }
      }
    });

    const accrualTotalRev = accrualInStoreRev + accrualZomatoRev;
    const inStoreRevPct = accrualTotalRev > 0 ? (accrualInStoreRev / accrualTotalRev) * 100 : 0;
    const zomatoRevPct = accrualTotalRev > 0 ? (accrualZomatoRev / accrualTotalRev) * 100 : 0;

    // Build canonical 10 COGS items sorted by expense value descending & % of revenue
    const accrualCogsList = Object.keys(CANONICAL_COGS_META).map(key => {
      const meta = CANONICAL_COGS_META[key];
      const amount = accrualCogsMap[key] || 0;
      const pctOfRev = accrualTotalRev > 0 ? (amount / accrualTotalRev) * 100 : 0;
      return {
        key,
        label: meta.label,
        icon: meta.icon,
        code: meta.code,
        amount,
        pctOfRev
      };
    }).sort((a, b) => b.amount - a.amount);

    const totalCogs = accrualCogsList.reduce((sum, item) => sum + item.amount, 0);
    const cogsPctOfRev = accrualTotalRev > 0 ? (totalCogs / accrualTotalRev) * 100 : 0;

    // Contribution Margin 1 (CM1) = Gross Income - Total COGS
    const cm1 = accrualTotalRev - totalCogs;
    const cm1Pct = accrualTotalRev > 0 ? (cm1 / accrualTotalRev) * 100 : 0;

    // Variable Direct Expenses (Zomato commissions/ads + Utilities {gas})
    const zomatoExpPct = accrualTotalRev > 0 ? (accrualZomatoExp / accrualTotalRev) * 100 : 0;
    const utilitiesExpPct = accrualTotalRev > 0 ? (accrualUtilitiesExp / accrualTotalRev) * 100 : 0;
    const totalVariableExp = accrualZomatoExp + accrualUtilitiesExp;
    const variableExpPct = accrualTotalRev > 0 ? (totalVariableExp / accrualTotalRev) * 100 : 0;

    // Contribution Margin 2 (CM2) = CM1 - (Zomato Commission & Ads + Utilities)
    const cm2 = cm1 - totalVariableExp;
    const cm2Pct = accrualTotalRev > 0 ? (cm2 / accrualTotalRev) * 100 : 0;

    // Fixed Overhead Costs (Rent + Salary)
    const rentExpPct = accrualTotalRev > 0 ? (accrualRentExp / accrualTotalRev) * 100 : 0;
    const salaryExpPct = accrualTotalRev > 0 ? (accrualSalaryExp / accrualTotalRev) * 100 : 0;
    const totalFixedExp = accrualRentExp + accrualSalaryExp;
    const fixedExpPct = accrualTotalRev > 0 ? (totalFixedExp / accrualTotalRev) * 100 : 0;

    // Store Core Operating Profit / Pre-Other Margin = CM2 - Fixed Costs
    const operatingProfitPreOther = cm2 - totalFixedExp;
    const operatingProfitPreOtherPct = accrualTotalRev > 0 ? (operatingProfitPreOther / accrualTotalRev) * 100 : 0;

    // Other Operating Expenses
    const otherExpPct = accrualTotalRev > 0 ? (accrualOtherExp / accrualTotalRev) * 100 : 0;
    const otherExpBreakdown = Object.entries(accrualOtherExpMap).map(([cat, amt]) => ({
      category: cat,
      amount: amt,
      pctOfRev: accrualTotalRev > 0 ? (amt / accrualTotalRev) * 100 : 0
    })).sort((a, b) => b.amount - a.amount);

    // Accrual Net Operating Profit = Core Operating Profit - Other Expenses
    const totalAccrualExpenses = totalCogs + totalVariableExp + totalFixedExp + accrualOtherExp;
    const accrualNetProfit = accrualTotalRev - totalAccrualExpenses;
    const accrualNetMarginPct = accrualTotalRev > 0 ? (accrualNetProfit / accrualTotalRev) * 100 : 0;

    // 2. Cash Flow Calculations (filter by raw/standard date)
    const filteredCashFlowStr = accrualTxs.filter(tx => tx.dateStr >= start && tx.dateStr <= end);

    let cashInStoreInflow = 0;
    let cashZomatoInflow = 0;
    let cashInvestmentInflow = 0;
    let cashInvestmentOutflow = 0;
    let cashZomatoOutflow = 0;
    let cashUtilitiesOutflow = 0;
    let cashRentOutflow = 0;
    let cashSalaryOutflow = 0;
    let cashOtherOutflow = 0;

    const cashCogsMap: Record<string, number> = {
      'momo': 0,
      'grocery': 0,
      'soft drinks': 0,
      'ice': 0,
      'packaging': 0,
      'veggies': 0,
      'burger buns': 0,
      'chicken': 0,
      'other stock': 0,
      'syrups': 0
    };

    filteredCashFlowStr.forEach(tx => {
      if (tx.type === 'credit') {
        if (tx.category === 'zomato payout') {
          cashZomatoInflow += tx.amount;
        } else if (tx.category === 'investment' || tx.category === 'debt') {
          cashInvestmentInflow += tx.amount;
        } else if (tx.category !== 'previous balance') {
          cashInStoreInflow += tx.amount;
        }
      } else {
        if (tx.isInvestmentSpend || tx.category === 'store investment' || tx.category === 'debt') {
          cashInvestmentOutflow += tx.amount;
        } else {
          const expClas = categorizeExpense(tx.category, tx.notes);
          if (expClas.bucket === 'variable_zomato') {
            cashZomatoOutflow += tx.amount;
          } else if (expClas.bucket === 'variable_utility') {
            cashUtilitiesOutflow += tx.amount;
          } else if (expClas.bucket === 'fixed_rent') {
            cashRentOutflow += tx.amount;
          } else if (expClas.bucket === 'fixed_salary') {
            cashSalaryOutflow += tx.amount;
          } else if (expClas.bucket === 'cogs' && expClas.cogsKey) {
            cashCogsMap[expClas.cogsKey] = (cashCogsMap[expClas.cogsKey] || 0) + tx.amount;
          } else {
            cashOtherOutflow += tx.amount;
          }
        }
      }
    });

    const cashTotalInflows = cashInStoreInflow + cashZomatoInflow + cashInvestmentInflow;
    const inStoreInflowPct = cashTotalInflows > 0 ? (cashInStoreInflow / cashTotalInflows) * 100 : 0;
    const zomatoInflowPct = cashTotalInflows > 0 ? (cashZomatoInflow / cashTotalInflows) * 100 : 0;
    const investmentInflowPct = cashTotalInflows > 0 ? (cashInvestmentInflow / cashTotalInflows) * 100 : 0;

    const cashCogsList = Object.keys(CANONICAL_COGS_META).map(key => {
      const meta = CANONICAL_COGS_META[key];
      const amount = cashCogsMap[key] || 0;
      const pctOfInflow = cashTotalInflows > 0 ? (amount / cashTotalInflows) * 100 : 0;
      return {
        key,
        label: meta.label,
        icon: meta.icon,
        code: meta.code,
        amount,
        pctOfRev: pctOfInflow
      };
    }).sort((a, b) => b.amount - a.amount);

    const cashCogsOutflow = cashCogsList.reduce((sum, item) => sum + item.amount, 0);
    const cogsOutflowPct = cashTotalInflows > 0 ? (cashCogsOutflow / cashTotalInflows) * 100 : 0;
    const zomatoOutflowPct = cashTotalInflows > 0 ? (cashZomatoOutflow / cashTotalInflows) * 100 : 0;
    const utilitiesOutflowPct = cashTotalInflows > 0 ? (cashUtilitiesOutflow / cashTotalInflows) * 100 : 0;
    const cashVariableOutflow = cashZomatoOutflow + cashUtilitiesOutflow;
    const variableOutflowPct = cashTotalInflows > 0 ? (cashVariableOutflow / cashTotalInflows) * 100 : 0;

    const cashFixedOutflow = cashRentOutflow + cashSalaryOutflow;
    const fixedOutflowPct = cashTotalInflows > 0 ? (cashFixedOutflow / cashTotalInflows) * 100 : 0;
    const otherOutflowPct = cashTotalInflows > 0 ? (cashOtherOutflow / cashTotalInflows) * 100 : 0;
    const investmentOutflowPct = cashTotalInflows > 0 ? (cashInvestmentOutflow / cashTotalInflows) * 100 : 0;

    const cashTotalOutflows = cashCogsOutflow + cashVariableOutflow + cashFixedOutflow + cashOtherOutflow + cashInvestmentOutflow;
    const cashNetPosition = cashTotalInflows - cashTotalOutflows;
    const cashOpeningBal = openingCash + openingBank;
    const cashClosingBal = cashOpeningBal + cashNetPosition;

    // 3. Investment Spends drill-down tracker (all time investment spends parsed)
    const investmentSpentList = accrualTxs.filter(tx => tx.isInvestmentSpend && tx.type === 'debit');

    return {
      accrual: {
        inStoreRev: accrualInStoreRev,
        inStoreRevPct,
        zomatoRev: accrualZomatoRev,
        zomatoRevPct,
        totalRev: accrualTotalRev,
        cogsList: accrualCogsList,
        totalCogs,
        cogsPctOfRev,
        cm1,
        cm1Pct,
        zomatoExp: accrualZomatoExp,
        zomatoExpPct,
        utilitiesExp: accrualUtilitiesExp,
        utilitiesExpPct,
        totalVariableExp,
        variableExpPct,
        cm2,
        cm2Pct,
        rentExp: accrualRentExp,
        rentExpPct,
        salaryExp: accrualSalaryExp,
        salaryExpPct,
        totalFixedExp,
        fixedExpPct,
        operatingProfitPreOther,
        operatingProfitPreOtherPct,
        otherExp: accrualOtherExp,
        otherExpPct,
        otherExpBreakdown,
        investmentCapExp: accrualInvestmentCapExp,
        debtCapExp: accrualDebtCapExp,
        totalExp: totalAccrualExpenses,
        netProfit: accrualNetProfit,
        netMarginPct: accrualNetMarginPct,
        // Backward compatibility
        momoCost: totalCogs,
        operatingExp: totalVariableExp + totalFixedExp + accrualOtherExp,
        grossProfit: cm1,
        operatingProfit: accrualNetProfit,
        margin: accrualNetMarginPct
      },
      cashFlow: {
        inStoreInflow: cashInStoreInflow,
        inStoreInflowPct,
        zomatoInflow: cashZomatoInflow,
        zomatoInflowPct,
        investmentInflow: cashInvestmentInflow,
        investmentInflowPct,
        totalInflows: cashTotalInflows,
        cogsOutflow: cashCogsOutflow,
        cogsOutflowPct,
        cogsList: cashCogsList,
        zomatoOutflow: cashZomatoOutflow,
        zomatoOutflowPct,
        utilitiesOutflow: cashUtilitiesOutflow,
        utilitiesOutflowPct,
        variableOutflow: cashVariableOutflow,
        variableOutflowPct,
        rentOutflow: cashRentOutflow,
        salaryOutflow: cashSalaryOutflow,
        fixedOutflow: cashFixedOutflow,
        fixedOutflowPct,
        otherOutflow: cashOtherOutflow,
        otherOutflowPct,
        investmentOutflow: cashInvestmentOutflow,
        investmentOutflowPct,
        totalOutflows: cashTotalOutflows,
        netPosition: cashNetPosition,
        openingBal: cashOpeningBal,
        closingBal: cashClosingBal,
        // Backward compatibility
        momoOutflow: cashCogsOutflow,
        operatingOutflow: cashVariableOutflow + cashFixedOutflow + cashOtherOutflow
      },
      investmentSpentList
    };
  }, [sheetRows, openingCash, openingBank, dashboardPeriod, customStartDate, customEndDate, activeTabName, categoryMappings]);

  const getCategoryBreakdowns = (filteredTxs: any[]) => {
    const revMap: { [cat: string]: { total: number; count: number } } = {};
    const expMap: { [cat: string]: { total: number; count: number } } = {};

    filteredTxs.forEach(tx => {
      if (tx.type === 'credit') {
        if (!revMap[tx.category]) revMap[tx.category] = { total: 0, count: 0 };
        revMap[tx.category].total += tx.amount;
        revMap[tx.category].count += 1;
      } else {
        if (!expMap[tx.category]) expMap[tx.category] = { total: 0, count: 0 };
        expMap[tx.category].total += tx.amount;
        expMap[tx.category].count += 1;
      }
    });

    const totalRev = Object.values(revMap).reduce((a, b) => a + b.total, 0);
    const totalExp = Object.values(expMap).reduce((a, b) => a + b.total, 0);

    const revList = Object.keys(revMap).map(cat => ({
      name: cat.toUpperCase(),
      value: revMap[cat].total,
      count: revMap[cat].count,
      avg: revMap[cat].count > 0 ? revMap[cat].total / revMap[cat].count : 0,
      percentage: totalRev > 0 ? (revMap[cat].total / totalRev) * 100 : 0
    })).sort((a, b) => b.value - a.value);

    const expList = Object.keys(expMap).map(cat => ({
      name: cat.toUpperCase(),
      value: expMap[cat].total,
      count: expMap[cat].count,
      avg: expMap[cat].count > 0 ? expMap[cat].total / expMap[cat].count : 0,
      percentage: totalExp > 0 ? (expMap[cat].total / totalExp) * 100 : 0
    })).sort((a, b) => b.value - a.value);

    return {
      totalRev,
      totalExp,
      revList,
      expList
    };
  };

  const REVENUE_COLORS = [
    '#10b981', '#34d399', '#059669', '#3b82f6', '#60a5fa', 
    '#fbbf24', '#f59e0b', '#a78bfa', '#8b5cf6', '#06b6d4', 
    '#14b8a6', '#f472b6', '#fb923c', '#a3e635', '#94a3b8'
  ];
  const EXPENSE_COLORS = [
    '#f87171', '#fda4af', '#f472b6', '#fb923c', '#fde047', 
    '#a3e635', '#4ade80', '#2dd4bf', '#22d3ee', '#38bdf8', 
    '#3b82f6', '#818cf8', '#a78bfa', '#c084fc', '#ec4899', 
    '#e11d48', '#d97706', '#059669', '#0284c7', '#64748b'
  ];

  return (
    <div className="h-full flex flex-col bg-brand-stone/40 overflow-hidden text-brand-brown">
      {/* Top action header bar */}
      <div className="bg-white border-b border-brand-brown/10 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-brand-brown tracking-tight uppercase flex items-center gap-3">
            <Database className="w-7 h-7 text-emerald-600" />
            Financial Ledger Book
          </h1>
          <p className="text-xs text-brand-brown/60 font-semibold mt-1">
            Secure Supabase-backed ledger tracking in real-time • Active User: <b>{user.username} ({user.role})</b>
          </p>
        </div>

        {/* Database status element */}
        <div className="flex items-center gap-3 self-stretch md:self-auto">
          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 font-bold uppercase tracking-wider flex items-center gap-1.5 leading-none">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Supabase Connected
          </span>
        </div>
      </div>

      {/* Main scrolling content view */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 no-scrollbar">

        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

            {/* Global Unified Date & View Control Center */}
            <div className="border border-brand-brown/10 bg-white rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
              {/* Row 1: Header + Active Interval Indicator + View Switcher */}
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 pb-3 border-b border-brand-brown/10">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 bg-emerald-50 text-emerald-900 border border-emerald-200/80 px-3 py-1.5 rounded-xl text-xs font-black tracking-wide">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    <span>LEDGER INTERVAL</span>
                  </div>
                  <span className="text-[11px] font-bold text-brand-brown/70 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Active: <b className="text-brand-brown font-black">{getDateRangeDisplayLabel()}</b>
                  </span>
                  <span className="text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded-md border border-zinc-200">
                    Applies to Entries, P&L & Analytics
                  </span>
                </div>

                {/* View Toggle (Entries vs P&L vs Analytics) */}
                <div className="flex bg-brand-stone/40 p-1 rounded-2xl border border-brand-brown/10 shadow-2xs w-full sm:w-auto self-stretch sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setActiveLedgerView('sheet')}
                    className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      activeLedgerView === 'sheet'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-500 hover:text-brand-brown'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Entries
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLedgerView('pnl')}
                    className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      activeLedgerView === 'pnl'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-500 hover:text-brand-brown'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    P&L Statement
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLedgerView('dashboard')}
                    className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      activeLedgerView === 'dashboard'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    <PieChartIcon className="w-3.5 h-3.5" />
                    Analytics
                  </button>
                </div>
              </div>

              {/* Row 2: Date Interval Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mr-1">Period:</span>
                
                <button
                  type="button"
                  onClick={() => setDashboardPeriod('month')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                    dashboardPeriod === 'month'
                      ? 'bg-brand-brown text-brand-yellow shadow-xs'
                      : 'bg-stone-100 hover:bg-stone-200 text-zinc-600'
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  Full Month
                </button>

                <button
                  type="button"
                  onClick={() => setDashboardPeriod('today')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    dashboardPeriod === 'today'
                      ? 'bg-brand-brown text-brand-yellow shadow-xs'
                      : 'bg-stone-100 hover:bg-stone-200 text-zinc-600'
                  }`}
                >
                  Today
                </button>

                <button
                  type="button"
                  onClick={() => setDashboardPeriod('yesterday')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    dashboardPeriod === 'yesterday'
                      ? 'bg-brand-brown text-brand-yellow shadow-xs'
                      : 'bg-stone-100 hover:bg-stone-200 text-zinc-600'
                  }`}
                >
                  Yesterday
                </button>

                <button
                  type="button"
                  onClick={() => setDashboardPeriod('this_week')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    dashboardPeriod === 'this_week'
                      ? 'bg-brand-brown text-brand-yellow shadow-xs'
                      : 'bg-stone-100 hover:bg-stone-200 text-zinc-600'
                  }`}
                >
                  This Week
                </button>

                <button
                  type="button"
                  onClick={() => setDashboardPeriod('last_week')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    dashboardPeriod === 'last_week'
                      ? 'bg-brand-brown text-brand-yellow shadow-xs'
                      : 'bg-stone-100 hover:bg-stone-200 text-zinc-600'
                  }`}
                >
                  Last Week
                </button>

                <button
                  type="button"
                  onClick={() => setDashboardPeriod('this_month')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    dashboardPeriod === 'this_month'
                      ? 'bg-brand-brown text-brand-yellow shadow-xs'
                      : 'bg-stone-100 hover:bg-stone-200 text-zinc-600'
                  }`}
                >
                  This Month (Calendar)
                </button>

                <button
                  type="button"
                  onClick={() => setDashboardPeriod('last_month')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    dashboardPeriod === 'last_month'
                      ? 'bg-brand-brown text-brand-yellow shadow-xs'
                      : 'bg-stone-100 hover:bg-stone-200 text-zinc-600'
                  }`}
                >
                  Last Month
                </button>

                <button
                  type="button"
                  onClick={() => setDashboardPeriod('custom')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                    dashboardPeriod === 'custom'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/60'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  Custom Date Range
                </button>
              </div>

              {/* Row 3A: If Month selected, show month buttons */}
              {dashboardPeriod === 'month' && (
                <div className="pt-2 border-t border-brand-brown/5 flex flex-wrap items-center gap-1.5 animate-in fade-in duration-200">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mr-2">Month:</span>
                  {MONTHS.map((m) => {
                    const isSelected = selectedMonth === m;
                    const matchesCurrentMonth = MONTHS[new Date().getMonth()] === m && currentYear === selectedYear;
                    const hasDataTab = availableTabs.some(t => t.title === `${m} ${selectedYear}`);
                    return (
                      <button
                        key={m}
                        onClick={() => {
                          setSelectedMonth(m);
                          setSheetRows([]);
                        }}
                        className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider duration-200 transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected 
                            ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-500/20' 
                            : hasDataTab 
                              ? 'bg-emerald-50/70 text-emerald-900 border border-emerald-200/60 hover:bg-emerald-100'
                              : 'text-brand-brown/60 hover:bg-brand-stone/40 hover:text-brand-brown'
                        }`}
                      >
                        <span>{m}</span>
                        {matchesCurrentMonth && (
                          <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-600'}`}></span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Row 3B: If Custom Date Range selected, show date inputs and quick shortcuts */}
              {dashboardPeriod === 'custom' && (
                <div className="pt-2 border-t border-emerald-100 bg-emerald-50/40 rounded-2xl p-3.5 flex flex-wrap items-center gap-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-950">From:</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="bg-white px-3 py-1.5 text-xs font-bold rounded-xl border border-emerald-200 text-brand-brown outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-950">To:</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="bg-white px-3 py-1.5 text-xs font-bold rounded-xl border border-emerald-200 text-brand-brown outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                    <span className="text-[9px] font-bold text-emerald-800 uppercase tracking-wider mr-1">Quick Select:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomStartDate('2026-06-01');
                        setCustomEndDate('2026-06-30');
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-200 text-[10px] font-bold text-emerald-900 rounded-lg transition-colors cursor-pointer"
                    >
                      June 2026
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomStartDate('2026-07-01');
                        setCustomEndDate('2026-07-31');
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-200 text-[10px] font-bold text-emerald-900 rounded-lg transition-colors cursor-pointer"
                    >
                      July 2026
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(end.getDate() - 7);
                        setCustomStartDate(getLocalDateString(start));
                        setCustomEndDate(getLocalDateString(end));
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-200 text-[10px] font-bold text-emerald-900 rounded-lg transition-colors cursor-pointer"
                    >
                      Last 7 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(end.getDate() - 30);
                        setCustomStartDate(getLocalDateString(start));
                        setCustomEndDate(getLocalDateString(end));
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-200 text-[10px] font-bold text-emerald-900 rounded-lg transition-colors cursor-pointer"
                    >
                      Last 30 Days
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Error or State alert blocks */}
            {sheetError && (
              <div className="bg-brand-red/10 border border-brand-red/20 rounded-2xl p-4 flex items-center gap-3 text-brand-red text-xs font-semibold">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>{sheetError}</p>
                <button onClick={loadSheetRows} className="ml-auto underline flex items-center gap-1">
                  Retry <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Main view container splits: balance summaries vs. spreadsheet state */}
            {dashboardPeriod === 'month' && !isCurrentMonthLoaded ? (
              /* Month tab does not exist in sheets yet */
              <div className="bg-white rounded-3xl border border-brand-brown/10 p-8 text-center space-y-6 max-w-xl mx-auto py-12">
                <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto text-amber-500">
                  <Calendar className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-black uppercase tracking-tight">Month Not Initialized</h3>
                  <p className="text-xs text-brand-brown/70 leading-relaxed max-w-sm mx-auto">
                    There is currently no spreadsheet sheet tab configured for <b className="text-brand-brown font-black">{activeTabName}</b>. Create the tab with automated balances to begin ledger logging.
                  </p>
                </div>
                <button
                  onClick={handleInitializeMonth}
                  disabled={isSheetLoading}
                  className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 mx-auto shadow-md disabled:opacity-50"
                >
                  {isSheetLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Initialize Month: {activeTabName}
                </button>
              </div>
            ) : (
              /* Month is loaded and initialized */
              <>
                <div className={activeLedgerView === 'sheet' ? "grid grid-cols-1 lg:grid-cols-3 gap-8 items-start" : "hidden"}>
                
                {/* Left Side elements: Overview cards + Input logs form */}
                <div className="lg:col-span-1 space-y-8">
                  
                  {/* Balance Overview Card with editor popup */}
                  <div className="bg-white border border-brand-brown/10 rounded-3xl p-6 shadow-sm space-y-6">
                    <div className="flex justify-between items-center pb-4 border-b border-brand-brown/10">
                      <h4 className="text-xs font-black uppercase tracking-widest text-brand-brown/50">Balancing Dashboard</h4>
                      
                      {!isEditingOpening ? (
                        <button 
                          onClick={() => {
                            setEditOpeningCash(openingCash);
                            setEditOpeningBank(openingBank);
                            setIsEditingOpening(true);
                          }}
                          className="text-[10px] font-black uppercase text-emerald-600 hover:underline flex items-center gap-1"
                        >
                          Edit Opening
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button 
                            onClick={handleSaveOpeningBalances}
                            disabled={isSavingOpening}
                            className="text-[10px] font-black uppercase text-emerald-600 hover:underline"
                          >
                            Save
                          </button>
                          <button 
                            onClick={() => setIsEditingOpening(false)}
                            className="text-[10px] font-black uppercase text-zinc-400 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Opening Balances state displays */}
                    {isEditingOpening ? (
                      <div className="space-y-4 bg-brand-stone/30 p-4 rounded-2xl border border-brand-brown/5">
                        <h5 className="text-[10px] font-black uppercase text-brand-brown/45">Edit Opening Balances (Row 2)</h5>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-extrabold text-brand-brown/60 uppercase">Opening Cash</label>
                            <input 
                              type="number" 
                              value={editOpeningCash}
                              onChange={e => setEditOpeningCash(parseFloat(e.target.value) || 0)}
                              className="w-full p-2 bg-white border border-brand-brown/10 rounded-lg text-xs font-bold outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-extrabold text-brand-brown/60 uppercase">Opening Bank</label>
                            <input 
                              type="number" 
                              value={editOpeningBank}
                              onChange={e => setEditOpeningBank(parseFloat(e.target.value) || 0)}
                              className="w-full p-2 bg-white border border-brand-brown/10 rounded-lg text-xs font-bold outline-none"
                            />
                          </div>
                          <div className="space-y-1 col-span-2">
                            <label className="text-[9px] font-extrabold text-brand-brown/60 uppercase">Reason for Edit <span className="text-brand-red">*</span></label>
                            <input 
                              type="text" 
                              placeholder="e.g. Correcting starting cash count"
                              value={editOpeningReason}
                              onChange={e => setEditOpeningReason(e.target.value)}
                              className="w-full p-2 bg-white border border-brand-brown/10 rounded-lg text-xs outline-none focus:border-emerald-600"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-brand-stone/30 p-4 rounded-2xl border border-brand-brown/5">
                          <span className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider">Opening Cash</span>
                          <span className="text-lg font-black block text-brand-brown tracking-tight mt-1">₹{openingCash.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="bg-brand-stone/30 p-4 rounded-2xl border border-brand-brown/5">
                          <span className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider">Opening Bank</span>
                          <span className="text-lg font-black block text-zinc-400 tracking-tight mt-1">₹{openingBank.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    )}

                    {/* Current Month Credits/Debits Breakdown */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Total Credits (Month)
                        </span>
                        <span className="font-bold text-emerald-600">+₹{(totalCreditCash + totalCreditBank).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-red"></span>
                          Total Debits (Month)
                        </span>
                        <span className="font-bold text-brand-red">-₹{(totalDebitCash + totalDebitBank).toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    {/* Monthly Closing Balance output */}
                    <div className="bg-brand-brown text-brand-cream rounded-2xl p-4 flex justify-between items-center">
                      <div>
                        <span className="text-[9px] font-bold text-brand-yellow uppercase tracking-widest">Ending Ledger Ball</span>
                        <span className="text-2xl font-black block tracking-tight mt-0.5">₹{closingTotal.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="text-right space-y-0.5 text-xs text-white/50 font-bold">
                        <div>Cash: ₹{closingCash.toLocaleString('en-IN')}</div>
                        <div>Bank: ₹{closingBank.toLocaleString('en-IN')}</div>
                      </div>
                    </div>
                  </div>

                  {/* Log Action Transaction sheet form */}
                  <div className="bg-white border border-brand-brown/10 rounded-3xl p-6 shadow-sm space-y-6">
                    <h3 className="text-xs font-black uppercase text-brand-brown/50 tracking-widest pb-3 border-b border-brand-brown/10">Add Transaction Row</h3>

                    <form onSubmit={handleAddTransaction} className="space-y-4">
                      
                      {/* Credit vs Debit selector radio tabs */}
                      <div className="grid grid-cols-2 bg-brand-stone/40 p-1.5 rounded-2xl border border-brand-brown/5">
                        <button
                          type="button"
                          onClick={() => setTxType('credit')}
                          className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            txType === 'credit' ? 'bg-emerald-600 text-white shadow-md' : 'text-stone-400'
                          }`}
                        >
                          Credit (In)
                        </button>
                        <button
                          type="button"
                          onClick={() => setTxType('debit')}
                          className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            txType === 'debit' ? 'bg-brand-red text-white shadow-md' : 'text-stone-400'
                          }`}
                        >
                          Debit (Out)
                        </button>
                      </div>

                      {/* Cash vs Bank toggle tabs */}
                      <div className="grid grid-cols-2 bg-brand-stone/40 p-1.5 rounded-2xl border border-brand-brown/5">
                        <button
                          type="button"
                          onClick={() => setTxMethod('cash')}
                          className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            txMethod === 'cash' ? 'bg-white text-brand-brown shadow-sm' : 'text-stone-400'
                          }`}
                        >
                          Cash Transaction
                        </button>
                        <button
                          type="button"
                          onClick={() => setTxMethod('bank')}
                          className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            txMethod === 'bank' ? 'bg-white text-brand-brown shadow-sm' : 'text-stone-400'
                          }`}
                        >
                          Bank Transaction
                        </button>
                      </div>

                      {/* Category field */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase tracking-wide text-brand-brown/60">Category Type</label>
                          <button
                            type="button"
                            onClick={() => setIsManageCategoriesOpen(true)}
                            className="text-[9px] font-black text-brand-brown/50 hover:text-emerald-700 hover:underline uppercase tracking-wider flex items-center gap-1 transition-colors"
                          >
                            ⚙️ Manage List
                          </button>
                        </div>
                        <select
                          value={txCategory}
                          onChange={e => setTxCategory(e.target.value)}
                          className="w-full p-3 bg-brand-stone/20 border border-brand-brown/10 rounded-xl text-xs font-bold ring-0 outline-none"
                        >
                          {txType === 'credit' ? (
                            creditCategories.map(c => (
                              <option key={c} value={c}>
                                {c} {categoryMappings[c] && categoryMappings[c].length > 0 ? `(🔗 Mapped)` : ''}
                              </option>
                            ))
                          ) : (
                            debitCategories.map(c => (
                              <option key={c} value={c}>
                                {c} {categoryMappings[c] && categoryMappings[c].length > 0 ? `(🔗 Mapped)` : ''}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      {/* Funding Source Selector */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wide text-brand-brown/60">Funding/Capital Source</label>
                        <select
                          value={txFundingSource}
                          onChange={e => setTxFundingSource(e.target.value as 'revenue' | 'investment')}
                          className="w-full p-3 bg-brand-stone/20 border border-brand-brown/10 rounded-xl text-xs font-bold ring-0 outline-none"
                        >
                          <option value="revenue">Earned Revenue / Operational</option>
                          <option value="investment">Capital Investment Fund</option>
                        </select>
                      </div>

                      {/* Notes of tx row */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wide text-brand-brown/60">Details Notes (Optional)</label>
                        <input
                          type="text"
                          value={txNotes}
                          onChange={e => setTxNotes(e.target.value)}
                          placeholder="e.g. evening collections, vegetables purchase"
                          className="w-full p-3 bg-brand-stone/20 border border-brand-brown/10 rounded-xl text-xs font-bold outline-none"
                        />
                      </div>

                      {/* Amount and Date Fields */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-wide text-brand-brown/60">Amount (INR)</label>
                          <input
                            type="number"
                            value={txAmount || ''}
                            onChange={e => setTxAmount(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="w-full p-3 bg-brand-stone/20 border border-brand-brown/10 rounded-xl text-xs font-black outline-none"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-wide text-brand-brown/60">Tx Date</label>
                          <input
                            type="date"
                            value={txDate}
                            onChange={e => setTxDate(e.target.value)}
                            className="w-full p-3 bg-brand-stone/20 border border-brand-brown/10 rounded-xl text-xs font-bold outline-none"
                            required
                          />
                        </div>
                      </div>

                      {/* Optional Bill Upload */}
                      <div className="space-y-1 bg-brand-stone/10 p-4 rounded-2xl border border-brand-brown/10">
                        <label className="text-[10px] font-black uppercase tracking-wide text-brand-brown/60 flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5 text-brand-brown/60" />
                          Upload Receipt/Bill (Optional)
                        </label>
                        <p className="text-[9px] text-zinc-400 font-semibold mb-2">
                          File will be securely saved in Supabase Storage and referenced as a clean clickable receipt link.
                        </p>
                        
                         {!selectedFile ? (
                          <div className="grid grid-cols-2 gap-3 w-full">
                            {/* Option 1: File Uploader Card */}
                            <label className="flex flex-col items-center justify-center h-24 border-2 border-brand-brown/15 border-dashed rounded-xl cursor-pointer hover:bg-brand-stone/20 duration-150">
                              <div className="flex flex-col items-center justify-center p-2 text-center">
                                <Upload className="w-5 h-5 text-zinc-500 mb-1" />
                                <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider leading-tight">Select File</p>
                                <p className="text-[7px] text-zinc-400 mt-0.5 font-medium leading-none">PDF, Images up to 10MB</p>
                              </div>
                              <input 
                                type="file" 
                                className="hidden" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) setSelectedFile(file);
                                }} 
                              />
                            </label>

                            {/* Option 2: Live Camera Capture Card */}
                            <button
                              type="button"
                              onClick={() => {
                                setIsCameraModalOpen(true);
                                setCameraError(null);
                              }}
                              className="flex flex-col items-center justify-center h-24 border-2 border-brand-brown/15 border-dashed rounded-xl cursor-pointer hover:bg-brand-stone/20 duration-150 outline-none"
                            >
                              <div className="flex flex-col items-center justify-center p-2 text-center">
                                <Camera className="w-5 h-5 text-zinc-500 mb-1" />
                                <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider leading-tight">Take Photo</p>
                                <p className="text-[7px] text-zinc-400 mt-0.5 font-medium leading-none font-sans">Use device camera</p>
                              </div>
                            </button>
                          </div>
                        ) : (
                          <div className="bg-white border border-brand-brown/10 rounded-xl p-3 flex justify-between items-center text-xs">
                            <div className="flex items-center gap-2 truncate pr-2">
                              <span className="p-1.5 bg-brand-stone/35 rounded-lg text-emerald-600 font-bold">📄</span>
                              <div className="truncate text-left">
                                <p className="font-bold text-[10px] text-brand-brown truncate">{selectedFile.name}</p>
                                <p className="text-[9px] text-zinc-400 font-medium font-mono">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedFile(null)}
                              className="p-1 px-2 hover:bg-zinc-100 rounded text-[9px] font-black uppercase text-brand-red outline-none"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Action submit */}
                      <button
                        type="submit"
                        disabled={isAddingTx || isUploadingFile || txAmount <= 0}
                        className={`w-full py-4 mt-2 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-md transition-all ${
                          txType === 'credit' ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50' : 'bg-brand-red hover:bg-red-700 disabled:bg-brand-red/50'
                        }`}
                      >
                        {isAddingTx || isUploadingFile ? (
                          <RefreshCw className="w-5.5 h-5.5 animate-spin mx-auto" />
                        ) : (
                          `Record Ledger Row`
                        )}
                      </button>

                    </form>
                  </div>
                </div>

                {/* Right Side: Log spreadsheet grid data */}
                <div className="lg:col-span-2 bg-white rounded-3xl border border-brand-brown/10 overflow-hidden shadow-sm flex flex-col h-[700px]">
                  
                  {/* Grid Header and trigger refresh */}
                  <div className="p-6 border-b border-brand-brown/10 bg-white flex justify-between items-center bg-stone-50/50 flex-shrink-0">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-brand-brown/80">
                        {dashboardPeriod === 'month'
                          ? `${activeTabName} Ledger Records`
                          : `Ledger Entries (${getDashboardDateRange().start} to ${getDashboardDateRange().end})`}
                      </h4>
                      <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                        {sheetRows.length > 2
                          ? `${sheetRows.length - 2} entries in active interval`
                          : (sheetRows.length > 1 && sheetRows[1][1] ? `1 entry in active interval` : `No records found in this interval`)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={handleAddTodaysRevenue}
                        disabled={isAddingRevenue}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors disabled:opacity-50 select-none cursor-pointer shadow-sm"
                        title="Calculate today's sales (Cash and Card+UPI) to the ledger"
                      >
                        {isAddingRevenue ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <PlusCircle className="w-3.5 h-3.5 text-brand-yellow" />
                        )}
                        <span>Add Today's Revenue</span>
                      </button>

                      <button 
                        type="button"
                        onClick={() => {
                          setModalActiveTab('subcategories');
                          setIsManageCategoriesOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 border border-brand-brown/15 bg-white hover:bg-brand-stone/30 rounded-lg text-brand-brown/85 text-[10px] font-black uppercase tracking-wider transition-colors select-none cursor-pointer shadow-sm"
                        title="Manage Stock Subcategories & Expense Mappings"
                      >
                        <Layers className="w-3.5 h-3.5 text-brand-brown/70" />
                        <span>Mappings</span>
                      </button>

                      <button 
                        onClick={exportToCSV}
                        disabled={sheetRows.length <= 1}
                        className="flex items-center gap-1.5 px-3 py-2 border border-brand-brown/15 bg-white hover:bg-brand-stone/30 rounded-lg text-brand-brown/85 text-[10px] font-black uppercase tracking-wider transition-colors disabled:opacity-40 select-none"
                        title="Export this ledger view to CSV"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-600" />
                        Export CSV
                      </button>

                      <button 
                        onClick={loadSheetRows}
                        disabled={isSheetLoading}
                        className="p-2 border border-brand-brown/10 hover:bg-brand-stone/30 rounded-lg text-brand-brown/85 transition-colors disabled:opacity-40"
                        title="Reload ledger rows"
                      >
                        <RefreshCw className={`w-4 h-4 ${isSheetLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {dashboardPeriod !== 'month' && (
                    <div className="mx-6 mt-4 p-3 px-4 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-emerald-700" />
                        <span className="font-bold text-emerald-950 text-[11px]">
                          Interval filter active: <b className="font-black">{getDashboardDateRange().start}</b> to <b className="font-black">{getDashboardDateRange().end}</b>
                        </span>
                        <span className="text-[10px] bg-white px-2.5 py-0.5 rounded-full border border-emerald-200 text-emerald-800 font-black">
                          {sheetRows.length > 2 ? `${sheetRows.length - 2} entries` : '0 entries'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDashboardPeriod('month')}
                        className="text-[10px] font-black uppercase tracking-wider text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                      >
                        Reset to Full Month
                      </button>
                    </div>
                  )}

                  {/* Spreadsheet Grid container */}
                  <div className="flex-1 overflow-auto custom-scrollbar">
                    {isSheetLoading && sheetRows.length === 0 ? (
                      /* Show load skeleten skeleton */
                      <div className="p-8 space-y-4 animate-pulse">
                        <div className="h-8 bg-zinc-200/50 rounded-lg w-1/4"></div>
                        <div className="h-10 bg-zinc-100 rounded-lg"></div>
                        <div className="h-10 bg-zinc-100 rounded-lg"></div>
                        <div className="h-10 bg-zinc-100 rounded-lg"></div>
                        <div className="h-10 bg-zinc-100 rounded-lg"></div>
                      </div>
                    ) : sheetRows.length === 0 ? (
                      /* Completely empty file logs */
                      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-zinc-400 space-y-3">
                        <FileSpreadsheet className="w-12 h-12 text-zinc-200" />
                        <p className="text-xs uppercase font-bold tracking-widest leading-normal">Woah! No recorded rows found in sheets</p>
                      </div>
                    ) : (
                      /* Table body element rendering columns */
                      <table className="w-full text-left text-xs border-collapse font-sans font-medium">
                        
                        {/* Headers row */}
                        <thead className="sticky top-0 bg-brand-stone text-brand-brown border-b border-brand-brown/15 shadow-sm text-[10px] font-black uppercase tracking-wider z-10">
                          <tr>
                            <th className="py-4 px-4 text-center whitespace-nowrap bg-zinc-50/10">Actions</th>
                            <th className="py-4 px-4 whitespace-nowrap">Date</th>
                            <th className="py-4 px-4 whitespace-nowrap text-right">Credit Cash</th>
                            <th className="py-4 px-4">Cash Details</th>
                            <th className="py-4 px-4 text-right whitespace-nowrap">Credit Bank</th>
                            <th className="py-4 px-4">Bank Details</th>
                            <th className="py-4 px-4 text-right whitespace-nowrap">Debit Cash</th>
                            <th className="py-4 px-4">Debit Details</th>
                            <th className="py-4 px-4 text-right whitespace-nowrap">Debit Bank</th>
                            <th className="py-4 px-4">Debit Details</th>
                            <th className="py-4 px-4 text-right whitespace-nowrap">Total Cash</th>
                            <th className="py-4 px-4 text-right whitespace-nowrap">Total Bank</th>
                            <th className="py-4 px-4 text-right whitespace-nowrap bg-emerald-500/5">Total All</th>
                          </tr>
                        </thead>

                        {/* Sheet values */}
                        <tbody className="divide-y divide-brand-brown/10 select-all">
                          {sheetRows.slice(1).map((row, idx) => {
                            // Map the items based on layout:
                            // 0: Date, 1: CrCash, 2: CrCashDetails, 3: CrBank, 4: CrBankDetails
                            // 5: DbCash, 6: DbCashDetails, 7: DbBank, 8: DbBankDetails
                            // 9: TotalCash, 10: TotalBank, 11: TotalAll
                            const date = row[0] || '-';
                            const crCash = row[1] ? parseFloat(row[1]) : 0;
                            const crDetails = row[2] || '';
                            const crBank = row[3] ? parseFloat(row[3]) : 0;
                            const crBDetails = row[4] || '';
                            const dbCash = row[5] ? parseFloat(row[5]) : 0;
                            const dbDetails = row[6] || '';
                            const dbBank = row[7] ? parseFloat(row[7]) : 0;
                            const dbBDetails = row[8] || '';

                            // Values or ledger computations
                            const cashTot = parseFloat(row[9]) || 0;
                            const bankTot = parseFloat(row[10]) || 0;
                            const allTot = parseFloat(row[11]) || 0;

                            const isOpeningRow = idx === 0;

                            return (
                              <tr 
                                key={idx} 
                                className={`group hover:bg-brand-stone/20 duration-150 transition-colors ${
                                  isOpeningRow ? 'bg-amber-500/5 font-bold italic border-b border-brand-yellow/30' : ''
                                }`}
                              >
                                {/* Actions Column */}
                                <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                  {!isOpeningRow ? (
                                    <div className="flex items-center justify-center gap-1.5 font-sans">
                                      <button
                                        type="button"
                                        onClick={() => handleInitiateEditTransaction(idx)}
                                        className="p-1 px-1.5 rounded text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 duration-150 transition-all outline-none cursor-pointer"
                                        title="Edit Ledger Entry"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTransaction(idx)}
                                        className="p-1 px-1.5 rounded text-zinc-400 hover:text-brand-red hover:bg-brand-red/15 duration-150 transition-all outline-none cursor-pointer"
                                        title="Delete Ledger Entry"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>

                                      {(() => {
                                        const rec = row[13];
                                        const hasEditHistory = rec && rec.edit_history && rec.edit_history.length > 0;
                                        if (hasEditHistory) {
                                          return (
                                            <button
                                              type="button"
                                              onClick={() => setActiveAuditRec(rec)}
                                              className="p-1 px-1.5 rounded text-zinc-400 hover:text-amber-600 hover:bg-amber-50 duration-150 transition-all outline-none cursor-pointer"
                                              title="View Transaction Audit Trail"
                                            >
                                              <History className="w-3.5 h-3.5 text-amber-500" />
                                            </button>
                                          );
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  ) : (
                                    /* Opening balance row - can show edit icon which links to opening editor or simply show History if it was edited */
                                    (() => {
                                      const rec = row[13];
                                      const hasEditHistory = rec && rec.edit_history && rec.edit_history.length > 0;
                                      if (hasEditHistory) {
                                        return (
                                          <button
                                            type="button"
                                            onClick={() => setActiveAuditRec(rec)}
                                            className="p-1 px-1.5 rounded text-zinc-400 hover:text-amber-600 hover:bg-amber-50 duration-150 transition-all outline-none cursor-pointer mx-auto block"
                                            title="View Opening Balance Audit Trail"
                                          >
                                            <History className="w-3.5 h-3.5 text-amber-500" />
                                          </button>
                                        );
                                      }
                                      return <span className="text-[10px] text-zinc-400 italic">Init</span>;
                                    })()
                                  )}
                                </td>

                                <td className="py-3.5 px-4 font-mono whitespace-nowrap">{date}</td>
                                
                                {/* Credit Cash Row */}
                                <td className={`py-3.5 px-4 text-right font-black ${crCash > 0 ? 'text-emerald-600' : 'text-zinc-300'}`}>
                                  {crCash > 0 ? `₹${crCash.toLocaleString('en-IN')}` : '-'}
                                </td>
                                <td className="py-3.5 px-4 max-w-[120px]">
                                  {renderDetailsWithLink(crDetails)}
                                </td>

                                {/* Credit Bank Row */}
                                <td className={`py-3.5 px-4 text-right font-black ${crBank > 0 ? 'text-emerald-600' : 'text-zinc-300'}`}>
                                  {crBank > 0 ? `₹${crBank.toLocaleString('en-IN')}` : '-'}
                                </td>
                                <td className="py-3.5 px-4 max-w-[120px]">
                                  {renderDetailsWithLink(crBDetails)}
                                </td>

                                {/* Debit Cash Row */}
                                <td className={`py-3.5 px-4 text-right font-black ${dbCash > 0 ? 'text-brand-red' : 'text-zinc-300'}`}>
                                  {dbCash > 0 ? `₹${dbCash.toLocaleString('en-IN')}` : '-'}
                                </td>
                                <td className="py-3.5 px-4 max-w-[120px]">
                                  {renderDetailsWithLink(dbDetails)}
                                </td>

                                {/* Debit Bank Row */}
                                <td className={`py-3.5 px-4 text-right font-black ${dbBank > 0 ? 'text-brand-red' : 'text-zinc-300'}`}>
                                  {dbBank > 0 ? `₹${dbBank.toLocaleString('en-IN')}` : '-'}
                                </td>
                                <td className="py-3.5 px-4 max-w-[120px]">
                                  {renderDetailsWithLink(dbBDetails)}
                                </td>

                                {/* Totals Columns */}
                                <td className="py-3.5 px-4 text-right font-mono font-bold text-zinc-500 whitespace-nowrap">
                                  ₹{cashTot.toLocaleString('en-IN')}
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono font-bold text-zinc-500 whitespace-nowrap">
                                  ₹{bankTot.toLocaleString('en-IN')}
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono font-black text-brand-brown whitespace-nowrap bg-emerald-500/5">
                                  ₹{allTot.toLocaleString('en-IN')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>

                      </table>
                    )}
                  </div>

                  {/* Info legend details */}
                  <div className="p-4 border-t border-brand-brown/10 bg-brand-stone/30 text-[10px] text-zinc-400 font-semibold flex flex-wrap items-center gap-4 flex-shrink-0">
                    <span className="flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-zinc-400" />
                      Excel formula sheets compute the Total columns in real-time.
                    </span>
                  </div>

                </div>

              </div>

              {/* P&L and Financial Accounting Statements */}
              {activeLedgerView === 'pnl' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  {/* Period Filter & Statement Controls Header */}
                  <div className="bg-white border border-brand-brown/10 p-6 rounded-3xl shadow-sm flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                    <div className="space-y-1 text-left">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-2xs">
                          <TrendingUp className="w-4 h-4" />
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-wider text-brand-brown">
                          Profit &amp; Loss Statement
                        </h3>
                        <span className="py-0.5 px-2 bg-emerald-100/70 text-emerald-800 text-[9px] font-black uppercase tracking-widest rounded-full border border-emerald-200">
                          Live Report
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 font-semibold uppercase">
                        {dashboardPeriod === 'this_month' ? `Monthly ledger aggregate for ${activeTabName}` : `Custom date period active: ${getDashboardDateRange().start} to ${getDashboardDateRange().end}`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex flex-wrap gap-1 bg-brand-stone/50 p-1 rounded-2xl border border-brand-brown/10 text-xs font-bold leading-none shadow-2xs">
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('today')}
                          className={`py-1.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'today' ? 'bg-brand-brown text-brand-yellow shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('this_week')}
                          className={`py-1.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'this_week' ? 'bg-brand-brown text-brand-yellow shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          This Week
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('this_month')}
                          className={`py-1.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'this_month' ? 'bg-brand-brown text-brand-yellow shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          This Month
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('custom')}
                          className={`py-1.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'custom' ? 'bg-brand-brown text-brand-yellow shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          Custom Range
                        </button>
                      </div>

                      {dashboardPeriod === 'custom' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={customStartDate}
                            onChange={e => setCustomStartDate(e.target.value)}
                            className="bg-brand-stone/40 p-1.5 text-[10px] font-bold uppercase rounded-lg border border-brand-brown/10 outline-none text-brand-brown"
                          />
                          <span className="text-[10px] text-zinc-400 font-bold font-mono">TO</span>
                          <input
                            type="date"
                            value={customEndDate}
                            onChange={e => setCustomEndDate(e.target.value)}
                            className="bg-brand-stone/40 p-1.5 text-[10px] font-bold uppercase rounded-lg border border-brand-brown/10 outline-none text-brand-brown"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-2 ml-auto xl:ml-0">
                        <button
                          type="button"
                          onClick={() => {
                            const areAnyExpanded = Object.values(expandedPnlSections).some(Boolean);
                            const nextState = !areAnyExpanded;
                            setExpandedPnlSections({
                              revenue: nextState,
                              cogs: nextState,
                              variable: nextState,
                              fixed: nextState,
                              other: nextState,
                              cfInflows: nextState,
                              cfOutflows: nextState
                            });
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100/80 text-amber-900 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors select-none cursor-pointer border border-amber-200/80 shadow-2xs"
                          title="Expand or collapse all P&L subcategories"
                        >
                          {Object.values(expandedPnlSections).some(Boolean) ? (
                            <>
                              <ChevronDown className="w-3.5 h-3.5 text-amber-700" />
                              <span>Collapse All</span>
                            </>
                          ) : (
                            <>
                              <ChevronRight className="w-3.5 h-3.5 text-amber-700" />
                              <span>Expand All</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={exportPnlToCSV}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors select-none cursor-pointer border border-emerald-700 shadow-xs"
                          title="Export P&L statement as CSV"
                        >
                          <Download className="w-3.5 h-3.5 text-white" />
                          <span>Export CSV</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-brown hover:bg-brand-brown/90 text-brand-yellow rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors select-none cursor-pointer border border-brand-brown/20 shadow-xs"
                          title="Print or save statement as PDF"
                        >
                          <Printer className="w-3.5 h-3.5 text-brand-yellow" />
                          <span>Print</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Financial Summary Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                    {/* Card 1: Gross Income Turnover (Emerald) */}
                    <div className="bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white border-2 border-emerald-200/90 rounded-3xl p-4.5 shadow-xs text-left relative overflow-hidden group hover:border-emerald-300 transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-2xs">
                            <TrendingUp className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900">Gross Turnover</span>
                        </div>
                        <span className="text-[9px] font-mono font-black text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded-full">
                          100.0%
                        </span>
                      </div>
                      <div className="text-2xl font-black font-mono text-emerald-950 tracking-tight">
                        ₹{pnlBreakdown.accrual.totalRev.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-emerald-700 font-bold mt-1">
                        In-Store Live Sales + Zomato
                      </div>
                    </div>

                    {/* Card 2: Total COGS (Amber / Peak Amber) */}
                    <div className="bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-white border-2 border-amber-200/90 rounded-3xl p-4.5 shadow-xs text-left relative overflow-hidden group hover:border-amber-300 transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-2xs">
                            <ShoppingBag className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-900">Total COGS</span>
                        </div>
                        <span className="text-[9px] font-mono font-black text-amber-800 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-full">
                          {pnlBreakdown.accrual.cogsPctOfRev.toFixed(1)}% Rev
                        </span>
                      </div>
                      <div className="text-2xl font-black font-mono text-amber-950 tracking-tight">
                        ₹{pnlBreakdown.accrual.totalCogs.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-amber-700 font-bold mt-1">
                        10 Direct Material Stock Lines
                      </div>
                    </div>

                    {/* Card 3: CM1 (Sky / Blue) */}
                    <div className="bg-gradient-to-br from-sky-50/90 via-blue-50/40 to-white border-2 border-sky-200/90 rounded-3xl p-4.5 shadow-xs text-left relative overflow-hidden group hover:border-sky-300 transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-xl bg-sky-500 text-white flex items-center justify-center shadow-2xs">
                            <PieChartIcon className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-sky-900">Contrib. Margin 1</span>
                        </div>
                        <span className="text-[9px] font-mono font-black text-sky-800 bg-sky-100/90 border border-sky-300 px-2 py-0.5 rounded-full">
                          {pnlBreakdown.accrual.cm1Pct.toFixed(1)}% Rev
                        </span>
                      </div>
                      <div className="text-2xl font-black font-mono text-sky-950 tracking-tight">
                        ₹{pnlBreakdown.accrual.cm1.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-sky-700 font-bold mt-1">
                        Gross Income minus Direct COGS
                      </div>
                    </div>

                    {/* Card 4: CM2 (Indigo / Purple) */}
                    <div className="bg-gradient-to-br from-indigo-50/90 via-purple-50/40 to-white border-2 border-indigo-200/90 rounded-3xl p-4.5 shadow-xs text-left relative overflow-hidden group hover:border-indigo-300 transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-xl bg-indigo-500 text-white flex items-center justify-center shadow-2xs">
                            <Activity className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900">Contrib. Margin 2</span>
                        </div>
                        <span className="text-[9px] font-mono font-black text-indigo-800 bg-indigo-100/90 border border-indigo-300 px-2 py-0.5 rounded-full">
                          {pnlBreakdown.accrual.cm2Pct.toFixed(1)}% Rev
                        </span>
                      </div>
                      <div className="text-2xl font-black font-mono text-indigo-950 tracking-tight">
                        ₹{pnlBreakdown.accrual.cm2.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-indigo-700 font-bold mt-1">
                        After Channels &amp; Gas Utilities
                      </div>
                    </div>

                    {/* Card 5: Net Margin / Bottomline Position */}
                    {pnlBreakdown.accrual.netProfit >= 0 ? (
                      <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 border-2 border-emerald-500 rounded-3xl p-4.5 shadow-md text-left text-white relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-2xs">
                              <TrendingUp className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100">Net Profit</span>
                          </div>
                          <span className="text-[9px] font-mono font-black text-brand-brown bg-brand-yellow px-2 py-0.5 rounded-full shadow-xs">
                            {pnlBreakdown.accrual.netMarginPct.toFixed(1)}% Rev
                          </span>
                        </div>
                        <div className="text-2xl font-black font-mono text-white tracking-tight">
                          +₹{pnlBreakdown.accrual.netProfit.toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-emerald-100 font-bold mt-1">
                          Net Operating Position
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gradient-to-br from-rose-600 via-rose-700 to-red-800 border-2 border-rose-500 rounded-3xl p-4.5 shadow-md text-left text-white relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-2xs">
                              <TrendingDown className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-rose-100">Net Loss</span>
                          </div>
                          <span className="text-[9px] font-mono font-black text-rose-900 bg-white px-2 py-0.5 rounded-full shadow-xs">
                            {pnlBreakdown.accrual.netMarginPct.toFixed(1)}% Rev
                          </span>
                        </div>
                        <div className="text-2xl font-black font-mono text-white tracking-tight">
                          -₹{Math.abs(pnlBreakdown.accrual.netProfit).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-rose-100 font-bold mt-1">
                          Net Operating Position
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Profit & Loss (Accrual Waterfall) and Cash Flow Statements Comparison Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* ACCRUAL STATEMENT SECTION */}
                    <div className="bg-white border border-brand-brown/10 rounded-3xl p-6 shadow-sm space-y-6 text-left">
                      <div className="flex justify-between items-start border-b border-zinc-100 pb-4">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-brand-brown flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Accrual Accounting P&amp;L
                          </h4>
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase mt-0.5">
                            Matches revenue earned against expenses incurred (Wednesday cycles adjusted)
                          </p>
                        </div>
                        <span className="py-1 px-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[8px] font-black uppercase tracking-wider rounded-lg shadow-2xs">
                          Accrual Basis
                        </span>
                      </div>

                      <div className="space-y-4">
                        {/* 1. GROSS INCOME REVENUES */}
                        <div className="border border-emerald-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                          <button
                            type="button"
                            onClick={() => togglePnlSection('revenue')}
                            className="w-full flex items-center justify-between p-3.5 bg-emerald-50/60 hover:bg-emerald-50 transition-colors text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              {expandedPnlSections.revenue ? (
                                <ChevronDown className="w-4 h-4 text-emerald-700 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-emerald-700 shrink-0" />
                              )}
                              <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                                <TrendingUp className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <h5 className="text-[11px] font-black uppercase tracking-wider text-emerald-950">
                                  1. Gross Income (Revenues Earned)
                                </h5>
                                <span className="text-[9px] text-emerald-700/80 font-medium">
                                  In-Store Live Sales + Zomato Delivery
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono font-black text-emerald-800 bg-emerald-100/90 border border-emerald-300/80 px-2 py-0.5 rounded-md text-right">
                                100.00%
                              </span>
                              <span className="font-mono font-black text-emerald-950 w-24 text-right text-sm">
                                ₹{pnlBreakdown.accrual.totalRev.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </button>

                          {expandedPnlSections.revenue && (
                            <div className="border-t border-emerald-200/60 bg-emerald-50/30 p-3.5 space-y-2">
                              <div className="flex justify-between text-xs items-center">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                                  <span className="text-zinc-700 font-medium">In-Store Live Sales (Turnover)</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-emerald-700 w-14 text-right">
                                    {pnlBreakdown.accrual.inStoreRevPct.toFixed(2)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    ₹{pnlBreakdown.accrual.inStoreRev.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs items-center">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                  <span className="text-zinc-700 font-medium">Zomato Delivery Revenue (Accrued Wed cycle)</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-emerald-700 w-14 text-right">
                                    {pnlBreakdown.accrual.zomatoRevPct.toFixed(2)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    ₹{pnlBreakdown.accrual.zomatoRev.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 2. LESS: COST OF GOODS SOLD (COGS) */}
                        <div className="border border-amber-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                          <button
                            type="button"
                            onClick={() => togglePnlSection('cogs')}
                            className="w-full flex items-center justify-between p-3.5 bg-amber-50/60 hover:bg-amber-50 transition-colors text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              {expandedPnlSections.cogs ? (
                                <ChevronDown className="w-4 h-4 text-amber-700 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-amber-700 shrink-0" />
                              )}
                              <div className="w-6 h-6 rounded-lg bg-amber-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                                <ShoppingBag className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <h5 className="text-[11px] font-black uppercase tracking-wider text-amber-950">
                                  2. Less: Cost of Goods Sold (COGS)
                                </h5>
                                <span className="text-[9px] text-amber-700/80 font-medium">
                                  10 Direct material &amp; stock categories
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono font-black text-amber-800 bg-amber-100/90 border border-amber-300/80 px-2 py-0.5 rounded-md text-right">
                                -{pnlBreakdown.accrual.cogsPctOfRev.toFixed(2)}%
                              </span>
                              <span className="font-mono font-black text-amber-950 w-24 text-right text-sm">
                                -₹{pnlBreakdown.accrual.totalCogs.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </button>

                          {expandedPnlSections.cogs && (
                            <div className="border-t border-amber-200/60 bg-amber-50/30 p-3.5 space-y-2">
                              <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider text-amber-800/80 px-1 border-b border-amber-200 pb-1.5">
                                <span>COGS Category (Ranked by Value &amp; % of Rev)</span>
                                <div className="flex items-center gap-3">
                                  <span className="w-14 text-right">% of Rev</span>
                                  <span className="w-24 text-right">Amount (₹)</span>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                {pnlBreakdown.accrual.cogsList.map((item, rankIdx) => (
                                  <div 
                                    key={item.key} 
                                    className="flex items-center justify-between text-xs py-1.5 px-2 rounded-xl hover:bg-white transition-colors"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-[9px] font-mono font-black text-amber-800 bg-amber-100 border border-amber-200/60 px-1 py-0.5 rounded">
                                        #{rankIdx + 1}
                                      </span>
                                      <span className="text-sm shrink-0">{item.icon}</span>
                                      <span className="text-zinc-800 font-semibold truncate text-xs">
                                        {item.label}
                                      </span>
                                      <div className="w-14 h-1.5 bg-amber-100/80 rounded-full overflow-hidden hidden sm:block">
                                        <div 
                                          className="h-full bg-amber-500 rounded-full" 
                                          style={{ width: `${Math.min(100, (item.amount / Math.max(1, pnlBreakdown.accrual.totalCogs)) * 100)}%` }} 
                                        />
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className={`text-[10px] font-mono font-semibold w-14 text-right ${
                                        item.amount > 0 ? 'text-amber-800' : 'text-zinc-300'
                                      }`}>
                                        {item.pctOfRev.toFixed(2)}%
                                      </span>
                                      <span className={`font-mono font-bold w-24 text-right ${
                                        item.amount > 0 ? 'text-zinc-900' : 'text-zinc-300'
                                      }`}>
                                        {item.amount > 0 ? `-₹${item.amount.toLocaleString('en-IN')}` : '₹0'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 3. = CONTRIBUTION MARGIN 1 (CM1) */}
                        <div className="p-4 bg-gradient-to-r from-sky-50 via-blue-50 to-sky-100/60 border-2 border-sky-200/90 rounded-2xl shadow-xs">
                          <div className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 rounded-lg bg-sky-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                                <PieChartIcon className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <span className="text-sky-950 font-black uppercase text-[10px] tracking-wider block">
                                  Contribution Margin 1 (CM1)
                                </span>
                                <span className="text-[9px] text-sky-700/90 font-medium">
                                  Gross Income minus Direct Material COGS
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono font-black text-white bg-sky-600 px-2.5 py-0.5 rounded-full shadow-2xs">
                                {pnlBreakdown.accrual.cm1Pct.toFixed(2)}%
                              </span>
                              <span className="font-mono font-black text-base text-sky-950 w-24 text-right">
                                ₹{pnlBreakdown.accrual.cm1.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 4. LESS: VARIABLE OPERATING EXPENSES */}
                        <div className="border border-orange-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                          <button
                            type="button"
                            onClick={() => togglePnlSection('variable')}
                            className="w-full flex items-center justify-between p-3.5 bg-orange-50/60 hover:bg-orange-50 transition-colors text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              {expandedPnlSections.variable ? (
                                <ChevronDown className="w-4 h-4 text-orange-700 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-orange-700 shrink-0" />
                              )}
                              <div className="w-6 h-6 rounded-lg bg-orange-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                                <Flame className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <h5 className="text-[11px] font-black uppercase tracking-wider text-orange-950">
                                  3. Less: Variable Direct Expenses
                                </h5>
                                <span className="text-[9px] text-orange-700/80 font-medium">
                                  Zomato Commissions/Ads &amp; Gas Utilities
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono font-black text-orange-800 bg-orange-100/90 border border-orange-300/80 px-2 py-0.5 rounded-md text-right">
                                -{pnlBreakdown.accrual.variableExpPct.toFixed(2)}%
                              </span>
                              <span className="font-mono font-black text-orange-950 w-24 text-right text-sm">
                                -₹{pnlBreakdown.accrual.totalVariableExp.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </button>

                          {expandedPnlSections.variable && (
                            <div className="border-t border-orange-200/60 bg-orange-50/30 p-3.5 space-y-2">
                              <div className="flex justify-between text-xs items-center">
                                <span className="text-zinc-700 font-medium">i) Zomato Commission &amp; Direct Ads</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-orange-700 w-14 text-right">
                                    {pnlBreakdown.accrual.zomatoExpPct.toFixed(2)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    -₹{pnlBreakdown.accrual.zomatoExp.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs items-center">
                                <span className="text-zinc-700 font-medium">ii) Utilities &#123;Kitchen Gas / Fuel&#125;</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-orange-700 w-14 text-right">
                                    {pnlBreakdown.accrual.utilitiesExpPct.toFixed(2)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    -₹{pnlBreakdown.accrual.utilitiesExp.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 5. = CONTRIBUTION MARGIN 2 (CM2) */}
                        <div className="p-4 bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-100/60 border-2 border-indigo-200/90 rounded-2xl shadow-xs">
                          <div className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                                <Activity className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <span className="text-indigo-950 font-black uppercase text-[10px] tracking-wider block">
                                  Contribution Margin 2 (CM2)
                                </span>
                                <span className="text-[9px] text-indigo-700/90 font-medium">
                                  CM1 minus Channel Commissions &amp; Utilities
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono font-black text-white bg-indigo-600 px-2.5 py-0.5 rounded-full shadow-2xs">
                                {pnlBreakdown.accrual.cm2Pct.toFixed(2)}%
                              </span>
                              <span className="font-mono font-black text-base text-indigo-950 w-24 text-right">
                                ₹{pnlBreakdown.accrual.cm2.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 6. LESS: FIXED OVERHEAD COSTS */}
                        <div className="border border-rose-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                          <button
                            type="button"
                            onClick={() => togglePnlSection('fixed')}
                            className="w-full flex items-center justify-between p-3.5 bg-rose-50/60 hover:bg-rose-50 transition-colors text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              {expandedPnlSections.fixed ? (
                                <ChevronDown className="w-4 h-4 text-rose-700 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-rose-700 shrink-0" />
                              )}
                              <div className="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                                <Building2 className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <h5 className="text-[11px] font-black uppercase tracking-wider text-rose-950">
                                  4. Less: Fixed Costs (Rent &amp; Staff)
                                </h5>
                                <span className="text-[9px] text-rose-700/80 font-medium">
                                  Store Rent &amp; Staff Wages
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono font-black text-rose-800 bg-rose-100/90 border border-rose-300/80 px-2 py-0.5 rounded-md text-right">
                                -{pnlBreakdown.accrual.fixedExpPct.toFixed(2)}%
                              </span>
                              <span className="font-mono font-black text-rose-950 w-24 text-right text-sm">
                                -₹{pnlBreakdown.accrual.totalFixedExp.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </button>

                          {expandedPnlSections.fixed && (
                            <div className="border-t border-rose-200/60 bg-rose-50/30 p-3.5 space-y-2">
                              <div className="flex justify-between text-xs items-center">
                                <span className="text-zinc-700 font-medium">Store Rent</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-rose-700 w-14 text-right">
                                    {pnlBreakdown.accrual.rentExpPct.toFixed(2)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    -₹{pnlBreakdown.accrual.rentExp.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs items-center">
                                <span className="text-zinc-700 font-medium">Staff Salary &amp; Wages</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-rose-700 w-14 text-right">
                                    {pnlBreakdown.accrual.salaryExpPct.toFixed(2)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    -₹{pnlBreakdown.accrual.salaryExp.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 7. = STORE CORE OPERATING PROFIT (PRE-OTHER) */}
                        <div className="p-3.5 bg-gradient-to-r from-amber-50 to-yellow-50/70 border border-amber-200/90 rounded-2xl flex justify-between items-center text-xs shadow-2xs">
                          <div>
                            <span className="text-amber-950 font-black uppercase text-[10px] tracking-wider block">
                              Core Operating Margin (Pre-Other)
                            </span>
                            <span className="text-[9px] text-amber-700/90 font-medium">
                              CM2 minus Fixed Costs (Rent + Salaries)
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono font-bold text-amber-900 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-md text-right">
                              {pnlBreakdown.accrual.operatingProfitPreOtherPct.toFixed(2)}%
                            </span>
                            <span className="font-mono font-black text-sm text-amber-950 w-24 text-right">
                              ₹{pnlBreakdown.accrual.operatingProfitPreOther.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>

                        {/* 8. LESS: OTHER OPERATING EXPENSES */}
                        <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                          <button
                            type="button"
                            onClick={() => togglePnlSection('other')}
                            className="w-full flex items-center justify-between p-3.5 bg-stone-50/70 hover:bg-stone-100 transition-colors text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              {expandedPnlSections.other ? (
                                <ChevronDown className="w-4 h-4 text-stone-600 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-stone-600 shrink-0" />
                              )}
                              <div className="w-6 h-6 rounded-lg bg-stone-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                                <Receipt className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <h5 className="text-[11px] font-black uppercase tracking-wider text-stone-900">
                                  5. Less: Other Expenses
                                </h5>
                                <span className="text-[9px] text-stone-500 font-medium">
                                  {pnlBreakdown.accrual.otherExpBreakdown.length} subcategories
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono font-bold text-stone-700 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md text-right">
                                -{pnlBreakdown.accrual.otherExpPct.toFixed(2)}%
                              </span>
                              <span className="font-mono font-black text-stone-900 w-24 text-right text-sm">
                                -₹{pnlBreakdown.accrual.otherExp.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </button>

                          {expandedPnlSections.other && (
                            <div className="border-t border-stone-200 bg-stone-50/40 p-3 space-y-1.5">
                              {pnlBreakdown.accrual.otherExpBreakdown.length === 0 ? (
                                <div className="text-[10px] text-zinc-400 italic px-1 py-1">
                                  No other expenses recorded for this period.
                                </div>
                              ) : (
                                pnlBreakdown.accrual.otherExpBreakdown.map(item => (
                                  <div key={item.category} className="flex justify-between items-center text-xs px-1 text-zinc-700">
                                    <span className="capitalize font-medium">{item.category}</span>
                                    <div className="flex items-center gap-3">
                                      <span className="w-14 text-right font-mono text-[10px] text-zinc-500">{item.pctOfRev.toFixed(2)}%</span>
                                      <span className="w-24 text-right font-mono font-bold text-zinc-900">-₹{item.amount.toLocaleString('en-IN')}</span>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>

                        {/* 9. = FINAL ACCRUAL NET OPERATING PROFIT / NET MARGIN */}
                        {pnlBreakdown.accrual.netProfit >= 0 ? (
                          <div className="p-5 bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white rounded-3xl space-y-3.5 shadow-lg relative overflow-hidden group">
                            <div className="absolute right-0 bottom-0 translate-y-6 translate-x-4 opacity-15 pointer-events-none">
                              <TrendingUp className="w-40 h-40" />
                            </div>
                            <div className="flex justify-between items-start relative z-10">
                              <div>
                                <span className="text-emerald-100 font-black uppercase text-[11px] tracking-wider block">
                                  Accrual Net Operating Profit
                                </span>
                                <span className="text-[10px] text-emerald-100/80 font-medium">
                                  Full bottomline after all store operating costs
                                </span>
                              </div>
                              <span className="font-mono font-black text-2xl text-white tracking-tight drop-shadow-xs">
                                ₹{pnlBreakdown.accrual.netProfit.toLocaleString('en-IN')}
                              </span>
                            </div>
                            
                            <div className="flex justify-between items-center text-xs border-t border-white/20 pt-3 relative z-10">
                              <span className="text-emerald-100 font-bold uppercase text-[10px] tracking-wider">
                                Final Net Margin Ratio
                              </span>
                              <span className="font-mono font-black text-xs text-brand-brown bg-brand-yellow px-3 py-1 rounded-full shadow-xs">
                                {pnlBreakdown.accrual.netMarginPct.toFixed(2)}% of Revenue
                              </span>
                            </div>

                            <div className="text-[9px] text-emerald-100/70 leading-relaxed font-medium border-t border-white/15 pt-2 relative z-10">
                              Note: Accrual P&amp;L excludes capital expenditures funded from the investment pool to accurately measure your store's standalone operational unit economics.
                            </div>
                          </div>
                        ) : (
                          <div className="p-5 bg-gradient-to-br from-rose-600 via-red-700 to-rose-800 text-white rounded-3xl space-y-3.5 shadow-lg relative overflow-hidden group">
                            <div className="absolute right-0 bottom-0 translate-y-6 translate-x-4 opacity-15 pointer-events-none">
                              <TrendingDown className="w-40 h-40" />
                            </div>
                            <div className="flex justify-between items-start relative z-10">
                              <div>
                                <span className="text-rose-100 font-black uppercase text-[11px] tracking-wider block">
                                  Accrual Net Operating Loss
                                </span>
                                <span className="text-[10px] text-rose-100/80 font-medium">
                                  Full bottomline after all store operating costs
                                </span>
                              </div>
                              <span className="font-mono font-black text-2xl text-white tracking-tight drop-shadow-xs">
                                -₹{Math.abs(pnlBreakdown.accrual.netProfit).toLocaleString('en-IN')}
                              </span>
                            </div>
                            
                            <div className="flex justify-between items-center text-xs border-t border-white/20 pt-3 relative z-10">
                              <span className="text-rose-100 font-bold uppercase text-[10px] tracking-wider">
                                Final Net Margin Ratio
                              </span>
                              <span className="font-mono font-black text-xs text-rose-900 bg-white px-3 py-1 rounded-full shadow-xs">
                                {pnlBreakdown.accrual.netMarginPct.toFixed(2)}% of Revenue
                              </span>
                            </div>

                            <div className="text-[9px] text-rose-100/70 leading-relaxed font-medium border-t border-white/15 pt-2 relative z-10">
                              Note: Accrual P&amp;L excludes capital expenditures funded from the investment pool to accurately measure your store's standalone operational unit economics.
                            </div>
                          </div>
                        )}

                      </div>
                    </div>

                    {/* CASH FLOW STATEMENT SECTION */}
                    <div className="bg-white border border-brand-brown/10 rounded-3xl p-6 shadow-sm space-y-6 text-left">
                      <div className="flex justify-between items-start border-b border-zinc-100 pb-4">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-brand-brown flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
                            Cash Flow Accounting
                          </h4>
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase mt-0.5 font-sans">
                            Tracks physical liquid movements when money enters or leaves the registry
                          </p>
                        </div>
                        <span className="py-1 px-2.5 bg-teal-50 text-teal-800 border border-teal-200 text-[8px] font-black uppercase tracking-wider rounded-lg shadow-2xs">
                          Cash Basis
                        </span>
                      </div>

                      <div className="space-y-4">
                        {/* Cash Inflows */}
                        <div className="border border-emerald-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                          <button
                            type="button"
                            onClick={() => togglePnlSection('cfInflows')}
                            className="w-full flex items-center justify-between p-3.5 bg-emerald-50/60 hover:bg-emerald-50 transition-colors text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              {expandedPnlSections.cfInflows ? (
                                <ChevronDown className="w-4 h-4 text-emerald-700 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-emerald-700 shrink-0" />
                              )}
                              <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                                <ArrowDownLeft className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <h5 className="text-[11px] font-black uppercase tracking-wider text-emerald-950">
                                  Cash Inflows (Collections)
                                </h5>
                                <span className="text-[9px] text-emerald-700/80 font-medium">
                                  Total liquid receipts &amp; deposits received
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono font-black text-emerald-800 bg-emerald-100/90 border border-emerald-300/80 px-2 py-0.5 rounded-md text-right">
                                Inflow
                              </span>
                              <span className="font-mono font-black text-emerald-950 w-24 text-right text-sm">
                                ₹{pnlBreakdown.cashFlow.totalInflows.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </button>

                          {expandedPnlSections.cfInflows && (
                            <div className="border-t border-emerald-200/60 bg-emerald-50/30 p-3.5 space-y-2">
                              <div className="flex justify-between text-xs items-center">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                  <span className="text-zinc-700 font-medium">In-Store Live Sales Received</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-emerald-700 w-14 text-right">
                                    {pnlBreakdown.cashFlow.inStoreInflowPct.toFixed(1)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    ₹{pnlBreakdown.cashFlow.inStoreInflow.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs items-center">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                  <span className="text-zinc-700 font-medium">Zomato Payout Deposits (Cleared Wednesdays)</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-emerald-700 w-14 text-right">
                                    {pnlBreakdown.cashFlow.zomatoInflowPct.toFixed(1)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    ₹{pnlBreakdown.cashFlow.zomatoInflow.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs items-center">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                  <span className="text-zinc-700 font-medium">Investment &amp; Debt Funding Infusions</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-emerald-700 w-14 text-right">
                                    {pnlBreakdown.cashFlow.investmentInflowPct.toFixed(1)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    ₹{pnlBreakdown.cashFlow.investmentInflow.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Cash Outflows */}
                        <div className="border border-rose-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                          <button
                            type="button"
                            onClick={() => togglePnlSection('cfOutflows')}
                            className="w-full flex items-center justify-between p-3.5 bg-rose-50/60 hover:bg-rose-50 transition-colors text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              {expandedPnlSections.cfOutflows ? (
                                <ChevronDown className="w-4 h-4 text-rose-700 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-rose-700 shrink-0" />
                              )}
                              <div className="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-2xs shrink-0">
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <h5 className="text-[11px] font-black uppercase tracking-wider text-rose-950">
                                  Cash Outflows (Disbursements)
                                </h5>
                                <span className="text-[9px] text-rose-700/80 font-medium">
                                  Total liquid expenses paid out of registry &amp; bank
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono font-black text-rose-800 bg-rose-100/90 border border-rose-300/80 px-2 py-0.5 rounded-md text-right">
                                Outflow
                              </span>
                              <span className="font-mono font-black text-rose-950 w-24 text-right text-sm">
                                ₹{pnlBreakdown.cashFlow.totalOutflows.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </button>

                          {expandedPnlSections.cfOutflows && (
                            <div className="border-t border-rose-200/60 bg-rose-50/30 p-3.5 space-y-2">
                              <div className="flex justify-between text-xs items-center">
                                <span className="text-zinc-700 font-medium">COGS &amp; Ingredient Vendor Settlements</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-rose-700 w-14 text-right">
                                    {pnlBreakdown.cashFlow.cogsOutflowPct.toFixed(1)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    ₹{pnlBreakdown.cashFlow.cogsOutflow.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs items-center">
                                <span className="text-zinc-700 font-medium">Zomato Commission &amp; Ads Paid</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-rose-700 w-14 text-right">
                                    {pnlBreakdown.cashFlow.zomatoOutflowPct.toFixed(1)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    ₹{pnlBreakdown.cashFlow.zomatoOutflow.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs items-center">
                                <span className="text-zinc-700 font-medium">Utilities &amp; Gas Cylinder Outflow</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-rose-700 w-14 text-right">
                                    {pnlBreakdown.cashFlow.utilitiesOutflowPct.toFixed(1)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    ₹{pnlBreakdown.cashFlow.utilitiesOutflow.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs items-center">
                                <span className="text-zinc-700 font-medium">Fixed Store Costs (Rent &amp; Staff Wages)</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-rose-700 w-14 text-right">
                                    {pnlBreakdown.cashFlow.fixedOutflowPct.toFixed(1)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    ₹{pnlBreakdown.cashFlow.fixedOutflow.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs items-center">
                                <span className="text-zinc-700 font-medium">Other Operating Disbursements</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-rose-700 w-14 text-right">
                                    {pnlBreakdown.cashFlow.otherOutflowPct.toFixed(1)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    ₹{pnlBreakdown.cashFlow.otherOutflow.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs font-medium items-center">
                                <span className="text-zinc-700">Capital Expenses &amp; Debt Repayments</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-mono font-semibold text-rose-700 w-14 text-right">
                                    {pnlBreakdown.cashFlow.investmentOutflowPct.toFixed(1)}%
                                  </span>
                                  <span className="font-mono font-bold text-zinc-900 w-24 text-right">
                                    ₹{pnlBreakdown.cashFlow.investmentOutflow.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Liquid Liquidity Balance Status */}
                        <div className="p-4.5 bg-gradient-to-br from-teal-50/70 via-emerald-50/40 to-white border-2 border-teal-200/90 rounded-2xl space-y-2.5 shadow-xs">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-teal-950 font-black uppercase text-[10px] tracking-wider">
                              Net Cash Movement
                            </span>
                            <span className={`font-mono font-black text-sm px-2 py-0.5 rounded-lg border ${
                              pnlBreakdown.cashFlow.netPosition >= 0 
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300' 
                                : 'bg-rose-100 text-rose-900 border-rose-300'
                            }`}>
                              {pnlBreakdown.cashFlow.netPosition >= 0 ? '+' : ''}₹{pnlBreakdown.cashFlow.netPosition.toLocaleString('en-IN')}
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-xs border-t border-teal-100 pt-2">
                            <span className="text-teal-800/80 font-bold uppercase text-[9px]">Opening Liquidity (In Hand + Bank)</span>
                            <span className="font-mono font-bold text-zinc-700">
                              ₹{pnlBreakdown.cashFlow.openingBal.toLocaleString('en-IN')}
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-xs font-bold border-t border-teal-200 pt-2">
                            <div className="flex items-center gap-1.5">
                              <Wallet className="w-4 h-4 text-teal-700" />
                              <span className="text-teal-950 font-black uppercase text-[10px] tracking-wider">Ending Liquid Balance</span>
                            </div>
                            <span className="font-mono font-black text-base text-teal-950 bg-teal-100/80 px-2.5 py-0.5 rounded-lg border border-teal-300">
                              ₹{pnlBreakdown.cashFlow.closingBal.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>

                      </div>
                    </div>

                  </div>

                  {/* Seed & Capital Investment Pool Tracker */}
                  {(() => {
                    // Total investment capital raised
                    const allTxs = parseAllTransactions();
                    const investmentInflowAllTime = allTxs
                      .filter(tx => tx.type === 'credit' && tx.category === 'investment')
                      .reduce((sum, tx) => sum + tx.amount, 0);

                    const spentList = pnlBreakdown.investmentSpentList;
                    const investmentOutflowAllTime = spentList.reduce((sum, tx) => sum + tx.amount, 0);
                    const remainingInvestment = investmentInflowAllTime - investmentOutflowAllTime;

                    return (
                      <div className="bg-white border border-brand-brown/10 rounded-3xl p-6 shadow-sm text-left space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-zinc-100 pb-4">
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-wider text-brand-brown flex items-center gap-2">
                              <div className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-2xs">
                                <Briefcase className="w-3.5 h-3.5" />
                              </div>
                              Capital Investment Pool Tracker
                            </h4>
                            <p className="text-[10px] text-zinc-400 font-semibold uppercase mt-0.5">
                              Audit trail separating seed fund usage from daily operating revenue
                            </p>
                          </div>
                          <span className="py-1 px-3 bg-purple-50 text-purple-900 border border-purple-200 text-[10px] font-black uppercase tracking-wider rounded-xl shadow-2xs">
                            Remaining Invested Cash: ₹{remainingInvestment.toLocaleString('en-IN')}
                          </span>
                        </div>

                        {/* Top KPI row of investment */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="p-4.5 bg-gradient-to-br from-indigo-50/90 via-blue-50/40 to-white border-2 border-indigo-200/90 rounded-2xl shadow-2xs">
                            <p className="text-[9px] font-black text-indigo-900 uppercase tracking-widest flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                              Total Seed Capital Raised
                            </p>
                            <h5 className="font-mono font-black text-indigo-950 text-xl mt-1.5">₹{investmentInflowAllTime.toLocaleString('en-IN')}</h5>
                          </div>
                          <div className="p-4.5 bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-white border-2 border-amber-200/90 rounded-2xl shadow-2xs">
                            <p className="text-[9px] font-black text-amber-900 uppercase tracking-widest flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              Total Capital Spent
                            </p>
                            <h5 className="font-mono font-black text-amber-950 text-xl mt-1.5">₹{investmentOutflowAllTime.toLocaleString('en-IN')}</h5>
                          </div>
                          <div className="p-4.5 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white border-2 border-emerald-200/90 rounded-2xl shadow-2xs">
                            <p className="text-[9px] font-black text-emerald-900 uppercase tracking-widest flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              Immediate Available Reserves
                            </p>
                            <h5 className="font-mono font-black text-emerald-950 text-xl mt-1.5">₹{remainingInvestment.toLocaleString('en-IN')}</h5>
                          </div>
                        </div>

                        {/* Spent Table */}
                        <div className="space-y-3">
                          <h5 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Seed Spend Ledger Drill-Down ({spentList.length} items found)</h5>
                          {spentList.length === 0 ? (
                            <div className="py-8 text-center text-xs text-zinc-400 font-semibold bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                              No capital investment expenses recorded. Mark a debit transaction with Funding/Capital Source: "Capital Investment Fund" to list here.
                            </div>
                          ) : (
                            <div className="overflow-x-auto rounded-2xl border border-brand-brown/10 shadow-2xs">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-brand-stone/40 border-b border-brand-brown/10 text-[9px] font-black uppercase tracking-wider text-brand-brown">
                                    <th className="py-3 px-4 animate-none select-none">Date</th>
                                    <th className="py-3 px-4 animate-none select-none">Category</th>
                                    <th className="py-3 px-4 animate-none select-none">Details notes</th>
                                    <th className="py-3 px-4 text-right animate-none select-none">Amount Out (₹)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 text-xs text-zinc-700">
                                  {spentList.map((tx, idx) => (
                                    <tr key={`${tx.dateStr}-${idx}`} className="hover:bg-purple-50/30 transition-colors">
                                      <td className="py-3 px-4 font-mono font-bold text-zinc-500">{tx.dateStr}</td>
                                      <td className="py-3 px-4 uppercase font-black text-[10px] text-purple-900 tracking-wider font-sans">
                                        <span className="px-2 py-0.5 bg-purple-100 rounded-md border border-purple-200">
                                          {tx.category}
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 font-semibold text-zinc-700">{tx.notes || tx.category}</td>
                                      <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900">₹{tx.amount.toLocaleString('en-IN')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                </div>
              )}

              {/* Analytics Dashboard Section */}
              {activeLedgerView === 'dashboard' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  {/* Dashboard filters and settings row */}
                  <div className="bg-white border border-brand-brown/10 p-6 rounded-3xl shadow-sm flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                    <div className="space-y-1 text-left">
                      <h3 className="text-sm font-black uppercase tracking-wider text-brand-brown flex items-center gap-2">
                        <Filter className="w-4 h-4 text-emerald-600" />
                        Analysis Granularity Toggle
                      </h3>
                      <p className="text-[10px] text-zinc-400 font-semibold uppercase">
                        {dashboardPeriod === 'today' && `Showing single-day logs for today: ${getDashboardDateRange().start}`}
                        {dashboardPeriod === 'yesterday' && `Showing yesterday's log records: ${getDashboardDateRange().start}`}
                        {dashboardPeriod === 'this_week' && `Showing current weekly logs: ${getDashboardDateRange().start} to ${getDashboardDateRange().end}`}
                        {dashboardPeriod === 'last_week' && `Showing previous weekly logs: ${getDashboardDateRange().start} to ${getDashboardDateRange().end}`}
                        {dashboardPeriod === 'this_month' && `Showing current month aggregate logs for ${activeTabName}`}
                        {dashboardPeriod === 'last_month' && `Showing previous month aggregate logs: ${getDashboardDateRange().start} to ${getDashboardDateRange().end}`}
                        {dashboardPeriod === 'custom' && `Showing customized date range results`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Period type buttons */}
                      <div className="flex flex-wrap gap-1 bg-brand-stone/40 p-1 rounded-2xl border border-brand-brown/5 text-xs font-bold leading-none">
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('today')}
                          className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'today' ? 'bg-white text-emerald-600 shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('yesterday')}
                          className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'yesterday' ? 'bg-white text-emerald-600 shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          Yesterday
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('this_week')}
                          className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'this_week' ? 'bg-white text-emerald-600 shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          This Week
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('last_week')}
                          className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'last_week' ? 'bg-white text-emerald-600 shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          Last Week
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('this_month')}
                          className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'this_month' ? 'bg-white text-emerald-600 shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          This Month
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('last_month')}
                          className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'last_month' ? 'bg-white text-emerald-600 shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          Last Month
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('custom')}
                          className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'custom' ? 'bg-white text-emerald-600 shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          Custom
                        </button>
                      </div>

                      {/* Custom range date fields */}
                      {dashboardPeriod === 'custom' && (
                        <div className="flex items-center gap-2 animate-in slide-in-from-right-3 duration-200">
                          <input
                            type="date"
                            value={customStartDate}
                            onChange={e => setCustomStartDate(e.target.value)}
                            className="bg-brand-stone/30 border border-brand-brown/10 rounded-xl p-2 text-xs font-bold font-mono outline-none"
                          />
                          <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                          <input
                            type="date"
                            value={customEndDate}
                            onChange={e => setCustomEndDate(e.target.value)}
                            className="bg-brand-stone/30 border border-brand-brown/10 rounded-xl p-2 text-xs font-bold font-mono outline-none"
                          />
                        </div>
                      )}

                      <button 
                        onClick={exportToCSV}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm select-none cursor-pointer"
                        title="Export filtered dashboard entries to CSV"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export CSV
                      </button>
                    </div>
                  </div>

                  {/* Top Stats Cards Summary Grid */}
                  {(() => {
                    const allTxs = parseAllTransactions();
                    const filtered = getFilteredTransactions(allTxs);
                    const { totalRev, totalExp, revList, expList } = getCategoryBreakdowns(filtered);
                    const netProfit = totalRev - totalExp;

                    if (filtered.length === 0) {
                      return (
                        <div className="bg-white border border-brand-brown/10 rounded-3xl p-16 text-center space-y-4 max-w-xl mx-auto">
                          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-400 mx-auto">
                            <PieChartIcon className="w-8 h-8" />
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-black uppercase text-sm">No Filtered Transactions</h4>
                            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
                              There are currently no recorded transactions in this sheet tab within the chosen date filters. Add transactions under the "Ledger Entries" view to draw active graphs.
                            </p>
                          </div>
                        </div>
                      );
                    }

                    const trends = getDashboardTrendData(filtered);

                    return (
                      <div className="space-y-8 animate-in fade-in duration-300">
                        {/* KPI Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {/* Credit revenue card */}
                          <div className="p-6 bg-emerald-500 rounded-3xl text-white shadow-md flex items-center gap-4 relative overflow-hidden group">
                            <div className="absolute right-0 bottom-0 translate-y-6 translate-x-4 opacity-10">
                              <TrendingUp className="w-32 h-32" />
                            </div>
                            <div className="p-3.5 bg-white/10 rounded-2xl">
                              <TrendingUp className="w-6 h-6" />
                            </div>
                            <div className="text-left">
                              <p className="text-[10px] font-black uppercase tracking-wider text-white/70">Total Revenue Credits (In)</p>
                              <h4 className="text-2xl font-black tracking-tight mt-1">₹{totalRev.toLocaleString('en-IN')}</h4>
                              <p className="text-[8px] text-white/65 mt-0.5 uppercase tracking-widest font-black">
                                {revList.length} categories populated
                              </p>
                            </div>
                          </div>

                          {/* Debit expenses card */}
                          <div className="p-6 bg-rose-500 rounded-3xl text-white shadow-md flex items-center gap-4 relative overflow-hidden group">
                            <div className="absolute right-0 bottom-0 translate-y-6 translate-x-4 opacity-10">
                              <TrendingDown className="w-32 h-32" />
                            </div>
                            <div className="p-3.5 bg-white/10 rounded-2xl">
                              <TrendingDown className="w-6 h-6" />
                            </div>
                            <div className="text-left">
                              <p className="text-[10px] font-black uppercase tracking-wider text-white/70">Total Registered Expenses (Out)</p>
                              <h4 className="text-2xl font-black tracking-tight mt-1">₹{totalExp.toLocaleString('en-IN')}</h4>
                              <p className="text-[8px] text-white/65 mt-0.5 uppercase tracking-widest font-black">
                                {expList.length} categories populated
                              </p>
                            </div>
                          </div>

                          {/* Profit Loss balance status */}
                          <div className="p-6 bg-white border border-brand-brown/10 rounded-3xl shadow-sm flex items-center gap-4 relative overflow-hidden group">
                            <div className="absolute right-0 bottom-0 translate-y-6 translate-x-4 opacity-5">
                              <BarChart2 className="w-32 h-32 text-zinc-800" />
                            </div>
                            <div className={`p-3.5 rounded-2xl ${netProfit >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-brand-red'}`}>
                              <BarChart2 className="w-6 h-6" />
                            </div>
                            <div className="text-left">
                              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Profit / Loss Net Margin Position</p>
                              <h4 className={`text-2xl font-black tracking-tight mt-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-brand-red'}`}>
                                {netProfit >= 0 ? '+' : ''}₹{netProfit.toLocaleString('en-IN')}
                              </h4>
                              <p className={`text-[8px] font-black uppercase tracking-wide mt-0.5 ${netProfit >= 0 ? 'text-emerald-600/70' : 'text-brand-red/70'}`}>
                                {netProfit >= 0 ? '● Positive Margin Surplus' : '● Operating Deficit Margin'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Chart visualizations row */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                          {/* Profit Loss line curve chart */}
                          <div className="lg:col-span-2 bg-white border border-brand-brown/10 p-6 rounded-3xl shadow-sm flex flex-col h-[480px]">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-6 text-left">
                              <div>
                                <h4 className="text-xs font-black uppercase tracking-widest text-brand-brown">Net Profit/Loss & Cash Flow Trend</h4>
                                <p className="text-[9px] text-zinc-400 font-bold mt-0.5 uppercase">Daily transaction credit-to-debit trendline comparison</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-[8px] font-black uppercase">
                                <span className="flex items-center gap-1 text-emerald-500">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Credits (In)
                                </span>
                                <span className="flex items-center gap-1 text-rose-500">
                                  <span className="w-2 h-2 rounded-full bg-rose-400"></span> Debits (Out)
                                </span>
                                <span className="flex items-center gap-1 text-blue-500">
                                  <span className="w-2 h-2 rounded-full bg-blue-400"></span> Net Position
                                </span>
                              </div>
                            </div>

                            <div className="flex-1 w-full text-[10px] font-bold font-mono">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trends} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                                  <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.01}/>
                                    </linearGradient>
                                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
                                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.01}/>
                                    </linearGradient>
                                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0efe9" />
                                  <XAxis dataKey="label" stroke="#a1a1aa" fontSize={9} tickLine={false} />
                                  <YAxis stroke="#a1a1aa" fontSize={9} tickLine={false} />
                                  <Tooltip 
                                    contentStyle={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e4e4e7', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: any) => [`₹${value.toLocaleString('en-IN')}`, 'Amount']}
                                  />
                                  <Area type="monotone" name="Credits" dataKey="revenue" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
                                  <Area type="monotone" name="Debits" dataKey="expense" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorExp)" />
                                  <Area type="monotone" name="Net Position" dataKey="profit" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* Distribution breakdown chart widget */}
                          <div className="bg-white border border-brand-brown/10 p-6 rounded-3xl shadow-sm flex flex-col h-[480px]">
                            {(() => {
                              const activeList = pieFocusType === 'expense' ? expList : revList;
                              const colorsList = pieFocusType === 'expense' ? EXPENSE_COLORS : REVENUE_COLORS;

                              return (
                                <>
                                  <div className="flex justify-between items-center mb-3 text-left">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-brand-brown">Category Distribution</h4>
                                        <span className="px-2 py-0.5 bg-brand-stone/60 rounded-full text-[9px] font-black text-brand-brown/80 font-mono">
                                          {activeList.length} Categories
                                        </span>
                                      </div>
                                      <p className="text-[9px] text-zinc-400 font-bold uppercase mt-0.5">Percentage weight analysis</p>
                                    </div>
                                  </div>

                                  {/* Focus type selector toggle inside Pie widget */}
                                  <div className="grid grid-cols-2 bg-brand-stone/40 p-1 rounded-xl border border-brand-brown/5 text-xs font-bold mb-3">
                                    <button
                                      type="button"
                                      onClick={() => setPieFocusType('expense')}
                                      className={`py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                        pieFocusType === 'expense' ? 'bg-white text-rose-500 shadow-sm' : 'text-zinc-400 hover:text-brand-brown'
                                      }`}
                                    >
                                      Expense ({expList.length})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPieFocusType('revenue')}
                                      className={`py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                        pieFocusType === 'revenue' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-400 hover:text-brand-brown'
                                      }`}
                                    >
                                      Revenue ({revList.length})
                                    </button>
                                  </div>

                                  {/* The Pie Chart element */}
                                  {activeList.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-zinc-400 gap-2">
                                      <PieChartIcon className="w-10 h-10 text-zinc-200" />
                                      <p className="text-[10px] font-bold uppercase tracking-wider">No {pieFocusType} recorded</p>
                                    </div>
                                  ) : (
                                    <div className="flex-1 flex flex-col justify-between overflow-hidden gap-3">
                                      {/* Draw Pie Chart */}
                                      <div className="h-[145px] w-full text-xs font-bold flex-shrink-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                          <PieChart>
                                            <Pie
                                              data={activeList}
                                              cx="50%"
                                              cy="50%"
                                              innerRadius={42}
                                              outerRadius={62}
                                              paddingAngle={activeList.length > 12 ? 1 : 2}
                                              dataKey="value"
                                            >
                                              {activeList.map((_entry, index) => (
                                                <Cell key={`cell-${index}`} fill={colorsList[index % colorsList.length]} />
                                              ))}
                                            </Pie>
                                            <Tooltip 
                                              formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Amount']} 
                                              contentStyle={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e4e4e7', fontSize: '11px', fontWeight: 'bold' }}
                                            />
                                          </PieChart>
                                        </ResponsiveContainer>
                                      </div>

                                      {/* Distribution list showing ALL categories explicitly */}
                                      <div className="flex-1 overflow-y-auto pr-1.5 space-y-2 thin-scrollbar scroll-smooth">
                                        {activeList.map((entry, index) => {
                                          const color = colorsList[index % colorsList.length];
                                          return (
                                            <div 
                                              key={entry.name} 
                                              onClick={() => {
                                                setSelectedCategoryDetails({
                                                  categoryName: entry.name,
                                                  type: pieFocusType === 'expense' ? 'debit' : 'credit'
                                                });
                                                setCatModalSearch('');
                                                setCatModalMethodFilter('all');
                                                setCatModalBillFilter('all');
                                                setCatModalScope('period');
                                              }}
                                              className="space-y-1 hover:bg-stone-100/90 p-1.5 rounded-xl transition-all cursor-pointer group select-none"
                                              title={`Click to view all ledger entries for ${entry.name}`}
                                            >
                                              <div className="flex justify-between items-center text-[9px] font-bold uppercase gap-2">
                                                <span className="flex items-center gap-1.5 min-w-0 flex-1" title={entry.name}>
                                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></span>
                                                  <span className="truncate text-zinc-700 font-extrabold group-hover:text-brand-brown">{entry.name}</span>
                                                  <ArrowRight className="w-2.5 h-2.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                                </span>
                                                <span className="font-mono text-zinc-600 flex-shrink-0">
                                                  ₹{entry.value.toLocaleString('en-IN')} <span className="text-zinc-400 font-semibold font-sans">({entry.percentage.toFixed(1)}%)</span>
                                                </span>
                                              </div>
                                              <div className="w-full bg-zinc-100 h-1 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full duration-500 ease-out" style={{ width: `${entry.percentage}%`, backgroundColor: color }}></div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Category Wise Revenue & Expense Tables */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          {/* Category-Wise Revenue Table */}
                          {(() => {
                            const sortedRevList = [...revList].sort((a, b) => {
                              let factor = revSortOrder === 'asc' ? 1 : -1;
                              if (revSortField === 'amount') return (a.value - b.value) * factor;
                              if (revSortField === 'name') return a.name.localeCompare(b.name) * factor;
                              if (revSortField === 'percentage') return (a.percentage - b.percentage) * factor;
                              if (revSortField === 'transactions') return (a.count - b.count) * factor;
                              return (a.value - b.value) * factor;
                            });

                            const toggleRevSort = (field: 'amount' | 'name' | 'percentage' | 'transactions') => {
                              if (revSortField === field) {
                                setRevSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                              } else {
                                setRevSortField(field);
                                setRevSortOrder(field === 'name' ? 'asc' : 'desc');
                              }
                            };

                            const renderSortIcon = (field: 'amount' | 'name' | 'percentage' | 'transactions') => {
                              if (revSortField !== field) {
                                return <ArrowUpDown className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity ml-1 inline" />;
                              }
                              return revSortOrder === 'asc' 
                                ? <ArrowUp className="w-3 h-3 text-emerald-600 ml-1 inline font-black" />
                                : <ArrowDown className="w-3 h-3 text-emerald-600 ml-1 inline font-black" />;
                            };

                            return (
                              <div className="bg-white border border-brand-brown/10 p-6 rounded-3xl shadow-sm flex flex-col">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-xs font-black uppercase tracking-widest text-brand-brown">Category-Wise Revenue</h4>
                                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-full text-[9px] font-black font-mono">
                                        {revList.length} Categories
                                      </span>
                                    </div>
                                    <p className="text-[9px] text-zinc-400 font-bold uppercase mt-0.5">
                                      Click any category row to view entries & bills • Total: ₹{totalRev.toLocaleString('en-IN')}
                                    </p>
                                  </div>

                                  {/* Quick Sort by Amount Button */}
                                  <button
                                    type="button"
                                    onClick={() => toggleRevSort('amount')}
                                    className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer border border-emerald-200/50 self-end sm:self-auto"
                                    title="Toggle sort by amount"
                                  >
                                    <span>Sort Amount</span>
                                    {revSortField === 'amount' ? (
                                      revSortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
                                    ) : (
                                      <ArrowUpDown className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>

                                {sortedRevList.length === 0 ? (
                                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400 gap-2 border border-dashed border-zinc-200 rounded-2xl">
                                    <p className="text-xs font-bold uppercase tracking-wider">No revenue categories found in this period</p>
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto rounded-2xl border border-zinc-200/80">
                                    <table className="w-full text-left text-xs">
                                      <thead>
                                        <tr className="bg-stone-50 border-b border-zinc-200 text-[10px] uppercase font-black text-zinc-500 tracking-wider select-none">
                                          <th 
                                            className="py-3 px-3.5 cursor-pointer hover:text-emerald-700 transition-colors group"
                                            onClick={() => toggleRevSort('name')}
                                          >
                                            <span className="flex items-center">
                                              Category {renderSortIcon('name')}
                                            </span>
                                          </th>
                                          <th 
                                            className="py-3 px-3 text-center cursor-pointer hover:text-emerald-700 transition-colors group"
                                            onClick={() => toggleRevSort('transactions')}
                                          >
                                            <span className="inline-flex items-center justify-center">
                                              Txns {renderSortIcon('transactions')}
                                            </span>
                                          </th>
                                          <th 
                                            className="py-3 px-3.5 text-right cursor-pointer hover:text-emerald-700 transition-colors group"
                                            onClick={() => toggleRevSort('amount')}
                                          >
                                            <span className="inline-flex items-center justify-end">
                                              Amount (₹) {renderSortIcon('amount')}
                                            </span>
                                          </th>
                                          <th 
                                            className="py-3 px-3.5 text-right cursor-pointer hover:text-emerald-700 transition-colors group"
                                            onClick={() => toggleRevSort('percentage')}
                                          >
                                            <span className="inline-flex items-center justify-end">
                                              Share % {renderSortIcon('percentage')}
                                            </span>
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-100 font-medium">
                                        {sortedRevList.map((row, idx) => {
                                          const origIndex = revList.findIndex(item => item.name === row.name);
                                          const color = REVENUE_COLORS[(origIndex >= 0 ? origIndex : idx) % REVENUE_COLORS.length];
                                          return (
                                            <tr 
                                              key={row.name} 
                                              onClick={() => {
                                                setSelectedCategoryDetails({
                                                  categoryName: row.name,
                                                  type: 'credit'
                                                });
                                                setCatModalSearch('');
                                                setCatModalMethodFilter('all');
                                                setCatModalBillFilter('all');
                                                setCatModalScope('period');
                                              }}
                                              className="hover:bg-emerald-50/70 transition-colors cursor-pointer group select-none"
                                              title={`Click to view all ledger entries for ${row.name}`}
                                            >
                                              <td className="py-2.5 px-3.5">
                                                <div className="flex items-center justify-between gap-2">
                                                  <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></span>
                                                    <span className="font-extrabold text-brand-brown uppercase text-[11px] truncate max-w-[150px]" title={row.name}>
                                                      {row.name}
                                                    </span>
                                                  </div>
                                                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 group-hover:bg-emerald-200 transition-all flex items-center gap-0.5 flex-shrink-0">
                                                    Entries <ArrowRight className="w-2.5 h-2.5" />
                                                  </span>
                                                </div>
                                              </td>
                                              <td className="py-2.5 px-3 text-center">
                                                <span className="font-mono text-[11px] text-zinc-500 bg-stone-100 px-2 py-0.5 rounded-full font-bold">
                                                  {row.count}
                                                </span>
                                              </td>
                                              <td className="py-2.5 px-3.5 text-right font-mono font-black text-emerald-700 text-xs">
                                                ₹{row.value.toLocaleString('en-IN')}
                                              </td>
                                              <td className="py-2.5 px-3.5 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                  <div className="w-14 bg-zinc-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                                                    <div 
                                                      className="h-full rounded-full duration-500" 
                                                      style={{ width: `${Math.min(row.percentage, 100)}%`, backgroundColor: color }}
                                                    ></div>
                                                  </div>
                                                  <span className="font-mono text-xs text-zinc-600 font-bold min-w-[42px]">
                                                    {row.percentage.toFixed(1)}%
                                                  </span>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                      <tfoot>
                                        <tr className="bg-stone-50 border-t border-zinc-200 font-black text-xs">
                                          <td className="py-3 px-3.5 text-brand-brown uppercase tracking-wider text-[11px]">
                                            Total Revenue
                                          </td>
                                          <td className="py-3 px-3 text-center font-mono text-[11px] text-zinc-600">
                                            {revList.reduce((acc, c) => acc + c.count, 0)}
                                          </td>
                                          <td className="py-3 px-3.5 text-right font-mono text-emerald-700 text-xs">
                                            ₹{totalRev.toLocaleString('en-IN')}
                                          </td>
                                          <td className="py-3 px-3.5 text-right font-mono text-zinc-600 text-xs">
                                            100.0%
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Category-Wise Expense Table */}
                          {(() => {
                            const sortedExpList = [...expList].sort((a, b) => {
                              let factor = expSortOrder === 'asc' ? 1 : -1;
                              if (expSortField === 'amount') return (a.value - b.value) * factor;
                              if (expSortField === 'name') return a.name.localeCompare(b.name) * factor;
                              if (expSortField === 'percentage') return (a.percentage - b.percentage) * factor;
                              if (expSortField === 'transactions') return (a.count - b.count) * factor;
                              return (a.value - b.value) * factor;
                            });

                            const toggleExpSort = (field: 'amount' | 'name' | 'percentage' | 'transactions') => {
                              if (expSortField === field) {
                                setExpSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                              } else {
                                setExpSortField(field);
                                setExpSortOrder(field === 'name' ? 'asc' : 'desc');
                              }
                            };

                            const renderSortIcon = (field: 'amount' | 'name' | 'percentage' | 'transactions') => {
                              if (expSortField !== field) {
                                return <ArrowUpDown className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity ml-1 inline" />;
                              }
                              return expSortOrder === 'asc' 
                                ? <ArrowUp className="w-3 h-3 text-rose-600 ml-1 inline font-black" />
                                : <ArrowDown className="w-3 h-3 text-rose-600 ml-1 inline font-black" />;
                            };

                            return (
                              <div className="bg-white border border-brand-brown/10 p-6 rounded-3xl shadow-sm flex flex-col">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-xs font-black uppercase tracking-widest text-brand-brown">Category-Wise Expense</h4>
                                      <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200/60 rounded-full text-[9px] font-black font-mono">
                                        {expList.length} Categories
                                      </span>
                                    </div>
                                    <p className="text-[9px] text-zinc-400 font-bold uppercase mt-0.5">
                                      Click any category row to view entries & bills • Total: ₹{totalExp.toLocaleString('en-IN')}
                                    </p>
                                  </div>

                                  {/* Quick Sort by Amount Button */}
                                  <button
                                    type="button"
                                    onClick={() => toggleExpSort('amount')}
                                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer border border-rose-200/50 self-end sm:self-auto"
                                    title="Toggle sort by amount"
                                  >
                                    <span>Sort Amount</span>
                                    {expSortField === 'amount' ? (
                                      expSortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
                                    ) : (
                                      <ArrowUpDown className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>

                                {sortedExpList.length === 0 ? (
                                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400 gap-2 border border-dashed border-zinc-200 rounded-2xl">
                                    <p className="text-xs font-bold uppercase tracking-wider">No expense categories found in this period</p>
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto rounded-2xl border border-zinc-200/80">
                                    <table className="w-full text-left text-xs">
                                      <thead>
                                        <tr className="bg-stone-50 border-b border-zinc-200 text-[10px] uppercase font-black text-zinc-500 tracking-wider select-none">
                                          <th 
                                            className="py-3 px-3.5 cursor-pointer hover:text-rose-700 transition-colors group"
                                            onClick={() => toggleExpSort('name')}
                                          >
                                            <span className="flex items-center">
                                              Category {renderSortIcon('name')}
                                            </span>
                                          </th>
                                          <th 
                                            className="py-3 px-3 text-center cursor-pointer hover:text-rose-700 transition-colors group"
                                            onClick={() => toggleExpSort('transactions')}
                                          >
                                            <span className="inline-flex items-center justify-center">
                                              Txns {renderSortIcon('transactions')}
                                            </span>
                                          </th>
                                          <th 
                                            className="py-3 px-3.5 text-right cursor-pointer hover:text-rose-700 transition-colors group"
                                            onClick={() => toggleExpSort('amount')}
                                          >
                                            <span className="inline-flex items-center justify-end">
                                              Amount (₹) {renderSortIcon('amount')}
                                            </span>
                                          </th>
                                          <th 
                                            className="py-3 px-3.5 text-right cursor-pointer hover:text-rose-700 transition-colors group"
                                            onClick={() => toggleExpSort('percentage')}
                                          >
                                            <span className="inline-flex items-center justify-end">
                                              Share % {renderSortIcon('percentage')}
                                            </span>
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-100 font-medium">
                                        {sortedExpList.map((row, idx) => {
                                          const origIndex = expList.findIndex(item => item.name === row.name);
                                          const color = EXPENSE_COLORS[(origIndex >= 0 ? origIndex : idx) % EXPENSE_COLORS.length];
                                          return (
                                            <tr 
                                              key={row.name} 
                                              onClick={() => {
                                                setSelectedCategoryDetails({
                                                  categoryName: row.name,
                                                  type: 'debit'
                                                });
                                                setCatModalSearch('');
                                                setCatModalMethodFilter('all');
                                                setCatModalBillFilter('all');
                                                setCatModalScope('period');
                                              }}
                                              className="hover:bg-rose-50/70 transition-colors cursor-pointer group select-none"
                                              title={`Click to view all ledger entries for ${row.name}`}
                                            >
                                              <td className="py-2.5 px-3.5">
                                                <div className="flex items-center justify-between gap-2">
                                                  <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></span>
                                                    <span className="font-extrabold text-brand-brown uppercase text-[11px] truncate max-w-[150px]" title={row.name}>
                                                      {row.name}
                                                    </span>
                                                  </div>
                                                  <span className="text-[9px] font-bold text-rose-700 bg-rose-100/60 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 group-hover:bg-rose-200 transition-all flex items-center gap-0.5 flex-shrink-0">
                                                    Entries <ArrowRight className="w-2.5 h-2.5" />
                                                  </span>
                                                </div>
                                              </td>
                                              <td className="py-2.5 px-3 text-center">
                                                <span className="font-mono text-[11px] text-zinc-500 bg-stone-100 px-2 py-0.5 rounded-full font-bold">
                                                  {row.count}
                                                </span>
                                              </td>
                                              <td className="py-2.5 px-3.5 text-right font-mono font-black text-rose-600 text-xs">
                                                ₹{row.value.toLocaleString('en-IN')}
                                              </td>
                                              <td className="py-2.5 px-3.5 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                  <div className="w-14 bg-zinc-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                                                    <div 
                                                      className="h-full rounded-full duration-500" 
                                                      style={{ width: `${Math.min(row.percentage, 100)}%`, backgroundColor: color }}
                                                    ></div>
                                                  </div>
                                                  <span className="font-mono text-xs text-zinc-600 font-bold min-w-[42px]">
                                                    {row.percentage.toFixed(1)}%
                                                  </span>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                      <tfoot>
                                        <tr className="bg-stone-50 border-t border-zinc-200 font-black text-xs">
                                          <td className="py-3 px-3.5 text-brand-brown uppercase tracking-wider text-[11px]">
                                            Total Expenses
                                          </td>
                                          <td className="py-3 px-3 text-center font-mono text-[11px] text-zinc-600">
                                            {expList.reduce((acc, c) => acc + c.count, 0)}
                                          </td>
                                          <td className="py-3 px-3.5 text-right font-mono text-rose-600 text-xs">
                                            ₹{totalExp.toLocaleString('en-IN')}
                                          </td>
                                          <td className="py-3 px-3.5 text-right font-mono text-zinc-600 text-xs">
                                            100.0%
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Collapsible Deleted Transactions and Void logs archive */}
              <div className="mt-8">
                <div className="bg-stone-50 border border-brand-brown/10 rounded-3xl p-6 space-y-4">
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowDeletedLog(!showDeletedLog);
                      loadDeletedRecords();
                    }}
                    className="w-full flex justify-between items-center text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-brand-red/10 rounded-xl text-brand-red">
                        <History className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="font-black text-xs uppercase tracking-tight text-brand-brown">Deleted Entries & Archive logs</h4>
                        <p className="text-[10px] text-zinc-400 font-semibold leading-tight mt-0.5">
                          Archived void transactions with proper deletion reasons ({deletedRecords.length} items logged)
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] uppercase font-black tracking-wider bg-zinc-200 hover:bg-zinc-300 px-3 py-1.5 rounded-lg transition-all text-zinc-600">
                      {showDeletedLog ? 'Hide Archive' : 'Show Archive'}
                    </span>
                  </button>

                  {showDeletedLog && (
                    <div className="space-y-4 pt-4 border-t border-brand-brown/10">
                      {deletedRecords.length === 0 ? (
                        <div className="p-10 bg-white rounded-2xl border border-dashed border-zinc-200 text-center text-xs text-zinc-400 italic">
                          No deleted records logged in this month tab.
                        </div>
                      ) : (
                        <div className="overflow-x-auto w-full border border-zinc-200/60 rounded-2xl bg-white">
                          <table className="w-full text-xs text-left">
                            <thead>
                              <tr className="bg-stone-50 text-[10px] uppercase font-bold text-zinc-400 border-b border-zinc-200">
                                <th className="py-3 px-4">Date Void</th>
                                <th className="py-3 px-4">Deleted At</th>
                                <th className="py-3 px-4">Original Entry Detail (Category: notes)</th>
                                <th className="py-3 px-4 text-right">Value Voided</th>
                                <th className="py-3 px-4">Proper Reason of Void</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {deletedRecords.map((r, idx) => {
                                const date = r.date;
                                const crCash = parseFloat(r.credit_cash) || 0;
                                const crBank = parseFloat(r.credit_bank) || 0;
                                const dbCash = parseFloat(r.debit_cash) || 0;
                                const dbBank = parseFloat(r.debit_bank) || 0;
                                const val = crCash || crBank || dbCash || dbBank;
                                const details = 
                                  r.credit_cash_details || 
                                  r.credit_bank_details || 
                                  r.debit_cash_details || 
                                  r.debit_bank_details || 
                                  '-';
                                const reason = r.delete_reason || 'No reason specified';
                                const deletedAt = r.deleted_at ? new Date(r.deleted_at).toLocaleString('en-IN') : '-';

                                return (
                                  <tr key={idx} className="hover:bg-zinc-50/50">
                                    <td className="py-3 px-4 font-mono font-bold text-zinc-500 whitespace-nowrap">{date}</td>
                                    <td className="py-3 px-4 text-zinc-400 text-[10px] whitespace-nowrap">{deletedAt}</td>
                                    <td className="py-3 px-4 font-semibold max-w-[200px] truncate" title={details}>{details}</td>
                                    <td className="py-3 px-4 text-right whitespace-nowrap">
                                      <span className={`font-black ${crCash > 0 || crBank > 0 ? 'text-emerald-600' : 'text-brand-red'}`}>
                                        ₹{val.toLocaleString('en-IN')}
                                      </span>
                                      <span className="text-[9px] text-zinc-400 font-bold uppercase ml-1 block text-right">
                                        {crCash > 0 ? 'Cr Cash' : crBank > 0 ? 'Cr Bank' : dbCash > 0 ? 'Db Cash' : 'Db Bank'}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 font-medium text-amber-700 bg-amber-500/5 max-w-[220px]" title={reason}>
                                      {reason}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          </div>
      </div>

      {/* Custom Confirmation Modals */}
      <ConfirmationModal
        isOpen={deletingTxIdx !== null}
        onClose={() => setDeletingTxIdx(null)}
        onConfirm={() => {
          if (!deleteReasonText.trim()) {
            alert("Please specify a proper reason for deletion.");
            return;
          }
          if (deletingTxIdx !== null) {
            triggerDeleteTransaction(deletingTxIdx);
          }
        }}
        title="Delete Ledger Entry"
      >
        <div className="space-y-4 text-brand-brown">
          <p className="text-sm">
            Are you sure you want to delete this transaction from the active ledger sheets? This action is archived for security audits.
          </p>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown/60">Reason for Deleting <span className="text-brand-red">*</span></label>
            <textarea
              rows={3}
              placeholder="e.g. Typed incorrect amount, duplicate entry, cashier balance correction..."
              value={deleteReasonText}
              onChange={e => setDeleteReasonText(e.target.value)}
              className="w-full p-2.5 bg-white border border-brand-brown/15 rounded-xl text-xs outline-none focus:border-red-500"
              required
            />
          </div>
        </div>
      </ConfirmationModal>

      {/* Transaction Edit Modal */}
      {editingRowIdx !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-65 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-brand-cream border border-brand-brown/10 rounded-3xl shadow-2xl w-full max-w-lg text-brand-brown max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-brand-brown/10 flex-shrink-0">
              <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                <Pencil className="w-5 h-5 text-emerald-600" />
                Edit Ledger Transaction
              </h3>
              <p className="text-[11px] text-brand-brown/65 font-medium mt-1">
                Updating ledger sequence fields. Reason is recorded for audit trails.
              </p>
            </div>

            <form onSubmit={handleSaveTransactionEdit} className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                {/* Date */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-brand-brown/60 tracking-wider">Transaction Date</label>
                  <input
                    type="date"
                    value={editTxDate}
                    onChange={e => setEditTxDate(e.target.value)}
                    className="w-full p-2.5 bg-white border border-brand-brown/15 rounded-xl text-xs font-mono font-bold outline-none"
                    required
                  />
                </div>

                {/* Amount */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-brand-brown/60 tracking-wider">Amount (₹)</label>
                  <input
                    type="number"
                    value={editTxAmount}
                    onChange={e => setEditTxAmount(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-white border border-brand-brown/15 rounded-xl text-xs font-bold outline-none"
                    required
                    min="0.1"
                    step="any"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Type */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-brand-brown/60 tracking-wider">Transaction Type</label>
                  <select
                    value={editTxType}
                    onChange={e => setEditTxType(e.target.value as 'credit' | 'debit')}
                    className="w-full p-2.5 bg-white border border-brand-brown/15 rounded-xl text-xs font-semibold outline-none"
                    required
                  >
                    <option value="credit">Credit (Inward Cash/Bank)</option>
                    <option value="debit">Debit (Outward Expense)</option>
                  </select>
                </div>

                {/* Method */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-brand-brown/60 tracking-wider">Payment Method</label>
                  <select
                    value={editTxMethod}
                    onChange={e => setEditTxMethod(e.target.value as 'cash' | 'bank')}
                    className="w-full p-2.5 bg-white border border-brand-brown/15 rounded-xl text-xs font-semibold outline-none"
                    required
                  >
                    <option value="cash">Cash Ledger</option>
                    <option value="bank">Bank Ledger</option>
                  </select>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-brand-brown/60 tracking-wider block">Transaction Details</label>
                <input
                  type="text"
                  value={editTxDetails}
                  onChange={e => setEditTxDetails(e.target.value)}
                  className="w-full p-2.5 bg-white border border-brand-brown/15 rounded-xl text-xs outline-none"
                  required
                />
              </div>

              {/* Funding Source Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-brand-brown/60 tracking-wider Block">Capital/Funding Source</label>
                <select
                  value={editTxFundingSource}
                  onChange={e => setEditTxFundingSource(e.target.value as 'revenue' | 'investment')}
                  className="w-full p-2.5 bg-white border border-brand-brown/15 rounded-xl text-xs font-semibold outline-none"
                >
                  <option value="revenue">Earned Revenue / Operational</option>
                  <option value="investment">Capital Investment Fund Spend</option>
                </select>
              </div>

              {/* Edit Reason */}
              <div className="space-y-1 pt-2 border-t border-brand-brown/5">
                <label className="text-[10px] font-black uppercase text-brand-brown/70 tracking-wider block">Proper Reason for Editing <span className="text-brand-red">*</span></label>
                <textarea
                  rows={3}
                  placeholder="Specify exactly why this change is necessary (e.g. Correcting typos, updating real bank record, etc.)"
                  value={editTxReason}
                  onChange={e => setEditTxReason(e.target.value)}
                  className="w-full p-2.5 bg-white border border-brand-brown/15 rounded-xl text-xs outline-none focus:border-emerald-600 font-medium"
                  required
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-brand-brown/10 bg-brand-brown/5 -mx-6 -mb-6 p-4 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setEditingRowIdx(null)}
                  className="bg-brand-brown/10 hover:bg-brand-brown/20 font-bold text-xs py-2.5 px-5 rounded-xl transition-colors text-brand-brown"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingTxEdit}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2.5 px-5 rounded-xl transition-colors shadow-md flex items-center gap-1.5"
                >
                  {isSavingTxEdit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Audit Trail Modal */}
      {activeAuditRec && (
        <div className="fixed inset-0 bg-black bg-opacity-65 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-brand-cream border border-brand-brown/10 rounded-3xl shadow-2xl w-full max-w-2xl text-brand-brown max-h-[85vh] flex flex-col">
            <div className="p-6 border-b border-brand-brown/10 flex-shrink-0 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                  <History className="w-5 h-5 text-amber-500" />
                  Transaction Audit Trail
                </h3>
                <p className="text-[11px] text-brand-brown/65 font-medium mt-1">
                  History of modifications made to this ledger entry. ID: <code className="bg-brand-stone py-0.5 px-1 rounded text-[10px] font-mono">{activeAuditRec.id}</code>
                </p>
              </div>
              <button
                onClick={() => setActiveAuditRec(null)}
                className="text-xs font-bold text-zinc-400 hover:text-brand-brown border border-brand-brown/10 rounded-lg p-1.5 px-2.5 hover:bg-zinc-50 transition-all font-sans uppercase tracking-wider"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
              {/* Record Summary */}
              <div className="bg-white rounded-2xl p-4 border border-brand-brown/5 space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-brand-brown/45">Current Live Record</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-medium">
                  <div>
                    <span className="text-zinc-400 font-semibold block uppercase text-[9px] tracking-wide">Date</span> <b className="font-bold">{activeAuditRec.date}</b>
                  </div>
                  <div>
                    <span className="text-zinc-400 font-semibold block uppercase text-[9px] tracking-wide">Type</span>{' '}
                    <span className="font-black">
                      {parseFloat(activeAuditRec.credit_cash) > 0 || parseFloat(activeAuditRec.credit_bank) > 0 ? (
                        <span className="text-emerald-600">Credit</span>
                      ) : (
                        <span className="text-brand-red">Debit</span>
                      )}{' '}
                      ({parseFloat(activeAuditRec.credit_cash) > 0 || parseFloat(activeAuditRec.debit_cash) > 0 ? 'Cash' : 'Bank'})
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 font-semibold block uppercase text-[9px] tracking-wide">Amount</span>{' '}
                    <b className="font-black text-brand-brown text-sm">
                      ₹{parseFloat(
                        activeAuditRec.credit_cash ||
                        activeAuditRec.credit_bank ||
                        activeAuditRec.debit_cash ||
                        activeAuditRec.debit_bank ||
                        '0'
                      ).toLocaleString('en-IN')}
                    </b>
                  </div>
                  <div>
                    <span className="text-zinc-400 font-semibold block uppercase text-[9px] tracking-wide">Created At</span>{' '}
                    <span className="font-mono text-[10px] block mt-0.5">
                      {new Date(activeAuditRec.created_at).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* History Timeline */}
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-brand-brown/50">Modification Logs</h4>
                
                {!activeAuditRec.edit_history || activeAuditRec.edit_history.length === 0 ? (
                  <div className="p-8 text-center bg-stone-50 rounded-2xl text-zinc-400 text-xs italic font-medium">
                    No edit history recorded for this entry.
                  </div>
                ) : (
                  <div className="space-y-4 border-l-2 border-brand-brown/10 pl-6 ml-3">
                    {activeAuditRec.edit_history.map((log: any, logIdx: number) => (
                      <div key={logIdx} className="relative space-y-2 bg-white rounded-2xl p-4 border border-brand-brown/5 shadow-sm">
                        {/* Timeline visual node */}
                        <div className="absolute -left-[31px] top-4 w-3 h-3 rounded-full bg-amber-500 border-2 border-brand-cream shadow"></div>
                        
                        <div className="flex justify-between items-start flex-wrap gap-2">
                          <span className="text-xs font-black uppercase text-amber-600 flex items-center gap-1">
                            Revision #{logIdx + 1}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {new Date(log.edited_at).toLocaleString('en-IN')}
                          </span>
                        </div>

                        {/* Proper Reason */}
                        <div className="p-2.5 bg-amber-500/5 rounded-xl border border-amber-500/10 text-xs">
                          <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block mb-0.5">Reason for Edit</span>
                          <p className="font-semibold text-brand-brown/95">{log.reason || 'No reason specified'}</p>
                        </div>

                        {/* Who changed it */}
                        <div className="text-[10px] text-brand-brown/60 font-semibold">
                          Edited by: <span className="font-bold text-brand-brown">{log.edited_by || 'Unknown'}</span>
                        </div>

                        {/* Comparison Table */}
                        {log.previous_values && log.new_values && (
                          <div className="grid grid-cols-2 gap-4 pt-2 mt-2 border-t border-zinc-100 text-[11px]">
                            {/* Before */}
                            <div className="space-y-1">
                              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Before Change</span>
                              <div className="bg-stone-50 rounded-lg p-2 font-mono text-[10px] text-zinc-500 leading-relaxed whitespace-pre-line">
                                {(() => {
                                  const parts = [];
                                  if (log.previous_values.date) parts.push(`Date: ${log.previous_values.date}`);
                                  if (log.previous_values.credit_cash > 0) parts.push(`Cr Cash: ₹${log.previous_values.credit_cash}`);
                                  if (log.previous_values.credit_bank > 0) parts.push(`Cr Bank: ₹${log.previous_values.credit_bank}`);
                                  if (log.previous_values.debit_cash > 0) parts.push(`Db Cash: ₹${log.previous_values.debit_cash}`);
                                  if (log.previous_values.debit_bank > 0) parts.push(`Db Bank: ₹${log.previous_values.debit_bank}`);
                                  const details = 
                                    log.previous_values.credit_cash_details || 
                                    log.previous_values.credit_bank_details || 
                                    log.previous_values.debit_cash_details || 
                                    log.previous_values.debit_bank_details || 
                                    '';
                                  if (details) parts.push(`Details: ${details}`);
                                  return parts.join('\n') || 'Starting values';
                                })()}
                              </div>
                            </div>
                            {/* After */}
                            <div className="space-y-1">
                              <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">After Change</span>
                              <div className="bg-emerald-500/5 rounded-lg p-2 font-mono text-[10px] text-emerald-700 leading-relaxed whitespace-pre-line">
                                {(() => {
                                  const parts = [];
                                  if (log.new_values.date) parts.push(`Date: ${log.new_values.date}`);
                                  if (log.new_values.amount) {
                                    const m = (log.new_values.method || 'cash').toUpperCase();
                                    const t = (log.new_values.type || 'credit').toUpperCase();
                                    parts.push(`${t} ${m}: ₹${log.new_values.amount}`);
                                  } else {
                                    if (log.new_values.credit_cash > 0) parts.push(`Cr Cash: ₹${log.new_values.credit_cash}`);
                                    if (log.new_values.credit_bank > 0) parts.push(`Cr Bank: ₹${log.new_values.credit_bank}`);
                                  }
                                  if (log.new_values.details) parts.push(`Details: ${log.new_values.details}`);
                                  return parts.join('\n');
                                })()}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Ledger Entries Drilldown Modal */}
      {selectedCategoryDetails && (() => {
        const isRevenue = selectedCategoryDetails.type === 'credit';
        const allTxs = parseAllTransactions();
        const filteredTxs = getFilteredTransactions(allTxs);

        const targetCat = selectedCategoryDetails.categoryName.trim().toUpperCase();
        const targetType = selectedCategoryDetails.type;

        // Base list according to selected scope
        const baseScopeTxs = catModalScope === 'period' ? filteredTxs : allTxs;
        const catAllEntries = baseScopeTxs.filter(tx => 
          tx.type === targetType && (tx.category || '').trim().toUpperCase() === targetCat
        );

        // Filter by search, method, bill
        const displayedEntries = catAllEntries.filter(tx => {
          if (catModalSearch.trim()) {
            const q = catModalSearch.toLowerCase().trim();
            const matchNotes = (tx.notes || '').toLowerCase().includes(q);
            const matchRaw = (tx.rawDetails || '').toLowerCase().includes(q);
            const matchDate = (tx.dateStr || '').includes(q);
            const matchAmt = tx.amount.toString().includes(q);
            if (!matchNotes && !matchRaw && !matchDate && !matchAmt) return false;
          }
          if (catModalMethodFilter !== 'all' && tx.method !== catModalMethodFilter) return false;
          if (catModalBillFilter === 'with_bill' && !tx.billUrl) return false;
          if (catModalBillFilter === 'no_bill' && !!tx.billUrl) return false;
          return true;
        });

        const totalCatAmount = catAllEntries.reduce((acc, t) => acc + t.amount, 0);
        const displayedAmount = displayedEntries.reduce((acc, t) => acc + t.amount, 0);
        const cashEntries = catAllEntries.filter(t => t.method === 'cash');
        const bankEntries = catAllEntries.filter(t => t.method === 'bank');
        const cashSum = cashEntries.reduce((acc, t) => acc + t.amount, 0);
        const bankSum = bankEntries.reduce((acc, t) => acc + t.amount, 0);
        const withBillCount = catAllEntries.filter(t => !!t.billUrl).length;
        const avgAmt = catAllEntries.length > 0 ? totalCatAmount / catAllEntries.length : 0;

        const downloadCategoryCSV = () => {
          const csvHeaders = ['Date', 'Category', 'Type', 'Payment Method', 'Amount (INR)', 'Comments / Notes', 'Bill URL', 'Raw Details'];
          const rows = displayedEntries.map(tx => [
            tx.dateStr || '',
            tx.category || '',
            tx.type || '',
            tx.method || '',
            tx.amount || 0,
            (tx.notes || '').replace(/"/g, '""'),
            tx.billUrl || '',
            (tx.rawDetails || '').replace(/"/g, '""'),
          ]);
          const csvContent = 'data:text/csv;charset=utf-8,' + [
            csvHeaders.join(','),
            ...rows.map(e => e.map(x => `"${x}"`).join(','))
          ].join('\n');
          const encodedUri = encodeURI(csvContent);
          const link = document.createElement('a');
          link.setAttribute('href', encodedUri);
          link.setAttribute('download', `Category_${selectedCategoryDetails.categoryName}_${catModalScope}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        };

        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[140] p-3 sm:p-5 animate-in fade-in duration-200">
            <div className="bg-brand-cream border-4 border-brand-yellow rounded-[2.5rem] shadow-2xl w-full max-w-5xl text-brand-brown flex flex-col overflow-hidden max-h-[92vh] animate-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="p-5 sm:p-6 border-b border-brand-brown/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-xl shadow-sm ${
                    isRevenue ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {isRevenue ? '📈' : '📉'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-black uppercase tracking-tight text-brand-brown">
                        {selectedCategoryDetails.categoryName}
                      </h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        isRevenue ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}>
                        {isRevenue ? 'Revenue Category' : 'Expense Category'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 font-semibold mt-0.5">
                      Detailed ledger breakdown with dates, comments, payment modes, and attached bills.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={downloadCategoryCSV}
                    className="p-2 sm:px-3 sm:py-2 bg-stone-100 hover:bg-stone-200 text-zinc-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
                    title="Export category entries to CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Export CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryDetails(null);
                      setCatModalSearch('');
                    }}
                    className="p-2 sm:px-3.5 sm:py-2 bg-brand-yellow hover:bg-amber-400 text-brand-brown rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <X className="w-4 h-4" />
                    <span>Close</span>
                  </button>
                </div>
              </div>

              {/* KPI Stats Bar */}
              <div className="bg-stone-50/90 border-b border-brand-brown/10 p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white p-3.5 rounded-2xl border border-zinc-200/80 shadow-xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-0.5">
                    Total Category Amount
                  </span>
                  <div className={`text-xl font-black font-mono ${isRevenue ? 'text-emerald-700' : 'text-rose-600'}`}>
                    ₹{totalCatAmount.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-bold">
                    Avg ₹{Math.round(avgAmt).toLocaleString('en-IN')} / txn
                  </span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-zinc-200/80 shadow-xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-0.5">
                    Transactions Count
                  </span>
                  <div className="text-xl font-black text-brand-brown font-mono">
                    {catAllEntries.length} <span className="text-xs font-bold text-zinc-400 font-sans">entries</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-bold">
                    {catModalScope === 'period' ? 'Selected Period' : 'All Loaded Data'}
                  </span>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-zinc-200/80 shadow-xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-0.5">
                    Payment Breakdown
                  </span>
                  <div className="text-xs font-black text-brand-brown flex flex-col gap-0.5 font-mono">
                    <span className="text-amber-800">Cash: ₹{cashSum.toLocaleString('en-IN')} ({cashEntries.length})</span>
                    <span className="text-blue-800">Bank: ₹{bankSum.toLocaleString('en-IN')} ({bankEntries.length})</span>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-zinc-200/80 shadow-xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block mb-0.5">
                    Attached Bills
                  </span>
                  <div className="text-xl font-black text-blue-700 font-mono">
                    {withBillCount} <span className="text-xs font-bold text-zinc-400 font-sans">receipts</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-bold">
                    {catAllEntries.length > 0 ? `${Math.round((withBillCount / catAllEntries.length) * 100)}% documented` : '0%'}
                  </span>
                </div>
              </div>

              {/* Filters & Search Controls */}
              <div className="p-4 sm:px-6 bg-brand-cream/60 border-b border-brand-brown/10 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
                {/* Search Bar */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by comments, remarks, or date..."
                    value={catModalSearch}
                    onChange={(e) => setCatModalSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-white border border-brand-brown/15 rounded-xl text-xs font-bold text-brand-brown outline-none focus:border-brand-brown shadow-xs"
                  />
                  {catModalSearch && (
                    <button
                      type="button"
                      onClick={() => setCatModalSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Scope Toggle */}
                  <div className="inline-flex bg-white p-1 rounded-xl border border-brand-brown/15 shadow-xs text-[11px] font-black uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => setCatModalScope('period')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        catModalScope === 'period' ? 'bg-brand-yellow text-brand-brown shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                      }`}
                    >
                      This Period
                    </button>
                    <button
                      type="button"
                      onClick={() => setCatModalScope('all')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        catModalScope === 'all' ? 'bg-brand-yellow text-brand-brown shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                      }`}
                    >
                      All Records
                    </button>
                  </div>

                  {/* Method Filter */}
                  <select
                    value={catModalMethodFilter}
                    onChange={(e) => setCatModalMethodFilter(e.target.value as any)}
                    aria-label="Filter entries by payment method"
                    className="px-2.5 py-1.5 bg-white border border-brand-brown/15 rounded-xl text-xs font-bold text-brand-brown outline-none shadow-xs cursor-pointer"
                  >
                    <option value="all">All Modes</option>
                    <option value="cash">Cash Only</option>
                    <option value="bank">Bank Only</option>
                  </select>

                  {/* Bill Filter */}
                  <select
                    value={catModalBillFilter}
                    onChange={(e) => setCatModalBillFilter(e.target.value as any)}
                    aria-label="Filter entries by attached bill receipt status"
                    className="px-2.5 py-1.5 bg-white border border-brand-brown/15 rounded-xl text-xs font-bold text-brand-brown outline-none shadow-xs cursor-pointer"
                  >
                    <option value="all">All Entries</option>
                    <option value="with_bill">With Receipt Only</option>
                    <option value="no_bill">No Receipt</option>
                  </select>
                </div>
              </div>

              {/* Table of Ledger Entries */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-brand-cream/30 space-y-4">
                {displayedEntries.length === 0 ? (
                  <div className="bg-white rounded-3xl p-10 border border-brand-brown/10 text-center space-y-3">
                    <FileText className="w-12 h-12 text-zinc-300 mx-auto" />
                    <h4 className="text-sm font-black uppercase tracking-wider text-brand-brown">No matching entries found</h4>
                    <p className="text-xs text-zinc-400 font-semibold max-w-sm mx-auto">
                      {catModalSearch || catModalMethodFilter !== 'all' || catModalBillFilter !== 'all'
                        ? 'Try clearing the search query or adjusting your filters.'
                        : `There are no recorded transactions for category "${selectedCategoryDetails.categoryName}" in this timeframe.`}
                    </p>
                    {(catModalSearch || catModalMethodFilter !== 'all' || catModalBillFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setCatModalSearch('');
                          setCatModalMethodFilter('all');
                          setCatModalBillFilter('all');
                        }}
                        className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-brand-brown rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-brand-brown/10 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-stone-50 border-b border-zinc-200 text-[10px] uppercase font-black text-zinc-500 tracking-wider">
                            <th className="py-3 px-4">Date</th>
                            <th className="py-3 px-3 text-center">Mode</th>
                            <th className="py-3 px-4 text-right">Amount (₹)</th>
                            <th className="py-3 px-4 min-w-[220px]">Comments & Details</th>
                            <th className="py-3 px-4 text-center">Receipt / Bill</th>
                            <th className="py-3 px-4 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 font-medium">
                          {displayedEntries.map((tx, idx) => {
                            const isInvestment = (tx.rawDetails || '').toLowerCase().includes('[funding: investment]');
                            return (
                              <tr key={tx.id || idx} className="hover:bg-amber-50/30 transition-colors">
                                {/* Date */}
                                <td className="py-3 px-4 whitespace-nowrap">
                                  <div className="flex flex-col">
                                    <span className="font-mono font-black text-brand-brown text-xs">
                                      {tx.dateStr}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 font-bold">
                                      {new Date(tx.dateStr).toLocaleDateString('en-US', { weekday: 'short' })}
                                    </span>
                                  </div>
                                </td>

                                {/* Mode */}
                                <td className="py-3 px-3 text-center whitespace-nowrap">
                                  {tx.method === 'cash' ? (
                                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200/80">
                                      Cash
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-800 border border-blue-200/80">
                                      Bank
                                    </span>
                                  )}
                                </td>

                                {/* Amount */}
                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                  <span className={`font-mono font-black text-sm ${isRevenue ? 'text-emerald-700' : 'text-rose-600'}`}>
                                    ₹{tx.amount.toLocaleString('en-IN')}
                                  </span>
                                </td>

                                {/* Comments & Notes */}
                                <td className="py-3 px-4">
                                  <div className="space-y-1 max-w-md">
                                    {tx.notes ? (
                                      <p className="text-zinc-800 font-semibold leading-snug">
                                        {tx.notes}
                                      </p>
                                    ) : (
                                      <span className="text-zinc-400 italic text-xs">
                                        No comments provided
                                      </span>
                                    )}

                                    {/* Additional context badges if any */}
                                    {isInvestment && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[9px] font-black uppercase tracking-wider">
                                        💰 Investment Funding
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Receipt / Bill */}
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  {tx.billUrl ? (
                                    <div className="inline-flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setActivePreviewBillUrl(tx.billUrl)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-[10px] font-black uppercase tracking-wider border border-blue-200/60 transition-colors shadow-xs cursor-pointer"
                                        title="Preview receipt image / document"
                                      >
                                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                                        <span>View Bill</span>
                                      </button>
                                      <a
                                        href={tx.billUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 text-zinc-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Open bill in new tab"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                    </div>
                                  ) : (
                                    <span className="text-zinc-300 font-bold text-[10px] uppercase tracking-wider">
                                      No Bill
                                    </span>
                                  )}
                                </td>

                                {/* Actions */}
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  <div className="inline-flex items-center justify-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveLedgerView('sheet');
                                        setSelectedCategoryDetails(null);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-zinc-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                      title="Jump to Main Ledger view"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>Ledger</span>
                                    </button>

                                    {/* Audit trail button if edits recorded */}
                                    {tx.rec?.edit_history && tx.rec.edit_history.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setActiveAuditRec(tx.rec)}
                                        className="p-1.5 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer"
                                        title={`View ${tx.rec.edit_history.length} edit audit history`}
                                      >
                                        <History className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-stone-50 border-t border-zinc-200 font-black text-xs">
                            <td colSpan={2} className="py-3 px-4 text-brand-brown uppercase tracking-wider text-[11px]">
                              Showing {displayedEntries.length} of {catAllEntries.length} entries
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black text-sm">
                              <span className={isRevenue ? 'text-emerald-700' : 'text-rose-600'}>
                                ₹{displayedAmount.toLocaleString('en-IN')}
                              </span>
                            </td>
                            <td colSpan={3} className="py-3 px-4 text-right text-zinc-400 text-[10px] uppercase font-bold">
                              Category Summary
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Bottom Footer */}
              <div className="p-4 sm:px-6 bg-white border-t border-brand-brown/10 flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="text-xs text-zinc-500 font-semibold">
                  Viewing entries for <strong className="text-brand-brown font-black uppercase">{selectedCategoryDetails.categoryName}</strong> • {displayedEntries.length} records matching current criteria
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryDetails(null);
                      setCatModalSearch('');
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 bg-brand-yellow hover:bg-amber-400 text-brand-brown rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-xs cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Receipt / Bill Lightbox Modal */}
      {activePreviewBillUrl && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[150] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150 border-4 border-brand-yellow">
            {/* Top Bar */}
            <div className="p-4 px-5 border-b border-zinc-100 flex justify-between items-center bg-stone-50">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-black uppercase tracking-wider text-brand-brown">
                  Receipt / Attached Bill Preview
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={activePreviewBillUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Original</span>
                </a>
                <button
                  type="button"
                  onClick={() => setActivePreviewBillUrl(null)}
                  className="p-1.5 bg-stone-200 hover:bg-stone-300 text-zinc-700 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Media Container */}
            <div className="p-4 overflow-auto flex-1 bg-stone-900 flex items-center justify-center min-h-[350px]">
              {/\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(activePreviewBillUrl) || activePreviewBillUrl.includes('receipt') || activePreviewBillUrl.includes('drive.google.com') ? (
                <img
                  src={activePreviewBillUrl}
                  alt="Receipt Preview"
                  referrerPolicy="no-referrer"
                  className="max-h-[70vh] max-w-full rounded-xl object-contain shadow-md"
                  onError={(e) => {
                    // Fallback to iframe/link if image fails
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const fallback = target.parentElement?.querySelector('.bill-fallback-msg');
                    if (fallback) (fallback as HTMLElement).style.display = 'flex';
                  }}
                />
              ) : (
                <iframe
                  src={activePreviewBillUrl}
                  title="Document Preview"
                  className="w-full h-[65vh] rounded-xl bg-white border-0"
                />
              )}

              {/* Fallback Message if image can't load inline */}
              <div className="bill-fallback-msg hidden flex-col items-center justify-center p-8 text-center text-white gap-3">
                <FileText className="w-12 h-12 text-zinc-400" />
                <p className="text-sm font-bold">This document cannot be previewed directly in the browser.</p>
                <a
                  href={activePreviewBillUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-brand-yellow text-brand-brown rounded-xl text-xs font-black uppercase tracking-wider"
                >
                  Open in New Tab
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manage Categories & Subcategory Mappings Modal */}
      {isManageCategoriesOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[140] p-4 animate-in fade-in duration-200">
          <div className="bg-brand-cream border border-brand-brown/15 rounded-[2.5rem] shadow-2xl w-full max-w-4xl text-brand-brown flex flex-col overflow-hidden max-h-[92vh] animate-in zoom-in-95 duration-150 border-8 border-brand-yellow">
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-brand-brown/10 flex justify-between items-center bg-white flex-shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📁</span>
                  <h3 className="text-lg font-black uppercase tracking-tight italic">
                    Subcategories & Ledger Expense Mappings
                  </h3>
                </div>
                <p className="text-[11px] text-zinc-500 font-semibold">
                  Create new stock subcategories, map stock items directly to Finance Ledger expense categories, or edit/delete existing mappings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsManageCategoriesOpen(false);
                  setNewLedgerCatName('');
                  setNewLedgerCatMappings([]);
                  setEditingSubcat(null);
                }}
                className="text-xs font-black text-brand-brown hover:text-brand-brown/70 bg-brand-yellow rounded-xl py-2 px-4 transition-all uppercase tracking-wider shadow-sm cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Notification Banner */}
            {subcatNotification && (
              <div className="bg-emerald-600 text-white px-6 py-2.5 text-xs font-black uppercase tracking-wider flex items-center justify-between animate-in slide-in-from-top-2 duration-150 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-brand-yellow" />
                  <span>{subcatNotification}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSubcatNotification(null)}
                  className="text-white/80 hover:text-white text-xs font-bold ml-4"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex border-b border-brand-brown/10 bg-stone-100/70 px-6 pt-3 gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setModalActiveTab('subcategories')}
                className={`pb-3 px-4 text-xs font-black uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                  modalActiveTab === 'subcategories'
                    ? 'border-brand-brown text-brand-brown bg-white rounded-t-xl shadow-sm'
                    : 'border-transparent text-zinc-400 hover:text-brand-brown'
                }`}
              >
                <span>📦 Stock Subcategories & Mappings</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand-yellow/50 text-brand-brown font-mono">
                  {getStockSubcategoriesList().length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModalActiveTab('ledger-categories')}
                className={`pb-3 px-4 text-xs font-black uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                  modalActiveTab === 'ledger-categories'
                    ? 'border-brand-brown text-brand-brown bg-white rounded-t-xl shadow-sm'
                    : 'border-transparent text-zinc-400 hover:text-brand-brown'
                }`}
              >
                <span>📑 Ledger Account Categories</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-stone-200 text-zinc-600 font-mono">
                  {debitCategories.length + creditCategories.length}
                </span>
              </button>
            </div>

            {/* Content Container (Scrollable) */}
            {modalActiveTab === 'subcategories' ? (
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-brand-cream/20 custom-scrollbar">
                
                {/* SECTION 1: Create New Stock Subcategory */}
                <div className="bg-white p-5 rounded-2xl border border-brand-brown/10 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-brand-brown/10">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-brand-yellow/40 rounded-lg text-xs">✨</span>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-brand-brown">
                          Create New Stock Subcategory
                        </h4>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">
                          Add a new item to warehouse inventory and automatically map its debit expense category.
                        </p>
                      </div>
                    </div>
                    {deletedSubcategories.length > 0 && (
                      <button
                        type="button"
                        onClick={handleRestoreDefaultSubcategories}
                        className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-brand-brown rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer border border-brand-brown/15"
                      >
                        Restore ({deletedSubcategories.length}) Default Items
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleCreateCustomSubcategory} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Name */}
                      <div className="space-y-1 sm:col-span-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown/60 block">
                          Subcategory Name *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Chicken, Paneer, Tissue"
                          value={newSubcatName}
                          onChange={e => setNewSubcatName(e.target.value)}
                          className="w-full p-2.5 bg-brand-stone/10 border border-brand-brown/15 rounded-xl text-xs font-bold text-brand-brown outline-none focus:ring-2 focus:ring-brand-yellow"
                          required
                        />
                      </div>

                      {/* Parent Stock Category */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown/60 block">
                          Warehouse Section *
                        </label>
                        <select
                          value={newSubcatParent}
                          onChange={e => setNewSubcatParent(e.target.value as any)}
                          className="w-full p-2.5 bg-brand-stone/10 border border-brand-brown/15 rounded-xl text-xs font-bold text-brand-brown outline-none focus:ring-2 focus:ring-brand-yellow"
                        >
                          <option value="PACKET">📦 PACKET (Packaged / Materials)</option>
                          <option value="INGREDIENT">🥬 INGREDIENT (Fresh Raw / Meat)</option>
                          <option value="MOMO">🥟 MOMO (Momo Products / Drinks)</option>
                        </select>
                      </div>

                      {/* Map to Expense Category */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown/60 block">
                          ⚡ Auto-Map Expense Category
                        </label>
                        <select
                          value={newSubcatExpenseMapping}
                          onChange={e => setNewSubcatExpenseMapping(e.target.value)}
                          className="w-full p-2.5 bg-emerald-50/50 border border-emerald-300/40 rounded-xl text-xs font-black text-emerald-900 outline-none focus:ring-2 focus:ring-emerald-400"
                        >
                          <option value="">-- Unmapped (Defaults to OTHERS) --</option>
                          {debitCategories.map(cat => (
                            <option key={cat} value={cat}>
                              🏷️ {cat.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Icon Selection with Emoji quick picks */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown/60">
                          Icon / Emoji
                        </label>
                        <span className="text-[10px] text-zinc-400 font-semibold">Selected: {newSubcatIcon}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 bg-brand-stone/5 p-2 rounded-xl border border-brand-brown/10">
                        <input
                          type="text"
                          value={newSubcatIcon}
                          onChange={e => setNewSubcatIcon(e.target.value)}
                          className="w-12 p-1.5 text-center text-sm bg-white border border-brand-brown/20 rounded-lg outline-none font-bold"
                          maxLength={3}
                        />
                        <div className="flex flex-wrap gap-1">
                          {['🍗', '🥩', '🧀', '🌶️', '🧈', '🥫', '📦', '🍟', '🥤', '🥬', '🍞', '🧴', '🏷️', '🧹', '🍳', '🧊'].map(emoji => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => setNewSubcatIcon(emoji)}
                              className={`p-1.5 rounded-lg text-sm hover:scale-110 transition-transform cursor-pointer ${
                                newSubcatIcon === emoji ? 'bg-brand-yellow/60 border border-brand-brown/30 shadow-xs' : 'hover:bg-white'
                              }`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={isCreatingSubcat || !newSubcatName.trim()}
                        className="bg-brand-brown hover:bg-brand-brown/90 disabled:opacity-50 text-brand-yellow text-xs font-black uppercase tracking-widest px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isCreatingSubcat ? 'Creating...' : 'Create Subcategory & Link'}</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* SECTION 2: Subcategory Mappings Directory */}
                <div className="bg-white p-5 rounded-2xl border border-brand-brown/10 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-2 border-b border-brand-brown/10">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-brand-brown flex items-center gap-2">
                        <span>📋</span>
                        <span>Stock Subcategories & Expense Mappings Directory</span>
                      </h4>
                      <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                        Change any subcategory's expense category using the dropdown. When bills are paid, expenses route automatically!
                      </p>
                    </div>
                    <span className="text-[10px] font-black uppercase px-2.5 py-1 bg-stone-100 rounded-lg text-brand-brown/70 self-start sm:self-auto font-mono">
                      {getStockSubcategoriesList().length} Total Subcategories
                    </span>
                  </div>

                  {/* Search and Filters */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    {/* Search Input */}
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search subcategory by name, id..."
                        value={subcatSearchTerm}
                        onChange={e => setSubcatSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-brand-brown/15 rounded-xl text-xs font-bold text-brand-brown outline-none focus:ring-2 focus:ring-brand-yellow"
                      />
                      {subcatSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setSubcatSearchTerm('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs font-bold"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Warehouse Category Filter */}
                    <div className="flex rounded-xl bg-stone-100 p-1 text-[10px] font-black uppercase tracking-wider gap-0.5">
                      {(['ALL', 'PACKET', 'INGREDIENT', 'MOMO'] as const).map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSubcatCategoryFilter(cat)}
                          className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                            subcatCategoryFilter === cat
                              ? 'bg-white text-brand-brown shadow-xs font-black'
                              : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          {cat === 'ALL' ? 'All' : cat}
                        </button>
                      ))}
                    </div>

                    {/* Mapping Status Filter */}
                    <div className="flex rounded-xl bg-stone-100 p-1 text-[10px] font-black uppercase tracking-wider gap-0.5">
                      {(['ALL', 'MAPPED', 'UNMAPPED', 'CUSTOM'] as const).map(filter => (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setSubcatMappingFilter(filter)}
                          className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                            subcatMappingFilter === filter
                              ? 'bg-white text-brand-brown shadow-xs font-black'
                              : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Subcategories Table */}
                  <div className="border border-brand-brown/10 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-[380px] custom-scrollbar">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-stone-50 text-[10px] font-black uppercase tracking-wider text-brand-brown/60 border-b border-brand-brown/10 sticky top-0 z-10">
                          <tr>
                            <th className="py-2.5 px-3">Subcategory</th>
                            <th className="py-2.5 px-3">Warehouse Section</th>
                            <th className="py-2.5 px-3">Origin</th>
                            <th className="py-2.5 px-3 min-w-[220px]">Mapped Expense Category (Click to Edit)</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-brown/5">
                          {getStockSubcategoriesList()
                            .filter(sub => {
                              if (subcatSearchTerm.trim()) {
                                const q = subcatSearchTerm.toLowerCase().trim();
                                const match = sub.label.toLowerCase().includes(q) || sub.id.toLowerCase().includes(q);
                                if (!match) return false;
                              }
                              if (subcatCategoryFilter !== 'ALL' && sub.category !== subcatCategoryFilter) {
                                return false;
                              }
                              const mappedCat = getSubcategoryMappedExpense(sub.id);
                              if (subcatMappingFilter === 'MAPPED' && !mappedCat) return false;
                              if (subcatMappingFilter === 'UNMAPPED' && mappedCat) return false;
                              if (subcatMappingFilter === 'CUSTOM' && !sub.isCustom) return false;
                              return true;
                            })
                            .map(sub => {
                              const mappedExpense = getSubcategoryMappedExpense(sub.id);
                              const isFeedback = subcatFeedback?.id === sub.id;

                              return (
                                <tr key={`${sub.category}-${sub.id}`} className="hover:bg-brand-stone/10 transition-colors">
                                  {/* Subcategory Label & Icon */}
                                  <td className="py-3 px-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-base">{sub.icon || '🏷️'}</span>
                                      <div>
                                        <div className="font-extrabold text-brand-brown text-xs">
                                          {sub.label}
                                        </div>
                                        <span className="text-[8.5px] font-mono text-zinc-400 font-semibold">
                                          id: {sub.id}
                                        </span>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Warehouse Section */}
                                  <td className="py-3 px-3">
                                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-stone-100 text-zinc-600 border border-stone-200">
                                      {sub.category}
                                    </span>
                                  </td>

                                  {/* Origin */}
                                  <td className="py-3 px-3">
                                    {sub.isCustom ? (
                                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                                        ⭐ Custom
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500">
                                        Built-in
                                      </span>
                                    )}
                                  </td>

                                  {/* Mapped Expense Category - LIVE EDIT SELECT */}
                                  <td className="py-3 px-3">
                                    <div className="flex items-center gap-2">
                                      <select
                                        value={mappedExpense || 'unmapped'}
                                        onChange={e => handleUpdateSubcategoryMapping(sub.id, e.target.value, sub.label)}
                                        className={`text-xs font-black py-1.5 px-3 rounded-xl border transition-all outline-none cursor-pointer ${
                                          mappedExpense
                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100/70'
                                            : 'bg-stone-50 border-stone-200 text-zinc-500 hover:bg-stone-100'
                                        }`}
                                      >
                                        <option value="unmapped">-- Unmapped (Defaults to OTHERS) --</option>
                                        {debitCategories.map(cat => (
                                          <option key={cat} value={cat}>
                                            🏷️ {cat.toUpperCase()}
                                          </option>
                                        ))}
                                      </select>

                                      {isFeedback && (
                                        <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md animate-pulse">
                                          ✓ Saved
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Actions */}
                                  <td className="py-3 px-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {/* If mapped, quick unmap button */}
                                      {mappedExpense && (
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateSubcategoryMapping(sub.id, 'unmapped', sub.label)}
                                          className="p-1.5 bg-stone-100 hover:bg-stone-200 text-zinc-600 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                          title="Remove expense category mapping"
                                        >
                                          Unlink
                                        </button>
                                      )}

                                      {/* Edit if Custom */}
                                      {sub.isCustom && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => setEditingSubcat(sub)}
                                            className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors cursor-pointer shadow-xs"
                                            title="Edit custom subcategory name and icon"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => handleDeleteCustomSubcategory(sub.id, sub.label)}
                                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer shadow-xs"
                                            title="Delete custom subcategory"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Inline Modal for Editing Custom Subcategory */}
                {editingSubcat && (
                  <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[160] p-4">
                    <div className="bg-white rounded-3xl p-6 border-4 border-brand-yellow max-w-md w-full shadow-2xl space-y-4">
                      <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
                        <h4 className="text-sm font-black uppercase tracking-wide text-brand-brown">
                          ✏️ Edit Subcategory
                        </h4>
                        <button
                          type="button"
                          onClick={() => setEditingSubcat(null)}
                          className="text-zinc-400 hover:text-zinc-700 text-sm font-bold"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            Subcategory Label
                          </label>
                          <input
                            type="text"
                            value={editingSubcat.label}
                            onChange={e => setEditingSubcat({ ...editingSubcat, label: e.target.value })}
                            className="w-full p-2.5 bg-stone-50 border border-zinc-200 rounded-xl text-xs font-bold text-brand-brown outline-none focus:ring-2 focus:ring-brand-yellow"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            Warehouse Category
                          </label>
                          <select
                            value={editingSubcat.category}
                            onChange={e => setEditingSubcat({ ...editingSubcat, category: e.target.value })}
                            className="w-full p-2.5 bg-stone-50 border border-zinc-200 rounded-xl text-xs font-bold text-brand-brown outline-none"
                          >
                            <option value="PACKET">PACKET (Packaged / Materials)</option>
                            <option value="INGREDIENT">INGREDIENT (Fresh Raw / Meat)</option>
                            <option value="MOMO">MOMO (Momo Products / Drinks)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            Icon / Emoji
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingSubcat.icon}
                              onChange={e => setEditingSubcat({ ...editingSubcat, icon: e.target.value })}
                              className="w-16 p-2 text-center text-base bg-stone-50 border border-zinc-200 rounded-xl font-bold"
                              maxLength={3}
                            />
                            <div className="flex flex-wrap gap-1">
                              {['🍗', '🥩', '🧀', '🌶️', '🧈', '🥫', '📦', '🍟', '🥤', '🥬', '🍞', '🧴', '🏷️'].map(emoji => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => setEditingSubcat({ ...editingSubcat, icon: emoji })}
                                  className="p-1 hover:bg-stone-100 rounded text-sm"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                        <button
                          type="button"
                          onClick={() => setEditingSubcat(null)}
                          className="px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-xl text-xs font-black uppercase tracking-wider text-zinc-600 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEditSubcategory()}
                          className="px-4 py-2 bg-brand-brown hover:bg-brand-brown/90 rounded-xl text-xs font-black uppercase tracking-wider text-brand-yellow cursor-pointer shadow-sm"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              /* TAB 2: Manage Ledger Categories (Debit & Credit) */
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-brand-cream/30 custom-scrollbar">
                
                {/* Form to Create/Upsert Category */}
                <div className="bg-white p-5 rounded-2xl border border-brand-brown/10 space-y-4 shadow-sm">
                  <h4 className="text-xs font-black uppercase tracking-widest text-brand-brown/60 pb-2 border-b border-brand-brown/10">
                    Add / Edit Ledger Category Account
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Category Name */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown/50 block">Category Name</label>
                      <input
                        type="text"
                        placeholder="e.g. kitchen gas, delivery-charges"
                        value={newLedgerCatName}
                        onChange={e => setNewLedgerCatName(e.target.value)}
                        className="w-full p-2.5 bg-brand-stone/10 border border-brand-brown/10 rounded-xl text-xs font-bold outline-none text-brand-brown"
                      />
                    </div>

                    {/* Category Type */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown/50 block">Transaction Type</label>
                      <select
                        value={newLedgerCatType}
                        onChange={e => setNewLedgerCatType(e.target.value as 'credit' | 'debit')}
                        className="w-full p-2.5 bg-brand-stone/10 border border-brand-brown/10 rounded-xl text-xs font-bold outline-none text-brand-brown"
                      >
                        <option value="debit">Debit (Outward Expense / Purchase)</option>
                        <option value="credit">Credit (Inward Revenue / Capital)</option>
                      </select>
                    </div>
                  </div>

                  {/* Stock Subcategory Mappings */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-brand-brown/50 block">
                      Map to Stock Subcategories (Optional)
                    </label>
                    <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">
                      Link this category to warehouse stock subcategories so vendor bills route to this category automatically.
                    </p>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-brand-stone/5 p-3 rounded-xl border border-brand-brown/5 max-h-[150px] overflow-y-auto">
                      {getStockSubcategoriesList().map(sub => {
                        const isChecked = newLedgerCatMappings.includes(sub.id);
                        return (
                          <label 
                            key={`${sub.category}-${sub.id}`}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-[10px] font-bold cursor-pointer select-none transition-all ${
                              isChecked 
                                ? 'bg-brand-yellow/30 border-brand-brown/40 text-brand-brown' 
                                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setNewLedgerCatMappings(prev => prev.filter(id => id !== sub.id));
                                } else {
                                  setNewLedgerCatMappings(prev => [...prev, sub.id]);
                                }
                              }}
                              className="rounded border-zinc-300 text-brand-brown focus:ring-brand-brown w-3 h-3"
                            />
                            <span>{sub.icon} {sub.label}</span>
                            <span className="text-[7px] bg-zinc-100 text-zinc-400 px-1 py-0.5 rounded uppercase font-black ml-auto">
                              {sub.category}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleSaveLedgerCategory}
                      disabled={isSavingCategory}
                      className="bg-brand-brown hover:bg-brand-brown/90 text-brand-yellow text-xs font-black uppercase tracking-widest px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                    >
                      {isSavingCategory ? 'Saving...' : '💾 Save Category Mapping'}
                    </button>
                  </div>
                </div>

                {/* Lists of Current Categories */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Debit Categories */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-brand-red flex items-center gap-1.5 italic">
                      <span>🛑</span>
                      Debit Expense Categories ({debitCategories.length})
                    </h4>
                    <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-3 custom-scrollbar">
                      {debitCategories.map(cat => {
                        const isDefault = DEBIT_CATEGORIES.includes(cat);
                        const mappings = categoryMappings[cat] || [];
                        return (
                          <div key={cat} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-brand-brown/5 shadow-sm hover:border-brand-brown/15 transition-all">
                            <div className="space-y-0.5">
                              <span className="text-xs font-extrabold text-brand-brown">{cat}</span>
                              {mappings.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {mappings.map(subId => {
                                    const s = getStockSubcategoriesList().find(item => item.id === subId);
                                    return (
                                      <span key={subId} className="text-[7.5px] font-black uppercase tracking-wider bg-brand-yellow/30 text-brand-brown px-1.5 py-0.5 rounded-md">
                                        {s ? `${s.icon} ${s.label}` : subId}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-[8px] text-zinc-400 font-bold uppercase tracking-wider">Unmapped</p>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 relative z-10">
                              <button
                                type="button"
                                onClick={() => {
                                  setNewLedgerCatName(cat);
                                  setNewLedgerCatType('debit');
                                  setNewLedgerCatMappings(mappings);
                                }}
                                className="p-2 bg-brand-stone/10 hover:bg-brand-yellow/30 text-brand-brown hover:text-brand-brown rounded-lg transition-all flex items-center justify-center min-w-[28px] min-h-[28px] relative z-20 cursor-pointer shadow-sm"
                                title="Edit Mapping"
                              >
                                <span className="pointer-events-none text-xs">✏️</span>
                              </button>
                              {!isDefault && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLedgerCategory(cat)}
                                  className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-500 hover:text-rose-700 rounded-lg transition-all flex items-center justify-center min-w-[28px] min-h-[28px] cursor-pointer shadow-sm"
                                  title="Delete Category"
                                >
                                  <span className="pointer-events-none text-xs">🗑️</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Credit Categories */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1.5 italic">
                      <span>🟢</span>
                      Credit Revenue Categories ({creditCategories.length})
                    </h4>
                    <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-3 custom-scrollbar">
                      {creditCategories.map(cat => {
                        const isDefault = CREDIT_CATEGORIES.includes(cat);
                        const mappings = categoryMappings[cat] || [];
                        return (
                          <div key={cat} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-brand-brown/5 shadow-sm hover:border-brand-brown/15 transition-all">
                            <div className="space-y-0.5">
                              <span className="text-xs font-extrabold text-brand-brown">{cat}</span>
                              {mappings.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {mappings.map(subId => {
                                    const s = getStockSubcategoriesList().find(item => item.id === subId);
                                    return (
                                      <span key={subId} className="text-[7.5px] font-black uppercase tracking-wider bg-brand-yellow/30 text-brand-brown px-1.5 py-0.5 rounded-md">
                                        {s ? `${s.icon} ${s.label}` : subId}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-[8px] text-zinc-400 font-bold uppercase tracking-wider">Unmapped</p>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 relative z-10">
                              <button
                                type="button"
                                onClick={() => {
                                  setNewLedgerCatName(cat);
                                  setNewLedgerCatType('credit');
                                  setNewLedgerCatMappings(mappings);
                                }}
                                className="p-2 bg-brand-stone/10 hover:bg-brand-yellow/30 text-brand-brown hover:text-brand-brown rounded-lg transition-all flex items-center justify-center min-w-[28px] min-h-[28px] relative z-20 cursor-pointer shadow-sm"
                                title="Edit Mapping"
                              >
                                <span className="pointer-events-none text-xs">✏️</span>
                              </button>
                              {!isDefault && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLedgerCategory(cat)}
                                  className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-500 hover:text-rose-700 rounded-lg transition-all flex items-center justify-center min-w-[28px] min-h-[28px] cursor-pointer shadow-sm"
                                  title="Delete Category"
                                >
                                  <span className="pointer-events-none text-xs">🗑️</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Camera Capture Modal */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[150] p-4 animate-in fade-in duration-200">
          <div className="bg-brand-cream border border-brand-brown/15 rounded-3xl shadow-2xl w-full max-w-md text-brand-brown flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 border-b border-brand-brown/10 flex justify-between items-center bg-white">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-600" />
                  Capture Bill Receipt
                </h3>
                <p className="text-[10px] text-zinc-400 font-medium mt-0.5">
                  Take a clear, sharp photo of the receipt to log as a secure record.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCameraModalOpen(false);
                  setPhotoPreviewUrl(null);
                }}
                className="text-xs font-bold text-zinc-400 hover:text-brand-brown border border-brand-brown/10 rounded-lg p-1.5 px-2.5 hover:bg-zinc-50 transition-all font-sans uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>

            {/* Main Content Area */}
            <div className="p-5 flex-1 flex flex-col space-y-4">
              {cameraError ? (
                <div className="p-6 bg-rose-50 border border-rose-100 rounded-2xl flex flex-col items-center text-center space-y-3">
                  <CameraOff className="w-10 h-10 text-rose-500 animate-bounce" />
                  <div className="space-y-1">
                    <p className="font-black uppercase text-xs text-rose-800">Camera Access Error</p>
                    <p className="text-[10px] text-rose-700/80 font-medium leading-relaxed max-w-[280px]">
                      {cameraError}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCameraModalOpen(false);
                      setCameraError(null);
                    }}
                    className="px-4 py-2 bg-rose-600 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl hover:bg-rose-700"
                  >
                    Select Option Instead
                  </button>
                </div>
              ) : !photoPreviewUrl ? (
                /* Live Camera Stream Mode */
                <div className="space-y-4">
                  <div className="relative aspect-[4/3] bg-black rounded-2xl overflow-hidden border border-brand-brown/10 shadow-lg flex items-center justify-center">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: cameraFacingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                    />
                    
                    {/* Switch Camera Overlay */}
                    {hasMultipleCameras && (
                      <button
                        type="button"
                        onClick={() => setCameraFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                        className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full transition-all outline-none flex items-center justify-center z-10"
                        title="Switch Camera Face"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col items-center justify-center pt-2">
                    {/* Capture Shutter Button */}
                    <button
                      type="button"
                      onClick={handleCapturePhoto}
                      className="group relative w-16 h-16 rounded-full border-4 border-emerald-600 bg-white hover:bg-emerald-50 active:scale-90 transition-all flex items-center justify-center shadow-lg cursor-pointer outline-none"
                    >
                      <div className="w-11 h-11 bg-emerald-600 rounded-full group-hover:scale-95 transition-transform"></div>
                    </button>
                    <p className="text-[9px] font-black uppercase text-zinc-400 tracking-widest mt-2">TAP TO SHUTTER</p>
                  </div>
                </div>
              ) : (
                /* Photo Capture Preview Mode */
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="relative aspect-[4/3] bg-black rounded-2xl overflow-hidden border border-brand-brown/10 shadow-lg flex items-center justify-center">
                    <img 
                      src={photoPreviewUrl} 
                      className="w-full h-full object-cover" 
                      alt="Receipt capture preview" 
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setPhotoPreviewUrl(null)}
                      className="flex-1 py-3 bg-brand-brown/10 hover:bg-brand-brown/20 text-brand-brown font-black rounded-xl text-xs uppercase tracking-wider text-center"
                    >
                      Retake Photo
                    </button>
                    <button
                      type="button"
                      onClick={handleUsePhoto}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs uppercase tracking-widest text-center shadow-md flex items-center justify-center gap-1.5"
                    >
                      Use Capture
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
