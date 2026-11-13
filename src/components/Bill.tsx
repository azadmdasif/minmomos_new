
import React from 'react';
import { OrderItem, OrderType, Customer, MenuItem } from '../types';
import BillItem from './BillItem';
import { GIFT_CAMPA_COLA } from '../constants';
import { getCustomerByPhone, getTierInfo, registerCustomer, searchCustomers, updateCustomer, fetchMenuItems } from '../utils/storage';
import { getActiveCouponForCustomer, syncCouponFromSupabase, getMarketingCoupons, saveMarketingCoupons, MarketingCoupon, getLocalCustomOffers, saveLocalCustomOffers, fetchCustomOffersFromSupabase, CustomOffer, getActiveClaimsForCustomer, syncFreeItemClaimsFromSupabaseForCustomer, getActiveDiscountClaimsForCustomer, syncDiscountClaimsFromSupabaseForCustomer } from '../utils/marketingStorage';
import CelebrationOverlay from './CelebrationOverlay';
import NewCustomerModal from './NewCustomerModal';
import { StudentGangModal } from './StudentGangModal';
import { validateReferralCode, validateGangCoupon, checkReferralEligibility, getWhatsAppReferralShareUrl, getWhatsAppGangCouponUrl, markReferralCodeAsSent, markGangCouponAsSent, ensureCustomerGangCoupon } from '../utils/referralStorage';

interface BillProps {
  orderItems: OrderItem[];
  onUpdateQuantity: (itemId: string, newQuantity: number) => void;
  onClear: () => void;
  onPreview: () => void;
  branchName: string | null;
  onAddItem: (items: OrderItem[]) => void;
  orderType: OrderType;
  setOrderType: (type: OrderType) => void;
  customerPhone: string;
  setCustomerPhone: (phone: string) => void;
  onPromptVipReferral?: (customer: Customer) => void;
  onPromptStudentGang?: (customer: Customer) => void;
}

