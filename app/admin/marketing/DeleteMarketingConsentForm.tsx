"use client";

import { Trash2 } from "lucide-react";

type DeleteMarketingConsentFormProps = {
    userId: string;
    action: (formData: FormData) => void | Promise<void>;
};

export default function DeleteMarketingConsentForm({
    userId,
    action,
}: DeleteMarketingConsentFormProps) {
    return (
        <form
            action={action}
            onSubmit={(event) => {
                const confirmed = window.confirm(
                    "Remove this user from the marketing consent list?"
                );
                if (!confirmed) event.preventDefault();
            }}
        >
            <input type="hidden" name="user_id" value={userId} />
            <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/20"
            >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
            </button>
        </form>
    );
}
