import Link from "next/link";
import { connection } from "next/server";
import type { UserPreferences, UserProfile } from "@/components/AccountMenu";
import AccountThemeSync from "@/components/AccountThemeSync";
import AuthenticatedActivityRecorder from "@/components/AuthenticatedActivityRecorder";
import AppSidebarNav from "@/components/AppSidebarNav";
import AppTopActionBar, { type AppNotification } from "@/components/AppTopActionBar";
import GlobalQuickAdd from "@/components/GlobalQuickAdd";
import TermsConsentGate from "@/components/TermsConsentGate";
import MobilePushPrompt from "@/components/pwa/MobilePushPrompt";
import { loadActiveDropdownNotifications } from "@/lib/notifications/dropdown";
import {
    ensureNewUserOnboardingProgress,
    loadOnboardingProgress,
    type OnboardingProgress,
} from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import { loadActiveMemberTrips, type SharedTrip } from "@/lib/sharedTrips";
import {
    getUserProfileDefaults,
    mergeProfileWithAuthDefaults,
} from "@/lib/userProfileDefaults";

type NavTrip = {
    id: string;
    slug?: string | null;
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
        <>
            <aside className="fixed left-0 top-0 z-50 hidden h-screen w-24 flex-col border-r border-white/10 bg-slate-950/95 px-4 py-6 shadow-2xl shadow-black/40 backdrop-blur-xl md:flex">
                <Link href="/" className="mb-12 text-center text-lg font-black tracking-[0.18em] text-lime-300">
                    VAIVIA
                </Link>
                <div className="space-y-3">
                    {Array.from({ length: 7 }, (_, index) => (
                        <div
                            key={index}
                            className="h-12 rounded-2xl bg-white/[0.04]"
                        />
                    ))}
                </div>
            </aside>
            <div className="fixed inset-x-0 bottom-0 z-50 h-16 border-t border-white/10 bg-slate-950/95 md:hidden" />
        </>
    );
}

export default async function AppNav() {
    await connection();

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    let upcomingTrips: NavTrip[] = [];
    let notifications: AppNotification[] = [];
    let profile: Partial<UserProfile> | null = null;
    let preferences: Partial<UserPreferences> | null = null;
    let onboardingProgress: OnboardingProgress | null = null;

    if (user) {
        const { trips, error: tripsError } = await loadActiveMemberTrips(
            supabase,
            user.id
        );

        if (tripsError) {
            console.warn("Could not load navigation trips:", {
                message: tripsError.message,
                code: tripsError.code,
                details: tripsError.details,
            });
        } else {
            upcomingTrips = getUpcomingTrips((trips || []) as SharedTrip[]);
        }

        const {
            data: dropdownNotifications,
            error: notificationsError,
        } = await loadActiveDropdownNotifications(supabase, user.id);

        if (notificationsError) {
            console.warn("Could not load notifications:", {
                message: notificationsError.message,
                code: notificationsError.code,
                details: notificationsError.details,
            });
        } else {
            notifications = (dropdownNotifications || []) as AppNotification[];
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

        profile = mergeProfileWithAuthDefaults(
            profile,
            getUserProfileDefaults(user)
        );

        const { data: progressData, error: onboardingError } =
            await loadOnboardingProgress(supabase, user.id);

        if (onboardingError) {
            console.warn("Could not load onboarding progress:", {
                message: onboardingError.message,
                code: onboardingError.code,
                details: onboardingError.details,
            });
        } else {
            onboardingProgress = progressData;
        }

        if (!onboardingProgress) {
            const { data: createdProgress, error: createProgressError } =
                await ensureNewUserOnboardingProgress(supabase, user.id);
            if (createProgressError) {
                console.warn("Could not start onboarding progress:", {
                    message: createProgressError.message,
                    code: createProgressError.code,
                    details: createProgressError.details,
                });
            } else {
                onboardingProgress = createdProgress;
            }
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
        <>
            {user ? <AuthenticatedActivityRecorder /> : null}
            {user ? <TermsConsentGate userId={user.id} /> : null}
            <AccountThemeSync
                userId={user?.id || null}
                themeMode={preferences?.theme_mode || null}
            />
            <AppSidebarNav
                userId={user?.id}
                email={user?.email}
                joinedAt={user?.created_at}
                profile={profile}
                preferences={preferences}
                firstTripId={upcomingTrips[0]?.id || null}
            />
            {user ? (
                <>
                    <AppTopActionBar
                        trips={upcomingTrips}
                        notifications={notifications}
                        isSuperAdmin={profile?.role === "super_admin"}
                        onboardingProgress={onboardingProgress}
                    />
                    <GlobalQuickAdd trips={upcomingTrips} />
                    <MobilePushPrompt
                        vapidPublicKey={
                            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null
                        }
                    />
                </>
            ) : null}
        </>
    );
}
