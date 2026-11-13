import { Type } from '@google/genai';
import { supabase } from '../src/utils/supabase';

// Strict Table Whitelist for Read-Only Access
const ALLOWED_READ_TABLES = new Set([
  'orders',
  'order_items',
  'customers',
  'menu_items',
  'menu_sections',
  'central_inventory',
  'inventory',
  'inventory_logs',
  'procurements',
  'finance_ledger',
  'dining_tables',
  'stations',
  'vendors',
  'addon_impressions',
  'app_users'
]);

// ---------------------------------------------------------------------------
// 1. READ-ONLY DATABASE SERVICE (STRICT ZERO-WRITE ENFORCEMENT)
// ---------------------------------------------------------------------------

export async function getSalesMetrics(startDate?: string, endDate?: string, branch?: string) {
  const todayIST = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split('T')[0];
  let sDate = startDate || todayIST;
  let eDate = endDate || todayIST;

  let query = supabase
    .from('orders')
    .select('id, bill_number, total, branch_name, payment_method, type, status, date')
    .gte('date', `${sDate}T00:00:00`)
    .lte('date', `${eDate}T23:59:59`)
    .is('deletion_info', null);

  if (branch && branch !== 'All') {
    query = query.eq('branch_name', branch);
  }

  let { data: orders, error } = await query;
  if (error) throw error;

  let valid = (orders || []).filter(o => o.status !== 'CANCELLED' && Number(o.total) > 0);
  let isLatestFallback = false;

  // If queried for today but no orders recorded yet today, fetch the latest completed business day
  if (valid.length === 0 && !startDate) {
    const { data: latestOrder } = await supabase
      .from('orders')
      .select('date')
      .is('deletion_info', null)
      .neq('status', 'CANCELLED')
      .order('date', { ascending: false })
      .limit(1);

    if (latestOrder && latestOrder.length > 0 && latestOrder[0].date) {
      const latestDateStr = latestOrder[0].date.split('T')[0];
      const { data: latestDayOrders } = await supabase
        .from('orders')
        .select('id, bill_number, total, branch_name, payment_method, type, status, date')
        .gte('date', `${latestDateStr}T00:00:00`)
        .lte('date', `${latestDateStr}T23:59:59`)
        .is('deletion_info', null);

      if (latestDayOrders && latestDayOrders.length > 0) {
        valid = latestDayOrders.filter(o => o.status !== 'CANCELLED' && Number(o.total) > 0);
        sDate = latestDateStr;
        eDate = latestDateStr;
        isLatestFallback = true;
      }
    }
  }

  const totalRev = valid.reduce((s, o) => s + Number(o.total || 0), 0);
  const orderCount = valid.length;
  const aov = orderCount > 0 ? totalRev / orderCount : 0;

  const branchRev: Record<string, { rev: number; count: number }> = {};
  const paymentRev: Record<string, number> = {};
  const typeCount: Record<string, number> = {};

  valid.forEach(o => {
    const b = o.branch_name || 'MAIN';
    if (!branchRev[b]) branchRev[b] = { rev: 0, count: 0 };
    branchRev[b].rev += Number(o.total || 0);
    branchRev[b].count++;

    const pm = o.payment_method || 'UPI';
    paymentRev[pm] = (paymentRev[pm] || 0) + Number(o.total || 0);

    const t = o.type || 'TAKEAWAY';
    typeCount[t] = (typeCount[t] || 0) + 1;
  });

  return {
    dateRange: { start: sDate, end: eDate },
    isLatestOperatingDay: isLatestFallback,
    totalRevenue: Math.round(totalRev),
    orderCount,
    averageOrderValue: Math.round(aov),
    branchBreakdown: branchRev,
    paymentMethodBreakdown: paymentRev,
    orderTypeBreakdown: typeCount
  };
}

export async function getTopSellingItems(limit = 8, startDate?: string, endDate?: string) {
  let query = supabase
    .from('order_items')
    .select('name, price, quantity, cost, order_id, orders!inner(date, status, deletion_info)')
    .is('orders.deletion_info', null)
    .neq('orders.status', 'CANCELLED');

  if (startDate) {
    query = query.gte('orders.date', `${startDate}T00:00:00`);
  }
  if (endDate) {
    query = query.lte('orders.date', `${endDate}T23:59:59`);
  }

  const { data: items, error } = await query.limit(5000);
  if (error) throw error;

  const aggregated: Record<string, { name: string; quantity: number; revenue: number; ordersCount: number }> = {};

  (items || []).forEach(item => {
    const name = item.name;
    if (!name) return;
    if (!aggregated[name]) {
      aggregated[name] = { name, quantity: 0, revenue: 0, ordersCount: 0 };
    }
    const q = Number(item.quantity) || 1;
    const p = Number(item.price) || 0;
    aggregated[name].quantity += q;
    aggregated[name].revenue += (p * q);
    aggregated[name].ordersCount += 1;
  });

  const sorted = Object.values(aggregated).sort((a, b) => b.quantity - a.quantity);
  return sorted.slice(0, Math.min(limit, 25));
}

