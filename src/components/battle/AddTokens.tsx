import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, MapPin, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../ui/Modal';
import { Segmented, Toggle, TypeIcon } from '../ui/bits';
import { useVisibleEntities } from '../../contexts/CampaignDataContext';
import { baseType, typeMeta } from '../../lib/entityTypes';
import { parseHp } from '../../lib/hitPoints';
import { compressImage } from '../../lib/media';
import { useToast } from '../../contexts/ToastContext';
import { TOKEN_COLORS, TOKEN_SIZES } from '../../lib/battle/table';
import type { Entity, Token } from '../../types';
import EncounterMeter from './EncounterMeter';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { codexTokenPicture } from '../../lib/codex/plates';
import { type CatalogMonster, codexStatFor, findInCatalog, type CodexStat, hasStats, loadCatalog, loadStatblocks, searchCatalog, sizeSquares, type Catalog } from '../../lib/codex/catalog';

/** What to place, armed until the DM taps the map. */
export interface TokenSpec {
  name: string;
  entityId: string | null;
  color: string;
  size: number;
  count: number;
  hidden: boolean;
  controlledBy: string[];
  /** Starting HP for monsters / NPCs (kept in the DM's secret doc). */
  hpMax: number | null;
  /** Round picture for the token (the entry's picture, or an uploaded one). */
  img?: string | null;
  /** Scavenger's Codex creature (for harvesting after the fight). */
  codexRef?: string | null;
}

const TOKEN_TYPES = ['character', 'npc', 'monster'];

