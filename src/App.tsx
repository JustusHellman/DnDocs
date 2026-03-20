import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import CampaignDashboard from './pages/CampaignDashboard';
import EntityList from './pages/EntityList';
import EntityDetail from './pages/EntityDetail';
import EntityEdit from './pages/EntityEdit';
import GlobalSearch from './pages/GlobalSearch';
import PlayersList from './pages/PlayersList';
import JoinCampaign from './pages/JoinCampaign';
import { LogIn, Menu } from 'lucide-react';

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, login } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-stone-400">Loading DnD Database...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-100">
        <div className="max-w-md w-full p-8 bg-stone-900/80 backdrop-blur-md rounded-2xl border border-stone-800 shadow-2xl text-center">
          <h1 className="text-3xl font-bold text-amber-500 mb-2 font-cinzel">DnD World DB</h1>
          <p className="text-stone-400 mb-8">Sign in to access the campaign database.</p>
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-xl font-medium transition-all"
          >
            <LogIn size={20} />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function CampaignRoute({ children }: { children: React.ReactNode }) {
  const { currentCampaign } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);

  if (!currentCampaign) {
    return <CampaignDashboard />;
  }

  return (
    <div className="flex h-screen text-stone-100 overflow-hidden bg-transparent">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="h-16 bg-stone-900/80 backdrop-blur-md border-b border-stone-800/50 flex items-center px-4 shrink-0">
          {!isSidebarOpen && (
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-stone-400 hover:text-amber-500 mr-2">
              <Menu size={24} />
            </button>
          )}
          <h1 className="ml-2 text-lg font-display font-bold text-amber-500 truncate">{currentCampaign.name}</h1>
        </div>

        <main className="flex-1 overflow-y-auto p-6 md:p-10 bg-transparent">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<AuthRoute><CampaignRoute><Navigate to="/search" replace /></CampaignRoute></AuthRoute>} />
            <Route path="/search" element={<AuthRoute><CampaignRoute><GlobalSearch /></CampaignRoute></AuthRoute>} />
            <Route path="/entities/:type" element={<AuthRoute><CampaignRoute><EntityList /></CampaignRoute></AuthRoute>} />
            <Route path="/entity/:id" element={<AuthRoute><CampaignRoute><EntityDetail /></CampaignRoute></AuthRoute>} />
            <Route path="/entity/:id/edit" element={<AuthRoute><CampaignRoute><EntityEdit /></CampaignRoute></AuthRoute>} />
            <Route path="/entity/new" element={<AuthRoute><CampaignRoute><EntityEdit /></CampaignRoute></AuthRoute>} />
            <Route path="/players" element={<AuthRoute><CampaignRoute><PlayersList /></CampaignRoute></AuthRoute>} />
            <Route path="/join/:code" element={<AuthRoute><JoinCampaign /></AuthRoute>} />
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
