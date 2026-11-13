import { OrderItem, Customer } from '../types';
import { isSteamedChickenLarge, isSteamedChickenMedium } from '../constants';
import { 
  OfferKey, 
  CartType, 
  ValueBand, 
  DayPart, 
  Weekday, 
  RoundingTier, 
  DecisionSource, 
  AddonImpression 
} from '../types/addonEngine';
import { SeededRNG, estimatePropensities } from './seededRandom';
import { 
  generateUUID, 
  enqueueAddonImpression, 
  getCachedStatsSnapshot, 
  getCustomerAddonProfile, 
  getAddonEngineConfig,
  getAllStoredImpressions
} from './addonStorageQueue';

export interface DynamicAddonOffer {
  id: string;
  offerKey: OfferKey;
  menuItemId?: string;
  name: string;
  price: number;
  cost: number;
  originalPrice: number;
  rupeeSavings: number;
  icon: string;
  tagline: string;
  badge: string;
  complementReason: string;
  cashierScript: string;
  targetTotal: number;
  recipe?: { materialId: string; quantity: number }[];
  isCustomerFavorite?: boolean;
  isHoldout?: boolean;
  impression?: AddonImpression;
}

export type ComplementaryType = 
  | 'flavor_contrast' 
  | 'texture_pairing' 
  | 'category_affinity' 
  | 'dip_pairing' 
  | 'cooling_balance';

export interface AddonTemplate {
  id: string;
  offerKey: OfferKey;
  name: string;
  price: number;
  cost: number;
  originalPrice: number;
  icon: string;
  tagline: string;
  category: 'chicken' | 'paneer' | 'veg' | 'kurkure' | 'beverage' | 'sides';
  isVegetarian: boolean;
  texture: 'crispy' | 'soft' | 'liquid' | 'creamy';
  flavor: 'cooling' | 'spicy' | 'savory';
  complementType: ComplementaryType;
  recipe?: { materialId: string; quantity: number }[];
}

