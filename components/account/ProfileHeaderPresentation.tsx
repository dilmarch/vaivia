import type { ReactNode } from "react";

type ProfileHeaderPresentationProps = {
  displayName: string;
  subtitle: string;
  avatarUrl?: string | null;
  roleLabel: string;
  levelLabel: string;
  themeLabel: string;
  themeBadgeClass: string;
  joinedLabel: string;
  pointsLabel: string;
  nextLevel?: { level: number; pointsRemaining: number } | null;
  editAction?: ReactNode;
  signOutAction?: ReactNode;
  closeAction?: ReactNode;
};

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "V";
}

export function ProfileHeaderPresentation({
  displayName,
  subtitle,
  avatarUrl,
  roleLabel,
  levelLabel,
  themeLabel,
  themeBadgeClass,
  joinedLabel,
  pointsLabel,
  nextLevel,
  editAction,
  signOutAction,
  closeAction,
}: ProfileHeaderPresentationProps) {
  return (
    <div className="relative overflow-hidden border-b border-white/10 p-6 sm:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(var(--vaivia-neon-rgb),0.22),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(217,70,239,0.18),transparent_34%)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end">
          <span className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[2rem] border border-lime-300/30 bg-slate-950 text-4xl font-black text-lime-200 shadow-[0_0_44px_rgba(var(--vaivia-neon-rgb),0.22)]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={`${displayName} profile`}
                className="h-full w-full object-cover"
              />
            ) : (
              initial(displayName)
            )}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200">
              VAIVIA profile
            </p>
            <h2
              id="accountPreferencesTitle"
              className="mt-2 truncate text-4xl font-black tracking-tight text-white sm:text-5xl"
            >
              {displayName}
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-300">{subtitle}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex rounded-full border border-lime-300/35 bg-lime-300/[0.12] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-lime-100 shadow-xl shadow-black/20">
                {roleLabel}
              </span>
              <span className="inline-flex rounded-full border border-fuchsia-300/30 bg-fuchsia-300/[0.12] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-fuchsia-100 shadow-xl shadow-black/20">
                {levelLabel}
              </span>
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] shadow-xl shadow-black/20 ${themeBadgeClass}`}
              >
                {themeLabel}
              </span>
            </div>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Joined {joinedLabel}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <div className="rounded-[1.15rem] border border-lime-300/35 bg-lime-300 px-4 py-2 text-right text-slate-950 shadow-[0_0_34px_rgba(var(--vaivia-neon-rgb),0.24)]">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-950/65">
              Points
            </p>
            <p className="mt-0.5 text-xl font-black leading-none">{pointsLabel}</p>
            {nextLevel ? (
              <p className="mt-1 max-w-32 text-[10px] font-black uppercase leading-tight tracking-[0.12em] text-lime-950/65">
                {nextLevel.pointsRemaining.toLocaleString()} point
                {nextLevel.pointsRemaining === 1 ? "" : "s"} until Level {nextLevel.level}
              </p>
            ) : null}
          </div>
          {closeAction}
        </div>
      </div>
      {editAction || signOutAction ? (
        <div className="relative mt-6 flex flex-wrap gap-3">
          {editAction}
          {signOutAction}
        </div>
      ) : null}
    </div>
  );
}
