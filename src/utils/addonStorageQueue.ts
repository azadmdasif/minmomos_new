// Offline-first retry queue and cached statistical repository for Add-on Engine
import { 
  AddonImpression, 
  AddonFixedEvent, 
  AddonEngineStatsSnapshot, 
  CustomerAddonProfile, 
  AddonEngineConfig, 
  DEFAULT_ADDON_CONFIG,
  ImpressionOutcome 
} from '../types/addonEngine';
import { supabase } from './supabase';

const IMPRESSIONS_QUEUE_KEY = 'minmomos_addon_impressions_queue';
const IMPRESSIONS_LOCAL_STORE = 'minmomos_addon_impressions_all';
const FIXED_EVENTS_QUEUE_KEY = 'minmomos_addon_fixed_events_queue';
const FIXED_EVENTS_LOCAL_STORE = 'minmomos_addon_fixed_events_all';
const STATS_SNAPSHOT_KEY = 'minmomos_addon_stats_snapshot';
const CUSTOMER_PROFILES_KEY = 'minmomos_addon_customer_profiles';
const CONFIG_KEY = 'minmomos_addon_engine_config';

let isFlushing = false;
let lastStatsRefreshTime = 0;
const STATS_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// In-memory cache for ultra-fast POS recommendations without blocking I/O
let cachedStatsSnapshot: AddonEngineStatsSnapshot | null = null;
let cachedCustomerProfiles: Record<string, CustomerAddonProfile> = {};

const memoryStore = new Map<string, string>();

function getItem(key: string): string | null {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryStore.get(key) || null;
    }
  }
  return memoryStore.get(key) || null;
}

function setItem(key: string, value: string): void {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memoryStore.set(key, value);
    }
  } else {
    memoryStore.set(key, value);
  }
}

// Helper: safe JSON parse
function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Get the current Addon Engine configuration
 */
export function getAddonEngineConfig(): AddonEngineConfig {
  const stored = getItem(CONFIG_KEY);
  return { ...DEFAULT_ADDON_CONFIG, ...safeParse(stored, {}) };
}

/**
 * Save updated Addon Engine configuration
 */
