
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

export function isStudentFreeMojitoOrder(order: CompletedOrder): boolean {
  if (!order || !order.items) return false;
  const total = order.type === 'DELIVERY' && order.manualTotal != null ? order.manualTotal : order.total;
  const isZeroValue = Math.round(total) === 0;
  const hasStudentMojito = order.items.some(item => 
    item.id === 'student-mojito-gift' || 
    (item.name && item.name.includes('Student Promo')) || 
    item.menuItemId === 'promo-mojito'
  );
  return isZeroValue && hasStudentMojito;
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
    .order('date', { ascending: false });
  
  if (error) console.error("Procurement fetch error:", error);
  return { data: data || [], error };
}

export async function fetchAllNonVoidedProcurements(): Promise<any[]> {
  const { data, error } = await supabase
    .from('procurements')
    .select('*')
    .eq('is_voided', false)
    .order('date', { ascending: false });
  if (error) {
    console.error("Error fetching all non-voided procurements:", error);
    return [];
  }
  return data || [];
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

export async function voidProcurement(id: string, reason: string, performedBy: string = 'SYSTEM'): Promise<void> {
  const { data: p, error: fetchError } = await supabase.from('procurements').select('*').eq('id', id).single();
  if (fetchError || !p) throw new Error("Procurement not found.");
  if (p.is_voided) throw new Error("Already voided.");

  const { data: central } = await supabase.from('central_inventory').select('current_stock, name').eq('id', p.item_id).single();
  if (central) {
     const newStock = (central.current_stock || 0) - p.quantity;
     await supabase.from('central_inventory').update({ current_stock: newStock }).eq('id', p.item_id);

     // Log stock reversal
     await supabase.from('inventory_logs').insert({
       inventory_id: p.item_id,
       item_name: central.name || p.item_name,
       branch_name: 'CENTRAL_HUB',
       quantity_change: -p.quantity,
       reason: `VOID_PROCUREMENT: ${reason}`,
       performed_by: performedBy,
       date: getISTISOString()
     });
  }

  await supabase.from('procurements').update({ is_voided: true, void_reason: reason }).eq('id', id);
}

export async function toggleProcurementPaidStatus(id: string, isPaid: boolean): Promise<void> {
  const { error } = await supabase
    .from('procurements')
    .update({ is_paid: isPaid })
    .eq('id', id);
  if (error) throw error;
}

export function syncSubcategoriesToLocal(items: any[]): void {
  try {
    const saved = localStorage.getItem('custom_subcategories') || '{}';
    const map = JSON.parse(saved);
    let changed = false;
    items.forEach(item => {
      if (item && item.id) {
        if (item.subcategory) {
          if (map[item.id] !== item.subcategory) {
            map[item.id] = item.subcategory;
            changed = true;
          }
        } else if (map[item.id]) {
          // Local storage has it but Supabase is NULL. Sync it to Supabase asynchronously.
          const subcat = map[item.id];
          (async () => {
            try {
              await supabase
                .from('central_inventory')
                .update({ subcategory: subcat })
                .eq('id', item.id);
              await supabase
                .from('inventory')
                .update({ subcategory: subcat })
                .eq('id', item.id);
            } catch (err) {
              // Safe to ignore if table/column does not exist yet
            }
          })();
        }
      }
    });
    if (changed) {
      localStorage.setItem('custom_subcategories', JSON.stringify(map));
    }
  } catch (e) {
    console.error("Failed to sync subcategories:", e);
  }
}

export const getItemSubcategory = (name: string, id: string, category?: string, subcategory?: string): string => {
  const nid = id.toLowerCase();
  const nname = name.toLowerCase();

  // Force packaging if the item is clearly a packaging material (boxes, bags, cups, containers, foil, plastic, etc.)
  if (
    nid.includes('box') || nname.includes('box') ||
    nid.includes('pkg') || nname.includes('pkg') ||
    nid.includes('bag') || nname.includes('bag') ||
    nid.includes('cup') || nname.includes('cup') ||
    nid.includes('paper') || nname.includes('paper') ||
    nid.includes('glass') || nname.includes('glass') ||
    nid.includes('spoon') || nname.includes('spoon') ||
    nid.includes('fork') || nname.includes('fork') ||
    nid.includes('straw') || nname.includes('straw') ||
    nid.includes('container') || nname.includes('container') ||
    nid.includes('foil') || nname.includes('foil') ||
    nid.includes('plastic') || nname.includes('plastic') ||
    nid.includes('tissue') || nname.includes('tissue') ||
    nid.includes('plate') || nname.includes('plate') ||
    nid.includes('wrap') || nname.includes('wrap')
  ) {
    return 'packaging';
  }

  if (subcategory) return subcategory;
  try {
    const saved = localStorage.getItem('custom_subcategories');
    if (saved) {
      const map = JSON.parse(saved);
      if (map[id]) return map[id];
    }
  } catch (e) {
    console.error(e);
  }
  
  // Category A / MOMO subcategories
  if ((nid.includes('momo') || nname.includes('momo')) && 
      !nid.startsWith('pkg-') && 
      !nid.includes('box') && 
      !nname.includes('box') && 
      !nid.startsWith('spice-') && 
      !nname.includes('masala') &&
      !nname.includes('chutney') &&
      !nname.includes('sauce') &&
      category !== 'PACKET'
  ) return 'momo';
  if (nid.includes('bun') || nname.includes('bun') || nid.includes('moburg') || nname.includes('moburg')) return 'buns';
  if (nid.includes('cola') || nname.includes('cola')) return 'cola';
  if (nid.includes('water') || nname.includes('water') || nid.includes('soda') || nname.includes('soda') || nid.includes('drink') || nname.includes('drink')) return 'drinks';
  
  // Category B / PACKET subcategories
  if (nid.includes('fries') || nname.includes('fries')) return 'fries';
  if (nid.includes('syrup') || nname.includes('syrup') || nid.includes('lagoon') || nname.includes('lagoon') || nid.includes('mojito') || nname.includes('mojito')) return 'syrups';
  if (nid.includes('sauce') || nname.includes('sauce') || nid.includes('mayo') || nname.includes('mayo') || nid.includes('chutney') || nname.includes('chutney') || nid.includes('spread') || nname.includes('spread')) return 'sauces';
  
  if (
    nid.includes('pkg') || nname.includes('pkg') || 
    nid.includes('box') || nname.includes('box') || 
    nid.includes('bag') || nname.includes('bag') || 
    nid.includes('cup') || nname.includes('cup') || 
    nid.includes('paper') || nname.includes('paper') ||
    nid.includes('glass') || nname.includes('glass') ||
    nid.includes('spoon') || nname.includes('spoon') ||
    nid.includes('fork') || nname.includes('fork') ||
    nid.includes('straw') || nname.includes('straw') ||
    nid.includes('container') || nname.includes('container') ||
    nid.includes('foil') || nname.includes('foil') ||
    nid.includes('plastic') || nname.includes('plastic')
  ) return 'packaging';
  
  if (nid.includes('oil') || nname.includes('oil') || nid.includes('butter') || nname.includes('butter') || nid.includes('cheese') || nname.includes('cheese') || nid.includes('ghee') || nname.includes('ghee')) return 'oil-butter';
  
  if (
    nid.includes('spice') || nname.includes('spice') || 
    nid.includes('masala') || nname.includes('masala') || 
    nid.includes('oregano') || nname.includes('oregano') || 
    nid.includes('flake') || nname.includes('flake') || 
    nid.includes('peri') || nname.includes('peri') ||
    nid.includes('kashmiri') || nname.includes('kashmiri') ||
    nid.includes('powder') || nname.includes('powder') ||
    nid.includes('poweder') || nname.includes('poweder') ||
    nid.includes('methi') || nname.includes('methi')
  ) return 'spices';
  
  if (category === 'INGREDIENT' || category === 'Raw Ingredients') return 'veggies';
  if (nid.includes('veg') || nname.includes('veg') || nid.includes('chicken') || nname.includes('chicken') || nid.includes('paneer') || nname.includes('paneer') || nid.includes('onion') || nname.includes('onion')) return 'veggies';

  return 'others'; // Default fallback
};

export function mapSubcategoryToDebitCategory(subcat: string): string {
  const s = subcat.toLowerCase().trim();
  if (s === 'momo') return 'momo';
  if (s === 'buns') return 'burger buns';
  if (s === 'cola' || s === 'drinks' || s === 'syrups') return 'soft drinks';
  if (s === 'packaging') return 'packaginf'; // exact name in global ledger categories list
  if (s === 'veggies') return 'veggies';
  if (s === 'spices') return 'grocery';
  if (s === 'oil-butter') return 'grocery';
  if (s === 'fries') return 'grocery';
  if (s === 'sauces') return 'grocery';
  return 'others';
}

export async function logCombinedVendorPaymentToFinance(
  vendorName: string,
  subcategory: string,
  totalCost: number,
  paidAt: string,
  paymentMode: string,
  splitCashAmount?: number,
  splitUpiAmount?: number,
  fundSource?: string,
  notes?: string | null,
  procIds?: string[]
): Promise<void> {
  const MONTHS = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];
  const dateObj = paidAt ? new Date(paidAt) : new Date();
  const monthName = MONTHS[isNaN(dateObj.getTime()) ? new Date().getMonth() : dateObj.getMonth()];
  const yearVal = isNaN(dateObj.getTime()) ? new Date().getFullYear() : dateObj.getFullYear();
  const tabName = `${monthName} ${yearVal}`;
  const dateString = isNaN(dateObj.getTime()) 
    ? new Date().toISOString().split('T')[0] 
    : dateObj.toISOString().split('T')[0];

  const rec: any = {
    tab_name: tabName,
    date: dateString,
    is_opening: false,
    bill_url: null
  };

  const debitCategory = mapSubcategoryToDebitCategory(subcategory);
  const fundSuffix = fundSource ? ` - Paid from ${fundSource}` : '';
  const notesStr = notes ? ` (${notes})` : '';
  const idsStr = procIds && procIds.length > 0 ? ` [ProcIDs: ${procIds.join(',')}]` : '';
  
  const desc = `${debitCategory}: Vendor Payment: ${vendorName} - ${subcategory.toUpperCase()} Bill${notesStr}${fundSuffix}${idsStr}`;

  if (paymentMode === 'SPLIT' && splitCashAmount !== undefined && splitUpiAmount !== undefined) {
    rec.debit_cash = splitCashAmount;
    rec.debit_cash_details = `${desc} (Cash Portion)`;
    rec.debit_bank = splitUpiAmount;
    rec.debit_bank_details = `${desc} (UPI Portion)`;
  } else if (paymentMode === 'CASH') {
    rec.debit_cash = totalCost;
    rec.debit_cash_details = desc;
  } else {
    rec.debit_bank = totalCost;
    rec.debit_bank_details = `${desc} (${paymentMode})`;
  }

  const { error } = await supabase.from('finance_ledger').insert(rec);
  if (error) console.error("Failed to insert combined bill into finance_ledger:", error);
}