export async function getCustomerAnalytics(queryType: 'overview' | 'top_spenders' | 'mau_90d' | 'dormant') {
  if (queryType === 'top_spenders') {
    const { data: topCusts, error } = await supabase
      .from('customers')
      .select('id, name, phone, total_orders, total_spent, min_coins, last_visit, created_at')
      .order('total_spent', { ascending: false })
      .limit(15);
    if (error) throw error;
    return { topSpenders: topCusts };
  }

  const { data: allCusts, count, error } = await supabase
    .from('customers')
    .select('phone, total_orders, total_spent, last_visit, created_at', { count: 'exact' });
  if (error) throw error;

  const totalRegistered = count || (allCusts || []).length;
  const totalRev = (allCusts || []).reduce((s, c) => s + Number(c.total_spent || 0), 0);
  const avgLtv = totalRegistered > 0 ? totalRev / totalRegistered : 0;
  const repeaters = (allCusts || []).filter(c => Number(c.total_orders || 0) > 1).length;
  const repeatRate = totalRegistered > 0 ? (repeaters / totalRegistered) * 100 : 0;

  // 90-Day active MAU calculation
  const d90Ago = Date.now() - (90 * 24 * 60 * 60 * 1000);
  const d30Ago = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const d60Ago = Date.now() - (60 * 24 * 60 * 60 * 1000);

  const activeMauCusts = (allCusts || []).filter(c => c.last_visit && new Date(c.last_visit).getTime() >= d90Ago);
  const powerActive = (allCusts || []).filter(c => c.last_visit && new Date(c.last_visit).getTime() >= d30Ago);
  const warming = (allCusts || []).filter(c => c.last_visit && new Date(c.last_visit).getTime() < d30Ago && new Date(c.last_visit).getTime() >= d60Ago);
  const cooling = (allCusts || []).filter(c => c.last_visit && new Date(c.last_visit).getTime() < d60Ago && new Date(c.last_visit).getTime() >= d90Ago);
  const dormant = (allCusts || []).filter(c => !c.last_visit || new Date(c.last_visit).getTime() < d90Ago);

  const mauCount = activeMauCusts.length;
  const mauSharePct = totalRegistered > 0 ? (mauCount / totalRegistered) * 100 : 0;

  return {
    totalRegistered,
    totalRegisteredSpend: Math.round(totalRev),
    averageLTV: Math.round(avgLtv),
    repeatRatePct: parseFloat(repeatRate.toFixed(1)),
    mau90d: {
      count: mauCount,
      sharePct: parseFloat(mauSharePct.toFixed(1)),
      powerActive30d: powerActive.length,
      warmingActive60d: warming.length,
      coolingAtRisk90d: cooling.length,
      dormantCount: dormant.length
    }
  };
}

export async function getInventoryAlerts() {
  const { data: central, error: e1 } = await supabase
    .from('central_inventory')
    .select('id, name, unit, category, current_stock, min_stock, last_purchase_cost, is_finished')
    .order('current_stock', { ascending: true })
    .limit(40);
  if (e1) throw e1;

  const lowStock = (central || []).filter(item => {
    const stock = Number(item.current_stock || 0);
    const min = Number(item.min_stock || 0);
    return item.is_finished || (min > 0 && stock <= min);
  });

  const { data: recentProcurements, error: e2 } = await supabase
    .from('procurements')
    .select('item_name, quantity, unit, total_cost, vendor, date')
    .is('is_voided', false)
    .order('date', { ascending: false })
    .limit(6);
  if (e2) throw e2;

  return {
    lowStockItemsCount: lowStock.length,
    lowStockItems: lowStock.slice(0, 10),
    sampleStock: (central || []).slice(0, 10),
    recentProcurements: recentProcurements || []
  };
}

export async function readOnlyQueryTable(params: {
  table: string;
  columns?: string;
  limit?: number;
  orderBy?: string;
  ascending?: boolean;
}) {
  const { table, columns = '*', limit = 15, orderBy, ascending = false } = params;

  // Strict Security Checks
  if (!ALLOWED_READ_TABLES.has(table)) {
    throw new Error(`Security Violation: Table '${table}' is not permitted for read-only access. Allowed tables: ${Array.from(ALLOWED_READ_TABLES).join(', ')}`);
  }

  const safeLimit = Math.min(Math.max(1, limit || 15), 50);
  let q = supabase.from(table).select(columns).limit(safeLimit);

  if (orderBy) {
    q = q.order(orderBy, { ascending });
  }

  const { data, error } = await q;
  if (error) throw error;
  return { table, count: data?.length || 0, rows: data };
}

