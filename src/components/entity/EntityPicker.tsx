import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { Popover } from '../ui/Popover';
import { TypeIcon } from '../ui/bits';
import { typeMeta, TYPES_BY_SIZE } from '../../lib/entityTypes';
import { normalize } from '../../lib/text';
import type { Entity } from '../../types';

interface Props {
  options: Entity[];
  value: string | null | undefined;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Offer "Create “term”" when nothing matches exactly. */
  onCreateNew?: (name: string) => void;
  /** Keep the given type order for groups (defaults to largest → smallest). */
  typeOrder?: string[];
  allowClear?: boolean;
  id?: string;
  disabled?: boolean;
}

/** Searchable, grouped entity select that works with touch and keyboard. */
export default function EntityPicker({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  onCreateNew,
  typeOrder = TYPES_BY_SIZE,
  allowClear = true,
  id,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [cursor, setCursor] = useState(0);
  const anchor = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.id === value);

  const flat = useMemo(() => {
    const t = normalize(term.trim());
    const filtered = t ? options.filter((o) => normalize(o.name).includes(t) || o.type.includes(t)) : options;
    return [...filtered].sort((a, b) => {
      const ta = typeOrder.indexOf(a.type);
      const tb = typeOrder.indexOf(b.type);
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name);
    });
  }, [options, term, typeOrder]);

  const exact = options.some((o) => normalize(o.name) === normalize(term.trim()));
  const showCreate = !!onCreateNew && term.trim().length > 0 && !exact;

  const close = () => {
    setOpen(false);
    setTerm('');
    setCursor(0);
  };

  const choose = (entity: Entity) => {
    onChange(entity.id);
    close();
  };

  let lastType = '';

  return (
    <>
      <div className="relative">
        <button
          id={id}
          ref={anchor}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={clsx('input flex items-center gap-2 text-left', allowClear && selected && 'pr-16')}
        >
          {selected ? (
            <>
              <TypeIcon type={selected.type} className="shrink-0 text-stone-400" />
              <span className="min-w-0 flex-1 truncate">{selected.name}</span>
            </>
          ) : (
            <span className="flex-1 truncate text-stone-500">{placeholder}</span>
          )}
          <ChevronDown size={16} className="ml-auto shrink-0 text-stone-500" />
        </button>
        {allowClear && selected && !disabled && (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => onChange('')}
            className="btn-icon-sm absolute top-1/2 right-8 -translate-y-1/2"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <Popover anchorRef={anchor} open={open} onClose={close} width={Math.max(280, anchor.current?.offsetWidth ?? 0)} align="start">
        <div className="sticky top-0 z-10 -m-1.5 mb-1 border-b border-stone-800 bg-stone-900 p-2">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-500" />
            <input
              autoFocus
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setCursor(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, flat.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (flat[cursor]) choose(flat[cursor]);
                  else if (showCreate) {
                    onCreateNew!(term.trim());
                    close();
                  }
                }
              }}
              placeholder="Search…"
              className="input min-h-9 py-1.5 pl-8"
            />
          </div>
        </div>
        <div role="listbox" className="max-h-72">
          {showCreate && (
            <button
              type="button"
              onClick={() => {
                onCreateNew!(term.trim());
                close();
              }}
              className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-emerald-300 hover:bg-emerald-950/40"
            >
              <Plus size={15} /> Create “{term.trim()}”
            </button>
          )}
          {flat.length === 0 && !showCreate && <p className="px-3 py-6 text-center text-sm text-stone-500">Nothing found</p>}
          {flat.map((o, i) => {
            const header = o.type !== lastType;
            lastType = o.type;
            return (
              <div key={o.id}>
                {header && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-wider text-stone-500 uppercase">{typeMeta(o.type).plural}</div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={o.id === value}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(o)}
                  className={clsx(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm',
                    i === cursor ? 'bg-stone-800 text-stone-50' : 'text-stone-300',
                    o.id === value && 'text-amber-300',
                  )}
                >
                  <TypeIcon type={o.type} className="shrink-0 text-stone-500" />
                  <span className="truncate">{o.name}</span>
                </button>
              </div>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
