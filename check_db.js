
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  console.log("Checking order_items for Campa Cola...");
  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .ilike('name', '%Campa Cola%')
    .limit(5);
  
  if (error) {
    console.error("Order items error:", error);
  } else {
    console.log("Campa items found:", data.length);
    data.forEach(d => console.log(`- ${d.name} (bill_number needed from join or check orders)`));
  }

  console.log("\nChecking if inventory_logs table exists...");
  const { error: logError } = await supabase.from('inventory_logs').select('id').limit(1);
  if (logError) {
    console.log("inventory_logs error (might not exist):", logError.message);
  } else {
    console.log("inventory_logs table EXISTS.");
  }
}
check();
