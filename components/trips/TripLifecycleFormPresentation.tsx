"use client";

import { Archive, ImagePlus, Plus, RotateCcw, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import type { MobileTripLegMutationInput } from "@/lib/mobileApi/contracts";

export type TripLifecycleFormValues = {
  title: string;
  slug: string;
  destination: string;
  startDate: string;
  endDate: string;
  notes: string;
  legs: MobileTripLegMutationInput[];
};

const inputClass =
  "min-h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-base text-white outline-none placeholder:text-white/35 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/25 disabled:cursor-not-allowed disabled:opacity-55";
const labelClass = "grid gap-1.5 text-sm font-bold text-white/85";

export function TripLifecycleShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-10 pt-24 text-white sm:px-6">
      <div className="mx-auto grid max-w-3xl gap-5">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-300">{eyebrow}</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.04em]">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">{description}</p> : null}
        </header>
        {children}
      </div>
    </main>
  );
}

export function TripLifecycleCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/20 sm:p-5">
      <h2 className="text-lg font-black tracking-[-0.02em]">{title}</h2>
      {description ? <p className="mt-1 text-sm leading-5 text-white/55">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function TripLifecycleFormPresentation({
  values,
  onChange,
  onSubmit,
  submitLabel,
  isSubmitting,
  error,
  fieldErrors,
}: {
  values: TripLifecycleFormValues;
  onChange: (values: TripLifecycleFormValues) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  isSubmitting?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}) {
  const set = (patch: Partial<TripLifecycleFormValues>) => onChange({ ...values, ...patch });
  const updateLeg = (index: number, patch: Partial<MobileTripLegMutationInput>) =>
    set({ legs: values.legs.map((leg, legIndex) => (legIndex === index ? { ...leg, ...patch } : leg)) });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <TripLifecycleCard title="Trip details" description="Use the same core details shown across VAIVIA.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={`${labelClass} sm:col-span-2`}>
            Trip title
            <input className={inputClass} value={values.title} onChange={(event) => set({ title: event.target.value })} required aria-invalid={Boolean(fieldErrors?.title)} />
            {fieldErrors?.title?.[0] ? <span className="text-xs text-red-200">{fieldErrors.title[0]}</span> : null}
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Trip link
            <div className="flex min-h-11 items-center rounded-xl border border-white/15 bg-black/25 pl-3 focus-within:border-fuchsia-400 focus-within:ring-2 focus-within:ring-fuchsia-400/25">
              <span className="text-sm text-white/40">vaivia.app/trips/</span>
              <input className="min-w-0 flex-1 bg-transparent px-1 py-2 text-base text-white outline-none" value={values.slug} onChange={(event) => set({ slug: event.target.value })} placeholder="created automatically" aria-invalid={Boolean(fieldErrors?.slug)} />
            </div>
            {fieldErrors?.slug?.[0] ? <span className="text-xs text-red-200">{fieldErrors.slug[0]}</span> : null}
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Destination
            <input className={inputClass} value={values.destination} onChange={(event) => set({ destination: event.target.value })} placeholder="Where are you going?" />
          </label>
          <label className={labelClass}>
            Start date
            <input type="date" className={inputClass} value={values.startDate} onChange={(event) => set({ startDate: event.target.value })} />
          </label>
          <label className={labelClass}>
            End date
            <input type="date" className={inputClass} value={values.endDate} min={values.startDate || undefined} onChange={(event) => set({ endDate: event.target.value })} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Notes
            <textarea className={`${inputClass} min-h-28 resize-y`} value={values.notes} onChange={(event) => set({ notes: event.target.value })} />
          </label>
        </div>
      </TripLifecycleCard>

      <TripLifecycleCard title="Destinations & dates" description="Add multiple legs when the trip moves between destinations.">
        <div className="grid gap-3">
          {values.legs.map((leg, index) => (
            <fieldset key={leg.id || index} className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:grid-cols-2">
              <legend className="px-1 text-xs font-black uppercase tracking-[0.16em] text-white/45">Leg {index + 1}</legend>
              <label className={`${labelClass} sm:col-span-2`}>
                Destination
                <input className={inputClass} value={leg.name} onChange={(event) => updateLeg(index, { name: event.target.value })} />
              </label>
              <label className={labelClass}>Arrival<input type="date" className={inputClass} value={leg.startDate || ""} onChange={(event) => updateLeg(index, { startDate: event.target.value })} /></label>
              <label className={labelClass}>Departure<input type="date" className={inputClass} value={leg.endDate || ""} onChange={(event) => updateLeg(index, { endDate: event.target.value })} /></label>
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300/20 px-3 text-sm font-bold text-red-100 sm:col-span-2" onClick={() => set({ legs: values.legs.filter((_, legIndex) => legIndex !== index) })}>
                <X className="h-4 w-4" aria-hidden="true" /> Remove leg
              </button>
            </fieldset>
          ))}
          <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-lime-300/35 bg-lime-300/[0.05] px-4 text-sm font-black text-lime-200" onClick={() => set({ legs: [...values.legs, { name: "", startDate: "", endDate: "" }] })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add destination leg
          </button>
        </div>
      </TripLifecycleCard>

      {error ? <p className="rounded-xl border border-red-300/25 bg-red-950/55 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
      <button type="submit" disabled={isSubmitting} className="min-h-12 rounded-xl bg-gradient-to-r from-lime-300 via-pink-500 to-violet-500 px-5 text-sm font-black text-slate-950 shadow-lg shadow-fuchsia-950/30 disabled:opacity-60">
        {isSubmitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export function TripDangerActionsPresentation({
  archived,
  isOwner,
  onArchive,
  onRestore,
  onDelete,
  disabled,
}: {
  archived: boolean;
  isOwner: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  if (!isOwner) return <p className="text-sm text-white/55">Only the trip owner can archive or delete this trip.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <button type="button" disabled={disabled} onClick={archived ? onRestore : onArchive} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold disabled:opacity-50">
        {archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{archived ? "Restore trip" : "Archive trip"}
      </button>
      <button type="button" disabled={disabled} onClick={onDelete} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300/25 bg-red-950/30 px-4 text-sm font-bold text-red-100 disabled:opacity-50">
        <Trash2 className="h-4 w-4" /> Delete permanently
      </button>
    </div>
  );
}

export function TripCollaborationActionsPresentation({ children }: { children: ReactNode }) {
  return <div className="grid gap-3">{children}</div>;
}

export function TripActionIcon({ kind }: { kind: "invite" | "family" | "cover" }) {
  const Icon = kind === "invite" ? UserPlus : kind === "family" ? UsersRound : ImagePlus;
  return <Icon className="h-4 w-4" aria-hidden="true" />;
}
