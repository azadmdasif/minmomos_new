import React, { useState, useEffect, useMemo } from 'react';
import { fetchCustomers, fetchLastOrderPriorityItem, fetchMenuItems, getISTDateString } from '../utils/storage';
import { 
  addMarketingCoupon,
  saveLocalMessageLogs,
  logMessageSent,
  getLastMessageSentTime,
  isWithinMessageCooldown,
  fetchAllMessageLogsFromSupabase,
  addFreeItemTag,
  deleteFreeItemTag,
  getLocalFreeItemTags,
  fetchFreeItemTagsFromSupabase,
  assignFreeItemClaimToCustomer,
  addDiscountTag,
  deleteDiscountTag,
  getLocalDiscountTags,
  fetchDiscountTagsFromSupabase,
  assignDiscountClaimToCustomer,
  getManuallyUnblockedPhones,
  addToManuallyUnblocked
} from '../utils/marketingStorage';
import { Customer, MenuItem, FreeItemTag, DiscountTag } from '../types';
import { 
  Users, 
  Search, 
  MessageCircle, 
  RefreshCw, 
  Check, 
  Calendar,
  AlertCircle,
  Sparkles,
  Eye,
  EyeOff,
  Play,
  SkipForward,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Clock,
  MessageSquare,
  Gift,
  Trash2,
  X
} from 'lucide-react';

const getSentKey = (phone: string, date: string, type: string) => `${phone}_${date}_${type}`;

