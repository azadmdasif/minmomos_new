
import React, { useState } from 'react';
import { User } from '../types';
import { supabase } from '../utils/supabase';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [tempUser, setTempUser] = useState<any>(null);
  const [assignedStations, setAssignedStations] = useState<{id: string, name: string}[]>([]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const { data: user, error: queryError } = await supabase
      .from('app_users')
      .select('*, stations!app_users_station_id_fkey(name)')
      .eq('username', username)
      .eq('password', password)
      .maybeSingle();

    if (queryError || !user) {
      setError('Invalid identity or access key.');
      setIsLoading(false);
      return;
    }

    // Fetch assigned stations from the new link table
    const { data: assignments } = await supabase
      .from('user_stations')
      .select('station_id, stations:station_id(name)')
      .eq('user_id', user.id);

    let stations = assignments?.map(a => ({ id: a.station_id, name: (a.stations as any)?.name })) || [];

    // BACKWARD COMPATIBILITY: If no multi-station assignments, check legacy station_id
    if (stations.length === 0 && user.station_id) {
      stations = [{ id: user.station_id, name: user.stations?.name }];
    }

    if (user.role === 'ADMIN' || user.role === 'COFOUNDER') {
      onLogin({
        id: user.id,
        username: user.username,
        role: user.role,
        stationName: 'All Stations'
      });
    } else if (stations.length === 1) {
      onLogin({
        id: user.id,
        username: user.username,
        role: user.role,
        station_id: stations[0].id,
        stationName: stations[0].name
      });
    } else if (stations.length > 1) {
      setTempUser(user);
      setAssignedStations(stations);
      setIsLoading(false);
    } else {
      setError('No station assigned to this account.');
      setIsLoading(false);
    }
  };

  const handleStationSelect = (stationId: string, stationName: string) => {
    onLogin({
      id: tempUser.id,
      username: tempUser.username,
      role: tempUser.role,
      station_id: stationId,
      stationName: stationName
    });
  };

  if (tempUser && assignedStations.length > 0) {
    return (
      <div className="h-screen w-screen bg-brand-brown flex items-center justify-center p-4">
        <div className="bg-brand-cream rounded-[3rem] shadow-2xl w-full max-w-md p-10 relative border border-white/20">
          <div className="text-center mb-10">
            <h1 className="text-2xl font-black text-brand-brown tracking-tighter mb-2 italic">Select Station</h1>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-stone-400">Which branch are you billing now?</p>
          </div>
          <div className="space-y-4">
            {assignedStations.map(s => (
              <button 
                key={s.id}
                onClick={() => handleStationSelect(s.id, s.name)}
                className="w-full p-6 bg-white border-2 border-brand-stone rounded-2xl font-black text-brand-brown hover:bg-brand-brown hover:text-brand-yellow transition-all flex items-center justify-between group"
              >
                <span>{s.name}</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-brand-brown flex items-center justify-center p-4">
      <div className="bg-brand-cream rounded-[3rem] shadow-2xl w-full max-w-md p-10 relative border border-white/20">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-brand-brown tracking-tighter mb-2 italic">minmomos</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-stone-400">Peak QSR Management</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <input 
            type="text" 
            placeholder="Identity" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            className="w-full bg-stone-50 border p-5 rounded-2xl font-black" 
            required 
          />
          <input 
            type="password" 
            placeholder="Access Key" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            className="w-full bg-stone-50 border p-5 rounded-2xl font-black" 
            required 
          />
          {error && <p className="text-xs font-black text-brand-red text-center">{error}</p>}
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-5 bg-brand-brown text-brand-yellow rounded-2xl font-black uppercase tracking-widest shadow-xl disabled:opacity-50"
          >
            {isLoading ? 'Entering Station...' : 'Enter Station'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
