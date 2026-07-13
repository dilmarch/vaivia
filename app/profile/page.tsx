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

    const profile = mergeProfileWithAuthDefaults(
        profileData as Partial<UserProfile> | null,
        getUserProfileDefaults(user)
    );

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-[calc(7.75rem+var(--safe-area-top))] text-white md:pb-10 md:pl-28 md:pr-8 md:pt-28">
            <AccountMenu
                userId={user.id}
                email={user.email}
                joinedAt={user.created_at}
                profile={profile}
                preferences={preferencesData as Partial<UserPreferences> | null}
                variant="profile-page"
            />
        </main>
    );
}
