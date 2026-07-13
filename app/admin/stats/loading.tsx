export default function AdminStatsLoading() {
    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-[calc(6.25rem+var(--safe-area-top))] text-white md:pb-10 md:pl-28 md:pr-8 md:pt-28">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="h-48 animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.06]" />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                    {Array.from({ length: 6 }, (_, index) => (
                        <div
                            key={index}
                            className="h-36 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.06]"
                        />
                    ))}
                </div>
                <div className="h-96 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.06]" />
            </div>
        </main>
    );
}
