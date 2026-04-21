
import React from 'react';
import { OrderItem } from '../types';
import BillItem from './BillItem';
import { MENU_ITEMS } from '../constants';

interface BillProps {
  orderItems: OrderItem[];
  onUpdateQuantity: (itemId: string, newQuantity: number) => void;
  onClear: () => void;
  onPreview: () => void;
  branchName: string | null;
  onAddItem: (items: OrderItem[]) => void;
  orderType?: string;
}

const Bill: React.FC<BillProps> = ({ orderItems, onUpdateQuantity, onClear, onPreview, branchName, onAddItem, orderType }) => {
  const total = orderItems.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return (
    <div className="flex flex-col h-full text-stone-800">
      <div className="p-6 border-b border-stone-100 flex justify-between items-start">
        <div>
          <h2 className="text-xl font-black text-mountain-green tracking-tighter italic uppercase">Current <span className="text-peak-amber">Cart</span></h2>
          {branchName && <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.2em] mt-1">{branchName}</p>}
        </div>
        {orderType && (
          <span className="bg-brand-yellow text-brand-brown px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest italic shadow-sm">
            {orderType.replace('_', ' ')}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
        {orderItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-stone-200">
             <svg className="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
             <p className="font-black uppercase tracking-[0.2em] text-[10px]">Your peak is empty</p>
          </div>
        ) : (
          orderItems.map(item => {
            const menuItem = MENU_ITEMS.find(mi => mi.id === item.menuItemId);
            const isMomo = menuItem?.category === 'momo';
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
          })
        )}
      </div>
      
      <div className="p-6 bg-stone-50 border-t border-stone-200">
        <div className="flex justify-between items-end mb-6">
          <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">Total Amount</span>
          <span className="text-3xl font-black text-mountain-green tracking-tighter">₹{total.toFixed(2)}</span>
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
    </div>
  );
};

export default Bill;
