import { supabase } from '../src/utils/supabase';

export type CompareChannelKey =
  | 'ALL'
  | 'DINE_IN'
  | 'TAKEAWAY'
  | 'DELIVERY'
  | 'DELIVERY_MINMOMOS'
  | 'DELIVERY_MINCHICKEN';
export type OrderChannelOnly = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type DeliveryBrandBucketKey = 'MINMOMOS' | 'MINCHICKEN' | 'UNASSIGNED';

export interface ServerBucketInput {
  id: string;
  label: string;
  min: number;
  max: number | null; // null represents Infinity
}

export interface TicketBucketQueryRequest {
  startDate: string; // YYYY-MM-DD in IST
  endDate: string;   // YYYY-MM-DD in IST
  branchName?: string;
  segmentFilter?: 'ALL' | 'STUDENT' | 'REGULAR';
  excludeToday?: boolean;
  buckets: ServerBucketInput[];
  forceRefresh?: boolean;
}

export interface BucketChannelAggregateRow {
  bucketId: string;
  channel: OrderChannelOnly;
  orders: number;
  revenue: number;
}

export interface BucketDeliveryBrandAggregateRow {
  bucketId: string;
  brand: DeliveryBrandBucketKey;
  orders: number;
  revenue: number;
}

export interface ServerPeriodAggregation {
  periodStart: string;
  periodEnd: string;
  effectiveStart: string;
  effectiveEnd: string;
  calendarDays: number;
  activeDays: {
    ALL: number;
    DINE_IN: number;
    TAKEAWAY: number;
    DELIVERY: number;
    DELIVERY_MINMOMOS?: number;
    DELIVERY_MINCHICKEN?: number;
  };
  rows: BucketChannelAggregateRow[];
  deliveryBrandRows?: BucketDeliveryBrandAggregateRow[];
  channelTotals: {
    ALL: { orders: number; revenue: number };
    DINE_IN: { orders: number; revenue: number };
    TAKEAWAY: { orders: number; revenue: number };
    DELIVERY: { orders: number; revenue: number };
    DELIVERY_MINMOMOS?: { orders: number; revenue: number };
    DELIVERY_MINCHICKEN?: { orders: number; revenue: number };
  };
  fromCache?: boolean;
  source?: 'rpc' | 'server_aggregate';
}

const CACHE_TTL_MS = 3 * 60 * 1000;
const periodCache = new Map<string, { timestamp: number; data: ServerPeriodAggregation }>();
let studentPhonesCache: { timestamp: number; phones: Set<string> } | null = null;

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const cleaned = phone.toString().replace(/\D/g, '');
  return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
}

