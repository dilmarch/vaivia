import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type AuthPageShellProps = {
    children: ReactNode;
};

export default function AuthPageShell({ children }: AuthPageShellProps) {
    return (
        <main className="flex min-h-svh w-full items-center justify-center bg-[#080511] px-4 py-10 text-white md:px-8">
            <div className="w-full max-w-3xl">
                <div className="mb-8 flex justify-center">
                    <Link
                        href="/"
                        className="inline-flex rounded-2xl focus:outline-none focus:ring-2 focus:ring-lime-300/60"
                        aria-label="VAIVIA home"
                    >
                        <Image
                            src="/icons/vaivia-expanded-logo.png"
                            alt=""
                            width={181}
                            height={80}
                            className="h-16 w-auto object-contain sm:h-20"
                        />
                    </Link>
                </div>
                {children}
            </div>
        </main>
    );
}
