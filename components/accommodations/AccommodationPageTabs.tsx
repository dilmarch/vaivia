import Link from "next/link";
import { BedDouble, MapPinned } from "lucide-react";

export type AccommodationPageTab = "stays" | "planning";

type AccommodationPageTabsProps = {
    activeTab: AccommodationPageTab;
    baseHref: string;
};

const tabs = [
    {
        id: "stays",
        label: "Planned Stays",
        description: "Coverage and booking details",
        icon: BedDouble,
    },
    {
        id: "planning",
        label: "Compare Stays",
        description: "Compare stays with your plans",
        icon: MapPinned,
    },
] as const;

export default function AccommodationPageTabs({
    activeTab,
    baseHref,
}: AccommodationPageTabsProps) {
    return (
        <nav
            aria-label="Stay views"
            className="grid gap-2 rounded-[1.5rem] border border-white/10 bg-[#03030a] p-2 text-white shadow-2xl shadow-black/20 sm:inline-grid sm:grid-cols-2"
        >
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const href =
                    tab.id === "planning"
                        ? `${baseHref}?tab=planning`
                        : baseHref;

                return (
                    <Link
                        key={tab.id}
                        href={href}
                        aria-label={`${tab.label}: ${tab.description}`}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-[1.05rem] px-4 py-3 text-left transition sm:min-w-56 ${
                            isActive
                                ? "bg-lime-300 text-slate-950 shadow-[0_0_26px_rgba(var(--vaivia-neon-rgb),0.2)]"
                                : "text-slate-300 hover:bg-white/10 hover:text-white"
                        }`}
                    >
                        <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
                                isActive
                                    ? "border-black/10 bg-black/10"
                                    : "border-white/10 bg-white/[0.06]"
                            }`}
                        >
                            <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span>
                            <span className="block text-sm font-black uppercase tracking-[0.12em]">
                                {tab.label}
                            </span>
                            <span
                                className={`mt-0.5 block text-xs font-semibold ${
                                    isActive
                                        ? "text-slate-800"
                                        : "text-slate-500"
                                }`}
                            >
                                {tab.description}
                            </span>
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
