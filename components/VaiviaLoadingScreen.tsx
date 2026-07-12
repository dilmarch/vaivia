import { Bed, Car, MapPin, Plane, Sparkles, Star } from "lucide-react";

export type VaiviaLoadingScreenProps = {
    title?: string;
    subtitle?: string;
    compact?: boolean;
};

const loadingChips = [
    {
        label: "Flights",
        icon: Plane,
        className:
            "left-2 top-8 -rotate-12 border-lime-300/35 text-lime-300 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.18)]",
    },
    {
        label: "Hotels",
        icon: Bed,
        className:
            "right-5 top-3 rotate-6 border-violet-400/40 text-violet-300 shadow-[0_0_24px_rgba(124,60,255,0.22)]",
    },
    {
        label: "Transfers",
        icon: Car,
        className:
            "left-12 top-24 -rotate-6 border-lime-300/35 text-lime-300 shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.16)]",
    },
    {
        label: "Activities",
        icon: Star,
        className:
            "right-0 top-24 rotate-8 border-pink-400/45 text-pink-300 shadow-[0_0_24px_rgba(255,54,190,0.22)]",
    },
    {
        label: "Local tips",
        icon: MapPin,
        className:
            "right-8 top-40 rotate-3 border-violet-400/40 text-violet-300 shadow-[0_0_24px_rgba(124,60,255,0.22)]",
    },
];

export default function VaiviaLoadingScreen({
    title = "Curating your itinerary",
    subtitle = "Handpicking the best experiences just for you.",
    compact = false,
}: VaiviaLoadingScreenProps) {
    const cardWidthClass = compact ? "max-w-[400px]" : "max-w-[440px]";

    return (
        <main className="fixed inset-0 z-[90] overflow-y-auto bg-[#0c0115] text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(var(--vaivia-neon-rgb),0.16),transparent_26%),radial-gradient(circle_at_80%_18%,rgba(255,54,190,0.18),transparent_28%),linear-gradient(180deg,#0c0115_0%,#05030b_52%,#0c0115_100%)]" />
            <div className="absolute inset-0 bg-[url('/dashboard-bg.png')] bg-cover bg-center opacity-20 mix-blend-screen" />
            <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" />

            <div className="relative z-10 flex min-h-full w-full items-center justify-center px-5 pb-[max(2.5rem,var(--safe-area-bottom))] pt-[max(2.5rem,var(--safe-area-top))]">
                <section className="flex w-full justify-center px-0 md:px-10">
                    <div
                        className={`relative w-full ${cardWidthClass} overflow-hidden rounded-[2.25rem] border border-white/10 bg-white/[0.055] p-8 shadow-2xl shadow-black/50 backdrop-blur-2xl`}
                    >
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_12%,rgba(var(--vaivia-neon-rgb),0.22),transparent_24%),radial-gradient(circle_at_86%_28%,rgba(255,54,190,0.18),transparent_28%),radial-gradient(circle_at_58%_56%,rgba(124,60,255,0.22),transparent_32%)]" />
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_30%,rgba(255,255,255,0.03))]" />
                        <div className="pointer-events-none absolute inset-px rounded-[2.2rem] border border-white/10" />

                        <div className="relative z-10">
                            <Sparkles className="mb-5 h-6 w-6 text-lime-300 drop-shadow-[0_0_14px_rgba(var(--vaivia-neon-rgb),0.9)]" />
                            <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">
                                {title}
                            </h1>
                            <p className="mt-3 max-w-xs text-sm leading-6 text-slate-300">
                                {subtitle}
                            </p>
                        </div>

                        <div className="relative z-10 mt-10 h-56">
                            {loadingChips.map(({ label, icon: Icon, className }) => (
                                <div
                                    key={label}
                                    className={`absolute inline-flex items-center gap-2 rounded-full border bg-slate-950/55 px-4 py-2.5 text-sm font-black backdrop-blur-xl transition ${className}`}
                                >
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                    {label}
                                </div>
                            ))}
                        </div>

                        <div className="relative z-10 mt-8 flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-lime-300 shadow-[0_0_18px_rgba(var(--vaivia-neon-rgb),0.75)] animate-vaivia-loading-bar" />
                            </div>
                            <span className="text-xs font-black text-lime-300">65%</span>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
