import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ojogjmzgboiufktapskp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qb2dqbXpnYm9pdWZrdGFwc2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NzIyMTMsImV4cCI6MjA4NjA0ODIxM30.4rKQSCEHTZTD0JHh2EAp1oTv3EaQME9EItVSzzjm8wM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('menu_items').select('*').limit(1);
  if (error) {
    console.error("error fetching menu_items:", error);
  } else if (data && data.length > 0) {
    console.log("Keys returned for a menu_item:", Object.keys(data[0]));
    console.log("Full first menu_item object:", JSON.stringify(data[0], null, 2));
  } else {
    console.log("No menu items found.");
  }
}
check();
