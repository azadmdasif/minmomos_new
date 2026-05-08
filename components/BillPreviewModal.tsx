
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Star, Send } from 'lucide-react';
import { OrderItem, PaymentMethod, OrderType, Customer, MenuItem, PreparationType, Size } from '../types';
import PrintReceipt from './PrintReceipt';
import { getCustomerByPhone, calculateTotalMinCoins, calculateProgressiveEarned } from '../utils/storage';

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
  customerPhone?: string;
  isPrinterConnected?: boolean;
  menuItems: MenuItem[];
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
  customerPhone,
  isPrinterConnected = false,
  menuItems
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const hasAppliedWelcomeDiscount = orderItems.some(item => item.id === 'welcome-discount');
  const canRedeemWelcomeCoupon = customer && customer.totalOrders === 1 && !customer.welcomeCouponUsed;

  useEffect(() => {
    if (isOpen && customerPhone) {
      getCustomerByPhone(customerPhone).then(setCustomer);
    } else if (!isOpen) {
      setCustomer(null);
    }
  }, [isOpen, customerPhone]);

  const rawTotal = orderItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const total = Math.round(rawTotal);
  const rawCashValue = orderItems.reduce((acc, item) => acc + (item.paidWithCoins ? 0 : item.price * item.quantity), 0);
  const totalCashValue = Math.round(rawCashValue);
  const coinsRequired = orderItems.reduce((acc, item) => acc + (item.paidWithCoins ? (item.coinsPrice || 0) * item.quantity : 0), 0);

  const maxRedemptionAllowed = totalCashValue;
  const isRedemptionOverLimit = coinsRequired > maxRedemptionAllowed;
  const hasSufficientCoins = (customer?.minCoins || 0) >= coinsRequired;

  const eligibleRewards = React.useMemo(() => {
    if (!customer) return [];
    
    // Find all variants in menu items that have a coin price
    const rewards: { menuItem: MenuItem, prep: string, size: string, coins: number }[] = [];
    
    menuItems.forEach(item => {
      if (item.minCoinsPrices) {
        Object.entries(item.minCoinsPrices).forEach(([prep, sizes]) => {
          if (sizes) {
            Object.entries(sizes).forEach(([size, coins]) => {
              if (typeof coins === 'number' && coins > 0) {
                // Only include if user can afford AND it's within current redemption limit
                if (coins <= ((customer.minCoins || 0) - coinsRequired) && coins <= (maxRedemptionAllowed - coinsRequired)) {
                  rewards.push({ menuItem: item, prep, size, coins });
                }
              }
            });
          }
        });
      }
    });

    return rewards.sort((a, b) => b.coins - a.coins);
  }, [customer, menuItems, maxRedemptionAllowed, coinsRequired]);

  if (!isOpen) return null;

  const handleAddReward = (reward: typeof eligibleRewards[0]) => {
    const { menuItem, prep, size, coins } = reward;
    const prepType = prep as PreparationType;
    const sizeType = size as Size;
    
    const itemId = `${menuItem.id}-${prep}-${size}-redeemed`;
    const label = `${menuItem.name} (${prepType} - ${sizeType}) (Redeemed)`;
    
    const newItem: OrderItem = {
      id: itemId,
      menuItemId: menuItem.id,
      name: label,
      price: 0,
      cost: 0,
      quantity: 1,
      paidWithCoins: true,
      coinsPrice: coins
    };

    onAddItem([newItem]);
  };

  const handleRemoveItem = (itemId: string) => {
    onUpdateQuantity(itemId, 0);
  };

  // Consistent logic for balance updates using tiered cashback
  const previousSpent = customer?.totalSpent || 0;
  const previousCoins = customer?.minCoins || 0;
  
  // Determine earned based on progressive tiers
  const totalEarnedBefore = calculateProgressiveEarned(previousSpent);
  const totalRedeemedBefore = Math.max(0, totalEarnedBefore - previousCoins);
  
  const totalEarnedAfter = calculateProgressiveEarned(previousSpent + totalCashValue);
  
  const earnedCoins = totalEarnedAfter - totalEarnedBefore;
  const finalBalance = calculateTotalMinCoins(previousSpent + totalCashValue, totalRedeemedBefore + coinsRequired);

  const handleWhatsAppSend = (useBT: boolean = false) => {
    if (!customerPhone) return;
    if (coinsRequired > 0 && !hasSufficientCoins) {
        alert(`Insufficient MinCoins balance. Required: ${coinsRequired}, Available: ${customer?.minCoins || 0}`);
        return;
    }
    
    // Format message
    const orderDetails = orderItems
      .map(item => {
        const itemTotal = item.paidWithCoins ? 0 : Math.round(item.price * item.quantity);
        const priceText = item.paidWithCoins ? `${item.coinsPrice} Coins` : `₹${itemTotal}`;
        return `*${item.quantity}x ${item.name}* - ${priceText}`;
      })
      .join('\n');
      
    const isFirstVisit = !customer || customer.totalOrders === 0;
    const welcomeCode = customer?.welcomeCouponCode;
    
    // Explicitly show coupon if it's the first visit and we have a code
    const couponMsg = (isFirstVisit && welcomeCode)
      ? `\n\n🎟️ *MINMOMOS GIFT!* 🎟️\nGet *15% OFF* on your next visit!\nCoupon: *${welcomeCode}*\n(Redeem on your 2nd order)`
      : '';

    const message = `*MinMomos Bill #${billNumber || '---'}*
--------------------------
${orderDetails}
--------------------------
*Total: ₹${total}*

🌟 *LOYALTY REWARDS* 🌟
Initial Balance: ${customer?.minCoins || 0}
Coins Earned: +${earnedCoins}
${coinsRequired > 0 ? `Coins Redeemed: -${coinsRequired}\n` : ''}*Total MinCoins: ${finalBalance}*${couponMsg}

_Thank you for visiting MinMomos!_`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${customerPhone.replace(/\D/g, '')}?text=${encodedMessage}`;
    
    window.open(whatsappUrl, '_blank');
    
    // Also trigger the confirm flow
    if (selectedMethod) {
        onConfirm(selectedMethod, useBT);
    }
  };

  // Portaling the printable version of the receipt to a top-level container
  // This avoids all modal-specific layout issues during system print.
  const printRoot = document.getElementById('print-root');

  return (
    <>
      <div 
        className="fixed inset-0 bg-brand-brown/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 lg:p-8 print:hidden"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-brand-cream w-full max-w-5xl h-full lg:h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col lg:flex-row"
          onClick={e => e.stopPropagation()}
        >
          {/* Left Column: Receipt Preview */}
          <div className="w-full lg:w-[400px] bg-brand-stone p-6 lg:p-10 overflow-y-auto no-scrollbar border-r border-brand-brown/5 flex flex-col">
            <h3 className="text-[10px] font-black uppercase text-stone-400 tracking-[0.2em] mb-6 text-center italic">Receipt Draft</h3>
            <div className="bg-white p-1 shadow-2xl rounded-sm flex-1">
              <div className="border border-dashed border-stone-200 h-full">
                <PrintReceipt 
                  orderItems={orderItems} 
                  billNumber={billNumber} 
                  branchName={branchName} 
                  orderType={orderType}
                  customerPhone={customerPhone}
                  customerInitialBalance={customer?.minCoins}
                  customerFinalBalance={finalBalance}
                  earnedCoinsValue={earnedCoins}
                  welcomeCouponCode={(customer?.totalOrders === 0 || !customer) ? customer?.welcomeCouponCode : undefined}
                />
              </div>
            </div>
            <button 
              onClick={onClose}
              className="mt-6 w-full py-4 text-[9px] font-black text-brand-brown/40 uppercase tracking-[0.3em] hover:text-brand-red transition-colors"
            >
              Cancel Order
            </button>
          </div>

          {/* Right Column: Rewards & Actions */}
          <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col bg-white">
            <div className="p-6 lg:p-10 flex-1 flex flex-col">
              {/* Rewards Engine Section */}
              <div className="space-y-4 mb-8">
                <div className="flex items-center justify-between">
                   <div>
                     <h2 className="text-xl font-black text-brand-brown uppercase italic leading-none">Rewards <span className="text-brand-red">Engine</span></h2>
                     <p className="text-[9px] font-black text-brand-brown/30 uppercase tracking-widest mt-1">Loyalty benefits for {customer?.name || 'Guest'}</p>
                   </div>
                   <div className="flex items-center gap-3 bg-brand-stone p-2 px-4 rounded-xl border border-brand-brown/5">
                      <div className="text-right">
                        <p className="text-[7px] font-black uppercase text-stone-400">Balance</p>
                        <p className="text-xs font-black text-indigo-600">🪙 {customer?.minCoins || 0}</p>
                      </div>
                      <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-base shadow-lg">🎁</div>
                   </div>
                </div>

                {/* Coupon Redemption Area */}
                {canRedeemWelcomeCoupon && !hasAppliedWelcomeDiscount && (
                  <div className="bg-brand-red border-2 border-brand-red/10 p-5 rounded-2xl animate-in zoom-in-95 duration-500 shadow-xl shadow-red-900/20">
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <div className="bg-white/20 text-white p-3 rounded-xl backdrop-blur-sm">
                          <Star className="w-5 h-5 fill-current" />
                        </div>
                        <div>
                          <p className="text-[11px] font-black text-white uppercase tracking-[0.1em]">Verified Welcome Reward</p>
                          <p className="text-[12px] font-black text-white px-2 py-0.5 bg-black/20 rounded-md inline-block mt-1">{customer?.welcomeCouponCode}</p>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => {
                          const subtotal = orderItems.reduce((acc, i) => acc + (i.price > 0 ? i.price * i.quantity : 0), 0);
                          if (subtotal > 0) {
                             onAddItem([{
                               id: 'welcome-discount',
                               menuItemId: 'discount',
                               name: '15% Welcome Discount',
                               price: -(subtotal * 0.15),
                               quantity: 1,
                               cost: 0
                             }]);
                          }
                        }}
                        className="bg-white text-brand-red px-6 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-stone-100 active:scale-95 transition-all shadow-lg flex items-center gap-3 group"
                      >
                        Apply 15% Discount
                        <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Active Rewards List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-brand-stone pb-1">
                       <h3 className="text-[9px] font-black uppercase text-brand-red tracking-widest flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-brand-red animate-pulse"></span>
                         Redeemed
                       </h3>
                       <span className="text-[8px] font-bold text-stone-400">{orderItems.filter(item => item.paidWithCoins).length} Items</span>
                    </div>
                    
                    <div className="space-y-2 max-h-[320px] overflow-y-auto no-scrollbar pr-1">
                      {orderItems.filter(item => item.paidWithCoins).length > 0 ? (
                        orderItems.filter(item => item.paidWithCoins).map(item => (
                          <div key={item.id} className="bg-brand-stone p-3 rounded-xl flex items-center justify-between group">
                            <div className="flex items-center gap-3 min-w-0">
                               <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-base shadow-sm">🎁</div>
                               <div className="min-w-0">
                                 <p className="text-[9px] font-black text-brand-brown uppercase truncate">{item.name}</p>
                                 <p className="text-[7px] font-bold text-stone-400 uppercase tracking-widest leading-none mt-1">{item.coinsPrice} Coins</p>
                               </div>
                            </div>
                            <button 
                              onClick={() => handleRemoveItem(item.id)}
                              className="w-8 h-8 flex items-center justify-center text-brand-red hover:bg-brand-red hover:text-white rounded-lg transition-all shadow-sm"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 bg-brand-stone/30 rounded-2xl border border-dashed border-brand-stone flex flex-col items-center justify-center text-stone-300">
                          <p className="text-[8px] font-black uppercase tracking-[0.1em]">No rewards</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Available Rewards List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-brand-stone pb-1">
                       <h3 className="text-[9px] font-black uppercase text-indigo-600 tracking-widest">To Unlock</h3>
                    </div>
                    
                    <div className="space-y-2 max-h-[320px] overflow-y-auto no-scrollbar pr-1">
                      {eligibleRewards.length > 0 ? (
                        eligibleRewards.map((reward) => (
                          <button 
                            key={`${reward.menuItem.id}-${reward.prep}-${reward.size}`}
                            onClick={() => handleAddReward(reward)}
                            className="w-full bg-white border border-brand-stone rounded-xl p-3 flex items-center justify-between hover:border-indigo-600 transition-all group"
                          >
                            <div className="flex items-center gap-3 text-left">
                               <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">✨</div>
                               <div>
                                 <p className="text-[9px] font-black uppercase text-brand-brown">{reward.menuItem.name}</p>
                                 <p className="text-[7px] font-bold text-stone-400 uppercase tracking-widest leading-none mt-1">{reward.size}</p>
                               </div>
                            </div>
                            <div className="bg-indigo-600 text-white px-2 py-1 rounded-lg text-[8px] font-black shadow-md">
                               🪙 {reward.coins}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-6 bg-brand-stone/30 rounded-2xl text-center">
                          <p className="text-[8px] font-black text-stone-400 uppercase tracking-[0.1em]">No offers</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Section */}
              <div className="space-y-2 mt-auto pt-6">
                <div className="border-b border-brand-stone pb-1">
                   <h3 className="text-[9px] font-black uppercase text-stone-400 tracking-widest">Finalization</h3>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-brand-stone p-3 rounded-xl">
                        <p className="text-[8px] font-black text-stone-400 uppercase mb-0.5">Payable</p>
                        <p className="text-lg font-black text-brand-brown leading-tight">₹{totalCashValue}</p>
                    </div>
                    <div className="bg-brand-stone p-3 rounded-xl">
                        <p className="text-[8px] font-black text-stone-400 uppercase mb-0.5">Redeemed</p>
                        <div className="flex items-end gap-1">
                          <span className={`text-lg font-black leading-tight ${isRedemptionOverLimit || !hasSufficientCoins ? 'text-brand-red' : 'text-indigo-600'}`}>
                            {coinsRequired}
                          </span>
                          {!hasSufficientCoins && (
                            <span className="text-[7px] font-black text-brand-red uppercase mb-0.5">Low</span>
                          )}
                        </div>
                    </div>
                    <div className="bg-brand-stone p-3 rounded-xl col-span-2 flex items-center justify-between">
                        <p className="text-[8px] font-black text-stone-400 uppercase">Coins Earned</p>
                        <p className="text-lg font-black text-mountain-green leading-tight">+{earnedCoins}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Select Method</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Cash', 'UPI', 'Card'] as PaymentMethod[]).map(method => (
                        <button
                          key={method}
                          onClick={() => setSelectedMethod(method)}
                          className={`py-4 rounded-2xl flex flex-col items-center gap-1 transition-all border-2 ${selectedMethod === method ? 'bg-brand-brown border-brand-brown text-brand-yellow shadow-lg scale-105' : 'bg-brand-stone border-transparent text-brand-brown/40 hover:bg-brand-stone/60'}`}
                        >
                          <span className="text-xl">
                            {method === 'Cash' && '💵'}
                            {method === 'UPI' && '📱'}
                            {method === 'Card' && '💳'}
                          </span>
                          <span className="text-[8px] font-black uppercase tracking-wider">{method}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3">
                  <button 
                      onClick={() => {
                        if (coinsRequired > 0 && !hasSufficientCoins) {
                            return;
                        }
                        if (isRedemptionOverLimit) {
                            return;
                        }
                        selectedMethod && onConfirm(selectedMethod, false);
                      }} 
                      disabled={isSaving || !selectedMethod || isRedemptionOverLimit || !hasSufficientCoins}
                      className="bg-brand-brown text-brand-yellow font-black py-4 rounded-2xl transition-all shadow-lg text-[9px] uppercase tracking-[0.2em] disabled:opacity-30 border-2 border-brand-brown"
                  >
                      Confirm System Print
                  </button>
                  
                  <button 
                    onClick={() => handleWhatsAppSend(false)}
                    disabled={isSaving || !selectedMethod || isRedemptionOverLimit || !hasSufficientCoins}
                    className="bg-white text-brand-brown font-black py-4 rounded-2xl transition-all shadow-lg text-[9px] uppercase tracking-[0.2em] disabled:opacity-30 border-2 border-brand-brown"
                  >
                    Confirm & WhatsApp
                  </button>

                  <button 
                    onClick={() => {
                      if (isRedemptionOverLimit || !hasSufficientCoins) return;
                      selectedMethod && onConfirm(selectedMethod, true);
                    }} 
                    disabled={isSaving || !selectedMethod || isRedemptionOverLimit || !isPrinterConnected || !hasSufficientCoins}
                    className="bg-mountain-green text-white font-black py-4 rounded-2xl transition-all shadow-lg text-[9px] uppercase tracking-[0.2em] disabled:opacity-30 border-2 border-mountain-green"
                  >
                    Confirm & BT Print
                  </button>

                  <button 
                    onClick={() => handleWhatsAppSend(true)}
                    disabled={isSaving || !selectedMethod || isRedemptionOverLimit || !isPrinterConnected || !hasSufficientCoins}
                    className="bg-brand-red text-white font-black py-4 rounded-2xl transition-all shadow-2xl scale-105 ring-4 ring-brand-red/20 text-[9px] uppercase tracking-[0.2em] disabled:opacity-30 border-2 border-brand-red animate-pulse"
                  >
                    🚀 WhatsApp + BT Print
                  </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* DEDICATED PRINT PORTAL: This instance is for the browser's print renderer */}
      {printRoot && createPortal(
        <PrintReceipt 
          orderItems={orderItems} 
          billNumber={billNumber} 
          branchName={branchName} 
          orderType={orderType}
          customerPhone={customerPhone}
          customerInitialBalance={customer?.minCoins}
          customerFinalBalance={finalBalance}
          earnedCoinsValue={earnedCoins}
          welcomeCouponCode={(customer?.totalOrders === 0 || !customer) ? customer?.welcomeCouponCode : undefined}
        />,
        printRoot
      )}
    </>
  );
};

export default BillPreviewModal;
