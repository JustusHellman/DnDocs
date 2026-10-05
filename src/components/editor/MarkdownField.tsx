import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { AtSign, Bold, Eye, Heading, Italic, Link2, List, ListChecks, PencilLine, Plus, Quote } from 'lucide-react';
import LinkModal from './LinkModal';
import QuickCreateModal from '../entity/QuickCreateModal';
import { Markdown } from '../entity/Markdown';
import { TypeIcon } from '../ui/bits';
import { useVisibleEntities } from '../../contexts/CampaignDataContext';
import { typeMeta } from '../../lib/entityTypes';
import { normalize } from '../../lib/text';
import type { Entity } from '../../types';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Minimum height in px; the field grows with its text. */
  height?: number;
  placeholder?: string;
  /** Enables @mentions and the "Entry" link button. */
  entityLinks?: boolean;
  source?: Pick<Entity, 'id' | 'name'>;
  id?: string;
}

interface Mention {
  /** Index of the "@" in the text. */
  start: number;
  query: string;
  top: number;
  left: number;
}

/** Markdown for a link to an entry. */
export const entryLink = (name: string, id: string) => `[${name.replace(/[[\]]/g, '')}](/entity/${id})`;

const MENTION_RE = /(^|[\s([{"'“])@([^\s@[\]()][^@[\]()\n]{0,40})?$/;

/**
 * Lightweight markdown editor: a plain textarea that grows with its content, a small toolbar,
 * a Write / Preview switch and @mentions to link other entries while typing.
 */
export default function MarkdownField({ value, onChange, height = 220, placeholder, entityLinks = true, source, id }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [mention, setMention] = useState<Mention | null>(null);
  const [active, setActive] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [creating, setCreating] = useState<{ name: string; start: number; end: number } | null>(null);
  const visible = useVisibleEntities();
  /** The user moved through the suggestions (so Enter on "Create…" is deliberate). */
  const navigated = useRef(false);

  // Grow with the content (up to most of the screen, then scroll).
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(height, Math.min(ta.scrollHeight + 2, window.innerHeight * 0.75))}px`;
  }, [value, height, preview]);

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = normalize(mention.query.trim());
    return visible
      .filter((e) => e.id !== source?.id && (!q || normalize(e.name).includes(q)))
      .sort((a, b) => {
        const as = normalize(a.name).startsWith(q) ? 0 : 1;
        const bs = normalize(b.name).startsWith(q) ? 0 : 1;
        return as - bs || a.name.localeCompare(b.name);
      })
      .slice(0, 7);
  }, [mention, visible, source?.id]);

  /** Replace [start, end) with text, keeping the browser's undo history where possible. */
  const replaceRange = useCallback(
    (start: number, end: number, text: string, select?: [number, number]) => {
      const ta = taRef.current;
      if (!ta) {
        onChange(value.slice(0, start) + text + value.slice(end));
        return;
      }
      ta.focus();
      ta.setSelectionRange(start, end);
      const ok = document.execCommand?.('insertText', false, text);
      if (!ok) {
        ta.setRangeText(text, start, end, 'end');
        onChange(ta.value);
      }
      if (select) ta.setSelectionRange(select[0], select[1]);
    },
    [onChange, value],
  );

  const detectMention = () => {
    const ta = taRef.current;
    if (!entityLinks || !ta || ta.selectionStart !== ta.selectionEnd) return setMention(null);
    const before = ta.value.slice(0, ta.selectionStart);
    const m = before.match(MENTION_RE);
    if (!m) return setMention(null);
    const query = m[2] ?? '';
    // Stop suggesting once a multi-word query matches nothing (it's just an "@" in prose).
    const q = normalize(query.trim());
    if (query.split(' ').length > 4 || (query.includes(' ') && !visible.some((e) => normalize(e.name).includes(q)))) return setMention(null);
    const start = ta.selectionStart - query.length - 1;
    const pos = caretPosition(ta, start);
    setMention((prev) => {
      if (prev?.start !== start) {
        setActive(0);
        navigated.current = false;
      }
      return { start, query, ...pos };
    });
  };

  const insertMention = (entity: Pick<Entity, 'id' | 'name'>) => {
    const ta = taRef.current;
    if (!mention || !ta) return;
    const end = ta.selectionStart;
    replaceRange(mention.start, end, entryLink(entity.name, entity.id) + ' ');
    setMention(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention) {
      const count = matches.length + 1; // + "create"
      if (e.key === 'ArrowDown') return e.preventDefault(), (navigated.current = true), setActive((a) => (a + 1) % count);
      if (e.key === 'ArrowUp') return e.preventDefault(), (navigated.current = true), setActive((a) => (a - 1 + count) % count);
      if (e.key === 'Escape') return e.preventDefault(), setMention(null);
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (active < matches.length) {
          e.preventDefault();
          return insertMention(matches[active]);
        }
        if (mention.query.trim() && navigated.current) {
          e.preventDefault();
          return startCreate();
        }
        setMention(null); // nothing chosen: Enter is just a new line
      }
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'b') return e.preventDefault(), wrap('**');
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'i') return e.preventDefault(), wrap('*');
    if (mod && e.key.toLowerCase() === 'k' && entityLinks) return e.preventDefault(), openLinkModal();
    if (e.key === 'Enter' && !mod && !e.shiftKey) continueList(e);
  };

  /** Pressing Enter inside a list starts the next bullet (or ends the list on an empty one). */
  const continueList = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if (ta.selectionStart !== ta.selectionEnd) return;
    const lineStart = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    const line = ta.value.slice(lineStart, ta.selectionStart);
    const m = line.match(/^(\s*)([-*+]|\d+\.)( \[[ x]\])? /);
    if (!m) return;
    e.preventDefault();
    if (line.trim() === m[0].trim()) {
      replaceRange(lineStart, ta.selectionStart, '');
      return;
    }
    const marker = /\d+\./.test(m[2]) ? `${parseInt(m[2], 10) + 1}.` : m[2];
    replaceRange(ta.selectionStart, ta.selectionStart, `\n${m[1]}${marker}${m[3] ? ' [ ]' : ''} `);
  };

  const wrap = (mark: string, placeholderText = 'text') => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: en } = ta;
    const sel = ta.value.slice(s, en) || placeholderText;
    replaceRange(s, en, `${mark}${sel}${mark}`, [s + mark.length, s + mark.length + sel.length]);
  };

  const prefixLines = (prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: en } = ta;
    const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
    const block = ta.value.slice(lineStart, en);
    const lines = block.split('\n');
    const all = lines.every((l) => l.startsWith(prefix));
    const out = lines.map((l) => (all ? l.slice(prefix.length) : prefix + l)).join('\n');
    replaceRange(lineStart, en, out, [lineStart, lineStart + out.length]);
  };

  const insertWebLink = () => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: en } = ta;
    const sel = ta.value.slice(s, en) || 'link text';
    const text = `[${sel}](https://)`;
    replaceRange(s, en, text, [s + sel.length + 3, s + text.length - 1]);
  };

  const startMentionFromToolbar = () => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const needsSpace = s > 0 && !/\s/.test(ta.value[s - 1]);
    replaceRange(s, ta.selectionEnd, needsSpace ? ' @' : '@');
    requestAnimationFrame(detectMention);
  };

  const openLinkModal = () => {
    const ta = taRef.current;
    setSelectedText(ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : '');
    setLinkOpen(true);
  };

  const startCreate = () => {
    const ta = taRef.current;
    if (!mention || !ta) return;
    setCreating({ name: mention.query.trim(), start: mention.start, end: ta.selectionStart });
    setMention(null);
  };

  const tools: { label: string; icon: typeof Bold; run: () => void; desktopOnly?: boolean; accent?: boolean }[] = [
    { label: 'Bold (Ctrl+B)', icon: Bold, run: () => wrap('**') },
    { label: 'Italic (Ctrl+I)', icon: Italic, run: () => wrap('*') },
    { label: 'Heading', icon: Heading, run: () => prefixLines('### ') },
    { label: 'Bullet list', icon: List, run: () => prefixLines('- ') },
    { label: 'Checklist', icon: ListChecks, run: () => prefixLines('- [ ] '), desktopOnly: true },
    { label: 'Quote', icon: Quote, run: () => prefixLines('> '), desktopOnly: true },
    { label: 'Web link', icon: Link2, run: insertWebLink, desktopOnly: true },
  ];

  return (
    <div id={id} className="md-field rounded-lg border border-stone-700 bg-stone-950/40 focus-within:border-amber-600/70">
      <div className="flex items-center gap-0.5 border-b border-stone-800 px-1.5 py-1">
        {!preview &&
          tools.map((t) => (
            <button
              key={t.label}
              type="button"
              title={t.label}
              aria-label={t.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={t.run}
              className={clsx('btn-icon-sm', t.desktopOnly && 'max-sm:hidden')}
            >
              <t.icon size={15} />
            </button>
          ))}
        {!preview && entityLinks && (
          <button
            type="button"
            title="Mention an entry (type @ or Ctrl+K)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={startMentionFromToolbar}
            className="btn btn-ghost btn-sm ml-1 gap-1 px-2 text-amber-400"
          >
            <AtSign size={14} /> Entry
          </button>
        )}
        <div className="ml-auto flex rounded-md bg-stone-900/70 p-0.5 text-xs font-semibold">
          {(
            [
              [false, 'Write', PencilLine],
              [true, 'Preview', Eye],
            ] as const
          ).map(([p, label, Icon]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setPreview(p);
                setMention(null);
              }}
              aria-pressed={preview === p}
              className={clsx('flex items-center gap-1 rounded px-2 py-1', preview === p ? 'bg-stone-700 text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-300')}
            >
              <Icon size={13} />
              <span className="max-sm:hidden">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        {preview ? (
          <div className="px-4 py-3" style={{ minHeight: height }}>
            {value.trim() ? <Markdown source={value} /> : <p className="text-sm text-stone-500 italic">Nothing written yet.</p>}
          </div>
        ) : (
          <textarea
            ref={taRef}
            value={value}
            placeholder={placeholder ?? (entityLinks ? 'Write freely. Type @ to link another entry.' : undefined)}
            onChange={(e) => {
              onChange(e.target.value);
              requestAnimationFrame(detectMention);
            }}
            onKeyDown={onKeyDown}
            onClick={detectMention}
            onKeyUp={(e) => ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && detectMention()}
            onBlur={() => setTimeout(() => setMention(null), 150)}
            spellCheck
            className="block w-full resize-none bg-transparent px-4 py-3 font-sans text-base leading-relaxed text-stone-100 placeholder:text-stone-500 focus:outline-none"
            style={{ minHeight: height }}
          />
        )}

        {mention && !preview && (
          <div
            className="absolute z-30 w-64 max-w-[calc(100%-1rem)] overflow-hidden rounded-lg border border-stone-700 bg-stone-900 shadow-xl"
            style={{ top: mention.top, left: Math.min(mention.left, (taRef.current?.clientWidth ?? 300) - 260) }}
            role="listbox"
            onMouseDown={(e) => e.preventDefault()}
          >
            {matches.map((e, i) => (
              <button
                key={e.id}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => insertMention(e)}
                className={clsx('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', i === active ? 'bg-stone-800 text-stone-100' : 'text-stone-300')}
              >
                <TypeIcon type={e.type} size={15} className="shrink-0 text-stone-500" />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="text-[11px] text-stone-500">{typeMeta(e.type).label}</span>
              </button>
            ))}
            {mention.query.trim() ? (
              <button
                type="button"
                role="option"
                aria-selected={active === matches.length}
                onMouseMove={() => {
                  navigated.current = true;
                  setActive(matches.length);
                }}
                onClick={startCreate}
                className={clsx('flex w-full items-center gap-2 border-t border-stone-800 px-3 py-2 text-left text-sm text-amber-400', active === matches.length && 'bg-stone-800')}
              >
                <Plus size={15} /> Create “{mention.query.trim()}”
              </button>
            ) : (
              matches.length === 0 && <p className="px-3 py-2 text-sm text-stone-500">Start typing a name…</p>
            )}
          </div>
        )}
      </div>

      {entityLinks && (
        <LinkModal
          open={linkOpen}
          onClose={() => setLinkOpen(false)}
          initialText={selectedText}
          excludeId={source?.id}
          source={source}
          onInsert={(text, entityId) => {
            const ta = taRef.current;
            const md = entryLink(text, entityId);
            if (ta) replaceRange(ta.selectionStart, ta.selectionEnd, md);
            else onChange(`${value}${value && !value.endsWith(' ') ? ' ' : ''}${md}`);
          }}
        />
      )}
      {entityLinks && (
        <QuickCreateModal
          open={!!creating}
          onClose={() => setCreating(null)}
          initialName={creating?.name ?? ''}
          source={source?.id ? source : undefined}
          onCreated={(e) => {
            if (creating) replaceRange(creating.start, creating.end, entryLink(e.name, e.id) + ' ');
            setCreating(null);
          }}
        />
      )}
    </div>
  );
}

/** Pixel position (relative to the textarea's box) just below the character at `index`. */
function caretPosition(ta: HTMLTextAreaElement, index: number) {
  const style = getComputedStyle(ta);
  const mirror = document.createElement('div');
  for (const p of ['boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth', 'tabSize'] as const) {
    mirror.style[p] = style[p];
  }
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '-9999px' });
  mirror.textContent = ta.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = '@';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop + marker.offsetHeight - ta.scrollTop + 4;
  const left = marker.offsetLeft;
  mirror.remove();
  return { top, left: Math.max(8, left) };
}
