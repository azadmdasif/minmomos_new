
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

// --- MENU MANAGEMENT ---

export async function fetchMenuItems(): Promise<{ data: MenuItem[], error: any }> {
  const { data, error } = await supabase.from('menu_items').select('*').order('name');
  return { data: data || [], error };
}

export async function upsertMenuItem(item: MenuItem): Promise<void> {
  const payload = {
    id: item.id,
    name: item.name,
    image: item.image,
    category: item.category,
    preparations: item.preparations,
    costs: item.costs,
    recipe: item.recipe,
    sizeRecipes: item.sizeRecipes 
  };
  
  const { error } = await supabase.from('menu_items').upsert(payload);
  if (error) throw error;
}

export async function deleteMenuItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('menu_items')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) throw new Error(error.message);
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
    .gte('date', `${startDate}T00:00:00`)
    .lte('date', `${endDate}T23:59:59`)
    .order('date', { ascending: false });
  return { data: data || [], error };
}

// --- ALLOCATIONS ---

export async function fetchAllocations(startDate: string, endDate: string): Promise<{ data: StockAllocation[], error: any }> {
  const { data, error } = await supabase
    .from('stock_allocations')
    .select('*')
    .gte('date', `${startDate}T00:00:00`)
    .lte('date', `${endDate}T23:59:59`)
    .order('date', { ascending: false });
  return { data: (data as StockAllocation[]) || [], error };
}

// --- ORDERING & INVENTORY DEDUCTION ---

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
          // If insert fails (maybe already exists but SELECT policy race condition), 
          // we still try to get the ID one last time
          const { data: secondTry } = await supabase
            .from('customers')
            .select('id')
            .eq('phone', customerPhone)
            .maybeSingle();
          if (secondTry) customerId = secondTry.id;
        }
      }
    }

    const { data: orderData, error: orderError } = await supabase.from('orders').insert({
      bill_number: nextBillNumber, 
      total, 
      payment_method: paymentMethod || null, 
      branch_name: branchName, 
      type, 
      status, 
      table_id: tableId || null, 
      customer_id: customerId,
      customer_phone: customerPhone || null,
      date: new Date().toISOString()
    }).select().single();
    
    if (orderError) {
      console.error("Order Insert Error:", orderError);
      throw orderError;
    }

    const itemsToInsert = orderItems.map(item => ({
      order_id: orderData.id, 
      menu_item_id: item.menuItemId, 
      name: item.name, 
      price: item.price, 
      cost: item.cost, 
      quantity: item.quantity
    }));
    await supabase.from('order_items').insert(itemsToInsert);

    const { data: menuItems } = await fetchMenuItems();
    
    for (const item of orderItems) {
      const menuDetail = menuItems?.find(m => m.id === item.menuItemId);
      if (!menuDetail) continue;

      let size: Size = 'medium';
      if (item.name.includes('(Small)')) size = 'small';
      else if (item.name.includes('(Large)')) size = 'large';

      let activeRecipe = menuDetail.sizeRecipes?.[size] || menuDetail.recipe;
      
      if (activeRecipe && Array.isArray(activeRecipe)) {
        let sizeMultiplier = 1;
        const usingGlobalRecipe = !menuDetail.sizeRecipes?.[size];
        if (menuDetail.category === 'momo' && usingGlobalRecipe) {
          if (size === 'small') sizeMultiplier = 4;
          else if (size === 'large') sizeMultiplier = 8;
          else sizeMultiplier = 6;
        }

        for (const requirement of activeRecipe) {
          const totalConsumption = requirement.quantity * sizeMultiplier * item.quantity;
          
          const { data: existingInv } = await supabase
            .from('inventory')
            .select('current_stock, name, unit, category')
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
            }
          }
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
    last_purchase_date: new Date().toISOString(), is_finished: false
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
    last_purchase_date: new Date().toISOString(), 
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
    date: new Date().toISOString()
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
    .select(`*, order_items (*)`)
    .gte('date', `${startDate}T00:00:00`)
    .lte('date', `${endDate}T23:59:59`)
    .is('deletion_info', null)
    .order('bill_number', { ascending: false });
  if (!data) return [];
  return data.map(o => ({
    id: o.id, billNumber: o.bill_number, type: o.type, status: o.status, total: o.total, date: o.date, paymentMethod: o.payment_method, branchName: o.branch_name,
    customerPhone: o.customer_phone,
    customerId: o.customer_id,
    items: o.order_items.map((i: any) => ({ id: i.id, menuItemId: i.menu_item_id, name: i.name, price: i.price, cost: i.cost, quantity: i.quantity }))
  }));
}

