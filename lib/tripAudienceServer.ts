import {
    buildTripItemParticipantRows,
    parseTripAudienceFormData,
    type TripAudienceItemType,
} from "@/lib/tripAudience";
import { createClient } from "@/lib/supabase/server";

type SupabaseErrorLike = {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
};

type UntypedQueryBuilder = {
    delete: () => {
        eq: (column: string, value: string) => UntypedQueryBuilder;
    };
    insert: (rows: Array<Record<string, unknown>>) => Promise<{
        error: SupabaseErrorLike | null;
    }>;
    eq: (column: string, value: string) => UntypedQueryBuilder;
};

type UntypedSupabaseClient = {
    from: (table: string) => UntypedQueryBuilder;
};

export async function replaceTripItemParticipantsFromForm({
    tripId,
    itemType,
    itemId,
    formData,
}: {
    tripId: string;
    itemType: TripAudienceItemType;
    itemId: string;
    formData: FormData;
}) {
    const audience = parseTripAudienceFormData(formData);
    const supabase = (await createClient()) as unknown as UntypedSupabaseClient;

    const deleteResult = (await supabase
        .from("trip_item_participants")
        .delete()
        .eq("trip_id", tripId)
        .eq("item_type", itemType)
        .eq("item_id", itemId)) as unknown as {
        error: SupabaseErrorLike | null;
    };

    if (deleteResult.error) return deleteResult.error;

    const rows = buildTripItemParticipantRows({
        tripId,
        itemType,
        itemId,
        audience,
    });

    if (rows.length === 0) return null;

    const { error } = await supabase
        .from("trip_item_participants")
        .insert(rows);

    return error;
}
