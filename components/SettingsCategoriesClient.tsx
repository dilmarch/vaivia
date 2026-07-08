"use client";

import { Palette, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type {
    CategoryColorOption,
    UserCategory,
} from "@/lib/itineraryCategories";

type SettingsCategoriesClientProps = {
    categories: UserCategory[];
    colors: CategoryColorOption[];
    addAction: (formData: FormData) => Promise<void>;
    updateAction: (formData: FormData) => Promise<void>;
    deleteAction: (formData: FormData) => Promise<void>;
    message?: string;
};

function getColorHex(colors: CategoryColorOption[], key?: string | null) {
    return colors.find((color) => color.key === key)?.hex || "#64748B";
}

function ColorSwatchPicker({
    colors,
    value,
    onChange,
    name = "color_key",
}: {
    colors: CategoryColorOption[];
    value: string;
    onChange: (value: string) => void;
    name?: string;
}) {
    return (
        <div>
            <input type="hidden" name={name} value={value} />
            <div
                className="grid grid-cols-5 gap-2 rounded-xl border border-white/10 bg-white/[0.06] p-2"
                role="radiogroup"
                aria-label="Category colour"
            >
                {colors.map((color) => {
                    const isSelected = color.key === value;

                    return (
                        <button
                            key={color.key}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            aria-label={`${color.label} category colour`}
                            title={color.label}
                            onClick={() => onChange(color.key)}
                            className={`h-8 w-8 rounded-full border transition focus:outline-none focus:ring-2 focus:ring-lime-300/60 ${
                                isSelected
                                    ? "border-white shadow-[0_0_0_3px_rgba(255,255,255,0.18),0_0_18px_rgba(var(--vaivia-neon-rgb),0.18)]"
                                    : "border-white/20 hover:scale-110 hover:border-white/70"
                            }`}
                            style={{ backgroundColor: color.hex }}
                        >
                            <span className="sr-only">{color.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function SettingsCategoriesClient({
    categories,
    colors,
    addAction,
    updateAction,
    deleteAction,
    message,
}: SettingsCategoriesClientProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteCategory, setDeleteCategory] = useState<UserCategory | null>(null);
    const defaultColorKey = colors[0]?.key || "";
    const [addColorKey, setAddColorKey] = useState(defaultColorKey);
    const [editColorKeys, setEditColorKeys] = useState<Record<string, string>>({});

    function openEditor(category: UserCategory) {
        setEditingId(category.id);
        setEditColorKeys((current) => ({
            ...current,
            [category.id]: category.color_key || defaultColorKey,
        }));
    }

    return (
        <div className="space-y-6">
            {message ? (
                <div className="rounded-2xl border border-amber-300/40 bg-amber-300/15 px-4 py-3 text-sm font-bold text-amber-100">
                    {message}
                </div>
            ) : null}

            <form
                action={addAction}
                className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5 shadow-2xl shadow-black/20"
            >
                <div className="flex items-center gap-2 text-lime-300">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <h2 className="text-sm font-black uppercase tracking-[0.24em]">
                        Add category
                    </h2>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-start">
                    <input
                        name="name"
                        required
                        placeholder="Category name"
                        className="rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2 text-white outline-none placeholder:text-slate-500 focus:border-lime-300/50 focus:ring-2 focus:ring-lime-300/20"
                        autoComplete="off"
                    />
                    <ColorSwatchPicker
                        colors={colors}
                        value={addColorKey}
                        onChange={setAddColorKey}
                    />
                    <button className="rounded-xl bg-lime-300 px-5 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200">
                        Add
                    </button>
                </div>
            </form>

            <div className="space-y-3">
                {categories.map((category) => {
                    const swatch = getColorHex(colors, category.color_key);
                    const isEditing = editingId === category.id;

                    return (
                        <div
                            key={category.id}
                            className="rounded-[1.25rem] border border-white/10 bg-[#080b16]/95 p-4 text-white shadow-[0_18px_45px_rgba(0,0,0,0.24)]"
                        >
                            {isEditing ? (
                                <form
                                    action={updateAction}
                                    className="grid gap-3 md:grid-cols-[auto_1fr_auto_auto] md:items-start"
                                >
                                    <input
                                        type="hidden"
                                        name="category_id"
                                        value={category.id}
                                    />
                                    <span
                                        className="h-10 w-10 rounded-xl border border-white/15"
                                        style={{ backgroundColor: swatch }}
                                    />
                                    <input
                                        name="name"
                                        required
                                        defaultValue={category.name}
                                        className="rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2 text-white outline-none focus:border-lime-300/50 focus:ring-2 focus:ring-lime-300/20"
                                    />
                                    <ColorSwatchPicker
                                        colors={colors}
                                        value={
                                            editColorKeys[category.id] ||
                                            category.color_key ||
                                            defaultColorKey
                                        }
                                        onChange={(nextColorKey) =>
                                            setEditColorKeys((current) => ({
                                                ...current,
                                                [category.id]: nextColorKey,
                                            }))
                                        }
                                    />
                                    <div className="flex gap-2">
                                        <button className="rounded-xl bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-lime-200">
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditingId(null)}
                                            className="rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-slate-100 transition hover:bg-white/[0.14]"
                                            aria-label="Cancel editing"
                                        >
                                            <X className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div className="flex flex-wrap items-center gap-3">
                                    <span
                                        className="h-10 w-10 rounded-xl border border-white/15"
                                        style={{ backgroundColor: swatch }}
                                    />
                                    <p className="min-w-0 flex-1 text-lg font-black">
                                        {category.name}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => openEditor(category)}
                                        className="rounded-xl border border-white/10 bg-white/[0.08] p-2 text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]"
                                        aria-label={`Change ${category.name} colour`}
                                        title="Edit colour"
                                    >
                                        <Palette className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openEditor(category)}
                                        className="rounded-xl border border-white/10 bg-white/[0.08] p-2 text-slate-100 transition hover:border-lime-300/30 hover:bg-white/[0.14]"
                                        aria-label={`Edit ${category.name}`}
                                    >
                                        <Pencil className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDeleteCategory(category)}
                                        className="rounded-xl border border-red-400/30 bg-red-500/15 p-2 text-red-100 transition hover:bg-red-500/25"
                                        aria-label={`Delete ${category.name}`}
                                    >
                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {deleteCategory ? (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0c0115]/75 px-4 py-6 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-[24px] border border-white/10 bg-[#080511] p-5 text-white shadow-2xl shadow-black/60">
                        <h2 className="text-xl font-black">Delete category?</h2>
                        <p className="mt-2 text-sm text-slate-300">
                            This will delete {deleteCategory.name}. Existing itinerary
                            items may fall back to Other.
                        </p>
                        <form action={deleteAction} className="mt-5 flex justify-end gap-2">
                            <input
                                type="hidden"
                                name="category_id"
                                value={deleteCategory.id}
                            />
                            <button
                                type="button"
                                onClick={() => setDeleteCategory(null)}
                                className="rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-bold text-slate-100 transition hover:bg-white/[0.14]"
                            >
                                Cancel
                            </button>
                            <button className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-500/25">
                                Delete
                            </button>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
