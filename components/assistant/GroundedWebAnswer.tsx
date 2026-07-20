import type {
    AssistantGroundingSource,
    AssistantWebGrounding,
} from "@/lib/ai/grounding-contract";

function byteOffsetToStringIndex(value: string, targetByteOffset: number) {
    let byteOffset = 0;
    let stringIndex = 0;
    for (const character of value) {
        if (byteOffset >= targetByteOffset) break;
        byteOffset += new TextEncoder().encode(character).length;
        stringIndex += character.length;
    }
    return byteOffset === targetByteOffset ? stringIndex : null;
}

function CitationLink({
    source,
    number,
}: {
    source: AssistantGroundingSource;
    number: number;
}) {
    return (
        <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Source ${number}: ${source.title}`}
            title={source.title}
            className="ml-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border border-lime-300/30 bg-lime-300/10 px-1.5 align-middle text-[10px] font-black leading-none text-lime-200 hover:bg-lime-300/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300"
        >
            {number}
        </a>
    );
}

export default function GroundedWebAnswer({
    content,
    grounding,
}: {
    content: string;
    grounding: AssistantWebGrounding;
}) {
    const sourcesById = new Map(grounding.sources.map((source) => [source.id, source]));
    const sourceNumberById = new Map(
        grounding.sources.map((source, index) => [source.id, index + 1])
    );
    const rendered: React.ReactNode[] = [];
    let previousStringIndex = 0;

    grounding.supports.forEach((support, supportIndex) => {
        const endStringIndex = byteOffsetToStringIndex(content, support.endIndex);
        if (endStringIndex === null || endStringIndex < previousStringIndex) return;
        rendered.push(content.slice(previousStringIndex, endStringIndex));
        support.sourceIds.forEach((sourceId) => {
            const source = sourcesById.get(sourceId);
            const number = sourceNumberById.get(sourceId);
            if (!source || !number) return;
            rendered.push(
                <CitationLink
                    key={`${supportIndex}:${sourceId}`}
                    source={source}
                    number={number}
                />
            );
        });
        previousStringIndex = endStringIndex;
    });
    rendered.push(content.slice(previousStringIndex));

    return (
        <div aria-label="Current web answer with Google Search citations">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-lime-200">
                <span className="h-1.5 w-1.5 rounded-full bg-lime-300" aria-hidden="true" />
                Current web sources
            </div>
            <div className="whitespace-pre-wrap leading-7">{rendered}</div>

            <section className="mt-5 border-t border-white/10 pt-4" aria-labelledby="grounded-sources-title">
                <h3 id="grounded-sources-title" className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    Sources
                </h3>
                <ol className="mt-2 space-y-2 text-xs leading-5">
                    {grounding.sources.map((source, index) => (
                        <li key={source.id} className="flex gap-2">
                            <span className="font-black text-lime-300" aria-hidden="true">
                                {index + 1}.
                            </span>
                            <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-words font-bold text-slate-200 underline decoration-white/20 underline-offset-2 hover:text-white"
                            >
                                {source.title}
                            </a>
                        </li>
                    ))}
                </ol>
            </section>

            <section className="mt-4" aria-label="Google Search Suggestions">
                <iframe
                    title="Google Search Suggestions"
                    srcDoc={grounding.searchEntryPointHtml}
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    className="h-16 w-full max-w-full border-0 bg-transparent"
                />
            </section>

            <p className="mt-3 text-[11px] font-semibold leading-5 text-slate-400">
                Current information can change. Verify important dates, availability,
                closures, and access details with the cited source.
            </p>
        </div>
    );
}
