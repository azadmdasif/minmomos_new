
import React from 'react';
import { UserRole } from '../types';

type View = 'pos' | 'tables' | 'kds' | 'reports' | 'inventory' | 'users' | 'stations' | 'menu';

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  branchName: string;
  role: UserRole;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, branchName, role, onLogout }) => {
  const isAdmin = role === 'ADMIN';

  const navItems: { id: View; label: string; icon: string; role: 'ADMIN' | 'MANAGER' | 'BOTH' }[] = [
    { id: 'reports', label: 'Dash', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', role: 'BOTH' },
    { id: 'pos', label: 'Bill', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z', role: 'MANAGER' },
    { id: 'tables', label: 'Tables', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16', role: 'MANAGER' },
    { id: 'inventory', label: 'Stock', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', role: 'BOTH' },
    { id: 'kds', label: 'Kitchen', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', role: 'MANAGER' },
    { id: 'menu', label: 'Menu', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5s3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', role: 'ADMIN' },
    { id: 'users', label: 'Staff', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197', role: 'ADMIN' },
    { id: 'stations', label: 'Loc', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z', role: 'ADMIN' },
  ];

  const filteredNav = navItems.filter(item => {
    if (isAdmin) return item.role === 'ADMIN' || item.role === 'BOTH';
    return item.role === 'MANAGER' || item.role === 'BOTH';
  });

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-brand-brown h-full flex-col text-brand-cream shadow-2xl z-20">
        <div className="p-8 border-b border-white/10">
          <h1 className="text-2xl font-black text-brand-yellow uppercase tracking-tighter italic">minmomos</h1>
          <p className="text-[9px] uppercase font-bold tracking-[0.3em] text-brand-yellow/50 mt-1">{branchName}</p>
        </div>

        <nav className="flex-1 p-3 space-y-2 mt-6 overflow-y-auto no-scrollbar">
          {filteredNav.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-4 p-4 px-5 rounded-2xl transition-all duration-300 ${
                activeView === item.id 
                  ? 'bg-brand-yellow text-brand-brown shadow-xl' 
                  : 'text-white/40 hover:bg-white/5 hover:text-white'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={item.icon} />
              </svg>
              <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-6 mt-auto">
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 p-3 bg-brand-red/20 hover:bg-brand-red/40 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-20 bg-brand-brown border-t border-white/10 flex items-center justify-around px-2 z-50">
        {filteredNav.slice(0, 5).map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`flex flex-col items-center justify-center gap-1 transition-all px-3 py-2 rounded-xl ${
              activeView === item.id ? 'bg-brand-yellow text-brand-brown' : 'text-white/40'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={item.icon} />
            </svg>
            <span className="text-[8px] font-black uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
        <button onClick={onLogout} className="flex flex-col items-center justify-center gap-1 text-brand-red/60">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7" />
          </svg>
          <span className="text-[8px] font-black uppercase tracking-widest">Exit</span>
        </button>
      </div>
    </>
  );
};

export default Sidebar;
