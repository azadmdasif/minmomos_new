
import { CompletedOrder, OrderItem, PaymentMethod, OrderType, OrderStatus, RawMaterial, User, Station, CentralMaterial, MaterialCategory, MenuItem, Size, StockAllocation, Customer } from '../types';
import { supabase } from './supabase';
import { RAW_MATERIALS_LIST } from '../constants';

const AUTH_KEY = 'minmomos-auth-user';

export function getCurrentUser(): User | null {
  const data = localStorage.getItem(AUTH_KEY);
  return data ? JSON.parse(data) : null;
}

export function setCurrentUser(user: User | null): void {
  if (user) localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  else localStorage.removeItem(AUTH_KEY);
}

// --- TIMEZONE HELPERS ---
export function getISTDate(date?: string | number | Date): Date {
  if (date) return new Date(date);
  return new Date();
}

export function getISTDateString(date?: string | number | Date): string {
  const d = date ? new Date(date) : new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

export function getISTFullDateTime(date?: string | number | Date): string {
  const d = date ? new Date(date) : new Date();
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(d);
}

export function getISTTimeString(date?: string | number | Date): string {
  const d = date ? new Date(date) : new Date();
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(d);
}

export function getISTHour(date?: string | number | Date): number {
  const d = date ? new Date(date) : new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    hour12: false
  };
  return parseInt(new Intl.DateTimeFormat('en-US', options).format(d), 10);
}

export function getISTDay(date?: string | number | Date): number {
  const d = date ? new Date(date) : new Date();
  // Using 'en-US' and extracting weekday. 0 = Sunday, ..., 6 = Saturday
  // Unfortunately Intl doesn't easily return day index, so we'll use a safer part-based approach
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short'
  });
  const dayStr = formatter.format(d);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.indexOf(dayStr);
}

export function getISTISOString(): string {
  return new Date().toISOString();
}

// --- MENU MANAGEMENT ---

export async function fetchMenuItems(): Promise<{ data: MenuItem[], error: any }> {
  const { data, error } = await supabase.from('menu_items').select('*').order('name');
  const mappedData = data?.map(item => ({
    ...item,
    minCoinsPrices: item.min_coins_prices || item.minCoinsPrices || {}
  })) || [];
  return { data: mappedData, error };
}

export async function upsertMenuItem(item: MenuItem): Promise<void> {
  const payload = {
    id: item.id,
    name: item.name,
    image: item.image,
    category: item.category,
    min_coins_prices: item.minCoinsPrices,
    preparations: item.preparations,
    costs: item.costs,
    recipe: item.recipe,
    sizeRecipes: item.sizeRecipes 
  };
  
  const { error } = await supabase.from('menu_items').upsert(payload);
  if (error) throw error;
}

export async function deleteMenuItem(id: string): Promise<void> {
  console.log(`Storage: Attempting to delete menu item with ID: ${id}`);
  const { error } = await supabase
    .from('menu_items')
    .delete()
    .eq('id', id);

  if (error) {
    console.error("Storage: Delete Menu Item Error:", error);
    if (error.code === '23503') {
      throw new Error("Cannot delete this item because it has been used in previous orders. To keep historical records accurate, deletion is restricted. You can try renamed it to '(Retired)' instead.");
    }
    throw new Error(error.message);
  }
}

// --- PROCUREMENT ---

export async function logProcurement(item: any): Promise<void> {
  const { error } = await supabase.from('procurements').insert(item);
  if (error) throw error;
}

export async function fetchProcurements(startDate: string, endDate: string): Promise<{ data: any[], error: any }> {
  const { data, error } = await supabase
    .from('procurements')
    .select('*')
    .gte('date', `${startDate}T00:00:00+05:30`)
    .lte('date', `${endDate}T23:59:59+05:30`)
    .is('is_voided', false)
    .order('date', { ascending: false });
  
  if (error) console.error("Procurement fetch error:", error);
  return { data: data || [], error };
}

