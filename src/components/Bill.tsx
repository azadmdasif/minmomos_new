
import React from 'react';
import { OrderItem, OrderType, Customer, MenuItem } from '../types';
import BillItem from './BillItem';
import { GIFT_CAMPA_COLA } from '../constants';
import { fetchUsualOrder, fetchLastOrderPriorityItem, getCustomerByPhone, getTierInfo, registerCustomer, searchCustomers, updateCustomer, fetchMenuItems } from '../utils/storage';
import { getActiveCouponForCustomer, syncCouponFromSupabase, getMarketingCoupons, saveMarketingCoupons, MarketingCoupon, getLocalCustomOffers, saveLocalCustomOffers, fetchCustomOffersFromSupabase, CustomOffer, getActiveClaimsForCustomer, syncFreeItemClaimsFromSupabaseForCustomer, getActiveDiscountClaimsForCustomer, syncDiscountClaimsFromSupabaseForCustomer } from '../utils/marketingStorage';
import CelebrationOverlay from './CelebrationOverlay';
import NewCustomerModal from './NewCustomerModal';

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
  setCustomerPhone
}) => {
  const total = orderItems.reduce((acc, item) => acc + item.price * item.quantity, 0);

  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [usualOrder, setUsualOrder] = React.useState<{ name: string, quantity: number } | null>(null);
  const [lastPriorityItem, setLastPriorityItem] = React.useState<{ name: string, quantity: number } | null>(null);
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
  
  const hasAppliedLoyaltyDiscount = orderItems.find(item => item.id === 'loyalty-discount');

  const loyaltyDiscount = React.useMemo(() => {
    if (!customer) return null;
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
        setCustomer(cust);
        lastCheckedPhone.current = customerPhone;

        if (cust) {
          const [usual, lastPriority] = await Promise.all([
            fetchUsualOrder(cust.phone),
            fetchLastOrderPriorityItem(cust.phone)
          ]);
          setUsualOrder(usual);
          setLastPriorityItem(lastPriority);
          
          // MISSING NAME Logic
          if (!cust.name) {
            setIsPromptForExisting(true);
            setShowNewCustomerPrompt(true);
          }

          // VOIDED / RE-FIRST ORDER Logic
          const hasGiftInOrder = orderItems.some(item => item.name.includes('Celebratory Campa Cola (Gift)'));
          if (cust.totalOrders === 0 && !hasGiftInOrder) {
            onAddItem([{
              ...GIFT_CAMPA_COLA,
              id: `welcome-gift-${Date.now()}`
            }]);
          }
        } else {
          setUsualOrder(null);
          // NEW CUSTOMER Logic
          setIsPromptForExisting(false);
          setShowNewCustomerPrompt(true);
        }
      };
      loadCustomer();
    } else {
      setCustomer(null);
      setUsualOrder(null);
      setLastPriorityItem(null);
      setCelebratedTier(null);
      lastCheckedPhone.current = null;
      setShowNewCustomerPrompt(false);
      setIsPromptForExisting(false);
    }
  }, [customerPhone]);

  const handleRegisterCustomer = async (name: string) => {
    try {
      if (isPromptForExisting && customer) {
        await updateCustomer(customer.id, { name });
        setCustomer({ ...customer, name });
      } else {
        const newCust = await registerCustomer(customerPhone, name);
        setCustomer(newCust);
        // Welcome Gift logic
        const hasGift = orderItems.some(item => item.id === GIFT_CAMPA_COLA.id);
        if (!hasGift) {
          onAddItem([{ ...GIFT_CAMPA_COLA, id: `welcome-gift-${Date.now()}` }]);
        }
      }
      setShowNewCustomerPrompt(false);
    } catch (err) {
      console.error("Registration failed", err);
    }
  };

  // Auto-update discount if items change
  React.useEffect(() => {
    const discountItems = orderItems.filter(i => i.id === 'loyalty-discount');
    if (discountItems.length > 0) {
      const subtotal = orderItems.reduce((acc, i) => acc + (i.id !== 'loyalty-discount' && i.price > 0 ? i.price * i.quantity : 0), 0);
      
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
  }, [orderItems, onAddItem, onUpdateQuantity, loyaltyDiscount]);

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
        const hasGift = orderItems.some(item => item.id === GIFT_CAMPA_COLA.id);
        if (!hasGift) {
          onAddItem([GIFT_CAMPA_COLA]);
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
          </div>

          {customer && (loyaltyDiscount || usualOrder || lastPriorityItem || canRedeemSomething || isCloseToNextTier || isStale || activePromoCoupon || activeFreeClaims.length > 0 || activeDiscountClaims.length > 0 || qualifiedOffer) && (
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
                           const subtotal = orderItems.reduce((acc, i) => acc + (i.price > 0 ? i.price * i.quantity : 0), 0);
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
               {usualOrder && (
                  <div className="bg-white/10 lg:bg-white/5 px-4 py-3 rounded-2xl border-2 border-brand-yellow/30 flex items-center gap-3 backdrop-blur-xl group hover:bg-white/20 transition-all cursor-default shadow-2xl shrink-0">
                    <div className="w-8 h-8 bg-brand-yellow/30 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
                      <span className="text-[14px]">⭐</span>
                    </div>
                    <div className="flex flex-col min-w-[120px]">
                      <span className="text-[8px] font-black text-brand-yellow uppercase tracking-[0.2em] leading-none mb-1.5 shadow-sm">Their Favorite</span>
                      <span className="text-[12px] font-black text-white leading-tight drop-shadow-md">{usualOrder.name}</span>
                    </div>
                  </div>
               )}
               {lastPriorityItem && (
                  <div className="bg-white/10 lg:bg-white/5 px-4 py-3 rounded-2xl border-2 border-rose-500/30 flex items-center gap-3 backdrop-blur-xl group hover:bg-white/20 transition-all cursor-default shadow-2xl shrink-0">
                    <div className="w-8 h-8 bg-rose-500/30 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
                      <span className="text-[14px]">🔥</span>
                    </div>
                    <div className="flex flex-col min-w-[120px]">
                      <span className="text-[8px] font-black text-rose-300 uppercase tracking-[0.2em] leading-none mb-1.5 shadow-sm">Last Time's Pick</span>
                      <span className="text-[12px] font-black text-white leading-tight drop-shadow-md">{lastPriorityItem.name}</span>
                    </div>
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
    </div>
  );
};

export default Bill;
