// Stable Offer Keys and Statistical Learning Types for MinMomos Add-on Engine

export type OfferKey =
  | 'steamed_chicken_x2'
  | 'steamed_veg_x2'
  | 'steamed_paneer_x2'
  | 'fried_chicken_x2'
  | 'fried_veg_x2'
  | 'fried_paneer_x2'
  | 'kurkure_chicken_x2'
  | 'kurkure_paneer_x2'
  | 'tandoori_chicken_x2'
  | 'peri_peri_chicken_x2'
  | 'campa_cola_200ml'
  | 'campa_mayo_combo'
  | 'mint_mojito_mini'
  | 'virgin_mint_mojito'
  | 'salted_fries_mini'
  | 'peri_peri_fries'
  | 'tandoori_mayo_dip'
  | 'peri_peri_masala'
  | 'tandoori_peri_pair'
  | 'chicken_popcorn_mini'
  | 'chicken_popcorn_mojito'
  | 'kurkure_mojito_combo'
  | 'tandoori_feast_combo'
  | 'fries_campa_combo'
  | 'steamed_chicken_x3'
  | 'steamed_paneer_x3'
  | 'fried_chicken_x3'
  | 'salted_fries_31'
  | 'chicken_popcorn_5pc_26'
  | string;

export type CartType = 'steamed_only' | 'fried_crispy_only' | 'mixed' | 'has_drink' | 'meal';
export type ValueBand = '<100' | '100-199' | '200+';
export type DayPart = 'lunch' | 'tea_snack' | 'dinner' | 'late_night';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type RoundingTier = '50' | '10' | 'pinned' | 'none';

export type DecisionSource =
  | 'pinned'
  | 'history'
  | 'affinity'
  | 'complement'
  | 'explore'
  | 'holdout'
  | 'thompson_l1'
  | 'thompson_l0'
  | 'rule_fallback';

export type ImpressionOutcome =
  | 'accepted'
  | 'declined'
  | 'skipped'
  | 'timed_out'
  | 'removed_before_print'
  | 'not_shown_holdout'
  | 'pending';

export interface AddonImpression {
  impression_id: string; // UUID generated client-side
  created_at: string; // ISO string
  order_id?: string | null;
  customer_id?: string | null;
  customer_phone?: string | null;

  // Cart Context
  cart_total: number;
  cart_type: CartType;
  value_band: ValueBand;
  daypart: DayPart;
  weekday: Weekday;

  // Offer Economics
  offer_key: OfferKey;
  offer_price: number;
  offer_cost: number;
  margin_multiple: number; // offer_price / offer_cost
  reference_price: number;
  deal_strength: number; // (reference_price - offer_price) / reference_price
  rounding_tier: RoundingTier;

  // Policy & Learning Metadata
  source: DecisionSource;
  policy_version: string;
  propensity: number; // probability this offer was selected by the policy

  // Outcome Tracking
  outcome: ImpressionOutcome;
  shown_ms?: number; // timestamp when shown
  decision_ms?: number; // duration cashier/customer took to decide
}

export interface AddonFixedEvent {
  event_id: string; // UUID
  created_at: string;
  order_id?: string | null;
  customer_id?: string | null;
  customer_phone?: string | null;
  cart_total: number;
  cart_type: CartType;
  value_band: ValueBand;
  daypart: DayPart;
  weekday: Weekday;
  fixed_item_id: string; // 'fries' | 'mojito' | 'popcorn'
  fixed_item_name: string;
  price: number;
  action: 'added' | 'incremented' | 'decremented' | 'removed';
}

export interface AddonStatsLevel0 {
  offer_key: OfferKey;
  n_impressions: number;
  n_accepts: number;
  decayed_impressions: number;
  decayed_accepts: number;
  alpha: number;
  beta: number;
  posterior_mean: number;
  last_updated: string;
}

export interface AddonStatsLevel1 {
  offer_key: OfferKey;
  cart_type: CartType;
  value_band: ValueBand;
  n_impressions: number;
  n_accepts: number;
  decayed_impressions: number;
  decayed_accepts: number;
  alpha: number;
  beta: number;
  posterior_mean: number;
  last_updated: string;
}

export interface ItemPairStat {
  item_a: string;
  item_b: string;
  co_occurrences: number;
  total_a: number;
  total_b: number;
  total_orders: number;
  lift: number;
  smoothed_lift: number;
}

export interface CustomerAddonProfile {
  customer_id: string;
  phone: string;
  visits: number;
  last_visit: string;
  median_days_between_visits: number;
  avg_cart: number;
  usual_daypart: DayPart;
  veg_only_so_far: number; // Count of orders with no non-veg item
  item_counts: Record<string, number>;
  category_counts: Record<string, number>;
  addon_history: Record<OfferKey, {
    impressions: number;
    accepts: number;
    last_declined_at?: string;
  }>;
  category_addon_history: Record<string, {
    impressions: number;
    accepts: number;
  }>;
  deal_strength_accepts?: Record<string, { impressions: number; accepts: number }>;
}

export interface AddonEngineStatsSnapshot {
  l0: Record<string, AddonStatsLevel0>;
  l1: Record<string, AddonStatsLevel1>;
  itemPairs: ItemPairStat[];
  lastUpdated: string;
  version: string;
}

export interface AddonEngineConfig {
  PINNED_RULE_MODE: 'always' | 'prior_only';
  SOFT_TARGET_MULTIPLE: number; // default 1.8
  MAX_LEVEL: 'L0' | 'L1';
  HOLDOUT_RATE: number; // default 0.10
  EXPLORE_RATE: number; // default 0.05
  K_PRIOR: number; // default 15 (hierarchical shrinkage strength)
  K_CUSTOMER: number; // default 6 (personal shrinkage strength)
  DECLINE_COOLDOWN_DAYS: number; // default 14
  DECLINE_PENALTY_FACTOR: number; // default 0.4
  EXPOSURE_CAP_RATIO: number; // default 0.40 (max 40% in rolling 7 days)
}

export const DEFAULT_ADDON_CONFIG: AddonEngineConfig = {
  PINNED_RULE_MODE: 'always',
  SOFT_TARGET_MULTIPLE: 1.8,
  MAX_LEVEL: 'L1',
  HOLDOUT_RATE: 0.10,
  EXPLORE_RATE: 0.05,
  K_PRIOR: 15,
  K_CUSTOMER: 6,
  DECLINE_COOLDOWN_DAYS: 14,
  DECLINE_PENALTY_FACTOR: 0.4,
  EXPOSURE_CAP_RATIO: 0.40,
};
