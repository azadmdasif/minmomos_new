import { useState, useEffect, useMemo } from 'react';
import { CameraCapture } from './CameraCapture';
import { supabase } from '../utils/supabase';
import { getISTDateString, getISTFullDateTime, getStations } from '../utils/storage';
import { uploadImageIfDataUrl, uploadImagesIfDataUrl } from '../utils/imageStorage';
import { RAW_MATERIALS_LIST } from '../constants';
import { 
  Camera, 
  MapPin, 
  Clock, 
  UserCheck, 
  Coins, 
  ClipboardCheck, 
  FileText, 
  Trash2, 
  Star, 
  Check, 
  ChevronRight, 
  ChevronLeft, 
  Printer, 
  Activity, 
  FileCheck,
  Eye,
  Filter,
  RefreshCw,
  Sparkles,
  Download,
  AlertTriangle,
  Upload
} from 'lucide-react';
import { DailyOperationRecord, DailyOpStatus, DailyOpInventoryItem, DailyOpEvent, User } from '../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Unused color normalization utilities removed to prevent lint errors since PDF is now generated via clean offscreen HTML with hex styling

const OP_STAGES: DailyOpStatus[] = ['Arrived', 'AttendanceDone', 'OpeningCashAndInventoryDone', 'Operations', 'ClosingStarted', 'ClosingDone', 'Closed'];

// Column list for daily_operations LIST fetches. Deliberately EXCLUDES the base64 photo columns
// (opening_photo, closing_photo, opening_sop_photos) which are large and were a major egress source.
// Photos are hydrated per-record on demand via hydrateRecordPhotos().
const DAILY_OP_LIST_COLUMNS =
  'id, date, branch_name, manager_name, status, opening_time, opening_gps, attendance, opening_cash, opening_cash_discrepancy_reason, opening_inventory, opening_sop_checklist, opening_sop_time, events, google_reviews_count, manager_notes, closing_sop_checklist, closing_sop_time, closing_cash, closing_upi, closing_discrepancy_reason, closing_time, created_at';

// Fetch just the (heavy) photo columns for a single record and merge them into it. Used when a
// record is opened for viewing or continued editing, so list loads stay lightweight.
async function hydrateRecordPhotos(record: DailyOperationRecord): Promise<DailyOperationRecord> {
  if (!record?.id) return record;
  // Already hydrated (e.g. from a local record that still holds its photos)? Skip the fetch.
  if (record.openingPhoto || record.closingPhoto || (record.openingSopPhotos && record.openingSopPhotos.length > 0)) {
    return record;
  }
  try {
    const { data } = await supabase
      .from('daily_operations')
      .select('opening_photo, closing_photo, opening_sop_photos')
      .eq('id', record.id)
      .single();
    if (!data) return record;
    return {
      ...record,
      openingPhoto: data.opening_photo || '',
      closingPhoto: data.closing_photo || '',
      openingSopPhotos: data.opening_sop_photos || [],
    };
  } catch (e) {
    console.warn('Could not hydrate record photos:', e);
    return record;
  }
}

const getNewStatus = (currentStatus: DailyOpStatus, targetStatus: DailyOpStatus): DailyOpStatus => {
  const currentIndex = OP_STAGES.indexOf(currentStatus);
  const targetIndex = OP_STAGES.indexOf(targetStatus);
  return targetIndex > currentIndex ? targetStatus : currentStatus;
};

const safeSetLocalStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`localStorage quota exceeded for key "${key}". Safely caught exception.`, err);
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }
};

const pruneLargeDataUrl = (val?: string): string | undefined => {
  if (!val) return val;
  if (val.startsWith('data:') || val.length > 500) {
    return val.startsWith('http') ? val : '[PHOTO_SAVED]';
  }
  return val;
};

const serializeRecordsForLocalStorage = (records: DailyOperationRecord[]): string => {
  const sanitized = records.map(r => ({
    ...r,
    openingPhoto: pruneLargeDataUrl(r.openingPhoto),
    openingSopPhotos: r.openingSopPhotos?.map(p => pruneLargeDataUrl(p) || '') || [],
    closingPhoto: pruneLargeDataUrl(r.closingPhoto)
  }));
  
  return JSON.stringify(sanitized);
};

const time12To24 = (time12: string): string => {
  if (!time12) return '';
  const match = time12.trim().match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) {
    // Check if it's already in 24-hour HH:MM format
    const match24 = time12.trim().match(/^(\d{2}):(\d{2})$/);
    if (match24) return time12.trim();
    return '';
  }
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hours < 12) {
    hours += 12;
  } else if (ampm === 'AM' && hours === 12) {
    hours = 0;
  }
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
};

const time24To12 = (time24: string): string => {
  if (!time24) return '';
  const match = time24.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time24;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
};

interface DailyOperationsProps {
  user: User;
}

// 16 Standard Opening SOP Items
const OPENING_SOP_TASKS = [
  "Tables thoroughly cleaned",
  "Chairs arranged & checked",
  "Floor mopped with disinfectant",
  "Washing area done",
  "Counter cleaned and sanitized",
  "Kitchen area thoroughly cleaned",
  "Fresh drinking water filled",
  "Dustbins emptied & fresh liners placed",
  "Staff uniform and grooming checked",
  "POS machine working & receipts loaded",
  "Store QR codes wiped & placed",
  "Swiggy online & pricing checked",
  "Zomato online & pricing checked",
  "All lights functioning",
  "Fans / AC working and dust-free",
  "Soft music playing"
];

// 10 Standard Closing SOP Items
const CLOSING_SOP_TASKS = [
  "Kitchen cleaned & grills wiped",
  "Counter wiped & sanitized",
  "Dining area cleared of all waste",
  "Tables stacked/arranged for mopping",
  "Floor mopped and garbage bagged",
  "All garbage removed to main bins",
  "Fridge checked & temperature verified",
  "Main gas line turned off & locked",
  "Main power checked & ACs off",
  "All doors and shutters locked"
];

// Critical materials to verify at opening
const CRITICAL_INVENTORY_ITEMS = [
  { id: 'momo-veg', name: 'Veg Momo (Bulk)', unit: 'pcs' },
  { id: 'momo-chicken', name: 'Chicken Momo (Bulk)', unit: 'pcs' },
  { id: 'momo-paneer', name: 'Paneer Momo (Bulk)', unit: 'pcs' },
  { id: 'pkt-oil', name: 'Refined Cooking Oil', unit: 'ltr' },
  { id: 'pkt-mayo', name: 'Mayonnaise', unit: 'pkt' }
];

// Predefined beautiful mock base64 images for quick testing
const MOCK_PHOTOS = {
  shutter: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop&q=60",
  counter: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&auto=format&fit=crop&q=60",
  store: "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=600&auto=format&fit=crop&q=60",
  closing: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&auto=format&fit=crop&q=60"
};

