import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import CountdownUnitToggle from "@/components/CountdownUnitToggle";
import PinkModeToggle from "@/components/PinkModeToggle";
import SettingsCategoriesClient from "@/components/SettingsCategoriesClient";
import SettingsFamilyMembersClient from "@/components/SettingsFamilyMembersClient";
import { createClient } from "@/lib/supabase/server";
import {
    sortCategoriesByName,
    type CategoryColorOption,
    type UserCategory,
} from "@/lib/itineraryCategories";
import {
    getFamilyLimitMessage,
    normalizeFamilyMemberPayload,
    type FamilyMember,
} from "@/lib/travelers";

type SettingsPageProps = {
    searchParams?: Promise<{
        section?: string;
        message?: string;
    }>;
};

function friendlyCategoryMessage(message?: string) {
    if (message === "max-categories") return "You can have up to 20 categories.";
    if (message === "blank-name") return "Category name cannot be blank.";
    return "";
}

function friendlyFamilyMessage(message?: string) {
    if (message === "max-family-members") return "You can add up to 10 family members.";
    if (message === "blank-family-name") return "Family member name is required.";
    return "";
}

function isMaxCategoryError(error: { message?: string; code?: string }) {
    const message = error.message?.toLowerCase() || "";
    return message.includes("20") || message.includes("max") || error.code === "23514";
}

function isMaxFamilyMemberError(error: { message?: string; code?: string }) {
    return Boolean(getFamilyLimitMessage(error.message) || error.code === "23514");
}

async function addFamilyMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const payload = normalizeFamilyMemberPayload(formData, user.id);
    if (!payload.name) redirect("/settings?section=family&message=blank-family-name");

    const { error } = await supabase.from("user_family_members").insert(payload);

    if (error) {
        console.error("Error adding family member:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload,
        });
        if (isMaxFamilyMemberError(error)) {
            redirect("/settings?section=family&message=max-family-members");
        }
        throw new Error(`Could not add family member: ${error.message}`);
    }

    revalidatePath("/settings");
    redirect("/settings?section=family");
}

async function updateFamilyMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const familyMemberId = String(formData.get("family_member_id") || "");
    const payload = normalizeFamilyMemberPayload(formData, user.id);
    if (!payload.name) redirect("/settings?section=family&message=blank-family-name");

    const { user_id: _userId, ...updatePayload } = payload;
    void _userId;

    const { error } = await supabase
        .from("user_family_members")
        .update({ ...updatePayload, updated_at: new Date().toISOString() })
        .eq("id", familyMemberId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error updating family member:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload: updatePayload,
            familyMemberId,
        });
        throw new Error(`Could not update family member: ${error.message}`);
    }

    revalidatePath("/settings");
    redirect("/settings?section=family");
}

async function deleteFamilyMember(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const familyMemberId = String(formData.get("family_member_id") || "");
    const { error } = await supabase
        .from("user_family_members")
        .delete()
        .eq("id", familyMemberId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error deleting family member:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            familyMemberId,
        });
        throw new Error(`Could not delete family member: ${error.message}`);
    }

    revalidatePath("/settings");
    redirect("/settings?section=family");
}

async function addCategory(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const name = String(formData.get("name") || "").trim();
    const colorKey = String(formData.get("color_key") || "").trim();

    if (!name) redirect("/settings?section=categories&message=blank-name");

    const { error } = await supabase.from("user_categories").insert({
        user_id: user.id,
        name,
        color_key: colorKey || null,
    });

    if (error) {
        console.error("Error adding itinerary category:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload: { user_id: user.id, name, color_key: colorKey || null },
        });
        if (isMaxCategoryError(error)) {
            redirect("/settings?section=categories&message=max-categories");
        }
        throw new Error(`Could not add category: ${error.message}`);
    }

    revalidatePath("/settings");
    redirect("/settings?section=categories");
}

async function updateCategory(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const categoryId = String(formData.get("category_id") || "");
    const name = String(formData.get("name") || "").trim();
    const colorKey = String(formData.get("color_key") || "").trim();

    if (!name) redirect("/settings?section=categories&message=blank-name");

    const { error } = await supabase
        .from("user_categories")
        .update({
            name,
            color_key: colorKey || null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", categoryId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error updating itinerary category:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            payload: { categoryId, name, color_key: colorKey || null },
        });
        throw new Error(`Could not update category: ${error.message}`);
    }

    revalidatePath("/settings");
    redirect("/settings?section=categories");
}

