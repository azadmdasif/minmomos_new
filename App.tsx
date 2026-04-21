
import { useState } from 'react';
import Sidebar from './components/Sidebar';
import POS from './components/POS';
import KDS from './components/KDS';
import Analytics from './components/Analytics';
import Inventory from './components/Inventory';
import Login from './components/Login';
import StationManagement from './components/StationManagement';
import UserManagement from './components/UserManagement';
import TableMap from './components/TableMap';
import MenuManager from './components/MenuManager';
import { getCurrentUser, setCurrentUser } from './utils/storage';
import { User } from './types';

type View = 'pos' | 'tables' | 'kds' | 'reports' | 'inventory' | 'users' | 'stations' | 'menu';

function App() {
  const [view, setView] = useState<View>('reports');
  const [user, setUser] = useState<User | null>(getCurrentUser());

  const handleLogin = (loggedUser: User) => {
    setUser(loggedUser);
    setCurrentUser(loggedUser);
    setView(loggedUser.role === 'ADMIN' ? 'reports' : 'pos');
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentUser(null);
  };

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="flex h-screen w-screen bg-brand-cream overflow-hidden">
      <Sidebar 
        activeView={view} 
        onViewChange={setView as any} 
        branchName={user.stationName || 'Headquarters'} 
        role={user.role}
        onLogout={handleLogout}
      />
      
      <main className="flex-1 overflow-hidden relative">
        {view === 'pos' && <POS branchName={user.stationName || 'Main Station'} />}
        {view === 'tables' && <TableMap />}
        {view === 'kds' && <KDS />}
        {view === 'reports' && <Analytics user={user} />}
        {view === 'inventory' && <Inventory user={user} currentBranch={user.stationName || null} />}
        {view === 'stations' && <StationManagement />}
        {view === 'users' && <UserManagement />}
        {view === 'menu' && <MenuManager />}
      </main>
    </div>
  );
}

export default App;
