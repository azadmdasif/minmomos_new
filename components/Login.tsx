
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const { data, error: queryError } = await supabase
      .from('app_users')
      .select('*, stations(name)')
      .eq('username', username)
      .eq('password', password)
      .maybeSingle();

    if (queryError || !data) {
      setError('Invalid identity or access key.');
      setIsLoading(false);
    } else {
      onLogin({
        id: data.id,
        username: data.username,
        role: data.role as any,
        station_id: data.station_id,
        stationName: data.stations?.name
      });
    }
  };

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
