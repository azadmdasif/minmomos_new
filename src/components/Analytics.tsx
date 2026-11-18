
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getOrdersForDateRange, getOrderByBillNumber, getOrdersByItemName, getOrdersByCouponCode, extractCouponCodeFromOrder, getMatchingMenuItems, deleteOrderByBillNumber, getDeletedOrdersForDateRange, getStations, fetchCustomers, fetchCustomerHistory, getCustomerByPhone, updateCustomer, fetchUsualOrder, getTierInfo, calculateTotalMinCoins, getISTDate, getISTDateString, getISTFullDateTime, getISTHour, getISTDay, fetchManualAdjustments, fetchCustomerClassificationStats, fetchCohortRawData, CohortOrder, normalizePhone, syncCustomerStats, updateOrderStatus, isStudentFreeMojitoOrder, isStudentCustomer, isOrderFromStudent, invalidateOrdersRangeCache, invalidateCustomersCache, invalidateCohortCache, invalidateClassificationCache } from '../utils/storage';
import {
  generateItemNormalizationMap,
  getFilteredOrders,
  generateOrdersCsv,
  generateOrderItemsCsv,
  generateOffersCsv,
  generateCustomersRawCsv,
  buildCustomerFeatures,
  generateFeaturesCsv,
  ItemNormalization
} from '../utils/mlExportHelper';
import { getMarketingCoupons } from '../utils/marketingStorage';
import { CompletedOrder, PaymentMethod, Station, User, Customer, DeliveryBrandFilter } from '../types';
import { MENU_ITEMS, getDeliveryBrandLabel } from '../constants';
import PrintReceipt from './PrintReceipt';
import DeleteBillModal from './DeleteBillModal';
import ItemSalesReport from './ItemSalesReport';
import PerformanceChart from './PerformanceChart';
import RevenueBreakdownChart from './RevenueBreakdownChart';
import OrderModeChart from './OrderModeChart';
import TimeWiseRevenueChart from './TimeWiseRevenueChart';
import OrderValueHistogram from './OrderValueHistogram';
import CustomerInsights from './CustomerInsights';
import CohortRetentionChart from './CohortRetentionChart';
import CohortCompositionChart from './CohortCompositionChart';
import { CustomerHistogram } from './CustomerHistogram';
import { MauTrackingView } from './MauTrackingView';
import { OrderIntervalChart } from './OrderIntervalChart';
import { StudentIntelligenceModal } from './StudentIntelligenceModal';
import { Search, User as UserIcon, MapPin, Receipt, History, X, Send, MessageSquare, Edit3, Save, Calendar, Mail, FileText, Star, Users, TrendingUp as TrendingUpIcon, Gift, DollarSign, ShoppingBag, Download, RefreshCw, GraduationCap, Copy, Printer, Zap } from 'lucide-react';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

const getTodaysDateString = () => {
  return getISTDateString();
};

const getDateString = (date: Date) => {
  return getISTDateString(date);
};

const getHistoricalStartDate = (dateStr: string, daysToSubtract: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - daysToSubtract);
  return getDateString(d);
};

const colorStops = [
  { p: 0.0, r: 79, g: 70, b: 229 },   // Indigo
  { p: 0.1, r: 37, g: 99, b: 235 },   // Blue
  { p: 0.2, r: 2, g: 132, b: 199 },    // Sky
  { p: 0.3, r: 8, g: 145, b: 178 },    // Cyan
  { p: 0.4, r: 13, g: 148, b: 136 },   // Teal
  { p: 0.5, r: 22, g: 163, b: 74 },    // Green
  { p: 0.6, r: 101, g: 163, b: 13 },   // Lime
  { p: 0.7, r: 202, g: 138, b: 4 },    // Yellow
  { p: 0.8, r: 234, g: 88, b: 12 },    // Orange
  { p: 0.9, r: 220, g: 38, b: 38 },    // Red
  { p: 1.0, r: 153, g: 27, b: 27 }     // Deep Red
];

export function classifyOrderItemCategory(item: { name?: string; menuItemId?: string; is_addon_offer?: boolean; price?: number }): string {
  if (item.is_addon_offer) return 'addon';
  const name = (item.name || '').toLowerCase();
  const mId = (item.menuItemId || '').toLowerCase();

  if (
    mId.startsWith('addon-') ||
    mId === 'add-fries' ||
    mId === 'add-mojito' ||
    mId === 'add-popcorn' ||
    name.includes('(add-on offer)') ||
    name.includes('add-on') ||
    name.includes('+2 ') ||
    name.includes('+3 ') ||
    name.includes('special offer') ||
    name.startsWith('add ')
  ) {
    return 'addon';
  }

  // Pure discount lines
  if ((item.price ?? 0) < 0 || name.includes('discount') || name.includes('loyalty') || name.includes('coupon') || name.includes('welcome offer')) {
    return 'discount';
  }

  // Match against known catalog menu items
  if (mId) {
    const found = MENU_ITEMS.find(m => m.id.toLowerCase() === mId);
    if (found?.category) {
      if (found.category === 'momo') return 'momo';
      if (found.category === 'moburg') return 'moburg';
      if (found.category === 'side') return 'side';
      if (found.category === 'drink') return 'drink';
      if (found.category === 'combo' || found.category === 'summit-meals') return 'combo';
    }
  }

  // Name keyword heuristics
  if (name.includes('momo') || name.includes('platter')) return 'momo';
  if (name.includes('moburg') || name.includes('burger') || name.includes('zinger')) return 'moburg';
  if (
    name.includes('mojito') ||
    name.includes('campa') ||
    name.includes('cola') ||
    name.includes('sprite') ||
    name.includes('coke') ||
    name.includes('water') ||
    name.includes('soda') ||
    name.includes('drink') ||
    name.includes('beverage')
  ) {
    return 'drink';
  }
  if (
    name.includes('fries') ||
    name.includes('popcorn') ||
    name.includes('strips') ||
    name.includes('wings') ||
    name.includes('dip') ||
    name.includes('mayo') ||
    name.includes('sauce') ||
    name.includes('seasoning')
  ) {
    return 'side';
  }
  if (name.includes('combo') || name.includes('meal')) return 'combo';

  return 'other';
}

export function isPackagedDrinkItem(item: { name?: string; menuItemId?: string }): boolean {
  const name = (item.name || '').toLowerCase();
  const mId = (item.menuItemId || '').toLowerCase();

  // Fresh / handcrafted items are non-packaged
  if (
    name.includes('mojito') ||
    name.includes('cooler') ||
    name.includes('iced tea') ||
    name.includes('shake') ||
    name.includes('smoothie') ||
    name.includes('lemonade') ||
    name.includes('fresh lime') ||
    mId.includes('mojito') ||
    mId.includes('cooler')
  ) {
    return false;
  }

  // Packaged IDs
  if (
    mId === 'campa-cola' ||
    mId === 'mineral-water' ||
    mId === 'soda-water' ||
    mId.includes('cola') ||
    mId.includes('sprite') ||
    mId.includes('water') ||
    mId.includes('pepsi') ||
    mId.includes('coke') ||
    mId.includes('fanta') ||
    mId.includes('thums')
  ) {
    return true;
  }

  // Packaged keywords in name (water, pepsi, sprite, campa, coke, can, bottle, etc.)
  return /\b(water|mineral water|water bottle|packaged water|soda water|campa|cola|pepsi|sprite|coke|fanta|thums up|frooti|maaza|slice|mirinda|7up|mountain dew|red bull|can|bottle|canned|bottled)\b/i.test(name);
}

export function isNonPackagedDrinkItem(item: { name?: string; menuItemId?: string }): boolean {
  const name = (item.name || '').toLowerCase();
  const mId = (item.menuItemId || '').toLowerCase();

  // Fresh / handcrafted beverage IDs or names
  if (
    mId === 'add-mojito' ||
    mId.includes('mojito') ||
    mId.includes('cooler') ||
    mId.includes('shake') ||
    mId.includes('lemonade')
  ) {
    return true;
  }

  if (/\b(mojito|cooler|lemonade|iced tea|fresh lime|nimbu pani|shikanji|shake|smoothie|crush|fresh drink)\b/i.test(name)) {
    return true;
  }

  // Any other drink that is not packaged
  const isAnyDrink =
    classifyOrderItemCategory(item) === 'drink' ||
    mId.includes('drink') ||
    /\b(drink|beverage)\b/i.test(name);

  if (isAnyDrink && !isPackagedDrinkItem(item)) {
    return true;
  }

  return false;
}

export function isDrinkItem(item: { name?: string; menuItemId?: string }): boolean {
  return isPackagedDrinkItem(item) || isNonPackagedDrinkItem(item);
}

const getHeatmapColor = (intensity: number) => {
  if (intensity <= 0) return 'rgba(0,0,0,0.03)';
  const t = Math.min(1, Math.max(0, intensity));
  
  let lower = colorStops[0];
  let upper = colorStops[colorStops.length - 1];
  
  for (let i = 0; i < colorStops.length - 1; i++) {
    if (t >= colorStops[i].p && t <= colorStops[i+1].p) {
      lower = colorStops[i];
      upper = colorStops[i+1];
      break;
    }
  }
  
  const range = upper.p - lower.p;
  const factor = range <= 0 ? 0 : (t - lower.p) / range;
  
  const r = Math.round(lower.r + factor * (upper.r - lower.r));
  const g = Math.round(lower.g + factor * (upper.g - lower.g));
  const b = Math.round(lower.b + factor * (upper.b - lower.b));
  
  return `rgb(${r}, ${g}, ${b})`;
};

const heatmapGradient = `linear-gradient(to right, ${colorStops.map(s => `rgb(${s.r}, ${s.g}, ${s.b}) ${s.p * 100}%`).join(', ')})`;

// OKLab / OKLCH color space patch for html2canvas (Tailwind v4 compatibility)
function oklabToRgb(l: number, a: number, bInput: number): [number, number, number] {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * bInput;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bInput;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * bInput;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const r_lin = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g_lin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const b_lin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

  const toSRGB = (c: number) => {
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };

  const r = Math.round(Math.max(0, Math.min(1, toSRGB(r_lin))) * 255);
  const g = Math.round(Math.max(0, Math.min(1, toSRGB(g_lin))) * 255);
  const b = Math.round(Math.max(0, Math.min(1, toSRGB(b_lin))) * 255);

  return [r, g, b];
}

function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const bChroma = c * Math.sin(hRad);
  return oklabToRgb(l, a, bChroma);
}

function parseAndConvertOklch(str: string): string {
  const oklchRegex = /oklch\(\s*([\d.]+%?)[,\s]+([\d.]+%?)[,\s]+([\d.]+(?:deg|rad|grad|turn)?)(?:\s*[\/,]\s*([\d.]+%?))?\s*\)/gi;
  return str.replace(oklchRegex, (_match, lStr, cStr, hStr, aStr) => {
    let l = parseFloat(lStr);
    if (lStr.endsWith('%')) l /= 100;
    let c = parseFloat(cStr);
    if (cStr.endsWith('%')) c /= 100;
    
    let h = parseFloat(hStr);
    if (hStr.endsWith('rad')) h = (h * 180) / Math.PI;
    else if (hStr.endsWith('grad')) h = (h * 360) / 400;
    else if (hStr.endsWith('turn')) h = h * 360;

    let alpha = 1;
    if (aStr) {
      alpha = parseFloat(aStr);
      if (aStr.endsWith('%')) alpha /= 100;
    }

    const [r, g, b] = oklchToRgb(l, c, h);
    return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  });
}

function parseAndConvertOklab(str: string): string {
  const oklabRegex = /oklab\(\s*([\d.]+%?)[,\s]+([+-]?[\d.]+%?)[,\s]+([+-]?[\d.]+%?)(?:\s*[\/,]\s*([\d.]+%?))?\s*\)/gi;
  return str.replace(oklabRegex, (_match, lStr, aStr, bStr, alphaStr) => {
    let l = parseFloat(lStr);
    if (lStr.endsWith('%')) l /= 100;
    let a = parseFloat(aStr);
    if (aStr.endsWith('%')) a /= 100;
    let bVal = parseFloat(bStr);
    if (bStr.endsWith('%')) bVal /= 100;

    let alpha = 1;
    if (alphaStr) {
      alpha = parseFloat(alphaStr);
      if (alphaStr.endsWith('%')) alpha /= 100;
    }

    const [r, g, b] = oklabToRgb(l, a, bVal);
    return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  });
}

let activePatches: (() => void)[] = [];

function patchColorSpaces() {
  activePatches = [];

  // 1. Patch CSSStyleSheet.prototype.cssRules
  const originalCssRules = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, 'cssRules')?.get;
  if (originalCssRules) {
    Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', {
      get() {
        try {
          const rules = originalCssRules.call(this);
          if (!rules) return rules;
          
          return new Proxy(rules, {
            get(target, prop) {
              if (prop === 'length') {
                return target.length;
              }
              const index = Number(prop);
              if (!isNaN(index) && index >= 0 && index < target.length) {
                const rule = target[index];
                return new Proxy(rule, {
                  get(ruleTarget, ruleProp) {
                    if (ruleProp === 'cssText') {
                      let text = ruleTarget.cssText;
                      if (text && text.includes('oklch(')) {
                        text = parseAndConvertOklch(text);
                      }
                      if (text && text.includes('oklab(')) {
                        text = parseAndConvertOklab(text);
                      }
                      return text;
                    }
                    if (ruleProp === 'style' && ruleTarget.style) {
                      return new Proxy(ruleTarget.style, {
                        get(styleTarget, styleProp) {
                          if (styleProp === 'getPropertyValue') {
                            return (property: string) => {
                              let val = styleTarget.getPropertyValue(property);
                              if (val && val.includes('oklch(')) {
                                val = parseAndConvertOklch(val);
                              }
                              if (val && val.includes('oklab(')) {
                                val = parseAndConvertOklab(val);
                              }
                              return val;
                            };
                          }
                          const val = (styleTarget as any)[styleProp];
                          if (val && typeof val === 'string') {
                            if (val.includes('oklch(')) return parseAndConvertOklch(val);
                            if (val.includes('oklab(')) return parseAndConvertOklab(val);
                          }
                          return val;
                        }
                      });
                    }
                    return (ruleTarget as any)[ruleProp];
                  }
                });
              }
              return (target as any)[prop];
            }
          });
        } catch (e) {
          return null;
        }
      },
      configurable: true
    });

    activePatches.push(() => {
      Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', {
        get: originalCssRules,
        configurable: true
      });
    });
  }

  // 2. Patch window.getComputedStyle
  const originalGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function(elt, pseudoElt) {
    const style = originalGetComputedStyle.call(window, elt, pseudoElt);
    return new Proxy(style, {
      get(target, prop) {
        if (prop === 'getPropertyValue') {
          return (property: string) => {
            let val = target.getPropertyValue(property);
            if (val && typeof val === 'string') {
              if (val.includes('oklch(')) {
                val = parseAndConvertOklch(val);
              }
              if (val && val.includes('oklab(')) {
                val = parseAndConvertOklab(val);
              }
            }
            return val;
          };
        }
        const val = (target as any)[prop];
        if (val && typeof val === 'string') {
          if (val.includes('oklch(')) {
            return parseAndConvertOklch(val);
          }
          if (val.includes('oklab(')) {
            return parseAndConvertOklab(val);
          }
        }
        return val;
      }
    });
  };

  activePatches.push(() => {
    window.getComputedStyle = originalGetComputedStyle;
  });
}

function restoreColorSpaces() {
  for (const restore of activePatches) {
    try {
      restore();
    } catch (e) {
      console.error(e);
    }
  }
  activePatches = [];
}

interface AnalyticsProps {
  user: User;
}

type DatePreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'last7' | 'last14' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth' | 'custom';
type ActiveTab = 'active' | 'deleted' | 'adjustments';
type ReportView = 'revenue' | 'trends' | 'itemSales' | 'comparison' | 'profitability' | 'customers';