export async function getFinancialSpending(startDate: string, endDate: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('procurements')
    .select('*')
    .is('is_voided', false)
    .gte('date', `${startDate}T00:00:00+05:30`)
    .lte('date', `${endDate}T23:59:59+05:30`);
  
  if (error) {
    console.error("Financial fetch error:", error);
    return [];
  }
  return data || [];
}

export async function voidProcurement(id: string, reason: string): Promise<void> {
  const { data: p, error: fetchError } = await supabase.from('procurements').select('*').eq('id', id).single();
  if (fetchError || !p) throw new Error("Procurement not found.");
  if (p.is_voided) throw new Error("Already voided.");

  const { data: central } = await supabase.from('central_inventory').select('current_stock').eq('id', p.item_id).single();
  if (central) {
     const newStock = (central.current_stock || 0) - p.quantity;
     await supabase.from('central_inventory').update({ current_stock: newStock }).eq('id', p.item_id);
  }

  await supabase.from('procurements').update({ is_voided: true, void_reason: reason }).eq('id', id);
}

// --- ALLOCATIONS ---

export async function fetchAllocations(startDate: string, endDate: string): Promise<{ data: StockAllocation[], error: any }> {
  const { data, error } = await supabase
    .from('stock_allocations')
    .select('*')
    .gte('date', `${startDate}T00:00:00+05:30`)
    .lte('date', `${endDate}T23:59:59+05:30`)
    .is('is_voided', false)
    .order('date', { ascending: false });
  return { data: (data as StockAllocation[]) || [], error };
}

export async function voidAllocation(id: string, reason: string): Promise<void> {
  const { data: a, error: fetchError } = await supabase.from('stock_allocations').select('*').eq('id', id).single();
  if (fetchError || !a) throw new Error("Allocation not found.");
  if (a.is_voided) throw new Error("Already voided.");

  const { data: central } = await supabase.from('central_inventory').select('current_stock').eq('id', a.material_id).single();
  if (central) {
    const newHubStock = (central.current_stock || 0) + a.quantity;
    await supabase.from('central_inventory').update({ current_stock: newHubStock }).eq('id', a.material_id);
  }

  const { data: station } = await supabase.from('inventory').select('current_stock').eq('id', a.material_id).eq('branch_name', a.station_name).maybeSingle();
  if (station) {
    const newStationStock = (station.current_stock || 0) - a.quantity;
    await supabase.from('inventory').update({ current_stock: newStationStock }).eq('id', a.material_id).eq('branch_name', a.station_name);
  }

  await supabase.from('stock_allocations').update({ is_voided: true, void_reason: reason }).eq('id', id);
}

// --- ORDERING & INVENTORY DEDUCTION ---

function mapDatabaseOrderToType(o: any): CompletedOrder {
  // Supabase might return items under 'order_items' or 'items' depending on alias/join
  const rawItems = o.order_items || o.items || o.order_item || [];
  
  return {
    id: o.id, 
    billNumber: o.bill_number, 
    type: o.type, 
    status: o.status, 
    total: o.total, 
    date: o.date, 
    paymentMethod: o.payment_method, 
    branchName: o.branch_name,
    customerPhone: o.customer_phone,
    customerId: o.customer_id,
    deletionInfo: o.deletion_info,
    items: rawItems.map((i: any) => ({ 
      id: i.id, 
      menuItemId: i.menu_item_id, 
      name: i.name, 
      price: i.price, 
      cost: i.cost, 
      quantity: i.quantity,
      paidWithCoins: i.paid_with_coins,
      coinsPrice: i.coins_price
    }))
  };
}

