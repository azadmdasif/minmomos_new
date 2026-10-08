import { supabase } from '../src/utils/supabase';
import { getISTDateString } from '../src/utils/storage';

async function testTodayKDS() {
  const today = getISTDateString();
  const startOfDay = today + 'T00:00:00+05:30';
  const { data, error } = await supabase
    .from('orders')
    .select('id, bill_number, status, total, branch_name, type, table_id, date, order_items(id, name, quantity, price)')
    .gte('date', startOfDay)
    .in('status', ['ORDERED', 'PREPARING', 'READY'])
    .is('deletion_info', null)
    .order('date', { ascending: true });
  console.log('Today active KDS orders:', data?.length, 'error:', error);
  console.log('Size:', (JSON.stringify(data).length / 1024).toFixed(1), 'KB');
}
testTodayKDS();
