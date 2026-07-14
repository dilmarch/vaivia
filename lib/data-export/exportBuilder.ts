import crypto from "node:crypto";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/supabase";

export const DATA_EXPORT_BUCKET = "user-data-exports";
export const DATA_EXPORT_SCHEMA_VERSION = "2026-07-14.1";
export const DATA_EXPORT_EXPIRY_DAYS = 7;
export const DATA_EXPORT_RATE_LIMIT_HOURS = 24;
export const RECENT_AUTH_MAX_AGE_MINUTES = 30;

type JsonRecord = Record<string, unknown>;
type ExportClient = SupabaseClient<Database>;

type DatasetConfig = {
    label: string;
    table: keyof Database["public"]["Tables"] & string;
    column: string;
    value: string;
    sanitize?: (row: JsonRecord) => JsonRecord;
};

type ExportDataset = {
    label: string;
    rows: JsonRecord[];
    warning?: string;
};

type ExportFileManifest = {
    path: string;
    bytes: number;
    sha256: string;
};

type ExportManifest = {
    schemaVersion: string;
    createdAt: string;
    expiresAt: string;
    userId: string;
    datasets: Array<{
        label: string;
        rows: number;
        warning?: string;
    }>;
    sharedDataRule: string;
    omittedSecrets: string[];
    files: ExportFileManifest[];
};

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function hashString(value: string) {
    return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hashBuffer(value: Buffer) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function csvCell(value: unknown) {
    if (value === null || typeof value === "undefined") return "";
    let text =
        typeof value === "string" ? value : JSON.stringify(value) ?? String(value);

    if (/^[=+\-@\t\r]/.test(text)) {
        text = `'${text}`;
    }

    return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(rows: JsonRecord[]) {
    const columns = Array.from(
        rows.reduce<Set<string>>((keys, row) => {
            Object.keys(row).forEach((key) => keys.add(key));
            return keys;
        }, new Set())
    ).sort();

    if (columns.length === 0) return "";

    return [
        columns.map(csvCell).join(","),
        ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
    ].join("\n");
}

function safeStoragePathSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function hasUsableFileExtension(path: string) {
    return /\.[a-z0-9]{2,5}$/i.test(path);
}

function getExtensionFromMimeType(mimeType?: string | null) {
    switch ((mimeType || "").toLowerCase().split(";")[0]?.trim()) {
        case "image/jpeg":
        case "image/jpg":
            return ".jpg";
        case "image/png":
            return ".png";
        case "image/webp":
            return ".webp";
        case "image/gif":
            return ".gif";
        case "application/pdf":
            return ".pdf";
        default:
            return "";
    }
}

function getExtensionFromBuffer(buffer: Buffer) {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return ".jpg";
    }

    if (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
    ) {
        return ".png";
    }

    if (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
        return ".webp";
    }

    if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF") {
        return ".pdf";
    }

    return "";
}

function withDetectedExtension(path: string, mimeType: string | null, buffer: Buffer) {
    if (hasUsableFileExtension(path)) return path;

    const extension = getExtensionFromMimeType(mimeType) || getExtensionFromBuffer(buffer);
    return extension ? `${path}${extension}` : path;
}

function sanitizePushSubscription(row: JsonRecord) {
    const { auth, p256dh, ...safeRow } = row;
    void auth;
    void p256dh;
    return {
        ...safeRow,
        omitted_fields: ["auth", "p256dh"],
    };
}

function sanitizeDataExportRow(row: JsonRecord) {
    const { storage_path, ...safeRow } = row;
    void storage_path;
    return safeRow;
}

async function selectRows(
    supabase: ExportClient,
    dataset: DatasetConfig
): Promise<ExportDataset> {
    const { data, error } = await supabase
        .from(dataset.table)
        .select("*")
        .eq(dataset.column, dataset.value);

    if (error) {
        return {
            label: dataset.label,
            rows: [],
            warning: error.message,
        };
    }

    const rows = ((data || []) as JsonRecord[]).map((row) =>
        dataset.sanitize ? dataset.sanitize(row) : row
    );

    return {
        label: dataset.label,
        rows,
    };
}

async function selectTripScopedRows(
    supabase: ExportClient,
    label: string,
    table: keyof Database["public"]["Tables"] & string,
    tripIds: string[]
): Promise<ExportDataset> {
    if (tripIds.length === 0) return { label, rows: [] };

    const { data, error } = await supabase
        .from(table)
        .select("*")
        .in("trip_id", tripIds);

    if (error) return { label, rows: [], warning: error.message };

    return { label, rows: (data || []) as JsonRecord[] };
}

async function selectExpenseReceiptRows(
    supabase: ExportClient,
    userId: string
): Promise<ExportDataset> {
    const { data, error } = await supabase
        .from("trip_expense_receipts")
        .select("*")
        .eq("uploaded_by", userId);

    if (error) return { label: "trip_expense_receipts", rows: [], warning: error.message };
    return { label: "trip_expense_receipts", rows: (data || []) as JsonRecord[] };
}

