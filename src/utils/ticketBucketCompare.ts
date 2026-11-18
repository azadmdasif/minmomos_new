import { BucketDefinition } from '../components/OrderValueHistogram';

export type CompareChannel =
  | 'ALL'
  | 'DINE_IN'
  | 'TAKEAWAY'
  | 'DELIVERY'
  | 'DELIVERY_MINMOMOS'
  | 'DELIVERY_MINCHICKEN';
export type OrderOnlyChannel = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type ExtendedChannelKey = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'DELIVERY_MINMOMOS' | 'DELIVERY_MINCHICKEN';
export type DeliveryBrandBucketKey = 'MINMOMOS' | 'MINCHICKEN' | 'UNASSIGNED';
export type CompareMetric =
  | 'orders'
  | 'revenue'
  | 'ordersPerDay'
  | 'revenuePerDay'
  | 'avgTicket'
  | 'orderShare'
  | 'revenueShare';
export type CompareValueMode = 'absolute' | 'delta' | 'pctDelta';
export type CompareViewTab = 'summary' | 'buckets' | 'table' | 'heatmap' | 'movers';

export interface ComparePeriodConfig {
  id: string; // 'P1' .. 'P5'
  label: string;
  startDate: string; // YYYY-MM-DD (IST)
  endDate: string;   // YYYY-MM-DD (IST)
  color: string;
}

