import React, { useState, useRef, useEffect } from 'react';
import { Globe, Lock, Users } from 'lucide-react';
import { User, FieldPermission } from '../types';
import clsx from 'clsx';

interface Props {
  permission: FieldPermission | undefined;
  onChange: (permission: FieldPermission) => void;
  players: User[];
}

export default function FieldPermissionToggle({ permission, onChange, players }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const currentPerm = permission || { isPublic: false, allowedPlayers: [] };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const togglePlayer = (playerId: string) => {
    const newAllowed = currentPerm.allowedPlayers.includes(playerId)
      ? currentPerm.allowedPlayers.filter(id => id !== playerId)
      : [...currentPerm.allowedPlayers, playerId];
    
    onChange({
      ...currentPerm,
      isPublic: false,
      allowedPlayers: newAllowed
    });
  };

  const setPublic = () => {
    onChange({ isPublic: true, allowedPlayers: [] });
    setIsOpen(false);
  };

  const setPrivate = () => {
    onChange({ isPublic: false, allowedPlayers: [] });
    setIsOpen(false);
  };

  const getIcon = () => {
    if (currentPerm.isPublic) return <Globe size={14} className="text-emerald-400" />;
    if (currentPerm.allowedPlayers.length > 0) return <Users size={14} className="text-amber-400" />;
    return <Lock size={14} className="text-red-400" />;
  };

  return (
    <div className="relative inline-block" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-md bg-stone-900 border border-stone-800 hover:bg-stone-800 transition-colors flex items-center justify-center"
        title="Set visibility"
      >
        {getIcon()}
      </button>

      {isOpen && (
        <div className="absolute z-50 right-0 mt-2 w-64 bg-stone-900 border border-stone-800 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 space-y-1">
            <button
              type="button"
              onClick={setPublic}
              className={clsx(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                currentPerm.isPublic ? "bg-emerald-950/30 text-emerald-400" : "text-stone-300 hover:bg-stone-800"
              )}
            >
              <Globe size={16} />
              Public (All Players)
            </button>
            <button
              type="button"
              onClick={setPrivate}
              className={clsx(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                !currentPerm.isPublic && currentPerm.allowedPlayers.length === 0 ? "bg-red-950/30 text-red-400" : "text-stone-300 hover:bg-stone-800"
              )}
            >
              <Lock size={16} />
              Secret (DM Only)
            </button>
          </div>
          
          {players.length > 0 && (
            <>
              <div className="px-3 py-2 bg-stone-950/50 border-y border-stone-800 text-xs font-bold text-stone-500 uppercase tracking-wider">
                Specific Players
              </div>
              <div className="p-2 max-h-48 overflow-y-auto space-y-1">
                {players.map(player => (
                  <label
                    key={player.uid}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-stone-800 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={!currentPerm.isPublic && currentPerm.allowedPlayers.includes(player.uid)}
                      onChange={() => togglePlayer(player.uid)}
                      disabled={currentPerm.isPublic}
                      className="w-4 h-4 rounded border-stone-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-stone-900 bg-stone-900 disabled:opacity-50"
                    />
                    <span className={clsx("text-sm font-medium", currentPerm.isPublic ? "text-stone-600" : "text-stone-300")}>
                      {player.displayName}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