// Master pool of creative add-ons across target price points.
// ZERO cheese momos and ZERO afghani momos (discontinued).
// Every single item strictly satisfies: price >= 1.4 * cost
export const ADDON_TEMPLATES: AddonTemplate[] = [
  // ─── ₹5 - ₹10 Tier (Ultra-low price point for micro cart values, dips & seasonings) ───
  {
    id: 'addon-peri-peri-masala',
    offerKey: 'peri_peri_masala',
    name: '🌶️ Zesty Peri Peri Masala Shaker',
    price: 10,
    cost: 2,
    originalPrice: 15,
    icon: '🌶️',
    tagline: 'Zesty spice mix blend to toss extra punch on your momos',
    category: 'sides',
    isVegetarian: true,
    texture: 'crispy',
    flavor: 'spicy',
    complementType: 'flavor_contrast',
    recipe: [{ materialId: 'spice-peri-peri', quantity: 0.05 }]
  },
  {
    id: 'addon-tandoori-mayo',
    offerKey: 'tandoori_mayo_dip',
    name: '🥫 Creamy Tandoori Mayonnaise',
    price: 10,
    cost: 3,
    originalPrice: 15,
    icon: '🥫',
    tagline: 'Signature rich and smoky tandoori mayo dip',
    category: 'sides',
    isVegetarian: true,
    texture: 'creamy',
    flavor: 'savory',
    complementType: 'dip_pairing',
    recipe: [{ materialId: 'pkt-mayo', quantity: 0.1 }]
  },

  // ─── ₹15 Tier (Cost ceiling: 15 / 1.4 = 10.7) ───
  {
    id: 'addon-2-steamed-chicken',
    offerKey: 'steamed_chicken_x2',
    name: '🥟 +2 Steamed Chicken Momos',
    price: 15,
    cost: 8,
    originalPrice: 25,
    icon: '🥟',
    tagline: '2 hot, juicy steamed chicken momos',
    category: 'chicken',
    isVegetarian: false,
    texture: 'soft',
    flavor: 'savory',
    complementType: 'category_affinity',
    recipe: [{ materialId: 'momo-chicken', quantity: 2 }]
  },
  {
    id: 'addon-2-steamed-veg',
    offerKey: 'steamed_veg_x2',
    name: '🥬 +2 Steamed Veg Momos',
    price: 15,
    cost: 6,
    originalPrice: 25,
    icon: '🥬',
    tagline: '2 steamed fresh garden vegetable momos',
    category: 'veg',
    isVegetarian: true,
    texture: 'soft',
    flavor: 'savory',
    complementType: 'category_affinity',
    recipe: [{ materialId: 'momo-veg', quantity: 2 }]
  },
  {
    id: 'addon-campa-cola-small',
    offerKey: 'campa_cola_200ml',
    name: '🥤 Chilled Campa Cola (200ml)',
    price: 15,
    cost: 8,
    originalPrice: 25,
    icon: '🥤',
    tagline: 'Ice cold fizzy soda to wash down warm momos',
    category: 'beverage',
    isVegetarian: true,
    texture: 'liquid',
    flavor: 'cooling',
    complementType: 'flavor_contrast',
    recipe: [{ materialId: 'campa-cola-small', quantity: 1 }]
  },
  {
    id: 'addon-tandoori-peri-pair',
    offerKey: 'tandoori_peri_pair',
    name: '🥫🌶️ Tandoori Mayo + Peri Peri Masala Pair',
    price: 15,
    cost: 5,
    originalPrice: 25,
    icon: '🥫',
    tagline: 'Smoky tandoori mayo plus spicy peri-peri seasoning duo',
    category: 'sides',
    isVegetarian: true,
    texture: 'creamy',
    flavor: 'spicy',
    complementType: 'dip_pairing',
    recipe: [
      { materialId: 'pkt-mayo', quantity: 0.1 },
      { materialId: 'spice-peri-peri', quantity: 0.05 }
    ]
  },

  // ─── ₹20 Tier (Cost ceiling: 20 / 1.4 = 14.2) ───
  {
    id: 'addon-2-steamed-paneer',
    offerKey: 'steamed_paneer_x2',
    name: '🧀 +2 Steamed Paneer Momos',
    price: 20,
    cost: 8,
    originalPrice: 30,
    icon: '🧀',
    tagline: '2 fresh soft cottage cheese steamed momos',
    category: 'paneer',
    isVegetarian: true,
    texture: 'soft',
    flavor: 'savory',
    complementType: 'category_affinity',
    recipe: [{ materialId: 'momo-paneer', quantity: 2 }]
  },
  {
    id: 'addon-2-fried-chicken',
    offerKey: 'fried_chicken_x2',
    name: '🍗 +2 Crispy Fried Chicken Momos',
    price: 20,
    cost: 10,
    originalPrice: 30,
    icon: '🍗',
    tagline: '2 golden crispy fried chicken momos',
    category: 'chicken',
    isVegetarian: false,
    texture: 'crispy',
    flavor: 'savory',
    complementType: 'texture_pairing',
    recipe: [{ materialId: 'momo-chicken', quantity: 2 }]
  },
  {
    id: 'addon-2-fried-veg',
    offerKey: 'fried_veg_x2',
    name: '🥬 +2 Crispy Fried Veg Momos',
    price: 20,
    cost: 7,
    originalPrice: 30,
    icon: '🥬',
    tagline: '2 crispy golden fried vegetable momos',
    category: 'veg',
    isVegetarian: true,
    texture: 'crispy',
    flavor: 'savory',
    complementType: 'texture_pairing',
    recipe: [{ materialId: 'momo-veg', quantity: 2 }]
  },
  {
    id: 'addon-campa-mayo-combo',
    offerKey: 'campa_mayo_combo',
    name: '🥤🥫 Campa Cola + Tandoori Mayo Dip',
    price: 20,
    cost: 10,
    originalPrice: 35,
    icon: '🥤',
    tagline: 'Chilled drink plus smoky tandoori mayo dip duo',
    category: 'beverage',
    isVegetarian: true,
    texture: 'liquid',
    flavor: 'cooling',
    complementType: 'flavor_contrast',
    recipe: [
      { materialId: 'campa-cola-small', quantity: 1 },
      { materialId: 'pkt-mayo', quantity: 0.1 }
    ]
  },

  // ─── ₹25 Tier (Cost ceiling: 25 / 1.4 = 17.8) ───
  {
    id: 'addon-mini-fries',
    offerKey: 'salted_fries_mini',
    name: '🍟 Mini Salted French Fries',
    price: 25,
    cost: 10,
    originalPrice: 40,
    icon: '🍟',
    tagline: 'Crispy golden salted fries portion',
    category: 'sides',
    isVegetarian: true,
    texture: 'crispy',
    flavor: 'savory',
    complementType: 'texture_pairing'
  },
  {
    id: 'addon-2-peri-peri-chicken',
    offerKey: 'peri_peri_chicken_x2',
    name: '🌶️ +2 Peri Peri Chicken Momos',
    price: 25,
    cost: 11,
    originalPrice: 40,
    icon: '🌶️',
    tagline: '2 spicy peri-peri dusted chicken momos',
    category: 'chicken',
    isVegetarian: false,
    texture: 'crispy',
    flavor: 'spicy',
    complementType: 'texture_pairing',
    recipe: [{ materialId: 'momo-tandoori', quantity: 2 }]
  },
  {
    id: 'addon-2-fried-paneer',
    offerKey: 'fried_paneer_x2',
    name: '🧀 +2 Crispy Fried Paneer Momos',
    price: 25,
    cost: 10,
    originalPrice: 40,
    icon: '🧀',
    tagline: '2 golden fried crunchy paneer momos',
    category: 'paneer',
    isVegetarian: true,
    texture: 'crispy',
    flavor: 'savory',
    complementType: 'texture_pairing',
    recipe: [{ materialId: 'momo-paneer', quantity: 2 }]
  },
  {
    id: 'addon-mint-mojito-mini',
    offerKey: 'mint_mojito_mini',
    name: '🍹 Chilled Mint Mojito (Mini Glass)',
    price: 25,
    cost: 9,
    originalPrice: 39,
    icon: '🍹',
    tagline: 'Icy cold refreshing mint lime cooler',
    category: 'beverage',
    isVegetarian: true,
    texture: 'liquid',
    flavor: 'cooling',
    complementType: 'flavor_contrast'
  },

  // ─── ₹30 Tier (Cost ceiling: 30 / 1.4 = 21.4) ───
  {
    id: 'addon-2-kurkure-chicken',
    offerKey: 'kurkure_chicken_x2',
    name: '🔥 +2 Crunchy Chicken Kurkure Momos',
    price: 30,
    cost: 11,
    originalPrice: 45,
    icon: '🔥',
    tagline: '2 ultra-crunchy crust chicken kurkure momos',
    category: 'kurkure',
    isVegetarian: false,
    texture: 'crispy',
    flavor: 'spicy',
    complementType: 'texture_pairing',
    recipe: [{ materialId: 'momo-kurkure', quantity: 2 }]
  },
  {
    id: 'addon-2-tandoori-chicken',
    offerKey: 'tandoori_chicken_x2',
    name: '🍢 +2 Smoky Tandoori Chicken Momos',
    price: 30,
    cost: 11,
    originalPrice: 45,
    icon: '🍢',
    tagline: '2 smoky tandoori spiced tossed chicken momos',
    category: 'chicken',
    isVegetarian: false,
    texture: 'crispy',
    flavor: 'spicy',
    complementType: 'texture_pairing',
    recipe: [{ materialId: 'momo-tandoori', quantity: 2 }]
  },
  {
    id: 'addon-peri-peri-fries',
    offerKey: 'peri_peri_fries',
    name: '🍟 Peri Peri Crispy Fries (Mini)',
    price: 30,
    cost: 11,
    originalPrice: 49,
    icon: '🍟',
    tagline: 'Crispy golden fries tossed in zesty peri-peri',
    category: 'sides',
    isVegetarian: true,
    texture: 'crispy',
    flavor: 'spicy',
    complementType: 'texture_pairing'
  },
  {
    id: 'addon-mojito-regular',
    offerKey: 'virgin_mint_mojito',
    name: '🍹 Virgin Mint Lime Mojito',
    price: 30,
    cost: 12,
    originalPrice: 49,
    icon: '🍹',
    tagline: 'Full glass crisp mint lemon soda cooler',
    category: 'beverage',
    isVegetarian: true,
    texture: 'liquid',
    flavor: 'cooling',
    complementType: 'flavor_contrast'
  },

  // ─── ₹35 Tier (Cost ceiling: 35 / 1.4 = 25.0) ───
  {
    id: 'addon-3-steamed-chicken',
    offerKey: 'steamed_chicken_x3',
    name: '🥟 +3 Steamed Chicken Momos',
    price: 35,
    cost: 12,
    originalPrice: 50,
    icon: '🥟',
    tagline: '3 juicy chicken steamed momos',
    category: 'chicken',
    isVegetarian: false,
    texture: 'soft',
    flavor: 'savory',
    complementType: 'category_affinity',
    recipe: [{ materialId: 'momo-chicken', quantity: 3 }]
  },
  {
    id: 'addon-chicken-popcorn-mini',
    offerKey: 'chicken_popcorn_mini',
    name: '🍗 Crispy Chicken Popcorn (Mini Cup)',
    price: 35,
    cost: 14,
    originalPrice: 55,
    icon: '🍗',
    tagline: 'Bite-sized spiced fried chicken poppers',
    category: 'sides',
    isVegetarian: false,
    texture: 'crispy',
    flavor: 'savory',
    complementType: 'texture_pairing'
  },
  {
    id: 'addon-3-steamed-paneer',
    offerKey: 'steamed_paneer_x3',
    name: '🧀 +3 Steamed Paneer Momos',
    price: 35,
    cost: 12,
    originalPrice: 50,
    icon: '🧀',
    tagline: '3 fresh tender cottage cheese momos',
    category: 'paneer',
    isVegetarian: true,
    texture: 'soft',
    flavor: 'savory',
    complementType: 'category_affinity',
    recipe: [{ materialId: 'momo-paneer', quantity: 3 }]
  },

  // ─── ₹40 Tier (Cost ceiling: 40 / 1.4 = 28.5) ───
  {
    id: 'addon-3-fried-chicken',
    offerKey: 'fried_chicken_x3',
    name: '🍗 +3 Crispy Fried Chicken Momos',
    price: 40,
    cost: 15,
    originalPrice: 60,
    icon: '🍗',
    tagline: '3 crunchy golden deep-fried chicken momos',
    category: 'chicken',
    isVegetarian: false,
    texture: 'crispy',
    flavor: 'savory',
    complementType: 'texture_pairing',
    recipe: [{ materialId: 'momo-chicken', quantity: 3 }]
  },
  {
    id: 'addon-fries-campa-combo',
    offerKey: 'fries_campa_combo',
    name: '🍟🥤 French Fries + Campa Cola Snack Combo',
    price: 40,
    cost: 16,
    originalPrice: 65,
    icon: '🍟',
    tagline: 'Hot fries plus chilled fizzy cola',
    category: 'sides',
    isVegetarian: true,
    texture: 'crispy',
    flavor: 'savory',
    complementType: 'texture_pairing'
  },
  {
    id: 'addon-3-kurkure-paneer',
    offerKey: 'kurkure_paneer_x2',
    name: '🔥 +3 Crunchy Paneer Kurkure Momos',
    price: 40,
    cost: 14,
    originalPrice: 65,
    icon: '🔥',
    tagline: '3 ultra-crisp coated cottage cheese momos',
    category: 'kurkure',
    isVegetarian: true,
    texture: 'crispy',
    flavor: 'spicy',
    complementType: 'texture_pairing',
    recipe: [{ materialId: 'momo-paneer', quantity: 3 }]
  },

  // ─── ₹50 Tier (Cost ceiling: 50 / 1.4 = 35.7) ───
  {
    id: 'addon-3-kurkure-mojito',
    offerKey: 'kurkure_mojito_combo',
    name: '🔥 +3 Kurkure Momos + Mint Mojito Combo',
    price: 50,
    cost: 23,
    originalPrice: 79,
    icon: '🔥',
    tagline: '3 crunchy kurkure momos with chilled mint cooler',
    category: 'kurkure',
    isVegetarian: false,
    texture: 'crispy',
    flavor: 'spicy',
    complementType: 'texture_pairing'
  },
  {
    id: 'addon-chicken-popcorn-mojito',
    offerKey: 'chicken_popcorn_mojito',
    name: '🍗🍹 Chicken Popcorn + Mint Mojito Combo',
    price: 50,
    cost: 24,
    originalPrice: 85,
    icon: '🍗',
    tagline: 'Crispy chicken popcorn cup paired with chilled virgin mojito',
    category: 'sides',
    isVegetarian: false,
    texture: 'crispy',
    flavor: 'savory',
    complementType: 'texture_pairing'
  },
  {
    id: 'addon-4-tandoori-combo',
    offerKey: 'tandoori_feast_combo',
    name: '🍢 +4 Tandoori Momos Feast',
    price: 50,
    cost: 22,
    originalPrice: 80,
    icon: '🍢',
    tagline: '4 smoky tandoori marinated tossed momos',
    category: 'chicken',
    isVegetarian: false,
    texture: 'crispy',
    flavor: 'spicy',
    complementType: 'texture_pairing'
  }
];

