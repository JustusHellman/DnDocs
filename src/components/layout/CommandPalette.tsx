import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Plus, Search } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../ui/Modal';
import { TypeIcon } from '../ui/bits';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaignData, useVisibleEntities } from '../../contexts/CampaignDataContext';
import { usePeek } from '../../contexts/PeekContext';
import { parseQuery, scoreEntity } from '../../lib/search';
import { menuTypes, typeMeta } from '../../lib/entityTypes';
import { navGroups } from './nav';

interface Command {
  key: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: (openPage: boolean) => void;
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isDM } = useAuth();
  const { canViewField, entityMap } = useCampaignData();
  const visible = useVisibleEntities();
  const { peek, items: recent } = usePeek();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (open) {
      setTerm('');
      setCursor(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const done = (fn: () => void) => () => {
      onClose();
      fn();
    };
    const q = parseQuery(term);
    const list: Command[] = [];

    const entityCommand = (e: (typeof visible)[number]): Command => ({
      key: `e-${e.id}`,
      label: e.name,
      hint: typeMeta(e.type).label,
      icon: <TypeIcon type={e.type} className="text-stone-400" />,
      run: (openPage) => {
        onClose();
        if (openPage) navigate(`/entity/${e.id}`);
        else peek(e);
      },
    });

    if (!term.trim()) {
      recent
        .map((r) => entityMap.get(r.id))
        .filter((e): e is NonNullable<typeof e> => !!e && visible.includes(e))
        .slice(0, 5)
        .forEach((e) => list.push(entityCommand(e)));
    } else {
      visible
        .map((e) => ({ e, s: scoreEntity(e, q, canViewField) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
        .slice(0, 8)
        .forEach(({ e }) => list.push(entityCommand(e)));

      list.push({
        key: 'search-all',
        label: `Search everything for “${term.trim()}”`,
        icon: <Search size={16} className="text-stone-400" />,
        run: done(() => navigate(`/search?q=${encodeURIComponent(term.trim())}`)),
      });
    }

    const t = term.trim().toLowerCase();
    navGroups().flatMap((g) => g.items)
      .filter((i) => (!i.dmOnly || isDM) && (!t || i.label.toLowerCase().includes(t)))
      .slice(0, t ? 4 : 0)
      .forEach((i) =>
        list.push({ key: `nav-${i.to}`, label: `Go to ${i.label}`, icon: <i.icon size={16} className="text-stone-400" />, run: done(() => navigate(i.to)) }),
      );

    menuTypes().filter((ty) => (isDM || ty.value === 'note') && (!t || `new ${ty.label}`.toLowerCase().includes(t) || (t.startsWith('new') && ty.label.toLowerCase().includes(t.slice(4)))))
      .slice(0, t ? 3 : 0)
      .forEach((ty) =>
        list.push({
          key: `new-${ty.value}`,
          label: `New ${ty.label}`,
          icon: <Plus size={16} className="text-stone-400" />,
          run: done(() => navigate(`/entity/new?type=${ty.value}`)),
        }),
      );

    return list;
  }, [term, visible, canViewField, recent, entityMap, isDM, navigate, onClose, peek]);

  useEffect(() => setCursor(0), [term]);

  return (
    <Modal open={open} onClose={onClose} bare size="lg" className="sm:mt-[-20vh]">
      <div className="flex items-center gap-3 border-b border-stone-800 px-4">
        <Search size={18} className="shrink-0 text-stone-500" />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, commands.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              commands[cursor]?.run(e.metaKey || e.ctrlKey || e.shiftKey);
            }
          }}
          placeholder="Search your campaign…  (#tag works too)"
          className="h-14 min-w-0 flex-1 bg-transparent text-base text-stone-100 placeholder:text-stone-500 outline-none"
          aria-label="Search"
        />
        <kbd className="kbd hidden sm:inline">Esc</kbd>
      </div>
      <div className="max-h-[60dvh] overflow-y-auto p-2">
        {!term.trim() && commands.length > 0 && <div className="px-3 pt-1 pb-1.5 text-[10px] font-bold tracking-wider text-stone-500 uppercase">Recent</div>}
        {commands.length === 0 && <p className="px-3 py-8 text-center text-sm text-stone-500">Type to search NPCs, places, quests, notes…</p>}
        {commands.map((c, i) => (
          <button
            key={c.key}
            type="button"
            onMouseMove={() => setCursor(i)}
            onClick={(e) => c.run(e.metaKey || e.ctrlKey || e.shiftKey)}
            className={clsx('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm', i === cursor ? 'bg-stone-800 text-stone-50' : 'text-stone-300')}
          >
            {c.icon}
            <span className="min-w-0 flex-1 truncate">{c.label}</span>
            {c.hint && <span className="shrink-0 text-xs text-stone-500">{c.hint}</span>}
            {i === cursor && <CornerDownLeft size={14} className="hidden shrink-0 text-stone-500 sm:block" />}
          </button>
        ))}
      </div>
      <div className="hidden items-center gap-4 border-t border-stone-800 px-4 py-2 text-[11px] text-stone-500 sm:flex">
        <span>
          <kbd className="kbd">↵</kbd> quick view
        </span>
        <span>
          <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">↵</kbd> open page
        </span>
      </div>
    </Modal>
  );
}