export function saveAddonEngineConfig(cfg: Partial<AddonEngineConfig>): AddonEngineConfig {
  const current = getAddonEngineConfig();
  const updated = { ...current, ...cfg };
  setItem(CONFIG_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * Generate a client-side UUID v4
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Enqueue an impression fire-and-forget
 * Never blocks the UI or Bill & Print
 */
export function enqueueAddonImpression(impression: AddonImpression): void {
  try {
    // 1. Store in local persistent history (for client rebuilds & offline dashboard)
    const allHistory: AddonImpression[] = safeParse(getItem(IMPRESSIONS_LOCAL_STORE), []);
    allHistory.push(impression);
    // Keep last 5,000 in local storage to prevent quota overflow
    if (allHistory.length > 5000) allHistory.splice(0, allHistory.length - 5000);
    setItem(IMPRESSIONS_LOCAL_STORE, JSON.stringify(allHistory));

    // 2. Add to outbound sync queue
    const queue: AddonImpression[] = safeParse(getItem(IMPRESSIONS_QUEUE_KEY), []);
    queue.push(impression);
    setItem(IMPRESSIONS_QUEUE_KEY, JSON.stringify(queue));

    // 3. Trigger asynchronous non-blocking flush
    setTimeout(() => {
      flushAddonQueues().catch(() => {});
    }, 50);
  } catch (err) {
    console.warn('Failed to enqueue addon impression locally:', err);
  }
}

/**
 * Update the outcome of an impression (e.g. accepted, declined, skipped, removed_before_print)
 */
export function updateAddonImpressionOutcome(
  impression_id: string,
  outcome: ImpressionOutcome,
  order_id?: string | null,
  decision_ms?: number
): void {
  try {
    // Update local history
    const allHistory: AddonImpression[] = safeParse(getItem(IMPRESSIONS_LOCAL_STORE), []);
    const idx = allHistory.findIndex(i => i.impression_id === impression_id);
    if (idx !== -1) {
      allHistory[idx].outcome = outcome;
      if (order_id) allHistory[idx].order_id = order_id;
      if (decision_ms !== undefined) allHistory[idx].decision_ms = decision_ms;
      setItem(IMPRESSIONS_LOCAL_STORE, JSON.stringify(allHistory));
    }

    // Update or add to sync queue
    const queue: AddonImpression[] = safeParse(getItem(IMPRESSIONS_QUEUE_KEY), []);
    const qIdx = queue.findIndex(i => i.impression_id === impression_id);
    if (qIdx !== -1) {
      queue[qIdx].outcome = outcome;
      if (order_id) queue[qIdx].order_id = order_id;
      if (decision_ms !== undefined) queue[qIdx].decision_ms = decision_ms;
    } else if (idx !== -1) {
      // Re-queue updated impression
      queue.push(allHistory[idx]);
    }
    setItem(IMPRESSIONS_QUEUE_KEY, JSON.stringify(queue));

    // Background flush
    setTimeout(() => {
      flushAddonQueues().catch(() => {});
    }, 50);
  } catch (err) {
    console.warn('Failed to update addon impression outcome:', err);
  }
}

/**
 * Enqueue fixed section interactions (Mojito, Popcorn, Fries)
 */
export function enqueueFixedAddonEvent(event: AddonFixedEvent): void {
  try {
    const allEvents: AddonFixedEvent[] = safeParse(getItem(FIXED_EVENTS_LOCAL_STORE), []);
    allEvents.push(event);
    if (allEvents.length > 5000) allEvents.splice(0, allEvents.length - 5000);
    setItem(FIXED_EVENTS_LOCAL_STORE, JSON.stringify(allEvents));

    const queue: AddonFixedEvent[] = safeParse(getItem(FIXED_EVENTS_QUEUE_KEY), []);
    queue.push(event);
    setItem(FIXED_EVENTS_QUEUE_KEY, JSON.stringify(queue));

    setTimeout(() => {
      flushAddonQueues().catch(() => {});
    }, 50);
  } catch (err) {
    console.warn('Failed to enqueue fixed addon event locally:', err);
  }
}

/**
 * Flush sync queues to Supabase asynchronously with retry backoff
 */
export async function flushAddonQueues(): Promise<void> {
  if (isFlushing) return;
  isFlushing = true;

  try {
    // 1. Flush impressions
    const impQueue: AddonImpression[] = safeParse(getItem(IMPRESSIONS_QUEUE_KEY), []);
    if (impQueue.length > 0) {
      const batch = impQueue.slice(0, 50);
      const { error } = await supabase.from('addon_impressions').upsert(batch, { onConflict: 'impression_id' });
      if (!error) {
        const remaining = impQueue.slice(batch.length);
        setItem(IMPRESSIONS_QUEUE_KEY, JSON.stringify(remaining));
      } else {
        // If table doesn't exist yet in Supabase, keep queue locally until migration is executed
        console.info('Supabase addon_impressions write note:', error.message || error);
      }
    }

    // 2. Flush fixed events
    const fixedQueue: AddonFixedEvent[] = safeParse(getItem(FIXED_EVENTS_QUEUE_KEY), []);
    if (fixedQueue.length > 0) {
      const batch = fixedQueue.slice(0, 50);
      const { error } = await supabase.from('addon_fixed_events').upsert(batch, { onConflict: 'event_id' });
      if (!error) {
        const remaining = fixedQueue.slice(batch.length);
        setItem(FIXED_EVENTS_QUEUE_KEY, JSON.stringify(remaining));
      }
    }
  } catch (err) {
    // Completely silent fire-and-forget: network errors must never affect POS billing
  } finally {
    isFlushing = false;
  }
}

/**
 * Load all recorded impressions from local store
 */
export function getAllStoredImpressions(): AddonImpression[] {
  return safeParse<AddonImpression[]>(getItem(IMPRESSIONS_LOCAL_STORE), []);
}

/**
 * Fetch and sync all impressions from Supabase with local fallback
 * Merges cloud records with local retry queue to ensure real-time cross-device sync
 */
export async function fetchAndSyncAllImpressions(): Promise<AddonImpression[]> {
  try {
    const { data, error } = await supabase
      .from('addon_impressions')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      // Merge with any unsynced local impressions in queue
      const queue: AddonImpression[] = safeParse(getItem(IMPRESSIONS_QUEUE_KEY), []);
      const remoteIds = new Set(data.map(d => d.impression_id));
      const unpushed = queue.filter(q => !remoteIds.has(q.impression_id));
      
      const combined = [...unpushed, ...data];
      setItem(IMPRESSIONS_LOCAL_STORE, JSON.stringify(combined.slice(0, 5000)));
      return combined;
    }
  } catch (err) {
    console.warn('Failed to fetch impressions from Supabase, using local fallback:', err);
  }
  return getAllStoredImpressions();
}

/**
 * Load all fixed section interaction events from local store
 */
export function getAllStoredFixedEvents(): AddonFixedEvent[] {
  return safeParse<AddonFixedEvent[]>(getItem(FIXED_EVENTS_LOCAL_STORE), []);
}

/**
 * Fetch and sync fixed section events from Supabase
 */
export async function fetchAndSyncAllFixedEvents(): Promise<AddonFixedEvent[]> {
  try {
    const { data, error } = await supabase
      .from('addon_fixed_events')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      setItem(FIXED_EVENTS_LOCAL_STORE, JSON.stringify(data.slice(0, 5000)));
      return data;
    }
  } catch (err) {
    console.warn('Failed to fetch fixed events from Supabase:', err);
  }
  return getAllStoredFixedEvents();
}

