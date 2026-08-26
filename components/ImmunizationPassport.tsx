"use client";

import { useEffect, useState } from "react";
import {
    Check,
    CheckCircle2,
    Pencil,
    Plus,
    ShieldCheck,
    Syringe,
    Trash2,
    X,
} from "lucide-react";
import {
    deleteImmunizationPassportEntry,
    saveImmunizationPassportEntry,
} from "@/app/actions/immunizationPassport";
import AnimatedModal from "@/components/AnimatedModal";
import { Label } from "@/components/ui/label";
import {
    createDoseFields,
    getImmunizationProgress,
    MAX_IMMUNIZATION_DOSES,
    type ImmunizationDose,
    type ImmunizationPassportEntry,
} from "@/lib/immunizationPassport";

type ImmunizationPassportProps = {
    initialEntries: ImmunizationPassportEntry[];
};

type PassportForm = {
    id?: string;
    disease: string;
    immunizationName: string;
    dosesRequired: number;
    doses: ImmunizationDose[];
};

const EMPTY_FORM: PassportForm = {
    disease: "",
    immunizationName: "",
    dosesRequired: 1,
    doses: createDoseFields(1),
};

function formatDoseDate(value: string) {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-CA", {
        dateStyle: "medium",
        timeZone: "UTC",
    }).format(date);
}

