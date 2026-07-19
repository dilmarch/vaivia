"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SAFE_ELEMENTS = [
    "p",
    "strong",
    "em",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "a",
    "h1",
    "h2",
    "h3",
    "hr",
] as const;

function isSafeHref(href?: string) {
    if (!href) return false;
    try {
        const url = new URL(href);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}
export default function SafeMarkdown({ content }: { content: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            allowedElements={[...SAFE_ELEMENTS]}
            unwrapDisallowed
            components={{
                a: ({ href, children }) =>
                    isSafeHref(href) ? (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-lime-200 underline decoration-lime-300/40 underline-offset-2 hover:text-lime-100"
                        >
                            {children}
                        </a>
                    ) : (
                        <span>{children}</span>
                    ),
                h1: ({ children }) => (
                    <h2 className="mt-4 text-lg font-black text-white">{children}</h2>
                ),
                h2: ({ children }) => (
                    <h3 className="mt-4 text-base font-black text-white">{children}</h3>
                ),
                h3: ({ children }) => (
                    <h4 className="mt-3 font-black text-white">{children}</h4>
                ),
                p: ({ children }) => <p className="my-2 leading-7">{children}</p>,
                ul: ({ children }) => (
                    <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
                ),
                ol: ({ children }) => (
                    <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
                ),
                blockquote: ({ children }) => (
                    <blockquote className="my-3 border-l-2 border-lime-300/50 pl-4 text-slate-300">
                        {children}
                    </blockquote>
                ),
                code: ({ children }) => (
                    <code className="rounded bg-black/35 px-1.5 py-0.5 text-[0.92em] text-lime-100">
                        {children}
                    </code>
                ),
                pre: ({ children }) => (
                    <pre className="my-3 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
                        {children}
                    </pre>
                ),
            }}
        >
            {content}
        </ReactMarkdown>
    );
}
