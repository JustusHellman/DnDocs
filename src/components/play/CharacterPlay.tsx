import { Wand2 } from 'lucide-react';
import { usePlayer } from '../../lib/play/usePlayer';
import { useTableLive } from '../../lib/play/live';
import PlayTracker from './PlayTracker';
import { useEffect } from 'react';
import { useActingCharacter } from './useActingCharacter';
import type { Entity } from '../../types';

/** On a character's page: the trackers, the spells and the rests (also usable outside combat). */
export default function CharacterPlay({ entity }: { entity: Entity }) {
  const p = usePlayer(entity);
  const { ready } = useTableLive();
  // Opening one of your characters makes it the one the spellbook button and the chat act for.
  const { choices, entity: acting, setId } = useActingCharacter();
  useEffect(() => {
    if (acting?.id !== entity.id && choices.some((c) => c.id === entity.id)) setId(entity.id);
  }, [entity.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null;
  return (
    <section className="card p-4">
      <h2 className="section-title mb-3 flex items-center gap-2">
        <Wand2 size={16} /> At the table
      </h2>
      {!ready && <p className="mb-2 text-xs text-stone-500 italic">Connecting to the table…</p>}
      <PlayTracker p={p} />
    </section>
  );
}
