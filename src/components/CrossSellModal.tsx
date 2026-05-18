
import React from 'react';
import { MenuItem, OrderItem, PreparationType, Size } from '../types';

interface CrossSellModalProps {
  isOpen: boolean;
  onClose: () => void;
  upsellItem: MenuItem | undefined;
  onConfirm: (item: OrderItem) => void;
}

const CrossSellModal: React.FC<CrossSellModalProps> = ({ isOpen, onClose, upsellItem, onConfirm }) => {
  if (!isOpen || !upsellItem) return null;

  // Find a default variant for the combo if it exists
  const handleAdd = () => {
    // For combos, we usually have a 'normal' preparation and 'medium' size as default
    // or whatever is available with a price > 0
    let prep: PreparationType = 'normal';
    let size: Size = 'medium';
    
    if (!upsellItem.preparations[prep]?.[size]) {
      // Fallback to first available price
      for (const p in upsellItem.preparations) {
        const prepKey = p as PreparationType;
        const variations = upsellItem.preparations[prepKey];
        if (variations) {
          for (const s in variations) {
            const sizeKey = s as Size;
            if (variations[sizeKey]! > 0) {
              prep = prepKey;
              size = sizeKey;
              break;
            }
          }
        }
      }
    }

    const price = upsellItem.preparations[prep]?.[size] || 0;
    const cost = upsellItem.costs[prep]?.[size] || 0;

    const orderItem: OrderItem = {
      id: `${upsellItem.id}-${prep}-${size}`,
      menuItemId: upsellItem.id,
      name: `${upsellItem.name} (${prep.charAt(0).toUpperCase() + prep.slice(1)})`,
      price,
      cost,
      quantity: 1
    };

    onConfirm(orderItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
      <div className="bg-white rounded-[3rem] p-8 max-w-md w-full shadow-2xl border-4 border-brand-yellow animate-in zoom-in duration-300">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-brand-yellow/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">🍟</span>
          </div>
          <h3 className="text-2xl font-black text-brand-brown italic uppercase tracking-tighter">Wait! <span className="text-brand-red">Combo Offer?</span></h3>
          <p className="text-stone-500 font-bold mt-2">Would the customer like to add <br/><span className="text-brand-brown font-black">{upsellItem.name}</span> to this order?</p>
        </div>

        <div className="aspect-video bg-brand-cream rounded-2xl mb-8 overflow-hidden border border-brand-stone">
          <img src={upsellItem.image || 'https://via.placeholder.com/400?text=Combo+Offer'} className="w-full h-full object-cover" alt="Combo" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={onClose}
            className="py-4 rounded-2xl border-2 border-brand-stone text-brand-brown/40 font-black uppercase text-[10px] tracking-widest hover:bg-stone-50 transition-colors"
          >
            No thanks
          </button>
          <button 
            onClick={handleAdd}
            className="py-4 rounded-2xl bg-brand-brown text-brand-yellow font-black uppercase text-[10px] tracking-widest shadow-xl hover:scale-105 transition-transform"
          >
            Add Combo
          </button>
        </div>
      </div>
    </div>
  );
};

export default CrossSellModal;
