

import React from 'react';
import { OrderItem, PaymentMethod } from './types';
import PrintReceipt from './PrintReceipt';
import { TANDOORI_MAYO_ORDER_ITEM } from './constants';

interface BillPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (paymentMethod: PaymentMethod) => void;
  orderItems: OrderItem[];
  billNumber: number | null;
  branchName: string | null;
  onAddItem: (items: OrderItem[]) => void;
  onUpdateQuantity: (itemId: string, newQuantity: number) => void;
}

const BillPreviewModal: React.FC<BillPreviewModalProps> = ({ isOpen, onClose, onConfirm, orderItems, billNumber, branchName, onAddItem, onUpdateQuantity }) => {
  if (!isOpen) {
    return null;
  }
  
  const hasMayo = orderItems.some(item => item.menuItemId === TANDOORI_MAYO_ORDER_ITEM.menuItemId && !item.parentItemId);


  const handleToggleMayo = () => {
    if (hasMayo) {
      const mayoItem = orderItems.find(item => item.menuItemId === TANDOORI_MAYO_ORDER_ITEM.menuItemId && !item.parentItemId);
      if(mayoItem) {
        onUpdateQuantity(mayoItem.id, 0);
      }
    } else {
      // Add one mayo
      onAddItem([{...TANDOORI_MAYO_ORDER_ITEM, quantity: 1}]);
    }
  };

  const paymentMethods: PaymentMethod[] = ['Cash', 'UPI', 'Card'];

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div 
        className="bg-brand-cream rounded-lg shadow-2xl w-full max-w-sm text-brand-brown overflow-hidden"
        onClick={e => e.stopPropagation()} // Prevent closing modal when clicking inside
      >
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4 text-center">Receipt Preview</h2>
          <div className="bg-white rounded-md p-2 max-h-80 overflow-y-auto shadow-inner">
            <PrintReceipt orderItems={orderItems} billNumber={billNumber} branchName={branchName} />
          </div>
          {/* ADDON SECTION START */}
          <div className="pt-4">
            <h3 className="text-sm font-semibold text-center text-brand-brown/70 mb-2">Suggested Add-ons</h3>
            <label 
              htmlFor={`mayo-addon-preview`}
              onClick={(e) => { e.preventDefault(); handleToggleMayo(); }}
              className="w-full flex items-center gap-2 cursor-pointer text-left p-2 rounded-md bg-brand-brown/5 hover:bg-brand-brown/10 transition-colors"
            >
              <div 
                  className={`w-4 h-4 rounded-sm flex items-center justify-center transition-all duration-150 border ${hasMayo ? 'bg-brand-yellow border-brand-brown' : 'bg-brand-cream/30 border-brand-cream/50'}`}
                  aria-hidden="true"
              >
                  {hasMayo && (
                    <svg className="w-3 h-3 text-brand-brown" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
              </div>
              <span className="font-semibold text-brand-brown text-sm">
                Add Tandoori Mayonnaise (+₹{TANDOORI_MAYO_ORDER_ITEM.price.toFixed(2)})
              </span>
              <input type="checkbox" id={`mayo-addon-preview`} checked={hasMayo} readOnly className="sr-only" />
            </label>
          </div>
          {/* ADDON SECTION END */}
        </div>
        <div className="bg-brand-brown/5 p-4 space-y-3 border-t border-brand-brown/10">
            <p className="text-center font-semibold text-brand-brown/80">Select Payment Method & Print</p>
            <div className="grid grid-cols-1 gap-3">
                 {paymentMethods.map(method => (
                     <button 
                        key={method}
                        onClick={() => onConfirm(method)} 
                        className="bg-brand-red hover:bg-brand-red/90 text-white font-bold py-3 px-4 rounded-lg transition-colors w-full"
                    >
                        Pay with {method}
                    </button>
                 ))}
            </div>
            <button onClick={onClose} className="bg-brand-brown/10 hover:bg-brand-brown/20 text-brand-brown font-bold py-2 px-4 rounded-lg transition-colors w-full">
                Cancel
            </button>
        </div>
      </div>
    </div>
  );
};

export default BillPreviewModal;