/**
 * Determine Cart Type from cart items
 */
export function determineCartType(cartItems: OrderItem[]): CartType {
  const names = cartItems.map(i => (i.name || '').toLowerCase()).join(' ');
  const hasDrink = names.includes('mojito') || names.includes('campa') || names.includes('water') || names.includes('cola') || names.includes('drink');
  const isMeal = names.includes('moburg') || names.includes('burger') || names.includes('combo') || names.includes('meal') || cartItems.length >= 4;

  if (hasDrink) return 'has_drink';
  if (isMeal) return 'meal';

  const hasSteamed = names.includes('steamed');
  const hasCrispy = names.includes('fried') || names.includes('kurkure') || names.includes('crispy') || names.includes('fries') || names.includes('popcorn');

  if (hasSteamed && !hasCrispy) return 'steamed_only';
  if (hasCrispy && !hasSteamed) return 'fried_crispy_only';
  return 'mixed';
}

/**
 * Determine Value Band
 */
export function determineValueBand(total: number): ValueBand {
  if (total < 100) return '<100';
  if (total < 200) return '100-199';
  return '200+';
}

/**
 * Determine Daypart from IST hour
 */
export function determineDayPart(date: Date = new Date()): DayPart {
  // IST is UTC + 5:30
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  const istHour = (utcHours + 5 + Math.floor((utcMinutes + 30) / 60)) % 24;

  if (istHour >= 11 && istHour < 16) return 'lunch';
  if (istHour >= 16 && istHour < 19) return 'tea_snack';
  if (istHour >= 19 && istHour < 24) return 'dinner';
  return 'late_night';
}

