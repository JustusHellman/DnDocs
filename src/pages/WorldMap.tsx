import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { useEntities } from '../hooks/useEntities';
import { usePermissions } from '../hooks/usePermissions';
import { Entity, MapPin as MapPinType } from '../types';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Map as MapIcon, Globe, Castle, MapPin, Building, Users, Flag, Package, FileText, Scroll, Skull, ArrowLeft, ExternalLink, Plus, Trash2, Save, Maximize, Minimize, Eye, EyeOff } from 'lucide-react';
import { useTabActions } from '../contexts/TabContext';
import { useMedia } from '../hooks/useMedia';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import clsx from 'clsx';
import { ENTITY_HIERARCHY } from '../utils/entitySchemas';

import { polyfill } from "mobile-drag-drop";
import { scrollBehaviourDragImageTranslateOverride } from "mobile-drag-drop/scroll-behaviour";
import "mobile-drag-drop/default.css";

const ENTITY_ICONS: Record<string, React.ElementType> = {
  geography: Globe,
  country: Globe,
  settlement: Castle,
  landmark: MapPin,
  shop: Building,
  npc: Users,
  monster: Skull,
  faction: Flag,
  item: Package,
  note: FileText,
  quest: Scroll,
};

export default function WorldMap() {
  const { user, isDM } = useAuth();
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { entities, loading: entitiesLoading } = useEntities();
  const { canViewEntity } = usePermissions();
  const { openTab } = useTabActions();
  const [currentParentId, setCurrentParentId] = useState<string | null>(id || null);
  const [isEditingPins, setIsEditingPins] = useState(false);
  const [playerPreview, setPlayerPreview] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draggedPinIndex, setDraggedPinIndex] = useState<number | null>(null);
  const [draggedEntityId, setDraggedEntityId] = useState<string | null>(null);
  const [selectedPinIndex, setSelectedPinIndex] = useState<number | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const breadcrumbsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id !== undefined) {
      setCurrentParentId(id || null);
      // Scroll to top of map container when navigating
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [id]);

  useEffect(() => {
    if (breadcrumbsRef.current) {
      breadcrumbsRef.current.scrollTo({ left: breadcrumbsRef.current.scrollWidth, behavior: 'smooth' });
    }
  }, [currentParentId]);

  const navigateToMap = useCallback((parentId: string | null) => {
    if (parentId) {
      navigate(`/map/${parentId}`);
    } else {
      navigate('/map');
    }
  }, [navigate]);

  const entityMap = useMemo(() => {
    const map = new Map<string, Entity>();
    entities.forEach(e => map.set(e.id, e));
    return map;
  }, [entities]);

  const currentEntity = currentParentId ? entityMap.get(currentParentId) : null;
  const { media: mapMedia, loading: mediaLoading } = useMedia(currentEntity?.mapConfig?.mediaId);

  const breadcrumbs = useMemo(() => {
    const crumbs: Entity[] = [];
    let current = currentParentId ? entityMap.get(currentParentId) : null;
    while (current) {
      crumbs.unshift(current);
      current = current.locationId ? entityMap.get(current.locationId) : null;
    }
    return crumbs;
  }, [currentParentId, entityMap]);

  const currentChildren = useMemo(() => {
    return entities.filter(e => {
      // First, can the user see this entity?
      if (!canViewEntity(e)) return false;

      // Apply player preview filter if active
      if (isDM && playerPreview) {
        const isVisibleToPlayers = e.isPublic || (e.allowedPlayers && e.allowedPlayers.length > 0);
        if (!isVisibleToPlayers) return false;
      }

      if (currentParentId === null) {
        // Top-level logic for the user:
        // 1. No locationId
        // 2. OR locationId points to an entity the user CANNOT see
        const parent = e.locationId ? entityMap.get(e.locationId) : null;
        return !e.locationId || !parent || !canViewEntity(parent);
      }
      
      // If we are inside a location, only show direct children
      return e.locationId === currentParentId;
    }).sort((a, b) => {
      const typeOrder = ['geography', 'country', 'settlement', 'landmark', 'faction', 'shop', 'npc', 'monster', 'item', 'quest', 'note'];
      const typeDiff = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
      if (typeDiff !== 0) return typeDiff;
      return a.name.localeCompare(b.name);
    });
  }, [entities, currentParentId, entityMap, canViewEntity]);

  // Auto-navigate to the single top-level location if it has a map
  useEffect(() => {
    if (!entitiesLoading && currentParentId === null && currentChildren.length === 1) {
      const singleTop = currentChildren[0];
      if (singleTop.mapConfig?.mediaId) {
        navigateToMap(singleTop.id);
      }
    }
  }, [entitiesLoading, currentParentId, currentChildren, navigateToMap]);

  useEffect(() => {
    polyfill({
      dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
      holdToDrag: 300, // 300ms long press to drag
    });

    const preventScroll = (e: TouchEvent) => {
      // Prevent scrolling while dragging
      if (document.body.classList.contains('dnd-poly-active')) {
        e.preventDefault();
      }
    };
    window.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      window.removeEventListener('touchmove', preventScroll);
    };
  }, []);

  useEffect(() => {
    if (!isEditingPins) {
      setSelectedPinIndex(null);
      setDraggedPinIndex(null);
      setDraggedEntityId(null);
    }
  }, [isEditingPins]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      mapRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const handleDropOnMap = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!isEditingPins || !mapRef.current || !currentEntity) return;

    const rect = mapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (draggedPinIndex !== null) {
      // Move existing pin
      const updatedPins = [...(currentEntity.mapConfig?.pins || [])];
      updatedPins[draggedPinIndex] = { ...updatedPins[draggedPinIndex], x, y };
      
      try {
        await updateDoc(doc(db, 'entities', currentEntity.id), {
          'mapConfig.pins': updatedPins
        });
      } catch (err) {
        console.error('Error moving pin:', err);
      }
      setDraggedPinIndex(null);
    } else if (draggedEntityId !== null) {
      // Add new pin
      const newPinData: MapPinType = {
        targetEntityId: draggedEntityId,
        x,
        y
      };

      const updatedPins = [...(currentEntity.mapConfig?.pins || []), newPinData];
      
      try {
        await updateDoc(doc(db, 'entities', currentEntity.id), {
          'mapConfig.pins': updatedPins
        });

        // Update locationId if needed
        const targetEntity = entityMap.get(draggedEntityId);
        if (targetEntity && !targetEntity.locationId) {
          await updateDoc(doc(db, 'entities', draggedEntityId), {
            locationId: currentEntity.id
          });
        }
      } catch (err) {
        console.error('Error adding pin from drag:', err);
      }
      setDraggedEntityId(null);
    }
  };

  const handleDropOffMap = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!isEditingPins || !currentEntity || draggedPinIndex === null) return;

    const updatedPins = currentEntity.mapConfig?.pins.filter((_, i) => i !== draggedPinIndex) || [];
    
    try {
      await updateDoc(doc(db, 'entities', currentEntity.id), {
        'mapConfig.pins': updatedPins
      });
    } catch (err) {
      console.error('Error removing pin via drag:', err);
    }
    setDraggedPinIndex(null);
  };

  const handleDeletePin = async (index: number) => {
    if (!currentEntity || !currentEntity.mapConfig) return;

    const updatedPins = currentEntity.mapConfig.pins.filter((_, i) => i !== index);
    
    try {
      await updateDoc(doc(db, 'entities', currentEntity.id), {
        'mapConfig.pins': updatedPins
      });
    } catch (err) {
      console.error('Error deleting pin:', err);
    }
  };

  const handlePinClick = (pin: MapPinType) => {
    const target = entityMap.get(pin.targetEntityId);
    if (!target) return;

    navigateToMap(target.id);
  };

  const unmappedEntities = useMemo(() => {
    if (!currentEntity || !isEditingPins) return [];
    
    const existingPinTargetIds = new Set(currentEntity.mapConfig?.pins.map(p => p.targetEntityId) || []);
    const currentLevel = ENTITY_HIERARCHY[currentEntity.type] || 0;

    return entities
      .filter(e => {
        const eLevel = ENTITY_HIERARCHY[e.type] || 0;
        const isLowerHierarchy = eLevel < currentLevel;
        const isAlreadyPinned = existingPinTargetIds.has(e.id);
        
        const isEligible = (e.locationId === currentEntity.id) || (!e.locationId && isLowerHierarchy);
        
        return isEligible && !isAlreadyPinned && canViewEntity(e);
      })
      .sort((a, b) => {
        const aLocatedHere = a.locationId === currentEntity.id;
        const bLocatedHere = b.locationId === currentEntity.id;
        if (aLocatedHere && !bLocatedHere) return -1;
        if (!aLocatedHere && bLocatedHere) return 1;

        const levelA = ENTITY_HIERARCHY[a.type] || 0;
        const levelB = ENTITY_HIERARCHY[b.type] || 0;
        if (levelA !== levelB) return levelB - levelA;
        return a.name.localeCompare(b.name);
      });
  }, [entities, currentEntity, isEditingPins, canViewEntity]);

  const CurrentIcon = currentEntity ? (ENTITY_ICONS[currentEntity.type] || MapPin) : Globe;

  if (entitiesLoading) {
    return <div className="flex items-center justify-center h-64 text-stone-400">Loading World Map...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-10 pb-20">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MapIcon className="text-amber-500" size={32} />
          <div>
            <h1 className="text-3xl font-bold text-stone-100 font-cinzel tracking-wider">World Map</h1>
            <p className="text-stone-400 mt-1">Explore your campaign world.</p>
          </div>
        </div>
        {isDM && currentEntity && currentEntity.mapConfig?.mediaId && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPlayerPreview(!playerPreview)}
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all font-medium text-xs border",
                playerPreview 
                  ? "bg-emerald-900/30 text-emerald-400 border-emerald-900/50" 
                  : "bg-stone-800 text-stone-400 border-stone-700 hover:bg-stone-700 hover:text-stone-300"
              )}
              title={playerPreview ? "Disable Player Preview" : "Enable Player Preview"}
            >
              {playerPreview ? <Eye size={14} /> : <EyeOff size={14} />}
              {playerPreview ? 'Player View' : 'DM View'}
            </button>
            <button
              onClick={() => setIsEditingPins(!isEditingPins)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-bold text-sm",
                isEditingPins 
                  ? "bg-amber-500 text-stone-950 shadow-lg shadow-amber-900/40" 
                  : "bg-stone-800 text-stone-300 hover:bg-stone-700"
              )}
            >
              {isEditingPins ? <Save size={16} /> : <Plus size={16} />}
              {isEditingPins ? 'Finish Editing' : 'Edit Pins'}
            </button>
          </div>
        )}
      </div>

      {/* Breadcrumbs */}
      <div 
        ref={breadcrumbsRef}
        className="flex items-center flex-nowrap gap-2 mb-6 bg-stone-900/80 backdrop-blur-md p-4 rounded-xl border border-stone-800 shadow-sm overflow-x-auto scrollbar-hide"
      >
        <button 
          onClick={() => navigateToMap(null)}
          className={`flex items-center gap-1.5 font-medium transition-colors shrink-0 ${currentParentId === null ? 'text-amber-500' : 'text-stone-400 hover:text-stone-200'}`}
        >
          <Globe size={16} />
          World
        </button>
        
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const CrumbIcon = ENTITY_ICONS[crumb.type] || MapPin;
          return (
            <div key={crumb.id} className="flex items-center gap-2 shrink-0">
              <ChevronRight size={16} className="text-stone-600 shrink-0" />
              <button
                onClick={() => navigateToMap(crumb.id)}
                className={`flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap ${isLast ? 'text-amber-500' : 'text-stone-400 hover:text-stone-200'}`}
              >
                <CrumbIcon size={16} />
                <span className="truncate max-w-[150px] sm:max-w-[200px]">{crumb.name}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Visual Map View */}
      {currentEntity?.mapConfig?.mediaId ? (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-900/20 border border-amber-700/30 flex items-center justify-center text-amber-500 shrink-0">
                <CurrentIcon size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-stone-100 font-cinzel">{currentEntity.name}</h2>
                <p className="text-xs text-stone-400 capitalize">{currentEntity.type}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentEntity.locationId && (
                <button
                  onClick={() => navigateToMap(currentEntity.locationId || null)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition-colors font-medium text-xs"
                >
                  <ArrowLeft size={14} />
                  Go Up
                </button>
              )}
              <button
                onClick={() => openTab(currentEntity.id, currentEntity.name, currentEntity.type)}
                className="flex items-center gap-2 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition-colors font-medium text-xs"
              >
                <ExternalLink size={14} />
                Details
              </button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
              <div 
                ref={mapRef}
                className={clsx(
                  "relative w-full rounded-2xl border border-stone-800 bg-stone-900 shadow-2xl overflow-hidden group/map",
                  isEditingPins ? "ring-2 ring-amber-500/50" : "",
                  isFullscreen ? "h-screen rounded-none border-none" : ""
                )}
                onDragOver={(e) => {
                  if (isEditingPins) e.preventDefault();
                }}
                onDrop={handleDropOnMap}
                onClick={() => {
                  if (isEditingPins) {
                    setSelectedPinIndex(null);
                  }
                }}
              >
                {/* Fullscreen Toggle Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFullscreen();
                  }}
                  className={clsx(
                    "absolute top-4 right-4 z-50 p-2 bg-stone-900/80 backdrop-blur-md border border-stone-700 rounded-lg text-stone-300 hover:text-amber-400 hover:border-amber-500/50 transition-all opacity-0 group-hover/map:opacity-100 focus:opacity-100",
                    isFullscreen && "opacity-100"
                  )}
                  title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                  {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                </button>

                {/* Fullscreen Go Up Button */}
                {isFullscreen && currentParentId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateToMap(currentEntity?.locationId || null);
                    }}
                    className="absolute top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-stone-900/80 backdrop-blur-md border border-stone-700 rounded-lg text-stone-300 hover:text-amber-400 hover:border-amber-500/50 transition-all"
                  >
                    <ArrowLeft size={16} />
                    <span className="font-medium text-sm">Go Up</span>
                  </button>
                )}

                {mediaLoading ? (
                  <div className="flex items-center justify-center h-[600px] text-stone-500">Loading Map Image...</div>
                ) : mapMedia ? (
                  <>
                    <img 
                      src={mapMedia.data} 
                      alt={currentEntity.name} 
                      className="w-full h-auto block select-none rounded-2xl"
                      draggable={false}
                    />
                    
                    {/* Existing Pins */}
                    {currentEntity.mapConfig.pins.map((pin, index) => {
                      const target = entityMap.get(pin.targetEntityId);
                      if (!target) return null;
                      
                      // Check visibility
                      let isVisible = canViewEntity(target);
                      if (isDM && playerPreview) {
                        isVisible = target.isPublic || (target.allowedPlayers && target.allowedPlayers.length > 0);
                      }
                      
                      if (!isVisible) return null;

                      const PinIcon = (ENTITY_ICONS[target.type] || MapPin);
                      const isSelected = isEditingPins && selectedPinIndex === index;
                      
                      return (
                        <div
                          key={`pin-${index}`}
                          style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                          className={clsx(
                            "absolute -translate-x-1/2 -translate-y-1/2 group flex flex-col items-center",
                            isEditingPins ? "z-30 cursor-grab active:cursor-grabbing" : "z-10",
                            isFullscreen ? "scale-150" : ""
                          )}
                          draggable={isEditingPins}
                          onDragStart={(e) => {
                            if (!isEditingPins) return;
                            // For Firefox
                            e.dataTransfer.setData('text/plain', '');
                            setDraggedPinIndex(index);
                          }}
                          onDragEnd={() => setDraggedPinIndex(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isEditingPins) {
                              setSelectedPinIndex(isSelected ? null : index);
                            } else {
                              handlePinClick(pin);
                            }
                          }}
                        >
                          {/* Name label - always show in edit mode, or on hover in view mode */}
                          <div className={clsx(
                            "mb-1 px-2 py-0.5 bg-stone-950/60 backdrop-blur-[2px] rounded text-[10px] font-bold text-stone-100 whitespace-nowrap pointer-events-none shadow-sm transition-opacity",
                            isEditingPins ? "opacity-100" : "opacity-60 group-hover:opacity-100"
                          )}>
                            {target.name}
                          </div>

                          <div className="relative">
                            <div
                              className={clsx(
                                "w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-lg border-2",
                                isEditingPins 
                                  ? (isSelected ? "bg-amber-400 border-amber-300 text-stone-950 scale-110" : "bg-stone-800 border-stone-600 text-stone-300 hover:bg-stone-700")
                                  : "bg-amber-500 border-amber-400 text-stone-950 hover:scale-125 hover:z-20"
                              )}
                            >
                              <PinIcon size={16} />
                            </div>

                            {/* Delete button (only visible when selected in edit mode) */}
                            {isSelected && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePin(index);
                                  setSelectedPinIndex(null);
                                }}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-400 text-white rounded-full flex items-center justify-center shadow-md border border-red-700 transition-transform hover:scale-110 z-40"
                                title="Remove Pin"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-[400px] text-stone-600 italic">No map image found.</div>
                )}
              </div>
            </div>

            {/* Unmapped Entities Sidebar (Edit Mode Only) */}
            {isEditingPins && (
              <div 
                className="w-full lg:w-80 flex flex-col bg-stone-900/80 border border-stone-800 rounded-2xl p-4 shadow-xl"
                onDragOver={(e) => {
                  e.preventDefault(); // Allow dropping here to remove pin
                }}
                onDrop={handleDropOffMap}
              >
                <h3 className="text-sm font-bold text-stone-300 font-cinzel mb-2 uppercase tracking-wider flex items-center justify-between">
                  <span>Available Locations</span>
                  <span className="bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full text-xs">{unmappedEntities.length}</span>
                </h3>
                <p className="text-xs text-stone-500 mb-4">
                  Long-press and drag items onto the map to pin them. Drag pins here to remove them.
                </p>
                
                <div className="flex-1 overflow-y-auto pr-2 space-y-2 max-h-[600px] scrollbar-thin scrollbar-thumb-stone-700 scrollbar-track-transparent">
                  {unmappedEntities.length === 0 ? (
                    <div className="text-center py-8 text-stone-600 text-sm italic border border-dashed border-stone-700 rounded-xl">
                      No available locations to pin.
                    </div>
                  ) : (
                    unmappedEntities.map(entity => {
                      const EntityIcon = ENTITY_ICONS[entity.type] || MapPin;
                      const isLocatedHere = entity.locationId === currentEntity.id;
                      
                      return (
                        <div
                          key={entity.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', '');
                            setDraggedEntityId(entity.id);
                          }}
                          onDragEnd={() => setDraggedEntityId(null)}
                          className="flex items-center gap-3 p-3 bg-stone-800 border border-stone-700 hover:border-amber-600/50 rounded-xl cursor-grab active:cursor-grabbing transition-colors group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-stone-900 flex items-center justify-center text-stone-400 group-hover:text-amber-500 shrink-0">
                            <EntityIcon size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-stone-200 truncate">{entity.name}</div>
                            <div className="text-[10px] text-stone-500 uppercase tracking-wider flex items-center gap-1">
                              {entity.type}
                              {isLocatedHere && <span className="text-amber-600/80">• Located Here</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Standard List/Grid View */
        <>
          {currentEntity && (
            <div className="mb-8 p-6 bg-stone-900/60 border border-stone-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-900/20 border border-amber-700/30 flex items-center justify-center text-amber-500 shrink-0">
                  <CurrentIcon size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-stone-100 font-cinzel">{currentEntity.name}</h2>
                  <p className="text-stone-400 capitalize">{currentEntity.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {currentEntity.locationId && (
                  <button
                    onClick={() => navigateToMap(currentEntity.locationId || null)}
                    className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition-colors font-medium text-sm"
                  >
                    <ArrowLeft size={16} />
                    Go Up
                  </button>
                )}
                <button
                  onClick={() => openTab(currentEntity.id, currentEntity.name, currentEntity.type)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-lg transition-colors font-bold text-sm shadow-lg shadow-amber-900/20"
                >
                  <ExternalLink size={16} />
                  Open Tab
                </button>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-lg font-semibold text-stone-300 mb-4 font-cinzel flex items-center gap-2">
              {currentParentId === null ? 'Top-Level Locations' : 'Inside this location'}
              <span className="text-sm font-sans text-stone-500 bg-stone-800 px-2 py-0.5 rounded-full">{currentChildren.length}</span>
            </h3>
            
            {currentChildren.length === 0 ? (
              <div className="text-center py-16 bg-stone-900/40 border border-stone-800/50 rounded-2xl border-dashed">
                <MapPin size={48} className="mx-auto mb-4 text-stone-700" />
                <p className="text-stone-400 text-lg">Nothing is located here yet.</p>
                {isDM && (
                  <Link to={`/entity/new?locationId=${currentParentId || ''}`} className="inline-block mt-4 text-amber-500 hover:text-amber-400 font-medium">
                    + Create something here
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {currentChildren.map(child => {
                  const ChildIcon = ENTITY_ICONS[child.type] || MapPin;
                  return (
                    <button
                      key={child.id}
                      onClick={() => {
                        if (child.mapConfig?.mediaId) {
                          navigateToMap(child.id);
                        } else {
                          // If it's a leaf node or has no map, maybe we still want to go "into" it in the list view?
                          // For now, let's just go into it.
                          navigateToMap(child.id);
                        }
                      }}
                      className="flex flex-col text-left p-4 bg-stone-900 border border-stone-800 hover:border-amber-700/50 hover:bg-stone-800/80 rounded-xl transition-all group shadow-sm"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-lg bg-stone-800 group-hover:bg-amber-900/20 flex items-center justify-center text-stone-400 group-hover:text-amber-500 transition-colors">
                          <ChildIcon size={20} />
                        </div>
                        <span className="text-xs font-medium text-stone-500 uppercase tracking-wider bg-stone-950 px-2 py-1 rounded-md">
                          {child.type}
                        </span>
                      </div>
                      <h4 className="font-bold text-stone-200 group-hover:text-amber-400 transition-colors truncate w-full text-lg mb-1">
                        {child.name}
                      </h4>
                      <p className="text-sm text-stone-500 line-clamp-2">
                        {child.content ? child.content.replace(/[#*`_]/g, '').substring(0, 80) + '...' : 'No description available.'}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
