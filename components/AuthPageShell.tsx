import type { ReactNode } from "react";

type AuthPageShellProps = {
    children: ReactNode;
};

export default function AuthPageShell({ children }: AuthPageShellProps) {
    return (
        <main className="flex min-h-svh w-full items-center justify-center px-6 py-10">
            <div className="w-full max-w-sm">
                <div className="mb-8 text-center">
                    <p className="text-4xl font-black tracking-[0.22em] text-lime-300 drop-shadow-[0_0_24px_rgba(var(--vaivia-neon-rgb),0.42)]">
                        VAIVIA
                    </p>
                </div>
                {children}
            </div>
        </main>
    );
}
