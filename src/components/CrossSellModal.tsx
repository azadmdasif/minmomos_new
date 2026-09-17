import React from 'react';
import { Plus, Minus, Check, X } from 'lucide-react';
import { MenuItem, OrderItem } from '../types';
import { POPUP_SIDE_ADDONS } from '../constants';

interface CrossSellModalProps {
  isOpen: boolean;
  onClose: () => void;
  upsellItem?: MenuItem | undefined;
  onConfirm: (item: OrderItem) => void;
  currentOrder?: OrderItem[];
  onUpdateQuantity?: (id: string, qty: number) => void;
}

const CrossSellModal: React.FC<CrossSellModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm,
  currentOrder = [],
  onUpdateQuantity
}) => {
  if (!isOpen) return null;

  const handleAddOne = (addon: typeof POPUP_SIDE_ADDONS[0]) => {
    const orderItem: OrderItem = {
      id: addon.id,
      menuItemId: addon.menuItemId,
      name: addon.name,
      price: addon.price,
      cost: addon.cost,
      quantity: 1
    };
    onConfirm(orderItem);
  };

  const handleIncrement = (addon: typeof POPUP_SIDE_ADDONS[0]) => {
    const existing = currentOrder.find(
      i => i.menuItemId === addon.menuItemId || i.id === addon.id
    );
    if (existing && onUpdateQuantity) {
      onUpdateQuantity(existing.id, existing.quantity + 1);
    } else {
      handleAddOne(addon);
    }
  };

  const handleDecrement = (addon: typeof POPUP_SIDE_ADDONS[0]) => {
    const existing = currentOrder.find(
      i => i.menuItemId === addon.menuItemId || i.id === addon.id
    );
    if (existing && onUpdateQuantity) {
      onUpdateQuantity(existing.id, existing.quantity - 1);
    }
  };

  const totalSidesAdded = POPUP_SIDE_ADDONS.reduce((acc, addon) => {
    const item = currentOrder.find(i => i.menuItemId === addon.menuItemId || i.id === addon.id);
    return acc + (item ? item.quantity : 0);
  }, 0);

  const totalSidesCost = POPUP_SIDE_ADDONS.reduce((acc, addon) => {
    const item = currentOrder.find(i => i.menuItemId === addon.menuItemId || i.id === addon.id);
    return acc + (item ? item.quantity * addon.price : 0);
  }, 0);

  return (
    <div 
      id="cross-sell-modal-backdrop"
      className="fixed inset-0 bg-brand-brown/85 backdrop-blur-sm flex items-center justify-center z-[150] p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        id="cross-sell-modal-card"
        className="bg-white rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-8 max-w-2xl w-full shadow-2xl border-4 border-brand-yellow animate-in zoom-in-95 duration-200 relative my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Close Button */}
        <button
          type="button"
          id="close-cross-sell-btn"
          onClick={onClose}
          className="absolute top-5 right-5 text-stone-400 hover:text-brand-brown p-2 rounded-full hover:bg-stone-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="w-20 h-14 bg-brand-yellow/15 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <span className="text-2xl tracking-wider">🍟 🍹 🍗</span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-black text-brand-brown italic uppercase tracking-tighter">
            Wait! <span className="text-brand-red">Special Add-On Offer?</span>
          </h3>
          <p className="text-stone-500 font-bold text-xs sm:text-sm mt-1.5">
            Add sides for <span className="text-mountain-green font-black text-sm sm:text-base">₹39 each</span> to this order:
          </p>
        </div>

        {/* 3 Add-on Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
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
                  <h4 className="font-black text-sm sm:text-base text-brand-brown leading-tight">
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
                      onClick={() => handleDecrement(addon)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-stone-100 hover:bg-brand-red/10 text-stone-600 hover:text-brand-red font-black transition-colors active:scale-95"
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
                      onClick={() => handleIncrement(addon)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-mountain-green hover:bg-emerald-600 text-white font-black transition-colors shadow-sm active:scale-95"
                      title="Add one more"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    id={`btn-add-${addon.id}`}
                    onClick={() => handleAddOne(addon)}
                    className="w-full py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95 bg-brand-brown hover:bg-mountain-green text-brand-yellow hover:text-white cursor-pointer"
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
        <div className="flex items-center justify-center pt-2">
          {totalSidesAdded > 0 ? (
            <button 
              type="button"
              id="btn-addon-done"
              onClick={onClose}
              className="py-3.5 px-8 rounded-2xl bg-mountain-green hover:bg-emerald-700 text-white font-black uppercase text-xs tracking-widest transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Done & Continue ({totalSidesAdded} {totalSidesAdded === 1 ? 'side' : 'sides'} · ₹{totalSidesCost})</span>
            </button>
          ) : (
            <button 
              type="button"
              id="btn-addon-no-thanks"
              onClick={onClose}
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
