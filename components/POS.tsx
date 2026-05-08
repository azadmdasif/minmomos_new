
import React, { useState, useCallback, useEffect } from 'react';
import { MenuItem as MenuItemType, OrderItem, OrderType, PaymentMethod } from '../types';
import Menu from './Menu';
import Bill from './Bill';
import VariantSelectionModal from './VariantSelectionModal';
import BillPreviewModal from './BillPreviewModal';
import CrossSellModal from './CrossSellModal';
import { saveOrder, peekNextBillNumber, fetchMenuItems } from '../utils/storage';
import { printerService } from '../utils/bluetoothPrinter';

const CATEGORIES = [
  { id: 'momo', label: 'Momos', icon: '♨️' },
  { id: 'moburg', label: 'Moburg', icon: '🍔' },
  { id: 'side', label: 'Sides', icon: '🥗' },
  { id: 'drink', label: 'Drinks', icon: '🥤' },
  { id: 'combo', label: 'Combos', icon: '🍱' }
];

const POS: React.FC<{ branchName: string }> = ({ branchName }) => {
  const UPSELL_ITEM_ID = 'item-1778060358624';
  const [menuItems, setMenuItems] = useState<MenuItemType[]>([]);
  const [order, setOrder] = useState<OrderItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('momo');
  const [selectedItem, setSelectedItem] = useState<MenuItemType | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingBillNumber, setPendingBillNumber] = useState<number | null>(null);
  const [orderType, setOrderType] = useState<OrderType>('TAKEAWAY');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isPrinterConnected, setIsPrinterConnected] = useState(false);
  
  // Cross-sell state
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [upsellItem, setUpsellItem] = useState<MenuItemType | undefined>(undefined);

  useEffect(() => {
    const loadData = async () => {
      const [mResponse] = await Promise.all([
        fetchMenuItems()
      ]);
      
      if (mResponse.data) {
        setMenuItems(mResponse.data);
      }
    };
    loadData();

    // Initial printer state
    setIsPrinterConnected(printerService.isConnected());

    // Listen for disconnections
    printerService.setDisconnectCallback(() => {
      setIsPrinterConnected(false);
    });
  }, []);

  const handleConnectPrinter = async () => {
    const connected = await printerService.connect();
    setIsPrinterConnected(connected);
    if (connected) alert("Printer Connected Successfully!");
  };

  const handleAddItem = useCallback((itemsToAdd: OrderItem[]) => {
    // Check for upselling opportunity
    const hasQualifyingItem = itemsToAdd.some(item => {
      const menuDetail = menuItems.find(m => m.id === item.menuItemId);
      return menuDetail && (menuDetail.category === 'momo' || menuDetail.category === 'moburg');
    });

    const alreadyInOrder = order.some(item => item.menuItemId === UPSELL_ITEM_ID);
    const addedInThisBatch = itemsToAdd.some(item => item.menuItemId === UPSELL_ITEM_ID);

    if (hasQualifyingItem && !alreadyInOrder && !addedInThisBatch) {
      const upsell = menuItems.find(m => m.id === UPSELL_ITEM_ID);
      if (upsell) {
        setUpsellItem(upsell);
        setShowUpsellModal(true);
      }
    }

    setOrder((prev) => {
      const newOrder = [...prev];
      itemsToAdd.forEach(item => {
        const idx = newOrder.findIndex(i => i.id === item.id);
        if (idx > -1) {
          // If it exists, update it (allows price updates for discounts)
          newOrder[idx] = { ...newOrder[idx], ...item, quantity: newOrder[idx].quantity + (item.quantity > 0 ? item.quantity : 0) };
          // Special case: if adding specifically 1 quantity for a newly added item, but it was already there, we might just want to set it.
          // For the discount auto-update, we pass quantity: 1 but we really just want to update the price.
          if (item.id === 'welcome-discount') {
            newOrder[idx].quantity = 1;
            newOrder[idx].price = item.price;
          }
        }
        else newOrder.push(item);
      });
      return newOrder;
    });
  }, [menuItems, order]);

  const handleUpdateQuantity = (id: string, qty: number) => {
    setOrder(prev => qty <= 0 ? prev.filter(i => i.id !== id) : prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  };

  const handleFinalize = async () => {
    const nextNum = await peekNextBillNumber();
    setPendingBillNumber(nextNum);
    setIsPreviewing(true);
  };

  const resetAfterOrder = () => {
    setOrder([]);
    setCustomerPhone('');
    setIsPreviewing(false);
    setIsMobileCartOpen(false);
    setPendingBillNumber(null);
    setIsSaving(false);
  };

  const handleConfirmOrder = async (method: PaymentMethod, useBluetooth: boolean = false) => {
    if (isSaving) return;
    setIsSaving(true);
    
    try {
      const total = Math.round(order.reduce((acc, i) => acc + i.price * i.quantity, 0));
      
      const savedNum = await saveOrder(
        order, 
        total, 
        branchName, 
        orderType, 
        'ORDERED', 
        method, 
        undefined,
        customerPhone
      );
      
      if (savedNum) {
        if (useBluetooth && printerService.isConnected()) {
          const success = await printerService.printReceipt({
            orderItems: order,
            billNumber: savedNum,
            paymentMethod: method,
            branchName,
            orderType
          });
          
          if (success) {
            resetAfterOrder();
          } else {
            alert("Bluetooth printing failed. Please check your printer and try again.");
            setIsSaving(false);
            return;
          }
        } else if (!useBluetooth) {
          // SYSTEM PRINT: 
          // 1. Force a small microtask gap to ensure Portal commit
          await new Promise(r => setTimeout(r, 50));
          
          // 2. Trigger print
          window.print();
          
          // 3. Reset state immediately. window.print() is blocking, 
          // so this runs only after the user closes the print dialog.
          resetAfterOrder();
        } else {
            resetAfterOrder();
        }
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while finalizing the order.");
      setIsSaving(false);
    }
  };

  const filteredItems = menuItems.filter(item => {
    if (item.category !== activeCategory) return false;
    
    // Check if any variant has a price > 0
    return Object.values(item.preparations).some(prep => 
      prep && Object.values(prep).some(price => price !== undefined && price > 0)
    );
  });

  return (
    <div className="flex flex-col lg:flex-row h-full bg-brand-cream pb-20 lg:pb-0">
      {/* Category Picker */}
      <div className="w-full lg:w-32 bg-white border-b lg:border-r border-stone-200 flex lg:flex-col p-3 gap-3 shadow-sm z-10 overflow-x-auto lg:overflow-visible no-scrollbar">
        <div className="hidden lg:block text-[10px] font-black uppercase text-stone-400 tracking-widest text-center mb-2">Menu</div>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex flex-col items-center justify-center min-w-[80px] lg:min-w-0 aspect-square p-2 rounded-2xl transition-all duration-300 border-2 shrink-0 ${
              activeCategory === cat.id ? 'bg-brand-yellow border-brand-yellow text-brand-brown shadow-lg' : 'bg-white border-stone-100 text-stone-400 hover:border-brand-yellow/30'
            }`}
          >
            <span className="text-lg lg:text-xl mb-1">{cat.icon}</span>
            <span className="text-[8px] lg:text-[9px] font-black uppercase tracking-tighter text-center leading-none">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Item Grid */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 no-scrollbar">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 lg:mb-8 gap-4">
             <div>
                <h2 className="text-2xl lg:text-3xl font-black text-brand-brown tracking-tighter italic uppercase leading-none">Local <span className="text-brand-red">Favorites</span></h2>
                <p className="text-[8px] lg:text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">Flavor Station: {branchName}</p>
             </div>
             <div className="flex gap-2 w-full sm:w-auto items-center">
               {printerService.isSupported() && (
                 <button 
                  onClick={handleConnectPrinter}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${isPrinterConnected ? 'bg-mountain-green text-white' : 'bg-brand-stone text-brand-brown'}`}
                 >
                   <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M14.88 12L19 7.88 15.12 4h-1.41v6.29L10.41 7 9 8.41 12.59 12 9 15.59 10.41 17l3.29-3.29V20h1.41L19 16.12 14.88 12zM15.71 7l1.29 1.29L15.71 9.58V7zm0 10V14.42l1.29 1.29L15.71 17zM7 12c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2z"/></svg>
                   {isPrinterConnected ? 'BT Ready' : 'Connect Printer'}
                 </button>
               )}
             </div>
          </div>
          <Menu menuItems={filteredItems} onSelectItem={setSelectedItem} />
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="hidden lg:flex lg:w-[400px] xl:w-[480px] bg-brand-brown border-l border-brand-brown/10 flex-col shadow-2xl relative z-10 text-white transition-all duration-500">
        <div className="flex-1 overflow-hidden">
          <Bill 
            orderItems={order} 
            onUpdateQuantity={handleUpdateQuantity} 
            onClear={() => { setOrder([]); setCustomerPhone(''); }} 
            onPreview={handleFinalize}
            branchName={branchName}
            onAddItem={handleAddItem}
            orderType={orderType}
            setOrderType={setOrderType}
            customerPhone={customerPhone}
            setCustomerPhone={setCustomerPhone}
          />
        </div>
      </div>

      {/* Mobile Cart Overlay */}
      <button 
        onClick={() => setIsMobileCartOpen(true)}
        className={`lg:hidden fixed bottom-24 right-6 w-16 h-16 bg-brand-red rounded-full shadow-2xl flex items-center justify-center text-white z-40 transition-transform active:scale-95 ${order.length > 0 ? 'scale-100' : 'scale-0'}`}
      >
        <span className="absolute -top-1 -right-1 bg-brand-yellow text-brand-brown w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-brand-red">
          {order.reduce((acc, i) => acc + i.quantity, 0)}
        </span>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      </button>

      {isMobileCartOpen && (
        <div className="lg:hidden fixed inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-bottom duration-300">
          <div className="p-6 bg-brand-brown lg:border-b border-white/10 flex justify-between items-center text-white">
            <button onClick={() => setIsMobileCartOpen(false)} className="text-white/40">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="text-center">
              <h3 className="text-xl font-black text-brand-yellow uppercase italic leading-none">Your <span className="text-white">Cart</span></h3>
              <p className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em] mt-1">Order Details</p>
            </div>
            <div className="w-8 h-8"></div>
          </div>
          
          <div className="flex-1 overflow-hidden">
            <Bill 
              orderItems={order} 
              onUpdateQuantity={handleUpdateQuantity} 
              onClear={() => { setOrder([]); setCustomerPhone(''); setIsMobileCartOpen(false); }} 
              onPreview={handleFinalize}
              branchName={branchName}
              onAddItem={handleAddItem}
              orderType={orderType}
              setOrderType={(type) => {
                setOrderType(type);
              }}
              customerPhone={customerPhone}
              setCustomerPhone={setCustomerPhone}
            />
          </div>
        </div>
      )}

      <VariantSelectionModal 
        item={selectedItem} 
        onClose={() => setSelectedItem(null)} 
        onAddItem={handleAddItem} 
      />
      <BillPreviewModal 
        isOpen={isPreviewing} 
        onClose={() => setIsPreviewing(false)} 
        onConfirm={handleConfirmOrder} 
        orderItems={order}
        billNumber={pendingBillNumber}
        branchName={branchName}
        onAddItem={handleAddItem}
        onUpdateQuantity={handleUpdateQuantity}
        isSaving={isSaving}
        orderType={orderType}
        customerPhone={customerPhone}
        isPrinterConnected={isPrinterConnected}
        menuItems={menuItems}
      />
      <CrossSellModal 
        isOpen={showUpsellModal}
        onClose={() => setShowUpsellModal(false)}
        upsellItem={upsellItem}
        onConfirm={(item) => handleAddItem([item])}
      />
    </div>
  );
};

export default POS;
