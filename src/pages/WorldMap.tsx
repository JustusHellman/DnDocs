import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowUp, BoxSelect, ChevronDown, ChevronRight, Edit3, Eye, Globe, Hammer, Info, Loader2, Map as MapIcon, MapPin, MapPinOff, Plus, Swords, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { GiTreasureMap } from 'react-icons/gi';
import { useAuth } from '../contexts/AuthContext';
import { useAncestors, useCampaignData } from '../contexts/CampaignDataContext';
import { usePeek } from '../contexts/PeekContext';
import { useToast } from '../contexts/ToastContext';
import { useImageSrc } from '../hooks/useImageSrc';
import { PLACE_TYPES, TYPES_BY_SIZE, typeMeta } from '../lib/entityTypes';
import { quickCreateEntity, setEntityLocation, updateMapPins } from '../lib/entityService';
import { visibleToAnyPlayer } from '../lib/permissions';
import { excerpt } from '../lib/text';
import type { Entity, MapPin as Pin } from '../types';
import MapViewer, { type ViewerPin } from '../components/map/MapViewer';
import { EmptyState, Page, PlayerPreviewBanner, Spinner, TypeBadge, TypeIcon, TypeTile } from '../components/ui/bits';
import { Modal } from '../components/ui/Modal';
import { MenuItem, Popover } from '../components/ui/Popover';
import { applyMapToBattle, cropMapArea, type MapArea } from '../lib/battle/forge';
import { useActiveBattles } from '../contexts/ActiveScenesContext';

const TOP_LEVEL_TYPES = [...PLACE_TYPES, 'faction'];
/** `armed` while "Battle here" waits for a tap on the map (BATTLE) or a box drawn on it (AREA). */
const BATTLE = '\u0000battle';
const AREA = '\u0000area';

function PinMarker({ entity, selected, editing }: { entity: Entity; selected?: boolean; editing?: boolean }) {
  const Icon = typeMeta(entity.type).icon;
  return (
    <div className="group flex flex-col items-center">
      <div
        className={clsx(
          'mb-1 max-w-40 truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap shadow transition-opacity',
          selected ? 'bg-amber-500 text-stone-950' : 'bg-stone-900/90 text-stone-100 ring-1 ring-stone-700',
          editing || selected ? 'opacity-100' : 'opacity-80 group-hover:opacity-100',
        )}
      >
        {entity.name}
      </div>
      <div
        className={clsx(
          'flex size-9 items-center justify-center rounded-full border-2 transition-transform',
          selected ? 'wax-pin scale-110 border-[#f3d27a]' : editing ? 'border-stone-500 bg-stone-900 text-stone-300' : 'wax-pin border-[#e8c77a]/70 group-hover:scale-110',
        )}
      >
        <Icon size={17} />
      </div>
      <div className={clsx('-mt-0.5 size-2 rotate-45', editing && !selected ? 'bg-stone-500' : 'bg-[#6b1a10]')} />
    </div>
  );
}

