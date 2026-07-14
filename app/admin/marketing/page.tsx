import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Megaphone, Save } from "lucide-react";
import DeleteMarketingConsentForm from "@/app/admin/marketing/DeleteMarketingConsentForm";
import {
    DEFAULT_TERMS_CONTENT,
    DEFAULT_TERMS_TITLE,
} from "@/lib/terms/defaultTerms";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
    title: "Marketing - VAIVIA Admin",
};

type MarketingPageProps = {
    searchParams?: Promise<{
        tab?: string;
        sort?: string;
        direction?: string;
        message?: string;
    }>;
};

type TermsVersionRow = {
    id: string;
    version_number: number;
    title: string | null;
    content: string | null;
    change_type: string | null;
    published_at: string | null;
};

type MarketingUserRow = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    marketing_emails_consented_at: string | null;
};

type AdminMarketingClient = {
    from: (table: string) => {
        select: (columns: string, options?: { count?: "exact" }) => {
            eq: (column: string, value: unknown) => Promise<{
                data: unknown[] | null;
                error: { message: string; code?: string; details?: string } | null;
            }>;
            order: (
                column: string,
                options?: { ascending?: boolean }
            ) => {
                limit: (count: number) => Promise<{
                    data: unknown[] | null;
                    error: { message: string; code?: string; details?: string } | null;
                }>;
            };
        };
        insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => Promise<{
            data: unknown[] | null;
            error: { message: string; code?: string; details?: string } | null;
        }>;
        update: (payload: Record<string, unknown>) => {
            eq: (column: string, value: unknown) => Promise<{
                data: unknown[] | null;
                error: { message: string; code?: string; details?: string } | null;
            }>;
        };
    };
};

const MARKETING_SORT_COLUMNS = new Set([
    "first_name",
    "last_name",
    "email",
    "marketing_emails_consented_at",
]);

async function requireSuperAdmin() {
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

    return { supabase, user };
}

async function saveTermsVersion(formData: FormData) {
    "use server";

    const { supabase, user } = await requireSuperAdmin();
    const adminSupabase = supabase as unknown as AdminMarketingClient;
    const title =
        String(formData.get("title") || "").trim() || DEFAULT_TERMS_TITLE;
    const content =
        String(formData.get("content") || "").trim() || DEFAULT_TERMS_CONTENT;
    const changeType =
        String(formData.get("change_type") || "") === "minor" ? "minor" : "major";
    const requiresAcceptance = changeType === "major";

    const { data: currentRows, error: currentError } = await adminSupabase
        .from("terms_versions")
        .select("version_number")
        .order("version_number", { ascending: false })
        .limit(1);

    if (currentError) {
        throw new Error(`Could not load current terms version: ${currentError.message}`);
    }

    const currentVersion = Number(
        (currentRows?.[0] as { version_number?: unknown } | undefined)
            ?.version_number || 0
    );
    const nextVersion = currentVersion + 1;

    const { error } = await adminSupabase.from("terms_versions").insert({
        version_number: nextVersion,
        title,
        content,
        change_type: changeType,
        requires_acceptance: requiresAcceptance,
        created_by: user.id,
        published_at: new Date().toISOString(),
    });

    if (error) {
        throw new Error(`Could not save Terms and Conditions: ${error.message}`);
    }

    const { data: profileRows } = await adminSupabase
        .from("user_profiles")
        .select("id")
        .eq("role", "basic_user");
    const { data: adminRows } = await adminSupabase
        .from("user_profiles")
        .select("id")
        .eq("role", "super_admin");
    const recipients = [...(profileRows || []), ...(adminRows || [])]
        .map((row) => (row as { id?: string }).id)
        .filter((id): id is string => Boolean(id));

    if (recipients.length > 0) {
        await adminSupabase.from("notifications").insert(
            recipients.map((recipientId) => ({
                user_id: recipientId,
                actor_user_id: user.id,
                type: requiresAcceptance
                    ? "terms_acceptance_required"
                    : "terms_updated",
                title: requiresAcceptance
                    ? "Updated Terms require acceptance"
                    : "VAIVIA Terms were updated",
                body: requiresAcceptance
                    ? "Please review and accept the current Terms to continue using VAIVIA."
                    : "VAIVIA made a minor Terms update. Review the latest version when you have a moment.",
                metadata: {
                    terms_version: nextVersion,
                    change_type: changeType,
                },
            }))
        );
    }

    revalidatePath("/admin/marketing");
    revalidatePath("/terms");
    redirect("/admin/marketing?message=terms-saved");
}

