import Link from "next/link";

type TermsFooterLinkProps = {
    className?: string;
};

export default function TermsFooterLink({ className = "" }: TermsFooterLinkProps) {
    return (
        <p
            className={`px-4 text-center text-xs font-semibold leading-5 text-slate-500 ${className}`}
        >
            By using VAIVIA, you agree to the{" "}
            <Link
                href="/terms"
                className="font-black text-lime-200 underline decoration-lime-300/40 underline-offset-4 transition hover:text-lime-100"
            >
                Terms and Conditions
            </Link>
            .
        </p>
    );
}
