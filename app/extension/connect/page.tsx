import { redirect } from "next/navigation";
import AuthPageShell from "@/components/AuthPageShell";
import {
    normalizeExtensionState,
    parseExtensionRedirectUri,
} from "@/lib/browserExtension/auth";
import { createClient } from "@/lib/supabase/server";

type ConnectPageProps = {
    searchParams: Promise<{
        redirect_uri?: string;
        state?: string;
    }>;
};

export default async function BrowserExtensionConnectPage({
    searchParams,
}: ConnectPageProps) {
    const params = await searchParams;
    const redirectTarget = parseExtensionRedirectUri(params.redirect_uri);
    const state = normalizeExtensionState(params.state);

    if (!redirectTarget || !state) {
        return (
            <AuthPageShell>
                <div className="rounded-[2rem] border border-red-300/25 bg-[#080511] p-7 text-white shadow-2xl shadow-black/40">
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-red-200">
                        VAIVIA extension
                    </p>
                    <h1 className="mt-3 text-3xl font-black">Connection link expired</h1>
                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                        Return to the VAIVIA extension and choose Connect again.
                    </p>
                </div>
            </AuthPageShell>
        );
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    const connectPath = `/extension/connect?${new URLSearchParams({
        redirect_uri: redirectTarget.redirectUri,
        state,
    }).toString()}`;

    if (!user) {
        redirect(`/auth/login?next=${encodeURIComponent(connectPath)}`);
    }

    return (
        <AuthPageShell>
            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#080511] text-white shadow-2xl shadow-black/40">
                <div className="border-b border-white/10 bg-[radial-gradient(circle_at_10%_0%,rgba(var(--vaivia-neon-rgb),0.18),transparent_32%),linear-gradient(135deg,rgba(124,60,255,0.2),transparent_58%)] p-7">
                    <p className="text-xs font-black uppercase tracking-[0.32em] text-lime-200/80">
                        VAIVIA Travel Companion
                    </p>
                    <h1 className="mt-3 text-3xl font-black tracking-tight">
                        Connect this browser?
                    </h1>
                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                        The extension will be able to view your active trips and add
                        travel options you explicitly review and approve.
                    </p>
                </div>
                <div className="space-y-4 p-7">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold leading-6 text-slate-300">
                        Signed in as <span className="font-black text-white">{user.email}</span>
                    </div>
                    <form method="post" action="/api/extension/authorize">
                        <input type="hidden" name="redirect_uri" value={redirectTarget.redirectUri} />
                        <input type="hidden" name="state" value={state} />
                        <button
                            type="submit"
                            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:bg-lime-200"
                        >
                            Connect to VAIVIA
                        </button>
                    </form>
                    <p className="text-center text-xs font-semibold leading-5 text-slate-500">
                        You can revoke this browser connection later. The extension
                        never receives your password.
                    </p>
                </div>
            </div>
        </AuthPageShell>
    );
}
