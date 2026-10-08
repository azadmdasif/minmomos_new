import { supabase } from '../src/utils/supabase';

async function scanTables() {
  const tables = [
    'orders', 'order_items', 'customers', 'procurements', 'inventory', 
    'central_inventory', 'stations', 'stock_allocations', 'manual_adjustments', 
    'menu_items', 'dining_tables', 'users', 'marketing_coupons', 'marketing_message_logs',
    'minslack_messages', 'minslack_tasks', 'job_applications', 'employees',
    'ledger_statements', 'ledger_categories', 'daily_closings'
  ];

  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').order('date', { ascending: false }).limit(200);
      if (error || !data) continue;

      let foundCount = 0;
      for (const row of data) {
        for (const [k, v] of Object.entries(row)) {
          const str = typeof v === 'string' ? v : JSON.stringify(v) || '';
          if (str.includes('data:image') || str.length > 20000) {
            foundCount++;
            console.log(`Table [${table}] Col [${k}] Row [${(row as any).id}] len=${str.length} hasBase64=${str.includes('data:image')}`);
            break;
          }
        }
      }
      if (foundCount > 0) {
        console.log(`Table ${table} has ${foundCount} large/base64 rows in first 100.`);
      }
    } catch (e) {
      console.error(table, e);
    }
  }
}

scanTables();
