
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ojogjmzgboiufktapskp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qb2dqbXpnYm9pdWZrdGFwc2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NzIyMTMsImV4cCI6MjA4NjA0ODIxM30.4rKQSCEHTZTD0JHh2EAp1oTv3EaQME9EItVSzzjm8wM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkColumns() {
  console.log("Checking columns for 'customers' table...");
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .limit(1);

  if (error) {
    console.error("Error fetching customer:", error);
  } else if (data && data.length > 0) {
    const columns = Object.keys(data[0]);
    console.log("Available columns:", columns);
  } else {
    console.log("No customers found to inspect columns.");
  }
}

checkColumns();