/**
 * Determine Weekday
 */
export function determineWeekday(date: Date = new Date()): Weekday {
  const days: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[date.getDay()];
}

/**
 * Helper to determine eligible target round-off prices:
 * 1. Under 20% of cart value (Rule 1). Minimum floor of 15 for low orders (<= 75).
 * 2. Rounds the customer's cart total to a whole multiple of preferably 50, or 10 (Rule 2).
 */
export function getEligibleTargetPrices(total: number): { price: number; is50Multiple: boolean }[] {
  if (total <= 0) return [{ price: 15, is50Multiple: false }];

  // Rule 1: strictly under 25% of cart value (minimum floor of 15 for low cart values <= 60)
  const maxPrice = total <= 60 ? 15 : Math.round(total * 0.25);
  const results: { price: number; is50Multiple: boolean }[] = [];

  // Check 50-multiple gap
  const next50 = Math.ceil(total / 50) * 50;
  const gap50 = next50 === total ? 50 : next50 - total;
  if (gap50 >= 10 && gap50 <= maxPrice) {
    results.push({ price: gap50, is50Multiple: true });
  }

  // Check 10-multiple gaps
  const next10 = Math.ceil(total / 10) * 10;
  const baseGap10 = next10 === total ? 10 : next10 - total;
  for (let p = baseGap10; p <= maxPrice; p += 10) {
    if (p >= 10 && p !== gap50) {
      results.push({ price: p, is50Multiple: (total + p) % 50 === 0 });
    }
  }

  // Include standard template tiers that are <= maxPrice
  const standardTiers = [15, 20, 25, 30, 35, 40, 50].filter(p => p <= maxPrice);
  for (const tier of standardTiers) {
    if (!results.some(r => r.price === tier)) {
      results.push({ price: tier, is50Multiple: (total + tier) % 50 === 0 });
    }
  }

  if (results.length === 0) {
    results.push({ price: Math.min(15, maxPrice), is50Multiple: (total + 15) % 50 === 0 });
  }

  return results;
}

/**
 * State-of-the-Art Statistical Learning Recommendation Engine
 * - Deterministic Layer enforces 20% cap, >= 1.4x cost margin, veg safety, and cart exclusions.
 * - Thompson Sampling Layer selects optimal offer balancing profit, complementarity, customer memory, and exploration.
 * - Fire-and-forget background logging writes impression with client-side UUID.
 */
