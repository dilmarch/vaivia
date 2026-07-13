"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowUpDown,
    KeyRound,
    Pencil,
    Search,
    ShieldAlert,
    X,
} from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import {
    type AdminUserActionState,
    updateAdminUser,
} from "@/app/admin/users/actions";

export type AdminUserRow = {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    role: string;
    join_date: string | null;
    created_at: string | null;
    auth_method: string | null;
};

type SortKey = "first_name" | "last_name" | "email" | "auth_method" | "role";
type SortDirection = "asc" | "desc";

const initialActionState: AdminUserActionState = {
    ok: false,
    message: "",
};

const sortLabels: Record<SortKey, string> = {
    first_name: "First name",
    last_name: "Last name",
    email: "Email",
    auth_method: "Authentication",
    role: "Role",
};

function displayName(user: AdminUserRow) {
    return [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
}

function roleLabel(role: string | null) {
    return role === "super_admin" ? "Super admin" : "Basic user";
}

function authMethodLabel(method: string | null) {
    if (method === "google") return "Google";
    if (method === "microsoft" || method === "azure") return "Microsoft";
    return "Password";
}

function sortValue(user: AdminUserRow, key: SortKey) {
    return String(user[key] || "").toLocaleLowerCase();
}

function EditUserModal({
    user,
    onClose,
}: {
    user: AdminUserRow;
    onClose: () => void;
}) {
    const router = useRouter();
    const [state, formAction, pending] = useActionState(
        updateAdminUser,
        initialActionState
    );
    const [selectedRole, setSelectedRole] = useState(user.role || "basic_user");
    const isPromotingToSuperAdmin =
        selectedRole === "super_admin" && user.role !== "super_admin";

    useEffect(() => {
        if (!state.ok) return;

        router.refresh();
        onClose();
    }, [onClose, router, state.ok]);

    return (
        <AnimatedModal onClose={onClose} panelClassName="max-w-2xl">
            {({ requestClose }) => (
                <div className="space-y-6">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/80">
                                Admin users
                            </p>
                            <h2 className="mt-2 text-3xl font-black text-white">
                                Edit user
                            </h2>
                            <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                                Update profile fields or change this user&apos;s role.
                                Authentication method is shown for context only.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-slate-200 transition hover:bg-white/[0.12] hover:text-white"
                            aria-label="Close edit user"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>

                    <form action={formAction} className="space-y-5">
                        <input type="hidden" name="user_id" value={user.id} />
                        <input
                            type="hidden"
                            name="current_role"
                            value={user.role || "basic_user"}
                        />

                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                    First name
                                </span>
                                <input
                                    name="first_name"
                                    defaultValue={user.first_name || ""}
                                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50 focus:ring-2 focus:ring-lime-300/20"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                    Last name
                                </span>
                                <input
                                    name="last_name"
                                    defaultValue={user.last_name || ""}
                                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50 focus:ring-2 focus:ring-lime-300/20"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                    Username
                                </span>
                                <input
                                    name="username"
                                    defaultValue={user.username || ""}
                                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50 focus:ring-2 focus:ring-lime-300/20"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                    Email
                                </span>
                                <input
                                    name="email"
                                    type="email"
                                    defaultValue={user.email || ""}
                                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50 focus:ring-2 focus:ring-lime-300/20"
                                />
                            </label>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                    Authentication method
                                </p>
                                <p className="mt-2 flex items-center gap-2 text-sm font-black text-white">
                                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                                    {authMethodLabel(user.auth_method)}
                                </p>
                            </div>
                            <label className="block rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                    User role
                                </span>
                                <select
                                    name="role"
                                    value={selectedRole}
                                    onChange={(event) =>
                                        setSelectedRole(event.target.value)
                                    }
                                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-black text-white outline-none transition focus:border-lime-300/50 focus:ring-2 focus:ring-lime-300/20"
                                >
                                    <option value="basic_user">Basic user</option>
                                    <option value="super_admin">Super admin</option>
                                </select>
                            </label>
                        </div>

                        {isPromotingToSuperAdmin ? (
                            <div className="rounded-[1.25rem] border border-amber-300/30 bg-amber-300/10 p-4 text-amber-50">
                                <p className="flex items-center gap-2 text-sm font-black">
                                    <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                                    Confirm super admin access
                                </p>
                                <div className="mt-3 space-y-1 text-sm font-semibold leading-6 text-amber-50/90">
                                    <p>Username: {user.username || "Not set"}</p>
                                    <p>First name: {user.first_name || "Not set"}</p>
                                    <p>Last name: {user.last_name || "Not set"}</p>
                                    <p>Email: {user.email || "Not set"}</p>
                                </div>
                                <label className="mt-4 block">
                                    <span className="text-xs font-black uppercase tracking-[0.18em] text-amber-100">
                                        Re-enter your password
                                    </span>
                                    <input
                                        name="admin_password"
                                        type="password"
                                        autoComplete="current-password"
                                        className="mt-2 h-12 w-full rounded-2xl border border-amber-100/20 bg-slate-950/80 px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20"
                                        placeholder="Your account password"
                                    />
                                </label>
                            </div>
                        ) : null}

                        {state.message ? (
                            <p
                                className={`rounded-2xl border p-3 text-sm font-bold ${
                                    state.ok
                                        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                                        : "border-red-300/30 bg-red-300/10 text-red-100"
                                }`}
                            >
                                {state.message}
                            </p>
                        ) : null}

                        <div className="flex flex-wrap justify-end gap-3">
                            <button
                                type="button"
                                onClick={requestClose}
                                className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-3 text-sm font-black text-slate-100 transition hover:bg-white/[0.14]"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={pending}
                                className="rounded-full border border-lime-300/40 bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200 disabled:cursor-wait disabled:opacity-70"
                            >
                                {pending ? "Saving..." : "Save user"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </AnimatedModal>
    );
}

export default function AdminUsersClient({ users }: { users: AdminUserRow[] }) {
    const [query, setQuery] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("last_name");
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
    const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);

    const sortedUsers = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        const filtered = users.filter((user) => {
            if (!normalizedQuery) return true;
            return [
                user.first_name,
                user.last_name,
                user.email,
                user.username,
                authMethodLabel(user.auth_method),
                roleLabel(user.role),
            ]
                .filter(Boolean)
                .join(" ")
                .toLocaleLowerCase()
                .includes(normalizedQuery);
        });

        return [...filtered].sort((a, b) => {
            const aValue = sortValue(a, sortKey);
            const bValue = sortValue(b, sortKey);
            const result = aValue.localeCompare(bValue);

            return sortDirection === "asc" ? result : -result;
        });
    }, [query, sortDirection, sortKey, users]);

    function toggleSort(key: SortKey) {
        if (sortKey === key) {
            setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
            return;
        }

        setSortKey(key);
        setSortDirection("asc");
    }

    return (
        <>
            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">
                            Users
                        </p>
                        <h2 className="mt-2 text-2xl font-black text-white">
                            Manage users
                        </h2>
                    </div>
                    <label className="relative min-w-0 flex-1 sm:max-w-sm">
                        <Search
                            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                            aria-hidden="true"
                        />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className="h-12 w-full rounded-full border border-white/10 bg-slate-950/70 pl-11 pr-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/50 focus:ring-2 focus:ring-lime-300/20"
                            placeholder="Search users"
                        />
                    </label>
                </div>

                <div className="mt-5 overflow-x-auto rounded-[1.25rem] border border-white/10 bg-slate-950/45">
                    <table className="min-w-[920px] w-full text-left text-sm">
                        <thead className="border-b border-white/10 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                            <tr>
                                {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                                    <th key={key} className="px-4 py-3">
                                        <button
                                            type="button"
                                            onClick={() => toggleSort(key)}
                                            className="inline-flex items-center gap-2 transition hover:text-lime-200"
                                        >
                                            {sortLabels[key]}
                                            <ArrowUpDown
                                                className="h-3.5 w-3.5"
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-right">
                                    <span className="sr-only">Edit</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                            {sortedUsers.map((user) => (
                                <tr key={user.id} className="text-slate-200">
                                    <td className="px-4 py-4 font-black text-white">
                                        {user.first_name || "-"}
                                    </td>
                                    <td className="px-4 py-4 font-black text-white">
                                        {user.last_name || "-"}
                                    </td>
                                    <td className="px-4 py-4 font-semibold">
                                        {user.email || "-"}
                                    </td>
                                    <td className="px-4 py-4 font-semibold">
                                        {authMethodLabel(user.auth_method)}
                                    </td>
                                    <td className="px-4 py-4">
                                        <span
                                            className={`rounded-full border px-3 py-1 text-xs font-black ${
                                                user.role === "super_admin"
                                                    ? "border-lime-300/40 bg-lime-300/15 text-lime-100"
                                                    : "border-white/10 bg-white/[0.06] text-slate-300"
                                            }`}
                                        >
                                            {roleLabel(user.role)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 text-right">
                                        <button
                                            type="button"
                                            onClick={() => setEditingUser(user)}
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-slate-100 transition hover:border-lime-300/35 hover:bg-white/[0.14] hover:text-white"
                                            aria-label={`Edit ${
                                                displayName(user) ||
                                                user.username ||
                                                user.email ||
                                                "user"
                                            }`}
                                        >
                                            <Pencil className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {sortedUsers.length === 0 ? (
                        <p className="p-5 text-sm font-bold text-slate-400">
                            No users match that search.
                        </p>
                    ) : null}
                </div>
            </section>

            {editingUser ? (
                <EditUserModal
                    user={editingUser}
                    onClose={() => setEditingUser(null)}
                />
            ) : null}
        </>
    );
}
