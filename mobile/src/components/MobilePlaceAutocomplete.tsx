import { useEffect, useRef, useState } from "react";
import type { MobilePlaceDetails, MobilePlaceSuggestion } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "../lib/apiClient";

export function MobilePlaceAutocomplete({
  apiClient,
  label,
  value,
  onValueChange,
  onPlaceSelect,
  required = false,
}: {
  apiClient: MobileApiClient;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  onPlaceSelect: (place: MobilePlaceDetails) => void;
  required?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<MobilePlaceSuggestion[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const sessionTokenRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (value.trim().length < 2) { setSuggestions([]); setError(""); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      void apiClient.searchPlaces(value, sessionTokenRef.current, controller.signal)
        .then(({ places }) => { setSuggestions(places); setError(""); })
        .catch((caught: unknown) => {
          if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Place search is unavailable.");
        })
        .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    }, 280);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [apiClient, value]);

  async function selectPlace(suggestion: MobilePlaceSuggestion) {
    setIsLoading(true);
    setError("");
    try {
      const { place } = await apiClient.getPlaceDetails(suggestion.placeId, sessionTokenRef.current);
      onValueChange(place.name);
      onPlaceSelect(place);
      setSuggestions([]);
      sessionTokenRef.current = crypto.randomUUID();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Place details are unavailable.");
    } finally { setIsLoading(false); }
  }

  return (
    <label className="relative block space-y-2">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-lime-200">{label}</span>
      <input
        type="search"
        value={value}
        required={required}
        onChange={(event) => onValueChange(event.target.value)}
        autoComplete="off"
        aria-describedby={error ? `${label.replaceAll(" ", "-")}-error` : undefined}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/60"
      />
      {isLoading ? <span className="text-xs font-bold text-slate-400" role="status">Searching places…</span> : null}
      {error ? <span id={`${label.replaceAll(" ", "-")}-error`} className="text-xs font-bold text-red-200" role="alert">{error}</span> : null}
      {suggestions.length ? (
        <ul className="absolute left-0 right-0 top-full z-[110] mt-2 max-h-64 overflow-y-auto rounded-[22px] border border-lime-300/30 bg-[#080511]/[0.98] p-2 text-white shadow-2xl shadow-black/60 backdrop-blur-xl">
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId}>
              <button type="button" onClick={() => void selectPlace(suggestion)} className="w-full rounded-2xl px-4 py-3 text-left transition hover:bg-lime-300 hover:text-slate-950">
                <span className="block font-black">{suggestion.name}</span>
                {suggestion.address ? <span className="mt-1 block text-xs font-semibold opacity-70">{suggestion.address}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </label>
  );
}