async function deleteMarketingConsent(formData: FormData) {
    "use server";

    const { supabase } = await requireSuperAdmin();
    const userId = String(formData.get("user_id") || "");
    if (!userId) throw new Error("Missing user id.");

    const { error } = await supabase
        .from("user_profiles")
        .update({
            marketing_emails_consent: false,
            marketing_emails_consented_at: null,
            marketing_emails_consent_decided_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

    if (error) throw new Error(`Could not remove marketing consent: ${error.message}`);

    revalidatePath("/admin/marketing");
}

function formatDate(value?: string | null) {
    if (!value) return "Unknown";
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(value));
}

function sortLink(
    label: string,
    column: string,
    currentSort: string,
    currentDirection: string
) {
    const nextDirection =
        currentSort === column && currentDirection === "asc" ? "desc" : "asc";
    return (
        <Link
            href={`/admin/marketing?tab=users&sort=${column}&direction=${nextDirection}`}
            className="inline-flex items-center gap-1 text-left font-black text-lime-100 hover:text-lime-200"
        >
            {label}
        </Link>
    );
}

export default async function AdminMarketingPage({
    searchParams,
}: MarketingPageProps) {
    const params = searchParams ? await searchParams : {};
    const activeTab = params.tab === "users" ? "users" : "configuration";
    const sort = MARKETING_SORT_COLUMNS.has(params.sort || "")
        ? (params.sort as string)
        : "marketing_emails_consented_at";
    const direction = params.direction === "asc" ? "asc" : "desc";
    const { supabase } = await requireSuperAdmin();
    const adminSupabase = supabase as unknown as AdminMarketingClient;

    const { data: latestTermsRows } = await adminSupabase
        .from("terms_versions")
        .select("id,version_number,title,content,change_type,published_at")
        .order("published_at", { ascending: false })
        .limit(1);
    const latestTerms = (latestTermsRows?.[0] || null) as TermsVersionRow | null;
    const { data: marketingRows } = await adminSupabase
        .from("user_profiles")
        .select("id,first_name,last_name,email,marketing_emails_consented_at")
        .eq("marketing_emails_consent", true);
    const marketingUsers = ((marketingRows || []) as MarketingUserRow[]).sort(
        (a, b) => {
            const aValue = String(a[sort as keyof MarketingUserRow] || "");
            const bValue = String(b[sort as keyof MarketingUserRow] || "");
            return direction === "asc"
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
        }
    );

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-[calc(6.25rem+var(--safe-area-top))] text-white md:pb-10 md:pl-28 md:pr-8 md:pt-28">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-6 shadow-2xl shadow-black/35">
                    <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                        <Megaphone className="h-4 w-4" aria-hidden="true" />
                        Super Admin
                    </p>
                    <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">
                        Marketing
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                        Manage Terms and Conditions content and marketing email
                        consent records.
                    </p>
                </header>

                <div className="flex flex-wrap gap-2 rounded-full border border-white/10 bg-white/[0.05] p-1">
                    {[
                        ["configuration", "Configuration"],
                        ["users", "Marketing Users"],
                    ].map(([tab, label]) => (
                        <Link
                            key={tab}
                            href={`/admin/marketing?tab=${tab}`}
                            className={`rounded-full px-4 py-2 text-sm font-black transition ${
                                activeTab === tab
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            {label}
                        </Link>
                    ))}
                </div>

                {params.message === "terms-saved" ? (
                    <p className="rounded-2xl border border-lime-300/25 bg-lime-300/10 p-4 text-sm font-bold text-lime-100">
                        Terms and Conditions saved.
                    </p>
                ) : null}

                {activeTab === "configuration" ? (
                    <section className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-6 shadow-2xl shadow-black/35">
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/80">
                                    Configuration
                                </p>
                                <h2 className="mt-2 text-3xl font-black">
                                    Terms and Conditions
                                </h2>
                                <p className="mt-2 text-sm font-semibold text-slate-400">
                                    Current version:{" "}
                                    {latestTerms
                                        ? `v${latestTerms.version_number} (${latestTerms.change_type})`
                                        : "Not published yet"}
                                </p>
                            </div>
                            <Link
                                href="/terms"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-100 transition hover:bg-white/[0.14]"
                            >
                                Preview public page
                            </Link>
                        </div>
                        <form action={saveTermsVersion} className="mt-6 space-y-5">
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                    Title
                                </span>
                                <input
                                    name="title"
                                    defaultValue={
                                        latestTerms?.title || DEFAULT_TERMS_TITLE
                                    }
                                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-bold text-white outline-none focus:border-lime-300/50"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                    Terms content
                                </span>
                                <textarea
                                    name="content"
                                    defaultValue={
                                        latestTerms?.content || DEFAULT_TERMS_CONTENT
                                    }
                                    rows={22}
                                    className="mt-2 w-full rounded-[1.5rem] border border-white/10 bg-slate-950 px-4 py-3 font-mono text-sm font-semibold leading-6 text-white outline-none focus:border-lime-300/50"
                                />
                                <p className="mt-2 text-xs font-semibold text-slate-500">
                                    Use # for a page title and ## for section
                                    headings.
                                </p>
                            </label>
                            <fieldset className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
                                <legend className="px-2 text-xs font-black uppercase tracking-[0.18em] text-lime-200">
                                    Update type
                                </legend>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    <label className="group relative cursor-pointer rounded-2xl text-sm font-bold">
                                        <input
                                            type="radio"
                                            name="change_type"
                                            value="minor"
                                            className="peer sr-only"
                                        />
                                        <span className="flex min-h-full items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-slate-200 transition peer-checked:border-lime-300/50 peer-checked:bg-lime-300 peer-checked:text-slate-950 peer-focus-visible:ring-2 peer-focus-visible:ring-lime-300/60">
                                            <span className="mt-1 h-4 w-4 rounded-full border border-current bg-current/10 shadow-inner shadow-black/20" />
                                            <span>
                                                Minor update
                                                <span className="mt-1 block text-xs font-semibold opacity-70">
                                                Notify users to review. No new
                                                acceptance required.
                                                </span>
                                            </span>
                                        </span>
                                    </label>
                                    <label className="group relative cursor-pointer rounded-2xl text-sm font-bold">
                                        <input
                                            type="radio"
                                            name="change_type"
                                            value="major"
                                            defaultChecked
                                            className="peer sr-only"
                                        />
                                        <span className="flex min-h-full items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-slate-200 transition peer-checked:border-lime-300/50 peer-checked:bg-lime-300 peer-checked:text-slate-950 peer-focus-visible:ring-2 peer-focus-visible:ring-lime-300/60">
                                            <span className="mt-1 h-4 w-4 rounded-full border border-current bg-current/10 shadow-inner shadow-black/20" />
                                            <span>
                                                Major update
                                                <span className="mt-1 block text-xs font-semibold opacity-70">
                                                Require all existing users to
                                                accept the new Terms.
                                                </span>
                                            </span>
                                        </span>
                                    </label>
                                </div>
                            </fieldset>
                            <button
                                type="submit"
                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200"
                            >
                                <Save className="h-4 w-4" aria-hidden="true" />
                                Save Terms
                            </button>
                        </form>
                    </section>
                ) : (
                    <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#03030a]/90 shadow-2xl shadow-black/35">
                        <div className="border-b border-white/10 p-6">
                            <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-200/80">
                                Marketing Users
                            </p>
                            <h2 className="mt-2 text-3xl font-black">
                                Email marketing consent
                            </h2>
                            <p className="mt-2 text-sm font-semibold text-slate-400">
                                Users who have opted in to marketing emails. Use
                                delete to record an unsubscribe request.
                            </p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                                <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-slate-400">
                                    <tr>
                                        <th className="px-5 py-4">
                                            {sortLink("First", "first_name", sort, direction)}
                                        </th>
                                        <th className="px-5 py-4">
                                            {sortLink("Last", "last_name", sort, direction)}
                                        </th>
                                        <th className="px-5 py-4">
                                            {sortLink("Email", "email", sort, direction)}
                                        </th>
                                        <th className="px-5 py-4">
                                            {sortLink(
                                                "Consent date",
                                                "marketing_emails_consented_at",
                                                sort,
                                                direction
                                            )}
                                        </th>
                                        <th className="px-5 py-4">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/10">
                                    {marketingUsers.length > 0 ? (
                                        marketingUsers.map((user) => (
                                            <tr key={user.id}>
                                                <td className="px-5 py-4 font-bold text-white">
                                                    {user.first_name || "-"}
                                                </td>
                                                <td className="px-5 py-4 font-bold text-white">
                                                    {user.last_name || "-"}
                                                </td>
                                                <td className="px-5 py-4 font-semibold text-slate-300">
                                                    {user.email || "-"}
                                                </td>
                                                <td className="px-5 py-4 font-semibold text-slate-300">
                                                    {formatDate(
                                                        user.marketing_emails_consented_at
                                                    )}
                                                </td>
                                                <td className="px-5 py-4">
                                                    <DeleteMarketingConsentForm
                                                        userId={user.id}
                                                        action={
                                                            deleteMarketingConsent
                                                        }
                                                    />
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-5 py-10 text-center text-sm font-bold text-slate-400"
                                            >
                                                No marketing users yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
            </div>
        </main>
    );
}
