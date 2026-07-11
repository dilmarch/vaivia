"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

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
                        ? "min-h-screen"
                        : "min-h-screen pb-[calc(6.25rem+var(--safe-area-bottom))] md:pb-0 md:pl-24"
                }
            >
                {children}
            </div>
        </>
    );
}
