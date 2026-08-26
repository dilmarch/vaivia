import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    createDoseFields,
    getImmunizationProgress,
    mapImmunizationRow,
} from "@/lib/immunizationPassport";

const migration = readFileSync(
    resolve(
        process.cwd(),
        "supabase/migrations/20260826152110_add_immunization_passport.sql"
    ),
    "utf8"
);
const exportBuilder = readFileSync(
    resolve(process.cwd(), "lib/data-export/exportBuilder.ts"),
    "utf8"
);

describe("immunization passport", () => {
    it("creates normalized, private, super-admin-only database records", () => {
        expect(migration).toContain("create table public.user_immunizations");
        expect(migration).toContain(
            "create table public.user_immunization_doses"
        );
        expect(migration).toContain(
            "alter table public.user_immunizations enable row level security"
        );
        expect(migration).toContain(
            "alter table public.user_immunization_doses enable row level security"
        );
        expect(migration).toContain("(select auth.uid()) = user_id");
        expect(migration).toContain("(select public.is_super_admin())");
        expect(migration).toContain(
            "revoke all on table public.user_immunizations from public, anon"
        );
    });

    it("uses an atomic security-invoker save function with server-side validation", () => {
        expect(migration).toContain(
            "create or replace function public.save_user_immunization"
        );
        expect(migration).toContain("security invoker");
        expect(migration).toContain(
            "Only super admins can manage an immunization passport"
        );
        expect(migration).toContain("Received doses must be entered in order");
        expect(migration).toContain("Dose dates cannot be in the future");
        expect(migration).toContain(
            "revoke all on function public.save_user_immunization"
        );
    });

    it("includes immunization records in the owner's private data export", () => {
        expect(exportBuilder).toContain('label: "immunizations"');
        expect(exportBuilder).toContain('label: "immunization_doses"');
        expect(exportBuilder).toContain('.in("immunization_id", immunizationIds)');
    });

    it("expands dose fields while preserving existing values", () => {
        const fields = createDoseFields(3, [
            {
                doseNumber: 1,
                administeredOn: "2025-02-10",
                location: "St. John's Clinic",
            },
        ]);

        expect(fields).toHaveLength(3);
        expect(fields[0]).toMatchObject({
            doseNumber: 1,
            administeredOn: "2025-02-10",
            location: "St. John's Clinic",
        });
        expect(fields[2]).toMatchObject({
            doseNumber: 3,
            administeredOn: "",
            location: "",
        });
    });

    it("derives completed and in-progress display states from received doses", () => {
        const entry = mapImmunizationRow({
            id: "immunization-1",
            disease: "Hepatitis A",
            immunization_name: "Havrix",
            doses_required: 2,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            user_immunization_doses: [
                {
                    id: "dose-1",
                    dose_number: 1,
                    administered_on: "2025-02-10",
                    location: "St. John's Clinic",
                },
                {
                    id: "dose-2",
                    dose_number: 2,
                    administered_on: null,
                    location: null,
                },
            ],
        });

        expect(entry).not.toBeNull();
        expect(getImmunizationProgress(entry!)).toEqual({
            completedDoses: 1,
            dosesRequired: 2,
            isComplete: false,
            percentage: 50,
        });

        entry!.doses[1] = {
            ...entry!.doses[1],
            administeredOn: "2025-08-10",
            location: "Downtown Pharmacy",
        };
        expect(getImmunizationProgress(entry!).isComplete).toBe(true);
    });
});
