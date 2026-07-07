export type CategoryColorOption = {
    key: string;
    label: string;
    hex: string;
    sort_order: number | null;
};

export type UserCategory = {
    id: string;
    user_id: string;
    name: string;
    color_key: string | null;
    is_default?: boolean | null;
    created_at?: string | null;
    updated_at?: string | null;
    color?: CategoryColorOption | null;
};

export const FALLBACK_CATEGORY_COLOR = "#64748B";
export const FALLBACK_CATEGORY_LABEL = "Other";

export function sortCategoriesByName<T extends { name: string }>(categories: T[]) {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name));
}

export function getCategoryHex(category?: {
    color?: { hex?: string | null } | null;
    hex?: string | null;
} | null) {
    return category?.color?.hex || category?.hex || FALLBACK_CATEGORY_COLOR;
}

export function getCategoryLabel(category?: { name?: string | null } | null) {
    return category?.name?.trim() || FALLBACK_CATEGORY_LABEL;
}
