import { supabase } from './supabase';

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

export async function syncCouponToSupabase(coupon: MarketingCoupon) {
  try {
    const { error } = await supabase.from('marketing_coupons').upsert({
      phone: coupon.phone,
      customer_name: coupon.customerName,
      coupon_code: coupon.couponCode,
      created_at: coupon.createdAt,
      expires_at: coupon.expiresAt,
      is_used: coupon.isUsed
    }, { onConflict: 'coupon_code' });
    if (error) {
      console.warn('Could not sync coupon to Supabase. Check if table "marketing_coupons" exists:', error.message);
    }
  } catch (err) {
    console.error('Failed to sync coupon to Supabase', err);
  }
}

export async function syncCouponRedemptionToSupabase(couponCode: string) {
  try {
    const { error } = await supabase
      .from('marketing_coupons')
      .update({ is_used: true })
      .eq('coupon_code', couponCode);
    if (error) {
      console.warn('Could not sync coupon redemption to Supabase', error.message);
    }
  } catch (err) {
    console.error('Failed to sync coupon redemption to Supabase', err);
  }
}

export async function syncCouponFromSupabase(phone: string): Promise<MarketingCoupon | null> {
  try {
    const cleaned = phone.replace(/\D/g, '');
    const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('marketing_coupons')
      .select('*')
      .eq('phone', digits)
      .eq('is_used', false)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching coupon from Supabase:', error.message);
      return null;
    }

    if (data) {
      return {
        phone: data.phone,
        customerName: data.customer_name || 'Valued Customer',
        couponCode: data.coupon_code,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
        isUsed: data.is_used
      };
    }
  } catch (err) {
    console.error('Failed to fetch coupon from Supabase', err);
  }
  return null;
}

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

