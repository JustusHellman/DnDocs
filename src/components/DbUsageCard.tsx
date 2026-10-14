import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Copy, RotateCcw } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { meterReport, meterToday, onMeterChange, resetMeter } from '../lib/dbMeter';

/** Free plan limits per day (for the whole project, all devices together). */
const FREE_WRITES = 20_000;
const FREE_READS = 50_000;

function top(m: Record<string, number>, n: number) {
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/** DM tools: what this device read from and wrote to the database today. */
export default function DbUsageCard() {
  const toast = useToast();
  const [, setTick] = useState(0);
  useEffect(() => onMeterChange(() => setTick((t) => t + 1)), []);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 5000);
    return () => window.clearInterval(id);
  }, []);
  const s = meterToday();
  const hours = Object.entries(s.hours).sort();
  const maxH = Math.max(1, ...hours.map(([, c]) => c.w));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(meterReport());
      toast.success('Report copied');
    } catch (err) {
      toast.error(err, 'Copy');
    }
  };

  return (
    <section id="db-usage" className="card p-5 md:col-span-2 xl:col-span-3">
      <h2 className="section-title mb-1 flex items-center gap-2">
        <Activity size={18} /> Database use (this device, today)
      </h2>
      <p className="mb-4 text-sm text-stone-500">
        What this browser read and wrote today. The free plan allows {FREE_WRITES.toLocaleString()} writes and {FREE_READS.toLocaleString()} reads a day for everyone together; other people's
        devices count too, but aren't shown here.
      </p>
      <div className="mb-4 flex flex-wrap gap-6">
        <div>
          <div className="font-display text-3xl font-semibold tabular-nums text-stone-50">{s.writes.toLocaleString()}</div>
          <div className="text-xs text-stone-500">writes ({Math.round((s.writes / FREE_WRITES) * 100)}% of a day)</div>
        </div>
        <div>
          <div className="font-display text-3xl font-semibold tabular-nums text-stone-50">{s.reads.toLocaleString()}</div>
          <div className="text-xs text-stone-500">reads ({Math.round((s.reads / FREE_READS) * 100)}% of a day)</div>
        </div>
      </div>

      {hours.length > 0 && (
        <div className="mb-4 space-y-1">
          {hours.map(([h, c]) => (
            <div key={h} className="flex items-center gap-2 text-xs">
              <span className="w-12 shrink-0 tabular-nums text-stone-500">{h}:00</span>
              <span className="h-2 rounded bg-amber-500/70" style={{ width: `${Math.max(2, (c.w / maxH) * 60)}%` }} />
              <span className="tabular-nums text-stone-400">
                {c.w} w · {c.r} r
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-stone-400 uppercase">Most writes</h3>
          {top(s.writeBy, 10).length ? (
            <ul className="space-y-0.5 text-sm">
              {top(s.writeBy, 10).map(([k, v]) => (
                <li key={k} className="flex gap-2">
                  <span className="w-14 shrink-0 text-right tabular-nums text-stone-200">{v}</span>
                  <span className="min-w-0 truncate font-mono text-xs leading-5 text-stone-400">{k}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">None yet.</p>
          )}
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-stone-400 uppercase">Most reads</h3>
          {top(s.readBy, 10).length ? (
            <ul className="space-y-0.5 text-sm">
              {top(s.readBy, 10).map(([k, v]) => (
                <li key={k} className="flex gap-2">
                  <span className="w-14 shrink-0 text-right tabular-nums text-stone-200">{v}</span>
                  <span className="min-w-0 truncate font-mono text-xs leading-5 text-stone-400">{k}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">None yet.</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
          <Copy size={14} /> Copy report
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={resetMeter}>
          <RotateCcw size={14} /> Start counting again
        </button>
      </div>
    </section>
  );
}

/** Anywhere in the app: a loud warning when this device suddenly writes a lot. */
export function RunawayWarning() {
  const toast = useToast();
  const navigate = useNavigate();
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ count: number; top?: string }>).detail;
      toast.show(`DnDocs wrote to the database ${d.count} times in the last minute (mostly: ${d.top ?? 'unknown'}). DM tools → Database use shows what.`, {
        kind: 'error',
        duration: 20_000,
        action: { label: 'Show', onClick: () => navigate('/tools') },
      });
    };
    window.addEventListener('dndocs:runaway', on);
    return () => window.removeEventListener('dndocs:runaway', on);
  }, [toast, navigate]);
  return null;
}
