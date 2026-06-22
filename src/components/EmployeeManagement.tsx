import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { User as AppUser, Station } from '../types';
import { getStations } from '../utils/storage';
import { 
  Calendar, 
  User as UserIcon, 
  Check, 
  X, 
  FileText, 
  Plus, 
  MapPin, 
  Eye, 
  Search, 
  Sparkles, 
  CheckCircle, 
  Trash2, 
  Clock, 
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  FileCheck
} from 'lucide-react';

interface Employee {
  id: string;
  name: string;
  dob: string;
  address: string;
  station_id: string | null;
  branch_name: string;
  aadhaar_url: string;
  pan_url: string;
  passbook_url: string;
  created_at?: string;
}

interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string; // 'YYYY-MM-DD'
  status: 'PRESENT' | 'ABSENT';
  marked_comment?: string;
  marked_by?: string;
}

interface LeaveRequest {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by?: string;
  action_date?: string;
}

interface WeeklyOff {
  id: string;
  employee_id: string;
  week_start_date: string; // YYYY-MM-DD (Monday)
  day_of_week: string; // 'Monday', 'Tuesday', ..., 'Sunday', or 'None'
}

interface EmployeeManagementProps {
  user: AppUser;
}

export const EmployeeManagement: React.FC<EmployeeManagementProps> = ({ user }) => {
  // Navigation states
  const [activeTab, setActiveTab] = useState<'directory' | 'attendance' | 'leaves' | 'calendar' | 'dashboard' | 'weekly-off'>('directory');
  
  // Data list states
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [weeklyOffs, setWeeklyOffs] = useState<WeeklyOff[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => {
    // Week of today (Monday)
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff));
    const yyyy = mon.getFullYear();
    const mm = String(mon.getMonth() + 1).padStart(2, '0');
    const dd = String(mon.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  
  // Storage fallback alerts
  const [dbStatus, setDbStatus] = useState<{ isSupabase: boolean; message: string }>({ isSupabase: true, message: 'Connected to Supabase' });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Syncing Data...');
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  // Form values
  const [formName, setFormName] = useState('');
  const [formDob, setFormDob] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formBranch, setFormBranch] = useState('');
  
  // Compulsory upload reference strings or base64s
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [panFile, setPanFile] = useState<File | null>(null);
  const [passbookFile, setPassbookFile] = useState<File | null>(null);
  
  const [aadhaarUrl, setAadhaarUrl] = useState('');
  const [panUrl, setPanUrl] = useState('');
  const [passbookUrl, setPassbookUrl] = useState('');
  
  const [formError, setFormError] = useState('');

  // Attendance filter states
  const [attendanceDate, setAttendanceDate] = useState<string>(
    new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
  );
  const [attendanceBranchFilter, setAttendanceBranchFilter] = useState<string>(
    user.role === 'ADMIN' ? 'ALL' : (user.stationName || '')
  );

  // Leave Form states
  const [isLeaveRequestOpen, setIsLeaveRequestOpen] = useState(false);
  const [leaveEmployeeId, setLeaveEmployeeId] = useState('');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveError, setLeaveError] = useState('');

  // Selected Employee for Dashboard detailed view
  const [selectedDashboardEmployeeId, setSelectedDashboardEmployeeId] = useState<string>('');

  // Availability calendar states
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());

  // Logged-in context info
  const managerName = user.username || 'Store Manager';
  const managerBranch = user.stationName || 'Headquarters';

  // Local storage helpers
  const getLocalStorageData = (key: string) => {
    const item = localStorage.getItem(`minmomos_${key}`);
    return item ? JSON.parse(item) : [];
  };

  const saveLocalStorageData = (key: string, data: any) => {
    localStorage.setItem(`minmomos_${key}`, JSON.stringify(data));
  };

  const seedLocalMockEmployeesIfNeeded = () => {
    const stored = localStorage.getItem('minmomos_employees');
    if (!stored) {
      const mockEmployees: Employee[] = [
        {
          id: 'emp-101',
          name: 'Rajesh Kumar',
          dob: '1994-08-15',
          address: 'Flat 403, Golden Enclave, Sector 15, Gurgaon',
          station_id: 'gurgaon-1',
          branch_name: 'Gurgaon',
          aadhaar_url: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
          pan_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
          passbook_url: 'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
          created_at: new Date().toISOString()
        },
        {
          id: 'emp-102',
          name: 'Priya Sharma',
          dob: '1996-12-02',
          address: 'H-202, Metro Apartments, Dwarka Mor, New Delhi',
          station_id: 'dwarka-2',
          branch_name: 'Dwarka',
          aadhaar_url: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
          pan_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
          passbook_url: 'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
          created_at: new Date().toISOString()
        }
      ];
      saveLocalStorageData('employees', mockEmployees);
      
      const mockAttendance: AttendanceRecord[] = [
        { id: 'att-1', employee_id: 'emp-101', date: new Date().toLocaleDateString('en-CA'), status: 'PRESENT', marked_by: 'admin' },
        { id: 'att-2', employee_id: 'emp-102', date: new Date().toLocaleDateString('en-CA'), status: 'ABSENT', marked_by: 'admin' }
      ];
      saveLocalStorageData('employee_attendance', mockAttendance);

      const mockLeaves: LeaveRequest[] = [
        { id: 'lv-1', employee_id: 'emp-101', start_date: '2026-06-25', end_date: '2026-06-27', reason: 'Family function', status: 'PENDING' }
      ];
      saveLocalStorageData('employee_leaves', mockLeaves);

      const mockWeeklyOffs: WeeklyOff[] = [
        { id: 'wo-1', employee_id: 'emp-101', week_start_date: '2026-06-15', day_of_week: 'Tuesday' }
      ];
      saveLocalStorageData('employee_weekly_offs', mockWeeklyOffs);
    }
  };

  const loadData = async (showOverlay = false) => {
    if (showOverlay) {
      setLoadingMessage('Syncing Roster changes...');
      setIsLoading(true);
    }
    let supabaseSuccess = true;

    // Load stations from system first
    try {
      const activeStations = await getStations();
      setStations(activeStations);
    } catch (e) {
      console.log('Error loading stations', e);
    }

    // Try loading employees
    try {
      const { data: empData, error: empError } = await supabase
        .from('employees')
        .select('*')
        .order('name');
      
      if (empError) throw empError;
      setEmployees(empData || []);
    } catch (e: any) {
      console.warn('Supabase employees error, falling back to localStorage:', e.message);
      supabaseSuccess = false;
      seedLocalMockEmployeesIfNeeded();
      setEmployees(getLocalStorageData('employees'));
    }

    // Try loading attendance
    if (supabaseSuccess) {
      try {
        const { data: attData, error: attError } = await supabase
          .from('employee_attendance')
          .select('*')
          .order('date', { ascending: false });
        if (attError) throw attError;
        setAttendance(attData || []);
      } catch (e) {
        setAttendance(getLocalStorageData('employee_attendance'));
      }
    } else {
      setAttendance(getLocalStorageData('employee_attendance'));
    }

    // Try loading leaves
    if (supabaseSuccess) {
      try {
        const { data: lvData, error: lvError } = await supabase
          .from('employee_leaves')
          .select('*')
          .order('created_at', { ascending: false });
        if (lvError) throw lvError;
        setLeaves(lvData || []);
      } catch (e) {
        setLeaves(getLocalStorageData('employee_leaves'));
      }
    } else {
      setLeaves(getLocalStorageData('employee_leaves'));
    }

    // Try loading weekly offs
    if (supabaseSuccess) {
      try {
        const { data: woData, error: woError } = await supabase
          .from('employee_weekly_offs')
          .select('*');
        if (woError) throw woError;
        setWeeklyOffs(woData || []);
      } catch (e) {
        setWeeklyOffs(getLocalStorageData('employee_weekly_offs'));
      }
    } else {
      setWeeklyOffs(getLocalStorageData('employee_weekly_offs'));
    }

    setDbStatus({
      isSupabase: supabaseSuccess,
      message: supabaseSuccess 
        ? 'Fully synced in real-time with your Cloud Supabase Database.' 
        : 'Running in Secure Standalone Mode (using LocalStorage fallback. Please run the employee_management.sql script in your Supabase SQL editor to enable database storage).'
    });
    
    if (showOverlay) {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update selected employee for dashboard defaults when lists load
  useEffect(() => {
    if (employees.length > 0 && !selectedDashboardEmployeeId) {
      setSelectedDashboardEmployeeId(employees[0].id);
    }
  }, [employees]);

  // Upload document file to Supabase storage helper
  const handleUploadFile = async (file: File, type: 'aadhaar' | 'pan' | 'passbook'): Promise<string> => {
    if (!dbStatus.isSupabase) {
      // Standalone mode: return a simulated base64 url
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(file);
      });
    }

    const fileExt = file.name.split('.').pop();
    const sanitisedName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${Date.now()}_${type}_${sanitisedName}.${fileExt}`;
    
    const { error } = await supabase.storage
      .from('employee_docs')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      throw error;
    }

    const { data: publicUrlData } = supabase.storage
      .from('employee_docs')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  };

  // Profile Form save action
  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formName.trim()) return setFormError('Name is compulsory');
    if (!formDob) return setFormError('Date of Birth is compulsory');
    if (!formAddress.trim()) return setFormError('Address is compulsory');
    if (!formBranch) return setFormError('Assigned Branch is compulsory');

    // Compulsory check for document attachments/URLs
    const hasAadhaar = aadhaarFile || (editingEmployee && editingEmployee.aadhaar_url);
    const hasPan = panFile || (editingEmployee && editingEmployee.pan_url);
    const hasPassbook = passbookFile || (editingEmployee && editingEmployee.passbook_url);

    if (!hasAadhaar || !hasPan || !hasPassbook) {
      return setFormError('Compulsory Verification Error: Aadhaar Card, PAN Card, and Bank Passbook uploads are ALL compulsory for staff registry.');
    }

    setLoadingMessage('Uploading files & saving profile...');
    setIsLoading(true);
    try {
      let finalAadhaarUrl = editingEmployee?.aadhaar_url || '';
      let finalPanUrl = editingEmployee?.pan_url || '';
      let finalPassbookUrl = editingEmployee?.passbook_url || '';

      if (aadhaarFile) {
        finalAadhaarUrl = await handleUploadFile(aadhaarFile, 'aadhaar');
      }
      if (panFile) {
        finalPanUrl = await handleUploadFile(panFile, 'pan');
      }
      if (passbookFile) {
        finalPassbookUrl = await handleUploadFile(passbookFile, 'passbook');
      }

      const matchStation = stations.find(s => s.name === formBranch);

      const payload: Partial<Employee> = {
        name: formName,
        dob: formDob,
        address: formAddress,
        station_id: matchStation?.id || null,
        branch_name: formBranch,
        aadhaar_url: finalAadhaarUrl,
        pan_url: finalPanUrl,
        passbook_url: finalPassbookUrl
      };

      if (dbStatus.isSupabase) {
        if (editingEmployee) {
          const { error } = await supabase
            .from('employees')
            .update(payload)
            .eq('id', editingEmployee.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('employees')
            .insert([payload]);
          if (error) throw error;
        }
      } else {
        // Fallback local storage write
        const localEmps = getLocalStorageData('employees') as Employee[];
        if (editingEmployee) {
          const idx = localEmps.findIndex(x => x.id === editingEmployee.id);
          if (idx !== -1) {
            localEmps[idx] = { ...localEmps[idx], ...payload };
          }
        } else {
          const newEmp: Employee = {
            id: `emp-${Date.now()}`,
            name: formName,
            dob: formDob,
            address: formAddress,
            station_id: matchStation?.id || null,
            branch_name: formBranch,
            aadhaar_url: finalAadhaarUrl,
            pan_url: finalPanUrl,
            passbook_url: finalPassbookUrl,
            created_at: new Date().toISOString()
          };
          localEmps.push(newEmp);
        }
        saveLocalStorageData('employees', localEmps);
      }

      // Success cleanup
      setIsFormOpen(false);
      setEditingEmployee(null);
      setFormName('');
      setFormDob('');
      setFormAddress('');
      setFormBranch('');
      setAadhaarFile(null);
      setPanFile(null);
      setPassbookFile(null);
      setAadhaarUrl('');
      setPanUrl('');
      setPassbookUrl('');
      
      // Reload
      await loadData();
    } catch (err: any) {
      console.error(err);
      setFormError(`Upload/Save Error: ${err.message || 'Verification file too large or network failure.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormName(emp.name);
    setFormDob(emp.dob);
    setFormAddress(emp.address);
    setFormBranch(emp.branch_name);
    setAadhaarUrl(emp.aadhaar_url);
    setPanUrl(emp.pan_url);
    setPassbookUrl(emp.passbook_url);
    setIsFormOpen(true);
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!window.confirm('Are you absolutely sure you want to remove this employee from records? This removes all matching attendance and leave history.')) return;
    
    setLoadingMessage('Deleting employee profile...');
    setIsLoading(true);
    try {
      if (dbStatus.isSupabase) {
        const { error } = await supabase
          .from('employees')
          .delete()
          .eq('id', id);
        if (error) throw error;
      } else {
        const localEmps = getLocalStorageData('employees') as Employee[];
        const filtered = localEmps.filter(e => e.id !== id);
        saveLocalStorageData('employees', filtered);

        const currentAtt = getLocalStorageData('employee_attendance') as AttendanceRecord[];
        saveLocalStorageData('employee_attendance', currentAtt.filter(x => x.employee_id !== id));

        const currentLvs = getLocalStorageData('employee_leaves') as LeaveRequest[];
        saveLocalStorageData('employee_leaves', currentLvs.filter(x => x.employee_id !== id));
      }
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Delete operation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Attendance submission triggers
  const handleMarkAttendance = async (employeeId: string, status: 'PRESENT' | 'ABSENT') => {
    setLoadingMessage('Marking attendance...');
    setIsLoading(true);
    try {
      // Check if there is an existing record for employee + date
      const existing = attendance.find(a => a.employee_id === employeeId && a.date === attendanceDate);
      
      if (dbStatus.isSupabase) {
        if (existing) {
          const { error } = await supabase
            .from('employee_attendance')
            .update({ status, marked_by: managerName })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('employee_attendance')
            .insert([{
              employee_id: employeeId,
              date: attendanceDate,
              status,
              marked_by: managerName
            }]);
          if (error) throw error;
        }
      } else {
        const localAtt = getLocalStorageData('employee_attendance') as AttendanceRecord[];
        if (existing) {
          const idx = localAtt.findIndex(x => x.id === existing.id);
          if (idx !== -1) {
            localAtt[idx].status = status;
            localAtt[idx].marked_by = managerName;
          }
        } else {
          localAtt.push({
            id: `att-${Date.now()}`,
            employee_id: employeeId,
            date: attendanceDate,
            status,
            marked_by: managerName
          });
        }
        saveLocalStorageData('employee_attendance', localAtt);
      }
      await loadData();
    } catch (err: any) {
      console.error(err);
      alert(`Could not mark attendance: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Leave approval & request triggers
  const handleSaveLeaveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaveError('');
    if (!leaveEmployeeId) return setLeaveError('Please select an employee');
    if (!leaveStartDate || !leaveEndDate) return setLeaveError('Please enter start & end dates');
    if (new Date(leaveStartDate) > new Date(leaveEndDate)) {
      return setLeaveError('Start date cannot fall after the end date');
    }
    if (!leaveReason.trim()) return setLeaveError('Please clarify the reason for leaves');

    setLoadingMessage('Submitting leave request...');
    setIsLoading(true);
    try {
      const payload: Partial<LeaveRequest> = {
        employee_id: leaveEmployeeId,
        start_date: leaveStartDate,
        end_date: leaveEndDate,
        reason: leaveReason,
        status: 'PENDING'
      };

      if (dbStatus.isSupabase) {
        const { error } = await supabase
          .from('employee_leaves')
          .insert([payload]);
        if (error) throw error;
      } else {
        const localLeaves = getLocalStorageData('employee_leaves') as LeaveRequest[];
        localLeaves.push({
          id: `lv-${Date.now()}`,
          employee_id: leaveEmployeeId,
          start_date: leaveStartDate,
          end_date: leaveEndDate,
          reason: leaveReason,
          status: 'PENDING'
        });
        saveLocalStorageData('employee_leaves', localLeaves);
      }

      setIsLeaveRequestOpen(false);
      setLeaveEmployeeId('');
      setLeaveStartDate('');
      setLeaveEndDate('');
      setLeaveReason('');
      await loadData();
    } catch (err: any) {
      console.error(err);
      setLeaveError(`Request Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateLeaveStatus = async (leaveId: string, newStatus: 'APPROVED' | 'REJECTED') => {
    setLoadingMessage('Updating leave application status...');
    setIsLoading(true);
    try {
      if (dbStatus.isSupabase) {
        const { error } = await supabase
          .from('employee_leaves')
          .update({
            status: newStatus,
            approved_by: managerName,
            action_date: new Date().toLocaleDateString('en-CA')
          })
          .eq('id', leaveId);
        if (error) throw error;
      } else {
        const localLeaves = getLocalStorageData('employee_leaves') as LeaveRequest[];
        const idx = localLeaves.findIndex(l => l.id === leaveId);
        if (idx !== -1) {
          localLeaves[idx].status = newStatus;
          localLeaves[idx].approved_by = managerName;
          localLeaves[idx].action_date = new Date().toLocaleDateString('en-CA');
        }
        saveLocalStorageData('employee_leaves', localLeaves);
      }
      await loadData();
    } catch (err: any) {
      console.error(err);
      alert(`Could not update leave status: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelLeave = async (leaveId: string) => {
    setLoadingMessage('Cancelling leave plan...');
    setIsLoading(true);
    try {
      if (dbStatus.isSupabase) {
        const { error } = await supabase
          .from('employee_leaves')
          .delete()
          .eq('id', leaveId);
        if (error) throw error;
      } else {
        const localLeaves = getLocalStorageData('employee_leaves') as LeaveRequest[];
        const updated = localLeaves.filter(l => l.id !== leaveId);
        saveLocalStorageData('employee_leaves', updated);
      }
      
      // Update local state immediately for instant feedback
      setLeaves(prev => prev.filter(l => l.id !== leaveId));
      await loadData();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // WEEKLY OFF PLANNER UTILITIES & HANDLERS
  const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const getWeekMondayStr = (dateStr: string): string => {
    const parts = dateStr.split('-');
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getDayNameOfDate = (dateStr: string): string => {
    const parts = dateStr.split('-');
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return WEEK_DAYS[date.getDay()];
  };

  const getEmployeeWeeklyOffDay = (empId: string, dateStr: string): string | undefined => {
    const monStr = getWeekMondayStr(dateStr);
    const wo = weeklyOffs.find(w => w.employee_id === empId && w.week_start_date === monStr);
    return wo?.day_of_week;
  };

  const isEmployeeOnWeeklyOff = (empId: string, dateStr: string): boolean => {
    const dayName = getDayNameOfDate(dateStr);
    const offDay = getEmployeeWeeklyOffDay(empId, dateStr);
    return offDay === dayName;
  };

  const handleSaveWeeklyOff = async (employeeId: string, dayName: string) => {
    setLoadingMessage('Scheduling weekly off day...');
    setIsLoading(true);
    try {
      const existing = weeklyOffs.find(w => w.employee_id === employeeId && w.week_start_date === selectedWeekStart);
      
      if (dbStatus.isSupabase) {
        if (existing) {
          if (dayName === 'None') {
            const { error } = await supabase
              .from('employee_weekly_offs')
              .delete()
              .eq('id', existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('employee_weekly_offs')
              .update({ day_of_week: dayName })
              .eq('id', existing.id);
            if (error) throw error;
          }
        } else {
          if (dayName !== 'None') {
            const { error } = await supabase
              .from('employee_weekly_offs')
              .insert([{
                employee_id: employeeId,
                week_start_date: selectedWeekStart,
                day_of_week: dayName
              }]);
            if (error) throw error;
          }
        }
      } else {
        let localWo = getLocalStorageData('employee_weekly_offs') as WeeklyOff[];
        if (existing) {
          if (dayName === 'None') {
            localWo = localWo.filter(w => w.id !== existing.id);
          } else {
            const idx = localWo.findIndex(w => w.id === existing.id);
            if (idx !== -1) {
              localWo[idx].day_of_week = dayName;
            }
          }
        } else {
          if (dayName !== 'None') {
            localWo.push({
              id: `wo-${Date.now()}`,
              employee_id: employeeId,
              week_start_date: selectedWeekStart,
              day_of_week: dayName
            });
          }
        }
        saveLocalStorageData('employee_weekly_offs', localWo);
      }
      
      await loadData();
    } catch (err: any) {
      console.error(err);
      alert(`Could not save weekly off: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getWeekRangeLabel = (mondayStr: string) => {
    const parts = mondayStr.split('-');
    const mon = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    return `${mon.toLocaleDateString('en-US', options)} – ${sun.toLocaleDateString('en-US', options)}`;
  };

  const handlePrevWeek = () => {
    const parts = selectedWeekStart.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() - 7);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSelectedWeekStart(`${yyyy}-${mm}-${dd}`);
  };

  const handleNextWeek = () => {
    const parts = selectedWeekStart.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + 7);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSelectedWeekStart(`${yyyy}-${mm}-${dd}`);
  };

  // UTILITY: Check if employee is on approved leave today/date
  const getEmployeeLeaveStatus = (empId: string, dateStr: string): LeaveRequest | undefined => {
    const targetDate = new Date(dateStr);
    return leaves.find(l => {
      if (l.employee_id !== empId || l.status !== 'APPROVED') return false;
      const start = new Date(l.start_date);
      const end = new Date(l.end_date);
      return targetDate >= start && targetDate <= end;
    });
  };

  // FILTERED LISTS
  const filteredEmployeesForDirectory = employees.filter(emp => {
    const matchSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        emp.branch_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        emp.address.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (user.role !== 'ADMIN') {
      // Managers only see their own store's staff
      return matchSearch && emp.branch_name === user.stationName;
    }
    return matchSearch;
  });

  const filteredEmployeesForAttendance = employees.filter(emp => {
    if (attendanceBranchFilter === 'ALL') return true;
    return emp.branch_name === attendanceBranchFilter;
  });

  // Calculate stats for Dashboard Tab / Selected Employee
  const getEmployeeStats = (empId: string) => {
    const empTxs = attendance.filter(a => a.employee_id === empId);
    const presentCount = empTxs.filter(a => a.status === 'PRESENT').length;
    const absentCount = empTxs.filter(a => a.status === 'ABSENT').length;
    const totalMarked = empTxs.length;
    const presenceRate = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : 100;
    
    // Approved leaves taken (total days count)
    const approvedLeaves = leaves.filter(l => l.employee_id === empId && l.status === 'APPROVED');
    let totalLeaveDays = 0;
    approvedLeaves.forEach(l => {
      const diffTime = Math.abs(new Date(l.end_date).getTime() - new Date(l.start_date).getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      totalLeaveDays += diffDays;
    });

    const pendingRequests = leaves.filter(l => l.employee_id === empId && l.status === 'PENDING').length;

    return {
      presentCount,
      absentCount,
      presenceRate,
      totalLeaveDays,
      pendingRequests,
      totalMarked
    };
  };

  // Calendar render math helper
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month, 1).getDay(); // 0 is Sunday, 1 is Monday ...
  };

  const handlePrevMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  };

  // Find detailed statistics for active tab context
  const selectedDashboardEmployee = employees.find(e => e.id === selectedDashboardEmployeeId) || employees[0];
  const dashboardStats = selectedDashboardEmployee ? getEmployeeStats(selectedDashboardEmployee.id) : null;

  return (
    <div className="p-8 h-full bg-brand-cream overflow-y-auto no-scrollbar">
      
      {/* Database Warning / Synced Banner */}
      <div className={`mb-6 p-4 rounded-2xl flex items-center gap-3 border text-xs font-semibold shadow-sm ${
        dbStatus.isSupabase 
          ? 'bg-emerald-50 border-emerald-500/15 text-emerald-800' 
          : 'bg-amber-50 border-amber-500/15 text-amber-800'
      }`}>
        {dbStatus.isSupabase ? <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />}
        <div>
          <span className="font-bold">{dbStatus.isSupabase ? "Supabase Sync Live:" : "Storage Sandbox Mode:"}</span> {dbStatus.message}
        </div>
      </div>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-12">
        <div>
          <h2 className="text-4xl font-black text-brand-brown italic">
            STAFF <span className="text-brand-yellow">MANAGEMENT</span>
          </h2>
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
            Registered Branch: <span className="text-brand-brown/70">{managerBranch}</span> • Logged in as: <span className="text-brand-brown/70">{managerName}</span> ({user.role})
          </p>
        </div>

        {/* Global actions based on tab */}
        <div className="flex gap-2">
          <button 
            onClick={() => {
              setEditingEmployee(null);
              setFormName('');
              setFormDob('');
              setFormAddress('');
              setFormBranch(user.role === 'ADMIN' ? '' : (user.stationName || ''));
              setAadhaarFile(null);
              setPanFile(null);
              setPassbookFile(null);
              setFormError('');
              setIsFormOpen(true);
            }} 
            className="flex items-center gap-2 bg-brand-brown text-brand-yellow px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform"
          >
            <Plus className="w-4 h-4" /> Add Employee
          </button>
          
          <button 
            onClick={() => setIsLeaveRequestOpen(true)}
            className="flex items-center gap-2 bg-white text-brand-brown border border-brand-brown/20 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:scale-105 transition-transform"
          >
            Request Leave
          </button>
        </div>
      </header>

      {/* Primary HR Tabs Nav */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-brand-brown/5 rounded-[2rem] mb-8 border border-brand-brown/5">
        <button
          onClick={() => setActiveTab('directory')}
          className={`flex-1 min-w-[120px] py-4 rounded-3xl text-[10px] font-black uppercase tracking-wider transition-all ${
            activeTab === 'directory' ? 'bg-brand-brown text-brand-yellow shadow-md' : 'text-brand-brown/60 hover:bg-white/40'
          }`}
        >
          📁 Employee Directory
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`flex-1 min-w-[120px] py-4 rounded-3xl text-[10px] font-black uppercase tracking-wider transition-all ${
            activeTab === 'attendance' ? 'bg-brand-brown text-brand-yellow shadow-md' : 'text-brand-brown/60 hover:bg-white/40'
          }`}
        >
          📝 Today's Attendance
        </button>
        <button
          onClick={() => setActiveTab('leaves')}
          className={`flex-1 min-w-[120px] py-4 rounded-3xl text-[10px] font-black uppercase tracking-wider transition-all ${
            activeTab === 'leaves' ? 'bg-brand-brown text-brand-yellow shadow-md' : 'text-brand-brown/60 hover:bg-white/40'
          }`}
        >
          🌴 Leave Roster
        </button>
        <button
          onClick={() => setActiveTab('weekly-off')}
          className={`flex-1 min-w-[120px] py-4 rounded-3xl text-[10px] font-black uppercase tracking-wider transition-all ${
            activeTab === 'weekly-off' ? 'bg-brand-brown text-brand-yellow shadow-md' : 'text-brand-brown/60 hover:bg-white/40'
          }`}
        >
          💤 Weekly Off
        </button>
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex-1 min-w-[120px] py-4 rounded-3xl text-[10px] font-black uppercase tracking-wider transition-all ${
            activeTab === 'calendar' ? 'bg-brand-brown text-brand-yellow shadow-md' : 'text-brand-brown/60 hover:bg-white/40'
          }`}
        >
          📅 Team Calendar
        </button>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 min-w-[120px] py-4 rounded-3xl text-[10px] font-black uppercase tracking-wider transition-all ${
            activeTab === 'dashboard' ? 'bg-brand-brown text-brand-yellow shadow-md' : 'text-brand-brown/60 hover:bg-white/40'
          }`}
        >
          📊 Employee Stats
        </button>
      </div>

      {/* LOADING OVERLAY */}
      {isLoading && (
        <div className="fixed inset-0 bg-brand-brown/20 backdrop-blur-xs flex items-center justify-center z-[110] pointer-events-none">
          <div className="bg-white/90 p-4 rounded-2xl flex items-center gap-3 shadow-xl font-bold border border-brand-stone text-xs text-brand-brown animate-pulse">
            <Sparkles className="w-5 h-5 text-brand-yellow animate-spin" />
            {loadingMessage}
          </div>
        </div>
      )}

      {/* TAB 1: EMPLOYEE DIRECTORY */}
      {activeTab === 'directory' && (
        <div>
          {/* Search Bar */}
          <div className="relative mb-6">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-brown/30" />
            <input 
              type="text" 
              placeholder="Search staff by name, branch station, or city address..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-6 py-4 rounded-2xl border border-brand-stone bg-white text-brand-brown text-xs font-bold focus:ring-2 focus:ring-brand-yellow outline-none transition-all placeholder:text-brand-brown/30"
            />
          </div>

          {filteredEmployeesForDirectory.length === 0 ? (
            <div className="bg-white p-16 rounded-[2rem] border border-brand-stone text-center text-brand-brown/50">
              <UserIcon className="w-12 h-12 text-brand-yellow/60 mx-auto mb-4" />
              <p className="font-black italic text-lg uppercase tracking-tight">No Employees Found</p>
              <p className="text-xs text-brand-brown/40 mt-1 max-w-sm mx-auto">No registered staff matches your selected branch search. Click 'Add Employee' to register profile details with mandatory KYC documents.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEmployeesForDirectory.map((emp) => {
                const stats = getEmployeeStats(emp.id);
                return (
                  <div key={emp.id} className="bg-white rounded-[2rem] p-6 border border-brand-stone shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
                    
                    {/* Upper decorative element */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-brand-yellow" />
                    
                    <div>
                      {/* Name & Branch */}
                      <div className="flex justify-between items-start gap-2 mb-4">
                        <div>
                          <h4 className="font-extrabold text-[#3a2010] text-lg leading-tight uppercase">{emp.name}</h4>
                          <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-bold mt-1 uppercase tracking-wider">
                            <MapPin className="w-3 h-3 text-brand-yellow/80" /> {emp.branch_name} Station
                          </div>
                        </div>
                        <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-500/10">
                          Active Profile
                        </span>
                      </div>

                      <div className="space-y-2 text-xs border-t border-brand-stone/30 pt-4 mb-4">
                        <div className="flex justify-between">
                          <span className="text-zinc-400 font-semibold">Date of Birth:</span>
                          <span className="font-bold text-[#3a2010]">{new Date(emp.dob).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400 font-semibold font-sans">Address:</span>
                          <span className="font-bold text-[#3a2010] text-right truncate max-w-[160px]" title={emp.address}>{emp.address}</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-zinc-400 font-semibold font-sans">Attendance Rate:</span>
                          <span className={`font-black uppercase text-xs ${stats.presenceRate >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            🟢 {stats.presenceRate}% ({stats.presentCount}/{stats.totalMarked} days)
                          </span>
                        </div>
                      </div>

                      {/* Display Compulsory Document Links */}
                      <div className="bg-teal-50/45 rounded-2xl p-4 border border-teal-500/10 mb-4">
                        <p className="text-[9px] font-black uppercase tracking-wider text-teal-800 mb-2.5 flex items-center gap-1">
                          <FileCheck className="w-3.5 h-3.5" /> Verified Passbook & KYC Links
                        </p>
                        <div className="flex gap-2">
                          <a 
                            href={emp.aadhaar_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex-1 flex flex-col items-center p-2 bg-white hover:bg-zinc-50 border border-brand-stone rounded-xl transition-colors font-black uppercase text-[8px] text-brand-brown tracking-tighter"
                          >
                            <FileText className="w-4 h-4 text-emerald-600 mb-1" />
                            Aadhaar
                          </a>
                          <a 
                            href={emp.pan_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex-1 flex flex-col items-center p-2 bg-white hover:bg-zinc-50 border border-brand-stone rounded-xl transition-colors font-black uppercase text-[8px] text-brand-brown tracking-tighter"
                          >
                            <FileText className="w-4 h-4 text-[#bf913b] mb-1" />
                            PAN Card
                          </a>
                          <a 
                            href={emp.passbook_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex-1 flex flex-col items-center p-2 bg-white hover:bg-zinc-50 border border-brand-stone rounded-xl transition-colors font-black uppercase text-[8px] text-brand-brown tracking-tighter"
                          >
                            <FileText className="w-4 h-4 text-sky-600 mb-1" />
                            Passbook
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Operational controls */}
                    <div className="flex items-center gap-3 border-t border-brand-stone/30 pt-4 mt-2">
                      <button 
                        onClick={() => handleEditClick(emp)}
                        className="flex-1 py-2 text-center text-[10px] font-black uppercase tracking-widest text-[#3a2010]/60 hover:text-brand-brown hover:bg-brand-stone/20 rounded-xl transition-colors"
                      >
                        Edit Profile
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedDashboardEmployeeId(emp.id);
                          setActiveTab('dashboard');
                        }}
                        className="flex-1 py-2 text-center text-[10px] bg-[#3a2010]/5 hover:bg-[#3a2010]/10 text-brand-brown font-black uppercase tracking-widest rounded-xl transition-colors"
                      >
                        Stats & Leaves
                      </button>
                      <button 
                        onClick={() => handleDeleteEmployee(emp.id)}
                        className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors"
                        title="Delete record profile"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DAILY ATTENDANCE MARKER */}
      {activeTab === 'attendance' && (
        <div className="bg-white rounded-[2rem] p-8 border border-brand-stone shadow-xl">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
              <h3 className="text-xl font-black italic uppercase text-brand-brown">Daily Attendance Register</h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Managers mark present/absent for store agents each day</p>
            </div>
            
            <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
              {/* Change date */}
              <div className="flex items-center gap-2 bg-brand-cream border border-brand-stone p-2 rounded-xl">
                <Calendar className="w-4 h-4 text-brand-brown/50" />
                <input 
                  type="date" 
                  value={attendanceDate}
                  onChange={e => setAttendanceDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-brand-brown outline-none"
                />
              </div>

              {/* Station Filter (only for Admin. Managers are locked to their own station) */}
              {user.role === 'ADMIN' ? (
                <select
                  value={attendanceBranchFilter}
                  onChange={e => setAttendanceBranchFilter(e.target.value)}
                  className="bg-brand-cream border border-brand-stone p-2 px-3 rounded-xl text-xs font-bold text-[#3a2010] outline-none"
                >
                  <option value="ALL">All Stations (Admin)</option>
                  {stations.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <div className="p-2 px-4 rounded-xl bg-indigo-50 border border-indigo-200/10 text-xs font-bold text-indigo-800">
                  📍 {managerBranch} Station
                </div>
              )}
            </div>
          </div>

          {filteredEmployeesForAttendance.length === 0 ? (
            <div className="p-12 text-center text-brand-brown/40 border border-dashed border-brand-stone/80 rounded-2xl">
              <UserIcon className="w-8 h-8 text-brand-brown/20 mx-auto mb-2" />
              <p className="font-extrabold uppercase text-xs">No employees assigned to {attendanceBranchFilter}</p>
              <p className="text-[10px] text-zinc-400 mt-1">Please add staff and set their branch to {attendanceBranchFilter} to mark attendance.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-stone/60">
                    <th className="py-4 px-4 text-[10px] font-black uppercase text-brand-brown/50 tracking-wider">Staff Name</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase text-brand-brown/50 tracking-wider">Branch</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase text-brand-brown/50 tracking-wider">Approved Leave Status</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase text-brand-brown/50 tracking-wider">Current Attendance status</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase text-brand-brown/50 tracking-wider text-right">Actions / Mark Presence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-stone/30">
                  {filteredEmployeesForAttendance.map(emp => {
                    // Check if employee has an attendance record for this exact day
                    const record = attendance.find(a => a.employee_id === emp.id && a.date === attendanceDate);
                    // Check if they are on an approved leave roster for this date
                    const leaveStatus = getEmployeeLeaveStatus(emp.id, attendanceDate);
                    // Check if they have a scheduled weekly off day
                    const isWo = isEmployeeOnWeeklyOff(emp.id, attendanceDate);

                    return (
                      <tr key={emp.id} className="hover:bg-brand-cream/35 transition-colors">
                        <td className="py-4 px-4">
                          <span className="font-extrabold text-[#3a2010] block text-sm">{emp.name}</span>
                          <span className="text-[9px] font-mono text-zinc-400">ID: {emp.id.slice(0,8)}...</span>
                        </td>
                        <td className="py-4 px-4 italic text-xs font-bold text-brand-brown/60">
                          {emp.branch_name}
                        </td>
                        <td className="py-4 px-4">
                          {leaveStatus ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/10 text-[9px] font-black uppercase text-amber-700 animate-pulse">
                              🌴 Approved Leave: {leaveStatus.reason}
                            </span>
                          ) : isWo ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-200/10 text-[9px] font-black uppercase text-purple-700 font-bold">
                              💤 Scheduled Weekly Off
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-400 font-bold">No Leave requested</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          {record ? (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${
                              record.status === 'PRESENT' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-500/15' 
                                : 'bg-rose-50 text-rose-700 border border-rose-500/15'
                            }`}>
                              {record.status === 'PRESENT' ? '🟢 Present' : '🔴 Absent'}
                            </span>
                          ) : isWo ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-50/50 text-purple-600/75 border border-purple-200/10 text-[10px] font-black uppercase italic">
                              Weekly Off Day
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-400 font-bold italic">Not Marked yet</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleMarkAttendance(emp.id, 'PRESENT')}
                              disabled={!!leaveStatus || isWo}
                              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors border select-none ${
                                record?.status === 'PRESENT'
                                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                  : 'bg-white border-brand-stone hover:bg-emerald-50 text-brand-brown'
                              } disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                              Present
                            </button>
                            <button
                              onClick={() => handleMarkAttendance(emp.id, 'ABSENT')}
                              disabled={!!leaveStatus || isWo}
                              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors border select-none ${
                                record?.status === 'ABSENT'
                                  ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
                                  : 'bg-white border-brand-stone hover:bg-rose-50 text-brand-brown'
                              } disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                              Absent
                            </button>
                          </div>
                          {record?.marked_by && (
                            <span className="text-[8px] text-zinc-400 font-bold block mt-1 uppercase">
                              Marked by {record.marked_by}
                            </span>
                          )}
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

      {/* TAB 3: LEAVE APPROVED ROSTER & MANAGER QUEUE */}
      {activeTab === 'leaves' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Status Queue & Request forms */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* 1. Leave Approval Queue (For Store Manager / Admins) */}
            <div className="bg-white rounded-[2rem] p-6 border border-brand-stone shadow-sm">
              <h3 className="text-lg font-black italic uppercase text-brand-brown mb-2 flex items-center gap-1.5">
                <Clock className="w-5 h-5 text-[#bf913b]" /> Leave Approval Queue
              </h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-6">
                Approve or reject incoming team leave requests
              </p>

              {leaves.filter(l => l.status === 'PENDING').length === 0 ? (
                <div className="p-8 text-center text-brand-brown/40 bg-zinc-50 rounded-2xl border border-dashed border-brand-stone/60">
                  <CheckCircle className="w-8 h-8 text-emerald-500/80 mx-auto mb-2" />
                  <p className="font-extrabold uppercase text-xs">No pending requests</p>
                  <p className="text-[10px] text-zinc-400 mt-1">Excellent! All pending team leaves have been processed.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {leaves.filter(l => l.status === 'PENDING').map(lv => {
                    const emp = employees.find(e => e.id === lv.employee_id);
                    // Filter if not admin and employee branch is different
                    if (user.role !== 'ADMIN' && emp?.branch_name !== user.stationName) {
                      return null;
                    }
                    if (!emp) return null;

                    return (
                      <div key={lv.id} className="p-4 rounded-2xl bg-zinc-50 border border-brand-stone flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-[#3a2010] text-sm">{emp.name}</span>
                            <span className="text-[9px] font-bold uppercase text-zinc-400 bg-white border px-1.5 py-0.5 rounded">
                              {emp.branch_name}
                            </span>
                          </div>
                          
                          <p className="text-[#3a2010]/80 text-xs mt-2 font-black">
                            📅 {new Date(lv.start_date).toLocaleDateString('en-GB')} to {new Date(lv.end_date).toLocaleDateString('en-GB')}
                          </p>
                          <p className="text-zinc-400 text-xs mt-1">
                            Reason: <span className="text-brand-brown font-semibold italic">"{lv.reason}"</span>
                          </p>
                        </div>

                        <div className="flex gap-2 w-full md:w-auto">
                          <button
                            onClick={() => handleUpdateLeaveStatus(lv.id, 'APPROVED')}
                            className="flex-1 md:flex-none flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => handleUpdateLeaveStatus(lv.id, 'REJECTED')}
                            className="flex-1 md:flex-none flex items-center justify-center gap-1 bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Approved leave roster */}
            <div className="bg-white rounded-[2rem] p-6 border border-brand-stone shadow-sm">
              <h3 className="text-lg font-black italic uppercase text-brand-brown mb-2 flex items-center gap-1.5">
                🌴 Approved Leave Roster
              </h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-6">
                Complete log of approved staff leaves across branches
              </p>

              {leaves.filter(l => l.status === 'APPROVED').length === 0 ? (
                <div className="p-8 text-center text-brand-brown/40 bg-zinc-50 rounded-2xl">
                  <p className="font-extrabold uppercase text-xs">No approved leaves</p>
                  <p className="text-[10px] text-zinc-400 mt-1">No upcoming holidays or approved absences are currently booked.</p>
                </div>
              ) : (
                <div className="divide-y divide-brand-stone/30">
                  {leaves.filter(l => l.status === 'APPROVED').map(lv => {
                    const emp = employees.find(e => e.id === lv.employee_id);
                    if (!emp) return null;

                    return (
                      <div key={lv.id} className="py-3.5 flex justify-between items-center text-xs">
                        <div>
                          <span className="font-extrabold text-[#3a2010]">{emp.name} </span>
                          <span className="text-[9px] font-bold bg-[#3a2010]/5 text-[#3a2010] px-1.5 py-0.5 rounded-md border border-[#3a2010]/5 ml-1">
                            {emp.branch_name}
                          </span>
                          <span className="block text-zinc-400 text-[11px] mt-1 italic">
                            Reason: "{lv.reason}"
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="font-bold text-[#3a2010]">
                              {new Date(lv.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - {new Date(lv.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            {lv.approved_by && (
                              <span className="block text-[8px] text-zinc-400 font-bold uppercase mt-0.5">
                                Approved by {lv.approved_by}
                              </span>
                            )}
                          </div>
                          {confirmCancelId === lv.id ? (
                            <div className="flex items-center gap-1.5 bg-rose-50 p-1.5 rounded-xl border border-rose-100">
                              <span className="text-[8px] font-black uppercase text-rose-700 px-1">Confirm?</span>
                              <button
                                onClick={() => {
                                  setConfirmCancelId(null);
                                  handleCancelLeave(lv.id);
                                }}
                                className="p-1 px-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[9px] font-black uppercase shadow-xs transition-all cursor-pointer"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmCancelId(null)}
                                className="p-1 px-1.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded-lg text-[9px] font-semibold transition-all cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmCancelId(lv.id)}
                              title="Cancel Leave (Delete)"
                              className="p-1 px-2 border border-rose-200 text-rose-600 hover:text-white hover:bg-rose-600 hover:border-rose-600 rounded-lg text-[9px] font-black uppercase transition-all flex items-center justify-center gap-1 cursor-pointer select-none"
                            >
                              <Trash2 className="w-3 h-3" /> Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Quick Leave Request Panel */}
          <div className="bg-[#3a2010]/5 border border-brand-brown/10 p-6 rounded-[2rem] space-y-4">
            <h3 className="text-lg font-black italic uppercase text-brand-brown">File Leave Application</h3>
            <p className="text-xs text-brand-brown/60 leading-relaxed leading-normal">
              Managers can directly record approved vacations or file new medical/emergency leaves on behalf of their station workers.
            </p>

            <form onSubmit={handleSaveLeaveRequest} className="space-y-4 pt-2">
              {leaveError && (
                <div className="p-3 bg-red-50 border border-red-500/15 rounded-xl text-[10px] font-bold text-red-700">
                  ⚠️ {leaveError}
                </div>
              )}

              <div>
                <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Select Employee</label>
                <select
                  value={leaveEmployeeId}
                  onChange={e => setLeaveEmployeeId(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none"
                >
                  <option value="">-- Choose Staff --</option>
                  {employees
                    .filter(e => user.role === 'ADMIN' || e.branch_name === user.stationName)
                    .map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.branch_name})</option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={leaveStartDate}
                    onChange={e => setLeaveStartDate(e.target.value)}
                    className="w-full p-3.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">End Date</label>
                  <input
                    type="date"
                    value={leaveEndDate}
                    onChange={e => setLeaveEndDate(e.target.value)}
                    className="w-full p-3.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Reason</label>
                <textarea
                  placeholder="Medical emergency, family function, vacation..."
                  rows={3}
                  value={leaveReason}
                  onChange={e => setLeaveReason(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-brand-brown text-brand-yellow font-black uppercase text-[10px] tracking-widest rounded-xl shadow-md hover:scale-[1.01] transition-transform cursor-pointer"
              >
                Submit Leave
              </button>
            </form>
          </div>

        </div>
      )}

      {/* TAB 4: AVAILABILITY CALENDAR */}
      {activeTab === 'calendar' && (
        <div className="bg-white rounded-[2rem] p-8 border border-brand-stone shadow-xl">
          
          {/* Calendar Header controls */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-xl font-black italic uppercase text-brand-brown flex items-center gap-1.5">
                📅 Roster & Availability Calendar
              </h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                Displays active staff availability each day of the month after cross-referencing approved leaves
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={handlePrevMonth} 
                className="p-2 border border-brand-stone rounded-xl hover:bg-brand-cream/40 text-brand-brown transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[#3a2010] font-extrabold text-sm uppercase tracking-wide">
                {calendarDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button 
                onClick={handleNextMonth} 
                className="p-2 border border-brand-stone rounded-xl hover:bg-[#3a2010]/5 text-brand-brown transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-black uppercase text-brand-brown/40 tracking-wider mb-2">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* Month Grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Blank boxes for padding */}
            {Array.from({ length: getFirstDayOfMonth(calendarDate) }).map((_, idx) => (
              <div key={`blank-${idx}`} className="bg-zinc-50 border border-brand-stone/30 rounded-2xl h-28 opacity-30" />
            ))}

            {/* Days boxes */}
            {Array.from({ length: getDaysInMonth(calendarDate) }).map((_, idx) => {
              const day = idx + 1;
              const dateObj = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
              const dateStr = dateObj.toLocaleDateString('en-CA');
              
              // Find employees on approved leave or weekly off on this date
              const onLeave = employees.filter(emp => {
                if (user.role !== 'ADMIN' && emp.branch_name !== user.stationName) return false;
                return getEmployeeLeaveStatus(emp.id, dateStr) || isEmployeeOnWeeklyOff(emp.id, dateStr);
              });

              // Available employee count
              const activeOnBranch = employees.filter(emp => {
                if (user.role !== 'ADMIN') {
                  return emp.branch_name === user.stationName;
                }
                return true;
              });

              const availableCount = activeOnBranch.length - onLeave.length;

              return (
                <div 
                  key={`day-${day}`} 
                  className="bg-white border border-brand-stone rounded-2xl p-3 h-28 flex flex-col justify-between hover:border-brand-brown/50 transition-colors group relative overflow-hidden"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-black text-brand-brown/80">{day}</span>
                    <span className={`text-[8px] font-bold uppercase rounded p-1 ${
                      availableCount > 0 
                        ? 'bg-emerald-50 text-emerald-800' 
                        : 'bg-rose-50 text-rose-800'
                    }`}>
                      {availableCount}/{activeOnBranch.length} Active
                    </span>
                  </div>

                  {/* List of personnel unavailable / on leave */}
                  <div className="space-y-1.5 mt-2">
                    {onLeave.slice(0, 2).map(emp => {
                      const isWo = isEmployeeOnWeeklyOff(emp.id, dateStr);
                      return (
                        <div key={emp.id} className="text-[8px] font-black text-[#bf913b] leading-tight bg-amber-50 px-1 py-0.5 border border-amber-200/10 rounded truncate">
                          {isWo ? `💤 ${emp.name} (Off)` : `🌴 ${emp.name} (Leave)`}
                        </div>
                      );
                    })}
                    {onLeave.length > 2 && (
                      <div className="text-[8px] text-zinc-400 font-bold block text-left">
                        + {onLeave.length - 2} more unavailable
                      </div>
                    )}
                    {onLeave.length === 0 && activeOnBranch.length > 0 && (
                      <div className="text-[8px] text-emerald-600 font-black block text-left uppercase tracking-tighter">
                        ✓ Full Roster Active
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* TAB 5: SELECTED EMPLOYEE DETAILED STATS (EMPLOYEE DASHBOARD) */}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          <div className="bg-white rounded-[2rem] p-6 border border-brand-stone shadow-sm space-y-6">
            <div>
              <h3 className="text-lg font-black italic uppercase text-brand-brown mb-2">Select staff Member</h3>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-relaxed">
                Click an employee below to load their personal document dossier, leaf rosters and attendance records
              </p>
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 no-scrollbar">
              {employees
                .filter(e => user.role === 'ADMIN' || e.branch_name === user.stationName)
                .map(e => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedDashboardEmployeeId(e.id)}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl text-left border transition-all ${
                      selectedDashboardEmployeeId === e.id
                        ? 'bg-brand-brown text-brand-yellow border-[#3a2010] shadow-sm'
                        : 'bg-zinc-50 hover:bg-white text-brand-brown border-brand-stone'
                    }`}
                  >
                    <div>
                      <span className="font-extrabold text-sm block">{e.name}</span>
                      <span className={`text-[9px] font-black uppercase ${
                        selectedDashboardEmployeeId === e.id ? 'text-brand-yellow/80' : 'text-zinc-400'
                      }`}>
                        {e.branch_name} Station
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ))}
            </div>
          </div>

          <div className="md:col-span-2 space-y-6">
            {selectedDashboardEmployee ? (
              <div className="space-y-6">
                
                {/* Visual Stats Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white rounded-[2rem] p-6 border border-brand-stone shadow-sm text-center">
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Total Leaves Taken</span>
                    <span className="block text-4xl font-black text-brand-brown italic mt-1">{dashboardStats?.totalLeaveDays || 0}</span>
                    <span className="text-[9px] font-sans text-[#bf913b] font-bold block mt-1">Approved Vacation Days</span>
                  </div>

                  <div className="bg-white rounded-[2rem] p-6 border border-brand-stone shadow-sm text-center font-sans">
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Attendance Rate</span>
                    <span className={`block text-4xl font-black italic mt-1 ${
                      (dashboardStats?.presenceRate || 100) >= 80 ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      {dashboardStats?.presenceRate || 100}%
                    </span>
                    <span className="text-[9px] text-[#3a2010]/80 font-bold block mt-1">
                      {dashboardStats?.presentCount || 0} Present / {dashboardStats?.totalMarked || 0} Records
                    </span>
                  </div>

                  <div className="bg-white rounded-[2rem] p-6 border border-brand-stone shadow-sm text-center">
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider font-sans">Pending Requests</span>
                    <span className="block text-4xl font-black text-brand-brown italic mt-1">{dashboardStats?.pendingRequests || 0}</span>
                    <span className="text-[9px] text-zinc-400 font-bold block mt-1">Awaiting Manager Review</span>
                  </div>
                </div>

                {/* Dossier Card */}
                <div className="bg-[#3a2010]/5 border border-brand-brown/10 rounded-[2rem] p-8 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] font-black uppercase bg-brand-yellow text-brand-brown px-2 py-0.5 rounded">Verified Profile Dossier</span>
                      <h3 className="text-2xl font-black italic text-[#3a2010] mt-1.5 uppercase">{selectedDashboardEmployee.name}</h3>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-1">
                        Assigned Branch: {selectedDashboardEmployee.branch_name} Station
                      </p>
                    </div>

                    <button
                      onClick={() => handleEditClick(selectedDashboardEmployee)}
                      className="py-2.5 px-6 rounded-xl bg-white hover:bg-brand-brown hover:text-white border border-brand-stone text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer"
                    >
                      Edit Dossier details
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-brand-stone/30 pt-4 text-xs">
                    <div>
                      <span className="text-zinc-400 font-bold">Date of Birth:</span>
                      <p className="text-[#3a2010] font-extrabold mt-1">{new Date(selectedDashboardEmployee.dob).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    </div>
                    <div>
                      <span className="text-zinc-400 font-bold">Weekly Off (Selected Week):</span>
                      <p className="text-purple-700 font-black mt-1 uppercase">💤 {getEmployeeWeeklyOffDay(selectedDashboardEmployee.id, selectedWeekStart) || 'None'}</p>
                    </div>
                    <div>
                      <span className="text-zinc-400 font-bold">Permanent Address:</span>
                      <p className="text-[#3a2010] font-extrabold mt-1 italic">{selectedDashboardEmployee.address}</p>
                    </div>
                  </div>

                  {/* Documents with Secure view icons */}
                  <div className="bg-white rounded-[1.5rem] p-6 border border-brand-stone mt-4 space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-brand-brown/70 tracking-wider">Mandatory Verification Documents Checklist (All Uploaded)</h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <a 
                        href={selectedDashboardEmployee.aadhaar_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-3 border border-brand-stone hover:bg-zinc-50 rounded-xl flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-emerald-600" />
                          <div className="text-left">
                            <span className="font-extrabold text-[10px] block text-brand-brown uppercase">Aadhaar Card</span>
                            <span className="text-[8px] text-zinc-400 font-bold uppercase font-mono">Compulsory</span>
                          </div>
                        </div>
                        <Eye className="w-3.5 h-3.5 text-zinc-400" />
                      </a>

                      <a 
                        href={selectedDashboardEmployee.pan_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-3 border border-brand-stone hover:bg-zinc-50 rounded-xl flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-[#bf913b]" />
                          <div className="text-left">
                            <span className="font-extrabold text-[10px] block text-brand-brown uppercase">PAN Card</span>
                            <span className="text-[8px] text-zinc-400 font-bold uppercase font-mono">Compulsory</span>
                          </div>
                        </div>
                        <Eye className="w-3.5 h-3.5 text-zinc-400" />
                      </a>

                      <a 
                        href={selectedDashboardEmployee.passbook_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-3 border border-brand-stone hover:bg-zinc-50 rounded-xl flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-sky-600" />
                          <div className="text-left">
                            <span className="font-extrabold text-[10px] block text-brand-brown uppercase">Passbook</span>
                            <span className="text-[8px] text-zinc-400 font-bold uppercase font-mono">Compulsory</span>
                          </div>
                        </div>
                        <Eye className="w-3.5 h-3.5 text-zinc-400" />
                      </a>
                    </div>
                  </div>

                </div>

              </div>
            ) : (
              <div className="p-8 text-center text-brand-brown/40 border border-brand-stone bg-white rounded-2xl">
                Please add or select a staff member to display dashboard statistics
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 6: WEEKLY VARIABLE LEAVE PLANNER */}
      {activeTab === 'weekly-off' && (
        <div className="bg-white rounded-[2rem] p-8 border border-brand-stone shadow-xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
              <h3 className="text-xl font-black italic uppercase text-brand-brown">Weekly Off Planner</h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                Schedule and modify a variable day-off each week for active staff
              </p>
            </div>

            <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
              {/* Week Selector Nav */}
              <div className="flex items-center gap-3 bg-brand-cream border border-brand-stone p-2 rounded-xl">
                <button 
                  type="button"
                  onClick={handlePrevWeek} 
                  className="p-1.5 hover:bg-[#3a2010]/5 rounded text-brand-brown transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-black text-brand-brown whitespace-nowrap">
                  {getWeekRangeLabel(selectedWeekStart)}
                </span>
                <button 
                  type="button"
                  onClick={handleNextWeek} 
                  className="p-1.5 hover:bg-[#3a2010]/5 rounded text-brand-brown transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Station filter from Attendance */}
              {user.role === 'ADMIN' ? (
                <select
                  value={attendanceBranchFilter}
                  onChange={e => setAttendanceBranchFilter(e.target.value)}
                  className="bg-brand-cream border border-brand-stone p-2 px-3 rounded-xl text-xs font-bold text-[#3a2010] outline-none"
                >
                  <option value="ALL">All Stations (Admin)</option>
                  {stations.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <div className="p-2 px-4 rounded-xl bg-indigo-50 border border-indigo-200/10 text-xs font-bold text-indigo-800">
                  📍 {managerBranch} Station
                </div>
              )}
            </div>
          </div>

          {filteredEmployeesForAttendance.length === 0 ? (
            <div className="p-12 text-center text-brand-brown/40 border border-dashed border-brand-stone/80 rounded-2xl">
              <UserIcon className="w-8 h-8 text-brand-brown/20 mx-auto mb-2" />
              <p className="font-extrabold uppercase text-xs">No employees assigned to {attendanceBranchFilter}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-stone/60">
                    <th className="py-4 px-4 text-[10px] font-black uppercase text-brand-brown/50 tracking-wider">Staff Name</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase text-brand-brown/50 tracking-wider">Station Branch</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase text-brand-brown/50 tracking-wider">Weekly Off Day</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase text-brand-brown/50 tracking-wider">Status on Chosen Week</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-stone/30">
                  {filteredEmployeesForAttendance.map(emp => {
                    const currentOff = weeklyOffs.find(w => w.employee_id === emp.id && w.week_start_date === selectedWeekStart);
                    const offDay = currentOff?.day_of_week || 'None';

                    return (
                      <tr key={emp.id} className="hover:bg-brand-cream/35 transition-colors">
                        <td className="py-4 px-4">
                          <span className="font-extrabold text-[#3a2010] block text-sm">{emp.name}</span>
                          <span className="text-[9px] font-mono text-zinc-400">ID: {emp.id.slice(0,8)}...</span>
                        </td>
                        <td className="py-4 px-4 italic text-xs font-bold text-brand-brown/60">
                          {emp.branch_name}
                        </td>
                        <td className="py-4 px-4">
                          <select
                            value={offDay}
                            onChange={e => handleSaveWeeklyOff(emp.id, e.target.value)}
                            className="p-2 border border-brand-stone rounded-xl text-xs font-bold text-[#3a2010] outline-none bg-brand-cream/10 hover:bg-brand-cream/40 focus:bg-white border-brand-stone transition-all"
                          >
                            <option value="None">None (No Week Off)</option>
                            <option value="Monday">Monday</option>
                            <option value="Tuesday">Tuesday</option>
                            <option value="Wednesday">Wednesday</option>
                            <option value="Thursday">Thursday</option>
                            <option value="Friday">Friday</option>
                            <option value="Saturday">Saturday</option>
                            <option value="Sunday">Sunday</option>
                          </select>
                        </td>
                        <td className="py-4 px-4">
                          {offDay !== 'None' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-50 border border-violet-200/10 text-[9px] font-black uppercase text-violet-700 font-bold">
                              💤 Scheduled off on {offDay}s
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-400 font-bold italic">Full week active (No Off Day)</span>
                          )}
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

      {/* MODAL 1: ADD / EDIT EMPLOYEE PROFILE */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-brand-cream rounded-[2.5rem] p-8 w-full max-w-lg border border-brand-stone shadow-2xl relative max-h-[90vh] overflow-y-auto no-scrollbar">
            
            <button 
              onClick={() => setIsFormOpen(false)} 
              className="absolute top-6 right-6 p-2 text-brand-brown hover:bg-[#3a2010]/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-2xl font-black mb-1 italic text-brand-brown uppercase">
              {editingEmployee ? 'Edit' : 'Register New'} <span className="text-brand-yellow">Employee Dossier</span>
            </h3>
            <p className="text-[9px] font-black uppercase text-zinc-400 mb-6 tracking-wider">
              Kyc compliance registry. Under Indian Labour laws, Aadhaar, PAN and Bank passbook uploads are compulsory.
            </p>

            <form onSubmit={handleSaveEmployee} className="space-y-4">
              
              {formError && (
                <div className="p-3.5 bg-red-50 border border-red-500/15 rounded-xl text-[10px] font-bold text-red-700 leading-normal">
                  ⚠️ {formError}
                </div>
              )}

              <div>
                <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider mb-1 block">Full legal name</label>
                <input 
                  type="text"
                  placeholder="Employee Full Name" 
                  value={formName} 
                  onChange={e => setFormName(e.target.value)} 
                  className="w-full p-3.5 rounded-xl border border-brand-stone bg-white text-brand-brown font-bold text-xs focus:ring-2 focus:ring-brand-yellow outline-none transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider mb-1 block">Date of Birth</label>
                  <input 
                    type="date"
                    value={formDob} 
                    onChange={e => setFormDob(e.target.value)} 
                    className="w-full p-3.5 rounded-xl border border-brand-stone bg-white text-brand-brown font-bold text-xs focus:ring-2 focus:ring-brand-yellow outline-none transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider mb-1 block">Assigned Station Branch</label>
                  <select
                    value={formBranch}
                    onChange={e => setFormBranch(e.target.value)}
                    className="w-full p-3.5 rounded-xl border border-brand-stone bg-white text-brand-brown font-bold text-xs focus:ring-2 focus:ring-brand-yellow outline-none transition-all"
                    required
                  >
                    <option value="">-- Choose Branch --</option>
                    {stations.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                    {stations.length === 0 && (
                      <option value="Headquarters">Headquarters</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider mb-1 block">Residential address</label>
                <textarea 
                  placeholder="Enter full primary residential address..." 
                  rows={2}
                  value={formAddress} 
                  onChange={e => setFormAddress(e.target.value)} 
                  className="w-full p-3.5 rounded-xl border border-brand-stone bg-white text-brand-brown font-bold text-xs focus:ring-2 focus:ring-brand-yellow outline-none transition-all resize-none"
                  required
                />
              </div>

              {/* Verified Documents Dropzones/Pickers */}
              <div className="bg-brand-stone/20 rounded-2xl p-4 border border-brand-stone/60 space-y-4">
                <p className="text-[9px] font-black uppercase tracking-wider text-[#3a2010]">
                  📌 COMPULSORY DOCUMENT UPLOADS (Aadhaar, PAN & Passbook)
                </p>

                {/* Aadhaar Upload fields */}
                <div>
                  <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Aadhaar card scan (PDF or Image)</label>
                  <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-brand-stone">
                    <input 
                      type="file" 
                      accept="image/*,application/pdf"
                      onChange={e => {
                        if (e.target.files) setAadhaarFile(e.target.files[0]);
                      }}
                      className="hidden"
                      id="aadhaar-picker"
                    />
                    <label 
                      htmlFor="aadhaar-picker"
                      className="cursor-pointer bg-brand-brown/10 hover:bg-brand-brown text-brand-brown hover:text-white transition-colors p-2 px-3 rounded-lg text-[9px] font-black uppercase"
                    >
                      Choose file
                    </label>
                    <span className="text-[9px] font-extrabold text-zinc-500 overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">
                      {aadhaarFile ? aadhaarFile.name : (aadhaarUrl ? '✓ Current Aadhaar Retained' : 'No file selected *')}
                    </span>
                  </div>
                </div>

                {/* PAN Card Upload fields */}
                <div>
                  <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">PAN card scan (PDF or Image)</label>
                  <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-brand-stone">
                    <input 
                      type="file" 
                      accept="image/*,application/pdf"
                      onChange={e => {
                        if (e.target.files) setPanFile(e.target.files[0]);
                      }}
                      className="hidden"
                      id="pan-picker"
                    />
                    <label 
                      htmlFor="pan-picker"
                      className="cursor-pointer bg-brand-brown/10 hover:bg-brand-brown text-brand-brown hover:text-white transition-colors p-2 px-3 rounded-lg text-[9px] font-black uppercase"
                    >
                      Choose file
                    </label>
                    <span className="text-[9px] font-extrabold text-zinc-500 overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">
                      {panFile ? panFile.name : (panUrl ? '✓ Current PAN Retained' : 'No file selected *')}
                    </span>
                  </div>
                </div>

                {/* Bank Passbook Upload fields */}
                <div>
                  <label className="text-[9px] font-black uppercase text-zinc-500 block mb-1">Bank Passbook front-page scan (Image or PDF)</label>
                  <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-brand-stone">
                    <input 
                      type="file" 
                      accept="image/*,application/pdf"
                      onChange={e => {
                        if (e.target.files) setPassbookFile(e.target.files[0]);
                      }}
                      className="hidden"
                      id="passbook-picker"
                    />
                    <label 
                      htmlFor="passbook-picker"
                      className="cursor-pointer bg-brand-brown/10 hover:bg-brand-brown text-brand-brown hover:text-white transition-colors p-2 px-3 rounded-lg text-[9px] font-black uppercase"
                    >
                      Choose file
                    </label>
                    <span className="text-[9px] font-extrabold text-zinc-500 overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">
                      {passbookFile ? passbookFile.name : (passbookUrl ? '✓ Current Passbook Retained' : 'No file selected *')}
                    </span>
                  </div>
                </div>

              </div>

              <button 
                type="submit" 
                className="w-full py-4 bg-brand-brown text-brand-yellow rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:scale-[1.01] transition-all cursor-pointer"
              >
                {editingEmployee ? 'Update Dossier' : 'Register Profile & Upload documents'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: REQUEST LEAVE OR VACATION (STANDALONE POPUP TRIGGER FROM DIRECTORY) */}
      {isLeaveRequestOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-brand-cream rounded-[2.5rem] p-8 w-full max-w-sm border border-brand-stone shadow-2xl relative">
            
            <button 
              onClick={() => setIsLeaveRequestOpen(false)} 
              className="absolute top-6 right-6 p-2 text-brand-brown opacity-60 hover:opacity-100 rounded-full transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black mb-4 italic text-brand-brown uppercase">
              Apply <span className="text-brand-yellow">for local leave</span>
            </h3>

            <form onSubmit={handleSaveLeaveRequest} className="space-y-4">
              {leaveError && (
                <div className="p-3 bg-red-50 border border-red-500/15 rounded-xl text-[10px] font-bold text-red-700">
                  ⚠️ {leaveError}
                </div>
              )}

              <div>
                <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Target Personnel</label>
                <select
                  value={leaveEmployeeId}
                  onChange={e => setLeaveEmployeeId(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none"
                  required
                >
                  <option value="">-- Select Employee --</option>
                  {employees
                    .filter(e => user.role === 'ADMIN' || e.branch_name === user.stationName)
                    .map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.branch_name})</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Start Date</label>
                <input
                  type="date"
                  value={leaveStartDate}
                  onChange={e => setLeaveStartDate(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">End Date</label>
                <input
                  type="date"
                  value={leaveEndDate}
                  onChange={e => setLeaveEndDate(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Reason for Absences</label>
                <textarea
                  placeholder="Medical reason, marriage, seasonal leave..."
                  rows={2}
                  value={leaveReason}
                  onChange={e => setLeaveReason(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none resize-none"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-brand-brown text-brand-yellow font-black uppercase text-[10px] tracking-widest rounded-xl shadow-md hover:scale-[1.01] transition-transform cursor-pointer"
              >
                Submit Application
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
