import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dices, Download, Image as ImageIcon, Package, RefreshCw, Save, Store, Trash2, UserRound, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import { GiCowled, GiDiceTwentyFacesTwenty, GiLockedChest, GiRollingDices, GiTavernSign } from 'react-icons/gi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { quickCreateEntity } from '../lib/entityService';
import type { EntityType } from '../types';
import { EmptyState, Page, PageHeader } from '../components/ui/bits';

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const TAVERN_1 = ['The Prancing', 'The Rusty', 'The Golden', 'The Sleeping', 'The Laughing', 'The Drunken', 'The Blind', 'The Black', 'The Silver', 'The Crooked', 'The Wandering', 'The Salty', 'The Howling', 'The Gilded'];
const TAVERN_2 = ['Pony', 'Dragon', 'Lion', 'Giant', 'Goblin', 'Sailor', 'Boar', 'Stag', 'Griffin', 'Unicorn', 'Tankard', 'Wyvern', 'Owl', 'Mermaid', 'Hound'];
const TAVERN_FEATURE = ['famous for its spiced mead', 'run by a retired adventurer', 'haunted by a friendly ghost', 'a front for the local thieves’ guild', 'with a notoriously rigged dice table', 'where bards duel every night', 'with rooms cheaper than they should be'];
const FIRST = ['Aelar', 'Birel', 'Daen', 'Eldon', 'Fargrim', 'Gael', 'Himo', 'Ilyana', 'Jor', 'Kael', 'Lia', 'Morn', 'Naeris', 'Orsik', 'Paela', 'Quinn', 'Rolen', 'Silaqui', 'Thia', 'Uthal', 'Varis', 'Wrenn', 'Xander', 'Yestin', 'Zook', 'Brenna', 'Tobin', 'Mira'];
const LAST = ['Amakiir', 'Battlehammer', 'Caskbone', 'Dungarth', 'Evenwood', 'Fireforge', 'Galanodel', 'High-hill', 'Ironfist', 'Liadon', 'Mellerelel', 'Nailo', 'Siannodel', 'Thorngage', 'Underbough', 'Ashdown', 'Marsh'];
const RACES = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-Orc', 'Tiefling', 'Dragonborn', 'Half-Elf'];
const JOBS = ['Blacksmith', 'Innkeeper', 'Guard', 'Merchant', 'Priest', 'Farmer', 'Scholar', 'Sailor', 'Hunter', 'Alchemist', 'Beggar', 'Noble'];
const QUIRKS = ['Always speaks in a whisper', 'Constantly flipping a coin', 'Has a very loud, booming laugh', 'Suspicious of magic users', 'Collects strange bugs', 'Forgets names instantly', 'Smells faintly of sulfur', 'Missing an eye', 'Always hungry', 'Overly polite', 'Hums while thinking', 'Answers questions with questions'];
const LOOT = ['A glowing blue potion', 'A silver dagger with a ruby in the hilt', 'A leather pouch containing 50 gp', 'A map leading to a nearby cave', 'A ring that feels warm to the touch', 'A finely crafted elven bow', 'A spell scroll of Fireball', 'A set of loaded dice', 'A small wooden carving of a bear', 'A mysterious locked iron box', 'A cracked hourglass that runs backwards', 'A letter sealed with a noble crest'];

const DICE = [4, 6, 8, 10, 12, 20, 100];

interface Roll {
  id: number;
  label: string;
  rolls: number[];
  mod: number;
  total: number;
}

