"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SidebarLogoutButton() {
    const router = useRouter();

    async function logout() {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/auth/login");
        router.refresh();
    }

    return (
        <button
            type="button"
            onClick={logout}
            className="group/item flex h-12 min-h-12 w-12 min-w-12 max-w-12 items-center justify-center gap-0 overflow-hidden rounded-[18px] border border-transparent p-0 text-slate-400 transition-all duration-300 ease-out hover:border-white/10 hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-lime-300/50 group-hover/sidebar:w-full group-hover/sidebar:max-w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3 group-hover/sidebar:py-2 group-focus-within/sidebar:w-full group-focus-within/sidebar:max-w-full group-focus-within/sidebar:justify-start group-focus-within/sidebar:gap-3 group-focus-within/sidebar:px-3 group-focus-within/sidebar:py-2"
            aria-label="Logout"
        >
            <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="pointer-events-none w-0 max-w-0 translate-x-2 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-300 group-hover/sidebar:pointer-events-auto group-hover/sidebar:w-40 group-hover/sidebar:max-w-40 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100 group-focus-within/sidebar:pointer-events-auto group-focus-within/sidebar:w-40 group-focus-within/sidebar:max-w-40 group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100">
                Logout
            </span>
        </button>
    );
}
