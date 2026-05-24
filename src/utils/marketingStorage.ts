export interface MarketingCoupon {
  phone: string;
  customerName: string;
  couponCode: string;
  createdAt: string;  // ISO timestamp
  expiresAt: string;  // ISO timestamp
  isUsed: boolean;
}

export interface ReminderLog {
  phone: string;
  type: 'inactive' | 'mincoins';
  sentAt: string;  // ISO timestamp
}

const STORAGE_KEY = 'MOMOMAYA_MARKETING_COUPONS';
const REMINDERS_KEY = 'MOMOMAYA_MARKETING_REMINDERS';

export function getMarketingCoupons(): MarketingCoupon[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse marketing coupons', e);
    return [];
  }
}

export function saveMarketingCoupons(coupons: MarketingCoupon[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(coupons));
  } catch (e) {
    console.error('Failed to save marketing coupons', e);
  }
}

export function getReminderLogs(): ReminderLog[] {
  try {
    const raw = localStorage.getItem(REMINDERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse reminder logs', e);
    return [];
  }
}

export function saveReminderLogs(logs: ReminderLog[]): void {
  try {
    localStorage.setItem(REMINDERS_KEY, JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to save reminder logs', e);
  }
}

export function logReminderSent(phone: string, type: 'inactive' | 'mincoins'): void {
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const logs = getReminderLogs();
  const newLog: ReminderLog = {
    phone: digits,
    type,
    sentAt: new Date().toISOString()
  };
  
  logs.push(newLog);
  saveReminderLogs(logs);
}

export function clearReminderLog(phone: string, type: 'inactive' | 'mincoins'): void {
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const logs = getReminderLogs();
  const filtered = logs.filter(l => !(l.phone === digits && l.type === type));
  saveReminderLogs(filtered);
}

export function hasRecentReminder(phone: string, type: 'inactive' | 'mincoins'): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const logs = getReminderLogs();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString();
  
  return logs.some(l => l.phone === digits && l.type === type && l.sentAt > cutoff);
}

export function getLastReminderTime(phone: string, type: 'inactive' | 'mincoins'): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const logs = getReminderLogs();
  const userLogs = logs.filter(l => l.phone === digits && l.type === type);
  if (userLogs.length === 0) return null;
  
  userLogs.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  return userLogs[0].sentAt;
}

export function addMarketingCoupon(phone: string, customerName: string): MarketingCoupon {
  const coupons = getMarketingCoupons();
  
  // Normalize phone to last 10 digits
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const couponCode = `MOJITO-${digits.slice(-4).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
  
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 48 * 60 * 60 * 1000); // 48 hours
  
  // Invalidate any older active coupons of the same user to avoid duplicates
  const updatedCoupons = coupons.map(c => {
    if (c.phone === digits && !c.isUsed) {
      return { ...c, isUsed: true }; // soft deactivate
    }
    return c;
  });

  const newCoupon: MarketingCoupon = {
    phone: digits,
    customerName: customerName || 'Valued Customer',
    couponCode,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    isUsed: false
  };
  
  updatedCoupons.push(newCoupon);
  saveMarketingCoupons(updatedCoupons);
  return newCoupon;
}

export function getActiveCouponForCustomer(phone: string): MarketingCoupon | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const coupons = getMarketingCoupons();
  const now = new Date().toISOString();
  
  // Find valid coupon
  const found = coupons.find(c => 
    c.phone === digits && 
    !c.isUsed && 
    c.expiresAt > now
  );
  
  return found || null;
}

export function useCouponForCustomer(phone: string): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const coupons = getMarketingCoupons();
  const now = new Date().toISOString();
  
  let found = false;
  const updated = coupons.map(c => {
    if (c.phone === digits && !c.isUsed && c.expiresAt > now) {
      found = true;
      return { ...c, isUsed: true };
    }
    return c;
  });
  
  if (found) {
    saveMarketingCoupons(updated);
  }
  return found;
}