export default function WorldMap() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { isDM, user, currentCampaign } = useAuth();
  const { entityMap, entities, childrenOf, canView, canViewField, loading } = useCampaignData();
  const { peek } = usePeek();
  const toast = useToast();
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const battles = useActiveBattles();
  // "Battle here": where the DM tapped (or the box they drew), and the new place's name.
  const [fight, setFight] = useState<{ x: number; y: number; name: string; area?: MapArea; cols: number; preview?: string; aspect?: number } | null>(null);
  const [fightBusy, setFightBusy] = useState(false);
  const [battleMenu, setBattleMenu] = useState(false);
  const battleAnchor = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<MapArea | null>(null);
  const boxStart = useRef<{ x: number; y: number } | null>(null);
  const toPercent = useRef<((cx: number, cy: number) => { x: number; y: number }) | null>(null);

  const current = id ? entityMap.get(id) : undefined;
  const ancestors = useAncestors(current);
  const seesAsPlayer = (e: Entity) => canView(e) && (!(isDM && preview) || visibleToAnyPlayer(e));
  const mapId = current?.mapConfig?.mediaId;
  const { src: mapSrc, loading: mapLoading } = useImageSrc(mapId ? `media:${mapId}` : null);

  useEffect(() => {
    setEditing(false);
    setArmed(null);
    setSelected(null);
  }, [id]);

  const children = useMemo(() => {
    const list = id
      ? (childrenOf.get(id) ?? []).filter((e) => e.type !== 'note')
      : entities.filter((e) => {
          if (!TOP_LEVEL_TYPES.includes(e.type)) return false;
          const parent = e.locationId ? entityMap.get(e.locationId) : undefined;
          return !parent || !seesAsPlayer(parent);
        });
    return list.filter(seesAsPlayer).sort((a, b) => TYPES_BY_SIZE.indexOf(a.type) - TYPES_BY_SIZE.indexOf(b.type) || a.name.localeCompare(b.name));
  }, [id, childrenOf, entities, entityMap, preview, canView]); // eslint-disable-line react-hooks/exhaustive-deps

  // A world with a single top-level map opens straight into it.
  useEffect(() => {
    if (!loading && !id && children.length === 1 && children[0].mapConfig?.mediaId) navigate(`/map/${children[0].id}`, { replace: true });
  }, [loading, id, children, navigate]);

  const pins: Pin[] = current?.mapConfig?.pins ?? [];
  const pinnedIds = new Set(pins.map((p) => p.targetEntityId));

  const candidates = useMemo(() => {
    if (!current || !editing) return [];
    const level = typeMeta(current.type).level;
    return entities
      .filter((e) => e.id !== current.id && !pinnedIds.has(e.id) && canView(e))
      .filter((e) => e.locationId === current.id || (!e.locationId && typeMeta(e.type).level < level && e.type !== 'note'))
      .sort((a, b) => Number(b.locationId === current.id) - Number(a.locationId === current.id) || TYPES_BY_SIZE.indexOf(a.type) - TYPES_BY_SIZE.indexOf(b.type) || a.name.localeCompare(b.name));
  }, [current, editing, entities, canView, pins]); // eslint-disable-line react-hooks/exhaustive-deps

  const savePins = async (next: Pin[]) => {
    if (!current) return;
    try {
      await updateMapPins(current.id, next);
    } catch (err) {
      toast.error(err, 'Update pins');
    }
  };

  const placeArmed = async (x: number, y: number) => {
    if (!current || !armed) return;
    if (armed === BATTLE) {
      setArmed(null);
      setFight({ x, y, name: fightName(), cols: 20 });
      return;
    }
    if (armed === AREA) return;
    const target = entityMap.get(armed);
    setArmed(null);
    await savePins([...pins, { targetEntityId: armed, x, y }]);
    if (target && !target.locationId) setEntityLocation(target.id, current.id).catch((err) => toast.error(err, 'Set location'));
  };

  /** "Skirmish in Waterdeep", "… 2", … — the first one not taken. */
  const fightName = () => {
    const base = `Skirmish in ${current?.name ?? 'the wilds'}`;
    const taken = new Set(entities.map((e) => e.name));
    let n = 1;
    while (taken.has(n === 1 ? base : `${base} ${n}`)) n++;
    return n === 1 ? base : `${base} ${n}`;
  };

  // "A part of this map": drag a box over the spot.
  const onAreaTool = (phase: 'down' | 'move' | 'up' | 'cancel', cx: number, cy: number) => {
    const pct = toPercent.current;
    if (!pct) return;
    const p = pct(cx, cy);
    const c = { x: Math.max(0, Math.min(100, p.x)), y: Math.max(0, Math.min(100, p.y)) };
    if (phase === 'down') boxStart.current = c;
    const a = boxStart.current;
    if (!a) return;
    const b: MapArea = { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y) };
    if (phase === 'move') setBox(b);
    if (phase === 'up' || phase === 'cancel') {
      boxStart.current = null;
      setBox(null);
      if (phase === 'cancel' || b.w < 2 || b.h < 2 || !mapSrc) return;
      setArmed(null);
      setFight({ x: b.x + b.w / 2, y: b.y + b.h / 2, name: fightName(), area: b, cols: 20 });
      cropMapArea(mapSrc, b, 480).then((img) => setFight((f) => (f && f.area === b ? { ...f, preview: img.image, aspect: img.h / img.w } : f)), () => undefined);
    }
  };

  /** The fight's place: a secret landmark here, pinned where the DM tapped, then off to its battle map. */
  const startFight = async (how: 'forge' | 'later' | 'area') => {
    if (!current || !fight || !user || !currentCampaign || fightBusy) return;
    setFightBusy(true);
    try {
      // Cut the map first: if that fails, nothing has been created.
      const cut = how === 'area' && fight.area && mapSrc ? await cropMapArea(mapSrc, fight.area) : null;
      const place = await quickCreateEntity({ campaign: currentCampaign, user, name: fight.name.trim() || `Skirmish in ${current.name}`, type: 'landmark', locationId: current.id });
      await savePins([...pins, { targetEntityId: place.id, x: fight.x, y: fight.y }]);
      if (cut) {
        const cols = Math.max(1, Math.min(300, fight.cols || 20));
        await applyMapToBattle({ entity: place, scene: null, uvtt: { image: cut.image, cols, rows: Math.round((cols * cut.h) / cut.w), walls: [], doors: [] }, user });
      }
      setFight(null);
      setEditing(false);
      navigate(how === 'forge' ? `/battle/${place.id}?start=forge` : `/battle/${place.id}`);
    } catch (err) {
      toast.error(err, 'Start a battle here');
    } finally {
      setFightBusy(false);
    }
  };

  const enter = (e: Entity) => {
    const hasChildren = (childrenOf.get(e.id) ?? []).some((c) => c.type !== 'note' && seesAsPlayer(c));
    if (e.mapConfig?.mediaId || hasChildren) navigate(`/map/${e.id}`);
    else peek(e);
  };

  const viewerPins: ViewerPin[] = pins
    .map((p, i) => ({ p, i, target: entityMap.get(p.targetEntityId) }))
    .filter((x): x is { p: Pin; i: number; target: Entity } => !!x.target && seesAsPlayer(x.target))
    .map(({ p, i, target }) => ({
      key: String(i),
      x: p.x,
      y: p.y,
      draggable: editing,
      render: () => <PinMarker entity={target} editing={editing} selected={selected === String(i)} />,
    }));

  const selectedPin = selected !== null ? pins[Number(selected)] : undefined;
  const selectedTarget = selectedPin ? entityMap.get(selectedPin.targetEntityId) : undefined;
  const armedEntity = armed && armed !== BATTLE ? entityMap.get(armed) : undefined;

  if (loading) return <Spinner className="py-24" label="Unrolling the map…" />;
  if (id && (!current || !canView(current))) {
    return (
      <Page>
        <EmptyState icon={MapPinOff} title="Map not found" action={<Link to="/map" className="btn btn-secondary">Back to the world</Link>} />
      </Page>
    );
  }

  const candidateList = (
    <div className="space-y-1">
      {candidates.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-500">Everything here is already on the map.</p>
      ) : (
        candidates.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => {
              setArmed(armed === e.id ? null : e.id);
              setSelected(null);
              setPickerOpen(false);
            }}
            className={clsx(
              'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
              armed === e.id ? 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/40' : 'text-stone-300 hover:bg-stone-800',
            )}
          >
            <TypeIcon type={e.type} className="shrink-0 text-stone-500" />
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            {e.locationId === current?.id && <span className="text-[10px] text-stone-500">here</span>}
          </button>
        ))
      )}
    </div>
  );

  return (
    <Page wide>
      {isDM && preview && <PlayerPreviewBanner onExit={() => setPreview(false)} />}

      {/* Breadcrumbs */}
      <nav aria-label="Map location" className="scrollbar-none -mx-4 mb-4 flex items-center gap-1 overflow-x-auto px-4 text-sm">
        <Link to="/map" className={clsx('flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1', !id ? 'text-amber-300' : 'text-stone-400 hover:text-stone-100')}>
          <Globe size={15} /> World
        </Link>
        {[...ancestors, ...(current ? [current] : [])].map((a) => (
          <span key={a.id} className="flex shrink-0 items-center gap-1">
            <ChevronRight size={14} className="text-stone-600" />
            <Link to={`/map/${a.id}`} className={clsx('flex items-center gap-1.5 rounded-md px-2 py-1', a.id === id ? 'text-amber-300' : 'text-stone-400 hover:text-stone-100')}>
              <TypeIcon type={a.type} size={14} />
              <span className="max-w-[12rem] truncate">{a.name}</span>
            </Link>
          </span>
        ))}
      </nav>

      {/* Title row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {current ? <TypeTile type={current.type} size="lg" /> : <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25"><GiTreasureMap size={28} /></div>}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-semibold text-stone-50 sm:text-3xl">{current?.name ?? 'The World'}</h1>
          <p className="text-sm text-stone-400">{current ? typeMeta(current.type).label : 'Top-level places in your campaign'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {current && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(current.locationId && entityMap.get(current.locationId) ? `/map/${current.locationId}` : '/map')}>
              <ArrowUp size={15} /> Up
            </button>
          )}
          {current && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => peek(current)}>
              <Info size={15} /> Details
            </button>
          )}
          {isDM && (
            <button type="button" className={clsx('btn btn-sm', preview ? 'btn-primary' : 'btn-ghost')} onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
              <Eye size={15} /> Player view
            </button>
          )}
          {current && mapId && (isDM || battles.some((b) => b.id === current.id)) && (
            <Link to={`/battle/${current.id}`} className={clsx('btn btn-sm', battles.some((b) => b.id === current.id) ? 'btn-primary' : 'btn-ghost')}>
              <Swords size={15} /> {battles.some((b) => b.id === current.id) ? (isDM ? 'Battle on' : 'Join battle') : 'Battle map'}
            </Link>
          )}
          {isDM && current && mapId && !preview && (
            <>
              <button
                ref={battleAnchor}
                type="button"
                className={clsx('btn btn-sm', armed === BATTLE || armed === AREA ? 'btn-primary' : 'btn-secondary')}
                onClick={() => (armed === BATTLE || armed === AREA ? setArmed(null) : setBattleMenu((o) => !o))}
                aria-expanded={battleMenu}
              >
                <Swords size={15} /> Battle here <ChevronDown size={14} />
              </button>
              <Popover anchorRef={battleAnchor} open={battleMenu} onClose={() => setBattleMenu(false)} width={290}>
                <MenuItem icon={MapIcon} onClick={() => (setBattleMenu(false), navigate(`/battle/${current.id}`))}>
                  <span className="block">On this map</span>
                  <span className="block text-xs text-stone-500">The whole map becomes the battlefield</span>
                </MenuItem>
                <MenuItem icon={BoxSelect} onClick={() => (setBattleMenu(false), setArmed(AREA), setSelected(null))}>
                  <span className="block">On a part of this map</span>
                  <span className="block text-xs text-stone-500">Drag a box: that piece becomes its own battle map</span>
                </MenuItem>
                <MenuItem icon={MapPin} onClick={() => (setBattleMenu(false), setArmed(BATTLE), setSelected(null))}>
                  <span className="block">At a new pin</span>
                  <span className="block text-xs text-stone-500">Tap a spot, then paint its map in Battlemap Forge</span>
                </MenuItem>
              </Popover>
            </>
          )}
          {isDM && current && mapId && !preview && (
            <button type="button" className={clsx('btn btn-sm', editing ? 'btn-primary' : 'btn-secondary')} onClick={() => (setEditing((e) => !e), setArmed(null), setSelected(null))}>
              <Edit3 size={15} /> {editing ? 'Done' : 'Edit pins'}
            </button>
          )}
        </div>
      </div>

      {/* Map */}
      {current && mapId ? (
        <div className={clsx('mb-8 grid gap-4', editing && '@4xl:grid-cols-[minmax(0,1fr)_280px]')}>
          <div className="min-w-0">
            {mapLoading || !mapSrc ? (
              <div className="flex h-80 items-center justify-center rounded-2xl border border-stone-800 bg-stone-950">{mapLoading ? <Spinner label="Loading map…" /> : <span className="text-stone-500">Map image missing.</span>}</div>
            ) : (
              <MapViewer
                src={mapSrc}
                alt={current.name}
                pins={viewerPins}
                crosshair={!!armed}
                onTool={armed === AREA ? onAreaTool : null}
                layers={(api) => {
                  toPercent.current = api.toPercent;
                  return box ? (
                    <div
                      className="pointer-events-none absolute border-2 border-amber-400 bg-amber-400/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, borderWidth: 2 / api.scale }}
                    />
                  ) : null;
                }}
                onMapClick={armed ? placeArmed : () => setSelected(null)}
                onPinClick={(key) => {
                  if (editing) setSelected(selected === key ? null : key);
                  else {
                    const t = entityMap.get(pins[Number(key)]?.targetEntityId);
                    if (t) setSelected(selected === key ? null : key);
                  }
                }}
                onPinDrop={(key, x, y) => savePins(pins.map((p, i) => (String(i) === key ? { ...p, x, y } : p)))}
                onPinDoubleClick={(key) => {
                  // Double click / double tap enters the place (or opens the entry if it has no map).
                  if (editing) return;
                  const t = entityMap.get(pins[Number(key)]?.targetEntityId);
                  if (!t) return;
                  setSelected(null);
                  enter(t);
                }}
                overlay={
                  <>
                    {(armed === BATTLE || armed === AREA) && (
                      <div className="absolute inset-x-2 top-2 flex items-center gap-2 rounded-lg border border-amber-500/50 bg-stone-950/90 px-3 py-2 text-sm text-amber-100 backdrop-blur">
                        <Swords size={16} className="shrink-0 text-amber-400" />
                        <span className="flex-1">{armed === AREA ? 'Drag a box over where the fight happens (zoom in first for a small spot)' : 'Tap where the fight breaks out'}</span>
                        <button type="button" className="btn-icon-sm" aria-label="Cancel" onClick={() => setArmed(null)}>
                          <X size={15} />
                        </button>
                      </div>
                    )}
                    {armedEntity && (
                      <div className="absolute inset-x-2 top-2 flex items-center gap-2 rounded-lg border border-amber-500/50 bg-stone-950/90 px-3 py-2 text-sm text-amber-100 backdrop-blur">
                        <MapPin size={16} className="shrink-0 text-amber-400" />
                        <span className="flex-1">
                          Tap the map to place <strong>{armedEntity.name}</strong>
                        </span>
                        <button type="button" className="btn-icon-sm" aria-label="Cancel" onClick={() => setArmed(null)}>
                          <X size={15} />
                        </button>
                      </div>
                    )}
                    {selectedTarget && !armed && (
                      <div className="absolute inset-x-2 bottom-2 mr-14 flex items-center gap-3 rounded-xl border border-stone-700 bg-stone-950/95 p-3 shadow-2xl backdrop-blur sm:right-auto sm:max-w-sm">
                        <TypeTile type={selectedTarget.type} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-stone-100">{selectedTarget.name}</div>
                          <div className="text-xs text-stone-500">{typeMeta(selectedTarget.type).label}</div>
                        </div>
                        {editing ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              savePins(pins.filter((_, i) => String(i) !== selected));
                              setSelected(null);
                            }}
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        ) : (
                          <>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => peek(selectedTarget)}>
                              Details
                            </button>
                            {(selectedTarget.mapConfig?.mediaId || (childrenOf.get(selectedTarget.id)?.length ?? 0) > 0) && (
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/map/${selectedTarget.id}`)}>
                                Enter
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </>
                }
              />
            )}
            {editing && (
              <p className="mt-2 text-xs text-stone-500">Pick an entry{' '}<span className="@4xl:hidden">(“Add pin”)</span> and tap the map to place it. Drag pins to move them; tap a pin to remove it.</p>
            )}
            {editing && (
              <button type="button" className="btn btn-secondary mt-3 w-full @4xl:hidden" onClick={() => setPickerOpen(true)}>
                <Plus size={16} /> Add pin
              </button>
            )}
          </div>
          {editing && (
            <aside className="card hidden max-h-[72vh] flex-col p-3 @4xl:flex">
              <h2 className="section-title mb-1 px-1">Add pins</h2>
              <p className="mb-2 px-1 text-xs text-stone-500">Choose one, then click on the map.</p>
              <div className="scrollbar-thin -mx-1 flex-1 overflow-y-auto px-1">{candidateList}</div>
            </aside>
          )}
        </div>
      ) : current ? (
        <div className="mb-6 rounded-xl border border-dashed border-stone-800 px-4 py-3 text-sm text-stone-500">
          {isDM ? (
            <>
              No map image for {current.name} yet.{' '}
              <Link to={`/entity/${current.id}/edit`} className="link">
                Add one in the editor
              </Link>{' '}
              (Images &amp; map).
            </>
          ) : (
            'There’s no map of this place yet.'
          )}
        </div>
      ) : null}

      {/* Children */}
      <section>
        <h2 className="section-title mb-3">
          {current ? `In ${current.name}` : 'Places'} <span className="font-sans text-sm text-stone-500">{children.length}</span>
        </h2>
        {children.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Nothing here yet"
            action={
              isDM && (
                <Link to={`/entity/new?type=${current ? 'settlement' : 'country'}${current ? `&locationId=${encodeURIComponent(current.id)}` : ''}`} className="btn btn-primary">
                  <Plus size={16} /> Create a place
                </Link>
              )
            }
          />
        ) : (
          <div className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
            {children.map((c) => {
              const grand = (childrenOf.get(c.id) ?? []).filter((g) => g.type !== 'note' && seesAsPlayer(g)).length;
              return (
                <button key={c.id} type="button" onClick={() => enter(c)} className="card group flex gap-3 p-4 text-left hover:border-amber-500/40">
                  <TypeTile type={c.type} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="min-w-0 flex-1 truncate font-sans text-[15px] font-semibold text-stone-100 group-hover:text-amber-300">{c.name}</h3>
                      {c.mapConfig?.mediaId && <MapPin size={14} className="shrink-0 text-amber-400" aria-label="Has a map" />}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
                      <TypeBadge type={c.type} />
                      {grand > 0 && <span>{grand} inside</span>}
                    </div>
                    {canViewField(c, 'content') && c.content && <p className="mt-1.5 line-clamp-2 text-sm text-stone-400">{excerpt(c.content, 120)}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        open={!!fight}
        onClose={() => !fightBusy && setFight(null)}
        title="A fight breaks out"
        description={`A new secret place in ${current?.name ?? 'here'}, pinned ${fight?.area ? 'in the middle of your box' : 'where you tapped'}. Rename, reveal or delete it later like any entry.`}
      >
        {fight && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void startFight(fight.area ? 'area' : 'forge');
            }}
          >
            <label className="block">
              <span className="label">Name</span>
              <input className="input" value={fight.name} onChange={(e) => setFight({ ...fight, name: e.target.value })} maxLength={120} />
            </label>
            {fight.area ? (
              <>
                <div>
                  <span className="label">Squares across</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      className="input w-24"
                      min={1}
                      max={300}
                      value={fight.cols || ''}
                      onChange={(e) => setFight({ ...fight, cols: Math.min(300, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
                      aria-label="Squares across"
                    />
                    <span className="text-xs text-stone-500">{fight.cols ? `${fight.cols} × ${Math.max(1, Math.round(fight.cols * (fight.aspect ?? fight.area.h / fight.area.w)))} squares · fine-tune or drag the grid later in the battle's settings` : ''}</span>
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-lg border border-stone-700 bg-stone-900">
                  {fight.preview ? (
                    <>
                      <img src={fight.preview} alt="The part of the map you picked" className="block w-full" />
                      {fight.cols > 0 && (
                        <div
                          className="pointer-events-none absolute inset-0"
                          style={{
                            backgroundImage: 'linear-gradient(to right, rgba(20,12,6,.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(20,12,6,.55) 1px, transparent 1px)',
                            backgroundSize: `${100 / fight.cols}% ${100 / (fight.cols * (fight.aspect ?? 1))}%`,
                          }}
                        />
                      )}
                    </>
                  ) : (
                    <div className="flex h-40 items-center justify-center">
                      <Loader2 size={18} className="animate-spin text-stone-500" />
                    </div>
                  )}
                </div>
                <button type="submit" className="btn btn-primary w-full" disabled={fightBusy || !fight.cols}>
                  {fightBusy ? <Loader2 size={15} className="animate-spin" /> : <Swords size={15} />} Make the battle map
                </button>
                <p className="text-xs text-stone-500">This piece of the map is copied as the new place’s battle map. Paint a proper one in Battlemap Forge later if you like; the tokens stay.</p>
              </>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="submit" className="btn btn-primary" disabled={fightBusy}>
                    {fightBusy ? <Loader2 size={15} className="animate-spin" /> : <Hammer size={15} />} Paint it in Battlemap Forge
                  </button>
                  <button type="button" className="btn btn-secondary" disabled={fightBusy} onClick={() => void startFight('later')}>
                    <MapPin size={15} /> Just the pin for now
                  </button>
                </div>
                <p className="text-xs text-stone-500">Without a map yet, its battle page lets you open Battlemap Forge or add any image when you’re ready.</p>
              </>
            )}
          </form>
        )}
      </Modal>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Add a pin" description="Choose an entry, then tap where it goes on the map.">
        {candidateList}
      </Modal>
    </Page>
  );
}