export function generateDynamicAddonOffer(
  cartItems: OrderItem[],
  cartTotal: number,
  customer: Customer | null,
  customerPastItemNames: string[] = [],
  shouldLogImpression: boolean = true
): DynamicAddonOffer {
  const roundedTotal = Math.max(0, Math.round(cartTotal));
  const impressionId = generateUUID();
  const now = new Date();
  const config = getAddonEngineConfig();

  // Context attributes
  const cartType = determineCartType(cartItems);
  const valueBand = determineValueBand(roundedTotal);
  const daypart = determineDayPart(now);
  const weekday = determineWeekday(now);

  // 1. DETERMINISTIC LAYER: HARD CONSTRAINTS
  // Rule 1: The add-on price MUST NOT exceed the 25% threshold of cart value!
  // And proximity to 25% is TOP PRIORITY.
  const priceCapRatio = config.PRICE_CAP_RATIO || 0.25;
  const target25Price = roundedTotal * priceCapRatio;
  // Floor to whole rupees, ensuring add-on price strictly <= 25% of cart total
  const maxAllowedPrice = Math.max(10, Math.floor(target25Price));

  // Analyze Cart Composition
  const cartNames = cartItems.map(i => (i.name || '').toLowerCase()).join(' ');
  const hasChicken = cartNames.includes('chicken');
  const hasPaneer = cartNames.includes('paneer');
  const hasVeg = cartNames.includes('veg');
  const hasSpicy = cartNames.includes('peri peri') || cartNames.includes('tandoori') || cartNames.includes('spicy');
  const hasSteamed = cartNames.includes('steamed');
  const hasCrispy = cartNames.includes('kurkure') || cartNames.includes('fried') || cartNames.includes('fries') || cartNames.includes('popcorn');
  const hasDrink = cartNames.includes('mojito') || cartNames.includes('campa') || cartNames.includes('water') || cartNames.includes('cola') || cartNames.includes('drink');
  const hasDip = cartNames.includes('mayo') || cartNames.includes('dip');

  // Strict Vegetarian Safety
  const isStrictlyVegetarian = !hasChicken && (hasVeg || hasPaneer || cartNames.includes('corn'));

  // HARD BAN: Red chutney must NEVER be recommended under any circumstances
  const isRedChutneyExcluded = (template: AddonTemplate): boolean => {
    const text = `${template.name} ${template.tagline} ${template.offerKey}`.toLowerCase();
    return text.includes('chutney') || text.includes('red-chutney') || text.includes('red chutney');
  };

  // Items already in the cart are excluded!
  const isExcludedByCart = (template: AddonTemplate): boolean => {
    const tName = template.name.toLowerCase();
    return cartItems.some(item => {
      const cName = (item.name || '').toLowerCase();
      // If customer already ordered French Fries, don't recommend French Fries
      if (cName.includes('fries') && tName.includes('fries')) return true;
      // If customer already ordered Mojito, don't recommend single Mojito
      if (cName.includes('mojito') && tName.includes('mojito') && !tName.includes('combo')) return true;
      // If customer already ordered Dip, don't recommend Dip Pair
      if (cName.includes('dip') && tName.includes('dip')) return true;
      return false;
    });
  };

  // 2. PINNED RULES EVALUATION
  // Filter non-discount, base order lines
  const nonDiscountItems = cartItems.filter(
    item => !item.id.startsWith('promo-discount-') && 
            !item.id.startsWith('custom-discount-') && 
            item.id !== 'welcome-discount' && 
            item.id !== 'loyalty-discount' && 
            !item.parentItemId
  );

  const isSingleLineItem = nonDiscountItems.length === 1 && nonDiscountItems[0].quantity === 1;
  const singleItem = nonDiscountItems[0];

  // 2a. PINNED RULE 1: Steamed Chicken Momo Large Single Item Order -> Add 2 Momos for ₹15
  const isSingleLargeSteamedChicken = isSingleLineItem && isSteamedChickenLarge(singleItem);

  if (isSingleLargeSteamedChicken && config.PINNED_RULE_MODE === 'always') {
    const originalPrice = 25;
    const price = 15;
    const savings = originalPrice - price;
    const target = roundedTotal + price;

    const pinnedImpression: AddonImpression = {
      impression_id: impressionId,
      created_at: now.toISOString(),
      customer_id: customer?.id || null,
      customer_phone: customer?.phone || null,
      cart_total: roundedTotal,
      cart_type: cartType,
      value_band: valueBand,
      daypart,
      weekday,
      offer_key: 'steamed_chicken_x2',
      offer_price: price,
      offer_cost: 8,
      margin_multiple: Number((price / 8).toFixed(2)),
      reference_price: originalPrice,
      deal_strength: Number(((originalPrice - price) / originalPrice).toFixed(3)),
      rounding_tier: 'pinned',
      source: 'pinned',
      policy_version: 'v1.0-pinned-rule',
      propensity: 1.0,
      outcome: 'pending'
    };

    if (shouldLogImpression) {
      enqueueAddonImpression(pinnedImpression);
    }

    return {
      id: 'addon-2-steamed-momos',
      offerKey: 'steamed_chicken_x2',
      menuItemId: 'addon-2-steamed-momos',
      name: '🥟 +2 Steamed Momos (Add-on Offer)',
      price,
      cost: 8,
      originalPrice,
      rupeeSavings: savings,
      icon: '🥟',
      tagline: 'Special add-on price for Steamed Chicken Large',
      badge: `🔥 Save ₹${savings} Instantly`,
      complementReason: 'Steamed Chicken Large Pair',
      cashierScript: `Would you like to add 2 more steamed momos for just ₹15 — you save ₹${savings} instantly!`,
      targetTotal: target,
      recipe: [{ materialId: 'momo-chicken', quantity: 2 }],
      impression: pinnedImpression
    };
  }

  // 2b. PINNED RULE 2: Steamed Chicken Momo Medium Single Item Order worth ₹69 -> Fries at ₹31
  // "for single item steamed chicken medium orders worth 69, offer as add on fries at 31 rupees."
  const isSingleMediumSteamedChicken = isSingleLineItem && (
    isSteamedChickenMedium(singleItem) || 
    (roundedTotal === 69 && (singleItem.name || '').toLowerCase().includes('chicken'))
  );

  if (isSingleMediumSteamedChicken && config.PINNED_RULE_MODE === 'always') {
    const originalPrice = 40;
    const price = 31;
    const savings = originalPrice - price;
    const target = roundedTotal + price; // 69 + 31 = 100!

    const pinnedImpression: AddonImpression = {
      impression_id: impressionId,
      created_at: now.toISOString(),
      customer_id: customer?.id || null,
      customer_phone: customer?.phone || null,
      cart_total: roundedTotal,
      cart_type: cartType,
      value_band: valueBand,
      daypart,
      weekday,
      offer_key: 'salted_fries_31',
      offer_price: price,
      offer_cost: 10,
      margin_multiple: Number((price / 10).toFixed(2)),
      reference_price: originalPrice,
      deal_strength: Number(((originalPrice - price) / originalPrice).toFixed(3)),
      rounding_tier: '50',
      source: 'pinned',
      policy_version: 'v1.0-pinned-rule',
      propensity: 1.0,
      outcome: 'pending'
    };

    if (shouldLogImpression) {
      enqueueAddonImpression(pinnedImpression);
    }

    return {
      id: 'addon-fries-31',
      offerKey: 'salted_fries_31',
      menuItemId: 'add-fries',
      name: '🍟 Fresh Crispy French Fries (Special Offer)',
      price,
      cost: 10,
      originalPrice,
      rupeeSavings: savings,
      icon: '🍟',
      tagline: 'Crispy golden hot salted fries to round off your bill to ₹100',
      badge: `🔥 Save ₹${savings} Instantly · Round off to ₹100`,
      complementReason: 'Steamed Chicken Medium Pair',
      cashierScript: `Would you like to add crispy French Fries to your order for just ₹31 — rounds off your bill to a neat ₹100!`,
      targetTotal: target,
      recipe: [{ materialId: 'pkt-fries', quantity: 0.25 }],
      impression: pinnedImpression
    };
  }

  // 2c. PINNED RULE 3: Single Item with Cart Value ₹49 -> 5 pc Chicken Popcorn for ₹26
  // "for single items with cat value 49, offer 5 pc chicken popcorn for 26"
  const isSingleItem49 = isSingleLineItem && (
    roundedTotal === 49 || Math.round(singleItem.price) === 49
  );

  if (isSingleItem49 && config.PINNED_RULE_MODE === 'always') {
    const isVegCart = isStrictlyVegetarian;
    const originalPrice = 45;
    const price = 26;
    const savings = originalPrice - price;
    const target = roundedTotal + price; // 49 + 26 = 75!

    const offerKey = isVegCart ? 'salted_fries_mini' : 'chicken_popcorn_5pc_26';
    const offerName = isVegCart ? '🍟 Crispy French Fries (Add-on Offer)' : '🍗 5 pc Crispy Chicken Popcorn';
    const offerIcon = isVegCart ? '🍟' : '🍗';
    const offerTagline = isVegCart 
      ? 'Crispy golden salted fries portion to round off your bill to ₹75' 
      : '5 tender seasoned crispy chicken popcorn bites';
    const offerCost = isVegCart ? 10 : 12;

    const pinnedImpression: AddonImpression = {
      impression_id: impressionId,
      created_at: now.toISOString(),
      customer_id: customer?.id || null,
      customer_phone: customer?.phone || null,
      cart_total: roundedTotal,
      cart_type: cartType,
      value_band: valueBand,
      daypart,
      weekday,
      offer_key: offerKey,
      offer_price: price,
      offer_cost: offerCost,
      margin_multiple: Number((price / offerCost).toFixed(2)),
      reference_price: originalPrice,
      deal_strength: Number(((originalPrice - price) / originalPrice).toFixed(3)),
      rounding_tier: 'none',
      source: 'pinned',
      policy_version: 'v1.0-pinned-rule',
      propensity: 1.0,
      outcome: 'pending'
    };

    if (shouldLogImpression) {
      enqueueAddonImpression(pinnedImpression);
    }

    return {
      id: isVegCart ? 'addon-fries-26' : 'addon-popcorn-5pc-26',
      offerKey,
      menuItemId: isVegCart ? 'add-fries' : 'add-popcorn',
      name: offerName,
      price,
      cost: offerCost,
      originalPrice,
      rupeeSavings: savings,
      icon: offerIcon,
      tagline: offerTagline,
      badge: `🔥 Save ₹${savings} Instantly`,
      complementReason: 'Special Single Item Pairing Offer',
      cashierScript: isVegCart
        ? `Would you like to add crispy fries to your order for just ₹26 — you save ₹${savings} instantly!`
        : `Would you like to add 5 pc crispy chicken popcorn for just ₹26 — you save ₹${savings} instantly!`,
      targetTotal: target,
      recipe: isVegCart 
        ? [{ materialId: 'pkt-fries', quantity: 0.25 }]
        : [{ materialId: 'pkt-popcorn', quantity: 0.2 }],
      impression: pinnedImpression
    };
  }

  // 3. HOLDOUT GROUP EVALUATION (10% of eligible orders see only fixed section)
  const holdoutRng = new SeededRNG(impressionId + '-holdout');
  if (holdoutRng.next() < config.HOLDOUT_RATE) {
    const holdoutImpression: AddonImpression = {
      impression_id: impressionId,
      created_at: now.toISOString(),
      customer_id: customer?.id || null,
      customer_phone: customer?.phone || null,
      cart_total: roundedTotal,
      cart_type: cartType,
      value_band: valueBand,
      daypart,
      weekday,
      offer_key: 'holdout_control',
      offer_price: 0,
      offer_cost: 0,
      margin_multiple: 0,
      reference_price: 0,
      deal_strength: 0,
      rounding_tier: 'none',
      source: 'holdout',
      policy_version: 'v1.0-holdout',
      propensity: config.HOLDOUT_RATE,
      outcome: 'not_shown_holdout'
    };

    if (shouldLogImpression) {
      enqueueAddonImpression(holdoutImpression);
    }

    return {
      id: 'holdout-control',
      offerKey: 'holdout_control',
      name: 'Holdout Control',
      price: 0,
      cost: 0,
      originalPrice: 0,
      rupeeSavings: 0,
      icon: '',
      tagline: '',
      badge: '',
      complementReason: '',
      cashierScript: '',
      targetTotal: roundedTotal,
      isHoldout: true,
      impression: holdoutImpression
    };
  }

  // 4. CONSTRAINT SOLVER: Produce Valid Candidates
  // Rules Enforced:
  // - ZERO Red Chutney under all circumstances
  // - Strict 20% cap: price <= maxAllowedPrice (must not exceed 20% threshold)
  // - Margin floor: price >= 1.4 * cost
  // - Strict Vegetarian safety
  // - Exclude items already in cart
  let validCandidates = ADDON_TEMPLATES.filter(t => {
    // Invariant 0: Red chutney is NEVER allowed
    if (isRedChutneyExcluded(t)) return false;
    // Invariant 1: price <= maxAllowedPrice (Strictly under/at 20% threshold)
    if (t.price > maxAllowedPrice) return false;
    // Invariant 2: price >= 1.4 * cost
    if (t.price < 1.4 * t.cost - 0.01) return false;
    // Invariant 3: Vegetarian safety
    if (isStrictlyVegetarian && !t.isVegetarian) return false;
    // Invariant 4: No item already in cart
    if (isExcludedByCart(t)) return false;
    return true;
  });

  // Emergency Safety Fallbacks if no template qualified:
  if (validCandidates.length === 0) {
    validCandidates = ADDON_TEMPLATES.filter(t => {
      if (isRedChutneyExcluded(t)) return false;
      if (t.price > maxAllowedPrice) return false;
      if (isStrictlyVegetarian && !t.isVegetarian) return false;
      return true;
    });
  }
  if (validCandidates.length === 0) {
    validCandidates = ADDON_TEMPLATES.filter(t => 
      !isRedChutneyExcluded(t) && 
      t.price <= maxAllowedPrice && 
      (!isStrictlyVegetarian || t.isVegetarian)
    );
  }
  if (validCandidates.length === 0) {
    // Lowest price available that respects veg safety and excludes red chutney
    const safeSorted = ADDON_TEMPLATES.filter(t => 
      !isRedChutneyExcluded(t) && (!isStrictlyVegetarian || t.isVegetarian)
    ).sort((a, b) => a.price - b.price);
    if (safeSorted.length > 0) {
      validCandidates = [safeSorted[0]];
    }
  }

  // TOP PRIORITY: Proximity to 25% of Cart Value!
  // Filter candidate pool to the highest price tier available <= 25% cap.
  const maxFeasiblePrice = Math.max(...validCandidates.map(c => c.price));
  const topProximityCandidates = validCandidates.filter(c => c.price >= maxFeasiblePrice - 5);
  if (topProximityCandidates.length > 0) {
    validCandidates = topProximityCandidates;
  }

  // Cap at top 8 candidates for Thompson scoring
  if (validCandidates.length > 8) {
    validCandidates = validCandidates.slice(0, 8);
  }

  // 5. STATISTICAL & THOMPSON SAMPLING LAYER
  const statsSnapshot = getCachedStatsSnapshot();
  const customerProfile = getCustomerAddonProfile(customer?.phone || customer?.id);
  const pastImpressions = getAllStoredImpressions();

  // Exposure Cap Calculation: Rolling 7-day share per offer_key
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentImpressions = pastImpressions.filter(
    i => new Date(i.created_at) >= sevenDaysAgo && i.outcome !== 'not_shown_holdout'
  );
  const exposureCounts: Record<string, number> = {};
  recentImpressions.forEach(i => {
    exposureCounts[i.offer_key] = (exposureCounts[i.offer_key] || 0) + 1;
  });
  const totalRecent = recentImpressions.length || 1;

  // Pure Exploration Check (5% of impressions)
  const exploreRng = new SeededRNG(impressionId + '-explore');
  const isExplore = exploreRng.next() < config.EXPLORE_RATE;

  interface EvaluatedArm {
    template: AddonTemplate;
    alpha: number;
    beta: number;
    pSample: number;
    grossProfit: number;
    marginMultiple: number;
    softMarginPenalty: number;
    cooldownFactor: number;
    exposureFactor: number;
    score: number;
    source: DecisionSource;
  }

  const evaluatedArms: EvaluatedArm[] = validCandidates.map(candidate => {
    const key = candidate.offerKey;
    const l0Stats = statsSnapshot?.l0[key];
    const l1Key = `${key}:::${cartType}:::${valueBand}`;
    const l1Stats = statsSnapshot?.l1[l1Key];

    let alpha = 2.44;
    let beta = 12.56;
    let source: DecisionSource = 'rule_fallback';

    // A. Check Customer Memory (Known Customer with >= 3 visits)
    const isKnownCustomer = (customerProfile?.visits || 0) >= 3;
    const custAddonHist = customerProfile?.addon_history[key];

    if (isKnownCustomer && custAddonHist && custAddonHist.impressions > 0) {
      // Personal estimate: Shrunk towards p_L1 with k_c = 6
      const pParentL1 = l1Stats && l1Stats.decayed_impressions >= 10 ? l1Stats.posterior_mean : (l0Stats?.posterior_mean || 0.1625);
      
      // Affinity lift
      const custItemShare = (customerProfile.category_counts[candidate.category] || 0) / Math.max(1, customerProfile.visits);
      const rawRatio = Math.max(0.5, Math.min(3.0, custItemShare > 0 ? custItemShare / 0.35 : 1.0));
      const nVisits = customerProfile.visits;
      const liftC = 1 + (rawRatio - 1) * (nVisits / (nVisits + 5));

      const pCustParent = Math.max(0.05, Math.min(0.60, pParentL1 * liftC));
      const kC = config.K_CUSTOMER; // 6
      alpha = kC * pCustParent + custAddonHist.accepts;
      beta = kC * (1 - pCustParent) + (custAddonHist.impressions - custAddonHist.accepts);
      source = 'history';
    } else if (l1Stats && l1Stats.decayed_impressions >= 10 && config.MAX_LEVEL === 'L1') {
      // Level 1 Qualifies (>= 10 decayed impressions)
      alpha = l1Stats.alpha;
      beta = l1Stats.beta;
      source = 'thompson_l1';
    } else if (l0Stats && l0Stats.decayed_impressions >= 10) {
      // Level 0 Qualifies (>= 10 decayed impressions)
      alpha = l0Stats.alpha;
      beta = l0Stats.beta;
      source = 'thompson_l0';
    } else {
      // Fallback to Rule-based prior mean mapped into [0.08, 0.30] scaled by Basket Lift
      let ruleScore = 50;
      if (hasSpicy && candidate.flavor === 'cooling' && !hasDrink) ruleScore += 25;
      if (hasSteamed && candidate.texture === 'crispy') ruleScore += 25;
      if (hasCrispy && candidate.texture === 'creamy' && !hasDip) ruleScore += 20;
      if (hasChicken && candidate.category === 'chicken') ruleScore += 20;
      if (customerPastItemNames.some(p => p.toLowerCase().includes(candidate.category))) ruleScore += 15;
      // Direct preference: Tandoori mayo and peri peri masala are favored pairing recommendations
      if (
        candidate.offerKey === 'tandoori_mayo_dip' || 
        candidate.offerKey === 'peri_peri_masala' || 
        candidate.offerKey === 'tandoori_peri_pair' ||
        candidate.offerKey === 'campa_mayo_combo'
      ) {
        ruleScore += 35;
      }

      // Check basket pair lift from snapshot
      const matchingLift = statsSnapshot?.itemPairs?.find(
        p => (cartNames.includes(p.item_a) && candidate.name.toLowerCase().includes(p.item_b)) ||
             (cartNames.includes(p.item_b) && candidate.name.toLowerCase().includes(p.item_a))
      );
      const smoothedLift = matchingLift ? matchingLift.smoothed_lift : 1.0;
      const liftScale = Math.max(0.5, Math.min(2.0, smoothedLift));

      const normalized = Math.max(0, Math.min(1, (ruleScore - 20) / 80));
      const basePrior = 0.08 + normalized * (0.30 - 0.08);
      const pPrior = Math.max(0.05, Math.min(0.50, basePrior * liftScale));

      alpha = config.K_PRIOR * pPrior;
      beta = config.K_PRIOR * (1 - pPrior);
      source = 'complement';
    }

    // Draw Thompson Sample with seeded RNG
    const armRng = new SeededRNG(`${impressionId}-${candidate.offerKey}`);
    const pSample = armRng.nextBeta(alpha, beta);

    const grossProfit = candidate.price - candidate.cost;
    const marginMultiple = candidate.price / Math.max(1, candidate.cost);

    // Soft target margin penalty (config.SOFT_TARGET_MULTIPLE, default 1.8)
    let softMarginPenalty = 1.0;
    if (marginMultiple < config.SOFT_TARGET_MULTIPLE) {
      softMarginPenalty = Math.max(0.70, marginMultiple / config.SOFT_TARGET_MULTIPLE);
    }

    // Decline Cooldown Guardrail: if declined in last 2 visits, multiply score by 0.4 for 14 days
    let cooldownFactor = 1.0;
    if (custAddonHist?.last_declined_at) {
      const declineAgeDays = (now.getTime() - new Date(custAddonHist.last_declined_at).getTime()) / (1000 * 60 * 60 * 24);
      if (declineAgeDays <= config.DECLINE_COOLDOWN_DAYS) {
        cooldownFactor = config.DECLINE_PENALTY_FACTOR; // 0.4
      }
    }

    // Exposure Cap Guardrail: no single offer_key above 40% in rolling 7 days
    let exposureFactor = 1.0;
    const recentCount = exposureCounts[key] || 0;
    const recentShare = recentCount / totalRecent;
    if (totalRecent >= 20 && recentShare > config.EXPOSURE_CAP_RATIO) {
      exposureFactor = 0.20; // Throttled to enforce 40% ceiling
    }

    // Rounding Tier Bonus (Rule 2: Whole multiple of 50 or 10)
    const targetSum = roundedTotal + candidate.price;
    let roundBonus = 1.0;
    if (targetSum % 50 === 0) roundBonus = 1.25;
    else if (targetSum % 10 === 0) roundBonus = 1.12;

    // Top Priority: Proximity to 25% cart value
    const proximityRatio = Math.min(1.0, candidate.price / Math.max(1, target25Price));
    const proximityBonus = Math.pow(proximityRatio, 3);

    const score = pSample * grossProfit * softMarginPenalty * cooldownFactor * exposureFactor * roundBonus * proximityBonus;

    return {
      template: candidate,
      alpha,
      beta,
      pSample,
      grossProfit,
      marginMultiple,
      softMarginPenalty,
      cooldownFactor,
      exposureFactor,
      score,
      source
    };
  });

  // 6. SELECTION: Thompson Sampling Winner or Pure Exploration
  let chosenArm: EvaluatedArm;
  let finalSource: DecisionSource;

  if (isExplore && evaluatedArms.length > 1) {
    const pickIdx = Math.floor(exploreRng.next() * evaluatedArms.length);
    chosenArm = evaluatedArms[pickIdx];
    finalSource = 'explore';
  } else {
    // Sort descending by expected incremental gross profit score
    evaluatedArms.sort((a, b) => b.score - a.score);
    chosenArm = evaluatedArms[0];
    finalSource = chosenArm.source;
  }

  // 7. COMPUTE SELECTION PROPENSITY (Monte-Carlo with 200 draws)
  const mcCandidates = evaluatedArms.map(a => ({
    id: a.template.offerKey,
    alpha: a.alpha,
    beta: a.beta,
    profit: a.grossProfit,
    multiplier: a.softMarginPenalty * a.cooldownFactor * a.exposureFactor
  }));
  const propensities = estimatePropensities(mcCandidates, impressionId, 200);
  const propensity = propensities[chosenArm.template.offerKey] || 0.25;

  const chosen = chosenArm.template;
  const rupeeSavings = chosen.originalPrice - chosen.price;
  const targetTotal = roundedTotal + chosen.price;
  const roundingTier: RoundingTier = targetTotal % 50 === 0 ? '50' : targetTotal % 10 === 0 ? '10' : 'none';

  // 8. LOG IMPRESSION FIRE-AND-FORGET
  const impression: AddonImpression = {
    impression_id: impressionId,
    created_at: now.toISOString(),
    customer_id: customer?.id || null,
    customer_phone: customer?.phone || null,
    cart_total: roundedTotal,
    cart_type: cartType,
    value_band: valueBand,
    daypart,
    weekday,
    offer_key: chosen.offerKey,
    offer_price: chosen.price,
    offer_cost: chosen.cost,
    margin_multiple: Number(chosenArm.marginMultiple.toFixed(2)),
    reference_price: chosen.originalPrice,
    deal_strength: Number((rupeeSavings / chosen.originalPrice).toFixed(3)),
    rounding_tier: roundingTier,
    source: finalSource,
    policy_version: 'v1.0-hierarchical-thompson',
    propensity: Number(propensity.toFixed(4)),
    outcome: 'pending',
    shown_ms: now.getTime()
  };

  if (shouldLogImpression) {
    enqueueAddonImpression(impression);
  }

  // 9. BUILD IMPACTFUL CASHIER SCRIPT & DISPLAY DETAILS
  const customerName = customer?.name ? customer.name.split(' ')[0] : '';
  const greeting = customerName ? `${customerName}, ` : '';
  const cleanItemName = chosen.name.replace(/^[^\w]+/, '').trim();

  let cashierScript = '';
  if (chosenArm.source === 'history') {
    cashierScript = `"${greeting}Since you love our ${chosen.category}, round off your bill to ₹${targetTotal} with ${cleanItemName} — you save ₹${rupeeSavings} instantly!"`;
  } else if (roundingTier === '50') {
    cashierScript = `"${greeting}Round off your bill to a neat ₹${targetTotal} with ${cleanItemName} — you save ₹${rupeeSavings} instantly!"`;
  } else {
    cashierScript = `"${greeting}Would you like to add ${cleanItemName} to complete your order — you save ₹${rupeeSavings} instantly!"`;
  }

  const badge = `🔥 Save ₹${rupeeSavings} Instantly`;

  return {
    id: chosen.id,
    offerKey: chosen.offerKey,
    menuItemId: chosen.id,
    name: chosen.name,
    price: chosen.price,
    cost: chosen.cost,
    originalPrice: chosen.originalPrice,
    rupeeSavings,
    icon: chosen.icon,
    tagline: chosen.tagline,
    badge,
    complementReason: chosenArm.source === 'history' ? 'Based on your favorites' : chosenArm.source === 'explore' ? 'Chef special surprise pairing' : 'Special pairing offer',
    cashierScript,
    targetTotal,
    recipe: chosen.recipe,
    isCustomerFavorite: chosenArm.source === 'history',
    isHoldout: false,
    impression
  };
}
