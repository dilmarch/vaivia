export const MAX_IMMUNIZATION_DOSES = 20;

export type ImmunizationDose = {
    id?: string;
    doseNumber: number;
    administeredOn: string;
    location: string;
};

export type ImmunizationPassportEntry = {
    id: string;
    disease: string;
    immunizationName: string;
    dosesRequired: number;
    createdAt: string;
    updatedAt: string;
    doses: ImmunizationDose[];
};

export type ImmunizationPassportInput = {
    id?: string | null;
    disease: string;
    immunizationName: string;
    dosesRequired: number;
    doses: ImmunizationDose[];
};

type ImmunizationDoseRow = {
    id?: string | null;
    dose_number?: number | null;
    administered_on?: string | null;
    location?: string | null;
};

type ImmunizationRow = {
    id?: string | null;
    disease?: string | null;
    immunization_name?: string | null;
    doses_required?: number | null;
    created_at?: string | null;
    updated_at?: string | null;
    user_immunization_doses?: ImmunizationDoseRow[] | null;
};

export function createDoseFields(
    count: number,
    current: ImmunizationDose[] = []
) {
    const safeCount = Math.min(
        MAX_IMMUNIZATION_DOSES,
        Math.max(1, Math.trunc(count) || 1)
    );

    return Array.from({ length: safeCount }, (_, index) => {
        const doseNumber = index + 1;
        const existing = current.find((dose) => dose.doseNumber === doseNumber);

        return {
            id: existing?.id,
            doseNumber,
            administeredOn: existing?.administeredOn || "",
            location: existing?.location || "",
        } satisfies ImmunizationDose;
    });
}

export function getCompletedDoseCount(entry: ImmunizationPassportEntry) {
    return entry.doses.filter(
        (dose) => Boolean(dose.administeredOn && dose.location)
    ).length;
}

export function getImmunizationProgress(entry: ImmunizationPassportEntry) {
    const completedDoses = getCompletedDoseCount(entry);
    const dosesRequired = Math.max(1, entry.dosesRequired);

    return {
        completedDoses,
        dosesRequired,
        isComplete: completedDoses >= dosesRequired,
        percentage: Math.min(
            100,
            Math.round((completedDoses / dosesRequired) * 100)
        ),
    };
}

export function mapImmunizationRow(
    row: ImmunizationRow
): ImmunizationPassportEntry | null {
    if (!row.id || !row.disease || !row.immunization_name) return null;

    const dosesRequired = Math.min(
        MAX_IMMUNIZATION_DOSES,
        Math.max(1, Number(row.doses_required) || 1)
    );
    const doses = createDoseFields(
        dosesRequired,
        (row.user_immunization_doses || []).map((dose) => ({
            id: dose.id || undefined,
            doseNumber: Number(dose.dose_number) || 1,
            administeredOn: dose.administered_on || "",
            location: dose.location || "",
        }))
    );

    return {
        id: row.id,
        disease: row.disease,
        immunizationName: row.immunization_name,
        dosesRequired,
        createdAt: row.created_at || "",
        updatedAt: row.updated_at || "",
        doses,
    };
}
