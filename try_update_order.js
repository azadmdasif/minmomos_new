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
  console.log("Current order's deletion_info:", firstOrder.deletion_info);
  
  // Try to set deletion_info to an object with review_status
  const updatedDeletionInfo = {
    ...(typeof firstOrder.deletion_info === 'object' && firstOrder.deletion_info ? firstOrder.deletion_info : {}),
    review_status: 'collected'
  };
  
  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update({ deletion_info: updatedDeletionInfo })
    .eq('id', firstOrder.id)
    .select();
    
  if (updateError) {
    console.error("UPDATE ERROR:", updateError);
  } else {
    console.log("Successfully updated order:", updated[0].id, "new deletion_info:", updated[0].deletion_info);
    
    // Reset it back so we don't mess up data
    await supabase.from('orders').update({ deletion_info: firstOrder.deletion_info }).eq('id', firstOrder.id);
    console.log("Reverted deletion_info back to original.");
  }
}
check();