export function addMarketingCoupon(
  phone: string, 
  customerName: string, 
  customCode?: string, 
  customExpiresAt?: Date
): MarketingCoupon {
  const coupons = getMarketingCoupons();
  
  // Normalize phone to last 10 digits
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const couponCode = customCode || `MOJITO-${digits.slice(-4).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
  
  const createdAt = new Date();
  const expiresAt = customExpiresAt || new Date(createdAt.getTime() + 48 * 60 * 60 * 1000); // 48 hours
  
  // Invalidate any older active coupons of the same user to avoid duplicates
  const updatedCoupons = coupons.map(c => {
    if (c.phone === digits && !c.isUsed) {
      const updatedItem = { ...c, isUsed: true };
      syncCouponToSupabase(updatedItem); // soft deactivate in Supabase
      return updatedItem;
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
  
  // Sync new coupon to Supabase
  syncCouponToSupabase(newCoupon);

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
  let targetCoupon: MarketingCoupon | null = null;
  const updated = coupons.map(c => {
    if (c.phone === digits && !c.isUsed && c.expiresAt > now) {
      found = true;
      targetCoupon = { ...c, isUsed: true };
      return targetCoupon;
    }
    return c;
  });
  
  if (found) {
    saveMarketingCoupons(updated);
    if (targetCoupon) {
      syncCouponRedemptionToSupabase((targetCoupon as MarketingCoupon).couponCode);
    }
  }
  return found;
}

// === CUSTOM POS OFFERS & MESSAGE LOGGING TYPES ===

export interface MessageLog {
  phone: string;
  sentAt: string; // ISO Timestamp
  messageText: string;
  type: string; // 'funnel_L_sub', 'cohort_3', 'cohort_6', 'custom_offer' etc.
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

const MESSAGE_LOGS_KEY = 'MOMOMAYA_MARKETING_MESSAGE_LOGS';
const CUSTOM_OFFERS_KEY = 'MOMOMAYA_CUSTOM_OFFERS';
const MANUALLY_UNBLOCKED_KEY = 'MOMOMAYA_MANUALLY_UNBLOCKED_PHONES';

export function getManuallyUnblockedPhones(): string[] {
  try {
    const raw = localStorage.getItem(MANUALLY_UNBLOCKED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveManuallyUnblockedPhones(phones: string[]): void {
  try {
    localStorage.setItem(MANUALLY_UNBLOCKED_KEY, JSON.stringify(phones));
  } catch {}
}

export function addToManuallyUnblocked(phone: string): void {
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  const current = getManuallyUnblockedPhones();
  if (!current.includes(digits)) {
    current.push(digits);
    saveManuallyUnblockedPhones(current);
  }
}

export function removeFromManuallyUnblocked(phone: string): void {
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  const current = getManuallyUnblockedPhones();
  const updated = current.filter(p => p !== digits);
  saveManuallyUnblockedPhones(updated);
}

// --- MESSAGE LOG SERVICES ---

export function getLocalMessageLogs(): MessageLog[] {
  try {
    const raw = localStorage.getItem(MESSAGE_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse message logs', e);
    return [];
  }
}

export function saveLocalMessageLogs(logs: MessageLog[]): void {
  try {
    localStorage.setItem(MESSAGE_LOGS_KEY, JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to save message logs', e);
  }
}

export async function syncMessageLogToSupabase(log: MessageLog) {
  try {
    const { error } = await supabase.from('marketing_message_logs').insert({
      phone: log.phone,
      sent_at: log.sentAt,
      message_text: log.messageText,
      type: log.type
    });
    if (error) {
      console.warn('Could not sync message log to Supabase. Check if table "marketing_message_logs" exists:', error.message);
    }
  } catch (err) {
    console.error('Failed to sync message log to Supabase', err);
  }
}

export async function fetchAllMessageLogsFromSupabase(): Promise<MessageLog[]> {
  try {
    const { data, error } = await supabase
      .from('marketing_message_logs')
      .select('*')
      .order('sent_at', { ascending: false });
    if (error) {
      console.warn('Could not fetch message logs from Supabase (may not exist):', error.message);
      return [];
    }
    return (data || []).map((d: any) => ({
      phone: d.phone,
      sentAt: d.sent_at || d.created_at,
      messageText: d.message_text,
      type: d.type
    }));
  } catch (err) {
    console.error('Failed to fetch message logs from Supabase', err);
    return [];
  }
}

export async function logMessageSent(phone: string, text: string, type: string): Promise<MessageLog> {
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  // Remove from manual unblocked list upon successful message sending
  removeFromManuallyUnblocked(digits);
  
  const logs = getLocalMessageLogs();
  const newLog: MessageLog = {
    phone: digits,
    sentAt: new Date().toISOString(),
    messageText: text,
    type
  };
  
  logs.push(newLog);
  saveLocalMessageLogs(logs);
  
  // Try background Supabase Sync
  await syncMessageLogToSupabase(newLog);
  return newLog;
}

export function getLastMessageSentTime(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const logs = getLocalMessageLogs();
  const userLogs = logs.filter(l => l.phone === digits);
  if (userLogs.length === 0) return null;
  
  // Sort descending by sentAt
  const sorted = [...userLogs].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  return sorted[0].sentAt;
}

export function isWithinMessageCooldown(phone: string): { isCooling: boolean; daysLeft: number; lastSentAt: string | null } {
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const lastSentTime = getLastMessageSentTime(phone);
  if (!lastSentTime) return { isCooling: false, daysLeft: 0, lastSentAt: null };
  
  // If explicitly manually unblocked, bypass cooling period
  const unblocked = getManuallyUnblockedPhones();
  if (unblocked.includes(digits)) {
    return { isCooling: false, daysLeft: 0, lastSentAt: lastSentTime };
  }
  
  const lastSentDate = new Date(lastSentTime);
  const now = new Date();
  
  const diffTime = now.getTime() - lastSentDate.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  
  const COOLDOWN_DAYS = 6;
  if (diffDays < COOLDOWN_DAYS) {
    return {
      isCooling: true,
      daysLeft: parseFloat((COOLDOWN_DAYS - diffDays).toFixed(1)),
      lastSentAt: lastSentTime
    };
  }
  return { isCooling: false, daysLeft: 0, lastSentAt: lastSentTime };
}

// --- CUSTOM IN-POS OFFERS SERVICES ---

export function getLocalCustomOffers(): CustomOffer[] {
  try {
    const raw = localStorage.getItem(CUSTOM_OFFERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse custom offers', e);
    return [];
  }
}

export function saveLocalCustomOffers(offers: CustomOffer[]): void {
  try {
    localStorage.setItem(CUSTOM_OFFERS_KEY, JSON.stringify(offers));
  } catch (e) {
    console.error('Failed to save custom offers', e);
  }
}

export async function syncCustomOfferToSupabase(offer: CustomOffer) {
  try {
    const { error } = await supabase.from('custom_offers').upsert({
      id: offer.id,
      name: offer.name,
      min_order_value: offer.minOrderValue,
      free_item_name: offer.freeItemName || null,
      offer_type: offer.offerType || 'free_item',
      discount_type: offer.discountType || null,
      discount_value: offer.discountValue !== undefined ? offer.discountValue : null,
      target_group: offer.targetGroup,
      is_active: offer.isActive,
      created_at: offer.createdAt
    });
    if (error) {
      console.warn('Could not sync custom offer to Supabase. Check if table exists:', error.message);
    }
  } catch (err) {
    console.error('Failed to sync custom offer', err);
  }
}

export async function syncDeleteCustomOfferFromSupabase(id: string) {
  try {
    const { error } = await supabase.from('custom_offers').delete().eq('id', id);
    if (error) {
      console.warn('Could not delete custom offer from Supabase. Check if table exists:', error.message);
    }
  } catch (err) {
    console.error('Failed to sync delete custom offer', err);
  }
}

export async function fetchCustomOffersFromSupabase(): Promise<CustomOffer[]> {
  try {
    const { data, error } = await supabase
      .from('custom_offers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Could not fetch custom offers from Supabase (may not exist):', error.message);
      return [];
    }
    return (data || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      minOrderValue: Number(d.min_order_value || 0),
      freeItemName: d.free_item_name || undefined,
      offerType: d.offer_type || 'free_item',
      discountType: d.discount_type || undefined,
      discountValue: d.discount_value !== undefined && d.discount_value !== null ? Number(d.discount_value) : undefined,
      targetGroup: d.target_group,
      isActive: d.is_active,
      createdAt: d.created_at
    }));
  } catch (err) {
    console.error('Failed to fetch custom offers from Supabase', err);
    return [];
  }
}

export async function addCustomOffer(
  name: string, 
  minOrderValue: number, 
  freeItemName: string | undefined, 
  targetGroup: CustomOffer['targetGroup'],
  offerType?: 'free_item' | 'discount',
  discountType?: 'percentage' | 'flat',
  discountValue?: number
): Promise<CustomOffer> {
  const offers = getLocalCustomOffers();
  const newOffer: CustomOffer = {
    id: `offer-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name,
    minOrderValue,
    freeItemName,
    offerType: offerType || 'free_item',
    discountType: discountType || undefined,
    discountValue: discountValue !== undefined ? discountValue : undefined,
    targetGroup,
    isActive: true,
    createdAt: new Date().toISOString()
  };
  
  offers.push(newOffer);
  saveLocalCustomOffers(offers);
  
  await syncCustomOfferToSupabase(newOffer);
  return newOffer;
}

