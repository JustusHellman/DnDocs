import { useId, useState } from 'react';
import { X } from 'lucide-react';

export default function TagInput({ value, onChange, suggestions = [], id }: { value: string[]; onChange: (tags: string[]) => void; suggestions?: string[]; id?: string }) {
  const [text, setText] = useState('');
  const listId = useId();

  const add = (raw: string) => {
    const tags = raw
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);
    const next = [...value];
    for (const t of tags) if (!next.some((x) => x.toLowerCase() === t.toLowerCase())) next.push(t);
    onChange(next);
    setText('');
  };

  return (
    <div className="input flex h-auto flex-wrap items-center gap-1.5 py-1.5 focus-within:border-amber-500/70 focus-within:ring-2 focus-within:ring-amber-500/20">
      {value.map((t) => (
        <span key={t} className="tag bg-amber-500/10 text-amber-200">
          #{t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="-mr-1 rounded-full p-0.5 hover:bg-amber-500/20">
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={listId}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(',')) add(v);
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim()) {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => text.trim() && add(text)}
        placeholder={value.length ? '' : 'Add tags…'}
        enterKeyHint="done"
        className="min-w-24 flex-1 bg-transparent py-0.5 outline-none placeholder:text-stone-500"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.includes(s))
          .slice(0, 50)
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