export async function logLedgerDebitForProcurement(
  proc: any,
  paidAt: string,
  paymentMode: string,
  splitCashAmount?: number,
  splitUpiAmount?: number,
  totalSelectedAmount?: number,
  fundSource?: string
): Promise<void> {
  const MONTHS = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];
  const dateObj = paidAt ? new Date(paidAt) : new Date();
  const monthName = MONTHS[isNaN(dateObj.getTime()) ? new Date().getMonth() : dateObj.getMonth()];
  const yearVal = isNaN(dateObj.getTime()) ? new Date().getFullYear() : dateObj.getFullYear();
  const tabName = `${monthName} ${yearVal}`;
  const dateString = isNaN(dateObj.getTime()) 
    ? new Date().toISOString().split('T')[0] 
    : dateObj.toISOString().split('T')[0];

  const rec: any = {
    tab_name: tabName,
    date: dateString,
    is_opening: false,
    bill_url: null
  };

  const subcat = getItemSubcategory(proc.item_name, proc.item_id);
  const debitCategory = mapSubcategoryToDebitCategory(subcat);
  const fundSuffix = fundSource ? ` - Paid from ${fundSource}` : '';
  const desc = `${debitCategory}: Vendor Payment: ${proc.vendor || 'Local Market'} - ${proc.item_name} (Qty: ${proc.quantity || 0} ${proc.unit || 'pcs'}) [ProcID: ${proc.id}]${fundSuffix}`;

  if (paymentMode === 'SPLIT' && splitCashAmount !== undefined && splitUpiAmount !== undefined && totalSelectedAmount) {
    // Proportional split
    const ratio = (proc.total_cost || 0) / totalSelectedAmount;
    const procCash = Math.round((splitCashAmount * ratio) * 100) / 100;
    const procUpi = Math.round((splitUpiAmount * ratio) * 100) / 100;

    rec.debit_cash = procCash;
    rec.debit_cash_details = `${desc} (Cash Portion)`;
    rec.debit_bank = procUpi;
    rec.debit_bank_details = `${desc} (UPI Portion)`;
  } else if (paymentMode === 'CASH') {
    rec.debit_cash = proc.total_cost || 0;
    rec.debit_cash_details = desc;
  } else {
    // UPI or CARD or BANK
    rec.debit_bank = proc.total_cost || 0;
    rec.debit_bank_details = `${desc} (${paymentMode})`;
  }

  const { error } = await supabase.from('finance_ledger').insert(rec);
  if (error) console.error("Failed to insert into finance_ledger:", error);
}