export async function toggleCustomOfferStatus(id: string): Promise<CustomOffer[]> {
  const offers = getLocalCustomOffers();
  const updated = offers.map(o => {
    if (o.id === id) {
      const updatedOffer = { ...o, isActive: !o.isActive };
      syncCustomOfferToSupabase(updatedOffer);
      return updatedOffer;
    }
    return o;
  });
  saveLocalCustomOffers(updated);
  return updated;
}

export async function deleteCustomOffer(id: string): Promise<CustomOffer[]> {
  const offers = getLocalCustomOffers();
  const filtered = offers.filter(o => o.id !== id);
  saveLocalCustomOffers(filtered);
  await syncDeleteCustomOfferFromSupabase(id);
  return filtered;
}

// === FREE ITEM CODES & CUSTOMER CAMPAIGN ASSIGNMENTS ===

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

const FREE_TAGS_KEY = 'MOMOMAYA_MARKETING_FREE_TAGS';
const FREE_CLAIMS_KEY = 'MOMOMAYA_CUSTOMER_FREE_CLAIMS';

export function getLocalFreeItemTags(): FreeItemTag[] {
  try {
    const raw = localStorage.getItem(FREE_TAGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse free item tags', e);
    return [];
  }
}

export function saveLocalFreeItemTags(tags: FreeItemTag[]): void {
  try {
    localStorage.setItem(FREE_TAGS_KEY, JSON.stringify(tags));
  } catch (e) {
    console.error('Failed to save free item tags', e);
  }
}

export async function syncFreeItemTagToSupabase(tag: FreeItemTag) {
  try {
    const { error } = await supabase.from('marketing_free_tags').upsert({
      id: tag.id,
      code: tag.code,
      item_name: tag.itemName,
      expires_at: tag.expiresAt,
      created_at: tag.createdAt
    });
    if (error) {
      console.warn('Could not sync free item tag to Supabase. Table may not exist:', error.message);
    }
  } catch (err) {
    console.error('Failed to sync free item tag', err);
  }
}

export async function fetchFreeItemTagsFromSupabase(): Promise<FreeItemTag[]> {
  try {
    const { data, error } = await supabase
      .from('marketing_free_tags')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Could not fetch free item tags from Supabase (may not exist):', error.message);
      return [];
    }
    return (data || []).map((d: any) => ({
      id: d.id,
      code: d.code,
      itemName: d.item_name,
      expiresAt: d.expires_at,
      createdAt: d.created_at
    }));
  } catch (err) {
    console.error('Failed to fetch free item tags', err);
    return [];
  }
}

