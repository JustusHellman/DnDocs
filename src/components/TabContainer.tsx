import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTabs, TabData, useTabActions } from '../contexts/TabContext';
import { X, ExternalLink, ChevronDown, ChevronUp, Layers, Folder, FolderOpen, MinusCircle, Minimize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import EntityDetail from '../pages/EntityDetail';
import clsx from 'clsx';
import { useEntities } from '../hooks/useEntities';
import { useAuth } from '../AuthContext';

// Memoized Window Component to prevent expensive re-renders during drag operations
const TabWindow = React.memo(({ tab, onClose, onToggle, onNavigate, onClearFlash }: { 
  tab: TabData; 
  onClose: (id: string) => void; 
  onToggle: (id: string) => void;
  onNavigate: (id: string) => void;
  onClearFlash: (id: string) => void;
}) => {
  return (
    <div 
      className={clsx(
        "pointer-events-auto w-[85vw] sm:w-[500px] shrink-0 max-w-full bg-stone-900 border border-stone-700 rounded-xl shadow-2xl flex flex-col overflow-hidden h-full max-h-[calc(100vh-5rem)] animate-in slide-in-from-right-4 duration-200 snap-center transition-all",
        tab.isFlashing && "ring-2 ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
      )}
      onClick={() => {
        if (tab.isFlashing) onClearFlash(tab.id);
      }}
    >
      {/* Window Header */}
      <div className={clsx(
        "px-3 py-2 flex items-center justify-between border-b border-stone-700 shrink-0 transition-colors",
        tab.isFlashing ? "bg-amber-900/40" : "bg-stone-800"
      )}>
        <div className="flex items-center gap-2 truncate pr-2">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-500 bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-900/30 shrink-0">
            {tab.type}
          </span>
          <span className="font-bold text-stone-200 truncate">{tab.title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button 
            onClick={() => onNavigate(tab.id)}
            className="p-1 text-stone-400 hover:text-stone-200 hover:bg-stone-700 rounded transition-colors"
            title="Open full page"
          >
            <ExternalLink size={14} />
          </button>
          <button 
            onClick={() => onToggle(tab.id)}
            className="p-1 text-stone-400 hover:text-stone-200 hover:bg-stone-700 rounded transition-colors"
            title="Minimize"
          >
            <ChevronDown size={14} />
          </button>
          <button 
            onClick={() => onClose(tab.id)}
            className="p-1 text-stone-400 hover:text-red-400 hover:bg-stone-700 rounded transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      
      {/* Window Content */}
      <div className="flex-1 overflow-y-auto bg-stone-950 p-0 custom-scrollbar relative">
        <div className="absolute inset-0 overflow-y-auto p-4">
          <EntityDetail entityId={tab.id} />
        </div>
      </div>
    </div>
  );
});

TabWindow.displayName = 'TabWindow';

// Separate component for windows to isolate them from tab bar drag state
const TabWindows = React.memo(({ tabs, closeTab, toggleTab, onNavigate, clearFlashingTab }: {
  tabs: TabData[];
  closeTab: (id: string) => void;
  toggleTab: (id: string) => void;
  onNavigate: (id: string) => void;
  clearFlashingTab: (id: string) => void;
}) => {
  const openTabs = useMemo(() => tabs.filter(t => !t.isMinimized), [tabs]);
  
  if (openTabs.length === 0) return null;

  return (
    <div className="flex flex-row-reverse gap-2 h-full items-start justify-start pointer-events-none py-2 pr-2 overflow-x-auto custom-scrollbar snap-x min-w-0">
      {openTabs.map((tab) => (
        <TabWindow 
          key={`window-${tab.id}`} 
          tab={tab} 
          onClose={closeTab} 
          onToggle={toggleTab} 
          onNavigate={onNavigate} 
          onClearFlash={clearFlashingTab}
        />
      ))}
    </div>
  );
});

TabWindows.displayName = 'TabWindows';

export default function TabContainer() {
  const { tabs, closeTab, toggleTab, groupByType, ungroupTab, ungroupAll, clearFlashingTab, minimizeAll, isTabNavOpen } = useTabs();
  const { openTab } = useTabActions();
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const { entities } = useEntities();
  const { isDM } = useAuth();
  const lastPushedRefs = useRef<Record<string, number>>({});

  // Listen for pushed entities
  useEffect(() => {
    if (isDM) return; // DMs don't receive pushes

    const now = Date.now();
    entities.forEach(entity => {
      if (entity.lastPushedAt) {
        const prevPushedAt = lastPushedRefs.current[entity.id] || 0;
        
        // If it was pushed recently (within last 10 seconds) and we haven't seen this push yet
        if (entity.lastPushedAt > prevPushedAt && (now - entity.lastPushedAt) < 10000) {
          openTab(entity.id, entity.name, entity.type, { background: true, flash: true });
        }
        
        lastPushedRefs.current[entity.id] = entity.lastPushedAt;
      }
    });
  }, [entities, isDM, openTab]);

  const isGrouped = useMemo(() => tabs.some(t => !!t.groupId), [tabs]);

  const groups = useMemo(() => {
    const result: { id: string; tabs: { tab: TabData; originalIndex: number }[]; isGroup: boolean; type?: string }[] = [];
    const processedIds = new Set<string>();

    tabs.forEach((tab, index) => {
      if (processedIds.has(tab.id)) return;

      if (tab.groupId) {
        const groupTabs = tabs.map((t, i) => ({ tab: t, originalIndex: i })).filter(item => item.tab.groupId === tab.groupId);
        result.push({ 
          id: tab.groupId, 
          tabs: groupTabs, 
          isGroup: true,
          type: tab.groupId === tab.type ? tab.type : 'custom'
        });
        groupTabs.forEach(item => processedIds.add(item.tab.id));
      } else {
        result.push({ id: tab.id, tabs: [{ tab, originalIndex: index }], isGroup: false });
        processedIds.add(tab.id);
      }
    });

    return result;
  }, [tabs]);

  const handleToggleGrouping = useCallback(() => {
    if (isGrouped) ungroupAll();
    else groupByType();
  }, [isGrouped, ungroupAll, groupByType]);

  const handleNavigate = useCallback((id: string) => {
    closeTab(id);
    navigate(`/entity/${id}`);
  }, [closeTab, navigate]);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  if (tabs.length === 0) return null;

  return (
    <div className="absolute top-16 bottom-0 left-0 right-0 z-40 pointer-events-none flex flex-row items-start justify-end overflow-hidden">
      {/* Tab Windows (Open Tabs) - Isolated from drag state */}
      <TabWindows 
        tabs={tabs} 
        closeTab={closeTab} 
        toggleTab={toggleTab} 
        onNavigate={handleNavigate} 
        clearFlashingTab={clearFlashingTab}
      />

      {/* Tab Bar (Minimized/Docked Tabs) */}
      <div 
        className={clsx(
          "pointer-events-auto flex flex-col items-end gap-1 overflow-y-auto custom-scrollbar pl-2 py-2 w-36 sm:w-48 bg-stone-900/95 backdrop-blur-md border-l border-stone-800 h-full scroll-smooth transition-transform duration-300 ease-in-out shrink-0 shadow-2xl",
          !isTabNavOpen && "translate-x-full absolute right-0"
        )}
      >
        {/* Action Buttons */}
        <div className="flex flex-row gap-2 mb-2 w-full shrink-0 justify-end">
          <button
            onClick={minimizeAll}
            className="p-2 rounded-l-lg border-y border-l transition-all flex-1 flex justify-center bg-stone-800 text-stone-400 border-stone-700 hover:bg-stone-700 hover:text-amber-400"
            title="Minimize all tabs"
          >
            <Minimize2 size={18} />
          </button>
          <button
            onClick={handleToggleGrouping}
            className={clsx(
              "p-2 rounded-l-lg border-y border-l transition-all flex-1 flex justify-center",
              isGrouped 
                ? "bg-amber-500 text-stone-950 border-amber-400 hover:bg-amber-400" 
                : "bg-stone-800 text-stone-400 border-stone-700 hover:bg-stone-700 hover:text-amber-400"
            )}
            title={isGrouped ? "Ungroup all tabs" : "Group all tabs by type"}
          >
            <Layers size={18} />
          </button>
        </div>

        <div className="w-full h-px bg-stone-800 my-1 shrink-0" />

        {groups.map((group) => (
          <div key={group.id} className="flex flex-col items-end w-full">
            {group.isGroup ? (
              <div className="flex flex-col items-end w-full">
                {/* Group Header/Folder */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGroup(group.id);
                  }}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-l-md border-y border-l cursor-pointer transition-all w-full shrink-0 group select-none relative mt-1",
                    "bg-stone-800 border-stone-700 hover:bg-stone-700 text-stone-300"
                  )}
                >
                  <div className="relative shrink-0">
                    {expandedGroups.has(group.id) ? <FolderOpen size={16} className="text-amber-500" /> : <Folder size={16} className="text-amber-500" />}
                  </div>
                  <span className="truncate flex-1 text-sm font-bold uppercase tracking-tight text-left">
                    {group.type === 'custom' ? 'Group' : group.type}
                  </span>
                  {expandedGroups.has(group.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>

                {/* Expanded Group Items */}
                {expandedGroups.has(group.id) && (
                  <div className="flex flex-col gap-1 mt-1 w-full pl-2 animate-in slide-in-from-right-2 duration-200">
                    {group.tabs.map((item) => (
                      <div
                        key={`tab-item-${item.tab.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTab(item.tab.id);
                          if (item.tab.isFlashing) clearFlashingTab(item.tab.id);
                        }}
                        className={clsx(
                          "flex items-center gap-2 px-2 py-1.5 rounded-l-md border-y border-l cursor-pointer transition-all text-xs font-medium w-full",
                          item.tab.isFlashing && "animate-pulse ring-2 ring-amber-500",
                          item.tab.isMinimized 
                            ? "bg-stone-900 border-stone-800 hover:bg-stone-800 text-stone-400" 
                            : "bg-stone-700 border-stone-500 text-amber-400"
                        )}
                      >
                        <span className="truncate flex-1 text-left">{item.tab.title}</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTab(item.tab.id);
                          }}
                          className="p-0.5 text-stone-500 hover:text-red-400 rounded transition-all shrink-0"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Single Tab */
              <div
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-l-md border-y border-l cursor-pointer transition-all w-full shrink-0 group select-none mt-1",
                  group.tabs[0].tab.isFlashing && "animate-pulse ring-2 ring-amber-500",
                  group.tabs[0].tab.isMinimized 
                    ? "bg-stone-800 border-stone-700 hover:bg-stone-700 text-stone-300" 
                    : "bg-stone-700 border-stone-500 text-amber-400"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTab(group.tabs[0].tab.id);
                  if (group.tabs[0].tab.isFlashing) clearFlashingTab(group.tabs[0].tab.id);
                }}
              >
                <span className="truncate flex-1 text-sm font-medium text-left">{group.tabs[0].tab.title}</span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(group.tabs[0].tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-stone-400 hover:text-red-400 hover:bg-stone-600 rounded transition-all shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
