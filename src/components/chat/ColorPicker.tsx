import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { PALETTE, textOn } from '../../lib/chat/colors';
import { colorOf, useTableColors } from '../../lib/chat/colorStore';
import { chatAvailable, setTableColor } from '../../lib/chat/service';
import { Popover } from '../ui/Popover';

/**
 * A person's table colour as a small dot; click it (yours, or anyone's for a DM) to pick another.
 * Colours someone else already has are shown with their initial and can't be taken.
 */
export default function ColorPicker({
  campaignId,
  uid,
  canEdit,
  names = {},
  size = 14,
}: {
  campaignId: string;
  uid: string;
  canEdit: boolean;
  /** uid → display name, for "taken by" hints. */
  names?: Record<string, string>;
  size?: number;
}) {
  const colors = useTableColors();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const mine = colorOf(colors, uid);
  const owner = new Map(Object.entries(colors).filter(([u]) => u !== uid).map(([u, c]) => [c.toLowerCase(), u]));
  const editable = canEdit && chatAvailable;

  const pick = async (hex: string) => {
    setOpen(false);
    try {
      await setTableColor(campaignId, uid, hex);
    } catch (err) {
      toast.error(err, 'Table colour');
    }
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        disabled={!editable}
        onClick={() => setOpen((o) => !o)}
        className={clsx('shrink-0 rounded-full ring-2 ring-stone-950/60', editable && 'cursor-pointer hover:ring-stone-300/70')}
        style={{ width: size, height: size, background: mine }}
        aria-label={editable ? 'Change table colour' : 'Table colour'}
        title={editable ? 'Your colour at the table (dice, pings, chat). Click to change.' : 'Their colour at the table'}
      />
      {editable && (
        <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={232}>
          <div className="px-1.5 pt-1 pb-2 text-xs text-stone-400">Colour at the table: dice, pings, rulers and chat.</div>
          <div className="grid grid-cols-6 gap-1.5 px-1.5 pb-1.5">
            {PALETTE.map((c) => {
              const takenBy = owner.get(c.hex.toLowerCase());
              const current = c.hex.toLowerCase() === mine.toLowerCase();
              return (
                <button
                  key={c.hex}
                  type="button"
                  disabled={!!takenBy}
                  onClick={() => pick(c.hex)}
                  title={takenBy ? `${c.name} · ${names[takenBy] ?? 'taken'}` : c.name}
                  aria-label={takenBy ? `${c.name}, taken` : c.name}
                  className={clsx(
                    'flex size-8 items-center justify-center rounded-full text-[11px] font-bold transition-transform',
                    takenBy ? 'cursor-not-allowed opacity-30' : 'hover:scale-110',
                    current && 'ring-2 ring-stone-100 ring-offset-2 ring-offset-stone-900',
                  )}
                  style={{ background: c.hex, color: textOn(c.hex) }}
                >
                  {current ? <Check size={14} /> : takenBy ? (names[takenBy]?.[0]?.toUpperCase() ?? '') : ''}
                </button>
              );
            })}
          </div>
        </Popover>
      )}
    </>
  );
}
