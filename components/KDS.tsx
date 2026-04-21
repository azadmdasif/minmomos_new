
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { updateOrderStatus } from '../utils/storage';

const KDS: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const pollIntervalRef = useRef<number | null>(null);

  const fetchPending = async () => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .in('status', ['ORDERED', 'PREPARING', 'READY'])
        .is('deletion_info', null)
        .order('date', { ascending: true });
      if (data) setOrders(data);
    } catch (err) {
      console.error("KDS Fetch Error:", err);
    }
  };

  useEffect(() => {
    fetchPending();

    // 1. Realtime Subscription
    const channel = supabase
      .channel('kds_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchPending();
      })
      .subscribe();

    // 2. Polling Fallback (Every 10 seconds)
    pollIntervalRef.current = window.setInterval(() => {
      fetchPending();
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleStatusUpdate = async (orderId: string, currentStatus: string) => {
    let nextStatus = 'PREPARING';
    if (currentStatus === 'PREPARING') nextStatus = 'READY';
    else if (currentStatus === 'READY') nextStatus = 'SERVED';
    
    await updateOrderStatus(orderId, nextStatus as any);
    fetchPending(); 
  };

  return (
    <div className="h-full bg-slate-900 p-6 flex flex-col overflow-hidden">
      <header className="mb-6 flex justify-between items-center border-b border-white/10 pb-4">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic">Kitchen Display <span className="text-peak-amber">Live</span></h2>
          <p className="text-white/40 text-[10px] font-bold uppercase mt-1 tracking-widest">Summit Efficiency Mode</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-3 py-1 bg-peak-amber/20 border border-peak-amber/30 rounded-full text-peak-amber text-[10px] font-black uppercase">
            {orders.length} Active Peaks
          </div>
          <div className="text-white/30 font-mono text-[10px] uppercase tracking-widest">{new Date().toLocaleTimeString()}</div>
        </div>
      </header>
      
      <div className="flex gap-6 flex-1 overflow-x-auto pb-6 no-scrollbar">
        {orders.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-white/5">
            <svg className="w-32 h-32 mb-4 opacity-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            <span className="font-black uppercase tracking-[0.3em] text-sm">Base Camp is Clear</span>
          </div>
        ) : (
          orders.map(order => (
            <div key={order.id} className="w-80 bg-white rounded-[2rem] shadow-2xl flex flex-col overflow-hidden shrink-0 border border-white/10">
              <div className={`p-6 border-b-4 ${
                order.status === 'READY' ? 'bg-emerald-600 border-emerald-700 text-white' : 
                order.status === 'PREPARING' ? 'bg-peak-amber border-peak-amber/70 text-white' : 
                'bg-slate-100 border-slate-200 text-slate-800'
              }`}>
                <div className="flex justify-between items-start">
                  <span className="font-black text-4xl tracking-tighter">#{order.bill_number}</span>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black px-2 py-0.5 bg-black/10 rounded-full uppercase tracking-widest">{order.type}</span>
                    {order.table_id && <span className="text-xs font-black mt-1">Table {order.table_id.split('-')[1]}</span>}
                  </div>
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mt-3">
                  T-Plus: {Math.floor((Date.now() - new Date(order.date).getTime()) / 60000)} mins
                </div>
              </div>
              
              <div className="flex-1 p-6 space-y-4 overflow-y-auto no-scrollbar bg-white">
                {/* Render ALL items in the order, sorted to put Momos first and sides/addons second */}
                {[...(order.order_items || [])].sort((a) => a.name.includes('Momo') ? -1 : 1).map((item: any) => {
                  const isSide = item.name.toLowerCase().includes('fries') || item.name.toLowerCase().includes('mayo');
                  return (
                    <div key={item.id} className={`flex justify-between items-start pb-3 border-b border-stone-50 last:border-0 ${isSide ? 'bg-brand-brown/5 rounded-xl p-3' : ''}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className={`font-black text-xl ${isSide ? 'text-brand-red' : 'text-peak-amber'}`}>x{item.quantity}</span>
                          <span className={`font-black text-sm leading-tight uppercase tracking-tight ${isSide ? 'text-brand-brown italic' : 'text-slate-800'}`}>
                            {item.name}
                            {isSide && <span className="block text-[8px] font-black text-brand-red/60 tracking-widest mt-0.5">EXTRA ITEM</span>}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-5 bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={() => handleStatusUpdate(order.id, order.status)}
                  className={`w-full py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 ${
                    order.status === 'READY' ? 'bg-mountain-green text-white' :
                    order.status === 'PREPARING' ? 'bg-peak-amber text-white' :
                    'bg-slate-800 text-white'
                  }`}
                >
                  {order.status === 'ORDERED' ? 'Fire Order' : 
                   order.status === 'PREPARING' ? 'Mark as Plated' : 'Handover Done'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default KDS;
