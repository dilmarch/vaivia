"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { FamilyMember } from "@/lib/travelers";
import { getInitials } from "@/lib/travelers";

type SettingsFamilyMembersClientProps = {
    familyMembers: FamilyMember[];
    addAction: (formData: FormData) => Promise<void>;
    updateAction: (formData: FormData) => Promise<void>;
    deleteAction: (formData: FormData) => Promise<void>;
    message?: string;
};

type ModalMode =
    | { type: "add"; member?: null }
    | { type: "edit"; member: FamilyMember };

const fieldClass =
    "mt-2 w-full rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2 text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50 focus:bg-white/[0.12] focus:ring-2 focus:ring-lime-300/20";
const labelClass = "block text-sm font-bold uppercase tracking-wide text-slate-300";

function FamilyAvatar({ member }: { member: Pick<FamilyMember, "name" | "avatar_url"> }) {
    return (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/15 bg-slate-950 text-sm font-black uppercase text-lime-200 shadow-[0_0_24px_rgba(0,0,0,0.26)]">
            {member.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
                getInitials(member.name)
            )}
        </span>
    );
}

function FamilyMemberForm({
    mode,
    action,
    onCancel,
}: {
    mode: ModalMode;
    action: (formData: FormData) => Promise<void>;
    onCancel: () => void;
}) {
    const member = mode.type === "edit" ? mode.member : null;

    return (
        <form action={action} className="space-y-5 bg-[#080511] p-6 text-white">
            {member ? <input type="hidden" name="family_member_id" value={member.id} /> : null}
            <div>
                <label htmlFor="familyMemberName" className={labelClass}>
                    Name
                </label>
                <input
                    id="familyMemberName"
                    name="name"
                    required
                    defaultValue={member?.name || ""}
                    className={fieldClass}
                />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <div>
                    <label htmlFor="familyRelationship" className={labelClass}>
                        Relationship
                    </label>
                    <input
                        id="familyRelationship"
                        name="relationship"
                        defaultValue={member?.relationship || ""}
                        className={fieldClass}
                    />
                </div>
                <div>
                    <label htmlFor="familyAvatarUrl" className={labelClass}>
                        Avatar URL
                    </label>
                    <input
                        id="familyAvatarUrl"
                        name="avatar_url"
                        defaultValue={member?.avatar_url || ""}
                        className={fieldClass}
                    />
                </div>
            </div>
            <div>
                <label htmlFor="familyNotes" className={labelClass}>
                    Notes
                </label>
                <textarea
                    id="familyNotes"
                    name="notes"
                    rows={4}
                    defaultValue={member?.notes || ""}
                    className={fieldClass}
                />
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 pt-5">
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-bold text-slate-100 transition hover:bg-white/[0.14]"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="rounded-xl bg-lime-300 px-4 py-2 text-sm font-black text-slate-950 shadow-[0_0_22px_rgba(var(--vaivia-neon-rgb),0.18)] transition hover:bg-lime-200"
                >
                    Save
                </button>
            </div>
        </form>
    );
}

