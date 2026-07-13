"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function AdminStatsRefreshButton() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    return (
        <button
            type="button"
            onClick={() => startTransition(() => router.refresh())}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.22)] transition hover:bg-lime-200 disabled:cursor-wait disabled:opacity-70"
            disabled={isPending}
        >
            <RefreshCw
                className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
                aria-hidden="true"
            />
            Refresh
        </button>
    );
}