function DiceRoller() {
  const [count, setCount] = useState(1);
  const [mod, setMod] = useState(0);
  const [history, setHistory] = useState<Roll[]>([]);

  const roll = (sides: number) => {
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    const total = rolls.reduce((a, b) => a + b, 0) + mod;
    setHistory((h) => [{ id: Date.now(), label: `${count}d${sides}${mod ? (mod > 0 ? `+${mod}` : mod) : ''}`, rolls, mod, total }, ...h].slice(0, 12));
  };

  const last = history[0];
  return (
    <section className="card p-5 md:col-span-2">
      <h2 className="section-title mb-4 flex items-center gap-2">
        <GiRollingDices size={20} /> Dice
      </h2>
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {DICE.map((d) => (
              <button key={d} type="button" onClick={() => roll(d)} className="btn btn-secondary h-14 text-base font-semibold">
                d{d}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 text-stone-400">
              Dice
              <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="input w-16 text-center" />
            </label>
            <label className="flex items-center gap-2 text-stone-400">
              Modifier
              <input type="number" min={-20} max={20} value={mod} onChange={(e) => setMod(Math.max(-20, Math.min(20, Number(e.target.value) || 0)))} className="input w-16 text-center" />
            </label>
          </div>
        </div>
        <div className="surface flex flex-col items-center justify-center p-4 text-center" aria-live="polite">
          {last ? (
            <>
              <div className="text-xs text-stone-500">{last.label}</div>
              <div key={last.id} className="animate-pop-in font-display text-5xl font-bold text-amber-300">{last.total}</div>
              {last.rolls.length > 1 || last.mod ? <div className="mt-1 text-xs text-stone-500">[{last.rolls.join(', ')}]{last.mod ? ` ${last.mod > 0 ? '+' : ''}${last.mod}` : ''}</div> : null}
            </>
          ) : (
            <div className="text-sm text-stone-500">Roll something!</div>
          )}
        </div>
      </div>
      {history.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-stone-400">
          {history.slice(1).map((r) => (
            <span key={r.id} className="tag">
              {r.label}: <strong className="text-stone-200">{r.total}</strong>
            </span>
          ))}
          <button type="button" aria-label="Clear history" className="btn-icon-sm" onClick={() => setHistory([])}>
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </section>
  );
}

function Generator({
  title,
  icon: Icon,
  onRoll,
  result,
  onSave,
  saving,
  className,
}: {
  title: string;
  icon: React.ElementType;
  onRoll: () => void;
  result: React.ReactNode;
  onSave?: () => void;
  saving?: boolean;
  className?: string;
}) {
  return (
    <section className={clsx('card flex flex-col p-5', className)}>
      <h2 className="section-title mb-3 flex items-center gap-2">
        <Icon size={20} /> {title}
      </h2>
      <div className="surface mb-4 flex min-h-24 flex-1 flex-col items-center justify-center p-4 text-center">{result ?? <span className="text-sm text-stone-500">Press roll to generate</span>}</div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary flex-1" onClick={onRoll}>
          <RefreshCw size={16} /> Roll
        </button>
        {onSave && (
          <button type="button" className="btn btn-primary flex-1" onClick={onSave} disabled={saving}>
            <Save size={16} /> {saving ? 'Saving…' : 'Save & edit'}
          </button>
        )}
      </div>
    </section>
  );
}

function DevImageGenerator() {
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [img, setImg] = useState('');
  const run = async () => {
    setBusy(true);
    try {
      const { generateImage } = await import('../lib/ai');
      setImg(await generateImage(prompt, '16:9'));
    } catch (err) {
      toast.error(err, 'AI image');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card p-5 md:col-span-2">
      <h2 className="section-title mb-1 flex items-center gap-2">
        <ImageIcon size={18} /> AI image generator <span className="chip text-sky-300 ring-sky-500/30">dev only</span>
      </h2>
      <p className="mb-3 text-sm text-stone-500">Only available when running locally with a GEMINI_API_KEY – never shipped to the live site.</p>
      <textarea className="input" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A misty harbour town at dawn, fantasy illustration…" />
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn btn-secondary flex-1" disabled={busy || !prompt.trim()} onClick={run}>
          {busy ? 'Generating…' : 'Generate'}
        </button>
        {img && (
          <a href={img} download="dndocs-image.jpg" className="btn btn-primary">
            <Download size={16} /> Download
          </a>
        )}
      </div>
      {img && <img src={img} alt="" className="mt-4 w-full rounded-xl border border-stone-800" />}
    </section>
  );
}

export default function DMTools() {
  const { isDM, currentCampaign, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [tavern, setTavern] = useState<{ name: string; feature: string } | null>(null);
  const [npc, setNpc] = useState<{ name: string; race: string; job: string; quirk: string } | null>(null);
  const [loot, setLoot] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  if (!isDM || !currentCampaign || !user) {
    return (
      <Page>
        <EmptyState icon={Wand2} title="DM only">
          These tools are for the Dungeon Master.
        </EmptyState>
      </Page>
    );
  }

  const save = async (key: string, name: string, type: EntityType, content: string, attributes: Record<string, unknown>, tags: string[]) => {
    setSaving(key);
    try {
      const e = await quickCreateEntity({ campaign: currentCampaign, user, name, type, content, attributes, tags: [...tags, 'generated'] });
      navigate(`/entity/${e.id}/edit`);
    } catch (err) {
      toast.error(err, 'Save generated');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Page>
      <PageHeader
        icon={<div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25"><GiDiceTwentyFacesTwenty size={28} /></div>}
        title="DM tools"
        subtitle="Quick inspiration when the party goes off-script."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DiceRoller />
        <Generator
          title="Tavern"
          icon={GiTavernSign}
          onRoll={() => setTavern({ name: `${pick(TAVERN_1)} ${pick(TAVERN_2)}`, feature: pick(TAVERN_FEATURE) })}
          result={
            tavern && (
              <>
                <p className="font-display text-xl font-semibold text-stone-50">{tavern.name}</p>
                <p className="mt-1 text-sm text-stone-400">…{tavern.feature}.</p>
              </>
            )
          }
          saving={saving === 'tavern'}
          onSave={tavern ? () => save('tavern', tavern.name, 'shop', `A tavern ${tavern.feature}.`, { storeType: 'Tavern' }, ['tavern']) : undefined}
        />
        <Generator
          title="NPC"
          icon={GiCowled}
          onRoll={() => setNpc({ name: `${pick(FIRST)} ${pick(LAST)}`, race: pick(RACES), job: pick(JOBS), quirk: pick(QUIRKS) })}
          result={
            npc && (
              <>
                <p className="font-display text-xl font-semibold text-stone-50">{npc.name}</p>
                <p className="mt-1 text-sm text-stone-300">
                  {npc.race} {npc.job.toLowerCase()}
                </p>
                <p className="mt-1 text-sm text-stone-500 italic">“{npc.quirk}”</p>
              </>
            )
          }
          saving={saving === 'npc'}
          onSave={npc ? () => save('npc', npc.name, 'npc', `**Quirk:** ${npc.quirk}`, { race: npc.race, profession: npc.job, specifics: npc.quirk }, []) : undefined}
        />
        <Generator
          title="Loot"
          icon={GiLockedChest}
          onRoll={() => setLoot(pick(LOOT))}
          result={loot && <p className="text-base text-stone-100">{loot}</p>}
          saving={saving === 'loot'}
          onSave={loot ? () => save('loot', loot.replace(/^An? /, '').replace(/^./, (c) => c.toUpperCase()), 'item', loot, { itemCategory: 'Other' }, ['loot']) : undefined}
        />
        {import.meta.env.DEV && <DevImageGenerator />}
      </div>
    </Page>
  );
}
