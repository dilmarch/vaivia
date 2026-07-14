"use client";

import { useEffect, useState } from "react";

export type PreviewableRole = "basic_user" | "super_admin";

const ROLE_PREVIEW_STORAGE_KEY = "vaivia:admin-role-preview";
const ROLE_PREVIEW_EVENT = "vaivia:admin-role-preview-change";

function isPreviewableRole(value: unknown): value is PreviewableRole {
    return value === "basic_user" || value === "super_admin";
}

export function getRolePreviewLabel(role: PreviewableRole) {
    return role === "super_admin" ? "Super Admin" : "Basic User";
}

export function setStoredRolePreview(role: PreviewableRole | null) {
    if (typeof window === "undefined") return;

    if (role) {
        window.localStorage.setItem(ROLE_PREVIEW_STORAGE_KEY, role);
    } else {
        window.localStorage.removeItem(ROLE_PREVIEW_STORAGE_KEY);
    }

    window.dispatchEvent(new Event(ROLE_PREVIEW_EVENT));
}

export function useRolePreview(isSuperAdmin: boolean) {
    const [previewRole, setPreviewRole] = useState<PreviewableRole | null>(null);

    useEffect(() => {
        if (!isSuperAdmin) {
            setPreviewRole(null);
            return;
        }

        function syncPreviewRole() {
            const storedRole = window.localStorage.getItem(
                ROLE_PREVIEW_STORAGE_KEY
            );
            setPreviewRole(isPreviewableRole(storedRole) ? storedRole : null);
        }

        syncPreviewRole();
        window.addEventListener("storage", syncPreviewRole);
        window.addEventListener(ROLE_PREVIEW_EVENT, syncPreviewRole);

        return () => {
            window.removeEventListener("storage", syncPreviewRole);
            window.removeEventListener(ROLE_PREVIEW_EVENT, syncPreviewRole);
        };
    }, [isSuperAdmin]);

    return previewRole;
}

export function getEffectiveIsSuperAdmin({
    realIsSuperAdmin,
    previewRole,
}: {
    realIsSuperAdmin: boolean;
    previewRole: PreviewableRole | null;
}) {
    if (!realIsSuperAdmin) return false;
    if (!previewRole) return realIsSuperAdmin;
    return previewRole === "super_admin";
}
