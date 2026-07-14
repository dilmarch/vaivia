"use client";

import { Check, ChevronDown, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
    getRolePreviewLabel,
    setStoredRolePreview,
    useRolePreview,
    type PreviewableRole,
} from "@/components/admin/useRolePreview";

type ViewAsRoleSwitcherProps = {
    isSuperAdmin: boolean;
};

const ROLE_OPTIONS: PreviewableRole[] = ["basic_user"];

export default function ViewAsRoleSwitcher({
    isSuperAdmin,
}: ViewAsRoleSwitcherProps) {
    const previewRole = useRolePreview(isSuperAdmin);
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        function closeOnPointerDown(event: PointerEvent) {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        }

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") setIsOpen(false);
        }

        window.addEventListener("pointerdown", closeOnPointerDown);
        window.addEventListener("keydown", closeOnEscape);

        return () => {
            window.removeEventListener("pointerdown", closeOnPointerDown);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [isOpen]);

    function selectRole(role: PreviewableRole | null) {
        setStoredRolePreview(role);
        setIsOpen(false);
        window.location.reload();
    }

    if (!isSuperAdmin) return null;

    const currentLabel = previewRole
        ? getRolePreviewLabel(previewRole)
        : "Super Admin";

    return (
        <div className="hidden items-center gap-2 md:flex">
            <div className="relative" ref={menuRef}>
                <button
                    type="button"
                    onClick={() => setIsOpen((current) => !current)}
                    className="inline-flex h-12 items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-4 text-sm font-black text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-lime-300/30 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-lime-300/50"
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    aria-label="Preview VAIVIA as another role"
                >
                    <Eye className="h-4 w-4 text-lime-200" aria-hidden="true" />
                    <span className="text-slate-200">View As</span>
                    <span className="rounded-full bg-lime-300/10 px-2.5 py-1 text-xs text-lime-100">
                        {currentLabel}
                    </span>
                    <ChevronDown
                        className={`h-4 w-4 text-slate-300 transition ${
                            isOpen ? "rotate-180" : ""
                        }`}
                        aria-hidden="true"
                    />
                </button>
                {isOpen ? (
                    <div
                        role="menu"
                        className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-64 overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#07010f]/95 p-2 text-white shadow-2xl shadow-black/50 backdrop-blur-2xl"
                    >
                        <p className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-lime-200/80">
                            Preview role
                        </p>
                        <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={!previewRole}
                            onClick={() => selectRole(null)}
                            className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black transition ${
                                !previewRole
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-200 hover:bg-white/[0.08] hover:text-lime-100"
                            }`}
                        >
                            Super Admin
                            {!previewRole ? (
                                <Check className="h-4 w-4" aria-hidden="true" />
                            ) : null}
                        </button>
                        {ROLE_OPTIONS.map((role) => {
                            const isSelected = previewRole === role;

                            return (
                                <button
                                    key={role}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={isSelected}
                                    onClick={() => selectRole(role)}
                                    className={`mt-1 flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black transition ${
                                        isSelected
                                            ? "bg-lime-300 text-slate-950"
                                            : "text-slate-200 hover:bg-white/[0.08] hover:text-lime-100"
                                    }`}
                                >
                                    {getRolePreviewLabel(role)}
                                    {isSelected ? (
                                        <Check
                                            className="h-4 w-4"
                                            aria-hidden="true"
                                        />
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
