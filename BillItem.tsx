import React from 'react';
import { OrderItem } from './types';
import { FRIES_ADD_ON_ITEM, TANDOORI_MAYO_ORDER_ITEM } from './constants';

interface BillItemProps {
  item: OrderItem;
  onUpdateQuantity: (itemId: string, newQuantity: number) => void;
  isMomo: boolean;
  onAddItem: (items: OrderItem[]) => void;
  orderItems: OrderItem[];
}

const BillItem: React.FC<BillItemProps> = ({ item, onUpdateQuantity, isMomo, onAddItem, orderItems }) => {
  const addOnFriesId = `${FRIES_ADD_ON_ITEM.id}-${item.id}`;
  const hasFriesAddOn = isMomo && orderItems.some(i => i.id === addOnFriesId);

  const handleToggleFries = () => {
    if (hasFriesAddOn) {
      // If fries exist, call update with quantity 0 to remove them
      onUpdateQuantity(addOnFriesId, 0);
    } else {
      // If fries don't exist, create and add them
      const friesToAdd: OrderItem = {
        ...FRIES_ADD_ON_ITEM,
        id: addOnFriesId,
        parentItemId: item.id,
        quantity: item.quantity,
      };
      onAddItem([friesToAdd]);
    }
  };
  
  const addOnMayoId = `${TANDOORI_MAYO_ORDER_ITEM.id}-${item.id}`;
  const hasMayoAddOn = isMomo && orderItems.some(i => i.id === addOnMayoId);

  const handleToggleMayo = () => {
    if (hasMayoAddOn) {
      onUpdateQuantity(addOnMayoId, 0);
    } else {
      const mayoToAdd: OrderItem = {
        ...TANDOORI_MAYO_ORDER_ITEM,
        id: addOnMayoId,
        parentItemId: item.id,
        quantity: item.quantity,
      };
      onAddItem([mayoToAdd]);
    }
  };


  return (
    <div className="py-3 border-b border-brand-cream/10 last:border-b-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-brand-cream">{item.name}</p>
          <p className="text-sm text-brand-cream/70">₹{item.price.toFixed(2)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-brand-cream/10 rounded-md">
            <button 
              onClick={() => onUpdateQuantity(item.id, item.quantity - 1)} 
              className="px-2 py-1 text-lg font-bold hover:bg-brand-cream/20 rounded-l-md">-</button>
            <span className="px-3">{item.quantity}</span>
            <button 
              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)} 
              className="px-2 py-1 text-lg font-bold hover:bg-brand-cream/20 rounded-r-md">+</button>
          </div>
          <p className="w-16 text-right font-semibold">₹{(item.price * item.quantity).toFixed(2)}</p>
        </div>
      </div>
      {isMomo && (
        <div className="mt-2 space-y-1.5">
           <label 
              htmlFor={`fries-addon-${item.id}`} 
              onClick={(e) => { e.preventDefault(); handleToggleFries(); }}
              className="w-full flex items-center gap-2 cursor-pointer text-left text-xs p-1.5 rounded-md bg-brand-cream/10 hover:bg-brand-cream/20 transition-colors"
           >
             <div 
                className={`w-4 h-4 rounded-sm flex items-center justify-center transition-all duration-150 border ${hasFriesAddOn ? 'bg-brand-yellow border-brand-brown' : 'bg-brand-cream/30 border-brand-cream/50'}`}
                aria-hidden="true"
             >
                {hasFriesAddOn && (
                  <svg className="w-3 h-3 text-brand-brown" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
             </div>
             <span className="font-semibold text-brand-cream">
               Add French Fries at half price (+₹{FRIES_ADD_ON_ITEM.price.toFixed(2)})
             </span>
             <input type="checkbox" id={`fries-addon-${item.id}`} checked={hasFriesAddOn} readOnly className="sr-only" />
           </label>
           
           <label 
              htmlFor={`mayo-addon-${item.id}`}
              onClick={(e) => { e.preventDefault(); handleToggleMayo(); }}
              className="w-full flex items-center gap-2 cursor-pointer text-left text-xs p-1.5 rounded-md bg-brand-cream/10 hover:bg-brand-cream/20 transition-colors"
           >
             <div 
                className={`w-4 h-4 rounded-sm flex items-center justify-center transition-all duration-150 border ${hasMayoAddOn ? 'bg-brand-yellow border-brand-brown' : 'bg-brand-cream/30 border-brand-cream/50'}`}
                aria-hidden="true"
             >
                {hasMayoAddOn && (
                  <svg className="w-3 h-3 text-brand-brown" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
             </div>
             <span className="font-semibold text-brand-cream">
               Add Tandoori Mayonnaise (+₹{TANDOORI_MAYO_ORDER_ITEM.price.toFixed(2)})
             </span>
             <input type="checkbox" id={`mayo-addon-${item.id}`} checked={hasMayoAddOn} readOnly className="sr-only" />
           </label>
        </div>
      )}
    </div>
  );
};

export default BillItem;