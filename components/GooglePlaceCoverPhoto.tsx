"use client";

import Script from "next/script";
import { ImageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type GooglePlacePhotoState = {
  url: string;
  sourceUrl?: string | null;
  authors: Array<{
    displayName: string;
    uri?: string | null;
  }>;
};

type GooglePlaceCoverPhotoProps = {
  placeId?: string | null;
  fallbackSourceUrl?: string | null;
  alt: string;
  className?: string;
};

function parseLegacyGooglePhotoAuthors(htmlAttributions: string[]) {
  return htmlAttributions
    .map((html) => {
      const attributionDocument = new DOMParser().parseFromString(
        html,
        "text/html",
      );
      const link = attributionDocument.querySelector("a");
      const displayName = attributionDocument.body.textContent?.trim() || "";
      if (!displayName) return null;
      return {
        displayName,
        uri: link?.href || null,
      };
    })
    .filter((author): author is { displayName: string; uri: string | null } =>
      Boolean(author),
    );
}

function loadLegacyGooglePlacePhoto({
  placeId,
  fallbackSourceUrl,
}: {
  placeId: string;
  fallbackSourceUrl?: string | null;
}) {
  return new Promise<GooglePlacePhotoState | null>((resolve, reject) => {
    const service = new window.google.maps.places.PlacesService(
      document.createElement("div"),
    );
    service.getDetails(
      {
        placeId,
        fields: ["photos", "url"],
      },
      (place, status) => {
        if (
          status !== window.google.maps.places.PlacesServiceStatus.OK ||
          !place
        ) {
          reject(new Error(`Google Places photo lookup failed: ${status}`));
          return;
        }

        const placePhoto = place.photos?.[0];
        if (!placePhoto) {
          resolve(null);
          return;
        }

        resolve({
          url: placePhoto.getUrl({
            maxWidth: 1200,
            maxHeight: 640,
          }),
          sourceUrl: place.url || fallbackSourceUrl,
          authors: parseLegacyGooglePhotoAuthors(placePhoto.html_attributions),
        });
      },
    );
  });
}

export function GooglePlaceCoverPhoto({
  placeId,
  fallbackSourceUrl,
  alt,
  className = "h-44",
}: GooglePlaceCoverPhotoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const [photo, setPhoto] = useState<GooglePlacePhotoState | null>(null);
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (window.google?.maps?.places) {
      setIsGoogleReady(true);
      return;
    }

    const interval = window.setInterval(() => {
      if (!window.google?.maps?.places) return;
      setIsGoogleReady(true);
      window.clearInterval(interval);
    }, 250);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || shouldLoad) return;

    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "180px" },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad || !isGoogleReady || !placeId) return;

    let isActive = true;

    async function loadPhoto() {
      let nextPhoto: GooglePlacePhotoState | null = null;
      try {
        const { Place } = (await window.google.maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
        const place = new Place({ id: placeId! });
        const { place: fetchedPlace } = await place.fetchFields({
          fields: ["photos", "googleMapsURI"],
        });

        const placePhoto = fetchedPlace.photos?.[0];
        if (placePhoto) {
          nextPhoto = {
            url: placePhoto.getURI({
              maxWidth: 1200,
              maxHeight: 640,
            }),
            sourceUrl:
              placePhoto.googleMapsURI ||
              fetchedPlace.googleMapsURI ||
              fallbackSourceUrl,
            authors: placePhoto.authorAttributions.map((author) => ({
              displayName: author.displayName,
              uri: author.uri,
            })),
          };
        }
      } catch (newPlacesError) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "Google Places photo lookup failed; trying the existing Places service:",
            { placeId, error: newPlacesError },
          );
        }
      }

      if (!nextPhoto) {
        try {
          nextPhoto = await loadLegacyGooglePlacePhoto({
            placeId: placeId!,
            fallbackSourceUrl,
          });
        } catch (legacyPlacesError) {
          if (process.env.NODE_ENV === "development") {
            console.warn("Could not load Google Place cover photo:", {
              placeId,
              error: legacyPlacesError,
            });
          }
        }
      }

      if (isActive && nextPhoto) setPhoto(nextPhoto);
    }

    void loadPhoto();
    return () => {
      isActive = false;
    };
  }, [fallbackSourceUrl, isGoogleReady, placeId, shouldLoad]);

  const photoSourceUrl = photo?.sourceUrl || fallbackSourceUrl;

  return (
    <>
      {googleMapsApiKey && placeId ? (
        <Script
          id="google-maps-places"
          src={`https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places`}
          strategy="afterInteractive"
          onLoad={() => setIsGoogleReady(true)}
          onReady={() => setIsGoogleReady(true)}
        />
      ) : null}
      <div
        ref={containerRef}
        className={`relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(var(--vaivia-neon-rgb),0.2),transparent_52%),linear-gradient(135deg,#172033,#03030a_70%)] ${className}`}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon
            className="h-10 w-10 text-lime-200/35"
            aria-hidden="true"
          />
        </div>
        {photo ? (
          // Google photo URIs must be used fresh and must not be proxied or cached.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.url}
            alt={alt}
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setPhoto(null)}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-slate-950/10" />

        {photo && photoSourceUrl ? (
          <div className="absolute bottom-2 right-2 max-w-[calc(100%_-_1rem)] rounded-xl bg-slate-950/80 px-2.5 py-1 text-right text-[9px] font-bold leading-4 text-white shadow-lg backdrop-blur-sm">
            {photo.authors.length > 0 ? (
              <>
                Photo by{" "}
                {photo.authors.map((author, index) => (
                  <span key={author.uri || author.displayName}>
                    {index > 0 ? ", " : ""}
                    {author.uri ? (
                      <a
                        href={author.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-white/50 underline-offset-2 hover:text-lime-200"
                      >
                        {author.displayName}
                      </a>
                    ) : (
                      author.displayName
                    )}
                  </span>
                ))}
                <span aria-hidden="true"> · </span>
              </>
            ) : null}
            <a
              href={photoSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-white/50 underline-offset-2 hover:text-lime-200"
            >
              Google Maps
            </a>
          </div>
        ) : null}
      </div>
    </>
  );
}