export function specForEntity(e: Entity, opts: { count?: number; hidden?: boolean; size?: number; codexStat?: CodexStat | null } = {}): TokenSpec {
  const kind = baseType(e.type);
  const isCharacter = e.type === 'character';
  // No stat block of its own? A linked codex creature's SRD hit points will do.
  const hp = hasStats(e.dndStats) ? e.dndStats?.hitPoints : opts.codexStat?.hp;
  return {
    name: e.name,
    entityId: e.id,
    color: isCharacter ? '#b8862b' : kind === 'monster' ? '#8e2020' : '#2d6a43',
    size: opts.size ?? 1,
    count: opts.count ?? 1,
    hidden: opts.hidden ?? false,
    controlledBy: isCharacter && e.playerId ? [e.playerId] : [],
    // Characters use their own HP; others start at the stat block's hit points.
    hpMax: isCharacter ? null : parseHp(hp),
    img: e.coverThumb ?? null,
    codexRef: kind === 'monster' && typeof e.attributes?.codexRef === 'string' ? e.attributes.codexRef : null,
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onArm: (spec: TokenSpec) => void;
  /** Entries already on the map (shown as such). */
  onMap: Set<string>;
  /** Tokens on the map, for the encounter difficulty. */
  tokens: Token[];
}

export default function AddTokens({ open, onClose, onArm, onMap, tokens }: Props) {
  const { entityMap } = useCampaignData();
  const visible = useVisibleEntities();
  const [mode, setMode] = useState<'entry' | 'codex' | 'custom'>('entry');
  // Scavenger's Codex creatures: a dire wolf doesn't need a DnDocs entry to join a fight.
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [beast, setBeast] = useState<CatalogMonster | null>(null);
  useEffect(() => {
    if (mode !== 'codex' || catalog) return;
    loadCatalog().then(setCatalog, (err) => setCatalogError(err instanceof Error ? err.message : String(err)));
  }, [mode, catalog]);
  // SRD stat blocks: hit points for codex creatures (and for entries linked to one).
  const [stats, setStats] = useState<Record<string, CodexStat> | null>(null);
  useEffect(() => {
    if (!open || stats) return;
    Promise.all([loadStatblocks(), catalog ? Promise.resolve(catalog) : loadCatalog().then((c) => (setCatalog(c), c))]).then(([st]) => setStats(st), () => undefined);
  }, [open, stats, catalog]);
  const statOf = (id: string | null | undefined) => (stats ? codexStatFor(stats, catalog, id) ?? null : null);
  const [term, setTerm] = useState('');
  const beasts = useMemo(() => (catalog ? (searchCatalog(catalog, 'monster', term, 60) as CatalogMonster[]) : []), [catalog, term]);
  const [picked, setPicked] = useState<Entity | null>(null);
  const [count, setCount] = useState(1);
  const [size, setSize] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(TOKEN_COLORS[1]);
  const [img, setImg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const list = useMemo(() => {
    const t = term.trim().toLowerCase();
    return visible
      .filter((e) => TOKEN_TYPES.includes(baseType(e.type)) || e.type === 'character')
      .filter((e) => !t || e.name.toLowerCase().includes(t))
      .sort((a, b) => Number(b.type === 'character') - Number(a.type === 'character') || a.name.localeCompare(b.name))
      .slice(0, 80);
  }, [visible, term]);

  const reset = () => {
    setPicked(null);
    setCount(1);
    setSize(1);
    setHidden(false);
    setName('');
    setImg(null);
    setBeast(null);
  };

  const [arming, setArming] = useState(false);
  const arm = async () => {
    // Codex creatures without a picture of their own get the codex's silhouette for their kind.
    const pictureFor = async (ref: string | null | undefined) => {
      const m = ref && catalog ? (findInCatalog(catalog, 'monster', ref) as CatalogMonster | undefined) : undefined;
      return m ? codexTokenPicture(m) : null;
    };
    if (mode === 'entry' && picked) {
      const ref = typeof picked.attributes?.codexRef === 'string' ? picked.attributes.codexRef : null;
      const spec = specForEntity(picked, { count, hidden, size, codexStat: statOf(ref) });
      if (!spec.img && ref) {
        setArming(true);
        spec.img = await pictureFor(ref);
        setArming(false);
      }
      onArm(spec);
    } else if (mode === 'codex' && beast) {
      setArming(true);
      const img = await codexTokenPicture(beast);
      setArming(false);
      onArm({ name: beast.name, entityId: null, color: '#8e2020', size, count, hidden, controlledBy: [], hpMax: parseHp(statOf(beast.id)?.hp), img, codexRef: beast.id });
    }
    else if (mode === 'custom' && name.trim()) onArm({ name: name.trim(), entityId: null, color, size, count, hidden, controlledBy: [], hpMax: null, img });
    else return;
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add tokens"
      description="Pick who joins the fight, then tap the map where they stand."
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={arm} disabled={arming || (mode === 'entry' ? !picked : mode === 'codex' ? !beast : !name.trim())}>
            <MapPin size={15} /> Place on the map
          </button>
        </>
      }
    >
      <Segmented
        className="mb-3 w-full"
        value={mode}
        onChange={(v) => setMode(v)}
        options={[
          { value: 'entry', label: 'From entries' },
          { value: 'codex', label: 'From the Codex' },
          { value: 'custom', label: 'Custom' },
        ]}
      />
      {mode === 'entry' ? (
        <>
          <div className="relative mb-2">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500" />
            <input className="input pl-9" placeholder="Characters, NPCs, monsters…" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search entries" />
          </div>
          <div className="scrollbar-thin max-h-56 space-y-0.5 overflow-y-auto">
            {list.length === 0 && <p className="py-6 text-center text-sm text-stone-500">No characters, NPCs or monsters yet.</p>}
            {list.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setPicked(e);
                  setCount(1);
                }}
                className={clsx(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
                  picked?.id === e.id ? 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/40' : 'text-stone-300 hover:bg-stone-800',
                )}
              >
                <TypeIcon type={e.type} className="shrink-0 text-stone-500" />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="text-[10px] text-stone-500">{onMap.has(e.id) ? 'on the map' : typeMeta(e.type).label}</span>
              </button>
            ))}
          </div>
        </>
      ) : mode === 'codex' ? (
        <>
          <div className="relative mb-2">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500" />
            <input className="input pl-9" placeholder="Dire wolf, owlbear, goblin…" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search the Scavenger's Codex" />
          </div>
          <div className="scrollbar-thin max-h-56 space-y-0.5 overflow-y-auto">
            {catalogError && <p className="py-6 text-center text-sm text-rose-300">{catalogError}</p>}
            {!catalog && !catalogError && <p className="py-6 text-center text-sm text-stone-500">Loading the Codex…</p>}
            {catalog && beasts.length === 0 && <p className="py-6 text-center text-sm text-stone-500">No creature by that name in the Codex.</p>}
            {beasts.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setBeast(m);
                  setSize(sizeSquares(m.size));
                  setCount(1);
                }}
                className={clsx(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
                  beast?.id === m.id ? 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/40' : 'text-stone-300 hover:bg-stone-800',
                )}
              >
                <TypeIcon type="monster" className="shrink-0 text-stone-500" />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <span className="text-[10px] text-stone-500">{[m.size, m.type, m.cr != null ? `CR ${m.cr}` : '', statOf(m.id) ? `AC ${parseInt(statOf(m.id)!.ac, 10)} · ${parseHp(statOf(m.id)!.hp)} HP` : ''].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
          <p className="hint">No DnDocs entry needed: they start with their SRD hit points, and the token card shows the full stat block. After the fight, “Harvest the fallen” sends them to the Codex.</p>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="tok-name">
              Name
            </label>
            <input id="tok-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bandit, Wolf, Barrel" maxLength={100} />
          </div>
          <div>
            <span className="label">Picture (optional)</span>
            <div className="flex items-center gap-3">
              {img ? <img src={img} alt="" className="size-12 rounded-full object-cover ring-2 ring-stone-700" /> : <div className="size-12 rounded-full ring-2 ring-stone-700" style={{ background: color }} />}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => file.current?.click()}>
                <ImagePlus size={14} /> {img ? 'Change' : 'Upload'}
              </button>
              {img && (
                <button type="button" className="btn-icon-sm" aria-label="Remove picture" onClick={() => setImg(null)}>
                  <X size={14} />
                </button>
              )}
              <input
                ref={file}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  // Small and round on the map: a few KB stored on the token itself.
                  try {
                    setImg(await compressImage(f, 240, 0.7, 40_000));
                  } catch (err) {
                    toast.error(err, 'Token picture');
                  }
                }}
              />
            </div>
          </div>
          <div>
            <span className="label">Colour</span>
            <div className="flex flex-wrap gap-1.5">
              {TOKEN_COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setColor(c)} className={clsx('size-7 rounded-full ring-2', color === c ? 'ring-amber-400' : 'ring-stone-700')} style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="tok-count">
            How many
          </label>
          <input id="tok-count" type="number" min={1} max={20} className="input" value={count} onChange={(e) => setCount(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))} />
        </div>
        <div>
          <label className="label" htmlFor="tok-size">
            Size
          </label>
          <select id="tok-size" className="input" value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {TOKEN_SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <EncounterMeter tokens={tokens} entityMap={entityMap} adding={mode === 'entry' && picked ? { entity: picked, count } : null} />
      <div className="surface mt-3 flex items-center justify-between gap-3 px-3 py-2.5">
        <span className="text-sm text-stone-200">Hidden from players (ambush)</span>
        <Toggle checked={hidden} onChange={setHidden} label="Hidden from players" />
      </div>
    </Modal>
  );
}
