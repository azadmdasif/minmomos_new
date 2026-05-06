
export type PreparationType = 'steamed' | 'fried' | 'normal' | 'peri-peri' | 'pan-fried';
export type Size = 'small' | 'medium' | 'large';
export type PaymentMethod = 'Cash' | 'UPI' | 'Card';
export type Category = 'momo' | 'side' | 'drink' | 'combo' | 'moburg';
export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type OrderStatus = 'ORDERED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED';
export type UserRole = 'ADMIN' | 'STORE_MANAGER';
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
  deletionInfo?: {
    reason: string;
    date: string;
  };
}
