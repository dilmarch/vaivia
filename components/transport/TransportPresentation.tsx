"use client";

import type { ReactNode } from "react";

export type TransportPresentationMode = "transport" | "compare-flights";

type TabActionProps = {
  children: ReactNode;
  className: string;
  "aria-current"?: "page";
  "aria-label": string;
};

function TransportTab({
  label,
  active,
  disabled = false,
  renderAction,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  renderAction?: (props: TabActionProps) => ReactNode;
}) {
  const className = `rounded-full px-5 py-2.5 text-sm font-black uppercase tracking-wide transition ${
    active
      ? "bg-lime-300 text-slate-950 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.20)]"
      : "text-slate-300 hover:bg-white/10 hover:text-white"
  } ${disabled ? "cursor-not-allowed opacity-50" : ""}`;
  const actionProps: TabActionProps = {
    children: label,
    className,
    "aria-current": active ? "page" : undefined,
    "aria-label": label,
  };

  if (renderAction) return renderAction(actionProps);

  return <button type="button" disabled={disabled} {...actionProps} />;
}

export function TransportScopePresentation({
  showAll,
  onShowAllChange,
}: {
  showAll: boolean;
  onShowAllChange?: (showAll: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-3 text-white shadow-xl shadow-black/20">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
          Transport view
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-300">
          {showAll
            ? "Showing transportation for everyone on this trip."
            : "Showing transportation assigned to you."}
        </p>
      </div>
      <div className="inline-flex rounded-full border border-white/10 bg-[#03030a] p-1 shadow-inner shadow-black/30">
        <button
          type="button"
          onClick={() => onShowAllChange?.(false)}
          aria-pressed={!showAll}
          className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide transition ${
            !showAll
              ? "bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)]"
              : "text-slate-300 hover:bg-white/10 hover:text-white"
          }`}
        >
          My transport
        </button>
        <button
          type="button"
          onClick={() => onShowAllChange?.(true)}
          aria-pressed={showAll}
          className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide transition ${
            showAll
              ? "bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)]"
              : "text-slate-300 hover:bg-white/10 hover:text-white"
          }`}
        >
          All members
        </button>
      </div>
    </div>
  );
}

export function TransportPresentation({
  mode,
  showAll = false,
  onShowAllChange,
  renderTransportTab,
  renderCompareFlightsTab,
  compareFlightsDisabled = false,
  children,
}: {
  mode: TransportPresentationMode;
  showAll?: boolean;
  onShowAllChange?: (showAll: boolean) => void;
  renderTransportTab?: (props: TabActionProps) => ReactNode;
  renderCompareFlightsTab?: (props: TabActionProps) => ReactNode;
  compareFlightsDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5" data-transport-presentation={mode}>
      <div className="inline-flex rounded-full border border-white/10 bg-[#03030a] p-1 text-white shadow-2xl shadow-black/20">
        <TransportTab
          label="Transport"
          active={mode === "transport"}
          renderAction={renderTransportTab}
        />
        <TransportTab
          label="Compare Flights"
          active={mode === "compare-flights"}
          disabled={compareFlightsDisabled}
          renderAction={renderCompareFlightsTab}
        />
      </div>

      {mode === "transport" ? (
        <div className="space-y-4">
          <TransportScopePresentation
            showAll={showAll}
            onShowAllChange={onShowAllChange}
          />
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function TransportLoadingPresentation() {
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 sm:px-6">
      <div className="h-12 w-72 max-w-full animate-pulse rounded-full border border-white/10 bg-white/[0.05] motion-reduce:animate-none" />
      <div className="h-24 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.05] motion-reduce:animate-none" />
      <div className="h-96 animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.05] motion-reduce:animate-none" />
    </div>
  );
}