export async function saveOrder(
  orderItems: OrderItem[], 
  total: number, 
  branchName: string, 
  type: OrderType, 
  status: OrderStatus = 'ORDERED', 
  paymentMethod?: PaymentMethod, 
  tableId?: string,
  customerPhone?: string
): Promise<number | null> {
  try {
    const nextBillNumber = await peekNextBillNumber();
    
    let customerId = null;
    if (customerPhone && customerPhone.length >= 10) {
      // 1. Check if customer exists
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', customerPhone)
        .maybeSingle();
      
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        // 2. Create new customer - using upsert as a safeguard
        const { data: newCustomer, error: createError } = await supabase
          .from('customers')
          .upsert({ phone: customerPhone }, { onConflict: 'phone' })
          .select()
          .single();
        
        if (newCustomer) {
          customerId = newCustomer.id;
        } else if (createError) {
          console.warn("Could not register customer, proceeding with phone only:", createError.message);
          const { data: secondTry } = await supabase
            .from('customers')
            .select('id')
            .eq('phone', customerPhone)
            .maybeSingle();
          if (secondTry) customerId = secondTry.id;
        }
      }
    }

    // Round total and individual items to nearest integer for consistency
    const roundedTotal = Math.round(total);

    const { data: orderData, error: orderError } = await supabase.from('orders').insert({
      bill_number: nextBillNumber, 
      total: roundedTotal, 
      payment_method: paymentMethod || null, 
      branch_name: branchName, 
      type, 
      status, 
      table_id: tableId || null, 
      customer_id: customerId,
      customer_phone: customerPhone || null
    }).select().single();
    
    if (orderError) {
      console.error("Order Insert Error:", orderError);
      throw orderError;
    }

    const itemsToInsert = orderItems.map(item => {
      const row: any = {
        order_id: orderData.id, 
        name: item.name, 
        price: Math.round(item.price), // Round price to handle fractional discounts
        cost: Math.round(item.cost || 0), 
        quantity: item.quantity,
        paid_with_coins: item.paidWithCoins || false,
        coins_price: item.coinsPrice || 0,
        menu_item_id: null // Explicitly handle null
      };
      
      if (item.menuItemId && 
          item.menuItemId !== 'discount' && 
          item.menuItemId !== 'registration' && 
          item.menuItemId.length > 5) { // Basic UUID check
        row.menu_item_id = item.menuItemId;
      }
      
      return row;
    });

    const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert);
    if (itemsError) {
      console.error("Order Items Batch Insert Failed, trying individual items:", itemsError);
      // Try individual inserts to identify or bypass a single bad record
      for (const row of itemsToInsert) {
        try {
          const { error: singleError } = await supabase.from('order_items').insert(row);
          if (singleError) console.error("Individual Item Insert Error:", singleError, "Row:", row);
        } catch (e) {
          console.error("Fatal individual insert error:", e);
        }
      }
    }

    // 1.5 Update Customer LTV and Total Orders
    if (customerId) {
        await syncCustomerStats(customerId, customerPhone);
        
        const usesWelcomeDiscount = orderItems.some(i => i.id === 'welcome-discount');
        if (usesWelcomeDiscount) {
          await supabase.from('customers').update({ welcome_coupon_used: true }).eq('id', customerId);
        }
    }

    const { data: menuItems } = await fetchMenuItems();
    const SIZE_PIECES: Record<string, number> = { small: 4, medium: 6, large: 8 };

    for (const item of orderItems) {
      if (!item.menuItemId || item.menuItemId === 'discount') continue;

      const menuDetail = menuItems?.find(m => m.id === item.menuItemId);
      if (!menuDetail) {
        console.warn(`Deduction Skip: Menu item details not found for ID: ${item.menuItemId} (Name: ${item.name})`);
        continue;
      }

      // Determine size from name suffix
      let size: Size = 'medium';
      if (item.name.includes('(Small)')) size = 'small';
      else if (item.name.includes('(Large)')) size = 'large';

      // 1. Get the right recipe: Size-specific takes priority, otherwise use global
      const hasSizeRecipe = !!(menuDetail.sizeRecipes?.[size] && menuDetail.sizeRecipes[size]!.length > 0);
      let activeRecipe = hasSizeRecipe ? menuDetail.sizeRecipes![size] : menuDetail.recipe;
      
      if (activeRecipe && Array.isArray(activeRecipe) && activeRecipe.length > 0) {
        // 2. Determine Multiplier
        // If we have an explicit size-recipe, we use quantities as-is (multiplier=1).
        // If we fall back to global recipe for 'momo' category, we apply the plate-size multiplier.
        let sizeMultiplier = 1;
        if (!hasSizeRecipe && menuDetail.category === 'momo') {
          sizeMultiplier = SIZE_PIECES[size] || 6;
        }

        for (const requirement of activeRecipe) {
          const totalConsumption = requirement.quantity * sizeMultiplier * item.quantity;
          
          if (totalConsumption <= 0) continue;

          const { data: existingInv } = await supabase
            .from('inventory')
            .select('current_stock')
            .eq('id', requirement.materialId)
            .eq('branch_name', branchName)
            .maybeSingle();

          if (existingInv) {
            const newStock = existingInv.current_stock - totalConsumption;
            await supabase.from('inventory')
              .update({ current_stock: newStock })
              .eq('id', requirement.materialId)
              .eq('branch_name', branchName);
          } else {
            // Material doesn't exist at this station yet, create it with negative initial stock
            const { data: centralInfo } = await supabase
              .from('central_inventory')
              .select('*')
              .eq('id', requirement.materialId)
              .maybeSingle();
            
            if (centralInfo) {
              await supabase.from('inventory').insert({
                id: requirement.materialId,
                branch_name: branchName,
                name: centralInfo.name,
                unit: centralInfo.unit,
                category: centralInfo.category,
                current_stock: -totalConsumption,
                is_finished: false,
                request_pending: false
              });
            } else {
              console.warn(`Stock Deduction Error: Material ${requirement.materialId} not found in Central Inventory.`);
            }
          }
        }
      } else {
        // Recipe is empty or not defined
        if (menuDetail.category !== 'drink') {
          console.info(`No recipe defined for item: ${menuDetail.name}. Stock not deducted.`);
        }
      }
    }

    return nextBillNumber;
  } catch (err) {
    console.error("Order Save Failed:", err);
    return null;
  }
}

