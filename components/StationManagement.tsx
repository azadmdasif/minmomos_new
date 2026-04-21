
import React, { useState, useEffect } from 'react';
import { getStations, createStation } from '../utils/storage';
import { Station } from '../types';

const StationManagement: React.FC = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchStations = async () => {
    const s = await getStations();
    setStations(s);
  };

  useEffect(() => { fetchStations(); }, []);

  const handleAdd = async () => {
    if (name.trim()) {
      await createStation(name, location);
      setName(''); setLocation(''); setIsModalOpen(false);
      fetchStations();
    }
  };

  const inputClasses = "w-full p-4 rounded-2xl border border-brand-stone bg-white text-brand-brown font-bold focus:ring-2 focus:ring-brand-yellow outline-none transition-all placeholder:text-brand-brown/30";

  return (
    <div className="p-8 h-full bg-brand-cream overflow-y-auto no-scrollbar">
      <header className="flex justify-between items-end mb-12">
        <div>
          <h2 className="text-4xl font-black text-brand-brown italic">STALL <span className="text-brand-yellow">STATIONS</span></h2>
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">Manage active selling points</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-brand-brown text-brand-yellow px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform">Add New Station</button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stations.map(s => (
          <div key={s.id} className="bg-white p-8 rounded-[2rem] shadow-sm border border-brand-stone relative group hover:border-brand-yellow transition-all">
            <div className="w-12 h-12 bg-brand-yellow/10 rounded-2xl flex items-center justify-center mb-4">
               <svg className="w-6 h-6 text-brand-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <h3 className="text-xl font-black text-brand-brown">{s.name}</h3>
            <p className="text-xs text-brand-brown/40 mt-1 font-bold uppercase tracking-widest">{s.location || 'No Location Set'}</p>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-brand-cream rounded-[2.5rem] p-10 w-full max-w-sm border border-brand-stone shadow-2xl">
            <h3 className="text-2xl font-black mb-8 italic text-brand-brown underline decoration-brand-yellow decoration-4 underline-offset-8">NEW STATION</h3>
            <div className="space-y-4">
              <input placeholder="Station Name" value={name} onChange={e => setName(e.target.value)} className={inputClasses} />
              <input placeholder="Location Detail" value={location} onChange={e => setLocation(e.target.value)} className={inputClasses} />
              <button onClick={handleAdd} className="w-full py-4 bg-brand-brown text-brand-yellow rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all">Create Station</button>
              <button onClick={() => setIsModalOpen(false)} className="w-full py-2 text-brand-brown/60 font-black uppercase text-[10px] tracking-widest hover:text-brand-brown transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StationManagement;
