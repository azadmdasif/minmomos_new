// Idempotent statistical aggregation & nightly rebuild engine for MinMomos Add-on Engine
import { 
  AddonImpression, 
  AddonStatsLevel0, 
  AddonStatsLevel1, 
  ItemPairStat, 
  CustomerAddonProfile, 
  AddonEngineStatsSnapshot, 
  CartType, 
  ValueBand, 
  AddonEngineConfig,
  DEFAULT_ADDON_CONFIG
} from '../types/addonEngine';
import { CompletedOrder } from '../types';
import { 
  getAllStoredImpressions, 
  saveAddonStatsSnapshot, 
  saveCustomerAddonProfiles, 
  getAddonEngineConfig
} from './addonStorageQueue';
import { getOrdersForDateRange } from './storage';

/**
 * Calculate age in days between two ISO date strings or Date objects
 */
export function getAgeDays(dateStr: string, referenceDate: Date = new Date()): number {
  const d = new Date(dateStr);
  const diffMs = referenceDate.getTime() - d.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Exponential time-decay weight: 0.5^(age_days / 90)
 */
export function calculateDecayedWeight(dateStr: string, referenceDate: Date = new Date()): number {
  const ageDays = getAgeDays(dateStr, referenceDate);
  return Math.pow(0.5, ageDays / 90);
}

/**
 * Map rule-based complementary score into [0.08, 0.30] prior mean for L0
 */
export function mapRuleScoreToPriorMean(ruleScore: number = 50): number {
  // Typical rule scores range from 20 to 100
  const normalized = Math.max(0, Math.min(1, (ruleScore - 20) / 80));
  return 0.08 + normalized * (0.30 - 0.08); // [0.08, 0.30]
}

/**
 * Rebuild Item Pair Stats (Basket Complementarity) from raw historical orders
 * Lift(A, B) = P(B | A) / P(B) with Laplace additive smoothing
 */
export function rebuildItemPairStats(
  orders: CompletedOrder[],
  minSupport: number = 2
): ItemPairStat[] {
  const itemOrderCounts: Record<string, number> = {};
  const pairCounts: Record<string, number> = {};
  let totalValidOrders = 0;

  for (const order of orders) {
    if (!order.items || order.items.length === 0) continue;
    totalValidOrders++;

    // Deduplicate distinct items within this order
    const distinctItemNames = Array.from(new Set(order.items.map(i => i.name.toLowerCase().trim())));

    for (let i = 0; i < distinctItemNames.length; i++) {
      const a = distinctItemNames[i];
      itemOrderCounts[a] = (itemOrderCounts[a] || 0) + 1;

      for (let j = i + 1; j < distinctItemNames.length; j++) {
        const b = distinctItemNames[j];
        const pairKey = a < b ? `${a}|||${b}` : `${b}|||${a}`;
        pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
      }
    }
  }

  if (totalValidOrders === 0) return [];

  const results: ItemPairStat[] = [];
  const alphaSmoothing = 1.0; // Additive smoothing parameter

  for (const [pairKey, coOccurrences] of Object.entries(pairCounts)) {
    if (coOccurrences < minSupport) continue;
    const [itemA, itemB] = pairKey.split('|||');
    const countA = itemOrderCounts[itemA] || 0;
    const countB = itemOrderCounts[itemB] || 0;

    // Smoothed P(B | A) = (coOccurrences + alpha) / (countA + alpha * 2)
    const pBgivenA = (coOccurrences + alphaSmoothing) / (countA + alphaSmoothing * 2);
    // Smoothed P(B) = (countB + alpha) / (totalValidOrders + alpha * 2)
    const pB = (countB + alphaSmoothing) / (totalValidOrders + alphaSmoothing * 2);

    const smoothedLift = pB > 0 ? pBgivenA / pB : 1.0;
    const rawLift = (countA > 0 && countB > 0)
      ? (coOccurrences * totalValidOrders) / (countA * countB)
      : 1.0;

    results.push({
      item_a: itemA,
      item_b: itemB,
      co_occurrences: coOccurrences,
      total_a: countA,
      total_b: countB,
      total_orders: totalValidOrders,
      lift: Number(rawLift.toFixed(3)),
      smoothed_lift: Number(smoothedLift.toFixed(3)),
    });
  }

  results.sort((a, b) => b.smoothed_lift - a.smoothed_lift);
  return results;
}

/**
 * Rebuild Customer Profiles from raw completed orders and logged impressions
 */
export function rebuildCustomerProfiles(
  orders: CompletedOrder[],
  impressions: AddonImpression[],
  referenceDate: Date = new Date()
): Record<string, CustomerAddonProfile> {
  const profiles: Record<string, CustomerAddonProfile> = {};

  // 1. Process Raw Completed Orders
  for (const order of orders) {
    const rawPhone = order.customerPhone || '';
    const cleanPhone = rawPhone.trim().replace(/^\+91/, '').replace(/\D/g, '');
    const custId = order.customerId || cleanPhone;
    if (!cleanPhone && !order.customerId) continue;

    const lookupKey = cleanPhone || custId;
    if (!profiles[lookupKey]) {
      profiles[lookupKey] = {
        customer_id: custId,
        phone: cleanPhone,
        visits: 0,
        last_visit: order.date,
        median_days_between_visits: 14,
        avg_cart: 0,
        usual_daypart: 'lunch',
        veg_only_so_far: 0,
        item_counts: {},
        category_counts: {},
        addon_history: {},
        category_addon_history: {},
        deal_strength_accepts: {}
      };
    }

    const p = profiles[lookupKey];
    p.visits += 1;
    if (new Date(order.date) > new Date(p.last_visit)) {
      p.last_visit = order.date;
    }

    // Accumulate total spend for avg cart
    p.avg_cart = ((p.avg_cart * (p.visits - 1)) + (order.total || 0)) / p.visits;

    // Check if order has NO non-veg item (soft veg counter)
    const isVegOrder = !(order.items || []).some(i => {
      const name = (i.name || '').toLowerCase();
      return name.includes('chicken') || name.includes('meat') || name.includes('egg') || name.includes('fish');
    });
    if (isVegOrder) {
      p.veg_only_so_far += 1;
    }

    // Time-decayed item purchases
    const weight = calculateDecayedWeight(order.date, referenceDate);
    for (const item of (order.items || [])) {
      const name = item.name.toLowerCase().trim();
      p.item_counts[name] = (p.item_counts[name] || 0) + (item.quantity || 1) * weight;

      // Extract general category
      let cat = 'momo';
      if (name.includes('drink') || name.includes('mojito') || name.includes('cola')) cat = 'beverage';
      else if (name.includes('fries') || name.includes('popcorn') || name.includes('dip')) cat = 'sides';
      else if (name.includes('moburg') || name.includes('burger')) cat = 'burger';
      p.category_counts[cat] = (p.category_counts[cat] || 0) + (item.quantity || 1) * weight;
    }
  }

  // 2. Process Addon Impressions History (Accepts, Rejections, Cooldowns)
  for (const imp of impressions) {
    const rawPhone = imp.customer_phone || '';
    const cleanPhone = rawPhone.trim().replace(/^\+91/, '').replace(/\D/g, '');
    const custId = imp.customer_id || cleanPhone;
    if (!cleanPhone && !imp.customer_id) continue;

    const lookupKey = cleanPhone || custId;
    if (!profiles[lookupKey]) continue;

    const p = profiles[lookupKey];
    const key = imp.offer_key;

    if (!p.addon_history[key]) {
      p.addon_history[key] = { impressions: 0, accepts: 0 };
    }

    p.addon_history[key].impressions += 1;
    if (imp.outcome === 'accepted') {
      p.addon_history[key].accepts += 1;
    } else if (imp.outcome === 'declined') {
      p.addon_history[key].last_declined_at = imp.created_at;
    }

    // Deal strength band accepts
    const band = imp.deal_strength >= 0.4 ? 'high_discount' : imp.deal_strength >= 0.2 ? 'medium_discount' : 'low_discount';
    if (!p.deal_strength_accepts) p.deal_strength_accepts = {};
    if (!p.deal_strength_accepts[band]) p.deal_strength_accepts[band] = { impressions: 0, accepts: 0 };
    p.deal_strength_accepts[band].impressions += 1;
    if (imp.outcome === 'accepted') {
      p.deal_strength_accepts[band].accepts += 1;
    }
  }

  return profiles;
}

/**
 * Fully Idempotent Rebuild of Hierarchical Beta-Binomial Statistics
 * L0: offer_key
 * L1: offer_key x cart_type x value_band
 * Recomputed completely from raw logs. Never suffers drift.
 */
export function rebuildAddonEngineStats(
  impressions: AddonImpression[],
  orders: CompletedOrder[],
  config: AddonEngineConfig = DEFAULT_ADDON_CONFIG,
  referenceDate: Date = new Date()
): AddonEngineStatsSnapshot {
  const l0Map: Record<string, AddonStatsLevel0> = {};
  const l1Map: Record<string, AddonStatsLevel1> = {};

  // Only consider 'accepted' and 'declined' for statistical acceptance estimation.
  // 'skipped', 'timed_out', 'not_shown_holdout' are logged but excluded from the model.
  const validObservations = impressions.filter(
    i => i.outcome === 'accepted' || i.outcome === 'declined'
  );

  // 1. Accumulate Decayed Counts for L0 and L1
  interface Accumulator {
    n_impressions: number;
    n_accepts: number;
    decayed_impressions: number;
    decayed_accepts: number;
  }

  const l0Counts: Record<string, Accumulator> = {};
  const l1Counts: Record<string, Accumulator> = {};

  for (const imp of validObservations) {
    const weight = calculateDecayedWeight(imp.created_at, referenceDate);
    const isAccept = imp.outcome === 'accepted';

    // L0 key: offer_key
    const k0 = imp.offer_key;
    if (!l0Counts[k0]) {
      l0Counts[k0] = { n_impressions: 0, n_accepts: 0, decayed_impressions: 0, decayed_accepts: 0 };
    }
    l0Counts[k0].n_impressions += 1;
    l0Counts[k0].decayed_impressions += weight;
    if (isAccept) {
      l0Counts[k0].n_accepts += 1;
      l0Counts[k0].decayed_accepts += weight;
    }

    // L1 key: offer_key x cart_type x value_band
    const k1 = `${imp.offer_key}:::${imp.cart_type}:::${imp.value_band}`;
    if (!l1Counts[k1]) {
      l1Counts[k1] = { n_impressions: 0, n_accepts: 0, decayed_impressions: 0, decayed_accepts: 0 };
    }
    l1Counts[k1].n_impressions += 1;
    l1Counts[k1].decayed_impressions += weight;
    if (isAccept) {
      l1Counts[k1].n_accepts += 1;
      l1Counts[k1].decayed_accepts += weight;
    }
  }

  // 2. Compute Level 0 (L0) Hierarchical Posteriors with Shrinkage
  // L0 Parent mean is mapped from baseline rule prior [0.08, 0.30]
  const kL0 = config.K_PRIOR; // default 15

  // Collect all known offer keys
  const allOfferKeys = Array.from(new Set([
    ...Object.keys(l0Counts),
    'steamed_chicken_x2', 'steamed_veg_x2', 'steamed_paneer_x2',
    'fried_chicken_x2', 'fried_veg_x2', 'fried_paneer_x2',
    'kurkure_chicken_x2', 'tandoori_chicken_x2', 'campa_cola_200ml',
    'tandoori_mayo_dip', 'peri_peri_masala', 'tandoori_peri_pair', 'campa_mayo_combo',
    'salted_fries_mini', 'mint_mojito_mini', 'salted_fries_31', 'chicken_popcorn_5pc_26'
  ]));

  for (const key of allOfferKeys) {
    const counts = l0Counts[key] || { n_impressions: 0, n_accepts: 0, decayed_impressions: 0, decayed_accepts: 0 };
    const pParentL0 = mapRuleScoreToPriorMean(50); // 0.1625 default prior mean

    const alpha = kL0 * pParentL0 + counts.decayed_accepts;
    const beta = kL0 * (1 - pParentL0) + (counts.decayed_impressions - counts.decayed_accepts);
    const posterior_mean = alpha / (alpha + beta);

    l0Map[key] = {
      offer_key: key,
      n_impressions: counts.n_impressions,
      n_accepts: counts.n_accepts,
      decayed_impressions: Number(counts.decayed_impressions.toFixed(2)),
      decayed_accepts: Number(counts.decayed_accepts.toFixed(2)),
      alpha: Number(alpha.toFixed(3)),
      beta: Number(beta.toFixed(3)),
      posterior_mean: Number(posterior_mean.toFixed(4)),
      last_updated: referenceDate.toISOString(),
    };
  }

  // 3. Compute Level 1 (L1) Hierarchical Posteriors with Shrinkage toward L0
  const kL1 = config.K_PRIOR; // 15
  const cartTypes: CartType[] = ['steamed_only', 'fried_crispy_only', 'mixed', 'has_drink', 'meal'];
  const valueBands: ValueBand[] = ['<100', '100-199', '200+'];

  for (const key of allOfferKeys) {
    const l0Stats = l0Map[key];
    const pParentL1 = l0Stats ? l0Stats.posterior_mean : 0.1625;

    for (const ct of cartTypes) {
      for (const vb of valueBands) {
        const k1 = `${key}:::${ct}:::${vb}`;
        const counts = l1Counts[k1] || { n_impressions: 0, n_accepts: 0, decayed_impressions: 0, decayed_accepts: 0 };

        // Shrinkage towards L0 parent
        const alpha = kL1 * pParentL1 + counts.decayed_accepts;
        const beta = kL1 * (1 - pParentL1) + (counts.decayed_impressions - counts.decayed_accepts);
        const posterior_mean = alpha / (alpha + beta);

        l1Map[k1] = {
          offer_key: key,
          cart_type: ct,
          value_band: vb,
          n_impressions: counts.n_impressions,
          n_accepts: counts.n_accepts,
          decayed_impressions: Number(counts.decayed_impressions.toFixed(2)),
          decayed_accepts: Number(counts.decayed_accepts.toFixed(2)),
          alpha: Number(alpha.toFixed(3)),
          beta: Number(beta.toFixed(3)),
          posterior_mean: Number(posterior_mean.toFixed(4)),
          last_updated: referenceDate.toISOString(),
        };
      }
    }
  }

  // 4. Basket Complementarity (Pair Stats)
  const itemPairs = rebuildItemPairStats(orders);

  // 5. Customer Profile Rebuild
  const customerProfiles = rebuildCustomerProfiles(orders, impressions, referenceDate);
  saveCustomerAddonProfiles(customerProfiles);

  const snapshot: AddonEngineStatsSnapshot = {
    l0: l0Map,
    l1: l1Map,
    itemPairs,
    lastUpdated: referenceDate.toISOString(),
    version: 'v1.0-hierarchical-beta-binomial'
  };

  saveAddonStatsSnapshot(snapshot);
  return snapshot;
}

/**
 * Execute full rebuild using current storage records
 */
export async function runFullOfflineRebuild(): Promise<AddonEngineStatsSnapshot> {
  const impressions = getAllStoredImpressions();
  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const orders = await getOrdersForDateRange(start, end);
  const config = getAddonEngineConfig();
  return rebuildAddonEngineStats(impressions, orders, config);
}