export async function getStations(): Promise<Station[]> {
  const { data } = await supabase.from('stations').select('*').order('name');
  return data || [];
}

export async function createStation(name: string, location: string): Promise<void> {
  const { error } = await supabase.from('stations').insert({ name, location });
  if (error) throw error;
}

export async function getAppUsers(): Promise<any[]> {
  const { data } = await supabase.from('app_users').select('*, stations(name)');
  return data || [];
}

export async function createAppUser(user: any): Promise<void> {
  const { error } = await supabase.from('app_users').insert(user);
  if (error) throw error;
}

export async function getCentralInventory(): Promise<CentralMaterial[]> {
  const { data, error } = await supabase.from('central_inventory').select('*').order('name');
  if (error) throw error;
  return data || [];
}

export async function createCentralItem(
  name: string, 
  unit: string, 
  initialQty: number, 
  costPerUnit: number, 
  category: MaterialCategory,
  manualId?: string
): Promise<void> {
  const id = manualId || name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const { error } = await supabase.from('central_inventory').upsert({
    id, name, unit, category, current_stock: initialQty, 
    last_purchase_cost: costPerUnit,
    last_purchase_date: getISTISOString(), is_finished: false
  });
  if (error) throw error;
}

export async function seedStandardInventory(): Promise<void> {
  for (const item of RAW_MATERIALS_LIST) {
    try {
      await createCentralItem(item.name, item.unit, 0, 0, item.category as any, item.id);
    } catch (e) {
      console.error(`Failed to seed material ${item.id}`, e);
    }
  }
}

export async function recordCentralPurchase(id: string, qty: number, totalCost: number): Promise<void> {
  const { data: current, error: fetchError } = await supabase
    .from('central_inventory')
    .select('current_stock')
    .eq('id', id)
    .single();
  
  if (fetchError) throw new Error("Item not found in Central Inventory: " + fetchError.message);

  const newStock = (current?.current_stock || 0) + qty;
  const { error: updateError } = await supabase.from('central_inventory').update({
    current_stock: newStock, 
    last_purchase_cost: totalCost, 
    last_purchase_date: getISTISOString(), 
    is_finished: false
  }).eq('id', id);

  if (updateError) throw updateError;
}

