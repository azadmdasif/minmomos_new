import React from 'react';
import { OrderItem } from './types';
import BillItem from './BillItem';
import { MENU_ITEMS } from './constants';

interface BillProps {
  orderItems: OrderItem[];
  onUpdateQuantity: (itemId: string, newQuantity: number) => void;
  onClear: () => void;
  onPreview: () => void;
  branchName: string | null;
  onAddItem: (items: OrderItem[]) => void;
}

const Bill: React.FC<BillProps> = ({ orderItems, onUpdateQuantity, onClear, onPreview, branchName, onAddItem }) => {
  const total = orderItems.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return (
    <div className="flex flex-col h-full rounded-lg text-brand-cream">
      <div className="mb-4 border-b border-brand-cream/20 pb-2">
        <h2 className="text-xl font-semibold">Current Bill</h2>
        {branchName && <p className="text-sm text-brand-cream/70 font-semibold">{branchName}</p>}
      </div>

      {orderItems.length === 0 ? (
        <div className="flex-grow flex items-center justify-center">
          <p className="text-brand-cream/60">Click on menu items to add them here.</p>
        </div>
      ) : (
        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          {orderItems.map(item => {
            // Find the base menu item to determine its category
            const menuItem = MENU_ITEMS.find(mi => mi.id === item.menuItemId);
            const isMomo = menuItem?.category === 'momo';

            // Don't render the add-on item directly, it's controlled by its parent momo
            if (item.parentItemId) return null;

            return (
              <BillItem 
                key={item.id} 
                item={item} 
                onUpdateQuantity={onUpdateQuantity}
                isMomo={isMomo}
                onAddItem={onAddItem}
                orderItems={orderItems}
              />
            )
          })}
        </div>
      )}
      
      <div className="mt-auto pt-4 border-t border-brand-cream/20">
        <div className="space-y-2">
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span>₹{total.toFixed(2)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button 
            onClick={onClear} 
            disabled={orderItems.length === 0}
            className="w-full bg-brand-cream/10 hover:bg-brand-cream/20 text-brand-cream font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-white/5 disabled:cursor-not-allowed disabled:text-brand-cream/40">
            Clear
          </button>
          <button 
            onClick={onPreview} 
            disabled={orderItems.length === 0}
            className="w-full bg-brand-red hover:bg-brand-red/90 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-brand-red/50 disabled:cursor-not-allowed">
            Finalize Order
          </button>
        </div>
      </div>
    </div>
  );
};

export default Bill;