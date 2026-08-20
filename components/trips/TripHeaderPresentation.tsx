import type { ReactNode } from "react";

export type TripHeaderPresentationProps = {
  coverImageUrl?: string | null;
  coverImageAlt?: string;
  imageErrorMessage?: string | null;
  onImageLoad?: () => void;
  onImageError?: () => void;
  attribution?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

export function TripHeaderTitlePresentation({
  tripTitle,
  pageLabel,
}: {
  tripTitle: string;
  pageLabel: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-black uppercase tracking-[0.3em] text-lime-200 drop-shadow-[0_4px_18px_rgba(0,0,0,0.65)] sm:text-base">
        {tripTitle || "Untitled trip"}
      </p>
      <h1 className="vaivia-trip-hero-title max-w-5xl text-5xl font-black tracking-tight text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)] sm:text-7xl lg:text-8xl">
        {pageLabel}
      </h1>
    </div>
  );
}

export function TripHeaderPresentation({
  coverImageUrl,
  coverImageAlt = "",
  imageErrorMessage,
  onImageLoad,
  onImageError,
  attribution,
  actions,
  children,
}: TripHeaderPresentationProps) {
  const showCover = Boolean(coverImageUrl && !imageErrorMessage);

  if (showCover) {
    return (
      <div className="vaivia-trip-header-cover relative overflow-hidden">
        {/* A native image keeps this presentation usable in both Next.js and Capacitor. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverImageUrl || ""}
          alt={coverImageAlt}
          className="vaivia-trip-header-cover-media aspect-[16/7] w-full object-cover"
          onLoad={onImageLoad}
          onError={onImageError}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent" />
        {children ? (
          <div className="vaivia-trip-header-cover-content absolute bottom-6 left-6 right-24 sm:bottom-8 sm:left-8">
            {children}
          </div>
        ) : null}
        {attribution}
        {actions}
      </div>
    );
  }

  return (
    <div className="vaivia-trip-header-cover vaivia-trip-header-cover-fallback relative flex min-h-72 items-end overflow-hidden bg-slate-900 p-6 sm:p-8">
      {children}
      {imageErrorMessage ? (
        <div className="absolute left-4 top-4 max-w-lg rounded-md bg-white/95 px-3 py-2 text-sm text-red-700 shadow-sm">
          {imageErrorMessage}
        </div>
      ) : null}
      {actions}
    </div>
  );
}
