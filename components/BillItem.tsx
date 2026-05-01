import React from 'react';
import { OrderItem } from '../types';

interface BillItemProps {
  item: OrderItem;
  onUpdateQuantity: (itemId: string, newQuantity: number) => void;
}

const BillItem: React.FC<BillItemProps> = ({ item, onUpdateQuantity }) => {
  return (
    <div className="py-3 border-b border-brand-cream/10 last:border-b-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-brand-cream">{item.name}</p>
          <div className="flex items-center gap-2">
            <p className="text-sm text-brand-cream/70">
              {item.paidWithCoins ? `🪙 ${item.coinsPrice} Coins` : `₹${item.price.toFixed(2)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {item.id !== 'welcome-discount' && (
            <div className="flex items-center bg-brand-cream/10 rounded-md">
              <button 
                onClick={() => onUpdateQuantity(item.id, item.quantity - 1)} 
                className="px-2 py-1 text-lg font-bold hover:bg-brand-cream/20 rounded-l-md">-</button>
              <span className="px-3">{item.quantity}</span>
              <button 
                onClick={() => onUpdateQuantity(item.id, item.quantity + 1)} 
                className="px-2 py-1 text-lg font-bold hover:bg-brand-cream/20 rounded-r-md">+</button>
            </div>
          )}
          {item.id === 'welcome-discount' && (
            <button 
              onClick={() => onUpdateQuantity(item.id, 0)}
              className="p-2 text-brand-red hover:bg-brand-red/10 rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          )}
          <p className={`w-16 text-right font-semibold ${item.price < 0 ? 'text-brand-red' : ''}`}>
            {item.price < 0 ? '-' : ''}₹{Math.abs(item.price * item.quantity).toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default BillItem;
