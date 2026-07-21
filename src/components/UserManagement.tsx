import React, { useState, useEffect } from 'react';
import { getAppUsers, createAppUser, updateAppUser, getStations, deleteAppUser } from '../utils/storage';
import { Station, UserRole, User } from '../types';

interface UserManagementProps {
  user?: User | null;
}

const UserManagement: React.FC<UserManagementProps> = ({ user }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedStations, setSelectedStations] = useState<string[]>([]);
  const [role, setRole] = useState<UserRole>('STORE_MANAGER');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  
  // Custom states to bypass iframe-blocking alerts/confirmations
  const [userToDelete, setUserToDelete] = useState<{ id: string, username: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  const fetchData = async () => {
    const u = await getAppUsers();
    setUsers(u);
    const s = await getStations();
    setStations(s);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (feedbackMsg) {
      const timer = setTimeout(() => setFeedbackMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMsg]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="p-8 h-full bg-brand-cream flex flex-col items-center justify-center">
        <div className="bg-white p-8 rounded-[2rem] border border-brand-stone shadow-xl text-center max-w-md">
          <h2 className="text-2xl font-black text-brand-brown uppercase">Access Denied</h2>
          <p className="text-sm text-brand-brown/70 mt-4">Co-Founders are not authorized to view the Staff tab or manage user accounts.</p>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setFormError(null);
    if (username && password && (role === 'ADMIN' || role === 'COFOUNDER' || selectedStations.length > 0)) {
      // Check permission
      const isEditingOtherUser = editingUserId !== null && editingUserId !== user?.id;
      const isSuperAdmin = user?.role === 'ADMIN';
      if (isEditingOtherUser && !isSuperAdmin) {
        setFormError('Error: Only system admin/superadmin can change credentials of other staff members.');
        return;
      }

      const payload = { 
        username, 
        password, 
        role, 
        station_id: (role === 'ADMIN' || role === 'COFOUNDER') ? undefined : selectedStations[0],
        station_ids: (role === 'ADMIN' || role === 'COFOUNDER') ? [] : selectedStations
      };

      try {
        if (editingUserId) {
          await updateAppUser(editingUserId, payload);
          setFeedbackMsg({ type: 'success', text: `Successfully updated account @${username}.` });
        } else {
          await createAppUser(payload);
          setFeedbackMsg({ type: 'success', text: `Successfully created account @${username}.` });
        }

        setUsername(''); 
        setPassword(''); 
        setSelectedStations([]); 
        setRole('STORE_MANAGER'); 
        setEditingUserId(null);
        setIsModalOpen(false);
        fetchData();
      } catch (e: any) {
        setFormError(`Failed to save: ${e.message || e}`);
      }
    }
  };

  const handleEdit = (u: any) => {
    setFormError(null);
    setEditingUserId(u.id);
    setUsername(u.username);
    setPassword(u.password);
    setRole(u.role as UserRole);
    setSelectedStations(u.assignedStations?.map((s: any) => s.id) || []);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (userId: string, targetUsername: string) => {
    if (user?.role !== 'ADMIN') {
      setFeedbackMsg({ type: 'error', text: 'Error: Only system admin/superadmin is authorized to delete accounts.' });
      return;
    }
    if (targetUsername === user?.username) {
      setFeedbackMsg({ type: 'error', text: 'Error: You cannot delete your own account while logged in.' });
      return;
    }
    setUserToDelete({ id: userId, username: targetUsername });
  };

  const executeDelete = async () => {
    if (!userToDelete) return;
    try {
      await deleteAppUser(userToDelete.id);
      setFeedbackMsg({ type: 'success', text: `Permanently deleted @${userToDelete.username} account.` });
      setUserToDelete(null);
      fetchData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: `Delete Failed: ${err.message || err}` });
      setUserToDelete(null);
    }
  };

  const toggleStation = (id: string) => {
    setSelectedStations(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const isEditingOtherUser = editingUserId !== null && editingUserId !== user?.id;
  const isSuperAdmin = user?.role === 'ADMIN';
  const canChangeCredentials = !isEditingOtherUser || isSuperAdmin;

  const inputClasses = "w-full p-4 rounded-2xl border border-brand-stone bg-white text-brand-brown font-bold focus:ring-2 focus:ring-brand-yellow outline-none transition-all placeholder:text-brand-brown/30 disabled:bg-brand-stone/10 disabled:text-brand-brown/50 disabled:cursor-not-allowed";

  return (
    <div className="p-8 h-full bg-brand-cream overflow-y-auto no-scrollbar relative">
      
      {/* Toast Feedback Messages */}
      {feedbackMsg && (
        <div className="fixed bottom-6 right-6 z-[120] animate-bounce">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl border ${
            feedbackMsg.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-rose-50 border-rose-200 text-rose-800'
          } font-bold text-xs flex items-center gap-3`}>
            <span>{feedbackMsg.type === 'success' ? '✅' : '❌'}</span>
            <span>{feedbackMsg.text}</span>
            <button 
              onClick={() => setFeedbackMsg(null)} 
              className="ml-4 text-slate-400 hover:text-slate-600 font-bold"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <header className="flex justify-between items-end mb-12">
        <div>
          <h2 className="text-4xl font-black text-brand-brown italic">PEAK <span className="text-brand-yellow">STAFF</span></h2>
          <p className="text-[10px] font-bold text-brand-brown/40 uppercase tracking-widest mt-1">Manage Manager Credentials</p>
        </div>
        {user?.role === 'ADMIN' && (
          <button onClick={() => {
            setUsername('');
            setPassword('');
            setSelectedStations([]);
            setRole('STORE_MANAGER');
            setEditingUserId(null);
            setFormError(null);
            setIsModalOpen(true);
          }} className="bg-brand-brown text-brand-yellow px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform">New Manager Account</button>
        )}
      </header>

      <div className="bg-white rounded-[2rem] shadow-xl border border-brand-stone overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-brand-brown/5">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black uppercase text-brand-brown/50">Username</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase text-brand-brown/50">Role</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase text-brand-brown/50">Assigned Station</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase text-brand-brown/50">Access Key</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase text-brand-brown/50 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-stone">
            {users.map(u => (
              <tr key={u.id}>
                <td className="px-8 py-6 font-black text-brand-brown">
                  {u.username} {u.username === user?.username && <span className="text-brand-brown/40 font-normal text-xs italic">(you)</span>}
                </td>
                <td className="px-8 py-6"><span className="text-[10px] font-black uppercase bg-stone-100 px-2 py-1 rounded text-brand-brown/70">{u.role}</span></td>
                <td className="px-8 py-6 font-bold text-brand-brown/60 italic">
                  {(u.assignedStations && u.assignedStations.length > 0) 
                    ? u.assignedStations.map((as: any) => as.name).join(', ') 
                    : (u.stations?.name || 'Super Admin')}
                </td>
                <td className="px-8 py-6 font-mono text-xs text-brand-brown/40">{u.password}</td>
                <td className="px-8 py-6 text-right space-x-4">
                  <button 
                    onClick={() => handleEdit(u)}
                    className="text-[10px] font-black uppercase tracking-widest text-brand-brown/40 hover:text-brand-brown transition-colors"
                  >
                    Edit Access
                  </button>
                  {isSuperAdmin && u.username !== user?.username && (
                    <button 
                      onClick={() => handleDeleteClick(u.id, u.username)}
                      className="text-[10px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-700 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Save/Edit Account Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-brand-cream rounded-[2.5rem] p-10 w-full max-w-sm border border-brand-stone shadow-2xl">
            <h3 className="text-2xl font-black mb-8 italic text-brand-brown">
              {editingUserId ? 'EDIT STAFF' : 'NEW STAFF'} <span className="text-brand-yellow">ACCOUNT</span>
            </h3>
            <div className="space-y-4">
              {isEditingOtherUser && !isSuperAdmin && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl text-[10px] font-bold uppercase tracking-wide">
                  ⚠️ Credential modifications are restricted to Super Admin.
                </div>
              )}
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl text-[10px] font-bold uppercase tracking-wide">
                  ⚠️ {formError}
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-brand-brown/40 tracking-wider">Username</label>
                <input 
                  placeholder="Username (Login Identity)" 
                  value={username} 
                  onChange={e => setUsername(e.target.value)} 
                  className={inputClasses} 
                  disabled={!canChangeCredentials}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-brand-brown/40 tracking-wider">Access Key (Password)</label>
                <input 
                  placeholder="Access Key (Password)" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  className={inputClasses} 
                  disabled={!canChangeCredentials}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-brand-brown/40 tracking-wider">Role</label>
                <select 
                  value={role} 
                  onChange={e => setRole(e.target.value as UserRole)} 
                  className={inputClasses}
                  disabled={!canChangeCredentials}
                >
                  <option value="STORE_MANAGER">Store Manager</option>
                  <option value="CASHIER">Cashier</option>
                  <option value="ADMIN">System Admin</option>
                  <option value="COFOUNDER">Co-Founder</option>
                </select>
              </div>
              {role !== 'ADMIN' && role !== 'COFOUNDER' && (
                <div className="space-y-2 max-h-40 overflow-y-auto p-4 bg-brand-stone/20 rounded-2xl border border-brand-stone no-scrollbar">
                  <p className="text-[10px] font-black text-brand-brown/40 uppercase mb-2">Assign Stations</p>
                  {stations.map(s => (
                    <label key={s.id} className="flex items-center gap-3 cursor-pointer group hover:bg-white p-2 rounded-xl transition-colors">
                      <input 
                        type="checkbox" 
                        checked={selectedStations.includes(s.id)}
                        onChange={() => toggleStation(s.id)}
                        disabled={!canChangeCredentials}
                        className="w-4 h-4 rounded border-brand-stone text-brand-brown focus:ring-brand-yellow disabled:opacity-50"
                      />
                      <span className="text-xs font-bold text-brand-brown">{s.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <button 
                onClick={handleSave} 
                disabled={!canChangeCredentials}
                className="w-full py-4 bg-brand-brown text-brand-yellow rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                {editingUserId ? 'Save Changes' : 'Create Account'}
              </button>

              <button onClick={() => { setIsModalOpen(false); setEditingUserId(null); setFormError(null); }} className="w-full py-2 text-brand-brown/60 font-black uppercase text-[10px] tracking-widest hover:text-brand-brown transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-[110] p-4">
          <div className="bg-brand-cream rounded-[2.5rem] p-10 w-full max-w-sm border border-brand-stone shadow-2xl text-center">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-3xl font-black">⚠️</span>
            </div>
            <h3 className="text-xl font-black mb-4 text-brand-brown italic">
              DELETE STAFF <span className="text-brand-yellow">ACCOUNT</span>
            </h3>
            <p className="text-xs text-brand-brown/60 mb-8 leading-relaxed">
              Are you sure you want to permanently delete the staff account <span className="font-bold text-brand-brown">@{userToDelete.username}</span>? This action is irreversible.
            </p>
            <div className="space-y-3">
              <button
                onClick={executeDelete}
                className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
              >
                Yes, Delete Account
              </button>
              <button
                onClick={() => setUserToDelete(null)}
                className="w-full py-3 bg-white text-brand-brown/60 rounded-2xl font-black uppercase tracking-widest text-[10px] border border-brand-stone hover:text-brand-brown transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
