
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { OrderItem, PaymentMethod, OrderType } from '../types';
import PrintReceipt from './PrintReceipt';
import { TANDOORI_MAYO_ORDER_ITEM } from '../constants';
import { printerService } from '../utils/bluetoothPrinter';

interface BillPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (paymentMethod: PaymentMethod, useBluetooth?: boolean) => void;
  orderItems: OrderItem[];
  billNumber: number | null;
  branchName: string | null;
  onAddItem: (items: OrderItem[]) => void;
  onUpdateQuantity: (itemId: string, newQuantity: number) => void;
  isSaving?: boolean;
  orderType?: OrderType;
  tableId?: string;
  customerPhone?: string;
  isPrinterConnected?: boolean;
}

const BillPreviewModal: React.FC<BillPreviewModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  orderItems, 
  billNumber, 
  branchName, 
  onAddItem, 
  onUpdateQuantity,
  isSaving = false,
  orderType,
  tableId,
  customerPhone,
  isPrinterConnected = false
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);

  if (!isOpen) return null;
  
  const hasMayo = orderItems.some(item => item.menuItemId === TANDOORI_MAYO_ORDER_ITEM.menuItemId && !item.parentItemId);

  const handleToggleMayo = () => {
    if (isSaving) return;
    if (hasMayo) {
      const mayoItem = orderItems.find(item => item.menuItemId === TANDOORI_MAYO_ORDER_ITEM.menuItemId && !item.parentItemId);
      if(mayoItem) onUpdateQuantity(mayoItem.id, 0);
    } else {
      onAddItem([{...TANDOORI_MAYO_ORDER_ITEM, quantity: 1}]);
    }
  };

  const paymentMethods: PaymentMethod[] = ['Cash', 'UPI', 'Card'];

  // Portaling the printable version of the receipt to a top-level container
  // This avoids all modal-specific layout issues during system print.
  const printRoot = document.getElementById('print-root');

  return (
    <>
      <div 
        className="fixed inset-0 bg-brand-brown/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 print:hidden"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div 
          className="bg-brand-cream rounded-[3rem] shadow-2xl w-full max-w-md text-brand-brown overflow-hidden flex flex-col max-h-[90vh]"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-8 overflow-y-auto no-scrollbar flex-1">
            <h2 className="text-2xl font-black mb-6 text-center italic uppercase tracking-tighter">Order <span className="text-brand-red">Summary</span></h2>
            
            <div className="bg-white rounded-3xl p-4 shadow-inner border border-brand-stone mb-6">
              {/* This instance is for the user's visual preview on screen */}
              <PrintReceipt 
                orderItems={orderItems} 
                billNumber={billNumber} 
                branchName={branchName} 
                orderType={orderType}
                tableId={tableId}
                customerPhone={customerPhone}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase text-stone-400 tracking-widest text-center">Optional Add-on</h3>
              <button 
                onClick={handleToggleMayo}
                disabled={isSaving}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${hasMayo ? 'bg-brand-yellow border-brand-brown' : 'bg-white border-brand-stone'}`}
              >
                <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 ${hasMayo ? 'bg-brand-brown border-brand-brown' : 'bg-brand-stone border-brand-stone'}`}>
                    {hasMayo && <svg className="w-3 h-3 text-brand-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className="font-black text-xs uppercase tracking-tight">Tandoori Mayo (+₹10)</span>
              </button>

              <h3 className="text-[10px] font-black uppercase text-stone-400 tracking-widest text-center pt-4">Choose Payment Method</h3>
              <div className="grid grid-cols-3 gap-2">
                {paymentMethods.map(method => (
                  <button
                    key={method}
                    onClick={() => setSelectedMethod(method)}
                    className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${selectedMethod === method ? 'bg-brand-brown border-brand-brown text-brand-yellow shadow-lg' : 'bg-white border-brand-stone text-brand-brown/40'}`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-brand-brown p-6 lg:p-8 space-y-3">
              <button 
                  onClick={() => selectedMethod && onConfirm(selectedMethod, false)} 
                  disabled={isSaving || !selectedMethod}
                  className="w-full bg-brand-yellow text-brand-brown font-black py-5 rounded-2xl transition-all shadow-xl text-[10px] uppercase tracking-[0.2em] disabled:opacity-30 flex items-center justify-center gap-3"
              >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                  Confirm & System Print
              </button>

              {printerService.isSupported() && isPrinterConnected && (
                <button 
                  onClick={() => selectedMethod && onConfirm(selectedMethod, true)} 
                  disabled={isSaving || !selectedMethod}
                  className="w-full bg-mountain-green text-white font-black py-5 rounded-2xl transition-all shadow-xl text-[10px] uppercase tracking-[0.2em] disabled:opacity-30 flex items-center justify-center gap-3"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M14.88 12L19 7.88 15.12 4h-1.41v6.29L10.41 7 9 8.41 12.59 12 9 15.59 10.41 17l3.29-3.29V20h1.41L19 16.12 14.88 12z"/></svg>
                  Confirm & BT Print
                </button>
              )}

              <button 
                onClick={onClose} 
                disabled={isSaving}
                className="w-full py-2 text-brand-cream/40 hover:text-brand-cream font-black text-[9px] uppercase tracking-widest transition-colors"
              >
                  Back to POS
              </button>
          </div>
        </div>
      </div>

      {/* DEDICATED PRINT PORTAL: This instance is for the browser's print renderer */}
      {printRoot && createPortal(
        <PrintReceipt 
          orderItems={orderItems} 
          billNumber={billNumber} 
          branchName={branchName} 
          orderType={orderType}
          tableId={tableId}
          customerPhone={customerPhone}
        />,
        printRoot
      )}
    </>
  );
};

export default BillPreviewModal;
