import { CompletedOrder, Customer } from '../types';
import { getISTDateString, calculateProgressiveEarned } from './storage';

// 1. SALT FOR SHA-256 HASHING
const HASH_SALT = "momomaya_ml_salt_2026";

// Async SHA-256 hashing function
export async function hashPhone(phone: string): Promise<string> {
  const normalized = phone.replace(/\D/g, ''); // standardize
  const msgUint8 = new TextEncoder().encode(normalized + HASH_SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Format date-time to ISO 8601 with offset +05:30
export function formatToISOWithOffset(dateStr: string | number | Date): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(d);
  const getVal = (type: string) => parts.find(p => p.type === type)?.value || '';
  
  const year = getVal('year');
  const month = getVal('month');
  const day = getVal('day');
  const hour = getVal('hour');
  const minute = getVal('minute');
  const second = getVal('second');
  
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+05:30`;
}

// 2. ITEM NORMALIZATION TYPES & GENERATOR
export interface ItemNormalization {
  raw_item_name: string;
  base_item_id: string;
  base_item_name: string;
  size: 'small' | 'medium' | 'large' | '';
  category: 'chicken' | 'veg' | 'paneer' | 'beverage' | 'other';
  is_redemption: boolean;
}

export function generateItemNormalizationMap(orders: CompletedOrder[]): Record<string, ItemNormalization> {
  const map: Record<string, ItemNormalization> = {};
  const distinctNames = new Set<string>();
  
  orders.forEach(o => {
    o.items?.forEach(item => {
      if (item.name) distinctNames.add(item.name);
    });
  });
  
  distinctNames.forEach(rawName => {
    let name = rawName;
    
    // 1. Check is_redemption
    let is_redemption = rawName.toLowerCase().includes('redeemed') || 
                        rawName.toLowerCase().includes('gift');
                        
    name = name.replace(/\((Redeemed|Gift)\)/gi, '').trim();
    name = name.replace(/\[(Redeemed|Gift)\]/gi, '').trim();
    
    // 2. Check size
    let size: 'small' | 'medium' | 'large' | '' = '';
    const nameLower = name.toLowerCase();
    if (nameLower.includes('large') || nameLower.includes('(l)')) {
      size = 'large';
    } else if (nameLower.includes('medium') || nameLower.includes('(m)') || nameLower.includes('normal - medium')) {
      size = 'medium';
    } else if (nameLower.includes('small') || nameLower.includes('(s)')) {
      size = 'small';
    }
    
    name = name.replace(/\((large|medium|small|l|m|s|normal\s*-\s*medium)\)/gi, '').trim();
    name = name.replace(/\[(large|medium|small|l|m|s|normal\s*-\s*medium)\]/gi, '').trim();
    
    // 3. Category guesser
    let category: 'chicken' | 'veg' | 'paneer' | 'beverage' | 'other' = 'other';
    const cleanLower = name.toLowerCase();
    if (cleanLower.includes('chicken') || cleanLower.includes('moburg') || cleanLower.includes('mowich')) {
      category = 'chicken';
    } else if (cleanLower.includes('paneer')) {
      category = 'paneer';
    } else if (cleanLower.includes('veg')) {
      category = 'veg';
    } else if (
      cleanLower.includes('cola') || 
      cleanLower.includes('pepsi') || 
      cleanLower.includes('sprite') || 
      cleanLower.includes('drink') || 
      cleanLower.includes('mojito') || 
      cleanLower.includes('beverage') || 
      cleanLower.includes('tea') || 
      cleanLower.includes('coffee') || 
      cleanLower.includes('soda') || 
      cleanLower.includes('water')
    ) {
      category = 'beverage';
    }
    
    // 4. base_item_id & base_item_name
    const base_item_name = name.replace(/\s+/g, ' ').trim();
    let base_item_id = base_item_name.toLowerCase()
      .replace(/[^a-z0-9\s_]/gi, '')
      .replace(/\s+/g, '_')
      .trim();
      
    if (!base_item_id) {
      base_item_id = 'unnamed_item';
    }
    
    map[rawName] = {
      raw_item_name: rawName,
      base_item_id,
      base_item_name,
      size,
      category,
      is_redemption
    };
  });
  
  return map;
}

// 3. COHORT HELPER: FILTER ORDERS BY STORE & DATES
export function getFilteredOrders(
  orders: CompletedOrder[],
  startDate: string,
  endDate: string,
  selectedStore: string,
  isAdmin: boolean,
  userStationName: string
): CompletedOrder[] {
  const storeToFilter = isAdmin ? selectedStore : (userStationName || 'All');
  return orders.filter(o => {
    if (storeToFilter !== 'All' && o.branchName !== storeToFilter) return false;
    const orderDateStr = getISTDateString(o.date);
    return orderDateStr >= startDate && orderDateStr <= endDate;
  });
}

// Escape quotes for RFC 4180 CSV compliance
export function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// 4. OPTION 1: orders.csv
export async function generateOrdersCsv(orders: CompletedOrder[]): Promise<{ csv: string; emptyCols: string[] }> {
  const headers = [
    'order_id', 'customer_id', 'ordered_at', 'store_id', 
    'channel', 'payment_method', 'is_verified', 
    'gross_amount', 'discount_amount', 'net_amount', 
    'coins_earned', 'coins_redeemed', 'offer_id'
  ];
  
  // order sorted history per phone to compute progressive coins
  const sortedOrdersByPhone: Record<string, CompletedOrder[]> = {};
  orders.forEach(o => {
    if (o.customerPhone) {
      if (!sortedOrdersByPhone[o.customerPhone]) sortedOrdersByPhone[o.customerPhone] = [];
      sortedOrdersByPhone[o.customerPhone].push(o);
    }
  });
  
  // Sort orders ascending
  Object.keys(sortedOrdersByPhone).forEach(phone => {
    sortedOrdersByPhone[phone].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  });
  
  // Pre-calculate running net spends
  const runningSpentByPhone: Record<string, number> = {};
  const hashCache: Record<string, string> = {};
  
  const rows: string[][] = [headers];
  
  for (const o of orders) {
    let hashedCustId = '';
    let coinsEarned = 0;
    
    if (o.customerPhone) {
      if (!hashCache[o.customerPhone]) {
        hashCache[o.customerPhone] = await hashPhone(o.customerPhone);
      }
      hashedCustId = hashCache[o.customerPhone];
      
      // Calculate progressive coins earned
      const prevSpent = runningSpentByPhone[o.customerPhone] || 0;
      const netVal = o.manualTotal != null ? o.manualTotal : o.total;
      const nextSpent = prevSpent + netVal;
      coinsEarned = calculateProgressiveEarned(nextSpent) - calculateProgressiveEarned(prevSpent);
      runningSpentByPhone[o.customerPhone] = nextSpent;
    }
    
    const coinsRedeemed = o.items
      ? o.items.reduce((acc, item) => acc + (item.paidWithCoins ? (item.coinsPrice || 0) * item.quantity : 0), 0)
      : 0;
      
    const gross = o.manualTotal != null ? o.manualTotal : (o.total + (o.manualDiscount || 0));
    const discount = o.manualDiscount || 0;
    const net = o.total;
    
    const channel = (o.type || '').toLowerCase().replace(/\s+/g, '_');
    const payment = (o.paymentMethod || '').toLowerCase();
    
    const row = [
      o.id,
      hashedCustId,
      formatToISOWithOffset(o.date),
      o.branchName,
      channel,
      payment,
      '', // is_verified (empty)
      gross,
      discount,
      net,
      coinsEarned,
      coinsRedeemed,
      ''  // offer_id (empty)
    ];
    
    rows.push(row.map(escapeCsvCell));
  }
  
  return {
    csv: rows.map(r => r.join(',')).join('\n'),
    emptyCols: ['is_verified', 'offer_id']
  };
}

// 5. OPTION 2: order_items.csv
export async function generateOrderItemsCsv(
  orders: CompletedOrder[],
  normMap: Record<string, ItemNormalization>
): Promise<{ csv: string; emptyCols: string[] }> {
  const headers = [
    'order_id', 'base_item_id', 'base_item_name', 'raw_item_name',
    'category', 'size', 'is_redemption', 'qty', 'unit_price'
  ];
  
  const rows: string[][] = [headers];
  
  orders.forEach(o => {
    o.items?.forEach(item => {
      const norm = normMap[item.name] || {
        base_item_id: item.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        base_item_name: item.name,
        category: 'other',
        size: '',
        is_redemption: item.paidWithCoins || false
      };
      
      const row = [
        o.id,
        norm.base_item_id,
        norm.base_item_name,
        item.name,
        norm.category,
        norm.size,
        norm.is_redemption ? 'true' : 'false',
        item.quantity,
        item.price
      ];
      rows.push(row.map(escapeCsvCell));
    });
  });
  
  return {
    csv: rows.map(r => r.join(',')).join('\n'),
    emptyCols: []
  };
}

// 6. OPTION 3: offers.csv
export async function generateOffersCsv(
  customers: Customer[],
  localCoupons: any[]
): Promise<{ csv: string; emptyCols: string[] }> {
  const headers = [
    'offer_id', 'customer_id', 'offer_type', 'sent_at',
    'redeemed_at', 'redemption_order_id'
  ];
  
  const hashCache: Record<string, string> = {};
  const rows: string[][] = [headers];
  
  // Welcome coupons
  for (const c of customers) {
    if (c.welcomeCouponCode) {
      if (!hashCache[c.phone]) {
        hashCache[c.phone] = await hashPhone(c.phone);
      }
      const hashedId = hashCache[c.phone];
      const row = [
        c.welcomeCouponCode,
        hashedId,
        'welcome_discount',
        formatToISOWithOffset(c.joinedDate || new Date().toISOString()),
        c.welcomeCouponUsed ? formatToISOWithOffset(c.lastVisit || '') : '', // approximate or leave empty
        '' // redemption_order_id
      ];
      rows.push(row.map(escapeCsvCell));
    }
  }
  
  // Marketing campaign coupons
  for (const coup of localCoupons) {
    const phone = coup.phone || '';
    if (!hashCache[phone] && phone) {
      hashCache[phone] = await hashPhone(phone);
    }
    const hashedId = phone ? hashCache[phone] : '';
    const row = [
      coup.couponCode || coup.coupon_code || '',
      hashedId,
      (coup.couponCode || '').toLowerCase().includes('mojito') ? 'free_item' : 'discount',
      formatToISOWithOffset(coup.createdAt || coup.created_at || ''),
      coup.isUsed || coup.is_used ? formatToISOWithOffset(coup.updatedAt || coup.expiresAt || '') : '',
      '' // redemption_order_id
    ];
    rows.push(row.map(escapeCsvCell));
  }
  
  return {
    csv: rows.map(r => r.join(',')).join('\n'),
    emptyCols: ['redemption_order_id']
  };
}

// 7. OPTION 4: customers_raw.csv
export async function generateCustomersRawCsv(
  customers: Customer[],
  orders: CompletedOrder[],
  normMap: Record<string, ItemNormalization>
): Promise<{ csv: string; emptyCols: string[] }> {
  const headers = [
    'customer_id', 'joined_at', 'last_seen_at', 'mincoins_balance',
    'favorite_base_item_id', 'favorite_base_item_name'
  ];
  
  const hashCache: Record<string, string> = {};
  const rows: string[][] = [headers];
  
  for (const c of customers) {
    if (!hashCache[c.phone]) {
      hashCache[c.phone] = await hashPhone(c.phone);
    }
    const hashedId = hashCache[c.phone];
    
    // Find customer's orders
    const custOrders = orders.filter(o => o.customerPhone === c.phone);
    
    // Find favorite item
    const itemCounts: Record<string, { id: string; name: string; count: number }> = {};
    custOrders.forEach(o => {
      o.items?.forEach(i => {
        const norm = normMap[i.name] || { base_item_id: i.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'), base_item_name: i.name };
        if (!itemCounts[norm.base_item_id]) {
          itemCounts[norm.base_item_id] = { id: norm.base_item_id, name: norm.base_item_name, count: 0 };
        }
        itemCounts[norm.base_item_id].count += i.quantity;
      });
    });
    
    let favoriteId = '';
    let favoriteName = '';
    let maxQty = 0;
    Object.values(itemCounts).forEach(item => {
      if (item.count > maxQty) {
        maxQty = item.count;
        favoriteId = item.id;
        favoriteName = item.name;
      }
    });
    
    const row = [
      hashedId,
      formatToISOWithOffset(c.joinedDate),
      c.lastVisit ? formatToISOWithOffset(c.lastVisit) : '',
      c.minCoins || '',
      favoriteId,
      favoriteName
    ];
    
    rows.push(row.map(escapeCsvCell));
  }
  
  return {
    csv: rows.map(r => r.join(',')).join('\n'),
    emptyCols: []
  };
}

// 8. OPTION 5: ML FEATURE SNAPSHOT BUILDER
export interface CustomerFeatureRow {
  // Keys
  customer_id: string;
  snapshot_date: string;
  
  // Tenure
  days_since_join: number | '';
  days_since_last_order: number | '';
  
  // Frequency
  total_orders: number;
  orders_last_30d: number;
  orders_prior_30d: number;
  
  // Monetary
  ltv: number;
  aov: number | '';
  spend_last_30d: number;
  max_order_value: number | '';
  std_order_value: number | '';
  
  // Inter-purchase rhythm
  mean_days_between_orders: number | '';
  std_days_between_orders: number | '';
  last_ipi_days: number | '';
  ipi_ratio: number | '';
  ipi_trend: number | '';
  
  // Time habits
  modal_order_hour: number | '';
  modal_shift: 'afternoon' | 'evening' | 'night' | 'late_night' | '';
  peak_day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' | '';
  evening_share: number;
  night_share: number;
  weekend_share: number;
  
  // Channel & store
  dine_in_share: number;
  takeaway_share: number;
  delivery_share: number;
  cash_share: number;
  distinct_stores_visited: number;
  primary_store_id: string;
  
  // Basket
  distinct_items_tried: number;
  favorite_base_item_id: string;
  chicken_share: number;
  avg_items_per_order: number | '';
  redemption_item_share: number;
  
  // Loyalty
  coins_balance_asof: number | '';
  coins_earned_total: number;
  coins_redeemed_total: number;
  coin_redemption_rate: number | '';
  offers_received: number;
  offers_redeemed: number;
  offer_response_rate: number | '';
  days_since_last_redemption: number | '';
  
  // Labels (strictly after snapshot_date)
  ordered_within_window: number | '';
  n_orders_in_window: number | '';
  spend_in_window: number | '';
}

// Build customer features pure function
export async function buildCustomerFeatures(
  customers: Customer[],
  orders: CompletedOrder[],
  localCoupons: any[],
  normMap: Record<string, ItemNormalization>,
  snapshotDate: string,
  labelWindowDays: number = 30
): Promise<CustomerFeatureRow[]> {
  const results: CustomerFeatureRow[] = [];
  const snapTime = new Date(snapshotDate).getTime();
  
  // Find maximum order/event date across ALL data to prevent leakage and handle partial label warning
  const latestOrderTime = orders.length > 0 
    ? Math.max(...orders.map(o => new Date(o.date).getTime())) 
    : 0;
    
  const labelWindowEndTime = snapTime + labelWindowDays * 24 * 3600 * 1000;
  const labelsEmpty = labelWindowEndTime > latestOrderTime;
  
  const hashCache: Record<string, string> = {};
  
  for (const c of customers) {
    const joinTime = new Date(c.joinedDate).getTime();
    
    // 1. CRITICAL ANTI-LEAKAGE: Exclude customers whose joined_at is on or after snapshot_date
    if (joinTime >= snapTime) continue;
    
    // Hash customer ID
    if (!hashCache[c.phone]) {
      hashCache[c.phone] = await hashPhone(c.phone);
    }
    const hashedId = hashCache[c.phone];
    
    // 2. CRITICAL ANTI-LEAKAGE: Only orders STRICTLY BEFORE snapshot_date
    const pastOrders = orders
      .filter(o => o.customerPhone === c.phone && new Date(o.date).getTime() < snapTime)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
    // Exclude if no history before snapshot_date
    if (pastOrders.length === 0) continue;
    
    // 3. Label Window calculations (ONLY events in [snapshotDate, snapshotDate + label_window_days))
    const futureOrders = orders.filter(o => {
      if (o.customerPhone !== c.phone) return false;
      const t = new Date(o.date).getTime();
      return t >= snapTime && t < labelWindowEndTime;
    });
    
    // Tenure
    const days_since_join = parseFloat(((snapTime - joinTime) / (1000 * 60 * 60 * 24)).toFixed(4));
    
    const lastOrder = pastOrders[pastOrders.length - 1];
    const lastOrderTime = new Date(lastOrder.date).getTime();
    const days_since_last_order = parseFloat(((snapTime - lastOrderTime) / (1000 * 60 * 60 * 24)).toFixed(4));
    
    // Frequency
    const total_orders = pastOrders.length;
    const time30dBefore = snapTime - 30 * 24 * 3600 * 1000;
    const time60dBefore = snapTime - 60 * 24 * 3600 * 1000;
    
    const orders_last_30d = pastOrders.filter(o => new Date(o.date).getTime() >= time30dBefore).length;
    const orders_prior_30d = pastOrders.filter(o => {
      const t = new Date(o.date).getTime();
      return t >= time60dBefore && t < time30dBefore;
    }).length;
    
    // Monetary
    const pastSpendValues = pastOrders.map(o => o.manualTotal != null ? o.manualTotal : o.total);
    const ltv = parseFloat(pastSpendValues.reduce((acc, v) => acc + v, 0).toFixed(4));
    const aov = total_orders > 0 ? parseFloat((ltv / total_orders).toFixed(4)) : '';
    
    const spend_last_30d = parseFloat(
      pastOrders
        .filter(o => new Date(o.date).getTime() >= time30dBefore)
        .map(o => o.manualTotal != null ? o.manualTotal : o.total)
        .reduce((acc, v) => acc + v, 0)
        .toFixed(4)
    );
    
    const max_order_value = pastSpendValues.length > 0 ? parseFloat(Math.max(...pastSpendValues).toFixed(4)) : '';
    
    // Standard deviation of order values
    let std_order_value: number | '' = '';
    if (pastSpendValues.length > 1 && typeof aov === 'number') {
      const sqDiffs = pastSpendValues.map(v => Math.pow(v - aov, 2));
      const meanSqDiff = sqDiffs.reduce((acc, v) => acc + v, 0) / (pastSpendValues.length - 1);
      std_order_value = parseFloat(Math.sqrt(meanSqDiff).toFixed(4));
    } else if (pastSpendValues.length === 1) {
      std_order_value = 0;
    }
    
    // Inter-purchase rhythm
    const intervals: number[] = [];
    for (let i = 1; i < pastOrders.length; i++) {
      const prevT = new Date(pastOrders[i - 1].date).getTime();
      const currT = new Date(pastOrders[i].date).getTime();
      intervals.push(parseFloat(((currT - prevT) / (1000 * 60 * 60 * 24)).toFixed(4)));
    }
    
    let mean_days_between_orders: number | '' = '';
    let std_days_between_orders: number | '' = '';
    let last_ipi_days: number | '' = '';
    let ipi_ratio: number | '' = '';
    let ipi_trend: number | '' = '';
    
    if (intervals.length > 0) {
      const sum = intervals.reduce((acc, v) => acc + v, 0);
      mean_days_between_orders = parseFloat((sum / intervals.length).toFixed(4));
      last_ipi_days = intervals[intervals.length - 1];
      
      if (intervals.length > 1) {
        const sqDiffs = intervals.map(v => Math.pow(v - (mean_days_between_orders as number), 2));
        const meanSqDiff = sqDiffs.reduce((acc, v) => acc + v, 0) / (intervals.length - 1);
        std_days_between_orders = parseFloat(Math.sqrt(meanSqDiff).toFixed(4));
      } else {
        std_days_between_orders = 0;
      }
      
      if (typeof days_since_last_order === 'number' && mean_days_between_orders > 0) {
        ipi_ratio = parseFloat((days_since_last_order / mean_days_between_orders).toFixed(4));
      }
      
      if (intervals.length >= 4 && mean_days_between_orders > 0) {
        const last3Gaps = intervals.slice(-3);
        const meanLast3 = last3Gaps.reduce((acc, v) => acc + v, 0) / 3;
        ipi_trend = parseFloat((meanLast3 / mean_days_between_orders).toFixed(4));
      }
    }
    
    // Time habits
    const hours = pastOrders.map(o => {
      const d = new Date(o.date);
      // get hour in IST
      const kolkataTimeStr = d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false });
      return parseInt(kolkataTimeStr, 10) || 0;
    });
    
    // Modal hour
    const hourCounts: Record<number, number> = {};
    hours.forEach(h => hourCounts[h] = (hourCounts[h] || 0) + 1);
    let modal_order_hour: number | '' = '';
    let maxHourCount = 0;
    Object.entries(hourCounts).forEach(([h, count]) => {
      if (count > maxHourCount) {
        maxHourCount = count;
        modal_order_hour = parseInt(h, 10);
      }
    });
    
    // Modal shift & shares
    // afternoon 12-18, evening 18-21, night 21-22, late_night 22-24 (and 0-12 map to late_night/morning, let's treat 12-18 as afternoon, etc.)
    let afternoonCount = 0;
    let eveningCount = 0;
    let nightCount = 0;
    let lateNightCount = 0;
    
    hours.forEach(h => {
      if (h >= 12 && h < 18) afternoonCount++;
      else if (h >= 18 && h < 21) eveningCount++;
      else if (h >= 21 && h < 22) nightCount++;
      else lateNightCount++;
    });
    
    let modal_shift: 'afternoon' | 'evening' | 'night' | 'late_night' | '' = '';
    const shiftCounts = { afternoon: afternoonCount, evening: eveningCount, night: nightCount, late_night: lateNightCount };
    let maxShiftCount = 0;
    Object.entries(shiftCounts).forEach(([shift, count]) => {
      if (count > maxShiftCount) {
        maxShiftCount = count;
        modal_shift = shift as any;
      }
    });
    
    const evening_share = parseFloat((eveningCount / total_orders).toFixed(4));
    const night_share = parseFloat((nightCount / total_orders).toFixed(4));
    
    // Peak day
    const days = pastOrders.map(o => {
      const d = new Date(o.date);
      const kolkataDayStr = d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).toLowerCase();
      return kolkataDayStr;
    });
    
    const dayCounts: Record<string, number> = {};
    days.forEach(d => dayCounts[d] = (dayCounts[d] || 0) + 1);
    let peak_day: any = '';
    let maxDayCount = 0;
    Object.entries(dayCounts).forEach(([d, count]) => {
      if (count > maxDayCount) {
        maxDayCount = count;
        peak_day = d;
      }
    });
    
    const weekendCount = days.filter(d => d === 'sat' || d === 'sun').length;
    const weekend_share = parseFloat((weekendCount / total_orders).toFixed(4));
    
    // Channel & store
    const dineInCount = pastOrders.filter(o => (o.type || '').toUpperCase() === 'DINE_IN').length;
    const takeawayCount = pastOrders.filter(o => (o.type || '').toUpperCase() === 'TAKEAWAY').length;
    const deliveryCount = pastOrders.filter(o => (o.type || '').toUpperCase() === 'DELIVERY').length;
    
    const dine_in_share = parseFloat((dineInCount / total_orders).toFixed(4));
    const takeaway_share = parseFloat((takeawayCount / total_orders).toFixed(4));
    const delivery_share = parseFloat((deliveryCount / total_orders).toFixed(4));
    
    const cashCount = pastOrders.filter(o => (o.paymentMethod || '').toUpperCase() === 'CASH').length;
    const cash_share = parseFloat((cashCount / total_orders).toFixed(4));
    
    const storesVisited = new Set(pastOrders.map(o => o.branchName));
    const distinct_stores_visited = storesVisited.size;
    
    const storeCounts: Record<string, number> = {};
    pastOrders.forEach(o => storeCounts[o.branchName] = (storeCounts[o.branchName] || 0) + 1);
    let primary_store_id = '';
    let maxStoreCount = 0;
    Object.entries(storeCounts).forEach(([store, count]) => {
      if (count > maxStoreCount) {
        maxStoreCount = count;
        primary_store_id = store;
      }
    });
    
    // Basket
    const itemIds = new Set<string>();
    const basketCounts: Record<string, number> = {};
    let totalItemsQty = 0;
    let chickenQty = 0;
    let redemptionQty = 0;
    
    pastOrders.forEach(o => {
      o.items?.forEach(i => {
        const norm = normMap[i.name] || {
          base_item_id: i.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          base_item_name: i.name,
          category: 'other',
          is_redemption: i.paidWithCoins || false
        };
        
        itemIds.add(norm.base_item_id);
        basketCounts[norm.base_item_id] = (basketCounts[norm.base_item_id] || 0) + i.quantity;
        totalItemsQty += i.quantity;
        
        if (norm.category === 'chicken') chickenQty += i.quantity;
        if (norm.is_redemption || i.paidWithCoins) redemptionQty += i.quantity;
      });
    });
    
    const distinct_items_tried = itemIds.size;
    
    let favorite_base_item_id = '';
    let maxBasketCount = 0;
    Object.entries(basketCounts).forEach(([id, count]) => {
      if (count > maxBasketCount) {
        maxBasketCount = count;
        favorite_base_item_id = id;
      }
    });
    
    const chicken_share = totalItemsQty > 0 ? parseFloat((chickenQty / totalItemsQty).toFixed(4)) : 0;
    const redemption_item_share = totalItemsQty > 0 ? parseFloat((redemptionQty / totalItemsQty).toFixed(4)) : 0;
    const avg_items_per_order = total_orders > 0 ? parseFloat((totalItemsQty / total_orders).toFixed(4)) : '';
    
    // Loyalty
    const coins_earned_total = calculateProgressiveEarned(ltv);
    const coins_redeemed_total = pastOrders.reduce((acc, o) => {
      const red = o.items
        ? o.items.reduce((sum, i) => sum + (i.paidWithCoins ? (i.coinsPrice || 0) * i.quantity : 0), 0)
        : 0;
      return acc + red;
    }, 0);
    
    const coins_balance_asof = Math.max(0, coins_earned_total - coins_redeemed_total);
    const coin_redemption_rate = coins_earned_total > 0 ? parseFloat((coins_redeemed_total / coins_earned_total).toFixed(4)) : 0;
    
    // Offers
    const offersReceivedList = [
      ...(c.welcomeCouponCode ? [{ code: c.welcomeCouponCode, type: 'welcome', date: c.joinedDate }] : []),
      ...localCoupons.filter(coup => coup.phone === c.phone).map(coup => ({
        code: coup.couponCode || coup.coupon_code || '',
        type: 'marketing',
        date: coup.createdAt || coup.created_at || c.joinedDate
      }))
    ].filter(off => new Date(off.date).getTime() < snapTime);
    
    const offers_received = offersReceivedList.length;
    
    // Offers redeemed strictly before snapshot_date
    let offers_redeemed = 0;
    if (c.welcomeCouponCode && c.welcomeCouponUsed) {
      // check if welcome coupon used order exists before snapshot_date
      // we can check if they redeemed coins or has positive orders
      const hasPastCoinsOrder = pastOrders.some(o => o.items?.some(i => i.paidWithCoins));
      if (hasPastCoinsOrder) offers_redeemed++;
    }
    
    const pastRedeemedMarketingCoupons = localCoupons.filter(coup => {
      if (coup.phone !== c.phone) return false;
      if (!(coup.isUsed || coup.is_used)) return false;
      const useTime = new Date(coup.updatedAt || coup.expiresAt || '').getTime();
      return useTime < snapTime;
    });
    offers_redeemed += pastRedeemedMarketingCoupons.length;
    
    const offer_response_rate = offers_received > 0 ? parseFloat((offers_redeemed / offers_received).toFixed(4)) : '';
    
    // Days since last redemption
    const redemptionOrders = pastOrders.filter(o => {
      return o.items?.some(i => {
        const norm = normMap[i.name];
        return i.paidWithCoins || (norm && norm.is_redemption);
      });
    });
    
    let days_since_last_redemption: number | '' = '';
    if (redemptionOrders.length > 0) {
      const lastRedDate = new Date(redemptionOrders[redemptionOrders.length - 1].date).getTime();
      days_since_last_redemption = parseFloat(((snapTime - lastRedDate) / (1000 * 60 * 60 * 24)).toFixed(4));
    }
    
    // Labels window outputs
    let ordered_within_window: number | '' = '';
    let n_orders_in_window: number | '' = '';
    let spend_in_window: number | '' = '';
    
    if (!labelsEmpty) {
      ordered_within_window = futureOrders.length > 0 ? 1 : 0;
      n_orders_in_window = futureOrders.length;
      spend_in_window = parseFloat(
        futureOrders
          .map(o => o.manualTotal != null ? o.manualTotal : o.total)
          .reduce((acc, v) => acc + v, 0)
          .toFixed(4)
      );
    }
    
    results.push({
      customer_id: hashedId,
      snapshot_date: getISTDateString(snapshotDate),
      days_since_join,
      days_since_last_order,
      total_orders,
      orders_last_30d,
      orders_prior_30d,
      ltv,
      aov,
      spend_last_30d,
      max_order_value,
      std_order_value,
      mean_days_between_orders,
      std_days_between_orders,
      last_ipi_days,
      ipi_ratio,
      ipi_trend,
      modal_order_hour,
      modal_shift,
      peak_day,
      evening_share,
      night_share,
      weekend_share,
      dine_in_share,
      takeaway_share,
      delivery_share,
      cash_share,
      distinct_stores_visited,
      primary_store_id,
      distinct_items_tried,
      favorite_base_item_id,
      chicken_share,
      avg_items_per_order,
      redemption_item_share,
      coins_balance_asof,
      coins_earned_total,
      coins_redeemed_total,
      coin_redemption_rate,
      offers_received,
      offers_redeemed,
      offer_response_rate,
      days_since_last_redemption,
      ordered_within_window,
      n_orders_in_window,
      spend_in_window
    });
  }
  
  return results;
}

// Convert ML feature list to CSV string
export function generateFeaturesCsv(features: CustomerFeatureRow[]): { csv: string; emptyCols: string[] } {
  if (features.length === 0) return { csv: '', emptyCols: [] };
  const headers = Object.keys(features[0]);
  const rows: string[][] = [headers];
  
  // Track which columns are entirely empty
  const emptyTrack: Record<string, boolean> = {};
  headers.forEach(h => emptyTrack[h] = true);
  
  features.forEach(feat => {
    const row = headers.map(h => {
      const val = (feat as any)[h];
      if (val !== '' && val !== null && val !== undefined) {
        emptyTrack[h] = false;
      }
      return escapeCsvCell(val);
    });
    rows.push(row);
  });
  
  const emptyCols = headers.filter(h => emptyTrack[h]);
  
  return {
    csv: rows.map(r => r.join(',')).join('\n'),
    emptyCols
  };
}
