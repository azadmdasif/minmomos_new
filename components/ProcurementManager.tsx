
import React, { useState, useEffect } from 'react';
import { fetchProcurements, logProcurement, getCentralInventory } from '../utils/storage';

const ProcurementManager: React.FC = () => {
  const [procurements, setProcurements] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTableMissing, setIsTableMissing] = useState(false);
  
  const [selectedItem, setSelectedItem] = useState('');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [vendor, setVendor] = useState('');

  const load = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await fetchProcurements(today, today);
    
    if (error && error.code === 'PGRST205') {
      setIsTableMissing(true);
    } else {
      setProcurements(data);
      setIsTableMissing(false);
    }

    const inv = await getCentralInventory();
    setInventory(inv);
  };

  useEffect(() => { load(); }, []);

  const handleLog = async () => {
    const item = inventory.find(i => i.id === selectedItem);
    if (item && qty && cost) {
      try {
        await logProcurement({
          item_id: item.id,
          item_name: item.name,
          quantity: parseFloat(qty),
          unit: item.unit,
          total_cost: parseFloat(cost),
          vendor,
          date: new Date().toISOString()
        });
        setIsModalOpen(false);
        setQty(''); setCost(''); setVendor('');
        load();
      } catch (e: any) {
        alert("Log failed: " + e.message);
      }
    }
  };

  if (isTableMissing) {
    return (
      <div className="p-12 h-full flex flex-col items-center justify-center text-center bg-brand-cream overflow-y-auto">
        <div className="max-w-2xl bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-brand-yellow">
          <h2 className="text-4xl font-black text-brand-brown mb-4 uppercase italic">Supply Logs Disabled</h2>
          <p className="text-brand-brown/60 mb-8 font-bold">The table <code className="bg-brand-brown/5 px-2 py-1 rounded">procurements</code> was not found.</p>
          
          <div className="text-left bg-slate-900 p-6 rounded-2xl mb-8 overflow-x-auto">
            <p className="text-brand-yellow text-[10px] font-black uppercase mb-4 tracking-widest">Run this SQL in Supabase Editor:</p>
            <pre className="text-emerald-400 text-xs font-mono">
{`CREATE TABLE procurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id TEXT,
  item_name TEXT,
  quantity NUMERIC,
  unit TEXT,
  total_cost NUMERIC,
  vendor TEXT,
  date TIMESTAMPTZ DEFAULT NOW()
);`}
            </pre>
          </div>
          
          <button onClick={load} className="bg-brand-brown text-brand-yellow px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">
            Check Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 h-full bg-brand-cream overflow-y-auto no-scrollbar">
      <header className="flex justify-between items-end mb-12">
        <div>
          <h2 className="text-4xl font-black text-brand-brown tracking-tighter italic uppercase">SUPPLY <span className="text-brand-red">LOGS</span></h2>
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-2">Inventory Cost Tracking</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-brand-red text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">New Purchase Entry</button>
      </header>

      <div className="bg-white rounded-[3rem] shadow-xl border border-brand-stone overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-brand-brown/5 text-brand-brown">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Date</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Material</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Qty</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Vendor</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-right">Investment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-stone">
            {procurements.map(p => (
              <tr key={p.id} className="hover:bg-brand-cream transition-colors">
                <td className="px-8 py-6 text-xs text-brand-brown/40 font-bold">{new Date(p.date).toLocaleDateString()}</td>
                <td className="px-8 py-6 font-black text-brand-brown">{p.item_name}</td>
                <td className="px-8 py-6 text-xs font-bold text-brand-brown/60 uppercase">{p.quantity} {p.unit}</td>
                <td className="px-8 py-6 text-[10px] font-black text-brand-red uppercase">{p.vendor || 'Local Market'}</td>
                <td className="px-8 py-6 text-right font-black text-brand-brown">₹{p.total_cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {procurements.length === 0 && <p className="p-20 text-center text-brand-brown/20 font-black uppercase text-xs tracking-[0.4em]">No Logs for Today</p>}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/90 backdrop-blur-xl flex items-center justify-center z-[110] p-4">
          <div className="bg-brand-cream rounded-[4rem] p-12 w-full max-w-sm border-8 border-brand-yellow shadow-2xl">
            <h3 className="text-3xl font-black mb-10 italic text-brand-brown uppercase">ENTRY <span className="text-brand-yellow">FORM</span></h3>
            <div className="space-y-4">
              <select className="w-full p-4 rounded-2xl border border-brand-stone bg-white font-bold" value={selectedItem} onChange={e => setSelectedItem(e.target.value)}>
                <option value="">Select Material...</option>
                {inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-4">
                <input placeholder="Qty" type="number" className="w-full p-4 rounded-2xl border border-brand-stone bg-white font-bold" value={qty} onChange={e => setQty(e.target.value)} />
                <input placeholder="Total ₹" type="number" className="w-full p-4 rounded-2xl border border-brand-stone bg-white font-bold" value={cost} onChange={e => setCost(e.target.value)} />
              </div>
              <input placeholder="Vendor Name" className="w-full p-4 rounded-2xl border border-brand-stone bg-white font-bold" value={vendor} onChange={e => setVendor(e.target.value)} />
              <button onClick={handleLog} className="w-full py-5 bg-brand-brown text-brand-yellow rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:scale-105 transition-transform">Log Expense</button>
              <button onClick={() => setIsModalOpen(false)} className="w-full py-2 text-brand-brown/40 font-black uppercase text-[10px] tracking-widest">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcurementManager;
