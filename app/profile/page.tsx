import { redirect } from "next/navigation";
import AccountMenu, {
    type UserPreferences,
    type UserProfile,
} from "@/components/AccountMenu";
import { createClient } from "@/lib/supabase/server";
import {
    getUserProfileDefaults,
    mergeProfileWithAuthDefaults,
} from "@/lib/userProfileDefaults";
import {
    mapImmunizationRow,
    type ImmunizationPassportEntry,
} from "@/lib/immunizationPassport";

export default async function ProfilePage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const [{ data: profileData }, { data: preferencesData }] = await Promise.all([
        supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase
            .from("user_preferences")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle(),
    ]);

    const profile: Partial<UserProfile> = mergeProfileWithAuthDefaults(
        profileData as Partial<UserProfile> | null,
        getUserProfileDefaults(user)
    );
    let immunizations: ImmunizationPassportEntry[] = [];

    if (profile.role === "super_admin") {
        const { data: immunizationRows, error: immunizationError } = await supabase
            .from("user_immunizations")
            .select(
                "id,disease,immunization_name,doses_required,created_at,updated_at,user_immunization_doses(id,dose_number,administered_on,location)"
            )
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false });

        if (immunizationError) {
            console.warn("Could not load immunization passport:", {
                message: immunizationError.message,
                code: immunizationError.code,
                details: immunizationError.details,
                hint: immunizationError.hint,
            });
        } else {
            immunizations = (immunizationRows || [])
                .map((row) => mapImmunizationRow(row))
                .filter(
                    (entry): entry is ImmunizationPassportEntry => Boolean(entry)
                );
        }
    }

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-[calc(7.75rem+var(--safe-area-top))] text-white md:pb-10 md:pl-28 md:pr-8 md:pt-28">
            <AccountMenu
                userId={user.id}
                email={user.email}
                joinedAt={user.created_at}
                profile={profile}
                preferences={preferencesData as Partial<UserPreferences> | null}
                immunizations={immunizations}
                variant="profile-page"
            />
        </main>
    );
}