async function addTextFile(
    zip: JSZip,
    files: ExportFileManifest[],
    path: string,
    content: string
) {
    zip.file(path, content);
    files.push({
        path,
        bytes: Buffer.byteLength(content, "utf8"),
        sha256: hashString(content),
    });
}

async function addEligibleUploads({
    zip,
    files,
    supabase,
    userId,
    tripRows,
    receiptRows,
}: {
    zip: JSZip;
    files: ExportFileManifest[];
    supabase: ExportClient;
    userId: string;
    tripRows: JsonRecord[];
    receiptRows: JsonRecord[];
}) {
    const uploads: Array<{
        bucket: string;
        storagePath: string;
        archivePath: string;
    }> = [];

    for (const trip of tripRows) {
        const storagePath = String(trip.cover_image_storage_path || "");
        if (
            trip.cover_image_source === "upload" &&
            storagePath.startsWith(`${userId}/`)
        ) {
            uploads.push({
                bucket: "trip-covers",
                storagePath,
                archivePath: `uploads/trip-covers/${safeStoragePathSegment(storagePath)}`,
            });
        }
    }

    for (const receipt of receiptRows) {
        const bucket = String(receipt.storage_bucket || "");
        const storagePath = String(receipt.storage_path || "");
        if (bucket && storagePath) {
            uploads.push({
                bucket,
                storagePath,
                archivePath: `uploads/${safeStoragePathSegment(bucket)}/${safeStoragePathSegment(storagePath)}`,
            });
        }
    }

    for (const upload of uploads) {
        const { data, error } = await supabase.storage
            .from(upload.bucket)
            .download(upload.storagePath);

        if (error || !data) {
            await addTextFile(
                zip,
                files,
                `${upload.archivePath}.download-warning.txt`,
                `VAIVIA could not include this uploaded file.\nBucket: ${upload.bucket}\nPath: ${upload.storagePath}\nReason: ${error?.message || "No file data returned"}\n`
            );
            continue;
        }

        const buffer = Buffer.from(await data.arrayBuffer());
        const archivePath = withDetectedExtension(
            upload.archivePath,
            data.type,
            buffer
        );

        zip.file(archivePath, buffer);
        files.push({
            path: archivePath,
            bytes: buffer.byteLength,
            sha256: hashBuffer(buffer),
        });
    }
}

export function getDataExportExpirationDate(from = new Date()) {
    return addDays(from, DATA_EXPORT_EXPIRY_DAYS);
}

export function isRecentEnoughAuth(lastSignInAt?: string | null) {
    if (!lastSignInAt) return false;
    const signedInAt = new Date(lastSignInAt).getTime();
    if (!Number.isFinite(signedInAt)) return false;
    return Date.now() - signedInAt <= RECENT_AUTH_MAX_AGE_MINUTES * 60 * 1000;
}