export default function SettingsFamilyMembersClient({
    familyMembers,
    addAction,
    updateAction,
    deleteAction,
    message,
}: SettingsFamilyMembersClientProps) {
    const [modalMode, setModalMode] = useState<ModalMode | null>(null);
    const [inviteMember, setInviteMember] = useState<FamilyMember | null>(null);
    const [deleteMember, setDeleteMember] = useState<FamilyMember | null>(null);
    const isAtLimit = familyMembers.length >= 10;

    return (
        <>
            {message ? (
                <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">
                    {message}
                </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm font-semibold text-slate-400">
                    {isAtLimit
                        ? "You can add up to 10 family members."
                        : `${familyMembers.length}/10 saved family members`}
                </p>
                <button
                    type="button"
                    onClick={() => setModalMode({ type: "add" })}
                    disabled={isAtLimit}
                    className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.20)] transition hover:-translate-y-0.5 hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add family member
                </button>
            </div>

            {familyMembers.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.05] p-8 text-center">
                    <h3 className="text-xl font-black">No family members yet.</h3>
                    <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                        Add non-user family members or managed travellers so you can
                        include them in trips and transportation plans.
                    </p>
                </div>
            ) : (
                <div className="grid gap-3 md:grid-cols-2">
                    {familyMembers.map((member) => (
                        <article
                            key={member.id}
                            className="rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/15"
                        >
                            <div className="flex items-start gap-3">
                                <FamilyAvatar member={member} />
                                <div className="min-w-0 flex-1">
                                    <h3 className="truncate text-lg font-black text-white">
                                        {member.name}
                                    </h3>
                                    {member.relationship ? (
                                        <p className="text-sm font-semibold text-slate-400">
                                            {member.relationship}
                                        </p>
                                    ) : null}
                                    {member.notes ? (
                                        <p className="mt-2 line-clamp-2 text-sm text-slate-400">
                                            {member.notes}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                            <div className="mt-4 flex flex-wrap justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setInviteMember(member)}
                                    className="rounded-full border border-lime-300/20 bg-lime-300/10 px-4 py-2 text-sm font-bold text-lime-100 transition hover:bg-lime-300/20"
                                >
                                    Invite
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setModalMode({ type: "edit", member })}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:border-lime-300/40 hover:text-lime-200"
                                    aria-label={`Edit ${member.name}`}
                                >
                                    <Pencil className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeleteMember(member)}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-red-300/20 bg-red-500/10 text-red-100 transition hover:border-red-300/50 hover:bg-red-500/20"
                                    aria-label={`Delete ${member.name}`}
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}

            {modalMode ? (
                <div className="vaivia-modal-backdrop" onClick={() => setModalMode(null)}>
                    <div
                        className="vaivia-modal-panel max-w-2xl"
                        role="dialog"
                        aria-modal="true"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="vaivia-modal-header flex items-start justify-between gap-4">
                            <div>
                                <p className="vaivia-modal-eyebrow">Family Members</p>
                                <h2 className="vaivia-modal-title">
                                    {modalMode.type === "edit"
                                        ? "Edit family member"
                                        : "Add family member"}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setModalMode(null)}
                                className="vaivia-modal-close"
                                aria-label="Close family member form"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                        <FamilyMemberForm
                            mode={modalMode}
                            action={modalMode.type === "edit" ? updateAction : addAction}
                            onCancel={() => setModalMode(null)}
                        />
                    </div>
                </div>
            ) : null}

            {inviteMember ? (
                <div
                    className="vaivia-modal-backdrop"
                    onClick={() => setInviteMember(null)}
                >
                    <div
                        className="vaivia-modal-panel max-w-lg"
                        role="dialog"
                        aria-modal="true"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="vaivia-modal-header flex items-start justify-between gap-4">
                            <div>
                                <p className="vaivia-modal-eyebrow">Invite</p>
                                <h2 className="vaivia-modal-title">
                                    Invite {inviteMember.name} to VAIVIA
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setInviteMember(null)}
                                className="vaivia-modal-close"
                                aria-label="Close invite modal"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="space-y-5 bg-[#080511] p-6 text-white">
                            <p className="text-sm font-semibold leading-6 text-slate-300">
                                Invite your friend or family member to VAIVIA so they can
                                manage their own travel plans.
                            </p>
                            <label className={labelClass}>
                                Email address
                                <input
                                    type="email"
                                    placeholder="name@example.com"
                                    className={fieldClass}
                                />
                            </label>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm font-semibold text-slate-400">
                                TODO: connect this to a general invite action.
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setInviteMember(null)}
                                    className="rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-bold text-slate-100 transition hover:bg-white/[0.14]"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {deleteMember ? (
                <div className="vaivia-modal-backdrop" onClick={() => setDeleteMember(null)}>
                    <div
                        className="vaivia-modal-confirm"
                        role="dialog"
                        aria-modal="true"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h2 className="text-xl font-black text-slate-950">
                            Delete family member?
                        </h2>
                        <p className="mt-2 text-sm font-semibold text-slate-600">
                            This removes {deleteMember.name} from your saved family
                            members.
                        </p>
                        <div className="mt-5 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setDeleteMember(null)}
                                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <form action={deleteAction}>
                                <input
                                    type="hidden"
                                    name="family_member_id"
                                    value={deleteMember.id}
                                />
                                <button
                                    type="submit"
                                    className="rounded-full bg-red-600 px-4 py-2 text-sm font-black text-white transition hover:bg-red-500"
                                >
                                    Delete
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
