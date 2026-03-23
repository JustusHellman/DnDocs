import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { Search, Users, Map as MapIcon, Castle, BookOpen, Package, LogOut, X, QrCode, ArrowLeftRight, Globe, Home, MapPin, Building, Flag, FileText, Scroll, Wrench, Skull } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import clsx from 'clsx';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const { user, logout, isDM, currentCampaign, setCurrentCampaign } = useAuth();
  const [showInvite, setShowInvite] = useState(false);

  const navItems = [
    { to: '/search', icon: Search, label: 'Global Search' },
    { to: '/map', icon: MapIcon, label: 'World Map' },
    { to: '/entities/quest', icon: Scroll, label: 'Quests' },
    { to: '/entities/note', icon: FileText, label: 'Notes' },
    { to: '/entities/item', icon: Package, label: 'Items' },
    { to: '/entities/npc', icon: Users, label: 'NPCs' },
    { to: '/entities/monster', icon: Skull, label: 'Monsters' },
    { to: '/entities/shop', icon: Building, label: 'Shops' },
    { to: '/entities/landmark', icon: MapPin, label: 'Landmarks' },
    { to: '/entities/faction', icon: Flag, label: 'Factions' },
    { to: '/entities/settlement', icon: Castle, label: 'Settlements' },
    { to: '/entities/country', icon: Globe, label: 'Countries' },
    { to: '/players', icon: Users, label: 'Players' },
  ];

  if (isDM) {
    navItems.push({ to: '/tools', icon: Wrench, label: 'DM Tools' });
  }

  const handleLinkClick = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        "fixed md:static inset-y-0 left-0 z-40 bg-stone-900/95 backdrop-blur-md border-stone-800 flex flex-col h-full transform transition-all duration-300 ease-in-out shrink-0 overflow-hidden",
        isOpen ? "translate-x-0 w-64 border-r" : "-translate-x-full md:translate-x-0 w-64 md:w-0 border-r md:border-r-0"
      )}>
        <div className="w-64 flex flex-col h-full">
          <div className="p-6 border-b border-stone-800/50 flex items-start justify-between shrink-0">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-display font-bold text-amber-500 tracking-tight truncate">{currentCampaign?.name || 'DnD World DB'}</h1>
              <p className="text-xs text-stone-500 mt-1 uppercase tracking-wider font-semibold">
                {isDM ? 'Dungeon Master' : 'Player'}
              </p>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1 text-stone-400 hover:text-stone-100">
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-4">
            <ul className="space-y-1 px-3">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={handleLinkClick}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-stone-800 text-stone-100'
                          : 'text-stone-400 hover:bg-stone-800/50 hover:text-stone-200'
                      )
                    }
                  >
                    <item.icon size={18} />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="p-4 border-t border-stone-800 space-y-2 shrink-0">
            {isDM && (
              <button
                onClick={() => setShowInvite(true)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium text-amber-400 hover:text-amber-300 hover:bg-amber-950/30 rounded-lg transition-colors border border-amber-900/30"
              >
                <QrCode size={16} />
                Invite Players
              </button>
            )}
            
            <button
              onClick={() => setCurrentCampaign(null)}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-lg transition-colors"
            >
              <ArrowLeftRight size={16} />
              Switch Campaign
            </button>

            <div className="flex items-center gap-3 px-3 py-2 mt-2">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-full object-cover border border-amber-900/50 shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-amber-500 font-bold text-sm shrink-0">
                  {user?.displayName?.[0] || '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.displayName}</p>
                <p className="text-xs text-stone-500 truncate">{user?.email}</p>
              </div>
              <button
                onClick={logout}
                className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-lg transition-colors shrink-0"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Invite Modal */}
      {showInvite && currentCampaign && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl relative">
            <button 
              onClick={() => setShowInvite(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-100"
            >
              <X size={20} />
            </button>
            <h2 className="text-2xl font-bold text-white mb-2 text-center">Invite Players</h2>
            <p className="text-stone-400 text-sm text-center mb-8">
              Share this code or QR with your players so they can join the campaign.
            </p>
            
            <div className="flex justify-center mb-8 p-4 bg-white rounded-xl">
              <QRCodeSVG value={`${window.location.origin}${import.meta.env.BASE_URL}join/${currentCampaign.joinCode}`} size={200} />
            </div>
            
            <div className="text-center">
              <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-2">Join Code</p>
              <div className="text-4xl font-mono font-bold text-amber-400 tracking-widest">
                {currentCampaign.joinCode}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
