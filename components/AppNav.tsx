import Link from "next/link";
import { connection } from "next/server";
import type { UserPreferences, UserProfile } from "@/components/AccountMenu";
import AccountThemeSync from "@/components/AccountThemeSync";
import AuthenticatedActivityRecorder from "@/components/AuthenticatedActivityRecorder";
import AppSidebarNav from "@/components/AppSidebarNav";
import AppTopActionBar, { type AppNotification } from "@/components/AppTopActionBar";
import GlobalQuickAdd from "@/components/GlobalQuickAdd";
import TermsConsentGate from "@/components/TermsConsentGate";
import UsernameRequiredGate from "@/components/UsernameRequiredGate";
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
    let pendingImportCount = 0;
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

        const profileDefaults = getUserProfileDefaults(user);
        const { data: profileData, error: profileError } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();
        let nextProfile = profileData as Partial<UserProfile> | null;

        if (profileError) {
            console.warn("Could not load user profile:", {
                message: profileError.message,
                code: profileError.code,
                details: profileError.details,
            });
        } else {
            if (
                profileDefaults.email &&
                (!nextProfile || !nextProfile.email)
            ) {
                const now = new Date().toISOString();
                const { data: repairedProfile, error: repairProfileError } =
                    await supabase
                        .from("user_profiles")
                        .upsert(
                            {
                                id: user.id,
                                first_name:
                                    nextProfile?.first_name ??
                                    profileDefaults.first_name,
                                last_name:
                                    nextProfile?.last_name ??
                                    profileDefaults.last_name,
                                username:
                                    nextProfile?.username ??
                                    profileDefaults.username,
                                email: profileDefaults.email,
                                avatar_url:
                                    nextProfile?.avatar_url ??
                                    profileDefaults.avatar_url,
                                join_date:
                                    nextProfile?.join_date ??
                                    profileDefaults.join_date ??
                                    now,
                                updated_at: now,
                            },
                            { onConflict: "id" }
                        )
                        .select("*")
                        .maybeSingle();

                if (repairProfileError) {
                    console.warn("Could not repair profile email for invite claim:", {
                        message: repairProfileError.message,
                        code: repairProfileError.code,
                        details: repairProfileError.details,
                    });
                } else {
                    nextProfile = repairedProfile as Partial<UserProfile> | null;
                }
            }

            profile = nextProfile;
        }

        profile = mergeProfileWithAuthDefaults(profile, profileDefaults);

        const { error: claimInvitesError } = await supabase.rpc(
            "claim_pending_trip_invitations_for_current_user"
        );

        if (claimInvitesError) {
            console.warn("Could not claim pending trip invitations:", {
                message: claimInvitesError.message,
                code: claimInvitesError.code,
                details: claimInvitesError.details,
            });
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

        const { count: importsCount, error: importsCountError } = await supabase
            .from("travel_email_imports")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .in("status", ["needs_review", "ready"]);

        if (importsCountError) {
            console.warn("Could not load travel import count:", {
                message: importsCountError.message,
                code: importsCountError.code,
                details: importsCountError.details,
            });
        } else {
            pendingImportCount = importsCount || 0;
        }

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
            {user ? (
                <UsernameRequiredGate
                    userId={user.id}
                    email={user.email}
                    initialUsername={profile?.username || null}
                />
            ) : null}
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
                        pendingImportCount={pendingImportCount}
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