export async function updateProcurementPayment(
  id: string,
  isPaid: boolean,
  paidAt: string | null,
  paidBy: string | null,
  paymentNotes: string | null,
  paymentMode: string | null,
  paymentHistory: any[],
  splitCashAmount?: number,
  splitUpiAmount?: number,
  fundSource?: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('procurements')
      .update({
        is_paid: isPaid,
        paid_at: paidAt,
        paid_by: paidBy,
        payment_notes: paymentNotes,
        payment_mode: paymentMode,
        payment_history: paymentHistory
      })
      .eq('id', id);

    if (error) {
      if (error.code === '42703') {
        const { error: fallbackError } = await supabase
          .from('procurements')
          .update({ is_paid: isPaid })
          .eq('id', id);
        if (fallbackError) throw fallbackError;
        throw new Error("COLUMN_MISSING");
      }
      throw error;
    }

    // Handle Global Ledger Sync
    if (isPaid && paidAt && paymentMode) {
      // First, delete any pre-existing ledger items for this procurement to avoid duplicates on re-save
      await supabase
        .from('finance_ledger')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          delete_reason: 'Payment Updated/Replaced'
        })
        .or(`debit_cash_details.like.%[ProcID: ${id}]%,debit_bank_details.like.%[ProcID: ${id}]%`);

      // Fetch procurement details to log to ledger
      const { data: proc } = await supabase.from('procurements').select('*').eq('id', id).single();
      if (proc) {
        await logLedgerDebitForProcurement(
          proc,
          paidAt,
          paymentMode,
          splitCashAmount,
          splitUpiAmount,
          proc.total_cost || 1,
          fundSource
        );
      }
    } else if (!isPaid) {
      // Reversal: mark as deleted in ledger
      await supabase
        .from('finance_ledger')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          delete_reason: 'Procurement marked unpaid/reversed'
        })
        .or(`debit_cash_details.like.%[ProcID: ${id}]%,debit_bank_details.like.%[ProcID: ${id}]%`);
    }
  } catch (err: any) {
    if (err.message === "COLUMN_MISSING") {
      throw new Error("Advanced payment tracking columns are missing. Simple status was updated. Please run the Master Sync Script in Supabase to enable audit logs!");
    }
    throw err;
  }
}

export async function bulkPayProcurements(
  ids: string[],
  paidAt: string,
  paidBy: string,
  paymentNotes: string | null,
  paymentMode: string,
  splitCashAmount?: number,
  splitUpiAmount?: number,
  fundSource?: string,
  subcategory?: string
): Promise<void> {
  try {
    const { data: procs, error: fetchErr } = await supabase
      .from('procurements')
      .select('id, item_id, payment_history, total_cost, item_name, quantity, unit, vendor')
      .in('id', ids);

    if (fetchErr) throw fetchErr;
    if (!procs || procs.length === 0) return;

    const totalSelectedAmount = procs.reduce((sum, p) => sum + (p.total_cost || 0), 0);
    const vendorName = procs[0].vendor || 'Local Market';

    for (const proc of procs) {
      const nextHistory = Array.isArray(proc.payment_history) ? [...proc.payment_history] : [];
      nextHistory.push({
        event: 'payment',
        amount: proc.total_cost || 0,
        date: paidAt,
        performed_by: paidBy,
        notes: paymentNotes,
        payment_mode: paymentMode,
        reason: 'Bulk Vendor Payment',
        fund_source: fundSource,
        subcategory: subcategory
      });

      const { error: updateErr } = await supabase
        .from('procurements')
        .update({
          is_paid: true,
          paid_at: paidAt,
          paid_by: paidBy,
          payment_notes: paymentNotes,
          payment_mode: paymentMode,
          payment_history: nextHistory
        })
        .eq('id', proc.id);

      if (updateErr) throw updateErr;

      // First, delete any pre-existing ledger items for this procurement to avoid duplicates on re-save
      await supabase
        .from('finance_ledger')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          delete_reason: 'Payment Updated/Replaced'
        })
        .or(`debit_cash_details.like.%[ProcID: ${proc.id}]%,debit_bank_details.like.%[ProcID: ${proc.id}]%,debit_cash_details.like.%${proc.id}%,debit_bank_details.like.%${proc.id}%`);
    }

    // Determine the consolidated subcategory
    const finalSubcat = subcategory || getItemSubcategory(procs[0].item_name, procs[0].item_id);

    // Log ONE combined vendor payment debit to the global ledger!
    await logCombinedVendorPaymentToFinance(
      vendorName,
      finalSubcat,
      totalSelectedAmount,
      paidAt,
      paymentMode,
      splitCashAmount,
      splitUpiAmount,
      fundSource,
      paymentNotes,
      ids
    );

  } catch (err: any) {
    throw err;
  }
}

// --- ALLOCATIONS ---

export async function fetchAllocations(startDate: string, endDate: string): Promise<{ data: StockAllocation[], error: any }> {
  const { data, error } = await supabase
    .from('stock_allocations')
    .select('*')
    .gte('date', `${startDate}T00:00:00+05:30`)
    .lte('date', `${endDate}T23:59:59+05:30`)
    .order('date', { ascending: false });
  return { data: (data as StockAllocation[]) || [], error };
}

export async function fetchManualAdjustments(startDate: string, endDate: string): Promise<{ data: any[], error: any }> {
  const { data, error } = await supabase
    .from('inventory_logs')
    .select('*')
    .ilike('reason', '%ADJUSTMENT%')
    .gte('date', `${startDate}T00:00:00+05:30`)
    .lte('date', `${endDate}T23:59:59+05:30`)
    .order('date', { ascending: false });
  return { data: data || [], error };
}