async function deleteCategory(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const categoryId = String(formData.get("category_id") || "");
    const { error } = await supabase
        .from("user_categories")
        .delete()
        .eq("id", categoryId)
        .eq("user_id", user.id);

    if (error) {
        console.error("Error deleting itinerary category:", {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            categoryId,
        });
        throw new Error(`Could not delete category: ${error.message}`);
    }

    revalidatePath("/settings");
    redirect("/settings?section=categories");
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
    const params = searchParams ? await searchParams : {};
    const activeSection =
        params.section === "categories"
            ? "categories"
            : params.section === "family"
              ? "family"
              : "general";
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/login");

    const [{ data: categoryRows }, { data: colorRows }, { data: familyRows }] =
        await Promise.all([
        supabase
            .from("user_categories")
            .select("id,user_id,name,color_key,is_default,created_at,updated_at")
            .eq("user_id", user.id),
        supabase
            .from("category_color_options")
            .select("key,label,hex,sort_order")
            .order("sort_order", { ascending: true }),
        supabase
            .from("user_family_members")
            .select("id,user_id,name,relationship,avatar_url,notes,created_at,updated_at")
            .eq("user_id", user.id)
            .order("name", { ascending: true }),
    ]);

    const categories = sortCategoriesByName((categoryRows || []) as UserCategory[]);
    const colors = ((colorRows || []) as CategoryColorOption[]).sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
    );
    const familyMembers = ((familyRows || []) as FamilyMember[]).sort((a, b) =>
        a.name.localeCompare(b.name)
    );

    return (
        <main className="min-h-screen bg-[#0c0115] px-4 py-8 text-white md:pl-28">
            <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[220px_1fr]">
                <aside className="rounded-[1.5rem] border border-white/10 bg-[#080511]/90 p-3 shadow-2xl shadow-black/30">
                    <p className="px-3 py-2 text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                        Settings
                    </p>
                    <nav className="mt-2 space-y-2" aria-label="Settings">
                        <Link
                            href="/settings"
                            className={`block rounded-full px-4 py-2 text-sm font-bold transition ${
                                activeSection === "general"
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            General
                        </Link>
                        <Link
                            href="/settings?section=categories"
                            className={`block rounded-full px-4 py-2 text-sm font-bold transition ${
                                activeSection === "categories"
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            Categories
                        </Link>
                        <Link
                            href="/settings?section=family"
                            className={`block rounded-full px-4 py-2 text-sm font-bold transition ${
                                activeSection === "family"
                                    ? "bg-lime-300 text-slate-950"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            Family Members
                        </Link>
                    </nav>
                </aside>

                <section className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-6 shadow-2xl shadow-black/30">
                    {activeSection === "general" ? (
                        <div className="space-y-6">
                            <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                General
                            </p>
                            <div>
                                <h1 className="mt-2 text-3xl font-black">
                                    General settings
                                </h1>
                                <p className="mt-2 text-slate-400">
                                    Personalize the look and feel of VAIVIA.
                                </p>
                            </div>
                            <PinkModeToggle />
                            <CountdownUnitToggle />
                        </div>
                    ) : activeSection === "categories" ? (
                        <div className="space-y-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                    Categories
                                </p>
                                <h1 className="mt-2 text-3xl font-black">
                                    Itinerary categories
                                </h1>
                                <p className="mt-2 text-slate-400">
                                    Customize the categories and colours you use for
                                    itinerary items.
                                </p>
                            </div>
                            <SettingsCategoriesClient
                                categories={categories}
                                colors={colors}
                                addAction={addCategory}
                                updateAction={updateCategory}
                                deleteAction={deleteCategory}
                                message={friendlyCategoryMessage(params.message)}
                            />
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">
                                    Family Members
                                </p>
                                <h1 className="mt-2 text-3xl font-black">
                                    Family members
                                </h1>
                                <p className="mt-2 text-slate-400">
                                    Add non-user family members or managed travellers
                                    so you can include them in trips and transportation
                                    plans.
                                </p>
                            </div>
                            <SettingsFamilyMembersClient
                                familyMembers={familyMembers}
                                addAction={addFamilyMember}
                                updateAction={updateFamilyMember}
                                deleteAction={deleteFamilyMember}
                                message={friendlyFamilyMessage(params.message)}
                            />
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
