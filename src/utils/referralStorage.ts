import { supabase } from './supabase';
import { Customer } from '../types';
import { normalizePhone, getISTISOString, invalidateCustomersCache } from './storage';

export interface ReferralRedemption {
  id?: string;
  referrerPhone: string;
  referrerCode: string;
  refereePhone: string;
  billNumber?: number;
  discountAmount: number;
  createdAt: string;
}

export interface StudentGangRegistration {
  id?: string;
  gangCouponCode?: string;
  leadPhone: string;
  billNumber?: number;
  college: string;
  memberPhones: string[];
  memberNames?: string[];
  memberCount: number;
  discountAmount: number;
  createdAt: string;
}

// 1. Eligibility Rule: LTV > 1000 INR OR 10+ orders
export function checkReferralEligibility(customer: { totalSpent?: number; totalOrders?: number; ltv?: number }): boolean {
  const spent = customer.totalSpent ?? customer.ltv ?? 0;
  const orders = customer.totalOrders ?? 0;
  return spent > 1000 || orders >= 10;
}

// 2. Generate clean, unique referral code: e.g. MOMO-8492-K7
export function generateReferralCodeForPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  const suffix = normalized.length >= 4 ? normalized.slice(-4) : Math.floor(1000 + Math.random() * 9000).toString();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 3; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `MOMO-${suffix}-${rand}`;
}

// 3. Generate clean, unique gang coupon code: e.g. GANG-8492-X4
export function generateGangCouponForPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  const suffix = normalized.length >= 4 ? normalized.slice(-4) : Math.floor(1000 + Math.random() * 9000).toString();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 3; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `GANG-${suffix}-${rand}`;
}

// Local cache keys
const LOCAL_REFERRAL_CODES_KEY = 'momo_referral_codes_cache';
const LOCAL_REFERRAL_REDEMPTIONS_KEY = 'momo_referral_redemptions_cache';
const LOCAL_GANG_COUPONS_KEY = 'momo_gang_coupons_cache';
const LOCAL_GANG_REGISTRATIONS_KEY = 'momo_student_gang_cache';
const LOCAL_REFERRAL_SENT_PHONES_KEY = 'momo_referral_sent_phones_cache';
const LOCAL_GANG_COUPON_SENT_PHONES_KEY = 'momo_gang_coupon_sent_phones_cache';

