import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import '../../src/index.css';
import { ToastProvider } from '../../src/contexts/ToastContext';
import { ChatButton, openTableChat } from '../../src/components/chat/ChatDock';
import CharacterPlay from '../../src/components/play/CharacterPlay';
import { HitPoints } from '../../src/components/entity/HitPoints';
import TokenCard from '../../src/components/battle/TokenCard';
import { mapListens, openPlay } from '../../src/lib/play/ui';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BattleMap from '../../src/pages/BattleMap';
import { BattleBanner } from '../../src/components/layout/AppShell';
import { QuickBookButton } from '../../src/components/play/QuickBook';
import { useCampaignData } from './CampaignDataContext';
import { inject, messages, seed } from './service';
import * as S from './state';
import { setCurrentRules } from '../../src/lib/play/rules';
setCurrentRules(S.campaign);
import { patchPlay, tableLive } from './live';
import { getSecret, getSnap, setSceneCombat } from './sceneStore';
import type { Entity, Token } from '../../src/types';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'page';
const charId = q.get('char') ?? 'lyra';
// Test hooks: open things, put chat lines in, and read the table's state.
(window as unknown as Record<string, unknown>).__h = { openPlay, openTableChat, inject, messages, live: tableLive, patchPlay, scene: getSnap, setCombat: setSceneCombat, secretHp: getSecret, entities: () => S.entities };
if (view === 'battle') mapListens();
seed([
  { uid: 'p2', name: 'Erik', kind: 'roll', roll: { l: 'Longsword', f: '1d20 + 6', t: 19, d: [{ s: 20, v: [13] }], m: 6, nat: 13 }, ago: 300 },
  { uid: 'p2', name: 'Erik', kind: 'text', text: 'Lyra, can you light the goblins up?', ago: 200 },
]);

const tok = (id: string, name: string, entityId: string | null, ctl: string[]): Token => ({ id, name, entityId, controlledBy: ctl, x: 0, y: 0, size: 1, color: '#7c3aed', conditions: [], initiative: null, vision: 0, hidden: false, health: 'healthy', campaignId: 'c1' }) as unknown as Token;

function FakeMap() {
  // A stand-in for the battle map behind the real token card (the map itself needs the database).
  const T = (x: number, y: number, c: string, l: string, ring?: string) => (
    <div className="absolute flex size-14 items-center justify-center rounded-full text-sm font-bold text-white" style={{ left: x, top: y, background: c, boxShadow: `0 0 0 4px ${ring ?? '#1c1410'}` }}>{l}</div>
  );
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#3d3a2f', backgroundImage: 'linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '56px 56px' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 60% 45%, rgba(120,110,80,.5), transparent 60%)' }} />
      {T(560, 336, '#7c3aed', 'LS', '#f2b632')}
      {T(504, 392, '#0f766e', 'BI')}
      {T(784, 224, '#8e2020', 'G1')}
      {T(840, 280, '#8e2020', 'GB')}
      {T(896, 168, '#8e2020', 'G2')}
    </div>
  );
}

function Harness() {
  const { entities } = useCampaignData() as unknown as { entities: Entity[] };
  const ch = entities.find((e) => e.id === charId)!;
  useEffect(() => {
    if (q.get('chat') === '1') setTimeout(() => openTableChat(), 300);
  }, []);
  if (view === 'map')
    return (
      <div className="flex h-screen flex-col bg-stone-950">
        <div className="flex items-center gap-1 border-b border-stone-800 px-4 py-2">
          <b className="font-display text-stone-100">DnDocs</b>
          <span className="flex-1" />
          <QuickBookButton />
          <ChatButton />
        </div>
        <div className="min-h-0 flex-1">
          <MemoryRouter initialEntries={['/battle/vault']}>
            <Routes>
              <Route path="/battle/:id" element={<BattleMap />} />
            </Routes>
          </MemoryRouter>
        </div>
      </div>
    );
  if (view === 'battle')
    return (
      <div className="relative h-screen bg-stone-950">
        <div className="relative z-10 flex items-center gap-3 border-b border-stone-800 bg-stone-950 px-4 py-2">
          <b className="font-display text-stone-100">Battle map · The Sunken Vault</b>
          <span className="flex-1" />
          <ChatButton />
        </div>
        <div className="absolute inset-x-0 top-12 bottom-0"><FakeMap />
          <div className="absolute bottom-3 left-3">
            <TokenCard token={tok('tlyra', ch.name, ch.id, [S.ME.uid])} sceneId="s1" asDM={false} uid={S.ME.uid} entity={ch} canEditEntity secretHp={undefined} players={[]} onClose={() => {}} onOpenEntry={() => {}} combat={{ active: true, round: 2, turn: 'tlyra' } as never} />
          </div>
        </div>
      </div>
    );
  return (
    <MemoryRouter initialEntries={['/entity/' + ch.id]}>
    <BattleBanner />
    <div className="min-h-screen bg-stone-950 p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-3 border-b border-stone-800 pb-2">
        <b className="font-display text-stone-100">DnDocs</b>
        <span className="flex-1 text-xs text-stone-500">Characters › {ch.name}</span>
        <QuickBookButton />
        <ChatButton />
      </div>
      <div className="max-w-2xl space-y-4">
        <h1 className="font-display text-3xl text-stone-50">{ch.name}</h1>
        <HitPoints entity={ch} maxText={ch.dndStats?.hitPoints} editable />
        <CharacterPlay entity={ch} />
      </div>
    </div>
    </MemoryRouter>
  );
}
createRoot(document.getElementById('root')!).render(<ToastProvider><Harness /></ToastProvider>);