export async function allocateStock(materialId: string, stationName: string, qty: number): Promise<void> {
  const { data: central, error: cError } = await supabase.from('central_inventory').select('*').eq('id', materialId).single();
  if (cError || !central) throw new Error("Central Item not found.");
  if (central.current_stock < qty) throw new Error("Insufficient central stock");
  
  // 1. Update Hub
  const { error: hubError } = await supabase.from('central_inventory').update({ current_stock: central.current_stock - qty }).eq('id', materialId);
  if (hubError) throw hubError;
  
  // 2. Update Station
  const { data: existing } = await supabase.from('inventory').select('current_stock').eq('id', materialId).eq('branch_name', stationName).maybeSingle();
  const newStationStock = (existing?.current_stock || 0) + qty;
  
  const { error: storeError } = await supabase.from('inventory').upsert({
    id: materialId, branch_name: stationName, name: central.name, unit: central.unit, category: central.category, current_stock: newStationStock, is_finished: false, request_pending: false
  }, { onConflict: 'id,branch_name' });
  if (storeError) throw storeError;

  // 3. Log Movement (THE LEDGER ENTRY)
  const { error: logError } = await supabase.from('stock_allocations').insert({
    material_id: materialId,
    material_name: central.name,
    station_name: stationName,
    quantity: qty,
    unit: central.unit,
    date: getISTISOString()
  });
  if (logError) throw logError;
}

export async function markStoreItemFinished(id: string, branchName: string, finished: boolean): Promise<void> {
  await supabase.from('inventory').update({ is_finished: finished, current_stock: finished ? 0 : 1 }).eq('id', id).eq('branch_name', branchName);
}

export async function markCentralFinished(id: string, finished: boolean): Promise<void> {
  await supabase.from('central_inventory').update({ is_finished: finished, current_stock: finished ? 0 : 1 }).eq('id', id);
}

export async function raiseRestockRequest(id: string, branchName: string): Promise<void> {
  await supabase.from('inventory').update({ request_pending: true }).eq('id', id).eq('branch_name', branchName);
}

export async function peekNextBillNumber(): Promise<number> {
  const { data } = await supabase.from('orders').select('bill_number').order('bill_number', { ascending: false }).limit(1);
  return data && data.length > 0 ? data[0].bill_number + 1 : 1;
}

export async function getInventory(branchName: string): Promise<RawMaterial[]> {
  const { data } = await supabase.from('inventory').select('*').eq('branch_name', branchName);
  return data || [];
}

export async function getOrdersForDateRange(startDate: string, endDate: string): Promise<CompletedOrder[]> {
  const { data } = await supabase
    .from('orders')
    .select(`*, items:order_items (*)`)
    .gte('date', `${startDate}T00:00:00+05:30`)
    .lte('date', `${endDate}T23:59:59+05:30`)
    .is('deletion_info', null)
    .order('bill_number', { ascending: false });
  
  if (!data) return [];

  // For orders missing items, try a fallback fetch (though this is more common for single orders due to RLS/join limits)
  const results = await Promise.all(data.map(async (o) => {
    // If Supabase didn't join items (aliased as 'items' now)
    if (!o.items || o.items.length === 0) {
       const { data: fallbackItems } = await supabase.from('order_items').select('*').eq('order_id', o.id);
       if (fallbackItems && fallbackItems.length > 0) {
         o.items = fallbackItems;
       }
    }
    return mapDatabaseOrderToType(o);
  }));

  return results;
}