export async function addFreeItemTag(code: string, itemName: string, expiresAt: string): Promise<FreeItemTag> {
  const tags = getLocalFreeItemTags();
  const normalizedCode = code.trim().toUpperCase().replace(/\s+/g, '_');
  
  const newTag: FreeItemTag = {
    id: `tag-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    code: normalizedCode,
    itemName,
    expiresAt,
    createdAt: new Date().toISOString()
  };
  
  // Prevent duplicate codes by removing older one
  const filtered = tags.filter(t => t.code !== normalizedCode);
  filtered.push(newTag);
  saveLocalFreeItemTags(filtered);
  
  await syncFreeItemTagToSupabase(newTag);
  return newTag;
}

export async function deleteFreeItemTag(id: string): Promise<FreeItemTag[]> {
  const tags = getLocalFreeItemTags();
  const filtered = tags.filter(t => t.id !== id);
  saveLocalFreeItemTags(filtered);
  
  try {
    await supabase.from('marketing_free_tags').delete().eq('id', id);
  } catch (e) {
    console.warn('Failed to delete tag from Supabase', e);
  }
  return filtered;
}

// --- FREE CLAIMS SERVICES ---

export function getLocalFreeItemClaims(): FreeItemClaim[] {
  try {
    const raw = localStorage.getItem(FREE_CLAIMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse free item claims', e);
    return [];
  }
}

export function saveLocalFreeItemClaims(claims: FreeItemClaim[]): void {
  try {
    localStorage.setItem(FREE_CLAIMS_KEY, JSON.stringify(claims));
  } catch (e) {
    console.error('Failed to save free item claims', e);
  }
}

export async function syncFreeItemClaimToSupabase(claim: FreeItemClaim) {
  try {
    const { error } = await supabase.from('customer_free_claims').upsert({
      id: claim.id,
      phone: claim.phone,
      tag_code: claim.tagCode,
      item_name: claim.itemName,
      expires_at: claim.expiresAt,
      sent_at: claim.sentAt,
      is_claimed: claim.isClaimed
    });
    if (error) {
      console.warn('Could not sync claim to Supabase. Table may not exist:', error.message);
    }
  } catch (err) {
    console.error('Failed to sync free claim', err);
  }
}

export async function syncFreeItemClaimsFromSupabaseForCustomer(phone: string): Promise<FreeItemClaim[]> {
  try {
    const cleaned = phone.replace(/\D/g, '');
    const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
    
    const { data, error } = await supabase
      .from('customer_free_claims')
      .select('*')
      .eq('phone', digits);
      
    if (!error && data) {
      const localClaims = getLocalFreeItemClaims();
      const mergedMap = new Map<string, FreeItemClaim>();
      
      // Load existing local claims first
      localClaims.forEach(c => mergedMap.set(c.id, c));
      
      // Merge in DB ones
      data.forEach((d: any) => {
        mergedMap.set(d.id, {
          id: d.id,
          phone: d.phone,
          tagCode: d.tag_code,
          itemName: d.item_name,
          expiresAt: d.expires_at,
          sentAt: d.sent_at || d.created_at,
          isClaimed: d.is_claimed
        });
      });
      
      const mergedList = Array.from(mergedMap.values());
      saveLocalFreeItemClaims(mergedList);
      return mergedList;
    }
  } catch (e) {
    console.warn('Supabase fetch for free claims failed', e);
  }
  return getLocalFreeItemClaims();
}

export async function assignFreeItemClaimToCustomer(phone: string, tagCode: string, itemName: string, expiresAt: string): Promise<FreeItemClaim> {
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const claims = getLocalFreeItemClaims();
  // Filter out any older duplicate active claim for the same code on the same customer
  const filtered = claims.filter(c => !(c.phone === digits && c.tagCode === tagCode));
  
  const newClaim: FreeItemClaim = {
    id: `claim-${digits}-${tagCode}-${Date.now()}`,
    phone: digits,
    tagCode,
    itemName,
    expiresAt,
    sentAt: new Date().toISOString(),
    isClaimed: false
  };
  
  filtered.push(newClaim);
  saveLocalFreeItemClaims(filtered);
  
  await syncFreeItemClaimToSupabase(newClaim);
  return newClaim;
}

export function getActiveClaimsForCustomer(phone: string): FreeItemClaim[] {
  if (!phone) return [];
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const claims = getLocalFreeItemClaims();
  const now = new Date().toISOString();
  
  return claims.filter(c => 
    c.phone === digits && 
    !c.isClaimed && 
    c.expiresAt > now
  );
}

export async function markFreeItemClaimAsUsed(phone: string, tagCode: string): Promise<boolean> {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const claims = getLocalFreeItemClaims();
  let found = false;
  let syncedClaim: FreeItemClaim | null = null;
  
  const updated = claims.map(c => {
    if (c.phone === digits && c.tagCode === tagCode && !c.isClaimed) {
      found = true;
      syncedClaim = { ...c, isClaimed: true };
      return syncedClaim;
    }
    return c;
  });
  
  if (found && syncedClaim) {
    saveLocalFreeItemClaims(updated);
    await syncFreeItemClaimToSupabase(syncedClaim);
    return true;
  }
  return false;
}

// === DISCOUNT TAG CODES & CUSTOMER CAMPAIGN ASSIGNMENTS ===

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

const DISCOUNT_TAGS_KEY = 'MOMOMAYA_MARKETING_DISCOUNT_TAGS';
const DISCOUNT_CLAIMS_KEY = 'MOMOMAYA_CUSTOMER_DISCOUNT_CLAIMS';

export function getLocalDiscountTags(): DiscountTag[] {
  try {
    const raw = localStorage.getItem(DISCOUNT_TAGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse discount tags', e);
    return [];
  }
}

export function saveLocalDiscountTags(tags: DiscountTag[]): void {
  try {
    localStorage.setItem(DISCOUNT_TAGS_KEY, JSON.stringify(tags));
  } catch (e) {
    console.error('Failed to save discount tags', e);
  }
}

export async function syncDiscountTagToSupabase(tag: DiscountTag) {
  try {
    const { error } = await supabase.from('marketing_discount_tags').upsert({
      id: tag.id,
      code: tag.code,
      discount_percentage: tag.discountPercentage,
      expires_at: tag.expiresAt,
      created_at: tag.createdAt
    });
    if (error) {
      console.warn('Could not sync discount tag to Supabase. Table may not exist:', error.message);
    }
  } catch (err) {
    console.error('Failed to sync discount tag', err);
  }
}

export async function fetchDiscountTagsFromSupabase(): Promise<DiscountTag[]> {
  try {
    const { data, error } = await supabase
      .from('marketing_discount_tags')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Could not fetch discount tags from Supabase:', error.message);
      return [];
    }
    return (data || []).map((d: any) => ({
      id: d.id,
      code: d.code,
      discountPercentage: d.discount_percentage,
      expiresAt: d.expires_at,
      createdAt: d.created_at
    }));
  } catch (err) {
    console.error('Failed to fetch discount tags', err);
    return [];
  }
}

export async function addDiscountTag(code: string, discountPercentage: number, expiresAt: string): Promise<DiscountTag> {
  const tags = getLocalDiscountTags();
  const normalizedCode = code.trim().toUpperCase().replace(/\s+/g, '_');
  
  const newTag: DiscountTag = {
    id: `distag-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    code: normalizedCode,
    discountPercentage,
    expiresAt,
    createdAt: new Date().toISOString()
  };
  
  const filtered = tags.filter(t => t.code !== normalizedCode);
  filtered.push(newTag);
  saveLocalDiscountTags(filtered);
  
  await syncDiscountTagToSupabase(newTag);
  return newTag;
}