export default function ImmunizationPassport({
    initialEntries,
}: ImmunizationPassportProps) {
    const [entries, setEntries] = useState(initialEntries);
    const [form, setForm] = useState<PassportForm>(EMPTY_FORM);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setEntries(initialEntries);
    }, [initialEntries]);

    function openAddModal() {
        setForm({ ...EMPTY_FORM, doses: createDoseFields(1) });
        setError(null);
        setMessage(null);
        setIsModalOpen(true);
    }

    function openEditModal(entry: ImmunizationPassportEntry) {
        setForm({
            id: entry.id,
            disease: entry.disease,
            immunizationName: entry.immunizationName,
            dosesRequired: entry.dosesRequired,
            doses: createDoseFields(entry.dosesRequired, entry.doses),
        });
        setError(null);
        setMessage(null);
        setIsModalOpen(true);
    }

    function updateDoseCount(nextCount: number) {
        const dosesRequired = Math.min(
            MAX_IMMUNIZATION_DOSES,
            Math.max(1, Math.trunc(nextCount) || 1)
        );
        setForm((current) => ({
            ...current,
            dosesRequired,
            doses: createDoseFields(dosesRequired, current.doses),
        }));
    }

    function updateDose(
        doseNumber: number,
        field: "administeredOn" | "location",
        value: string
    ) {
        setForm((current) => ({
            ...current,
            doses: current.doses.map((dose) =>
                dose.doseNumber === doseNumber
                    ? { ...dose, [field]: value }
                    : dose
            ),
        }));
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSaving(true);
        setError(null);
        setMessage(null);

        const result = await saveImmunizationPassportEntry(form);
        setIsSaving(false);

        if (!result.ok || !result.entry) {
            setError(result.message);
            return;
        }

        setEntries((current) => {
            const remaining = current.filter(
                (entry) => entry.id !== result.entry?.id
            );
            return [result.entry!, ...remaining];
        });
        setMessage(result.message);
        setIsModalOpen(false);
    }

    async function handleDelete() {
        if (!form.id || isDeleting) return;
        if (!window.confirm("Remove this immunization passport entry?")) return;

        setIsDeleting(true);
        setError(null);
        const result = await deleteImmunizationPassportEntry(form.id);
        setIsDeleting(false);

        if (!result.ok) {
            setError(result.message);
            return;
        }

        setEntries((current) =>
            current.filter((entry) => entry.id !== form.id)
        );
        setMessage(result.message);
        setIsModalOpen(false);
    }

    return (
        <>
            <section
                aria-labelledby="immunization-passport-title"
                className="rounded-[1.5rem] border border-lime-300/20 bg-[radial-gradient(circle_at_top_right,rgba(var(--vaivia-neon-rgb),0.12),transparent_34%),rgba(255,255,255,0.06)] p-4 shadow-xl shadow-black/20"
            >
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 text-lime-200">
                            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                            <p className="text-xs font-black uppercase tracking-[0.22em]">
                                Super admin only
                            </p>
                        </div>
                        <h3
                            id="immunization-passport-title"
                            className="mt-2 text-2xl font-black text-white"
                        >
                            Immunization Passport
                        </h3>
                        <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-400">
                            Keep a private dose-by-dose record of your received
                            immunizations.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={openAddModal}
                        className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200"
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add immunization
                    </button>
                </div>

                {message ? (
                    <p className="mt-4 rounded-2xl border border-lime-300/25 bg-lime-300/10 px-4 py-3 text-sm font-bold text-lime-100">
                        {message}
                    </p>
                ) : null}

                {entries.length > 0 ? (
                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {entries.map((entry) => {
                            const progress = getImmunizationProgress(entry);
                            return (
                                <article
                                    key={entry.id}
                                    className="rounded-[1.35rem] border border-white/10 bg-slate-950/65 p-4 shadow-lg shadow-black/20"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <span
                                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
                                                    progress.isComplete
                                                        ? "border-emerald-300/35 bg-emerald-300/15 text-emerald-200"
                                                        : "border-lime-300/25 bg-lime-300/10 text-lime-200"
                                                }`}
                                            >
                                                {progress.isComplete ? (
                                                    <CheckCircle2
                                                        className="h-5 w-5"
                                                        aria-hidden="true"
                                                    />
                                                ) : (
                                                    <Syringe
                                                        className="h-5 w-5"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-lime-200">
                                                    {entry.disease}
                                                </p>
                                                <h4 className="mt-1 text-lg font-black leading-tight text-white">
                                                    {entry.immunizationName}
                                                </h4>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => openEditModal(entry)}
                                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-200 transition hover:border-lime-300/30 hover:text-lime-100"
                                            aria-label={`Update ${entry.immunizationName}`}
                                        >
                                            <Pencil
                                                className="h-4 w-4"
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </div>

                                    {progress.isComplete ? (
                                        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm font-black text-emerald-100">
                                            <Check className="h-4 w-4" aria-hidden="true" />
                                            Completed · {progress.completedDoses} of{" "}
                                            {progress.dosesRequired} doses
                                        </div>
                                    ) : (
                                        <div className="mt-4">
                                            <div className="flex items-center justify-between gap-3 text-xs font-black text-slate-300">
                                                <span>In progress</span>
                                                <span>
                                                    {progress.completedDoses} of{" "}
                                                    {progress.dosesRequired} doses
                                                </span>
                                            </div>
                                            <div
                                                className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
                                                role="progressbar"
                                                aria-label={`${entry.immunizationName} dose progress`}
                                                aria-valuemin={0}
                                                aria-valuemax={progress.dosesRequired}
                                                aria-valuenow={progress.completedDoses}
                                            >
                                                <div
                                                    className="h-full rounded-full bg-lime-300 transition-[width]"
                                                    style={{
                                                        width: `${progress.percentage}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
                                        {entry.doses
                                            .filter((dose) => dose.administeredOn)
                                            .map((dose) => (
                                                <div
                                                    key={dose.doseNumber}
                                                    className="flex items-start justify-between gap-3 text-xs"
                                                >
                                                    <span className="font-black text-slate-300">
                                                        Dose {dose.doseNumber}
                                                    </span>
                                                    <span className="text-right font-semibold text-slate-400">
                                                        {formatDoseDate(
                                                            dose.administeredOn
                                                        )}
                                                        <span className="block text-slate-500">
                                                            {dose.location}
                                                        </span>
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm font-semibold text-slate-300">
                        No immunizations added yet. Use the add button to start
                        your private passport.
                    </p>
                )}
            </section>

            {isModalOpen ? (
                <AnimatedModal
                    onClose={() => setIsModalOpen(false)}
                    panelClassName="max-w-3xl overflow-hidden rounded-[2rem] border-white/10 bg-[#050712] text-white shadow-2xl shadow-black/50"
                    labelledBy="immunizationPassportModalTitle"
                >
                    {({ requestClose }) => (
                        <form onSubmit={handleSubmit}>
                            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-200">
                                        Immunization Passport
                                    </p>
                                    <h2
                                        id="immunizationPassportModalTitle"
                                        className="mt-2 text-3xl font-black"
                                    >
                                        {form.id
                                            ? "Update immunization"
                                            : "Add immunization"}
                                    </h2>
                                    <p className="mt-2 text-sm font-semibold text-slate-400">
                                        The first dose is required. Leave later
                                        doses blank until you receive them.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={requestClose}
                                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:bg-white/[0.14]"
                                    aria-label="Close immunization form"
                                >
                                    <X className="h-5 w-5" aria-hidden="true" />
                                </button>
                            </div>

                            <div className="max-h-[min(68vh,46rem)] space-y-5 overflow-y-auto p-6">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <Label
                                            htmlFor="immunizationDisease"
                                            className="text-sm font-black text-white"
                                        >
                                            Disease
                                        </Label>
                                        <input
                                            id="immunizationDisease"
                                            value={form.disease}
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    disease: event.target.value,
                                                }))
                                            }
                                            maxLength={120}
                                            required
                                            className="mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                            placeholder="e.g. Hepatitis A"
                                        />
                                    </div>
                                    <div>
                                        <Label
                                            htmlFor="immunizationName"
                                            className="text-sm font-black text-white"
                                        >
                                            Immunization name
                                        </Label>
                                        <input
                                            id="immunizationName"
                                            value={form.immunizationName}
                                            onChange={(event) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    immunizationName:
                                                        event.target.value,
                                                }))
                                            }
                                            maxLength={160}
                                            required
                                            className="mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                            placeholder="e.g. Havrix"
                                        />
                                    </div>
                                    <div>
                                        <Label
                                            htmlFor="immunizationDosesRequired"
                                            className="text-sm font-black text-white"
                                        >
                                            Doses required
                                        </Label>
                                        <input
                                            id="immunizationDosesRequired"
                                            type="number"
                                            min={1}
                                            max={MAX_IMMUNIZATION_DOSES}
                                            step={1}
                                            value={form.dosesRequired}
                                            onChange={(event) =>
                                                updateDoseCount(
                                                    Number(event.target.value)
                                                )
                                            }
                                            required
                                            className="mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition focus:border-lime-300/50"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {form.doses.map((dose) => (
                                        <fieldset
                                            key={dose.doseNumber}
                                            className="rounded-[1.25rem] border border-white/10 bg-white/[0.05] p-4"
                                        >
                                            <legend className="px-2 text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                                Dose {dose.doseNumber}
                                                {dose.doseNumber === 1
                                                    ? " · Required"
                                                    : " · Optional until received"}
                                            </legend>
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div>
                                                    <Label
                                                        htmlFor={`immunizationDoseDate${dose.doseNumber}`}
                                                        className="text-sm font-black text-white"
                                                    >
                                                        {dose.doseNumber === 1
                                                            ? "Date of first dose"
                                                            : `Date of dose ${dose.doseNumber}`}
                                                    </Label>
                                                    <input
                                                        id={`immunizationDoseDate${dose.doseNumber}`}
                                                        type="date"
                                                        value={dose.administeredOn}
                                                        onChange={(event) =>
                                                            updateDose(
                                                                dose.doseNumber,
                                                                "administeredOn",
                                                                event.target.value
                                                            )
                                                        }
                                                        required={
                                                            dose.doseNumber === 1
                                                        }
                                                        className="mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition focus:border-lime-300/50 [color-scheme:dark]"
                                                    />
                                                </div>
                                                <div>
                                                    <Label
                                                        htmlFor={`immunizationDoseLocation${dose.doseNumber}`}
                                                        className="text-sm font-black text-white"
                                                    >
                                                        {dose.doseNumber === 1
                                                            ? "Location of first dose"
                                                            : `Location of dose ${dose.doseNumber}`}
                                                    </Label>
                                                    <input
                                                        id={`immunizationDoseLocation${dose.doseNumber}`}
                                                        value={dose.location}
                                                        onChange={(event) =>
                                                            updateDose(
                                                                dose.doseNumber,
                                                                "location",
                                                                event.target.value
                                                            )
                                                        }
                                                        maxLength={240}
                                                        required={
                                                            dose.doseNumber === 1
                                                        }
                                                        className="mt-2 min-h-11 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50"
                                                        placeholder="Clinic, city, or country"
                                                    />
                                                </div>
                                            </div>
                                        </fieldset>
                                    ))}
                                </div>

                                {error ? (
                                    <p className="rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
                                        {error}
                                    </p>
                                ) : null}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-6">
                                <div>
                                    {form.id ? (
                                        <button
                                            type="button"
                                            onClick={handleDelete}
                                            disabled={isSaving || isDeleting}
                                            className="inline-flex items-center gap-2 rounded-full border border-red-300/30 px-4 py-2 text-sm font-black text-red-100 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <Trash2
                                                className="h-4 w-4"
                                                aria-hidden="true"
                                            />
                                            {isDeleting ? "Removing..." : "Remove"}
                                        </button>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={requestClose}
                                        disabled={isSaving || isDeleting}
                                        className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSaving || isDeleting}
                                        className="rounded-full bg-lime-300 px-5 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isSaving
                                            ? "Saving..."
                                            : form.id
                                              ? "Save changes"
                                              : "Add immunization"}
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}
                </AnimatedModal>
            ) : null}
        </>
    );
}