export async function getOrderByBillNumber(billNumber: number): Promise<CompletedOrder | null> {
  const { data } = await supabase
    .from('orders')
    .select(`*, items:order_items (*)`)
    .eq('bill_number', billNumber)
    .maybeSingle();
  
  if (!data) return null;

  // Fallback: if items are missing from the join (sometimes happens with RLS or complex joins), try direct fetch
  if (!data.items || data.items.length === 0) {
    const { data: directItems } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', data.id);
    if (directItems && directItems.length > 0) {
      data.items = directItems;
    }
  }

  return mapDatabaseOrderToType(data);
}

export async function getOrdersByItemName(itemName: string, startDate?: string, endDate?: string): Promise<CompletedOrder[]> {
  const trimmedName = itemName.trim();
  const words = trimmedName.split(/\s+/).filter(w => w.length > 0);
  
  if (words.length === 0) return [];

  // We use filter on the joined order_items table
  // Note: !inner makes it an inner join, filtering orders that have at least one matching item
  let query = supabase
    .from('orders')
    .select(`*, items:order_items!inner(*)`)
    .is('deletion_info', null);

  // Apply each word as an AND ilike filter for better flexibility
  words.forEach(word => {
    query = query.ilike('items.name', `%${word}%`);
  });

  if (startDate && endDate) {
    // Consistent with getOrdersForDateRange logic
    query = query.gte('date', `${startDate}T00:00:00+05:30`)
                 .lte('date', `${endDate}T23:59:59+05:30`);
  }

  const { data: ordersData, error: ordersError } = await query
    .order('bill_number', { ascending: false })
    .limit(100);
    
  if (ordersError) {
    console.error("Search items error:", ordersError);
    return [];
  }
  
  if (!ordersData) return [];
  
  // Return mapped orders
  const results = await Promise.all(ordersData.map(async (o) => {
    // When using !inner filter on joined items, Supabase might only return the MATCHING items 
    // in the items array. To ensure the bill shows ALL items, we re-fetch if needed.
    // Or better, we always re-fetch items for these specifically found orders to be 100% sure.
    const { data: fullItems } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', o.id);
      
    if (fullItems && fullItems.length > 0) {
      o.items = fullItems;
    }
    
    return mapDatabaseOrderToType(o);
  }));

  return results;
}

export async function getMatchingMenuItems(term: string): Promise<string[]> {
  if (!term || term.length < 2) return [];
  
  // Search in both menu_items (for base names) and order_items (for historical variants)
  // We use a larger limit for order_items and then unique-ify to get more potential variant names
  const [menuResults, orderResults] = await Promise.all([
    supabase.from('menu_items').select('name').ilike('name', `%${term}%`).limit(10),
    supabase.from('order_items').select('name').ilike('name', `%${term}%`).limit(100)
  ]);
    
  const names = new Set<string>();
  menuResults.data?.forEach(i => names.add(i.name));
  orderResults.data?.forEach(i => names.add(i.name));
  
  // Return top 15 unique names
  return Array.from(names).slice(0, 15);
}

export async function getDeletedOrdersForDateRange(startDate: string, endDate: string): Promise<CompletedOrder[]> {
  const { data } = await supabase
    .from('orders')
    .select(`*, items:order_items (*)`)
    .gte('date', `${startDate}T00:00:00+05:30`)
    .lte('date', `${endDate}T23:59:59+05:30`)
    .not('deletion_info', 'is', null)
    .order('bill_number', { ascending: false });
  
  if (!data) return [];

  const results = await Promise.all(data.map(async (o) => {
    if (!o.items || o.items.length === 0) {
       const { data: fallbackItems } = await supabase.from('order_items').select('*').eq('order_id', o.id);
       if (fallbackItems && fallbackItems.length > 0) o.items = fallbackItems;
    }
    return mapDatabaseOrderToType(o);
  }));

  return results;
}

export async function syncCustomerStats(customerId: string, phone?: string): Promise<void> {
  const { data: stats } = await supabase.rpc('get_customer_stats');
  const customerStats = stats?.find((c: any) => c.id === customerId || (phone && c.phone === phone));
  
  await supabase.from('customers').update({
      total_orders: customerStats?.total_orders || 0,
      ltv: customerStats?.total_spent || 0
  }).eq('id', customerId);
}