export interface BucketChannelAggregateRow {
  bucketId: string;
  channel: OrderOnlyChannel;
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

export const PERIOD_FIXED_COLORS = [
  '#D95323', // P1: Brand Red
  '#4A2C2A', // P2: Brand Brown
  '#0F766E', // P3: Deep Teal
  '#D97706', // P4: Peak Amber
  '#4F46E5'  // P5: Indigo
];

export const COMPARE_METRIC_LABELS: Record<CompareMetric, string> = {
  orders: 'Orders',
  revenue: 'Revenue (₹)',
  ordersPerDay: 'Orders / day',
  revenuePerDay: 'Revenue / day',
  avgTicket: 'Avg Ticket (₹)',
  orderShare: '% Share of Orders',
  revenueShare: '% Share of Revenue'
};

export const CHANNEL_LABELS: Record<CompareChannel, string> = {
  ALL: 'All Channels',
  DINE_IN: 'Dine-In',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery (All)',
  DELIVERY_MINMOMOS: '🥟 MinMomos',
  DELIVERY_MINCHICKEN: '🍗 MinChicken'
};

// ---------------------------------------------------------------------------
// IST Date Utilities
// ---------------------------------------------------------------------------

export function getISTTodayString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function addDaysIST(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + days);
  const dt = new Date(utc);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function diffDaysInclusiveIST(startStr: string, endStr: string): number {
  if (!startStr || !endStr || endStr < startStr) return 0;
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const sMs = Date.UTC(sy, sm - 1, sd);
  const eMs = Date.UTC(ey, em - 1, ed);
  return Math.floor((eMs - sMs) / (24 * 3600 * 1000)) + 1;
}

export function getEffectiveRange(
  startDate: string,
  endDate: string,
  excludeToday: boolean
): { effectiveStart: string; effectiveEnd: string; calendarDays: number; excludedToday: boolean } {
  const today = getISTTodayString();
  const yesterday = addDaysIST(today, -1);
  const hitsToday = endDate >= today;
  const effectiveEnd = excludeToday && hitsToday ? yesterday : endDate;
  const calendarDays = effectiveEnd >= startDate ? diffDaysInclusiveIST(startDate, effectiveEnd) : 0;
  return {
    effectiveStart: startDate,
    effectiveEnd,
    calendarDays,
    excludedToday: Boolean(excludeToday && hitsToday)
  };
}

export function getMonthBoundsIST(yearMonth: string): { start: string; end: string; label: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDate = new Date(Date.UTC(y, m, 0));
  const lastDay = `${y}-${String(m).padStart(2, '0')}-${String(lastDate.getUTCDate()).padStart(2, '0')}`;
  const label = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
  return { start: firstDay, end: lastDay, label };
}

export function getISTDayOfWeek(dateStr: string): number {
  // 0 = Sun .. 6 = Sat
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function buildDefaultComparePeriods(
  dashboardStart: string,
  dashboardEnd: string
): ComparePeriodConfig[] {
  const len = Math.max(1, diffDaysInclusiveIST(dashboardStart, dashboardEnd));
  const p2End = addDaysIST(dashboardStart, -1);
  const p2Start = addDaysIST(p2End, -(len - 1));
  return [
    {
      id: 'P1',
      label: 'Current Period',
      startDate: dashboardStart,
      endDate: dashboardEnd,
      color: PERIOD_FIXED_COLORS[0]
    },
    {
      id: 'P2',
      label: 'Previous Period',
      startDate: p2Start,
      endDate: p2End,
      color: PERIOD_FIXED_COLORS[1]
    }
  ];
}

export function buildPresetPeriods(
  preset:
    | { type: 'this_vs_last_week' }
    | { type: 'this_vs_last_month' }
    | { type: 'two_months'; monthA: string; monthB: string }
    | { type: 'last_n_vs_prev_n'; days: number }
    | { type: 'before_vs_after'; pivotDate: string; windowDays: number },
  excludeToday: boolean
): ComparePeriodConfig[] {
  const today = getISTTodayString();
  const yesterday = addDaysIST(today, -1);

  if (preset.type === 'this_vs_last_week') {
    const dow = getISTDayOfWeek(today); // 0=Sun..6=Sat
    const daysSinceMon = dow === 0 ? 6 : dow - 1;
    const thisMon = addDaysIST(today, -daysSinceMon);
    const lastMon = addDaysIST(thisMon, -7);
    const lastSun = addDaysIST(thisMon, -1);
    const p1End = excludeToday && today > thisMon ? yesterday : today;
    return [
      { id: 'P1', label: 'This Week', startDate: thisMon, endDate: p1End, color: PERIOD_FIXED_COLORS[0] },
      { id: 'P2', label: 'Last Week', startDate: lastMon, endDate: lastSun, color: PERIOD_FIXED_COLORS[1] }
    ];
  }

  if (preset.type === 'this_vs_last_month') {
    const [ty, tm] = today.split('-').map(Number);
    const thisMonthYm = `${ty}-${String(tm).padStart(2, '0')}`;
    const prevDate = new Date(Date.UTC(ty, tm - 2, 1));
    const lastMonthYm = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const tmBounds = getMonthBoundsIST(thisMonthYm);
    const lmBounds = getMonthBoundsIST(lastMonthYm);
    const p1End = excludeToday && today > tmBounds.start ? yesterday : today;
    return [
      { id: 'P1', label: `${tmBounds.label} (MTD)`, startDate: tmBounds.start, endDate: p1End, color: PERIOD_FIXED_COLORS[0] },
      { id: 'P2', label: lmBounds.label, startDate: lmBounds.start, endDate: lmBounds.end, color: PERIOD_FIXED_COLORS[1] }
    ];
  }

  if (preset.type === 'two_months') {
    const a = getMonthBoundsIST(preset.monthA);
    const b = getMonthBoundsIST(preset.monthB);
    return [
      { id: 'P1', label: a.label, startDate: a.start, endDate: a.end, color: PERIOD_FIXED_COLORS[0] },
      { id: 'P2', label: b.label, startDate: b.start, endDate: b.end, color: PERIOD_FIXED_COLORS[1] }
    ];
  }

  if (preset.type === 'last_n_vs_prev_n') {
    const n = Math.max(1, Math.min(365, Math.floor(preset.days || 7)));
    const anchorEnd = excludeToday ? yesterday : today;
    const p1Start = addDaysIST(anchorEnd, -(n - 1));
    const p2End = addDaysIST(p1Start, -1);
    const p2Start = addDaysIST(p2End, -(n - 1));
    return [
      { id: 'P1', label: `Last ${n}d`, startDate: p1Start, endDate: anchorEnd, color: PERIOD_FIXED_COLORS[0] },
      { id: 'P2', label: `Prev ${n}d`, startDate: p2Start, endDate: p2End, color: PERIOD_FIXED_COLORS[1] }
    ];
  }

  // before_vs_after
  const w = Math.max(1, Math.min(180, Math.floor(preset.windowDays || 14)));
  const beforeEnd = addDaysIST(preset.pivotDate, -1);
  const beforeStart = addDaysIST(preset.pivotDate, -w);
  const afterStart = preset.pivotDate;
  const afterEnd = addDaysIST(preset.pivotDate, w - 1);
  return [
    { id: 'P1', label: `Before (${w}d)`, startDate: beforeStart, endDate: beforeEnd, color: PERIOD_FIXED_COLORS[0] },
    { id: 'P2', label: `After (${w}d)`, startDate: afterStart, endDate: afterEnd, color: PERIOD_FIXED_COLORS[1] }
  ];
}

export function findOverlappingPeriodPairs(
  periods: ComparePeriodConfig[],
  excludeToday: boolean
): Array<{ a: ComparePeriodConfig; b: ComparePeriodConfig; overlapDays: number }> {
  const overlaps: Array<{ a: ComparePeriodConfig; b: ComparePeriodConfig; overlapDays: number }> = [];
  for (let i = 0; i < periods.length; i++) {
    const ra = getEffectiveRange(periods[i].startDate, periods[i].endDate, excludeToday);
    if (ra.calendarDays === 0) continue;
    for (let j = i + 1; j < periods.length; j++) {
      const rb = getEffectiveRange(periods[j].startDate, periods[j].endDate, excludeToday);
      if (rb.calendarDays === 0) continue;
      const oStart = ra.effectiveStart > rb.effectiveStart ? ra.effectiveStart : rb.effectiveStart;
      const oEnd = ra.effectiveEnd < rb.effectiveEnd ? ra.effectiveEnd : rb.effectiveEnd;
      if (oStart <= oEnd) {
        overlaps.push({
          a: periods[i],
          b: periods[j],
          overlapDays: diffDaysInclusiveIST(oStart, oEnd)
        });
      }
    }
  }
  return overlaps;
}

// ---------------------------------------------------------------------------
// Client-side Fetch & Cache
// ---------------------------------------------------------------------------

const clientPeriodCache = new Map<string, { timestamp: number; data: ServerPeriodAggregation }>();
const CLIENT_CACHE_TTL_MS = 3 * 60 * 1000;

export function getBucketConfigSignature(buckets: BucketDefinition[]): string {
  return buckets
    .map(b => `${b.id}:${b.min}:${b.max === Infinity ? 'inf' : b.max}`)
    .join('|');
}

export async function fetchTicketBucketPeriod(params: {
  startDate: string;
  endDate: string;
  branchName: string;
  segmentFilter: 'ALL' | 'STUDENT' | 'REGULAR';
  excludeToday: boolean;
  buckets: BucketDefinition[];
  forceRefresh?: boolean;
}): Promise<ServerPeriodAggregation> {
  const sortedBuckets = [...params.buckets].sort((a, b) => a.min - b.min);
  const { effectiveStart, effectiveEnd } = getEffectiveRange(
    params.startDate,
    params.endDate,
    params.excludeToday
  );

  const cacheKey = JSON.stringify({
    v: 2,
    s: effectiveStart,
    e: effectiveEnd,
    b: params.branchName || 'All',
    seg: params.segmentFilter || 'ALL',
    ex: params.excludeToday,
    bk: getBucketConfigSignature(sortedBuckets)
  });

  if (!params.forceRefresh) {
    const cached = clientPeriodCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const response = await fetch('/api/analytics/ticket-buckets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: params.startDate,
      endDate: params.endDate,
      branchName: params.branchName || 'All',
      segmentFilter: params.segmentFilter || 'ALL',
      excludeToday: params.excludeToday,
      forceRefresh: Boolean(params.forceRefresh),
      buckets: sortedBuckets.map(b => ({
        id: b.id,
        label: b.label,
        min: b.min,
        max: b.max === Infinity ? null : b.max
      }))
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Server error');
    throw new Error(`Failed to fetch period aggregation (${response.status}): ${errText}`);
  }

  const data: ServerPeriodAggregation = await response.json();
  clientPeriodCache.set(cacheKey, { timestamp: Date.now(), data });
  return data;
}

// ---------------------------------------------------------------------------
// Comparison Math & Formatting Helpers
// ---------------------------------------------------------------------------

export interface BucketMetricValues {
  orders: number;
  revenue: number;
  ordersPerDay: number;
  revenuePerDay: number;
  avgTicket: number;
  orderShare: number;
  revenueShare: number;
}

export interface PeriodComputedData {
  period: ComparePeriodConfig;
  days: number;
  calendarDays: number;
  activeDays: number;
  totals: BucketMetricValues;
  byBucket: Record<string, BucketMetricValues>;
  byBucketAndChannel: Record<string, Record<ExtendedChannelKey, BucketMetricValues>>;
  channelTotals: Record<ExtendedChannelKey, BucketMetricValues>;
}

export interface DeltaResult {
  baseline: number;
  comparison: number;
  delta: number;
  pctChange: number | null; // null when baseline === 0
  status: 'normal' | 'new' | 'both_zero';
}

export function computeDelta(baseline: number, comparison: number): DeltaResult {
  if (baseline === 0 && comparison === 0) {
    return { baseline, comparison, delta: 0, pctChange: null, status: 'both_zero' };
  }
  if (baseline === 0 && comparison > 0) {
    return { baseline, comparison, delta: comparison, pctChange: null, status: 'new' };
  }
  if (baseline === 0 && comparison < 0) {
    return { baseline, comparison, delta: comparison, pctChange: null, status: 'normal' };
  }
  const delta = comparison - baseline;
  const pctChange = ((comparison - baseline) / Math.abs(baseline)) * 100;
  return { baseline, comparison, delta, pctChange, status: 'normal' };
}

export function formatSignedPct(d: DeltaResult): string {
  if (d.status === 'both_zero') return '—';
  if (d.status === 'new') return 'new';
  if (d.pctChange === null || !Number.isFinite(d.pctChange)) return '—';
  const sign = d.pctChange > 0 ? '+' : d.pctChange < 0 ? '-' : '';
  return `${sign}${Math.abs(d.pctChange).toFixed(1)}%`;
}

export function formatMetricValue(val: number, metric: CompareMetric): string {
  if (!Number.isFinite(val)) return '0';
  switch (metric) {
    case 'orders':
      return Math.round(val).toLocaleString();
    case 'revenue':
      return `₹${Math.round(val).toLocaleString()}`;
    case 'ordersPerDay':
      return val.toFixed(1);
    case 'revenuePerDay':
      return `₹${Math.round(val).toLocaleString()}`;
    case 'avgTicket':
      return `₹${Math.round(val).toLocaleString()}`;
    case 'orderShare':
    case 'revenueShare':
      return `${val.toFixed(1)}%`;
  }
}

export function formatSignedDelta(d: DeltaResult, metric: CompareMetric): string {
  if (d.status === 'both_zero') return '—';
  const sign = d.delta > 0 ? '+' : d.delta < 0 ? '-' : '';
  const abs = Math.abs(d.delta);
  switch (metric) {
    case 'orders':
      return `${sign}${Math.round(abs).toLocaleString()}`;
    case 'revenue':
    case 'revenuePerDay':
    case 'avgTicket':
      return `${sign}₹${Math.round(abs).toLocaleString()}`;
    case 'ordersPerDay':
      return `${sign}${abs.toFixed(1)}/d`;
    case 'orderShare':
    case 'revenueShare':
      return `${sign}${abs.toFixed(1)} pp`;
  }
}

export function getMetricValue(m: BucketMetricValues, metric: CompareMetric): number {
  return m[metric] ?? 0;
}

export function computePeriodMetrics(
  period: ComparePeriodConfig,
  agg: ServerPeriodAggregation | undefined,
  activeBuckets: BucketDefinition[],
  selectedChannel: CompareChannel,
  countOnlyActiveDays: boolean
): PeriodComputedData {
  const calendarDays = agg?.calendarDays ?? 0;
  const activeDays = agg?.activeDays?.ALL ?? 0;
  const days = countOnlyActiveDays ? activeDays : calendarDays;

  const emptyMetric = (): BucketMetricValues => ({
    orders: 0,
    revenue: 0,
    ordersPerDay: 0,
    revenuePerDay: 0,
    avgTicket: 0,
    orderShare: 0,
    revenueShare: 0
  });

  const allKeys: ExtendedChannelKey[] = [
    'DINE_IN',
    'TAKEAWAY',
    'DELIVERY',
    'DELIVERY_MINMOMOS',
    'DELIVERY_MINCHICKEN'
  ];

  const byBucketAndChannel: Record<string, Record<ExtendedChannelKey, BucketMetricValues>> = {};
  const channelOrdersSum: Record<ExtendedChannelKey, number> = {
    DINE_IN: 0,
    TAKEAWAY: 0,
    DELIVERY: 0,
    DELIVERY_MINMOMOS: 0,
    DELIVERY_MINCHICKEN: 0
  };
  const channelRevSum: Record<ExtendedChannelKey, number> = {
    DINE_IN: 0,
    TAKEAWAY: 0,
    DELIVERY: 0,
    DELIVERY_MINMOMOS: 0,
    DELIVERY_MINCHICKEN: 0
  };

  for (const b of activeBuckets) {
    byBucketAndChannel[b.id] = {
      DINE_IN: emptyMetric(),
      TAKEAWAY: emptyMetric(),
      DELIVERY: emptyMetric(),
      DELIVERY_MINMOMOS: emptyMetric(),
      DELIVERY_MINCHICKEN: emptyMetric()
    };
  }

  if (agg) {
    for (const row of agg.rows) {
      if (!byBucketAndChannel[row.bucketId]) continue;
      const ch = row.channel;
      if (ch !== 'DINE_IN' && ch !== 'TAKEAWAY' && ch !== 'DELIVERY') continue;
      byBucketAndChannel[row.bucketId][ch].orders += row.orders;
      byBucketAndChannel[row.bucketId][ch].revenue += row.revenue;
      channelOrdersSum[ch] += row.orders;
      channelRevSum[ch] += row.revenue;
    }

    if (Array.isArray(agg.deliveryBrandRows)) {
      for (const bRow of agg.deliveryBrandRows) {
        if (!byBucketAndChannel[bRow.bucketId]) continue;
        const chKey: ExtendedChannelKey =
          bRow.brand === 'MINCHICKEN' ? 'DELIVERY_MINCHICKEN' : 'DELIVERY_MINMOMOS';
        byBucketAndChannel[bRow.bucketId][chKey].orders += bRow.orders;
        byBucketAndChannel[bRow.bucketId][chKey].revenue += bRow.revenue;
        channelOrdersSum[chKey] += bRow.orders;
        channelRevSum[chKey] += bRow.revenue;
      }
    }
  }

  // Finalize per-channel bucket shares and rates
  for (const b of activeBuckets) {
    for (const ch of allKeys) {
      const m = byBucketAndChannel[b.id][ch];
      m.ordersPerDay = days > 0 ? m.orders / days : 0;
      m.revenuePerDay = days > 0 ? m.revenue / days : 0;
      m.avgTicket = m.orders > 0 ? Math.round(m.revenue / m.orders) : 0;
      m.orderShare = channelOrdersSum[ch] > 0 ? (m.orders / channelOrdersSum[ch]) * 100 : 0;
      m.revenueShare = channelRevSum[ch] > 0 ? (m.revenue / channelRevSum[ch]) * 100 : 0;
    }
  }

  const buildTotal = (ch: ExtendedChannelKey): BucketMetricValues => ({
    orders: channelOrdersSum[ch],
    revenue: Math.round(channelRevSum[ch]),
    ordersPerDay: days > 0 ? channelOrdersSum[ch] / days : 0,
    revenuePerDay: days > 0 ? channelRevSum[ch] / days : 0,
    avgTicket: channelOrdersSum[ch] > 0 ? Math.round(channelRevSum[ch] / channelOrdersSum[ch]) : 0,
    orderShare: channelOrdersSum[ch] > 0 ? 100 : 0,
    revenueShare: channelRevSum[ch] > 0 ? 100 : 0
  });

  const channelTotals: Record<ExtendedChannelKey, BucketMetricValues> = {
    DINE_IN: buildTotal('DINE_IN'),
    TAKEAWAY: buildTotal('TAKEAWAY'),
    DELIVERY: buildTotal('DELIVERY'),
    DELIVERY_MINMOMOS: buildTotal('DELIVERY_MINMOMOS'),
    DELIVERY_MINCHICKEN: buildTotal('DELIVERY_MINCHICKEN')
  };

  // Compute selectedChannel totals and per-bucket values (ALL sums only DINE_IN + TAKEAWAY + DELIVERY)
  let totalOrders = 0;
  let totalRevenue = 0;
  const byBucket: Record<string, BucketMetricValues> = {};

  for (const b of activeBuckets) {
    const chMap = byBucketAndChannel[b.id];
    const ord =
      selectedChannel === 'ALL'
        ? chMap.DINE_IN.orders + chMap.TAKEAWAY.orders + chMap.DELIVERY.orders
        : chMap[selectedChannel].orders;
    const rev =
      selectedChannel === 'ALL'
        ? chMap.DINE_IN.revenue + chMap.TAKEAWAY.revenue + chMap.DELIVERY.revenue
        : chMap[selectedChannel].revenue;

    totalOrders += ord;
    totalRevenue += rev;

    byBucket[b.id] = {
      orders: ord,
      revenue: Math.round(rev),
      ordersPerDay: days > 0 ? ord / days : 0,
      revenuePerDay: days > 0 ? rev / days : 0,
      avgTicket: ord > 0 ? Math.round(rev / ord) : 0,
      orderShare: 0,
      revenueShare: 0
    };
  }

  for (const b of activeBuckets) {
    const m = byBucket[b.id];
    m.orderShare = totalOrders > 0 ? (m.orders / totalOrders) * 100 : 0;
    m.revenueShare = totalRevenue > 0 ? (m.revenue / totalRevenue) * 100 : 0;
  }

  const totals: BucketMetricValues = {
    orders: totalOrders,
    revenue: Math.round(totalRevenue),
    ordersPerDay: days > 0 ? totalOrders / days : 0,
    revenuePerDay: days > 0 ? totalRevenue / days : 0,
    avgTicket: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    orderShare: totalOrders > 0 ? 100 : 0,
    revenueShare: totalRevenue > 0 ? 100 : 0
  };

  return {
    period,
    days,
    calendarDays,
    activeDays,
    totals,
    byBucket,
    byBucketAndChannel,
    channelTotals
  };
}

// ---------------------------------------------------------------------------
// URL Query Parameter Persistence
// ---------------------------------------------------------------------------

export interface CompareUrlState {
  mode: 'single' | 'compare';
  periods?: ComparePeriodConfig[];
  baselineId?: string;
  excludeToday?: boolean;
  countActiveDays?: boolean;
  channel?: CompareChannel;
  metric?: CompareMetric;
  valueMode?: CompareValueMode;
  tab?: CompareViewTab;
  heatmapPeriodId?: string;
  selectedBucketIds?: string[];
}

export function readCompareStateFromUrl(): CompareUrlState | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ovh_mode') !== 'compare') return null;

    const periodsRaw = params.get('ovh_p');
    let periods: ComparePeriodConfig[] | undefined;
    if (periodsRaw) {
      const parsed = JSON.parse(periodsRaw);
      if (Array.isArray(parsed) && parsed.length >= 2 && parsed.length <= 5) {
        periods = parsed.map((p: any, idx: number) => ({
          id: `P${idx + 1}`,
          label: String(p.l || `P${idx + 1}`),
          startDate: String(p.s || ''),
          endDate: String(p.e || ''),
          color: PERIOD_FIXED_COLORS[idx] || PERIOD_FIXED_COLORS[0]
        })).filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(p.endDate));
        if (periods.length < 2) periods = undefined;
      }
    }

    const bucketsRaw = params.get('ovh_b');
    let selectedBucketIds: string[] | undefined;
    if (bucketsRaw) {
      selectedBucketIds = bucketsRaw.split(',').filter(Boolean);
    }

    return {
      mode: 'compare',
      periods,
      baselineId: params.get('ovh_base') || undefined,
      excludeToday: params.get('ovh_exToday') !== '0',
      countActiveDays: params.get('ovh_activeDays') === '1',
      channel: (params.get('ovh_ch') as CompareChannel) || undefined,
      metric: (params.get('ovh_m') as CompareMetric) || undefined,
      valueMode: (params.get('ovh_vm') as CompareValueMode) || undefined,
      tab: (params.get('ovh_tab') as CompareViewTab) || undefined,
      heatmapPeriodId: params.get('ovh_hm') || undefined,
      selectedBucketIds
    };
  } catch {
    return null;
  }
}

