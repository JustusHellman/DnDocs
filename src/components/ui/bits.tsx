import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Eye, Globe, Lock, Users } from 'lucide-react';
import { typeMeta } from '../../lib/entityTypes';
import { visibilityOf } from '../../lib/permissions';
import type { Entity, User } from '../../types';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-3 text-stone-500', className)} role="status">
      <div className="size-7 animate-spin rounded-full border-2 border-stone-700 border-t-amber-500" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return <Spinner className="min-h-dvh" label={label} />;
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon?: React.ElementType;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-col items-center rounded-2xl border border-dashed border-stone-800 px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-stone-900 text-stone-500">
          <Icon size={22} />
        </div>
      )}
      <h3 className="font-sans text-base font-semibold text-stone-200">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-stone-500">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-stone-800/60', className)} />;
}

export function Avatar({ user, size = 32, className }: { user?: Pick<User, 'displayName' | 'photoURL'> | null; size?: number; className?: string }) {
  const initial = user?.displayName?.trim()?.[0]?.toUpperCase() ?? '?';
  if (user?.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt=""
        referrerPolicy="no-referrer"
        style={{ width: size, height: size }}
        className={clsx('shrink-0 rounded-full border border-stone-700 object-cover', className)}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className={clsx('flex shrink-0 items-center justify-center rounded-full border border-stone-700 bg-stone-800 font-semibold text-amber-400', className)}
      aria-hidden
    >
      {initial}
    </div>
  );
}

export function TypeIcon({ type, size = 16, className }: { type: string; size?: number; className?: string }) {
  const Icon = typeMeta(type).icon;
  return <Icon size={size} className={className} aria-hidden />;
}

export function TypeBadge({ type, className }: { type: string; className?: string }) {
  const meta = typeMeta(type);
  const Icon = meta.icon;
  return (
    <span className={clsx('chip', meta.tone, className)}>
      <Icon size={11} aria-hidden />
      {meta.label}
    </span>
  );
}

/** Heraldic roundel with the entity type's icon, used in lists and headers. */
export function TypeTile({ type, size = 'md', thumb }: { type: string; size?: 'sm' | 'md' | 'lg'; thumb?: string | null }) {
  const meta = typeMeta(type);
  const Icon = meta.icon;
  const px = size === 'sm' ? 32 : size === 'md' ? 42 : 52;
  if (thumb)
    return (
      <div className={clsx('seal seal-photo', meta.tone.replace('tone ', ''))} style={{ width: px, height: px }} title={meta.label}>
        <img src={thumb} alt="" loading="lazy" draggable={false} />
      </div>
    );
  return (
    <div className={clsx('seal', meta.tone.replace('tone ', ''))} style={{ width: px, height: px }} title={meta.label}>
      <Icon size={size === 'sm' ? 17 : size === 'md' ? 22 : 28} aria-hidden />
    </div>
  );
}

export function VisibilityBadge({ entity, className, compact }: { entity: Pick<Entity, 'isPublic' | 'allowedPlayers'>; className?: string; compact?: boolean }) {
  const v = visibilityOf(entity);
  const cfg = {
    public: { icon: Globe, label: 'Public', tone: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/25' },
    shared: { icon: Users, label: 'Shared', tone: 'text-sky-300 bg-sky-500/10 ring-sky-500/25' },
    secret: { icon: Lock, label: 'Secret', tone: 'text-rose-300 bg-rose-500/10 ring-rose-500/25' },
  }[v];
  const Icon = cfg.icon;
  return (
    <span className={clsx('chip', cfg.tone, className)} title={cfg.label}>
      <Icon size={11} aria-hidden />
      {!compact && cfg.label}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-amber-500' : 'bg-stone-700',
      )}
    >
      <span className={clsx('inline-block size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ElementType;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" className={clsx('inline-flex rounded-lg border border-stone-800 bg-stone-950/60 p-0.5', className)}>
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label || o.value}
            title={o.label ? undefined : o.value}
            onClick={() => onChange(o.value)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors',
              size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active ? 'bg-stone-800 text-stone-50 shadow-sm' : 'text-stone-400 hover:text-stone-200',
            )}
          >
            {Icon && <Icon size={size === 'sm' ? 13 : 15} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('mb-6 flex flex-wrap items-center gap-x-4 gap-y-3', className)}>
      {icon}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-2xl font-semibold text-stone-50 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-stone-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={clsx('mx-auto w-full px-4 py-5 sm:px-6 sm:py-8 lg:px-8', wide ? 'max-w-7xl' : 'max-w-5xl', className)}>{children}</div>
  );
}

export function PlayerPreviewBanner({ onExit }: { onExit: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
      <Eye size={16} />
      <span className="flex-1">Player view — only things players can see are shown.</span>
      <button className="btn btn-ghost btn-sm" onClick={onExit}>
        Exit
      </button>
    </div>
  );
}
