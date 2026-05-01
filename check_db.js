
import { createClient } from '@supabase/supabase-base';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('orders').select('*').limit(1);
  if (data && data.length > 0) {
    console.log("Orders columns:", Object.keys(data[0]));
  } else {
    console.log("No orders found or error:", error);
  }
}
check();
