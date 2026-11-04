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
 * Load all fixed section interaction events from local store
 */
export function getAllStoredFixedEvents(): AddonFixedEvent[] {
  return safeParse<AddonFixedEvent[]>(getItem(FIXED_EVENTS_LOCAL_STORE), []);
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
 * Save a newly calculated stats snapshot to memory and local storage
 */
export function saveAddonStatsSnapshot(snapshot: AddonEngineStatsSnapshot): void {
  cachedStatsSnapshot = snapshot;
  setItem(STATS_SNAPSHOT_KEY, JSON.stringify(snapshot));
  lastStatsRefreshTime = Date.now();
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

  return allProfiles[clean] || allProfiles[phoneOrId] || null;
}

/**
 * Save customer addon profiles map to memory and local storage
 */
export function saveCustomerAddonProfiles(profiles: Record<string, CustomerAddonProfile>): void {
  cachedCustomerProfiles = profiles;
  setItem(CUSTOMER_PROFILES_KEY, JSON.stringify(profiles));
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
async function fetchRemoteStatsSnapshot(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('addon_stats_snapshot')
      .select('snapshot_data')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data && data.snapshot_data) {
      saveAddonStatsSnapshot(data.snapshot_data);
    }
  } catch {
    // Ignore remote refresh error and continue using cached stats
  }
}
