import Link from "next/link";
import { connection } from "next/server";
import AccountMenu, {
    type UserPreferences,
    type UserProfile,
} from "@/components/AccountMenu";
import { createClient } from "@/lib/supabase/server";

type NavTrip = {
    id: string;
    title: string | null;
    destination: string | null;
    start_date: string | null;
    end_date: string | null;
};

function getLocalDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatTripLabel(trip: NavTrip) {
    return trip.title || trip.destination || "Untitled trip";
}

function formatTripDate(trip: NavTrip) {
    if (!trip.start_date) return "Dates TBD";

    const startDate = new Date(`${trip.start_date}T00:00:00`);
    const endDate = trip.end_date ? new Date(`${trip.end_date}T00:00:00`) : null;
    const formatter = new Intl.DateTimeFormat("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    if (!endDate || trip.end_date === trip.start_date) {
        return formatter.format(startDate);
    }

    return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function getUpcomingTrips(trips: NavTrip[]) {
    const todayKey = getLocalDateKey(new Date());

    return trips.filter((trip) => {
        if (trip.end_date) return trip.end_date >= todayKey;
        if (trip.start_date) return trip.start_date >= todayKey;
        return true;
    });
}

export function AppNavFallback() {
    return (
        <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
            <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
                <Link
                    href="/"
                    className="text-lg font-black tracking-[0.18em] text-slate-950"
                >
                    VAIVIA
                </Link>
                <nav className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                    Loading...
                </nav>
            </div>
        </header>
    );
}

export default async function AppNav() {
    await connection();

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    let upcomingTrips: NavTrip[] = [];
    let profile: Partial<UserProfile> | null = null;
    let preferences: Partial<UserPreferences> | null = null;

    if (user) {
        const { data: trips, error: tripsError } = await supabase
            .from("trips")
            .select("id,title,destination,start_date,end_date")
            .eq("user_id", user.id)
            .order("start_date", { ascending: true });

        if (tripsError) {
            console.warn("Could not load navigation trips:", {
                message: tripsError.message,
                code: tripsError.code,
                details: tripsError.details,
            });
        } else {
            upcomingTrips = getUpcomingTrips((trips || []) as NavTrip[]);
        }

        const { data: profileData, error: profileError } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

        if (profileError) {
            console.warn("Could not load user profile:", {
                message: profileError.message,
                code: profileError.code,
                details: profileError.details,
            });
        } else {
            profile = profileData as Partial<UserProfile> | null;
        }

        const { data: preferencesData, error: preferencesError } = await supabase
            .from("user_preferences")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

        if (preferencesError) {
            console.warn("Could not load user preferences:", {
                message: preferencesError.message,
                code: preferencesError.code,
                details: preferencesError.details,
            });
        } else {
            preferences = preferencesData as Partial<UserPreferences> | null;
        }
    }

    return (
        <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
            <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
                <Link
                    href="/"
                    className="text-lg font-black tracking-[0.18em] text-slate-950 transition hover:text-slate-700"
                >
                    VAIVIA
                </Link>

                <nav
                    className="flex flex-wrap items-center justify-end gap-2"
                    aria-label="Main navigation"
                >
                    <Link
                        href="/"
                        className="rounded-md px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
                    >
                        My Trips
                    </Link>

                    <div className="group relative">
                        <button
                            type="button"
                            className="rounded-md px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
                            aria-haspopup="menu"
                        >
                            Itinerary
                        </button>
                        <div className="invisible absolute right-0 top-full z-[60] w-80 translate-y-1 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                            <div className="rounded-md border border-slate-200 bg-white p-2 shadow-xl">
                                <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                    Upcoming itineraries
                                </p>
                                <div className="max-h-80 overflow-y-auto">
                                    {user ? (
                                        upcomingTrips.length > 0 ? (
                                            upcomingTrips.map((trip) => (
                                                <Link
                                                    key={trip.id}
                                                    href={`/trips/${trip.id}`}
                                                    className="block rounded-md px-3 py-2 transition hover:bg-slate-50"
                                                >
                                                    <span className="block truncate text-sm font-semibold text-slate-950">
                                                        {formatTripLabel(trip)}
                                                    </span>
                                                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                                                        {formatTripDate(trip)}
                                                    </span>
                                                </Link>
                                            ))
                                        ) : (
                                            <p className="px-3 py-4 text-sm text-slate-500">
                                                No upcoming itineraries yet.
                                            </p>
                                        )
                                    ) : (
                                        <Link
                                            href="/auth/login"
                                            className="block rounded-md px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                                        >
                                            Sign in to view itineraries
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {user ? (
                        <AccountMenu
                            userId={user.id}
                            email={user.email}
                            joinedAt={user.created_at}
                            profile={profile}
                            preferences={preferences}
                        />
                    ) : (
                        <Link
                            href="/auth/login"
                            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                        >
                            My account
                        </Link>
                    )}
                </nav>
            </div>
        </header>
    );
}