export function writeCompareStateToUrl(state: CompareUrlState): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    if (state.mode === 'single') {
      [
        'ovh_mode',
        'ovh_p',
        'ovh_base',
        'ovh_exToday',
        'ovh_activeDays',
        'ovh_ch',
        'ovh_m',
        'ovh_vm',
        'ovh_tab',
        'ovh_hm',
        'ovh_b'
      ].forEach(k => params.delete(k));
    } else {
      params.set('ovh_mode', 'compare');
      if (state.periods) {
        params.set(
          'ovh_p',
          JSON.stringify(
            state.periods.map(p => ({
              l: p.label,
              s: p.startDate,
              e: p.endDate
            }))
          )
        );
      }
      if (state.baselineId) params.set('ovh_base', state.baselineId);
      params.set('ovh_exToday', state.excludeToday === false ? '0' : '1');
      params.set('ovh_activeDays', state.countActiveDays ? '1' : '0');
      if (state.channel) params.set('ovh_ch', state.channel);
      if (state.metric) params.set('ovh_m', state.metric);
      if (state.valueMode) params.set('ovh_vm', state.valueMode);
      if (state.tab) params.set('ovh_tab', state.tab);
      if (state.heatmapPeriodId) params.set('ovh_hm', state.heatmapPeriodId);
      if (state.selectedBucketIds && state.selectedBucketIds.length > 0) {
        params.set('ovh_b', state.selectedBucketIds.join(','));
      }
    }

    const newUrl = `${url.pathname}${params.toString() ? `?${params.toString()}` : ''}${url.hash}`;
    window.history.replaceState({}, '', newUrl);
  } catch {
    // Ignore history restrictions in sandboxed environments
  }
}