export async function buildUserDataExportZip({
    supabase,
    userId,
    email,
    expiresAt,
}: {
    supabase: ExportClient;
    userId: string;
    email?: string | null;
    expiresAt: Date;
}) {
    const ownDatasets: DatasetConfig[] = [
        { label: "profile", table: "user_profiles", column: "id", value: userId },
        { label: "preferences", table: "user_preferences", column: "user_id", value: userId },
        { label: "finance_settings", table: "user_finance_settings", column: "user_id", value: userId },
        { label: "categories", table: "user_categories", column: "user_id", value: userId },
        { label: "family_members", table: "user_family_members", column: "user_id", value: userId },
        { label: "notification_preferences", table: "user_notification_preferences", column: "user_id", value: userId },
        {
            label: "push_subscriptions",
            table: "user_push_subscriptions",
            column: "user_id",
            value: userId,
            sanitize: sanitizePushSubscription,
        },
        { label: "passport_stamps", table: "user_passport_stamps", column: "user_id", value: userId },
        { label: "passport_stamp_shares_sent", table: "user_passport_stamp_shares", column: "sender_user_id", value: userId },
        { label: "passport_stamp_shares_received", table: "user_passport_stamp_shares", column: "recipient_user_id", value: userId },
        { label: "scratch_map_countries", table: "user_scratch_map_countries", column: "user_id", value: userId },
        { label: "travel_bucket_list", table: "user_travel_bucket_list", column: "user_id", value: userId },
        { label: "friend_requests_sent", table: "user_friendships", column: "requester_user_id", value: userId },
        { label: "friend_requests_received", table: "user_friendships", column: "addressee_user_id", value: userId },
        { label: "feature_suggestions", table: "feature_suggestions", column: "user_id", value: userId },
        { label: "notifications", table: "notifications", column: "user_id", value: userId },
        { label: "notification_push_outbox", table: "notification_push_outbox", column: "user_id", value: userId },
        { label: "notification_email_outbox", table: "notification_email_outbox", column: "user_id", value: userId },
        { label: "points", table: "user_points", column: "user_id", value: userId },
        { label: "point_events", table: "user_point_events", column: "user_id", value: userId },
        { label: "terms_acceptances", table: "user_terms_acceptances", column: "user_id", value: userId },
        { label: "activity_daily", table: "user_activity_daily", column: "user_id", value: userId },
        {
            label: "data_export_requests",
            table: "user_data_exports",
            column: "user_id",
            value: userId,
            sanitize: sanitizeDataExportRow,
        },
    ];

    const datasets = await Promise.all(
        ownDatasets.map((dataset) => selectRows(supabase, dataset))
    );

    const { data: accessibleTrips, error: tripsError } = await supabase
        .from("trips")
        .select("*")
        .order("created_at", { ascending: false });

    const tripRows = (accessibleTrips || []) as JsonRecord[];
    datasets.push({
        label: "trips_accessible_to_user",
        rows: tripRows,
        warning: tripsError?.message,
    });

    const tripIds = tripRows
        .map((trip) => String(trip.id || ""))
        .filter(Boolean);

    const tripDatasets = await Promise.all([
        selectTripScopedRows(supabase, "trip_members", "trip_members", tripIds),
        selectTripScopedRows(supabase, "trip_invitations", "trip_invitations", tripIds),
        selectTripScopedRows(supabase, "trip_legs", "trip_legs", tripIds),
        selectTripScopedRows(supabase, "itinerary_items", "itinerary_items", tripIds),
        selectTripScopedRows(supabase, "trip_item_participants", "trip_item_participants", tripIds),
        selectTripScopedRows(supabase, "transportation_items", "transportation_items", tripIds),
        selectTripScopedRows(supabase, "transportation_item_travelers", "transportation_item_travelers", tripIds),
        selectTripScopedRows(supabase, "trip_accommodations", "trip_accommodations", tripIds),
        selectTripScopedRows(supabase, "trip_ideas", "trip_ideas", tripIds),
        selectTripScopedRows(supabase, "trip_idea_reactions", "trip_idea_reactions", tripIds),
        selectTripScopedRows(supabase, "trip_food_items", "trip_food_items", tripIds),
        selectTripScopedRows(supabase, "trip_budgets", "trip_budgets", tripIds),
        selectTripScopedRows(supabase, "trip_budget_line_items", "trip_budget_line_items", tripIds),
        selectTripScopedRows(supabase, "trip_expenses", "trip_expenses", tripIds),
        selectTripScopedRows(supabase, "trip_expense_splits", "trip_expense_splits", tripIds),
    ]);
    datasets.push(...tripDatasets);

    const receiptDataset = await selectExpenseReceiptRows(supabase, userId);
    datasets.push(receiptDataset);

    const zip = new JSZip();
    const files: ExportFileManifest[] = [];
    const createdAt = new Date().toISOString();

    const readme = [
        "VAIVIA data export",
        "",
        `Created: ${createdAt}`,
        `Expires: ${expiresAt.toISOString()}`,
        "",
        "This archive contains structured JSON and CSV files for personal information associated with the authenticated VAIVIA account, plus eligible uploaded files owned by the account.",
        "",
        "Shared-data rule: shared trip records are exported through the authenticated account's normal access rules. The export preserves relationship IDs for context and avoids exporting unrelated private profile fields for other users.",
        "",
        "Security omissions: password hashes, sessions, API keys, Supabase credentials, push subscription auth secrets, and private encryption material are not included.",
        "",
        "For broader access, correction, portability, accessibility, or formal privacy requests, contact VAIVIA through the support channel listed in the app terms.",
        "",
    ].join("\n");
    await addTextFile(zip, files, "README.txt", readme);

    for (const dataset of datasets) {
        const json = JSON.stringify(dataset.rows, null, 2);
        await addTextFile(zip, files, `json/${dataset.label}.json`, json);
        await addTextFile(zip, files, `csv/${dataset.label}.csv`, toCsv(dataset.rows));
    }

    await addEligibleUploads({
        zip,
        files,
        supabase,
        userId,
        tripRows,
        receiptRows: receiptDataset.rows,
    });

    const manifest: ExportManifest = {
        schemaVersion: DATA_EXPORT_SCHEMA_VERSION,
        createdAt,
        expiresAt: expiresAt.toISOString(),
        userId,
        datasets: datasets.map((dataset) => ({
            label: dataset.label,
            rows: dataset.rows.length,
            warning: dataset.warning,
        })),
        sharedDataRule:
            "Trip-scoped datasets are selected through the signed-in user's authenticated access. Friend and invitation datasets include the requester/addressee relationship rows for context, not unrelated private account data.",
        omittedSecrets: [
            "password hashes",
            "session tokens",
            "API keys",
            "Supabase service-role credentials",
            "push subscription auth secret",
            "push subscription p256dh encryption key",
        ],
        files,
    };

    await addTextFile(
        zip,
        files,
        "manifest.json",
        JSON.stringify({ ...manifest, files }, null, 2)
    );

    const archive = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
    });

    const storagePath = `${userId}/${crypto.randomUUID()}.zip`;

    return {
        archive,
        storagePath,
        expiresAt,
        manifest: { ...manifest, files },
        email: email || null,
    };
}
