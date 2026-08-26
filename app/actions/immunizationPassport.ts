"use server";

import { revalidatePath } from "next/cache";
import {
    MAX_IMMUNIZATION_DOSES,
    mapImmunizationRow,
    type ImmunizationPassportEntry,
    type ImmunizationPassportInput,
} from "@/lib/immunizationPassport";
import { createClient } from "@/lib/supabase/server";

export type ImmunizationPassportActionResult = {
    ok: boolean;
    message: string;
    entry?: ImmunizationPassportEntry;
};

async function requireSuperAdmin() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("Sign in again to manage your immunization passport.");

    const { data: profile, error } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (error || profile?.role !== "super_admin") {
        throw new Error("Only super admins can manage an immunization passport.");
    }

    return { supabase, user };
}

function validateInput(input: ImmunizationPassportInput) {
    const disease = String(input.disease || "").trim();
    const immunizationName = String(input.immunizationName || "").trim();
    const dosesRequired = Number(input.dosesRequired);

    if (!disease) throw new Error("Disease is required.");
    if (disease.length > 120)
        throw new Error("Disease must be 120 characters or fewer.");
    if (!immunizationName) throw new Error("Immunization name is required.");
    if (immunizationName.length > 160)
        throw new Error("Immunization name must be 160 characters or fewer.");
    if (
        !Number.isInteger(dosesRequired) ||
        dosesRequired < 1 ||
        dosesRequired > MAX_IMMUNIZATION_DOSES
    ) {
        throw new Error(
            `Doses required must be between 1 and ${MAX_IMMUNIZATION_DOSES}.`
        );
    }

    const doses = Array.from({ length: dosesRequired }, (_, index) => {
        const dose = input.doses.find(
            (candidate) => candidate.doseNumber === index + 1
        );
        const administeredOn = String(dose?.administeredOn || "").trim();
        const location = String(dose?.location || "").trim();

        if (Boolean(administeredOn) !== Boolean(location)) {
            throw new Error(
                `Dose ${index + 1} needs both a date and a location.`
            );
        }
        if (location.length > 240) {
            throw new Error(
                `Dose ${index + 1} location must be 240 characters or fewer.`
            );
        }
        if (administeredOn) {
            const parsedDate = new Date(`${administeredOn}T00:00:00Z`);
            if (
                Number.isNaN(parsedDate.getTime()) ||
                parsedDate.toISOString().slice(0, 10) !== administeredOn
            ) {
                throw new Error(`Dose ${index + 1} needs a valid date.`);
            }
            if (administeredOn > new Date().toISOString().slice(0, 10)) {
                throw new Error("Dose dates cannot be in the future.");
            }
        }

        return {
            administered_on: administeredOn,
            location,
        };
    });

    if (!doses[0]?.administered_on || !doses[0]?.location) {
        throw new Error("The first dose date and location are required.");
    }

    const firstBlankDoseIndex = doses.findIndex(
        (dose) => !dose.administered_on
    );
    if (
        firstBlankDoseIndex >= 0 &&
        doses.slice(firstBlankDoseIndex + 1).some((dose) => dose.administered_on)
    ) {
        throw new Error("Enter received doses in order without gaps.");
    }

    return { disease, immunizationName, dosesRequired, doses };
}

export async function saveImmunizationPassportEntry(
    input: ImmunizationPassportInput
): Promise<ImmunizationPassportActionResult> {
    try {
        const { supabase } = await requireSuperAdmin();
        const validated = validateInput(input);
        const { data: savedId, error } = await supabase.rpc(
            "save_user_immunization",
            {
                target_disease: validated.disease,
                target_immunization_name: validated.immunizationName,
                target_doses_required: validated.dosesRequired,
                target_doses: validated.doses,
                target_immunization_id: input.id || undefined,
            }
        );

        if (error || !savedId) {
            throw new Error(error?.message || "The immunization was not saved.");
        }

        const { data: row, error: readError } = await supabase
            .from("user_immunizations")
            .select(
                "id,disease,immunization_name,doses_required,created_at,updated_at,user_immunization_doses(id,dose_number,administered_on,location)"
            )
            .eq("id", savedId)
            .single();

        if (readError) throw readError;
        const entry = mapImmunizationRow(row);
        if (!entry) throw new Error("The saved immunization could not be loaded.");

        revalidatePath("/profile");
        return {
            ok: true,
            message: input.id ? "Immunization updated." : "Immunization added.",
            entry,
        };
    } catch (error) {
        return {
            ok: false,
            message:
                error instanceof Error
                    ? error.message
                    : "The immunization was not saved.",
        };
    }
}

export async function deleteImmunizationPassportEntry(
    immunizationId: string
): Promise<ImmunizationPassportActionResult> {
    try {
        const { supabase, user } = await requireSuperAdmin();
        const { data, error } = await supabase
            .from("user_immunizations")
            .delete()
            .eq("id", String(immunizationId || ""))
            .eq("user_id", user.id)
            .select("id")
            .maybeSingle();

        if (error || !data) {
            throw new Error(error?.message || "The immunization was not found.");
        }

        revalidatePath("/profile");
        return { ok: true, message: "Immunization removed." };
    } catch (error) {
        return {
            ok: false,
            message:
                error instanceof Error
                    ? error.message
                    : "The immunization was not removed.",
        };
    }
}
