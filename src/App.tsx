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
import DMTools from './pages/DMTools';
import WorldMap from './pages/WorldMap';
import { LogIn, Menu } from 'lucide-react';

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, login, loginWithEmail, registerWithEmail } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-stone-400">Loading DnD Database...</div>;
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isRegistering) {
        await registerWithEmail(email, password, displayName);
      } else {
        await loginWithEmail(email, password);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-100 p-4">
        <div className="max-w-md w-full p-8 bg-stone-900/80 backdrop-blur-md rounded-2xl border border-stone-800 shadow-2xl text-center">
          <h1 className="text-3xl font-bold text-amber-500 mb-2 font-cinzel">DnD World DB</h1>
          <p className="text-stone-400 mb-6">Sign in to access the campaign database.</p>
          
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-900 rounded-xl font-medium transition-all mb-6"
          >
            <LogIn size={20} />
            Sign in with Google
          </button>

          <div className="relative flex py-2 items-center mb-6">
            <div className="flex-grow border-t border-stone-800"></div>
            <span className="flex-shrink-0 mx-4 text-stone-500 text-sm">Or continue with email</span>
            <div className="flex-grow border-t border-stone-800"></div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
            {isRegistering && (
              <div>
                <label className="block text-sm font-medium text-stone-400 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-2.5 text-stone-100 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none"
                  placeholder="e.g. DungeonMaster99"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-stone-400 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-2.5 text-stone-100 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-2.5 text-stone-100 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none"
                placeholder="••••••••"
                minLength={6}
              />
            </div>
            
            {authError && (
              <div className="text-red-400 text-sm p-3 bg-red-950/30 rounded-lg border border-red-900/50">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-xl font-medium transition-all"
            >
              {isRegistering ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-sm text-stone-400">
            {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => {
                setIsRegistering(!isRegistering);
                setAuthError('');
              }}
              className="text-amber-500 hover:text-amber-400 font-medium"
            >
              {isRegistering ? 'Sign In' : 'Register'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function CampaignRoute({ children }: { children: React.ReactNode }) {
  const { currentCampaign } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // the required distance between touchStart and touchEnd to be detected as a swipe
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null); // otherwise the swipe is fired even with usual touch events
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    // Only handle swipes on mobile
    if (window.innerWidth < 768) {
      if (isRightSwipe && touchStart < 50) {
        // Swipe right from the left edge
        setIsSidebarOpen(true);
      }
      if (isLeftSwipe && isSidebarOpen) {
        setIsSidebarOpen(false);
      }
    }
  };

  if (!currentCampaign) {
    return <CampaignDashboard />;
  }
  return (
    <div 
      className="flex h-screen text-stone-100 overflow-hidden bg-transparent"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
        <Router basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/" element={<AuthRoute><CampaignRoute><Navigate to="/search" replace /></CampaignRoute></AuthRoute>} />
            <Route path="/search" element={<AuthRoute><CampaignRoute><GlobalSearch /></CampaignRoute></AuthRoute>} />
            <Route path="/entities/:type" element={<AuthRoute><CampaignRoute><EntityList /></CampaignRoute></AuthRoute>} />
            <Route path="/entity/:id" element={<AuthRoute><CampaignRoute><EntityDetail /></CampaignRoute></AuthRoute>} />
            <Route path="/entity/:id/edit" element={<AuthRoute><CampaignRoute><EntityEdit /></CampaignRoute></AuthRoute>} />
            <Route path="/entity/new" element={<AuthRoute><CampaignRoute><EntityEdit /></CampaignRoute></AuthRoute>} />
            <Route path="/players" element={<AuthRoute><CampaignRoute><PlayersList /></CampaignRoute></AuthRoute>} />
            <Route path="/tools" element={<AuthRoute><CampaignRoute><DMTools /></CampaignRoute></AuthRoute>} />
            <Route path="/map" element={<AuthRoute><CampaignRoute><WorldMap /></CampaignRoute></AuthRoute>} />
            <Route path="/join/:code" element={<AuthRoute><JoinCampaign /></AuthRoute>} />
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}