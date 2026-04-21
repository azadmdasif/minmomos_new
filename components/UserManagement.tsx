
import React, { useState, useEffect } from 'react';
import { getAppUsers, createAppUser, getStations } from '../utils/storage';
import { Station } from '../types';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedStation, setSelectedStation] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
    const u = await getAppUsers();
    setUsers(u);
    const s = await getStations();
    setStations(s);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (username && password && selectedStation) {
      await createAppUser({ username, password, role: 'STORE_MANAGER', station_id: selectedStation });
      setUsername(''); setPassword(''); setSelectedStation(''); setIsModalOpen(false);
      fetchData();
    }
  };

  const inputClasses = "w-full p-4 rounded-2xl border border-brand-stone bg-white text-brand-brown font-bold focus:ring-2 focus:ring-brand-yellow outline-none transition-all placeholder:text-brand-brown/30";

  return (
    <div className="p-8 h-full bg-brand-cream overflow-y-auto no-scrollbar">
      <header className="flex justify-between items-end mb-12">
        <div>
          <h2 className="text-4xl font-black text-brand-brown italic">PEAK <span className="text-brand-yellow">STAFF</span></h2>
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">Manage Manager Credentials</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-brand-brown text-brand-yellow px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform">New Manager Account</button>
      </header>

      <div className="bg-white rounded-[2rem] shadow-xl border border-brand-stone overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-brand-brown/5">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black uppercase text-brand-brown/50">Username</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase text-brand-brown/50">Role</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase text-brand-brown/50">Assigned Station</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase text-brand-brown/50">Access Key</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-stone">
            {users.map(u => (
              <tr key={u.id}>
                <td className="px-8 py-6 font-black text-brand-brown">{u.username}</td>
                <td className="px-8 py-6"><span className="text-[10px] font-black uppercase bg-stone-100 px-2 py-1 rounded text-brand-brown/70">{u.role}</span></td>
                <td className="px-8 py-6 font-bold text-brand-brown/60 italic">{u.stations?.name || 'Super Admin'}</td>
                <td className="px-8 py-6 font-mono text-xs text-brand-brown/40">{u.password}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-brand-cream rounded-[2.5rem] p-10 w-full max-w-sm border border-brand-stone shadow-2xl">
            <h3 className="text-2xl font-black mb-8 italic text-brand-brown">NEW STAFF <span className="text-brand-yellow">ACCOUNT</span></h3>
            <div className="space-y-4">
              <input placeholder="Username (Login Identity)" value={username} onChange={e => setUsername(e.target.value)} className={inputClasses} />
              <input placeholder="Access Key (Password)" value={password} onChange={e => setPassword(e.target.value)} className={inputClasses} />
              <select value={selectedStation} onChange={e => setSelectedStation(e.target.value)} className={inputClasses}>
                <option value="">Assign to Station...</option>
                {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button onClick={handleCreate} className="w-full py-4 bg-brand-brown text-brand-yellow rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all">Create Account</button>
              <button onClick={() => setIsModalOpen(false)} className="w-full py-2 text-brand-brown/60 font-black uppercase text-[10px] tracking-widest hover:text-brand-brown transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
