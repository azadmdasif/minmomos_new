import React from 'react';
import { OrderItem } from '../types';

interface BillItemProps {
  item: OrderItem;
  onUpdateQuantity: (itemId: string, newQuantity: number) => void;
}

const BillItem: React.FC<BillItemProps> = ({ item, onUpdateQuantity }) => {
  return (
    <div className="py-3 border-b border-brand-brown/5 lg:border-white/5 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-brand-brown lg:text-brand-cream truncate leading-none mb-1">{item.name}</p>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold text-brand-brown/50 lg:text-brand-cream/60 uppercase tracking-widest">
              {item.paidWithCoins ? `🪙 ${item.coinsPrice} Coins` : `₹${item.price.toFixed(2)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {item.id !== 'welcome-discount' && (
            <div className="flex items-center bg-brand-brown/5 lg:bg-white/10 rounded-xl overflow-hidden">
              <button 
                onClick={() => onUpdateQuantity(item.id, item.quantity - 1)} 
                className="px-3 py-1.5 text-brand-brown lg:text-brand-cream hover:bg-brand-brown/10 lg:hover:bg-brand-cream/10 transition-colors font-black">-</button>
              <span className="px-2 text-xs font-black text-brand-brown lg:text-brand-cream">{item.quantity}</span>
              <button 
                onClick={() => onUpdateQuantity(item.id, item.quantity + 1)} 
                className="px-3 py-1.5 text-brand-brown lg:text-brand-cream hover:bg-brand-brown/10 lg:hover:bg-brand-cream/10 transition-colors font-black">+</button>
            </div>
          )}
          {item.id === 'welcome-discount' && (
            <button 
              onClick={() => onUpdateQuantity(item.id, 0)}
              className="p-2 text-brand-red bg-brand-red/10 rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          )}
          <p className={`w-20 text-right font-black text-sm lg:text-base ${item.price < 0 ? 'text-brand-red' : 'text-brand-brown lg:text-brand-cream'}`}>
            {item.price < 0 ? '-' : ''}₹{Math.abs(item.price * item.quantity).toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default BillItem;
