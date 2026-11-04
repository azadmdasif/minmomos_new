import React, { useRef, useEffect } from 'react';
import { Plus, Minus, Check, X, Sparkles, ThumbsDown } from 'lucide-react';
import { MenuItem, OrderItem, OrderType, Customer } from '../types';
import { POPUP_SIDE_ADDONS } from '../constants';
import { DynamicAddonOffer, determineCartType, determineValueBand, determineDayPart, determineWeekday } from '../utils/suggestedAddonEngine';
import { 
  updateAddonImpressionOutcome, 
  enqueueFixedAddonEvent, 
  generateUUID 
} from '../utils/addonStorageQueue';

export interface CrossSellModalProps {
  isOpen: boolean;
  onClose: () => void;
  upsellItem?: MenuItem | undefined;
  onConfirm: (item: OrderItem) => void;
  currentOrder?: OrderItem[];
  onUpdateQuantity?: (id: string, qty: number) => void;
  suggestedOffer?: DynamicAddonOffer | null;
  orderType?: OrderType;
  customer?: Customer | null;
  orderTotal?: number;
}

const CrossSellModal: React.FC<CrossSellModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm,
  currentOrder = [],
  onUpdateQuantity,
  suggestedOffer,
  orderType = 'DINE_IN',
  customer,
  orderTotal = 0
}) => {
  const modalOpenTime = useRef<number>(Date.now());
  const hasAcceptedSuggested = useRef<boolean>(false);
  const hasDeclinedSuggested = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      modalOpenTime.current = Date.now();
      hasAcceptedSuggested.current = false;
      hasDeclinedSuggested.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const now = new Date();
  const cartType = determineCartType(currentOrder);
  const valueBand = determineValueBand(orderTotal);
  const daypart = determineDayPart(now);
  const weekday = determineWeekday(now);

  // Handlers for standard fixed side add-ons (Fries, Mojito, Chicken Popcorn)
  const handleAddSideOne = (addon: typeof POPUP_SIDE_ADDONS[0]) => {
    const orderItem: OrderItem = {
      id: addon.id,
      menuItemId: addon.menuItemId,
      name: addon.name,
      price: addon.price,
      cost: addon.cost,
      quantity: 1
    };
    onConfirm(orderItem);

    // Log fixed section pick
    enqueueFixedAddonEvent({
      event_id: generateUUID(),
      created_at: now.toISOString(),
      customer_id: customer?.id || null,
      customer_phone: customer?.phone || null,
      cart_total: orderTotal,
      cart_type: cartType,
      value_band: valueBand,
      daypart,
      weekday,
      fixed_item_id: addon.id,
      fixed_item_name: addon.name,
      price: addon.price,
      action: 'added'
    });
  };

  const handleIncrementSide = (addon: typeof POPUP_SIDE_ADDONS[0]) => {
    const existing = currentOrder.find(
      i => i.menuItemId === addon.menuItemId || i.id === addon.id
    );
    if (existing && onUpdateQuantity) {
      onUpdateQuantity(existing.id, existing.quantity + 1);
      enqueueFixedAddonEvent({
        event_id: generateUUID(),
        created_at: now.toISOString(),
        customer_id: customer?.id || null,
        customer_phone: customer?.phone || null,
        cart_total: orderTotal,
        cart_type: cartType,
        value_band: valueBand,
        daypart,
        weekday,
        fixed_item_id: addon.id,
        fixed_item_name: addon.name,
        price: addon.price,
        action: 'incremented'
      });
    } else {
      handleAddSideOne(addon);
    }
  };

  const handleDecrementSide = (addon: typeof POPUP_SIDE_ADDONS[0]) => {
    const existing = currentOrder.find(
      i => i.menuItemId === addon.menuItemId || i.id === addon.id
    );
    if (existing && onUpdateQuantity) {
      onUpdateQuantity(existing.id, existing.quantity - 1);
      enqueueFixedAddonEvent({
        event_id: generateUUID(),
        created_at: now.toISOString(),
        customer_id: customer?.id || null,
        customer_phone: customer?.phone || null,
        cart_total: orderTotal,
        cart_type: cartType,
        value_band: valueBand,
        daypart,
        weekday,
        fixed_item_id: addon.id,
        fixed_item_name: addon.name,
        price: addon.price,
        action: 'decremented'
      });
    }
  };

  // Handlers for variable suggested offer (Statistical Thompson Choice)
  const handleAddSuggestedOne = () => {
    if (!suggestedOffer || suggestedOffer.isHoldout) return;
    const decision_ms = Date.now() - modalOpenTime.current;
    hasAcceptedSuggested.current = true;

    const orderItem: OrderItem = {
      id: suggestedOffer.id,
      menuItemId: suggestedOffer.menuItemId || suggestedOffer.id,
      name: suggestedOffer.name,
      price: suggestedOffer.price,
      cost: suggestedOffer.cost,
      quantity: 1,
      is_addon_offer: true,
      impression_id: suggestedOffer.impression?.impression_id,
      offer_key: suggestedOffer.offerKey
    };
    onConfirm(orderItem);

    if (suggestedOffer.impression?.impression_id) {
      updateAddonImpressionOutcome(
        suggestedOffer.impression.impression_id,
        'accepted',
        null,
        decision_ms
      );
    }
  };

  const handleIncrementSuggested = () => {
    if (!suggestedOffer || suggestedOffer.isHoldout) return;
    const existing = currentOrder.find(
      i => i.id === suggestedOffer.id || i.menuItemId === suggestedOffer.id
    );
    if (existing && onUpdateQuantity) {
      onUpdateQuantity(existing.id, existing.quantity + 1);
    } else {
      handleAddSuggestedOne();
    }
  };

  const handleDecrementSuggested = () => {
    if (!suggestedOffer || suggestedOffer.isHoldout) return;
    const existing = currentOrder.find(
      i => i.id === suggestedOffer.id || i.menuItemId === suggestedOffer.id
    );
    if (existing && onUpdateQuantity) {
      onUpdateQuantity(existing.id, existing.quantity - 1);
    }
  };

  const handleDeclineSuggested = () => {
    if (!suggestedOffer || suggestedOffer.isHoldout || hasAcceptedSuggested.current) return;
    const decision_ms = Date.now() - modalOpenTime.current;
    hasDeclinedSuggested.current = true;

    if (suggestedOffer.impression?.impression_id) {
      updateAddonImpressionOutcome(
        suggestedOffer.impression.impression_id,
        'declined',
        null,
        decision_ms
      );
    }
  };

  const handleCloseModal = () => {
    // If suggested offer was neither accepted nor explicitly declined, record as 'skipped'
    if (suggestedOffer && !suggestedOffer.isHoldout && !hasAcceptedSuggested.current && !hasDeclinedSuggested.current) {
      const decision_ms = Date.now() - modalOpenTime.current;
      if (suggestedOffer.impression?.impression_id) {
        updateAddonImpressionOutcome(
          suggestedOffer.impression.impression_id,
          'skipped',
          null,
          decision_ms
        );
      }
    }
    onClose();
  };

  const existingSuggestedInCart = suggestedOffer ? currentOrder.find(
    i => i.id === suggestedOffer.id || i.menuItemId === suggestedOffer.id
  ) : undefined;
  const suggestedQty = existingSuggestedInCart ? existingSuggestedInCart.quantity : 0;

  const totalSidesAdded = POPUP_SIDE_ADDONS.reduce((acc, addon) => {
    const item = currentOrder.find(i => i.menuItemId === addon.menuItemId || i.id === addon.id);
    return acc + (item ? item.quantity : 0);
  }, 0);

  const totalSidesCost = POPUP_SIDE_ADDONS.reduce((acc, addon) => {
    const item = currentOrder.find(i => i.menuItemId === addon.menuItemId || i.id === addon.id);
    return acc + (item ? item.quantity * addon.price : 0);
  }, 0);

  const totalSuggestedCost = suggestedOffer ? suggestedQty * suggestedOffer.price : 0;
  const totalAllAdded = totalSidesAdded + suggestedQty;
  const totalAllCost = totalSidesCost + totalSuggestedCost;

  const showVariableOffer = suggestedOffer && !suggestedOffer.isHoldout;

  return (
    <div 
      id="cross-sell-modal-backdrop"
      className="fixed inset-0 bg-brand-brown/85 backdrop-blur-sm flex items-center justify-center z-[150] p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={handleCloseModal}
    >
      <div 
        id="cross-sell-modal-card"
        className="bg-white rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-8 max-w-2xl w-full shadow-2xl border-4 border-brand-yellow animate-in zoom-in-95 duration-200 relative my-auto max-h-[94vh] overflow-y-auto no-scrollbar"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Close Button */}
        <button
          type="button"
          id="close-cross-sell-btn"
          onClick={handleCloseModal}
          className="absolute top-5 right-5 text-stone-400 hover:text-brand-brown p-2 rounded-full hover:bg-stone-100 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-5">
          <div className="w-24 h-12 bg-brand-yellow/15 rounded-2xl flex items-center justify-center mx-auto mb-2.5 shadow-inner">
            <span className="text-2xl tracking-wider">
              {showVariableOffer ? suggestedOffer.icon : '🍟'} 🍟 🍹 🍗
            </span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-black text-brand-brown italic uppercase tracking-tighter leading-tight">
            Exclusive <span className="text-brand-red">Add-On Offers!</span>
          </h3>
          <p className="text-stone-500 font-bold text-xs sm:text-sm mt-1">
            {showVariableOffer 
              ? 'Complete the order with curated add-ons before billing & printing'
              : 'Add customer favorites before billing & printing'}
          </p>
        </div>

        {/* VARIABLE UPPER SECTION: Dynamically Suggested Add-on Offer (Hidden in Holdout Group) */}
        {showVariableOffer && (
          <div 
            id="variable-suggested-addon-card"
            className="mb-5 bg-gradient-to-r from-amber-500/15 via-yellow-400/20 to-amber-500/15 border-2 border-brand-yellow rounded-2xl p-4 shadow-md relative overflow-hidden ring-1 ring-brand-yellow/50"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-400/25 border border-brand-yellow/60 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                  {suggestedOffer.icon}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                      <Sparkles className="w-3 h-3 text-brand-yellow" />
                      <span>{suggestedOffer.badge}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-brand-brown text-white text-[9px] font-black uppercase tracking-wider">
                      {suggestedOffer.complementReason}
                    </span>
                    <span className="text-[10px] font-mono text-brand-brown/70 font-bold uppercase tracking-wider">
                      {orderType === 'DINE_IN' ? '🍽️ Dine In' : '🥡 Takeaway'} Special
                    </span>
                  </div>
                  <h4 className="text-base sm:text-lg font-black text-brand-brown mt-1 leading-snug">
                    {suggestedOffer.name} for <span className="text-mountain-green font-black">₹{suggestedOffer.price}</span>
                  </h4>
                  <div className="text-[11px] text-stone-600 font-medium flex items-center gap-2 flex-wrap mt-0.5">
                    <span>{suggestedOffer.tagline}</span>
                    {suggestedOffer.originalPrice && suggestedOffer.originalPrice > suggestedOffer.price && (
                      <span className="inline-flex items-center gap-1 bg-amber-500/20 text-brand-brown px-2 py-0.5 rounded-md font-bold text-[10px]">
                        <span className="line-through text-stone-400">₹{suggestedOffer.originalPrice}</span>
                        <span className="text-emerald-700 font-black">Save ₹{suggestedOffer.rupeeSavings}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stepper or Add button for Variable Addon */}
              <div className="shrink-0 sm:self-center flex items-center gap-2">
                {suggestedQty > 0 ? (
                  <div className="flex items-center bg-white border-2 border-mountain-green rounded-xl p-1 shadow-sm">
                    <button
                      type="button"
                      id="btn-dec-suggested-addon"
                      onClick={handleDecrementSuggested}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-stone-100 hover:bg-brand-red/10 text-stone-600 hover:text-brand-red font-black transition-colors active:scale-95 cursor-pointer"
                      title="Decrease quantity"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <div className="text-center px-3 min-w-[70px]">
                      <span className="text-xs font-black text-mountain-green block leading-tight">
                        {suggestedQty} in order
                      </span>
                      <span className="text-[9px] font-bold text-stone-400 block">
                        ₹{suggestedOffer.price * suggestedQty}
                      </span>
                    </div>
                    <button
                      type="button"
                      id="btn-inc-suggested-addon"
                      onClick={handleIncrementSuggested}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-mountain-green hover:bg-emerald-600 text-white font-black transition-colors shadow-sm active:scale-95 cursor-pointer"
                      title="Add one more"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      id="btn-add-suggested-addon"
                      onClick={handleAddSuggestedOne}
                      className="py-2.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95 bg-mountain-green hover:bg-emerald-700 text-white cursor-pointer border border-emerald-500/40"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span>+ Add Offer (+₹{suggestedOffer.price})</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeclineSuggested}
                      title="Customer not interested in this specific offer"
                      className="p-2.5 rounded-xl border border-stone-300 text-stone-400 hover:text-brand-red hover:bg-brand-red/10 transition-colors cursor-pointer"
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Cashier Verbal Script */}
            <div className="mt-3 pt-2.5 border-t border-brand-yellow/40 flex items-center gap-2 text-stone-700 bg-white/80 rounded-xl px-3 py-2">
              <span className="text-xs">📢</span>
              <p className="text-[11px] leading-snug">
                <strong className="text-brand-brown uppercase text-[9px] font-black tracking-wider mr-1">Cashier Script:</strong>
                {suggestedOffer.cashierScript.replace(/^"|"$/g, '')}
              </p>
            </div>
          </div>
        )}

        {/* Section Divider for Fixed Lower Section */}
        <div className="flex items-center gap-2 mb-3">
          <div className="h-px bg-stone-200 flex-1"></div>
          <span className="text-[10px] font-black uppercase tracking-wider text-stone-400">
            Popular Sides Add-Ons · ₹39 Each
          </span>
          <div className="h-px bg-stone-200 flex-1"></div>
        </div>

        {/* FIXED LOWER SECTION: 3 Add-on Options Grid (Fries, Mojito, Chicken Popcorn) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
          {POPUP_SIDE_ADDONS.map(addon => {
            const existingInCart = currentOrder.find(
              i => i.menuItemId === addon.menuItemId || i.id === addon.id
            );
            const inCartQty = existingInCart ? existingInCart.quantity : 0;
            const isAdded = inCartQty > 0;

            return (
              <div
                key={addon.id}
                id={`addon-card-${addon.id}`}
                className={`group relative bg-brand-cream/30 border-2 rounded-2xl p-3 flex flex-col justify-between transition-all duration-200 shadow-sm hover:shadow-md ${
                  isAdded 
                    ? 'border-mountain-green bg-emerald-50/50 shadow-md ring-2 ring-mountain-green/20' 
                    : 'border-stone-200 hover:border-brand-yellow/80 hover:bg-white'
                }`}
              >
                {/* Top Badge: Icon & Price */}
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="px-2 py-0.5 rounded-md bg-brand-brown text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                    <span>{addon.icon}</span>
                    <span>Side</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-mountain-green text-white text-xs font-black shadow-sm">
                    ₹{addon.price}
                  </span>
                </div>

                {/* Image */}
                <div className="aspect-[4/3] rounded-xl overflow-hidden mb-2 bg-stone-100 border border-stone-100 relative">
                  <img 
                    src={addon.image} 
                    alt={addon.name} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=800&auto=format&fit=crop&q=80';
                    }}
                  />
                  {inCartQty > 0 && (
                    <div className="absolute top-2 right-2 bg-mountain-green text-white px-2 py-0.5 rounded-full text-[10px] font-black shadow-md flex items-center gap-1">
                      <Check className="w-3 h-3 stroke-[3]" />
                      <span>x{inCartQty}</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="mb-3 text-center">
                  <h4 className="font-black text-sm text-brand-brown leading-tight">
                    {addon.name}
                  </h4>
                  <p className="text-[10px] text-stone-500 font-medium line-clamp-1 mt-0.5">
                    {addon.tagline}
                  </p>
                </div>

                {/* Stepper or Add Button */}
                {inCartQty > 0 ? (
                  <div className="w-full flex items-center justify-between bg-white border-2 border-mountain-green rounded-xl p-1 shadow-sm">
                    <button
                      type="button"
                      id={`btn-dec-${addon.id}`}
                      onClick={() => handleDecrementSide(addon)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-stone-100 hover:bg-brand-red/10 text-stone-600 hover:text-brand-red font-black transition-colors active:scale-95 cursor-pointer"
                      title="Decrease quantity"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    
                    <div className="text-center px-2 min-w-[60px]">
                      <span className="text-xs font-black text-mountain-green block leading-tight">
                        {inCartQty} in order
                      </span>
                      <span className="text-[9px] font-bold text-stone-400 block">
                        ₹{addon.price * inCartQty}
                      </span>
                    </div>

                    <button
                      type="button"
                      id={`btn-inc-${addon.id}`}
                      onClick={() => handleIncrementSide(addon)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-mountain-green hover:bg-emerald-600 text-white font-black transition-colors shadow-sm active:scale-95 cursor-pointer"
                      title="Add one more"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    id={`btn-add-${addon.id}`}
                    onClick={() => handleAddSideOne(addon)}
                    className="w-full py-2 px-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-md active:scale-95 bg-brand-brown hover:bg-mountain-green text-brand-yellow hover:text-white cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add {addon.name.replace('Add ', '')} (+₹{addon.price})</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-center pt-2 gap-3">
          {totalAllAdded > 0 ? (
            <button 
              type="button"
              id="btn-addon-done"
              onClick={handleCloseModal}
              className="py-3.5 px-8 rounded-2xl bg-mountain-green hover:bg-emerald-700 text-white font-black uppercase text-xs tracking-widest transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Done & Continue ({totalAllAdded} {totalAllAdded === 1 ? 'item' : 'items'} · ₹{totalAllCost})</span>
            </button>
          ) : (
            <button 
              type="button"
              id="btn-addon-no-thanks"
              onClick={handleCloseModal}
              className="py-3 px-8 rounded-2xl border-2 border-brand-stone text-brand-brown/50 font-black uppercase text-xs tracking-widest hover:bg-stone-100 hover:text-brand-brown hover:border-stone-300 transition-colors cursor-pointer"
            >
              No thanks, Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CrossSellModal;
