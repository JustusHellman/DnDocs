import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../ui/Modal';
import { TypeIcon } from '../ui/bits';
import QuickCreateModal from '../entity/QuickCreateModal';
import { useVisibleEntities } from '../../contexts/CampaignDataContext';
import { typeMeta } from '../../lib/entityTypes';
import { normalize } from '../../lib/text';
import type { Entity } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onInsert: (text: string, entityId: string) => void;
  initialText?: string;
  excludeId?: string;
  source?: Pick<Entity, 'id' | 'name'>;
}

export default function LinkModal({ open, onClose, onInsert, initialText = '', excludeId, source }: Props) {
  const visible = useVisibleEntities();
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setSearch(initialText);
      setText(initialText);
      setSelected(null);
    }
  }, [open, initialText]);

  const matches = useMemo(() => {
    const t = normalize(search.trim());
    return visible
      .filter((e) => e.id !== excludeId && (!t || normalize(e.name).includes(t)))
      .sort((a, b) => {
        if (t) {
          const as = normalize(a.name).startsWith(t) ? 0 : 1;
          const bs = normalize(b.name).startsWith(t) ? 0 : 1;
          if (as !== bs) return as - bs;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, 30);
  }, [visible, search, excludeId]);

  const chosen = visible.find((e) => e.id === selected);
  const insert = () => {
    if (!chosen) return;
    onInsert(text.trim() || chosen.name, chosen.id);
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Link to an entry"
        description="Readers can tap the link to open the entry."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!chosen} onClick={insert}>
              Insert link
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500" />
            <input
              autoFocus
              className="input pl-9"
              placeholder="Find an entry…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (chosen) insert();
                  else if (matches[0]) setSelected(matches[0].id);
                }
              }}
            />
          </div>
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {matches.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setSelected(e.id);
                  if (!text.trim()) setText(e.name);
                }}
                onDoubleClick={() => {
                  setSelected(e.id);
                  onInsert(text.trim() || e.name, e.id);
                  onClose();
                }}
                className={clsx(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm',
                  selected === e.id ? 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/40' : 'text-stone-300 hover:bg-stone-800',
                )}
              >
                <TypeIcon type={e.type} className="shrink-0 text-stone-500" />
                <span className="flex-1 truncate">{e.name}</span>
                <span className="text-xs text-stone-500">{typeMeta(e.type).label}</span>
              </button>
            ))}
            {matches.length === 0 && <p className="py-4 text-center text-sm text-stone-500">No entries match.</p>}
          </div>
          <button type="button" className="btn btn-ghost btn-sm text-emerald-300" onClick={() => setCreating(true)}>
            <Plus size={14} /> Create {search.trim() ? `“${search.trim()}”` : 'a new entry'}
          </button>
          <div>
            <label className="label" htmlFor="link-text">
              Link text
            </label>
            <input id="link-text" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={chosen?.name ?? 'Shown in the text'} />
          </div>
        </div>
      </Modal>
      <QuickCreateModal
        open={creating}
        onClose={() => setCreating(false)}
        initialName={search.trim()}
        source={source?.id ? source : undefined}
        onCreated={(e) => {
          onInsert(text.trim() || e.name, e.id);
          onClose();
        }}
      />
    </>
  );
}
