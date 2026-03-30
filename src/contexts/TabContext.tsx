import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';

export interface TabData {
  id: string;
  title: string;
  type: string;
  isMinimized: boolean;
  groupId?: string;
  isFlashing?: boolean;
}

interface TabStateContextType {
  tabs: TabData[];
  isTabNavOpen: boolean;
}

interface TabActionsContextType {
  openTab: (id: string, title: string, type: string, options?: { background?: boolean; flash?: boolean }) => void;
  closeTab: (id: string) => void;
  toggleTab: (id: string) => void;
  reorderTabs: (startIndex: number, endIndex: number) => void;
  groupByType: () => void;
  ungroupTab: (tabId: string) => void;
  ungroupAll: () => void;
  clearFlashingTab: (id: string) => void;
  minimizeAll: () => void;
  setIsTabNavOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
}

const TabStateContext = createContext<TabStateContextType | undefined>(undefined);
const TabActionsContext = createContext<TabActionsContextType | undefined>(undefined);

export function TabProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [isTabNavOpen, setIsTabNavOpen] = useState(true);

  const openTab = useCallback((id: string, title: string, type: string, options?: { background?: boolean; flash?: boolean }) => {
    setTabs(prev => {
      const existingIndex = prev.findIndex(t => t.id === id);
      if (existingIndex !== -1) {
        const t = prev[existingIndex];
        const newIsMinimized = options?.background ? t.isMinimized : false;
        
        if (!newIsMinimized && t.isMinimized) {
          // It's being unminimized, move to end so it appears on the left
          const newTabs = [...prev];
          newTabs.splice(existingIndex, 1);
          newTabs.push({
            ...t,
            isMinimized: false,
            isFlashing: options?.flash ? true : t.isFlashing
          });
          return newTabs;
        } else {
          return prev.map(tab => tab.id === id ? { 
            ...tab, 
            isMinimized: newIsMinimized,
            isFlashing: options?.flash ? true : tab.isFlashing
          } : tab);
        }
      }
      
      // Check if grouping is currently active (if any existing tab has a groupId)
      const isGroupingActive = prev.some(t => !!t.groupId);
      const newTab: TabData = { 
        id, 
        title, 
        type, 
        isMinimized: options?.background ? true : false,
        groupId: isGroupingActive ? type : undefined,
        isFlashing: options?.flash ? true : false
      };
      
      return [...prev, newTab];
    });
  }, []);

  const clearFlashingTab = useCallback((id: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, isFlashing: false } : t));
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => prev.filter(t => t.id !== id));
  }, []);

  const toggleTab = useCallback((id: string) => {
    setTabs(prev => {
      const tabIndex = prev.findIndex(t => t.id === id);
      if (tabIndex === -1) return prev;
      
      const tab = prev[tabIndex];
      const newIsMinimized = !tab.isMinimized;
      
      if (!newIsMinimized) {
        // If we are opening (unminimizing) the tab, move it to the end of the array
        // so it appears on the left (due to flex-row-reverse)
        const newTabs = [...prev];
        newTabs.splice(tabIndex, 1);
        newTabs.push({ ...tab, isMinimized: false });
        return newTabs;
      } else {
        // Just minimize it, keep it in place
        return prev.map(t => t.id === id ? { ...t, isMinimized: true } : t);
      }
    });
  }, []);

  const reorderTabs = useCallback((startIndex: number, endIndex: number) => {
    setTabs(prev => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  }, []);

  const groupByType = useCallback(() => {
    setTabs(prev => {
      return prev.map(tab => ({
        ...tab,
        groupId: tab.type
      }));
    });
  }, []);

  const ungroupTab = useCallback((tabId: string) => {
    setTabs(prev => prev.map(tab => {
      if (tab.id === tabId) {
        const { groupId, ...rest } = tab;
        return rest;
      }
      return tab;
    }));
  }, []);

  const ungroupAll = useCallback(() => {
    setTabs(prev => prev.map(tab => {
      const { groupId, ...rest } = tab;
      return rest;
    }));
  }, []);

  const minimizeAll = useCallback(() => {
    setTabs(prev => prev.map(tab => ({ ...tab, isMinimized: true })));
  }, []);

  const actions = useMemo(() => ({ 
    openTab, 
    closeTab, 
    toggleTab, 
    reorderTabs, 
    groupByType, 
    ungroupTab,
    ungroupAll,
    clearFlashingTab,
    minimizeAll,
    setIsTabNavOpen
  }), [openTab, closeTab, toggleTab, reorderTabs, groupByType, ungroupTab, ungroupAll, clearFlashingTab, minimizeAll, setIsTabNavOpen]);

  return (
    <TabStateContext.Provider value={{ tabs, isTabNavOpen }}>
      <TabActionsContext.Provider value={actions}>
        {children}
      </TabActionsContext.Provider>
    </TabStateContext.Provider>
  );
}

export function useTabs() {
  const state = useContext(TabStateContext);
  const actions = useContext(TabActionsContext);
  if (state === undefined || actions === undefined) {
    throw new Error('useTabs must be used within a TabProvider');
  }
  return { ...state, ...actions };
}

export function useTabActions() {
  const actions = useContext(TabActionsContext);
  if (actions === undefined) {
    throw new Error('useTabActions must be used within a TabProvider');
  }
  return actions;
}
