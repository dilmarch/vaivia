"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

function getUtcActivitySessionKey() {
    return `vaivia:activity-recorded:${new Date().toISOString().slice(0, 10)}`;
}

export default function AuthenticatedActivityRecorder() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        const activitySessionKey = getUtcActivitySessionKey();
        if (window.sessionStorage.getItem(activitySessionKey) === "1") return;

        window.sessionStorage.setItem(activitySessionKey, "1");

        const supabase = createClient();
        void supabase.rpc("record_user_activity").then(({ error }) => {
            if (error && process.env.NODE_ENV === "development") {
                console.warn("Could not record VAIVIA activity:", {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint,
                });
            }
        });
    }, []);

    return null;
}