const Analytics: React.FC<AnalyticsProps> = ({ user }) => {
  const isAdmin = user.role === 'ADMIN' || user.role === 'COFOUNDER';
  
  const [startDate, setStartDate] = useState<string>(getTodaysDateString());
  const [endDate, setEndDate] = useState<string>(getTodaysDateString());
  const [customStart, setCustomStart] = useState<string>(getTodaysDateString());
  const [customEnd, setCustomEnd] = useState<string>(getTodaysDateString());
  const [isOrdersLoading, setIsOrdersLoading] = useState<boolean>(false);
  const ordersCacheRef = useRef<Map<string, CompletedOrder[]>>(new Map());
  const deletedOrdersCacheRef = useRef<Map<string, CompletedOrder[]>>(new Map());

  const [activePreset, setActivePreset] = useState<DatePreset>('today');
  const [activeTab, setActiveTab] = useState<ActiveTab>('active');
  const [reportView, setReportView] = useState<ReportView>('revenue');
  const [compareBy, setCompareBy] = useState<'STORE' | 'CASHIER'>('STORE');
  const [selectedStore, setSelectedStore] = useState<string>(isAdmin ? 'All' : (user.stationName || 'All'));
  const [availableStations, setAvailableStations] = useState<Station[]>([]);
  
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [chartOrders, setChartOrders] = useState<CompletedOrder[]>([]);
  const [allOrdersRaw, setAllOrdersRaw] = useState<CompletedOrder[]>([]);
  const [deletedOrders, setDeletedOrders] = useState<CompletedOrder[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerHistory, setSelectedCustomerHistory] = useState<CompletedOrder[]>([]);
  const [customMessage, setCustomMessage] = useState('');
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [usualOrder, setUsualOrder] = useState<{ name: string, quantity: number } | null>(null);
  const [cohortRawData, setCohortRawData] = useState<CohortOrder[]>([]);
  const [isCohortLoading, setIsCohortLoading] = useState(false);

  useEffect(() => {
    if ((reportView === 'trends' || reportView === 'customers') && cohortRawData.length === 0 && !isCohortLoading) {
      const loadCohort = async () => {
        setIsCohortLoading(true);
        try {
          const freshCohortData = await fetchCohortRawData();
          setCohortRawData(freshCohortData);
        } catch (error) {
          console.error("Failed to load cohort data lazily:", error);
        } finally {
          setIsCohortLoading(false);
        }
      };
      loadCohort();
    }
  }, [reportView, cohortRawData.length, isCohortLoading]);
  const [compositionPeriod, setCompositionPeriod] = useState<string | null>(null);
  const [analysisBasis, setAnalysisBasis] = useState<'REVENUE' | 'ORDERS'>('REVENUE');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<Customer>>({});
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [editIsStudent, setEditIsStudent] = useState(false);
  const [editSchool, setEditSchool] = useState('');
  const [editHikerNo, setEditHikerNo] = useState('');

  // ML Export & Item Normalization states
  const [isMlDropdownOpen, setIsMlDropdownOpen] = useState(false);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [snapshotDateState, setSnapshotDateState] = useState<string>(getTodaysDateString());
  const [labelWindowDays, setLabelWindowDays] = useState<number>(30);
  const [isNormModalOpen, setIsNormModalOpen] = useState(false);
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const [normMap, setNormMap] = useState<Record<string, ItemNormalization>>({});
  const [normSearchTerm, setNormSearchTerm] = useState('');
  const [isAddonModalOpen, setIsAddonModalOpen] = useState(false);
  const [deliveryBrandCardFilter, setDeliveryBrandCardFilter] = useState<DeliveryBrandFilter>('ALL');
  const [addonDeliveryBrandFilter, setAddonDeliveryBrandFilter] = useState<DeliveryBrandFilter>('ALL');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMode, setSearchMode] = useState<'bill' | 'item' | 'coupon'>('bill');
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [itemSuggestions, setItemSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [foundOrder, setFoundOrder] = useState<CompletedOrder | null>(null);
  const [foundOrdersList, setFoundOrdersList] = useState<CompletedOrder[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [foundOrderInitialBalance, setFoundOrderInitialBalance] = useState<number | undefined>(undefined);
  const [foundOrderFinalBalance, setFoundOrderFinalBalance] = useState<number | undefined>(undefined);
  const [foundOrderEarnedCoins, setFoundOrderEarnedCoins] = useState<number | undefined>(undefined);
  const [foundOrderNextCoupon, setFoundOrderNextCoupon] = useState<any>(null);
  const [searchMessage, setSearchMessage] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerSortField, setCustomerSortField] = useState<'totalSpent' | 'joinedDate' | 'totalOrders' | 'lastVisit'>('totalSpent');
  const [customerSortOrder, setCustomerSortOrder] = useState<'asc' | 'desc'>('desc');
  const [customerClassFilter, setCustomerClassFilter] = useState<'ALL' | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'DELIVERY_MINMOMOS' | 'DELIVERY_MINCHICKEN' | 'UNCLASSIFIED'>('ALL');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<'ALL' | 'STUDENT' | 'REGULAR'>('ALL');
  const [customerRecencyFilter, setCustomerRecencyFilter] = useState<'ALL' | 'MAU_90D' | 'POWER_30D' | 'COOLING_90D' | 'DORMANT'>('ALL');
  const [customerNetworkTab, setCustomerNetworkTab] = useState<'mau' | 'cohort'>('mau');
  const [segmentFilter, setSegmentFilter] = useState<'ALL' | 'STUDENT' | 'REGULAR'>('ALL');
  const [isStudentScorecardOpen, setIsStudentScorecardOpen] = useState(false);
  const [customerOrderStats, setCustomerOrderStats] = useState<Record<string, { DINE_IN: number, TAKEAWAY: number, DELIVERY: number, DELIVERY_MINMOMOS?: number, DELIVERY_MINCHICKEN?: number, total: number }>>({});
  const [minLtv, setMinLtv] = useState<string>('');
  const [maxLtv, setMaxLtv] = useState<string>('');
  const [minOrders, setMinOrders] = useState<string>('');
  const [maxOrders, setMaxOrders] = useState<string>('');
  const [customerJoinedStart, setCustomerJoinedStart] = useState<string>('');
  const [customerJoinedEnd, setCustomerJoinedEnd] = useState<string>('');
  const [customerActivityStart, setCustomerActivityStart] = useState<string>('');
  const [customerActivityEnd, setCustomerActivityEnd] = useState<string>('');
  const [selectedDayInsights, setSelectedDayInsights] = useState<number | null>(null);
  const [selectedSequenceDetail, setSelectedSequenceDetail] = useState<{ seq: number | string, orders: CompletedOrder[], label: string } | null>(null);

  // Sorting & Filtering states for Revenue table
  const [revSortField, setRevSortField] = useState<'date' | 'total' | 'billNumber'>('date');
  const [revSortOrder, setRevSortOrder] = useState<'asc' | 'desc'>('desc');
  const [revTypeFilter, setRevTypeFilter] = useState<string>('all');
  const [revBranchFilter, setRevBranchFilter] = useState<string>('all');
  const [revCategoryFilter, setRevCategoryFilter] = useState<string>('all');
  const [revItemFilter, setRevItemFilter] = useState<string>('all');
  const [revMinAmount, setRevMinAmount] = useState<string>('');
  const [revMaxAmount, setRevMaxAmount] = useState<string>('');
  const [revSearchQuery, setRevSearchQuery] = useState<string>('');

  const handleToggleRevSort = (field: 'date' | 'total' | 'billNumber') => {
    if (revSortField === field) {
      setRevSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setRevSortField(field);
      setRevSortOrder('desc');
    }
  };

  const setReviewStatus = async (orderId: string, targetStatus: 'REVIEW_COLLECTED' | 'REVIEW_DENIED') => {
    // Current status of the order before update
    const currentOrder = orders.find(o => o.id === orderId);
    if (!currentOrder) return;
    const currentStatus = currentOrder.status;

    // Toggle: if already set to target targetStatus, toggle it back to 'COMPLETED' (null/unselected state)
    const nextStatus = currentStatus === targetStatus ? 'COMPLETED' : targetStatus;
    
    // Optimistic UI update
    setOrders(prevOrders => 
      prevOrders.map(o => o.id === orderId ? { ...o, status: nextStatus as any } : o)
    );
    
    try {
      await updateOrderStatus(orderId, nextStatus as any);
    } catch (error) {
      console.error("Failed to update status in Supabase:", error);
      // Revert status on error
      setOrders(prevOrders => 
        prevOrders.map(o => o.id === orderId ? { ...o, status: currentStatus as any } : o)
      );
    }
  };

  // Sorting & Filtering for Stock Adjustments tab
  const [adjSortField, setAdjSortField] = useState<'date' | 'quantity_change'>('date');
  const [adjSortOrder, setAdjSortOrder] = useState<'asc' | 'desc'>('desc');
  const [adjBranchFilter, setAdjBranchFilter] = useState<string>('all');
  const [adjSearchQuery, setAdjSearchQuery] = useState<string>('');

  const handleToggleAdjSort = (field: 'date' | 'quantity_change') => {
    if (adjSortField === field) {
      setAdjSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setAdjSortField(field);
      setAdjSortOrder('desc');
    }
  };

  // 🎓 Centralized Student Identification Sets & Memos for Global Segment Analysis
  const studentPhoneSet = useMemo(() => {
    const set = new Set<string>();
    customers.forEach(c => {
      if (isStudentCustomer(c)) {
        set.add(normalizePhone(c.phone));
      }
    });
    return set;
  }, [customers]);

  const checkIsOrderStudent = useCallback((o: CompletedOrder) => {
    return isOrderFromStudent(o, studentPhoneSet);
  }, [studentPhoneSet]);

  const displayOrders = useMemo(() => {
    if (segmentFilter === 'STUDENT') {
      return orders.filter(o => checkIsOrderStudent(o));
    }
    if (segmentFilter === 'REGULAR') {
      return orders.filter(o => !checkIsOrderStudent(o));
    }
    return orders;
  }, [orders, segmentFilter, checkIsOrderStudent]);

  const displayChartOrders = useMemo(() => {
    if (segmentFilter === 'STUDENT') {
      return chartOrders.filter(o => checkIsOrderStudent(o));
    }
    if (segmentFilter === 'REGULAR') {
      return chartOrders.filter(o => !checkIsOrderStudent(o));
    }
    return chartOrders;
  }, [chartOrders, segmentFilter, checkIsOrderStudent]);

  const displayCustomers = useMemo(() => {
    if (segmentFilter === 'STUDENT') {
      return customers.filter(c => isStudentCustomer(c));
    }
    if (segmentFilter === 'REGULAR') {
      return customers.filter(c => !isStudentCustomer(c));
    }
    return customers;
  }, [customers, segmentFilter]);

  const displayCohortData = useMemo(() => {
    if (segmentFilter === 'STUDENT') {
      return cohortRawData.filter(d => d.is_student);
    }
    if (segmentFilter === 'REGULAR') {
      return cohortRawData.filter(d => !d.is_student);
    }
    return cohortRawData;
  }, [cohortRawData, segmentFilter]);

  const studentSegmentMetrics = useMemo(() => {
    let studentRevenue = 0;
    let regularRevenue = 0;
    let totalPeriodRevenue = 0;

    let studentPaidOrders = 0;
    let studentFreePromoOrders = 0;
    let regularOrders = 0;

    let studentCogs = 0;
    let regularCogs = 0;

    let studentDineInCount = 0;
    let studentTakeawayCount = 0;
    let studentDeliveryCount = 0;

    const itemMap = new Map<string, { quantity: number; revenue: number }>();

    orders.forEach(order => {
      const isStudent = checkIsOrderStudent(order);
      const orderCogs = order.items.reduce((acc, item) => acc + (item.cost ?? 0) * item.quantity, 0);
      const orderRev = order.type === 'DELIVERY' && order.manualTotal != null ? order.manualTotal : order.total;

      totalPeriodRevenue += orderRev;

      if (isStudent) {
        if (isStudentFreeMojitoOrder(order)) {
          studentFreePromoOrders++;
        } else {
          studentPaidOrders++;
        }
        studentRevenue += orderRev;
        studentCogs += orderCogs;

        if (order.type === 'DINE_IN') studentDineInCount++;
        else if (order.type === 'TAKEAWAY') studentTakeawayCount++;
        else if (order.type === 'DELIVERY') studentDeliveryCount++;

        order.items.forEach(item => {
          const prev = itemMap.get(item.name) || { quantity: 0, revenue: 0 };
          itemMap.set(item.name, {
            quantity: prev.quantity + item.quantity,
            revenue: prev.revenue + (item.price * item.quantity)
          });
        });
      } else {
        regularOrders++;
        regularRevenue += orderRev;
        regularCogs += orderCogs;
      }
    });

    const studentTotalOrders = studentPaidOrders + studentFreePromoOrders;
    const totalOrdersCount = studentTotalOrders + regularOrders;

    const studentAov = studentPaidOrders > 0 ? Math.round(studentRevenue / studentPaidOrders) : 0;
    const regularAov = regularOrders > 0 ? Math.round(regularRevenue / regularOrders) : 0;
    const overallAov = (studentPaidOrders + regularOrders) > 0 ? Math.round(totalPeriodRevenue / (studentPaidOrders + regularOrders)) : 0;

    const studentGrossProfit = studentRevenue - studentCogs;
    const studentGrossMargin = studentRevenue > 0 ? (studentGrossProfit / studentRevenue) * 100 : 0;

    const studentRevenueShare = totalPeriodRevenue > 0 ? (studentRevenue / totalPeriodRevenue) * 100 : 0;
    const studentOrdersShare = totalOrdersCount > 0 ? (studentTotalOrders / totalOrdersCount) * 100 : 0;

    const studentCustomers = customers.filter(c => isStudentCustomer(c));
    const regularCustomers = customers.filter(c => !isStudentCustomer(c));

    const totalEnrolledStudents = studentCustomers.length;
    const totalRegularCustomers = regularCustomers.length;

    const newStudentEnrolments = studentCustomers.filter(c => {
      if (!c.joinedDate) return false;
      const d = getISTDateString(c.joinedDate);
      return d >= startDate && d <= endDate;
    }).length;

    const repeatStudents = studentCustomers.filter(c => (c.totalOrders ?? 0) > 1).length;
    const studentRetentionRate = totalEnrolledStudents > 0 ? (repeatStudents / totalEnrolledStudents) * 100 : 0;

    const repeatRegular = regularCustomers.filter(c => (c.totalOrders ?? 0) > 1).length;
    const regularRetentionRate = totalRegularCustomers > 0 ? (repeatRegular / totalRegularCustomers) * 100 : 0;

    const topStudentItems = Array.from(itemMap.entries())
      .map(([name, data]) => ({ name, quantity: data.quantity, revenue: data.revenue }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const studentOrderModeTotal = studentDineInCount + studentTakeawayCount + studentDeliveryCount;
    const studentDineInPct = studentOrderModeTotal > 0 ? (studentDineInCount / studentOrderModeTotal) * 100 : 0;
    const studentTakeawayPct = studentOrderModeTotal > 0 ? (studentTakeawayCount / studentOrderModeTotal) * 100 : 0;
    const studentDeliveryPct = studentOrderModeTotal > 0 ? (studentDeliveryCount / studentOrderModeTotal) * 100 : 0;

    return {
      totalAllCustomers: customers.length,
      totalEnrolledStudents,
      totalRegularCustomers,
      newStudentEnrolments,
      totalPeriodRevenue,
      studentRevenue,
      studentRevenueShare,
      regularRevenue,
      studentOrders: studentTotalOrders,
      studentPaidOrders,
      studentFreePromoOrders,
      regularOrders,
      studentOrdersShare,
      studentAov,
      regularAov,
      overallAov,
      studentGrossProfit,
      studentCogs,
      studentGrossMargin,
      studentRetentionRate,
      regularRetentionRate,
      repeatStudents,
      studentDineInPct,
      studentTakeawayPct,
      studentDeliveryPct,
      topStudentItems
    };
  }, [orders, customers, startDate, endDate, checkIsOrderStudent]);

  // Helper to extract unique branches from dataset dynamically
  const uniqueBranches = useMemo(() => {
    const branches = new Set<string>();
    orders.forEach(o => { if (o.branchName) branches.add(o.branchName); });
    deletedOrders.forEach(o => { if (o.branchName) branches.add(o.branchName); });
    adjustments.forEach(a => { if (a.branch_name) branches.add(a.branch_name); });
    return Array.from(branches);
  }, [orders, deletedOrders, adjustments]);

  // Distinct unique items present in current loaded orders for filtering
  const availableItemsList = useMemo(() => {
    const rawList = activeTab === 'active' ? orders : deletedOrders;
    const itemMap = new Map<string, { name: string; category: string }>();

    rawList.forEach(o => {
      o.items?.forEach(it => {
        const cat = classifyOrderItemCategory(it);
        if (cat !== 'discount' && it.name && it.name.trim()) {
          const cleanName = it.name.trim();
          if (!itemMap.has(cleanName)) {
            itemMap.set(cleanName, { name: cleanName, category: cat });
          }
        }
      });
    });

    const list = Array.from(itemMap.values());
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [activeTab, orders, deletedOrders]);

  // Filtered item options if a specific category is chosen
  const filteredItemOptions = useMemo(() => {
    if (revCategoryFilter === 'all') return availableItemsList;
    if (revCategoryFilter === 'drink-packaged') {
      return availableItemsList.filter(i => isPackagedDrinkItem(i));
    }
    if (revCategoryFilter === 'drink-fresh') {
      return availableItemsList.filter(i => isNonPackagedDrinkItem(i));
    }
    return availableItemsList.filter(i => i.category === revCategoryFilter);
  }, [availableItemsList, revCategoryFilter]);

  // Computed Active or Voided orders filtered and sorted
  const filteredAndSortedOrders = useMemo(() => {
    const rawList = activeTab === 'active' ? orders : deletedOrders;
    
    // 1. Filter
    let result = rawList.filter(o => {
      // Search Query
      if (revSearchQuery.trim()) {
        const query = revSearchQuery.toLowerCase().trim();
        const matchesBillNum = o.billNumber.toString().includes(query);
        const matchesItem = o.items && o.items.some(item => item.name.toLowerCase().includes(query));
        const matchesCashier = o.cashierName && o.cashierName.toLowerCase().includes(query);
        const matchesPayment = o.paymentMethod && o.paymentMethod.toLowerCase().includes(query);
        const coup = o.appliedCouponCode || extractCouponCodeFromOrder(o);
        const matchesCoupon = Boolean(coup && coup.toLowerCase().includes(query));
        const resolvedBrand = o.type === 'DELIVERY' ? ((o.deliveryBrand || '').toUpperCase() === 'MINCHICKEN' ? 'MINCHICKEN' : 'MINMOMOS') : null;
        const matchesDeliveryBrand = Boolean(resolvedBrand && resolvedBrand.toLowerCase().includes(query));
        
        if (!matchesBillNum && !matchesItem && !matchesCashier && !matchesPayment && !matchesCoupon && !matchesDeliveryBrand) {
          return false;
        }
      }

      // Order Mode / Type
      if (revTypeFilter !== 'all') {
        if (revTypeFilter === 'delivery_minmomos') {
          if (o.type !== 'DELIVERY' || (o.deliveryBrand || '').toUpperCase() === 'MINCHICKEN') return false;
        } else if (revTypeFilter === 'delivery_minchicken') {
          if (o.type !== 'DELIVERY' || (o.deliveryBrand || '').toUpperCase() !== 'MINCHICKEN') return false;
        } else if (o.type.toLowerCase() !== revTypeFilter.toLowerCase()) {
          return false;
        }
      }

      // Branch / Store
      if (revBranchFilter !== 'all') {
        if (o.branchName.toLowerCase() !== revBranchFilter.toLowerCase()) {
          return false;
        }
      }

      // Item Category Filter (contains item of category)
      if (revCategoryFilter !== 'all') {
        let hasMatchingCategory = false;
        if (revCategoryFilter === 'drink-packaged') {
          hasMatchingCategory = o.items && o.items.some(it => isPackagedDrinkItem(it));
        } else if (revCategoryFilter === 'drink-fresh') {
          hasMatchingCategory = o.items && o.items.some(it => isNonPackagedDrinkItem(it));
        } else {
          hasMatchingCategory = o.items && o.items.some(it => classifyOrderItemCategory(it) === revCategoryFilter);
        }
        if (!hasMatchingCategory) return false;
      }

      // Specific Item Filter (contains specific item)
      if (revItemFilter !== 'all') {
        const hasMatchingItem = o.items && o.items.some(it => it.name && it.name.trim() === revItemFilter);
        if (!hasMatchingItem) return false;
      }

      // Amount Range
      const val = o.type === 'DELIVERY' && o.manualTotal != null ? o.manualTotal : o.total;
      if (revMinAmount.trim() !== '') {
        const minVal = parseFloat(revMinAmount);
        if (!isNaN(minVal) && val < minVal) return false;
      }
      if (revMaxAmount.trim() !== '') {
        const maxVal = parseFloat(revMaxAmount);
        if (!isNaN(maxVal) && val > maxVal) return false;
      }

      // Segment Filter (Student vs Regular)
      if (segmentFilter === 'STUDENT' && !checkIsOrderStudent(o)) {
        return false;
      }
      if (segmentFilter === 'REGULAR' && checkIsOrderStudent(o)) {
        return false;
      }

      return true;
    });

    // 2. Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;
      if (revSortField === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (revSortField === 'total') {
        const totalA = a.type === 'DELIVERY' && a.manualTotal != null ? a.manualTotal : a.total;
        const totalB = b.type === 'DELIVERY' && b.manualTotal != null ? b.manualTotal : b.total;
        comparison = totalA - totalB;
      } else if (revSortField === 'billNumber') {
        comparison = a.billNumber - b.billNumber;
      }

      return revSortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [activeTab, orders, deletedOrders, revSearchQuery, revTypeFilter, revBranchFilter, revCategoryFilter, revItemFilter, revMinAmount, revMaxAmount, revSortField, revSortOrder, segmentFilter, checkIsOrderStudent]);

  // Computed Stock Adjustments filtered and sorted
  const filteredAndSortedAdjustments = useMemo(() => {
    // 1. Filter
    let result = adjustments.filter(adj => {
      if (adjSearchQuery.trim()) {
        const query = adjSearchQuery.toLowerCase().trim();
        const matchesItem = adj.inventory_id && adj.inventory_id.toLowerCase().includes(query);
        const matchesUser = adj.performed_by && adj.performed_by.toLowerCase().includes(query);
        const matchesReason = adj.reason && adj.reason.toLowerCase().includes(query);

        if (!matchesItem && !matchesUser && !matchesReason) {
          return false;
        }
      }

      if (adjBranchFilter !== 'all') {
        if (adj.branch_name.toLowerCase() !== adjBranchFilter.toLowerCase()) {
          return false;
        }
      }

      return true;
    });

    // 2. Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;
      if (adjSortField === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (adjSortField === 'quantity_change') {
        comparison = Math.abs(a.quantity_change) - Math.abs(b.quantity_change);
      }

      return adjSortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [adjustments, adjSearchQuery, adjBranchFilter, adjSortField, adjSortOrder]);

  const behaviorData = useMemo(() => {
    if (!displayOrders.length || !displayCohortData.length) return null;

    // 1. Unique customers in the selected period
    const periodUids = new Set<string>();
    const periodOrdersByUid: Record<string, CompletedOrder[]> = {};
    
    displayOrders.forEach(o => {
      const uid = o.customerPhone || 'GUEST';
      if (uid === 'GUEST') return; // Exclude non-registered for sequence precision if preferred, but following "unique customers"
      periodUids.add(uid);
      if (!periodOrdersByUid[uid]) periodOrdersByUid[uid] = [];
      periodOrdersByUid[uid].push(o);
    });

    const uniqueCustomerCount = periodUids.size;

    // 2. Map all historical orders to sequence numbers for every customer
    const historicalOrdersByUid: Record<string, CohortOrder[]> = {};
    displayCohortData.forEach(o => {
      const uid = normalizePhone(o.customer_phone);
      if (!uid || uid === 'GUEST') return;
      
      const bNum = Number(o.bill_number);
      if (isNaN(bNum) || bNum <= 0) return;

      if (!historicalOrdersByUid[uid]) historicalOrdersByUid[uid] = [];
      
      // De-duplicate by bill number in history - use numeric comparison for robustness
      if (!historicalOrdersByUid[uid].some(h => Number(h.bill_number) === bNum)) {
        historicalOrdersByUid[uid].push({
          ...o,
          customer_phone: uid,
          bill_number: bNum
        });
      }
    });

    // Sort historical orders to find sequences
    Object.keys(historicalOrdersByUid).forEach(uid => {
      historicalOrdersByUid[uid].sort((a, b) => {
        const dateA = new Date(a.order_date).getTime();
        const dateB = new Date(b.order_date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return a.bill_number - b.bill_number;
      });
    });

    // Analyze orders IN THE PERIOD
    const sequenceStats: Record<number | string, { count: number, totalRevenue: number }> = {};
    const compositionStats = {
      repeat: { count: 0, revenue: 0 },
      new: { count: 0, revenue: 0 },
      unregistered: { count: 0, revenue: 0 },
      delivery: { count: 0, revenue: 0 },
      deliveryMinMomos: { count: 0, revenue: 0 },
      deliveryMinChicken: { count: 0, revenue: 0 }
    };

    let matchedRevenue = 0;
    let matchedOrders = 0;
    const processedBillNumbers = new Set<string | number>();

    displayOrders.forEach(o => {
      const rev = o.type === 'DELIVERY' && o.manualTotal != null ? o.manualTotal : o.total;
      const uid = normalizePhone(o.customerPhone);
      const bNum = Number(o.billNumber);
      
      // Prevent double counting the same bill in the period (if duplicates exist in orders array)
      if (processedBillNumbers.has(bNum)) return;
      processedBillNumbers.add(bNum);

      // 1. Composition Logic (aligned with Sequence where possible)
      if (o.type === 'DELIVERY') {
        compositionStats.delivery.count++;
        compositionStats.delivery.revenue += rev;
        if ((o.deliveryBrand || '').toUpperCase() === 'MINCHICKEN') {
          compositionStats.deliveryMinChicken.count++;
          compositionStats.deliveryMinChicken.revenue += rev;
        } else {
          compositionStats.deliveryMinMomos.count++;
          compositionStats.deliveryMinMomos.revenue += rev;
        }
      } else if (!uid || uid === 'GUEST') {
        compositionStats.unregistered.count++;
        compositionStats.unregistered.revenue += rev;
      }

      // 2. Sequence Logic
      if (!uid || uid === 'GUEST') return;
      
      const userHistory = historicalOrdersByUid[uid];
      let seq: number | string = 'Other';
      if (userHistory) {
        const indexInHistory = userHistory.findIndex(h => Number(h.bill_number) === bNum);
        if (indexInHistory !== -1) {
          seq = indexInHistory + 1;
        }
      }

      if (!sequenceStats[seq]) sequenceStats[seq] = { count: 0, totalRevenue: 0 };
      sequenceStats[seq].count++;
      sequenceStats[seq].totalRevenue += rev;
      matchedRevenue += rev;
      matchedOrders++;

      // 3. Fill Composition from Sequence (if not already handled by Delivery/Unreg)
      if (o.type !== 'DELIVERY') {
        if (seq === 1) {
          compositionStats.new.count++;
          compositionStats.new.revenue += rev;
        } else {
          compositionStats.repeat.count++;
          compositionStats.repeat.revenue += rev;
        }
      }
    });

    const sortedSequences = Object.entries(sequenceStats)
      .filter(([seq]) => seq !== 'Other')
      .map(([seq, stats]) => ({
        seq: parseInt(seq),
        customers: stats.count,
        revenue: stats.totalRevenue,
        aov: stats.count > 0 ? stats.totalRevenue / stats.count : 0,
        orders: displayOrders.filter(o => {
          const oUid = normalizePhone(o.customerPhone);
          if (!oUid || oUid === 'GUEST') return false;
          const hist = historicalOrdersByUid[oUid];
          if (!hist) return false;
          const idx = hist.findIndex(h => Number(h.bill_number) === Number(o.billNumber));
          return idx + 1 === parseInt(seq);
        })
      }))
      .sort((a, b) => a.seq - b.seq);
    
    // Add "Other" if there are unmatched profile orders
    if (sequenceStats['Other']) {
      sortedSequences.push({
        seq: 999, // Special key for display
        customers: sequenceStats['Other'].count,
        revenue: sequenceStats['Other'].totalRevenue,
        aov: sequenceStats['Other'].count > 0 ? sequenceStats['Other'].totalRevenue / sequenceStats['Other'].count : 0,
        orders: displayOrders.filter(o => {
           const oUid = normalizePhone(o.customerPhone);
           if (!oUid || oUid === 'GUEST') return false;
           const hist = historicalOrdersByUid[oUid];
           if (!hist) return true; // It was 'Other' because it wasn't in history
           const idx = hist.findIndex(h => Number(h.bill_number) === Number(o.billNumber));
           return idx === -1;
        })
      });
    }

    return {
      uniqueCustomers: uniqueCustomerCount,
      totalOrders: matchedOrders,
      sequences: sortedSequences,
      avgOrdersPerUser: uniqueCustomerCount > 0 ? matchedOrders / uniqueCustomerCount : 0,
      avgSpendPerUser: uniqueCustomerCount > 0 ? matchedRevenue / uniqueCustomerCount : 0,
      composition: compositionStats
    };
  }, [displayOrders, displayCohortData]);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<CompletedOrder | null>(null);

  const fetchStaticData = useCallback(async (forceRefresh = false) => {
    const s = isAdmin ? await getStations(forceRefresh) : [];
    
    // Fetch customers for both Admin and Manager
    // Managers only see their own branch customers
    const custFilter = isAdmin ? undefined : user.stationName;
    const [cust, stats] = await Promise.all([
      fetchCustomers(custFilter, forceRefresh),
      fetchCustomerClassificationStats(forceRefresh)
    ]);
    
    if (isAdmin) {
      setAvailableStations(s);
    }
    setCustomers(cust);
    setCustomerOrderStats(stats);
  }, [isAdmin, user.stationName, user.role]);

  const fetchOrders = useCallback(async (forceRefresh = false) => {
    setIsOrdersLoading(true);
    try {
      // Expand start date by 32 days to ensure 30-day SMA is accurate for the start of the visible range
      const expandedStart = getHistoricalStartDate(startDate, 32);
      const cacheKey = `${expandedStart}_${endDate}`;
      
      let fetchedOrders: CompletedOrder[];
      if (!forceRefresh && ordersCacheRef.current.has(cacheKey)) {
        fetchedOrders = ordersCacheRef.current.get(cacheKey)!;
      } else {
        fetchedOrders = await getOrdersForDateRange(expandedStart, endDate, forceRefresh);
        ordersCacheRef.current.set(cacheKey, fetchedOrders);
      }

      setAllOrdersRaw(fetchedOrders);
      
      // Filter by store - Managers only see their own
      const storeToFilter = isAdmin ? selectedStore : (user.stationName || 'All');
      
      // Process Chart Data (Historical + Visible range, Station Filtered)
      const stationFiltered = storeToFilter === 'All' 
        ? fetchedOrders 
        : fetchedOrders.filter(o => o.branchName === storeToFilter);
      setChartOrders(stationFiltered);

      // Process View Data (Visible range ONLY, Station Filtered)
      const inRange = stationFiltered.filter(o => {
        const d = getISTDateString(o.date);
        return d >= startDate && d <= endDate;
      });
        
      setOrders([...inRange].sort((a, b) => b.billNumber - a.billNumber));
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setIsOrdersLoading(false);
    }
  }, [startDate, endDate, selectedStore, isAdmin, user.stationName]);

  const fetchFinanceData = useCallback(async () => {
    // Relocated to ledger statements
  }, []);

  const fetchDeletedOrders = useCallback(async (forceRefresh = false) => {
    try {
      const expandedStart = getHistoricalStartDate(startDate, 32);
      const cacheKey = `${expandedStart}_${endDate}`;
      
      let fetchedOrders: CompletedOrder[];
      if (!forceRefresh && deletedOrdersCacheRef.current.has(cacheKey)) {
        fetchedOrders = deletedOrdersCacheRef.current.get(cacheKey)!;
      } else {
        fetchedOrders = await getDeletedOrdersForDateRange(expandedStart, endDate, forceRefresh);
        deletedOrdersCacheRef.current.set(cacheKey, fetchedOrders);
      }
      
      // Filter by store - Managers only see their own
      const storeToFilter = isAdmin ? selectedStore : (user.stationName || 'All');
      const stationFiltered = storeToFilter === 'All' 
        ? fetchedOrders 
        : fetchedOrders.filter(o => o.branchName === storeToFilter);

      // Process View Data (Visible range ONLY)
      const inVisibleRange = stationFiltered.filter(o => {
        const d = getISTDateString(o.date);
        return d >= startDate && d <= endDate;
      });
      
      setDeletedOrders([...inVisibleRange].sort((a, b) => b.billNumber - a.billNumber));
    } catch (err) {
      console.error("Failed to fetch deleted orders:", err);
    }
  }, [startDate, endDate, selectedStore, isAdmin, user.stationName]);

  const fetchAdjustments = useCallback(async () => {
    const adjRes = await fetchManualAdjustments(startDate, endDate);
    if (!adjRes.error) {
      setAdjustments(adjRes.data || []);
    }
  }, [startDate, endDate]);

  const handleSequenceDetailClick = (seq: any) => {
    const label = seq.seq === 999 ? 'Others' : seq.seq === 1 ? 'New / 1st Order' : `${seq.seq}th Purchase`;
    setSelectedSequenceDetail({
      seq: seq.seq,
      orders: seq.orders || [],
      label
    });
  };

  const handleExportCustomers = () => {
    if (filteredCustomers.length === 0) return;

    const headers = ['Phone', 'Name', 'Email', 'Birthday', 'Total Spent (LTV)', 'Total Orders', 'MinCoins Balance', 'Joined Date', 'Last Visit', 'Note'];
    const csvContent = [
      headers.join(','),
      ...filteredCustomers.map(c => [
        c.phone,
        `"${(c.name || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        c.birthday || '',
        c.totalSpent || 0,
        c.totalOrders || 0,
        c.minCoins || 0,
        c.joinedDate ? new Date(c.joinedDate).toLocaleDateString() : '',
        c.lastVisit ? new Date(c.lastVisit).toLocaleDateString() : '',
        `"${(c.note || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `customers_export_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadCsv = (csvContent: string, fileName: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportMlOrders = async () => {
    try {
      const filteredOrders = getFilteredOrders(allOrdersRaw, startDate, endDate, selectedStore, isAdmin, user.stationName || 'All');
      const { csv, emptyCols } = await generateOrdersCsv(filteredOrders);
      downloadCsv(csv, 'orders.csv');
      if (emptyCols.length > 0) {
        alert(`Export completed successfully!\n\nThe following empty columns were added (not found in data store):\n- ${emptyCols.join('\n- ')}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to export Orders CSV');
    }
  };

  const handleExportMlOrderItems = async () => {
    try {
      const filteredOrders = getFilteredOrders(allOrdersRaw, startDate, endDate, selectedStore, isAdmin, user.stationName || 'All');
      const { csv, emptyCols } = await generateOrderItemsCsv(filteredOrders, normMap);
      downloadCsv(csv, 'order_items.csv');
      if (emptyCols.length > 0) {
        alert(`Export completed successfully!\n\nThe following empty columns were added (not found in data store):\n- ${emptyCols.join('\n- ')}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to export Order Items CSV');
    }
  };

  const handleExportMlOffers = async () => {
    try {
      const localCoupons = getMarketingCoupons();
      const { csv, emptyCols } = await generateOffersCsv(customers, localCoupons);
      downloadCsv(csv, 'offers.csv');
      if (emptyCols.length > 0) {
        alert(`Export completed successfully!\n\nThe following empty columns were added (not found in data store):\n- ${emptyCols.join('\n- ')}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to export Offers CSV');
    }
  };

  const handleExportMlCustomersRaw = async () => {
    try {
      const filteredOrders = getFilteredOrders(allOrdersRaw, startDate, endDate, selectedStore, isAdmin, user.stationName || 'All');
      const { csv, emptyCols } = await generateCustomersRawCsv(customers, filteredOrders, normMap);
      downloadCsv(csv, 'customers_raw.csv');
      if (emptyCols.length > 0) {
        alert(`Export completed successfully!\n\nThe following empty columns were added (not found in data store):\n- ${emptyCols.join('\n- ')}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to export Customers Raw CSV');
    }
  };

  const handleExportMlFeatureSnapshot = async () => {
    try {
      const localCoupons = getMarketingCoupons();
      const featureRows = await buildCustomerFeatures(
        customers,
        allOrdersRaw,
        localCoupons,
        normMap,
        snapshotDateState,
        labelWindowDays
      );
      
      const { csv, emptyCols } = generateFeaturesCsv(featureRows);
      downloadCsv(csv, 'customer_features.csv');
      
      // Leakage guard check
      const snapTime = new Date(snapshotDateState).getTime();
      const latestOrderTime = allOrdersRaw.length > 0 
        ? Math.max(...allOrdersRaw.map(o => new Date(o.date).getTime())) 
        : 0;
      const labelWindowEndTime = snapTime + labelWindowDays * 24 * 3600 * 1000;
      const labelsEmpty = labelWindowEndTime > latestOrderTime;
      
      let labelNotice = '';
      if (labelsEmpty) {
        labelNotice = '\n\n⚠️ NOTE: Label columns were left empty for these rows because the label window exceeded the latest available order date in the database (leakage prevention rule).';
      }
      
      if (emptyCols.length > 0) {
        alert(`Export completed successfully!\n\nThe following empty columns were added (not found in data store):\n- ${emptyCols.join('\n- ')}${labelNotice}`);
      } else if (labelNotice) {
        alert(`Export completed successfully!${labelNotice}`);
      }
      setIsSnapshotModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Failed to generate Feature Snapshot CSV');
    }
  };

  const [isSyncingStats, setIsSyncingStats] = useState(false);
  const handleSyncAllStats = async () => {
    if (isSyncingStats || !filteredCustomers.length) return;
    setIsSyncingStats(true);
    try {
      // Sync in small batches to avoid timeouts or issues
      const batchSize = 5;
      for (let i = 0; i < filteredCustomers.length; i += batchSize) {
        const batch = filteredCustomers.slice(i, i + batchSize);
        await Promise.all(batch.map(c => syncCustomerStats(c.phone)));
      }
      alert(`Successfully synced stats for ${filteredCustomers.length} customers.`);
      // Refresh local data by reloading
      window.location.reload(); 
    } catch (e) {
      console.error("Sync Error:", e);
      alert("Error syncing stats. Check console.");
    } finally {
      setIsSyncingStats(false);
    }
  };

  const handleCustomerClick = async (customer: Customer) => {
    setActiveCustomer(customer);
    setIsEditingProfile(false);
    setEditedProfile({
      name: customer.name,
      email: customer.email,
      birthday: customer.birthday,
      note: customer.note
    });

    const noteStr = customer.note || '';
    if (noteStr === 'STUDENT' || noteStr.startsWith('STUDENT|')) {
      const parts = noteStr.split('|');
      setEditIsStudent(true);
      setEditSchool(parts[1] || '');
      // Generate stable 8-digit hiker number from phone digits if missing
      const digits = customer.phone.replace(/\D/g, '');
      const stableNo = `HIKER-${digits.length >= 8 ? digits.slice(-8) : (digits + '87654321').slice(0, 8)}`;
      setEditHikerNo(parts[2] || stableNo);
    } else {
      setEditIsStudent(false);
      setEditSchool('');
      setEditHikerNo('');
    }
    
    // Fetch parallelly
    const [history, usual] = await Promise.all([
      fetchCustomerHistory(customer.phone),
      fetchUsualOrder(customer.phone)
    ]);
    
    setSelectedCustomerHistory(history);
    setUsualOrder(usual);
  };

  const handleSaveProfile = async () => {
    if (!activeCustomer) return;
    setIsSavingProfile(true);
    try {
      let finalNote = editedProfile.note || '';
      if (editIsStudent) {
        // Ensure hiker number exists
        const digits = activeCustomer.phone.replace(/\D/g, '');
        const stableNo = editHikerNo || `HIKER-${digits.length >= 8 ? digits.slice(-8) : (digits + '87654321').slice(0, 8)}`;
        finalNote = `STUDENT|${editSchool.trim()}|${stableNo}`;
      } else {
        if (finalNote.startsWith('STUDENT')) {
          finalNote = 'REGULAR';
        }
      }

      const updatedProfile = {
        ...editedProfile,
        note: finalNote
      };

      await updateCustomer(activeCustomer.id, updatedProfile);
      
      // Update local state
      const updatedCustomer = { ...activeCustomer, ...updatedProfile };
      setActiveCustomer(updatedCustomer);
      setCustomers(prev => prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
      setIsEditingProfile(false);
    } catch (err) {
      console.error("Failed to update customer profile:", err);
      alert("Failed to save profile changes.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    fetchStaticData();
  }, [fetchStaticData]);

  useEffect(() => {
    fetchOrders();
    fetchDeletedOrders();
    fetchFinanceData();
    fetchAdjustments();
  }, [fetchOrders, fetchDeletedOrders, fetchFinanceData, fetchAdjustments]);

  // Synchronize item normalization map with orders
  useEffect(() => {
    if (allOrdersRaw.length === 0) return;
    
    const savedMap = localStorage.getItem('MOMOMAYA_ITEM_NORMALIZATION_MAP');
    const approvedState = localStorage.getItem('MOMOMAYA_ITEM_NORMALIZATION_APPROVED') === 'true';
    
    setIsApproved(approvedState);
    
    let finalMap: Record<string, ItemNormalization> = {};
    if (savedMap) {
      try {
        finalMap = JSON.parse(savedMap);
      } catch (e) {
        console.error("Failed to parse saved normalization map:", e);
      }
    }
    
    const generated = generateItemNormalizationMap(allOrdersRaw);
    let merged = false;
    
    Object.keys(generated).forEach(key => {
      if (!finalMap[key]) {
        finalMap[key] = generated[key];
        merged = true;
      }
    });
    
    setNormMap(finalMap);
    if (merged || !savedMap) {
      localStorage.setItem('MOMOMAYA_ITEM_NORMALIZATION_MAP', JSON.stringify(finalMap));
    }
  }, [allOrdersRaw]);
  
  // Keep snapshot date state in sync with date range end date
  useEffect(() => {
    setSnapshotDateState(endDate);
  }, [endDate]);

  const handlePresetChange = (preset: DatePreset) => {
    setActivePreset(preset);
    if (preset === 'custom') {
      setCustomStart(startDate);
      setCustomEnd(endDate);
      return;
    }

    const today = getISTDate();
    let start = getISTDate();
    let end = getISTDate();

    switch (preset) {
      case 'today':
        start = today;
        end = today;
        break;
      case 'yesterday':
        const yesterday = getISTDate();
        yesterday.setDate(today.getDate() - 1);
        start = yesterday;
        end = yesterday;
        break;
      case 'last7':
        const weekAgo = getISTDate();
        weekAgo.setDate(today.getDate() - 6);
        start = weekAgo;
        end = today;
        break;
      case 'last14':
        const twoWeeksAgo = getISTDate();
        twoWeeksAgo.setDate(today.getDate() - 13);
        start = twoWeeksAgo;
        end = today;
        break;
      case 'last30':
        const monthAgo = getISTDate();
        monthAgo.setDate(today.getDate() - 29);
        start = monthAgo;
        end = today;
        break;
      case 'last90':
        const threeMonthsAgo = getISTDate();
        threeMonthsAgo.setDate(today.getDate() - 89);
        start = threeMonthsAgo;
        end = today;
        break;
      case 'thisMonth':
        const tmStart = new Date(today.getFullYear(), today.getMonth(), 1);
        start = new Date(getDateString(tmStart));
        end = today;
        break;
      case 'lastMonth':
        const lmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        start = new Date(getDateString(lmStart));
        end = new Date(getDateString(lmEnd));
        end.setHours(23, 59, 59, 999);
        break;
      case 'thisWeek':
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
        const thisMon = new Date(today);
        thisMon.setDate(diff);
        start = thisMon;
        end = getISTDate();
        break;
      case 'lastWeek':
        const lDay = today.getDay();
        const lDiff = today.getDate() - lDay + (lDay === 0 ? -13 : -6);
        const lastMon = new Date(today);
        lastMon.setDate(lDiff);
        start = lastMon;
        const lastSun = new Date(start);
        lastSun.setDate(start.getDate() + 6);
        end = lastSun;
        break;
    }
    const sStr = getDateString(start);
    const eStr = getDateString(end);
    setStartDate(sStr);
    setEndDate(eStr);
    setCustomStart(sStr);
    setCustomEnd(eStr);
  };

  useEffect(() => {
    if (searchMode === 'item' && searchTerm.length >= 2) {
      const timer = setTimeout(async () => {
        const results = await getMatchingMenuItems(searchTerm);
        setItemSuggestions(results);
        setShowSuggestions(results.length > 0);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setItemSuggestions([]);
      setShowSuggestions(false);
    }
  }, [searchTerm, searchMode]);

  const handleSearch = async (forcedBillNum?: number, forcedItemName?: string) => {
    setFoundOrder(null);
    setFoundOrdersList([]);
    setFoundOrderInitialBalance(undefined);
    setFoundOrderFinalBalance(undefined);
    setFoundOrderEarnedCoins(undefined);
    setFoundOrderNextCoupon(null);
    setSearchMessage('');
    setShowSuggestions(false);
    setIsSearching(true);
    
    try {
      const mode = forcedItemName ? 'item' : (forcedBillNum ? 'bill' : searchMode);
      const query = forcedBillNum?.toString() || forcedItemName || searchTerm;
      
      if (!query.trim()) {
        setIsSearching(false);
        return;
      }

      const sDate = useDateFilter ? startDate : undefined;
      const eDate = useDateFilter ? endDate : undefined;

      if (mode === 'coupon' || (mode === 'bill' && !forcedBillNum && isNaN(parseInt(query, 10)) && query.trim().length >= 2)) {
        const results = await getOrdersByCouponCode(query, sDate, eDate);
        if (results.length > 0) {
          setFoundOrdersList(results);
          if (results.length === 1) {
            await displayOrderDetails(results[0]);
          }
        } else {
          setSearchMessage(`No orders found with coupon code "${query}"${useDateFilter ? ` between ${sDate} and ${eDate}` : ''}.`);
        }
      } else if (mode === 'bill') {
        const billNum = parseInt(query, 10);
        if (isNaN(billNum)) {
          setSearchMessage('Please enter a valid bill number.');
          setIsSearching(false);
          return;
        };

        const order = await getOrderByBillNumber(billNum);
        // Filter by date if needed
        if (order) {
          if (useDateFilter) {
            const oDate = getISTDateString(order.date);
            if (oDate >= (sDate || '') && oDate <= (eDate || '')) {
              await displayOrderDetails(order);
            } else {
              setSearchMessage(`Bill #${billNum} exists but is outside the selected date range (${sDate} to ${eDate}).`);
            }
          } else {
            await displayOrderDetails(order);
          }
        } else {
          setSearchMessage(`Bill #${billNum} was not found in the records.`);
        }
      } else {
        const results = await getOrdersByItemName(query, sDate, eDate);
        if (results.length > 0) {
          setFoundOrdersList(results);
          if (results.length === 1) {
            await displayOrderDetails(results[0]);
          }
        } else {
          setSearchMessage(`No orders found containing "${query}"${useDateFilter ? ` between ${sDate} and ${eDate}` : ''}.`);
        }
      }
    } catch (err) {
      console.error("Search failed:", err);
      setSearchMessage('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const displayOrderDetails = async (order: CompletedOrder) => {
    setFoundOrder(order);
    setSearchTerm('');
    
    // Calculate historical balance at the time of this order
    if (order.customerPhone) {
      const [customer, history] = await Promise.all([
        getCustomerByPhone(order.customerPhone),
        fetchCustomerHistory(order.customerPhone)
      ]);

      // Combine orders so this order is included even if it was voided/deleted
      const allOrders = [...history];
      if (!allOrders.some(h => h.id === order.id)) {
        allOrders.push(order);
      }

      // Sort chronologically ascending by order date
      const sortedHistory = allOrders.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const targetIdx = sortedHistory.findIndex(h => h.id === order.id);
      const totalAfter = targetIdx !== -1 ? targetIdx + 1 : sortedHistory.length;

      // Chronological balance reconstruction:
      // Each order generates flat 8% MinCoins on paid cash amount.
      // Core rule: MinCoins received in a bill cannot be used in the same bill, but must be used in the next order.
      // Therefore, if coins were redeemed in an order, the customer's initial balance before that order MUST have been at least the redeemed amount.
      const totalNetChange = sortedHistory.reduce((sum, o) => {
        const cash = o.type === 'DELIVERY' && o.manualTotal != null 
          ? o.manualTotal 
          : o.items.reduce((acc, item) => acc + (item.paidWithCoins ? 0 : item.price * item.quantity), 0);
        const earned = Math.floor(cash * 0.08);
        const redeemed = o.items.reduce((acc, item) => acc + (item.paidWithCoins ? (item.coinsPrice || 0) * item.quantity : 0), 0);
        return sum + (earned - redeemed);
      }, 0);

      const customerKnownCoins = customer?.minCoins ?? 0;
      let runningBalance = Math.max(0, customerKnownCoins - totalNetChange);
      let targetInitialBal = 0;
      let targetEarnedCoins = 0;
      let targetFinalBal = 0;

      for (let i = 0; i < sortedHistory.length; i++) {
        const o = sortedHistory[i];
        const cash = o.type === 'DELIVERY' && o.manualTotal != null 
          ? o.manualTotal 
          : o.items.reduce((acc, item) => acc + (item.paidWithCoins ? 0 : item.price * item.quantity), 0);
        const earned = Math.floor(cash * 0.08);
        const redeemed = o.items.reduce((acc, item) => acc + (item.paidWithCoins ? (item.coinsPrice || 0) * item.quantity : 0), 0);

        // If coins were redeemed, running balance had to be at least the redeemed amount
        if (redeemed > 0 && runningBalance < redeemed) {
          runningBalance = redeemed;
        }

        const initialForThisOrder = runningBalance;
        const finalForThisOrder = Math.max(0, initialForThisOrder - redeemed) + earned;

        if (i === targetIdx) {
          targetInitialBal = initialForThisOrder;
          targetEarnedCoins = earned;
          targetFinalBal = finalForThisOrder;
        }

        runningBalance = finalForThisOrder;
      }

      setFoundOrderInitialBalance(targetInitialBal);
      setFoundOrderFinalBalance(targetFinalBal);
      setFoundOrderEarnedCoins(targetEarnedCoins);

      // Next order coupon historical state
      let nextCoupon = null;
      if (totalAfter === 1) nextCoupon = { code: `DISC15-${order.customerPhone.slice(-4)}`, discount: '15%', forOrder: 2 };
      else if (totalAfter === 2) nextCoupon = { code: `DISC10-${order.customerPhone.slice(-4)}`, discount: '10%', forOrder: 3 };
      else if (totalAfter === 3) nextCoupon = { code: `DISC5-${order.customerPhone.slice(-4)}`, discount: '5%', forOrder: 4 };
      
      setFoundOrderNextCoupon(nextCoupon);
    }
  };

  const confirmDelete = async (reason: string) => {
    if (orderToDelete) {
      await deleteOrderByBillNumber(orderToDelete.billNumber, reason);
      setIsDeleteModalOpen(false);
      fetchOrders();
      fetchDeletedOrders();
    }
  };

  const financialData = useMemo(() => {
    let revenue = 0;
    let deliveryRevenue = 0;
    let deliveryDiscount = 0;
    let deliveryMenuTotal = 0;
    
    let inStoreCogs = 0;
    let deliveryCogs = 0;
    
    let inStoreOrdersCount = 0;
    let deliveryOrdersCount = 0;
    let studentOrdersCount = 0;
    
    let reviewsCollectedCount = 0;
    let reviewsDeniedCount = 0;

    let dineInOrdersCount = 0;
    let dineInReviewsCollected = 0;
    let takeawayOrdersCount = 0;
    let takeawayReviewsCollected = 0;

    // Add-on & Drink Attach tracking
    let addonOrdersCount = 0;
    let offlineOrdersCount = 0;
    let offlineAddonOrdersCount = 0;
    let onlineOrdersCount = 0;
    let onlineAddonOrdersCount = 0;

    let takeawayAddonOrders = 0;
    let dineInAddonOrders = 0;
    let deliveryAddonOrders = 0;

    let drinkOrdersCount = 0;
    let packagedDrinkOrdersCount = 0;
    let nonPackagedDrinkOrdersCount = 0;

    let dineInDrinkOrders = 0;
    let dineInPackagedDrinkOrders = 0;
    let dineInNonPackagedDrinkOrders = 0;

    let takeawayDrinkOrders = 0;
    let takeawayPackagedDrinkOrders = 0;
    let takeawayNonPackagedDrinkOrders = 0;

    let deliveryDrinkOrders = 0;
    let deliveryPackagedDrinkOrders = 0;
    let deliveryNonPackagedDrinkOrders = 0;

    // Per-brand Delivery stats (MinMomos vs MinChicken)
    const createBrandAcc = () => ({
      revenue: 0,
      discount: 0,
      menuTotal: 0,
      cogs: 0,
      ordersCount: 0,
      addonOrders: 0,
      drinkOrders: 0,
      packagedDrinkOrders: 0,
      nonPackagedDrinkOrders: 0
    });
    const brandAcc = {
      MINMOMOS: createBrandAcc(),
      MINCHICKEN: createBrandAcc()
    };

    const breakdown: Record<PaymentMethod, number> = { 'Cash': 0, 'UPI': 0, 'Card': 0 };

    displayOrders.forEach(order => {
      const orderCogs = order.items.reduce((acc, item) => acc + (item.cost ?? 0) * item.quantity, 0);

      if (isStudentFreeMojitoOrder(order)) {
        studentOrdersCount++;
        inStoreCogs += Math.round(orderCogs);
      } else if (order.type === 'DELIVERY') {
        deliveryOrdersCount++;
        deliveryCogs += Math.round(orderCogs);
        
        const dRev = order.manualTotal != null ? Math.round(order.manualTotal) : Math.round(order.total);
        const dDiscount = order.manualDiscount || 0;
        const dMenuTotal = Math.round(order.total || 0);
        deliveryRevenue += dRev;
        deliveryDiscount += dDiscount;
        deliveryMenuTotal += dMenuTotal;

        const resolvedBrand = (order.deliveryBrand || '').toUpperCase() === 'MINCHICKEN' ? 'MINCHICKEN' : 'MINMOMOS';
        const b = brandAcc[resolvedBrand];
        b.ordersCount++;
        b.cogs += Math.round(orderCogs);
        b.revenue += dRev;
        b.discount += dDiscount;
        b.menuTotal += dMenuTotal;
        
        // Use manual total for breakdown for consistency if it's a delivery order
        if (order.paymentMethod && order.paymentMethod in breakdown) {
          breakdown[order.paymentMethod as PaymentMethod] += dRev;
        }
      } else {
        inStoreOrdersCount++;
        inStoreCogs += Math.round(orderCogs);
        
        const roundedTotal = Math.round(order.total);
        revenue += roundedTotal;
        
        if (order.status === 'REVIEW_COLLECTED') {
          reviewsCollectedCount++;
        } else if (order.status === 'REVIEW_DENIED') {
          reviewsDeniedCount++;
        }

        if (order.paymentMethod && order.paymentMethod in breakdown) {
          breakdown[order.paymentMethod as PaymentMethod] += roundedTotal;
        }
      }

      // Track Dine-In, Takeaway, Add-ons and Drink Attach rates for commercial orders
      if (!isStudentFreeMojitoOrder(order)) {
        const hasAddon = (order.items || []).some(it => {
          if (it.is_addon_offer) return true;
          const name = it.name || '';
          const mId = it.menuItemId || '';
          return (
            mId.startsWith('addon-') ||
            mId === 'add-fries' ||
            mId === 'add-mojito' ||
            mId === 'add-popcorn' ||
            name.startsWith('Add ') ||
            name.includes('(Add-on Offer)') ||
            name.includes('Add-on') ||
            name.includes('+2 ') ||
            name.includes('+3 ') ||
            name.includes('Special Offer')
          );
        });

        const hasPackagedDrink = (order.items || []).some(it => isPackagedDrinkItem(it));
        const hasNonPackagedDrink = (order.items || []).some(it => isNonPackagedDrinkItem(it));
        const hasDrink = hasPackagedDrink || hasNonPackagedDrink;

        if (hasAddon) addonOrdersCount++;
        if (hasDrink) drinkOrdersCount++;
        if (hasPackagedDrink) packagedDrinkOrdersCount++;
        if (hasNonPackagedDrink) nonPackagedDrinkOrdersCount++;

        if (order.type === 'DINE_IN' || order.type === 'TAKEAWAY') {
          offlineOrdersCount++;
          if (hasAddon) offlineAddonOrdersCount++;
        } else if (order.type === 'DELIVERY') {
          onlineOrdersCount++;
          if (hasAddon) onlineAddonOrdersCount++;
        }

        if (order.type === 'TAKEAWAY') {
          takeawayOrdersCount++;
          if (hasAddon) takeawayAddonOrders++;
          if (hasDrink) takeawayDrinkOrders++;
          if (hasPackagedDrink) takeawayPackagedDrinkOrders++;
          if (hasNonPackagedDrink) takeawayNonPackagedDrinkOrders++;
          if (order.status === 'REVIEW_COLLECTED') {
            takeawayReviewsCollected++;
          }
        } else if (order.type === 'DINE_IN') {
          dineInOrdersCount++;
          if (hasAddon) dineInAddonOrders++;
          if (hasDrink) dineInDrinkOrders++;
          if (hasPackagedDrink) dineInPackagedDrinkOrders++;
          if (hasNonPackagedDrink) dineInNonPackagedDrinkOrders++;
          if (order.status === 'REVIEW_COLLECTED') {
            dineInReviewsCollected++;
          }
        } else if (order.type === 'DELIVERY') {
          if (hasAddon) deliveryAddonOrders++;
          if (hasDrink) deliveryDrinkOrders++;
          if (hasPackagedDrink) deliveryPackagedDrinkOrders++;
          if (hasNonPackagedDrink) deliveryNonPackagedDrinkOrders++;

          const resolvedBrand = (order.deliveryBrand || '').toUpperCase() === 'MINCHICKEN' ? 'MINCHICKEN' : 'MINMOMOS';
          const b = brandAcc[resolvedBrand];
          if (hasAddon) b.addonOrders++;
          if (hasDrink) b.drinkOrders++;
          if (hasPackagedDrink) b.packagedDrinkOrders++;
          if (hasNonPackagedDrink) b.nonPackagedDrinkOrders++;
        }
      }
    });

    const inStoreProfit = revenue - inStoreCogs;
    const deliveryProfit = deliveryRevenue - deliveryCogs;
    const combinedCogs = inStoreCogs + deliveryCogs;
    const combinedRevenue = revenue + deliveryRevenue;
    const combinedProfit = combinedRevenue - combinedCogs;
    const reviewCollectedPercent = inStoreOrdersCount > 0 ? (reviewsCollectedCount / inStoreOrdersCount) * 100 : 0;
    
    const nonStudentTotalOrders = orders.length - studentOrdersCount;
    const deliveryNetPayout = Math.round(deliveryRevenue * 0.55);
    const effectiveDeliveryDiscountPercent = deliveryMenuTotal > 0
      ? ((deliveryMenuTotal - (deliveryRevenue * 0.55)) / deliveryMenuTotal) * 100
      : 0;

    const buildBrandSummary = (b: {
      revenue: number;
      discount: number;
      menuTotal: number;
      cogs: number;
      ordersCount: number;
      addonOrders: number;
      drinkOrders: number;
      packagedDrinkOrders: number;
      nonPackagedDrinkOrders: number;
    }) => {
      const netPayout = Math.round(b.revenue * 0.55);
      const profit = b.revenue - b.cogs;
      const effectiveDiscountPercent = b.menuTotal > 0
        ? ((b.menuTotal - (b.revenue * 0.55)) / b.menuTotal) * 100
        : 0;
      return {
        revenue: b.revenue,
        discount: b.discount,
        menuTotal: b.menuTotal,
        cogs: b.cogs,
        ordersCount: b.ordersCount,
        netPayout,
        profit,
        effectiveDiscountPercent,
        addonOrders: b.addonOrders,
        addonPercent: b.ordersCount > 0 ? (b.addonOrders / b.ordersCount) * 100 : 0,
        drinkOrders: b.drinkOrders,
        drinkAttachPercent: b.ordersCount > 0 ? (b.drinkOrders / b.ordersCount) * 100 : 0,
        packagedDrinkOrders: b.packagedDrinkOrders,
        packagedDrinkPercent: b.ordersCount > 0 ? (b.packagedDrinkOrders / b.ordersCount) * 100 : 0,
        nonPackagedDrinkOrders: b.nonPackagedDrinkOrders,
        nonPackagedDrinkPercent: b.ordersCount > 0 ? (b.nonPackagedDrinkOrders / b.ordersCount) * 100 : 0
      };
    };

    const totalCommercialOrders = inStoreOrdersCount + deliveryOrdersCount;
    const addonPercent = totalCommercialOrders > 0 ? (addonOrdersCount / totalCommercialOrders) * 100 : 0;
    const offlineAddonPercent = offlineOrdersCount > 0 ? (offlineAddonOrdersCount / offlineOrdersCount) * 100 : 0;
    const onlineAddonPercent = onlineOrdersCount > 0 ? (onlineAddonOrdersCount / onlineOrdersCount) * 100 : 0;

    const takeawayAddonPercent = takeawayOrdersCount > 0 ? (takeawayAddonOrders / takeawayOrdersCount) * 100 : 0;
    const dineInAddonPercent = dineInOrdersCount > 0 ? (dineInAddonOrders / dineInOrdersCount) * 100 : 0;
    const deliveryAddonPercent = deliveryOrdersCount > 0 ? (deliveryAddonOrders / deliveryOrdersCount) * 100 : 0;

    const overallDrinkAttachPercent = totalCommercialOrders > 0 ? (drinkOrdersCount / totalCommercialOrders) * 100 : 0;
    const packagedDrinkAttachPercent = totalCommercialOrders > 0 ? (packagedDrinkOrdersCount / totalCommercialOrders) * 100 : 0;
    const nonPackagedDrinkAttachPercent = totalCommercialOrders > 0 ? (nonPackagedDrinkOrdersCount / totalCommercialOrders) * 100 : 0;

    const dineInDrinkAttachPercent = dineInOrdersCount > 0 ? (dineInDrinkOrders / dineInOrdersCount) * 100 : 0;
    const dineInPackagedDrinkPercent = dineInOrdersCount > 0 ? (dineInPackagedDrinkOrders / dineInOrdersCount) * 100 : 0;
    const dineInNonPackagedDrinkPercent = dineInOrdersCount > 0 ? (dineInNonPackagedDrinkOrders / dineInOrdersCount) * 100 : 0;

    const takeawayDrinkAttachPercent = takeawayOrdersCount > 0 ? (takeawayDrinkOrders / takeawayOrdersCount) * 100 : 0;
    const takeawayPackagedDrinkPercent = takeawayOrdersCount > 0 ? (takeawayPackagedDrinkOrders / takeawayOrdersCount) * 100 : 0;
    const takeawayNonPackagedDrinkPercent = takeawayOrdersCount > 0 ? (takeawayNonPackagedDrinkOrders / takeawayOrdersCount) * 100 : 0;

    const deliveryDrinkAttachPercent = deliveryOrdersCount > 0 ? (deliveryDrinkOrders / deliveryOrdersCount) * 100 : 0;
    const deliveryPackagedDrinkPercent = deliveryOrdersCount > 0 ? (deliveryPackagedDrinkOrders / deliveryOrdersCount) * 100 : 0;
    const deliveryNonPackagedDrinkPercent = deliveryOrdersCount > 0 ? (deliveryNonPackagedDrinkOrders / deliveryOrdersCount) * 100 : 0;

    const deliveryByBrand = {
      ALL: buildBrandSummary({
        revenue: deliveryRevenue,
        discount: deliveryDiscount,
        menuTotal: deliveryMenuTotal,
        cogs: deliveryCogs,
        ordersCount: deliveryOrdersCount,
        addonOrders: deliveryAddonOrders,
        drinkOrders: deliveryDrinkOrders,
        packagedDrinkOrders: deliveryPackagedDrinkOrders,
        nonPackagedDrinkOrders: deliveryNonPackagedDrinkOrders
      }),
      MINMOMOS: buildBrandSummary(brandAcc.MINMOMOS),
      MINCHICKEN: buildBrandSummary(brandAcc.MINCHICKEN)
    };

    return { 
      totalRevenue: revenue, 
      deliveryRevenue: deliveryRevenue,
      deliveryDiscount: deliveryDiscount,
      deliveryMenuTotal: deliveryMenuTotal,
      deliveryNetPayout,
      effectiveDeliveryDiscountPercent,
      totalCogs: combinedCogs,
      grossProfit: combinedProfit,
      profitMargin: combinedRevenue > 0 ? (combinedProfit / combinedRevenue) * 100 : 0,
      averageOrderValue: nonStudentTotalOrders > 0 ? combinedRevenue / nonStudentTotalOrders : 0,
      paymentBreakdown: breakdown,
      totalOrders: nonStudentTotalOrders,
      
      // Detailed new properties for the expanded metrics view
      inStoreOrdersCount,
      inStoreRevenue: revenue,
      inStoreCogs,
      inStoreProfit,
      
      deliveryOrdersCount,
      deliveryCogs,
      deliveryProfit,
      deliveryByBrand,
      
      combinedOrdersCount: nonStudentTotalOrders,
      combinedRevenue,
      combinedCogs,
      combinedProfit,
      
      reviewsCollectedCount,
      reviewsDeniedCount,
      reviewCollectedPercent,

      // Dine-in to be displayed separately
      dineInOrdersCount,
      dineInReviewsCollected,
      dineInReviewPercent: dineInOrdersCount > 0 ? (dineInReviewsCollected / dineInOrdersCount) * 100 : 0,

      // Takeaway to be displayed separately
      takeawayOrdersCount,
      takeawayReviewsCollected,
      takeawayReviewPercent: takeawayOrdersCount > 0 ? (takeawayReviewsCollected / takeawayOrdersCount) * 100 : 0,
      
      // Add-on & Drink Attach Rate Metrics
      addonOrdersCount,
      addonPercent,
      offlineOrdersCount,
      offlineAddonOrdersCount,
      offlineAddonPercent,
      onlineOrdersCount,
      onlineAddonOrdersCount,
      onlineAddonPercent,

      takeawayAddonOrders,
      takeawayAddonPercent,
      dineInAddonOrders,
      dineInAddonPercent,
      deliveryAddonOrders,
      deliveryAddonPercent,

      drinkOrdersCount,
      overallDrinkAttachPercent,
      packagedDrinkOrdersCount,
      packagedDrinkAttachPercent,
      nonPackagedDrinkOrdersCount,
      nonPackagedDrinkAttachPercent,

      dineInDrinkOrders,
      dineInDrinkAttachPercent,
      dineInPackagedDrinkOrders,
      dineInPackagedDrinkPercent,
      dineInNonPackagedDrinkOrders,
      dineInNonPackagedDrinkPercent,

      takeawayDrinkOrders,
      takeawayDrinkAttachPercent,
      takeawayPackagedDrinkOrders,
      takeawayPackagedDrinkPercent,
      takeawayNonPackagedDrinkOrders,
      takeawayNonPackagedDrinkPercent,

      deliveryDrinkOrders,
      deliveryDrinkAttachPercent,
      deliveryPackagedDrinkOrders,
      deliveryPackagedDrinkPercent,
      deliveryNonPackagedDrinkOrders,
      deliveryNonPackagedDrinkPercent,

      studentOrdersCount
    };
  }, [displayOrders]);

  const comparisonData = useMemo(() => {
    if (!isAdmin) return [];
    const groups: Record<string, { revenue: number, orders: number, profit: number }> = {};
    const visibleRaw = allOrdersRaw.filter(o => {
      const d = getISTDateString(o.date);
      if (d < startDate || d > endDate) return false;
      if (segmentFilter === 'STUDENT' && !checkIsOrderStudent(o)) return false;
      if (segmentFilter === 'REGULAR' && checkIsOrderStudent(o)) return false;
      return true;
    });

    visibleRaw.forEach(order => {
      const actualRev = order.type === 'DELIVERY' && order.manualTotal != null ? order.manualTotal : order.total;
      const roundedTotal = Math.round(actualRev);
      const groupKey = compareBy === 'STORE' ? order.branchName : (order.cashierName || 'System/Unknown');
      
      if (!groups[groupKey]) groups[groupKey] = { revenue: 0, orders: 0, profit: 0 };
      groups[groupKey].revenue += roundedTotal;
      groups[groupKey].orders += 1;
      const orderCogs = order.items?.reduce((acc, item) => acc + (item.cost ?? 0) * item.quantity, 0) || 0;
      groups[groupKey].profit += (roundedTotal - Math.round(orderCogs));
    });
    return Object.entries(groups).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.revenue - a.revenue);
  }, [isAdmin, allOrdersRaw, startDate, endDate, compareBy, segmentFilter, checkIsOrderStudent]);

  const customerOverview = useMemo(() => {
    const totalCount = displayCustomers.length;
    const totalLTV = displayCustomers.reduce((acc, c) => acc + (c.totalSpent || 0), 0);
    const avgLTV = totalCount > 0 ? totalLTV / totalCount : 0;
    const repeatCount = displayCustomers.filter(c => (c.totalOrders || 0) > 1).length;
    const retentionRate = totalCount > 0 ? (repeatCount / totalCount) * 100 : 0;
    
    // New customers in range
    const newInRange = displayCustomers.filter(c => {
      if (!c.joinedDate) return false;
      const d = getISTDateString(c.joinedDate);
      return d >= startDate && d <= endDate;
    }).length;

    // 90-Day Active MAU count (ordered within last 90 days)
    const d90AgoMs = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const mauCount = displayCustomers.filter(c => {
      if (!c.lastVisit) return false;
      return new Date(c.lastVisit).getTime() >= d90AgoMs;
    }).length;
    const mauPct = totalCount > 0 ? (mauCount / totalCount) * 100 : 0;

    return {
      totalCount,
      totalLTV,
      avgLTV,
      retentionRate,
      newInRange,
      mauCount,
      mauPct
    };
  }, [displayCustomers, startDate, endDate]);

  const realBalance = useMemo(() => {
    if (!activeCustomer) return 0;
    if (activeCustomer.minCoins !== null && activeCustomer.minCoins !== undefined) {
      return Number(activeCustomer.minCoins);
    }
    const spent = selectedCustomerHistory.reduce((acc, order) => {
      return acc + order.items.reduce((sum, item) => sum + (item.paidWithCoins ? (item.coinsPrice || 0) * item.quantity : 0), 0);
    }, 0);
    return Math.round(calculateTotalMinCoins(activeCustomer.totalSpent || 0, spent));
  }, [selectedCustomerHistory, activeCustomer]);

  const insightData = useMemo(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const heatmap: Record<number, Record<number, { revenue: number, orders: number }>> = {};
    
    // Initialize heatmap
    for (let d = 0; d < 7; d++) {
      heatmap[d] = {};
      for (let h = 0; h < 24; h++) {
        heatmap[d][h] = { revenue: 0, orders: 0 };
      }
    }

    displayOrders.forEach(o => {
      const day = getISTDay(o.date);
      const hour = getISTHour(o.date);
      if (heatmap[day] && heatmap[day][hour]) {
        heatmap[day][hour].revenue += o.total;
        heatmap[day][hour].orders += 1;
      }
    });

    // Summary Stats
    let bestDayIdx = 0;
    let maxDayRev = 0;
    let bestSlot = { day: 0, hour: 0, rev: 0 };
    let busiestDayIdx = 0;
    let maxOrdersCount = 0;

    for (let d = 0; d < 7; d++) {
      let dayTotal = 0;
      let dayOrders = 0;
      for (let h = 0; h < 24; h++) {
        dayTotal += heatmap[d][h].revenue;
        dayOrders += heatmap[d][h].orders;
        if (heatmap[d][h].revenue > bestSlot.rev) {
          bestSlot = { day: d, hour: h, rev: heatmap[d][h].revenue };
        }
      }
      if (dayTotal > maxDayRev) {
        maxDayRev = dayTotal;
        bestDayIdx = d;
      }
      if (dayOrders > maxOrdersCount) {
        maxOrdersCount = dayOrders;
        busiestDayIdx = d;
      }
    }

    return {
      heatmap,
      bestDay: days[bestDayIdx],
      bestSlot: `${days[bestSlot.day]} @ ${bestSlot.hour}:00`,
      busiestDay: days[busiestDayIdx],
      days
    };
  }, [displayOrders]);

  const filteredCustomers = useMemo(() => {
    const term = customerSearchTerm.trim().toLowerCase();
    const cleanTermAlnum = term.replace(/[^a-z0-9]/g, '');

    let filtered = customers;

    if (term) {
      filtered = filtered.filter(c => {
        // Match phone
        const phone = (c.phone || '').toLowerCase();
        const cleanPhone = phone.replace(/\D/g, '');
        if (phone.includes(term) || (cleanTermAlnum && cleanPhone.includes(cleanTermAlnum))) {
          return true;
        }

        // Match referral coupon (e.g. MOMO-8625-PDV, 8625, PDV)
        if (c.referralCode) {
          const ref = c.referralCode.toLowerCase();
          const cleanRef = ref.replace(/[^a-z0-9]/g, '');
          if (ref.includes(term) || (cleanTermAlnum && cleanRef.includes(cleanTermAlnum))) {
            return true;
          }
        }

        // Match customer name
        if (c.name && c.name.toLowerCase().includes(term)) {
          return true;
        }

        // Match gang coupon code
        if (c.gangCouponCode) {
          const gang = c.gangCouponCode.toLowerCase();
          const cleanGang = gang.replace(/[^a-z0-9]/g, '');
          if (gang.includes(term) || (cleanTermAlnum && cleanGang.includes(cleanTermAlnum))) {
            return true;
          }
        }

        // Match welcome coupon code
        if (c.welcomeCouponCode) {
          const wel = c.welcomeCouponCode.toLowerCase();
          const cleanWel = wel.replace(/[^a-z0-9]/g, '');
          if (wel.includes(term) || (cleanTermAlnum && cleanWel.includes(cleanTermAlnum))) {
            return true;
          }
        }

        return false;
      });
    }
    
    // Type Filter (Student / Regular) - respect either customerTypeFilter or global segmentFilter
    const effectiveTypeFilter = segmentFilter !== 'ALL' ? segmentFilter : customerTypeFilter;
    if (effectiveTypeFilter === 'STUDENT') {
      filtered = filtered.filter(c => isStudentCustomer(c));
    } else if (effectiveTypeFilter === 'REGULAR') {
      filtered = filtered.filter(c => !isStudentCustomer(c));
    }
    
    // Classification Filter
    if (customerClassFilter !== 'ALL') {
      filtered = filtered.filter(c => {
        const phone = normalizePhone(c.phone);
        const stats = customerOrderStats[phone];
        if (!stats || stats.total === 0) return customerClassFilter === 'UNCLASSIFIED';
        
        const dineInRate = stats.DINE_IN / stats.total;
        const takeawayRate = stats.TAKEAWAY / stats.total;
        const deliveryRate = stats.DELIVERY / stats.total;
        const minmomosRate = (stats.DELIVERY_MINMOMOS || 0) / stats.total;
        const minchickenRate = (stats.DELIVERY_MINCHICKEN || 0) / stats.total;
        
        if (customerClassFilter === 'DELIVERY_MINMOMOS') return minmomosRate > 0.7;
        if (customerClassFilter === 'DELIVERY_MINCHICKEN') return minchickenRate > 0.7;
        // Use a 70% threshold for classification. 
        // For customers with only 1 order, rate will be 100%, so they will be correctly classified.
        if (dineInRate > 0.7) return customerClassFilter === 'DINE_IN';
        if (takeawayRate > 0.7) return customerClassFilter === 'TAKEAWAY';
        if (deliveryRate > 0.7) return customerClassFilter === 'DELIVERY';
        return customerClassFilter === 'UNCLASSIFIED';
      });
    }

    // Recency / 90-Day MAU Filter
    if (customerRecencyFilter !== 'ALL') {
      const nowMs = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      filtered = filtered.filter(c => {
        const lvTime = c.lastVisit ? new Date(c.lastVisit).getTime() : 0;
        const daysSinceLast = lvTime > 0 ? (nowMs - lvTime) / oneDayMs : 999;
        if (customerRecencyFilter === 'POWER_30D') return daysSinceLast <= 30;
        if (customerRecencyFilter === 'MAU_90D') return daysSinceLast <= 90;
        if (customerRecencyFilter === 'COOLING_90D') return daysSinceLast > 60 && daysSinceLast <= 90;
        if (customerRecencyFilter === 'DORMANT') return daysSinceLast > 90 || lvTime === 0;
        return true;
      });
    }

    // Range Filters
    if (minLtv) filtered = filtered.filter(c => (c.totalSpent ?? 0) >= Number(minLtv));
    if (maxLtv) filtered = filtered.filter(c => (c.totalSpent ?? 0) <= Number(maxLtv));
    if (minOrders) filtered = filtered.filter(c => (c.totalOrders ?? 0) >= Number(minOrders));
    if (maxOrders) filtered = filtered.filter(c => (c.totalOrders ?? 0) <= Number(maxOrders));

    // Joined Between Dates Filter
    if (customerJoinedStart || customerJoinedEnd) {
      filtered = filtered.filter(c => {
        if (!c.joinedDate) return false;
        const d = getISTDateString(c.joinedDate);
        const startMatch = customerJoinedStart ? d >= customerJoinedStart : true;
        const endMatch = customerJoinedEnd ? d <= customerJoinedEnd : true;
        return startMatch && endMatch;
      });
    }

    // Ordered Between Dates Filter
    if (customerActivityStart || customerActivityEnd) {
      const activePhones = new Set<string>();
      allOrdersRaw.forEach(o => {
        if (!o.customerPhone) return;
        const d = getISTDateString(o.date);
        const startMatch = customerActivityStart ? d >= customerActivityStart : true;
        const endMatch = customerActivityEnd ? d <= customerActivityEnd : true;
        if (startMatch && endMatch) {
          activePhones.add(o.customerPhone);
        }
      });
      filtered = filtered.filter(c => activePhones.has(c.phone));
    }

    // Sorting
    return filtered.sort((a, b) => {
      let valA: any = a[customerSortField];
      let valB: any = b[customerSortField];

      if (customerSortField === 'joinedDate' || customerSortField === 'lastVisit') {
        valA = new Date(valA || 0).getTime();
        valB = new Date(valB || 0).getTime();
      } else {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
      }

      return customerSortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [customers, customerSearchTerm, customerSortField, customerSortOrder, minLtv, maxLtv, minOrders, maxOrders, customerJoinedStart, customerJoinedEnd, customerActivityStart, customerActivityEnd, allOrdersRaw, customerClassFilter, customerTypeFilter, customerRecencyFilter, customerOrderStats, segmentFilter]);

  const foundOrderCoupon = useMemo(() => {
    if (!foundOrder) return null;
    return foundOrder.appliedCouponCode || extractCouponCodeFromOrder(foundOrder);
  }, [foundOrder]);

  return (
    <div className="p-4 lg:p-8 h-full bg-brand-cream overflow-y-auto no-scrollbar pb-24 lg:pb-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
          <div>
            <h2 className="text-3xl lg:text-5xl font-black text-brand-brown tracking-tighter italic uppercase leading-none">BUSINESS <span className="text-brand-red">PEAK</span></h2>
            <p className="text-[8px] lg:text-[10px] font-bold text-brand-brown/40 uppercase tracking-[0.4em] mt-2">Intelligence Dashboard</p>
          </div>
          
          <div className="flex flex-col gap-4 w-full lg:w-auto">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1 bg-white/50 p-1 rounded-xl self-start border border-brand-stone">
                  <button 
                    onClick={() => setSearchMode('bill')}
                    className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${searchMode === 'bill' ? 'bg-brand-brown text-brand-yellow shadow-sm' : 'text-brand-brown/40 hover:bg-brand-brown/10'}`}
                  >
                    By Bill #
                  </button>
                  <button 
                    onClick={() => setSearchMode('coupon')}
                    className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${searchMode === 'coupon' ? 'bg-brand-brown text-brand-yellow shadow-sm' : 'text-brand-brown/40 hover:bg-brand-brown/10'}`}
                  >
                    By Coupon
                  </button>
                  <button 
                    onClick={() => setSearchMode('item')}
                    className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${searchMode === 'item' ? 'bg-brand-brown text-brand-yellow shadow-sm' : 'text-brand-brown/40 hover:bg-brand-brown/10'}`}
                  >
                    By Item
                  </button>
                </div>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-8 h-4 rounded-full relative transition-colors ${useDateFilter ? 'bg-brand-red' : 'bg-brand-stone'}`}>
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={useDateFilter} 
                      onChange={() => setUseDateFilter(!useDateFilter)} 
                    />
                    <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${useDateFilter ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                  <span className="text-[8px] font-black text-brand-brown uppercase tracking-widest">Filter by Dashboard Range</span>
                </label>
              </div>

              <div className="relative">
                <div className="flex items-center gap-2 bg-white shadow-xl p-2 rounded-2xl border-4 border-brand-brown">
                  <input 
                      type={searchMode === 'bill' ? "number" : "text"} 
                      placeholder={searchMode === 'bill' ? "SEARCH BILL #" : (searchMode === 'coupon' ? "SEARCH COUPON (e.g. MOMO-8625)" : "SEARCH ITEM NAME")} 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      onFocus={() => searchMode === 'item' && itemSuggestions.length > 0 && setShowSuggestions(true)}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      className="bg-transparent text-[10px] font-black uppercase px-4 py-2 outline-none w-52"
                  />
                  <button 
                    onClick={() => handleSearch()} 
                    disabled={isSearching}
                    className="bg-brand-brown text-brand-yellow px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {isSearching ? '...' : 'Find'}
                  </button>
                </div>

                {showSuggestions && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-brand-brown rounded-xl shadow-2xl z-[110] overflow-hidden max-h-60 overflow-y-auto no-scrollbar">
                    {itemSuggestions.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setSearchTerm(item);
                          handleSearch(undefined, item);
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-5 py-3 text-[10px] font-black text-brand-brown uppercase tracking-wider hover:bg-brand-brown hover:text-brand-yellow transition-colors border-b border-brand-stone last:border-0"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 bg-white/50 p-2 rounded-2xl lg:rounded-3xl border border-brand-stone">
              {(['today', 'yesterday', 'thisWeek', 'lastWeek', 'last7', 'last14', 'last30', 'last90', 'thisMonth', 'lastMonth', 'custom'] as DatePreset[]).map(p => (
                <button key={p} onClick={() => handlePresetChange(p)} className={`px-3 lg:px-4 py-2 text-[8px] lg:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activePreset === p ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-brown/10'}`}>
                  {p === 'last90' ? '90 Days' : p}
                </button>
              ))}
              {activePreset === 'custom' && (
                <div className="flex items-center gap-2 pl-2 lg:pl-4 border-l border-brand-stone ml-2">
                  <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-transparent text-[8px] lg:text-[10px] font-black uppercase p-1 outline-none" />
                  <span className="text-brand-brown/20">-</span>
                  <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-transparent text-[8px] lg:text-[10px] font-black uppercase p-1 outline-none" />
                  <button 
                    onClick={() => {
                      if (customStart && customEnd) {
                        setStartDate(customStart);
                        setEndDate(customEnd);
                      }
                    }}
                    className="bg-brand-brown text-brand-yellow px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              )}
              <button
                onClick={() => {
                  ordersCacheRef.current.clear();
                  deletedOrdersCacheRef.current.clear();
                  invalidateOrdersRangeCache();
                  invalidateCustomersCache();
                  invalidateCohortCache();
                  invalidateClassificationCache();
                  fetchOrders(true);
                  fetchDeletedOrders(true);
                  fetchStaticData(true);
                  fetchAdjustments();
                }}
                disabled={isOrdersLoading}
                className="flex items-center gap-1.5 px-3 py-2 text-[8px] lg:text-[10px] font-black uppercase tracking-widest rounded-xl text-brand-brown/60 hover:text-brand-brown hover:bg-brand-brown/10 transition-all ml-auto disabled:opacity-50 cursor-pointer"
                title="Reload fresh data from database"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isOrdersLoading ? 'animate-spin' : ''}`} />
                <span>{isOrdersLoading ? 'Loading...' : 'Refresh'}</span>
              </button>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2 bg-white/50 p-2 rounded-2xl lg:rounded-3xl border border-brand-stone w-full lg:w-auto lg:self-end">
                <span className="text-[8px] lg:text-[10px] font-black uppercase text-brand-brown/40 tracking-widest pl-2 lg:pl-4">Filter:</span>
                <select value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)} className="flex-1 bg-transparent text-[8px] lg:text-[10px] font-black uppercase p-2 outline-none border-0 text-brand-brown font-bold">
                  <option value="All">All Stores</option>
                  {availableStations.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </header>

        {foundOrdersList.length > 1 && !foundOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-10 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-brand-brown/80 backdrop-blur-md" onClick={() => setFoundOrdersList([])}></div>
            <div className="bg-white rounded-[2rem] lg:rounded-[3rem] p-8 border-4 border-brand-brown shadow-2xl relative z-10 w-full max-w-4xl max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-black text-brand-brown uppercase tracking-tighter">Search Results</h3>
                  <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest">Found {foundOrdersList.length} orders containing "{searchTerm}"</p>
                </div>
                <button onClick={() => setFoundOrdersList([])} className="p-2 hover:bg-brand-stone/20 rounded-full transition-colors">
                  <X className="w-6 h-6 text-brand-brown" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                {foundOrdersList.map((order) => {
                  const orderCoupon = order.appliedCouponCode || extractCouponCodeFromOrder(order);
                  return (
                    <button 
                      key={order.id} 
                      onClick={() => displayOrderDetails(order)}
                      className="flex items-center justify-between p-5 bg-brand-brown/5 rounded-2xl border border-brand-brown/10 hover:border-brand-red hover:bg-white transition-all group text-left"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-[10px] font-black text-brand-red uppercase tracking-widest leading-none">Bill #{order.billNumber}</p>
                          {orderCoupon && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded">
                              🎟️ {orderCoupon}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-black text-brand-brown uppercase">{getISTDateString(order.date)}</p>
                        <p className="text-[10px] font-bold text-brand-brown/40 uppercase">{order.branchName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-brand-brown">₹{order.total.toLocaleString()}</p>
                        <p className="text-[8px] font-black text-brand-brown/40 uppercase tracking-widest">{order.items.length} Items</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {foundOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-10 animate-in fade-in duration-300">
             <div className="absolute inset-0 bg-brand-brown/80 backdrop-blur-md" onClick={() => setFoundOrder(null)}></div>
             <div className="bg-white rounded-[2rem] lg:rounded-[3.5rem] p-6 lg:p-12 border-4 lg:border-[12px] border-brand-red shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] flex flex-col lg:flex-row gap-6 lg:gap-12 relative z-10 w-full max-w-5xl max-h-[90vh] overflow-y-auto no-scrollbar">
                <button 
                  onClick={() => setFoundOrder(null)}
                  className="absolute top-4 right-4 lg:top-8 lg:right-8 p-3 bg-brand-brown/5 rounded-full hover:bg-brand-red hover:text-white transition-all text-brand-brown group"
                >
                  <X className="w-6 h-6 lg:w-8 h-8 group-hover:rotate-90 transition-transform duration-300" />
                </button>

                <div className="flex-1">
                   <div className="flex items-center gap-4 mb-8">
                      <span className="bg-brand-red text-white px-6 py-2 rounded-full font-black text-[10px] tracking-widest uppercase italic">Invoice Details</span>
                   </div>
                   <h3 className="text-4xl lg:text-6xl font-black text-brand-brown tracking-tighter uppercase mb-4 leading-none">BILL <span className="text-brand-red">#{foundOrder.billNumber}</span></h3>
                   
                   <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
                      <div className="bg-brand-brown/5 p-5 rounded-2xl border border-brand-brown/5">
                         <p className="text-[9px] font-black text-brand-brown/40 uppercase tracking-widest mb-1">Status</p>
                         <p className="font-black text-brand-brown uppercase italic text-sm">{foundOrder.deletionInfo ? 'Voided / Deleted' : foundOrder.status}</p>
                      </div>
                      <div className="bg-brand-brown/5 p-5 rounded-2xl border border-brand-brown/5">
                         <p className="text-[9px] font-black text-brand-brown/40 uppercase tracking-widest mb-1">Type</p>
                         <p className="font-black text-brand-red uppercase italic text-sm">
                           {foundOrder.type === 'DELIVERY'
                             ? `DELIVERY • ${getDeliveryBrandLabel(foundOrder.deliveryBrand)}`
                             : foundOrder.type.replace('_', ' ')}
                         </p>
                      </div>
                      <div className="bg-brand-brown/5 p-5 rounded-2xl border border-brand-brown/5">
                         <p className="text-[9px] font-black text-brand-brown/40 uppercase tracking-widest mb-1">Method</p>
                         <p className="font-black text-brand-brown uppercase italic text-sm">{foundOrder.paymentMethod || 'N/A'}</p>
                      </div>
                      <div className="bg-brand-brown/5 p-5 rounded-2xl border border-brand-brown/5">
                         <p className="text-[9px] font-black text-brand-brown/40 uppercase tracking-widest mb-1">Amount</p>
                         <p className="font-black text-brand-brown italic text-xl">
                           ₹{(foundOrder.type === 'DELIVERY' && foundOrder.manualTotal != null ? foundOrder.manualTotal : (foundOrder.total ?? 0)).toLocaleString()}
                         </p>
                      </div>
                   </div>

                   {foundOrder.customerPhone && (
                      <div className="mt-6 p-4 rounded-2xl bg-indigo-50/80 border border-indigo-100 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm shadow-md">🪙</div>
                          <div>
                            <p className="text-[10px] font-black text-indigo-950 uppercase tracking-wider">MinCoins Loyalty Rewards</p>
                            <p className="text-[8px] font-bold text-indigo-600">Flat 8% generated • Usable strictly on next order</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <div className="bg-white/80 px-3 py-1.5 rounded-xl border border-indigo-100/60">
                            <span className="text-[7px] font-black uppercase text-stone-400 block tracking-wider">Initial</span>
                            <span className="text-xs font-black text-brand-brown">{foundOrderInitialBalance ?? 0}</span>
                          </div>
                          <div className="bg-white/80 px-3 py-1.5 rounded-xl border border-indigo-100/60">
                            <span className="text-[7px] font-black uppercase text-stone-400 block tracking-wider">Earned</span>
                            <span className="text-xs font-black text-mountain-green">+{foundOrderEarnedCoins ?? 0}</span>
                          </div>
                          {foundOrder.items.some(i => i.paidWithCoins) && (
                            <div className="bg-white/80 px-3 py-1.5 rounded-xl border border-indigo-100/60">
                              <span className="text-[7px] font-black uppercase text-stone-400 block tracking-wider">Redeemed</span>
                              <span className="text-xs font-black text-brand-red">
                                -{foundOrder.items.reduce((sum, item) => sum + (item.paidWithCoins ? (item.coinsPrice || 0) * item.quantity : 0), 0)}
                              </span>
                            </div>
                          )}
                          <div className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl shadow-sm">
                            <span className="text-[7px] font-black uppercase text-white/70 block tracking-wider">Final Total</span>
                            <span className="text-xs font-black text-white">{foundOrderFinalBalance ?? 0}</span>
                          </div>
                        </div>
                      </div>
                   )}

                   {foundOrderCoupon && (
                      <div className="mt-6 p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 flex items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center text-lg shadow-md shrink-0">
                            🎟️
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-amber-950 uppercase tracking-wider">Coupon Code Redeemed</p>
                            <p className="text-sm lg:text-base font-black text-brand-red tracking-widest uppercase font-mono">{foundOrderCoupon}</p>
                          </div>
                        </div>
                        <span className="text-[8px] font-black uppercase tracking-widest bg-amber-200/90 text-amber-900 border border-amber-300 px-3 py-1 rounded-full shrink-0">
                          Discount Applied
                        </span>
                      </div>
                   )}

                   <div className="mt-8 space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[10px] font-black uppercase text-brand-brown/30 tracking-widest">Order Breakdown</p>
                        {foundOrder.items.some(it => it.is_addon_offer || it.name.includes('+2 Steamed') || it.name.includes('+3 Kurkure') || (it.menuItemId && it.menuItemId.startsWith('addon-'))) && (
                          <span className="text-[8px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                            Includes Add-on Offer
                          </span>
                        )}
                      </div>
                      <div className="max-h-[250px] overflow-y-auto no-scrollbar pr-2">
                        {foundOrder.items.length > 0 ? (
                          foundOrder.items.map((it, idx) => {
                            const isGift = it.name.includes('(Gift)') || it.id === 'gift-campa-cola' || it.name.includes('Student Promo') || it.price === 0;
                            const isAddon = it.is_addon_offer || 
                              it.name.includes('Add-on') || 
                              it.name.startsWith('Add ') || 
                              it.name.includes('+2 Steamed') || 
                              it.name.includes('+3 Kurkure') || 
                              (it.name.includes('Popcorn') && it.name.includes('pc')) ||
                              (Boolean(it.menuItemId) && it.menuItemId!.startsWith('addon-'));
                            const isCouponDiscount = it.price < 0 || it.name.toLowerCase().includes('coupon') || it.name.toLowerCase().includes('discount') || it.name.toLowerCase().includes('welcome offer');

                            return (
                              <div key={idx} className={`flex justify-between items-center border-b border-brand-stone/50 py-3 group/item ${
                                isGift ? 'bg-brand-red/5 p-2.5 rounded-xl my-1 border-none' : 
                                isAddon ? 'bg-emerald-50/90 p-2.5 rounded-xl my-1 border border-emerald-200' :
                                isCouponDiscount ? 'bg-amber-50/90 p-2.5 rounded-xl my-1 border border-amber-200' : ''
                              }`}>
                                  <div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`font-black uppercase text-xs lg:text-sm block ${
                                        isGift ? 'text-brand-red' : 
                                        isAddon ? 'text-emerald-900' :
                                        isCouponDiscount ? 'text-amber-900' : 'text-brand-brown'
                                      }`}>
                                        x{it.quantity} {it.name}
                                      </span>
                                      {isGift && <span className="bg-brand-red text-white text-[7px] font-black px-1.5 py-0.5 rounded-full ring-2 ring-brand-red/10 animate-pulse uppercase">FREE GIFT</span>}
                                      {isAddon && <span className="bg-emerald-600 text-white text-[7px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">ADD-ON OFFER</span>}
                                      {isCouponDiscount && <span className="bg-amber-600 text-white text-[7px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">COUPON APPLIED</span>}
                                    </div>
                                    {it.paidWithCoins && <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest leading-none block mt-0.5">Redeemed with Coins</span>}
                                  </div>
                                  <span className={`font-black text-xs lg:text-sm shrink-0 ml-2 ${
                                    isGift ? 'text-brand-red' : 
                                    isAddon ? 'text-emerald-800' :
                                    isCouponDiscount ? 'text-brand-red' : 'text-brand-brown'
                                  }`}>
                                    {isGift ? '₹0' : (it.paidWithCoins ? `🪙 ${(it.coinsPrice || 0) * it.quantity} Coins` : (it.price < 0 ? `-₹${Math.abs(it.price * it.quantity).toLocaleString()}` : `₹${(it.price * it.quantity).toLocaleString()}`))}
                                  </span>
                              </div>
                            );
                          })
                        ) : (
                          <div className="py-10 text-center bg-brand-brown/5 rounded-2xl border-2 border-dashed border-brand-stone/30">
                            <p className="text-xs font-black text-brand-brown/40 uppercase tracking-widest">Item details missing from record</p>
                            <p className="text-[10px] font-bold text-brand-brown/20 uppercase mt-2">
                              Total amount ₹{(foundOrder.type === 'DELIVERY' && foundOrder.manualTotal != null ? foundOrder.manualTotal : (foundOrder.total ?? 0)).toLocaleString()} confirmed
                            </p>
                          </div>
                        )}
                      </div>
                   </div>

                   {foundOrder.deletionInfo && (
                      <div className="mt-10 p-6 bg-red-50 rounded-3xl border-2 border-brand-red/10">
                         <p className="text-[10px] font-black text-brand-red uppercase mb-2 tracking-widest">Deletion Record</p>
                         <p className="text-xs font-bold text-brand-brown italic">" {foundOrder.deletionInfo.reason} "</p>
                         <div className="flex justify-between items-center mt-3 pt-3 border-t border-brand-red/10">
                           <p className="text-[9px] font-black text-brand-brown/40 uppercase">Timestamp: {foundOrder.deletionInfo.date ? getISTFullDateTime(foundOrder.deletionInfo.date) : 'N/A'}</p>
                         </div>
                      </div>
                   )}
                   
                   {!foundOrder.deletionInfo && (
                      <button 
                        onClick={() => { setOrderToDelete(foundOrder); setIsDeleteModalOpen(true); }} 
                        className="mt-10 w-full py-5 bg-red-50 text-brand-red rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-red hover:text-white transition-all shadow-sm active:scale-[0.98]"
                      >
                        Void Transaction
                      </button>
                   )}
                </div>

                <div className="w-full lg:w-96 bg-brand-cream/50 rounded-[2rem] p-6 border-2 border-brand-stone shadow-inner flex flex-col">
                   <div className="mb-4 text-center">
                     <p className="text-[10px] font-black text-brand-brown/30 uppercase tracking-widest">Digital Copy</p>
                   </div>
                   <div className="bg-white p-1 shadow-2xl rounded-sm">
                     <div className="border border-dashed border-stone-200">
                       <PrintReceipt 
                        orderItems={foundOrder.items} 
                        billNumber={foundOrder.billNumber} 
                        branchName={foundOrder.branchName} 
                        date={foundOrder.date} 
                        paymentMethod={foundOrder.paymentMethod}
                        customerPhone={foundOrder.customerPhone}
                        customerInitialBalance={foundOrderInitialBalance}
                        customerFinalBalance={foundOrderFinalBalance}
                        earnedCoinsValue={foundOrderEarnedCoins}
                        nextOrderCoupon={foundOrderNextCoupon}
                        orderType={foundOrder.type}
                        deliveryBrand={foundOrder.deliveryBrand}
                        totalValue={foundOrder.type === 'DELIVERY' && foundOrder.manualTotal != null ? foundOrder.manualTotal : foundOrder.total}
                        couponCode={foundOrderCoupon}
                       />
                     </div>
                   </div>

                   <button
                     onClick={() => {
                       window.print();
                     }}
                     className="mt-4 w-full py-3.5 bg-brand-brown text-brand-yellow rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                   >
                     <Printer className="w-4 h-4" />
                     Print Receipt
                   </button>
                </div>
             </div>
          </div>
        )}

        {foundOrder && typeof document !== 'undefined' && document.getElementById('print-root') && createPortal(
          <PrintReceipt 
            orderItems={foundOrder.items} 
            billNumber={foundOrder.billNumber} 
            branchName={foundOrder.branchName} 
            date={foundOrder.date} 
            paymentMethod={foundOrder.paymentMethod}
            customerPhone={foundOrder.customerPhone}
            customerInitialBalance={foundOrderInitialBalance}
            customerFinalBalance={foundOrderFinalBalance}
            earnedCoinsValue={foundOrderEarnedCoins}
            nextOrderCoupon={foundOrderNextCoupon}
            orderType={foundOrder.type}
            deliveryBrand={foundOrder.deliveryBrand}
            totalValue={foundOrder.type === 'DELIVERY' && foundOrder.manualTotal != null ? foundOrder.manualTotal : foundOrder.total}
            couponCode={foundOrderCoupon}
          />,
          document.getElementById('print-root')!
        )}

        {searchMessage && (
           <div className="mb-10 p-6 bg-brand-red/10 rounded-3xl text-center border-2 border-brand-red/20 text-brand-red font-black text-xs uppercase tracking-widest">
              {searchMessage}
           </div>
        )}

        {/* Compact Segment Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-brand-brown/40">Segment:</span>
            <div className="inline-flex bg-brand-brown/5 p-1 rounded-xl border border-brand-stone">
              <button
                type="button"
                onClick={() => setSegmentFilter('ALL')}
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  segmentFilter === 'ALL'
                    ? 'bg-brand-brown text-brand-yellow shadow-sm'
                    : 'text-brand-brown/50 hover:text-brand-brown hover:bg-white/50'
                }`}
              >
                <span>All</span>
                <span className="ml-1 opacity-75 text-[8px]">
                  ({studentSegmentMetrics.totalAllCustomers})
                </span>
              </button>
              
              <button
                type="button"
                onClick={() => setSegmentFilter(segmentFilter === 'STUDENT' ? 'ALL' : 'STUDENT')}
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                  segmentFilter === 'STUDENT'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                <GraduationCap className="w-3 h-3" />
                <span>Students</span>
                <span className={`px-1 py-0.2 rounded-full text-[8px] font-bold ${
                  segmentFilter === 'STUDENT' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
                }`}>
                  {studentSegmentMetrics.totalEnrolledStudents}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSegmentFilter(segmentFilter === 'REGULAR' ? 'ALL' : 'REGULAR')}
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                  segmentFilter === 'REGULAR'
                    ? 'bg-brand-brown text-white shadow-sm'
                    : 'text-brand-brown/50 hover:text-brand-brown hover:bg-white/50'
                }`}
              >
                <Users className="w-3 h-3" />
                <span>Regular</span>
                <span className="ml-0.5 opacity-75 text-[8px]">
                  ({studentSegmentMetrics.totalRegularCustomers})
                </span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsStudentScorecardOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm hover:from-indigo-700 hover:to-violet-700 active:scale-95 transition-all cursor-pointer"
          >
            <GraduationCap className="w-3.5 h-3.5 text-amber-300" />
            <span>Student Hub</span>
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[8px] font-bold text-white">
              {studentSegmentMetrics.studentRevenueShare.toFixed(1)}%
            </span>
          </button>
        </div>
        
        <div className="flex flex-wrap rounded-2xl lg:rounded-[2rem] overflow-hidden border-2 lg:border-4 border-brand-brown shadow-xl mb-10">
          <button onClick={() => setReportView('revenue')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'revenue' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Revenue</button>
          {user.role !== 'CASHIER' && (
            <button onClick={() => setReportView('trends')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'trends' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Trends</button>
          )}
          <button onClick={() => setReportView('itemSales')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'itemSales' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Items</button>
          {(isAdmin || user.role === 'STORE_MANAGER') && (
            <button onClick={() => setReportView('customers')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'customers' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Customers</button>
          )}
          {isAdmin && (
            <>
              <button onClick={() => setReportView('comparison')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'comparison' ? 'bg-brand-brown text-brand-yellow' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>Compare</button>
              <button onClick={() => setReportView('profitability')} className={`flex-1 min-w-[33%] lg:min-w-0 py-3 lg:py-4 text-[10px] font-black uppercase tracking-widest transition-all ${reportView === 'profitability' ? 'bg-brand-red text-white' : 'bg-white text-brand-brown/40 hover:bg-brand-brown/5'}`}>P&L</button>
            </>
          )}
        </div>

        {reportView === 'trends' && (
          <div className="space-y-12 animate-in fade-in duration-700">
            {/* Master Toggle */}
            <div className="flex justify-center mb-8">
              <div className="bg-brand-brown/5 p-2 rounded-[2rem] border-2 border-brand-brown/10 flex items-center gap-2 shadow-inner">
                <button 
                  onClick={() => setAnalysisBasis('REVENUE')}
                  className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-3 ${analysisBasis === 'REVENUE' ? 'bg-brand-brown text-brand-yellow shadow-xl' : 'text-brand-brown/40 hover:bg-brand-brown/10'}`}
                >
                  <DollarSign className="w-4 h-4" />
                  Revenue Analysis
                </button>
                <button 
                  onClick={() => setAnalysisBasis('ORDERS')}
                  className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-3 ${analysisBasis === 'ORDERS' ? 'bg-brand-brown text-brand-yellow shadow-xl' : 'text-brand-brown/40 hover:bg-brand-brown/10'}`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  Order Volume
                </button>
              </div>
            </div>

            {/* 1. Main Line Chart */}
            <PerformanceChart orders={displayChartOrders} customers={displayCustomers} startDate={startDate} endDate={endDate} analysisBasis={analysisBasis} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <RevenueBreakdownChart 
                orders={displayOrders} 
                customers={displayCustomers} 
                analysisBasis={analysisBasis} 
                compositionData={behaviorData?.composition}
              />
              <OrderModeChart orders={displayOrders} analysisBasis={analysisBasis} />
            </div>

            {/* Order Value & Ticket Size Distribution Histogram */}
            <OrderValueHistogram
              orders={displayOrders}
              dashboardStartDate={startDate}
              dashboardEndDate={endDate}
              branchName={isAdmin ? selectedStore : (user.stationName || 'All')}
              segmentFilter={segmentFilter}
            />

            {/* 2. Insight Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-brand-brown p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-3 text-brand-yellow">Strongest Day</p>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl font-black italic uppercase italic tracking-tighter">{insightData.bestDay}</h3>
                  <Star className="w-10 h-10 text-brand-yellow/20" />
                </div>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-brand-stone group">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-brown/30 mb-3">Peak Performance Slot</p>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl font-black text-brand-brown tracking-tighter">{insightData.bestSlot}</h3>
                </div>
              </div>
              <div className="bg-brand-red p-8 rounded-[2.5rem] shadow-xl text-white group">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-3 text-brand-yellow">Highest Footfall Day</p>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl font-black uppercase italic tracking-tighter">{insightData.busiestDay}</h3>
                </div>
              </div>
            </div>

            {/* 3. Customer Behavior Analysis */}
            {behaviorData && (
              <div className="bg-brand-brown p-8 lg:p-12 rounded-[3.5rem] shadow-2xl text-white relative overflow-hidden">
                {/* Background Accent */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-brand-yellow/5 rounded-full blur-3xl -mr-48 -mt-48" />
                
                <div className="relative z-10">
                  <div className="mb-12">
                    <h3 className="text-3xl font-black italic uppercase tracking-tighter text-brand-yellow">Customer <span className="text-white">Behavior</span> Analysis</h3>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mt-2">Purchase frequency & sequence performance for selected period</p>
                  </div>

                  {/* Top Level Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
                    <div className="bg-white/5 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10">
                      <div className="flex items-center gap-3 mb-4">
                        <Users className="w-5 h-5 text-brand-yellow" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Unique Customers</span>
                      </div>
                      <p className="text-4xl font-black tracking-tighter text-white">{behaviorData.uniqueCustomers.toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-white/30 uppercase mt-2">Active in this period</p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/20">
                      <div className="flex items-center gap-3 mb-4">
                        <ShoppingBag className="w-5 h-5 text-brand-red" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Total Orders</span>
                      </div>
                      <p className="text-4xl font-black tracking-tighter text-white">{behaviorData.totalOrders.toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-white/30 uppercase mt-2">Placed by profile owners</p>
                    </div>

                    <div className="bg-white/5 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10">
                      <div className="flex items-center gap-3 mb-4">
                        <Receipt className="w-5 h-5 text-brand-yellow" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Frequency Index</span>
                      </div>
                      <p className="text-4xl font-black tracking-tighter text-white">{behaviorData.avgOrdersPerUser.toFixed(2)}</p>
                      <p className="text-[10px] font-bold text-white/30 uppercase mt-2">Orders per unique user</p>
                    </div>

                    <div className="bg-white/5 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10">
                      <div className="flex items-center gap-3 mb-4">
                        <DollarSign className="w-5 h-5 text-emerald-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Period Yield</span>
                      </div>
                      <p className="text-4xl font-black tracking-tighter text-white">₹{Math.round(behaviorData.avgSpendPerUser).toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-white/30 uppercase mt-2">Spend per unique user</p>
                    </div>
                  </div>

                  {/* Purchase Sequence Breakdown - Chart Form */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-8">
                      <h4 className="text-sm font-black uppercase tracking-widest text-white/60">Order Sequence Breakdown</h4>
                      <div className="h-[1px] flex-1 bg-white/10 mx-6" />
                    </div>

                    <div className="bg-white/5 rounded-[3rem] p-8 border border-white/10 h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={behaviorData.sequences.slice(0, 12)} 
                          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                          style={{ cursor: 'pointer' }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis 
                            dataKey="seq" 
                            stroke="rgba(255,255,255,0.4)" 
                            fontSize={10} 
                            tickFormatter={(v) => v === 999 ? 'Others' : v === 1 ? '1st' : v === 2 ? '2nd' : v === 3 ? '3rd' : `${v}th`}
                            axisLine={false}
                            tickLine={false}
                            dy={10}
                          />
                          <YAxis hide />
                          <RechartsTooltip 
                             contentStyle={{ backgroundColor: '#2D1D13', border: 'none', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', color: '#fff' }}
                             itemStyle={{ color: '#FACC15', fontWeight: '900', fontSize: '12px' }}
                             cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                             formatter={(value: any, name: any, props: any) => {
                               const seq = props.payload.seq;
                               const label = seq === 999 ? 'Unmatched Sequence' : seq === 1 ? 'New / 1st Order' : `${seq}th Purchase`;
                               return name === 'customers' ? [`${value} Orders`, label] : [`₹${Math.round(value)}`, 'Avg Ticket'];
                             }}
                          />
                          <Bar dataKey="customers" radius={[12, 12, 0, 0]} maxBarSize={60}>
                            {behaviorData.sequences.slice(0, 12).map((s, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={s.seq === 999 ? '#6B7280' : index === 0 ? '#EF4444' : index === 1 ? '#F59E0B' : index === 2 ? '#10B981' : index === 3 ? '#3B82F6' : index === 4 ? '#8B5CF6' : '#EC4899'} 
                                fillOpacity={0.9}
                                onClick={() => handleSequenceDetailClick(s)}
                              />
                            ))}
                            <LabelList 
                              dataKey="customers" 
                              position="top" 
                              style={{ fill: 'white', fontSize: '12px', fontWeight: '900', opacity: 0.9 }} 
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                      {behaviorData.sequences.slice(0, 6).map((seq, idx) => (
                        <div key={idx} className="bg-white/5 p-5 rounded-[2rem] border border-white/5 flex flex-col justify-between">
                           <div>
                             <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">{seq.seq === 999 ? 'Other' : seq.seq === 1 ? 'New' : `${seq.seq}th`} AOV</p>
                             <p className="text-xl font-black text-white tracking-tighter">₹{Math.round(seq.aov).toLocaleString()}</p>
                           </div>
                           <button 
                             onClick={() => handleSequenceDetailClick(seq)}
                             className="mt-4 w-full py-2 bg-white/5 hover:bg-brand-yellow hover:text-brand-brown rounded-xl text-[8px] font-black uppercase tracking-widest transition-all border border-white/5"
                           >
                             View Bills
                           </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Improved Rainbow Heatmap */}
            <div className="bg-white rounded-[3rem] p-8 shadow-2xl border border-brand-stone">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-6">
                <div>
                  <h3 className="text-2xl font-black text-brand-brown uppercase italic">Strategic <span className="text-brand-red">Heatmap</span></h3>
                  <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
                    {analysisBasis === 'REVENUE' ? 'Revenue distribution' : 'Order frequency'} by day and hour
                  </p>
                </div>

                {/* Color Legend Bar */}
                <div className="flex flex-col gap-2 bg-brand-brown/5 p-4 rounded-3xl border border-brand-stone/30">
                  <div className="flex items-center justify-between text-[8px] font-black text-brand-brown/60 uppercase tracking-widest mb-1 px-1">
                    <span>MIN (LOW)</span>
                    <span>MAX (HIGH {analysisBasis})</span>
                  </div>
                  <div className="h-3 w-48 lg:w-64 rounded-full" style={{ background: heatmapGradient }} />
                  <div className="flex justify-between px-1">
                     <span className="text-[8px] font-bold text-brand-brown/30">{analysisBasis === 'REVENUE' ? '₹0' : '0'}</span>
                     <span className="text-[8px] font-bold text-brand-brown/30">
                       {analysisBasis === 'REVENUE' 
                         ? `₹${Math.round(Math.max(...Object.values(insightData.heatmap).flatMap(d => Object.values(d).map(v => v.revenue)))).toLocaleString()}`
                         : `${Math.round(Math.max(...Object.values(insightData.heatmap).flatMap(d => Object.values(d).map(v => v.orders)))).toLocaleString()}`}
                     </span>
                  </div>
                </div>

                {selectedDayInsights !== null && (
                  <button 
                    onClick={() => setSelectedDayInsights(null)}
                    className="flex items-center gap-2 bg-brand-brown text-brand-yellow px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-brand-red hover:text-white transition-all active:scale-95"
                  >
                    Back to Overview
                  </button>
                )}
              </div>

              {selectedDayInsights === null ? (
                <div className="overflow-x-auto no-scrollbar pb-4">
                  <div className="min-w-[800px]">
                    <div className="flex mb-4">
                      <div className="w-24 shrink-0" />
                      <div className="flex-1 flex">
                        {[5, 6, 7, 8, 9].map(h => (
                          <div key={h} className="flex-1 text-center text-[9px] font-black uppercase text-brand-brown/30">{h} PM</div>
                        ))}
                        <div className="flex-1 text-center text-[9px] font-black uppercase text-brand-brown/30">Other</div>
                      </div>
                    </div>
                    {insightData.days.map((dayName, dIdx) => {
                      const daySlotData = insightData.heatmap[dIdx];
                      const slots = [{ h: 17 }, { h: 18 }, { h: 19 }, { h: 20 }, { h: 21 }];
                      const otherValue = Object.entries(daySlotData)
                        .filter(([h]) => !slots.map(s => s.h).includes(parseInt(h)))
                        .reduce((sum, [_, data]) => sum + (analysisBasis === 'REVENUE' ? data.revenue : data.orders), 0);

                      const maxValue = Math.max(...Object.values(insightData.heatmap).flatMap(d => Object.values(d).map(v => analysisBasis === 'REVENUE' ? v.revenue : v.orders)), 1);

                      return (
                        <div 
                          key={dayName} 
                          className="flex items-center gap-2 mb-3 group/row cursor-pointer"
                          onClick={() => setSelectedDayInsights(dIdx)}
                        >
                          <div className="w-24 shrink-0 text-[11px] font-black uppercase text-brand-brown group-hover/row:text-brand-red transition-colors">{dayName}</div>
                          <div className="flex-1 flex gap-2 h-14">
                            {slots.map(s => {
                              const val = analysisBasis === 'REVENUE' ? daySlotData[s.h].revenue : daySlotData[s.h].orders;
                              const intensity = val / maxValue;
                              const bg = getHeatmapColor(intensity);
                              return (
                                <div 
                                  key={s.h}
                                  className="flex-1 rounded-2xl relative group/slot transition-all hover:scale-[1.03] border border-black/5 shadow-sm"
                                  style={{ 
                                    backgroundColor: bg
                                  }}
                                >
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity z-10 pointer-events-none">
                                    <span className="text-[10px] font-black text-white px-3 py-1.5 bg-brand-brown rounded-xl shadow-2xl ring-2 ring-white/10">
                                      {analysisBasis === 'REVENUE' ? `₹${Math.round(val).toLocaleString()}` : val}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                            <div 
                              className="flex-1 rounded-2xl relative group/slot transition-all hover:scale-[1.03] border border-black/5 shadow-sm"
                              style={{ 
                                backgroundColor: getHeatmapColor(otherValue / maxValue)
                              }}
                            >
                               <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity z-10 pointer-events-none">
                                    <span className="text-[10px] font-black text-white px-3 py-1.5 bg-brand-brown rounded-xl shadow-2xl ring-2 ring-white/10">
                                      {analysisBasis === 'REVENUE' ? `₹${Math.round(otherValue).toLocaleString()}` : otherValue}
                                    </span>
                                </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                  <h4 className="text-sm font-black uppercase tracking-widest text-brand-brown mb-8 flex items-center gap-3">
                    <div className="p-2 bg-brand-red rounded-xl shadow-lg ring-4 ring-brand-red/10">
                      <Calendar className="w-5 h-5 text-white" />
                    </div>
                    {insightData.days[selectedDayInsights]} Hourly Breakdown
                  </h4>
                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-4">
                    {Object.entries(insightData.heatmap[selectedDayInsights]).map(([h, data]) => {
                      const hour = parseInt(h);
                      const displayHour = hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
                      const maxValue = Math.max(...Object.values(insightData.heatmap).flatMap(d => Object.values(d).map(v => analysisBasis === 'REVENUE' ? v.revenue : v.orders)), 1);
                      const val = analysisBasis === 'REVENUE' ? data.revenue : data.orders;
                      const intensity = val / maxValue;
                      const bg = getHeatmapColor(intensity);

                      return (
                        <div key={h} className="group/hour relative">
                          <div 
                            className="aspect-square rounded-[1.5rem] flex flex-col items-center justify-center border transition-all hover:scale-105 hover:shadow-xl group-hover/hour:ring-4 group-hover/hour:ring-brand-brown/5"
                            style={{ 
                              backgroundColor: bg,
                              borderColor: val > 0 ? 'transparent' : 'rgba(0,0,0,0.05)'
                            }}
                          >
                            <span className={`text-[9px] font-black uppercase text-center ${intensity > 0.4 ? 'text-white' : 'text-brand-brown/40'}`}>{displayHour}</span>
                            {val > 0 && (
                              <span className={`text-[11px] font-black mt-1 ${intensity > 0.4 ? 'text-white' : 'text-brand-brown'}`}>
                                {analysisBasis === 'REVENUE' ? `₹${Math.round(val / 1000)}k` : val}
                              </span>
                            )}
                          </div>
                          {val > 0 && (
                             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover/hour:opacity-100 transition-opacity pointer-events-none z-10">
                               <div className="bg-brand-brown text-white text-[10px] font-black px-4 py-2 rounded-xl shadow-2xl whitespace-nowrap ring-2 ring-white/10">
                                  {analysisBasis === 'REVENUE' 
                                    ? `${data.orders} Orders • ₹${Math.round(data.revenue).toLocaleString()}`
                                    : `${data.orders} Orders`}
                               </div>
                             </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

         {reportView === 'revenue' && (
          <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              
              {/* Card 1: In-Store Performance */}
              <div className="bg-brand-yellow p-6 lg:p-8 rounded-[2rem] lg:rounded-[3rem] shadow-md relative overflow-hidden group border border-black/5 flex flex-col justify-between">
                <div>
                  <p className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] mb-2 text-brand-brown/50">IN-STORE SALES</p>
                  <h3 className="text-3xl lg:text-4xl font-black tracking-tighter text-brand-brown">₹{(financialData.inStoreRevenue ?? 0).toLocaleString()}</h3>
                  <p className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest mt-1 text-brand-brown/40">DINE-IN / TAKEAWAY</p>
                </div>
                
                <div className="mt-6 pt-4 border-t border-brand-brown/10 grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[7.5px] font-black uppercase text-brand-brown/45 tracking-wider">Orders</p>
                    <p className="text-sm lg:text-base font-black text-brand-brown">
                      {financialData.inStoreOrdersCount}
                      {financialData.studentOrdersCount > 0 && (
                        <span className="text-[9px] text-emerald-700 block font-bold leading-tight mt-0.5" title="Student free mojito orders excluded from main count">
                          +{financialData.studentOrdersCount} Students
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[7.5px] font-black uppercase text-brand-brown/45 tracking-wider">Profit</p>
                    <p className="text-sm lg:text-base font-black text-emerald-800">₹{(financialData.inStoreProfit ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[7.5px] font-black uppercase text-brand-brown/45 tracking-wider">COGS</p>
                    <p className="text-sm lg:text-base font-black text-brand-brown/60">₹{(financialData.inStoreCogs ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Card 2: Delivery Performance */}
              {(() => {
                const activeDelivery = financialData.deliveryByBrand[deliveryBrandCardFilter];
                const mm = financialData.deliveryByBrand.MINMOMOS;
                const mc = financialData.deliveryByBrand.MINCHICKEN;
                return (
                  <div className="bg-brand-red p-6 lg:p-8 rounded-[2rem] lg:rounded-[3rem] shadow-md relative overflow-hidden group border border-black/5 flex flex-col justify-between text-white">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] text-white/60">DELIVERY SALES</p>
                        <div className="inline-flex bg-black/20 p-0.5 rounded-xl border border-white/15">
                          {([
                            { id: 'ALL', label: 'All' },
                            { id: 'MINMOMOS', label: '🥟 MM' },
                            { id: 'MINCHICKEN', label: '🍗 MC' }
                          ] as const).map(opt => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setDeliveryBrandCardFilter(opt.id)}
                              className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                deliveryBrandCardFilter === opt.id
                                  ? 'bg-[#ffeaa7] text-brand-brown shadow-sm'
                                  : 'text-white/75 hover:text-white'
                              }`}
                              title={opt.id === 'ALL' ? 'All Zomato Brands' : opt.id === 'MINMOMOS' ? 'MinMomos Brand Only' : 'MinChicken Brand Only'}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <h3 className="text-3xl lg:text-4xl font-black tracking-tighter text-white">₹{(activeDelivery.revenue ?? 0).toLocaleString()}</h3>
                      <p className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest mt-1 text-white/40">
                        {deliveryBrandCardFilter === 'ALL' ? 'HOME & APP DELIVERY (ALL BRANDS)' : deliveryBrandCardFilter === 'MINMOMOS' ? 'ZOMATO • MINMOMOS ONLY' : 'ZOMATO • MINCHICKEN ONLY'}
                      </p>

                      {deliveryBrandCardFilter === 'ALL' && (
                        <div className="mt-3 grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDeliveryBrandCardFilter('MINMOMOS')}
                            className="bg-black/15 hover:bg-black/25 border border-white/15 rounded-xl px-2.5 py-1.5 text-left transition-all cursor-pointer"
                          >
                            <span className="text-[7.5px] font-black uppercase tracking-wider text-white/70 block">🥟 MinMomos</span>
                            <span className="text-xs font-black text-[#ffeaa7]">₹{mm.revenue.toLocaleString()}</span>
                            <span className="text-[8px] font-bold text-white/70 ml-1">({mm.ordersCount})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeliveryBrandCardFilter('MINCHICKEN')}
                            className="bg-black/15 hover:bg-black/25 border border-white/15 rounded-xl px-2.5 py-1.5 text-left transition-all cursor-pointer"
                          >
                            <span className="text-[7.5px] font-black uppercase tracking-wider text-white/70 block">🍗 MinChicken</span>
                            <span className="text-xs font-black text-[#ffeaa7]">₹{mc.revenue.toLocaleString()}</span>
                            <span className="text-[8px] font-bold text-white/70 ml-1">({mc.ordersCount})</span>
                          </button>
                        </div>
                      )}
                      
                      {/* In-store equivalent and effective discount vs offline comparison */}
                      <div className="mt-4 bg-white/10 rounded-2xl p-3 border border-white/15 flex flex-col gap-2.5">
                        <div>
                          <p className="text-[8px] font-black uppercase text-white/70 tracking-wider">In-Store Value Equivalent</p>
                          <div className="flex flex-wrap items-baseline gap-1.5 mt-0.5">
                            <span className="text-base font-black text-[#ffeaa7]">
                              ₹{(activeDelivery.menuTotal ?? 0).toLocaleString()}
                            </span>
                            <span className="text-[9px] font-black text-white/80">
                              ({(activeDelivery.revenue > 0 ? ((activeDelivery.menuTotal ?? 0) / activeDelivery.revenue) * 100 : 0).toFixed(1)}% of Delivery)
                            </span>
                          </div>
                        </div>

                        {/* Effective Discount relative to Offline Channel assuming 55% sale value */}
                        <div className="pt-2 border-t border-white/15">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-[8px] font-black uppercase text-white/75 tracking-wider">
                              Effective Discount vs Offline
                            </p>
                            <span className="text-[7.5px] font-bold text-white/60">
                              @ 55% Sale Value
                            </span>
                          </div>
                          <div className="flex flex-wrap items-baseline justify-between gap-1.5 mt-0.5">
                            <div className="flex items-baseline gap-1">
                              <span className={`text-base font-black tracking-tight ${
                                (activeDelivery.effectiveDiscountPercent ?? 0) >= 0 ? 'text-[#ffeaa7]' : 'text-emerald-300'
                              }`}>
                                {Math.abs(activeDelivery.effectiveDiscountPercent ?? 0).toFixed(1)}%
                              </span>
                              <span className="text-[8px] font-black uppercase text-white/80 tracking-wider">
                                {(activeDelivery.effectiveDiscountPercent ?? 0) >= 0 ? 'Discount' : 'Premium'}
                              </span>
                            </div>
                            <span className="text-[8px] font-semibold text-white/65">
                              (₹{(activeDelivery.netPayout ?? 0).toLocaleString()} realized)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[7.5px] font-black uppercase text-white/50 tracking-wider">Orders</p>
                        <p className="text-sm lg:text-base font-black text-white">{activeDelivery.ordersCount}</p>
                      </div>
                      <div>
                        <p className="text-[7.5px] font-black uppercase text-white/50 tracking-wider">Profit</p>
                        <p className="text-sm lg:text-base font-black text-[#ffeaa7]">₹{(activeDelivery.profit ?? 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[7.5px] font-black uppercase text-white/50 tracking-wider">COGS</p>
                        <p className="text-sm lg:text-base font-black text-white/60">₹{(activeDelivery.cogs ?? 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Card 3: Combined Performance */}
              <div className="bg-brand-brown p-6 lg:p-8 rounded-[2rem] lg:rounded-[3rem] shadow-md relative overflow-hidden group border border-black/5 flex flex-col justify-between text-white">
                <div>
                  <p className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] mb-2 text-white/60">COMBINED REVENUE</p>
                  <h3 className="text-3xl lg:text-4xl font-black tracking-tighter text-white">₹{(financialData.combinedRevenue ?? 0).toLocaleString()}</h3>
                  <p className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest mt-1 text-white/40">TOTAL COLLECTED</p>
                </div>
                
                <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[7.5px] font-black uppercase text-white/50 tracking-wider">Orders</p>
                    <p className="text-sm lg:text-base font-black text-white">
                      {financialData.combinedOrdersCount}
                      {financialData.studentOrdersCount > 0 && (
                        <span className="text-[9px] text-emerald-400 block font-bold leading-tight mt-0.5" title="Student free mojito orders excluded from main count">
                          +{financialData.studentOrdersCount} Students
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[7.5px] font-black uppercase text-white/50 tracking-wider">Profit</p>
                    <p className="text-sm lg:text-base font-black text-emerald-400 font-extrabold">₹{(financialData.combinedProfit ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[7.5px] font-black uppercase text-white/50 tracking-wider">COGS</p>
                    <p className="text-sm lg:text-base font-black text-white/60">₹{(financialData.combinedCogs ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Card 4: Add-On Orders & Channel Split (Clickable) */}
              <div 
                onClick={() => setIsAddonModalOpen(true)}
                className="bg-[#0f6b4f] p-6 lg:p-8 rounded-[2rem] lg:rounded-[3rem] shadow-md relative overflow-hidden group border border-black/5 flex flex-col justify-between text-white cursor-pointer hover:brightness-105 hover:shadow-xl active:scale-[0.99] transition-all select-none"
                title="Click to view detailed drink attach rates and channel analysis"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <p className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] text-white/60">ADD-ON ORDERS</p>
                    <span className="text-[7.5px] font-black uppercase tracking-wider bg-white/15 px-2.5 py-0.5 rounded-full text-emerald-200 flex items-center gap-1 group-hover:bg-white/25 transition-colors">
                      ATTACH RATE <span className="text-[9px]">↗</span>
                    </span>
                  </div>
                  <h3 className="text-3xl lg:text-4xl font-black tracking-tighter text-white">
                    {financialData.addonPercent.toFixed(1)}%
                  </h3>
                  <p className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest mt-1 text-white/50">
                    {financialData.addonOrdersCount} OF {financialData.combinedOrdersCount} TOTAL ORDERS
                  </p>
                </div>

                {/* Minimal Channel-Wise Add-on Split matching Cards 1, 2, 3 */}
                <div className="mt-6 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[7.5px] font-black uppercase text-white/50 tracking-wider">Channel Split</p>
                    <span className="text-[7px] font-bold text-emerald-200/80 group-hover:text-emerald-200 transition-colors flex items-center gap-0.5">
                      Drinks & Details ↗
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[7.5px] font-black uppercase text-white/50 tracking-wider">Takeaway</p>
                      <p className="text-sm lg:text-base font-black text-[#ffeaa7]">
                        {financialData.takeawayAddonPercent.toFixed(1)}%
                      </p>
                      <p className="text-[7px] font-bold text-white/40 mt-0.5 leading-none">
                        {financialData.takeawayAddonOrders}/{financialData.takeawayOrdersCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-[7.5px] font-black uppercase text-white/50 tracking-wider">Dine-In</p>
                      <p className="text-sm lg:text-base font-black text-white">
                        {financialData.dineInAddonPercent.toFixed(1)}%
                      </p>
                      <p className="text-[7px] font-bold text-white/40 mt-0.5 leading-none">
                        {financialData.dineInAddonOrders}/{financialData.dineInOrdersCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-[7.5px] font-black uppercase text-white/50 tracking-wider">Delivery</p>
                      <p className="text-sm lg:text-base font-black text-emerald-200">
                        {financialData.deliveryAddonPercent.toFixed(1)}%
                      </p>
                      <p className="text-[7px] font-bold text-white/40 mt-0.5 leading-none">
                        {financialData.deliveryAddonOrders}/{financialData.deliveryOrdersCount}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Order Value & Ticket Size Distribution Histogram */}
            <OrderValueHistogram
              orders={displayOrders}
              dashboardStartDate={startDate}
              dashboardEndDate={endDate}
              branchName={isAdmin ? selectedStore : (user.stationName || 'All')}
              segmentFilter={segmentFilter}
            />

            <TimeWiseRevenueChart orders={displayOrders} />
            
            <div className="bg-white rounded-2xl lg:rounded-[3rem] p-4 lg:p-10 shadow-xl border border-brand-stone overflow-x-auto">
              <div className="flex flex-col gap-6 mb-6">
                <div className="flex justify-between items-center">
                  <div className="flex bg-brand-brown/5 p-1 rounded-2xl">
                    <button onClick={() => setActiveTab('active')} className={`px-4 lg:px-8 py-2 lg:py-3 rounded-xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'active' ? 'bg-brand-brown text-brand-yellow' : 'text-brand-brown/40'}`}>Active</button>
                    <button onClick={() => setActiveTab('deleted')} className={`px-4 lg:px-8 py-2 lg:py-3 rounded-xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'deleted' ? 'bg-brand-brown text-brand-yellow' : 'text-brand-brown/40'}`}>Voided</button>
                    <button onClick={() => setActiveTab('adjustments')} className={`px-4 lg:px-8 py-2 lg:py-3 rounded-xl text-[9px] lg:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'adjustments' ? 'bg-brand-brown text-brand-yellow' : 'text-brand-brown/40'}`}>Stock Adjustments</button>
                  </div>
                </div>

                {activeTab !== 'adjustments' ? (
                  /* Active & Voided Orders Filter Bar */
                  <div className="bg-brand-brown/5 border border-brand-stone p-5 rounded-2xl space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {/* Search Query */}
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Search Orders</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={revSearchQuery}
                            onChange={e => setRevSearchQuery(e.target.value)}
                            placeholder="Search Bill #, Item name, etc..."
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                          />
                          <Search className="w-3.5 h-3.5 text-brand-brown/40 absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>
                      </div>

                      {/* Sort Field */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Sort By</label>
                        <select
                          value={revSortField}
                          onChange={e => setRevSortField(e.target.value as any)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                        >
                          <option value="date">Date & Time</option>
                          <option value="total">Order Total</option>
                          <option value="billNumber">Bill Number</option>
                        </select>
                      </div>

                      {/* Sort Order */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Direction</label>
                        <select
                          value={revSortOrder}
                          onChange={e => setRevSortOrder(e.target.value as any)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                        >
                          <option value="desc">Descending (New/High)</option>
                          <option value="asc">Ascending (Old/Low)</option>
                        </select>
                      </div>

                      {/* Type Filter */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Order Mode</label>
                        <select
                          value={revTypeFilter}
                          onChange={e => setRevTypeFilter(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                        >
                          <option value="all">All Modes</option>
                          <option value="dine_in">Dine-In</option>
                          <option value="takeaway">Takeaway</option>
                          <option value="delivery">Delivery (All Brands)</option>
                          <option value="delivery_minmomos">Delivery — 🥟 MinMomos</option>
                          <option value="delivery_minchicken">Delivery — 🍗 MinChicken</option>
                        </select>
                      </div>

                      {/* Branch Filter */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Branch</label>
                        <select
                          disabled={!isAdmin}
                          value={revBranchFilter}
                          onChange={e => setRevBranchFilter(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all disabled:opacity-50"
                        >
                          <option value="all">All Branches</option>
                          {uniqueBranches.map(branchName => (
                            <option key={branchName} value={branchName}>{branchName}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Second Row: Item Category, Specific Item & Amount Range */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-brand-brown/10">
                      {/* Item Category Filter */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Item Category</label>
                        <select
                          value={revCategoryFilter}
                          onChange={e => {
                            const newCat = e.target.value;
                            setRevCategoryFilter(newCat);
                            if (newCat !== 'all' && revItemFilter !== 'all') {
                              const itemStillValid = availableItemsList.some(i => {
                                if (i.name !== revItemFilter) return false;
                                if (newCat === 'drink-packaged') return isPackagedDrinkItem(i);
                                if (newCat === 'drink-fresh') return isNonPackagedDrinkItem(i);
                                return i.category === newCat;
                              });
                              if (!itemStillValid) setRevItemFilter('all');
                            }
                          }}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                        >
                          <option value="all">All Categories</option>
                          <option value="momo">♨️ Momos</option>
                          <option value="moburg">🍔 Moburg & Burgers</option>
                          <option value="side">🍟 Sides (Fries, Popcorn, etc.)</option>
                          <option value="drink">🥤 All Drinks & Beverages</option>
                          <option value="drink-packaged">🍾 Packaged Drinks (Water, Pepsi, Sprite, Campa)</option>
                          <option value="drink-fresh">🍹 Fresh Drinks (Mojitos, Coolers)</option>
                          <option value="combo">🍱 Combos & Meals</option>
                          <option value="addon">✨ Add-on Offers</option>
                        </select>
                      </div>

                      {/* Contains Item Filter */}
                      <div className="sm:col-span-1 lg:col-span-2">
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1 truncate">
                          Contains Item {revCategoryFilter !== 'all' ? `(${filteredItemOptions.length} in Category)` : `(${filteredItemOptions.length} Items)`}
                        </label>
                        <select
                          value={revItemFilter}
                          onChange={e => setRevItemFilter(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                        >
                          <option value="all">All Items (No item filter)</option>
                          {filteredItemOptions.map(item => (
                            <option key={item.name} value={item.name}>{item.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Amount Range */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Amount Range</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            placeholder="Min ₹"
                            value={revMinAmount}
                            onChange={e => setRevMinAmount(e.target.value)}
                            className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010]"
                          />
                          <span className="text-xs text-brand-brown/40 shrink-0">to</span>
                          <input
                            type="number"
                            placeholder="Max ₹"
                            value={revMaxAmount}
                            onChange={e => setRevMaxAmount(e.target.value)}
                            className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-brand-brown/10">
                      {(revSearchQuery || revTypeFilter !== 'all' || revBranchFilter !== 'all' || revCategoryFilter !== 'all' || revItemFilter !== 'all' || revMinAmount || revMaxAmount) && (
                        <button
                          onClick={() => {
                            setRevSearchQuery('');
                            setRevTypeFilter('all');
                            setRevBranchFilter('all');
                            setRevCategoryFilter('all');
                            setRevItemFilter('all');
                            setRevMinAmount('');
                            setRevMaxAmount('');
                          }}
                          className="text-[10px] font-black uppercase text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-all"
                        >
                          Clear Filters
                        </button>
                      )}

                      <div className="ml-auto text-[10px] font-bold text-brand-brown/60 bg-white/50 border border-brand-stone px-3 py-1.5 rounded-lg">
                        Showing <span className="font-extrabold text-brand-brown">{filteredAndSortedOrders.length}</span> of {activeTab === 'active' ? orders.length : deletedOrders.length} orders
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Stock Adjustments Filter Bar */
                  <div className="bg-brand-brown/5 border border-brand-stone p-5 rounded-2xl space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      {/* Search Query */}
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Search Adjustments</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={adjSearchQuery}
                            onChange={e => setAdjSearchQuery(e.target.value)}
                            placeholder="Search Item ID, reason, or name..."
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                          />
                          <Search className="w-3.5 h-3.5 text-brand-brown/40 absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>
                      </div>

                      {/* Sort Field */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Sort By</label>
                        <select
                          value={adjSortField}
                          onChange={e => setAdjSortField(e.target.value as any)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                        >
                          <option value="date">Date & Time</option>
                          <option value="quantity_change">Absolute Change</option>
                        </select>
                      </div>

                      {/* Sort Direction */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Direction</label>
                        <select
                          value={adjSortOrder}
                          onChange={e => setAdjSortOrder(e.target.value as any)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all"
                        >
                          <option value="desc">Descending (Newest/Highest)</option>
                          <option value="asc">Ascending (Oldest/Lowest)</option>
                        </select>
                      </div>

                      {/* Branch Filter */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-brand-brown/60 tracking-wider block mb-1">Branch</label>
                        <select
                          disabled={!isAdmin}
                          value={adjBranchFilter}
                          onChange={e => setAdjBranchFilter(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-brand-stone bg-white text-xs font-bold text-[#3a2010] outline-none focus:border-brand-brown transition-all disabled:opacity-50"
                        >
                          <option value="all">All Branches</option>
                          {uniqueBranches.map(branchName => (
                            <option key={branchName} value={branchName}>{branchName}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-brand-brown/10">
                      {(adjSearchQuery || adjBranchFilter !== 'all') && (
                        <button
                          onClick={() => {
                            setAdjSearchQuery('');
                            setAdjBranchFilter('all');
                          }}
                          className="text-[10px] font-black uppercase text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-all"
                        >
                          Clear Filters
                        </button>
                      )}

                      <div className="ml-auto text-[10px] font-bold text-brand-brown/60 bg-white/50 border border-brand-stone px-3 py-1.5 rounded-lg">
                        Showing <span className="font-extrabold text-brand-brown">{filteredAndSortedAdjustments.length}</span> of {adjustments.length} records
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="min-w-[600px]">
                {activeTab !== 'adjustments' ? (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-brand-brown/5 text-brand-brown/40 text-[9px] lg:text-[10px] font-black uppercase">
                        <th 
                          onClick={() => handleToggleRevSort('billNumber')} 
                          className="px-4 lg:px-8 py-4 cursor-pointer hover:bg-brand-brown/10 select-none transition-colors"
                        >
                          Bill # {revSortField === 'billNumber' ? (revSortOrder === 'desc' ? '▼' : '▲') : '↕'}
                        </th>
                        <th 
                          onClick={() => handleToggleRevSort('date')} 
                          className="px-4 lg:px-8 py-4 cursor-pointer hover:bg-brand-brown/10 select-none transition-colors"
                        >
                          Date {revSortField === 'date' ? (revSortOrder === 'desc' ? '▼' : '▲') : '↕'}
                        </th>
                        <th className="px-4 lg:px-8 py-4">Type</th>
                        <th 
                          onClick={() => handleToggleRevSort('total')} 
                          className="px-4 lg:px-8 py-4 cursor-pointer hover:bg-brand-brown/10 select-none transition-colors text-right"
                        >
                          Total {revSortField === 'total' ? (revSortOrder === 'desc' ? '▼' : '▲') : '↕'}
                        </th>
                        <th className="px-4 lg:px-8 py-4 text-center">Action</th>
                        <th className="px-4 lg:px-8 py-4 text-right">Branch</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-stone">
                      {filteredAndSortedOrders.map(o => {
                        const coup = o.appliedCouponCode || extractCouponCodeFromOrder(o);
                        return (
                        <tr key={o.id} className="hover:bg-brand-cream/50 transition-colors group">
                          <td className="px-4 lg:px-8 py-4 font-black text-xs lg:text-sm">
                            <div>#{o.billNumber}</div>
                            {coup && (
                              <span className="inline-block mt-0.5 text-[8px] font-black text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded tracking-wider">
                                🎟️ {coup}
                              </span>
                            )}
                          </td>
                          <td className="px-4 lg:px-8 py-4 text-[10px] lg:text-xs">{getISTFullDateTime(o.date)}</td>
                          <td className="px-4 lg:px-8 py-4">
                             {isStudentFreeMojitoOrder(o) ? (
                               <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-emerald-600 text-white">
                                 Students
                               </span>
                             ) : o.type === 'DELIVERY' ? (
                               <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase text-white whitespace-nowrap ${(o.deliveryBrand || '').toUpperCase() === 'MINCHICKEN' ? 'bg-amber-600' : 'bg-brand-red'}`}>
                                 {(o.deliveryBrand || '').toUpperCase() === 'MINCHICKEN'
                                   ? 'DELIVERY • 🍗 MINCHICKEN'
                                   : 'DELIVERY • 🥟 MINMOMOS'}
                               </span>
                             ) : (
                               <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-brand-brown/5 text-brand-brown/40">
                                 {o.type.replace('_', ' ')}
                               </span>
                             )}
                          </td>
                          <td className="px-4 lg:px-8 py-4 text-right font-black text-xs lg:text-sm">
                             {o.type === 'DELIVERY' && o.manualTotal != null ? (
                               <div className="flex flex-col items-end">
                                 <span>₹{o.manualTotal}</span>
                                 <span className="text-[7px] text-brand-brown/30 font-bold uppercase tracking-tighter">Menu Price: ₹{o.total}</span>
                               </div>
                             ) : (
                               <span>₹{o.total}</span>
                             )}
                          </td>
                          <td className="px-4 lg:px-8 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => handleSearch(o.billNumber)}
                                className="bg-brand-brown text-brand-yellow px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-brand-red hover:text-white transition-all shadow-md active:scale-95 cursor-pointer"
                              >
                                View
                              </button>
                              
                              {o.type !== 'DELIVERY' ? (
                                <div className="flex items-center gap-1 bg-brand-brown/5 p-1 rounded-lg">
                                  <button
                                    onClick={() => setReviewStatus(o.id, 'REVIEW_COLLECTED')}
                                    className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                                      o.status === 'REVIEW_COLLECTED'
                                        ? 'bg-emerald-600 text-white shadow-sm font-extrabold'
                                        : 'bg-transparent text-emerald-700/60 hover:text-emerald-700 hover:bg-emerald-50'
                                    }`}
                                  >
                                    Collected
                                  </button>
                                  <button
                                    onClick={() => setReviewStatus(o.id, 'REVIEW_DENIED')}
                                    className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                                      o.status === 'REVIEW_DENIED'
                                        ? 'bg-rose-600 text-white shadow-sm font-extrabold'
                                        : 'bg-transparent text-rose-700/60 hover:text-rose-700 hover:bg-rose-50'
                                    }`}
                                  >
                                    Denied
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[8px] font-black uppercase text-brand-brown/20 italic tracking-wider whitespace-nowrap">
                                  No review option
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 lg:px-8 py-4 text-[9px] lg:text-[10px] font-bold uppercase text-right">{o.branchName}</td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-brand-brown/5 text-brand-brown/40 text-[9px] lg:text-[10px] font-black uppercase">
                        <th 
                          onClick={() => handleToggleAdjSort('date')} 
                          className="px-4 lg:px-8 py-4 cursor-pointer hover:bg-brand-brown/10 select-none transition-colors"
                        >
                          Date {adjSortField === 'date' ? (adjSortOrder === 'desc' ? '▼' : '▲') : '↕'}
                        </th>
                        <th className="px-4 lg:px-8 py-4">Item ID</th>
                        <th className="px-4 lg:px-8 py-4">Branch</th>
                        <th 
                          onClick={() => handleToggleAdjSort('quantity_change')} 
                          className="px-4 lg:px-8 py-4 cursor-pointer hover:bg-brand-brown/10 select-none transition-colors text-center"
                        >
                          Change {adjSortField === 'quantity_change' ? (adjSortOrder === 'desc' ? '▼' : '▲') : '↕'}
                        </th>
                        <th className="px-4 lg:px-8 py-4">Performed By</th>
                        <th className="px-4 lg:px-8 py-4 text-right">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-stone">
                      {filteredAndSortedAdjustments.map((adj, idx) => (
                        <tr key={idx} className="hover:bg-brand-cream/50 transition-colors">
                          <td className="px-4 lg:px-8 py-4 text-[10px] lg:text-xs">{getISTFullDateTime(adj.date)}</td>
                          <td className="px-4 lg:px-8 py-4 font-black text-xs lg:text-sm uppercase">{adj.inventory_id}</td>
                          <td className="px-4 lg:px-8 py-4 text-[9px] lg:text-[10px] font-bold uppercase">{adj.branch_name}</td>
                          <td className="px-4 lg:px-8 py-4 text-center">
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black ${adj.quantity_change > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-brand-red'}`}>
                              {adj.quantity_change > 0 ? '+' : ''}{adj.quantity_change}
                            </span>
                          </td>
                          <td className="px-4 lg:px-8 py-4 text-[10px] font-bold uppercase text-brand-brown/60">{adj.performed_by || 'System'}</td>
                          <td className="px-4 lg:px-8 py-4 text-right text-[10px] font-medium italic text-brand-brown/50 italic max-w-[200px] truncate ml-auto" title={adj.reason}>{adj.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}


        {reportView === 'customers' && (isAdmin || user.role === 'STORE_MANAGER') && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Customer Overview Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
               <div className="bg-white p-5 rounded-[2rem] border border-brand-stone shadow-xl group">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-brand-red" />
                    <p className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest">Base</p>
                  </div>
                  <h4 className="text-2xl lg:text-3xl font-black text-brand-brown tracking-tighter">{customerOverview.totalCount}</h4>
                  <p className="text-[9px] font-bold text-brand-brown/30 uppercase mt-1">Total Profiles</p>
               </div>
               <div className="bg-gradient-to-br from-brand-brown to-stone-900 p-5 rounded-[2rem] shadow-xl text-white border border-brand-yellow/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-brand-yellow fill-brand-yellow" />
                    <p className="text-[10px] font-black uppercase text-brand-yellow tracking-widest">90D MAU</p>
                  </div>
                  <h4 className="text-2xl lg:text-3xl font-black text-brand-yellow tracking-tighter">{customerOverview.mauCount}</h4>
                  <p className="text-[9px] font-bold text-stone-300 uppercase mt-1">{customerOverview.mauPct.toFixed(1)}% of pool</p>
               </div>
               <div className="bg-brand-brown p-5 rounded-[2rem] shadow-xl text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <History className="w-4 h-4 text-brand-yellow" />
                    <p className="text-[10px] font-black uppercase text-white/40 tracking-widest">System LTV</p>
                  </div>
                  <h4 className="text-2xl lg:text-3xl font-black text-brand-yellow tracking-tighter">₹{Math.round(customerOverview.totalLTV).toLocaleString()}</h4>
                  <p className="text-[9px] font-bold text-white/40 uppercase mt-1">Lifetime Value</p>
               </div>
               <div className="bg-white p-5 rounded-[2rem] border border-brand-stone shadow-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUpIcon className="w-4 h-4 text-emerald-500" />
                    <p className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest">Avg LTV</p>
                  </div>
                  <h4 className="text-2xl lg:text-3xl font-black text-brand-brown tracking-tighter">₹{Math.round(customerOverview.avgLTV).toLocaleString()}</h4>
                  <p className="text-[9px] font-bold text-brand-brown/30 uppercase mt-1">Per Profile</p>
               </div>
               <div className="bg-white p-5 rounded-[2rem] border border-brand-stone shadow-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-indigo-500" />
                    <p className="text-[10px] font-black uppercase text-brand-brown/40 tracking-widest">Retention</p>
                  </div>
                  <h4 className="text-2xl lg:text-3xl font-black text-brand-brown tracking-tighter">{customerOverview.retentionRate.toFixed(1)}%</h4>
                  <p className="text-[9px] font-bold text-brand-brown/30 uppercase mt-1">Repeat Rate</p>
               </div>
               <div className="bg-brand-red p-5 rounded-[2rem] shadow-xl text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="w-4 h-4 text-brand-yellow" />
                    <p className="text-[10px] font-black uppercase text-white/40 tracking-widest">New Signups</p>
                  </div>
                  <h4 className="text-2xl lg:text-3xl font-black text-white tracking-tighter">{customerOverview.newInRange}</h4>
                  <p className="text-[9px] font-bold text-brand-yellow/60 uppercase mt-1">This Period</p>
               </div>
            </div>



            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Customer List */}
            <div className="lg:col-span-1 bg-white rounded-[2.5rem] p-6 shadow-xl border border-brand-stone flex flex-col h-[700px]">
              <div className="mb-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-brand-brown uppercase italic shrink-0">Customer <span className="text-brand-red">Base</span></h3>
                  <div className="flex flex-wrap items-center gap-2 justify-end">
                    <button 
                      onClick={handleSyncAllStats}
                      disabled={isSyncingStats}
                      className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-500 text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md active:scale-95 disabled:opacity-50"
                      title="Recalculate LTV/Orders for all listed customers"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isSyncingStats ? 'animate-spin' : ''}`} />
                      {isSyncingStats ? 'Syncing...' : 'Sync'}
                    </button>
                    
                    <button 
                      onClick={() => setIsNormModalOpen(true)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 ${isApproved ? 'bg-brand-brown text-brand-yellow hover:bg-brand-brown/90' : 'bg-brand-red/10 border border-brand-red text-brand-red hover:bg-brand-red/20'}`}
                      title="Manage Item Normalization Map"
                    >
                      <GraduationCap className="w-2.5 h-2.5" />
                      {isApproved ? 'Norm Map' : 'Review Map'}
                    </button>

                    <button 
                      onClick={handleExportCustomers}
                      className="flex items-center gap-1.5 px-2 py-1.5 bg-emerald-500 text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md active:scale-95"
                    >
                      <Download className="w-2.5 h-2.5" />
                      Export CSV
                    </button>

                    <div className="relative">
                      <button 
                        onClick={() => setIsMlDropdownOpen(!isMlDropdownOpen)}
                        className="flex items-center gap-1.5 px-2 py-1.5 bg-indigo-600 text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                      >
                        <FileText className="w-2.5 h-2.5" />
                        Export ML Data
                      </button>
                      
                      {isMlDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsMlDropdownOpen(false)} />
                          <div className="absolute right-0 mt-2 w-56 bg-white border border-brand-stone rounded-2xl shadow-2xl z-50 overflow-hidden py-2 animate-in fade-in slide-in-from-top-2 duration-150">
                            <div className="px-4 py-2 border-b border-brand-stone">
                              <p className="text-[9px] font-black uppercase text-brand-brown/40 tracking-wider">Select ML Format</p>
                            </div>
                            <button 
                              onClick={() => { setIsMlDropdownOpen(false); handleExportMlOrders(); }}
                              className="w-full px-4 py-2.5 text-left text-[10px] font-black uppercase text-brand-brown hover:bg-brand-brown/5 flex items-center gap-2"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                              orders.csv (Raw Orders)
                            </button>
                            <button 
                              onClick={() => { setIsMlDropdownOpen(false); handleExportMlOrderItems(); }}
                              className="w-full px-4 py-2.5 text-left text-[10px] font-black uppercase text-brand-brown hover:bg-brand-brown/5 flex items-center gap-2"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                              order_items.csv (Normalized)
                            </button>
                            <button 
                              onClick={() => { setIsMlDropdownOpen(false); handleExportMlOffers(); }}
                              className="w-full px-4 py-2.5 text-left text-[10px] font-black uppercase text-brand-brown hover:bg-brand-brown/5 flex items-center gap-2"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                              offers.csv (Offers Sent)
                            </button>
                            <button 
                              onClick={() => { setIsMlDropdownOpen(false); handleExportMlCustomersRaw(); }}
                              className="w-full px-4 py-2.5 text-left text-[10px] font-black uppercase text-brand-brown hover:bg-brand-brown/5 flex items-center gap-2"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                              customers_raw.csv (Raw)
                            </button>
                            <div className="border-t border-brand-stone my-1" />
                            <button 
                              onClick={() => { setIsMlDropdownOpen(false); setIsSnapshotModalOpen(true); }}
                              className="w-full px-4 py-2.5 text-left text-[10px] font-black uppercase text-brand-red hover:bg-brand-red/5 flex items-center gap-2"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-brand-red animate-pulse" />
                              ML Feature Snapshot
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <span className="text-[10px] font-black text-brand-brown/40 uppercase tracking-widest shrink-0">{filteredCustomers.length} Found</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-brown/30" />
                    <input 
                      type="text"
                      placeholder="Search Phone, Name, or Referral Coupon (e.g. MOMO-8625-PDV)..."
                      value={customerSearchTerm}
                      onChange={e => setCustomerSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-9 py-3 bg-brand-brown/5 rounded-xl text-xs font-black uppercase outline-none focus:ring-2 ring-brand-yellow/50 transition-all placeholder:normal-case placeholder:font-bold placeholder:text-brand-brown/40"
                    />
                    {customerSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setCustomerSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-brand-brown/40 hover:text-brand-brown transition-colors"
                        title="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Sorting Controls */}
                  <div className="flex gap-2">
                    <select 
                      value={customerSortField}
                      onChange={(e) => setCustomerSortField(e.target.value as any)}
                      className="flex-1 bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none cursor-pointer"
                    >
                      <option value="totalSpent">Sort by LTV</option>
                      <option value="totalOrders">Sort by Orders</option>
                      <option value="joinedDate">Sort by Joined Date</option>
                      <option value="lastVisit">Sort by Recently Ordered</option>
                    </select>
                    <button 
                      onClick={() => setCustomerSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="bg-brand-brown/5 p-2 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-brand-brown/10 transition-all"
                    >
                      {customerSortOrder === 'asc' ? 'ASC' : 'DESC'}
                    </button>
                  </div>

                  {/* Range Filters */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <p className="text-[8px] font-black uppercase text-brand-brown/30 tracking-widest ml-1">LTV Range</p>
                        <div className="flex items-center gap-1">
                          <input 
                            type="number" 
                            placeholder="Min" 
                            value={minLtv} 
                            onChange={e => setMinLtv(e.target.value)}
                            className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                          />
                          <input 
                            type="number" 
                            placeholder="Max" 
                            value={maxLtv} 
                            onChange={e => setMaxLtv(e.target.value)}
                            className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[8px] font-black uppercase text-brand-brown/30 tracking-widest ml-1">Orders Range</p>
                        <div className="flex items-center gap-1">
                          <input 
                            type="number" 
                            placeholder="Min" 
                            value={minOrders} 
                            onChange={e => setMinOrders(e.target.value)}
                            className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                          />
                          <input 
                            type="number" 
                            placeholder="Max" 
                            value={maxOrders} 
                            onChange={e => setMaxOrders(e.target.value)}
                            className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[8px] font-black uppercase text-brand-brown/30 tracking-widest ml-1">Joined Between Dates</p>
                      <div className="flex items-center gap-1">
                        <input 
                          type="date" 
                          value={customerJoinedStart} 
                          onChange={e => setCustomerJoinedStart(e.target.value)}
                          className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                        />
                        <span className="text-brand-brown/20">-</span>
                        <input 
                          type="date" 
                          value={customerJoinedEnd} 
                          onChange={e => setCustomerJoinedEnd(e.target.value)}
                          className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                        />
                        {(customerJoinedStart || customerJoinedEnd) && (
                          <button 
                            onClick={() => { setCustomerJoinedStart(''); setCustomerJoinedEnd(''); }}
                            className="p-2 bg-brand-red/10 text-brand-red rounded-lg hover:bg-brand-red/20 transition-colors cursor-pointer"
                            title="Clear joined dates"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[8px] font-black uppercase text-brand-brown/30 tracking-widest ml-1">Ordered Between Dates</p>
                      <div className="flex items-center gap-1">
                        <input 
                          type="date" 
                          value={customerActivityStart} 
                          onChange={e => setCustomerActivityStart(e.target.value)}
                          className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                        />
                        <span className="text-brand-brown/20">-</span>
                        <input 
                          type="date" 
                          value={customerActivityEnd} 
                          onChange={e => setCustomerActivityEnd(e.target.value)}
                          className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none"
                        />
                        {(customerActivityStart || customerActivityEnd) && (
                          <button 
                            onClick={() => { setCustomerActivityStart(''); setCustomerActivityEnd(''); }}
                            className="p-2 bg-brand-red/10 text-brand-red rounded-lg hover:bg-brand-red/20 transition-colors cursor-pointer"
                            title="Clear ordered dates"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[8px] font-black uppercase text-brand-brown/30 tracking-widest ml-1">Order Mode Filter</p>
                      <select 
                        value={customerClassFilter}
                        onChange={(e) => setCustomerClassFilter(e.target.value as any)}
                        className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none cursor-pointer"
                      >
                        <option value="ALL">All Modes</option>
                        <option value="DINE_IN">Dine-in Enthusiast (&gt;70%)</option>
                        <option value="TAKEAWAY">Takeaway Focused (&gt;70%)</option>
                        <option value="DELIVERY">Delivery Only (&gt;70%)</option>
                        <option value="DELIVERY_MINMOMOS">Delivery • MinMomos (&gt;70%)</option>
                        <option value="DELIVERY_MINCHICKEN">Delivery • MinChicken (&gt;70%)</option>
                        <option value="UNCLASSIFIED">Unclassified / Mixed</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[8px] font-black uppercase text-brand-brown/30 tracking-widest ml-1">Customer Type Filter</p>
                      <select 
                        value={customerTypeFilter}
                        onChange={(e) => setCustomerTypeFilter(e.target.value as any)}
                        className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none cursor-pointer"
                      >
                        <option value="ALL">All Customers</option>
                        <option value="STUDENT">🎓 Students Only</option>
                        <option value="REGULAR">👤 Regular / Non-Students</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[8px] font-black uppercase text-brand-brown/30 tracking-widest ml-1">Activity Recency (MAU Filter)</p>
                      <select 
                        value={customerRecencyFilter}
                        onChange={(e) => setCustomerRecencyFilter(e.target.value as any)}
                        className="w-full bg-brand-brown/5 text-[9px] font-black uppercase p-2 rounded-lg outline-none cursor-pointer font-bold"
                      >
                        <option value="ALL">All Recency (Entire Base)</option>
                        <option value="MAU_90D">⚡ 90-Day Active MAU (≤90 Days)</option>
                        <option value="POWER_30D">🔥 Power Active (≤30 Days)</option>
                        <option value="COOLING_90D">⚠️ Cooling / At-Risk (61-90 Days)</option>
                        <option value="DORMANT">💤 Dormant (&gt;90 Days)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              
               <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
                {filteredCustomers.map(c => {
                   const phone = normalizePhone(c.phone);
                   const stats = customerOrderStats[phone];
                   const dineInRate = stats ? stats.DINE_IN / stats.total : 0;
                   const takeawayRate = stats ? stats.TAKEAWAY / stats.total : 0;
                   const deliveryRate = stats ? stats.DELIVERY / stats.total : 0;
                   const minmomosRate = stats ? (stats.DELIVERY_MINMOMOS || 0) / stats.total : 0;
                   const minchickenRate = stats ? (stats.DELIVERY_MINCHICKEN || 0) / stats.total : 0;
                   let label = '';
                   let labelColor = 'bg-brand-red text-white';
                   
                   if (dineInRate > 0.7) label = 'Dine-in';
                   else if (takeawayRate > 0.7) label = 'Takeaway';
                   else if (minmomosRate > 0.7) {
                     label = '🥟 MinMomos';
                     labelColor = 'bg-[#D95323] text-white';
                   } else if (minchickenRate > 0.7) {
                     label = '🍗 MinChicken';
                     labelColor = 'bg-amber-600 text-white';
                   } else if (deliveryRate > 0.7) {
                     label = 'Delivery';
                     labelColor = 'bg-blue-500 text-white';
                   }

                   return (
                     <button 
                       key={c.id}
                       onClick={() => handleCustomerClick(c)}
                       className={`w-full p-4 rounded-2xl flex items-center justify-between border-2 transition-all ${activeCustomer?.id === c.id ? 'bg-brand-brown border-brand-brown text-brand-yellow' : 'bg-white border-brand-stone text-brand-brown hover:border-brand-brown/20'}`}
                     >
                       <div className="text-left">
                         <div className="flex items-center gap-2 flex-wrap">
                           <p className="text-sm font-black tracking-tight">{c.phone}</p>
                           {c.name && (
                             <span className={`text-[10px] font-bold truncate max-w-[110px] ${activeCustomer?.id === c.id ? 'text-brand-yellow/90' : 'text-brand-brown/70'}`}>
                               ({c.name})
                             </span>
                           )}
                           {c.note === 'STUDENT' && (
                             <span className="text-[10px]" title="Student Customer">🎓</span>
                           )}
                           {label && (
                             <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full ${activeCustomer?.id === c.id ? 'bg-brand-yellow text-brand-brown' : labelColor}`}>
                               {label}
                             </span>
                           )}
                         </div>
                         {c.referralCode && (
                           <div className="mt-1 flex items-center gap-1">
                             <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                               activeCustomer?.id === c.id 
                                 ? 'bg-brand-yellow text-brand-brown border-brand-yellow font-black' 
                                 : 'bg-amber-500/10 text-amber-800 border-amber-500/30'
                             }`} title={`Referral Coupon: ${c.referralCode}`}>
                               <span>🎁</span>
                               <span className="font-mono font-black tracking-wider">{c.referralCode}</span>
                             </span>
                           </div>
                         )}
                         <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${activeCustomer?.id === c.id ? 'text-brand-yellow/60' : 'text-brand-brown/40'}`}>Joined {c.joinedDate ? getISTDateString(c.joinedDate) : 'N/A'}</p>
                       </div>
                       <div className="text-right">
                         <p className="text-xs font-black">LTV: ₹{(c.totalSpent ?? 0).toLocaleString()}</p>
                         <p className={`text-[8px] font-black uppercase ${activeCustomer?.id === c.id ? 'text-brand-yellow/60' : 'text-brand-brown/40'}`}>{c.totalOrders} Orders</p>
                       </div>
                     </button>
                   );
                 })}
               </div>
            </div>

            {/* Customer Details & History */}
            <div className="lg:col-span-2 space-y-6 overflow-y-auto h-[700px] no-scrollbar">
              {activeCustomer ? (
                <>
                  <div className="bg-brand-brown rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
                    <UserIcon className="absolute -right-10 -bottom-10 w-64 h-64 text-white/5" />
                    <div className="relative z-10">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-2">
                        <div className="flex items-center gap-3">
                          <p className="text-[10px] font-black uppercase text-brand-yellow tracking-[0.3em] font-primary">Profile Record</p>
                          {(() => {
                            const phone = normalizePhone(activeCustomer.phone);
                            const stats = customerOrderStats[phone];
                            const dineInRate = stats ? stats.DINE_IN / stats.total : 0;
                            const takeawayRate = stats ? stats.TAKEAWAY / stats.total : 0;
                            const deliveryRate = stats ? stats.DELIVERY / stats.total : 0;
                            const minmomosRate = stats ? (stats.DELIVERY_MINMOMOS || 0) / stats.total : 0;
                            const minchickenRate = stats ? (stats.DELIVERY_MINCHICKEN || 0) / stats.total : 0;

                            if (dineInRate > 0.7) return <span className="bg-brand-yellow text-brand-brown text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Dine-in Enthusiast</span>;
                            if (takeawayRate > 0.7) return <span className="bg-brand-yellow text-brand-brown text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Takeaway Focused</span>;
                            if (minmomosRate > 0.7) return <span className="bg-[#D95323] text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase">🥟 MinMomos Delivery</span>;
                            if (minchickenRate > 0.7) return <span className="bg-amber-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase">🍗 MinChicken Delivery</span>;
                            if (deliveryRate > 0.7) return <span className="bg-blue-400 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Delivery Only</span>;
                            return <span className="bg-white/10 text-white/60 text-[8px] font-black px-2 py-0.5 rounded-full uppercase italic">Mixed Preferences</span>;
                          })()}
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setActiveCustomer(null)}
                            className="flex items-center gap-2 bg-brand-red/20 hover:bg-brand-red text-white px-4 py-2 rounded-xl transition-all border border-brand-red/30 group"
                          >
                            <X className="w-4 h-4" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Close</span>
                          </button>
                          {!isEditingProfile ? (
                            <button 
                              onClick={() => setIsEditingProfile(true)}
                              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-all border border-white/10 group"
                            >
                              <Edit3 className="w-4 h-4 text-brand-yellow" />
                              <span className="text-[9px] font-black uppercase tracking-widest">Edit Profile</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => setIsEditingProfile(false)}
                                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl transition-all text-white/40"
                              >
                                <span className="text-[9px] font-black uppercase tracking-widest">Cancel</span>
                              </button>
                              <button 
                                onClick={handleSaveProfile}
                                disabled={isSavingProfile}
                                className="flex items-center gap-2 bg-brand-yellow text-brand-brown px-6 py-2 rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50"
                              >
                                <Save className="w-4 h-4" />
                                <span className="text-[9px] font-black uppercase tracking-widest">{isSavingProfile ? 'Saving...' : 'Save Changes'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mb-8">
                        {isEditingProfile ? (
                          <div className="space-y-4 max-w-lg mt-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[8px] font-black uppercase text-white/40 tracking-widest ml-1">Full Name</label>
                                <input 
                                  value={editedProfile.name || ''} 
                                  onChange={e => setEditedProfile(prev => ({ ...prev, name: e.target.value }))}
                                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-brand-yellow"
                                  placeholder="John Doe"
                                />
                                <p className="text-[10px] font-black text-white italic">{activeCustomer.phone}</p>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[8px] font-black uppercase text-white/40 tracking-widest ml-1">Email Address</label>
                                <input 
                                  value={editedProfile.email || ''} 
                                  onChange={e => setEditedProfile(prev => ({ ...prev, email: e.target.value }))}
                                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-brand-yellow"
                                  placeholder="john@example.com"
                                  type="email"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[8px] font-black uppercase text-white/40 tracking-widest ml-1">Birthday</label>
                                <input 
                                  type="date"
                                  value={editedProfile.birthday || ''} 
                                  onChange={e => setEditedProfile(prev => ({ ...prev, birthday: e.target.value }))}
                                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-brand-yellow"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[8px] font-black uppercase text-white/40 tracking-widest ml-1">Customer Note</label>
                                <textarea 
                                  value={editIsStudent ? '' : (editedProfile.note || '')} 
                                  disabled={editIsStudent}
                                  onChange={e => setEditedProfile(prev => ({ ...prev, note: e.target.value }))}
                                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-brand-yellow h-10 resize-none disabled:opacity-50"
                                  placeholder={editIsStudent ? "Student Profile note is auto-managed" : "e.g. VIP guest, likes extra spice..."}
                                />
                              </div>
                            </div>

                            {/* Student Profile Toggle and Info Inputs */}
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase text-white tracking-widest">🎓 Student Profile Mode</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextVal = !editIsStudent;
                                    setEditIsStudent(nextVal);
                                    if (nextVal) {
                                      const digits = activeCustomer.phone.replace(/\D/g, '');
                                      const hNo = `HIKER-${digits.length >= 8 ? digits.slice(-8) : (digits + '87654321').slice(0, 8)}`;
                                      setEditHikerNo(hNo);
                                    }
                                  }}
                                  className={`px-4 py-1.5 rounded-xl font-black text-[9px] uppercase tracking-wider border transition-all ${
                                    editIsStudent
                                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-lg'
                                      : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10'
                                  }`}
                                >
                                  {editIsStudent ? '🎓 Student Active' : 'Mark as Student'}
                                </button>
                              </div>

                              {editIsStudent && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/5 animate-in fade-in duration-300">
                                  <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-white/40 tracking-widest ml-1">School / College Name</label>
                                    <input 
                                      value={editSchool} 
                                      onChange={e => setEditSchool(e.target.value)}
                                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-brand-yellow"
                                      placeholder="e.g. Delhi University"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-white/40 tracking-widest ml-1">Hiker Number (8-Digit)</label>
                                    <input 
                                      value={editHikerNo} 
                                      onChange={e => setEditHikerNo(e.target.value)}
                                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-brand-yellow"
                                      placeholder="e.g. HIKER-12345678"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <h2 className="text-4xl font-black italic uppercase tracking-tighter font-primary leading-none">
                              {activeCustomer.name || 'Anonymous Guest'}
                            </h2>
                            <p className="text-brand-yellow font-black text-xs tracking-widest flex items-center gap-2">
                              {activeCustomer.phone}
                              <span className="text-white/20">•</span>
                              <span className="text-[10px] uppercase font-black px-2 py-0.5 bg-brand-yellow/20 rounded border border-brand-yellow/30 text-brand-yellow">
                                {getTierInfo(activeCustomer.totalSpent || 0).name} Stage
                              </span>
                              {(activeCustomer.note === 'STUDENT' || activeCustomer.note?.startsWith('STUDENT|')) && (
                                <>
                                  <span className="text-white/20">•</span>
                                  <span className="text-[10px] uppercase font-black px-2 py-0.5 bg-emerald-500/20 rounded border border-emerald-500/30 text-emerald-400">
                                    🎓 Student
                                  </span>
                                </>
                              )}
                              {activeCustomer.referralCode && (
                                <>
                                  <span className="text-white/20">•</span>
                                  <span className="text-[10px] font-mono font-black uppercase px-2.5 py-0.5 bg-amber-400 text-brand-brown rounded border border-amber-300 shadow-sm flex items-center gap-1">
                                    <span>🎁</span> {activeCustomer.referralCode}
                                  </span>
                                </>
                              )}
                              {activeCustomer.email && (
                                <>
                                  <span className="text-white/20">•</span>
                                  <span className="flex items-center gap-1 text-[10px] text-white/60 lowercase font-bold tracking-normal"><Mail className="w-3 h-3" /> {activeCustomer.email}</span>
                                </>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                        <div className="bg-brand-yellow/20 p-4 rounded-2xl backdrop-blur-md border border-brand-yellow/30">
                          <p className="text-[8px] font-black uppercase text-brand-yellow tracking-widest mb-1">Lifetime Value (LTV)</p>
                          <p className="text-lg font-black text-brand-yellow">₹{(activeCustomer.totalSpent ?? 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Visits</p>
                          <p className="text-lg font-black text-brand-yellow">{activeCustomer.totalOrders ?? 0}</p>
                        </div>
                        <div className="bg-brand-yellow p-4 rounded-2xl backdrop-blur-md border border-brand-brown/20 shadow-lg">
                          <p className="text-[8px] font-black uppercase text-brand-brown/60 tracking-widest mb-1">MinCoins Balance</p>
                          <p className="text-lg font-black text-brand-brown">🪙 {realBalance}</p>
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Last Seen</p>
                          <p className="text-xs font-black uppercase">{activeCustomer.lastVisit ? getISTFullDateTime(activeCustomer.lastVisit) : 'N/A'}</p>
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Coupon</p>
                          {activeCustomer.welcomeCouponUsed ? (
                            <p className="text-[10px] font-black text-white/60 uppercase">Used</p>
                          ) : activeCustomer.totalOrders >= 1 ? (
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-brand-yellow uppercase">🔥 {activeCustomer.welcomeCouponCode || 'Avail'}</p>
                            </div>
                          ) : (
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-tighter italic">Earn next</p>
                          )}
                        </div>
                        <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                          <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Member Since</p>
                          <p className="text-xs font-black uppercase">{activeCustomer.joinedDate ? getISTDateString(activeCustomer.joinedDate) : 'N/A'}</p>
                        </div>
                      </div>

                      {/* Mode Split */}
                      {(() => {
                        const stats = customerOrderStats[activeCustomer.phone.trim()];
                        if (!stats || stats.total === 0) return null;
                        
                        const diPercent = (stats.DINE_IN / stats.total) * 100;
                        const taPercent = (stats.TAKEAWAY / stats.total) * 100;
                        const dePercent = (stats.DELIVERY / stats.total) * 100;
                        
                        return (
                          <div className="mb-8 bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-lg">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-[10px] font-black uppercase text-white tracking-[0.2em]">Service Mode Affinity</h4>
                              <div className="flex flex-wrap gap-x-4 gap-y-2">
                                 <div className="flex items-center gap-2">
                                   <div className="w-2 h-2 rounded-full bg-brand-yellow" />
                                   <span className="text-[8px] font-black uppercase text-white/60">Dine-in</span>
                                 </div>
                                 <div className="flex items-center gap-2">
                                   <div className="w-2 h-2 rounded-full bg-brand-red" />
                                   <span className="text-[8px] font-black uppercase text-white/60">Takeaway</span>
                                 </div>
                                 <div className="flex items-center gap-2">
                                   <div className="w-2 h-2 rounded-full bg-blue-500" />
                                   <span className="text-[8px] font-black uppercase text-white/60">Delivery</span>
                                 </div>
                              </div>
                            </div>
                            <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden flex">
                              <div style={{ width: `${diPercent}%` }} className="h-full bg-brand-yellow transition-all duration-500" />
                              <div style={{ width: `${taPercent}%` }} className="h-full bg-brand-red transition-all duration-500" />
                              <div style={{ width: `${dePercent}%` }} className="h-full bg-blue-500 transition-all duration-500" />
                            </div>
                            <div className="flex justify-between mt-2">
                              <div className="text-left">
                                <p className="text-xs font-black text-brand-yellow">{Math.round(diPercent)}%</p>
                                <p className="text-[7px] font-bold text-white/30 uppercase">Dine-in ({stats.DINE_IN})</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs font-black text-brand-red">{Math.round(taPercent)}%</p>
                                <p className="text-[7px] font-bold text-white/30 uppercase">Takeaway ({stats.TAKEAWAY})</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-black text-blue-400">{Math.round(dePercent)}%</p>
                                <p className="text-[7px] font-bold text-white/30 uppercase">Delivery ({stats.DELIVERY})</p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Info Bar */}
                      {!isEditingProfile && (
                        <div className="flex flex-wrap gap-4 mb-8">
                          {activeCustomer.birthday && (
                             <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                               <Calendar className="w-3.5 h-3.5 text-brand-yellow" />
                               <span className="text-[9px] font-black uppercase tracking-widest">DOB: {getISTDateString(activeCustomer.birthday)}</span>
                             </div>
                          )}
                          {(activeCustomer.note === 'STUDENT' || activeCustomer.note?.startsWith('STUDENT|')) ? (
                             <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20 text-emerald-400">
                               <span className="text-xs">🎓</span>
                               <span className="text-[9px] font-black uppercase tracking-widest">Student Category Active (10% Off Orders)</span>
                             </div>
                          ) : (
                             <button
                               type="button"
                               onClick={() => {
                                 setIsEditingProfile(true);
                                 setEditIsStudent(true);
                                 const digits = activeCustomer.phone.replace(/\D/g, '');
                                 const hNo = `HIKER-${digits.length >= 8 ? digits.slice(-8) : (digits + '87654321').slice(0, 8)}`;
                                 setEditHikerNo(hNo);
                               }}
                               className="flex items-center gap-2 bg-brand-yellow/20 px-4 py-2 rounded-xl border border-brand-yellow/30 text-brand-yellow hover:bg-brand-yellow hover:text-brand-brown transition-all shadow"
                             >
                               <span className="text-xs">🎓</span>
                               <span className="text-[9px] font-black uppercase tracking-widest">Convert to Student Category (10% Off)</span>
                             </button>
                          )}
                          {activeCustomer.note && (
                             <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                               <FileText className="w-3.5 h-3.5 text-brand-yellow" />
                               <span className="text-[9px] font-black uppercase tracking-widest italic truncate max-w-[200px]">"{activeCustomer.note}"</span>
                             </div>
                          )}
                          {usualOrder && (
                            <div className="flex items-center gap-2 bg-brand-yellow text-brand-brown px-4 py-2 rounded-xl shadow-lg animate-in fade-in zoom-in-95 duration-500">
                               <Star className="w-3.5 h-3.5 fill-current" />
                               <span className="text-[9px] font-black uppercase tracking-widest">Usual: {usualOrder.name}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Student Card Section */}
                      {(() => {
                        const noteStr = activeCustomer.note || '';
                        const isStudent = noteStr === 'STUDENT' || noteStr.startsWith('STUDENT|');
                        if (!isStudent) return null;

                        let school = '';
                        let hikerNo = '';
                        if (noteStr.startsWith('STUDENT|')) {
                          const parts = noteStr.split('|');
                          school = parts[1] || '';
                          hikerNo = parts[2] || '';
                        }
                        
                        // Stable hiker number fallback
                        if (!hikerNo) {
                          const digits = activeCustomer.phone.replace(/\D/g, '');
                          hikerNo = `HIKER-${digits.length >= 8 ? digits.slice(-8) : (digits + '87654321').slice(0, 8)}`;
                        }
                        if (!school && noteStr === 'STUDENT') {
                          school = 'Registered Student';
                        }

                        const memberSince = (() => {
                          if (!activeCustomer.joinedDate) return 'JULY, 2026';
                          try {
                            const d = new Date(activeCustomer.joinedDate);
                            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                            return `${months[d.getMonth()]}, ${d.getFullYear()}`;
                          } catch (e) {
                            return 'JULY, 2026';
                          }
                        })();

                        const handleSendCardWhatsApp = () => {
                          const text = `*🎓 MINMOMAS STUDENT CARD 🎓*
_Good Food. Great Discount._

👤 *NAME:* ${activeCustomer.name?.toUpperCase() || 'ANONYMOUS'}
🥾 *HIKER #:* ${hikerNo}
🏫 *COLLEGE:* ${school ? school.toUpperCase() : 'STUDENT EXCLUSIVE'}
📅 *MEMBER SINCE:* ${memberSince}

✨ *BENEFITS:*
• *FLAT 10% DISCOUNT* on all orders!

_Show this card during checkout to avail your exclusive discount. Enjoy your treat!_`;

                          const url = `https://wa.me/${activeCustomer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
                          window.open(url, '_blank');
                        };

                        const handleCopyCardText = () => {
                          const text = `🎓 MINMOMAS STUDENT CARD 🎓
Good Food. Great Discount.

NAME: ${activeCustomer.name?.toUpperCase() || 'ANONYMOUS'}
HIKER #: ${hikerNo}
COLLEGE: ${school ? school.toUpperCase() : 'STUDENT EXCLUSIVE'}
MEMBER SINCE: ${memberSince}

BENEFITS:
• FLAT 10% DISCOUNT on all orders!`;
                          navigator.clipboard.writeText(text);
                          alert('Student Card details copied to clipboard!');
                        };

                        return (
                          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-lg mb-8 space-y-6">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <GraduationCap className="w-5 h-5 text-emerald-400" />
                                <h4 className="text-[10px] font-black uppercase text-white tracking-[0.2em]">Verified Student Card</h4>
                              </div>
                              <span className="text-[8px] font-black uppercase px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl">
                                Active 10% Discount
                              </span>
                            </div>

                            {/* Scrollable Container to prevent card squishing on narrow mobile screens */}
                            <div className="w-full overflow-x-auto no-scrollbar py-2">
                              {/* The Actual Card Design - Always Landscape Credit Card Ratio */}
                              <div 
                                id="minmomas-student-card"
                                className="w-[450px] min-w-[450px] aspect-[1.586/1] mx-auto flex rounded-[1.5rem] overflow-hidden border-2 border-brand-yellow/30 shadow-2xl relative bg-mountain-green"
                              >
                                {/* Left forest-green section - with beautiful vector mountains */}
                                <div className="w-[62%] relative p-5 flex flex-col justify-between h-full bg-mountain-green overflow-hidden select-none">
                                  {/* Multi-layered scenic mountain background with sun and pine forest */}
                                  <svg className="absolute inset-0 w-full h-full opacity-30 pointer-events-none" viewBox="0 0 300 200" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    {/* Soft glowing sun */}
                                    <circle cx="210" cy="70" r="35" fill="#FBBF24" opacity="0.15" />
                                    
                                    {/* Distant mountain peaks (darker green hues) */}
                                    <path d="M100 200 L170 90 L240 200 Z" fill="#043A2C" />
                                    <path d="M30 200 L100 L170 200 Z" fill="#032F24" />
                                    
                                    {/* Mid-ground mountain peak with snow cap */}
                                    <path d="M140 200 L210 70 L280 200 Z" fill="#054536" />
                                    {/* Snow cap */}
                                    <path d="M210 70 L195 95 L202 97 L210 91 L218 97 L225 95 Z" fill="#FDFBF5" opacity="0.5" />
                                    
                                    {/* Left prominent peak with snow cap */}
                                    <path d="M60 200 L130 85 L200 200 Z" fill="#033F30" />
                                    {/* Snow cap */}
                                    <path d="M130 85 L117 106 L123 108 L130 102 L137 108 L143 106 Z" fill="#FDFBF5" opacity="0.5" />

                                    {/* Pine trees at the base */}
                                    <g fill="#02251D" opacity="0.4">
                                      {/* Left tree cluster */}
                                      <polygon points="8,200 12,188 10,188 13,178 11,178 14,167 17,178 15,178 18,188 16,188 20,200" />
                                      <polygon points="22,200 25,190 23,190 26,182 24,182 27,172 30,182 28,182 31,190 29,190 32,200" />
                                      {/* Right tree cluster */}
                                      <polygon points="262,200 265,190 263,190 266,182 264,182 267,172 270,182 268,182 271,190 269,190 272,200" />
                                      <polygon points="278,200 282,188 280,188 283,178 281,178 284,167 287,178 285,178 288,188 286,188 290,200" />
                                    </g>
                                  </svg>

                                  {/* Brand header */}
                                  <div className="relative z-10">
                                    <h2 className="text-sm font-black text-white tracking-widest italic lowercase">
                                      min<span className="text-brand-yellow">momas</span>
                                    </h2>
                                    <p className="text-[5px] font-bold text-white/40 uppercase tracking-widest -mt-1">Mountain Goodness. Everyday.</p>
                                  </div>

                                  {/* Card Title & Slogan */}
                                  <div className="my-1.5 relative z-10">
                                    <p className="text-xl font-black text-white tracking-tighter uppercase leading-none italic">STUDENT</p>
                                    <p className="text-xl font-black text-brand-yellow tracking-tighter uppercase leading-none italic">CARD</p>
                                    <p className="text-[6px] font-black text-brand-yellow uppercase tracking-widest mt-0.5 flex items-center gap-1">
                                      Good Food. Great Discount. <span className="text-brand-red text-[8px]">♥</span>
                                    </p>
                                  </div>

                                  {/* Dynamic Fields */}
                                  <div className="space-y-1 relative z-10">
                                    <div className="bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1 flex items-center gap-2 shadow-sm border border-brand-stone/40">
                                      <span className="text-[5px] font-black uppercase text-stone-400 tracking-widest w-8">Name</span>
                                      <span className="text-[9px] font-black text-brand-brown uppercase truncate flex-1">{activeCustomer.name || 'Anonymous Guest'}</span>
                                    </div>
                                    <div className="bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1 flex items-center gap-2 shadow-sm border border-brand-stone/40">
                                      <span className="text-[5px] font-black uppercase text-stone-400 tracking-widest w-8">Hiker #</span>
                                      <span className="text-[9px] font-black text-brand-brown uppercase truncate flex-1 font-mono tracking-wider">{hikerNo}</span>
                                    </div>
                                    {school && (
                                      <div className="bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1 flex items-center gap-2 shadow-sm border border-brand-stone/40">
                                        <span className="text-[5px] font-black uppercase text-stone-400 tracking-widest w-8">College</span>
                                        <span className="text-[9px] font-black text-brand-brown uppercase truncate flex-1">{school}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Right cream section */}
                                <div className="w-[38%] bg-brand-cream relative p-4 flex flex-col justify-between items-center text-center border-l-2 border-brand-stone/30 h-full select-none">
                                  {/* Exclusive badge */}
                                  <div className="bg-brand-brown text-white border border-brand-yellow/50 rounded-xl px-2 py-3 w-full flex flex-col items-center shadow-md my-auto">
                                    <span className="text-[6px] font-black uppercase text-brand-yellow tracking-widest">★ EXCLUSIVE ★</span>
                                    <span className="text-xl font-black text-brand-yellow my-0.5 tracking-tighter">10%</span>
                                    <span className="text-[7px] font-black uppercase text-white tracking-widest leading-none">FLAT DISCOUNT</span>
                                    <span className="text-[5px] font-bold text-white/50 uppercase tracking-widest mt-0.5">ON ALL ORDERS</span>
                                  </div>

                                  {/* Member Since tag */}
                                  <div className="mt-2 flex flex-col items-center">
                                    <span className="text-[6px] font-black text-brand-red uppercase tracking-widest italic mb-0.5">Member Since</span>
                                    <div className="bg-mountain-green text-white px-3 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shadow-sm">
                                      {memberSince}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Badge footer details */}
                            <div className="grid grid-cols-3 gap-2 pt-2 text-center text-white/40">
                              <div className="bg-white/5 py-2.5 rounded-xl border border-white/5">
                                <p className="text-[7px] font-black uppercase tracking-wider text-emerald-400">STUDENT ONLY</p>
                              </div>
                              <div className="bg-white/5 py-2.5 rounded-xl border border-white/5">
                                <p className="text-[7px] font-black uppercase tracking-wider text-brand-yellow">DINE-IN • TAKEAWAY</p>
                              </div>
                              <div className="bg-white/5 py-2.5 rounded-xl border border-white/5">
                                <p className="text-[7px] font-black uppercase tracking-wider text-white/60">SHOW PHONE CARD</p>
                              </div>
                            </div>

                            {/* Actions bar - with modern WhatsApp, text copy, high-res Image download, and PDF export */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                              <button
                                onClick={handleSendCardWhatsApp}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] tracking-wider py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md group cursor-pointer"
                              >
                                <svg className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.963C16.588 2.01 14.135 1.01 11.993 1.01c-5.452 0-9.88 4.373-9.884 9.802-.001 1.74.475 3.442 1.378 4.953l-.991 3.616 3.737-.968c1.517.865 3.011 1.3 4.754 1.3zm10.962-7.468c-.3-.15-1.77-.875-2.03-.972-.26-.096-.45-.142-.64.15-.19.29-.73.97-.89 1.16-.16.19-.32.22-.62.07-1.123-.523-1.923-.91-2.693-1.72-.18-.19-.18-.3-.33-.45-.15-.15-.3-.35-.45-.52-.15-.17-.2-.29-.3-.44-.1-.15-.05-.29.02-.44.07-.15.3-.35.45-.52.15-.17.2-.29.3-.44.1-.15.05-.29-.02-.44-.07-.15-.3-.35-.45-.52-.22-.24-.44-.75-.3-.97.11-.18.35-.35.5-.52.15-.17.22-.29.32-.44.1-.15.15-.22.25-.3.1-.08.2-.15.3-.15s.2.07.3.15c.1.08.6 1.01.65 1.11.05.1.07.22 0 .37-.07.15-.15.35-.22.45-.07.1-.15.22-.07.37.52.92 1.3 1.63 2.18 2.03.22.1.42.15.62.15.3 0 .57-.1.78-.31.2-.2.65-.75.75-.9.1-.15.2-.2.35-.2h.45c.25 0 .5.05.7.15.2.1 1.25.62 1.45.72.2.1.32.15.42.32.1.17.1.85-.2 1.15z"/>
                                </svg>
                                WhatsApp text Card
                              </button>
                              <button
                                onClick={handleCopyCardText}
                                className="bg-white/10 hover:bg-white/20 text-white border border-white/10 font-black uppercase text-[10px] tracking-wider py-3.5 rounded-2xl flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                                title="Copy card details to clipboard"
                              >
                                <Copy className="w-4 h-4" />
                                Copy text details
                              </button>
                              
                              <button
                                onClick={async () => {
                                  const element = document.getElementById('minmomas-student-card');
                                  if (!element) return;
                                  try {
                                    patchColorSpaces();
                                    const html2canvas = (await import('html2canvas')).default;
                                    const canvas = await html2canvas(element, {
                                      scale: 4, // Extremely crisp rendering!
                                      useCORS: true,
                                      backgroundColor: '#064E3B',
                                      logging: false,
                                    });
                                    const dataUrl = canvas.toDataURL('image/png');
                                    const link = document.createElement('a');
                                    link.href = dataUrl;
                                    link.download = `minmomas_student_card_${activeCustomer.name?.toLowerCase().replace(/\s+/g, '_') || 'card'}.png`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  } catch (err) {
                                    console.error('Error generating image:', err);
                                    alert('Failed to generate image. Please try again.');
                                  } finally {
                                    restoreColorSpaces();
                                  }
                                }}
                                className="bg-amber-600 hover:bg-amber-500 text-white font-black uppercase text-[10px] tracking-wider py-3.5 rounded-2xl flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md cursor-pointer"
                              >
                                <Download className="w-4 h-4" />
                                Download PNG Image
                              </button>

                              <button
                                onClick={async () => {
                                  const element = document.getElementById('minmomas-student-card');
                                  if (!element) return;
                                  try {
                                    patchColorSpaces();
                                    const html2canvas = (await import('html2canvas')).default;
                                    const { jsPDF } = await import('jspdf');
                                    const canvas = await html2canvas(element, {
                                      scale: 4,
                                      useCORS: true,
                                      backgroundColor: '#064E3B',
                                      logging: false,
                                    });
                                    const dataUrl = canvas.toDataURL('image/png');
                                    
                                    // 3.5in x 2.2in card format (88.9mm x 55.88mm)
                                    const widthMm = 88.9;
                                    const heightMm = 55.88;
                                    const pdf = new jsPDF({
                                      orientation: 'landscape',
                                      unit: 'mm',
                                      format: [widthMm, heightMm]
                                    });
                                    pdf.addImage(dataUrl, 'PNG', 0, 0, widthMm, heightMm, undefined, 'FAST');
                                    pdf.save(`minmomas_student_card_${activeCustomer.name?.toLowerCase().replace(/\s+/g, '_') || 'card'}.pdf`);
                                  } catch (err) {
                                    console.error('Error generating PDF:', err);
                                    alert('Failed to generate PDF. Please try again.');
                                  } finally {
                                    restoreColorSpaces();
                                  }
                                }}
                                className="bg-red-600 hover:bg-red-500 text-white font-black uppercase text-[10px] tracking-wider py-3.5 rounded-2xl flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md cursor-pointer"
                              >
                                <FileText className="w-4 h-4" />
                                Download PDF Card
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Referral Coupon & Loyalty Rewards Section */}
                      <div className="bg-gradient-to-br from-amber-500/15 via-brand-yellow/10 to-white/5 border border-amber-400/30 rounded-3xl p-6 backdrop-blur-lg mb-8 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-xl shadow-inner">
                              🎁
                            </div>
                            <div>
                              <h4 className="text-xs font-black uppercase text-white tracking-[0.2em]">Referral Coupon & Loyalty Rewards</h4>
                              <p className="text-[9px] font-bold text-amber-200/80 uppercase tracking-widest">Customer Referral Program • Searchable & Shareable</p>
                            </div>
                          </div>
                          {activeCustomer.referralCode ? (
                            <span className="self-start sm:self-auto text-[9px] font-black uppercase px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl">
                              Active Coupon
                            </span>
                          ) : (
                            <span className="self-start sm:self-auto text-[9px] font-black uppercase px-3 py-1 bg-white/10 text-white/50 border border-white/10 rounded-xl">
                              Eligible for Coupon
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                          <div className="bg-black/20 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                            <span className="text-[8px] font-black uppercase text-white/50 tracking-widest">Referral Coupon Code</span>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-base font-black font-mono tracking-wider text-amber-300">
                                {activeCustomer.referralCode || 'NOT ACTIVATED'}
                              </span>
                              {activeCustomer.referralCode && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(activeCustomer.referralCode!);
                                    alert(`Referral code ${activeCustomer.referralCode} copied to clipboard!`);
                                  }}
                                  className="p-1.5 bg-white/10 hover:bg-white/20 text-amber-200 rounded-lg transition-all"
                                  title="Copy Coupon Code"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="bg-black/20 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                            <span className="text-[8px] font-black uppercase text-white/50 tracking-widest">Referral Wallet Balance</span>
                            <p className="text-xl font-black text-amber-300 mt-2">
                              ₹{activeCustomer.referralWallet || 0}
                            </p>
                          </div>

                          <div className="bg-black/20 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                            <span className="text-[8px] font-black uppercase text-white/50 tracking-widest">Gang Coupon (Group Offer)</span>
                            <p className="text-sm font-black font-mono tracking-wider text-white mt-2">
                              {activeCustomer.gangCouponCode || '—'}
                            </p>
                          </div>
                        </div>

                        {/* Quick Share Buttons */}
                        {activeCustomer.referralCode ? (
                          <div className="flex flex-wrap gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                const code = activeCustomer.referralCode!;
                                const name = activeCustomer.name ? ` from ${activeCustomer.name}` : '';
                                const msg = `🎁 *Special MinMomas Treat${name}!* 🥟✨\n\nUse my exclusive referral coupon code *${code}* on your next visit to MinMomas to unlock surprise discounts and delicious momo treats!\n\nVisit today or order now!`;
                                const phone = activeCustomer.phone.replace(/\D/g, '');
                                const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
                                window.open(url, '_blank');
                              }}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] tracking-wider py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                            >
                              <span>📱</span> Share Coupon via WhatsApp
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const code = activeCustomer.referralCode!;
                                const msg = `Use my MinMomas referral coupon code: ${code} for exclusive discounts!`;
                                navigator.clipboard.writeText(msg);
                                alert('Referral message copied to clipboard!');
                              }}
                              className="bg-white/10 hover:bg-white/20 text-white font-black uppercase text-[10px] tracking-wider py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                              <Copy className="w-3.5 h-3.5 text-amber-300" /> Copy Share Text
                            </button>
                          </div>
                        ) : (
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const { generateReferralCodeForPhone } = await import('../utils/referralStorage');
                                  const code = generateReferralCodeForPhone(activeCustomer.phone);
                                  const { supabase } = await import('../utils/supabase');
                                  await supabase
                                    .from('customers')
                                    .update({ referral_code: code, is_referral_active: true })
                                    .eq('id', activeCustomer.id);
                                  setActiveCustomer(prev => prev ? { ...prev, referralCode: code, isReferralActive: true } : null);
                                  alert(`Activated referral code ${code} for ${activeCustomer.name || activeCustomer.phone}!`);
                                } catch (e) {
                                  console.error('Failed to generate referral code', e);
                                  alert('Failed to activate referral coupon.');
                                }
                              }}
                              className="w-full bg-amber-500 hover:bg-amber-400 text-brand-brown font-black uppercase text-[10px] tracking-wider py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                            >
                              <span>🎁</span> Activate & Assign Referral Coupon Code
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Messaging Widget */}
                      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-lg">
                        <div className="flex items-center gap-2 mb-4">
                           <MessageSquare className="w-4 h-4 text-brand-yellow" />
                           <h4 className="text-[10px] font-black uppercase text-white tracking-[0.2em]">Quick Connect</h4>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <textarea 
                            value={customMessage}
                            onChange={(e) => setCustomMessage(e.target.value)}
                            placeholder="Type a custom message (e.g. Special offer for you!)..."
                            className="flex-1 bg-white/10 border border-white/20 rounded-2xl p-4 text-white text-xs font-bold placeholder:text-white/20 focus:outline-none focus:border-brand-yellow transition-all resize-none h-20"
                          />
                          <button 
                            onClick={() => {
                              if (!customMessage.trim()) return;
                              const url = `https://wa.me/${activeCustomer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(customMessage)}`;
                              window.open(url, '_blank');
                            }}
                            className="bg-brand-yellow text-brand-brown px-8 py-4 sm:w-24 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-white transition-all active:scale-95 group shadow-xl"
                          >
                            <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                            <span className="text-[8px] font-black uppercase">Send</span>
                          </button>
                        </div>
                      </div>

                      {/* AI Driven Customer Insights */}
                      <CustomerInsights history={selectedCustomerHistory} />
                    </div>
                  </div>

                  <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-brand-stone">
                    <div className="flex items-center gap-3 mb-8">
                       <History className="w-5 h-5 text-brand-red" />
                       <h3 className="text-xl font-black text-brand-brown uppercase italic">Purchase <span className="text-brand-red">Log</span></h3>
                    </div>

                    <div className="space-y-4">
                      {selectedCustomerHistory.length === 0 ? (
                        <p className="text-center py-10 text-brand-brown/40 font-bold uppercase text-[10px] tracking-widest">No transaction history found</p>
                      ) : (
                        selectedCustomerHistory.map(o => (
                          <div 
                            key={o.id}
                            className="bg-brand-cream/30 border border-brand-stone p-5 rounded-2xl flex items-center justify-between hover:bg-brand-cream transition-all group"
                          >
                            <div className="flex items-center gap-4">
                              <div className="bg-white shadow-sm w-12 h-12 rounded-xl flex items-center justify-center font-black text-brand-brown text-xs border border-brand-stone">#{o.billNumber}</div>
                              <div>
                                <p className="text-sm font-black text-brand-brown uppercase">{getISTFullDateTime(o.date)}</p>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="flex items-center gap-1 text-[8px] font-black uppercase text-brand-brown/40 tracking-widest">
                                    <MapPin className="w-2.5 h-2.5" /> {o.branchName}
                                  </span>
                                  <span className="flex items-center gap-1 text-[8px] font-black uppercase text-brand-brown/40 tracking-widest">
                                    <Receipt className="w-2.5 h-2.5" /> {o.paymentMethod}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-6">
                              <div className="text-right hidden sm:block">
                                <p className="text-lg font-black text-brand-brown">
                                  ₹{(o.type === 'DELIVERY' && o.manualTotal != null ? o.manualTotal : (o.total ?? 0)).toLocaleString()}
                                </p>
                                {o.items.some(i => i.paidWithCoins) && (
                                  <p className="text-[8px] font-black uppercase text-indigo-600 tracking-tighter mt-1">
                                     -{o.items.reduce((sum, item) => sum + (item.paidWithCoins ? (item.coinsPrice || 0) * item.quantity : 0), 0)} Coins
                                  </p>
                                )}
                                <p className="text-[8px] font-black uppercase text-emerald-600 tracking-tighter">Verified Order</p>
                              </div>
                              <button 
                                onClick={() => handleSearch(o.billNumber)}
                                className="bg-brand-brown text-brand-yellow px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-red hover:text-white transition-all shadow-md active:scale-95"
                              >
                                View Bill
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-8">
                  {/* Customer Analytics Mode Switcher */}
                  <div className="bg-white rounded-3xl p-3 shadow-md border border-brand-stone flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 pl-3">
                      <div className="w-8 h-8 rounded-xl bg-brand-red/10 flex items-center justify-center">
                        <Users className="w-4 h-4 text-brand-red" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-brand-brown uppercase tracking-wider">
                          Customer Network Intelligence
                        </h4>
                        <p className="text-[10px] font-bold text-brand-brown/50 uppercase tracking-widest">
                          Active MAU Pie vs Cohort LTV Distributions
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 bg-brand-brown/5 p-1.5 rounded-2xl w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setCustomerNetworkTab('mau')}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                          customerNetworkTab === 'mau'
                            ? 'bg-brand-brown text-brand-yellow shadow-md scale-[1.02]'
                            : 'text-brand-brown/60 hover:text-brand-brown hover:bg-brand-brown/5'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5 text-brand-yellow" />
                        <span>90-Day Active MAU Base</span>
                        <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-md bg-brand-yellow/20 text-brand-yellow font-black">
                          {customerOverview.mauPct.toFixed(0)}% PIE
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCustomerNetworkTab('cohort')}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                          customerNetworkTab === 'cohort'
                            ? 'bg-brand-brown text-brand-yellow shadow-md scale-[1.02]'
                            : 'text-brand-brown/60 hover:text-brand-brown hover:bg-brand-brown/5'
                        }`}
                      >
                        <TrendingUpIcon className="w-3.5 h-3.5" />
                        <span>Cohort & LTV Distribution</span>
                      </button>
                    </div>
                  </div>

                  {/* Active Sub-View */}
                  {customerNetworkTab === 'mau' ? (
                    <MauTrackingView 
                      customers={customers}
                      allOrders={allOrdersRaw.length > 0 ? allOrdersRaw : orders}
                      onSelectCustomer={setActiveCustomer}
                    />
                  ) : (
                    <div className="bg-white rounded-[2.5rem] p-10 shadow-xl border border-brand-stone space-y-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-20 h-20 bg-brand-brown/5 rounded-full flex items-center justify-center mb-6">
                          <Users className="w-10 h-10 text-brand-brown/20" />
                        </div>
                        <h3 className="text-2xl font-black text-brand-brown uppercase italic mb-2 tracking-tighter">Customer <span className="text-brand-red">Network</span></h3>
                        <p className="text-xs font-bold text-brand-brown/40 uppercase tracking-widest max-w-sm mx-auto">Select a profile to view deep insights, or analyze the cohort performance below.</p>
                      </div>

                      <div className="pt-8 border-t border-brand-stone space-y-12">
                        <CustomerHistogram 
                          customers={filteredCustomers} 
                          allCustomers={customers} 
                          allOrders={allOrdersRaw.length > 0 ? allOrdersRaw : orders}
                          customerOrderStats={customerOrderStats}
                        />

                        <CohortRetentionChart 
                          data={displayCohortData} 
                          onSelectPeriod={(key) => {
                            setCompositionPeriod(key);
                          }}
                          selectedPeriodKey={compositionPeriod}
                        />

                        <OrderIntervalChart data={displayCohortData} />

                        {compositionPeriod && (
                          <div className="space-y-4">
                             <div className="flex items-center justify-between px-2">
                               <div className="flex items-center gap-2">
                                 <TrendingUpIcon className="w-4 h-4 text-brand-red" />
                                 <h4 className="text-xs font-black uppercase text-brand-brown tracking-widest">Selected Week Breakdown</h4>
                               </div>
                               <button 
                                 onClick={() => setCompositionPeriod(null)}
                                 className="text-[9px] font-black uppercase text-brand-red hover:underline"
                               >
                                 Clear Selection
                               </button>
                             </div>
                             <CohortCompositionChart 
                                data={cohortRawData} 
                                targetPeriod={compositionPeriod} 
                                granularity={compositionPeriod.includes('W') ? 'WEEK' : 'MONTH'} 
                             />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {reportView === 'comparison' && isAdmin && (
          <div className="space-y-8 animate-in slide-in-from-bottom-6 duration-700">
            <div className="flex justify-center">
              <div className="bg-white p-1 rounded-2xl border-2 border-brand-stone inline-flex gap-1 shadow-md">
                <button 
                  onClick={() => setCompareBy('STORE')}
                  className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${compareBy === 'STORE' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-stone/30'}`}
                >
                  By Store
                </button>
                <button 
                  onClick={() => setCompareBy('CASHIER')}
                  className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${compareBy === 'CASHIER' ? 'bg-brand-brown text-brand-yellow shadow-lg' : 'text-brand-brown/40 hover:bg-brand-stone/30'}`}
                >
                  By Cashier
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:gap-8">
              {comparisonData.map((group, idx) => (
                <div key={group.name} className="bg-white p-6 lg:p-8 rounded-2xl lg:rounded-[3rem] border-2 border-brand-stone flex items-center justify-between shadow-xl">
                  <div className="flex items-center gap-4 lg:gap-8">
                    <span className="text-2xl lg:text-4xl font-black text-brand-brown/10 italic">#{idx + 1}</span>
                    <div>
                      <h4 className="text-lg lg:text-2xl font-black text-brand-brown uppercase leading-none">{group.name}</h4>
                      <p className="text-[8px] lg:text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">{group.orders} Orders</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xl lg:text-3xl font-black text-brand-brown">₹{(group.revenue ?? 0).toLocaleString()}</span>
                    <p className="text-[8px] lg:text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-1">₹{(group.profit ?? 0).toLocaleString()} GP</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {reportView === 'profitability' && isAdmin && (
          <div className="animate-in fade-in zoom-in-95 duration-700 bg-white border border-brand-brown/10 p-12 rounded-[2.5rem] lg:rounded-[4rem] shadow-sm max-w-2xl mx-auto text-center space-y-6">
            <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <TrendingUpIcon className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl lg:text-2xl font-black uppercase text-brand-brown tracking-tight">Financial Statements Relocated</h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-semibold max-w-md mx-auto">
                Detailed Profit & Loss analytics have been shifted to the <span className="font-bold text-brand-brown">Finance Ledger</span> to enable precise real-time transaction tracking, Accrual vs Cash-flow adjustments, and Investment fund auditing.
              </p>
            </div>
            <div className="pt-4 border-t border-brand-brown/5 text-zinc-500 text-[10px] leading-relaxed max-w-sm mx-auto font-medium">
              Please click on the main <span className="font-bold uppercase">Finance Ledger</span> tab in the top navigation panel, then toggle the view to <span className="font-bold uppercase text-emerald-600">P&L Statement</span> to access live charts.
            </div>
          </div>
        )}

        {reportView === 'itemSales' && (
          <ItemSalesReport 
            orders={displayOrders} 
            allOrdersRaw={allOrdersRaw}
            startDate={startDate}
            endDate={endDate}
            studentPhoneSet={studentPhoneSet}
          />
        )}
      </div>
      
      <DeleteBillModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={confirmDelete} billNumber={orderToDelete?.billNumber || null} />

      {/* Sequence Detail Modal */}
      {selectedSequenceDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-brown/80 backdrop-blur-md" onClick={() => setSelectedSequenceDetail(null)} />
          <div className="relative bg-white w-full max-w-2xl max-h-[85vh] rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="bg-brand-brown p-8 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-brand-yellow uppercase italic">{selectedSequenceDetail.label} <span className="text-white">Orders</span></h3>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">{selectedSequenceDetail.orders.length} transaction found in this period</p>
              </div>
              <button onClick={() => setSelectedSequenceDetail(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-4 no-scrollbar">
              {selectedSequenceDetail.orders.length === 0 ? (
                <div className="py-20 text-center">
                   <Receipt className="w-12 h-12 text-brand-brown/10 mx-auto mb-4" />
                   <p className="text-[10px] font-black uppercase text-brand-brown/30 tracking-widest">No detailed order data available</p>
                </div>
              ) : (
                selectedSequenceDetail.orders.map(o => (
                  <div 
                    key={o.id}
                    className="bg-brand-cream/30 border border-brand-stone p-5 rounded-[2rem] flex items-center justify-between hover:bg-brand-cream transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-white shadow-sm w-12 h-12 rounded-xl flex items-center justify-center font-black text-brand-brown text-xs border border-brand-stone">#{o.billNumber}</div>
                      <div>
                        <p className="text-sm font-black text-brand-brown uppercase">{getISTFullDateTime(o.date)}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[8px] font-black uppercase text-brand-brown/40 tracking-widest flex items-center gap-1">
                            <UserIcon className="w-2.5 h-2.5" /> {o.customerPhone || 'GUEST'}
                          </span>
                          <span className="text-[8px] font-black uppercase text-brand-brown/40 tracking-widest flex items-center gap-1" title={o.paymentMethod}>
                            <Receipt className="w-2.5 h-2.5" /> {o.paymentMethod}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right flex items-center gap-6">
                      <div>
                        <p className="text-lg font-black text-brand-brown">₹{(o.type === 'DELIVERY' && o.manualTotal != null ? o.manualTotal : (o.total ?? 0)).toLocaleString()}</p>
                        <p className="text-[8px] font-black uppercase text-brand-brown/40 tracking-tighter">
                          {o.items.length} items
                        </p>
                      </div>
                      <button 
                        onClick={() => {
                          handleSearch(o.billNumber);
                          setSelectedSequenceDetail(null);
                        }}
                        className="bg-brand-brown text-brand-yellow p-3 rounded-xl hover:bg-brand-red hover:text-white transition-all shadow-md active:scale-95"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isNormModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-10 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-brand-brown/80 backdrop-blur-md" onClick={() => setIsNormModalOpen(false)}></div>
          <div className="bg-white rounded-[2rem] lg:rounded-[3rem] p-8 border-4 border-brand-brown shadow-2xl relative z-10 w-full max-w-6xl max-h-[90vh] flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 shrink-0">
              <div>
                <h3 className="text-2xl font-black text-brand-brown uppercase tracking-tighter flex items-center gap-3">
                  <GraduationCap className="w-7 h-7 text-brand-red" />
                  Item Normalization Map
                </h3>
                <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">
                  Configure raw item names into base IDs, sizes, categories, and redemption rules for ML feature snap-shooting.
                </p>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-brown/30" />
                  <input 
                    type="text"
                    placeholder="Filter raw items..."
                    value={normSearchTerm}
                    onChange={e => setNormSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-brand-brown/5 rounded-xl text-xs font-black uppercase outline-none focus:ring-2 ring-brand-yellow/50 transition-all"
                  />
                </div>
                <button onClick={() => setIsNormModalOpen(false)} className="p-2 hover:bg-brand-stone/20 rounded-full transition-colors">
                  <X className="w-6 h-6 text-brand-brown" />
                </button>
              </div>
            </div>

            {/* Normalization list */}
            <div className="flex-1 overflow-y-auto border border-brand-stone rounded-2xl no-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-stone/30 border-b border-brand-stone sticky top-0 z-10">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-brand-brown/60">Raw Item Name</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-brand-brown/60">Base Item ID</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-brand-brown/60">Base Item Name</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-brand-brown/60">Category</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-brand-brown/60">Size</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-brand-brown/60 text-center">Redeem?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-stone">
                  {Object.values(normMap)
                    .filter(item => item.raw_item_name.toLowerCase().includes(normSearchTerm.toLowerCase()))
                    .map((item) => (
                      <tr key={item.raw_item_name} className="hover:bg-brand-brown/5 transition-colors">
                        <td className="px-6 py-3 text-xs font-bold text-brand-brown max-w-[200px] truncate" title={item.raw_item_name}>
                          {item.raw_item_name}
                        </td>
                        <td className="px-6 py-3">
                          <input 
                            type="text"
                            value={item.base_item_id}
                            onChange={e => {
                              const updated = { ...normMap, [item.raw_item_name]: { ...item, base_item_id: e.target.value } };
                              setNormMap(updated);
                              localStorage.setItem('MOMOMAYA_ITEM_NORMALIZATION_MAP', JSON.stringify(updated));
                            }}
                            className="w-full px-3 py-1.5 bg-brand-brown/5 border border-brand-stone rounded-lg text-xs font-bold font-mono outline-none focus:ring-2 ring-brand-yellow/50 transition-all"
                          />
                        </td>
                        <td className="px-6 py-3">
                          <input 
                            type="text"
                            value={item.base_item_name}
                            onChange={e => {
                              const updated = { ...normMap, [item.raw_item_name]: { ...item, base_item_name: e.target.value } };
                              setNormMap(updated);
                              localStorage.setItem('MOMOMAYA_ITEM_NORMALIZATION_MAP', JSON.stringify(updated));
                            }}
                            className="w-full px-3 py-1.5 bg-brand-brown/5 border border-brand-stone rounded-lg text-xs font-bold outline-none focus:ring-2 ring-brand-yellow/50 transition-all"
                          />
                        </td>
                        <td className="px-6 py-3">
                          <select
                            value={item.category}
                            onChange={e => {
                              const updated = { ...normMap, [item.raw_item_name]: { ...item, category: e.target.value as any } };
                              setNormMap(updated);
                              localStorage.setItem('MOMOMAYA_ITEM_NORMALIZATION_MAP', JSON.stringify(updated));
                            }}
                            className="px-2 py-1.5 bg-brand-brown/5 border border-brand-stone rounded-lg text-xs font-bold text-brand-brown outline-none"
                          >
                            <option value="chicken">Chicken</option>
                            <option value="veg">Veg</option>
                            <option value="paneer">Paneer</option>
                            <option value="beverage">Beverage</option>
                            <option value="other">Other</option>
                          </select>
                        </td>
                        <td className="px-6 py-3">
                          <select
                            value={item.size}
                            onChange={e => {
                              const updated = { ...normMap, [item.raw_item_name]: { ...item, size: e.target.value as any } };
                              setNormMap(updated);
                              localStorage.setItem('MOMOMAYA_ITEM_NORMALIZATION_MAP', JSON.stringify(updated));
                            }}
                            className="px-2 py-1.5 bg-brand-brown/5 border border-brand-stone rounded-lg text-xs font-bold text-brand-brown outline-none"
                          >
                            <option value="">(None)</option>
                            <option value="small">Small</option>
                            <option value="medium">Medium</option>
                            <option value="large">Large</option>
                          </select>
                        </td>
                        <td className="px-6 py-3 text-center">
                          <input 
                            type="checkbox"
                            checked={item.is_redemption}
                            onChange={e => {
                              const updated = { ...normMap, [item.raw_item_name]: { ...item, is_redemption: e.target.checked } };
                              setNormMap(updated);
                              localStorage.setItem('MOMOMAYA_ITEM_NORMALIZATION_MAP', JSON.stringify(updated));
                            }}
                            className="w-4 h-4 rounded border-brand-stone text-brand-red focus:ring-brand-red focus:ring-offset-0 focus:ring-2"
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between mt-6 shrink-0 pt-4 border-t border-brand-stone">
              <span className="text-[10px] font-black uppercase text-brand-brown/40 tracking-wider">
                {Object.keys(normMap).length} Items Registered
              </span>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsNormModalOpen(false)}
                  className="px-6 py-3 bg-brand-brown/5 text-brand-brown hover:bg-brand-brown/10 text-xs font-black uppercase tracking-widest rounded-xl transition-all"
                >
                  Close
                </button>
                <button 
                  onClick={() => {
                    localStorage.setItem('MOMOMAYA_ITEM_NORMALIZATION_APPROVED', 'true');
                    setIsApproved(true);
                    setIsNormModalOpen(false);
                    alert("Item Normalization Map has been saved and approved successfully!");
                  }}
                  className="px-8 py-3 bg-emerald-500 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-all shadow-md active:scale-95"
                >
                  Approve Map Table
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSnapshotModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-brown/80 backdrop-blur-md" onClick={() => setIsSnapshotModalOpen(false)} />
          <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] p-8 border-4 border-brand-brown shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-black text-brand-brown uppercase italic">ML Feature <span className="text-brand-red">Snapshot</span></h3>
                <p className="text-[9px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">Generate a leakage-guarded customer behavior timeline</p>
              </div>
              <button onClick={() => setIsSnapshotModalOpen(false)} className="p-2 hover:bg-brand-stone/10 rounded-full transition-colors text-brand-brown">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-brand-brown/60 mb-2">Snapshot Cutoff Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-brown/30" />
                  <input 
                    type="date"
                    value={snapshotDateState}
                    onChange={e => setSnapshotDateState(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-brand-brown/5 rounded-xl text-xs font-black outline-none focus:ring-2 ring-brand-yellow/50 transition-all"
                  />
                </div>
                <p className="text-[8px] font-bold text-brand-brown/40 uppercase tracking-wide mt-1.5 ml-1">
                  Feature columns will be strictly calculated using orders BEFORE this date (leakage prevention).
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-brand-brown/60 mb-2">Label Prediction Window (Days)</label>
                <div className="relative">
                  <input 
                    type="number"
                    min="1"
                    max="365"
                    value={labelWindowDays}
                    onChange={e => setLabelWindowDays(Math.max(1, parseInt(e.target.value, 10) || 30))}
                    className="w-full px-4 py-3 bg-brand-brown/5 rounded-xl text-xs font-black outline-none focus:ring-2 ring-brand-yellow/50 transition-all"
                  />
                </div>
                <p className="text-[8px] font-bold text-brand-brown/40 uppercase tracking-wide mt-1.5 ml-1">
                  Target labels calculate order activity within [Cutoff Date, Cutoff Date + Window].
                </p>
              </div>

              {/* Dynamic Leakage Guard Warning */}
              {(() => {
                const snapTime = new Date(snapshotDateState).getTime();
                const latestOrderTime = allOrdersRaw.length > 0 
                  ? Math.max(...allOrdersRaw.map(o => new Date(o.date).getTime())) 
                  : 0;
                const labelWindowEndTime = snapTime + labelWindowDays * 24 * 3600 * 1000;
                const isOutOfRange = labelWindowEndTime > latestOrderTime;
                
                if (isOutOfRange) {
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[10px] font-medium text-amber-800 leading-relaxed">
                      ⚠️ <strong>Leakage Warning:</strong> The prediction window ends after the last order in your database ({getISTDateString(latestOrderTime)}). Label columns will remain blank for these records to prevent training on partial future data.
                    </div>
                  );
                }
                return (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-[10px] font-medium text-emerald-800 leading-relaxed">
                    ✅ <strong>Leakage Safe:</strong> Full forward target window is available. Label columns will be populated using actual order outcomes.
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-end gap-3 mt-8">
              <button 
                onClick={() => setIsSnapshotModalOpen(false)}
                className="px-5 py-2.5 bg-brand-brown/5 text-brand-brown hover:bg-brand-brown/10 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleExportMlFeatureSnapshot}
                className="px-6 py-2.5 bg-brand-red text-white hover:bg-brand-red/90 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
              >
                Generate Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-On & Drink Attach Rate Details Modal */}
      {isAddonModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 lg:p-10 animate-in fade-in duration-200">
          <div 
            className="absolute inset-0 bg-brand-brown/80 backdrop-blur-md" 
            onClick={() => setIsAddonModalOpen(false)} 
          />
          <div className="relative bg-white w-full max-w-3xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-brand-stone animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-[#0f6b4f] p-6 lg:p-8 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-black uppercase tracking-widest bg-white/20 px-2.5 py-0.5 rounded-full text-emerald-200">
                    ATTACH RATE INTELLIGENCE
                  </span>
                  <span className="text-[9px] font-bold text-white/60">
                    {financialData.combinedOrdersCount} Commercial Orders
                  </span>
                </div>
                <h3 className="text-xl lg:text-2xl font-black text-white tracking-tight">
                  Add-On &amp; Drink Attach Rate Breakdown
                </h3>
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider mt-0.5">
                  Channel splits • Packaged vs Fresh handcrafted drinks
                </p>
              </div>
              <button 
                onClick={() => setIsAddonModalOpen(false)} 
                className="p-2.5 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6 no-scrollbar bg-[#faf8f5]">
              {/* Section 1: Add-On Orders by Channel */}
              <div className="bg-white rounded-3xl p-6 border border-brand-stone shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-brand-stone">
                  <div>
                    <h4 className="text-sm font-black uppercase text-brand-brown tracking-wider flex items-center gap-1.5">
                      <span>✨</span> Add-On Orders Attachment
                    </h4>
                    <p className="text-[10px] font-bold text-brand-brown/50 uppercase tracking-wider mt-0.5">
                      Percentage of orders containing special add-on items or upsells
                    </p>
                  </div>
                  <div className="flex items-baseline gap-2 bg-[#0f6b4f]/10 px-4 py-2 rounded-2xl border border-[#0f6b4f]/20">
                    <span className="text-2xl font-black text-[#0f6b4f]">
                      {financialData.addonPercent.toFixed(1)}%
                    </span>
                    <span className="text-xs font-bold text-brand-brown/60">
                      ({financialData.addonOrdersCount} of {financialData.combinedOrdersCount} orders)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-brand-brown/5 rounded-2xl p-4 border border-brand-stone flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] font-black uppercase text-brand-brown/60 tracking-wider">🥡 Takeaway Add-on</span>
                      <p className="text-2xl font-black text-brand-brown mt-1">
                        {financialData.takeawayAddonPercent.toFixed(1)}%
                      </p>
                    </div>
                    <p className="text-[10px] font-bold text-brand-brown/50 mt-2">
                      {financialData.takeawayAddonOrders} of {financialData.takeawayOrdersCount} takeaway orders
                    </p>
                  </div>

                  <div className="bg-brand-brown/5 rounded-2xl p-4 border border-brand-stone flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] font-black uppercase text-brand-brown/60 tracking-wider">🍽️ Dine-In Add-on</span>
                      <p className="text-2xl font-black text-brand-brown mt-1">
                        {financialData.dineInAddonPercent.toFixed(1)}%
                      </p>
                    </div>
                    <p className="text-[10px] font-bold text-brand-brown/50 mt-2">
                      {financialData.dineInAddonOrders} of {financialData.dineInOrdersCount} dine-in orders
                    </p>
                  </div>

                  <div className="bg-brand-brown/5 rounded-2xl p-4 border border-brand-stone flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-black uppercase text-brand-brown/60 tracking-wider">🛵 Delivery Add-on</span>
                        <div className="inline-flex bg-white p-0.5 rounded-lg border border-brand-stone">
                          {(['ALL', 'MINMOMOS', 'MINCHICKEN'] as const).map(b => (
                            <button
                              key={b}
                              type="button"
                              onClick={() => setAddonDeliveryBrandFilter(b)}
                              className={`px-1.5 py-0.5 rounded text-[7.5px] font-black uppercase cursor-pointer ${
                                addonDeliveryBrandFilter === b
                                  ? 'bg-[#0f6b4f] text-white'
                                  : 'text-brand-brown/50 hover:text-brand-brown'
                              }`}
                            >
                              {b === 'ALL' ? 'All' : b === 'MINMOMOS' ? '🥟 MM' : '🍗 MC'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-2xl font-black text-brand-brown mt-1">
                        {financialData.deliveryByBrand[addonDeliveryBrandFilter].addonPercent.toFixed(1)}%
                      </p>
                    </div>
                    <p className="text-[10px] font-bold text-brand-brown/50 mt-2">
                      {financialData.deliveryByBrand[addonDeliveryBrandFilter].addonOrders} of {financialData.deliveryByBrand[addonDeliveryBrandFilter].ordersCount} {addonDeliveryBrandFilter === 'ALL' ? 'delivery' : addonDeliveryBrandFilter === 'MINMOMOS' ? 'MinMomos' : 'MinChicken'} orders
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-brand-stone grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center justify-between p-3 bg-amber-50/80 rounded-xl border border-amber-200">
                    <span className="font-bold text-amber-900">In-Store / Offline (Dine-In + Takeaway):</span>
                    <span className="font-black text-amber-950">
                      {financialData.offlineAddonPercent.toFixed(1)}% ({financialData.offlineAddonOrdersCount}/{financialData.offlineOrdersCount})
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 p-3 bg-orange-50/80 rounded-xl border border-orange-200">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-orange-900">Online Channel (Delivery):</span>
                      <span className="font-black text-orange-950">
                        {financialData.onlineAddonPercent.toFixed(1)}% ({financialData.onlineAddonOrdersCount}/{financialData.onlineOrdersCount})
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-orange-800/80">
                      <span>🥟 MinMomos: {financialData.deliveryByBrand.MINMOMOS.addonPercent.toFixed(1)}% ({financialData.deliveryByBrand.MINMOMOS.addonOrders}/{financialData.deliveryByBrand.MINMOMOS.ordersCount})</span>
                      <span>🍗 MinChicken: {financialData.deliveryByBrand.MINCHICKEN.addonPercent.toFixed(1)}% ({financialData.deliveryByBrand.MINCHICKEN.addonOrders}/{financialData.deliveryByBrand.MINCHICKEN.ordersCount})</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Packaged vs Fresh Drink Attach Rate */}
              <div className="bg-white rounded-3xl p-6 border border-brand-stone shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-brand-stone">
                  <div>
                    <h4 className="text-sm font-black uppercase text-brand-brown tracking-wider flex items-center gap-1.5">
                      <span>🥤</span> Drink Attach Rate (Total)
                    </h4>
                    <p className="text-[10px] font-bold text-brand-brown/50 uppercase tracking-wider mt-0.5">
                      Bills containing at least one beverage (Packaged or Fresh)
                    </p>
                  </div>
                  <div className="flex items-baseline gap-2 bg-blue-50 px-4 py-2 rounded-2xl border border-blue-200">
                    <span className="text-2xl font-black text-blue-900">
                      {financialData.overallDrinkAttachPercent.toFixed(1)}%
                    </span>
                    <span className="text-xs font-bold text-blue-700">
                      ({financialData.drinkOrdersCount} of {financialData.combinedOrdersCount} orders)
                    </span>
                  </div>
                </div>

                {/* 2 Featured Breakdown Cards: Packaged vs Fresh */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Packaged Drinks Card */}
                  <div className="bg-amber-50/70 border-2 border-amber-300 rounded-3xl p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1">
                          🍾 Packaged Drinks
                        </span>
                        <span className="text-[9px] font-bold bg-amber-200/70 text-amber-950 px-2.5 py-0.5 rounded-full">
                          Bottled &amp; Canned
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-3xl font-black text-amber-950 tracking-tight">
                          {financialData.packagedDrinkAttachPercent.toFixed(1)}%
                        </span>
                        <span className="text-xs font-bold text-amber-800">
                          ({financialData.packagedDrinkOrdersCount} of {financialData.combinedOrdersCount} orders)
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-900/80 font-medium mt-3 leading-relaxed">
                        Pre-packaged packaged water, soda water, Campa Cola, Pepsi, Sprite, Coke, Fanta, and canned drinks.
                      </p>
                    </div>
                  </div>

                  {/* Fresh / Non-Packaged Drinks Card */}
                  <div className="bg-emerald-50/70 border-2 border-emerald-300 rounded-3xl p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1">
                          🍹 Fresh / In-House Drinks
                        </span>
                        <span className="text-[9px] font-bold bg-emerald-200/70 text-emerald-950 px-2.5 py-0.5 rounded-full">
                          Handcrafted
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-3xl font-black text-emerald-950 tracking-tight">
                          {financialData.nonPackagedDrinkAttachPercent.toFixed(1)}%
                        </span>
                        <span className="text-xs font-bold text-emerald-800">
                          ({financialData.nonPackagedDrinkOrdersCount} of {financialData.combinedOrdersCount} orders)
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-900/80 font-medium mt-3 leading-relaxed">
                        Handcrafted freshly prepared Virgin Mojitos, Mint Mojitos, Coolers, Lemonades, and Shakes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Channel-Wise Drink Attach Rates */}
              <div className="bg-white rounded-3xl p-6 border border-brand-stone shadow-sm">
                <div className="mb-4 pb-3 border-b border-brand-stone">
                  <h4 className="text-sm font-black uppercase text-brand-brown tracking-wider flex items-center gap-1.5">
                    <span>📊</span> Channel-Wise Drink Attach Rates
                  </h4>
                  <p className="text-[10px] font-bold text-brand-brown/50 uppercase tracking-wider mt-0.5">
                    Takeaway vs Dine-In vs Delivery drink preferences
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Takeaway Channel */}
                  <div className="bg-[#faf8f5] rounded-2xl p-4 border border-brand-stone flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-brand-brown/70 tracking-wider">Takeaway</span>
                        <span className="text-xs font-black text-[#0f6b4f]">
                          {financialData.takeawayDrinkAttachPercent.toFixed(1)}% Total
                        </span>
                      </div>
                      <p className="text-[10px] font-bold text-brand-brown/50 mt-0.5">
                        {financialData.takeawayDrinkOrders} of {financialData.takeawayOrdersCount} orders
                      </p>

                      <div className="mt-3 pt-3 border-t border-brand-stone space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-brand-brown/70 flex items-center gap-1">🍾 Packaged:</span>
                          <span className="font-black text-brand-brown">
                            {financialData.takeawayPackagedDrinkPercent.toFixed(1)}% <span className="text-[10px] font-bold text-brand-brown/50">({financialData.takeawayPackagedDrinkOrders})</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-brand-brown/70 flex items-center gap-1">🍹 Fresh:</span>
                          <span className="font-black text-emerald-700">
                            {financialData.takeawayNonPackagedDrinkPercent.toFixed(1)}% <span className="text-[10px] font-bold text-brand-brown/50">({financialData.takeawayNonPackagedDrinkOrders})</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dine-In Channel */}
                  <div className="bg-[#faf8f5] rounded-2xl p-4 border border-brand-stone flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-brand-brown/70 tracking-wider">Dine-In</span>
                        <span className="text-xs font-black text-[#0f6b4f]">
                          {financialData.dineInDrinkAttachPercent.toFixed(1)}% Total
                        </span>
                      </div>
                      <p className="text-[10px] font-bold text-brand-brown/50 mt-0.5">
                        {financialData.dineInDrinkOrders} of {financialData.dineInOrdersCount} orders
                      </p>

                      <div className="mt-3 pt-3 border-t border-brand-stone space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-brand-brown/70 flex items-center gap-1">🍾 Packaged:</span>
                          <span className="font-black text-brand-brown">
                            {financialData.dineInPackagedDrinkPercent.toFixed(1)}% <span className="text-[10px] font-bold text-brand-brown/50">({financialData.dineInPackagedDrinkOrders})</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-brand-brown/70 flex items-center gap-1">🍹 Fresh:</span>
                          <span className="font-black text-emerald-700">
                            {financialData.dineInNonPackagedDrinkPercent.toFixed(1)}% <span className="text-[10px] font-bold text-brand-brown/50">({financialData.dineInNonPackagedDrinkOrders})</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Channel */}
                  <div className="bg-[#faf8f5] rounded-2xl p-4 border border-brand-stone flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-black uppercase text-brand-brown/70 tracking-wider">
                          Delivery {addonDeliveryBrandFilter === 'MINMOMOS' ? '• 🥟 MM' : addonDeliveryBrandFilter === 'MINCHICKEN' ? '• 🍗 MC' : ''}
                        </span>
                        <span className="text-xs font-black text-[#0f6b4f]">
                          {financialData.deliveryByBrand[addonDeliveryBrandFilter].drinkAttachPercent.toFixed(1)}% Total
                        </span>
                      </div>
                      <p className="text-[10px] font-bold text-brand-brown/50 mt-0.5">
                        {financialData.deliveryByBrand[addonDeliveryBrandFilter].drinkOrders} of {financialData.deliveryByBrand[addonDeliveryBrandFilter].ordersCount} orders
                      </p>

                      <div className="mt-3 pt-3 border-t border-brand-stone space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-brand-brown/70 flex items-center gap-1">🍾 Packaged:</span>
                          <span className="font-black text-brand-brown">
                            {financialData.deliveryByBrand[addonDeliveryBrandFilter].packagedDrinkPercent.toFixed(1)}% <span className="text-[10px] font-bold text-brand-brown/50">({financialData.deliveryByBrand[addonDeliveryBrandFilter].packagedDrinkOrders})</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-brand-brown/70 flex items-center gap-1">🍹 Fresh:</span>
                          <span className="font-black text-emerald-700">
                            {financialData.deliveryByBrand[addonDeliveryBrandFilter].nonPackagedDrinkPercent.toFixed(1)}% <span className="text-[10px] font-bold text-brand-brown/50">({financialData.deliveryByBrand[addonDeliveryBrandFilter].nonPackagedDrinkOrders})</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-1.5 border-t border-brand-stone/60 text-[9.5px] font-bold text-brand-brown/60">
                          <span>🥟 {financialData.deliveryByBrand.MINMOMOS.drinkAttachPercent.toFixed(1)}%</span>
                          <span>🍗 {financialData.deliveryByBrand.MINCHICKEN.drinkAttachPercent.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-white p-4 lg:p-6 border-t border-brand-stone flex items-center justify-between">
              <p className="text-[10px] font-bold text-brand-brown/50">
                Data dynamically calculated from {financialData.combinedOrdersCount} commercial orders in the active filter period.
              </p>
              <button 
                onClick={() => setIsAddonModalOpen(false)}
                className="px-6 py-2.5 bg-[#0f6b4f] hover:bg-[#0c563f] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Intelligence Hub Modal */}
      <StudentIntelligenceModal
        isOpen={isStudentScorecardOpen}
        onClose={() => setIsStudentScorecardOpen(false)}
        metrics={studentSegmentMetrics}
        startDate={startDate}
        endDate={endDate}
        segmentFilter={segmentFilter}
        onSelectSegment={(seg: 'ALL' | 'STUDENT' | 'REGULAR') => {
          setSegmentFilter(seg);
          setIsStudentScorecardOpen(false);
        }}
      />
    </div>
  );
};

export default Analytics;