function getISTDateString(date?: string | number | Date): string {
  const d = date ? new Date(date) : new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

function addDaysIST(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + days);
  const dt = new Date(utc);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function diffDaysInclusive(startStr: string, endStr: string): number {
  if (!startStr || !endStr || endStr < startStr) return 0;
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const sMs = Date.UTC(sy, sm - 1, sd);
  const eMs = Date.UTC(ey, em - 1, ed);
  return Math.floor((eMs - sMs) / (24 * 3600 * 1000)) + 1;
}

async function getStudentPhoneSet(forceRefresh = false): Promise<Set<string>> {
  if (!forceRefresh && studentPhonesCache && Date.now() - studentPhonesCache.timestamp < CACHE_TTL_MS) {
    return studentPhonesCache.phones;
  }

  const phones = new Set<string>();
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('customers')
      .select('phone, note')
      .or('note.eq.STUDENT,note.ilike.STUDENT|%')
      .range(from, to);

    if (error || !data || data.length === 0) {
      hasMore = false;
    } else {
      for (const row of data) {
        const norm = normalizePhone(row.phone);
        if (norm) phones.add(norm);
      }
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  studentPhonesCache = { timestamp: Date.now(), phones };
  return phones;
}

function emptyAggregation(
  periodStart: string,
  periodEnd: string,
  effectiveStart: string,
  effectiveEnd: string,
  calendarDays: number
): ServerPeriodAggregation {
  return {
    periodStart,
    periodEnd,
    effectiveStart,
    effectiveEnd,
    calendarDays,
    activeDays: {
      ALL: 0,
      DINE_IN: 0,
      TAKEAWAY: 0,
      DELIVERY: 0,
      DELIVERY_MINMOMOS: 0,
      DELIVERY_MINCHICKEN: 0
    },
    rows: [],
    deliveryBrandRows: [],
    channelTotals: {
      ALL: { orders: 0, revenue: 0 },
      DINE_IN: { orders: 0, revenue: 0 },
      TAKEAWAY: { orders: 0, revenue: 0 },
      DELIVERY: { orders: 0, revenue: 0 },
      DELIVERY_MINMOMOS: { orders: 0, revenue: 0 },
      DELIVERY_MINCHICKEN: { orders: 0, revenue: 0 }
    },
    source: 'server_aggregate'
  };
}

export async function aggregateTicketBucketsForPeriod(
  req: TicketBucketQueryRequest
): Promise<ServerPeriodAggregation> {
  const {
    startDate,
    endDate,
    branchName = 'All',
    segmentFilter = 'ALL',
    excludeToday = true,
    buckets = [],
    forceRefresh = false
  } = req;

  const todayIST = getISTDateString();
  const yesterdayIST = addDaysIST(todayIST, -1);

  const effectiveStart = startDate;
  const effectiveEnd = excludeToday && endDate >= todayIST ? yesterdayIST : endDate;
  const calendarDays = effectiveEnd >= effectiveStart ? diffDaysInclusive(effectiveStart, effectiveEnd) : 0;

  const sortedBuckets = [...buckets].sort((a, b) => a.min - b.min);
  const cacheKey = JSON.stringify({
    v: 3,
    s: effectiveStart,
    e: effectiveEnd,
    b: branchName || 'All',
    seg: segmentFilter || 'ALL',
    bk: sortedBuckets.map(b => [b.id, b.min, b.max])
  });

  if (!forceRefresh) {
    const cached = periodCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return {
        ...cached.data,
        periodStart: startDate,
        periodEnd: endDate,
        fromCache: true
      };
    }
  }

  // If effective range is empty (e.g. Today only with Exclude Today ON) or no buckets selected
  if (calendarDays === 0 || effectiveEnd < effectiveStart) {
    const empty = emptyAggregation(startDate, endDate, effectiveStart, effectiveEnd, 0);
    periodCache.set(cacheKey, { timestamp: Date.now(), data: empty });
    return empty;
  }

  // Try Postgres RPC first when segmentFilter === 'ALL'
  if (segmentFilter === 'ALL') {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_ticket_bucket_aggregation', {
        p_start_date: effectiveStart,
        p_end_date: effectiveEnd,
        p_branch: branchName || 'All',
        p_buckets: sortedBuckets.map(b => ({
          id: b.id,
          min: b.min,
          max: b.max
        }))
      });

      if (!rpcError && rpcData && typeof rpcData === 'object') {
        const rawBrandRows: BucketDeliveryBrandAggregateRow[] = Array.isArray(rpcData.deliveryBrandRows)
          ? rpcData.deliveryBrandRows
          : [];
        const normalizedBrandRowsMap = new Map<string, BucketDeliveryBrandAggregateRow>();
        let extraUnassignedOrders = 0;
        let extraUnassignedRevenue = 0;

        for (const r of rawBrandRows) {
          const normBrand: DeliveryBrandBucketKey = r.brand === 'MINCHICKEN' ? 'MINCHICKEN' : 'MINMOMOS';
          if (r.brand === 'UNASSIGNED') {
            extraUnassignedOrders += Number(r.orders || 0);
            extraUnassignedRevenue += Number(r.revenue || 0);
          }
          const key = `${r.bucketId}__${normBrand}`;
          const existing = normalizedBrandRowsMap.get(key);
          if (existing) {
            existing.orders += Number(r.orders || 0);
            existing.revenue += Number(r.revenue || 0);
          } else {
            normalizedBrandRowsMap.set(key, {
              bucketId: r.bucketId,
              brand: normBrand,
              orders: Number(r.orders || 0),
              revenue: Number(r.revenue || 0)
            });
          }
        }

        const totalDelivery = rpcData.channelTotals?.DELIVERY ?? { orders: 0, revenue: 0 };
        const rawMm = rpcData.channelTotals?.DELIVERY_MINMOMOS ?? { orders: 0, revenue: 0 };
        const rawMc = rpcData.channelTotals?.DELIVERY_MINCHICKEN ?? { orders: 0, revenue: 0 };
        const missingOrders = Math.max(0, (totalDelivery.orders || 0) - (rawMm.orders || 0) - (rawMc.orders || 0));
        const missingRev = Math.max(0, (totalDelivery.revenue || 0) - (rawMm.revenue || 0) - (rawMc.revenue || 0));

        const result: ServerPeriodAggregation = {
          periodStart: startDate,
          periodEnd: endDate,
          effectiveStart,
          effectiveEnd,
          calendarDays,
          activeDays: {
            ALL: rpcData.activeDays?.ALL ?? 0,
            DINE_IN: rpcData.activeDays?.DINE_IN ?? 0,
            TAKEAWAY: rpcData.activeDays?.TAKEAWAY ?? 0,
            DELIVERY: rpcData.activeDays?.DELIVERY ?? 0,
            DELIVERY_MINMOMOS:
              (rpcData.activeDays?.DELIVERY_MINMOMOS ?? 0) > 0 || missingOrders > 0
                ? Math.max(rpcData.activeDays?.DELIVERY_MINMOMOS ?? 0, missingOrders > 0 ? rpcData.activeDays?.DELIVERY ?? 0 : 0)
                : 0,
            DELIVERY_MINCHICKEN: rpcData.activeDays?.DELIVERY_MINCHICKEN ?? 0
          },
          rows: Array.isArray(rpcData.rows) ? rpcData.rows : [],
          deliveryBrandRows: Array.from(normalizedBrandRowsMap.values()),
          channelTotals: {
            ALL: rpcData.channelTotals?.ALL ?? { orders: 0, revenue: 0 },
            DINE_IN: rpcData.channelTotals?.DINE_IN ?? { orders: 0, revenue: 0 },
            TAKEAWAY: rpcData.channelTotals?.TAKEAWAY ?? { orders: 0, revenue: 0 },
            DELIVERY: totalDelivery,
            DELIVERY_MINMOMOS: {
              orders: (rawMm.orders || 0) + Math.max(extraUnassignedOrders, missingOrders),
              revenue: (rawMm.revenue || 0) + Math.max(extraUnassignedRevenue, missingRev)
            },
            DELIVERY_MINCHICKEN: rawMc
          },
          fromCache: false,
          source: 'rpc'
        };
        periodCache.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;
      }
    } catch {
      // Fall through to server-side Supabase query aggregation
    }
  }

  // Server-side Supabase aggregation using minimal fields (no raw order data returned to browser)
  let allOrders: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  let includeDeliveryBrand = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const selectCols =
      segmentFilter === 'ALL'
        ? includeDeliveryBrand
          ? 'id, type, total, manual_total, status, date, branch_name, delivery_brand'
          : 'id, type, total, manual_total, status, date, branch_name'
        : includeDeliveryBrand
        ? 'id, type, total, manual_total, status, date, branch_name, customer_phone, delivery_brand'
        : 'id, type, total, manual_total, status, date, branch_name, customer_phone';

    let query = supabase
      .from('orders')
      .select(selectCols)
      .gte('date', `${effectiveStart}T00:00:00+05:30`)
      .lte('date', `${effectiveEnd}T23:59:59+05:30`)
      .is('deletion_info', null)
      .order('bill_number', { ascending: false })
      .range(from, to);

    if (branchName && branchName !== 'All') {
      query = query.eq('branch_name', branchName);
    }

    const { data, error } = await query;
    if (error) {
      if (includeDeliveryBrand && (error.code === '42703' || error.message?.includes('delivery_brand'))) {
        includeDeliveryBrand = false;
        continue;
      }
      console.error('[ticketBuckets] Supabase query error:', error.message);
      hasMore = false;
    } else if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allOrders = allOrders.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  // Optional student segment filter parity with Analytics.tsx
  let studentOrderIdsFromItems = new Set<string>();
  let studentPhones = new Set<string>();

  if (segmentFilter !== 'ALL' && allOrders.length > 0) {
    studentPhones = await getStudentPhoneSet(forceRefresh);

    // Check order_items for student promo items on orders not already matched by phone
    const needItemCheckIds = allOrders
      .filter(o => {
        const norm = normalizePhone(o.customer_phone);
        return !norm || !studentPhones.has(norm);
      })
      .map(o => o.id);

    const chunkSize = 200;
    const chunkPromises: Promise<any>[] = [];
    for (let i = 0; i < needItemCheckIds.length; i += chunkSize) {
      const chunk = needItemCheckIds.slice(i, i + chunkSize);
      chunkPromises.push(
        Promise.resolve(
          supabase
            .from('order_items')
            .select('order_id, name, menu_item_id')
            .in('order_id', chunk)
        )
      );
    }

    if (chunkPromises.length > 0) {
      const chunkResults = await Promise.all(chunkPromises);
      for (const res of chunkResults) {
        if (res.data) {
          for (const item of res.data) {
            const name = item.name || '';
            const mId = item.menu_item_id || '';
            if (
              mId === 'promo-mojito' ||
              name.includes('Student Promo') ||
              name.includes('Student')
            ) {
              studentOrderIdsFromItems.add(item.order_id);
            }
          }
        }
      }
    }
  }

  const activeDaySets = {
    ALL: new Set<string>(),
    DINE_IN: new Set<string>(),
    TAKEAWAY: new Set<string>(),
    DELIVERY: new Set<string>(),
    DELIVERY_MINMOMOS: new Set<string>(),
    DELIVERY_MINCHICKEN: new Set<string>()
  };

  const channelTotals = {
    ALL: { orders: 0, revenue: 0 },
    DINE_IN: { orders: 0, revenue: 0 },
    TAKEAWAY: { orders: 0, revenue: 0 },
    DELIVERY: { orders: 0, revenue: 0 },
    DELIVERY_MINMOMOS: { orders: 0, revenue: 0 },
    DELIVERY_MINCHICKEN: { orders: 0, revenue: 0 }
  };

  // Map key: `${bucketId}__${channel}`
  const aggMap = new Map<string, { bucketId: string; channel: OrderChannelOnly; orders: number; revenue: number }>();
  // Map key: `${bucketId}__${brand}`
  const brandAggMap = new Map<string, { bucketId: string; brand: DeliveryBrandBucketKey; orders: number; revenue: number }>();

  for (const order of allOrders) {
    if (order.status === 'CANCELLED') continue;

    // Verify IST date boundary strictly matches Analytics.tsx getISTDateString(o.date)
    const istDay = getISTDateString(order.date);
    if (istDay < effectiveStart || istDay > effectiveEnd) continue;

    if (segmentFilter !== 'ALL') {
      const normPhone = normalizePhone(order.customer_phone);
      const isStudent =
        (normPhone && studentPhones.has(normPhone)) ||
        studentOrderIdsFromItems.has(order.id);
      if (segmentFilter === 'STUDENT' && !isStudent) continue;
      if (segmentFilter === 'REGULAR' && isStudent) continue;
    }

    const rawType = (order.type || '').toUpperCase();
    const channel: OrderChannelOnly =
      rawType === 'DINE_IN'
        ? 'DINE_IN'
        : rawType === 'DELIVERY'
        ? 'DELIVERY'
        : 'TAKEAWAY';

    const val =
      rawType === 'DELIVERY' && order.manual_total != null
        ? Number(order.manual_total)
        : Number(order.total || 0);
    const effectiveVal = Math.max(0, val);

    activeDaySets.ALL.add(istDay);
    activeDaySets[channel].add(istDay);

    channelTotals.ALL.orders += 1;
    channelTotals.ALL.revenue += effectiveVal;
    channelTotals[channel].orders += 1;
    channelTotals[channel].revenue += effectiveVal;

    const rawBrand = channel === 'DELIVERY' ? (order.delivery_brand || '').toUpperCase() : '';
    const deliveryBrand: DeliveryBrandBucketKey =
      rawBrand === 'MINCHICKEN' ? 'MINCHICKEN' : 'MINMOMOS';

    if (channel === 'DELIVERY') {
      if (deliveryBrand === 'MINCHICKEN') {
        activeDaySets.DELIVERY_MINCHICKEN.add(istDay);
        channelTotals.DELIVERY_MINCHICKEN.orders += 1;
        channelTotals.DELIVERY_MINCHICKEN.revenue += effectiveVal;
      } else {
        activeDaySets.DELIVERY_MINMOMOS.add(istDay);
        channelTotals.DELIVERY_MINMOMOS.orders += 1;
        channelTotals.DELIVERY_MINMOMOS.revenue += effectiveVal;
      }
    }

    const matchedBucket = sortedBuckets.find(b => {
      const maxVal = b.max === null || b.max === undefined ? Infinity : Number(b.max);
      return effectiveVal >= b.min && effectiveVal < maxVal;
    });

    if (matchedBucket) {
      const key = `${matchedBucket.id}__${channel}`;
      const existing = aggMap.get(key);
      if (existing) {
        existing.orders += 1;
        existing.revenue += effectiveVal;
      } else {
        aggMap.set(key, {
          bucketId: matchedBucket.id,
          channel,
          orders: 1,
          revenue: effectiveVal
        });
      }

      if (channel === 'DELIVERY') {
        const bKey = `${matchedBucket.id}__${deliveryBrand}`;
        const existingBrand = brandAggMap.get(bKey);
        if (existingBrand) {
          existingBrand.orders += 1;
          existingBrand.revenue += effectiveVal;
        } else {
          brandAggMap.set(bKey, {
            bucketId: matchedBucket.id,
            brand: deliveryBrand,
            orders: 1,
            revenue: effectiveVal
          });
        }
      }
    }
  }

  const rows: BucketChannelAggregateRow[] = Array.from(aggMap.values()).map(r => ({
    bucketId: r.bucketId,
    channel: r.channel,
    orders: r.orders,
    revenue: Math.round(r.revenue)
  }));

  const deliveryBrandRows: BucketDeliveryBrandAggregateRow[] = Array.from(brandAggMap.values()).map(r => ({
    bucketId: r.bucketId,
    brand: r.brand,
    orders: r.orders,
    revenue: Math.round(r.revenue)
  }));

  const result: ServerPeriodAggregation = {
    periodStart: startDate,
    periodEnd: endDate,
    effectiveStart,
    effectiveEnd,
    calendarDays,
    activeDays: {
      ALL: activeDaySets.ALL.size,
      DINE_IN: activeDaySets.DINE_IN.size,
      TAKEAWAY: activeDaySets.TAKEAWAY.size,
      DELIVERY: activeDaySets.DELIVERY.size,
      DELIVERY_MINMOMOS: activeDaySets.DELIVERY_MINMOMOS.size,
      DELIVERY_MINCHICKEN: activeDaySets.DELIVERY_MINCHICKEN.size
    },
    rows,
    deliveryBrandRows,
    channelTotals: {
      ALL: { orders: channelTotals.ALL.orders, revenue: Math.round(channelTotals.ALL.revenue) },
      DINE_IN: { orders: channelTotals.DINE_IN.orders, revenue: Math.round(channelTotals.DINE_IN.revenue) },
      TAKEAWAY: { orders: channelTotals.TAKEAWAY.orders, revenue: Math.round(channelTotals.TAKEAWAY.revenue) },
      DELIVERY: { orders: channelTotals.DELIVERY.orders, revenue: Math.round(channelTotals.DELIVERY.revenue) },
      DELIVERY_MINMOMOS: {
        orders: channelTotals.DELIVERY_MINMOMOS.orders,
        revenue: Math.round(channelTotals.DELIVERY_MINMOMOS.revenue)
      },
      DELIVERY_MINCHICKEN: {
        orders: channelTotals.DELIVERY_MINCHICKEN.orders,
        revenue: Math.round(channelTotals.DELIVERY_MINCHICKEN.revenue)
      }
    },
    fromCache: false,
    source: 'server_aggregate'
  };

  periodCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}