export async function deleteOrderByBillNumber(billNumber: number, reason: string): Promise<void> {
  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_id, customer_phone, order_items(name)')
    .eq('bill_number', billNumber)
    .single();
  
  const deletionInfo = { reason, date: getISTISOString() };
  await supabase.from('orders').update({ deletion_info: deletionInfo }).eq('bill_number', billNumber);

  if (order) {
    // If the order contained the 15% Welcome Discount, reactivate it for the customer
    const hasCoupon = order.order_items?.some((item: any) => 
      item.name === '15% Welcome Discount' || item.name.includes('Welcome Discount')
    );

    if (hasCoupon && order.customer_id) {
      await supabase.from('customers')
        .update({ welcome_coupon_used: false })
        .eq('id', order.customer_id);
    }

    if (order.customer_id) {
      await syncCustomerStats(order.customer_id, order.customer_phone);
    }
  }
}

export async function updateTableStatus(tableId: string, status: string): Promise<void> {
  await supabase.from('dining_tables').update({ status }).eq('id', tableId);
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  await supabase.from('orders').update({ status }).eq('id', orderId);
}

export const CUSTOMER_TIERS = [
  { name: 'Base Camp', min: 0, rate: 0.08 },
  { name: 'Camp 1', min: 501, rate: 0.10 },
  { name: 'Camp 2', min: 2001, rate: 0.12 },
  { name: 'Camp 3', min: 5001, rate: 0.14 },
  { name: 'Summit', min: 10001, rate: 0.16 },
];

export function getTierInfo(spent: number) {
  for (let i = CUSTOMER_TIERS.length - 1; i >= 0; i--) {
    if (spent >= CUSTOMER_TIERS[i].min) {
      return {
        ...CUSTOMER_TIERS[i],
        next: CUSTOMER_TIERS[i + 1] || null
      };
    }
  }
  return { ...CUSTOMER_TIERS[0], next: CUSTOMER_TIERS[1] };
}

export function calculateProgressiveEarned(spent: number): number {
  let total = 0;
  for (let i = 0; i < CUSTOMER_TIERS.length; i++) {
    const tier = CUSTOMER_TIERS[i];
    const nextTier = CUSTOMER_TIERS[i + 1];
    const upperLimit = nextTier ? nextTier.min : Infinity;
    
    if (spent > tier.min) {
      const amountInThisTier = Math.min(spent, upperLimit) - tier.min;
      total += amountInThisTier * tier.rate;
    }
  }
  return Math.floor(total);
}

export function calculateTotalMinCoins(totalSpent: number, redeemedCoins: number) {
  return Math.max(0, calculateProgressiveEarned(totalSpent) - redeemedCoins);
}

// --- CUSTOMER MANAGEMENT ---

async function getRedeemedCoins(phone: string): Promise<number> {
  const { data } = await supabase
    .from('order_items')
    .select('coins_price, quantity, orders!inner(customer_phone, deletion_info)')
    .eq('paid_with_coins', true)
    .eq('orders.customer_phone', phone)
    .is('orders.deletion_info', null);
  
  if (!data) return 0;
  return data.reduce((acc, item) => acc + (item.coins_price * item.quantity), 0);
}

export async function getCustomerByPhone(phone: string): Promise<Customer | null> {
  const { data } = await supabase.rpc('get_customer_stats');
  if (!data) return null;
  const match = data.find((c: any) => c.phone === phone);
  if (!match) return null;
  
  const totalSpent = Number(match.total_spent || 0);
  const redeemedCoins = await getRedeemedCoins(phone);
  
  return {
    id: match.id,
    phone: match.phone,
    name: match.name,
    email: match.email,
    birthday: match.birthday,
    note: match.note,
    totalOrders: Number(match.total_orders || 0),
    totalSpent: totalSpent,
    minCoins: calculateTotalMinCoins(totalSpent, redeemedCoins),
    lastVisit: match.last_visit,
    joinedDate: match.joined_date,
    welcomeCouponUsed: match.welcome_coupon_used || false,
    welcomeCouponCode: match.welcome_coupon_code
  };
}

