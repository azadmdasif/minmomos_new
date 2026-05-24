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
  TrendingDown
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
import { 
  googleSignIn, 
  googleLogout, 
  initGoogleAuth
} from '../utils/googleAuth';
import { User as FirebaseUser } from 'firebase/auth';
import ConfirmationModal from './ConfirmationModal';

interface TabInfo {
  title: string;
  id: number;
}

interface FinanceLedgerProps {
  user: {
    id: string;
    username: string;
    role: 'ADMIN' | 'STORE_MANAGER' | 'CASHIER';
    stationName?: string;
  };
}

const DEBIT_CATEGORIES = [
  'gas', 'rent', 'salary', 'vegetables', 'momo', 'store investment', 
  'packaging', 'oil', 'butter', 'ketchup', 'mayonnaise', 'water', 
  'campa cola', 'syrups', 'others'
];

const CREDIT_CATEGORIES = [
  'revenue', 'zomato payout', 'investment', 'previous balance'
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
  // Auth state
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Sheets configuration state
  const [spreadsheetId, setSpreadsheetId] = useState<string>(
    localStorage.getItem('MOMOMAYA_LEDGER_SPREADSHEET_ID') || ''
  );
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string>('');
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string>('');
  const [isConnectingSheet, setIsConnectingSheet] = useState(false);
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

  // Dashboard & Analytics states
  const [activeLedgerView, setActiveLedgerView] = useState<'sheet' | 'dashboard'>('sheet');
  const [dashboardPeriod, setDashboardPeriod] = useState<'month' | 'week' | 'custom'>('month');
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
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

  // Custom Confirmation Dialog States
  const [deletingTxIdx, setDeletingTxIdx] = useState<number | null>(null);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState<boolean>(false);

  // Balance edits
  const [isEditingOpening, setIsEditingOpening] = useState(false);
  const [editOpeningCash, setEditOpeningCash] = useState<number>(0);
  const [editOpeningBank, setEditOpeningBank] = useState<number>(0);
  const [isSavingOpening, setIsSavingOpening] = useState(false);

  // Calculations from sheet
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [openingBank, setOpeningBank] = useState<number>(0);
  const [totalCreditCash, setTotalCreditCash] = useState<number>(0);
  const [totalCreditBank, setTotalCreditBank] = useState<number>(0);
  const [totalDebitCash, setTotalDebitCash] = useState<number>(0);
  const [totalDebitBank, setTotalDebitBank] = useState<number>(0);

  // Subscribe to Google Authentication state
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
        setNeedsAuth(false);
      },
      () => {
        setGoogleUser(null);
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync spreadsheet URL input if spreadsheetId changed
  useEffect(() => {
    if (spreadsheetId) {
      setSpreadsheetUrl(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
    } else {
      setSpreadsheetUrl('');
    }
  }, [spreadsheetId]);

  // Effect to load Spreadsheet metadata and rows when Google auth is active and we have a sheet ID
  useEffect(() => {
    if (accessToken && spreadsheetId) {
      loadSpreadsheetMeta();
    }
  }, [accessToken, spreadsheetId]);

  // Effect to load active tab whenever we switch months/years
  useEffect(() => {
    if (accessToken && spreadsheetId && availableTabs.length > 0) {
      loadSheetRows();
    }
  }, [selectedMonth, selectedYear, availableTabs, accessToken, spreadsheetId]);

  // Re-sync categories when active transaction type changes
  useEffect(() => {
    if (txType === 'credit') {
      setTxCategory(CREDIT_CATEGORIES[0]);
    } else {
      setTxCategory(DEBIT_CATEGORIES[0]);
    }
  }, [txType]);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
      }
    } catch (err) {
      console.error('Failed Google Sheets sign in:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await googleLogout();
      setGoogleUser(null);
      setAccessToken(null);
      setNeedsAuth(true);
    } catch (err) {
      console.error('Failed logout:', err);
    }
  };

  // Create a brand new ledger spreadsheet
  const handleCreateNewSpreadsheet = async () => {
    if (!accessToken) return;
    setIsConnectingSheet(true);
    try {
      const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          properties: {
            title: `Momomaya POS Financial Ledger - ${currentYear}`
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create new spreadsheet');
      }

      const data = await response.json();
      const newId = data.spreadsheetId;
      setSpreadsheetId(newId);
      localStorage.setItem('MOMOMAYA_LEDGER_SPREADSHEET_ID', newId);
      
      // Load spreadsheet metadata, which initializes tabs
      await loadSpreadsheetMeta(newId);
    } catch (err: any) {
      alert(`Error creating spreadsheet: ${err.message}`);
    } finally {
      setIsConnectingSheet(false);
    }
  };

  // Link existing spreadsheet ID or URL
  const handleLinkSpreadsheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spreadsheetUrl.trim() || !accessToken) return;

    setIsConnectingSheet(true);
    try {
      let extractedId = spreadsheetUrl.trim();
      // Try to parse URL if user pasted a full Link
      if (spreadsheetUrl.includes('/d/')) {
        const parts = spreadsheetUrl.split('/d/');
        if (parts[1]) {
          extractedId = parts[1].split('/')[0];
        }
      }

      // Verify the sheet is accessible
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${extractedId}?fields=properties`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        throw new Error('Spreadsheet ID is invalid or cannot be accessed by this account.');
      }

      setSpreadsheetId(extractedId);
      localStorage.setItem('MOMOMAYA_LEDGER_SPREADSHEET_ID', extractedId);
      await loadSpreadsheetMeta(extractedId);
    } catch (err: any) {
      alert(`Linking error: ${err.message}`);
    } finally {
      setIsConnectingSheet(false);
    }
  };

  // Reset or unlink spreadsheet
  const handleUnlinkSpreadsheet = () => {
    setShowUnlinkConfirm(true);
  };

  const triggerUnlinkSpreadsheet = () => {
    setSpreadsheetId('');
    setSpreadsheetTitle('');
    setAvailableTabs([]);
    setSheetRows([]);
    localStorage.removeItem('MOMOMAYA_LEDGER_SPREADSHEET_ID');
    setShowUnlinkConfirm(false);
  };

  // Get metadata including sheet tabs
  const loadSpreadsheetMeta = async (idToUse = spreadsheetId) => {
    if (!accessToken || !idToUse) return;

    try {
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${idToUse}?fields=properties,sheets.properties`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        throw new Error('Failed to load spreadsheet details');
      }

      const data = await response.json();
      setSpreadsheetTitle(data.properties.title);
      
      const tabs = (data.sheets || []).map((s: any) => ({
        title: s.properties.title,
        id: s.properties.sheetId
      }));
      setAvailableTabs(tabs);
    } catch (err) {
      console.error('Error fetching meta:', err);
    }
  };

  // Load rows of activeTabName
  const loadSheetRows = async () => {
    if (!accessToken || !spreadsheetId) return;

    setIsSheetLoading(true);
    setSheetError(null);
    try {
      // Decode active Tab Name
      const encodedRange = encodeURIComponent(`'${activeTabName}'!A1:L500`);
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (response.status === 404) {
        // Tab does not exist yet
        setSheetRows([]);
        // This is fine, we will display an "Initialization Required" UI
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to retrieve worksheet rows');
      }

      const data = await response.json();
      const rows = data.values || [];
      setSheetRows(rows);
      
      // Calculate balances and summaries dynamically from the loaded rows
      calculateSummaries(rows);
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
    if (!accessToken || !spreadsheetId) return;

    setIsSheetLoading(true);
    try {
      // 1. Send command to create the sheets tab
      const addSheetResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: activeTabName
                }
              }
            }
          ]
        })
      });

      if (!addSheetResponse.ok) {
        throw new Error('Failed to create sheet tab for this month');
      }

      // 2. Put headers and initial opening balances into it
      const range = `'${activeTabName}'!A1:L2`;
      const values = [
        HEADERS,
        [
          new Date().toISOString().split('T')[0], // Date
          "",               // Credit cash
          "Opening Balance", // details
          "",               // credit bank
          "Opening Balance", // details
          "",               // debit cash
          "Opening Balance", // details
          "",               // debit bank
          "Opening Balance", // details
          0,                // Total rem cash 
          0,                // Total bank 
          "=J2+K2"          // Total All (Formula adding opening balances)
        ]
      ];

      const writeDataResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ values })
      });

      if (!writeDataResponse.ok) {
        throw new Error('Failed to write default headers and starter balances');
      }

      // 3. Refresh available tabs and reload sheet rows
      await loadSpreadsheetMeta();
    } catch (err: any) {
      alert(`Initialization failed: ${err.message}`);
    } finally {
      setIsSheetLoading(false);
    }
  };

  // Save changes to Opening Balances
  const handleSaveOpeningBalances = async () => {
    if (!accessToken || !spreadsheetId) return;
    setIsSavingOpening(true);

    try {
      const range = `'${activeTabName}'!J2:K2`;
      const values = [[editOpeningCash, editOpeningBank]];

      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ values })
      });

      if (!response.ok) {
        throw new Error('Failed to save opening balances');
      }

      setIsEditingOpening(false);
      await loadSheetRows();
    } catch (err: any) {
      alert(`Save opening balances failed: ${err.message}`);
    } finally {
      setIsSavingOpening(false);
    }
  };

  const uploadFileToDrive = async (file: File): Promise<string | null> => {
    if (!accessToken) return null;
    setIsUploadingFile(true);
    try {
      const metadata = {
        name: `Momomaya_Receipt_${Date.now()}_${file.name}`,
        mimeType: file.type
      };

      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', file);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: formData
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Drive upload failed: ${errText}`);
      }

      const data = await response.json();
      const fileId = data.id;

      // Try sharing standard view permissions so others can click & view the file
      try {
        await fetch(`https://www.googleapis.com/v3/files/${fileId}/permissions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
          })
        });
      } catch (permErr) {
        console.warn('Could not set file permissions publicly:', permErr);
      }

      return `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;
    } catch (err: any) {
      alert(`Google Drive receipt upload failed: ${err.message}`);
      throw err;
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleDeleteTransaction = (idxInSlice: number) => {
    setDeletingTxIdx(idxInSlice);
  };

  const triggerDeleteTransaction = async (idxInSlice: number) => {
    if (!accessToken || !spreadsheetId || activeTabId === undefined) return;

    setIsSheetLoading(true);
    try {
      // The row inside slice(1) map corresponds to indices idxInSlice. 
      // Opening balance is at slice element idxInSlice === 0 (Row 2 in Sheet, index 1 in full array)
      // Transactions start at idxInSlice >= 1.
      // So Spreadsheet Row start Index is: idxInSlice + 1
      const sheetRowIndex = idxInSlice + 1;

      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: activeTabId,
                  dimension: "ROWS",
                  startIndex: sheetRowIndex,
                  endIndex: sheetRowIndex + 1
                }
              }
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error('Failed to delete row from Google Sheets');
      }

      await loadSheetRows();
    } catch (err: any) {
      alert(`Deletion failed: ${err.message}`);
    } finally {
      setIsSheetLoading(false);
      setDeletingTxIdx(null);
    }
  };

  // Append a transaction row
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !spreadsheetId || txAmount <= 0) return;

    setIsAddingTx(true);
    try {
      let billLink = '';
      if (selectedFile) {
        const url = await uploadFileToDrive(selectedFile);
        if (url) {
          billLink = url;
        }
      }

      // Determine the next row number to construct spreadsheet formulas
      // Header is Row 1, Opening Balance is Row 2, first TX is Row 3
      // Total rows in sheetRows gives current row size + 1 is the brand new row index
      const newRowNumber = sheetRows.length + 1;

      // Construct columns array in exact HEADERS sequence:
      // Date, Credit cash, details, credit bank, details, debit cash, details, debit bank, details, Total rem cash, Total bank, Total All
      const formattedDate = txDate;
      const detailsPart = txNotes ? `${txCategory}: ${txNotes}` : txCategory;
      const combinedDetails = `${detailsPart}${billLink ? ` • Receipt: ${billLink}` : ''}`;

      // Set up blank array values
      let creditCashVal = "";
      let creditCashDetails = "";
      let creditBankVal = "";
      let creditBankDetails = "";
      let debitCashVal = "";
      let debitCashDetails = "";
      let debitBankVal = "";
      let debitBankDetails = "";

      if (txType === 'credit') {
        if (txMethod === 'cash') {
          creditCashVal = txAmount.toString();
          creditCashDetails = combinedDetails;
        } else {
          creditBankVal = txAmount.toString();
          creditBankDetails = combinedDetails;
        }
      } else {
        if (txMethod === 'cash') {
          debitCashVal = txAmount.toString();
          debitCashDetails = combinedDetails;
        } else {
          debitBankVal = txAmount.toString();
          debitBankDetails = combinedDetails;
        }
      }

      // Formulas for totals
      // Row N J-Col Formula: =J{N-1} + B{N} - F{N} (Cash ledger calculation)
      // Row N K-Col Formula: =K{N-1} + D{N} - H{N} (Bank ledger calculation)
      // Row N L-Col Formula: =J{N} + K{N}       (Total ledger calculation)
      const prevRow = newRowNumber - 1;
      const totalCashFormula = `=J${prevRow}+IF(ISNUMBER(B${newRowNumber}),B${newRowNumber},0)-IF(ISNUMBER(F${newRowNumber}),F${newRowNumber},0)`;
      const totalBankFormula = `=K${prevRow}+IF(ISNUMBER(D${newRowNumber}),D${newRowNumber},0)-IF(ISNUMBER(H${newRowNumber}),H${newRowNumber},0)`;
      const totalAllFormula = `=J${newRowNumber}+K${newRowNumber}`;

      const rowValues = [
        formattedDate,
        creditCashVal,
        creditCashDetails,
        creditBankVal,
        creditBankDetails,
        debitCashVal,
        debitCashDetails,
        debitBankVal,
        debitBankDetails,
        totalCashFormula,
        totalBankFormula,
        totalAllFormula
      ];

      const range = `'${activeTabName}'!A:L`;
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          values: [rowValues]
        })
      });

      if (!response.ok) {
        throw new Error('Failed to append row of transaction to sheet');
      }

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
    }
  };

  const isCurrentMonthLoaded = availableTabs.some(t => t.title === activeTabName);
  const activeTabId = availableTabs.find(t => t.title === activeTabName)?.id;

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
      const validCategories = type === 'credit' ? CREDIT_CATEGORIES : DEBIT_CATEGORIES;
      if (validCategories.includes(cat)) {
        const rest = detailsTxt.substring(idx + 1).trim();
        return { category: cat, notes: rest };
      }
    }
    // Search words fallback
    const lowerTxt = detailsTxt.toLowerCase();
    const validCategories = type === 'credit' ? CREDIT_CATEGORIES : DEBIT_CATEGORIES;
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

  const getFilteredTransactions = (allTxs: any[]) => {
    if (dashboardPeriod === 'month') {
      return allTxs;
    }
    if (dashboardPeriod === 'week') {
      return allTxs.filter(tx => {
        const day = tx.day;
        if (selectedWeek === 1) return day >= 1 && day <= 7;
        if (selectedWeek === 2) return day >= 8 && day <= 14;
        if (selectedWeek === 3) return day >= 15 && day <= 21;
        if (selectedWeek === 4) return day >= 22 && day <= 28;
        return day >= 29;
      });
    }
    if (dashboardPeriod === 'custom') {
      const start = customStartDate;
      const end = customEndDate;
      return allTxs.filter(tx => {
        return tx.dateStr >= start && tx.dateStr <= end;
      });
    }
    return allTxs;
  };

  const getDashboardTrendData = (filteredTxs: any[]) => {
    let datesToGenerate: string[] = [];
    const monthIndex = MONTHS.indexOf(selectedMonth);

    const padZero = (n: number) => String(n).padStart(2, '0');

    if (dashboardPeriod === 'month') {
      const lastDay = new Date(selectedYear, monthIndex + 1, 0).getDate();
      for (let d = 1; d <= lastDay; d++) {
        datesToGenerate.push(`${selectedYear}-${padZero(monthIndex + 1)}-${padZero(d)}`);
      }
    } else if (dashboardPeriod === 'week') {
      const lastDay = new Date(selectedYear, monthIndex + 1, 0).getDate();
      let startDay = 1;
      let endDay = 7;
      if (selectedWeek === 1) { startDay = 1; endDay = 7; }
      else if (selectedWeek === 2) { startDay = 8; endDay = 14; }
      else if (selectedWeek === 3) { startDay = 15; endDay = 21; }
      else if (selectedWeek === 4) { startDay = 22; endDay = 28; }
      else { startDay = 29; endDay = lastDay; }

      for (let d = startDay; d <= endDay; d++) {
        datesToGenerate.push(`${selectedYear}-${padZero(monthIndex + 1)}-${padZero(d)}`);
      }
    } else {
      datesToGenerate = getDatesInRange(customStartDate, customEndDate);
    }

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
            <FileSpreadsheet className="w-7 h-7 text-emerald-600" />
            Financial Ledger Book
          </h1>
          <p className="text-xs text-brand-brown/60 font-semibold mt-1">
            Google Sheets-backed ledger syncing in real-time • Active User: <b>{user.username} ({user.role})</b>
          </p>
        </div>

        {/* Google status element */}
        <div className="flex items-center gap-3 self-stretch md:self-auto">
          {needsAuth ? (
            <button 
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-md transition-all duration-300 disabled:opacity-50"
            >
              {isLoggingIn ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              Connect Google Sheets
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end text-right">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Connected
                </span>
                <span className="text-[10px] text-zinc-400 truncate max-w-[200px] leading-tight mt-0.5">
                  {googleUser?.email}
                </span>
              </div>
              <button 
                onClick={handleGoogleLogout}
                className="p-2 rounded-lg border border-brand-brown/10 hover:bg-brand-red/10 hover:text-brand-red text-[10px] font-bold uppercase transition-all duration-200"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main scrolling content view */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 no-scrollbar">
        {/* Connection Setup Card when not Auth'd or Spreadsheet not linked */}
        {(needsAuth || !spreadsheetId) && (
          <div className="max-w-4xl mx-auto bg-white rounded-3xl border border-brand-brown/10 p-8 shadow-xl text-center space-y-8 animate-in fade-in duration-300">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto text-emerald-600 mb-4">
              <FileSpreadsheet className="w-8 h-8" />
            </div>

            <div className="space-y-2 max-w-lg mx-auto">
              <h2 className="text-xl font-black uppercase tracking-tight">Set Up Spreadsheet Ledger Book</h2>
              <p className="text-sm text-brand-brown/75 leading-relaxed">
                Connect your workspace to record Cash and Bank transactions. Opening/closing balances and monthly logs are automatically synchronized with Google Sheets.
              </p>
            </div>

            {needsAuth ? (
              <div className="pt-4 max-w-sm mx-auto">
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-wider text-xs shadow-lg flex items-center justify-center gap-3 transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                >
                  {isLoggingIn ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-5 h-5" />
                  )}
                  Authorize Google Drive & Sheets Access
                </button>
                <p className="text-[10px] text-zinc-400 mt-3 italic">
                  With permission, the application will read and write to your Google Sheets
                </p>
              </div>
            ) : (
              <div className="pt-4 max-w-2xl mx-auto border-t border-brand-brown/15 p-6 space-y-6">
                <h3 className="text-xs font-black uppercase text-brand-brown/50 tracking-widest">Connect Spreadsheet</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Create New Column */}
                  <div className="bg-brand-stone/30 p-6 rounded-2xl flex flex-col justify-between text-left space-y-4 border border-brand-brown/5">
                    <div>
                      <h4 className="font-bold text-sm uppercase">Create New Ledger Sheet</h4>
                      <p className="text-xs text-brand-brown/70 mt-1 leading-relaxed">
                        Create a pre-configured Google Spreadsheet in your Google Drive with matching columns for Date, Cash, Bank, Credits and Debits.
                      </p>
                    </div>
                    <button
                      onClick={handleCreateNewSpreadsheet}
                      disabled={isConnectingSheet}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest shadow-md flex items-center justify-center gap-2 transition-all"
                    >
                      {isConnectingSheet ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Create Spreadsheet
                    </button>
                  </div>

                  {/* Link Existing Column */}
                  <div className="bg-brand-stone/30 p-6 rounded-2xl flex flex-col justify-between text-left space-y-4 border border-brand-brown/5">
                    <div>
                      <h4 className="font-bold text-sm uppercase">Link Existing Spreadsheet</h4>
                      <p className="text-xs text-brand-brown/70 mt-1 leading-relaxed">
                        Pasted a Google Spreadsheet details link or spreadsheet ID below to synchronize data with it.
                      </p>
                    </div>
                    <form onSubmit={handleLinkSpreadsheet} className="space-y-3">
                      <input 
                        type="text" 
                        value={spreadsheetUrl}
                        onChange={e => setSpreadsheetUrl(e.target.value)}
                        placeholder="Paste Spreadsheet ID or URL"
                        className="w-full p-2.5 bg-white border border-brand-brown/15 rounded-xl text-xs font-mono outline-none focus:border-emerald-500"
                        required
                      />
                      <button
                        type="submit"
                        disabled={isConnectingSheet || !spreadsheetUrl.trim()}
                        className="w-full py-2.5 rounded-xl bg-brand-brown hover:bg-opacity-90 text-white text-[10px] font-black uppercase tracking-widest shadow-md flex items-center justify-center gap-2 transition-all"
                      >
                        {isConnectingSheet ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                        Link Spreadsheet
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Primary application view when authenticated and spreadsheet linked */}
        {!needsAuth && spreadsheetId && (
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Spreadsheet Sync Banner Card */}
            <div className="bg-emerald-50/70 border border-emerald-500/10 rounded-3xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-600">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase text-brand-brown/50 tracking-wide">Active Google Spreadsheet</h3>
                  <p className="text-sm font-black text-brand-brown">{spreadsheetTitle || 'Financial Ledger'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <a 
                  href={spreadsheetUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex-1 md:flex-initial px-4 py-2.5 border border-brand-brown/15 bg-white rounded-xl hover:bg-brand-stone/30 text-[10px] font-black uppercase tracking-widest text-center transition-all flex items-center justify-center gap-2"
                >
                  <Link className="w-4.5 h-4.5 text-zinc-400" />
                  View Original Spreadsheet
                </a>
                <button 
                  onClick={handleUnlinkSpreadsheet}
                  className="px-4 py-2.5 border border-brand-red/15 bg-brand-red/5 hover:bg-brand-red/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-brand-red transition-all flex items-center justify-center gap-2"
                >
                  Unlink Sheets
                </button>
              </div>
            </div>

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

            {/* View Toggle (Sheet vs Analytics Dashboard) */}
            <div className="flex bg-white p-1 rounded-2xl border border-brand-brown/10 shadow-sm max-w-sm">
              <button
                type="button"
                onClick={() => setActiveLedgerView('sheet')}
                className={`flex-1 py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeLedgerView === 'sheet'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-brand-brown'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Ledger Entries
              </button>
              <button
                type="button"
                onClick={() => setActiveLedgerView('dashboard')}
                className={`flex-1 py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeLedgerView === 'dashboard'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-zinc-700'
                }`}
              >
                <PieChartIcon className="w-3.5 h-3.5" />
                Dashboard Analytics
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
                        <label className="text-[10px] font-black uppercase tracking-wide text-brand-brown/60">Category Type</label>
                        <select
                          value={txCategory}
                          onChange={e => setTxCategory(e.target.value)}
                          className="w-full p-3 bg-brand-stone/20 border border-brand-brown/10 rounded-xl text-xs font-bold ring-0 outline-none"
                        >
                          {txType === 'credit' ? (
                            CREDIT_CATEGORIES.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))
                          ) : (
                            DEBIT_CATEGORIES.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))
                          )}
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
                          File will be securely saved in Google Drive and referenced as a link in details.
                        </p>
                        
                        {!selectedFile ? (
                          <div className="flex items-center justify-center w-full">
                            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-brand-brown/15 border-dashed rounded-xl cursor-pointer hover:bg-brand-stone/20 duration-150">
                              <div className="flex flex-col items-center justify-center pt-2 pb-2">
                                <Upload className="w-6 h-6 text-zinc-400 mb-1" />
                                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Select bill file</p>
                                <p className="text-[8px] text-zinc-400 mt-0.5">PDF, PNG, JPG, JPEG up to 10MB</p>
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

                    <button 
                      onClick={loadSheetRows}
                      disabled={isSheetLoading}
                      className="p-2 border border-brand-brown/10 hover:bg-brand-stone/30 rounded-lg text-brand-brown/85 transition-colors disabled:opacity-40"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSheetLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Spreadsheet Grid container */}
                  <div className="flex-1 overflow-auto no-scrollbar">
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
                                  {!isOpeningRow && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTransaction(idx)}
                                      className="p-1 px-1.5 rounded text-zinc-400 hover:text-brand-red hover:bg-brand-red/15 duration-150 transition-all outline-none cursor-pointer"
                                      title="Delete Ledger Entry"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
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

              {/* Analytics Dashboard Section */}
              {activeLedgerView === 'dashboard' && (
                <div className="space-y-8 animate-in fade-in duration-300">
                  {/* Dashboard filters and settings row */}
                  <div className="bg-white border border-brand-brown/10 p-6 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-1 text-left">
                      <h3 className="text-sm font-black uppercase tracking-wider text-brand-brown flex items-center gap-2">
                        <Filter className="w-4 h-4 text-emerald-600" />
                        Analysis Granularity Toggle
                      </h3>
                      <p className="text-[10px] text-zinc-400 font-semibold uppercase">
                        {dashboardPeriod === 'month' && `Showing complete aggregate logs for ${activeTabName}`}
                        {dashboardPeriod === 'week' && `Showing logs for Week ${selectedWeek} of ${activeTabName}`}
                        {dashboardPeriod === 'custom' && `Showing customized date range results`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Period type buttons */}
                      <div className="grid grid-cols-3 bg-brand-stone/40 p-1 rounded-xl border border-brand-brown/5 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('month')}
                          className={`py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'month' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-400 hover:text-brand-brown'
                          }`}
                        >
                          Monthly
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('week')}
                          className={`py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'week' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-400 hover:text-brand-brown'
                          }`}
                        >
                          Weekly
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardPeriod('custom')}
                          className={`py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            dashboardPeriod === 'custom' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-400 hover:text-brand-brown'
                          }`}
                        >
                          Custom dates
                        </button>
                      </div>

                      {/* Week selector dropdown (only if week period) */}
                      {dashboardPeriod === 'week' && (
                        <div className="flex items-center gap-1.5 animate-in slide-in-from-right-3 duration-200">
                          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Week</label>
                          <select
                            value={selectedWeek}
                            onChange={e => setSelectedWeek(parseInt(e.target.value))}
                            className="bg-brand-stone/30 border border-brand-brown/10 rounded-xl p-2 text-xs font-bold outline-none ring-0 cursor-pointer"
                          >
                            <option value={1}>Week 1 (Days 1 - 7)</option>
                            <option value={2}>Week 2 (Days 8 - 14)</option>
                            <option value={3}>Week 3 (Days 15 - 21)</option>
                            <option value={4}>Week 4 (Days 22 - 28)</option>
                            <option value={5}>Week 5 (Days 29 - End)</option>
                          </select>
                        </div>
                      )}

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
            </>
          )}

          </div>
        )}
      </div>

      {/* Custom Confirmation Modals */}
      <ConfirmationModal
        isOpen={deletingTxIdx !== null}
        onClose={() => setDeletingTxIdx(null)}
        onConfirm={() => {
          if (deletingTxIdx !== null) {
            triggerDeleteTransaction(deletingTxIdx);
          }
        }}
        title="Delete Ledger Entry"
      >
        <p className="text-sm text-brand-brown">
          Are you sure you want to permanently delete this transaction from Google Sheets? This action cannot be undone.
        </p>
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={showUnlinkConfirm}
        onClose={() => setShowUnlinkConfirm(false)}
        onConfirm={triggerUnlinkSpreadsheet}
        title="Disconnect Google Sheet"
      >
        <p className="text-sm text-brand-brown">
          Are you sure you want to disconnect this ledger spreadsheet from the app?
        </p>
      </ConfirmationModal>

    </div>
  );
};