// ---------------------------------------------------------------------------
// 2. GEMINI FUNCTION DECLARATIONS (TOOLS)
// ---------------------------------------------------------------------------

export const assistantTools = [
  {
    functionDeclarations: [
      {
        name: 'getSalesMetrics',
        description: 'Get real-time sales and financial metrics including revenue, orders count, AOV, store breakdown, and payment mode split.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            startDate: { type: Type.STRING, description: 'Optional start date YYYY-MM-DD (defaults to today)' },
            endDate: { type: Type.STRING, description: 'Optional end date YYYY-MM-DD (defaults to today)' },
            branch: { type: Type.STRING, description: "Branch name or 'All'" }
          }
        }
      },
      {
        name: 'getTopSellingItems',
        description: 'Get ranked best-selling menu items (momos, platters, drinks) by quantity sold and revenue generated.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            limit: { type: Type.INTEGER, description: 'Number of top items to return (default 8)' },
            startDate: { type: Type.STRING, description: 'Optional start date YYYY-MM-DD' },
            endDate: { type: Type.STRING, description: 'Optional end date YYYY-MM-DD' }
          }
        }
      },
      {
        name: 'getCustomerAnalytics',
        description: 'Get deep customer insights: 90-day active MAU pool, top LTV spenders, repeat rates, and dormancy breakdown.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            queryType: {
              type: Type.STRING,
              description: "One of: 'overview', 'top_spenders', 'mau_90d', 'dormant'",
              enum: ['overview', 'top_spenders', 'mau_90d', 'dormant']
            }
          },
          required: ['queryType']
        }
      },
      {
        name: 'getInventoryAlerts',
        description: 'Get live inventory stock levels, low-stock warnings, finished items, and recent raw material procurements.',
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      },
      {
        name: 'readOnlyQueryTable',
        description: 'Execute a STRICTLY READ-ONLY SELECT query on allowed Supabase tables: orders, order_items, customers, menu_items, central_inventory, procurements, finance_ledger, stations.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            table: {
              type: Type.STRING,
              description: 'Target table name',
              enum: [
                'orders',
                'order_items',
                'customers',
                'menu_items',
                'central_inventory',
                'inventory',
                'procurements',
                'finance_ledger',
                'stations'
              ]
            },
            columns: { type: Type.STRING, description: 'Comma-separated columns or *' },
            limit: { type: Type.INTEGER, description: 'Limit rows (max 50)' },
            orderBy: { type: Type.STRING, description: 'Column to order by' },
            ascending: { type: Type.BOOLEAN, description: 'Whether sort is ascending' }
          },
          required: ['table']
        }
      }
    ]
  }
];

// ---------------------------------------------------------------------------
// 3. EXECUTE READ-ONLY TOOLS
// ---------------------------------------------------------------------------