export async function voidAllocation(id: string, reason: string, performedBy: string = 'SYSTEM'): Promise<void> {
  const { data: a, error: fetchError } = await supabase.from('stock_allocations').select('*').eq('id', id).single();
  if (fetchError || !a) throw new Error("Allocation not found.");
  if (a.is_voided) throw new Error("Already voided.");

  const { data: central } = await supabase.from('central_inventory').select('current_stock, name').eq('id', a.material_id).single();
  if (central) {
    const newHubStock = (central.current_stock || 0) + a.quantity;
    await supabase.from('central_inventory').update({ current_stock: newHubStock }).eq('id', a.material_id);

    // Log Hub reversal (adding back)
    await supabase.from('inventory_logs').insert({
      inventory_id: a.material_id,
      item_name: central.name || a.material_name,
      branch_name: 'CENTRAL_HUB',
      quantity_change: a.quantity,
      reason: `VOID_ALLOCATION (RECLAIM): ${reason}`,
      performed_by: performedBy,
      date: getISTISOString()
    });
  }

  const { data: station } = await supabase.from('inventory').select('current_stock, name').eq('id', a.material_id).eq('branch_name', a.station_name).maybeSingle();
  if (station) {
    const newStationStock = (station.current_stock || 0) - a.quantity;
    await supabase.from('inventory').update({ current_stock: newStationStock }).eq('id', a.material_id).eq('branch_name', a.station_name);

    // Log Branch reversal (deducting what was accidentally dispatched)
    await supabase.from('inventory_logs').insert({
      inventory_id: a.material_id,
      item_name: station.name || a.material_name,
      branch_name: a.station_name,
      quantity_change: -a.quantity,
      reason: `VOID_ALLOCATION (REMOVAL): ${reason}`,
      performed_by: performedBy,
      date: getISTISOString()
    });
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
    manualTotal: o.manual_total,
    manualDiscount: o.manual_discount,
    cashierId: o.cashier_id,
    cashierName: o.cashier_name,
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
  customerPhone?: string,
  manualTotal?: number,
  manualDiscount?: number,
  cashierId?: string,
  cashierName?: string
): Promise<number | null> {
  try {
    const nextBillNumber = await peekNextBillNumber();
    
    if (customerPhone) {
      customerPhone = normalizePhone(customerPhone);
    }

    let customerId = null;
    if (customerPhone && customerPhone.length === 10) {
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
      customer_phone: customerPhone || null,
      manual_total: manualTotal != null ? Math.round(manualTotal) : null,
      manual_discount: manualDiscount != null ? Math.round(manualDiscount) : null,
      cashier_id: cashierId || null,
      cashier_name: cashierName || null
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
          !item.menuItemId.includes('discount') && 
          !item.menuItemId.includes('promo') &&
          item.menuItemId !== 'registration') {
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
    if (customerPhone) {
        await syncCustomerStats(customerPhone);
        
        const usesWelcomeDiscount = orderItems.some(i => i.id === 'welcome-discount');
        if (usesWelcomeDiscount) {
          await supabase.from('customers').update({ welcome_coupon_used: true }).eq('id', customerId);
        }
    }

    const { data: menuItems } = await fetchMenuItems();

    for (const item of orderItems) {
      if (!item.menuItemId || item.menuItemId === 'discount') continue;

      let menuDetail = menuItems?.find(m => m.id === item.menuItemId);
      if (!menuDetail) {
        // Robust Fallback: Try matching by name if item.menuItemId doesn't map directly
        const baseName = item.name.replace(/^(Steamed|Fried|Pan Fried|Pan-Fried|Peri-Peri|Peri peri|Normal)\s+/i, '').split(' (')[0].trim();
        menuDetail = menuItems?.find(m => m.name.toLowerCase() === baseName.toLowerCase() || m.name.toLowerCase() === item.name.toLowerCase());
      }

      if (!menuDetail) {
        console.warn(`Deduction Skip: Menu item details not found for ID: ${item.menuItemId} (Name: ${item.name})`);
        continue;
      }

      // Determine size robustly from name suffix
      let size: Size = 'medium';
      const nameLower = item.name.toLowerCase();
      if (nameLower.includes('(small)') || nameLower.includes('small') || item.id === 'gift-campa-cola' || nameLower.includes('campa cola (gift)')) size = 'small';
      else if (nameLower.includes('(large)') || nameLower.includes('large')) size = 'large';
      else if (nameLower.includes('(medium)') || nameLower.includes('medium')) size = 'medium';

      // Only deduct the stock based on size specific recipe for each item as specified by menu.
      const sizeRecipe = menuDetail.sizeRecipes?.[size];
      let activeRecipe = (sizeRecipe && Array.isArray(sizeRecipe) && sizeRecipe.length > 0) ? sizeRecipe : [];
      if (activeRecipe.length === 0 && menuDetail.recipe && Array.isArray(menuDetail.recipe) && menuDetail.recipe.length > 0) {
        activeRecipe = menuDetail.recipe;
      }
      
      if (activeRecipe.length > 0) {
        for (const requirement of activeRecipe) {
          const totalConsumption = requirement.quantity * item.quantity;
          
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
            
            await supabase.from('inventory_logs').insert({
              inventory_id: requirement.materialId,
              branch_name: branchName,
              quantity_change: -totalConsumption,
              reason: `ORDER_BILL_${nextBillNumber}`,
              date: getISTISOString()
            });
          } else {
            // Material doesn't exist at this station yet, create it with negative initial stock
            const { data: centralInfo } = await supabase
              .from('central_inventory')
              .select('*')
              .eq('id', requirement.materialId)
              .maybeSingle();
            
            if (centralInfo) {
              const insertPayload: any = {
                id: requirement.materialId,
                branch_name: branchName,
                name: centralInfo.name,
                unit: centralInfo.unit,
                category: centralInfo.category,
                current_stock: -totalConsumption,
                is_finished: false,
                request_pending: false
              };
              if (centralInfo.subcategory) {
                insertPayload.subcategory = centralInfo.subcategory;
              }

              const { error: insertErr } = await supabase.from('inventory').insert(insertPayload);
              if (insertErr) {
                if (centralInfo.subcategory && insertErr.message && insertErr.message.includes("subcategory")) {
                  delete insertPayload.subcategory;
                  await supabase.from('inventory').insert(insertPayload);
                } else {
                  console.error("Failed to insert branch inventory:", insertErr);
                }
              }

              await supabase.from('inventory_logs').insert({
                inventory_id: requirement.materialId,
                branch_name: branchName,
                quantity_change: -totalConsumption,
                reason: `ORDER_BILL_${nextBillNumber}`,
                date: getISTISOString()
              });
            } else {
              console.warn(`Stock Deduction Error: Material ${requirement.materialId} not found in Central Inventory.`);
            }
          }
        }
      } else {
        console.info(`No size-specific recipe defined for item: ${menuDetail.name} (Size: ${size}). Stock not deducted.`);
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
  const { data: users, error: userError } = await supabase
    .from('app_users')
    .select('*, stations!app_users_station_id_fkey(name)');
  
  if (userError) throw userError;

  const { data: assignments, error: assignmentError } = await supabase
    .from('user_stations')
    .select('user_id, station_id, stations:station_id(name)');
  
  if (assignmentError) throw assignmentError;

  return (users || []).map(u => {
    const assigned = assignments
      ?.filter(a => a.user_id === u.id)
      .map(a => ({ id: a.station_id, name: (a.stations as any)?.name })) || [];
    
    if (assigned.length === 0 && u.station_id) {
      assigned.push({ id: u.station_id, name: u.stations?.name });
    }

    return {
      ...u,
      assignedStations: assigned
    };
  });
}

export async function createAppUser(user: { username: string, password: string, role: string, station_id?: string, station_ids?: string[] }): Promise<void> {
  const { station_ids, ...userData } = user;
  const { data, error } = await supabase.from('app_users').insert(userData).select().single();
  if (error) throw error;

  if (station_ids && station_ids.length > 0) {
    const assignments = station_ids.map(sid => ({ user_id: data.id, station_id: sid }));
    const { error: relError } = await supabase.from('user_stations').insert(assignments);
    if (relError) throw relError;
  }
}

export async function updateAppUser(userId: string, user: { username: string, password: string, role: string, station_id?: string, station_ids?: string[] }): Promise<void> {
  const { station_ids, ...userData } = user;
  
  // Update main user data
  const { error: userError } = await supabase
    .from('app_users')
    .update(userData)
    .eq('id', userId);
    
  if (userError) throw userError;

  // Update station assignments: delete old and insert new
  const { error: deleteError } = await supabase
    .from('user_stations')
    .delete()
    .eq('user_id', userId);
    
  if (deleteError) throw deleteError;

  if (station_ids && station_ids.length > 0) {
    const assignments = station_ids.map(sid => ({ user_id: userId, station_id: sid }));
    const { error: relError } = await supabase.from('user_stations').insert(assignments);
    if (relError) throw relError;
  }
}

export async function getCentralInventory(): Promise<CentralMaterial[]> {
  const { data, error } = await supabase.from('central_inventory').select('*').order('name');
  if (error) throw error;
  const items = data || [];
  syncSubcategoriesToLocal(items);
  return items;
}

export async function createCentralItem(
  name: string, 
  unit: string, 
  initialQty: number, 
  costPerUnit: number, 
  category: MaterialCategory,
  manualId?: string,
  subcategory?: string
): Promise<void> {
  const id = manualId || name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const payload: any = {
    id, name, unit, category, current_stock: initialQty, 
    last_purchase_cost: costPerUnit,
    last_purchase_date: getISTISOString(), is_finished: false
  };
  const finalSubcategory = subcategory || getItemSubcategory(name, id, category);
  if (finalSubcategory) {
    payload.subcategory = finalSubcategory;
  }

  const { error } = await supabase.from('central_inventory').upsert(payload);
  if (error) {
    if (finalSubcategory && error.message && error.message.includes("subcategory")) {
      delete payload.subcategory;
      const { error: retryError } = await supabase.from('central_inventory').upsert(payload);
      if (retryError) throw retryError;
    } else {
      throw error;
    }
  }
}

export async function updateCentralItem(id: string, name: string, unit: string, category: MaterialCategory, subcategory?: string): Promise<void> {
  const payloadCentral: any = { name, unit, category };
  const finalSub = subcategory || getItemSubcategory(name, id, category);
  if (finalSub) payloadCentral.subcategory = finalSub;

  const { error: centralErr } = await supabase
    .from('central_inventory')
    .update(payloadCentral)
    .eq('id', id);

  if (centralErr) {
    if (finalSub && centralErr.message && centralErr.message.includes("subcategory")) {
      delete payloadCentral.subcategory;
      const { error: retryErr } = await supabase
        .from('central_inventory')
        .update(payloadCentral)
        .eq('id', id);
      if (retryErr) throw retryErr;
    } else {
      throw centralErr;
    }
  }

  const payloadBranch: any = { name, unit, category };
  if (finalSub) payloadBranch.subcategory = finalSub;

  const { error: branchErr } = await supabase
    .from('inventory')
    .update(payloadBranch)
    .eq('id', id);
  if (branchErr) {
    if (finalSub && branchErr.message && branchErr.message.includes("subcategory")) {
      delete payloadBranch.subcategory;
      await supabase
        .from('inventory')
        .update(payloadBranch)
        .eq('id', id);
    } else {
      console.warn("Failed to update branch inventory items (might not exist yet):", branchErr);
    }
  }
}

export async function saveItemSubcategory(id: string, subcategory: string): Promise<void> {
  try {
    const saved = localStorage.getItem('custom_subcategories') || '{}';
    const map = JSON.parse(saved);
    map[id] = subcategory;
    localStorage.setItem('custom_subcategories', JSON.stringify(map));
  } catch (e) {
    console.error("Failed to save item subcategory locally:", e);
  }

  try {
    const { error: err1 } = await supabase
      .from('central_inventory')
      .update({ subcategory })
      .eq('id', id);
    if (err1 && !err1.message.includes("subcategory")) {
      console.warn("Failed to update central_inventory subcategory:", err1.message);
    }

    const { error: err2 } = await supabase
      .from('inventory')
      .update({ subcategory })
      .eq('id', id);
    if (err2 && !err2.message.includes("subcategory")) {
      console.warn("Failed to update inventory subcategory:", err2.message);
    }
  } catch (dbErr) {
    console.error("Failed to save item subcategory to Supabase:", dbErr);
  }
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
  
  const payload: any = {
    id: materialId, 
    branch_name: stationName, 
    name: central.name, 
    unit: central.unit, 
    category: central.category, 
    current_stock: newStationStock, 
    is_finished: false, 
    request_pending: false
  };
  const finalSub = central.subcategory || getItemSubcategory(central.name, materialId, central.category);
  if (finalSub) {
    payload.subcategory = finalSub;
  }

  const { error: storeError } = await supabase.from('inventory').upsert(payload, { onConflict: 'id,branch_name' });
  if (storeError) {
    if (finalSub && storeError.message && storeError.message.includes("subcategory")) {
      delete payload.subcategory;
      const { error: retryError } = await supabase.from('inventory').upsert(payload, { onConflict: 'id,branch_name' });
      if (retryError) throw retryError;
    } else {
      throw storeError;
    }
  }

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
  
  if (finished) {
    try {
      const { data: itemData } = await supabase.from('inventory').select('name').eq('id', id).eq('branch_name', branchName).maybeSingle();
      await supabase.from('inventory_logs').insert({
        inventory_id: id,
        item_name: itemData?.name || id,
        branch_name: branchName,
        quantity_change: 0,
        reason: 'STOCK_OVER',
        date: getISTISOString()
      });
    } catch (e) {
      console.warn("Could not insert STOCK_OVER historical log", e);
    }
  }
}

export async function markCentralFinished(id: string, finished: boolean): Promise<void> {
  await supabase.from('central_inventory').update({ is_finished: finished, current_stock: finished ? 0 : 1 }).eq('id', id);
  
  if (finished) {
    try {
      const { data: itemData } = await supabase.from('central_inventory').select('name').eq('id', id).maybeSingle();
      await supabase.from('inventory_logs').insert({
        inventory_id: id,
        item_name: itemData?.name || id,
        branch_name: 'CENTRAL_HUB',
        quantity_change: 0,
        reason: 'STOCK_OVER',
        date: getISTISOString()
      });
    } catch (e) {
      console.warn("Could not insert central STOCK_OVER historical log", e);
    }
  }
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
  const items = data || [];
  syncSubcategoriesToLocal(items);
  return items;
}

export async function getAllInventories(): Promise<RawMaterial[]> {
  const { data } = await supabase.from('inventory').select('*');
  const items = data || [];
  syncSubcategoriesToLocal(items);
  return items;
}

export async function manuallyAdjustStock(
  itemId: string, 
  branchName: string, 
  newQuantity: number, 
  reason: string,
  performedBy: string,
  adjustmentCategory?: string
): Promise<void> {
  const { data: existing } = await supabase
    .from('inventory')
    .select('current_stock, name')
    .eq('id', itemId)
    .eq('branch_name', branchName)
    .maybeSingle();

  const oldStock = existing?.current_stock || 0;
  const itemName = existing?.name || itemId;
  const change = newQuantity - oldStock;

  // 1. Update Inventory
  const { error: updateError } = await supabase
    .from('inventory')
    .update({ 
      current_stock: newQuantity,
      is_finished: newQuantity <= 0,
      request_pending: false,
      last_purchase_date: getISTISOString()
    })
    .eq('id', itemId)
    .eq('branch_name', branchName);

  if (updateError) throw updateError;

  // 2. Log Change
  const formattedReason = adjustmentCategory 
    ? `[${adjustmentCategory}] ${reason}`
    : reason;

  const insertData: any = {
    inventory_id: itemId,
    item_name: itemName,
    branch_name: branchName,
    quantity_change: change,
    reason: `MANUAL_ADJUSTMENT: ${formattedReason}`,
    performed_by: performedBy,
    date: getISTISOString()
  };

  if (adjustmentCategory) {
    try {
      const { error: logErrorWithCat } = await supabase
        .from('inventory_logs')
        .insert({
          ...insertData,
          adjustment_category: adjustmentCategory
        });
      
      if (!logErrorWithCat) return;
      console.warn("Could not insert with adjustment_category column, falling back...", logErrorWithCat);
    } catch (err) {
      console.warn("Could not insert with adjustment_category column due to exception, falling back...", err);
    }
  }

  const { error: logError } = await supabase
    .from('inventory_logs')
    .insert(insertData);

  if (logError) throw logError;
}

export async function manuallyAdjustCentralStock(
  itemId: string, 
  newQuantity: number, 
  reason: string,
  performedBy: string,
  adjustmentCategory?: string
): Promise<void> {
  const { data: existing } = await supabase
    .from('central_inventory')
    .select('current_stock, name')
    .eq('id', itemId)
    .maybeSingle();

  const oldStock = existing?.current_stock || 0;
  const itemName = existing?.name || itemId;
  const change = newQuantity - oldStock;

  // 1. Update Central Inventory
  const { error: updateError } = await supabase
    .from('central_inventory')
    .update({ 
      current_stock: newQuantity,
      is_finished: newQuantity <= 0,
      last_purchase_date: getISTISOString()
    })
    .eq('id', itemId);

  if (updateError) throw updateError;

  const formattedReason = adjustmentCategory 
    ? `[${adjustmentCategory}] ${reason}`
    : reason;

  const insertData: any = {
    inventory_id: itemId,
    item_name: itemName,
    branch_name: 'CENTRAL_HUB',
    quantity_change: change,
    reason: `CENTRAL_MANUAL_ADJUSTMENT: ${formattedReason}`,
    performed_by: performedBy,
    date: getISTISOString()
  };

  if (adjustmentCategory) {
    try {
      const { error: logErrorWithCat } = await supabase
        .from('inventory_logs')
        .insert({
          ...insertData,
          adjustment_category: adjustmentCategory
        });
      
      if (!logErrorWithCat) return;
      console.warn("Could not insert with adjustment_category column, falling back...", logErrorWithCat);
    } catch (err) {
      console.warn("Could not insert with adjustment_category column due to exception, falling back...", err);
    }
  }

  // 2. Log Change (targeting central logs if exists, otherwise general logs with 'CENTRAL' branch)
  const { error: logError } = await supabase
    .from('inventory_logs')
    .insert(insertData);

  if (logError) throw logError;
}

export async function resetAllStockToZero(
  type: 'HUB' | 'BRANCH', 
  reason: string, 
  performedBy: string,
  branchName?: string
): Promise<void> {
  if (type === 'HUB') {
    const { data: items } = await supabase.from('central_inventory').select('id, current_stock');
    if (!items) return;

    for (const item of items) {
      if (item.current_stock === 0) continue;
      await manuallyAdjustCentralStock(item.id, 0, `MASTER_RESET: ${reason}`, performedBy);
    }
  } else if (type === 'BRANCH' && branchName) {
    const { data: items } = await supabase.from('inventory').select('id, current_stock').eq('branch_name', branchName);
    if (!items) return;

    for (const item of items) {
      if (item.current_stock === 0) continue;
      await manuallyAdjustStock(item.id, branchName, 0, `MASTER_RESET: ${reason}`, performedBy);
    }
  }
}

export async function getOrdersForDateRange(startDate: string, endDate: string): Promise<CompletedOrder[]> {
  let allData: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    
    const { data, error } = await supabase
      .from('orders')
      .select(`*, items:order_items (*)`)
      .gte('date', `${startDate}T00:00:00+05:30`)
      .lte('date', `${endDate}T23:59:59+05:30`)
      .is('deletion_info', null)
      .order('bill_number', { ascending: false })
      .range(from, to);

    if (error || !data || data.length === 0) {
      hasMore = false;
    } else {
      allData = allData.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  // For orders missing items, try a fallback fetch (though this is more common for single orders due to RLS/join limits)
  const results = await Promise.all(allData.map(async (o) => {
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
  let allData: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    
    const { data, error } = await supabase
      .from('orders')
      .select(`*, items:order_items (*)`)
      .gte('date', `${startDate}T00:00:00+05:30`)
      .lte('date', `${endDate}T23:59:59+05:30`)
      .not('deletion_info', 'is', null)
      .order('bill_number', { ascending: false })
      .range(from, to);

    if (error || !data || data.length === 0) {
      hasMore = false;
    } else {
      allData = allData.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  const results = await Promise.all(allData.map(async (o) => {
    if (!o.items || o.items.length === 0) {
       const { data: fallbackItems } = await supabase.from('order_items').select('*').eq('order_id', o.id);
       if (fallbackItems && fallbackItems.length > 0) o.items = fallbackItems;
    }
    return mapDatabaseOrderToType(o);
  }));

  return results;
}

export async function syncCustomerStats(phone: string): Promise<void> {
  const normalized = normalizePhone(phone);
  if (!normalized) return;

  const history = await fetchCustomerHistory(normalized);
  const totalOrders = history.length;
  const totalSpent = history.reduce((acc, o) => acc + (o.manualTotal != null ? o.manualTotal : o.total), 0);
  const redeemedCoins = await getRedeemedCoins(normalized);
  const minCoins = calculateTotalMinCoins(totalSpent, redeemedCoins);
  const lastVisit = history.length > 0 ? history[0].date : null;

  await supabase
    .from('customers')
    .update({ 
      total_orders: totalOrders,
      ltv: totalSpent,
      min_coins: minCoins,
      last_visit: lastVisit
    })
    .eq('phone', normalized);
}

export async function deleteOrderByBillNumber(billNumber: number, reason: string): Promise<void> {
  const { data: order } = await supabase
    .from('orders')
    .select('id, branch_name, customer_id, customer_phone, order_items(name, quantity, menu_item_id)')
    .eq('bill_number', billNumber)
    .single();
  
  const deletionInfo = { reason, date: getISTISOString() };
  await supabase.from('orders').update({ deletion_info: deletionInfo }).eq('bill_number', billNumber);

  if (order) {
    // REVERSE STOCK DEDUCTION
    try {
      const { data: menuItems } = await fetchMenuItems();
      const branchName = order.branch_name;

      for (const item of (order.order_items as any[] || [])) {
        // 2. Handle Regular Recipe Reversal
        let menuDetail = menuItems?.find(m => m.id === item.menu_item_id);
        
        // Robust Fallback: If menu_item_id is null, try matching by name
        if (!menuDetail) {
          const baseName = item.name.replace(/^(Steamed|Fried|Pan Fried|Pan-Fried|Peri-Peri|Peri peri|Normal)\s+/i, '').split(' (')[0].trim();
          menuDetail = menuItems?.find(m => m.name.toLowerCase() === baseName.toLowerCase() || m.name.toLowerCase() === item.name.toLowerCase());
        }

        if (!menuDetail) continue;

        // Determine size robustly from name suffix
        let size: Size = 'medium';
        const nameLower = item.name.toLowerCase();
        if (nameLower.includes('(small)') || nameLower.includes('small') || item.id === 'gift-campa-cola' || nameLower.includes('campa cola (gift)')) size = 'small';
        else if (nameLower.includes('(large)') || nameLower.includes('large')) size = 'large';
        else if (nameLower.includes('(medium)') || nameLower.includes('medium')) size = 'medium';

        // Only reverse size-specific recipes as specified by menu
        const sizeRecipe = menuDetail.sizeRecipes?.[size];
        let activeRecipe = (sizeRecipe && Array.isArray(sizeRecipe) && sizeRecipe.length > 0) ? sizeRecipe : [];
        if (activeRecipe.length === 0 && menuDetail.recipe && Array.isArray(menuDetail.recipe) && menuDetail.recipe.length > 0) {
          activeRecipe = menuDetail.recipe;
        }
        
        if (activeRecipe.length > 0) {
          for (const requirement of activeRecipe) {
            const totalToReturn = requirement.quantity * item.quantity;
            if (totalToReturn <= 0) continue;

            const { data: existingInv } = await supabase.from('inventory').select('current_stock').eq('id', requirement.materialId).eq('branch_name', branchName).maybeSingle();
            if (existingInv) {
              const newStock = existingInv.current_stock + totalToReturn;
              await supabase.from('inventory').update({ current_stock: newStock }).eq('id', requirement.materialId).eq('branch_name', branchName);
              
              // Log the reversal
              await supabase.from('inventory_logs').insert({
                inventory_id: requirement.materialId,
                branch_name: branchName,
                quantity_change: totalToReturn,
                reason: `VOID_ORDER_BILL_${billNumber}`,
                date: getISTISOString()
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("Stock reversal failed during order deletion:", e);
    }

    // If the order contained the 15% Welcome Discount, reactivate it for the customer
    const hasCoupon = order.order_items?.some((item: any) => 
      item.name === '15% Welcome Discount' || item.name.includes('Welcome Discount')
    );

    if (hasCoupon && order.customer_id) {
      await supabase.from('customers')
        .update({ welcome_coupon_used: false })
        .eq('id', order.customer_id);
    }

    if (order.customer_phone) {
      await syncCustomerStats(order.customer_phone);
    }
  }
}

export async function updateTableStatus(tableId: string, status: string): Promise<void> {
  await supabase.from('dining_tables').update({ status }).eq('id', tableId);
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const { data: order } = await supabase
    .from('orders')
    .select('customer_phone')
    .eq('id', orderId)
    .single();

  await supabase.from('orders').update({ status }).eq('id', orderId);

  if (order?.customer_phone) {
    await syncCustomerStats(order.customer_phone);
  }
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
  const normalized = normalizePhone(phone);
  const { data } = await supabase
    .from('order_items')
    .select('coins_price, quantity, orders!inner(customer_phone, deletion_info)')
    .eq('paid_with_coins', true)
    .ilike('orders.customer_phone', `%${normalized}`)
    .is('orders.deletion_info', null);
  
  if (!data) return 0;
  return data.reduce((acc, item) => acc + (item.coins_price * item.quantity), 0);
}

export async function getCustomerByPhone(phone: string): Promise<Customer | null> {
  // 1. Get basic info from the customers table
  const { data: dbCust, error: fetchError } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (fetchError || !dbCust) return null;

  // 2. Fetch live history to get the most accurate, real-time stats
  // This bypasses any lag or logic issues in RPC/aggregated columns
  const history = await fetchCustomerHistory(phone);
  
  const totalOrders = history.length;
  // Account for manual totals (delivery platforms) in LTV calculation
  const totalSpent = history.reduce((acc, o) => acc + (o.manualTotal != null ? o.manualTotal : o.total), 0);
  const redeemedCoins = await getRedeemedCoins(phone);
  
  const lastVisit = history.length > 0 ? history[0].date : dbCust.last_visit;

  // 3. Sync the database record if it's lagging (optional background update)
  if (dbCust.total_orders !== totalOrders || Math.abs((dbCust.ltv || 0) - totalSpent) > 1) {
    supabase.from('customers')
      .update({ total_orders: totalOrders, ltv: totalSpent, last_visit: lastVisit })
      .eq('id', dbCust.id)
      .then(); // Non-blocking
  }
  
  return {
    id: dbCust.id,
    phone: dbCust.phone,
    name: dbCust.name,
    email: dbCust.email,
    birthday: dbCust.birthday,
    note: dbCust.note,
    totalOrders: totalOrders,
    totalSpent: totalSpent,
    minCoins: calculateTotalMinCoins(totalSpent, redeemedCoins),
    lastVisit: lastVisit,
    joinedDate: dbCust.created_at,
    welcomeCouponUsed: dbCust.welcome_coupon_used || false,
    welcomeCouponCode: dbCust.welcome_coupon_code
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
  
  return data.map(d => {
    const totalSpent = d.ltv || 0;
    // For search results, we use a zero-redeemed estimate for minCoins if not stored in DB
    // This provides a helpful estimate during search
    const estimatedCoins = calculateTotalMinCoins(Number(totalSpent), 0);
    
    return {
      id: d.id,
      phone: d.phone,
      name: d.name,
      totalOrders: d.total_orders || 0,
      totalSpent: totalSpent,
      minCoins: d.min_coins ?? estimatedCoins,
      joinedDate: d.created_at,
      lastVisit: d.last_visit,
      welcomeCouponUsed: d.welcome_coupon_used || false,
      welcomeCouponCode: d.welcome_coupon_code
    };
  });
}

export async function registerCustomer(phone: string, name: string, isStudent?: boolean, schoolName?: string): Promise<Customer> {
  const normalized = normalizePhone(phone);
  const couponCode = `DISC15-${normalized.slice(-4)}`;
  let note = "REGULAR";
  if (isStudent) {
    const random8Digit = Math.floor(10000000 + Math.random() * 90000000);
    const hikerNo = `HIKER-${random8Digit}`;
    note = `STUDENT|${schoolName || ''}|${hikerNo}`;
  }
  const { data, error } = await supabase
    .from('customers')
    .upsert({ phone: normalized, name, welcome_coupon_code: couponCode, note }, { onConflict: 'phone' })
    .select()
    .single();

  if (error) throw error;
  
  // Sync stats in case they have historical orders linked to this phone
  await syncCustomerStats(normalized);
  
  return {
    id: data.id,
    phone: data.phone,
    name: data.name,
    email: data.email,
    birthday: data.birthday,
    note: data.note,
    totalOrders: Number(data.total_orders || 0),
    totalSpent: Number(data.ltv || 0),
    minCoins: Number(data.min_coins || 0),
    joinedDate: data.created_at,
    lastVisit: data.last_visit,
    welcomeCouponUsed: data.welcome_coupon_used || false,
    welcomeCouponCode: data.welcome_coupon_code
  };
}

export async function updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
  const { data: customer } = await supabase
    .from('customers')
    .select('phone')
    .eq('id', id)
    .single();

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

  if (customer?.phone) {
    await syncCustomerStats(customer.phone);
  }
}

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const cleaned = phone.toString().replace(/\D/g, '');
  return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
}

export interface CohortOrder {
  customer_phone: string;
  order_date: string;
  joined_date: string;
  bill_number: number;
}

export async function fetchCohortRawData(): Promise<CohortOrder[]> {
  // 1. Fetch ALL customers (up to 50k) to get their true join dates in paginated pages
  let customersData: any[] = [];
  let customerPage = 0;
  const customerPageSize = 1000;
  let hasMoreCustomers = true;

  while (hasMoreCustomers && customersData.length < 50000) {
    const from = customerPage * customerPageSize;
    const to = from + customerPageSize - 1;
    const { data, error } = await supabase
      .from('customers')
      .select('phone, created_at')
      .range(from, to);

    if (error || !data || data.length === 0) {
      hasMoreCustomers = false;
    } else {
      customersData = customersData.concat(data);
      if (data.length < customerPageSize) {
        hasMoreCustomers = false;
      } else {
        customerPage++;
      }
    }
  }

  const joinDateMap: Record<string, string> = {};
  customersData?.forEach(c => {
    if (c.phone) {
      joinDateMap[normalizePhone(c.phone)] = c.created_at;
    }
  });

  // 2. Fetch RECENT orders to see return rate
  // We fetch last 70,000 orders which should cover several months using paginated fetch
  let ordersData: any[] = [];
  let orderPage = 0;
  const orderPageSize = 1000;
  let hasMoreOrders = true;

  while (hasMoreOrders && ordersData.length < 70000) {
    const from = orderPage * orderPageSize;
    const to = from + orderPageSize - 1;
    const { data, error } = await supabase
      .from('orders')
      .select('customer_phone, date, bill_number')
      .is('deletion_info', null)
      .order('date', { ascending: false })
      .range(from, to);

    if (error || !data || data.length === 0) {
      hasMoreOrders = false;
    } else {
      ordersData = ordersData.concat(data);
      if (data.length < orderPageSize) {
        hasMoreOrders = false;
      } else {
        orderPage++;
      }
    }
  }
  
  if (ordersData.length === 0) return [];
  
  const results: CohortOrder[] = [];
  const processedOrders = ordersData.filter(o => o.customer_phone);

  // If a customer isn't in the joinDateMap (unregistered?), we find their earliest order in this set
  const fallbackJoinDates: Record<string, string> = {};
  processedOrders.forEach(o => {
    const phone = normalizePhone(o.customer_phone);
    if (!joinDateMap[phone]) {
      if (!fallbackJoinDates[phone] || o.date < fallbackJoinDates[phone]) {
        fallbackJoinDates[phone] = o.date;
      }
    }
  });

  processedOrders.forEach(o => {
    const phone = normalizePhone(o.customer_phone);
    results.push({
      customer_phone: phone,
      order_date: o.date,
      joined_date: joinDateMap[phone] || fallbackJoinDates[phone] || o.date,
      bill_number: o.bill_number
    });
  });

  return results.reverse();
}

export async function fetchCustomerClassificationStats(): Promise<Record<string, { DINE_IN: number, TAKEAWAY: number, DELIVERY: number, total: number }>> {
  let allOrders: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore && allOrders.length < 10000) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('orders')
      .select('customer_phone, type')
      .is('deletion_info', null)
      .order('date', { ascending: false })
      .range(from, to);

    if (error || !data || data.length === 0) {
      hasMore = false;
    } else {
      allOrders = allOrders.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }
  
  const stats: Record<string, { DINE_IN: number, TAKEAWAY: number, DELIVERY: number, total: number }> = {};
  
  allOrders.forEach(o => {
    const rawPhone = o.customer_phone?.toString();
    if (!rawPhone) return;
    
    const normalized = normalizePhone(rawPhone);
    if (!stats[normalized]) {
      stats[normalized] = { DINE_IN: 0, TAKEAWAY: 0, DELIVERY: 0, total: 0 };
    }
    
    stats[normalized].total++;
    const type = o.type?.toUpperCase();
    if (type === 'DINE_IN') stats[normalized].DINE_IN++;
    else if (type === 'TAKEAWAY') stats[normalized].TAKEAWAY++;
    else if (type === 'DELIVERY') stats[normalized].DELIVERY++;
  });
  
  return stats;
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

export async function fetchLastOrderPriorityItem(phone: string): Promise<{ name: string, quantity: number } | null> {
  const history = await fetchCustomerHistory(phone);
  if (history.length === 0) return null;

  const lastOrder = history[0];
  if (!lastOrder.items || lastOrder.items.length === 0) return null;

  let priorityItem = lastOrder.items[0];
  let maxVal = priorityItem.price * priorityItem.quantity;

  lastOrder.items.forEach(item => {
    const val = item.price * item.quantity;
    if (val > maxVal) {
      maxVal = val;
      priorityItem = item;
    }
  });

  return { name: priorityItem.name, quantity: priorityItem.quantity };
}

export async function fetchCustomers(branchFilter?: string): Promise<Customer[]> {
  let allData: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .rpc('get_customer_stats', { branch_filter: branchFilter || null })
      .range(from, to);

    if (error || !data || data.length === 0) {
      hasMore = false;
    } else {
      allData = allData.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  if (allData.length === 0) return [];

  // Batch query all order_items that were paid with coins and are not deleted to map coins efficiently
  const { data: allRedeemedCoinsData } = await supabase
    .from('order_items')
    .select('coins_price, quantity, orders!inner(customer_phone, deletion_info)')
    .eq('paid_with_coins', true)
    .is('orders.deletion_info', null);

  const redeemedCoinsMap: Record<string, number> = {};
  if (allRedeemedCoinsData) {
    allRedeemedCoinsData.forEach((item: any) => {
      const rawPhone = item.orders?.customer_phone;
      if (rawPhone) {
        const norm = normalizePhone(rawPhone);
        const coins = (item.coins_price || 0) * (item.quantity || 1);
        redeemedCoinsMap[norm] = (redeemedCoinsMap[norm] || 0) + coins;
      }
    });
  }

  const customers = allData.map((c: any) => {
    const totalSpent = Number(c.total_spent || 0);
    const normPhone = normalizePhone(c.phone);
    const redeemedCoins = redeemedCoinsMap[normPhone] || 0;
    
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
  });

  return customers;
}

export async function fetchCustomerHistory(phone: string): Promise<CompletedOrder[]> {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];

  // Fetch orders matching the normalized phone (last 10 digits) using ilike for robustness
  // This helps catch formats like +91, 0, or just the 10 digits
  const { data } = await supabase
    .from('orders')
    .select(`*, items:order_items (*)`)
    .ilike('customer_phone', `%${normalized}`)
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

// --- VENDORS & MAPPINGS ---

export async function getVendors(): Promise<any[]> {
  try {
    const { data, error } = await supabase.from('vendors').select('*').order('name');
    if (error) {
      if (error.code === '42P01') {
        console.warn("vendors table does not exist yet. Please run vendors_schema.sql in Supabase.");
        return [];
      }
      throw error;
    }
    return data || [];
  } catch (e) {
    console.error("Failed to fetch vendors:", e);
    return [];
  }
}

export async function createVendor(vendor: {
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
}): Promise<void> {
  const { error } = await supabase.from('vendors').insert([vendor]);
  if (error) {
    if (error.code === '42P01') {
      throw new Error("The 'vendors' table does not exist in your database. Please run the SQL script first.");
    }
    throw error;
  }
}

export async function deleteVendor(id: string): Promise<void> {
  const { error } = await supabase.from('vendors').delete().eq('id', id);
  if (error) throw error;
}

export async function updateVendor(id: string, vendor: {
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
}): Promise<void> {
  const { error } = await supabase.from('vendors').update(vendor).eq('id', id);
  if (error) throw error;
}

export async function getVendorMappings(): Promise<any[]> {
  try {
    const { data, error } = await supabase.from('vendor_mappings').select('*');
    if (error) {
      if (error.code === '42P01') {
        console.warn("vendor_mappings table does not exist yet. Please run vendors_schema.sql in Supabase.");
        return [];
      }
      throw error;
    }
    return data || [];
  } catch (e) {
    console.error("Failed to fetch vendor mappings:", e);
    return [];
  }
}

export async function mapItemToVendor(itemId: string, vendorId: string): Promise<void> {
  const { error } = await supabase.from('vendor_mappings').upsert({
    item_id: itemId,
    vendor_id: vendorId,
    created_at: getISTISOString()
  }, { onConflict: 'item_id' });
  
  if (error) {
    if (error.code === '42P01') {
      throw new Error("The 'vendor_mappings' table does not exist in your database. Please run the SQL script first.");
    }
    throw error;
  }
}

export async function removeVendorMapping(itemId: string): Promise<void> {
  const { error } = await supabase.from('vendor_mappings').delete().eq('item_id', itemId);
  if (error) throw error;
}