export async function deleteDiscountTag(id: string): Promise<DiscountTag[]> {
  const tags = getLocalDiscountTags();
  const filtered = tags.filter(t => t.id !== id);
  saveLocalDiscountTags(filtered);
  
  try {
    await supabase.from('marketing_discount_tags').delete().eq('id', id);
  } catch (e) {
    console.warn('Failed to delete discount tag from Supabase', e);
  }
  return filtered;
}

// --- DISCOUNT CLAIMS SERVICES ---

export function getLocalDiscountClaims(): DiscountClaim[] {
  try {
    const raw = localStorage.getItem(DISCOUNT_CLAIMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse discount claims', e);
    return [];
  }
}

export function saveLocalDiscountClaims(claims: DiscountClaim[]): void {
  try {
    localStorage.setItem(DISCOUNT_CLAIMS_KEY, JSON.stringify(claims));
  } catch (e) {
    console.error('Failed to save discount claims', e);
  }
}

export async function syncDiscountClaimToSupabase(claim: DiscountClaim) {
  try {
    const { error } = await supabase.from('customer_discount_claims').upsert({
      id: claim.id,
      phone: claim.phone,
      tag_code: claim.tagCode,
      discount_percentage: claim.discountPercentage,
      expires_at: claim.expiresAt,
      sent_at: claim.sentAt,
      is_claimed: claim.isClaimed
    });
    if (error) {
      console.warn('Could not sync discount claim to Supabase:', error.message);
    }
  } catch (err) {
    console.error('Failed to sync discount claim', err);
  }
}

export async function syncDiscountClaimsFromSupabaseForCustomer(phone: string): Promise<DiscountClaim[]> {
  try {
    const cleaned = phone.replace(/\D/g, '');
    const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
    
    const { data, error } = await supabase
      .from('customer_discount_claims')
      .select('*')
      .eq('phone', digits);
      
    if (!error && data) {
      const localClaims = getLocalDiscountClaims();
      const mergedMap = new Map<string, DiscountClaim>();
      
      localClaims.forEach(c => mergedMap.set(c.id, c));
      
      data.forEach((d: any) => {
        mergedMap.set(d.id, {
          id: d.id,
          phone: d.phone,
          tagCode: d.tag_code,
          discountPercentage: d.discount_percentage,
          expiresAt: d.expires_at,
          sentAt: d.sent_at || d.created_at,
          isClaimed: d.is_claimed
        });
      });
      
      const mergedList = Array.from(mergedMap.values());
      saveLocalDiscountClaims(mergedList);
      return mergedList;
    }
  } catch (e) {
    console.warn('Supabase fetch for discount claims failed', e);
  }
  return getLocalDiscountClaims();
}

export async function assignDiscountClaimToCustomer(
  phone: string, 
  tagCode: string, 
  discountPercentage: number, 
  expiresAt: string
): Promise<DiscountClaim> {
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const claims = getLocalDiscountClaims();
  const filtered = claims.filter(c => !(c.phone === digits && c.tagCode === tagCode));
  
  const newClaim: DiscountClaim = {
    id: `disclaim-${digits}-${tagCode}-${Date.now()}`,
    phone: digits,
    tagCode,
    discountPercentage,
    expiresAt,
    sentAt: new Date().toISOString(),
    isClaimed: false
  };
  
  filtered.push(newClaim);
  saveLocalDiscountClaims(filtered);
  
  await syncDiscountClaimToSupabase(newClaim);
  return newClaim;
}

export function getActiveDiscountClaimsForCustomer(phone: string): DiscountClaim[] {
  if (!phone) return [];
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const claims = getLocalDiscountClaims();
  const now = new Date().toISOString();
  
  return claims.filter(c => 
    c.phone === digits && 
    !c.isClaimed && 
    c.expiresAt > now
  );
}

export async function markDiscountClaimAsUsed(phone: string, tagCode: string): Promise<boolean> {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, '');
  const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
  
  const claims = getLocalDiscountClaims();
  let found = false;
  let syncedClaim: DiscountClaim | null = null;
  
  const updated = claims.map(c => {
    if (c.phone === digits && c.tagCode === tagCode && !c.isClaimed) {
      found = true;
      syncedClaim = { ...c, isClaimed: true };
      return syncedClaim;
    }
    return c;
  });
  
  if (found && syncedClaim) {
    saveLocalDiscountClaims(updated);
    await syncDiscountClaimToSupabase(syncedClaim);
    return true;
  }
  return false;
}