export const Marketing: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(getISTDateString());
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Cache for customer last ordered items
  const [lastOrderedItems, setLastOrderedItems] = useState<Record<string, string>>({});

  // Keep track of sent messages locally to show status
  const [sentMap, setSentMap] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('MOMOMAYA_SENT_PROMOS');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Custom Marketing WhatsApp Format Templates per sublayer
  const [sublayerTemplates, setSublayerTemplates] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('MOMOMAYA_SUBLAYER_TEMPLATES');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [freeItemTags, setFreeItemTags] = useState<FreeItemTag[]>(() => getLocalFreeItemTags());
  const [sublayerFreeItemTags, setSublayerFreeItemTags] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('MOMOMAYA_SUBLAYER_FREE_TAGS');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [isFreeTagsModalOpen, setIsFreeTagsModalOpen] = useState(false);

  const [discountTags, setDiscountTags] = useState<DiscountTag[]>(() => getLocalDiscountTags());
  const [sublayerDiscountTags, setSublayerDiscountTags] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('MOMOMAYA_SUBLAYER_DISCOUNT_TAGS');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [isDiscountTagsModalOpen, setIsDiscountTagsModalOpen] = useState(false);

  const [manuallyUnblockedList, setManuallyUnblockedList] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('MOMOMAYA_MANUALLY_UNBLOCKED_PHONES');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const handleUnblockCustomer = (phone: string) => {
    addToManuallyUnblocked(phone);
    setManuallyUnblockedList(getManuallyUnblockedPhones());
  };

  // Background Supabase loading of created Free Item promotional codes
  useEffect(() => {
    fetchFreeItemTagsFromSupabase().then(dbTags => {
      if (dbTags && dbTags.length > 0) {
        setFreeItemTags(dbTags);
      }
    });

    fetchDiscountTagsFromSupabase().then(dbTags => {
      if (dbTags && dbTags.length > 0) {
        setDiscountTags(dbTags);
      }
    });
  }, []);

  const handleSaveSublayerFreeTag = (sublayerKey: string, tagIdOrCode: string) => {
    const updated = { ...sublayerFreeItemTags, [sublayerKey]: tagIdOrCode };
    setSublayerFreeItemTags(updated);
    try {
      localStorage.setItem('MOMOMAYA_SUBLAYER_FREE_TAGS', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSublayerDiscountTag = (sublayerKey: string, tagIdOrCode: string) => {
    const updated = { ...sublayerDiscountTags, [sublayerKey]: tagIdOrCode };
    setSublayerDiscountTags(updated);
    try {
      localStorage.setItem('MOMOMAYA_SUBLAYER_DISCOUNT_TAGS', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  // State for sublayer broadcast queues
  const [sublayerQueue, setSublayerQueue] = useState<{
    isActive: boolean;
    level: number;
    subKey: string;
    currentIndex: number;
    customers: Customer[];
  }>({
    isActive: false,
    level: 0,
    subKey: '',
    currentIndex: 0,
    customers: []
  });

  const saveSublayerTemplate = (key: string, val: string) => {
    const updated = { ...sublayerTemplates, [key]: val };
    setSublayerTemplates(updated);
    try {
      localStorage.setItem('MOMOMAYA_SUBLAYER_TEMPLATES', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  // Track which messages have their drafts expanded for preview
  const [expandedPreviews, setExpandedPreviews] = useState<Record<string, boolean>>({});

  // Campaign Queue Sequential Sender State
  const [queues, setQueues] = useState<Record<'3' | '6' | 'mincoins', {
    isActive: boolean;
    currentIndex: number;
    isCompleted: boolean;
  }>>({
    '3': { isActive: false, currentIndex: 0, isCompleted: false },
    '6': { isActive: false, currentIndex: 0, isCompleted: false },
    'mincoins': { isActive: false, currentIndex: 0, isCompleted: false },
  });

  const saveSentMap = (newMap: Record<string, boolean>) => {
    setSentMap(newMap);
    try {
      localStorage.setItem('MOMOMAYA_SENT_PROMOS', JSON.stringify(newMap));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const loadedCusts = await fetchCustomers();
        setCustomers(loadedCusts);

        const { data: mItems } = await fetchMenuItems();
        if (mItems) {
          setMenuItems(mItems);
        }

        // Pull latest sent message logs for live cooldown and history checking
        const dbLogs = await fetchAllMessageLogsFromSupabase();
        if (dbLogs && dbLogs.length > 0) {
          saveLocalMessageLogs(dbLogs);
        }
      } catch (e) {
        console.error('Failed to load marketing customers', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [reloadKey]);

  // Compute timezone offsets safely to get base date, 3 days ago, and 6 days ago
  const dateConfig = useMemo(() => {
    if (!selectedDate) return null;
    const [y, m, d] = selectedDate.split('-').map(Number);
    const base = new Date(y, m - 1, d);

    // -4 and -7 days offset for all dates
    const offset3 = 4;
    const offset6 = 7;

    const d3 = new Date(base);
    d3.setDate(d3.getDate() - offset3);
    const d3Str = getISTDateString(d3);

    const d6 = new Date(base);
    d6.setDate(d6.getDate() - offset6);
    const d6Str = getISTDateString(d6);

    return {
      baseStr: selectedDate,
      d3Str,
      d6Str,
      baseDisplay: base.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }),
      d3Display: d3.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }),
      d6Display: d6.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })
    };
  }, [selectedDate]);

  // Cohort 1: Last order was exactly 3 days ago
  const list3Days = useMemo(() => {
    if (!dateConfig) return [];
    return customers.filter(c => {
      if (!c.lastVisit) return false;
      const lastVisitStr = getISTDateString(c.lastVisit);
      return lastVisitStr === dateConfig.d3Str;
    });
  }, [customers, dateConfig]);

  // Cohort 2: Last order was exactly 6 days ago
  const list6Days = useMemo(() => {
    if (!dateConfig) return [];
    return customers.filter(c => {
      if (!c.lastVisit) return false;
      const lastVisitStr = getISTDateString(c.lastVisit);
      return lastVisitStr === dateConfig.d6Str;
    });
  }, [customers, dateConfig]);

  // Cohort 3: Customers who have enough mincoins to redeem at least one item from the menu
  const listMinCoins = useMemo(() => {
    if (menuItems.length === 0) return [];
    return customers.filter(c => {
      const coins = c.minCoins ?? 0;
      if (coins <= 0) return false;
      
      // Determine if they can claim at least one item
      return menuItems.some(item => {
        if (!item.minCoinsPrices) return false;
        return Object.values(item.minCoinsPrices).some(sizePrices => {
          if (!sizePrices) return false;
          return Object.values(sizePrices).some(price => typeof price === 'number' && price > 0 && price <= coins);
        });
      });
    });
  }, [customers, menuItems]);

  // Fetch last ordered items for target 3D/6D cohorts
  useEffect(() => {
    const fetchLastItemsForCohorts = async () => {
      const allActiveCustomers = [...list3Days, ...list6Days];
      if (allActiveCustomers.length === 0) return;

      const resultsMap: Record<string, string> = { ...lastOrderedItems };
      let updated = false;

      // Fetch last item lazily for each active customer
      const promises = allActiveCustomers.map(async (c) => {
        if (resultsMap[c.phone] !== undefined) return;
        try {
          const itemInfo = await fetchLastOrderPriorityItem(c.phone);
          resultsMap[c.phone] = itemInfo ? itemInfo.name : 'delicious momos';
          updated = true;
        } catch (e) {
          console.error(`Error fetching priority item for ${c.phone}:`, e);
          resultsMap[c.phone] = 'delicious momos';
          updated = true;
        }
      });

      await Promise.all(promises);
      if (updated) {
        setLastOrderedItems(resultsMap);
      }
    };

    fetchLastItemsForCohorts();
  }, [list3Days, list6Days]);

  // Search filtered results
  const filteredList3Days = useMemo(() => {
    if (!searchTerm) return list3Days;
    const term = searchTerm.toLowerCase();
    return list3Days.filter(c => 
      (c.name || '').toLowerCase().includes(term) || 
      c.phone.includes(term)
    );
  }, [list3Days, searchTerm]);

  const filteredList6Days = useMemo(() => {
    if (!searchTerm) return list6Days;
    const term = searchTerm.toLowerCase();
    return list6Days.filter(c => 
      (c.name || '').toLowerCase().includes(term) || 
      c.phone.includes(term)
    );
  }, [list6Days, searchTerm]);

  const filteredListMinCoins = useMemo(() => {
    if (!searchTerm) return listMinCoins;
    const term = searchTerm.toLowerCase();
    return listMinCoins.filter(c => 
      (c.name || '').toLowerCase().includes(term) || 
      c.phone.includes(term)
    );
  }, [listMinCoins, searchTerm]);

  // Funnel calculations: Represent the customer journey from 1st to 5th order.
  const [expandedSublayers, setExpandedSublayers] = useState<Record<string, boolean>>({});

  const getDaysInLayer = (customer: Customer, baseDateStr: string): number => {
    const lastVisitStr = customer.lastVisit 
      ? getISTDateString(customer.lastVisit) 
      : customer.joinedDate 
        ? getISTDateString(customer.joinedDate) 
        : null;
    if (!lastVisitStr) return 0;
    
    const [y1, m1, d1] = baseDateStr.split('-').map(Number);
    const [y2, m2, d2] = lastVisitStr.split('-').map(Number);
    
    const d1Obj = new Date(y1, m1 - 1, d1);
    const d2Obj = new Date(y2, m2 - 1, d2);
    
    const diffTime = d1Obj.getTime() - d2Obj.getTime();
    if (isNaN(diffTime)) return 0;
    
    return Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));
  };

  const funnelLayers = useMemo(() => {
    if (!selectedDate) return [];

    const layers = [
      { level: 1, label: '1st Order (New Converts)', color: 'rose' },
      { level: 2, label: '2nd Order (Returning)', color: 'amber' },
      { level: 3, label: '3rd Order (Habitual)', color: 'emerald' },
      { level: 4, label: '4th Order (Vanguard)', color: 'indigo' },
      { level: 5, label: '5th+ Order (Brand Advocates)', color: 'violet' }
    ];

    const sublayerConfigs = [
      { key: '15_plus', label: '15+ days dormant', min: 16, max: Infinity, textClass: 'text-rose-700 bg-rose-50 border-rose-200', dotBg: 'bg-rose-500' },
      { key: '8_15', label: '8-15 days stale', min: 8, max: 15, textClass: 'text-amber-700 bg-amber-50 border-amber-200', dotBg: 'bg-amber-500' },
      { key: '4_7', label: '4-7 days cooling', min: 4, max: 7, textClass: 'text-indigo-700 bg-indigo-50 border-indigo-200', dotBg: 'bg-indigo-500' },
      { key: '1_3', label: '1-3 days active', min: 0, max: 3, textClass: 'text-emerald-700 bg-emerald-50 border-emerald-200', dotBg: 'bg-emerald-500' }
    ];

    return layers.map(layer => {
      const layerCustomers = customers.filter(c => {
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          const matchesSearch = (c.name || '').toLowerCase().includes(term) || c.phone.includes(term);
          if (!matchesSearch) return false;
        }

        if (layer.level === 5) {
          return c.totalOrders >= 5;
        } else {
          return c.totalOrders === layer.level;
        }
      });

      const sublayers = sublayerConfigs.map(sub => {
        const matchingCusts = layerCustomers.filter(c => {
          const daysInLayer = getDaysInLayer(c, selectedDate);
          return daysInLayer >= sub.min && daysInLayer <= sub.max;
        });

        // Sort descending by daysInLayer: longest time in layer first
        const sortedCusts = [...matchingCusts].sort((a, b) => {
          const daysA = getDaysInLayer(a, selectedDate);
          const daysB = getDaysInLayer(b, selectedDate);
          return daysB - daysA;
        });

        return {
          ...sub,
          customers: sortedCusts,
          count: sortedCusts.length
        };
      });

      const totalCountInLayer = layerCustomers.length;

      return {
        ...layer,
        totalCount: totalCountInLayer,
        sublayers
      };
    });
  }, [customers, selectedDate, searchTerm, manuallyUnblockedList]);

  const getDefaultTemplate = (layer: number, _subKey?: string) => {
    if (layer === 1) {
      return `Hi {name}! 🌟\n\nThanks for choosing MinMomos for your first order! It's been {days} days since we last saw you. We'd love to serve you again. You currently have *{coins} MinCoins* in your wallet. Come back today and try our delicious pan-fried Momos! 🥟🎁\n\n— Rashid from MinMomos`;
    } else if (layer === 2) {
      return `Hi {name}! 🥟\n\nWe loved serving you for your first 2 orders! It's been {days} days since we last saw you. You're on your way to becoming a Momo VIP. Come try our crispy steamed or fried momos today and use your *{coins} MinCoins*! 🍢✨\n\n— Rashid from MinMomos`;
    } else if (layer === 3 || layer === 4) {
      return `Hi {name}! 🌟\n\nYou've ordered *{level} times* with us and we hold you in high esteem! It's been {days} days since we last saw you. To thank you for being a part of our journey, we have loaded some special offers for you. Come today and claim your coins! 🥟🎉\n\n— Rashid from MinMomos`;
    } else {
      return `Hi {name}! 👑\n\nYou are one of our top Brand Advocates with *{level} orders*! It's been {days} days since we last saw you. That is incredibly special to us. You have *{coins} MinCoins* in your wallet. Drop in today for a special host VIP treat! 🥂🍡\n\n— Rashid from MinMomos`;
    }
  };

  const compileTemplate = (templateStr: string, customer: Customer, daysInLayer: number, level: number, sublayerKey?: string): string => {
    let replaced = templateStr
      .replace(/{name}/g, customer.name || 'Valued Customer')
      .replace(/{coins}/g, String(customer.minCoins ?? 0))
      .replace(/{days}/g, String(daysInLayer))
      .replace(/{level}/g, String(level));

    if (sublayerKey) {
      // Free Item tags
      const tagId = sublayerFreeItemTags[sublayerKey];
      const tag = freeItemTags.find(t => t.id === tagId);
      if (tag) {
        const promoText = `Free *${tag.itemName}* (Use code *${tag.code}*, valid till ${new Date(tag.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`;
        replaced = replaced.replace(/{free_item_tag}/g, promoText);
      } else {
        replaced = replaced.replace(/{free_item_tag}/g, '');
      }

      // Discount tags
      const distTagId = sublayerDiscountTags[sublayerKey];
      const distTag = discountTags.find(t => t.id === distTagId);
      if (distTag) {
        const distPromoText = `*${distTag.discountPercentage}% Discount* (Use code *${distTag.code}*, valid till ${new Date(distTag.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`;
        replaced = replaced.replace(/{discount_tag}/g, distPromoText);
      } else {
        replaced = replaced.replace(/{discount_tag}/g, '');
      }
    } else {
      replaced = replaced.replace(/{free_item_tag}/g, '').replace(/{discount_tag}/g, '');
    }

    return replaced;
  };

  const handleSendFunnelMessage = async (customer: Customer, layer: number, daysInLayer: number, subKey: string = '1_3') => {
    const cooldown = isWithinMessageCooldown(customer.phone);
    if (cooldown.isCooling) {
      alert(`This customer is currently in cooldown. Their last message was sent on ${new Date(cooldown.lastSentAt!).toLocaleDateString()}. Please wait 6 days between promotional campaigns.`);
      return;
    }

    const sublayerKey = `${layer}_${subKey}`;
    const templateRaw = sublayerTemplates[sublayerKey] || getDefaultTemplate(layer, subKey);
    const message = compileTemplate(templateRaw, customer, daysInLayer, layer, sublayerKey);

    const encoded = encodeURIComponent(message);
    const phoneDigits = customer.phone.replace(/\D/g, '');
    const url = `https://wa.me/${phoneDigits}?text=${encoded}`;
    
    window.open(url, '_blank');

    // Dynamically assign free promo tag if active for this sublayer
    const tagId = sublayerFreeItemTags[sublayerKey];
    const tag = freeItemTags.find(t => t.id === tagId);
    if (tag) {
      try {
        await assignFreeItemClaimToCustomer(customer.phone, tag.code, tag.itemName, tag.expiresAt);
      } catch (err) {
        console.error("Failed to assign claim", err);
      }
    }

    // Dynamically assign discount claim if active for this sublayer
    const distTagId = sublayerDiscountTags[sublayerKey];
    const distTag = discountTags.find(t => t.id === distTagId);
    if (distTag) {
      try {
        await assignDiscountClaimToCustomer(customer.phone, distTag.code, distTag.discountPercentage, distTag.expiresAt);
      } catch (err) {
        console.error("Failed to assign discount claim", err);
      }
    }

    try {
      await logMessageSent(customer.phone, message, `funnel_L${layer}_${subKey}`);
      if (dateConfig) {
        const key = getSentKey(customer.phone, dateConfig.baseStr, `funnel_${layer}`);
        saveSentMap({ ...sentMap, [key]: true });
      }
      setManuallyUnblockedList(getManuallyUnblockedPhones());
      setReloadKey(prev => prev + 1);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartSublayerBroadcast = (level: number, subKey: string, sublayerCustomers: Customer[]) => {
    // Filter out contacts in cooldown to protect customers on Whatsapp
    const activeCustomers = sublayerCustomers.filter(c => !isWithinMessageCooldown(c.phone).isCooling);
    
    if (activeCustomers.length === 0) {
      alert("All customers in this sublayer are currently in a 6-day message cooldown. There are no qualified broadcast contacts.");
      return;
    }

    setSublayerQueue({
      isActive: true,
      level,
      subKey,
      currentIndex: 0,
      customers: activeCustomers
    });
  };

  const handleSublayerQueueNext = async (action: 'send' | 'skip' | 'cancel') => {
    if (!sublayerQueue.isActive) return;
    
    const { level, subKey, currentIndex, customers: qCusts } = sublayerQueue;
    const currentCustomer = qCusts[currentIndex]; 

    if (action === 'send' && currentCustomer) {
      const daysInLayer = getDaysInLayer(currentCustomer, selectedDate);
      const sublayerKey = `${level}_${subKey}`;
      const templateRaw = sublayerTemplates[sublayerKey] || getDefaultTemplate(level, subKey);
      const message = compileTemplate(templateRaw, currentCustomer, daysInLayer, level, sublayerKey);

      const encoded = encodeURIComponent(message);
      const phoneDigits = currentCustomer.phone.replace(/\D/g, '');
      const url = `https://wa.me/${phoneDigits}?text=${encoded}`;
      
      window.open(url, '_blank');

      // Dynamically assign free promo tag if active for this sublayer
      const tagId = sublayerFreeItemTags[sublayerKey];
      const tag = freeItemTags.find(t => t.id === tagId);
      if (tag) {
        try {
          await assignFreeItemClaimToCustomer(currentCustomer.phone, tag.code, tag.itemName, tag.expiresAt);
        } catch (err) {
          console.error("Failed to assign broadcast claim", err);
        }
      }

      // Dynamically assign discount claim if active for this sublayer
      const distTagId = sublayerDiscountTags[sublayerKey];
      const distTag = discountTags.find(t => t.id === distTagId);
      if (distTag) {
        try {
          await assignDiscountClaimToCustomer(currentCustomer.phone, distTag.code, distTag.discountPercentage, distTag.expiresAt);
        } catch (err) {
          console.error("Failed to assign broadcast discount claim", err);
        }
      }

      try {
        await logMessageSent(currentCustomer.phone, message, `funnel_L${level}_${subKey}`);
        if (dateConfig) {
          const key = getSentKey(currentCustomer.phone, dateConfig.baseStr, `funnel_${level}`);
          saveSentMap({ ...sentMap, [key]: true });
        }
        setManuallyUnblockedList(getManuallyUnblockedPhones());
      } catch (err) {
        console.error(err);
      }
    }

    const nextIdx = currentIndex + 1;
    const isCompleted = nextIdx >= qCusts.length;

    if (isCompleted || action === 'cancel') {
      setSublayerQueue({
        isActive: false,
        level: 0,
        subKey: '',
        currentIndex: 0,
        customers: []
      });
      // Trigger live updates
      setReloadKey(prev => prev + 1);
    } else {
      setSublayerQueue(prev => ({
        ...prev,
        currentIndex: nextIdx
      }));
    }
  };

  const handleToggleFunnelSent = (phone: string, layer: number) => {
    if (!dateConfig) return;
    const key = getSentKey(phone, dateConfig.baseStr, `funnel_${layer}`);
    const nextMap = { ...sentMap };
    if (nextMap[key]) {
      delete nextMap[key];
    } else {
      nextMap[key] = true;
    }
    saveSentMap(nextMap);
  };
  
  const startCampaignQueue = (type: '3' | '6' | 'mincoins') => {
    setQueues(prev => ({
      ...prev,
      [type]: {
        isActive: true,
        currentIndex: 0,
        isCompleted: false
      }
    }));
  };

  const closeCampaignQueue = (type: '3' | '6' | 'mincoins') => {
    setQueues(prev => ({
      ...prev,
      [type]: {
        isActive: false,
        currentIndex: 0,
        isCompleted: false
      }
    }));
  };

  const restartCampaignQueue = (type: '3' | '6' | 'mincoins') => {
    setQueues(prev => ({
      ...prev,
      [type]: {
        isActive: true,
        currentIndex: 0,
        isCompleted: false
      }
    }));
  };

  const handleQueueNext = (type: '3' | '6' | 'mincoins', action: 'send' | 'skip' | 'markSent') => {
    const list = type === '3' ? filteredList3Days : type === '6' ? filteredList6Days : filteredListMinCoins;
    const currentQueue = queues[type];
    const idx = currentQueue.currentIndex;
    
    if (idx < list.length) {
      const currentCustomer = list[idx];
      
      if (action === 'send') {
        handleSendMessage(currentCustomer, type);
      } else if (action === 'markSent') {
        if (dateConfig) {
          const key = getSentKey(currentCustomer.phone, dateConfig.baseStr, type);
          saveSentMap({ ...sentMap, [key]: true });
        }
      }
    }

    const nextIndex = idx + 1;
    const isCompleted = nextIndex >= list.length;
    
    setQueues(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        currentIndex: isCompleted ? idx : nextIndex,
        isCompleted: isCompleted
      }
    }));
  };

  const renderQueueAssistant = (type: '3' | '6' | 'mincoins') => {
    const list = type === '3' ? filteredList3Days : type === '6' ? filteredList6Days : filteredListMinCoins;
    const queue = queues[type];
    const total = list.length;
    const idx = queue.currentIndex;
    const currentCustomer = list[idx];

    // Colors
    const is3 = type === '3';
    const is6 = type === '6';
    const primaryBg = is3 ? 'bg-rose-50 border-rose-100' : is6 ? 'bg-amber-50 border-amber-100' : 'bg-indigo-50 border-indigo-100';
    const primaryBtn = is3 ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 ring-rose-200' : is6 ? 'bg-amber-600 hover:bg-amber-755 text-white border-amber-700 ring-amber-200' : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700 ring-indigo-200';

    if (queue.isCompleted || total === 0 || idx >= total) {
      return (
        <div className="flex flex-col items-center justify-center p-8 py-12 text-center bg-white border border-brand-brown/10 rounded-2xl shadow-xs animate-fade-in flex-1">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 mb-4 animate-bounce">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h4 className="text-base font-black text-brand-brown uppercase tracking-tight">Campaign Queue Completed!</h4>
          <p className="text-xs text-brand-brown/60 max-w-xs mt-2 font-medium leading-relaxed">
            All {total} qualified customers for this campaign category have been processed successfully.
          </p>
          <div className="flex items-center gap-3 mt-6 w-full max-w-[280px]">
            <button
              type="button"
              onClick={() => restartCampaignQueue(type)}
              className="flex-1 py-2.5 px-4 bg-brand-stone/15 hover:bg-brand-stone/25 duration-200 text-brand-brown text-[10px] font-black uppercase tracking-wider rounded-xl transition-all border border-brand-brown/5 outline-none cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restart Queue
            </button>
            <button
              type="button"
              onClick={() => closeCampaignQueue(type)}
              className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all border border-emerald-750 shadow-xs outline-none cursor-pointer"
            >
              Close Panel
            </button>
          </div>
        </div>
      );
    }

    const hasSentKey = dateConfig ? getSentKey(currentCustomer.phone, dateConfig.baseStr, type) : '';
    const isSent = !!sentMap[hasSentKey];

    return (
      <div className="flex flex-col flex-1 bg-white border border-brand-brown/10 rounded-2xl p-5 shadow-xs animate-fade-in text-brand-brown select-none">
        {/* Progress header bar */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase font-black tracking-widest text-brand-brown/40">Queue Assistant</span>
          <span className="text-xs font-black text-brand-brown/80">{idx + 1} of {total} contacts</span>
        </div>

        {/* Real progress bar */}
        <div className="w-full h-2 bg-brand-stone/15 rounded-full overflow-hidden mb-5">
          <div 
            className="h-full duration-300 transition-all rounded-full bg-gradient-to-r" 
            style={{ 
              width: `${((idx + 1) / total) * 100}%`,
              backgroundColor: is3 ? '#f43f5e' : is6 ? '#d97706' : '#4f46e5'
            }}
          ></div>
        </div>

        {/* Current target customer overview */}
        <div className={`p-4 border rounded-xl mb-4 ${primaryBg} flex flex-col gap-1.5`}>
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[9px] uppercase font-black tracking-wider text-brand-brown/50">Current Recipient</span>
              <h4 className="text-base font-black truncate">{currentCustomer.name || 'Valued Customer'}</h4>
              <p className="text-xs font-mono font-bold mt-0.5 opacity-80">{currentCustomer.phone}</p>
            </div>
            {isSent && (
              <span className="inline-flex items-center gap-1 p-1 px-2.5 bg-emerald-100 text-emerald-800 border border-emerald-250 rounded-full text-[9px] font-black uppercase tracking-wider">
                <Check className="w-3 h-3 stroke-[3]" /> Msg Sent
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className="text-[9px] uppercase font-black text-brand-brown bg-white/70 border border-brand-brown/5 p-0.5 px-2 rounded-md">
              Orders: {currentCustomer.totalOrders}
            </span>
            <span className="text-[9px] uppercase font-black text-indigo-700 bg-white/70 border border-indigo-100 p-0.5 px-2 rounded-md">
              🪙 {currentCustomer.minCoins ?? 0} Coins
            </span>
            {lastOrderedItems[currentCustomer.phone] && (
              <span className="text-[9px] uppercase font-black text-brand-brown bg-white/70 border border-brand-brown/5 p-0.5 px-2 rounded-md truncate max-w-[120px]">
                Last: {lastOrderedItems[currentCustomer.phone]}
              </span>
            )}
          </div>
        </div>

        {/* Real message preview content */}
        <div className="flex-1 min-h-[140px] flex flex-col mb-5 border border-brand-brown/10 rounded-xl overflow-hidden bg-brand-stone/5">
          <div className="p-2 border-b border-brand-brown/10 bg-brand-stone/10 flex items-center justify-between px-3">
            <span className="text-[9px] font-black uppercase tracking-wider text-brand-brown/50">WhatsApp Promo Content</span>
            <span className="text-[9.5px] font-mono text-brand-brown/40">Characters: {generateMessage(currentCustomer, type).length}</span>
          </div>
          <div className="p-3 overflow-y-auto max-h-[160px] no-scrollbar">
            <pre className="text-[11px] font-medium font-sans whitespace-pre-wrap text-left text-brand-brown/80 leading-relaxed bg-white border border-brand-brown/5 p-2.5 rounded-lg">
              {generateMessage(currentCustomer, type)}
            </pre>
          </div>
        </div>

        {/* Primary controller button layout */}
        <div className="flex flex-col gap-2">
          {/* Main primary action trigger */}
          <button
            type="button"
            onClick={() => handleQueueNext(type, 'send')}
            className={`w-full py-3 px-4 rounded-xl font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 duration-200 transition-all cursor-pointer shadow-sm active:scale-97 border outline-none ring-offset-2 focus:ring-2 ${primaryBtn}`}
          >
            <MessageCircle className="w-4 h-4 text-white animate-pulse" />
            Send Promo on WhatsApp
            <ChevronRight className="w-4 h-4 ml-0.5" />
          </button>

          {/* Neutral dual action layout */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQueueNext(type, 'markSent')}
              className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 duration-200 border border-indigo-200 text-indigo-600 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
              title="Mark as sent and advance queue without opening tab"
            >
              <Check className="w-3.5 h-3.5" />
              Mark Sent
            </button>
            <button
              type="button"
              onClick={() => handleQueueNext(type, 'skip')}
              className="py-2 px-3 bg-brand-stone/20 hover:bg-brand-stone/35 duration-200 border border-brand-brown/5 text-brand-brown/70 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
              title="Skip this customer"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Skip Contact
            </button>
          </div>

          {/* Quick return exit trigger */}
          <button
            type="button"
            onClick={() => closeCampaignQueue(type)}
            className="mt-1 text-[10px] font-black uppercase tracking-wider text-brand-brown/40 hover:text-brand-brown/70 duration-150 transition-colors py-1 cursor-pointer"
          >
            Exit Queue Assistant
          </button>
        </div>
      </div>
    );
  };

  // Determine standard redeemable item with mincoins
  const getRedeemableItem = (customerMinCoins: number): string => {
    const redeemable = menuItems.filter(item => {
      if (!item.minCoinsPrices) return false;
      return Object.values(item.minCoinsPrices).some(sizePrices => {
        if (!sizePrices) return false;
        return Object.values(sizePrices).some(price => typeof price === 'number' && price > 0 && price <= customerMinCoins);
      });
    });

    if (redeemable.length > 0) {
      return redeemable[0].name;
    }
    return "Momo or Mojito";
  };

  // Determine all redeemable items for a customer based on their balance
  const getEligibleRedeemableItems = (customerMinCoins: number): string[] => {
    if (!customerMinCoins || customerMinCoins <= 0) return [];
    const items: string[] = [];
    menuItems.forEach(item => {
      if (!item.minCoinsPrices) return;
      let canRedeemThisItem = false;
      Object.values(item.minCoinsPrices).forEach(sizePrices => {
        if (!sizePrices) return;
        Object.values(sizePrices).forEach(price => {
          if (typeof price === 'number' && price > 0 && price <= customerMinCoins) {
            canRedeemThisItem = true;
          }
        });
      });
      if (canRedeemThisItem && !items.includes(item.name)) {
        items.push(item.name);
      }
    });
    return items;
  };

  // Generate dynamic message content based on specifications
  const generateMessage = (customer: Customer, type: '3' | '6' | 'mincoins'): string => {
    const custName = customer.name || 'there';
    const lastItem = lastOrderedItems[customer.phone] || 'momos';
    const mincoins = customer.minCoins ?? 0;

    if (type === '3') {
      if (customer.totalOrders >= 4) {
        return `Hi ${custName},

Your favourite momo shop is in need of your help.

Shower some 5-stars on our profile?


https://g.page/r/CTktYzZw4C0KEAE/review


share teh screenshot and get a free campa cola

— Rashid from MinMomos`;
      }

      // Order count is 1, 2, or 3
      const discountMap: Record<number, number> = { 1: 15, 2: 10, 3: 5 };
      const discount = discountMap[customer.totalOrders] || 10;

      if (mincoins >= 50) {
        const redeemableItem = getRedeemableItem(mincoins);
        return `Hi ${custName},
Come get your free ${redeemableItem} using your mincoins

And dont forget the ${discount}% discount

See you soon
— Rashid from MinMomos`;
      } else {
        // mincoins < 50
        if (customer.totalOrders === 3) {
          return `Hi ${custName},

Your 5% OFF reward is waiting for you

The ${lastItem} told us to call you back.

— Rashid from MinMomos`;
        } else if (customer.totalOrders === 1) {
          return `Hi ${custName},

Your 15% OFF reward is waiting for you.

The ${lastItem} have been unusually quiet without you lately.

— Rashid from MinMomos`;
        } else {
          // totalOrders === 2
          return `Hi ${custName},

Your ${discount}% OFF reward is waiting for you.

The ${lastItem} told us to call you back.

— Rashid from MinMomos`;
        }
      }
    } else if (type === '6') {
      // 6 Days Ago List template: FREE OFFER FIRST (Deterministic TREAT-XXXX code)
      const cleaned = customer.phone.replace(/\D/g, '');
      const code = `TREAT-${cleaned.length >= 4 ? cleaned.slice(-4).toUpperCase() : 'COUPON'}`;
      
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 3);
      const dayNum = expiry.getDate();
      const monthName = expiry.toLocaleString('en-IN', { month: 'short' });
      const getSuffix = (day: number) => {
        if (day >= 11 && day <= 13) return 'th';
        switch (day % 10) {
          case 1: return 'st';
          case 2: return 'nd';
          case 3: return 'rd';
          default: return 'th';
        }
      };
      const expiryFormatted = `${dayNum}${getSuffix(dayNum)} ${monthName}`;

      return `Hi ${custName}! 🌟

Get a *FREE Mojito or Sweet Treat* on any order above ₹99 today with code *${code}*! 🎁

We have missed you for a week. See you today.

Expires after ${expiryFormatted}.

— Rashid from MinMomos`;
    } else {
      // mincoins redemption category
      const eligibleItems = getEligibleRedeemableItems(mincoins);
      const itemsListStr = eligibleItems.length > 0 
        ? eligibleItems.slice(0, 4).map(item => `• *${item}*`).join('\n')
        : '• *Momos*\n• *Mojito*';
      return `Hi ${custName}! 🪙

Good news! You have *${mincoins} MinCoins* in your account.

You are eligible to claim any of the following items for *FREE*:
${itemsListStr}

Come on in or order today to redeem your rewards! 🎉

— Rashid from MinMomos`;
    }
  };

  const handleSendMessage = (customer: Customer, type: '3' | '6' | 'mincoins') => {
    if (type === '6') {
      const cleaned = customer.phone.replace(/\D/g, '');
      const couponCode = `TREAT-${cleaned.length >= 4 ? cleaned.slice(-4).toUpperCase() : 'COUPON'}`;
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 3);
      addMarketingCoupon(customer.phone, customer.name || 'Valued Customer', couponCode, expiry);
    }

    const message = generateMessage(customer, type);
    const encoded = encodeURIComponent(message);
    const phoneDigits = customer.phone.replace(/\D/g, '');
    const url = `https://wa.me/${phoneDigits}?text=${encoded}`;
    
    // Open the browser WhatsApp redirection
    window.open(url, '_blank');

    if (dateConfig) {
      const key = getSentKey(customer.phone, dateConfig.baseStr, type.toString());
      saveSentMap({ ...sentMap, [key]: true });
    }
  };

  const handleToggleSent = (phone: string, type: '3' | '6' | 'mincoins') => {
    if (!dateConfig) return;
    const key = getSentKey(phone, dateConfig.baseStr, type.toString());
    const nextMap = { ...sentMap };
    const isAdding = !nextMap[key];

    if (isAdding && type === '6') {
      const customer = customers.find(c => c.phone === phone);
      if (customer) {
        const cleaned = phone.replace(/\D/g, '');
        const couponCode = `TREAT-${cleaned.length >= 4 ? cleaned.slice(-4).toUpperCase() : 'COUPON'}`;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 3);
        addMarketingCoupon(phone, customer.name || 'Valued Customer', couponCode, expiry);
      }
    }

    if (nextMap[key]) {
      delete nextMap[key];
    } else {
      nextMap[key] = true;
    }
    saveSentMap(nextMap);
  };

  const togglePreview = (phone: string, type: '3' | '6' | 'mincoins') => {
    const key = `${phone}_${type}`;
    setExpandedPreviews(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div id="marketing-campaign-hub" className="flex flex-col h-full bg-brand-cream/40 overflow-hidden relative font-sans">
      {/* Top Header Section */}
      <div className="p-6 lg:p-8 bg-white border-b border-brand-brown/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-sm animate-fade-in">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg">
              <Sparkles className="w-5 h-5 text-indigo-600" />
            </span>
            <h1 className="text-xl lg:text-2xl font-black text-brand-brown uppercase tracking-tight italic">
              Promo Campaigns Desk
            </h1>
          </div>
          <p className="text-xs text-brand-brown/60 font-medium">
            Daily retention marketing automation. Target dormant customers and active reward holders via WhatsApp campaigns.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => setIsFreeTagsModalOpen(true)}
            id="manage-free-tags-btn"
            type="button"
            className="flex items-center gap-1.5 p-2.5 px-4 bg-brand-red hover:opacity-90 text-white shadow-md hover:shadow-lg transition-all duration-200 rounded-xl text-[10px] font-black uppercase tracking-wider outline-none cursor-pointer"
          >
            <Gift className="w-3.5 h-3.5 text-white animate-pulse" />
            Manage Free Item Tags
          </button>
          <button
            onClick={() => setIsDiscountTagsModalOpen(true)}
            id="manage-discount-tags-btn"
            type="button"
            className="flex items-center gap-1.5 p-2.5 px-4 bg-indigo-600 hover:bg-indigo-750 text-white shadow-md hover:shadow-lg transition-all duration-200 rounded-xl text-[10px] font-black uppercase tracking-wider outline-none cursor-pointer"
          >
            <Gift className="w-3.5 h-3.5 text-white animate-pulse" />
            Manage Discount Tags
          </button>
          <button
            onClick={() => setReloadKey(prev => prev + 1)}
            id="sync-customers-btn"
            type="button"
            className="flex items-center gap-1.5 p-2.5 px-4 bg-brand-stone/20 text-brand-brown hover:bg-brand-stone/35 duration-200 transition-all rounded-xl text-[10px] font-black uppercase tracking-wider outline-none cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Sync Customer Stats
          </button>
        </div>
      </div>

      {/* Main Filter & Config Toolbar */}
      <div className="p-6 pb-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* Date Selector input */}
        <div className="col-span-1 md:col-span-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-brand-brown/15 p-2.5 px-4 rounded-xl shadow-xs w-full">
            <Calendar className="w-4 h-4 text-brand-brown/50 shrink-0" />
            <span className="text-[10px] font-black uppercase text-brand-brown/40 tracking-wider">Select Campaign Date:</span>
            <input
              type="date"
              id="campaign-date-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="flex-1 text-xs font-bold text-brand-brown bg-transparent border-none outline-none focus:ring-0 text-right cursor-pointer"
            />
          </div>
        </div>

        {/* Live Filter bar */}
        <div className="col-span-1 md:col-span-4 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-brown/40" />
          <input
            type="text"
            id="campaign-search-input"
            placeholder="Search matching customer name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2.5 pl-9 bg-white border border-brand-brown/15 rounded-xl text-xs font-bold text-brand-brown placeholder-brand-brown/40 focus:outline-none focus:border-brand-yellow duration-150 transition-colors shadow-xs"
          />
        </div>

        <div className="col-span-1 md:col-span-3 text-right">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-brand-brown/50 tracking-wider bg-brand-stone/15 p-1 px-3 rounded-full">
            <Users className="w-3.5 h-3.5" />
            {customers.length} Contacts
          </div>
        </div>
      </div>

      {/* Header Helper banner explaining current days logic */}
      {dateConfig && (
        <div className="mx-6 mt-4 p-4 bg-brand-stone/10 border border-brand-brown/5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div className="flex gap-2.5 items-start">
            <AlertCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-black uppercase tracking-wide text-brand-brown">
                Active Target Logic for {dateConfig.baseDisplay}
              </h4>
              <p className="text-[11px] font-medium text-brand-brown/70 leading-relaxed mt-0.5">
                • <b>3 Days Ago Cohort</b> targets customers who ordered on <b>{dateConfig.d3Display}</b> and have not ordered since.<br />
                • <b>6 Days Ago Cohort</b> targets customers who ordered on <b>{dateConfig.d6Display}</b> and have not ordered since (Free rewards hook up front).<br />
                • <b>MinCoins Rewards</b> targets loyal customers who hold enough MinCoins in their profile to claim free items.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="p-1.5 px-3 bg-rose-50 border border-rose-100 rounded-xl text-[10px] font-extrabold uppercase text-rose-700">
              3D Date: {dateConfig.d3Str}
            </span>
            <span className="p-1.5 px-3 bg-amber-50 border border-amber-100 rounded-xl text-[10px] font-extrabold uppercase text-amber-700">
              6D Date: {dateConfig.d6Str}
            </span>
            <span className="p-1.5 px-3 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-extrabold uppercase text-indigo-700">
              🪙 Rewards Active
            </span>
          </div>
        </div>
      )}

      {/* Lists Split Dashboard Area */}
      <div className="p-6 lg:p-8 flex-1 overflow-y-auto no-scrollbar pb-24">
        {isLoading ? (
          <div className="bg-white border border-brand-brown/10 rounded-2xl p-16 text-center shadow-xs">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
            <p className="text-xs font-black text-brand-brown/60 uppercase tracking-widest">Loading Customers Records...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Customer Life Cycle Funnel Component */}
            <div id="customer-journey-funnel-card" className="bg-white border border-brand-brown/10 rounded-3xl p-6 shadow-xs flex flex-col mb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-brown/5 pb-4 mb-6">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
                    <h2 className="text-sm font-black text-brand-brown uppercase tracking-wider">
                      Customer Journey Lifecycle Funnel (1st to 5th Order)
                    </h2>
                  </div>
                  <p className="text-[11px] font-semibold text-brand-brown/60 leading-relaxed">
                    Flow-staged view of customer graduation. Click any sublayer to view qualified dormant or active customers and target them directly with personalized WhatsApp promotions.
                  </p>
                </div>
                {searchTerm && (
                  <span className="p-1 px-3 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-black rounded-lg shrink-0 self-start md:self-auto">
                    Filtered by Search
                  </span>
                )}
              </div>

              {/* Dynamic Funnel stack */}
              <div className="space-y-4 max-w-5xl mx-auto w-full">
                {funnelLayers.map((layer, idx) => {
                  // Decreasing widths to create the wedge/funnel illusion
                  const widthClass = 
                    idx === 0 ? 'w-full' :
                    idx === 1 ? 'md:w-[96%] w-full' :
                    idx === 2 ? 'md:w-[92%] w-full' :
                    idx === 3 ? 'md:w-[88%] w-full' :
                    'md:w-[84%] w-full';

                  const colorStyles = 
                    layer.color === 'rose' ? { border: 'border-rose-100 bg-rose-50/15', header: 'bg-rose-50 border-rose-100 text-rose-700', text: 'text-rose-700' } :
                    layer.color === 'amber' ? { border: 'border-amber-100 bg-amber-50/15', header: 'bg-amber-50 border-amber-100 text-amber-700', text: 'text-amber-700' } :
                    layer.color === 'emerald' ? { border: 'border-emerald-100 bg-emerald-50/15', header: 'bg-emerald-50 border-emerald-100 text-emerald-700', text: 'text-emerald-700' } :
                    layer.color === 'indigo' ? { border: 'border-indigo-100 bg-indigo-50/15', header: 'bg-indigo-50 border-indigo-100 text-indigo-700', text: 'text-indigo-700' } :
                    { border: 'border-violet-100 bg-violet-50/15', header: 'bg-violet-50 border-violet-100 text-violet-700', text: 'text-violet-700' };

                  return (
                    <div 
                      key={layer.level} 
                      className={`mx-auto ${widthClass} border ${colorStyles.border} rounded-2xl overflow-hidden shadow-xs transition-all duration-200`}
                    >
                      {/* Layer Header line */}
                      <div className={`p-3 px-4 flex items-center justify-between ${colorStyles.header} border-b`}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black px-2 py-0.5 bg-white/85 rounded-md shadow-2xs text-brand-brown">L{layer.level}</span>
                          <span className="text-xs font-black uppercase tracking-wider">{layer.label}</span>
                        </div>
                        <span className="p-1 px-3 bg-white/90 text-[10px] font-black rounded-lg shadow-2xs text-brand-brown">
                          {layer.totalCount} customers
                        </span>
                      </div>

                      {/* Sublayers container (showing 4 durations) */}
                      <div className="p-3 bg-white grid grid-cols-2 md:grid-cols-4 gap-2">
                        {layer.sublayers.map((sub) => {
                          const subKey = `${layer.level}_${sub.key}`;
                          const isExpanded = !!expandedSublayers[subKey];
                          const hasCustomers = sub.count > 0;

                          return (
                            <button
                              key={sub.key}
                              type="button"
                              onClick={() => {
                                if (hasCustomers) {
                                  setExpandedSublayers(prev => ({ ...prev, [subKey]: !prev[subKey] }));
                                }
                              }}
                              disabled={!hasCustomers}
                              className={`p-2.5 border rounded-xl flex flex-col items-start text-left transition-all duration-150 relative ${
                                !hasCustomers 
                                  ? 'opacity-40 cursor-not-allowed border-brand-stone/10 bg-brand-stone/5' 
                                  : isExpanded 
                                    ? `${sub.textClass} scale-[1.02] ring-1 ring-indigo-500 ring-offset-1`
                                    : 'border-brand-brown/10 bg-brand-cream/5 hover:bg-brand-cream/10 cursor-pointer hover:border-brand-brown/20'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1 w-full justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-brown/60 truncate">
                                  {sub.label}
                                </span>
                                <span className={`w-1.5 h-1.5 rounded-full ${sub.dotBg}`}></span>
                              </div>
                              <span className="text-xs font-black text-brand-brown">
                                {sub.count} qualified
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Expanded Sublayer customer tables container */}
                      {layer.sublayers.map((sub) => {
                        const subKey = `${layer.level}_${sub.key}`;
                        const isExpanded = !!expandedSublayers[subKey] && sub.count > 0;

                        if (!isExpanded) return null;

                        const activeQueue = sublayerQueue.isActive && sublayerQueue.level === layer.level && sublayerQueue.subKey === sub.key;

                        return (
                          <div key={sub.key} className="border-t border-brand-brown/10 bg-brand-stone/5 p-4 transition-all animate-fade-in space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase text-brand-brown/50 tracking-wider">
                                Customers for {layer.label} — {sub.label} (Older on top)
                              </span>
                              <span className="text-[9px] text-brand-brown/40 font-bold bg-white/85 px-2 py-0.5 rounded-md border border-brand-brown/5">
                                Showing {sub.count} Profiles
                              </span>
                            </div>

                            {/* Template Customizer Box */}
                            <div className="bg-white p-4 rounded-2xl border border-brand-brown/10 shadow-xs">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
                                <div>
                                  <h5 className="text-[10px] font-black uppercase text-brand-brown tracking-wider flex items-center gap-1.5">
                                    <MessageSquare className="w-3.5 h-3.5 text-indigo-650" />
                                    Custom WhatsApp Campaign Format
                                  </h5>
                                  <p className="text-[10px] text-brand-brown/50 font-bold uppercase tracking-wider mt-0.5">
                                    Format message template below. Use brackets for dynamic variables.
                                  </p>
                                </div>
                                <span className="p-1 px-2.5 bg-brand-cream/40 border border-brand-brown/10 text-brand-brown text-[8px] font-black uppercase rounded-lg self-start">
                                  Segment ID: L{layer.level}_{sub.key}
                                </span>
                              </div>

                              <textarea
                                rows={3}
                                value={sublayerTemplates[subKey] || getDefaultTemplate(layer.level, sub.key)}
                                onChange={(e) => saveSublayerTemplate(subKey, e.target.value)}
                                className="w-full text-xs font-semibold text-brand-brown p-3 rounded-xl border border-brand-brown/10 focus:outline-none focus:ring-1 focus:ring-brand-brown/30 focus:border-transparent font-mono bg-brand-cream/5"
                                placeholder="Enter custom Whatsapp script..."
                              />
                              
                              <div className="flex flex-wrap items-center justify-between mt-2.5 gap-3">
                                <div className="flex flex-wrap gap-1.5 items-center">
                                  <span className="text-[9px] font-black text-brand-brown/40 uppercase tracking-wider mr-1">Insert Tags:</span>
                                  {['{name}', '{coins}', '{days}', '{level}', '{free_item_tag}', '{discount_tag}'].map(tag => (
                                    <button
                                      key={tag}
                                      type="button"
                                      onClick={() => {
                                        const current = sublayerTemplates[subKey] || getDefaultTemplate(layer.level, sub.key);
                                        saveSublayerTemplate(subKey, current + ' ' + tag);
                                      }}
                                      className="p-1 px-2 text-[9px] font-bold text-brand-brown bg-brand-stone/15 hover:bg-brand-stone/25 border border-brand-brown/5 rounded-md cursor-pointer outline-none transition-all duration-100"
                                    >
                                      {tag}
                                    </button>
                                  ))}
                                </div>
                                
                                <button
                                  type="button"
                                  onClick={() => handleStartSublayerBroadcast(layer.level, sub.key, sub.customers)}
                                  className="p-2 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700 rounded-xl text-[9px] font-black uppercase tracking-wider shadow-xs flex items-center gap-1.5 duration-150 transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                                >
                                  <Play className="w-3 h-3 fill-white" />
                                  Launch Broadcast Campaign ({sub.customers.filter(c => !isWithinMessageCooldown(c.phone).isCooling).length} Ready)
                                </button>
                              </div>

                              {/* BUNDLE ATTACHED PROMO REWARDS GRID */}
                              <div className="mt-4 pt-3.5 border-t border-brand-brown/10">
                                <span className="text-[9px] font-black uppercase text-brand-brown/45 tracking-wider block mb-2.5">
                                  🔗 Attached Campaign Promo Rewards (Automatically linked and claimed on message delivery)
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {/* Free Item Selection */}
                                  <div className="flex items-center justify-between gap-3 bg-brand-cream/10 p-2.5 rounded-xl border border-brand-brown/10">
                                    <div className="min-w-0 flex items-center gap-2">
                                      <Gift className="w-3.5 h-3.5 text-brand-red shrink-0" />
                                      <span className="text-[10px] font-black uppercase text-brand-brown leading-none">Free Item Gift</span>
                                    </div>
                                    <select
                                      value={sublayerFreeItemTags[subKey] || ''}
                                      onChange={(e) => handleSaveSublayerFreeTag(subKey, e.target.value)}
                                      className="text-[11px] font-bold text-brand-brown py-1 px-2.5 bg-white border border-brand-brown/15 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-brown/30 cursor-pointer max-w-[180px] sm:max-w-[200px] truncate"
                                    >
                                      <option value="">-- No Free Gift --</option>
                                      {freeItemTags.map(tag => {
                                        const isExpired = new Date(tag.expiresAt) < new Date();
                                        return (
                                          <option key={tag.id} value={tag.id} disabled={isExpired}>
                                            {tag.code} (Free {tag.itemName}) {isExpired ? '[EXPIRED]' : ''}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>

                                  {/* Discount Selection */}
                                  <div className="flex items-center justify-between gap-3 bg-brand-cream/10 p-2.5 rounded-xl border border-brand-brown/10">
                                    <div className="min-w-0 flex items-center gap-2">
                                      <Gift className="w-3.5 h-3.5 text-indigo-650 shrink-0" />
                                      <span className="text-[10px] font-black uppercase text-brand-brown leading-none">Promo Discount</span>
                                    </div>
                                    <select
                                      value={sublayerDiscountTags[subKey] || ''}
                                      onChange={(e) => handleSaveSublayerDiscountTag(subKey, e.target.value)}
                                      className="text-[11px] font-bold text-brand-brown py-1 px-2.5 bg-white border border-brand-brown/15 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-brown/30 cursor-pointer max-w-[180px] sm:max-w-[200px] truncate"
                                    >
                                      <option value="">-- No Discount --</option>
                                      {discountTags.map(tag => {
                                        const isExpired = new Date(tag.expiresAt) < new Date();
                                        return (
                                          <option key={tag.id} value={tag.id} disabled={isExpired}>
                                            {tag.code} ({tag.discountPercentage}% Off) {isExpired ? '[EXPIRED]' : ''}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Sequential Campaign Broadcast Assistant Card */}
                            {activeQueue && (
                              <div className="bg-indigo-900 text-white p-4 rounded-2xl border border-indigo-950 shadow-sm animate-fade-in space-y-3">
                                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    <h5 className="text-[10px] font-black uppercase tracking-wider">
                                      Broadcast Queue Active ({sub.label})
                                    </h5>
                                  </div>
                                  <span className="text-[10px] font-bold bg-white/15 px-2.5 py-0.5 rounded-lg">
                                    {sublayerQueue.currentIndex + 1} of {sublayerQueue.customers.length} Contacts
                                  </span>
                                </div>

                                {sublayerQueue.customers[sublayerQueue.currentIndex] ? (
                                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white/5 p-3.5 rounded-xl border border-white/5">
                                    <div>
                                      <span className="text-[10px] text-white/60 font-black uppercase tracking-wider">Current Target</span>
                                      <h6 className="text-sm font-black text-white mt-0.5">
                                        {sublayerQueue.customers[sublayerQueue.currentIndex].name || 'Valued Customer'} 
                                        <span className="font-mono text-xs font-medium text-white/55 ml-2">({sublayerQueue.customers[sublayerQueue.currentIndex].phone})</span>
                                      </h6>
                                      <p className="text-[9px] text-indigo-200/80 font-semibold mt-1">
                                        🪙 Wallet: {sublayerQueue.customers[sublayerQueue.currentIndex].minCoins ?? 0} Coins | {getDaysInLayer(sublayerQueue.customers[sublayerQueue.currentIndex], selectedDate)} days dormant
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleSublayerQueueNext('send')}
                                        className="py-2 px-3 bg-emerald-500 hover:bg-emerald-600 border border-emerald-600 text-white text-[9px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer transition-all duration-150 shadow-xs"
                                      >
                                        <MessageCircle className="w-3 h-3 text-white" />
                                        Send & Next
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSublayerQueueNext('skip')}
                                        className="py-2 px-3 bg-white/10 hover:bg-white/20 text-white border border-white/10 text-[9px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer transition-all duration-150"
                                      >
                                        <SkipForward className="w-3 h-3 text-white" />
                                        Skip
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSublayerQueueNext('cancel')}
                                        className="py-2 px-3 bg-rose-500/85 hover:bg-rose-600 border border-rose-600 text-white text-[9px] font-black uppercase tracking-wider rounded-lg cursor-pointer transition-all duration-150"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-center py-2 text-xs font-bold text-white/70">
                                    Queue complete! All broadcasts finished.
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Customer Table */}
                            <div className="bg-white rounded-2xl border border-brand-brown/10 overflow-hidden shadow-xs">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-brand-stone/10 border-b border-brand-brown/10 text-[9px] font-black text-brand-brown/50 uppercase tracking-wider">
                                    <th className="py-2.5 px-4">Customer Name & Phone</th>
                                    <th className="py-2.5 px-4 text-center">Wallet Status</th>
                                    <th className="py-2.5 px-4 text-center">Duration In Layer</th>
                                    <th className="py-2.5 px-4 text-center">Last Message Sent</th>
                                    <th className="py-2.5 px-4 text-center">Quick Promo Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-brand-brown/10 text-xs font-semibold text-brand-brown">
                                  {sub.customers.map((c) => {
                                    const daysInLayer = getDaysInLayer(c, selectedDate);
                                    const isSent = !!sentMap[getSentKey(c.phone, selectedDate, `funnel_${layer.level}`)];
                                    
                                    // Cooldown Evaluation check
                                    const cd = isWithinMessageCooldown(c.phone);
                                    const lastMsgTime = getLastMessageSentTime(c.phone);
                                    const lastSentLabel = lastMsgTime 
                                      ? new Date(lastMsgTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                      : 'Never Sent';

                                    return (
                                      <tr key={c.id} className="hover:bg-brand-cream/15 transition-colors">
                                        <td className="py-3 px-4">
                                          <span className="font-extrabold text-brand-brown text-sm block">{c.name || 'Valued Customer'}</span>
                                          <span className="text-xs font-mono text-brand-brown/60 block mt-0.5">{c.phone}</span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                          <div className="flex flex-col items-center gap-1">
                                            <span className="text-[9px] uppercase font-black text-brand-brown bg-brand-stone/30 p-0.5 px-1.5 rounded-md">
                                              Orders: {c.totalOrders}
                                            </span>
                                            <span className="text-[9px] uppercase font-black text-indigo-700 bg-indigo-50 border border-indigo-100 p-0.5 px-1.5 rounded-md">
                                              🪙 {c.minCoins ?? 0} Coins
                                            </span>
                                          </div>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                          <span className="font-bold text-xs text-brand-brown">
                                            {daysInLayer} days
                                          </span>
                                          <span className="text-[9px] text-brand-brown/50 block font-bold uppercase tracking-wide">
                                            Since Last Order
                                          </span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                          <div className="flex flex-col items-center justify-center gap-1">
                                            <span className="text-xs font-bold text-brand-brown/80">{lastSentLabel}</span>
                                            {cd.isCooling ? (
                                              <div className="flex flex-col items-center gap-1">
                                                <span className="text-[9px] font-black uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                  <Clock className="w-2.5 h-2.5 text-rose-600" />
                                                  Cooling ({cd.daysLeft}d)
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() => handleUnblockCustomer(c.phone)}
                                                  className="mt-0.5 text-[8px] font-black text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded uppercase tracking-wider transition-colors duration-100 cursor-pointer flex items-center gap-0.5 shadow-sm"
                                                  title="Manually bypass the 6-day cooling period for this customer"
                                                >
                                                  🔓 Unblock
                                                </button>
                                              </div>
                                            ) : lastMsgTime ? (
                                              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                                                ✅ Available
                                              </span>
                                            ) : null}
                                          </div>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                          <div className="flex items-center justify-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => handleSendFunnelMessage(c, layer.level, daysInLayer, sub.key)}
                                              disabled={cd.isCooling}
                                              className={`inline-flex items-center gap-1.5 p-1.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider duration-150 transition-colors border outline-none cursor-pointer ${
                                                cd.isCooling
                                                  ? 'bg-brand-stone/5 border-brand-stone/10 text-brand-brown/30 cursor-not-allowed opacity-60'
                                                  : isSent 
                                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100'
                                                    : 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700'
                                              }`}
                                            >
                                              {cd.isCooling ? 'Blocked' : isSent ? 'Resend' : 'Send'}
                                              <MessageCircle className="w-3 h-3" />
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => handleToggleFunnelSent(c.phone, layer.level)}
                                              className={`p-1.5 rounded-lg border duration-150 transition-colors cursor-pointer outline-none ${
                                                isSent 
                                                  ? 'bg-emerald-100 border-emerald-300 text-emerald-700 opacity-80'
                                                  : 'bg-brand-stone/10 border-brand-brown/10 text-brand-brown/30 hover:bg-brand-stone/20'
                                              }`}
                                              title={isSent ? 'Mark as unsent' : 'Mark as sent'}
                                            >
                                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
            
            {/* List 1 Card: 3 Days Ago List */}
            <div id="cohort-3days-card" className="bg-white border border-brand-brown/10 rounded-3xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-5 bg-rose-500/5 border-b border-brand-brown/10 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                    <h3 className="text-xs font-black text-brand-brown uppercase tracking-wider">
                      1. Ordered 3 Days Ago
                    </h3>
                  </div>
                  <p className="text-[10px] text-brand-brown/50 font-bold mt-0.5 uppercase tracking-wide">
                    Last visited on {dateConfig?.d3Display}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {filteredList3Days.length > 0 && !queues['3'].isActive && (
                    <button
                      type="button"
                      onClick={() => startCampaignQueue('3')}
                      className="p-1 px-2.5 bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-black uppercase tracking-wider rounded-lg transition-all shadow-xs shrink-0 cursor-pointer flex items-center gap-1 hover:scale-103 duration-150"
                    >
                      <Play className="w-2.5 h-2.5 fill-white" />
                      Send All
                    </button>
                  )}
                  <span className="p-1 px-3 bg-rose-100 text-rose-700 text-[10px] font-black rounded-lg whitespace-nowrap">
                    {filteredList3Days.length} qualified
                  </span>
                </div>
              </div>

              {/* Table Body list of 3-days dormant */}
              {queues['3'].isActive ? (
                <div className="p-5 bg-brand-stone/5 flex-1 flex flex-col min-h-[460px]">
                  {renderQueueAssistant('3')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-brand-stone/10 border-b border-brand-brown/10 text-[9px] font-black text-brand-brown/50 uppercase tracking-wider">
                        <th className="py-3 px-5">Profile</th>
                        <th className="py-3 px-5 text-center">Campaign Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-brown/10 text-xs font-semibold text-brand-brown">
                      {filteredList3Days.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="py-12 text-center text-brand-brown/40 uppercase tracking-wider font-extrabold text-[10px]">
                            No customers met matching conditions
                          </td>
                        </tr>
                      ) : (
                        filteredList3Days.map((c) => {
                          const hasSentKey = dateConfig ? getSentKey(c.phone, dateConfig.baseStr, '3') : '';
                          const isSent = !!sentMap[hasSentKey];
                          const isExpanded = !!expandedPreviews[`${c.phone}_3`];
                          const lastItem = lastOrderedItems[c.phone];

                          return (
                            <React.Fragment key={c.id}>
                              <tr className="hover:bg-brand-cream/15 transition-colors">
                                <td className="py-4 px-5">
                                  <span className="font-extrabold text-brand-brown text-sm block">{c.name || 'Valued Customer'}</span>
                                  <span className="text-xs font-mono text-brand-brown/60 block mt-0.5">{c.phone}</span>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                    <span className="text-[9px] uppercase font-black text-brand-brown bg-brand-stone/30 p-0.5 px-1.5 rounded-md">
                                      Orders: {c.totalOrders}
                                    </span>
                                    <span className="text-[9px] uppercase font-black text-indigo-700 bg-indigo-50 border border-indigo-100 p-0.5 px-1.5 rounded-md">
                                      🪙 {c.minCoins ?? 0} Coins
                                    </span>
                                    {lastItem !== undefined && (
                                      <span className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-100 p-0.5 px-1.5 rounded-md max-w-[130px] truncate" title={lastItem}>
                                        Last: {lastItem}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-5 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => togglePreview(c.phone, '3')}
                                      className={`p-1.5 rounded-lg border duration-150 transition-colors cursor-pointer outline-none ${
                                        isExpanded 
                                          ? 'bg-indigo-600 border-indigo-700 text-white' 
                                          : 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100'
                                      }`}
                                      title={isExpanded ? "Hide Draft Preview" : "View Draft Preview"}
                                    >
                                      {isExpanded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleSendMessage(c, '3')}
                                      className={`inline-flex items-center gap-1.5 p-1.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider duration-150 transition-colors border outline-none cursor-pointer ${
                                        isSent 
                                          ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
                                          : 'bg-rose-600 border-rose-700 text-white hover:bg-rose-700'
                                      }`}
                                    >
                                      {isSent ? 'Resend' : 'Send'}
                                      <MessageCircle className="w-3 h-3" />
                                    </button>
                                    
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSent(c.phone, '3')}
                                      className={`p-1.5 rounded-lg border duration-150 transition-colors cursor-pointer outline-none ${
                                        isSent 
                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                                          : 'bg-brand-stone/10 border-brand-brown/10 text-brand-brown/30 hover:bg-brand-stone/20'
                                      }`}
                                      title={isSent ? 'Mark as unsent' : 'Mark as sent'}
                                    >
                                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-brand-stone/5">
                                  <td colSpan={2} className="px-5 py-3 border-t border-b border-brand-brown/5">
                                    <div className="p-3 bg-white border border-brand-brown/10 rounded-xl w-full shadow-xs">
                                      <div className="flex items-center justify-between border-b border-brand-brown/5 pb-1.5 mb-2">
                                        <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider">WhatsApp Message Preview (3D Template)</span>
                                        <span className="text-[9px] text-brand-brown/40 font-bold">
                                          (Orders: {c.totalOrders}, Coins: {c.minCoins ?? 0})
                                        </span>
                                      </div>
                                      <pre className="text-[11px] font-medium font-sans whitespace-pre-wrap text-left text-brand-brown leading-relaxed bg-brand-cream/10 p-2.5 rounded-lg border border-brand-brown/5 text-brand-brown/80">
                                        {generateMessage(c, '3')}
                                      </pre>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* List 2 Card: 6 Days Ago List */}
            <div id="cohort-6days-card" className="bg-white border border-brand-brown/10 rounded-3xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-5 bg-amber-505/5 border-b border-brand-brown/10 flex items-center justify-between" style={{ backgroundColor: 'rgba(217, 119, 6, 0.05)' }}>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                    <h3 className="text-xs font-black text-brand-brown uppercase tracking-wider">
                      2. Ordered 6 Days Ago
                    </h3>
                  </div>
                  <p className="text-[10px] text-brand-brown/50 font-bold mt-0.5 uppercase tracking-wide">
                    Last visited on {dateConfig?.d6Display}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {filteredList6Days.length > 0 && !queues['6'].isActive && (
                    <button
                      type="button"
                      onClick={() => startCampaignQueue('6')}
                      className="p-1 px-2.5 bg-amber-600 hover:bg-amber-705 text-white text-[9px] font-black uppercase tracking-wider rounded-lg transition-all shadow-xs shrink-0 cursor-pointer flex items-center gap-1 hover:scale-103 duration-150"
                    >
                      <Play className="w-2.5 h-2.5 fill-white" />
                      Send All
                    </button>
                  )}
                  <span className="p-1 px-3 bg-amber-100 text-amber-700 text-[10px] font-black rounded-lg whitespace-nowrap">
                    {filteredList6Days.length} qualified
                  </span>
                </div>
              </div>

              {/* Table Body list of 6-days dormant */}
              {queues['6'].isActive ? (
                <div className="p-5 bg-brand-stone/5 flex-1 flex flex-col min-h-[460px]">
                  {renderQueueAssistant('6')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-brand-stone/10 border-b border-brand-brown/10 text-[9px] font-black text-brand-brown/50 uppercase tracking-wider">
                        <th className="py-3 px-5">Profile</th>
                        <th className="py-3 px-5 text-center">Campaign Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-brown/10 text-xs font-semibold text-brand-brown">
                      {filteredList6Days.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="py-12 text-center text-brand-brown/40 uppercase tracking-wider font-extrabold text-[10px]">
                            No customers met matching conditions
                          </td>
                        </tr>
                      ) : (
                        filteredList6Days.map((c) => {
                          const hasSentKey = dateConfig ? getSentKey(c.phone, dateConfig.baseStr, '6') : '';
                          const isSent = !!sentMap[hasSentKey];
                          const isExpanded = !!expandedPreviews[`${c.phone}_6`];
                          const lastItem = lastOrderedItems[c.phone];

                          return (
                            <React.Fragment key={c.id}>
                              <tr className="hover:bg-brand-cream/15 transition-colors">
                                <td className="py-4 px-5">
                                  <span className="font-extrabold text-brand-brown text-sm block">{c.name || 'Valued Customer'}</span>
                                  <span className="text-xs font-mono text-brand-brown/60 block mt-0.5">{c.phone}</span>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                    <span className="text-[9px] uppercase font-black text-brand-brown bg-brand-stone/30 p-0.5 px-1.5 rounded-md">
                                      Orders: {c.totalOrders}
                                    </span>
                                    <span className="text-[9px] uppercase font-black text-indigo-700 bg-indigo-50 border border-indigo-100 p-0.5 px-1.5 rounded-md">
                                      🪙 {c.minCoins ?? 0} Coins
                                    </span>
                                    {lastItem !== undefined && (
                                      <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 p-0.5 px-1.5 rounded-md max-w-[130px] truncate" title={lastItem}>
                                        Last: {lastItem}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-5 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => togglePreview(c.phone, '6')}
                                      className={`p-1.5 rounded-lg border duration-150 transition-colors cursor-pointer outline-none ${
                                        isExpanded 
                                          ? 'bg-indigo-600 border-indigo-700 text-white' 
                                          : 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100'
                                      }`}
                                      title={isExpanded ? "Hide Draft Preview" : "View Draft Preview"}
                                    >
                                      {isExpanded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleSendMessage(c, '6')}
                                      className={`inline-flex items-center gap-1.5 p-1.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider duration-150 transition-colors border outline-none cursor-pointer ${
                                        isSent 
                                          ? 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'
                                          : 'bg-amber-600 border-amber-700 text-white hover:bg-amber-700'
                                      }`}
                                    >
                                      {isSent ? 'Resend' : 'Send'}
                                      <MessageCircle className="w-3 h-3" />
                                    </button>
                                    
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSent(c.phone, '6')}
                                      className={`p-1.5 rounded-lg border duration-150 transition-colors cursor-pointer outline-none ${
                                        isSent 
                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                                          : 'bg-brand-stone/10 border-brand-brown/10 text-brand-brown/30 hover:bg-brand-stone/20'
                                      }`}
                                      title={isSent ? 'Mark as unsent' : 'Mark as sent'}
                                    >
                                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-brand-stone/5">
                                  <td colSpan={2} className="px-5 py-3 border-t border-b border-brand-brown/5">
                                    <div className="p-3 bg-white border border-brand-brown/10 rounded-xl w-full shadow-xs">
                                      <div className="flex items-center justify-between border-b border-brand-brown/5 pb-1.5 mb-2">
                                        <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider">WhatsApp Message Preview (6D Template)</span>
                                        <span className="text-[9px] text-brand-brown/40 font-bold">
                                          (Orders: {c.totalOrders}, Coins: {c.minCoins ?? 0})
                                        </span>
                                      </div>
                                      <pre className="text-[11px] font-medium font-sans whitespace-pre-wrap text-left text-brand-brown leading-relaxed bg-brand-cream/10 p-2.5 rounded-lg border border-brand-brown/5 text-brand-brown/80">
                                        {generateMessage(c, '6')}
                                      </pre>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* List 3 Card: MinCoins Redemption Eligible */}
            <div id="cohort-mincoins-card" className="bg-white border border-brand-brown/10 rounded-3xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-5 bg-indigo-505/5 border-b border-brand-brown/10 flex items-center justify-between" style={{ backgroundColor: 'rgba(79, 70, 229, 0.05)' }}>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
                    <h3 className="text-xs font-black text-brand-brown uppercase tracking-wider">
                      3. MinCoins Rewards Claims
                    </h3>
                  </div>
                  <p className="text-[10px] text-brand-brown/50 font-bold mt-0.5 uppercase tracking-wide">
                    Has enough coins to claim free items
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {filteredListMinCoins.length > 0 && !queues['mincoins'].isActive && (
                    <button
                      type="button"
                      onClick={() => startCampaignQueue('mincoins')}
                      className="p-1 px-2.5 bg-indigo-600 hover:bg-indigo-705 text-white text-[9px] font-black uppercase tracking-wider rounded-lg transition-all shadow-xs shrink-0 cursor-pointer flex items-center gap-1 hover:scale-103 duration-150"
                    >
                      <Play className="w-2.5 h-2.5 fill-white" />
                      Send All
                    </button>
                  )}
                  <span className="p-1 px-3 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-lg whitespace-nowrap">
                    {filteredListMinCoins.length} qualified
                  </span>
                </div>
              </div>

              {/* Table Body list of MinCoins eligible */}
              {queues['mincoins'].isActive ? (
                <div className="p-5 bg-brand-stone/5 flex-1 flex flex-col min-h-[460px]">
                  {renderQueueAssistant('mincoins')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-brand-stone/10 border-b border-brand-brown/10 text-[9px] font-black text-brand-brown/50 uppercase tracking-wider">
                        <th className="py-3 px-5">Profile</th>
                        <th className="py-3 px-5 text-center">Campaign Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-brown/10 text-xs font-semibold text-brand-brown">
                      {filteredListMinCoins.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="py-12 text-center text-brand-brown/40 uppercase tracking-wider font-extrabold text-[10px]">
                            No customers met matching conditions
                          </td>
                        </tr>
                      ) : (
                        filteredListMinCoins.map((c) => {
                          const hasSentKey = dateConfig ? getSentKey(c.phone, dateConfig.baseStr, 'mincoins') : '';
                          const isSent = !!sentMap[hasSentKey];
                          const isExpanded = !!expandedPreviews[`${c.phone}_mincoins`];
                          const eligibleItems = getEligibleRedeemableItems(c.minCoins ?? 0);

                          return (
                            <React.Fragment key={c.id}>
                              <tr className="hover:bg-brand-cream/15 transition-colors">
                                <td className="py-4 px-5">
                                  <span className="font-extrabold text-brand-brown text-sm block">{c.name || 'Valued Customer'}</span>
                                  <span className="text-xs font-mono text-brand-brown/60 block mt-0.5">{c.phone}</span>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                    <span className="text-[9px] uppercase font-black text-brand-brown bg-brand-stone/30 p-0.5 px-1.5 rounded-md">
                                      Orders: {c.totalOrders}
                                    </span>
                                    <span className="text-[9px] uppercase font-black text-indigo-700 bg-indigo-50 border border-indigo-100 p-0.5 px-1.5 rounded-md">
                                      🪙 {c.minCoins ?? 0} Coins
                                    </span>
                                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 p-0.5 px-1.5 rounded-md max-w-[130px] truncate" title={eligibleItems.join(', ')}>
                                      Can Claim: {eligibleItems[0] || 'rewards'} (+{Math.max(0, eligibleItems.length - 1)} more)
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-5 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => togglePreview(c.phone, 'mincoins')}
                                      className={`p-1.5 rounded-lg border duration-150 transition-colors cursor-pointer outline-none ${
                                        isExpanded 
                                          ? 'bg-indigo-600 border-indigo-700 text-white' 
                                          : 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100'
                                      }`}
                                      title={isExpanded ? "Hide Draft Preview" : "View Draft Preview"}
                                    >
                                      {isExpanded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleSendMessage(c, 'mincoins')}
                                      className={`inline-flex items-center gap-1.5 p-1.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider duration-150 transition-colors border outline-none cursor-pointer ${
                                        isSent 
                                          ? 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100'
                                          : 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700'
                                      }`}
                                    >
                                      {isSent ? 'Resend' : 'Send'}
                                      <MessageCircle className="w-3 h-3" />
                                    </button>
                                    
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSent(c.phone, 'mincoins')}
                                      className={`p-1.5 rounded-lg border duration-150 transition-colors cursor-pointer outline-none ${
                                        isSent 
                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                                          : 'bg-brand-stone/10 border-brand-brown/10 text-brand-brown/30 hover:bg-brand-stone/20'
                                      }`}
                                      title={isSent ? 'Mark as unsent' : 'Mark as sent'}
                                    >
                                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-brand-stone/5">
                                  <td colSpan={2} className="px-5 py-3 border-t border-b border-brand-brown/5">
                                    <div className="p-3 bg-white border border-brand-brown/10 rounded-xl w-full shadow-xs">
                                      <div className="flex items-center justify-between border-b border-brand-brown/5 pb-1.5 mb-2">
                                        <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider">WhatsApp Message Preview (MinCoins Template)</span>
                                        <span className="text-[9px] text-indigo-700">
                                          (Coins: {c.minCoins ?? 0})
                                        </span>
                                      </div>
                                      <pre className="text-[11px] font-medium font-sans whitespace-pre-wrap text-left text-brand-brown leading-relaxed bg-brand-cream/10 p-2.5 rounded-lg border border-brand-brown/5 text-brand-brown/80">
                                        {generateMessage(c, 'mincoins')}
                                      </pre>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </div>
        )}

        {/* Free Item Tags Management Modal */}
        {isFreeTagsModalOpen && (
          <div className="fixed inset-0 bg-brand-brown/45 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl border border-brand-brown/15 shadow-2xl max-w-2xl w-full p-6 space-y-6 relative overflow-hidden max-h-[85vh] flex flex-col">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-brand-brown/10 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-rose-50 border border-rose-100 rounded-lg text-brand-red">
                    <Gift className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-brand-brown uppercase tracking-wider">
                      Free Item Tag Manager
                    </h3>
                    <p className="text-[9px] font-semibold text-brand-brown/50 uppercase tracking-wide">
                      Create promo campaigns, set item rewards, and set custom expiration dates
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFreeTagsModalOpen(false)}
                  className="p-1.5 hover:bg-brand-stone/15 rounded-xl text-brand-brown/50 hover:text-brand-brown duration-100 outline-none cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Campaign Generator Form and Existing Tags List container */}
              <div className="flex-1 overflow-y-auto space-y-6 pr-1 no-scrollbar">
                
                {/* Generator Form */}
                <div className="bg-brand-cream/15 p-4 rounded-2xl border border-brand-brown/10 space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-brand-brown/70 tracking-wider">
                    Generate Free Item Tag
                  </h4>
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const codeInput = form.elements.namedItem('tagCode') as HTMLInputElement;
                      const itemSelect = form.elements.namedItem('freeItem') as HTMLSelectElement;
                      const expiryInput = form.elements.namedItem('expiresAt') as HTMLInputElement;

                      const code = codeInput.value.trim().toUpperCase().replace(/\s+/g, '_');
                      const itemName = itemSelect.value;
                      const expiresAt = expiryInput.value;

                      if (!code) {
                        alert('Please specify a promotional code!');
                        return;
                      }
                      if (!itemName) {
                        alert('Please select a free item!');
                        return;
                      }
                      if (!expiresAt) {
                        alert('Please select an expiration date!');
                        return;
                      }

                      // Format date to ISO at end-of-day
                      const isoDate = new Date(`${expiresAt}T23:59:59`).toISOString();

                      try {
                        const newTag = await addFreeItemTag(code, itemName, isoDate);
                        setFreeItemTags(prev => [...prev.filter(t => t.code !== newTag.code), newTag]);
                        form.reset();
                        alert(`Successfully generated promotional tag: ${newTag.code}!`);
                      } catch (err) {
                        console.error(err);
                        alert('Failed to generate free item tag');
                      }
                    }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
                  >
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-brand-brown/60">
                        Promo Code
                      </label>
                      <input
                        name="tagCode"
                        type="text"
                        placeholder="e.g. FREE_MOMO"
                        required
                        className="w-full text-xs font-semibold p-2 bg-white border border-brand-brown/15 rounded-xl uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-brand-brown/30"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-brand-brown/60">
                        Select Reward Item
                      </label>
                      <select
                        name="freeItem"
                        required
                        className="w-full text-xs font-semibold p-2 bg-white border border-brand-brown/15 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-brown/30 cursor-pointer"
                      >
                        <option value="">-- Choose Item --</option>
                        {menuItems.map(item => (
                          <option key={item.id} value={item.name}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:col-span-1">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-brand-brown/60">
                          Expiry Date
                        </label>
                        <input
                          name="expiresAt"
                          type="date"
                          required
                          className="w-full text-xs font-semibold p-1.5 bg-white border border-brand-brown/15 rounded-xl focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-2 bg-brand-red hover:opacity-90 hover:shadow-md text-white font-black uppercase tracking-wider text-[10px] rounded-xl self-end cursor-pointer duration-150"
                      >
                        Create Tag
                      </button>
                    </div>
                  </form>
                </div>

                {/* Existing Tags Table */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase text-brand-brown/70 tracking-wider flex items-center gap-1.5">
                    📁 Current Active Tags ({freeItemTags.length})
                  </h4>
                  {freeItemTags.length === 0 ? (
                    <div className="text-center py-8 text-xs text-brand-brown/30 uppercase tracking-widest font-black">
                      No Promotional Free Item Tags Configured
                    </div>
                  ) : (
                    <div className="border border-brand-brown/15 rounded-2xl overflow-hidden bg-white shadow-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-brand-stone/10 border-b border-brand-brown/10 text-[9px] font-black uppercase tracking-wider text-brand-brown/50">
                            <th className="p-3">Promo Code</th>
                            <th className="p-3">Free Item Reward</th>
                            <th className="p-3">Expiry Date</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {freeItemTags.map(tag => {
                            const expiry = new Date(tag.expiresAt);
                            const isExpired = expiry < new Date();
                            return (
                              <tr key={tag.id} className="border-b border-brand-brown/5 hover:bg-brand-stone/3 font-semibold text-brand-brown text-[11px] transition-colors">
                                <td className="p-3 font-mono font-black tracking-wider text-[11px] text-indigo-700">{tag.code}</td>
                                <td className="p-3 font-bold">{tag.itemName}</td>
                                <td className="p-3 font-mono">{expiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                <td className="p-3">
                                  {isExpired ? (
                                    <span className="p-1 px-2.5 bg-zinc-100 text-zinc-500 rounded-lg text-[8px] font-black uppercase tracking-wider border border-zinc-200">
                                      Expired
                                    </span>
                                  ) : (
                                    <span className="p-1 px-2.5 bg-emerald-50 text-emerald-700 rounded-lg text-[8px] font-black uppercase tracking-wider border border-emerald-100">
                                      Active
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (confirm(`Are you sure you want to delete promo tag ${tag.code}?`)) {
                                        const updated = await deleteFreeItemTag(tag.id);
                                        setFreeItemTags(updated);
                                      }
                                    }}
                                    className="p-1.5 text-zinc-400 hover:text-brand-red hover:bg-rose-50 rounded-lg cursor-pointer duration-100"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>

              {/* Footer */}
              <div className="shrink-0 pt-4 border-t border-brand-brown/10 text-right">
                <button
                  type="button"
                  onClick={() => setIsFreeTagsModalOpen(false)}
                  className="px-5 py-2 hover:bg-brand-stone/30 text-brand-brown text-[10px] font-black uppercase rounded-xl tracking-wider cursor-pointer duration-150"
                >
                  Close Manager
                </button>
              </div>
              
            </div>
          </div>
        )}

        {/* Discount Tags Management Modal */}
        {isDiscountTagsModalOpen && (
          <div className="fixed inset-0 bg-brand-brown/45 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl border border-brand-brown/15 shadow-2xl max-w-2xl w-full p-6 space-y-6 relative overflow-hidden max-h-[85vh] flex flex-col">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-brand-brown/10 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600">
                    <Gift className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-brand-brown uppercase tracking-wider">
                      Promo Discount Tag Manager
                    </h3>
                    <p className="text-[9px] font-semibold text-brand-brown/50 uppercase tracking-wide">
                      Create percentage-based promotional campaign tags with custom expiry dates
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDiscountTagsModalOpen(false)}
                  className="p-1.5 hover:bg-brand-stone/15 rounded-xl text-brand-brown/50 hover:text-brand-brown duration-100 outline-none cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Campaign Generator Form and Existing Tags List container */}
              <div className="flex-1 overflow-y-auto space-y-6 pr-1 no-scrollbar">
                
                {/* Generator Form */}
                <div className="bg-brand-cream/15 p-4 rounded-2xl border border-brand-brown/10 space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-brand-brown/70 tracking-wider">
                    Generate Discount Tag
                  </h4>
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const codeInput = form.elements.namedItem('tagCode') as HTMLInputElement;
                      const percentageInput = form.elements.namedItem('discountPercent') as HTMLInputElement;
                      const expiryInput = form.elements.namedItem('expiresAt') as HTMLInputElement;

                      const code = codeInput.value.trim().toUpperCase().replace(/\s+/g, '_');
                      const discountPercentage = parseFloat(percentageInput.value);
                      const expiresAt = expiryInput.value;

                      if (!code) {
                        alert('Please specify a promotional code!');
                        return;
                      }
                      if (isNaN(discountPercentage) || discountPercentage <= 0 || discountPercentage > 100) {
                        alert('Please enter a valid discount percentage (1-100)!');
                        return;
                      }
                      if (!expiresAt) {
                        alert('Please select an expiration date!');
                        return;
                      }

                      const isoDate = new Date(`${expiresAt}T23:59:59`).toISOString();

                      try {
                        const newTag = await addDiscountTag(code, discountPercentage, isoDate);
                        setDiscountTags(prev => [...prev.filter(t => t.code !== newTag.code), newTag]);
                        form.reset();
                        alert(`Successfully generated promotional discount tag: ${newTag.code}!`);
                      } catch (err) {
                        console.error(err);
                        alert('Failed to generate discount tag');
                      }
                    }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
                  >
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-brand-brown/60">
                        Promo Code
                      </label>
                      <input
                        name="tagCode"
                        type="text"
                        placeholder="e.g. SAVE20"
                        required
                        className="w-full text-xs font-semibold p-2 bg-white border border-brand-brown/15 rounded-xl uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-brand-brown/30"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-brand-brown/60">
                        Discount Percentage (%)
                      </label>
                      <input
                        name="discountPercent"
                        type="number"
                        min="1"
                        max="100"
                        placeholder="e.g. 15"
                        required
                        className="w-full text-xs font-semibold p-2 bg-white border border-brand-brown/15 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-brown/30"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:col-span-1">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-wider text-brand-brown/60">
                          Expiry Date
                        </label>
                        <input
                          name="expiresAt"
                          type="date"
                          required
                          className="w-full text-xs font-semibold p-1.5 bg-white border border-brand-brown/15 rounded-xl focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 hover:shadow-md text-white font-black uppercase tracking-wider text-[10px] rounded-xl self-end cursor-pointer duration-150"
                      >
                        Create Tag
                      </button>
                    </div>
                  </form>
                </div>

                {/* Existing Tags Table */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase text-brand-brown/70 tracking-wider flex items-center gap-1.5">
                    📁 Current Discount Tags ({discountTags.length})
                  </h4>
                  {discountTags.length === 0 ? (
                    <div className="text-center py-8 text-xs text-brand-brown/30 uppercase tracking-widest font-black">
                      No Promotional Discount Tags Configured
                    </div>
                  ) : (
                    <div className="border border-brand-brown/15 rounded-2xl overflow-hidden bg-white shadow-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-brand-stone/10 border-b border-brand-brown/10 text-[9px] font-black uppercase tracking-wider text-brand-brown/50">
                            <th className="p-3">Promo Code</th>
                            <th className="p-3">Percentage Off</th>
                            <th className="p-3">Expiry Date</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {discountTags.map(tag => {
                            const expiry = new Date(tag.expiresAt);
                            const isExpired = expiry < new Date();
                            return (
                              <tr key={tag.id} className="border-b border-brand-brown/5 hover:bg-brand-stone/3 font-semibold text-brand-brown text-[11px] transition-colors">
                                <td className="p-3 font-mono font-black tracking-wider text-[11px] text-indigo-700">{tag.code}</td>
                                <td className="p-3 font-bold">{tag.discountPercentage}%</td>
                                <td className="p-3 font-mono">{expiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                <td className="p-3">
                                  {isExpired ? (
                                    <span className="p-1 px-2.5 bg-zinc-100 text-zinc-500 rounded-lg text-[8px] font-black uppercase tracking-wider border border-zinc-200">
                                      Expired
                                    </span>
                                  ) : (
                                    <span className="p-1 px-2.5 bg-emerald-50 text-emerald-700 rounded-lg text-[8px] font-black uppercase tracking-wider border border-emerald-100">
                                      Active
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (confirm(`Are you sure you want to delete promo tag ${tag.code}?`)) {
                                        const updated = await deleteDiscountTag(tag.id);
                                        setDiscountTags(updated);
                                      }
                                    }}
                                    className="p-1.5 text-zinc-400 hover:text-brand-red hover:bg-rose-50 rounded-lg cursor-pointer duration-100"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>

              {/* Footer */}
              <div className="shrink-0 pt-4 border-t border-brand-brown/10 text-right">
                <button
                  type="button"
                  onClick={() => setIsDiscountTagsModalOpen(false)}
                  className="px-5 py-2 hover:bg-brand-stone/30 text-brand-brown text-[10px] font-black uppercase rounded-xl tracking-wider cursor-pointer duration-150"
                >
                  Close Manager
                </button>
              </div>
              
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Marketing;
