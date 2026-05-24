import React, { useState, useEffect, useMemo } from 'react';
import { fetchCustomers, fetchMenuItems } from '../utils/storage';
import { Customer, MenuItem } from '../types';
import { 
  getMarketingCoupons, 
  addMarketingCoupon,
  getLastReminderTime,
  logReminderSent,
  clearReminderLog
} from '../utils/marketingStorage';
import { 
  Users, 
  UserMinus, 
  Coins, 
  MessageCircle, 
  Search, 
  Gift, 
  HelpCircle, 
  ExternalLink,
  Clock,
  Sparkles,
  RefreshCw,
  Bell,
  CheckCircle2,
  RefreshCcw
} from 'lucide-react';

interface InactiveCustomerInfo {
  customer: Customer;
  daysSinceLastVisit: number;
  phone: string;
  name: string;
}

interface MinCoinsCustomerInfo {
  customer: Customer;
  phone: string;
  name: string;
  coins: number;
  redeemableItems: Array<{ name: string; coins: number }>;
}

interface CampaignQueueItem {
  customer: Customer;
  name: string;
  phone: string;
  message: string;
  daysSinceLastVisit?: number;
  coins?: number;
  redeemableItems?: Array<{ name: string; coins: number }>;
}

export const Marketing: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'inactive' | 'mincoins'>('inactive');
  
  // Sorting configurations
  const [inactiveSortField, setInactiveSortField] = useState<'ltv' | 'orders' | 'inactivity'>('inactivity');
  const [inactiveSortOrder, setInactiveSortOrder] = useState<'asc' | 'desc'>('desc');

  const [minCoinsSortField, setMinCoinsSortField] = useState<'ltv' | 'orders' | 'coins'>('coins');
  const [minCoinsSortOrder, setMinCoinsSortOrder] = useState<'asc' | 'desc'>('desc');

  // Reload trigger
  const [reloadKey, setReloadKey] = useState(0);
  
  // Custom interactive Campaign queue states for sequential dispatcher (Safe from Chrome pop-up block)
  const [campaignQueue, setCampaignQueue] = useState<CampaignQueueItem[]>([]);
  const [campaignIndex, setCampaignIndex] = useState<number>(0);
  const [campaignType, setCampaignType] = useState<'inactive' | 'mincoins' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [loadedCusts, menuResponse] = await Promise.all([
          fetchCustomers(),
          fetchMenuItems()
        ]);
        setCustomers(loadedCusts);
        setMenuItems(menuResponse.data || []);
      } catch (e) {
        console.error('Failed to load marketing data', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [reloadKey]);

  // Get list of redeemable rewards configured in menu items
  const allRewards = useMemo(() => {
    const rewards: Array<{ name: string; coins: number }> = [];
    menuItems.forEach(item => {
      if (item.minCoinsPrices) {
        Object.entries(item.minCoinsPrices).forEach(([prep, sizes]) => {
          if (sizes) {
            Object.entries(sizes).forEach(([size, coins]) => {
              if (typeof coins === 'number' && coins > 0) {
                const sizeLabel = size !== 'Regular' ? ` ${size}` : '';
                rewards.push({
                   name: `${item.name} (${prep}${sizeLabel})`,
                   coins: coins
                });
              }
            });
          }
        });
      }
    });
    return rewards.sort((a, b) => a.coins - b.coins);
  }, [menuItems]);

  // Compute customers qualifying for redemption reminder (highest priority campaign list)
  const minCoinsCustomers = useMemo(() => {
    if (allRewards.length === 0) return [];

    const list: MinCoinsCustomerInfo[] = [];
    const minCoinsPrice = allRewards[0].coins; 

    customers.forEach(c => {
      const coins = c.minCoins || 0;
      if (coins >= minCoinsPrice) {
        const affordable = allRewards.filter(r => r.coins <= coins);
        
        list.push({
          customer: c,
          phone: c.phone,
          name: c.name || 'Valued Customer',
          coins: coins,
          redeemableItems: affordable
        });
      }
    });

    // Custom sorting application
    return list.sort((a, b) => {
      let comparison = 0;
      if (minCoinsSortField === 'ltv') {
        comparison = a.customer.totalSpent - b.customer.totalSpent;
      } else if (minCoinsSortField === 'orders') {
        comparison = a.customer.totalOrders - b.customer.totalOrders;
      } else {
        // default: coins balance
        comparison = a.coins - b.coins;
      }
      return minCoinsSortOrder === 'desc' ? -comparison : comparison;
    });
  }, [customers, allRewards, minCoinsSortField, minCoinsSortOrder]);

  // Compute inactive 7 days customers (excluding any customer who is eligible for the higher-priority mincoin redemption list)
  const inactiveCustomers = useMemo(() => {
    const now = new Date();
    const list: InactiveCustomerInfo[] = [];

    // Create a Set of mincoins-eligible customer IDs to exclude them from the inactivity campaign
    const minCoinsEligibleIds = new Set(minCoinsCustomers.map(mc => mc.customer.id));

    customers.forEach(c => {
      // Exclude from inactivity list if the customer is already active in the higher-priority mincoins redemption list
      if (minCoinsEligibleIds.has(c.id)) return;

      if (!c.lastVisit) return;
      const lastVisitDate = new Date(c.lastVisit);
      const diffTime = now.getTime() - lastVisitDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays >= 7) {
        list.push({
          customer: c,
          daysSinceLastVisit: diffDays,
          phone: c.phone,
          name: c.name || 'Valued Customer'
        });
      }
    });

    // Custom sorting application
    return list.sort((a, b) => {
      let comparison = 0;
      if (inactiveSortField === 'ltv') {
        comparison = a.customer.totalSpent - b.customer.totalSpent;
      } else if (inactiveSortField === 'orders') {
        comparison = a.customer.totalOrders - b.customer.totalOrders;
      } else {
        // default: inactivity (daysSinceLastVisit)
        comparison = a.daysSinceLastVisit - b.daysSinceLastVisit;
      }
      return inactiveSortOrder === 'desc' ? -comparison : comparison;
    });
  }, [customers, inactiveSortField, inactiveSortOrder, minCoinsCustomers]);

  // Filter lists by search query
  const filteredInactive = useMemo(() => {
    if (!searchTerm) return inactiveCustomers;
    const term = searchTerm.toLowerCase();
    return inactiveCustomers.filter(item => 
      item.name.toLowerCase().includes(term) || 
      item.phone.includes(term)
    );
  }, [inactiveCustomers, searchTerm]);

  const filteredMinCoins = useMemo(() => {
    if (!searchTerm) return minCoinsCustomers;
    const term = searchTerm.toLowerCase();
    return minCoinsCustomers.filter(item => 
      item.name.toLowerCase().includes(term) || 
      item.phone.includes(term)
    );
  }, [minCoinsCustomers, searchTerm]);

  // Messages builder payloads
  const createInactiveMessage = (custName: string, couponCode: string, expiryStr: string, daysInactive: number) => {
    return `Hey ${custName}! \uD83C\uDF38\n\nWe missed having you at MinMomos! It's been ${daysInactive} days since your last order.\n\nHere is a special token of our love: Get a *FREE Virgin Mojito* \uD83C\uDF79 on your order above *\u20B999*!\n\nYour unique gift code: *${couponCode}*\nValid only for *48 hours* (expires on ${expiryStr}).\n\nCome swing by and indulge! \u2728\n\n_MinMomos Loyalty Desk_`;
  };

  const createMinCoinsMessage = (custName: string, coins: number, items: Array<{ name: string; coins: number }>) => {
    const listText = items.slice(0, 3).map(i => `\u2022 *${i.name}* (for ${i.coins} coins)`).join('\n');
    const extraText = items.length > 3 ? `\n...and ${items.length - 3} more delicious options!` : '';
    
    return `Hi ${custName}! \uD83C\uDF1F\n\nYou have an impressive balance of *${coins} MinCoins* waiting to be claimed at MinMomos!\n\nDid you know you can unlock absolutely FREE treats with your coins? Based on your balance, you're eligible for:\n\n${listText}${extraText}\n\nDon't let your rewards sit! Visit us today and let the cashier redeem your free feast. \uD83D\uDE0B\n\nSee you soon!\n\n_MinMomos Team_`;
  };

  // Cooldown left computation helper
  const computeCooldownLeftDays = (phone: string, type: 'inactive' | 'mincoins'): number => {
    const lastSent = getLastReminderTime(phone, type);
    if (!lastSent) return 0;
    const elapsedMs = new Date().getTime() - new Date(lastSent).getTime();
    const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
    const left = 7 - elapsedDays;
    return left > 0 ? left : 0;
  };

  // Individual dispatchers
  const handleSendInactive = (info: InactiveCustomerInfo) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setTimeout(() => setIsProcessing(false), 1200);

    const cooldownDays = computeCooldownLeftDays(info.phone, 'inactive');
    if (cooldownDays > 0) {
      alert(`This customer had a coupon sent recently. Please wait ${Math.ceil(cooldownDays)} more days to send another.`);
      return;
    }

    const coupon = addMarketingCoupon(info.phone, info.name);
    const expiryStr = new Date(coupon.expiresAt).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const message = createInactiveMessage(info.name, coupon.couponCode, expiryStr, info.daysSinceLastVisit);
    
    // Register reminder logs to activate cooldown
    logReminderSent(info.phone, 'inactive');

    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${info.phone.replace(/\D/g, '')}?text=${encoded}`;
    
    window.open(url, '_blank');
    setReloadKey(prev => prev + 1); 
  };

  const handleSendMinCoins = (info: MinCoinsCustomerInfo) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setTimeout(() => setIsProcessing(false), 1200);

    const cooldownDays = computeCooldownLeftDays(info.phone, 'mincoins');
    if (cooldownDays > 0) {
      alert(`This customer was notified recently. Please wait ${Math.ceil(cooldownDays)} more days to send another notification.`);
      return;
    }

    const message = createMinCoinsMessage(info.name, info.coins, info.redeemableItems);
    
    // Register reminder logs to activate cooldown
    logReminderSent(info.phone, 'mincoins');

    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${info.phone.replace(/\D/g, '')}?text=${encoded}`;
    
    window.open(url, '_blank');
    setReloadKey(prev => prev + 1);
  };

  // Bulk sender setup triggers: Loads the Chrome-bypass sequential campaign helper
  const handleBulkSendInactive = () => {
    // Select all users in filter that aren't on 7-day cooldown
    const queue: CampaignQueueItem[] = [];
    filteredInactive.forEach(item => {
      const cd = computeCooldownLeftDays(item.phone, 'inactive');
      if (cd <= 0) {
        // Use placeholder message preview
        const msgPreview = createInactiveMessage(item.name, 'MOJITO-XXXX-CODE', '48 hours from dispatch', item.daysSinceLastVisit);
        queue.push({
          customer: item.customer,
          name: item.name,
          phone: item.phone,
          message: msgPreview,
          daysSinceLastVisit: item.daysSinceLastVisit
        });
      }
    });

    if (queue.length === 0) {
      alert("No pending customers! All selected customers are currently active or on 7-day cooldown.");
      return;
    }

    setCampaignQueue(queue);
    setCampaignIndex(0);
    setCampaignType('inactive');
  };

  const handleBulkSendMinCoins = () => {
    const queue: CampaignQueueItem[] = [];
    filteredMinCoins.forEach(item => {
      const cd = computeCooldownLeftDays(item.phone, 'mincoins');
      if (cd <= 0) {
        const msg = createMinCoinsMessage(item.name, item.coins, item.redeemableItems);
        queue.push({
          customer: item.customer,
          name: item.name,
          phone: item.phone,
          message: msg,
          coins: item.coins,
          redeemableItems: item.redeemableItems
        });
      }
    });

    if (queue.length === 0) {
      alert("No pending customers! All qualified customers are already notified and under 7-day cooldown.");
      return;
    }

    setCampaignQueue(queue);
    setCampaignIndex(0);
    setCampaignType('mincoins');
  };

  // Campaign sequence wizard execution handlers
  const handleCampaignSkip = () => {
    setCampaignIndex(prev => prev + 1);
  };

  const handleCampaignSendNext = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setTimeout(() => setIsProcessing(false), 1200);

    const current = campaignQueue[campaignIndex];
    let actualMessage = current.message;

    if (campaignType === 'inactive') {
      // Create real unique coupon with logic
      const coupon = addMarketingCoupon(current.phone, current.name);
      const expiryStr = new Date(coupon.expiresAt).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
      actualMessage = createInactiveMessage(
        current.name, 
        coupon.couponCode, 
        expiryStr, 
        current.daysSinceLastVisit || 7
      );
    }

    // Register reminder logs activity
    if (campaignType) {
      logReminderSent(current.phone, campaignType);
    }

    // Direct WhatsApp web open link
    const encoded = encodeURIComponent(actualMessage);
    const url = `https://wa.me/${current.phone.replace(/\D/g, '')}?text=${encoded}`;
    window.open(url, '_blank');

    // Proceed to next customer in the campaign
    setCampaignIndex(prev => prev + 1);
  };

  const resetCampaign = () => {
    setCampaignQueue([]);
    setCampaignIndex(0);
    setCampaignType(null);
    setReloadKey(prev => prev + 1); // trigger list refresh
  };

  // Cycle sorting for elements
  const handleInactiveSort = (field: 'ltv' | 'orders' | 'inactivity') => {
    if (inactiveSortField === field) {
      // toggle ascending/descending direction
      setInactiveSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setInactiveSortField(field);
      setInactiveSortOrder('desc'); // default highest first
    }
  };

  const handleMinCoinsSort = (field: 'ltv' | 'orders' | 'coins') => {
    if (minCoinsSortField === field) {
      setMinCoinsSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setMinCoinsSortField(field);
      setMinCoinsSortOrder('desc');
    }
  };

  // Quick total statistics from raw
  const totalStats = useMemo(() => {
    const readyInactiveCount = inactiveCustomers.filter(i => computeCooldownLeftDays(i.phone, 'inactive') <= 0).length;
    const readyMinCoinsCount = minCoinsCustomers.filter(m => computeCooldownLeftDays(m.phone, 'mincoins') <= 0).length;

    return {
      allCount: customers.length,
      inactiveActiveQueue: readyInactiveCount,
      inactiveTotal: inactiveCustomers.length,
      redeemActiveQueue: readyMinCoinsCount,
      redeemTotal: minCoinsCustomers.length
    };
  }, [customers, inactiveCustomers, minCoinsCustomers]);

  return (
    <div className="flex flex-col h-full bg-brand-cream/40 overflow-hidden relative">
      {/* Top Header Section */}
      <div className="p-6 lg:p-8 bg-white border-b border-brand-brown/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-brand-yellow/15 text-brand-brown rounded-lg">
              <Sparkles className="w-5 h-5 text-brand-yellow fill-brand-yellow/20" />
            </span>
            <h1 className="text-xl lg:text-2xl font-black text-brand-brown uppercase tracking-tight italic">
              Marketing Campaign Hub
            </h1>
          </div>
          <p className="text-xs text-brand-brown/60 font-medium">
            Engage dormant customers, push custom coupon rewards, and maximize restaurant orders easily.
          </p>
        </div>

        {/* Sync Controls */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => setReloadKey(prev => prev + 1)}
            type="button"
            className="flex items-center gap-1.5 p-2.5 px-4 bg-brand-stone/15 text-brand-brown hover:bg-brand-stone/30 duration-200 transition-all rounded-xl text-[10px] font-black uppercase tracking-wider outline-none cursor-pointer"
            title="Reload customers database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Sync Customer Stats
          </button>
        </div>
      </div>

      {/* Chrome Pop-up Blocker Bypass Sequence Campaign Wizard Overlay */}
      {campaignQueue.length > 0 && (
        <div className="absolute inset-0 bg-brand-brown/85 backdrop-blur-md flex items-center justify-center z-50 p-6 animate-in fade-in duration-200">
          <div className="bg-brand-cream border-2 border-brand-yellow/30 p-8 rounded-3xl max-w-lg w-full text-brand-brown shadow-2xl relative">
            
            {/* Header info */}
            <div className="flex items-center gap-2 mb-5 border-b border-brand-brown/10 pb-4">
              <div className="p-1 px-2.5 bg-brand-yellow/10 text-brand-yellow font-black uppercase text-[10px] rounded">
                CRM Sequence
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider italic">
                  {campaignType === 'inactive' ? 'Dormant Customer Coupon Campaign' : 'Loyalty Reward Claims Campaign'}
                </h3>
                <p className="text-[9px] font-black uppercase tracking-wider text-brand-brown/50">
                  Secure Popup-Blocker Safe Dispatcher
                </p>
              </div>
            </div>

            {campaignIndex < campaignQueue.length ? (
              <div>
                {/* Visual Tracker Bar */}
                <div className="mb-5">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-brand-brown/60 mb-1.5">
                    <span>Sending: Client {campaignIndex + 1} of {campaignQueue.length}</span>
                    <span>{Math.round((campaignIndex / campaignQueue.length) * 100)}% Complete</span>
                  </div>
                  <div className="w-full bg-brand-stone/40 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-brand-yellow h-2.5 rounded-full duration-300 transition-all" 
                      style={{ width: `${(campaignIndex / campaignQueue.length) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* Customer Snapshot */}
                <div className="bg-white border border-brand-brown/10 p-4 rounded-2xl mb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] uppercase font-black tracking-widest text-brand-brown/40 block mb-0.5">Reciever</span>
                      <h4 className="text-base font-black text-brand-brown">{campaignQueue[campaignIndex].name}</h4>
                    </div>
                    <span className="font-mono text-xs text-zinc-500 font-bold bg-brand-stone/50 p-1 px-2.5 rounded-xl">
                      {campaignQueue[campaignIndex].phone}
                    </span>
                  </div>
                </div>

                {/* Dynamic Message Preview Window */}
                <p className="text-[10px] font-black uppercase text-brand-brown/50 tracking-widest mb-1 px-1">Message Preview</p>
                <div className="bg-brand-brown text-brand-cream/90 p-4 rounded-2xl text-[11px] font-mono leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto mb-6 border border-brand-yellow/10">
                  {campaignQueue[campaignIndex].message}
                </div>

                <div className="text-[9px] text-zinc-500 font-bold mb-5 italic text-center">
                  *(Note: unique voucher voucher code & 48hr exp are locked at moment of dispatch)*
                </div>

                {/* Actions grid */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleCampaignSkip}
                    className="p-3 bg-brand-stone/30 text-brand-brown hover:bg-brand-stone/50 duration-150 transition-all rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer outline-none font-bold"
                  >
                    Skip Customer
                  </button>
                  <button
                    type="button"
                    onClick={handleCampaignSendNext}
                    className="p-3 bg-rose-600 text-white hover:bg-rose-700 hover:shadow-lg active:scale-95 duration-150 transition-all rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer outline-none flex items-center justify-center gap-1.5"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" />
                    Send & Next 👉
                  </button>
                </div>

                <button
                  type="button"
                  onClick={resetCampaign}
                  className="w-full mt-4 text-center text-[9px] font-black uppercase tracking-widest text-brand-brown/40 hover:text-brand-red duration-150 transition-all"
                >
                  Cancel Campaign and Return
                </button>
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-emerald-500/15 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h4 className="text-lg font-black uppercase tracking-tight italic mb-1 text-emerald-700">Campaign Completed!</h4>
                <p className="text-xs text-brand-brown/70 font-semibold mb-6">
                  All active target customers have been dispatched or skipped successfully.
                </p>
                <button
                  type="button"
                  onClick={resetCampaign}
                  className="p-3 px-8 bg-brand-brown text-brand-cream hover:opacity-90 duration-150 transition-all rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer outline-none"
                >
                  Close Assistant
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Container Dashboard */}
      <div className="p-6 lg:p-8 flex-1 overflow-y-auto no-scrollbar pb-24">
        
        {/* Core Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-brand-brown/10 p-5 rounded-2xl flex items-center gap-4 shadow-sm hover:shadow duration-200">
            <div className="w-12 h-12 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-500">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-black tracking-wider text-brand-brown/40 mb-0.5">Total Registered Contacts</p>
              <h3 className="text-xl font-mono font-black text-brand-brown">{totalStats.allCount}</h3>
            </div>
          </div>

          <div className="bg-white border border-brand-brown/10 p-5 rounded-2xl flex items-center gap-4 shadow-sm hover:shadow duration-200">
            <div className="w-12 h-12 bg-amber-500/10 text-brand-yellow rounded-xl flex items-center justify-center">
              <UserMinus className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-black tracking-wider text-brand-brown/40 mb-0.5">7+ Days Inactive Targets</p>
              <h3 className="text-xl font-mono font-black text-brand-brown">
                {totalStats.inactiveActiveQueue} <span className="text-xs text-brand-brown/50 font-normal">/ {totalStats.inactiveTotal} overall</span>
              </h3>
            </div>
          </div>

          <div className="bg-white border border-brand-brown/10 p-5 rounded-2xl flex items-center gap-4 shadow-sm hover:shadow duration-200">
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-600 rounded-xl flex items-center justify-center">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-black tracking-wider text-brand-brown/40 mb-0.5">Ready to Redeem Rewards</p>
              <h3 className="text-xl font-mono font-black text-brand-brown">
                {totalStats.redeemActiveQueue} <span className="text-xs text-brand-brown/50 font-normal">/ {totalStats.redeemTotal} overall</span>
              </h3>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white border border-brand-brown/10 rounded-2xl shadow-sm mb-6 p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          
          {/* Main triggers tabs selector */}
          <div className="flex bg-brand-stone/15 p-1 rounded-xl shrink-0 self-start">
            <button
              type="button"
              onClick={() => { setActiveTab('inactive'); setSearchTerm(''); }}
              className={`flex items-center gap-2 p-2 px-4 rounded-lg text-[10px] font-black uppercase tracking-wider duration-150 transition-all cursor-pointer ${
                activeTab === 'inactive'
                  ? 'bg-brand-brown text-white shadow'
                  : 'text-brand-brown hover:bg-brand-stone/35'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Inactive 7-Days Trigger ({filteredInactive.length})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('mincoins'); setSearchTerm(''); }}
              className={`flex items-center gap-2 p-2 px-4 rounded-lg text-[10px] font-black uppercase tracking-wider duration-150 transition-all cursor-pointer ${
                activeTab === 'mincoins'
                  ? 'bg-brand-brown text-white shadow'
                  : 'text-brand-brown hover:bg-brand-stone/35'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              MinCoins Redemption Trigger ({filteredMinCoins.length})
            </button>
          </div>

          {/* Search bar and Inline Sort dropdowns state */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:justify-end">
            
            {/* Display relevant sort controls inside toolbar */}
            {activeTab === 'inactive' ? (
              <div className="flex flex-wrap items-center gap-1.5 bg-brand-stone/10 p-1 rounded-xl">
                <span className="text-[9px] font-black uppercase text-brand-brown/50 px-2">Sort:</span>
                <button
                  type="button"
                  onClick={() => handleInactiveSort('inactivity')}
                  className={`p-2 px-3 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 duration-150 transition-all ${
                    inactiveSortField === 'inactivity'
                      ? 'bg-brand-brown text-white shadow-xs'
                      : 'text-brand-brown hover:bg-brand-stone/20'
                  }`}
                >
                  Period {inactiveSortField === 'inactivity' && (inactiveSortOrder === 'desc' ? '↓' : '↑')}
                </button>
                <button
                  type="button"
                  onClick={() => handleInactiveSort('ltv')}
                  className={`p-2 px-3 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 duration-150 transition-all ${
                    inactiveSortField === 'ltv'
                      ? 'bg-brand-brown text-white shadow-xs'
                      : 'text-brand-brown hover:bg-brand-stone/20'
                  }`}
                >
                  LTV {inactiveSortField === 'ltv' && (inactiveSortOrder === 'desc' ? '↓' : '↑')}
                </button>
                <button
                  type="button"
                  onClick={() => handleInactiveSort('orders')}
                  className={`p-2 px-3 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 duration-150 transition-all ${
                    inactiveSortField === 'orders'
                      ? 'bg-brand-brown text-white shadow-xs'
                      : 'text-brand-brown hover:bg-brand-stone/20'
                  }`}
                >
                  Orders {inactiveSortField === 'orders' && (inactiveSortOrder === 'desc' ? '↓' : '↑')}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 bg-brand-stone/10 p-1 rounded-xl">
                <span className="text-[9px] font-black uppercase text-brand-brown/50 px-2">Sort:</span>
                <button
                  type="button"
                  onClick={() => handleMinCoinsSort('coins')}
                  className={`p-2 px-3 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 duration-150 transition-all ${
                    minCoinsSortField === 'coins'
                      ? 'bg-brand-brown text-white shadow-xs'
                      : 'text-brand-brown hover:bg-brand-stone/20'
                  }`}
                >
                  Coins {minCoinsSortField === 'coins' && (minCoinsSortOrder === 'desc' ? '↓' : '↑')}
                </button>
                <button
                  type="button"
                  onClick={() => handleMinCoinsSort('ltv')}
                  className={`p-2 px-3 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 duration-150 transition-all ${
                    minCoinsSortField === 'ltv'
                      ? 'bg-brand-brown text-white shadow-xs'
                      : 'text-brand-brown hover:bg-brand-stone/20'
                  }`}
                >
                  LTV {minCoinsSortField === 'ltv' && (minCoinsSortOrder === 'desc' ? '↓' : '↑')}
                </button>
                <button
                  type="button"
                  onClick={() => handleMinCoinsSort('orders')}
                  className={`p-2 px-3 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 duration-150 transition-all ${
                    minCoinsSortField === 'orders'
                      ? 'bg-brand-brown text-white shadow-xs'
                      : 'text-brand-brown hover:bg-brand-stone/20'
                  }`}
                >
                  Orders {minCoinsSortField === 'orders' && (minCoinsSortOrder === 'desc' ? '↓' : '↑')}
                </button>
              </div>
            )}

            {/* Live filter text bar */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-brand-brown/40" />
              <input
                type="text"
                placeholder="Search phone or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-2 pl-9 bg-brand-stone/10 border border-brand-brown/10 rounded-xl text-xs font-bold text-brand-brown placeholder-brand-brown/40 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Browser Alert Ribbon */}
        <div className="bg-amber-500/5 border border-brand-yellow/20 p-4 rounded-2xl flex items-start gap-3 mb-6">
          <HelpCircle className="w-5 h-5 text-brand-yellow shrink-0 mt-0.5" />
          <div>
            <h4 className="text-[11px] font-black uppercase tracking-wide text-brand-brown mb-0.5">7-Day Loyalty Protection CoolDown Active</h4>
            <p className="text-[10px] font-medium text-brand-brown/75 leading-relaxed">
              To guarantee that client communication behaves respectfully, sending messages to a customer places them on an automatic <b>7-day cooldown schedule</b>. People in cooldown will bypass bulk delivery campaigns automatically, and their button will lock to secure them from multiple spams.
            </p>
          </div>
        </div>

        {/* Tab content rendering tables */}
        {isLoading ? (
          <div className="bg-white border border-brand-brown/10 rounded-2xl p-16 text-center shadow-sm">
            <RefreshCw className="w-8 h-8 text-brand-yellow animate-spin mx-auto mb-3" />
            <p className="text-xs font-black text-brand-brown/60 uppercase tracking-widest">Loading Customers Database...</p>
          </div>
        ) : activeTab === 'inactive' ? (
          <div className="bg-white border border-brand-brown/10 rounded-2xl shadow-sm overflow-hidden">
            
            {/* Send All Header Banner layout */}
            <div className="p-4 bg-brand-stone/20 border-b border-brand-brown/10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-xs font-black text-brand-brown uppercase tracking-wide">Dormant Client Directory</h3>
                <p className="text-[10px] text-brand-brown/60 font-semibold">Customers who ordered last visit 7+ days ago.</p>
              </div>
              <button
                type="button"
                onClick={handleBulkSendInactive}
                className="flex items-center gap-1.5 p-3 px-6 bg-brand-red text-white hover:opacity-90 active:scale-95 duration-200 transition-all rounded-xl text-[10px] font-black uppercase tracking-wider shadow cursor-pointer font-bold"
              >
                <Gift className="w-3.5 h-3.5" />
                🚀 Send All Coupons via Wizard
              </button>
            </div>

            {/* Desktop and Mobile Table view */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-stone/10 border-b border-brand-brown/15 text-[10px] font-black text-brand-brown/60 uppercase tracking-widest">
                    <th className="py-4 px-6">Customer Profile</th>
                    <th className="py-4 px-6">Phone Contact</th>
                    <th className="py-4 px-6 text-center">Status / Cooldown</th>
                    <th className="py-4 px-6 text-center">Last Order Date</th>
                    <th className="py-4 px-6 text-center">Inactivity</th>
                    <th className="py-4 px-6 text-center">Direct Promo Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-brown/10 text-xs font-semibold text-brand-brown">
                  {filteredInactive.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-brand-brown/50 uppercase tracking-widest font-black">
                        No inactive customers matching filter.
                      </td>
                    </tr>
                  ) : (
                    filteredInactive.map((info) => {
                      const cooldownDays = computeCooldownLeftDays(info.phone, 'inactive');
                      const activeCoupon = getMarketingCoupons().find(c => {
                        const digits = info.phone.replace(/\D/g, '').slice(-10);
                        return c.phone === digits && !c.isUsed && c.expiresAt > new Date().toISOString();
                      });

                      return (
                        <tr key={info.customer.id} className="hover:bg-brand-stone/5 transition-colors">
                          <td className="py-4 px-6">
                            <span className="font-extrabold text-brand-brown text-sm block">{info.name}</span>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-[9px] uppercase font-bold text-brand-brown/50 bg-brand-stone/40 p-0.5 px-1.5 rounded">
                                LTV: ₹{info.customer.totalSpent.toLocaleString('en-IN')}
                              </span>
                              <span className="text-[9px] uppercase font-bold text-brand-brown/50 bg-brand-stone/40 p-0.5 px-1.5 rounded">
                                Orders: {info.customer.totalOrders}
                              </span>
                              <span className="text-[9px] uppercase font-bold text-brand-yellow/95 bg-brand-yellow/15 p-0.5 px-1.5 rounded font-mono font-black">
                                Coins: {info.customer.minCoins || 0}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6 font-mono text-zinc-500">{info.phone}</td>
                          <td className="py-4 px-6 text-center">
                            {cooldownDays > 0 ? (
                              <span className="inline-flex items-center gap-1 p-1 px-2.5 bg-amber-500/10 border border-brand-yellow/30 text-[9px] font-black uppercase text-amber-700 rounded-full">
                                <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                                Sent ({Math.ceil(cooldownDays)}d left)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 p-1 px-2.5 bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase text-emerald-600 rounded-full">
                                Ready To Send
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-center font-mono">
                            {info.customer.lastVisit ? new Date(info.customer.lastVisit).toLocaleDateString('en-IN', {
                              day: '2-digit', month: 'short', year: 'numeric'
                            }) : 'N/A'}
                          </td>
                          <td className="py-4 px-6 text-center">
                            <span className="p-1 px-2 bg-brand-brown text-brand-cream text-[10px] font-black uppercase rounded-lg">
                              {info.daysSinceLastVisit} Days
                            </span>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <div className="flex flex-col items-center gap-1 justify-center">
                              <button
                                type="button"
                                onClick={() => handleSendInactive(info)}
                                disabled={cooldownDays > 0}
                                className={`inline-flex items-center gap-1 p-2 px-3.5 font-black duration-150 transition-all rounded-lg text-[9px] uppercase tracking-wider outline-none cursor-pointer border ${
                                  cooldownDays > 0 
                                    ? 'bg-zinc-100 hover:bg-zinc-100 border-zinc-200 text-zinc-400 cursor-not-allowed'
                                    : 'bg-brand-stone/40 hover:bg-brand-yellow hover:text-brand-brown border-brand-brown/10'
                                }`}
                              >
                                Send Mojito
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </button>
                              
                              {cooldownDays > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    clearReminderLog(info.phone, 'inactive');
                                    setReloadKey(prev => prev + 1);
                                  }}
                                  className="inline-flex items-center gap-1 text-[9px] text-rose-600 hover:text-rose-800 uppercase font-black tracking-wide underline decoration-dotted decoration-rose-400 hover:decoration-solid cursor-pointer mt-0.5"
                                  title="Reset cooldown to let you resend instantly"
                                >
                                  <RefreshCcw className="w-2.5 h-2.5" />
                                  Override Cooldown
                                </button>
                              )}
                            </div>
                            {activeCoupon && (
                              <div className="mt-1 text-center font-mono text-[9px] text-emerald-600 uppercase font-black">
                                ID: {activeCoupon.couponCode}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-brand-brown/10 rounded-2xl shadow-sm overflow-hidden">
            
            {/* Bulk Redeem Reminders Header */}
            <div className="p-4 bg-brand-stone/20 border-b border-brand-brown/10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-xs font-black text-brand-brown uppercase tracking-wide">Loyalty Balance Reminders</h3>
                <p className="text-[10px] text-brand-brown/60 font-semibold">Customers with enough coins balance to unlock a delicious reward choice.</p>
              </div>
              <button
                type="button"
                onClick={handleBulkSendMinCoins}
                className="flex items-center gap-1.5 p-3 px-6 bg-brand-brown text-brand-yellow hover:opacity-90 active:scale-95 duration-200 transition-all rounded-xl text-[10px] font-black uppercase tracking-wider shadow cursor-pointer font-bold"
              >
                <Bell className="w-3.5 h-3.5" />
                🔔 Inform All Reminders via Wizard
              </button>
            </div>

            {/* MinCoins directory body selection table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-stone/10 border-b border-brand-brown/15 text-[10px] font-black text-brand-brown/60 uppercase tracking-widest">
                    <th className="py-4 px-6">Customer Profile</th>
                    <th className="py-4 px-6">Phone Contact</th>
                    <th className="py-4 px-6 text-center">Status / Cooldown</th>
                    <th className="py-4 px-6 text-right">Coins Balance</th>
                    <th className="py-4 px-6">Affordable Free Items</th>
                    <th className="py-4 px-6 text-center">Direct Promo Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-brown/10 text-xs font-semibold text-brand-brown">
                  {filteredMinCoins.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-brand-brown/50 uppercase tracking-widest font-black">
                        No qualified customers found.
                      </td>
                    </tr>
                  ) : (
                    filteredMinCoins.map((info) => {
                      const cooldownDays = computeCooldownLeftDays(info.phone, 'mincoins');

                      return (
                        <tr key={info.customer.id} className="hover:bg-brand-stone/5 transition-colors">
                          <td className="py-4 px-6">
                            <span className="font-extrabold text-brand-brown text-sm block">{info.name}</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] uppercase font-bold text-brand-brown/50 bg-brand-stone/40 p-0.5 px-1.5 rounded">
                                LTV: ₹{info.customer.totalSpent.toLocaleString('en-IN')}
                              </span>
                              <span className="text-[9px] uppercase font-bold text-brand-brown/50 bg-brand-stone/40 p-0.5 px-1.5 rounded">
                                Orders: {info.customer.totalOrders}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6 font-mono text-zinc-500">{info.phone}</td>
                          <td className="py-4 px-6 text-center">
                            {cooldownDays > 0 ? (
                              <span className="inline-flex items-center gap-1 p-1 px-2.5 bg-amber-500/10 border border-brand-yellow/30 text-[9px] font-black uppercase text-amber-700 rounded-full">
                                <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                                Reminded ({Math.ceil(cooldownDays)}d left)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 p-1 px-2.5 bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase text-emerald-600 rounded-full">
                                Ready To Send
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="inline-flex items-center gap-1 p-1 px-2.5 bg-brand-yellow/15 text-brand-brown font-mono font-black rounded-full">
                              <Coins className="w-3.5 h-3.5 text-brand-yellow shrink-0 fill-brand-yellow/20" />
                              {info.coins} Coins
                            </div>
                          </td>
                          <td className="py-4 px-6 max-w-xs xl:max-w-md">
                            <div className="flex flex-wrap gap-1">
                              {info.redeemableItems.slice(0, 3).map((item, idx) => (
                                <span key={idx} className="p-0.5 px-1.5 bg-brand-stone text-brand-brown text-[9px] font-black uppercase rounded">
                                  {item.name}
                                </span>
                              ))}
                              {info.redeemableItems.length > 3 && (
                                <span className="p-0.5 px-1.5 bg-zinc-100 text-zinc-500 text-[9px] font-bold uppercase rounded">
                                  +{info.redeemableItems.length - 3} More
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <div className="flex flex-col items-center gap-1 justify-center">
                              <button
                                type="button"
                                onClick={() => handleSendMinCoins(info)}
                                disabled={cooldownDays > 0}
                                className={`inline-flex items-center gap-1 p-2 px-3.5 font-black duration-150 transition-all rounded-lg text-[9px] uppercase tracking-wider outline-none cursor-pointer border ${
                                  cooldownDays > 0 
                                    ? 'bg-zinc-100 hover:bg-zinc-100 border-zinc-200 text-zinc-400 cursor-not-allowed'
                                    : 'bg-brand-stone/40 hover:bg-brand-yellow hover:text-brand-brown border-brand-brown/10'
                                }`}
                              >
                                Send Prompt
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </button>

                              {cooldownDays > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    clearReminderLog(info.phone, 'mincoins');
                                    setReloadKey(prev => prev + 1);
                                  }}
                                  className="inline-flex items-center gap-1 text-[9px] text-rose-600 hover:text-rose-800 uppercase font-black tracking-wide underline decoration-dotted decoration-rose-400 hover:decoration-solid cursor-pointer mt-0.5"
                                  title="Reset cooldown to let you resend instantly"
                                >
                                  <RefreshCcw className="w-2.5 h-2.5" />
                                  Override Cooldown
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Marketing;
