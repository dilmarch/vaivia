"use client";

import { ExternalLink, MapPinned } from "lucide-react";
import type { ReactNode } from "react";

export function StoredPlacesMapPresentation({
  title,
  latitude,
  longitude,
  label,
  mapsUrl,
  children,
}: {
  title: string;
  latitude?: number | null;
  longitude?: number | null;
  label: string;
  mapsUrl?: string | null;
  children?: ReactNode;
}) {
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const query = hasCoordinates ? `${latitude},${longitude}` : label;
  const embedUrl = query
    ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=14&output=embed`
    : "";
  const externalUrl = mapsUrl || (query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "");
  return (
    <article className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#03030a]/90 text-white shadow-2xl shadow-black/25">
      <div className="flex items-start justify-between gap-4 p-5">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">Map</p><h3 className="mt-1 text-xl font-black">{title}</h3><p className="mt-1 text-sm font-semibold text-slate-400">{label}</p></div>
        <MapPinned className="h-6 w-6 text-lime-200" aria-hidden="true" />
      </div>
      {embedUrl ? <iframe title={`Map of ${label}`} src={embedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-64 w-full border-0" /> : <div className="flex h-48 items-center justify-center bg-white/[0.05] px-6 text-center text-sm font-bold text-slate-400">Add a saved address to view this area.</div>}
      <div className="space-y-4 p-5">
        {children}
        {externalUrl ? <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-100">Open in Google Maps <ExternalLink className="h-4 w-4" aria-hidden="true" /></a> : null}
      </div>
    </article>
  );
}