const Bill: React.FC<BillProps> = ({ 
  orderItems, 
  onUpdateQuantity, 
  onClear, 
  onPreview, 
  branchName, 
  onAddItem, 
  orderType,
  setOrderType,
  customerPhone,
  setCustomerPhone,
  onPromptVipReferral,
  onPromptStudentGang
}) => {
  const total = orderItems.reduce((acc, item) => acc + item.price * item.quantity, 0);

  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [showCelebration, setShowCelebration] = React.useState(false);
  const [celebratedTier, setCelebratedTier] = React.useState<string | null>(null);
  const [showNewCustomerPrompt, setShowNewCustomerPrompt] = React.useState(false);
  const [isPromptForExisting, setIsPromptForExisting] = React.useState(false);
  
  const [menuItems, setMenuItems] = React.useState<MenuItem[]>([]);
  const [searchResults, setSearchResults] = React.useState<Customer[]>([]);
  const [showSearchResults, setShowSearchResults] = React.useState(false);
  const lastCheckedPhone = React.useRef<string | null>(null);

  const tier = customer ? getTierInfo(customer.totalSpent) : null;
  const isStale = customer?.lastVisit ? (new Date().getTime() - new Date(customer.lastVisit).getTime()) > 30 * 24 * 60 * 60 * 1000 : false;
  
  const [activePromoCoupon, setActivePromoCoupon] = React.useState<MarketingCoupon | null>(null);

  // Custom POS Offers State
  const [customOffers, setCustomOffers] = React.useState<CustomOffer[]>([]);

  React.useEffect(() => {
    // 1. Get cached local state
    setCustomOffers(getLocalCustomOffers());
    // 2. Refresh from Supabase
    fetchCustomOffersFromSupabase().then(dbOffers => {
      if (dbOffers && dbOffers.length > 0) {
        saveLocalCustomOffers(dbOffers);
        setCustomOffers(dbOffers);
      }
    });
  }, []);

  React.useEffect(() => {
    setCustomOffers(getLocalCustomOffers());
  }, [customerPhone, orderItems]);

  // Student Gang State
  const [showGangModal, setShowGangModal] = React.useState(false);
  const [gangModalInitialCode, setGangModalInitialCode] = React.useState('');

  // Unified Coupon / Referral Code State
  const [couponInputCode, setCouponInputCode] = React.useState('');
  const [couponError, setCouponError] = React.useState<string | null>(null);
  const [couponSuccessMessage, setCouponSuccessMessage] = React.useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = React.useState(false);

  // Helper: check if an item is a coupon/discount item
  const isCouponOrDiscountItem = (item: { id?: string; menuItemId?: string; price: number; name?: string }) => {
    if (!item) return false;
    return (
      item.id === 'loyalty-discount' ||
      item.id === 'referral-discount' ||
      item.id === 'student-gang-discount' ||
      item.id === 'welcome-discount' ||
      item.id === 'promo-mojito' ||
      Boolean(item.id && item.id.startsWith('custom-discount-')) ||
      Boolean(item.id && item.id.startsWith('promo-discount-')) ||
      item.menuItemId === 'discount' ||
      (item.price < 0 && !item.id?.startsWith('free-gift-'))
    );
  };

  // Helper: remove other active coupons/discounts so two coupons can NEVER be combined
  const clearOtherDiscounts = (excludeId?: string) => {
    orderItems.forEach(i => {
      if (isCouponOrDiscountItem(i) && i.id !== excludeId) {
        onUpdateQuantity(i.id, 0);
      }
    });
  };

  const referralDiscountItem = orderItems.find(i => i.id === 'referral-discount');
  const hasGangDiscount = orderItems.some(i => i.id === 'student-gang-discount');

  // Auto-recalculate 50% referral discount (up to ₹100 max) whenever standard subtotal changes
  React.useEffect(() => {
    const referralItem = orderItems.find(i => i.id === 'referral-discount');
    if (!referralItem) return;

    // Strict single-coupon enforcement: remove any accidental stacked discounts
    const stacked = orderItems.filter(i => i.id !== 'referral-discount' && isCouponOrDiscountItem(i));
    if (stacked.length > 0) {
      stacked.forEach(d => onUpdateQuantity(d.id, 0));
    }

    const baseSubtotal = orderItems
      .filter(i => !isCouponOrDiscountItem(i) && i.price > 0)
      .reduce((acc, i) => acc + i.price * i.quantity, 0);

    const expectedDiscount = -Math.min(100, Math.round(baseSubtotal * 0.5));
    if (baseSubtotal <= 0) {
      onUpdateQuantity('referral-discount', 0);
    } else if (Math.abs(referralItem.price - expectedDiscount) > 0.01) {
      onAddItem([{
        ...referralItem,
        price: expectedDiscount,
        quantity: 1
      }]);
    }
  }, [orderItems, onAddItem, onUpdateQuantity]);

  // Auto-recalculate Flat 50% student gang discount (up to ₹200 max) whenever standard subtotal changes
  React.useEffect(() => {
    const gangItem = orderItems.find(i => i.id === 'student-gang-discount');
    if (!gangItem) return;

    // Strict single-coupon enforcement: remove any accidental stacked discounts
    const stacked = orderItems.filter(i => i.id !== 'student-gang-discount' && isCouponOrDiscountItem(i));
    if (stacked.length > 0) {
      stacked.forEach(d => onUpdateQuantity(d.id, 0));
    }

    const baseSubtotal = orderItems
      .filter(i => !isCouponOrDiscountItem(i) && i.price > 0)
      .reduce((acc, i) => acc + i.price * i.quantity, 0);

    const expectedDiscount = -Math.min(200, Math.round(baseSubtotal * 0.50));
    if (baseSubtotal <= 0) {
      onUpdateQuantity('student-gang-discount', 0);
    } else if (Math.abs(gangItem.price - expectedDiscount) > 0.01) {
      onAddItem([{
        ...gangItem,
        price: expectedDiscount,
        quantity: 1
      }]);
    }
  }, [orderItems, onAddItem, onUpdateQuantity]);

  // Auto-recalculate Welcome 15% discount whenever standard subtotal changes
  React.useEffect(() => {
    const welcomeItem = orderItems.find(i => i.id === 'welcome-discount');
    if (!welcomeItem) return;

    // Strict single-coupon enforcement: remove any accidental stacked discounts
    const stacked = orderItems.filter(i => i.id !== 'welcome-discount' && isCouponOrDiscountItem(i));
    if (stacked.length > 0) {
      stacked.forEach(d => onUpdateQuantity(d.id, 0));
    }

    const baseSubtotal = orderItems
      .filter(i => !isCouponOrDiscountItem(i) && i.price > 0)
      .reduce((acc, i) => acc + i.price * i.quantity, 0);

    const expectedDiscount = -Math.round(baseSubtotal * 0.15);
    if (baseSubtotal <= 0) {
      onUpdateQuantity('welcome-discount', 0);
    } else if (Math.abs(welcomeItem.price - expectedDiscount) > 0.01) {
      onAddItem([{
        ...welcomeItem,
        price: expectedDiscount,
        quantity: 1
      }]);
    }
  }, [orderItems, onAddItem, onUpdateQuantity]);

  // Unified Coupon Processor: Auto-detects whether entered code is a Gang Coupon or a Referral Code
  const handleApplyUnifiedCoupon = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = couponInputCode.trim().toUpperCase();
    if (!cleanCode) {
      setCouponError('Please enter a coupon or referral code.');
      return;
    }

    setCouponError(null);
    setCouponSuccessMessage(null);
    setIsApplyingCoupon(true);

    const hadStudentDiscount = orderItems.some(i => i.id === 'loyalty-discount' && (i.name.includes('Student') || customer?.note?.includes('STUDENT')));
    const hadOtherCoupon = orderItems.some(i => isCouponOrDiscountItem(i));

    try {
      // 1. Check if it's a Student Gang Coupon (starts with GANG- or registered gang coupon)
      if (cleanCode.startsWith('GANG-')) {
        const gangRes = await validateGangCoupon(cleanCode);
        if (!gangRes.valid) {
          setCouponError(gangRes.error || 'Invalid student gang coupon.');
          setIsApplyingCoupon(false);
          return;
        }

        // Remove any other coupon/discount so two coupons can never be combined
        clearOtherDiscounts('student-gang-discount');

        setGangModalInitialCode(cleanCode);
        setShowGangModal(true);
        setCouponSuccessMessage(`Student Gang Coupon recognized! Enlist 3+ gang members to claim Flat 50% off (up to ₹200).${hadStudentDiscount ? ' (Student discount replaced — two coupons cannot be combined)' : ''}`);
        setIsApplyingCoupon(false);
        return;
      }

      // 2. Check if it's a VIP Referral Code (starts with MOMO- or registered referral code)
      if (cleanCode.startsWith('MOMO-')) {
        if (!customerPhone || customerPhone.length !== 10) {
          setCouponError("Please enter the customer's 10-digit mobile number above first.");
          setIsApplyingCoupon(false);
          return;
        }

        const refRes = await validateReferralCode(cleanCode, customerPhone);
        if (!refRes.valid) {
          setCouponError(refRes.error || 'Invalid referral code.');
          setIsApplyingCoupon(false);
          return;
        }

        const standardSubtotal = orderItems
          .filter(i => !isCouponOrDiscountItem(i) && i.price > 0)
          .reduce((acc, i) => acc + i.price * i.quantity, 0);

        if (standardSubtotal <= 0) {
          setCouponError("Please add items to your cart before applying referral discount.");
          setIsApplyingCoupon(false);
          return;
        }

        // CRITICAL: Remove student discount, loyalty discount, or any other coupon so two coupons NEVER combine!
        clearOtherDiscounts('referral-discount');

        const discountAmt = Math.min(100, Math.round(standardSubtotal * 0.5));
        onAddItem([{
          id: 'referral-discount',
          menuItemId: 'discount',
          name: `🎁 Referral 50% Off (Max ₹100) - Code: ${cleanCode}`,
          price: -discountAmt,
          quantity: 1,
          cost: 0
        }]);

        setCouponInputCode('');
        const comboNotice = hadStudentDiscount 
          ? ' (10% Student discount removed — two coupons cannot be combined).'
          : (hadOtherCoupon ? ' (Previous coupon removed — two coupons cannot be combined).' : '.');
        setCouponSuccessMessage(`Referral discount applied! Saved ₹${discountAmt}${comboNotice}`);
        setIsApplyingCoupon(false);
        return;
      }

      // 3. Fallback: try checking gang validation in DB / local storage
      const gangCheck = await validateGangCoupon(cleanCode);
      if (gangCheck.valid) {
        clearOtherDiscounts('student-gang-discount');
        setGangModalInitialCode(cleanCode);
        setShowGangModal(true);
        setCouponSuccessMessage(`Student Gang Coupon recognized! Enlist 3+ gang members to claim Flat 50% off (up to ₹200).${hadStudentDiscount ? ' (Student discount replaced — two coupons cannot be combined)' : ''}`);
        setIsApplyingCoupon(false);
        return;
      }

      // 4. Fallback: try checking referral validation in DB / local storage
      if (customerPhone && customerPhone.length === 10) {
        const refCheck = await validateReferralCode(cleanCode, customerPhone);
        if (refCheck.valid) {
          const standardSubtotal = orderItems
            .filter(i => !isCouponOrDiscountItem(i) && i.price > 0)
            .reduce((acc, i) => acc + i.price * i.quantity, 0);

          if (standardSubtotal <= 0) {
            setCouponError("Please add items to your cart before applying referral discount.");
            setIsApplyingCoupon(false);
            return;
          }

          clearOtherDiscounts('referral-discount');

          const discountAmt = Math.min(100, Math.round(standardSubtotal * 0.5));
          onAddItem([{
            id: 'referral-discount',
            menuItemId: 'discount',
            name: `🎁 Referral 50% Off (Max ₹100) - Code: ${cleanCode}`,
            price: -discountAmt,
            quantity: 1,
            cost: 0
          }]);

          setCouponInputCode('');
          const comboNotice = hadStudentDiscount 
            ? ' (10% Student discount removed — two coupons cannot be combined).'
            : (hadOtherCoupon ? ' (Previous coupon removed — two coupons cannot be combined).' : '.');
          setCouponSuccessMessage(`Referral discount applied! Saved ₹${discountAmt}${comboNotice}`);
          setIsApplyingCoupon(false);
          return;
        }
      }

      // 5. Welcome Coupon (starts with DISC15- or matches customer welcome coupon code)
      if (cleanCode.startsWith('DISC15-') || (customer?.welcomeCouponCode && cleanCode === customer.welcomeCouponCode.toUpperCase())) {
        if (customer?.welcomeCouponUsed) {
          setCouponError("This welcome coupon has already been redeemed.");
          setIsApplyingCoupon(false);
          return;
        }
        const standardSubtotal = orderItems
          .filter(i => !isCouponOrDiscountItem(i) && i.price > 0)
          .reduce((acc, i) => acc + i.price * i.quantity, 0);

        if (standardSubtotal <= 0) {
          setCouponError("Please add items to your cart before applying welcome coupon.");
          setIsApplyingCoupon(false);
          return;
        }

        clearOtherDiscounts('welcome-discount');

        const discountAmt = Math.round(standardSubtotal * 0.15);
        onAddItem([{
          id: 'welcome-discount',
          menuItemId: 'discount',
          name: `🎉 Welcome 15% Off - Code: ${cleanCode}`,
          price: -discountAmt,
          quantity: 1,
          cost: 0
        }]);

        setCouponInputCode('');
        const comboNotice = hadStudentDiscount 
          ? ' (Student discount removed — two coupons cannot be combined).'
          : (hadOtherCoupon ? ' (Previous coupon removed — two coupons cannot be combined).' : '.');
        setCouponSuccessMessage(`Welcome coupon applied! Saved ₹${discountAmt}${comboNotice}`);
        setIsApplyingCoupon(false);
        return;
      }

      // 6. Marketing Promo Coupon (starts with TREAT- or matches saved marketing coupon)
      const marketingCoupons = getMarketingCoupons();
      const matchedPromo = marketingCoupons.find(c => c.couponCode.toUpperCase() === cleanCode && !c.isUsed);
      if (matchedPromo || cleanCode.startsWith('TREAT-')) {
        clearOtherDiscounts('promo-mojito');

        onAddItem([{
          id: 'promo-mojito',
          menuItemId: 'promo-mojito',
          name: `🍹 Free Virgin Mojito - Code: ${cleanCode}`,
          price: 0,
          quantity: 1,
          cost: 0
        }]);
        setCouponInputCode('');
        const comboNotice = hadStudentDiscount 
          ? ' (Student discount removed — two coupons cannot be combined).'
          : (hadOtherCoupon ? ' (Previous coupon removed — two coupons cannot be combined).' : '.');
        setCouponSuccessMessage(`Coupon applied! Free Virgin Mojito added to order${comboNotice}`);
        setIsApplyingCoupon(false);
        return;
      }

      setCouponError(`Unrecognized or invalid coupon "${cleanCode}".`);
      setIsApplyingCoupon(false);
    } catch (err: any) {
      setCouponError(err?.message || 'Error processing coupon code');
      setIsApplyingCoupon(false);
    }
  };

  const subtotal = React.useMemo(() => {
    return orderItems.reduce((acc, i) => acc + (i.price > 0 && i.id !== 'promo-mojito' && i.id !== 'loyalty-discount' && !i.id.startsWith('free-gift-') && !i.id.startsWith('custom-discount-') ? i.price * i.quantity : 0), 0);
  }, [orderItems]);

  const qualifiedOffer = React.useMemo(() => {
    // Find active offer that matches customer stage and is above min order value
    let stage: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' = 'L0';
    if (customer) {
      if (customer.totalOrders === 0) stage = 'L0';
      else if (customer.totalOrders === 1) stage = 'L1';
      else if (customer.totalOrders === 2) stage = 'L2';
      else if (customer.totalOrders === 3) stage = 'L3';
      else if (customer.totalOrders === 4) stage = 'L4';
      else if (customer.totalOrders >= 5) stage = 'L5';
    }
    
    return customOffers.find(offer => {
      if (!offer.isActive) return false;
      const matchesGroup = offer.targetGroup === 'all' || offer.targetGroup === stage;
      const matchesValue = subtotal >= offer.minOrderValue;
      return matchesGroup && matchesValue;
    });
  }, [customer, customOffers, orderItems]);

  React.useEffect(() => {
    if (!customer) {
      setActivePromoCoupon(null);
      return;
    }

    // 1. Load active coupon instantly from local storage
    const localCoupon = getActiveCouponForCustomer(customer.phone);
    setActivePromoCoupon(localCoupon);

    // 2. Fetch latest coupon from Supabase in the background
    let mounted = true;
    const fetchLatest = async () => {
      try {
        const dbCoupon = await syncCouponFromSupabase(customer.phone);
        if (!mounted) return;
        
        if (dbCoupon) {
          const currentCoupons = getMarketingCoupons();
          const exists = currentCoupons.find(c => c.couponCode === dbCoupon.couponCode);
          if (!exists) {
            // Unify: invalidate older coupons in localStorage
            const cleaned = customer.phone.replace(/\D/g, '');
            const digits = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
            const updated = currentCoupons.map(c => {
              if (c.phone === digits && !c.isUsed) {
                return { ...c, isUsed: true };
              }
              return c;
            });
            updated.push(dbCoupon);
            saveMarketingCoupons(updated);
            setActivePromoCoupon(dbCoupon);
          } else {
            // Update the used status if it differed
            if (exists.isUsed !== dbCoupon.isUsed) {
              const updated = currentCoupons.map(c => {
                if (c.couponCode === dbCoupon.couponCode) {
                  return { ...c, isUsed: dbCoupon.isUsed };
                }
                return c;
              });
              saveMarketingCoupons(updated);
            }
            if (!dbCoupon.isUsed) {
              setActivePromoCoupon(dbCoupon);
            } else {
              setActivePromoCoupon(null);
            }
          }
        }
      } catch (err) {
        console.error('Failed background sync of coupon from Supabase:', err);
      }
    };
    fetchLatest();

    return () => {
      mounted = false;
    };
  }, [customer]);

  const [activeFreeClaims, setActiveFreeClaims] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (customerPhone && customerPhone.length === 10) {
      syncFreeItemClaimsFromSupabaseForCustomer(customerPhone).then(() => {
        const claims = getActiveClaimsForCustomer(customerPhone);
        setActiveFreeClaims(claims);
      });
    } else {
      setActiveFreeClaims([]);
    }
  }, [customerPhone]);

  const [activeDiscountClaims, setActiveDiscountClaims] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (customerPhone && customerPhone.length === 10) {
      syncDiscountClaimsFromSupabaseForCustomer(customerPhone).then(() => {
        const claims = getActiveDiscountClaimsForCustomer(customerPhone);
        setActiveDiscountClaims(claims || []);
      });
    } else {
      setActiveDiscountClaims([]);
    }
  }, [customerPhone]);

  const subtotalWithoutPromo = React.useMemo(() => {
    return orderItems.reduce((acc, i) => acc + (i.id !== 'promo-mojito' && i.id !== 'loyalty-discount' && i.price > 0 ? i.price * i.quantity : 0), 0);
  }, [orderItems]);

  const hasPromoMojitoApplied = orderItems.some(i => i.id === 'promo-mojito');

  React.useEffect(() => {
    if (hasPromoMojitoApplied && subtotalWithoutPromo <= 99) {
      onUpdateQuantity('promo-mojito', 0);
    }
  }, [subtotalWithoutPromo, hasPromoMojitoApplied, onUpdateQuantity]);
  
  const [showConvertStudentModal, setShowConvertStudentModal] = React.useState(false);
  const [convertSchoolName, setConvertSchoolName] = React.useState('');

  const hasAppliedLoyaltyDiscount = orderItems.find(item => item.id === 'loyalty-discount');

  const loyaltyDiscount = React.useMemo(() => {
    if (!customer) return null;
    if (customer.note === 'STUDENT' || customer.note?.startsWith('STUDENT|')) {
      return { percentage: 10, label: '10% Student Discount', code: `STUDENT10-${customer.phone.slice(-4)}` };
    }
    const count = customer.totalOrders;
    if (count === 1) return { percentage: 15, label: '15% Loyalty (2nd Visit)', code: `DISC15-${customer.phone.slice(-4)}` };
    if (count === 2) return { percentage: 10, label: '10% Loyalty (3rd Visit)', code: `DISC10-${customer.phone.slice(-4)}` };
    if (count === 3) return { percentage: 5, label: '5% Loyalty (4th Visit)', code: `DISC5-${customer.phone.slice(-4)}` };
    return null;
  }, [customer]);

  // Load Menu Items for reward logic
  React.useEffect(() => {
    fetchMenuItems().then(res => {
      if (res.data) setMenuItems(res.data);
    });
  }, []);

  // Reward Suggestions Logic
  const rewardSuggestion = React.useMemo(() => {
    if (!customer || !customer.minCoins || customer.minCoins <= 0) return null;

    const possibleRewards: { name: string, coinsNeeded: number, gap: number }[] = [];

    menuItems.forEach(item => {
      if (item.minCoinsPrices) {
        Object.entries(item.minCoinsPrices).forEach(([_prep, sizes]) => {
          if (sizes && typeof sizes === 'object') {
            Object.entries(sizes).forEach(([size, coins]) => {
              const coinValue = Number(coins);
              if (coinValue && (customer.minCoins ?? 0) >= coinValue && total < coinValue) {
                possibleRewards.push({
                  name: `${item.name}${size !== 'normal' ? ` (${size.charAt(0).toUpperCase() + size.slice(1)})` : ''}`,
                  coinsNeeded: coinValue,
                  gap: coinValue - total
                });
              }
            });
          }
        });
      }
    });

    if (possibleRewards.length === 0) return null;

    // Return the one with smallest gap
    return possibleRewards.sort((a, b) => a.gap - b.gap)[0];
  }, [customer, total, menuItems]);

  // Search Logic
  React.useEffect(() => {
    if (customerPhone.length >= 3 && customerPhone.length < 10) {
      const search = async () => {
        const results = await searchCustomers(customerPhone);
        setSearchResults(results);
        setShowSearchResults(true);
      };
      search();
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  }, [customerPhone]);

  React.useEffect(() => {
    if (customerPhone && customerPhone.length === 10) {
      if (customerPhone === lastCheckedPhone.current) return;
      
      const loadCustomer = async () => {
        const cust = await getCustomerByPhone(customerPhone);
        lastCheckedPhone.current = customerPhone;

        if (cust) {
          let updatedCust = cust;
          const isStudent = updatedCust.note === 'STUDENT' || updatedCust.note?.startsWith('STUDENT|');

          if (isStudent) {
            // FOR STUDENTS: GANG COUPON IS FIRST PRIORITY!
            updatedCust = await ensureCustomerGangCoupon(updatedCust);
            setCustomer(updatedCust);
            if (!updatedCust.gangCouponSent && onPromptStudentGang) {
              onPromptStudentGang(updatedCust);
            } else if (checkReferralEligibility(updatedCust) && !updatedCust.referralCodeSent && onPromptVipReferral) {
              onPromptVipReferral(updatedCust);
            }
          } else {
            setCustomer(updatedCust);
            // Check if eligible prospective VIP member and code not sent yet
            if (checkReferralEligibility(updatedCust) && !updatedCust.referralCodeSent && onPromptVipReferral) {
              onPromptVipReferral(updatedCust);
            }
          }

          // MISSING NAME Logic
          if (!updatedCust.name) {
            setIsPromptForExisting(true);
            setShowNewCustomerPrompt(true);
          }

          // VOIDED / RE-FIRST ORDER Logic
          if (isStudent) {
            const hasMojitoInOrder = orderItems.some(item => item.id === 'student-mojito-gift' || item.name.includes('Student Promo'));
            if (cust.totalOrders === 0 && !hasMojitoInOrder) {
              onAddItem([{
                id: 'student-mojito-gift',
                menuItemId: 'promo-mojito',
                name: '🍹 Free Virgin Mojito (Student Promo)',
                price: 0,
                quantity: 1,
                cost: 0
              }]);
            }
          } else {
            const hasGiftInOrder = orderItems.some(item => item.name.includes('Celebratory Campa Cola (Gift)'));
            if (cust.totalOrders === 0 && !hasGiftInOrder) {
              onAddItem([{
                ...GIFT_CAMPA_COLA,
                id: `welcome-gift-${Date.now()}`
              }]);
            }
          }
        } else {
          // NEW CUSTOMER Logic
          setIsPromptForExisting(false);
          setShowNewCustomerPrompt(true);
        }
      };
      loadCustomer();
    } else {
      setCustomer(null);
      setCelebratedTier(null);
      lastCheckedPhone.current = null;
      setShowNewCustomerPrompt(false);
      setIsPromptForExisting(false);
    }
  }, [customerPhone]);

  const handleRegisterCustomer = async (name: string, isStudentRegister?: boolean, schoolName?: string) => {
    try {
      if (isPromptForExisting && customer) {
        let note = customer.note || 'REGULAR';
        if (isStudentRegister) {
          const digits = customer.phone.replace(/\D/g, '');
          const hikerNo = `HIKER-${digits.length >= 8 ? digits.slice(-8) : (digits + '87654321').slice(0, 8)}`;
          note = `STUDENT|${schoolName || ''}|${hikerNo}`;
        } else if (note.startsWith('STUDENT')) {
          note = 'REGULAR';
        }
        await updateCustomer(customer.id, { name, note });
        setCustomer({ ...customer, name, note });
      } else {
        const newCust = await registerCustomer(customerPhone, name, isStudentRegister, schoolName);
        setCustomer(newCust);
        if (isStudentRegister) {
          // Add Free Virgin Mojito
          const hasMojito = orderItems.some(item => item.id === 'student-mojito-gift' || item.name.includes('Student Promo'));
          if (!hasMojito) {
            onAddItem([{
              id: 'student-mojito-gift',
              menuItemId: 'promo-mojito',
              name: '🍹 Free Virgin Mojito (Student Promo)',
              price: 0,
              quantity: 1,
              cost: 0
            }]);
          }
        } else {
          // Welcome Gift logic
          const hasGift = orderItems.some(item => item.id === GIFT_CAMPA_COLA.id);
          if (!hasGift) {
            onAddItem([{ ...GIFT_CAMPA_COLA, id: `welcome-gift-${Date.now()}` }]);
          }
        }
      }
      setShowNewCustomerPrompt(false);
    } catch (err) {
      console.error("Registration failed", err);
    }
  };

  const handleSaveStudentConversion = async () => {
    if (!customer) return;
    try {
      const digits = customer.phone.replace(/\D/g, '');
      const hikerNo = `HIKER-${digits.length >= 8 ? digits.slice(-8) : (digits + '87654321').slice(0, 8)}`;
      const note = `STUDENT|${convertSchoolName.trim()}|${hikerNo}`;
      
      await updateCustomer(customer.id, { note });
      let updatedCust: Customer = { ...customer, note };
      updatedCust = await ensureCustomerGangCoupon(updatedCust);
      setCustomer(updatedCust);
      setShowConvertStudentModal(false);

      // Trigger Student Gang modal as FIRST PRIORITY!
      if (!updatedCust.gangCouponSent && onPromptStudentGang) {
        onPromptStudentGang(updatedCust);
      }
    } catch (err) {
      console.error("Failed to convert customer to student:", err);
    }
  };

  const handleRemoveStudentCategory = async () => {
    if (!customer) return;
    try {
      const note = 'REGULAR';
      await updateCustomer(customer.id, { note });
      setCustomer({ ...customer, note });
      setShowConvertStudentModal(false);
    } catch (err) {
      console.error("Failed to remove student category:", err);
    }
  };

  // Auto-apply or update discount
  React.useEffect(() => {
    const discountItems = orderItems.filter(i => i.id === 'loyalty-discount');
    const isStudentCategory = customer && (customer.note === 'STUDENT' || customer.note?.startsWith('STUDENT|'));

    // CRITICAL: Two coupons can NEVER be combined!
    // Check if ANY other coupon or discount is currently active on the cart (referral, student gang, welcome, promo, etc.)
    const hasOtherCouponOrDiscount = orderItems.some(i => 
      i.id !== 'loyalty-discount' && isCouponOrDiscountItem(i)
    );

    if (hasOtherCouponOrDiscount) {
      // If another coupon is active, immediately remove loyalty/student discount so they NEVER combine
      if (discountItems.length > 0) {
        onUpdateQuantity('loyalty-discount', 0);
      }
      return;
    }
    
    if ((isStudentCategory || (customer && customer.totalOrders > 0)) && discountItems.length === 0) {
      const subtotal = orderItems.reduce((acc, i) => acc + (!isCouponOrDiscountItem(i) && i.price > 0 ? i.price * i.quantity : 0), 0);
      if (subtotal > 0 && loyaltyDiscount) {
        onAddItem([{
          id: 'loyalty-discount',
          menuItemId: 'discount',
          name: loyaltyDiscount.label,
          price: -(subtotal * (loyaltyDiscount.percentage / 100)),
          quantity: 1,
          cost: 0
        }]);
      }
    } else if (discountItems.length > 0) {
      const subtotal = orderItems.reduce((acc, i) => acc + (!isCouponOrDiscountItem(i) && i.price > 0 ? i.price * i.quantity : 0), 0);
      
      discountItems.forEach(discountItem => {
        const pct = (loyaltyDiscount?.percentage ? loyaltyDiscount.percentage / 100 : 0);
        const expectedDiscount = -(subtotal * pct);
        
        if (Math.abs(discountItem.price - expectedDiscount) > 0.01) {
          if (subtotal > 0 && pct > 0) {
            onAddItem([{
              ...discountItem,
              price: expectedDiscount
            }]);
          } else {
            onUpdateQuantity(discountItem.id, 0); // Remove if subtotal is 0 or no pct
          }
        }
      });
    }
  }, [orderItems, onAddItem, onUpdateQuantity, loyaltyDiscount, customer]);

  const canRedeemSomething = customer && (customer.minCoins || 0) >= 100;
  const projectedTotal = (customer?.totalSpent || 0) + total;
  const projectedTier = getTierInfo(projectedTotal);
  const nextTarget = projectedTier?.next?.min;
  const isCloseToNextTier = nextTarget !== undefined && customer !== null && (nextTarget - projectedTotal) <= 100;

  // Tier Climb Logic
  React.useEffect(() => {
    if (customer && total > 0) {
      const currentTierInfo = getTierInfo(customer.totalSpent);

      if (projectedTier.min > currentTierInfo.min && projectedTier.name !== celebratedTier) {
        // We have a climb!
        setCelebratedTier(projectedTier.name);
        setShowCelebration(true);
        
        // Add Campa Cola if not already added as gift
        if (customer.note !== 'STUDENT' && !customer.note?.startsWith('STUDENT|')) {
          const hasGift = orderItems.some(item => item.id === GIFT_CAMPA_COLA.id);
          if (!hasGift) {
            onAddItem([GIFT_CAMPA_COLA]);
          }
        }
      }
    }
  }, [customer, total, celebratedTier, onAddItem, orderItems]);

  return (
    <div className="flex flex-col h-full bg-white lg:bg-transparent">
      {/* Settings / Meta Section */}
      <div className="p-4 lg:p-6 border-b border-black/5 lg:border-white/5 bg-brand-brown/5 lg:bg-transparent">
        <div className="flex bg-black/10 lg:bg-black/20 p-1 rounded-2xl mb-4">
          {(['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as OrderType[]).map(type => (
            <button
              key={type}
              onClick={() => {
                setOrderType(type);
              }}
              className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 ${
                orderType === type 
                  ? 'bg-brand-yellow text-brand-brown shadow-md scale-[1.02]' 
                  : 'text-brand-brown/40 lg:text-brand-cream/40 hover:text-brand-brown/60 lg:hover:text-brand-cream/60'
              }`}
            >
              {type.replace('_', ' ')}
            </button>
          ))}
        </div>
        
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex justify-between items-end px-1">
              <label className="text-[9px] font-black uppercase text-brand-brown/30 lg:text-brand-cream/60 tracking-[0.2em]">Customer Contact</label>
              {customer && (
                <div className="text-right">
                  <span className="text-[10px] font-black text-brand-yellow uppercase tracking-widest animate-in fade-in slide-in-from-right-2 block drop-shadow-sm">
                    {customer.name || 'Anonymous Explorer'} • {tier?.name} Stage • Visit #{customer.totalOrders + 1}
                  </span>
                  <div className="mt-1 flex items-center justify-end gap-1.5 flex-wrap">
                    {customer.note === 'STUDENT' || customer.note?.startsWith('STUDENT|') ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const parts = (customer.note || '').split('|');
                            setConvertSchoolName(parts[1] || '');
                            setShowConvertStudentModal(true);
                          }}
                          className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all inline-flex items-center gap-1"
                        >
                          🎓 Student (10% Off)
                        </button>
                        {customer.gangCouponCode && (
                          <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 inline-flex items-center gap-1">
                            🎟️ Gang Code: <strong className="font-mono text-white">{customer.gangCouponCode}</strong>
                          </span>
                        )}
                        {customer.gangCouponCode && (
                          <button
                            type="button"
                            onClick={async () => {
                              const url = getWhatsAppGangCouponUrl(customer.phone, customer.name || '', customer.gangCouponCode!);
                              await markGangCouponAsSent(customer.phone);
                              setCustomer(prev => prev ? { ...prev, gangCouponSent: true } : null);
                              window.open(url, '_blank');
                            }}
                            className={`text-[8px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded transition-all inline-flex items-center gap-1 cursor-pointer shadow-sm ${
                              customer.gangCouponSent
                                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/50'
                                : 'bg-gradient-to-r from-teal-500 to-emerald-500 text-stone-950 font-black border border-teal-300 hover:brightness-110 shadow-emerald-950/30 animate-pulse'
                            }`}
                            title="WhatsApp Gang Coupon to Student"
                          >
                            <span>📲</span>
                            <span>{customer.gangCouponSent ? 'Gang Coupon Sent ✅' : '⭐ WhatsApp Gang Coupon (Priority)'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowGangModal(true)}
                          className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-teal-500/25 text-teal-300 border border-teal-500/40 hover:bg-teal-500/40 transition-all inline-flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          👥 Redeem Gang (50% Off)
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setConvertSchoolName('');
                          setShowConvertStudentModal(true);
                        }}
                        className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30 hover:bg-brand-yellow hover:text-brand-brown transition-all inline-flex items-center gap-1 shadow"
                      >
                        🎓 Turn into Student Category (10% Off)
                      </button>
                    )}
                  </div>
                  {customer.referralCode && (
                    <div className="mt-1 flex items-center justify-end gap-1.5 flex-wrap">
                      <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                        ⭐ VIP Code: <strong className="font-mono text-white">{customer.referralCode}</strong>
                        {customer.referralWallet ? ` • Earnings: ₹${customer.referralWallet}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          const url = getWhatsAppReferralShareUrl(customer.phone, customer.name || '', customer.referralCode!);
                          await markReferralCodeAsSent(customer.phone);
                          setCustomer(prev => prev ? { ...prev, referralCodeSent: true } : null);
                          window.open(url, '_blank');
                        }}
                        className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/50 transition-all inline-flex items-center gap-1 cursor-pointer"
                        title="Open WhatsApp with prefilled message"
                      >
                        📲 WhatsApp Code
                      </button>
                    </div>
                  )}
                  {nextTarget && (
                    <div className="mt-1">
                      <div className="w-28 h-1.5 bg-white/10 rounded-full overflow-hidden ml-auto border border-white/5">
                        <div 
                          className="h-full bg-brand-yellow transition-all duration-1000 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                          style={{ width: `${Math.min(100, (projectedTotal / nextTarget) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="relative group">
              <input 
                type="tel"
                placeholder="Enter Phone Number..."
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full bg-black/20 lg:bg-white/10 border border-brand-brown/10 lg:border-white/10 rounded-2xl p-4 text-sm font-bold text-brand-brown lg:text-brand-cream outline-none focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/20 transition-all placeholder:text-stone-400 lg:placeholder:text-white/20 shadow-inner"
              />
              
              {/* Search Suggestions Dropdown */}
              {showSearchResults && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-brand-brown/95 lg:bg-stone-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[50] overflow-hidden animate-in fade-in slide-in-from-top-2 ring-1 ring-white/10">
                  {searchResults.map((res) => (
                    <button
                      key={res.id}
                      onClick={() => {
                        setCustomerPhone(res.phone);
                        setShowSearchResults(false);
                      }}
                      className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/5 transition-all border-b border-white/5 last:border-b-0"
                    >
                      <div className="text-left">
                        <p className="text-[10px] font-black text-brand-yellow uppercase tracking-widest leading-none mb-1.5">
                          {res.name || 'Unknown Explorer'}
                        </p>
                        <p className="text-sm font-bold text-white tracking-tight">{res.phone}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1">Spent</div>
                        <span className="text-xs font-black text-white px-2 py-0.5 bg-black/20 rounded-lg">
                          ₹{Math.round(res.totalSpent)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {customer && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-brand-yellow text-brand-brown px-4 py-2 rounded-xl text-[11px] font-black flex items-center gap-2 shadow-xl shadow-yellow-900/30 animate-in zoom-in-95 group-hover:scale-105 transition-transform">
                  <span className="text-sm">🪙</span>
                  <span>{customer.minCoins || 0}</span>
                </div>
              )}
            </div>

            {/* Active Gang Discount Tag */}
            {hasGangDiscount && (
              <div className="mt-2 bg-teal-900/40 border border-teal-500/40 rounded-xl p-2.5 flex items-center justify-between text-teal-200">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎒</span>
                  <div>
                    <span className="text-[8px] font-black uppercase tracking-wider block text-teal-400">Student Gang Offer Active</span>
                    <span className="text-[11px] font-black uppercase">
                      FLAT 50% OFF (Saved ₹{Math.abs(orderItems.find(i => i.id === 'student-gang-discount')?.price || 200)})
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateQuantity('student-gang-discount', 0)}
                  className="px-2 py-1 rounded bg-black/30 hover:bg-black/50 text-[10px] font-bold text-teal-300 transition-all cursor-pointer"
                  title="Remove gang discount"
                >
                  ✕ Remove
                </button>
              </div>
            )}
            {/* Active Referral Discount Tag */}
            {referralDiscountItem && (
              <div className="mt-2 bg-amber-900/40 border border-amber-500/40 rounded-xl p-2.5 flex items-center justify-between text-amber-200">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎁</span>
                  <div>
                    <span className="text-[8px] font-black uppercase tracking-wider block text-amber-400">VIP Referral Reward Active</span>
                    <span className="text-[11px] font-black uppercase">50% OFF (Saved ₹{Math.abs(referralDiscountItem.price)})</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateQuantity('referral-discount', 0)}
                  className="px-2 py-1 rounded bg-black/30 hover:bg-black/50 text-[10px] font-bold text-amber-300 transition-all cursor-pointer"
                  title="Remove referral discount"
                >
                  ✕ Remove
                </button>
              </div>
            )}

            {/* Unified Coupon & Referral Entry Box for Every Order */}
            <div className="mt-2.5 bg-black/30 lg:bg-white/5 border border-amber-500/30 rounded-2xl p-3 shadow-inner">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-brand-yellow flex items-center gap-1.5">
                  <span>🎟️</span> Enter Coupon or Referral Code
                </span>
                <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                  All Orders
                </span>
              </div>

              <form onSubmit={handleApplyUnifiedCoupon} className="flex gap-2">
                <input
                  type="text"
                  value={couponInputCode}
                  onChange={(e) => {
                    setCouponInputCode(e.target.value.toUpperCase());
                    setCouponError(null);
                    setCouponSuccessMessage(null);
                  }}
                  placeholder="e.g. GANG-XXXX-XX or MOMO-XXXX-XX"
                  className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white uppercase outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow/30 placeholder:text-zinc-500"
                />
                <button
                  type="submit"
                  disabled={isApplyingCoupon || !couponInputCode.trim()}
                  className="px-4 py-2 rounded-xl bg-brand-yellow hover:bg-yellow-400 text-brand-brown text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md"
                >
                  {isApplyingCoupon ? 'Checking...' : 'Apply'}
                </button>
              </form>

              {couponError && (
                <div className="mt-2 text-[10px] font-bold text-rose-400 bg-rose-950/50 border border-rose-500/30 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 animate-in fade-in">
                  <span>⚠️</span>
                  <span>{couponError}</span>
                </div>
              )}
              {couponSuccessMessage && (
                <div className="mt-2 text-[10px] font-bold text-emerald-300 bg-emerald-950/50 border border-emerald-500/30 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 animate-in fade-in">
                  <span>✅</span>
                  <span>{couponSuccessMessage}</span>
                </div>
              )}

              <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-wider mt-2 leading-tight">
                💡 Automatically identifies Student Gang Coupons (Flat 50% Off for 3+ students) & VIP Referral Codes (50% Off).
              </p>
            </div>
          </div>

          {customer && (loyaltyDiscount || canRedeemSomething || isCloseToNextTier || isStale || activePromoCoupon || activeFreeClaims.length > 0 || activeDiscountClaims.length > 0 || qualifiedOffer) && (
            <div className="flex flex-wrap gap-3 animate-in fade-in slide-in-from-top-3 duration-700">
               {activeFreeClaims.map((claim) => {
                 const promoId = `free-promo-${claim.id}`;
                 const hasPromoApplied = orderItems.some(i => i.id === promoId);
                 const standardSubtotal = orderItems
                   .filter(i => !i.id.startsWith('free-promo-') && !i.id.startsWith('loyalty-discount'))
                   .reduce((acc, i) => acc + (i.price > 0 ? i.price * i.quantity : 0), 0);

                 return (
                   <div key={claim.id} className="flex items-center gap-2 w-full lg:w-auto overflow-hidden">
                     {hasPromoApplied ? (
                       <div className="bg-emerald-600/95 border border-emerald-500/25 px-4 py-2 rounded-2xl flex items-center gap-3 backdrop-blur-xl group cursor-default shadow-2xl shrink-0 text-white animate-fade-in">
                         <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                           <span className="text-[12px]">🎁</span>
                         </div>
                         <div className="flex flex-col text-left min-w-[124px]">
                           <span className="text-[7px] font-black text-emerald-100 uppercase tracking-[0.2em] leading-none mb-1">Promo Tag: {claim.tagCode}</span>
                           <span className="text-[10px] font-black uppercase tracking-wider">Free {claim.itemName} Added!</span>
                         </div>
                       </div>
                     ) : (
                       <div className="bg-zinc-800/85 border border-zinc-700/50 px-4 py-2 rounded-2xl flex items-center gap-3 backdrop-blur-xl group cursor-default shadow-2xl shrink-0 text-white animate-fade-in">
                         <div className="w-6 h-6 bg-white/10 rounded-lg flex items-center justify-center shrink-0 animate-pulse">
                           <span className="text-[11px]">⏳</span>
                         </div>
                         <div className="flex flex-col text-left min-w-[130px]">
                           <span className="text-[7px] font-black text-zinc-400 uppercase tracking-[0.2em] leading-none mb-1">Tag Code: {claim.tagCode}</span>
                           <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                             Add ₹{50 - Math.round(standardSubtotal)} More
                           </span>
                         </div>
                       </div>
                     )}
                   </div>
                 );
               })}
               {activeDiscountClaims.map((claim) => {
                 const promoId = `promo-discount-${claim.id}`;
                 const hasPromoApplied = orderItems.some(i => i.id === promoId);

                 return (
                   <div key={claim.id} className="flex items-center gap-2 w-full lg:w-auto overflow-hidden animate-fade-in_quick">
                     {hasPromoApplied ? (
                       <div className="bg-indigo-600 border border-indigo-500/25 px-4 py-2 rounded-2xl flex items-center gap-3 backdrop-blur-xl group cursor-default shadow-2xl shrink-0 text-white">
                         <div className="w-6 h-6 bg-white/25 rounded-lg flex items-center justify-center shrink-0">
                           <span className="text-[12px]">🏷️</span>
                         </div>
                         <div className="flex flex-col text-left min-w-[124px]">
                           <span className="text-[7px] font-black text-indigo-100 uppercase tracking-[0.2em] leading-none mb-1">Promo Tag: {claim.tagCode}</span>
                           <span className="text-[10px] font-black uppercase tracking-wider">{claim.discountPercentage}% Discount Claimed!</span>
                         </div>
                       </div>
                     ) : (
                       <div className="bg-zinc-800/85 border border-zinc-700/50 px-4 py-2 rounded-2xl flex items-center gap-3 backdrop-blur-xl group cursor-default shadow-2xl shrink-0 text-white animate-fade-in">
                         <div className="w-6 h-6 bg-white/10 rounded-lg flex items-center justify-center shrink-0 animate-pulse">
                           <span className="text-[11px]">⏳</span>
                         </div>
                         <div className="flex flex-col text-left min-w-[130px]">
                           <span className="text-[7px] font-black text-zinc-400 uppercase tracking-[0.2em] leading-none mb-1">Tag Code: {claim.tagCode}</span>
                           <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                             Discount Claim Pending
                           </span>
                         </div>
                       </div>
                     )}
                   </div>
                 );
               })}
               {activePromoCoupon && (
                 <div className="flex items-center gap-2 w-full lg:w-auto">
                   {hasPromoMojitoApplied ? (
                     <div className="bg-emerald-600/95 border border-emerald-500/25 px-4 py-2 rounded-2xl flex items-center gap-3 backdrop-blur-xl group cursor-default shadow-2xl shrink-0 text-white">
                       <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                         <span className="text-[12px]">🍹</span>
                       </div>
                       <div className="flex flex-col min-w-[124px]">
                         <span className="text-[7px] font-black text-emerald-100 uppercase tracking-[0.2em] leading-none mb-1">Coupon Applied!</span>
                         <span className="text-[10px] font-black uppercase tracking-wider">Free Mojito Added</span>
                       </div>
                     </div>
                   ) : (
                     <button
                       type="button"
                       onClick={() => {
                         if (subtotalWithoutPromo > 99) {
                           onAddItem([{
                             id: 'promo-mojito',
                             menuItemId: 'promo-mojito',
                             name: 'Free Virgin Mojito (Promo)',
                             price: 0,
                             quantity: 1,
                             cost: 0
                           }]);
                         } else {
                           alert(`Add items worth ₹99 or more to unlock this promo! (Current subtotal: ₹${Math.round(subtotalWithoutPromo)})`);
                         }
                       }}
                       className={`px-4 py-2 rounded-2xl flex items-center gap-3 shadow-xl backdrop-blur-xl group border-2 transition-all hover:scale-105 active:scale-95 cursor-pointer text-white shrink-0 ${
                         subtotalWithoutPromo > 99
                           ? 'bg-rose-600 border-rose-500/30'
                           : 'bg-zinc-700/60 border-zinc-600/10 opacity-75'
                       }`}
                     >
                       <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                         <span className="text-[12px]">🎁</span>
                       </div>
                       <div className="flex flex-col text-left min-w-[130px]">
                         <span className="text-[7px] font-black text-white/70 uppercase tracking-[0.2em] mb-1">{activePromoCoupon.couponCode}</span>
                         <span className="text-[10px] font-black uppercase tracking-wider">
                           {subtotalWithoutPromo > 99 ? 'Claim Free Mojito!' : 'Min ₹99 Order'}
                         </span>
                       </div>
                     </button>
                   )}
                 </div>
               )}
               {loyaltyDiscount && (
                 <div className="flex items-center gap-2 w-full lg:w-auto">
                    <button 
                      onClick={() => {
                        if (hasAppliedLoyaltyDiscount) {
                           onUpdateQuantity('loyalty-discount', 0);
                        } else {
                           const otherDiscount = orderItems.find(i => i.id !== 'loyalty-discount' && isCouponOrDiscountItem(i));
                           if (otherDiscount) {
                             setCouponError(`Two coupons cannot be combined. Please remove "${otherDiscount.name}" first.`);
                             return;
                           }
                           const subtotal = orderItems.reduce((acc, i) => acc + (!isCouponOrDiscountItem(i) && i.price > 0 ? i.price * i.quantity : 0), 0);
                           if (subtotal > 0) {
                              onAddItem([{
                                id: 'loyalty-discount',
                                menuItemId: 'discount',
                                name: loyaltyDiscount.label,
                                price: -(subtotal * (loyaltyDiscount.percentage / 100)),
                                quantity: 1,
                                cost: 0
                              }]);
                           }
                        }
                      }}
                      className={`${hasAppliedLoyaltyDiscount ? 'bg-emerald-600' : 'bg-brand-brown'} px-4 py-2 rounded-2xl flex items-center gap-3 shadow-xl text-white group border-2 border-white/20 hover:scale-105 active:scale-95 transition-all`}
                    >
                      <div className="flex flex-col items-start leading-none py-0.5">
                        <span className="text-[7px] font-black opacity-60 uppercase tracking-[0.2em] mb-1">{loyaltyDiscount.code}</span>
                        <span className="text-[10px] font-black uppercase tracking-wider">
                          {hasAppliedLoyaltyDiscount ? 'Loyalty Applied!' : `Apply ${loyaltyDiscount.percentage}% Discount`}
                        </span>
                      </div>
                      <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                        <span className="text-[12px]">{hasAppliedLoyaltyDiscount ? '✅' : '🏷️'}</span>
                      </div>
                    </button>
                 </div>
               )}
                {qualifiedOffer && (
                  <div className="flex items-center gap-2 w-full lg:w-auto font-sans">
                     <button 
                       type="button"
                       onClick={() => {
                         const freeItemId = qualifiedOffer.offerType === 'discount' ? `custom-discount-${qualifiedOffer.id}` : `free-gift-${qualifiedOffer.id}`;
                         const isAlreadyAdded = orderItems.some(item => item.id === freeItemId);
                         
                         if (isAlreadyAdded) {
                            onUpdateQuantity(freeItemId, 0);
                         } else {
                            onAddItem([{
                              id: freeItemId,
                              menuItemId: 'discount',
                              name: qualifiedOffer.offerType === 'discount' ? `🏷️ ${qualifiedOffer.name} (${qualifiedOffer.discountType === 'percentage' ? `${qualifiedOffer.discountValue}%` : `₹${qualifiedOffer.discountValue}`} Off)` : `🎁 Free ${qualifiedOffer.freeItemName} (Offer: ${qualifiedOffer.name})`,
                              price: qualifiedOffer.offerType === 'discount' ? (qualifiedOffer.discountType === 'percentage' ? -Math.round(subtotal * ((qualifiedOffer.discountValue || 0) / 100)) : -(qualifiedOffer.discountValue || 0)) : 0,
                              quantity: 1,
                              cost: 0
                            }]);
                         }
                       }}
                       className={`px-4 py-2 rounded-2xl flex items-center gap-3 shadow-xl text-white group border-2 border-white/20 hover:scale-105 active:scale-95 transition-all ${
                         orderItems.some(item => item.id === `free-gift-${qualifiedOffer.id}` || item.id === `custom-discount-${qualifiedOffer.id}`) 
                           ? (qualifiedOffer.offerType === 'discount' ? 'bg-indigo-600 border-indigo-550' : 'bg-rose-600 border-rose-505') 
                           : 'bg-emerald-600 border-emerald-550'
                       }`}
                     >
                       <div className="flex flex-col items-start leading-none py-0.5 text-left">
                         <span className="text-[7px] font-black uppercase tracking-[0.2em] opacity-60 mb-1">{qualifiedOffer.name}</span>
                         <span className="text-[10px] font-black uppercase tracking-wider">
                           {orderItems.some(item => item.id === `free-gift-${qualifiedOffer.id}` || item.id === `custom-discount-${qualifiedOffer.id}`) ? (qualifiedOffer.offerType === 'discount' ? 'Discount Applied!' : 'Free Gift Applied!') : (qualifiedOffer.offerType === 'discount' ? 'Apply Checkout Discount!' : `Claim Free ${qualifiedOffer.freeItemName}!`)}
                         </span>
                       </div>
                       <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                         <span className="text-[12px]">{orderItems.some(item => item.id === `free-gift-${qualifiedOffer.id}` || item.id === `custom-discount-${qualifiedOffer.id}`) ? '✅' : (qualifiedOffer.offerType === 'discount' ? '🏷️' : '🎁')}</span>
                       </div>
                     </button>
                  </div>
                )}
               {rewardSuggestion && (
                 <div className="bg-white px-4 py-2.5 rounded-2xl flex items-center gap-3 shadow-xl shadow-black/20 border-2 border-peak-amber/20">
                   <div className="w-6 h-6 bg-peak-amber/10 rounded-full flex items-center justify-center">
                     <span className="text-[12px]">🎁</span>
                   </div>
                   <span className="text-[10px] font-black text-peak-amber uppercase tracking-widest leading-none">
                     <span className="block text-[7px] opacity-60 mb-0.5">Bonus Goal</span>
                     Add ₹{Math.ceil(rewardSuggestion.gap)} more for FREE {rewardSuggestion.name}
                   </span>
                 </div>
               )}
               {canRedeemSomething && !rewardSuggestion && (
                 <div className="bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded-xl flex items-center gap-2">
                   <span className="text-[10px]">✨</span>
                   <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Reward Ready</span>
                 </div>
               )}
               {isCloseToNextTier && projectedTier?.next && customer && (
                 <div className="bg-brand-yellow px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-lg shadow-yellow-900/20 text-brand-brown">
                   <span className="text-[10px]">⚡</span>
                   <span className="text-[9px] font-black uppercase tracking-wider">
                     Next Stage in ₹{Math.ceil(nextTarget - projectedTotal)}
                   </span>
                 </div>
               )}
               {isStale && (
                 <div className="bg-brand-red/20 border border-brand-red/30 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                   <span className="text-[10px]">👋</span>
                   <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Inactive</span>
                 </div>
               )}
            </div>
          )}
        </div>
      </div>

      <div className="p-6 border-b border-stone-100 flex justify-between items-start lg:hidden">
        <div>
          <h2 className="text-xl font-black text-mountain-green tracking-tighter italic uppercase leading-none">Current <span className="text-peak-amber">Cart</span></h2>
          {branchName && <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.2em] mt-1">{branchName}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
        {orderItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-stone-200">
             <svg className="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
             <p className="font-black uppercase tracking-[0.2em] text-[10px]">Your peak is empty</p>
          </div>
        ) : (
          orderItems.map(item => {
            if (item.parentItemId) return null;

            return (
              <BillItem 
                key={item.id} 
                item={item} 
                onUpdateQuantity={onUpdateQuantity}
              />
            )
          })
        )}
      </div>
      
      <div className="p-6 bg-stone-50 border-t border-stone-200">
        <div className="flex justify-between items-end mb-6">
          <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">Total Amount</span>
          <span className="text-3xl font-black text-mountain-green tracking-tighter lg:text-white">₹{Math.round(total)}</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={onClear} 
            disabled={orderItems.length === 0}
            className="w-full py-4 rounded-2xl bg-stone-200 text-stone-500 font-black uppercase tracking-widest text-[10px] hover:bg-stone-300 transition-colors disabled:opacity-30"
          >
            Clear
          </button>
          <button 
            onClick={onPreview} 
            disabled={orderItems.length === 0}
            className="w-full py-4 rounded-2xl bg-mountain-green text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-900/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
          >
            Bill & Print
          </button>
        </div>
      </div>
      <CelebrationOverlay 
        isVisible={showCelebration} 
        tierName={celebratedTier || ''} 
        onClose={() => setShowCelebration(false)} 
      />
      <NewCustomerModal 
        isOpen={showNewCustomerPrompt}
        phone={customerPhone}
        isExisting={isPromptForExisting}
        onRegister={handleRegisterCustomer}
        onCancel={() => setShowNewCustomerPrompt(false)}
      />

      {/* Convert to Student Modal */}
      {showConvertStudentModal && customer && (() => {
        const isStudentNow = customer.note === 'STUDENT' || customer.note?.startsWith('STUDENT|');
        const digits = customer.phone.replace(/\D/g, '');
        const hikerNo = `HIKER-${digits.length >= 8 ? digits.slice(-8) : (digits + '87654321').slice(0, 8)}`;
        
        return (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-in fade-in duration-200">
            <div className="bg-zinc-900 border border-white/10 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 rounded-full bg-emerald-500"></div>
              
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10 mb-3">
                  <span className="text-2xl">🎓</span>
                </div>
                <h3 className="text-xl font-black text-white italic uppercase tracking-tight">
                  Student <span className="text-emerald-400">Category</span>
                </h3>
                <p className="text-zinc-400 text-xs font-bold mt-1">
                  {customer.name || 'Customer'} ({customer.phone})
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                  <span>Student Benefit:</span>
                  <span className="text-emerald-400 font-black">10% OFF All Orders</span>
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                  <span>Hiker Card ID:</span>
                  <span className="text-white font-mono font-bold text-[11px]">{hikerNo}</span>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest block mb-1.5 ml-1">
                    School / College / Institution Name
                  </label>
                  <input
                    type="text"
                    value={convertSchoolName}
                    onChange={(e) => setConvertSchoolName(e.target.value)}
                    placeholder="e.g. Delhi University, Amity, IIT..."
                    className="w-full bg-white/10 border border-white/15 rounded-xl p-3.5 text-sm text-white font-bold outline-none focus:border-emerald-400 transition-all placeholder:text-zinc-600"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleSaveStudentConversion}
                  className="w-full py-4 rounded-xl bg-emerald-500 text-zinc-950 font-black uppercase text-xs tracking-widest shadow-lg hover:bg-emerald-400 active:scale-95 transition-all"
                >
                  {isStudentNow ? 'Save Student Profile' : 'Convert & Apply 10% Discount'}
                </button>
                {isStudentNow && (
                  <button
                    type="button"
                    onClick={handleRemoveStudentCategory}
                    className="w-full py-2.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 font-black uppercase text-[10px] tracking-widest hover:bg-red-500/30 active:scale-95 transition-all"
                  >
                    Revert to Regular Customer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowConvertStudentModal(false)}
                  className="w-full py-2.5 rounded-xl bg-zinc-800 text-zinc-400 font-bold uppercase text-[10px] tracking-widest hover:bg-zinc-700 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Student Gang Registration & Redemption Modal */}
      {showGangModal && (
        <StudentGangModal
          isOpen={showGangModal}
          onClose={() => setShowGangModal(false)}
          customer={customer}
          customerPhone={customerPhone}
          subtotal={subtotal}
          initialCouponCode={gangModalInitialCode || customer?.gangCouponCode || ''}
          onApplyGangDiscount={(item) => {
            clearOtherDiscounts(item.id);
            onAddItem([item]);
          }}
        />
      )}
    </div>
  );
};

export default Bill;