export async function searchCustomers(query: string): Promise<Customer[]> {
  if (query.length < 3) return [];
  
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .ilike('phone', `%${query}%`)
    .limit(5);

  if (error) return [];
  
  return data.map(d => ({
    id: d.id,
    phone: d.phone,
    name: d.name,
    totalOrders: d.total_orders || 0,
    totalSpent: d.ltv || 0,
    minCoins: d.min_coins || 0,
    joinedDate: d.created_at,
    lastVisit: d.last_visit,
    welcomeCouponUsed: d.welcome_coupon_used || false,
    welcomeCouponCode: d.welcome_coupon_code
  }));
}

export async function registerCustomer(phone: string, name: string): Promise<Customer> {
  const couponCode = `MOMO-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${phone.slice(-4)}`;
  const { data, error } = await supabase
    .from('customers')
    .upsert({ phone, name, welcome_coupon_code: couponCode }, { onConflict: 'phone' })
    .select()
    .single();

  if (error) throw error;
  
  return {
    id: data.id,
    phone: data.phone,
    name: data.name,
    totalOrders: 0,
    totalSpent: 0,
    minCoins: 0,
    joinedDate: data.created_at,
    lastVisit: null,
    welcomeCouponUsed: false,
    welcomeCouponCode: data.welcome_coupon_code
  };
}

export async function updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({
      name: updates.name,
      email: updates.email,
      birthday: updates.birthday,
      note: updates.note,
      welcome_coupon_used: updates.welcomeCouponUsed,
      welcome_coupon_code: updates.welcomeCouponCode
    })
    .eq('id', id);
  if (error) throw error;
}

export async function fetchUsualOrder(phone: string): Promise<{ name: string, quantity: number } | null> {
  const history = await fetchCustomerHistory(phone);
  if (history.length <= 3) return null;

  const itemCounts: { [key: string]: number } = {};
  history.forEach(order => {
    order.items.forEach(item => {
      itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
    });
  });

  let topItem = null;
  let maxCount = 0;

  for (const [name, count] of Object.entries(itemCounts)) {
    if (count > maxCount) {
      maxCount = count;
      topItem = { name, quantity: count };
    }
  }

  return topItem;
}

export async function fetchCustomers(branchFilter?: string): Promise<Customer[]> {
  const { data } = await supabase.rpc('get_customer_stats', { branch_filter: branchFilter || null }); 
  if (!data) return [];
  
  const customers = await Promise.all(data.map(async (c: any) => {
    const totalSpent = Number(c.total_spent || 0);
    const redeemedCoins = await getRedeemedCoins(c.phone);
    
    return {
      id: c.id,
      phone: c.phone,
      name: c.name,
      email: c.email,
      birthday: c.birthday,
      note: c.note,
      totalOrders: Number(c.total_orders || 0),
      totalSpent: totalSpent,
      minCoins: calculateTotalMinCoins(totalSpent, redeemedCoins),
      lastVisit: c.last_visit,
      joinedDate: c.joined_date,
      welcomeCouponUsed: c.welcome_coupon_used || false,
      welcomeCouponCode: c.welcome_coupon_code
    };
  }));

  return customers;
}

export async function fetchCustomerHistory(phone: string): Promise<CompletedOrder[]> {
  const { data } = await supabase
    .from('orders')
    .select(`*, items:order_items (*)`)
    .eq('customer_phone', phone)
    .is('deletion_info', null)
    .order('date', { ascending: false });
  
  if (!data) return [];

  const results = await Promise.all(data.map(async (o) => {
    if (!o.items || o.items.length === 0) {
       const { data: fallbackItems } = await supabase.from('order_items').select('*').eq('order_id', o.id);
       if (fallbackItems && fallbackItems.length > 0) o.items = fallbackItems;
    }
    return mapDatabaseOrderToType(o);
  }));

  return results;
}
