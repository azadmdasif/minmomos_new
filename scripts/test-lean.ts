import { supabase } from '../src/utils/supabase';

async function testSelectCols() {
  const dStart = '2026-09-01';
  const dEnd = '2026-10-06';
  const t0 = Date.now();
  const { data: allCols } = await supabase.from('procurements')
    .select('*')
    .gte('date', `${dStart}T00:00:00+05:30`)
    .lte('date', `${dEnd}T23:59:59+05:30`);
  const sizeAll = JSON.stringify(allCols).length;
  console.log('select(*) size:', (sizeAll / 1024).toFixed(1), 'KB in', Date.now() - t0, 'ms. Rows:', allCols?.length);

  const t1 = Date.now();
  const { data: leanCols } = await supabase.from('procurements')
    .select('id, item_id, item_name, quantity, unit, total_cost, vendor, date, is_voided, void_reason, is_paid, paid_at, paid_by, payment_notes, payment_mode')
    .gte('date', `${dStart}T00:00:00+05:30`)
    .lte('date', `${dEnd}T23:59:59+05:30`);
  const sizeLean = JSON.stringify(leanCols).length;
  console.log('lean select size:', (sizeLean / 1024).toFixed(1), 'KB in', Date.now() - t1, 'ms. Rows:', leanCols?.length);
  if (sizeAll > 0) {
    console.log('Reduction:', ((1 - sizeLean / sizeAll) * 100).toFixed(1) + '%');
  }
}
testSelectCols();
