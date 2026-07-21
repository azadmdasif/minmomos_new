
export type PreparationType = 'steamed' | 'fried' | 'normal' | 'peri-peri' | 'pan-fried';
export type Size = 'small' | 'medium' | 'large';
export type PaymentMethod = 'Cash' | 'UPI' | 'Card';
export type Category = 'momo' | 'side' | 'drink' | 'combo' | 'moburg';
export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type OrderStatus = 'ORDERED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED' | 'REVIEW_COLLECTED' | 'REVIEW_DENIED';
export type UserRole = 'ADMIN' | 'STORE_MANAGER' | 'CASHIER' | 'COFOUNDER';
export type MaterialCategory = 'MOMO' | 'PACKET' | 'INGREDIENT';

export interface Station {
  id: string;
  name: string;
  location?: string;
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  station_id?: string;
  stationName?: string;
  assignedStations?: { id: string, name: string }[];
}

export interface RawMaterial {
  id: string;
  name: string;
  unit: string;
  category: MaterialCategory;
  current_stock: number;
  branch_name: string;
  is_finished?: boolean;
  request_pending?: boolean;
  subcategory?: string;
}

export interface CentralMaterial {
  id: string;
  name: string;
  unit: string;
  category: MaterialCategory;
  current_stock: number;
  last_purchase_cost?: number;
  last_purchase_date?: string;
  is_finished?: boolean;
  subcategory?: string;
}

export interface StockAllocation {
  id: string;
  material_id: string;
  material_name: string;
  station_name: string;
  quantity: number;
  unit: string;
  date: string;
  is_voided?: boolean;
  void_reason?: string;
}

export interface PaymentHistoryEntry {
  event: 'payment' | 'edit' | 'unpay';
  amount?: number;
  date: string;
  performed_by: string;
  notes?: string;
  reason?: string;
  payment_mode?: string;
  previous_details?: {
    paid_at?: string | null;
    paid_by?: string | null;
    payment_notes?: string | null;
    amount?: number | null;
    payment_mode?: string | null;
  };
}

export interface Procurement {
  id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit: string;
  total_cost: number;
  vendor?: string;
  date: string;
  is_voided?: boolean;
  void_reason?: string;
  is_paid?: boolean;
  paid_at?: string;
  paid_by?: string;
  payment_notes?: string;
  payment_mode?: string;
  payment_history?: PaymentHistoryEntry[];
}

export interface MenuItem {
  id: string;
  name: string;
  image: string;
  category: Category;
  minCoinsPrices?: {
    [key in PreparationType]?: {
      [key in Size]?: number;
    }
  };
  preparations: {
    [key in PreparationType]?: {
      [key in Size]?: number;
    };
  };
  costs: {
    [key in PreparationType]?: {
      [key in Size]?: number;
    };
  };
  recipe?: RecipeRequirement[]; 
  sizeRecipes?: {
    [key in Size]?: RecipeRequirement[];
  };
}

export interface RecipeRequirement {
  materialId: string;
  quantity: number;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  cost: number;
  quantity: number;
  parentItemId?: string;
  paidWithCoins?: boolean;
  coinsPrice?: number;
}

export interface DiningTable {
  id: string;
  number: string;
  capacity: number;
  status: string;
  current_order_id?: string | null;
}

export interface Customer {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  birthday?: string;
  note?: string;
  totalOrders: number;
  totalSpent: number;
  minCoins?: number;
  lastVisit?: string | null;
  joinedDate: string;
  welcomeCouponUsed?: boolean;
  welcomeCouponCode?: string;
}

export interface CompletedOrder {
  id: string;
  billNumber: number;
  type: OrderType;
  status: OrderStatus;
  items: OrderItem[];
  total: number;
  date: string;
  paymentMethod?: PaymentMethod;
  branchName: string;
  customerPhone?: string;
  customerId?: string;
  manualTotal?: number;
  manualDiscount?: number;
  cashierId?: string;
  cashierName?: string;
  deletionInfo?: {
    reason: string;
    date: string;
  };
}

export interface CustomOffer {
  id: string;
  name: string;
  minOrderValue: number;
  freeItemName?: string;
  offerType?: 'free_item' | 'discount';
  discountType?: 'percentage' | 'flat';
  discountValue?: number;
  targetGroup: 'all' | 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  isActive: boolean;
  createdAt: string;
}

export interface FreeItemTag {
  id: string;
  code: string;
  itemName: string;
  expiresAt: string; // ISO format
  createdAt: string;
}

export interface FreeItemClaim {
  id: string;
  phone: string;
  tagCode: string;
  itemName: string;
  expiresAt: string; // ISO format
  sentAt: string;
  isClaimed: boolean;
}

export interface DiscountTag {
  id: string;
  code: string;
  discountPercentage: number;
  expiresAt: string; // ISO format
  createdAt: string;
}

export interface DiscountClaim {
  id: string;
  phone: string;
  tagCode: string;
  discountPercentage: number;
  expiresAt: string; // ISO format
  sentAt: string;
  isClaimed: boolean;
}

// Daily Operations interfaces
export type DailyOpStatus = 'Arrived' | 'AttendanceDone' | 'OpeningCashAndInventoryDone' | 'OpeningSOPDone' | 'Operations' | 'ClosingStarted' | 'ClosingDone' | 'Closed';

export interface DailyOpAttendance {
  employeeId: string;
  name: string;
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'NOT_ARRIVED_YET';
  arrivalTime?: string;
  remarks?: string;
}

export interface DailyOpInventoryItem {
  id: string;
  name: string;
  expectedQty: number;
  actualQty?: number;
  reason?: string;
  unit: string;
}

export interface DailyOpEvent {
  id: string;
  type: 'COMPLAINT' | 'STAFF' | 'EQUIPMENT' | 'WASTAGE';
  timestamp: string;
  details: {
    customerName?: string;
    complaint?: string;
    resolution?: string;
    staffIssueType?: string; // Late, Absent, Behaviour, Training, Other
    equipmentIssueType?: string; // POS, Internet, Freezer, Gas, Lights, Other
    item?: string;
    quantity?: number;
    reason?: string;
    remarks?: string;
    photo?: string;
  };
}

export interface DailyOperationRecord {
  id?: string;
  date: string; // YYYY-MM-DD
  branchName: string;
  managerName: string;
  status: DailyOpStatus;
  openingTime?: string; // ISO String
  openingGps?: string;
  openingPhoto?: string;
  attendance: DailyOpAttendance[];
  openingCash?: number;
  openingCashDiscrepancyReason?: string;
  openingInventory: DailyOpInventoryItem[];
  openingSopChecklist: { task: string; completed: boolean }[];
  openingSopTime?: string; // ISO String
  openingSopPhotos: string[]; // URLs or base64
  events: DailyOpEvent[];
  googleReviewsCount: number;
  managerNotes?: string;
  closingSopChecklist: { task: string; completed: boolean }[];
  closingSopTime?: string; // ISO String
  closingCash?: number;
  closingUpi?: number;
  closingDiscrepancyReason?: string;
  closingTime?: string; // ISO String
  closingPhoto?: string;
  createdAt?: string;
}export interface Vendor {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  created_at: string;
}

export interface VendorMapping {
  id: string;
  item_id: string;
  vendor_id: string;
  created_at: string;
}