export function getLocalReferralSentPhones(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCAL_REFERRAL_SENT_PHONES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function isReferralCodeSent(phone: string, customer?: Customer): boolean {
  if (customer?.referralCodeSent) return true;
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return false;
  return getLocalReferralSentPhones().has(cleanPhone);
}

export async function markReferralCodeAsSent(phone: string): Promise<boolean> {
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return false;

  // 1. Save in local cache
  try {
    const sentSet = getLocalReferralSentPhones();
    sentSet.add(cleanPhone);
    localStorage.setItem(LOCAL_REFERRAL_SENT_PHONES_KEY, JSON.stringify(Array.from(sentSet)));
  } catch (e) {
    console.warn("Failed to save local referral sent cache:", e);
  }

  // 2. Persist in Supabase DB
  try {
    await supabase
      .from('customers')
      .update({ referral_code_sent: true })
      .eq('phone', cleanPhone);
  } catch (err) {
    console.warn("Supabase update error for referral_code_sent:", err);
  }

  invalidateCustomersCache();
  return true;
}

export function getLocalGangCouponSentPhones(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCAL_GANG_COUPON_SENT_PHONES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function isGangCouponSent(phone: string, customer?: Customer): boolean {
  if (customer?.gangCouponSent) return true;
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return false;
  return getLocalGangCouponSentPhones().has(cleanPhone);
}

export async function markGangCouponAsSent(phone: string): Promise<boolean> {
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return false;

  // 1. Save in local cache
  try {
    const sentSet = getLocalGangCouponSentPhones();
    sentSet.add(cleanPhone);
    localStorage.setItem(LOCAL_GANG_COUPON_SENT_PHONES_KEY, JSON.stringify(Array.from(sentSet)));
  } catch (e) {
    console.warn("Failed to save local gang coupon sent cache:", e);
  }

  // 2. Persist in Supabase DB
  try {
    await supabase
      .from('customers')
      .update({ gang_coupon_sent: true })
      .eq('phone', cleanPhone);
  } catch (err) {
    console.warn("Supabase update error for gang_coupon_sent:", err);
  }

  invalidateCustomersCache();
  return true;
}

function getLocalReferralMap(): Record<string, { code: string; phone: string; name?: string; wallet: number }> {
  try {
    const raw = localStorage.getItem(LOCAL_REFERRAL_CODES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalReferralMap(map: Record<string, { code: string; phone: string; name?: string; wallet: number }>) {
  try {
    localStorage.setItem(LOCAL_REFERRAL_CODES_KEY, JSON.stringify(map));
  } catch (e) {
    console.error("Failed to save local referral cache:", e);
  }
}

function getLocalGangCouponMap(): Record<string, { code: string; phone: string; name?: string }> {
  try {
    const raw = localStorage.getItem(LOCAL_GANG_COUPONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalGangCouponMap(map: Record<string, { code: string; phone: string; name?: string }>) {
  try {
    localStorage.setItem(LOCAL_GANG_COUPONS_KEY, JSON.stringify(map));
  } catch (e) {
    console.error("Failed to save local gang coupon cache:", e);
  }
}

// Ensure an eligible customer has a permanent unique referral code generated & remembered
export async function ensureCustomerReferralCode(customer: Customer): Promise<Customer> {
  if (!customer.phone) return customer;
  const normalized = normalizePhone(customer.phone);

  const isEligible = checkReferralEligibility(customer);
  if (!isEligible) {
    return customer;
  }

  const isSent = customer.referralCodeSent ?? isReferralCodeSent(normalized, customer);

  if (customer.referralCode) {
    const localMap = getLocalReferralMap();
    localMap[customer.referralCode.toUpperCase()] = {
      code: customer.referralCode.toUpperCase(),
      phone: normalized,
      name: customer.name,
      wallet: customer.referralWallet || 0
    };
    saveLocalReferralMap(localMap);
    return {
      ...customer,
      referralCodeSent: isSent
    };
  }

  try {
    const { data: dbCust } = await supabase
      .from('customers')
      .select('id, referral_code, referral_wallet, is_referral_active, referral_code_sent')
      .eq('phone', normalized)
      .maybeSingle();

    if (dbCust?.referral_code) {
      const dbIsSent = dbCust.referral_code_sent != null ? Boolean(dbCust.referral_code_sent) : isSent;
      const updatedCust: Customer = {
        ...customer,
        referralCode: dbCust.referral_code,
        referralWallet: dbCust.referral_wallet != null ? Number(dbCust.referral_wallet) : 0,
        isReferralActive: true,
        referralCodeSent: dbIsSent
      };
      const localMap = getLocalReferralMap();
      localMap[dbCust.referral_code.toUpperCase()] = {
        code: dbCust.referral_code.toUpperCase(),
        phone: normalized,
        name: customer.name,
        wallet: updatedCust.referralWallet || 0
      };
      saveLocalReferralMap(localMap);
      return updatedCust;
    }

    const newCode = generateReferralCodeForPhone(normalized);
    await supabase
      .from('customers')
      .update({
        referral_code: newCode,
        is_referral_active: true,
        referral_code_sent: false
      })
      .eq('phone', normalized);

    const updatedCust: Customer = {
      ...customer,
      referralCode: newCode,
      referralWallet: customer.referralWallet || 0,
      isReferralActive: true,
      referralCodeSent: false
    };

    const localMap = getLocalReferralMap();
    localMap[newCode.toUpperCase()] = {
      code: newCode.toUpperCase(),
      phone: normalized,
      name: customer.name,
      wallet: customer.referralWallet || 0
    };
    saveLocalReferralMap(localMap);

    return updatedCust;
  } catch (err) {
    console.error("Error ensuring customer referral code:", err);
    const fallbackCode = generateReferralCodeForPhone(normalized);
    const updatedCust: Customer = {
      ...customer,
      referralCode: fallbackCode,
      referralWallet: 0,
      isReferralActive: true,
      referralCodeSent: isSent
    };
    const localMap = getLocalReferralMap();
    localMap[fallbackCode.toUpperCase()] = {
      code: fallbackCode.toUpperCase(),
      phone: normalized,
      name: customer.name,
      wallet: 0
    };
    saveLocalReferralMap(localMap);
    return updatedCust;
  }
}

// 4. Ensure a student customer has a unique Gang Coupon generated & remembered
export async function ensureCustomerGangCoupon(customer: Customer): Promise<Customer> {
  if (!customer.phone) return customer;
  const normalized = normalizePhone(customer.phone);

  const isStudent = customer.note === 'STUDENT' || customer.note?.startsWith('STUDENT|');
  if (!isStudent) {
    return customer;
  }

  const isSent = customer.gangCouponSent ?? isGangCouponSent(normalized, customer);

  if (customer.gangCouponCode) {
    const localMap = getLocalGangCouponMap();
    localMap[customer.gangCouponCode.toUpperCase()] = {
      code: customer.gangCouponCode.toUpperCase(),
      phone: normalized,
      name: customer.name
    };
    saveLocalGangCouponMap(localMap);
    return {
      ...customer,
      gangCouponSent: isSent
    };
  }

  try {
    const { data: dbCust } = await supabase
      .from('customers')
      .select('id, gang_coupon_code, gang_coupon_sent')
      .eq('phone', normalized)
      .maybeSingle();

    if (dbCust?.gang_coupon_code) {
      const dbIsSent = dbCust.gang_coupon_sent != null ? Boolean(dbCust.gang_coupon_sent) : isSent;
      const updatedCust: Customer = {
        ...customer,
        gangCouponCode: dbCust.gang_coupon_code,
        gangCouponSent: dbIsSent
      };
      const localMap = getLocalGangCouponMap();
      localMap[dbCust.gang_coupon_code.toUpperCase()] = {
        code: dbCust.gang_coupon_code.toUpperCase(),
        phone: normalized,
        name: customer.name
      };
      saveLocalGangCouponMap(localMap);
      return updatedCust;
    }

    const newGangCode = generateGangCouponForPhone(normalized);
    await supabase
      .from('customers')
      .update({
        gang_coupon_code: newGangCode,
        gang_coupon_sent: false
      })
      .eq('phone', normalized);

    const updatedCust: Customer = {
      ...customer,
      gangCouponCode: newGangCode,
      gangCouponSent: false
    };

    const localMap = getLocalGangCouponMap();
    localMap[newGangCode.toUpperCase()] = {
      code: newGangCode.toUpperCase(),
      phone: normalized,
      name: customer.name
    };
    saveLocalGangCouponMap(localMap);

    return updatedCust;
  } catch (err) {
    console.error("Error ensuring customer gang coupon:", err);
    const fallbackGangCode = generateGangCouponForPhone(normalized);
    const updatedCust: Customer = {
      ...customer,
      gangCouponCode: fallbackGangCode,
      gangCouponSent: isSent
    };
    const localMap = getLocalGangCouponMap();
    localMap[fallbackGangCode.toUpperCase()] = {
      code: fallbackGangCode.toUpperCase(),
      phone: normalized,
      name: customer.name
    };
    saveLocalGangCouponMap(localMap);
    return updatedCust;
  }
}

// 5. Validate referral code for a new customer
export async function validateReferralCode(
  code: string,
  newCustomerPhone: string
): Promise<{
  valid: boolean;
  error?: string;
  referrerName?: string;
  referrerPhone?: string;
  referrerCode?: string;
}> {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, error: 'Please enter a referral code' };
  }

  const cleanRefereePhone = normalizePhone(newCustomerPhone);
  if (!cleanRefereePhone || cleanRefereePhone.length !== 10) {
    return { valid: false, error: 'Please enter a valid 10-digit customer phone number first' };
  }

  try {
    const { data: refereeCust } = await supabase
      .from('customers')
      .select('id, total_orders, referred_by_code')
      .eq('phone', cleanRefereePhone)
      .maybeSingle();

    if (refereeCust) {
      if ((refereeCust.total_orders || 0) > 0) {
        return {
          valid: false,
          error: 'Referral discount is only valid on the 1st purchase for brand new customers'
        };
      }
      if (refereeCust.referred_by_code) {
        return {
          valid: false,
          error: `A referral code (${refereeCust.referred_by_code}) has already been registered for this customer`
        };
      }
    }
  } catch (err) {
    console.warn("Could not check referee customer record in DB, checking local checks:", err);
  }

  let referrerData: { id?: string; phone: string; name?: string; referral_code: string; referral_wallet?: number } | null = null;

  try {
    const { data, error } = await supabase
      .from('customers')
      .select('id, phone, name, referral_code, referral_wallet, is_referral_active')
      .ilike('referral_code', cleanCode)
      .maybeSingle();

    if (!error && data) {
      referrerData = data;
    }
  } catch (e) {
    console.warn("Supabase referral lookup error, checking local map:", e);
  }

  if (!referrerData) {
    const localMap = getLocalReferralMap();
    const localMatch = localMap[cleanCode];
    if (localMatch) {
      referrerData = {
        phone: localMatch.phone,
        name: localMatch.name,
        referral_code: localMatch.code,
        referral_wallet: localMatch.wallet
      };
    }
  }

  if (!referrerData) {
    return {
      valid: false,
      error: `Invalid referral code "${cleanCode}". Please verify and try again.`
    };
  }

  if (normalizePhone(referrerData.phone) === cleanRefereePhone) {
    return {
      valid: false,
      error: 'Self-referral is not allowed. Customers cannot use their own referral code.'
    };
  }

  return {
    valid: true,
    referrerName: referrerData.name || 'VIP Member',
    referrerPhone: referrerData.phone,
    referrerCode: referrerData.referral_code
  };
}

// 6. Validate gang coupon code for redemption
export async function validateGangCoupon(
  code: string
): Promise<{
  valid: boolean;
  error?: string;
  studentPhone?: string;
  studentName?: string;
  couponCode?: string;
}> {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, error: 'Please enter a gang coupon code' };
  }

  let couponOwner: { phone: string; name?: string; gang_coupon_code: string } | null = null;

  try {
    const { data, error } = await supabase
      .from('customers')
      .select('id, phone, name, gang_coupon_code')
      .ilike('gang_coupon_code', cleanCode)
      .maybeSingle();

    if (!error && data) {
      couponOwner = data;
    }
  } catch (e) {
    console.warn("Supabase gang coupon lookup error, checking local map:", e);
  }

  if (!couponOwner) {
    const localMap = getLocalGangCouponMap();
    const localMatch = localMap[cleanCode];
    if (localMatch) {
      couponOwner = {
        phone: localMatch.phone,
        name: localMatch.name,
        gang_coupon_code: localMatch.code
      };
    }
  }

  // If still not found, allow format validation GANG-XXXX-XX for offline or newly created coupons
  if (!couponOwner) {
    if (cleanCode.startsWith('GANG-')) {
      return {
        valid: true,
        studentPhone: '',
        studentName: 'Student Member',
        couponCode: cleanCode
      };
    }
    return {
      valid: false,
      error: `Invalid student gang coupon "${cleanCode}". Please verify the code.`
    };
  }

  return {
    valid: true,
    studentPhone: couponOwner.phone,
    studentName: couponOwner.name || 'Student Member',
    couponCode: couponOwner.gang_coupon_code
  };
}

// 7. Apply referral reward: Credits EXACT amount as MinCoins to referrer
export async function applyReferralReward(
  referrerCode: string,
  refereePhone: string,
  billNumber: number,
  discountAmount: number
): Promise<{ success: boolean; creditedAmount: number; error?: string }> {
  const cleanCode = referrerCode.trim().toUpperCase();
  const cleanReferee = normalizePhone(refereePhone);
  const amountToCredit = Math.min(100, Math.max(0, Math.round(discountAmount)));

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('process_referral_reward', {
      p_referrer_code: cleanCode,
      p_referee_phone: cleanReferee,
      p_bill_number: billNumber,
      p_discount_amount: amountToCredit
    });

    if (!rpcError && rpcData?.success) {
      invalidateCustomersCache();
      return { success: true, creditedAmount: amountToCredit };
    }
  } catch (rpcErr) {
    console.warn("RPC process_referral_reward unavailable, proceeding with direct DB updates:", rpcErr);
  }

  // Direct Supabase update fallback: Credit min_coins and referral_wallet
  try {
    const { data: referrerCust } = await supabase
      .from('customers')
      .select('id, phone, referral_wallet, min_coins')
      .ilike('referral_code', cleanCode)
      .maybeSingle();

    if (referrerCust) {
      const currentWallet = referrerCust.referral_wallet != null ? Number(referrerCust.referral_wallet) : 0;
      const newWallet = currentWallet + amountToCredit;
      const currentCoins = referrerCust.min_coins != null ? Number(referrerCust.min_coins) : 0;
      const newCoins = currentCoins + amountToCredit;

      // Credit exact amount to min_coins and referral_wallet
      await supabase
        .from('customers')
        .update({
          referral_wallet: newWallet,
          min_coins: newCoins
        })
        .eq('id', referrerCust.id);

      await supabase
        .from('referral_redemptions')
        .insert({
          referrer_phone: referrerCust.phone,
          referrer_code: cleanCode,
          referee_phone: cleanReferee,
          bill_number: billNumber,
          discount_amount: amountToCredit,
          created_at: getISTISOString()
        });

      await supabase
        .from('customers')
        .update({
          referred_by_code: cleanCode
        })
        .eq('phone', cleanReferee);

      const localMap = getLocalReferralMap();
      if (localMap[cleanCode]) {
        localMap[cleanCode].wallet = newWallet;
        saveLocalReferralMap(localMap);
      }

      invalidateCustomersCache();
      return { success: true, creditedAmount: amountToCredit };
    }
  } catch (dbErr) {
    console.error("Direct DB referral reward update failed:", dbErr);
  }

  try {
    const localMap = getLocalReferralMap();
    if (localMap[cleanCode]) {
      localMap[cleanCode].wallet = (localMap[cleanCode].wallet || 0) + amountToCredit;
      saveLocalReferralMap(localMap);
    }

    const redemptionsRaw = localStorage.getItem(LOCAL_REFERRAL_REDEMPTIONS_KEY);
    const redemptionsList: ReferralRedemption[] = redemptionsRaw ? JSON.parse(redemptionsRaw) : [];
    redemptionsList.push({
      referrerPhone: localMap[cleanCode]?.phone || '',
      referrerCode: cleanCode,
      refereePhone: cleanReferee,
      billNumber: billNumber,
      discountAmount: amountToCredit,
      createdAt: getISTISOString()
    });
    localStorage.setItem(LOCAL_REFERRAL_REDEMPTIONS_KEY, JSON.stringify(redemptionsList));

    return { success: true, creditedAmount: amountToCredit };
  } catch (err) {
    console.error("Local referral logging error:", err);
    return { success: false, creditedAmount: 0, error: 'Could not record referral reward' };
  }
}

// 8. Register Student Gang of 3 or more (Flat 50% OFF up to 200 INR)
export async function registerStudentGang(
  gangCouponCode: string,
  leadPhone: string,
  college: string,
  members: { name: string; phone: string }[],
  billNumber?: number
): Promise<{ success: boolean; registeredCount: number; error?: string }> {
  if (!members || members.length < 3) {
    return { success: false, registeredCount: 0, error: 'Student Gang offer requires at least 3 students' };
  }

  const cleanPhones = members.map(m => normalizePhone(m.phone));
  const uniquePhones = new Set(cleanPhones);
  if (uniquePhones.size !== members.length) {
    return { success: false, registeredCount: 0, error: 'All gang members must have unique phone numbers' };
  }

  for (const m of members) {
    const phone = normalizePhone(m.phone);
    if (!phone || phone.length !== 10) {
      return { success: false, registeredCount: 0, error: `Invalid 10-digit phone number: ${m.phone}` };
    }
  }

  let registered = 0;
  for (const member of members) {
    const norm = normalizePhone(member.phone);
    const random8 = Math.floor(10000000 + Math.random() * 90000000);
    const hikerNo = `HIKER-${random8}`;
    const studentNote = `STUDENT|${college.trim() || 'Student Gang'}|${hikerNo}`;

    try {
      await supabase
        .from('customers')
        .upsert(
          {
            phone: norm,
            name: member.name.trim() || 'Student',
            note: studentNote
          },
          { onConflict: 'phone' }
        );
      registered++;
    } catch (e) {
      console.warn(`Failed to upsert student ${norm} to Supabase:`, e);
      registered++;
    }
  }

  try {
    await supabase.from('student_gang_registrations').insert({
      gang_coupon_code: gangCouponCode.trim().toUpperCase() || null,
      lead_phone: normalizePhone(leadPhone),
      college: college.trim() || 'College/University',
      bill_number: billNumber,
      member_phones: cleanPhones,
      member_names: members.map(m => m.name.trim()),
      member_count: members.length,
      discount_amount: 200,
      created_at: getISTISOString()
    });
  } catch (e) {
    console.warn("Could not insert student_gang_registrations log, saving locally:", e);
    try {
      const raw = localStorage.getItem(LOCAL_GANG_REGISTRATIONS_KEY);
      const list: StudentGangRegistration[] = raw ? JSON.parse(raw) : [];
      list.push({
        gangCouponCode: gangCouponCode.trim().toUpperCase(),
        leadPhone: normalizePhone(leadPhone),
        college: college.trim() || 'College/University',
        billNumber: billNumber,
        memberPhones: cleanPhones,
        memberNames: members.map(m => m.name.trim()),
        memberCount: members.length,
        discountAmount: 200,
        createdAt: getISTISOString()
      });
      localStorage.setItem(LOCAL_GANG_REGISTRATIONS_KEY, JSON.stringify(list));
    } catch {
      // Ignore
    }
  }

  invalidateCustomersCache();
  return { success: true, registeredCount: registered };
}

// 9. WhatsApp URL & Share Message generators
export function getReferralShareMessage(referralCode: string): string {
  const code = (referralCode || '').trim().toUpperCase();
  return `Enjoy momos and chicken with *FLAT 50% OFF* at MinMomos!

Use my exclusive code *${code}* and enjoy the discount at MinMomos


How to redeem:

Visit MinMomos or order online.

Show or enter code *${code}* at billing.

Enjoy 50% off (up to ₹100) on your feast!`;
}

export function getWhatsAppReferralShareUrl(phone: string, _customerName: string, referralCode: string): string {
  const cleanPhone = normalizePhone(phone);
  const message = getReferralShareMessage(referralCode);
  return `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function getGangCouponShareMessage(gangCouponCode: string, studentName?: string): string {
  const code = (gangCouponCode || '').trim().toUpperCase();
  const name = studentName?.trim() || 'Student';

  return `Hey ${name}! Here is your unique Student Gang Coupon Code: *${code}*. Bring 3 or more students, visit MinMomos, and get FLAT 50% OFF (up to ₹200) on your total bill! 🥟👥

How to redeem:
1. Bring a gang of 3 or more students.
2. Visit MinMomos and enter or show code *${code}* at billing.
3. Enjoy Flat 50% OFF (up to ₹200) on your feast!

Plus, all your gang members get unlocked for 10% student discounts on future visits!

- Team MinMomos`;
}

export function getWhatsAppGangCouponUrl(phone: string, studentName: string, gangCouponCode: string): string {
  const cleanPhone = normalizePhone(phone);
  const message = getGangCouponShareMessage(gangCouponCode, studentName);
  return `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
}
