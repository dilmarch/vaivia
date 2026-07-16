"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import TripDestinationPicker from "@/components/TripDestinationPicker";
import { sanitizeTripSlugInput, slugifyTripTitle } from "@/lib/tripRoutes";

export type CreateTripFormState = {
    error?: string | null;
    fieldErrors?: {
        title?: string;
        slug?: string;
    };
    values?: {
        title?: string;
        slug?: string;
    };
};

type NewTripFormProps = {
    action: (
        state: CreateTripFormState,
        formData: FormData
    ) => Promise<CreateTripFormState>;
    nextTripNumber: number;
    isOnboarding?: boolean;
};

const initialState: CreateTripFormState = {
    error: null,
    fieldErrors: {},
    values: {},
};

const MAX_MATRIX_DESTINATIONS = 6;

function getDateDiffDays(startDate: string, endDate: string) {
    if (!startDate || !endDate) return null;

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

    return Math.max(
        0,
        Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    );
}

function formatDuration(days: number | null) {
    if (days == null) return "Auto";
    return `${days} day${days === 1 ? "" : "s"}`;
}

export default function NewTripForm({
    action,
    nextTripNumber,
    isOnboarding = false,
}: NewTripFormProps) {
    const [state, formAction, isPending] = useActionState(action, initialState);
    const [title, setTitle] = useState(state.values?.title || "");
    const [slug, setSlug] = useState(
        state.values?.slug || slugifyTripTitle("", nextTripNumber)
    );
    const [isSlugManual, setIsSlugManual] = useState(false);
    const [dateMode, setDateMode] = useState<"known" | "thinking">("known");
    const [visibleDestinationRows, setVisibleDestinationRows] = useState(0);
    const [startDestination, setStartDestination] = useState("");
    const [startDate, setStartDate] = useState("");
    const [nextDestinations, setNextDestinations] = useState(
        Array.from({ length: MAX_MATRIX_DESTINATIONS }, () => ({
            destination: "",
            arrivalDate: "",
        }))
    );
    const [returnDestination, setReturnDestination] = useState("");
    const [isReturnDestinationManual, setIsReturnDestinationManual] =
        useState(false);
    const [returnDate, setReturnDate] = useState("");

    useEffect(() => {
        if (isSlugManual) return;
        setSlug(slugifyTripTitle(title, nextTripNumber));
    }, [isSlugManual, nextTripNumber, title]);

    useEffect(() => {
        if (isReturnDestinationManual) return;
        setReturnDestination(startDestination);
    }, [isReturnDestinationManual, startDestination]);

    const matrixDates = useMemo(
        () => [
            startDate,
            ...nextDestinations
                .slice(0, visibleDestinationRows)
                .map((row) => row.arrivalDate),
            returnDate,
        ],
        [nextDestinations, returnDate, startDate, visibleDestinationRows]
    );
    const totalDuration = getDateDiffDays(startDate, returnDate);

    function updateNextDestination(
        index: number,
        key: "destination" | "arrivalDate",
        value: string
    ) {
        setNextDestinations((current) =>
            current.map((row, rowIndex) =>
                rowIndex === index ? { ...row, [key]: value } : row
            )
        );
    }

    return (
        <form
            action={formAction}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
            <input
                type="hidden"
                name="slug_was_manual"
                value={isSlugManual ? "true" : "false"}
            />

            <div className="space-y-5">
                {state.error ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                        {state.error}
                    </p>
                ) : null}

                {isOnboarding ? (
                    <p className="rounded-2xl border border-lime-300/20 bg-lime-300/10 px-4 py-3 text-sm font-bold text-lime-950 sm:text-lime-900">
                        Start with what you know. Everything can change later.
                    </p>
                ) : null}

                <div>
                    <label
                        htmlFor="title"
                        className="block text-sm font-medium text-slate-700"
                    >
                        Trip title
                    </label>
                    <input
                        id="title"
                        name="title"
                        type="text"
                        required
                        placeholder="Berlin & Asia 2026"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                    />
                    {state.fieldErrors?.title ? (
                        <p className="mt-2 text-sm font-semibold text-red-600">
                            {state.fieldErrors.title}
                        </p>
                    ) : null}
                </div>

                <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                        Dates
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <label
                            className={`cursor-pointer rounded-2xl border p-4 transition ${
                                dateMode === "known"
                                    ? "border-lime-400 bg-lime-100 text-lime-950"
                                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                            }`}
                        >
                            <input
                                type="radio"
                                name="date_mode"
                                value="known"
                                checked={dateMode === "known"}
                                onChange={() => setDateMode("known")}
                                className="sr-only"
                            />
                            <span className="block text-sm font-black">
                                I know my dates
                            </span>
                            <span className="mt-1 block text-xs font-semibold">
                                Build the date & destination matrix.
                            </span>
                        </label>
                        <label
                            className={`cursor-pointer rounded-2xl border p-4 transition ${
                                dateMode === "thinking"
                                    ? "border-lime-400 bg-lime-100 text-lime-950"
                                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                            }`}
                        >
                            <input
                                type="radio"
                                name="date_mode"
                                value="thinking"
                                checked={dateMode === "thinking"}
                                onChange={() => setDateMode("thinking")}
                                className="sr-only"
                            />
                            <span className="block text-sm font-black">
                                I&apos;m still thinking
                            </span>
                            <span className="mt-1 block text-xs font-semibold">
                                Save a lighter trip shell for now.
                            </span>
                        </label>
                    </div>

                    {dateMode === "known" ? (
                        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-end justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">
                                        Date & Destination Matrix
                                    </p>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        Don&apos;t worry, you can change these later.
                                    </p>
                                </div>
                                <p className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white">
                                    Total duration: {formatDuration(totalDuration)}
                                </p>
                            </div>

                            <div className="mt-4 space-y-3">
                                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1.2fr_0.8fr_0.65fr_auto] md:items-end">
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                                            Start destination
                                        </span>
                                        <input
                                            name="matrix_start_destination"
                                            type="text"
                                            value={startDestination}
                                            onChange={(event) =>
                                                setStartDestination(
                                                    event.target.value
                                                )
                                            }
                                            placeholder="Home, YYT, Toronto..."
                                            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                                            Start date
                                        </span>
                                        <input
                                            name="matrix_start_date"
                                            type="date"
                                            value={startDate}
                                            onChange={(event) =>
                                                setStartDate(event.target.value)
                                            }
                                            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
                                        />
                                    </label>
                                    <div>
                                        <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                                            Duration
                                        </span>
                                        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-black text-slate-500">
                                            {formatDuration(
                                                getDateDiffDays(
                                                    startDate,
                                                    matrixDates[1] || ""
                                                )
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setVisibleDestinationRows((current) =>
                                                Math.min(
                                                    MAX_MATRIX_DESTINATIONS,
                                                    current + 1
                                                )
                                            )
                                        }
                                        className="flex h-10 w-10 items-center justify-center rounded-full bg-lime-300 text-slate-950 transition hover:bg-lime-200 disabled:opacity-40"
                                        disabled={
                                            visibleDestinationRows >=
                                            MAX_MATRIX_DESTINATIONS
                                        }
                                        aria-label="Add another destination"
                                    >
                                        <Plus className="h-5 w-5" aria-hidden="true" />
                                    </button>
                                </div>

                                {Array.from(
                                    { length: visibleDestinationRows },
                                    (_, index) => (
                                        <div
                                            key={index}
                                            className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1.2fr_0.8fr_0.65fr_auto] md:items-end"
                                        >
                                            <label className="block">
                                                <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                                                    Next destination
                                                </span>
                                                <input
                                                    name={`matrix_next_destination_${index}`}
                                                    type="text"
                                                    value={
                                                        nextDestinations[index]
                                                            .destination
                                                    }
                                                    onChange={(event) =>
                                                        updateNextDestination(
                                                            index,
                                                            "destination",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder="Berlin, Taipei..."
                                                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
                                                />
                                            </label>
                                            <label className="block">
                                                <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                                                    Date of arrival
                                                </span>
                                                <input
                                                    name={`matrix_next_arrival_date_${index}`}
                                                    type="date"
                                                    value={
                                                        nextDestinations[index]
                                                            .arrivalDate
                                                    }
                                                    onChange={(event) =>
                                                        updateNextDestination(
                                                            index,
                                                            "arrivalDate",
                                                            event.target.value
                                                        )
                                                    }
                                                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
                                                />
                                            </label>
                                            <div>
                                                <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                                                    Stay duration
                                                </span>
                                                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-black text-slate-500">
                                                    {formatDuration(
                                                        getDateDiffDays(
                                                            nextDestinations[index]
                                                                .arrivalDate,
                                                            matrixDates[index + 2] ||
                                                                ""
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setVisibleDestinationRows(
                                                        (current) =>
                                                            Math.min(
                                                                MAX_MATRIX_DESTINATIONS,
                                                                current + 1
                                                            )
                                                    )
                                                }
                                                className="flex h-10 w-10 items-center justify-center rounded-full bg-lime-300 text-slate-950 transition hover:bg-lime-200 disabled:opacity-40"
                                                disabled={
                                                    visibleDestinationRows >=
                                                    MAX_MATRIX_DESTINATIONS
                                                }
                                                aria-label="Add another destination"
                                            >
                                                <Plus
                                                    className="h-5 w-5"
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        </div>
                                    )
                                )}

                                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1.2fr_0.8fr_0.65fr] md:items-end">
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                                            Return destination
                                        </span>
                                        <input
                                            name="matrix_return_destination"
                                            type="text"
                                            value={returnDestination}
                                            onChange={(event) => {
                                                setIsReturnDestinationManual(true);
                                                setReturnDestination(
                                                    event.target.value
                                                );
                                            }}
                                            placeholder="Auto-populated from start"
                                            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                                            Date of arrival
                                        </span>
                                        <input
                                            name="matrix_return_date"
                                            type="date"
                                            value={returnDate}
                                            onChange={(event) =>
                                                setReturnDate(event.target.value)
                                            }
                                            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
                                        />
                                    </label>
                                    <div>
                                        <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                                            Total duration
                                        </span>
                                        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-black text-slate-500">
                                            {formatDuration(totalDuration)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </section>

                <TripDestinationPicker inputId="tripCreateDestination" />

                <details
                    open
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                >
                    <summary className="cursor-pointer text-sm font-black uppercase tracking-[0.12em] text-slate-700">
                        More options
                    </summary>
                    <div className="mt-4 space-y-5">
                        <div>
                            <label
                                htmlFor="slug"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Trip link
                            </label>
                            <div className="mt-2 flex rounded-xl border border-slate-300 bg-slate-50 focus-within:border-slate-500">
                                <span className="shrink-0 rounded-l-xl border-r border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500">
                                    trips/
                                </span>
                                <input
                                    id="slug"
                                    name="slug"
                                    type="text"
                                    required
                                    value={slug}
                                    onChange={(event) => {
                                        setIsSlugManual(true);
                                        setSlug(
                                            sanitizeTripSlugInput(
                                                event.target.value
                                            )
                                        );
                                    }}
                                    className="min-w-0 flex-1 rounded-r-xl bg-white px-4 py-2 text-slate-900 outline-none"
                                />
                            </div>
                            <p className="mt-2 text-xs font-semibold text-slate-500">
                                This is the friendly URL people on this trip will
                                see.
                            </p>
                            {state.fieldErrors?.slug ? (
                                <p className="mt-2 text-sm font-semibold text-red-600">
                                    {state.fieldErrors.slug}
                                </p>
                            ) : null}
                        </div>

                        <div>
                            <label
                                htmlFor="notes"
                                className="block text-sm font-medium text-slate-700"
                            >
                                Notes
                            </label>
                            <textarea
                                id="notes"
                                name="notes"
                                rows={4}
                                placeholder="Anything important about this trip..."
                                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                            />
                        </div>
                    </div>
                </details>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3">
                <Link
                    href="/"
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                    Cancel
                </Link>
                <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Saving..." : "Save trip"}
                </button>
            </div>
        </form>
    );
}
