
import React, { useState, useEffect } from 'react';
import { getAppUsers, createAppUser, updateAppUser, getStations } from '../utils/storage';
import { Station, UserRole } from '../types';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedStations, setSelectedStations] = useState<string[]>([]);
  const [role, setRole] = useState<UserRole>('STORE_MANAGER');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const fetchData = async () => {
    const u = await getAppUsers();
    setUsers(u);
    const s = await getStations();
    setStations(s);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    if (username && password && (role === 'ADMIN' || selectedStations.length > 0)) {
      const payload = { 
        username, 
        password, 
        role, 
        station_id: role === 'ADMIN' ? undefined : selectedStations[0],
        station_ids: role === 'ADMIN' ? [] : selectedStations
      };

      if (editingUserId) {
        await updateAppUser(editingUserId, payload);
      } else {
        await createAppUser(payload);
      }

      setUsername(''); 
      setPassword(''); 
      setSelectedStations([]); 
      setRole('STORE_MANAGER'); 
      setEditingUserId(null);
      setIsModalOpen(false);
      fetchData();
    }
  };

  const handleEdit = (user: any) => {
    setEditingUserId(user.id);
    setUsername(user.username);
    setPassword(user.password);
    setRole(user.role as UserRole);
    setSelectedStations(user.assignedStations?.map((s: any) => s.id) || []);
    setIsModalOpen(true);
  };

  const toggleStation = (id: string) => {
    setSelectedStations(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
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
                <td className="px-8 py-6 font-bold text-brand-brown/60 italic">
                  {(u.assignedStations && u.assignedStations.length > 0) 
                    ? u.assignedStations.map((as: any) => as.name).join(', ') 
                    : (u.stations?.name || 'Super Admin')}
                </td>
                <td className="px-8 py-6 font-mono text-xs text-brand-brown/40">{u.password}</td>
                <td className="px-8 py-6 text-right">
                  <button 
                    onClick={() => handleEdit(u)}
                    className="text-[10px] font-black uppercase tracking-widest text-brand-brown/40 hover:text-brand-brown transition-colors"
                  >
                    Edit Access
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-brand-cream rounded-[2.5rem] p-10 w-full max-w-sm border border-brand-stone shadow-2xl">
            <h3 className="text-2xl font-black mb-8 italic text-brand-brown">
              {editingUserId ? 'EDIT STAFF' : 'NEW STAFF'} <span className="text-brand-yellow">ACCOUNT</span>
            </h3>
            <div className="space-y-4">
              <input placeholder="Username (Login Identity)" value={username} onChange={e => setUsername(e.target.value)} className={inputClasses} />
              <input placeholder="Access Key (Password)" value={password} onChange={e => setPassword(e.target.value)} className={inputClasses} />
              <select value={role} onChange={e => setRole(e.target.value as UserRole)} className={inputClasses}>
                <option value="STORE_MANAGER">Store Manager</option>
                <option value="CASHIER">Cashier</option>
                <option value="ADMIN">System Admin</option>
              </select>
              {role !== 'ADMIN' && (
                <div className="space-y-2 max-h-40 overflow-y-auto p-4 bg-brand-stone/20 rounded-2xl border border-brand-stone no-scrollbar">
                  <p className="text-[10px] font-black text-brand-brown/40 uppercase mb-2">Assign Stations</p>
                  {stations.map(s => (
                    <label key={s.id} className="flex items-center gap-3 cursor-pointer group hover:bg-white p-2 rounded-xl transition-colors">
                      <input 
                        type="checkbox" 
                        checked={selectedStations.includes(s.id)}
                        onChange={() => toggleStation(s.id)}
                        className="w-4 h-4 rounded border-brand-stone text-brand-brown focus:ring-brand-yellow"
                      />
                      <span className="text-xs font-bold text-brand-brown">{s.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <button onClick={handleSave} className="w-full py-4 bg-brand-brown text-brand-yellow rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all">
                {editingUserId ? 'Save Changes' : 'Create Account'}
              </button>

              <button onClick={() => { setIsModalOpen(false); setEditingUserId(null); }} className="w-full py-2 text-brand-brown/60 font-black uppercase text-[10px] tracking-widest hover:text-brand-brown transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
