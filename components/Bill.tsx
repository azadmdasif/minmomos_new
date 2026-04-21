
import React from 'react';
import { OrderItem, OrderType } from '../types';
import BillItem from './BillItem';
import { MENU_ITEMS } from '../constants';

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
        
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-brand-brown/30 lg:text-brand-cream/40 tracking-[0.2em] ml-1">Customer Contact</label>
          <input 
            type="tel"
            placeholder="Enter Phone Number..."
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="w-full bg-white/10 lg:bg-white/10 border border-brand-brown/10 lg:border-white/10 rounded-xl p-3 text-sm font-bold text-brand-brown lg:text-brand-cream outline-none focus:border-brand-yellow transition-colors placeholder:text-stone-400 lg:placeholder:text-white/20"
          />
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
          <span className="text-3xl font-black text-mountain-green tracking-tighter lg:text-white">₹{total.toFixed(2)}</span>
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
