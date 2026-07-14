"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import TermsFooterLink from "@/components/TermsFooterLink";

type AppLayoutShellProps = {
    children: ReactNode;
    nav: ReactNode;
};

export default function AppLayoutShell({ children, nav }: AppLayoutShellProps) {
    const pathname = usePathname();
    const isAuthRoute = pathname?.startsWith("/auth");

    return (
        <>
            {isAuthRoute ? null : nav}
            <div
                className={
                    isAuthRoute
                        ? "min-h-screen pb-8"
                        : "min-h-screen pb-[calc(8.5rem+var(--safe-area-bottom))] md:pb-8 md:pl-24"
                }
            >
                {children}
                <TermsFooterLink
                    className={
                        isAuthRoute
                            ? "-mt-8 pb-8"
                            : "pb-[calc(1rem+var(--safe-area-bottom))] md:pb-0"
                    }
                />
            </div>
        </>
    );
}
