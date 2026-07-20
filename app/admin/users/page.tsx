import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck, UsersRound } from "lucide-react";
import AdminUsersClient, {
    type AdminUserRow,
} from "@/components/admin/AdminUsersClient";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Admin Users - VAIVIA",
};

type SupabaseRpcError = {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
};

type AdminUsersRpcClient = {
    rpc: (
        functionName: "get_admin_users"
    ) => Promise<{ data: AdminUserRow[] | null; error: SupabaseRpcError | null }>;
};

export default async function AdminUsersPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (profile?.role !== "super_admin") redirect("/");

    const adminRpc = supabase as unknown as AdminUsersRpcClient;
    const { data: userRows, error } = await adminRpc.rpc("get_admin_users");

    if (error) {
        console.error("Could not load admin users:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
        });
        throw new Error(`Could not load admin users: ${error.message}`);
    }

    const users = (Array.isArray(userRows) ? userRows : []) as AdminUserRow[];

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-[calc(6.25rem+var(--safe-area-top))] text-white md:pb-10 md:pl-28 md:pr-8 md:pt-28">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-6 shadow-2xl shadow-black/35">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                <UsersRound className="h-4 w-4" aria-hidden="true" />
                                Super Admin
                            </p>
                            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">
                                Users
                            </h1>
                            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                                Search, sort, and edit VAIVIA user profiles and
                                admin roles.
                            </p>
                        </div>
                        <Link
                            href="/admin"
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-100 transition hover:bg-white/[0.14]"
                        >
                            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                            Admin overview
                        </Link>
                    </div>
                </header>

                <AdminUsersClient users={users} currentUserId={user.id} />
            </div>
        </main>
    );
}