export async function getOrderByBillNumber(billNumber: number): Promise<CompletedOrder | null> {
  const { data } = await supabase
    .from('orders')
    .select(`*, order_items (*)`)
    .eq('bill_number', billNumber)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id, billNumber: data.bill_number, type: data.type, status: data.status, total: data.total, date: data.date, paymentMethod: data.payment_method, branchName: data.branch_name, deletionInfo: data.deletion_info,
    customerPhone: data.customer_phone,
    customerId: data.customer_id,
    items: data.order_items.map((i: any) => ({ id: i.id, menuItemId: i.menu_item_id, name: i.name, price: i.price, cost: i.cost, quantity: i.quantity }))
  };
}

export async function getDeletedOrdersForDateRange(startDate: string, endDate: string): Promise<CompletedOrder[]> {
  const { data } = await supabase
    .from('orders')
    .select(`*, order_items (*)`)
    .gte('date', `${startDate}T00:00:00`)
    .lte('date', `${endDate}T23:59:59`)
    .not('deletion_info', 'is', null)
    .order('bill_number', { ascending: false });
  if (!data) return [];
  return data.map(o => ({
    id: o.id, billNumber: o.bill_number, type: o.type, status: o.status, total: o.total, date: o.date, paymentMethod: o.payment_method, branchName: o.branch_name, deletionInfo: o.deletion_info,
    items: o.order_items.map((i: any) => ({ id: i.id, menuItemId: i.menu_item_id, name: i.name, price: i.price, cost: i.cost, quantity: i.quantity }))
  }));
}

export async function deleteOrderByBillNumber(billNumber: number, reason: string): Promise<void> {
  const deletionInfo = { reason, date: new Date().toISOString() };
  await supabase.from('orders').update({ deletion_info: deletionInfo }).eq('bill_number', billNumber);
}

export async function updateTableStatus(tableId: string, status: string): Promise<void> {
  await supabase.from('dining_tables').update({ status }).eq('id', tableId);
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  await supabase.from('orders').update({ status }).eq('id', orderId);
}

// --- CUSTOMER MANAGEMENT ---

export async function getCustomerByPhone(phone: string): Promise<Customer | null> {
  const { data } = await supabase.rpc('get_customer_stats');
  if (!data) return null;
  const match = data.find((c: any) => c.phone === phone);
  if (!match) return null;
  
  const totalSpent = Number(match.total_spent || 0);
  return {
    id: match.id,
    phone: match.phone,
    totalOrders: Number(match.total_orders || 0),
    totalSpent: totalSpent,
    minCoins: Math.floor(totalSpent * 0.1),
    lastVisit: match.last_visit,
    joinedDate: match.joined_date
  };
}

export async function fetchCustomers(): Promise<Customer[]> {
  const { data } = await supabase
    .rpc('get_customer_stats'); 
  
  if (!data) return [];
  
  return data.map((c: any) => {
    const totalSpent = Number(c.total_spent || 0);
    return {
      id: c.id,
      phone: c.phone,
      totalOrders: Number(c.total_orders || 0),
      totalSpent: totalSpent,
      minCoins: Math.floor(totalSpent * 0.1),
      lastVisit: c.last_visit,
      joinedDate: c.joined_date
    };
  });
}

export async function fetchCustomerHistory(phone: string): Promise<CompletedOrder[]> {
  const { data } = await supabase
    .from('orders')
    .select(`*, order_items (*)`)
    .eq('customer_phone', phone)
    .is('deletion_info', null)
    .order('date', { ascending: false });
  
  if (!data) return [];
  return data.map(o => ({
    id: o.id, billNumber: o.bill_number, type: o.type, status: o.status, total: o.total, date: o.date, paymentMethod: o.payment_method, branchName: o.branch_name,
    customerPhone: o.customer_phone,
    customerId: o.customer_id,
    items: o.order_items.map((i: any) => ({ id: i.id, menuItemId: i.menu_item_id, name: i.name, price: i.price, cost: i.cost, quantity: i.quantity }))
  }));
}
