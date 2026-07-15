"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

function getUtcActivitySessionKey() {
    return `vaivia:activity-recorded:${new Date().toISOString().slice(0, 10)}`;
}

function getLoginMilestoneSessionKey() {
    return "vaivia:login-milestone-recorded";
}

export default function AuthenticatedActivityRecorder() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        const activitySessionKey = getUtcActivitySessionKey();
        const loginMilestoneSessionKey = getLoginMilestoneSessionKey();

        const supabase = createClient();

        if (window.sessionStorage.getItem(activitySessionKey) !== "1") {
            window.sessionStorage.setItem(activitySessionKey, "1");

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
        }

        if (window.sessionStorage.getItem(loginMilestoneSessionKey) !== "1") {
            window.sessionStorage.setItem(loginMilestoneSessionKey, "1");

            void supabase.rpc(
                "record_user_login_milestone" as "record_user_activity"
            ).then(
                ({
                    error,
                }: {
                    error: {
                        message?: string;
                        code?: string;
                        details?: string;
                        hint?: string;
                    } | null;
                }) => {
                    if (error && process.env.NODE_ENV === "development") {
                        console.warn("Could not record VAIVIA login milestone:", {
                            message: error.message,
                            code: error.code,
                            details: error.details,
                            hint: error.hint,
                        });
                    }

                    if (!error) {
                        window.dispatchEvent(
                            new Event("vaivia:notifications-changed")
                        );
                    }
                });
        }
    }, []);

    return null;
}
