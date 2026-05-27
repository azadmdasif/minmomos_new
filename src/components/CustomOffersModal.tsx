import React, { useState, useEffect } from 'react';
import { MenuItem, CustomOffer } from '../types';
import { 
  getLocalCustomOffers, 
  saveLocalCustomOffers, 
  addCustomOffer, 
  toggleCustomOfferStatus, 
  deleteCustomOffer, 
  fetchCustomOffersFromSupabase 
} from '../utils/marketingStorage';
import { X, Plus, Trash2, CheckCircle, HelpCircle, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';

interface CustomOffersModalProps {
  isOpen: boolean;
  onClose: () => void;
  menuItems: MenuItem[];
}

export const CustomOffersModal: React.FC<CustomOffersModalProps> = ({ isOpen, onClose, menuItems }) => {
  const [offers, setOffers] = useState<CustomOffer[]>([]);
  const [name, setName] = useState('');
  const [minOrderValue, setMinOrderValue] = useState('');
  const [offerType, setOfferType] = useState<'free_item' | 'discount'>('free_item');
  const [freeItemName, setFreeItemName] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'flat'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [targetGroup, setTargetGroup] = useState<CustomOffer['targetGroup']>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Uniquely collect all item names across size preparations so that we can list them perfectly
  const availableItemNames = React.useMemo(() => {
    const names = new Set<string>();
    menuItems.forEach(item => {
      if (item.name) names.add(item.name);
    });
    return Array.from(names).sort();
  }, [menuItems]);

  const loadOffers = async () => {
    // 1. Get cached local state
    setOffers(getLocalCustomOffers());
    
    // 2. Refresh from Supabase
    try {
      const dbOffers = await fetchCustomOffersFromSupabase();
      if (dbOffers && dbOffers.length > 0) {
        saveLocalCustomOffers(dbOffers);
        setOffers(dbOffers);
      }
    } catch (e) {
      console.warn("Could not load backend offers, online fallback in execution", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadOffers();
      // Set default selected free item if loaded
      if (availableItemNames.length > 0) {
        setFreeItemName(availableItemNames[0]);
      }
    }
    // Clean states
    setErrorMsg('');
    setSuccessMsg('');
    setDeletingId(null);
  }, [isOpen, availableItemNames]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Offer Name is required.');
      return;
    }

    const minVal = parseFloat(minOrderValue);
    if (isNaN(minVal) || minVal <= 0) {
      setErrorMsg('Please enter a valid numeric minimum order amount above zero.');
      return;
    }

    if (offerType === 'free_item' && !freeItemName) {
      setErrorMsg('Please select a free item as the promotional gift.');
      return;
    }

    let discVal = 0;
    if (offerType === 'discount') {
      discVal = parseFloat(discountValue);
      if (isNaN(discVal) || discVal <= 0) {
        setErrorMsg('Please enter a valid numeric discount amount.');
        return;
      }
      if (discountType === 'percentage' && discVal > 100) {
        setErrorMsg('Percentage discount cannot exceed 100%.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const newOffer = await addCustomOffer(
        name.trim(), 
        minVal, 
        offerType === 'free_item' ? freeItemName : undefined, 
        targetGroup,
        offerType,
        offerType === 'discount' ? discountType : undefined,
        offerType === 'discount' ? discVal : undefined
      );

      setOffers(prev => [...prev, newOffer]);
      
      // Reset form
      setName('');
      setMinOrderValue('');
      if (availableItemNames.length > 0) {
        setFreeItemName(availableItemNames[0]);
      }
      setDiscountValue('');
      setTargetGroup('all');
      setSuccessMsg('Custom checkout offer added successfully!');
      
      // Auto fade success msg
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save offer. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const updated = await toggleCustomOfferStatus(id);
      setOffers(updated);
    } catch {
      alert("Failed to toggle offer status.");
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      return;
    }
    try {
      const updated = await deleteCustomOffer(id);
      setOffers(updated);
      setDeletingId(null);
    } catch {
      setErrorMsg("Failed to delete custom offer.");
    }
  };

  const getTargetGroupLabel = (group: string) => {
    switch(group) {
      case 'L0': return 'New Customers (L0 - 0 orders)';
      case 'L1': return '1st Order Customers (L1 - 1 order)';
      case 'L2': return '2nd Order Customers (L2 - 2 orders)';
      case 'L3': return '3rd Order Customers (L3 - 3 orders)';
      case 'L4': return '4th Order Customers (L4 - 4 orders)';
      case 'L5': return 'Brand Advocates (L5 - 5+ orders)';
      default: return 'All Customers';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-brand-cream border border-brand-brown/15 rounded-3xl w-full max-w-4xl shadow-2xl h-[90vh] md:h-auto md:max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-6 bg-brand-brown border-b border-brand-brown/10 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-xl font-black text-brand-yellow uppercase tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-yellow" />
              Manage Custom Checkout Offers
            </h3>
            <p className="text-[10px] uppercase font-black text-white/40 tracking-[0.2em] mt-1">Configure Free Promotional Gifts or discounts Triggered at Settlement</p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="w-10 h-10 bg-white/10 hover:bg-white/20 duration-250 rounded-full flex items-center justify-center text-white transition-colors border border-white/5 active:scale-95 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6">
          
          {/* Create Offer Form */}
          <div className="w-full md:w-[350px] shrink-0 bg-white p-5 rounded-2xl border border-stone-200 flex flex-col">
            <h4 className="text-xs font-black text-brand-brown uppercase tracking-widest mb-4 flex items-center gap-1.5 border-b border-stone-100 pb-2">
              <Plus className="w-4 h-4 text-brand-red" />
              Create Checkout Offer
            </h4>

            <form onSubmit={handleSubmit} className="space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                {/* Offer Name */}
                <div>
                  <label className="block text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1.5">Offer Title (Display Name)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-11 p-3 rounded-xl border border-stone-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-stone-400"
                    placeholder="e.g. Weekend Momo Mania"
                  />
                </div>

                {/* Min Order Value */}
                <div>
                  <label className="block text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1.5">Min Order Value (₹)</label>
                  <input
                    type="number"
                    value={minOrderValue}
                    onChange={(e) => setMinOrderValue(e.target.value)}
                    className="w-full h-11 p-3 rounded-xl border border-stone-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-stone-400"
                    placeholder="e.g. 299"
                  />
                </div>

                {/* Offer Reward Type */}
                <div>
                  <label className="block text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1.5">Offer Reward Type</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setOfferType('free_item')}
                      className={`h-10 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        offerType === 'free_item'
                          ? 'bg-rose-550 border-rose-600 text-white shadow-sm'
                          : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                      }`}
                      style={{ backgroundColor: offerType === 'free_item' ? '#e11d48' : undefined }}
                    >
                      🎁 Free Item
                    </button>
                    <button
                      type="button"
                      onClick={() => setOfferType('discount')}
                      className={`h-10 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        offerType === 'discount'
                          ? 'bg-indigo-550 border-indigo-600 text-white shadow-sm'
                          : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                      }`}
                      style={{ backgroundColor: offerType === 'discount' ? '#4f46e5' : undefined }}
                    >
                      🏷️ Discount
                    </button>
                  </div>
                </div>

                {/* Free Gift Selector */}
                {offerType === 'free_item' && (
                  <div>
                    <label className="block text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1.5">Select Free Gift Item</label>
                    <select
                      value={freeItemName}
                      onChange={(e) => setFreeItemName(e.target.value)}
                      className="w-full h-11 p-3 rounded-xl border border-stone-200 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                    >
                      {availableItemNames.length === 0 ? (
                        <option value="">No items available</option>
                      ) : (
                        availableItemNames.map(itemName => (
                          <option key={itemName} value={itemName}>{itemName}</option>
                        ))
                      )}
                    </select>
                  </div>
                )}

                {/* Discount options */}
                {offerType === 'discount' && (
                  <div className="grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div>
                      <label className="block text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1.5">Discount Basis</label>
                      <select
                        value={discountType}
                        onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'flat')}
                        className="w-full h-11 p-3 rounded-xl border border-stone-200 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer"
                      >
                        <option value="percentage">Percentage (%)</option>
                        <option value="flat">Flat Cash (₹)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1.5 font-sans leading-none">
                        {discountType === 'percentage' ? 'Rate (% Off)' : 'Cash (₹ Off)'}
                      </label>
                      <input
                        type="number"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        className="w-full h-11 p-3 rounded-xl border border-stone-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-stone-400"
                        placeholder={discountType === 'percentage' ? 'e.g. 10' : 'e.g. 50'}
                      />
                    </div>
                  </div>
                )}

                {/* Target Cohort Group */}
                <div>
                  <label className="block text-[8px] font-black text-stone-400 uppercase tracking-widest mb-1.5">Target Customer Cohort</label>
                  <select
                    value={targetGroup}
                    onChange={(e) => setTargetGroup(e.target.value as CustomOffer['targetGroup'])}
                    className="w-full h-11 p-3 rounded-xl border border-stone-200 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer"
                  >
                    <option value="all">Every Customer (All Stages)</option>
                    <option value="L0">New Customers (L0 - 0 past orders)</option>
                    <option value="L1">1st Order Customers (L1 - 1 past order)</option>
                    <option value="L2">2nd Order Customers (L2 Only)</option>
                    <option value="L3">3rd Order Customers (L3 Only)</option>
                    <option value="L4">4th Order Customers (L4 Only)</option>
                    <option value="L5">Brand Advocates (L5+ Only)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-stone-100 mt-4 space-y-3">
                {errorMsg && (
                  <div className="p-3 rounded-xl bg-rose-50 text-[10px] font-semibold text-rose-700 leading-snug flex items-center gap-1.5 border border-rose-100">
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                {successMsg && (
                  <div className="p-3 rounded-xl bg-emerald-50 text-[10px] font-semibold text-emerald-700 leading-snug flex items-center gap-1.5 border border-emerald-100">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 bg-rose-600 hover:bg-rose-700 disabled:opacity-55 duration-200 text-white font-black text-[11px] uppercase tracking-wider rounded-xl transition-all border border-rose-700 shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  {isSubmitting ? 'Saving' : 'Save Custom Offer'}
                </button>
              </div>
            </form>
          </div>

          {/* List Of Offers */}
          <div className="flex-1 bg-white p-5 rounded-2xl border border-stone-200 flex flex-col overflow-hidden">
            <h4 className="text-xs font-black text-brand-brown uppercase tracking-widest mb-4 flex items-center gap-1.5 border-b border-stone-100 pb-2 justify-between">
              <span>📋 Configured Promo Rules ({offers.length})</span>
              <span className="text-[9px] uppercase font-black text-indigo-600 bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-md">Live Checkout Triggers</span>
            </h4>

            {offers.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 py-16 text-center text-stone-400">
                <HelpCircle className="w-12 h-12 mb-3 text-stone-300 stroke-[1.5]" />
                <h5 className="text-[13px] font-bold text-stone-600">No Custom Checkout Offers Configured</h5>
                <p className="text-[10.5px] text-stone-400 max-w-sm mt-1 leading-relaxed">
                  Generate rules in the left panel to trigger automatic free gifts or discount coupons on the billing settlement cart for matching customer cohorts.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {offers.map(offer => {
                  const giftMatch = offer.freeItemName ? menuItems.find(m => m.name === offer.freeItemName) : undefined;
                  const isFallbackImg = !giftMatch?.image;
                  const isDiscount = offer.offerType === 'discount';

                  return (
                    <div 
                      key={offer.id} 
                      className={`p-4 rounded-xl border transition-all duration-200 flex items-center justify-between gap-4 ${
                        offer.isActive 
                          ? 'bg-white border-stone-200 hover:shadow-md' 
                          : 'bg-stone-50 border-stone-150 opacity-65'
                      }`}
                    >
                      {/* Left: Gift Thumbnail & Info */}
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-lg border overflow-hidden flex items-center justify-center shrink-0 ${
                          isDiscount ? 'bg-indigo-50 border-indigo-200/50' : 'bg-stone-100 border-stone-200/60'
                        }`}>
                          {isDiscount ? (
                            <span className="text-lg">🏷️</span>
                          ) : isFallbackImg ? (
                            <span className="text-lg">🎁</span>
                          ) : (
                            <img src={giftMatch?.image} alt={offer.freeItemName} className="w-full h-full object-cover" />
                          )}
                        </div>

                        <div className="flex flex-col">
                          <h5 className="text-[12px] font-black text-brand-brown leading-none flex items-center gap-1.5 mb-1.5 uppercase">
                            {offer.name}
                            {!offer.isActive && (
                              <span className="text-[8px] bg-stone-200 text-stone-600 px-1.5 py-0.2 rounded-sm border border-stone-300">DRAFT</span>
                            )}
                            {isDiscount && (
                              <span className="text-[8px] bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded-sm border border-indigo-200 font-black">DISCOUNT</span>
                            )}
                          </h5>
                          <p className="text-[10px] text-stone-500 font-semibold leading-relaxed">
                            {isDiscount ? (
                              <>
                                Order above <strong className="text-rose-600">₹{offer.minOrderValue}</strong> triggers {offer.discountType === 'percentage' ? `${offer.discountValue}%` : `₹${offer.discountValue}`} discount.
                              </>
                            ) : (
                              <>
                                Order above <strong className="text-rose-600">₹{offer.minOrderValue}</strong> triggers free <strong className="text-indigo-600">{offer.freeItemName}</strong>.
                              </>
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-black uppercase text-stone-400 bg-stone-100 border border-stone-150 p-1 px-1.5 leading-none rounded-md">
                              👥 {getTargetGroupLabel(offer.targetGroup)}
                            </span>
                            <span className="text-[8px] text-stone-300 font-medium">Added {new Date(offer.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-3 shrink-0">
                        {deletingId === offer.id ? (
                          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-3 duration-200">
                            <button
                              type="button"
                              onClick={() => setDeletingId(null)}
                              className="px-2 py-1 text-[10px] font-bold text-stone-500 hover:bg-stone-150 rounded-lg border border-stone-200 duration-150"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(offer.id)}
                              className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded-lg shadow-sm leading-none flex items-center gap-1 active:scale-95 transition-all animate-pulse"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Confirm
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggle(offer.id)}
                              className="text-stone-400 hover:text-brand-brown focus:outline-none transition-colors duration-200 cursor-pointer"
                            >
                              {offer.isActive ? (
                                <ToggleRight className="w-8 h-8 text-mountain-green fill-mountain-green/10" />
                              ) : (
                                <ToggleLeft className="w-8 h-8 text-stone-450" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(offer.id)}
                              className="w-8 h-8 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 flex items-center justify-center border border-stone-100 transition-colors focus:outline-none cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
