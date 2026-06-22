import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ojogjmzgboiufktapskp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qb2dqbXpnYm9pdWZrdGFwc2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NzIyMTMsImV4cCI6MjA4NjA0ODIxM30.4rKQSCEHTZTD0JHh2EAp1oTv3EaQME9EItVSzzjm8wM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  const { data: firstOrder, error: selectError } = await supabase.from('orders').select('*').limit(1).single();
  if (selectError) {
    console.error("SELECT ERROR:", selectError);
    return;
  }
  
  // Try to update status
  const originalStatus = firstOrder.status;
  const testStatus = 'COMPLETED:REVIEW_COLLECTED';
  
  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update({ status: testStatus })
    .eq('id', firstOrder.id)
    .select();
    
  if (updateError) {
    console.warn("Could not update status to custom string:", updateError.message);
  } else {
    console.log("Successfully updated status to custom string. Reverting...");
    await supabase.from('orders').update({ status: originalStatus }).eq('id', firstOrder.id);
  }
}
check();