export async function executeReadOnlyTool(name: string, args: any) {
  switch (name) {
    case 'getSalesMetrics':
      return await getSalesMetrics(args?.startDate, args?.endDate, args?.branch);
    case 'getTopSellingItems':
      return await getTopSellingItems(args?.limit, args?.startDate, args?.endDate);
    case 'getCustomerAnalytics':
      return await getCustomerAnalytics(args?.queryType || 'overview');
    case 'getInventoryAlerts':
      return await getInventoryAlerts();
    case 'readOnlyQueryTable':
      return await readOnlyQueryTable(args || { table: 'orders' });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// 4. INTELLIGENT LOCAL NLP FALLBACK (WHEN GEMINI API KEY IS NOT CONFIGURED)
// ---------------------------------------------------------------------------

export async function handleLocalQueryFallback(userPrompt: string): Promise<string> {
  const p = userPrompt.toLowerCase();

  // 1. Sales & Revenue
  if (p.includes('today') && (p.includes('sales') || p.includes('revenue') || p.includes('earn') || p.includes('order'))) {
    const metrics = await getSalesMetrics();
    const notice = metrics.isLatestOperatingDay
      ? `*(Store operating hours notice: Showing latest completed business day ${metrics.dateRange.start})*\n\n`
      : '';
    return `### 🥟 Sales Performance (${metrics.dateRange.start})

${notice}- **Total Revenue**: ₹${metrics.totalRevenue.toLocaleString()}
- **Total Orders**: ${metrics.orderCount} orders
- **Average Order Value (AOV)**: ₹${metrics.averageOrderValue}

**Payment Method Breakdown:**
${Object.entries(metrics.paymentMethodBreakdown).map(([m, val]) => `- **${m}**: ₹${Number(val).toLocaleString()}`).join('\n')}

**Order Types:**
${Object.entries(metrics.orderTypeBreakdown).map(([t, count]) => `- **${t}**: ${count} orders`).join('\n')}`;
  }

  if (p.includes('sales') || p.includes('revenue') || p.includes('financial') || p.includes('aov')) {
    const metrics = await getSalesMetrics();
    return `### 🥟 Current Sales Summary

- **Today's Revenue**: ₹${metrics.totalRevenue.toLocaleString()}
- **Order Count**: ${metrics.orderCount} orders
- **AOV**: ₹${metrics.averageOrderValue}
- **Active Branch**: ${Object.keys(metrics.branchBreakdown).join(', ') || 'MAIN'}`;
  }

  // 2. Best-Selling Momos / Menu Items
  if (p.includes('top') || p.includes('best') || p.includes('popular') || p.includes('item') || p.includes('dish') || p.includes('momo')) {
    const topItems = await getTopSellingItems(7);
    return `### 🥟 Top Selling Items (by Volume & Revenue)

${topItems.map((item, idx) => `${idx + 1}. **${item.name}** — **${item.quantity} sold** (Revenue: ₹${item.revenue.toLocaleString()})`).join('\n')}

*Insight: Steamed and pan-fried varieties continue to be the primary volume drivers.*`;
  }

  // 3. 90-Day MAU & Customer Metrics
  if (p.includes('mau') || p.includes('active') || p.includes('retention') || p.includes('pie') || p.includes('customer') || p.includes('ltv') || p.includes('vip')) {
    if (p.includes('vip') || p.includes('top spender') || p.includes('spenders')) {
      const { topSpenders } = await getCustomerAnalytics('top_spenders');
      return `### 🌟 Top VIP Customers by Lifetime Value (LTV)

${(topSpenders || []).slice(0, 8).map((c: any, i: number) => 
  `${i + 1}. **${c.name || 'Valued Guest'}** (\`${c.phone}\`) — **₹${Number(c.total_spent || 0).toLocaleString()}** (${c.total_orders || 0} orders, MinCoins: ${c.min_coins || 0})`
).join('\n')}`;
    }

    const data = await getCustomerAnalytics('overview') as any;
    const mau = data.mau90d || {};
    return `### 👥 Customer Base & 90-Day Active MAU Health

- **Total Registered Profiles**: ${(data.totalRegistered || 0).toLocaleString()}
- **90-Day Active MAU Pool**: **${(mau.count || 0).toLocaleString()} customers** (**${mau.sharePct || 0}%** of total base)
- **Power Active (≤30 Days)**: ${mau.powerActive30d || 0} customers
- **Warming (31–60 Days)**: ${mau.warmingActive60d || 0} customers
- **Cooling / At-Risk (61–90 Days)**: ${mau.coolingAtRisk90d || 0} customers
- **Dormant (>90 Days)**: ${mau.dormantCount || 0} customers
- **Repeat Purchase Rate**: ${data.repeatRatePct || 0}%
- **Average Customer LTV**: ₹${(data.averageLTV || 0).toLocaleString()}`;
  }

  // 4. Inventory & Procurements
  if (p.includes('inventory') || p.includes('stock') || p.includes('procurement') || p.includes('ingredient')) {
    const inv = await getInventoryAlerts();
    return `### 📦 Inventory & Stock Status

- **Low Stock Warnings**: ${inv.lowStockItemsCount} items need attention
${inv.lowStockItems.length > 0 ? inv.lowStockItems.map(item => `- ⚠️ **${item.name}**: Stock ${item.current_stock} ${item.unit} (Min: ${item.min_stock || 0})`).join('\n') : '- ✅ All tracked stock levels are currently above minimum threshold.'}

**Recent Procurements:**
${inv.recentProcurements.slice(0, 4).map(p => `- **${p.item_name}**: ${p.quantity} ${p.unit} (₹${p.total_cost}) from ${p.vendor || 'Supplier'}`).join('\n')}`;
  }

  // 5. Default General Response
  return `### 🥟 MinMomos AI Assistant (MomoMind)

I have **read-only access** to live MinMomos backend data across orders, customer LTV, 90-day MAU dynamics, inventory, and menu performance.

**Quick questions you can ask me right now:**
- *"What is today's revenue and order count?"*
- *"Show our top 5 best-selling momos"*
- *"How is our 90-day active MAU retention doing?"*
- *"Who are our top 10 VIP customers by spend?"*
- *"Are there any low-stock inventory alerts?"*
- *"Compare sales by payment method"*

*Security note: I have strict read-only access. Write, update, delete, or code alteration actions are strictly disabled.*`;
}
