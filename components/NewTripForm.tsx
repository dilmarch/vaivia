"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
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
};

const initialState: CreateTripFormState = {
    error: null,
    fieldErrors: {},
    values: {},
};

export default function NewTripForm({ action, nextTripNumber }: NewTripFormProps) {
    const [state, formAction, isPending] = useActionState(action, initialState);
    const [title, setTitle] = useState(state.values?.title || "");
    const [slug, setSlug] = useState(
        state.values?.slug || slugifyTripTitle("", nextTripNumber)
    );
    const [isSlugManual, setIsSlugManual] = useState(false);

    useEffect(() => {
        if (isSlugManual) return;
        setSlug(slugifyTripTitle(title, nextTripNumber));
    }, [isSlugManual, nextTripNumber, title]);

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
                                setSlug(sanitizeTripSlugInput(event.target.value));
                            }}
                            className="min-w-0 flex-1 rounded-r-xl bg-white px-4 py-2 text-slate-900 outline-none"
                        />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                        This is the friendly URL people on this trip will see.
                    </p>
                    {state.fieldErrors?.slug ? (
                        <p className="mt-2 text-sm font-semibold text-red-600">
                            {state.fieldErrors.slug}
                        </p>
                    ) : null}
                </div>

                <TripDestinationPicker inputId="tripCreateDestination" />

                <div className="grid gap-5 md:grid-cols-2">
                    <div>
                        <label
                            htmlFor="start_date"
                            className="block text-sm font-medium text-slate-700"
                        >
                            Start date
                        </label>
                        <input
                            id="start_date"
                            name="start_date"
                            type="date"
                            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="end_date"
                            className="block text-sm font-medium text-slate-700"
                        >
                            End date
                        </label>
                        <input
                            id="end_date"
                            name="end_date"
                            type="date"
                            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2 text-slate-900"
                        />
                    </div>
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