export default function DailyOperations({ user }: DailyOperationsProps) {
  const isAdmin = user.role === 'ADMIN' || user.role === 'COFOUNDER';

  // State for all records (Admin view)
  const [allRecords, setAllRecords] = useState<DailyOperationRecord[]>([]);
  const [adminSelectedBranch, setAdminSelectedBranch] = useState<string>('all');
  const [adminSelectedDate, setAdminSelectedDate] = useState<string>(getISTDateString());
  const [branchesList, setBranchesList] = useState<string[]>([]);

  // Effective branch name being controlled/viewed
  const currentBranch = isAdmin
    ? (adminSelectedBranch !== 'all' ? adminSelectedBranch : 'All Stations')
    : (user.stationName || 'BNR');
  
  // State for active Store Manager's record
  const [activeRecord, setActiveRecord] = useState<DailyOperationRecord | null>(null);
  const [viewStage, setViewStage] = useState<DailyOpStatus | null>(null);
  const [tempOpeningPhoto, setTempOpeningPhoto] = useState<string>('');
  const [activeCameraTarget, setActiveCameraTarget] = useState<'opening' | 'counter' | 'store' | 'closing' | null>(null);
  const [todayDate, setTodayDate] = useState<string>(getISTDateString());
  const [employees, setEmployees] = useState<any[]>([]);
  const [posSales, setPosSales] = useState<{ cash: number; upi: number }>({ cash: 0, upi: 0 });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'failed' | 'idle'>('idle');
  const [prevClosingRecord, setPrevClosingRecord] = useState<DailyOperationRecord | null>(null);

  // Modal/Details View state
  const [viewingRecord, setViewingRecord] = useState<DailyOperationRecord | null>(null);
  const [showReport, setShowReport] = useState<boolean>(false);
  const [reportReferenceRecord, setReportReferenceRecord] = useState<DailyOperationRecord | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);

  // Operational events forms
  const [showEventModal, setShowEventModal] = useState<'complaint' | 'staff' | 'equipment' | 'wastage' | null>(null);
  const [eventCustomerName, setEventCustomerName] = useState('');
  const [eventText, setEventText] = useState('');
  const [eventResolution, setEventResolution] = useState('');
  const [eventTypeSelection, setEventTypeSelection] = useState('');
  const [eventItem, setEventItem] = useState('');
  const [eventQty, setEventQty] = useState('');
  const [eventPhoto, setEventPhoto] = useState('');

  // Attendance edits
  const [openAttendanceModal, setOpenAttendanceModal] = useState<boolean>(false);

  // Load basic details & add window focus/visibility listeners for real-time sync across devices
  useEffect(() => {
    loadAllRecords();
    loadEmployees();
    fetchTodaySales();

    const handleSyncOnVisible = () => {
      if (document.visibilityState === 'visible') {
        loadAllRecords();
        loadEmployees();
        fetchTodaySales();
      }
    };

    window.addEventListener('focus', handleSyncOnVisible);
    document.addEventListener('visibilitychange', handleSyncOnVisible);

    return () => {
      window.removeEventListener('focus', handleSyncOnVisible);
      document.removeEventListener('visibilitychange', handleSyncOnVisible);
    };
  }, [todayDate, currentBranch]);

  // Sync viewStage when activeRecord is loaded or when its status advances
  useEffect(() => {
    if (activeRecord) {
      setViewStage((prev) => {
        if (!prev) return activeRecord.status;
        const prevIndex = OP_STAGES.indexOf(prev);
        const newIndex = OP_STAGES.indexOf(activeRecord.status);
        if (newIndex > prevIndex) {
          return activeRecord.status;
        }
        return prev;
      });
    } else {
      setViewStage(null);
    }
  }, [activeRecord?.status, activeRecord?.branchName, activeRecord?.date]);

  // Load all operational records from local storage & Supabase
  const loadAllRecords = async () => {
    setIsSyncing(true);
    let records: DailyOperationRecord[] = [];

    // 1. Try fetching from Supabase.
    // NOTE: photo columns (opening_photo, closing_photo, opening_sop_photos) hold base64 images
    // (~450KB per row) and were a major egress source. They are excluded from this list query
    // and hydrated on demand only when a specific record is viewed/edited (see hydrateRecordPhotos).
    try {
      const { data, error } = await supabase
        .from('daily_operations')
        .select(DAILY_OP_LIST_COLUMNS)
        .order('date', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        records = data.map((item: any) => ({
          id: item.id,
          date: item.date,
          branchName: item.branch_name,
          managerName: item.manager_name,
          status: item.status as DailyOpStatus,
          openingTime: item.opening_time,
          openingGps: item.opening_gps,
          openingPhoto: item.opening_photo,
          attendance: item.attendance || [],
          openingCash: Number(item.opening_cash || 0),
          openingCashDiscrepancyReason: item.opening_cash_discrepancy_reason || '',
          openingInventory: item.opening_inventory || [],
          openingSopChecklist: item.opening_sop_checklist || [],
          openingSopTime: item.opening_sop_time,
          openingSopPhotos: item.opening_sop_photos || [],
          events: item.events || [],
          googleReviewsCount: Number(item.google_reviews_count || 0),
          managerNotes: item.manager_notes || '',
          closingSopChecklist: item.closing_sop_checklist || [],
          closingSopTime: item.closing_sop_time,
          closingCash: Number(item.closing_cash || 0),
          closingUpi: Number(item.closing_upi || 0),
          closingDiscrepancyReason: item.closing_discrepancy_reason || '',
          closingTime: item.closing_time,
          closingPhoto: item.closing_photo,
          createdAt: item.created_at
        }));
      }
    } catch (e) {
      console.warn("Could not load from Supabase daily_operations (maybe table not run yet). Using local fallback.", e);
    }

    // 2. Load from localStorage
    const localData = localStorage.getItem('minmomos-daily-operations');
    let localRecords: DailyOperationRecord[] = localData ? JSON.parse(localData) : [];

    // Merge records favoring Supabase (by date + branchName)
    const mergedMap = new Map<string, DailyOperationRecord>();
    localRecords.forEach(r => mergedMap.set(`${r.branchName}-${r.date}`, r));
    records.forEach(r => mergedMap.set(`${r.branchName}-${r.date}`, r));
    const merged = Array.from(mergedMap.values()).sort((a, b) => b.date.localeCompare(a.date));
    
    setAllRecords(merged);
    safeSetLocalStorage('minmomos-daily-operations', serializeRecordsForLocalStorage(merged));

    // Get branches list
    let branches: string[] = [];
    try {
      const activeStations = await getStations();
      const stationNames = activeStations.map(s => s.name);
      branches = Array.from(new Set([...merged.map(r => r.branchName), ...stationNames]));
    } catch (e) {
      console.warn("Could not load stations from database", e);
      branches = Array.from(new Set(merged.map(r => r.branchName)));
    }
    // Filter out virtual/aggregated values or legacy default dummy branches
    branches = branches.filter(b => b && b !== 'All Stations' && b !== 'all' && b !== 'All Store Branches' && b !== 'Headquarters' && b !== 'Main Store');
    if (branches.length === 0) {
      branches = ['BNR', 'Main'];
    }
    setBranchesList(branches);

    // Find previous day's closing record for this branch to get expected cash/inventory
    const branchClosedRecords = (currentBranch === 'All Stations')
      ? []
      : merged.filter(r => r.branchName === currentBranch && r.status === 'Closed' && r.date < todayDate);
    if (branchClosedRecords.length > 0) {
      setPrevClosingRecord(branchClosedRecords[0]);
    } else {
      setPrevClosingRecord(null);
    }

    // Load active record for today (prevent loading/acting on virtual 'All Stations' branch)
    const active = (currentBranch === 'All Stations' || currentBranch === 'all')
      ? null
      : merged.find(r => r.branchName === currentBranch && r.date === todayDate);
    if (active) {
      // Hydrate the active record's photos so the in-progress opening/closing editor can
      // pre-populate any images already captured on another device.
      const hydratedActive = await hydrateRecordPhotos(active);
      setActiveRecord(hydratedActive);
    } else {
      setActiveRecord(null);
    }

    setIsSyncing(false);
  };

  // Fetch employees assigned to current branch
  const loadEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('branch_name', currentBranch);
      
      if (error) throw error;
      setEmployees(data || []);
    } catch (e) {
      // Fallback
      setEmployees([
        { id: 'emp-1', name: 'Aman Sharma', branch_name: currentBranch },
        { id: 'emp-2', name: 'Rohan Verma', branch_name: currentBranch },
        { id: 'emp-3', name: 'Pooja Das', branch_name: currentBranch },
        { id: 'emp-4', name: 'Vikram Singh', branch_name: currentBranch }
      ]);
    }
  };

  // Fetch today's sales from POS
  const fetchTodaySales = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('branch_name', currentBranch)
        .gte('date', `${todayDate}T00:00:00+05:30`)
        .lte('date', `${todayDate}T23:59:59+05:30`)
        .is('deletion_info', null);

      if (error) throw error;

      let cashSum = 0;
      let upiSum = 0;

      data?.forEach(order => {
        const amt = order.manual_total != null ? Number(order.manual_total) : Number(order.total);
        if (order.payment_method === 'CASH') {
          cashSum += amt;
        } else if (order.payment_method === 'UPI') {
          upiSum += amt;
        }
      });

      setPosSales({ cash: cashSum, upi: upiSum });
    } catch (e) {
      // Offline fallback
      setPosSales({ cash: 12500, upi: 18400 });
    }
  };

  // Save operational record to local and cloud
  const saveRecord = async (updated: DailyOperationRecord) => {
    // Move any freshly-captured base64 photos into Storage and keep only their URLs on the record.
    // Already-uploaded URLs pass through untouched, so this is idempotent across repeated saves.
    try {
      const photoFolder = `daily-ops/${updated.branchName}/${updated.date}`;
      const [openingPhoto, closingPhoto, openingSopPhotos] = await Promise.all([
        uploadImageIfDataUrl(updated.openingPhoto, photoFolder),
        uploadImageIfDataUrl(updated.closingPhoto, photoFolder),
        uploadImagesIfDataUrl(updated.openingSopPhotos, photoFolder),
      ]);
      updated = { ...updated, openingPhoto, closingPhoto, openingSopPhotos };
    } catch (e) {
      console.warn('Photo upload step failed; falling back to inline images.', e);
    }

    setActiveRecord(updated);

    // Save to local storage first
    const updatedAll = allRecords.map(r => (r.branchName === updated.branchName && r.date === updated.date) ? updated : r);
    if (!updatedAll.some(r => r.branchName === updated.branchName && r.date === updated.date)) {
      updatedAll.push(updated);
    }
    setAllRecords(updatedAll);
    safeSetLocalStorage('minmomos-daily-operations', serializeRecordsForLocalStorage(updatedAll));

    setSyncStatus('syncing');
    // Upsert to Supabase
    try {
      const payload = {
        date: updated.date,
        branch_name: updated.branchName,
        manager_name: updated.managerName,
        status: updated.status,
        opening_time: updated.openingTime,
        opening_gps: updated.openingGps,
        opening_photo: updated.openingPhoto,
        attendance: updated.attendance,
        opening_cash: updated.openingCash,
        opening_cash_discrepancy_reason: updated.openingCashDiscrepancyReason,
        opening_inventory: updated.openingInventory,
        opening_sop_checklist: updated.openingSopChecklist,
        opening_sop_time: updated.openingSopTime,
        opening_sop_photos: updated.openingSopPhotos,
        events: updated.events,
        google_reviews_count: updated.googleReviewsCount,
        manager_notes: updated.managerNotes,
        closing_sop_checklist: updated.closingSopChecklist,
        closing_sop_time: updated.closingSopTime,
        closing_cash: updated.closingCash,
        closing_upi: updated.closingUpi,
        closing_discrepancy_reason: updated.closingDiscrepancyReason,
        closing_time: updated.closingTime,
        closing_photo: updated.closingPhoto
      };

      // Find existing supabase row ID to overwrite if exists
      let existingId = updated.id;
      if (!existingId) {
        const { data } = await supabase
          .from('daily_operations')
          .select('id')
          .eq('branch_name', updated.branchName)
          .eq('date', updated.date)
          .maybeSingle();
        if (data) existingId = data.id;
      }

      const { error } = await supabase
        .from('daily_operations')
        .upsert(existingId ? { id: existingId, ...payload } : payload);

      if (error) throw error;
      setSyncStatus('synced');
    } catch (e) {
      console.warn("Could not sync to Supabase. Stored locally.", e);
      setSyncStatus('failed');
    }
  };

  // -------------------------------------------------------------
  // HANDLERS FOR STAGE TRANSITIONS
  // -------------------------------------------------------------

  // Stage 1: Store Arrival (1:00 PM)
  const handleStartDay = () => {
    // Get GPS with timeout options to avoid hanging if permissions are delayed/blocked
    let gpsCoords = "GPS Not Available";
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          gpsCoords = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
          createInitialRecord(gpsCoords);
        },
        () => {
          createInitialRecord(gpsCoords);
        },
        { timeout: 3000, maximumAge: 60000 }
      );
    } else {
      createInitialRecord(gpsCoords);
    }
  };

  const createInitialRecord = (gps: string) => {
    // Check if yesterday's closed inventory exists to auto-populate expected inventory quantities
    const criticalInventory = CRITICAL_INVENTORY_ITEMS.map(item => {
      let prevQty = 0;
      if (prevClosingRecord) {
        const prevInvItem = prevClosingRecord.openingInventory?.find(i => i.id === item.id);
        if (prevInvItem) {
          prevQty = prevInvItem.actualQty || prevInvItem.expectedQty;
        }
      } else {
        // Safe standard starting quantities
        prevQty = item.id.includes('momo') ? 200 : 10;
      }
      return {
        id: item.id,
        name: item.name,
        expectedQty: prevQty,
        unit: item.unit
      };
    });

    const newRecord: DailyOperationRecord = {
      date: todayDate,
      branchName: currentBranch,
      managerName: user.username,
      status: 'Arrived',
      openingTime: new Date().toISOString(),
      openingGps: gps,
      openingPhoto: tempOpeningPhoto || '',
      attendance: employees.map(emp => ({
        employeeId: emp.id,
        name: emp.name,
        status: 'NOT_ARRIVED_YET'
      })),
      openingCash: prevClosingRecord ? (prevClosingRecord.closingCash || 5000) : 5000,
      openingCashDiscrepancyReason: '',
      openingInventory: criticalInventory,
      openingSopChecklist: OPENING_SOP_TASKS.map(t => ({ task: t, completed: false })),
      events: [],
      googleReviewsCount: 0,
      closingSopChecklist: CLOSING_SOP_TASKS.map(t => ({ task: t, completed: false })),
      openingSopPhotos: []
    };

    saveRecord(newRecord);
  };

  // Stage 2: Attendance Save
  const handleSaveAttendance = () => {
    if (!activeRecord) return;
    const nextStatus = getNewStatus(activeRecord.status, 'AttendanceDone');
    saveRecord({
      ...activeRecord,
      status: nextStatus
    });
    setOpenAttendanceModal(false);

    // Advance viewStage
    const currentIndex = OP_STAGES.indexOf(viewStage || 'Arrived');
    if (currentIndex < OP_STAGES.length - 1) {
      setViewStage(OP_STAGES[currentIndex + 1]);
    }
  };

  // Stage 3: Save Opening Cash & Inventory
  const handleSaveOpeningCashAndInventory = (cash: number, discrepancyReason: string, inventory: DailyOpInventoryItem[]) => {
    if (!activeRecord) return;
    const nextStatus = getNewStatus(activeRecord.status, 'OpeningCashAndInventoryDone');
    saveRecord({
      ...activeRecord,
      openingCash: cash,
      openingCashDiscrepancyReason: discrepancyReason,
      openingInventory: inventory,
      status: nextStatus
    });

    // Advance viewStage
    const currentIndex = OP_STAGES.indexOf(viewStage || 'AttendanceDone');
    if (currentIndex < OP_STAGES.length - 1) {
      setViewStage(OP_STAGES[currentIndex + 1]);
    }
  };

  // Stage 4: Save Opening SOP
  const handleSaveOpeningSOP = (sop: { task: string; completed: boolean }[], photos: string[]) => {
    if (!activeRecord) return;
    const nextStatus = getNewStatus(activeRecord.status, 'Operations');
    saveRecord({
      ...activeRecord,
      openingSopChecklist: sop,
      openingSopPhotos: photos,
      openingSopTime: activeRecord.openingSopTime || new Date().toISOString(),
      status: nextStatus
    });

    // Advance viewStage
    const currentIndex = OP_STAGES.indexOf(viewStage || 'OpeningCashAndInventoryDone');
    if (currentIndex < OP_STAGES.length - 1) {
      setViewStage(OP_STAGES[currentIndex + 1]);
    }
  };

  // Stage 5: Business operations - logger functions
  const handleAddEvent = (type: 'COMPLAINT' | 'STAFF' | 'EQUIPMENT' | 'WASTAGE') => {
    if (!activeRecord) return;

    let eventDetails: any = {};
    if (type === 'COMPLAINT') {
      eventDetails = {
        customerName: eventCustomerName || 'Anonymous Customer',
        complaint: eventText,
        resolution: eventResolution
      };
    } else if (type === 'STAFF') {
      eventDetails = {
        remarks: eventText,
        staffIssueType: eventTypeSelection // Late arrival, Absent, Behaviour, Training, Other
      };
    } else if (type === 'EQUIPMENT') {
      eventDetails = {
        remarks: eventText,
        equipmentIssueType: eventTypeSelection, // POS, Internet, Freezer, Gas, Lights, Other
        photo: eventPhoto || MOCK_PHOTOS.counter
      };
    } else if (type === 'WASTAGE') {
      eventDetails = {
        item: eventItem,
        quantity: Number(eventQty),
        reason: eventText
      };
    }

    const newEvent: DailyOpEvent = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      timestamp: new Date().toISOString(),
      details: eventDetails
    };

    saveRecord({
      ...activeRecord,
      events: [...(activeRecord.events || []), newEvent]
    });

    // Clear states
    setEventCustomerName('');
    setEventText('');
    setEventResolution('');
    setEventTypeSelection('');
    setEventItem('');
    setEventQty('');
    setEventPhoto('');
    setShowEventModal(null);
  };

  // Stage 6 & 7: Start Closing Sequence
  const handleStartClosing = () => {
    if (!activeRecord) return;
    const nextStatus = getNewStatus(activeRecord.status, 'ClosingStarted');
    saveRecord({
      ...activeRecord,
      status: nextStatus
    });

    // Advance viewStage
    const currentIndex = OP_STAGES.indexOf(viewStage || 'Operations');
    if (currentIndex < OP_STAGES.length - 1) {
      setViewStage(OP_STAGES[currentIndex + 1]);
    }
  };

  // Stage 7: Save Closing SOP & Reviews
  const handleSaveClosingSOP = (sop: { task: string; completed: boolean }[], reviews: number, notes: string) => {
    if (!activeRecord) return;
    const nextStatus = getNewStatus(activeRecord.status, 'ClosingDone');
    saveRecord({
      ...activeRecord,
      closingSopChecklist: sop,
      googleReviewsCount: reviews,
      managerNotes: notes,
      closingSopTime: activeRecord.closingSopTime || new Date().toISOString(),
      status: nextStatus
    });

    // Advance viewStage
    const currentIndex = OP_STAGES.indexOf(viewStage || 'ClosingStarted');
    if (currentIndex < OP_STAGES.length - 1) {
      setViewStage(OP_STAGES[currentIndex + 1]);
    }
  };

  // Stage 8: Save Closing verification and final closing record
  const handleCloseStore = async (actualCash: number, actualUpi: number, discrepancyReason: string, photo: string) => {
    if (!activeRecord) return;
    const nextStatus = getNewStatus(activeRecord.status, 'Closed');
    saveRecord({
      ...activeRecord,
      closingCash: actualCash,
      closingUpi: actualUpi,
      closingDiscrepancyReason: discrepancyReason,
      closingTime: activeRecord.closingTime || new Date().toISOString(),
      closingPhoto: photo || activeRecord.closingPhoto || '',
      status: nextStatus
    });

    // Advance viewStage
    const currentIndex = OP_STAGES.indexOf(viewStage || 'ClosingDone');
    if (currentIndex < OP_STAGES.length - 1) {
      setViewStage(OP_STAGES[currentIndex + 1]);
    }
  };

  // Back to previous step/stage without changing operational status
  const handleGoToPreviousStep = async () => {
    if (!activeRecord || !viewStage) return;

    // If we are at the very start (Arrived) and actual status is Arrived, delete/reset the day
    if (activeRecord.status === 'Arrived' && viewStage === 'Arrived') {
      setActiveRecord(null);
      setViewStage(null);
      const updatedAll = allRecords.filter(r => !(r.branchName === activeRecord.branchName && r.date === activeRecord.date));
      setAllRecords(updatedAll);
      safeSetLocalStorage('minmomos-daily-operations', serializeRecordsForLocalStorage(updatedAll));
      
      try {
        await supabase
          .from('daily_operations')
          .delete()
          .eq('branch_name', activeRecord.branchName)
          .eq('date', activeRecord.date);
      } catch (e) {
        console.warn("Could not delete from Supabase", e);
      }
      return;
    }

    // Otherwise, just navigate back in the view stages without changing operational status
    const currentIndex = OP_STAGES.indexOf(viewStage);
    if (currentIndex > 0) {
      setViewStage(OP_STAGES[currentIndex - 1]);
    }
  };

  // Forward to next step/stage
  const handleGoToNextStep = () => {
    if (!activeRecord || !viewStage) return;
    const currentIndex = OP_STAGES.indexOf(viewStage);
    const maxIndex = OP_STAGES.indexOf(activeRecord.status);
    if (currentIndex < maxIndex) {
      setViewStage(OP_STAGES[currentIndex + 1]);
    }
  };

  // -------------------------------------------------------------
  // CALCULATIONS & REPORT GENERATION Helpers
  // -------------------------------------------------------------

  // Calculate hours operated
  const calculateHoursOperated = (record: DailyOperationRecord) => {
    if (!record.openingTime || !record.closingTime) return "--";
    const start = new Date(record.openingTime);
    const end = new Date(record.closingTime);
    const diffMs = end.getTime() - start.getTime();
    const hours = diffMs / (1000 * 60 * 60);
    return hours.toFixed(1) + " hrs";
  };

  // Generate interactive Report modal
  const handleTriggerReport = async (record: DailyOperationRecord) => {
    // Find reference record (same weekday last week)
    const recordDateObj = new Date(record.date);
    const prevWeekDate = new Date(recordDateObj.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prevWeekDateStr = prevWeekDate.toISOString().split('T')[0];

    const reference = allRecords.find(r => r.branchName === record.branchName && r.date === prevWeekDateStr && r.status === 'Closed');
    setReportReferenceRecord(reference || null);

    // Photos are excluded from list loads; fetch them for this record before showing the report.
    const hydrated = await hydrateRecordPhotos(record);
    setViewingRecord(hydrated);
    setShowReport(true);
  };

  const handlePrintReport = () => {
    // Add print class to body to toggle layout stylesheets
    document.body.classList.add('print-report-mode');

    // Dynamically insert A4/Portrait page directive
    const styleEl = document.createElement('style');
    styleEl.id = 'print-report-style-override';
    styleEl.innerHTML = `
      @page {
        size: A4 portrait !important;
        margin: 15mm !important;
      }
    `;
    document.head.appendChild(styleEl);

    // Call native print
    window.print();

    // Cleanup print changes after print is triggered/finished
    document.body.classList.remove('print-report-mode');
    const existingStyle = document.getElementById('print-report-style-override');
    if (existingStyle) {
      existingStyle.remove();
    }
  };

  const handleDownloadPDF = async () => {
    if (!viewingRecord) return;
    setIsDownloadingPdf(true);

    const record = viewingRecord;

    // We override document.styleSheets to return an empty array to avoid html2canvas trying
    // to parse any global stylesheets (which contain oklab/oklch/color() colors that it cannot parse).
    let originalStyleSheetsDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'styleSheets');
    if (!originalStyleSheetsDescriptor) {
      originalStyleSheetsDescriptor = Object.getOwnPropertyDescriptor(document, 'styleSheets');
    }

    try {
      Object.defineProperty(document, 'styleSheets', {
        get() {
          return [] as unknown as StyleSheetList;
        },
        configurable: true
      });
    } catch (e) {
      console.warn('Could not override document.styleSheets directly, trying on Document.prototype', e);
      try {
        Object.defineProperty(Document.prototype, 'styleSheets', {
          get() {
            return [] as unknown as StyleSheetList;
          },
          configurable: true
        });
      } catch (err) {
        console.error('Could not override styleSheets at all', err);
      }
    }

    // Create custom container off-screen for clean PDF generation
    const tempContainer = document.createElement('div');
    tempContainer.id = 'temp-pdf-container';
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = '794px'; // standard A4 proportional width in pixels
    tempContainer.style.backgroundColor = '#FDFBF5';
    tempContainer.style.padding = '40px';
    tempContainer.style.boxSizing = 'border-box';
    tempContainer.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    tempContainer.style.color = '#4A2C2A';

    // Build standard, clean, highly compatible HTML representation
    tempContainer.innerHTML = `
      <div style="background-color: #FDFBF5; color: #4A2C2A; font-family: system-ui, -apple-system, sans-serif; box-sizing: border-box; width: 100%; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <!-- Report Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 4px solid #4A2C2A; padding-bottom: 24px; margin-bottom: 24px;">
            <div>
              <h1 style="font-size: 36px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; margin: 0; font-style: italic; color: #4A2C2A;">minmomos</h1>
              <p style="font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3em; color: rgba(74, 44, 42, 0.6); margin: 4px 0 0 0;">Official Daily Operational Audit</p>
            </div>
            <div style="text-align: right;">
              <span style="background-color: #4A2C2A; color: #FBBF24; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; padding: 6px 14px; border-radius: 9999px; display: inline-block; margin-bottom: 6px;">
                ${record.branchName}
              </span>
              <p style="font-size: 12px; font-weight: bold; margin: 4px 0 0 0; color: #4A2C2A;">Audit Date: ${record.date}</p>
            </div>
          </div>

          <!-- Audit Summary Grid -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
            <div style="background-color: rgba(253, 251, 245, 0.5); padding: 14px; border-radius: 12px; border: 1px solid #E7E5E4;">
              <span style="font-size: 9px; font-weight: 900; text-transform: uppercase; color: rgba(74, 44, 42, 0.5); letter-spacing: 0.05em; display: block; margin-bottom: 4px;">Manager in Duty</span>
              <p style="font-size: 14px; font-weight: 900; margin: 0; color: #4A2C2A;">${record.managerName}</p>
            </div>
            <div style="background-color: rgba(253, 251, 245, 0.5); padding: 14px; border-radius: 12px; border: 1px solid #E7E5E4;">
              <span style="font-size: 9px; font-weight: 900; text-transform: uppercase; color: rgba(74, 44, 42, 0.5); letter-spacing: 0.05em; display: block; margin-bottom: 4px;">Hours Operated</span>
              <p style="font-size: 14px; font-weight: 900; margin: 0; color: #4A2C2A;">${calculateHoursOperated(record)}</p>
            </div>
            <div style="background-color: rgba(253, 251, 245, 0.5); padding: 14px; border-radius: 12px; border: 1px solid #E7E5E4;">
              <span style="font-size: 9px; font-weight: 900; text-transform: uppercase; color: rgba(74, 44, 42, 0.5); letter-spacing: 0.05em; display: block; margin-bottom: 4px;">Opening SOPs</span>
              <p style="font-size: 14px; font-weight: 900; color: #15803d; margin: 0;">${getSopPercent(record.openingSopChecklist)}% Done</p>
            </div>
            <div style="background-color: rgba(253, 251, 245, 0.5); padding: 14px; border-radius: 12px; border: 1px solid #E7E5E4;">
              <span style="font-size: 9px; font-weight: 900; text-transform: uppercase; color: rgba(74, 44, 42, 0.5); letter-spacing: 0.05em; display: block; margin-bottom: 4px;">Closing SOPs</span>
              <p style="font-size: 14px; font-weight: 900; color: #15803d; margin: 0;">${getSopPercent(record.closingSopChecklist)}% Done</p>
            </div>
          </div>

          <!-- Store Timings -->
          <div style="background-color: #fafaf9; border-radius: 12px; padding: 14px; border: 1px solid #E7E5E4; display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; font-size: 11px; font-weight: bold; color: rgba(74, 44, 42, 0.8);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #4A2C2A; font-size: 14px;">🕒</span>
              <span style="color: #4A2C2A;"><strong>Store Opened:</strong> ${record.openingTime ? getISTFullDateTime(record.openingTime) : '--'}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #4A2C2A; font-size: 14px;">🕒</span>
              <span style="color: #4A2C2A;"><strong>Store Closed:</strong> ${record.closingTime ? getISTFullDateTime(record.closingTime) : '--'}</span>
            </div>
          </div>

          <!-- Attendance Logs -->
          <div style="margin-bottom: 24px;">
            <h3 style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 10px 0; border-bottom: 1px solid #E7E5E4; padding-bottom: 4px; color: #4A2C2A;">Staff Attendance Logs</h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
              ${record.attendance?.map(staff => `
                <div style="display: flex; justify-content: space-between; padding: 10px; background-color: rgba(253, 251, 245, 0.3); border: 1px solid rgba(231, 229, 228, 0.6); border-radius: 10px; font-size: 11px;">
                  <div>
                    <p style="font-weight: 900; margin: 0 0 2px 0; color: #4A2C2A;">${staff.name}</p>
                    <p style="font-size: 9px; color: rgba(74, 44, 42, 0.5); margin: 0;">Arrival: ${staff.arrivalTime || 'N/A'}</p>
                  </div>
                  <span style="font-weight: 900; text-transform: uppercase; font-size: 9px; align-self: center; padding: 2px 6px; border-radius: 4px; ${
                    staff.status === 'PRESENT' ? 'background-color: #d1fae5; color: #065f46;' :
                    staff.status === 'LATE' ? 'background-color: #fef3c7; color: #92400e;' :
                    'background-color: #f4f4f5; color: #374151;'
                  }">
                    ${staff.status}
                  </span>
                </div>
              `).join('') || '<p style="font-size: 11px; color: rgba(74, 44, 42, 0.5); margin: 0;">No attendance logged.</p>'}
            </div>
          </div>

          <!-- Cash Reconciliation Details -->
          <div style="margin-bottom: 24px;">
            <h3 style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 10px 0; border-bottom: 1px solid #E7E5E4; padding-bottom: 4px; color: #4A2C2A;">Cash Reconciliation Details</h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
              <div style="background-color: rgba(253, 251, 245, 0.3); border: 1px solid #E7E5E4; border-radius: 12px; padding: 14px; font-size: 11px;">
                <p style="font-weight: 900; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(74, 44, 42, 0.5); margin: 0 0 8px 0;">Opening Session Cash</p>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #4A2C2A;">
                  <span>Opening Cash:</span>
                  <span style="font-weight: 900;">₹${record.openingCash || 0}</span>
                </div>
                ${record.openingCashDiscrepancyReason ? `
                  <p style="font-size: 9px; color: #D95323; background-color: rgba(217, 83, 35, 0.05); padding: 8px; border-radius: 6px; border: 1px solid rgba(217, 83, 35, 0.2); margin: 8px 0 0 0;">
                    <strong>Reason:</strong> ${record.openingCashDiscrepancyReason}
                  </p>
                ` : ''}
              </div>

              <div style="background-color: rgba(253, 251, 245, 0.3); border: 1px solid #E7E5E4; border-radius: 12px; padding: 14px; font-size: 11px;">
                <p style="font-weight: 900; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(74, 44, 42, 0.5); margin: 0 0 8px 0;">Closing Session Cash / UPI</p>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #4A2C2A;">
                  <span>Closing Cash Actual:</span>
                  <span style="font-weight: 900;">₹${record.closingCash || 0}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #4A2C2A;">
                  <span>Closing UPI Actual:</span>
                  <span style="font-weight: 900;">₹${record.closingUpi || 0}</span>
                </div>
                ${record.closingDiscrepancyReason ? `
                  <p style="font-size: 9px; color: #D95323; background-color: rgba(217, 83, 35, 0.05); padding: 8px; border-radius: 6px; border: 1px solid rgba(217, 83, 35, 0.2); margin: 8px 0 0 0;">
                    <strong>Reason:</strong> ${record.closingDiscrepancyReason}
                  </p>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- Critical Material Verification -->
          <div style="margin-bottom: 24px;">
            <h3 style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 10px 0; border-bottom: 1px solid #E7E5E4; padding-bottom: 4px; color: #4A2C2A;">Critical Material Verification</h3>
            <div style="border: 1px solid #E7E5E4; border-radius: 12px; overflow: hidden;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 11px;">
                <thead>
                  <tr style="background-color: #4A2C2A; color: #FBBF24;">
                    <th style="padding: 10px; font-weight: 900; text-transform: uppercase;">Material Item</th>
                    <th style="padding: 10px; font-weight: 900; text-transform: uppercase; text-align: center;">Expected</th>
                    <th style="padding: 10px; font-weight: 900; text-transform: uppercase; text-align: center;">Actual</th>
                    <th style="padding: 10px; font-weight: 900; text-transform: uppercase;">Discrepancy Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  ${record.openingInventory?.map(item => {
                    const diff = (item.actualQty || 0) - item.expectedQty;
                    return `
                      <tr style="border-bottom: 1px solid rgba(231, 229, 228, 0.6);">
                        <td style="padding: 10px; font-weight: bold; color: #4A2C2A;">${item.name}</td>
                        <td style="padding: 10px; text-align: center; color: rgba(74, 44, 42, 0.7);">${item.expectedQty} ${item.unit}</td>
                        <td style="padding: 10px; text-align: center; font-weight: 900; color: #4A2C2A;">${item.actualQty ?? '--'} ${item.unit}</td>
                        <td style="padding: 10px;">
                          ${diff !== 0 && item.actualQty != null ? `
                            <span style="font-size: 9px; font-weight: bold; color: #D95323;">
                              ${diff > 0 ? `+${diff}` : diff} ${item.unit} discrepancy: ${item.reason || 'No reason entered'}
                            </span>
                          ` : `
                            <span style="color: #15803d; font-weight: bold; font-size: 9px;">✓ Reconciled</span>
                          `}
                        </td>
                      </tr>
                    `;
                  }).join('') || '<tr><td colspan="4" style="padding: 10px; text-align: center;">No inventory logged.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Incident Logs -->
          <div style="margin-bottom: 24px;">
            <h3 style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 10px 0; border-bottom: 1px solid #E7E5E4; padding-bottom: 4px; color: #4A2C2A;">Today's Incident Logs</h3>
            ${record.events && record.events.length > 0 ? `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${record.events.map(ev => `
                  <div style="background-color: rgba(253, 251, 245, 0.3); border: 1px solid #E7E5E4; padding: 12px; border-radius: 12px; display: flex; justify-content: space-between; gap: 16px; font-size: 11px;">
                    <div>
                      <span style="font-weight: 900; text-transform: uppercase; font-size: 8px; letter-spacing: 0.05em; padding: 2px 6px; border-radius: 4px; background-color: #4A2C2A; color: #FBBF24; display: inline-block; margin-bottom: 6px;">
                        ${ev.type}
                      </span>
                      <p style="font-weight: 900; margin: 0; color: #4A2C2A;">
                        ${ev.type === 'COMPLAINT' ? `Complaint: ${ev.details.complaint}` :
                          ev.type === 'STAFF' ? `Staff Incident: ${ev.details.remarks}` :
                          ev.type === 'EQUIPMENT' ? `Equipment issue: ${ev.details.remarks}` :
                          `Wastage of ${ev.details.item}: ${ev.details.quantity} pcs (${ev.details.reason})`}
                      </p>
                      ${ev.details.resolution ? `
                        <p style="font-size: 10px; color: #065f46; margin: 4px 0 0 0; font-weight: bold;">
                          <strong>Resolution:</strong> ${ev.details.resolution}
                        </p>
                      ` : ''}
                    </div>
                    <span style="font-size: 9px; color: rgba(74, 44, 42, 0.4); align-self: flex-end;">
                      ${new Date(ev.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                `).join('')}
              </div>
            ` : `
              <p style="font-size: 11px; color: #15803d; font-weight: bold; background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: 10px; margin: 0;">
                ✓ Clean Audit: Zero incidents, complaints, equipment faults or food wastage were reported today.
              </p>
            `}
          </div>

          <!-- Shift Notes & Reviews -->
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px;">
            <div style="background-color: rgba(253, 251, 245, 0.3); border: 1px solid #E7E5E4; padding: 12px; border-radius: 12px; font-size: 11px;">
              <span style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: rgba(74, 44, 42, 0.5); letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Google Reviews Obtained</span>
              <div style="display: flex; align-items: center; gap: 4px;">
                <span style="color: #FBBF24; font-size: 16px;">★</span>
                <span style="font-size: 16px; font-weight: 900; color: #4A2C2A;">${record.googleReviewsCount || 0} Reviews</span>
              </div>
            </div>
            <div style="background-color: rgba(253, 251, 245, 0.3); border: 1px solid #E7E5E4; padding: 12px; border-radius: 12px; font-size: 11px;">
              <span style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: rgba(74, 44, 42, 0.5); letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Manager Shift Notes</span>
              <p style="font-style: italic; margin: 0; color: rgba(74, 44, 42, 0.8);">${record.managerNotes || 'No notes left for today.'}</p>
            </div>
          </div>

          <!-- Weekly Performance WoW -->
          <div style="margin-bottom: 24px;">
            <h3 style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 10px 0; border-bottom: 1px solid #E7E5E4; padding-bottom: 4px; color: #4A2C2A;">Weekly Performance Comparison (WoW)</h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; font-size: 11px;">
              <div style="background-color: rgba(253, 251, 245, 0.5); padding: 12px; border-radius: 12px; border: 1px solid #E7E5E4;">
                <span style="font-size: 8px; text-transform: uppercase; color: rgba(74, 44, 42, 0.5); display: block; margin-bottom: 4px;">Google Reviews</span>
                <p style="font-size: 14px; font-weight: 900; margin: 0 0 2px 0; color: #4A2C2A;">${record.googleReviewsCount} Today</p>
                <p style="font-size: 9px; color: rgba(74, 44, 42, 0.4); margin: 0;">Last week: ${reportReferenceRecord ? reportReferenceRecord.googleReviewsCount : 0}</p>
              </div>

              <div style="background-color: rgba(253, 251, 245, 0.5); padding: 12px; border-radius: 12px; border: 1px solid #E7E5E4;">
                <span style="font-size: 8px; text-transform: uppercase; color: rgba(74, 44, 42, 0.5); display: block; margin-bottom: 4px;">Attendance Discipline</span>
                <p style="font-size: 14px; font-weight: 900; color: #15803d; margin: 0 0 2px 0;">
                  ${record.attendance?.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length || 0} Present
                </p>
                <p style="font-size: 9px; color: rgba(74, 44, 42, 0.4); margin: 0;">
                  Late/Absent: ${record.attendance?.filter(a => a.status === 'LATE' || a.status === 'ABSENT').length || 0}
                </p>
              </div>

              <div style="background-color: rgba(253, 251, 245, 0.5); padding: 12px; border-radius: 12px; border: 1px solid #E7E5E4;">
                <span style="font-size: 8px; text-transform: uppercase; color: rgba(74, 44, 42, 0.5); display: block; margin-bottom: 4px;">Operations Health</span>
                <p style="font-size: 14px; font-weight: 900; margin: 0 0 2px 0; color: #4A2C2A;">
                  ${record.events?.length || 0} Incident Reports
                </p>
                <p style="font-size: 9px; color: #15803d; margin: 0;">
                  ${reportReferenceRecord ? `${reportReferenceRecord.events?.length || 0} last week` : 'No prev record'}
                </p>
              </div>
            </div>
          </div>

          <!-- Photos Verification Gallery -->
          ${(record.openingPhoto || record.openingSopPhotos?.[0] || record.closingPhoto) ? `
            <div style="margin-bottom: 24px;">
              <h3 style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 10px 0; border-bottom: 1px solid #E7E5E4; padding-bottom: 4px; color: #4A2C2A;">Audit Photo Verification Gallery</h3>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                ${record.openingPhoto ? `
                  <div style="text-align: center;">
                    <p style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: rgba(74, 44, 42, 0.5); margin: 0 0 4px 0;">Front/Shutter Opening</p>
                    <div style="border: 1px solid #E7E5E4; border-radius: 12px; overflow: hidden; height: 110px; background-color: #f4f4f5;">
                      <img src="${record.openingPhoto}" crossorigin="anonymous" alt="Opening Shutter" style="width: 100%; height: 100%; object-fit: cover;" />
                    </div>
                  </div>
                ` : ''}
                ${record.openingSopPhotos?.[0] ? `
                  <div style="text-align: center;">
                    <p style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: rgba(74, 44, 42, 0.5); margin: 0 0 4px 0;">Store Counter Ready</p>
                    <div style="border: 1px solid #E7E5E4; border-radius: 12px; overflow: hidden; height: 110px; background-color: #f4f4f5;">
                      <img src="${record.openingSopPhotos[0]}" crossorigin="anonymous" alt="Store Ready" style="width: 100%; height: 100%; object-fit: cover;" />
                    </div>
                  </div>
                ` : ''}
                ${record.closingPhoto ? `
                  <div style="text-align: center;">
                    <p style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: rgba(74, 44, 42, 0.5); margin: 0 0 4px 0;">Store Shutter Closing</p>
                    <div style="border: 1px solid #E7E5E4; border-radius: 12px; overflow: hidden; height: 110px; background-color: #f4f4f5;">
                      <img src="${record.closingPhoto}" crossorigin="anonymous" alt="Store Closed" style="width: 100%; height: 100%; object-fit: cover;" />
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Footer signatures -->
        <div style="padding-top: 16px; border-top: 2px solid #E7E5E4; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; font-weight: 900; text-transform: uppercase; color: rgba(74, 44, 42, 0.4); margin-top: 24px;">
          <span>Logged by ${record.managerName}</span>
          <span>Audit Signature Verified</span>
        </div>
      </div>
    `;

    document.body.appendChild(tempContainer);

    const preloadImages = (container: HTMLElement): Promise<void[]> => {
      const imgs = Array.from(container.querySelectorAll('img'));
      const promises = imgs.map(img => {
        return new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
          } else {
            img.onload = () => resolve();
            img.onerror = () => resolve(); // resolve anyway so we don't block
          }
        });
      });
      return Promise.all(promises);
    };

    try {
      // Wait for any images to complete loading
      await preloadImages(tempContainer);

      // Render the offscreen container to canvas
      const canvas = await html2canvas(tempContainer, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#FDFBF5'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; // A4 standard width in mm
      const pageHeight = 297; // A4 standard height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      // Add image slices for multi-page output
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const filename = `Daily_Report_${record.branchName || 'Branch'}_${record.date || todayDate}.pdf`;
      pdf.save(filename);
    } catch (error) {
      console.error('Error downloading PDF:', error);
    } finally {
      // Remove temporary off-screen container
      try {
        tempContainer.remove();
      } catch (e) {}

      // Restore document.styleSheets
      try {
        if (originalStyleSheetsDescriptor) {
          Object.defineProperty(Document.prototype, 'styleSheets', originalStyleSheetsDescriptor);
        } else {
          delete (document as any).styleSheets;
        }
      } catch (e) {
        console.error('Failed to restore document.styleSheets', e);
      }

      setIsDownloadingPdf(false);
    }
  };

  // SOP completion percent
  const getSopPercent = (checklist: { completed: boolean }[]) => {
    if (!checklist || checklist.length === 0) return 0;
    const completed = checklist.filter(c => c.completed).length;
    return Math.round((completed / checklist.length) * 100);
  };

  // -------------------------------------------------------------
  // RENDER BLOCKS
  // -------------------------------------------------------------

  // Filtered records for Admin
  const filteredRecords = useMemo(() => {
    return allRecords.filter(r => {
      const matchBranch = adminSelectedBranch === 'all' || r.branchName === adminSelectedBranch;
      const matchDate = !adminSelectedDate || r.date === adminSelectedDate;
      return matchBranch && matchDate;
    });
  }, [allRecords, adminSelectedBranch, adminSelectedDate]);

  return (
    <div className="h-full w-full flex flex-col bg-brand-cream overflow-y-auto pb-24">
      {/* Header bar */}
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 pt-8 md:px-12">
        <div>
          <h2 className="text-4xl font-black text-brand-brown italic tracking-tighter uppercase">DAILY <span className="text-brand-yellow">OPS</span></h2>
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">Operational Command</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="bg-brand-brown text-brand-yellow border border-brand-brown font-black text-[10px] px-4 py-2.5 rounded-full uppercase tracking-widest shadow-sm">
            {currentBranch}
          </span>
          <button 
            onClick={loadAllRecords} 
            disabled={isSyncing}
            className="bg-white hover:bg-brand-brown/5 active:scale-95 transition-all text-brand-brown p-2.5 rounded-xl border-2 border-brand-stone shadow-sm"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* ADMIN DASHBOARD VIEW */}
      {isAdmin && (
        <div className="max-w-7xl w-full mx-auto p-4 lg:p-8 space-y-6">
          <div className="bg-white rounded-[2rem] p-6 border-4 border-brand-brown shadow-xl">
            <h2 className="text-lg font-black uppercase text-brand-brown tracking-wider mb-4 flex items-center gap-2">
              <Filter className="w-5 h-5 text-brand-yellow" />
              Store Performance Logs (Admin Console)
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-brand-brown/50 tracking-wider mb-2">Select Branch / Station</label>
                <select 
                  value={adminSelectedBranch}
                  onChange={(e) => setAdminSelectedBranch(e.target.value)}
                  className="w-full bg-brand-cream border-2 border-brand-stone p-3 rounded-xl font-bold text-brand-brown"
                >
                  <option value="all">All Store Branches</option>
                  {branchesList.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-brand-brown/50 tracking-wider mb-2">Select Target Date</label>
                <input 
                  type="date"
                  value={adminSelectedDate}
                  onChange={(e) => setAdminSelectedDate(e.target.value)}
                  className="w-full bg-brand-cream border-2 border-brand-stone p-3 rounded-xl font-bold text-brand-brown"
                />
              </div>

              <div className="flex items-end">
                <button 
                  onClick={() => { setAdminSelectedBranch('all'); setAdminSelectedDate(''); }}
                  className="w-full bg-brand-brown text-brand-yellow font-black uppercase text-xs tracking-widest py-3.5 px-6 rounded-xl hover:opacity-90 active:scale-98 transition-all"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {adminSelectedBranch === 'all' && (
              <div className="mt-4 p-4 bg-brand-cream/45 rounded-2xl border-2 border-brand-stone/30 text-xs text-brand-brown/70 font-semibold space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4.5 h-4.5 text-brand-yellow flex-shrink-0" />
                  <span>Select a physical store branch from above or click a button below to launch or advance active daily operations:</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {branchesList.map(b => (
                    <button 
                      key={b}
                      onClick={() => setAdminSelectedBranch(b)}
                      className="bg-brand-brown text-brand-yellow font-black text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-xl shadow-sm hover:scale-103 active:scale-97 transition-all flex items-center gap-1.5"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Operate {b}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Admin Records List */}
          <div className="bg-white rounded-[3rem] p-6 border-4 border-brand-brown shadow-2xl overflow-hidden">
            <h3 className="text-xl font-black uppercase text-brand-brown tracking-widest mb-6">Historical Daily Logs</h3>
            
            {filteredRecords.length === 0 ? (
              <div className="text-center py-16 bg-brand-cream/30 rounded-2xl border border-dashed border-brand-stone">
                <FileCheck className="w-16 h-16 text-brand-brown/20 mx-auto mb-4" />
                <p className="text-brand-brown/60 font-bold">No daily operations data matching your query was found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-brand-stone">
                      <th className="py-4 text-[10px] font-black uppercase tracking-wider text-brand-brown/50">Store Name</th>
                      <th className="py-4 text-[10px] font-black uppercase tracking-wider text-brand-brown/50">Operational Date</th>
                      <th className="py-4 text-[10px] font-black uppercase tracking-wider text-brand-brown/50">Store Manager</th>
                      <th className="py-4 text-[10px] font-black uppercase tracking-wider text-brand-brown/50">Time Frame</th>
                      <th className="py-4 text-[10px] font-black uppercase tracking-wider text-brand-brown/50">Current Status</th>
                      <th className="py-4 text-[10px] font-black uppercase tracking-wider text-brand-brown/50 text-right">Operational Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((rec) => (
                      <tr key={`${rec.branchName}-${rec.date}`} className="border-b border-brand-stone/30 hover:bg-brand-cream/20">
                        <td className="py-4 font-black text-brand-brown">{rec.branchName}</td>
                        <td className="py-4 font-bold text-brand-brown">{rec.date}</td>
                        <td className="py-4 text-xs font-bold text-brand-brown/70">{rec.managerName}</td>
                        <td className="py-4 text-xs text-brand-brown/70 flex items-center gap-1.5 pt-5">
                          <Clock className="w-3.5 h-3.5 text-brand-yellow/80" />
                          <span>{rec.openingTime ? new Date(rec.openingTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--'} - {rec.closingTime ? new Date(rec.closingTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--'}</span>
                        </td>
                        <td className="py-4">
                          <span className={`inline-block text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${
                            rec.status === 'Closed' ? 'bg-zinc-100 text-zinc-600' :
                            rec.status === 'Operations' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {rec.status}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={async () => setViewingRecord(await hydrateRecordPhotos(rec))}
                              className="bg-brand-cream border border-brand-stone hover:bg-brand-brown hover:text-white p-2 rounded-lg text-brand-brown transition-all"
                              title="Quick View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleTriggerReport(rec)}
                              className="bg-brand-yellow text-brand-brown font-black text-[10px] uppercase tracking-widest px-4 py-2 rounded-lg hover:scale-103 active:scale-97 transition-all flex items-center gap-1.5"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Generate Report
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STORE MANAGER DYNAMIC WORKFLOW */}
      {(!isAdmin || adminSelectedBranch !== 'all') && (
        <div className="max-w-md w-full mx-auto p-4 space-y-6">
          {/* Quick Date Control */}
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border-2 border-brand-stone shadow-sm">
            <button 
              onClick={() => {
                const prev = new Date(todayDate);
                prev.setDate(prev.getDate() - 1);
                setTodayDate(prev.toISOString().split('T')[0]);
              }}
              className="p-2 text-brand-brown hover:bg-brand-cream rounded-xl"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest">Active Operational Date</span>
              <p className="font-black text-brand-brown text-sm">{todayDate}</p>
            </div>
            <button 
              onClick={() => {
                const next = new Date(todayDate);
                next.setDate(next.getDate() + 1);
                setTodayDate(next.toISOString().split('T')[0]);
              }}
              className="p-2 text-brand-brown hover:bg-brand-cream rounded-xl"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Cloud Synchronization Status Indicator */}
          {syncStatus !== 'idle' && (
            <div className={`flex items-center justify-between px-5 py-3 rounded-2xl border-2 transition-all ${
              syncStatus === 'syncing' ? 'bg-brand-yellow/10 border-brand-yellow/30 text-brand-brown' :
              syncStatus === 'synced' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
              'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              <div className="flex items-center gap-2">
                {syncStatus === 'syncing' && <RefreshCw className="w-4 h-4 animate-spin text-brand-brown" />}
                {syncStatus === 'synced' && <Check className="w-4 h-4 text-emerald-600" />}
                {syncStatus === 'failed' && <AlertTriangle className="w-4 h-4 text-rose-600" />}
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  {syncStatus === 'syncing' ? 'Syncing day state with Cloud...' :
                   syncStatus === 'synced' ? 'All changes saved & synced to Cloud' :
                   'Sync failed. Saved offline. Tap Refresh to retry.'}
                </span>
              </div>
              {syncStatus === 'failed' && (
                <button 
                  onClick={() => activeRecord && saveRecord(activeRecord)}
                  className="text-[10px] font-black uppercase text-rose-800 hover:underline"
                >
                  Retry Now
                </button>
              )}
            </div>
          )}

          {/* DYNAMIC WORKFLOW STAGES CONTAINER */}
          {isSyncing && !activeRecord ? (
            /* Elegant, themed Loading Spinner / Skeleton */
            <div className="bg-white rounded-[3rem] p-12 border-4 border-brand-brown shadow-2xl text-center space-y-6 flex flex-col items-center justify-center min-h-[300px]">
              <RefreshCw className="w-12 h-12 text-brand-yellow animate-spin" />
              <p className="text-xs font-black uppercase text-brand-brown tracking-widest mt-4">
                Fetching latest Operational Status...
              </p>
              <p className="text-[10px] text-brand-brown/40">
                Checking cloud sync with Supabase
              </p>
            </div>
          ) : !activeRecord ? (
            /* STAGE 1 – Store Arrival (1:00 PM) */
            <div className="bg-white rounded-[3rem] p-8 border-4 border-brand-brown shadow-2xl text-center space-y-6">
              <div className="w-20 h-20 bg-brand-yellow/20 rounded-full flex items-center justify-center mx-auto text-brand-yellow border-4 border-brand-brown">
                <MapPin className="w-10 h-10 text-brand-brown" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-black uppercase text-brand-brown tracking-tighter">Ready to Open Store?</h2>
                <p className="text-xs text-brand-brown/60 leading-relaxed max-w-xs mx-auto">
                  Arrive at approximately 1:00 PM. Tap below to automatically record your arrival time, store shutters photo, and official GPS coordinate.
                </p>
              </div>

              <div className="space-y-4">
                {/* Shutter Photo Upload */}
                <div className="border-2 border-dashed border-brand-stone rounded-2xl p-4 bg-brand-cream/30 space-y-3">
                  <p className="text-[10px] font-black text-brand-brown/50 uppercase tracking-widest">Store Front/Shutter Photo Required</p>
                  
                  {!tempOpeningPhoto ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button 
                          onClick={() => setActiveCameraTarget('opening')}
                          className="flex flex-col items-center justify-center gap-2 bg-white hover:bg-brand-cream p-4 rounded-xl cursor-pointer border border-brand-stone transition-all"
                        >
                          <Camera className="w-6 h-6 text-brand-brown/70" />
                          <span className="text-xs font-black text-brand-brown uppercase">Take Photo</span>
                        </button>
                        
                        <label className="flex flex-col items-center justify-center gap-2 bg-white hover:bg-brand-cream p-4 rounded-xl cursor-pointer border border-brand-stone transition-all">
                          <Upload className="w-6 h-6 text-brand-brown/70" />
                          <span className="text-xs font-black text-brand-brown uppercase">Upload File</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setTempOpeningPhoto(reader.result as string);
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                      </div>

                      <button
                        onClick={() => setTempOpeningPhoto(MOCK_PHOTOS.shutter)}
                        className="w-full text-[10px] font-black text-brand-brown/60 uppercase tracking-wider bg-white/70 hover:bg-white p-2 rounded-lg border border-brand-stone/40 transition-all"
                      >
                        ⚡ Use Sample Shutter Photo
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="border border-brand-stone rounded-xl overflow-hidden h-40 bg-zinc-100 relative">
                        <img src={tempOpeningPhoto} alt="Opening Shutter Preview" className="w-full h-full object-cover" />
                        <button 
                          onClick={() => setTempOpeningPhoto('')}
                          className="absolute top-2 right-2 bg-brand-brown text-brand-yellow font-black rounded-full px-2.5 py-1 text-xs shadow-md border border-brand-stone hover:bg-brand-yellow hover:text-brand-brown transition-all"
                        >
                          Retake ✕
                        </button>
                      </div>
                      <p className="text-[9px] text-emerald-700 font-bold flex items-center justify-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Photo captured successfully!
                      </p>
                    </div>
                  )}
                </div>

                <button 
                  onClick={handleStartDay}
                  disabled={!tempOpeningPhoto}
                  className={`w-full font-black uppercase tracking-widest py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 text-sm ${
                    tempOpeningPhoto 
                      ? 'bg-brand-brown text-brand-yellow hover:scale-102 active:scale-98' 
                      : 'bg-brand-stone text-brand-brown/30 cursor-not-allowed'
                  }`}
                >
                  <Activity className="w-5 h-5" />
                  Start Day
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* CURRENT STAGE CARD */}
              <div className="bg-white rounded-[3rem] p-6 border-4 border-brand-brown shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-brand-yellow text-brand-brown font-black text-[9px] px-4 py-1.5 uppercase tracking-widest rounded-bl-2xl border-l-2 border-b-2 border-brand-brown flex items-center gap-1.5">
                  <span>Stage: {activeRecord.status}</span>
                  {viewStage && viewStage !== activeRecord.status && (
                    <span className="bg-brand-brown text-brand-yellow px-1.5 py-0.5 rounded text-[8px] font-bold">
                      Viewing: {viewStage}
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-brand-cream h-2 rounded-full mb-8 mt-2 overflow-hidden border border-brand-stone">
                  <div 
                    className="bg-brand-brown h-full transition-all duration-500" 
                    style={{
                      width: `${
                        activeRecord.status === 'Arrived' ? 15 :
                        activeRecord.status === 'AttendanceDone' ? 30 :
                        activeRecord.status === 'OpeningCashAndInventoryDone' ? 50 :
                        activeRecord.status === 'OpeningSOPDone' ? 65 :
                        activeRecord.status === 'Operations' ? 80 :
                        activeRecord.status === 'ClosingStarted' ? 90 :
                        activeRecord.status === 'ClosingDone' ? 95 : 100
                      }%`
                    }}
                  />
                </div>

                {/* Back / Next Navigation */}
                <div className="flex justify-between items-center mb-6">
                  <div className="flex gap-2">
                    {(viewStage !== 'Arrived' || activeRecord.status === 'Arrived') && (
                      <button
                        onClick={handleGoToPreviousStep}
                        className="flex items-center gap-1 bg-brand-cream/60 hover:bg-brand-cream text-brand-brown font-black text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-xl border border-brand-stone active:scale-95 transition-all shadow-sm"
                      >
                        <ChevronLeft className="w-3.5 h-3.5 text-brand-brown" />
                        <span>{activeRecord.status === 'Arrived' ? 'Cancel Day' : 'Back Step'}</span>
                      </button>
                    )}
                    {viewStage !== activeRecord.status && (
                      <button
                        onClick={handleGoToNextStep}
                        className="flex items-center gap-1 bg-brand-cream/60 hover:bg-brand-cream text-brand-brown font-black text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-xl border border-brand-stone active:scale-95 transition-all shadow-sm"
                      >
                        <span>Next Step</span>
                        <ChevronRight className="w-3.5 h-3.5 text-brand-brown" />
                      </button>
                    )}
                  </div>
                  <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest">
                    Step Progress
                  </span>
                </div>

                {/* DYNAMIC CARD CONTENT */}

                {/* STAGE 1: ARRIVED (Pending Attendance) */}
                {viewStage === 'Arrived' && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-brand-cream rounded-2xl text-brand-brown border border-brand-stone">
                        <UserCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest">Stage 2</span>
                        <h3 className="text-lg font-black uppercase text-brand-brown tracking-tight">Staff Attendance</h3>
                      </div>
                    </div>

                    <p className="text-xs text-brand-brown/60 leading-relaxed">
                      Select status of scheduled staff for today. You can proceed if some are late or not arrived yet; reopen attendance later to adjust records.
                    </p>

                    <div className="border border-brand-stone rounded-2xl p-4 bg-brand-cream/30 space-y-2">
                      <p className="text-[10px] font-black text-brand-brown/50 uppercase tracking-widest">Employee Roll Call</p>
                      <div className="space-y-2">
                        {activeRecord.attendance?.map((emp, index) => {
                          const isArrived = emp.status === 'PRESENT' || emp.status === 'LATE';
                          return (
                            <div key={emp.employeeId} className="bg-white p-3 rounded-xl border border-brand-stone/50 space-y-2">
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="text-xs font-black text-brand-brown">{emp.name}</p>
                                  <span className="text-[9px] font-bold text-brand-brown/40 uppercase">
                                    {emp.status === 'NOT_ARRIVED_YET' ? 'Not Arrived Yet' : emp.status}
                                  </span>
                                </div>
                                <select 
                                  value={emp.status}
                                  onChange={(e) => {
                                    const list = [...(activeRecord.attendance || [])];
                                    const val = e.target.value as any;
                                    const now = new Date();
                                    const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                                    list[index] = {
                                      ...list[index],
                                      status: val,
                                      arrivalTime: (val === 'PRESENT' || val === 'LATE') ? formattedTime : undefined
                                    };
                                    saveRecord({ ...activeRecord, attendance: list });
                                  }}
                                  className="text-xs bg-brand-cream border border-brand-stone rounded-lg p-1.5 font-bold text-brand-brown"
                                >
                                  <option value="NOT_ARRIVED_YET">Not Arrived</option>
                                  <option value="PRESENT">Present</option>
                                  <option value="LATE">Late</option>
                                  <option value="ABSENT">Absent</option>
                                </select>
                              </div>
                              {isArrived && (
                                <div className="flex items-center gap-2 pt-2 border-t border-brand-stone/20">
                                  <label className="text-[9px] font-black uppercase text-brand-brown/50 tracking-wider flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    Time of Arrival:
                                  </label>
                                  <input 
                                    type="time"
                                    value={time12To24(emp.arrivalTime || '')}
                                    onChange={(e) => {
                                      const list = [...(activeRecord.attendance || [])];
                                      const time24 = e.target.value;
                                      list[index] = {
                                        ...list[index],
                                        arrivalTime: time24To12(time24)
                                      };
                                      saveRecord({ ...activeRecord, attendance: list });
                                    }}
                                    className="flex-1 text-right text-xs bg-brand-cream/50 border border-brand-stone/50 rounded px-2 py-1 font-bold text-brand-brown focus:bg-white focus:outline-none focus:border-brand-brown cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <button 
                      onClick={handleSaveAttendance}
                      className="w-full bg-brand-brown text-brand-yellow font-black uppercase tracking-widest py-3.5 rounded-xl shadow-md text-xs hover:opacity-90 active:scale-98 transition-all"
                    >
                      Lock Attendance &amp; Continue
                    </button>
                  </div>
                )}

                {/* STAGE 2: ATTENDANCE DONE (Pending Opening Cash & Inventory) */}
                {viewStage === 'AttendanceDone' && (
                  <OpeningCashAndInventoryView 
                    previousClosingCash={prevClosingRecord ? (prevClosingRecord.closingCash || 5000) : 5000}
                    initialInventory={activeRecord.openingInventory}
                    onSave={(cash, reason, inv) => handleSaveOpeningCashAndInventory(cash, reason, inv)}
                    initialCash={activeRecord.openingCash}
                    initialCashDiscrepancyReason={activeRecord.openingCashDiscrepancyReason}
                  />
                )}

                {/* STAGE 3: OPENING VERIFICATION DONE (Pending Opening SOP Checklist) */}
                {viewStage === 'OpeningCashAndInventoryDone' && (
                  <OpeningSopView 
                    initialSop={activeRecord.openingSopChecklist}
                    initialPhotos={activeRecord.openingSopPhotos}
                    onSave={(sop, photos) => handleSaveOpeningSOP(sop, photos)}
                  />
                )}

                {/* STAGE 4: MAIN OPERATIONS DASHBOARD (Store is open and active) */}
                {viewStage === 'Operations' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center bg-emerald-50 border border-emerald-200 p-4 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        <div>
                          <p className="text-xs font-black text-emerald-800 uppercase tracking-widest">Store Open &amp; Active</p>
                          <p className="text-[10px] text-emerald-600 font-bold">Opened at {activeRecord.openingSopTime ? new Date(activeRecord.openingSopTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</p>
                        </div>
                      </div>

                      {/* Ability to reopen attendance */}
                      <button 
                        onClick={() => setOpenAttendanceModal(true)}
                        className="bg-brand-brown text-brand-yellow font-black text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all"
                      >
                        Attendance ({activeRecord.attendance?.filter(a => a.status === 'NOT_ARRIVED_YET').length} Unmarked)
                      </button>
                    </div>

                    {/* Quick Log Forms buttons */}
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black uppercase text-brand-brown/50 tracking-widest">Business Incident Logger</h4>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => setShowEventModal('complaint')}
                          className="bg-brand-cream border border-brand-stone hover:border-brand-brown p-3.5 rounded-xl text-center transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
                        >
                          <span className="text-xs font-black text-brand-brown">⚠️ Complaint</span>
                        </button>
                        <button 
                          onClick={() => setShowEventModal('staff')}
                          className="bg-brand-cream border border-brand-stone hover:border-brand-brown p-3.5 rounded-xl text-center transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
                        >
                          <span className="text-xs font-black text-brand-brown">🧑 Staff Issue</span>
                        </button>
                        <button 
                          onClick={() => setShowEventModal('equipment')}
                          className="bg-brand-cream border border-brand-stone hover:border-brand-brown p-3.5 rounded-xl text-center transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
                        >
                          <span className="text-xs font-black text-brand-brown">⚙️ Equipment</span>
                        </button>
                        <button 
                          onClick={() => setShowEventModal('wastage')}
                          className="bg-brand-cream border border-brand-stone hover:border-brand-brown p-3.5 rounded-xl text-center transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
                        >
                          <span className="text-xs font-black text-brand-brown">🥗 Food Waste</span>
                        </button>
                      </div>
                    </div>

                    {/* Active events logged list */}
                    {activeRecord.events?.length > 0 && (
                      <div className="border border-brand-stone bg-brand-cream/10 rounded-2xl p-4 space-y-2">
                        <p className="text-[9px] font-black uppercase text-brand-brown/50 tracking-widest">Today's Logged Incidents ({activeRecord.events.length})</p>
                        <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                          {activeRecord.events.map((ev) => (
                            <div key={ev.id} className="bg-white p-2.5 rounded-lg border border-brand-stone/30 flex justify-between items-start gap-2">
                              <div>
                                <span className={`inline-block text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                                  ev.type === 'COMPLAINT' ? 'bg-amber-100 text-amber-700' :
                                  ev.type === 'STAFF' ? 'bg-blue-100 text-blue-700' :
                                  ev.type === 'EQUIPMENT' ? 'bg-red-100 text-red-700' :
                                  'bg-zinc-100 text-zinc-700'
                                }`}>
                                  {ev.type}
                                </span>
                                <p className="text-[11px] font-bold text-brand-brown mt-1">
                                  {ev.type === 'COMPLAINT' ? ev.details.complaint :
                                   ev.type === 'STAFF' ? ev.details.remarks :
                                   ev.type === 'EQUIPMENT' ? ev.details.remarks :
                                   `${ev.details.item} (${ev.details.quantity} ${ev.details.reason})`}
                                </p>
                              </div>
                              <button 
                                onClick={() => {
                                  saveRecord({
                                    ...activeRecord,
                                    events: activeRecord.events.filter(e => e.id !== ev.id)
                                  });
                                }}
                                className="text-brand-red hover:opacity-80"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Start Closing Sequence Trigger */}
                    <button 
                      onClick={handleStartClosing}
                      className="w-full bg-brand-brown text-brand-yellow font-black uppercase tracking-widest py-4 rounded-2xl shadow-xl hover:scale-102 active:scale-98 transition-all text-sm flex items-center justify-center gap-2"
                    >
                      <Clock className="w-4 h-4" />
                      Start Closing (10:30 PM)
                    </button>
                  </div>
                )}

                {/* STAGE 5: CLOSING CHECKLIST & REVIEW COUNTS */}
                {viewStage === 'ClosingStarted' && (
                  <ClosingSopAndReviewsView 
                    initialSop={activeRecord.closingSopChecklist}
                    initialReviews={activeRecord.googleReviewsCount}
                    initialNotes={activeRecord.managerNotes}
                    onSave={(sop, reviews, notes) => handleSaveClosingSOP(sop, reviews, notes)}
                  />
                )}

                {/* STAGE 6: CLOSING VERIFICATION (Cash/UPI actual entry vs calculations) */}
                {viewStage === 'ClosingDone' && (
                  <ClosingVerificationView 
                    openingCash={activeRecord.openingCash || 0}
                    posCashSales={posSales.cash}
                    posUpiSales={posSales.upi}
                    initialCash={activeRecord.closingCash}
                    initialUpi={activeRecord.closingUpi}
                    initialDiscrepancyReason={activeRecord.closingDiscrepancyReason}
                    initialPhoto={activeRecord.closingPhoto}
                    onSave={(cash, upi, reason, photo) => handleCloseStore(cash, upi, reason, photo)}
                  />
                )}

                {/* STAGE 7: CLOSED (Day Complete) */}
                {viewStage === 'Closed' && (
                  <div className="text-center space-y-6 py-6">
                    <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto text-zinc-500 border border-brand-stone">
                      <Check className="w-8 h-8" />
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-xl font-black uppercase text-brand-brown tracking-tight">Day Operations Finished</h3>
                      <p className="text-xs text-brand-brown/60">The store operations for this date have been logged and closed successfully.</p>
                    </div>

                    <button 
                      onClick={() => handleTriggerReport(activeRecord)}
                      className="w-full bg-brand-yellow text-brand-brown font-black uppercase tracking-widest py-3.5 rounded-xl shadow-md text-xs hover:scale-102 active:scale-98 transition-all flex items-center justify-center gap-1.5"
                    >
                      <FileText className="w-4 h-4" />
                      Generate Daily Report
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------
          MODALS / DRAWERS / REPORT LIGHTBOXES
          ------------------------------------------------------------- */}

      {/* REOPEN ATTENDANCE MODAL DURING ONGOING DAY */}
      {openAttendanceModal && activeRecord && (
        <div className="fixed inset-0 bg-brand-brown/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-sm border-4 border-brand-brown p-6 space-y-4">
            <h3 className="text-lg font-black uppercase text-brand-brown tracking-wider">Update Attendance Roll</h3>
            <p className="text-xs text-brand-brown/50">Modify or mark employees who have recently arrived at the store.</p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {activeRecord.attendance?.map((emp, index) => {
                const isArrived = emp.status === 'PRESENT' || emp.status === 'LATE';
                return (
                  <div key={emp.employeeId} className="bg-brand-cream/30 p-2.5 rounded-lg border border-brand-stone space-y-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs font-black text-brand-brown">{emp.name}</p>
                        <span className="text-[9px] font-bold text-brand-brown/40 uppercase">{emp.status}</span>
                      </div>
                      <select 
                        value={emp.status}
                        onChange={(e) => {
                          const list = [...(activeRecord.attendance || [])];
                          const val = e.target.value as any;
                          const now = new Date();
                          const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                          list[index] = {
                            ...list[index],
                            status: val,
                            arrivalTime: (val === 'PRESENT' || val === 'LATE') ? formattedTime : undefined
                          };
                          saveRecord({ ...activeRecord, attendance: list });
                        }}
                        className="text-xs bg-white border border-brand-stone rounded-lg p-1 font-bold"
                      >
                        <option value="NOT_ARRIVED_YET">Not Arrived</option>
                        <option value="PRESENT">Present</option>
                        <option value="LATE">Late</option>
                        <option value="ABSENT">Absent</option>
                      </select>
                    </div>
                    {isArrived && (
                      <div className="flex items-center gap-2 pt-1.5 border-t border-brand-stone/20">
                        <label className="text-[9px] font-black uppercase text-brand-brown/50 tracking-wider flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Time:
                        </label>
                        <input 
                          type="time"
                          value={time12To24(emp.arrivalTime || '')}
                          onChange={(e) => {
                            const list = [...(activeRecord.attendance || [])];
                            const time24 = e.target.value;
                            list[index] = {
                              ...list[index],
                              arrivalTime: time24To12(time24)
                            };
                            saveRecord({ ...activeRecord, attendance: list });
                          }}
                          className="flex-1 text-right text-xs bg-white border border-brand-stone/50 rounded px-2 py-0.5 font-bold text-brand-brown focus:outline-none focus:border-brand-brown cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => setOpenAttendanceModal(false)}
                className="flex-1 bg-brand-cream border border-brand-stone text-brand-brown font-black uppercase text-[10px] tracking-widest py-3 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INCIDENT LOGGER MODAL */}
      {showEventModal && (
        <div className="fixed inset-0 bg-brand-brown/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] w-full max-w-sm border-4 border-brand-brown p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black uppercase text-brand-brown tracking-wider">
                Log {showEventModal.toUpperCase()} Incident
              </h3>
              <button onClick={() => setShowEventModal(null)} className="text-brand-brown/40 font-black text-base hover:text-brand-brown">✕</button>
            </div>

            {/* Complaint Form */}
            {showEventModal === 'complaint' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-black text-[9px] uppercase text-brand-brown/60 mb-1">Customer Name (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="E.g., Amit Kumar" 
                    value={eventCustomerName}
                    onChange={(e) => setEventCustomerName(e.target.value)}
                    className="w-full bg-brand-cream/50 border border-brand-stone rounded-xl p-2.5 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-black text-[9px] uppercase text-brand-brown/60 mb-1">Complaint Details</label>
                  <textarea 
                    rows={3} 
                    placeholder="Describe complaint here..." 
                    value={eventText}
                    onChange={(e) => setEventText(e.target.value)}
                    className="w-full bg-brand-cream/50 border border-brand-stone rounded-xl p-2.5 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-black text-[9px] uppercase text-brand-brown/60 mb-1">Immediate Resolution Provided</label>
                  <input 
                    type="text" 
                    placeholder="E.g., Free momo offered &amp; replaced plate" 
                    value={eventResolution}
                    onChange={(e) => setEventResolution(e.target.value)}
                    className="w-full bg-brand-cream/50 border border-brand-stone rounded-xl p-2.5 font-bold"
                  />
                </div>
              </div>
            )}

            {/* Staff Issue Form */}
            {showEventModal === 'staff' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-black text-[9px] uppercase text-brand-brown/60 mb-1">Issue Category</label>
                  <select 
                    value={eventTypeSelection} 
                    onChange={(e) => setEventTypeSelection(e.target.value)}
                    className="w-full bg-brand-cream/50 border border-brand-stone rounded-xl p-2.5 font-bold"
                  >
                    <option value="">Select Category</option>
                    <option value="Late arrival">Late arrival</option>
                    <option value="Absent">Absenteeism</option>
                    <option value="Behaviour">Inappropriate Behaviour</option>
                    <option value="Training needed">Training Needed</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-black text-[9px] uppercase text-brand-brown/60 mb-1">Issue Remarks</label>
                  <textarea 
                    rows={3} 
                    placeholder="Describe employee incident details..." 
                    value={eventText}
                    onChange={(e) => setEventText(e.target.value)}
                    className="w-full bg-brand-cream/50 border border-brand-stone rounded-xl p-2.5 font-bold"
                  />
                </div>
              </div>
            )}

            {/* Equipment Issue Form */}
            {showEventModal === 'equipment' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-black text-[9px] uppercase text-brand-brown/60 mb-1">Equipment / System Affected</label>
                  <select 
                    value={eventTypeSelection} 
                    onChange={(e) => setEventTypeSelection(e.target.value)}
                    className="w-full bg-brand-cream/50 border border-brand-stone rounded-xl p-2.5 font-bold"
                  >
                    <option value="">Select Equipment</option>
                    <option value="POS">POS Terminal / Printer</option>
                    <option value="Internet">Internet/Wi-Fi router</option>
                    <option value="Freezer">Freezer / Refrigerator</option>
                    <option value="Gas">Gas cylinder/Stove</option>
                    <option value="Lights">Main Lights / Fan</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-black text-[9px] uppercase text-brand-brown/60 mb-1">Fault Description</label>
                  <textarea 
                    rows={3} 
                    placeholder="Describe problem details here..." 
                    value={eventText}
                    onChange={(e) => setEventText(e.target.value)}
                    className="w-full bg-brand-cream/50 border border-brand-stone rounded-xl p-2.5 font-bold"
                  />
                </div>
              </div>
            )}

            {/* Food Wastage Form */}
            {showEventModal === 'wastage' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-black text-[9px] uppercase text-brand-brown/60 mb-1">Raw Material Item</label>
                  <select 
                    value={eventItem} 
                    onChange={(e) => setEventItem(e.target.value)}
                    className="w-full bg-brand-cream/50 border border-brand-stone rounded-xl p-2.5 font-bold"
                  >
                    <option value="">Select Material</option>
                    {RAW_MATERIALS_LIST.map(m => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-black text-[9px] uppercase text-brand-brown/60 mb-1">Wasted Quantity</label>
                  <input 
                    type="number" 
                    placeholder="E.g., 15" 
                    value={eventQty}
                    onChange={(e) => setEventQty(e.target.value)}
                    className="w-full bg-brand-cream/50 border border-brand-stone rounded-xl p-2.5 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-black text-[9px] uppercase text-brand-brown/60 mb-1">Reason for Wastage</label>
                  <input 
                    type="text" 
                    placeholder="E.g., Dropped on floor / stale" 
                    value={eventText}
                    onChange={(e) => setEventText(e.target.value)}
                    className="w-full bg-brand-cream/50 border border-brand-stone rounded-xl p-2.5 font-bold"
                  />
                </div>
              </div>
            )}

            <button 
              onClick={() => handleAddEvent(showEventModal.toUpperCase() as any)}
              className="w-full bg-brand-brown text-brand-yellow font-black uppercase text-xs tracking-widest py-3.5 rounded-xl transition-all hover:opacity-90 active:scale-97"
            >
              Add Log Entry
            </button>
          </div>
        </div>
      )}

      {/* QUICK VIEW RECORD DETAILS MODAL */}
      {viewingRecord && !showReport && (
        <div className="fixed inset-0 bg-brand-brown/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-lg border-4 border-brand-brown p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-stone pb-3">
              <div>
                <h3 className="text-lg font-black uppercase text-brand-brown tracking-wide">{viewingRecord.branchName} Daily Log</h3>
                <p className="text-xs text-brand-brown/50">Date: {viewingRecord.date}</p>
              </div>
              <button onClick={() => setViewingRecord(null)} className="text-brand-brown font-black text-xl">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-brand-cream/30 p-3 rounded-xl border border-brand-stone">
                  <p className="font-black text-[9px] uppercase text-brand-brown/40">Status</p>
                  <p className="font-black text-brand-brown">{viewingRecord.status}</p>
                </div>
                <div className="bg-brand-cream/30 p-3 rounded-xl border border-brand-stone">
                  <p className="font-black text-[9px] uppercase text-brand-brown/40">Manager</p>
                  <p className="font-black text-brand-brown">{viewingRecord.managerName}</p>
                </div>
              </div>

              {/* Attendance quick view */}
              <div className="space-y-1">
                <p className="font-black text-[9px] uppercase text-brand-brown/50">Staff Attendance Summary</p>
                <div className="bg-brand-cream/15 rounded-xl border border-brand-stone p-3 space-y-1">
                  {viewingRecord.attendance?.map(a => (
                    <div key={a.employeeId} className="flex justify-between">
                      <span className="font-medium text-brand-brown">{a.name}</span>
                      <span className={`font-black ${a.status === 'ABSENT' ? 'text-brand-red' : 'text-emerald-700'}`}>{a.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cash Verification */}
              <div className="space-y-1">
                <p className="font-black text-[9px] uppercase text-brand-brown/50">Finances &amp; Cash Reconciliation</p>
                <div className="bg-brand-cream/15 rounded-xl border border-brand-stone p-3 grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-brand-brown/50 uppercase">Opening Cash</span>
                    <p className="font-black text-brand-brown">₹{viewingRecord.openingCash || 0}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-brand-brown/50 uppercase">Closing Cash</span>
                    <p className="font-black text-brand-brown">₹{viewingRecord.closingCash || 0}</p>
                  </div>
                </div>
              </div>

              {/* Photos layout */}
              <div className="space-y-1">
                <p className="font-black text-[9px] uppercase text-brand-brown/50">Stored Images</p>
                <div className="grid grid-cols-3 gap-2">
                  {viewingRecord.openingPhoto && (
                    <div className="border border-brand-stone rounded-lg overflow-hidden h-16">
                      <img src={viewingRecord.openingPhoto} alt="Opening Shutter" className="w-full h-full object-cover" />
                    </div>
                  )}
                  {viewingRecord.openingSopPhotos?.[0] && (
                    <div className="border border-brand-stone rounded-lg overflow-hidden h-16">
                      <img src={viewingRecord.openingSopPhotos[0]} alt="Opening Ready Counter" className="w-full h-full object-cover" />
                    </div>
                  )}
                  {viewingRecord.closingPhoto && (
                    <div className="border border-brand-stone rounded-lg overflow-hidden h-16">
                      <img src={viewingRecord.closingPhoto} alt="Closing Store" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button 
              onClick={() => setViewingRecord(null)}
              className="w-full bg-brand-brown text-white font-black uppercase text-xs py-3 rounded-xl hover:opacity-90"
            >
              Dismiss View
            </button>
          </div>
        </div>
      )}

      {/* DETAILED DAILY REPORT / PDF VIEW MODAL */}
      {showReport && viewingRecord && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md z-50 overflow-y-auto p-4 flex justify-center items-start pt-10">
          <div className="bg-white rounded-[3rem] w-full max-w-3xl border-8 border-brand-brown shadow-2xl relative p-6 md:p-12 space-y-8 print:border-none print:shadow-none print:p-0 print:m-0">
            {/* Close actions */}
            <div className="flex justify-between items-center gap-2 border-b-2 border-brand-stone pb-6 print:hidden">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand-yellow" />
                <span className="text-xs font-black uppercase tracking-widest text-brand-brown/50">Daily Operations Report Creator</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={handlePrintReport}
                  className="bg-brand-brown text-brand-yellow font-black text-xs uppercase tracking-widest px-6 py-3 rounded-xl hover:scale-103 active:scale-97 transition-all flex items-center gap-1.5 shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  Print Report
                </button>
                <button 
                  onClick={handleDownloadPDF}
                  disabled={isDownloadingPdf}
                  className="bg-brand-brown text-white font-black text-xs uppercase tracking-widest px-6 py-3 rounded-xl hover:scale-103 active:scale-97 transition-all flex items-center gap-1.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDownloadingPdf ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download as PDF
                </button>
                <button 
                  onClick={() => { setShowReport(false); setViewingRecord(null); }}
                  className="bg-brand-cream border-2 border-brand-stone text-brand-brown font-black text-xs uppercase tracking-widest px-4 py-3 rounded-xl hover:bg-brand-stone/10"
                >
                  Close
                </button>
              </div>
            </div>

            {/* PRINTABLE REPORT LAYOUT CONTENT */}
            <div id="printable-area" className="space-y-8">
              {/* Report Header */}
              <div className="flex justify-between items-start gap-4 border-b-4 border-brand-brown pb-6">
                <div>
                  <h1 className="text-3xl font-black uppercase tracking-tight text-brand-brown italic">minmomos</h1>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-brown/50 mt-1">Official Daily Operational Audit</p>
                </div>
                <div className="text-right">
                  <span className="bg-brand-brown text-brand-yellow text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full inline-block mb-1">
                    {viewingRecord.branchName}
                  </span>
                  <p className="text-xs font-bold text-brand-brown mt-1">Audit Date: {viewingRecord.date}</p>
                </div>
              </div>

              {/* Audit Summary Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-brand-cream/30 p-4 rounded-2xl border border-brand-stone">
                  <span className="text-[9px] font-black uppercase text-brand-brown/50 tracking-wider">Manager in Duty</span>
                  <p className="text-sm font-black text-brand-brown mt-1">{viewingRecord.managerName}</p>
                </div>
                <div className="bg-brand-cream/30 p-4 rounded-2xl border border-brand-stone">
                  <span className="text-[9px] font-black uppercase text-brand-brown/50 tracking-wider">Hours Operated</span>
                  <p className="text-sm font-black text-brand-brown mt-1">{calculateHoursOperated(viewingRecord)}</p>
                </div>
                <div className="bg-brand-cream/30 p-4 rounded-2xl border border-brand-stone">
                  <span className="text-[9px] font-black uppercase text-brand-brown/50 tracking-wider">Opening SOPs</span>
                  <p className="text-sm font-black text-emerald-700 mt-1">{getSopPercent(viewingRecord.openingSopChecklist)}% Done</p>
                </div>
                <div className="bg-brand-cream/30 p-4 rounded-2xl border border-brand-stone">
                  <span className="text-[9px] font-black uppercase text-brand-brown/50 tracking-wider">Closing SOPs</span>
                  <p className="text-sm font-black text-emerald-700 mt-1">{getSopPercent(viewingRecord.closingSopChecklist)}% Done</p>
                </div>
              </div>

              {/* Time stamps */}
              <div className="bg-zinc-50 rounded-2xl p-4 border border-brand-stone grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-bold text-brand-brown/70">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand-yellow/80" />
                  <span><strong>Store Opened:</strong> {viewingRecord.openingTime ? getISTFullDateTime(viewingRecord.openingTime) : '--'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand-yellow/80" />
                  <span><strong>Store Closed:</strong> {viewingRecord.closingTime ? getISTFullDateTime(viewingRecord.closingTime) : '--'}</span>
                </div>
              </div>

              {/* Attendance Summary */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-brand-brown border-b border-brand-stone pb-1">Staff Attendance Logs</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {viewingRecord.attendance?.map(staff => (
                    <div key={staff.employeeId} className="flex justify-between p-3 bg-brand-cream/10 border border-brand-stone/40 rounded-xl">
                      <div>
                        <p className="font-black text-brand-brown">{staff.name}</p>
                        <p className="text-[9px] text-brand-brown/50">Arrival: {staff.arrivalTime || 'N/A'}</p>
                      </div>
                      <span className={`font-black uppercase tracking-widest text-[10px] self-center px-2 py-0.5 rounded ${
                        staff.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-700' :
                        staff.status === 'LATE' ? 'bg-amber-100 text-amber-700' :
                        'bg-zinc-100 text-zinc-600'
                      }`}>
                        {staff.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cash Reconciliation Details */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-brand-brown border-b border-brand-stone pb-1">Cash Reconciliation Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="bg-brand-cream/10 border border-brand-stone rounded-2xl p-4 space-y-2">
                    <p className="font-black text-[9px] uppercase tracking-widest text-brand-brown/50">Opening Session Cash</p>
                    <div className="flex justify-between">
                      <span className="font-medium text-brand-brown">Opening Cash:</span>
                      <span className="font-black text-brand-brown">₹{viewingRecord.openingCash || 0}</span>
                    </div>
                    {viewingRecord.openingCashDiscrepancyReason && (
                      <p className="text-[10px] text-brand-red bg-brand-red/5 p-2 rounded-lg border border-brand-red/20">
                        <strong>Reason:</strong> {viewingRecord.openingCashDiscrepancyReason}
                      </p>
                    )}
                  </div>

                  <div className="bg-brand-cream/10 border border-brand-stone rounded-2xl p-4 space-y-2">
                    <p className="font-black text-[9px] uppercase tracking-widest text-brand-brown/50">Closing Session Cash / UPI</p>
                    <div className="flex justify-between">
                      <span className="font-medium text-brand-brown">Closing Cash Actual:</span>
                      <span className="font-black text-brand-brown">₹{viewingRecord.closingCash || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-brand-brown">Closing UPI Actual:</span>
                      <span className="font-black text-brand-brown">₹{viewingRecord.closingUpi || 0}</span>
                    </div>
                    {viewingRecord.closingDiscrepancyReason && (
                      <p className="text-[10px] text-brand-red bg-brand-red/5 p-2 rounded-lg border border-brand-red/20">
                        <strong>Reason:</strong> {viewingRecord.closingDiscrepancyReason}
                      </p>
                    )}
                  </div>
                </div>
              </div>


              {/* Logged incidents & Operational Events */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-brand-brown border-b border-brand-stone pb-1">Today's Incident logs</h3>
                {viewingRecord.events && viewingRecord.events.length > 0 ? (
                  <div className="space-y-3">
                    {viewingRecord.events.map((ev, index) => (
                      <div key={index} className="bg-brand-cream/10 border border-brand-stone p-4 rounded-2xl flex flex-wrap justify-between gap-4 text-xs">
                        <div>
                          <span className="font-black uppercase tracking-widest text-[9px] px-2 py-0.5 rounded bg-brand-brown text-brand-yellow mb-2 inline-block">
                            {ev.type}
                          </span>
                          <p className="font-black text-brand-brown">
                            {ev.type === 'COMPLAINT' ? `Complaint: ${ev.details.complaint}` :
                             ev.type === 'STAFF' ? `Staff Incident: ${ev.details.remarks}` :
                             ev.type === 'EQUIPMENT' ? `Equipment issue: ${ev.details.remarks}` :
                             `Wastage of ${ev.details.item}: ${ev.details.quantity} pcs (${ev.details.reason})`}
                          </p>
                          {ev.details.resolution && (
                            <p className="text-[11px] text-emerald-800 mt-1 font-bold">
                              <strong>Resolution:</strong> {ev.details.resolution}
                            </p>
                          )}
                          {ev.details.customerName && (
                            <span className="text-[10px] text-brand-brown/40 block mt-1">Customer: {ev.details.customerName}</span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-brand-brown/40 self-end">
                          {new Date(ev.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                    ✓ Clean Audit: Zero incidents, complaints, equipment faults or food wastage were reported today.
                  </p>
                )}
              </div>

              {/* Day reviews & notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-bold text-brand-brown">
                <div className="bg-brand-cream/10 border border-brand-stone p-4 rounded-2xl">
                  <span className="text-[9px] font-black uppercase text-brand-brown/50 tracking-widest block mb-2">Google Reviews Obtained</span>
                  <div className="flex items-center gap-1">
                    <Star className="w-5 h-5 text-brand-yellow fill-brand-yellow" />
                    <span className="text-xl font-black">{viewingRecord.googleReviewsCount || 0} Reviews</span>
                  </div>
                </div>
                <div className="bg-brand-cream/10 border border-brand-stone p-4 rounded-2xl">
                  <span className="text-[9px] font-black uppercase text-brand-brown/50 tracking-widest block mb-2">Manager Shift Notes</span>
                  <p className="italic text-brand-brown/80 font-medium">{viewingRecord.managerNotes || 'No notes left for today.'}</p>
                </div>
              </div>

              {/* WEEK-OVER-WEEK PERFORMANCE COMPARISON */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-brand-brown border-b border-brand-stone pb-1">Weekly Performance Comparison (WoW)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-black">
                  <div className="bg-brand-cream/20 p-4 rounded-2xl border border-brand-stone space-y-1">
                    <span className="text-[9px] uppercase text-brand-brown/50">Google Reviews Obtained</span>
                    <p className="text-lg text-brand-brown">{viewingRecord.googleReviewsCount} Today</p>
                    <p className="text-[10px] text-brand-brown/40">Last week: {reportReferenceRecord ? reportReferenceRecord.googleReviewsCount : 0}</p>
                  </div>

                  <div className="bg-brand-cream/20 p-4 rounded-2xl border border-brand-stone space-y-1">
                    <span className="text-[9px] uppercase text-brand-brown/50">Attendance Discipline</span>
                    <p className="text-lg text-emerald-700">
                      {viewingRecord.attendance?.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length || 0} Present
                    </p>
                    <p className="text-[10px] text-brand-brown/40">
                      Late/Absent: {viewingRecord.attendance?.filter(a => a.status === 'LATE' || a.status === 'ABSENT').length || 0}
                    </p>
                  </div>

                  <div className="bg-brand-cream/20 p-4 rounded-2xl border border-brand-stone space-y-1">
                    <span className="text-[9px] uppercase text-brand-brown/50">Operations Health</span>
                    <p className="text-lg text-brand-brown">
                      {viewingRecord.events?.length || 0} Incident Reports
                    </p>
                    <p className="text-[10px] text-emerald-700">
                      {reportReferenceRecord ? `${reportReferenceRecord.events?.length || 0} incidents last week` : 'No prev record'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Photos Gallery */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-brand-brown border-b border-brand-stone pb-1">Audit Photo Verification Gallery</h3>
                <div className="grid grid-cols-3 gap-4">
                  {viewingRecord.openingPhoto && (
                    <div className="space-y-1 text-center">
                      <p className="text-[8px] font-black uppercase text-brand-brown/50">Front/Shutter Opening</p>
                      <div className="border border-brand-stone rounded-xl overflow-hidden h-32 bg-zinc-100">
                        <img src={viewingRecord.openingPhoto} alt="Opening Shutter" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  )}
                  {viewingRecord.openingSopPhotos?.[0] && (
                    <div className="space-y-1 text-center">
                      <p className="text-[8px] font-black uppercase text-brand-brown/50">Store Counter Ready</p>
                      <div className="border border-brand-stone rounded-xl overflow-hidden h-32 bg-zinc-100">
                        <img src={viewingRecord.openingSopPhotos[0]} alt="Store Ready" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  )}
                  {viewingRecord.closingPhoto && (
                    <div className="space-y-1 text-center">
                      <p className="text-[8px] font-black uppercase text-brand-brown/50">Store Shutter Closing</p>
                      <div className="border border-brand-stone rounded-xl overflow-hidden h-32 bg-zinc-100">
                        <img src={viewingRecord.closingPhoto} alt="Store Closed" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer signatures */}
              <div className="pt-8 border-t-2 border-brand-stone flex justify-between items-end text-[10px] font-black uppercase text-brand-brown/40">
                <span>Logged by {viewingRecord.managerName}</span>
                <span>Audit Signature Verified</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeCameraTarget === 'opening' && (
        <CameraCapture 
          title="Take Shutter Opening Photo"
          onCapture={(base64) => {
            if (activeRecord) {
              saveRecord({
                ...activeRecord,
                openingPhoto: base64
              });
            } else {
              setTempOpeningPhoto(base64);
            }
            setActiveCameraTarget(null);
          }}
          onClose={() => setActiveCameraTarget(null)}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// CHILD VIEWS & COMPONENTS FOR THE DIFFERENT WORKFLOW STAGES
// -------------------------------------------------------------

// STAGE 2 & 3: Opening Cash and Inventory Entry View
interface OpeningCashAndInventoryViewProps {
  previousClosingCash: number;
  initialInventory: DailyOpInventoryItem[];
  onSave: (cash: number, discrepancyReason: string, inventory: DailyOpInventoryItem[]) => void;
  initialCash?: number;
  initialCashDiscrepancyReason?: string;
}

function OpeningCashAndInventoryView({ previousClosingCash, initialInventory, onSave, initialCash, initialCashDiscrepancyReason }: OpeningCashAndInventoryViewProps) {
  const [cash, setCash] = useState<string>(initialCash !== undefined ? initialCash.toString() : previousClosingCash.toString());
  const [cashDiscrepancyReason, setCashDiscrepancyReason] = useState<string>(initialCashDiscrepancyReason || '');

  useEffect(() => {
    if (initialCash !== undefined) {
      setCash(initialCash.toString());
    } else {
      setCash(previousClosingCash.toString());
    }
  }, [initialCash, previousClosingCash]);

  useEffect(() => {
    setCashDiscrepancyReason(initialCashDiscrepancyReason || '');
  }, [initialCashDiscrepancyReason]);

  const needsCashReason = useMemo(() => {
    return Number(cash) !== previousClosingCash;
  }, [cash, previousClosingCash]);

  const canContinue = useMemo(() => {
    const cashReasonOk = !needsCashReason || cashDiscrepancyReason.trim().length > 0;
    return cashReasonOk && cash !== '';
  }, [needsCashReason, cashDiscrepancyReason, cash]);

  const handleSave = () => {
    if (!canContinue) return;
    const reconciledInventory = initialInventory.map(item => ({
      ...item,
      actualQty: item.expectedQty,
      reason: ''
    }));
    onSave(Number(cash), cashDiscrepancyReason, reconciledInventory);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-brand-cream rounded-2xl text-brand-brown border border-brand-stone">
          <Coins className="w-6 h-6" />
        </div>
        <div>
          <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest">Stage 3</span>
          <h3 className="text-lg font-black uppercase text-brand-brown tracking-tight">Drawer Cash Verification</h3>
        </div>
      </div>

      <p className="text-xs text-brand-brown/60 leading-relaxed">
        Count the opening cash float in the drawer before taking customers.
      </p>

      {/* Opening Cash Input */}
      <div className="border border-brand-stone rounded-2xl p-4 bg-brand-cream/30 space-y-3">
        <div className="flex justify-between items-center">
          <label className="block text-[10px] font-black uppercase text-brand-brown/50 tracking-widest">Enter Drawer Opening Cash</label>
          <span className="text-[9px] font-bold text-emerald-700 uppercase">Expected: ₹{previousClosingCash}</span>
        </div>
        
        <input 
          type="number"
          value={cash}
          onChange={(e) => setCash(e.target.value)}
          placeholder="Enter Cash"
          className="w-full bg-white border-2 border-brand-stone p-3 rounded-xl font-black text-brand-brown text-base"
        />

        {needsCashReason && (
          <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
            <span className="block text-[9px] font-black text-brand-red uppercase tracking-wider">⚠️ Cash Discrepancy Reason Required</span>
            <input 
              type="text"
              value={cashDiscrepancyReason}
              onChange={(e) => setCashDiscrepancyReason(e.target.value)}
              placeholder="Why does the drawer cash differ?"
              className="w-full bg-brand-red/5 border border-brand-red/30 p-2.5 rounded-lg text-xs font-bold text-brand-brown"
            />
          </div>
        )}
      </div>

      <button 
        onClick={handleSave}
        disabled={!canContinue}
        className={`w-full font-black uppercase tracking-widest py-3.5 rounded-xl shadow-md text-xs transition-all ${
          canContinue 
            ? 'bg-brand-brown text-brand-yellow hover:scale-102 active:scale-98' 
            : 'bg-brand-stone text-brand-brown/35 cursor-not-allowed'
        }`}
      >
        Lock Opening Cash
      </button>
    </div>
  );
}

// STAGE 4: Opening SOP view
interface OpeningSopViewProps {
  onSave: (sop: { task: string; completed: boolean }[], photos: string[]) => void;
  initialSop?: { task: string; completed: boolean }[];
  initialPhotos?: string[];
}

function OpeningSopView({ onSave, initialSop, initialPhotos }: OpeningSopViewProps) {
  const [checklist, setChecklist] = useState<{ task: string; completed: boolean }[]>(
    initialSop && initialSop.length > 0
      ? initialSop
      : OPENING_SOP_TASKS.map(task => ({ task, completed: false }))
  );
  
  // Sequential photos
  const [counterPhoto, setCounterPhoto] = useState<string>(
    initialPhotos && initialPhotos[0] ? initialPhotos[0] : ''
  );
  const [storePhoto, setStorePhoto] = useState<string>(
    initialPhotos && initialPhotos[1] ? initialPhotos[1] : ''
  );
  const [activeCameraTarget, setActiveCameraTarget] = useState<'counter' | 'store' | null>(null);

  useEffect(() => {
    if (initialSop && initialSop.length > 0) {
      setChecklist(initialSop);
    } else {
      setChecklist(OPENING_SOP_TASKS.map(task => ({ task, completed: false })));
    }
  }, [initialSop]);

  useEffect(() => {
    setCounterPhoto(initialPhotos && initialPhotos[0] ? initialPhotos[0] : '');
    setStorePhoto(initialPhotos && initialPhotos[1] ? initialPhotos[1] : '');
  }, [initialPhotos]);
  
  // Step state (1: Checklist, 2: Counter Photo, 3: Store Photo)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const completedCount = useMemo(() => {
    return checklist.filter(c => c.completed).length;
  }, [checklist]);

  const allTasksChecked = useMemo(() => {
    return completedCount === checklist.length;
  }, [completedCount, checklist]);

  const handleToggle = (index: number) => {
    const next = [...checklist];
    next[index].completed = !next[index].completed;
    setChecklist(next);
  };

  const handleCheckAll = () => {
    setChecklist(OPENING_SOP_TASKS.map(task => ({ task, completed: true })));
  };

  const handleUncheckAll = () => {
    setChecklist(OPENING_SOP_TASKS.map(task => ({ task, completed: false })));
  };

  const handleSave = () => {
    if (!allTasksChecked || !counterPhoto || !storePhoto) return;
    onSave(checklist, [counterPhoto, storePhoto]);
  };

  return (
    <div className="space-y-6">
      {/* Stage Header */}
      <div className="flex items-center justify-between border-b border-brand-stone pb-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-cream rounded-2xl text-brand-brown border border-brand-stone">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest">Stage 4</span>
            <h3 className="text-lg font-black uppercase text-brand-brown tracking-tight">Store Opening</h3>
          </div>
        </div>
        
        {/* Simple step indicators */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2.5 h-2.5 rounded-full border border-brand-brown ${step >= 1 ? 'bg-brand-brown' : 'bg-transparent'}`} />
          <div className={`w-2.5 h-2.5 rounded-full border border-brand-brown ${step >= 2 ? 'bg-brand-brown' : 'bg-transparent'}`} />
          <div className={`w-2.5 h-2.5 rounded-full border border-brand-brown ${step >= 3 ? 'bg-brand-brown' : 'bg-transparent'}`} />
        </div>
      </div>

      {/* STEP 1: SOP CHECKLIST */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-brand-brown">Step 1: Complete SOP Checklist</h4>
            <p className="text-xs text-brand-brown/60 leading-relaxed">
              Verify all physical kitchen and dining parameters. Complete all 16 steps before customer launch.
            </p>
          </div>

          {/* CHECK ALL & UNCHECK ALL BUTTONS */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCheckAll}
              className="bg-brand-brown text-brand-yellow font-black text-[10px] uppercase tracking-widest py-2 px-3 rounded-lg hover:scale-102 active:scale-98 transition-all"
            >
              ✓ Check All
            </button>
            <button
              onClick={handleUncheckAll}
              className="bg-brand-stone/30 text-brand-brown/70 font-black text-[10px] uppercase tracking-widest py-2 px-3 rounded-lg hover:scale-102 active:scale-98 transition-all border border-brand-stone"
            >
              Uncheck All
            </button>
          </div>

          {/* Checklist Items (Highly mobile-optimized size) */}
          <div className="border border-brand-stone rounded-2xl p-4 bg-brand-cream/30 space-y-2 max-h-72 overflow-y-auto">
            <div className="flex justify-between items-center mb-1">
              <p className="text-[10px] font-black text-brand-brown/50 uppercase tracking-widest">
                Verification Tasks ({completedCount}/{checklist.length})
              </p>
            </div>

            <div className="space-y-2">
              {checklist.map((item, index) => (
                <label 
                  key={item.task} 
                  onClick={() => handleToggle(index)}
                  className="flex items-center gap-3 bg-white p-3 rounded-xl border border-brand-stone/40 cursor-pointer hover:bg-brand-cream/10 transition-all select-none"
                >
                  <input 
                    type="checkbox"
                    checked={item.completed}
                    readOnly
                    className="rounded text-brand-brown focus:ring-brand-brown h-4 w-4"
                  />
                  <span className={`text-xs font-bold text-brand-brown leading-tight ${item.completed ? 'line-through text-brand-brown/40' : ''}`}>
                    {item.task}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!allTasksChecked}
            className={`w-full font-black uppercase tracking-widest py-3.5 rounded-xl shadow-md text-xs transition-all flex items-center justify-center gap-2 ${
              allTasksChecked 
                ? 'bg-brand-brown text-brand-yellow hover:scale-102 active:scale-98' 
                : 'bg-brand-stone text-brand-brown/35 cursor-not-allowed'
            }`}
          >
            Next: Take Counter Photo
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* STEP 2: OPEN COUNTER PHOTO */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-brand-brown">Step 2: Counter Ready Stage</h4>
            <p className="text-xs text-brand-brown/60 leading-relaxed">
              Please take a real, live photo of the main service counter. This ensures sanitization standards are met.
            </p>
          </div>

          {/* Real Counter Photo Capture Target */}
          <div className="border-2 border-dashed border-brand-stone rounded-2xl p-6 bg-brand-cream/30 text-center">
            {!counterPhoto ? (
              <button 
                onClick={() => setActiveCameraTarget('counter')}
                className="w-full flex flex-col items-center justify-center gap-2 bg-white hover:bg-brand-cream p-8 rounded-xl cursor-pointer border border-brand-stone transition-all"
              >
                <Camera className="w-8 h-8 text-brand-brown/50 animate-pulse" />
                <span className="text-xs font-black text-brand-brown uppercase">Click Open Counter</span>
                <p className="text-[9px] text-brand-brown/40">Take/upload photo of the ready counter</p>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="border border-brand-stone rounded-xl overflow-hidden h-44 bg-zinc-100 relative">
                  <img src={counterPhoto} alt="Clean Counter Preview" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => setCounterPhoto('')}
                    className="absolute top-2 right-2 bg-brand-brown text-brand-yellow font-black rounded-full px-2.5 py-1 text-xs shadow-md border border-brand-stone hover:bg-brand-yellow hover:text-brand-brown transition-all"
                  >
                    Retake ✕
                  </button>
                </div>
                <p className="text-[9px] text-emerald-700 font-bold flex items-center justify-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Counter photo captured!
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setStep(1)}
              className="bg-brand-stone/30 text-brand-brown/70 font-black text-xs uppercase tracking-widest py-3.5 rounded-xl border border-brand-stone hover:scale-102 active:scale-98 transition-all flex items-center justify-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!counterPhoto}
              className={`font-black uppercase tracking-widest py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1 ${
                counterPhoto 
                  ? 'bg-brand-brown text-brand-yellow hover:scale-102 active:scale-98' 
                  : 'bg-brand-stone text-brand-brown/35 cursor-not-allowed'
              }`}
            >
              Next
              <ChevronRight className="w-4 h-4 animate-bounce" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: OPEN STORE PHOTO */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-brand-brown">Step 3: Store Front Stage</h4>
            <p className="text-xs text-brand-brown/60 leading-relaxed">
              Please take a real, live photo of the open store front ready for customers.
            </p>
          </div>

          {/* Real Store Photo Capture Target */}
          <div className="border-2 border-dashed border-brand-stone rounded-2xl p-6 bg-brand-cream/30 text-center">
            {!storePhoto ? (
              <button 
                onClick={() => setActiveCameraTarget('store')}
                className="w-full flex flex-col items-center justify-center gap-2 bg-white hover:bg-brand-cream p-8 rounded-xl cursor-pointer border border-brand-stone transition-all"
              >
                <Camera className="w-8 h-8 text-brand-brown/50 animate-pulse" />
                <span className="text-xs font-black text-brand-brown uppercase">Click Open Store</span>
                <p className="text-[9px] text-brand-brown/40">Take/upload photo of open store front</p>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="border border-brand-stone rounded-xl overflow-hidden h-44 bg-zinc-100 relative">
                  <img src={storePhoto} alt="Open Store Preview" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => setStorePhoto('')}
                    className="absolute top-2 right-2 bg-brand-brown text-brand-yellow font-black rounded-full px-2.5 py-1 text-xs shadow-md border border-brand-stone hover:bg-brand-yellow hover:text-brand-brown transition-all"
                  >
                    Retake ✕
                  </button>
                </div>
                <p className="text-[9px] text-emerald-700 font-bold flex items-center justify-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Store photo captured!
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setStep(2)}
              className="bg-brand-stone/30 text-brand-brown/70 font-black text-xs uppercase tracking-widest py-3.5 rounded-xl border border-brand-stone hover:scale-102 active:scale-98 transition-all flex items-center justify-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={!storePhoto}
              className={`font-black uppercase tracking-widest py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1 ${
                storePhoto 
                  ? 'bg-brand-brown text-brand-yellow hover:scale-102 active:scale-98' 
                  : 'bg-brand-stone text-brand-brown/35 cursor-not-allowed'
              }`}
            >
              Declare Store Opened 🎉
            </button>
          </div>
        </div>
      )}

      {activeCameraTarget && (
        <CameraCapture 
          title={activeCameraTarget === 'counter' ? 'Capture Clean Counter' : 'Capture Open Store Front'}
          onCapture={(base64) => {
            if (activeCameraTarget === 'counter') {
              setCounterPhoto(base64);
            } else {
              setStorePhoto(base64);
            }
            setActiveCameraTarget(null);
          }}
          onClose={() => setActiveCameraTarget(null)}
        />
      )}
    </div>
  );
}

// STAGE 7: Closing Checklist & Review Counts
interface ClosingSopAndReviewsViewProps {
  onSave: (sop: { task: string; completed: boolean }[], reviews: number, notes: string) => void;
  initialSop?: { task: string; completed: boolean }[];
  initialReviews?: number;
  initialNotes?: string;
}

function ClosingSopAndReviewsView({ onSave, initialSop, initialReviews, initialNotes }: ClosingSopAndReviewsViewProps) {
  const [checklist, setChecklist] = useState<{ task: string; completed: boolean }[]>(
    initialSop && initialSop.length > 0
      ? initialSop
      : CLOSING_SOP_TASKS.map(task => ({ task, completed: false }))
  );
  const [reviews, setReviews] = useState<string>(initialReviews !== undefined ? initialReviews.toString() : '0');
  const [notes, setNotes] = useState<string>(initialNotes || '');

  useEffect(() => {
    if (initialSop && initialSop.length > 0) {
      setChecklist(initialSop);
    } else {
      setChecklist(CLOSING_SOP_TASKS.map(task => ({ task, completed: false })));
    }
  }, [initialSop]);

  useEffect(() => {
    setReviews(initialReviews !== undefined ? initialReviews.toString() : '0');
  }, [initialReviews]);

  useEffect(() => {
    setNotes(initialNotes || '');
  }, [initialNotes]);

  const completedCount = useMemo(() => {
    return checklist.filter(c => c.completed).length;
  }, [checklist]);

  const canSubmit = useMemo(() => {
    return completedCount === checklist.length;
  }, [completedCount, checklist]);

  const handleToggle = (index: number) => {
    const next = [...checklist];
    next[index].completed = !next[index].completed;
    setChecklist(next);
  };

  const handleCheckAll = () => {
    setChecklist(CLOSING_SOP_TASKS.map(task => ({ task, completed: true })));
  };

  const handleUncheckAll = () => {
    setChecklist(CLOSING_SOP_TASKS.map(task => ({ task, completed: false })));
  };

  const handleSave = () => {
    if (!canSubmit) return;
    onSave(checklist, Number(reviews), notes);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-brand-cream rounded-2xl text-brand-brown border border-brand-stone">
          <ClipboardCheck className="w-6 h-6" />
        </div>
        <div>
          <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest">Stage 5</span>
          <h3 className="text-lg font-black uppercase text-brand-brown tracking-tight">Closing SOP Checklist</h3>
        </div>
      </div>

      <p className="text-xs text-brand-brown/60 leading-relaxed">
        Verify that the restaurant premises are safe, neat, and secured for the night. Complete all 10 checks below.
      </p>

      {/* CHECK ALL & UNCHECK ALL BUTTONS */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleCheckAll}
          className="bg-brand-brown text-brand-yellow font-black text-[10px] uppercase tracking-widest py-2 px-3 rounded-lg hover:scale-102 active:scale-98 transition-all"
        >
          ✓ Check All
        </button>
        <button
          onClick={handleUncheckAll}
          className="bg-brand-stone/30 text-brand-brown/70 font-black text-[10px] uppercase tracking-widest py-2 px-3 rounded-lg hover:scale-102 active:scale-98 transition-all border border-brand-stone"
        >
          Uncheck All
        </button>
      </div>

      {/* Checklist items list */}
      <div className="border border-brand-stone rounded-2xl p-4 bg-brand-cream/30 space-y-2 max-h-70 overflow-y-auto">
        <p className="text-[10px] font-black text-brand-brown/50 uppercase tracking-widest mb-1">
          Closing Verification ({completedCount}/{checklist.length})
        </p>

        <div className="space-y-2">
          {checklist.map((item, index) => (
            <label 
              key={item.task} 
              onClick={() => handleToggle(index)}
              className="flex items-center gap-3 bg-white p-3 rounded-xl border border-brand-stone/40 cursor-pointer hover:bg-brand-cream/10 transition-all select-none"
            >
              <input 
                type="checkbox"
                checked={item.completed}
                readOnly
                className="rounded text-brand-brown focus:ring-brand-brown h-4 w-4"
              />
              <span className={`text-xs font-bold text-brand-brown leading-tight ${item.completed ? 'line-through text-brand-brown/40' : ''}`}>
                {item.task}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Google Reviews Input */}
      <div className="border border-brand-stone rounded-2xl p-4 bg-brand-cream/30 space-y-3">
        <label className="block text-[10px] font-black uppercase text-brand-brown/50 tracking-widest">Google Reviews Collected Today</label>
        <input 
          type="number"
          value={reviews}
          onChange={(e) => setReviews(e.target.value)}
          placeholder="Enter Count"
          className="w-full bg-white border border-brand-stone p-2.5 rounded-xl font-bold"
        />
      </div>

      {/* Notes Input */}
      <div className="border border-brand-stone rounded-2xl p-4 bg-brand-cream/30 space-y-3">
        <label className="block text-[10px] font-black uppercase text-brand-brown/50 tracking-widest">Manager Shift Notes</label>
        <textarea 
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Enter notes for Admin here..."
          className="w-full bg-white border border-brand-stone p-2.5 rounded-xl font-medium text-xs"
        />
      </div>

      <button 
        onClick={handleSave}
        disabled={!canSubmit}
        className={`w-full font-black uppercase tracking-widest py-3.5 rounded-xl shadow-md text-xs transition-all ${
          canSubmit 
            ? 'bg-brand-brown text-brand-yellow hover:scale-102 active:scale-98' 
            : 'bg-brand-stone text-brand-brown/35 cursor-not-allowed'
        }`}
      >
        Save SOPs &amp; Shift Stats
      </button>
    </div>
  );
}

// STAGE 8: Closing Verification View
interface ClosingVerificationViewProps {
  openingCash: number;
  posCashSales: number;
  posUpiSales: number;
  onSave: (cash: number, upi: number, discrepancyReason: string, photo: string) => void;
  initialCash?: number;
  initialUpi?: number;
  initialDiscrepancyReason?: string;
  initialPhoto?: string;
}

function ClosingVerificationView({ openingCash, posCashSales, posUpiSales, onSave, initialCash, initialUpi, initialDiscrepancyReason, initialPhoto }: ClosingVerificationViewProps) {
  const [actualCash, setActualCash] = useState<string>(initialCash !== undefined ? initialCash.toString() : '');
  const [actualUpi, setActualUpi] = useState<string>(initialUpi !== undefined ? initialUpi.toString() : '');
  const [discrepancyReason, setDiscrepancyReason] = useState<string>(initialDiscrepancyReason || '');
  const [isPosMarked, setIsPosMarked] = useState<boolean>(initialCash !== undefined && initialUpi !== undefined);
  const [closingPhoto, setClosingPhoto] = useState<string>(initialPhoto || '');
  const [showCamera, setShowCamera] = useState<boolean>(false);

  useEffect(() => {
    setActualCash(initialCash !== undefined ? initialCash.toString() : '');
  }, [initialCash]);

  useEffect(() => {
    setActualUpi(initialUpi !== undefined ? initialUpi.toString() : '');
  }, [initialUpi]);

  useEffect(() => {
    setDiscrepancyReason(initialDiscrepancyReason || '');
  }, [initialDiscrepancyReason]);

  useEffect(() => {
    setClosingPhoto(initialPhoto || '');
  }, [initialPhoto]);

  useEffect(() => {
    if (initialCash !== undefined && initialUpi !== undefined) {
      setIsPosMarked(true);
    }
  }, [initialCash, initialUpi]);

  const expectedClosingCash = useMemo(() => {
    return openingCash + posCashSales;
  }, [openingCash, posCashSales]);

  const hasCashDiff = useMemo(() => {
    if (actualCash === '') return false;
    return Number(actualCash) !== expectedClosingCash;
  }, [actualCash, expectedClosingCash]);

  const hasUpiDiff = useMemo(() => {
    if (actualUpi === '') return false;
    return Number(actualUpi) !== posUpiSales;
  }, [actualUpi, posUpiSales]);

  const canSubmit = useMemo(() => {
    const cashFilled = actualCash !== '';
    const upiFilled = actualUpi !== '';
    const hasDiff = hasCashDiff || hasUpiDiff;
    const reasonFilled = !hasDiff || discrepancyReason.trim().length > 0;
    const photoFilled = closingPhoto !== '';
    
    return cashFilled && upiFilled && reasonFilled && isPosMarked && photoFilled;
  }, [actualCash, actualUpi, hasCashDiff, hasUpiDiff, discrepancyReason, isPosMarked, closingPhoto]);

  const handleSave = () => {
    if (!canSubmit) return;
    onSave(Number(actualCash), Number(actualUpi), discrepancyReason, closingPhoto);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-brand-cream rounded-2xl text-brand-brown border border-brand-stone">
          <Coins className="w-6 h-6" />
        </div>
        <div>
          <span className="text-[9px] font-black uppercase text-brand-brown/40 tracking-widest">Stage 6</span>
          <h3 className="text-lg font-black uppercase text-brand-brown tracking-tight">Closing Sales &amp; Cash Audit</h3>
        </div>
      </div>

      <p className="text-xs text-brand-brown/60 leading-relaxed">
        Verify that inventory entries are completely matched in POS and count closing cash/upi.
      </p>

      {/* POS Inventory marked check */}
      <label className="flex items-center gap-3 bg-brand-yellow/10 p-4 rounded-2xl border border-brand-yellow/40 cursor-pointer select-none">
        <input 
          type="checkbox"
          checked={isPosMarked}
          onChange={(e) => setIsPosMarked(e.target.checked)}
          className="rounded text-brand-brown focus:ring-brand-brown w-5 h-5"
        />
        <div className="text-xs">
          <p className="font-black text-brand-brown uppercase">Inventory marked in POS</p>
          <p className="text-brand-brown/60 font-medium">I verify that today's raw stock counts have been locked in POS.</p>
        </div>
      </label>

      {/* Closing Cash Input */}
      <div className="border border-brand-stone rounded-2xl p-4 bg-brand-cream/30 space-y-3">
        <div className="flex justify-between items-center">
          <label className="block text-[10px] font-black uppercase text-brand-brown/50 tracking-widest">Count Drawer Cash Actual</label>
          <span className="text-[9px] font-bold text-emerald-700 uppercase">Expected: ₹{expectedClosingCash}</span>
        </div>
        
        <input 
          type="number"
          value={actualCash}
          onChange={(e) => setActualCash(e.target.value)}
          placeholder="Actual Cash count"
          className="w-full bg-white border-2 border-brand-stone p-3 rounded-xl font-black text-brand-brown text-sm"
        />
      </div>

      {/* Closing UPI Input */}
      <div className="border border-brand-stone rounded-2xl p-4 bg-brand-cream/30 space-y-3">
        <div className="flex justify-between items-center">
          <label className="block text-[10px] font-black uppercase text-brand-brown/50 tracking-widest">Count UPI Sales Actual</label>
          <span className="text-[9px] font-bold text-emerald-700 uppercase">Expected: ₹{posUpiSales}</span>
        </div>
        
        <input 
          type="number"
          value={actualUpi}
          onChange={(e) => setActualUpi(e.target.value)}
          placeholder="Actual UPI count"
          className="w-full bg-white border-2 border-brand-stone p-3 rounded-xl font-black text-brand-brown text-sm"
        />
      </div>

      {/* Discrepancy Reasons */}
      {(hasCashDiff || hasUpiDiff) && (
        <div className="border border-brand-stone rounded-2xl p-4 bg-brand-red/5 space-y-2 animate-in slide-in-from-top-3">
          <span className="block text-[9px] font-black text-brand-red uppercase tracking-wider">⚠️ Cash / UPI Discrepancy Reason</span>
          <textarea 
            rows={2}
            value={discrepancyReason}
            onChange={(e) => setDiscrepancyReason(e.target.value)}
            placeholder="Explain any drawer mismatches..."
            className="w-full bg-white border border-brand-stone p-2.5 rounded-lg text-xs font-bold text-brand-brown"
          />
        </div>
      )}

      {/* Shutter photo close */}
      <div className="border border-brand-stone rounded-2xl p-4 bg-brand-cream/30 space-y-3">
        <p className="text-[10px] font-black text-brand-brown/50 uppercase tracking-widest">Final shutter Closing Photo Required</p>
        
        {!closingPhoto ? (
          <button 
            onClick={() => setShowCamera(true)}
            className="w-full flex flex-col items-center justify-center gap-2 bg-white hover:bg-brand-cream p-6 rounded-xl cursor-pointer border border-brand-stone transition-all"
          >
            <Camera className="w-8 h-8 text-brand-brown/50 animate-pulse" />
            <span className="text-xs font-black text-brand-brown uppercase">Take Shutter Close Photo</span>
          </button>
        ) : (
          <div className="space-y-2">
            <div className="border border-brand-stone rounded-xl overflow-hidden h-40 bg-zinc-100 relative">
              <img src={closingPhoto} alt="Closing Photo Preview" className="w-full h-full object-cover" />
              <button 
                onClick={() => setClosingPhoto('')}
                className="absolute top-2 right-2 bg-brand-brown text-brand-yellow font-black rounded-full px-2.5 py-1 text-xs shadow-md border border-brand-stone hover:bg-brand-yellow hover:text-brand-brown transition-all"
              >
                Retake ✕
              </button>
            </div>
            <p className="text-[9px] text-emerald-700 font-bold flex items-center justify-center gap-1">
              <Check className="w-3.5 h-3.5" /> Closing photo captured!
            </p>
          </div>
        )}
      </div>

      <button 
        onClick={handleSave}
        disabled={!canSubmit}
        className={`w-full font-black uppercase tracking-widest py-3.5 rounded-xl shadow-md text-xs transition-all ${
          canSubmit 
            ? 'bg-brand-brown text-brand-yellow hover:scale-102 active:scale-98' 
            : 'bg-brand-stone text-brand-brown/35 cursor-not-allowed'
        }`}
      >
        Lock Session &amp; Close Store
      </button>

      {showCamera && (
        <CameraCapture 
          title="Take Shutter Closing Photo"
          onCapture={(base64) => {
            setClosingPhoto(base64);
            setShowCamera(false);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
