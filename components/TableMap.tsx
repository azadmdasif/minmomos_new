
import React, { useState, useEffect, useRef } from 'react';
import { TABLES } from '../constants';
import { supabase } from '../utils/supabase';
import { updateTableStatus } from '../utils/storage';
import { DiningTable } from '../types';

const TableMap: React.FC = () => {
  const [tables] = useState<DiningTable[]>(TABLES);
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null);
  const [dbTables, setDbTables] = useState<any[]>([]);
  const pollIntervalRef = useRef<number | null>(null);

  const fetchTableStatus = async () => {
    try {
      const { data } = await supabase.from('dining_tables').select('*');
      if (data) {
        setDbTables(data);
      }
    } catch (err) {
      console.error("TableMap Fetch Error:", err);
    }
  };

  useEffect(() => {
    fetchTableStatus();

    const channel = supabase
      .channel('table_updates_map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dining_tables' }, () => {
        fetchTableStatus();
      })
      .subscribe();

    pollIntervalRef.current = window.setInterval(fetchTableStatus, 10000);

    return () => {
      supabase.removeChannel(channel);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleClearTable = async (tableId: string) => {
    await updateTableStatus(tableId, 'AVAILABLE');
    setSelectedTable(null);
    fetchTableStatus();
  };

  const getTableStatus = (tableId: string) => {
    const dbT = dbTables.find(dt => dt.id === tableId);
    return dbT?.status || 'AVAILABLE';
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-brand-cream relative no-scrollbar">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h2 className="text-4xl font-black text-brand-brown tracking-tighter italic uppercase">Base <span className="text-brand-yellow">Camp</span></h2>
          <p className="text-brand-brown/40 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Dine-In Operations Command</p>
        </div>
        <div className="flex items-center gap-6 bg-white p-4 rounded-[2rem] border border-brand-stone shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
            <span className="text-[9px] font-black uppercase text-brand-brown/50 tracking-widest">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-brand-yellow rounded-full"></div>
            <span className="text-[9px] font-black uppercase text-brand-brown/50 tracking-widest">Occupied</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-8 max-w-5xl mx-auto">
        {tables.map(table => {
          const status = getTableStatus(table.id);
          return (
            <button
              key={table.id}
              onClick={() => setSelectedTable({ ...table, status })}
              className={`group aspect-square rounded-[2.5rem] p-8 flex flex-col items-center justify-center transition-all duration-500 shadow-sm hover:shadow-2xl hover:-translate-y-2 border-4 ${
                status === 'AVAILABLE' ? 'bg-white border-brand-stone text-brand-brown' : 
                status === 'OCCUPIED' ? 'bg-brand-yellow border-brand-yellow/30 text-brand-brown' :
                'bg-brand-red border-brand-red/30 text-white'
              }`}
            >
              <span className="text-5xl font-black tracking-tighter mb-2">{table.number}</span>
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40 mb-1">{table.capacity} Seats</span>
                <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full ${
                   status === 'AVAILABLE' ? 'bg-emerald-50 text-emerald-600' : 'bg-black/10 text-brand-brown'
                }`}>
                  {status}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {selectedTable && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-brand-cream rounded-[3rem] shadow-2xl w-full max-w-sm p-10 border border-brand-stone">
            <div className="text-center mb-8">
              <div className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-4 ${selectedTable.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-600' : 'bg-brand-yellow text-brand-brown'}`}>
                <span className="text-4xl font-black">{selectedTable.number}</span>
              </div>
              <h3 className="text-2xl font-black text-brand-brown tracking-tight italic">Table {selectedTable.number}</h3>
              <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">Currently {selectedTable.status}</p>
            </div>

            <div className="space-y-4">
              {selectedTable.status !== 'AVAILABLE' && (
                <button 
                  onClick={() => handleClearTable(selectedTable.id)}
                  className="w-full py-4 rounded-2xl bg-brand-brown text-brand-yellow font-black uppercase tracking-widest text-[10px] shadow-xl hover:scale-105 transition-transform"
                >
                  Clear Table & Reset
                </button>
              )}
              
              <button 
                onClick={() => setSelectedTable(null)}
                className="w-full py-4 rounded-2xl bg-white text-brand-brown/40 font-black uppercase tracking-widest text-[10px] border border-brand-stone"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TableMap;