/**
 * Get precomputed Addon Stats snapshot (refreshes in background every 15 mins)
 */
export function getCachedStatsSnapshot(): AddonEngineStatsSnapshot | null {
  if (cachedStatsSnapshot) {
    checkTriggerBackgroundRefresh();
    return cachedStatsSnapshot;
  }

  const stored = getItem(STATS_SNAPSHOT_KEY);
  if (stored) {
    cachedStatsSnapshot = safeParse<AddonEngineStatsSnapshot | null>(stored, null);
  }

  checkTriggerBackgroundRefresh();
  return cachedStatsSnapshot;
}

/**
 * Save a newly calculated stats snapshot to memory, local storage, and Supabase
 */
export function saveAddonStatsSnapshot(snapshot: AddonEngineStatsSnapshot): void {
  cachedStatsSnapshot = snapshot;
  setItem(STATS_SNAPSHOT_KEY, JSON.stringify(snapshot));
  lastStatsRefreshTime = Date.now();

  // Asynchronously persist to Supabase so ALL devices share the learned snapshot
  setTimeout(async () => {
    try {
      await supabase.from('addon_stats_snapshot').insert({
        snapshot_data: snapshot,
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Failed to persist snapshot to Supabase:', e);
    }
  }, 10);
}

/**
 * Fetch Customer Addon Profile with single indexed lookup (by phone or customerId)
 */
export function getCustomerAddonProfile(phoneOrId?: string | null): CustomerAddonProfile | null {
  if (!phoneOrId) return null;
  const clean = phoneOrId.trim().replace(/^\+91/, '').replace(/\D/g, '');

  if (cachedCustomerProfiles[clean]) {
    return cachedCustomerProfiles[clean];
  }

  const allProfiles = safeParse<Record<string, CustomerAddonProfile>>(
    getItem(CUSTOMER_PROFILES_KEY),
    {}
  );
  cachedCustomerProfiles = allProfiles;

  const found = allProfiles[clean] || allProfiles[phoneOrId] || null;
  if (!found) {
    // Non-blocking background fetch from Supabase
    fetchRemoteCustomerProfile(clean).catch(() => {});
  }
  return found;
}

/**
 * Background fetch single customer profile from Supabase
 */
async function fetchRemoteCustomerProfile(cleanPhone: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('customer_addon_profile')
      .select('*')
      .eq('lookup_key', cleanPhone)
      .maybeSingle();

    if (data) {
      const prof: CustomerAddonProfile = {
        customer_id: data.customer_id || cleanPhone,
        phone: data.phone || cleanPhone,
        visits: data.visits || 0,
        last_visit: data.last_visit || new Date().toISOString(),
        median_days_between_visits: Number(data.median_days_between_visits) || 14,
        avg_cart: Number(data.avg_cart) || 0,
        usual_daypart: data.usual_daypart || 'lunch',
        veg_only_so_far: data.veg_only_so_far || 0,
        item_counts: data.item_counts || {},
        category_counts: data.category_counts || {},
        addon_history: data.addon_history || {},
        category_addon_history: data.category_addon_history || {},
        deal_strength_accepts: data.deal_strength_accepts || {}
      };
      cachedCustomerProfiles[cleanPhone] = prof;
      const allProfiles = safeParse<Record<string, CustomerAddonProfile>>(getItem(CUSTOMER_PROFILES_KEY), {});
      allProfiles[cleanPhone] = prof;
      setItem(CUSTOMER_PROFILES_KEY, JSON.stringify(allProfiles));
    }
  } catch {
    // Silent
  }
}

/**
 * Save customer addon profiles map to memory, local storage, and Supabase
 */
export function saveCustomerAddonProfiles(profiles: Record<string, CustomerAddonProfile>): void {
  cachedCustomerProfiles = profiles;
  setItem(CUSTOMER_PROFILES_KEY, JSON.stringify(profiles));

  // Asynchronously upsert profiles to Supabase in batches
  setTimeout(async () => {
    try {
      const records = Object.entries(profiles).map(([key, p]) => ({
        lookup_key: key,
        customer_id: p.customer_id,
        phone: p.phone,
        visits: p.visits,
        last_visit: p.last_visit,
        median_days_between_visits: p.median_days_between_visits,
        avg_cart: p.avg_cart,
        usual_daypart: p.usual_daypart,
        veg_only_so_far: p.veg_only_so_far,
        item_counts: p.item_counts,
        category_counts: p.category_counts,
        addon_history: p.addon_history,
        deal_strength_accepts: p.deal_strength_accepts,
        last_updated: new Date().toISOString()
      }));

      for (let i = 0; i < records.length; i += 50) {
        const batch = records.slice(i, i + 50);
        await supabase.from('customer_addon_profile').upsert(batch, { onConflict: 'lookup_key' });
      }
    } catch (e) {
      console.warn('Failed to persist customer profiles to Supabase:', e);
    }
  }, 50);
}

/**
 * Check if 15 minutes have passed since last snapshot refresh and trigger non-blocking refresh
 */
function checkTriggerBackgroundRefresh(): void {
  const now = Date.now();
  if (now - lastStatsRefreshTime > STATS_REFRESH_INTERVAL_MS) {
    lastStatsRefreshTime = now;
    // Attempt remote refresh from Supabase without blocking POS
    setTimeout(() => {
      fetchRemoteStatsSnapshot().catch(() => {});
    }, 100);
  }
}

/**
 * Fetch remote snapshot from Supabase if available
 */
export async function fetchRemoteStatsSnapshot(): Promise<AddonEngineStatsSnapshot | null> {
  try {
    const { data, error } = await supabase
      .from('addon_stats_snapshot')
      .select('snapshot_data')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data && data.snapshot_data) {
      cachedStatsSnapshot = data.snapshot_data;
      setItem(STATS_SNAPSHOT_KEY, JSON.stringify(data.snapshot_data));
      lastStatsRefreshTime = Date.now();
      return data.snapshot_data;
    }
  } catch {
    // Ignore remote refresh error and continue using cached stats
  }
  return null;
}
