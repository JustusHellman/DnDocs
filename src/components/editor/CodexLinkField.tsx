import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Search, Unlink } from 'lucide-react';
import {
  type Catalog,
  type CatalogMonster,
  type CatalogThing,
  codexHash,
  type CodexKind,
  findInCatalog,
  loadCatalog,
  matchByName,
  searchCatalog,
} from '../../lib/codex/catalog';

type Rec = CatalogThing | CatalogMonster;

function describe(kind: CodexKind, r: Rec, cat: Catalog) {
  const pack = r.pack ? cat.packs[r.pack]?.title ?? r.pack : '';
  const bits =
    kind === 'monster'
      ? [(r as CatalogMonster).size, (r as CatalogMonster).type, (r as CatalogMonster).cr != null ? `CR ${(r as CatalogMonster).cr}` : '']
      : [(r as CatalogThing).kind === 'material' ? 'Material' : (r as CatalogThing).cat ?? 'Item', (r as CatalogThing).tier];
  return [...bits, pack].filter(Boolean).join(' · ');
}

/**
 * DM: link a monster or item entry to its Scavenger's Codex record. Suggests the record with the
 * same name; anything else is a search away. The entry itself stays free text.
 */
export default function CodexLinkField({ kind, name, value, onChange }: { kind: CodexKind; name: string; value: string | null; onChange: (id: string | null) => void }) {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  useEffect(() => {
    loadCatalog().then(setCat, (err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const linked = cat && value ? findInCatalog(cat, kind, value) : undefined;
  const suggested = useMemo(() => (cat && !value ? matchByName(cat, kind, name).slice(0, 3) : []), [cat, kind, name, value]);
  const results = useMemo(() => (cat && term.trim() ? searchCatalog(cat, kind, term, 8) : []), [cat, kind, term]);

  if (error) return <p className="text-sm text-stone-500">{error}</p>;
  if (!cat) return <p className="text-sm text-stone-500">Loading the Codex…</p>;

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-100">{linked?.name ?? value}</p>
          <p className="text-xs text-stone-500">{linked ? describe(kind, linked, cat) : 'Not in the Codex right now (its homebrew may be switched off).'}</p>
        </div>
        {linked && (
          <Link className="btn btn-secondary btn-sm" to={`/codex?open=${encodeURIComponent(codexHash(kind, linked))}`}>
            <ExternalLink size={14} /> Open in the Codex
          </Link>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
          <Unlink size={14} /> Unlink
        </button>
      </div>
    );
  }

  const pick = (r: Rec) => {
    onChange(r.id);
    setTerm('');
  };

  return (
    <div className="space-y-2">
      {suggested.map((r) => (
        <button key={r.id} type="button" className="btn btn-secondary btn-sm" onClick={() => pick(r)}>
          Link to {r.name} <span className="text-stone-500">({describe(kind, r, cat)})</span>
        </button>
      ))}
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500" />
        <input
          className="input pl-9"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={kind === 'monster' ? 'Find a Codex creature…' : 'Find a Codex item or material…'}
          aria-label="Search the Scavenger's Codex"
        />
      </div>
      {results.length > 0 && (
        <div className="space-y-0.5">
          {results.map((r) => (
            <button key={r.id} type="button" onClick={() => pick(r)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-stone-300 hover:bg-stone-800">
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="text-[11px] text-stone-500">{describe(kind, r, cat)}</span>
            </button>
          ))}
        </div>
      )}
      {!suggested.length && !term && <p className="hint">Optional. Linked entries open in the Codex, monsters can be harvested after a fight, and revealing the entry also adds it to the party’s Codex journal.</p>}
    </div>
  );
}
