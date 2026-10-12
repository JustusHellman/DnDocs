import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Hammer, Swords } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { useActiveBattles } from '../../contexts/ActiveScenesContext';
import { listScenes } from '../../lib/battle/sceneService';
import { logError } from '../../lib/errors';
import type { Scene } from '../../types';

/**
 * DM: every battle map in the campaign. A battle map stays on its entry after the fight (tokens,
 * drawings and fog included), so it can be picked up again or reused.
 */
export default function BattleMapsCard() {
  const { currentCampaign } = useAuth();
  const { entityMap } = useCampaignData();
  const active = useActiveBattles();
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  useEffect(() => {
    if (!currentCampaign) return;
    listScenes(currentCampaign.id)
      .then((list) => setScenes(list.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))))
      .catch((err) => {
        logError('Battle maps', err);
        setScenes([]);
      });
  }, [currentCampaign?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="card p-5 md:col-span-2 xl:col-span-3">
      <h2 className="section-title mb-1 flex items-center gap-2">
        <Swords size={18} /> Battle maps
      </h2>
      <p className="mb-3 text-sm text-stone-400">
        Each one lives on its place’s entry (the <b>Battle map</b> button there or on the world map) and keeps its tokens, drawings and fog after the fight.
      </p>
      {scenes === null ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : scenes.length === 0 ? (
        <p className="text-sm text-stone-500">None yet. Open a place and choose “Battle map” (or “Make a battle map” in its ⋯ menu).</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {scenes.map((s) => {
            const on = active.some((a) => a.id === s.id) || s.active;
            const e = entityMap.get(s.entityId);
            return (
              <li key={s.id}>
                <Link to={`/battle/${s.id}`} className="flex items-center gap-3 rounded-lg border border-stone-800 px-3 py-2 hover:border-amber-700/60 hover:bg-stone-900/60">
                  <Swords size={16} className={on ? 'text-amber-400' : 'text-stone-500'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-stone-100">{e?.name ?? s.name}</span>
                    <span className="block truncate text-xs text-stone-500">
                      {s.grid?.cols ? `${s.grid.cols} squares across` : 'No grid yet'}
                      {s.walls ? ' · walls' : ''}
                      {s.combat?.active ? ` · round ${s.combat.round}` : ''}
                    </span>
                  </span>
                  {s.forgeAt && <Hammer size={13} className="text-stone-500" aria-label="Made in Battlemap Forge" />}
                  <span className={clsx('chip', on ? 'text-emerald-200 bg-emerald-500/10 ring-emerald-500/30' : 'text-stone-400 ring-stone-600')}>{on ? 'Battle on' : 'Resting'}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
