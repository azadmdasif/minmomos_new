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
  CameraOff
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
import { autoSyncDailyRevenueToLedger } from '../utils/storage';
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
  'grocery', 'soft drinks', 'ice', 'packaginf', 'veggies', 'burger buns', 'others'
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
  { id: 'others', label: 'Others', icon: '🏷️', category: 'PACKET' },
  { id: 'veggies', label: 'Veggies', icon: '🥬', category: 'INGREDIENT' },
  { id: 'others-ingredient', label: 'Others (Ingredient)', icon: '🏷️', category: 'INGREDIENT' },
];

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
  
  // Category management UI states
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [newLedgerCatName, setNewLedgerCatName] = useState('');
  const [newLedgerCatType, setNewLedgerCatType] = useState<'credit' | 'debit'>('debit');
  const [newLedgerCatMappings, setNewLedgerCatMappings] = useState<string[]>([]);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  const getStockSubcategoriesList = React.useCallback(() => {
    const list = [...DEFAULT_STOCK_SUBCATEGORIES];
    try {
      const saved = localStorage.getItem('custom_created_subcategories');
      if (saved) {
        const custom = JSON.parse(saved);
        custom.forEach((s: any) => {
          if (!list.some(item => item.id === s.id && item.category === s.parentCategory)) {
            list.push({
              id: s.id,
              label: s.label,
              icon: s.icon,
              category: s.parentCategory
            });
          }
        });
      }
    } catch (e) {
      console.error("Error reading custom subcategories:", e);
    }
    return list;
  }, []);

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
          if (mappings) setCategoryMappings(mappings);
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

        setDebitCategories(finalDebit);
        setCreditCategories(finalCredit);
        setCategoryMappings(mappings);
      } else {
        // Fallback to defaults
        setDebitCategories(DEBIT_CATEGORIES);
        setCreditCategories(CREDIT_CATEGORIES);
        setCategoryMappings({});
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
  const [dashboardPeriod, setDashboardPeriod] = useState<'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'>('this_month');
  const [customStartDate, setCustomStartDate] = useState<string>(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [pieFocusType, setPieFocusType] = useState<'revenue' | 'expense'>('expense');

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
      const { data, error } = await supabase
        .from('finance_ledger')
        .select('*')
        .eq('tab_name', activeTabName)
        .eq('is_deleted', true)
        .order('deleted_at', { ascending: false });

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

  // Effect to load active tab whenever we switch months/years or availableTabs list updates
  useEffect(() => {
    loadSheetRows();
  }, [selectedMonth, selectedYear, availableTabs]);

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
    } catch (err) {
      console.error('Error fetching meta:', err);
    }
  };

  // Load rows from Supabase on-the-fly and compute running balances to feed into grid
  const loadSheetRows = async () => {
    setIsSheetLoading(true);
    setSheetError(null);
    try {
      // Sync daily revenue from orders automatically before querying ledger rows
      try {
        await autoSyncDailyRevenueToLedger(60);
      } catch (syncErr) {
        console.warn('Auto revenue sync warning:', syncErr);
      }

      const { data, error } = await supabase
        .from('finance_ledger')
        .select('*')
        .eq('tab_name', activeTabName)
        .neq('is_deleted', true)
        .order('is_opening', { ascending: false })
        .order('date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      // Also load deleted records for the audit log in background
      loadDeletedRecords();

      if (!data || data.length === 0) {
        setSheetRows([]);
        return;
      }

      const formattedRows: any[][] = [HEADERS];

      const openingRecord = data.find(r => r.is_opening);
      const transactionRecords = data.filter(r => !r.is_opening);

      if (!openingRecord) {
        setSheetRows([]);
        return;
      }

      const openingCashVal = parseFloat(openingRecord.credit_cash) || 0;
      const openingBankVal = parseFloat(openingRecord.credit_bank) || 0;

      const openingRow = [
        openingRecord.date,
        "",
        "Opening Balance",
        "",
        "Opening Balance",
        "",
        "Opening Balance",
        "",
        "Opening Balance",
        openingCashVal,
        openingBankVal,
        openingCashVal + openingBankVal,
        openingRecord.id,
        openingRecord
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

      if (selectedFile) {
        // Sanitize filename to avoid weird character issues in public URLs
        const fileExt = selectedFile.name.split('.').pop();
        const rawBaseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.'));
        const cleanBaseName = rawBaseName.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${Date.now()}_${cleanBaseName}.${fileExt}`;
        const filePath = `${activeTabName}/${fileName}`;

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
        tab_name: activeTabName,
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

      // We can have credit and debit in the same row or separated
      if (crCash > 0) {
        const parsed = parseDetails(crCashDetails, 'credit');
        list.push({
          dateStr,
          year,
          month,
          day,
          type: 'credit',
          method: 'cash',
          amount: crCash,
          category: parsed.category,
          notes: parsed.notes,
        });
      }
      if (crBank > 0) {
        const parsed = parseDetails(crBankDetails, 'credit');
        list.push({
          dateStr,
          year,
          month,
          day,
          type: 'credit',
          method: 'bank',
          amount: crBank,
          category: parsed.category,
          notes: parsed.notes,
        });
      }
      if (dbCash > 0) {
        const parsed = parseDetails(dbDetails, 'debit');
        list.push({
          dateStr,
          year,
          month,
          day,
          type: 'debit',
          method: 'cash',
          amount: dbCash,
          category: parsed.category,
          notes: parsed.notes,
        });
      }
      if (dbBank > 0) {
        const parsed = parseDetails(dbBDetails, 'debit');
        list.push({
          dateStr,
          year,
          month,
          day,
          type: 'debit',
          method: 'bank',
          amount: dbBank,
          category: parsed.category,
          notes: parsed.notes,
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
      case 'custom':
      default:
        return { start: customStartDate, end: customEndDate };
    }
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

  // Compute the live Accrual and Cash Flow P&L metrics from the ledger entries
  const pnlBreakdown = React.useMemo(() => {
    if (!sheetRows || sheetRows.length < 3) {
      return {
        accrual: {
          inStoreRev: 0,
          zomatoRev: 0,
          totalRev: 0,
          momoCost: 0,
          zomatoExp: 0,
          operatingExp: 0,
          investmentCapExp: 0,
          totalExp: 0,
          grossProfit: 0,
          operatingProfit: 0,
          margin: 0
        },
        cashFlow: {
          inStoreInflow: 0,
          zomatoInflow: 0,
          investmentInflow: 0,
          totalInflows: 0,
          momoOutflow: 0,
          zomatoOutflow: 0,
          operatingOutflow: 0,
          investmentOutflow: 0,
          totalOutflows: 0,
          netPosition: 0,
          openingBal: 0,
          closingBal: 0
        },
        investmentSpentList: [] as any[]
      };
    }

    const allTxs = parseAllTransactions();
    const { start, end } = getDashboardDateRange();

    // Map each transaction with its Accrual Date assignment based on Wednesday settlements
    const accrualTxs = allTxs.map(tx => {
      let accrualDateStr = tx.dateStr;
      const d = new Date(tx.dateStr);
      const isWednesday = d.getDay() === 3;
      
      if (isWednesday) {
        if (tx.type === 'credit' && tx.category === 'zomato payout') {
          // Accrue to previous Monday-to-Sunday, we tag to the Sunday (3 days prior)
          const prevSunday = new Date(d);
          prevSunday.setDate(d.getDate() - 3);
          accrualDateStr = prevSunday.toISOString().split('T')[0];
        } else if (tx.type === 'debit' && tx.category === 'zomato commission and ads') {
          // Accrue to previous Monday-to-Sunday, we tag to the Sunday (3 days prior)
          const prevSunday = new Date(d);
          prevSunday.setDate(d.getDate() - 3);
          accrualDateStr = prevSunday.toISOString().split('T')[0];
        } else if (tx.type === 'debit' && tx.category === 'momo') {
          // Accrue momo purchases to the previous Monday-to-Sunday, tag to Sunday
          const prevSunday = new Date(d);
          prevSunday.setDate(d.getDate() - 3);
          accrualDateStr = prevSunday.toISOString().split('T')[0];
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
    let accrualMomoCost = 0;
    let accrualZomatoExp = 0;
    let accrualOperatingExp = 0;
    let accrualInvestmentCapExp = 0;

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
        } else if (tx.category === 'momo') {
          accrualMomoCost += tx.amount;
        } else if (tx.category === 'zomato commission and ads') {
          accrualZomatoExp += tx.amount;
        } else if (tx.category === 'debt') {
          accrualInvestmentCapExp += tx.amount;
        } else {
          accrualOperatingExp += tx.amount;
        }
      }
    });

    const accrualTotalRev = accrualInStoreRev + accrualZomatoRev;
    const accrualTotalExp = accrualMomoCost + accrualZomatoExp + accrualOperatingExp;
    const accrualGrossProfit = accrualTotalRev - accrualMomoCost;
    const accrualOperatingProfit = accrualTotalRev - accrualTotalExp;
    const accrualMargin = accrualTotalRev > 0 ? (accrualOperatingProfit / accrualTotalRev) * 100 : 0;

    // 2. Cash Flow Calculations (filter by raw/standard date)
    const filteredCashFlowStr = accrualTxs.filter(tx => tx.dateStr >= start && tx.dateStr <= end);

    let cashInStoreInflow = 0;
    let cashZomatoInflow = 0;
    let cashInvestmentInflow = 0;
    let cashMomoOutflow = 0;
    let cashZomatoOutflow = 0;
    let cashOperatingOutflow = 0;
    let cashInvestmentOutflow = 0;

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
        if (tx.isInvestmentSpend) {
          cashInvestmentOutflow += tx.amount;
        } else if (tx.category === 'momo') {
          cashMomoOutflow += tx.amount;
        } else if (tx.category === 'zomato commission and ads') {
          cashZomatoOutflow += tx.amount;
        } else if (tx.category === 'debt') {
          cashInvestmentOutflow += tx.amount;
        } else {
          cashOperatingOutflow += tx.amount;
        }
      }
    });

    const cashTotalInflows = cashInStoreInflow + cashZomatoInflow + cashInvestmentInflow;
    const cashTotalOutflows = cashMomoOutflow + cashZomatoOutflow + cashOperatingOutflow + cashInvestmentOutflow;
    const cashNetPosition = cashTotalInflows - cashTotalOutflows;
    const cashOpeningBal = openingCash + openingBank;
    const cashClosingBal = cashOpeningBal + cashNetPosition;

    // 3. Investment Spends drill-down tracker (all time investment spends parsed)
    const investmentSpentList = accrualTxs.filter(tx => tx.isInvestmentSpend && tx.type === 'debit');

    return {
      accrual: {
        inStoreRev: accrualInStoreRev,
        zomatoRev: accrualZomatoRev,
        totalRev: accrualTotalRev,
        momoCost: accrualMomoCost,
        zomatoExp: accrualZomatoExp,
        operatingExp: accrualOperatingExp,
        investmentCapExp: accrualInvestmentCapExp,
        totalExp: accrualTotalExp,
        grossProfit: accrualGrossProfit,
        operatingProfit: accrualOperatingProfit,
        margin: accrualMargin
      },
      cashFlow: {
        inStoreInflow: cashInStoreInflow,
        zomatoInflow: cashZomatoInflow,
        investmentInflow: cashInvestmentInflow,
        totalInflows: cashTotalInflows,
        momoOutflow: cashMomoOutflow,
        zomatoOutflow: cashZomatoOutflow,
        operatingOutflow: cashOperatingOutflow,
        investmentOutflow: cashInvestmentOutflow,
        totalOutflows: cashTotalOutflows,
        netPosition: cashNetPosition,
        openingBal: cashOpeningBal,
        closingBal: cashClosingBal
      },
      investmentSpentList
    };
  }, [sheetRows, openingCash, openingBank, dashboardPeriod, customStartDate, customEndDate, activeTabName]);

  const getCategoryBreakdowns = (filteredTxs: any[]) => {
    const revMap: { [cat: string]: number } = {};
    const expMap: { [cat: string]: number } = {};

    filteredTxs.forEach(tx => {
      if (tx.type === 'credit') {
        revMap[tx.category] = (revMap[tx.category] || 0) + tx.amount;
      } else {
        expMap[tx.category] = (expMap[tx.category] || 0) + tx.amount;
      }
    });

    const totalRev = Object.values(revMap).reduce((a, b) => a + b, 0);
    const totalExp = Object.values(expMap).reduce((a, b) => a + b, 0);

    const revList = Object.keys(revMap).map(cat => ({
      name: cat.toUpperCase(),
      value: revMap[cat],
      percentage: totalRev > 0 ? (revMap[cat] / totalRev) * 100 : 0
    })).sort((a, b) => b.value - a.value);

    const expList = Object.keys(expMap).map(cat => ({
      name: cat.toUpperCase(),
      value: expMap[cat],
      percentage: totalExp > 0 ? (expMap[cat] / totalExp) * 100 : 0
    })).sort((a, b) => b.value - a.value);

    return {
      totalRev,
      totalExp,
      revList,
      expList
    };
  };

  const REVENUE_COLORS = ['#34d399', '#fbbf24', '#60a5fa', '#a78bfa'];
  const EXPENSE_COLORS = [
    '#f87171', '#fda4af', '#f472b6', '#a3e635', '#fde047', 
    '#22d3ee', '#fb923c', '#818cf8', '#2dd4bf', '#ec4899', 
    '#38bdf8', '#3b82f6', '#c084fc', '#4ade80', '#94a3b8'
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

            {/* Months Tabs row */}
            <div className="border border-brand-brown/10 bg-white rounded-3xl p-3 flex flex-wrap gap-2 shadow-sm">
              {MONTHS.map((m) => {
                const isSelected = selectedMonth === m;
                const matchesCurrentMonth = MONTHS[new Date().getMonth()] === m && currentYear === selectedYear;
                return (
                  <button
                    key={m}
                    onClick={() => {
                      setSelectedMonth(m);
                      setSheetRows([]);
                    }}
                    className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider duration-200 transition-all flex items-center gap-1.5 ${
                      isSelected 
                        ? 'bg-emerald-600 text-white shadow-md' 
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

            {/* View Toggle (Sheet vs P&L vs Analytics Dashboard) */}
            <div className="flex bg-white p-1 rounded-2xl border border-brand-brown/10 shadow-sm w-full sm:max-w-md">
              <button
                type="button"
                onClick={() => setActiveLedgerView('sheet')}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeLedgerView === 'sheet'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-brand-brown'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Entries
              </button>
              <button
                type="button"
                onClick={() => setActiveLedgerView('pnl')}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeLedgerView === 'pnl'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-brand-brown'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                P&L Statement
              </button>
              <button
                type="button"
                onClick={() => setActiveLedgerView('dashboard')}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeLedgerView === 'dashboard'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-zinc-700'
                }`}
              >
                <PieChartIcon className="w-3.5 h-3.5" />
                Analytics
              </button>
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
            {!isCurrentMonthLoaded ? (
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
                      <h4 className="text-xs font-black uppercase tracking-widest text-brand-brown/80">{activeTabName} Ledger Records</h4>
                      <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">Rows 1 to {sheetRows.length} shown below</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={exportToCSV}
                        disabled={sheetRows.length <= 1}
                        className="flex items-center gap-1.5 px-3 py-2 border border-brand-brown/15 bg-white hover:bg-brand-stone/30 rounded-lg text-brand-brown/85 text-[10px] font-black uppercase tracking-wider transition-colors disabled:opacity-40 select-none"
                        title="Export this month's ledger to CSV"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-600" />
                        Export CSV
                      </button>

                      <button 
                        onClick={loadSheetRows}
                        disabled={isSheetLoading}
                        className="p-2 border border-brand-brown/10 hover:bg-brand-stone/30 rounded-lg text-brand-brown/85 transition-colors disabled:opacity-40"
                      >
                        <RefreshCw className={`w-4 h-4 ${isSheetLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

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
                  {/* Period Filter Header */}
                  <div className="bg-white border border-brand-brown/10 p-6 rounded-3xl shadow-sm flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                    <div className="space-y-1 text-left">
                      <h3 className="text-sm font-black uppercase tracking-wider text-brand-brown flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        Live Accounting Statements
                      </h3>
                      <p className="text-[10px] text-zinc-400 font-semibold uppercase">
                        {dashboardPeriod === 'this_month' ? `Monthly ledger aggregate for ${activeTabName}` : `Custom date period active: ${getDashboardDateRange().start} to ${getDashboardDateRange().end}`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex flex-wrap gap-1 bg-brand-stone/40 p-1 rounded-2xl border border-brand-brown/5 text-xs font-bold leading-none">
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('today')}
                          className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer ${
                            dashboardPeriod === 'today' ? 'bg-white text-emerald-600 shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('this_week')}
                          className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer ${
                            dashboardPeriod === 'this_week' ? 'bg-white text-emerald-600 shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          This Week
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('this_month')}
                          className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer ${
                            dashboardPeriod === 'this_month' ? 'bg-white text-emerald-600 shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
                          }`}
                        >
                          This Month
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('custom')}
                          className={`py-1.5 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer ${
                            dashboardPeriod === 'custom' ? 'bg-white text-emerald-600 shadow-xs' : 'text-zinc-500 hover:text-brand-brown'
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
                    </div>
                  </div>

                  {/* Profit & Loss (Accrual) and Cash Flow Statements Comparison Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* ACCRUAL STATEMENT SECTION */}
                    <div className="bg-white border border-brand-brown/10 rounded-3xl p-6 shadow-sm space-y-6 text-left">
                      <div className="flex justify-between items-start border-b border-zinc-100 pb-4">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-brand-brown">Accrual Accounting P&L</h4>
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase mt-0.5">Matches revenue earned against expenses incurred (Wednesday cycles adjusted)</p>
                        </div>
                        <span className="py-1 px-2 bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase tracking-wider rounded-md">
                          Accrual Basis
                        </span>
                      </div>

                      <div className="space-y-4">
                        {/* Revenues Part */}
                        <div>
                          <h5 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Revenues (Earned)</h5>
                          <div className="space-y-2 border-b border-zinc-50 pb-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500 font-medium">In-Store Live Sales (Turnover)</span>
                              <span className="font-mono font-bold text-zinc-800">₹{pnlBreakdown.accrual.inStoreRev.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500 font-medium">Zomato Delivery Revenue (Accrued Wed cycle)</span>
                              <span className="font-mono font-bold text-zinc-800">₹{pnlBreakdown.accrual.zomatoRev.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold bg-zinc-50 p-2 rounded-lg mt-1">
                              <span className="text-brand-brown uppercase text-[9px] font-black">Gross Income Turnover (Accrued)</span>
                              <span className="font-mono text-emerald-600">₹{pnlBreakdown.accrual.totalRev.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </div>

                        {/* Cost of Goods Sold & Expenses Part */}
                        <div>
                          <h5 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">COGS & Operating Overheads</h5>
                          <div className="space-y-2 border-b border-zinc-50 pb-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500 font-medium">Momo Vendor Ingredient COGS (Accrued)</span>
                              <span className="font-mono font-bold text-zinc-800">₹{pnlBreakdown.accrual.momoCost.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500 font-medium">Zomato Commission & Ads (Accrued)</span>
                              <span className="font-mono font-bold text-zinc-800">₹{pnlBreakdown.accrual.zomatoExp.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500 font-medium">Operating Expenses (Wage, Rent, Gas, Cash spends)</span>
                              <span className="font-mono font-bold text-zinc-800">₹{pnlBreakdown.accrual.operatingExp.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold bg-zinc-50 p-2 rounded-lg mt-1">
                              <span className="text-brand-brown uppercase text-[9px] font-black">Operating Charges Subtotal</span>
                              <span className="font-mono text-rose-600">₹{pnlBreakdown.accrual.totalExp.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </div>

                        {/* Operational Margins / Capital Exp note */}
                        <div className="p-4 bg-brand-stone/20 rounded-2xl space-y-3.5">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-500 font-black uppercase text-[10px]">Accrual Net Operating Profit</span>
                            <span className={`font-mono font-black text-sm ${pnlBreakdown.accrual.operatingProfit >= 0 ? 'text-emerald-600' : 'text-brand-red'}`}>
                              ₹{pnlBreakdown.accrual.operatingProfit.toLocaleString('en-IN')}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center text-[10px] border-t border-brand-brown/5 pt-2">
                            <span className="text-zinc-400 font-bold uppercase">Operating Ratio Margin</span>
                            <span className={`font-mono font-black ${pnlBreakdown.accrual.margin >= 0 ? 'text-emerald-600' : 'text-brand-red'}`}>
                              {pnlBreakdown.accrual.margin.toFixed(2)}%
                            </span>
                          </div>

                          <div className="text-[9px] text-zinc-400 leading-relaxed font-semibold">
                            Note: Accrual P&L excludes capital expenditures funded from the investment pool to accurately measure your store's standalone operational unit economics.
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* CASH FLOW STATEMENT SECTION */}
                    <div className="bg-white border border-brand-brown/10 rounded-3xl p-6 shadow-sm space-y-6 text-left">
                      <div className="flex justify-between items-start border-b border-zinc-100 pb-4">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-brand-brown">Cash Flow Accounting</h4>
                          <p className="text-[10px] text-zinc-400 font-semibold uppercase mt-0.5 font-sans">Tracks physical liquid movements when money enters or leaves the registry</p>
                        </div>
                        <span className="py-1 px-2 bg-blue-50 text-blue-700 text-[8px] font-black uppercase tracking-wider rounded-md">
                          Cash Basis
                        </span>
                      </div>

                      <div className="space-y-4">
                        {/* Cash Inflows */}
                        <div>
                          <h5 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Cash Inflows (Collections)</h5>
                          <div className="space-y-2 border-b border-zinc-50 pb-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500 font-medium">In-Store Live Sales Received</span>
                              <span className="font-mono font-bold text-zinc-800">₹{pnlBreakdown.cashFlow.inStoreInflow.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500 font-medium">Zomato Payout Deposits (Cleared Wednesdays)</span>
                              <span className="font-mono font-bold text-zinc-800">₹{pnlBreakdown.cashFlow.zomatoInflow.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500 font-medium">Investment & Debt Funding Infusions</span>
                              <span className="font-mono font-bold text-zinc-800">₹{pnlBreakdown.cashFlow.investmentInflow.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold bg-zinc-50 p-2 rounded-lg mt-1">
                              <span className="text-brand-brown uppercase text-[9px] font-black">Total Receipts</span>
                              <span className="font-mono text-emerald-600">₹{pnlBreakdown.cashFlow.totalInflows.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </div>

                        {/* Cash Outflows */}
                        <div>
                          <h5 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Cash Outflows (Disbursements)</h5>
                          <div className="space-y-2 border-b border-zinc-50 pb-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500 font-medium">Momo Wednesday Settlements</span>
                              <span className="font-mono font-bold text-zinc-800">₹{pnlBreakdown.cashFlow.momoOutflow.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500 font-medium">Zomato Commission & Ads Paid</span>
                              <span className="font-mono font-bold text-zinc-800">₹{pnlBreakdown.cashFlow.zomatoOutflow.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-zinc-500 font-medium">Standard Operating Expenses</span>
                              <span className="font-mono font-bold text-zinc-800">₹{pnlBreakdown.cashFlow.operatingOutflow.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs text-rose-600 font-bold">
                              <span className="font-medium text-zinc-500">Capital Expenses & Debt Repayments</span>
                              <span className="font-mono">₹{pnlBreakdown.cashFlow.investmentOutflow.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold bg-zinc-50 p-2 rounded-lg mt-1">
                              <span className="text-brand-brown uppercase text-[9px] font-black">Total Liquid Outflow</span>
                              <span className="font-mono text-rose-600">₹{pnlBreakdown.cashFlow.totalOutflows.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </div>

                        {/* Liquid Liquidity Balance Status */}
                        <div className="p-4 bg-brand-stone/20 rounded-2xl space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-500 font-black uppercase text-[10px]">Net Cash Change Position</span>
                            <span className={`font-mono font-black ${pnlBreakdown.cashFlow.netPosition >= 0 ? 'text-emerald-600' : 'text-brand-red'}`}>
                              {pnlBreakdown.cashFlow.netPosition >= 0 ? '+' : ''}₹{pnlBreakdown.cashFlow.netPosition.toLocaleString('en-IN')}
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-xs border-t border-brand-brown/5 pt-1.5">
                            <span className="text-zinc-400 font-semibold uppercase text-[9px]">Opening Liquidity (In Hand + Bank)</span>
                            <span className="font-mono font-bold text-zinc-700">
                              ₹{pnlBreakdown.cashFlow.openingBal.toLocaleString('en-IN')}
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-xs font-bold border-t border-brand-brown/10 pt-1.5">
                            <span className="text-brand-brown font-black uppercase text-[10px]">Ending Liquid Cash Balance</span>
                            <span className="font-mono font-black text-sm text-emerald-600">
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
                              <Briefcase className="w-4 h-4 text-emerald-600" />
                              Capital Investment Pool Tracker
                            </h4>
                            <p className="text-[10px] text-zinc-400 font-semibold uppercase mt-0.5">
                              Audit trail separating seed fund usage from daily operating revenue
                            </p>
                          </div>
                          <span className="py-1 px-2.5 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider rounded-lg">
                            Remaining Invested Cash: ₹{remainingInvestment.toLocaleString('en-IN')}
                          </span>
                        </div>

                        {/* Top KPI row of investment */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                          <div className="p-4 bg-brand-stone/20 rounded-2xl">
                            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Total Seed Capital Raised</p>
                            <h5 className="font-mono font-black text-zinc-800 text-lg mt-1">₹{investmentInflowAllTime.toLocaleString('en-IN')}</h5>
                          </div>
                          <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl">
                            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Total Capital Spent</p>
                            <h5 className="font-mono font-black text-rose-600 text-lg mt-1">₹{investmentOutflowAllTime.toLocaleString('en-IN')}</h5>
                          </div>
                          <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                            <p className="text-[9px] font-bold text-emerald-600/70 uppercase tracking-widest">Immediate Available Reserves</p>
                            <h5 className="font-mono font-black text-emerald-600 text-lg mt-1">₹{remainingInvestment.toLocaleString('en-IN')}</h5>
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
                            <div className="overflow-x-auto rounded-2xl border border-brand-brown/10">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-brand-stone/50 border-b border-brand-brown/10 text-[9px] font-black uppercase tracking-wider text-brand-brown">
                                    <th className="py-2.5 px-4 animate-none select-none">Date</th>
                                    <th className="py-2.5 px-4 animate-none select-none">Category</th>
                                    <th className="py-2.5 px-4 animate-none select-none">Details notes</th>
                                    <th className="py-2.5 px-4 text-right animate-none select-none">Amount Out (₹)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 text-xs text-zinc-700">
                                  {spentList.map((tx, idx) => (
                                    <tr key={`${tx.dateStr}-${idx}`} className="hover:bg-zinc-50">
                                      <td className="py-3 px-4 font-mono font-bold text-zinc-500">{tx.dateStr}</td>
                                      <td className="py-3 px-4 uppercase font-black text-[10px] text-zinc-400 tracking-wider font-sans">{tx.category}</td>
                                      <td className="py-3 px-4 font-semibold text-zinc-600">{tx.notes || tx.category}</td>
                                      <td className="py-3 px-4 text-right font-mono font-black text-rose-600">₹{tx.amount.toLocaleString('en-IN')}</td>
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
                          <div className="lg:col-span-2 bg-white border border-brand-brown/10 p-6 rounded-3xl shadow-sm flex flex-col h-[420px]">
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
                          <div className="bg-white border border-brand-brown/10 p-6 rounded-3xl shadow-sm flex flex-col h-[420px]">
                            <div className="flex justify-between items-center mb-4 text-left">
                              <div>
                                <h4 className="text-xs font-black uppercase tracking-widest text-brand-brown">Category Distribution</h4>
                                <p className="text-[9px] text-zinc-400 font-bold uppercase mt-0.5">Percentage weight analysis</p>
                              </div>
                            </div>

                            {/* Focus type selector toggle inside Pie widget */}
                            <div className="grid grid-cols-2 bg-brand-stone/40 p-1 rounded-xl border border-brand-brown/5 text-xs font-bold mb-4">
                              <button
                                type="button"
                                onClick={() => setPieFocusType('expense')}
                                className={`py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                  pieFocusType === 'expense' ? 'bg-white text-rose-500 shadow-sm' : 'text-zinc-400 hover:text-brand-brown'
                                }`}
                              >
                                Expense
                              </button>
                              <button
                                type="button"
                                onClick={() => setPieFocusType('revenue')}
                                className={`py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                  pieFocusType === 'revenue' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-400 hover:text-brand-brown'
                                }`}
                              >
                                Revenue
                              </button>
                            </div>

                            {/* The Pie Chart element */}
                            {(() => {
                              const activeList = pieFocusType === 'expense' ? expList : revList;
                              const colorsList = pieFocusType === 'expense' ? EXPENSE_COLORS : REVENUE_COLORS;

                              if (activeList.length === 0) {
                                return (
                                  <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-zinc-400 gap-2">
                                    <PieChartIcon className="w-10 h-10 text-zinc-200" />
                                    <p className="text-[10px] font-bold uppercase tracking-wider">No {pieFocusType} recorded</p>
                                  </div>
                                );
                              }

                              return (
                                <div className="flex-1 flex flex-col justify-between overflow-hidden">
                                  {/* Draw Pie Chart */}
                                  <div className="h-[150px] w-full text-xs font-bold">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <PieChart>
                                        <Pie
                                          data={activeList}
                                          cx="50%"
                                          cy="50%"
                                          innerRadius={45}
                                          outerRadius={65}
                                          paddingAngle={3}
                                          dataKey="value"
                                        >
                                          {activeList.map((_entry, index) => (
                                            <Cell key={`cell-${index}`} fill={colorsList[index % colorsList.length]} />
                                          ))}
                                        </Pie>
                                        <Tooltip formatter={(value: any) => `₹${value.toLocaleString('en-IN')}`} />
                                      </PieChart>
                                    </ResponsiveContainer>
                                  </div>

                                  {/* Distribution list and mini percentage bars */}
                                  <div className="flex-1 overflow-y-auto pr-1 space-y-2 no-scrollbar scroll-smooth">
                                    {activeList.slice(0, 5).map((entry, index) => {
                                      const color = colorsList[index % colorsList.length];
                                      return (
                                        <div key={entry.name} className="space-y-1">
                                          <div className="flex justify-between items-center text-[9px] font-bold uppercase">
                                            <span className="flex items-center gap-1.5 truncate max-w-[130px]" title={entry.name}>
                                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></span>
                                              <span className="truncate text-zinc-600 font-extrabold">{entry.name}</span>
                                            </span>
                                            <span className="font-mono text-zinc-500">
                                              ₹{entry.value.toLocaleString('en-IN')} <span className="text-zinc-400 font-semibold font-sans">({entry.percentage.toFixed(1)}%)</span>
                                            </span>
                                          </div>
                                          <div className="w-full bg-zinc-100 h-1 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full duration-500 ease-out" style={{ width: `${entry.percentage}%`, backgroundColor: color }}></div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {activeList.length > 5 && (
                                      <p className="text-[9px] text-zinc-400 font-semibold italic text-center mt-1">
                                        + {activeList.length - 5} additional categories listed above
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
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

      {/* Manage Categories Modal */}
      {isManageCategoriesOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[140] p-4 animate-in fade-in duration-200">
          <div className="bg-brand-cream border border-brand-brown/15 rounded-[2.5rem] shadow-2xl w-full max-w-2xl text-brand-brown flex flex-col overflow-hidden max-h-[90vh] animate-in zoom-in-95 duration-150 border-8 border-brand-yellow">
            {/* Header */}
            <div className="p-6 border-b border-brand-brown/10 flex justify-between items-center bg-white">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2 italic">
                  <span>📁</span>
                  Manage Ledger Categories & Mappings
                </h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">
                  Add, edit, or map financial ledger categories directly to stock subcategories.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsManageCategoriesOpen(false);
                  setNewLedgerCatName('');
                  setNewLedgerCatMappings([]);
                }}
                className="text-xs font-black text-brand-brown hover:text-brand-brown/70 bg-brand-yellow rounded-xl p-2 px-3.5 transition-all uppercase tracking-wider shadow-sm"
              >
                Close
              </button>
            </div>

            {/* Content Container (Scrollable) */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-brand-cream/30">
              
              {/* Form to Create/Upsert Category */}
              <div className="bg-white p-5 rounded-2xl border border-brand-brown/10 space-y-4 shadow-sm">
                <h4 className="text-xs font-black uppercase tracking-widest text-brand-brown/60 pb-2 border-b border-brand-brown/10">Add / Edit Category Map</h4>
                
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
                    Link this category to one or more warehouse stock subcategories to bridge purchases with dynamic stock levels.
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
                    className="bg-brand-brown hover:bg-brand-brown/90 text-brand-yellow text-xs font-black uppercase tracking-widest px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2"
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
                    Debit Expense Categories
                  </h4>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-3">
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
                    Credit Revenue Categories
                  </h4>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-3">
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
