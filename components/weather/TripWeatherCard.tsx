"use client";

import Image from "next/image";
import { CloudSun, Droplets, RefreshCw, Thermometer } from "lucide-react";
import { useEffect, useState } from "react";

import type {
    WeatherForecast,
    WeatherWidgetResponse,
} from "@/lib/weather/contracts";
import { TripOverviewWeatherUnavailablePresentation } from "@/components/trips/TripOverviewPresentation";

const CLIENT_WEATHER_CACHE_MS = 5 * 60 * 1_000;

type CacheEntry = {
    expiresAt: number;
    promise: Promise<Exclude<WeatherWidgetResponse, { status: "error" }>>;
};

const weatherRequestCache = new Map<string, CacheEntry>();

type WeatherCardState =
    | { type: "loading" }
    | { type: "success"; data: Extract<WeatherWidgetResponse, { status: "success" }> }
    | {
          type: "unavailable";
          data: Extract<WeatherWidgetResponse, { status: "unavailable" }>;
      }
    | { type: "error" };

export function clearWeatherWidgetRequestCache() {
    weatherRequestCache.clear();
}

async function requestWeather(
    tripId: string,
    force = false
): Promise<Exclude<WeatherWidgetResponse, { status: "error" }>> {
    const key = tripId;
    const cached = weatherRequestCache.get(key);
    if (!force && cached && cached.expiresAt > Date.now()) {
        return cached.promise;
    }

    const promise = fetch(`/api/trips/${encodeURIComponent(tripId)}/weather`, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
    }).then(async (response) => {
        const body = (await response.json().catch(() => null)) as
            | WeatherWidgetResponse
            | null;
        if (!response.ok || !body || body.status === "error") {
            throw new Error("Weather is unavailable");
        }
        return body as Exclude<WeatherWidgetResponse, { status: "error" }>;
    });

    weatherRequestCache.set(key, {
        expiresAt: Date.now() + CLIENT_WEATHER_CACHE_MS,
        promise,
    });
    promise.catch(() => {
        const current = weatherRequestCache.get(key);
        if (current?.promise === promise) weatherRequestCache.delete(key);
    });
    return promise;
}

function formatTemperature(value: number, unit: WeatherForecast["temperatureUnit"]) {
    return `${Math.round(value)}°${unit}`;
}

function formatForecastDay(date: string) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat("en", {
        weekday: "short",
        timeZone: "UTC",
    }).format(parsed);
}

function formatUpdatedAt(value: string, timeZone: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recently updated";

    try {
        return `Updated ${new Intl.DateTimeFormat("en", {
            hour: "numeric",
            minute: "2-digit",
            timeZone,
            timeZoneName: "short",
        }).format(date)}`;
    } catch {
        return "Recently updated";
    }
}

function WeatherIcon({
    iconUri,
    description,
    size,
}: {
    iconUri: string | null;
    description: string;
    size: number;
}) {
    if (!iconUri) {
        return <CloudSun className="h-10 w-10 text-lime-200" aria-hidden="true" />;
    }

    return (
        <Image
            src={iconUri}
            alt=""
            width={size}
            height={size}
            title={description}
            unoptimized
        />
    );
}

function LoadingCard() {
    return (
        <section
            className="md:col-span-2 xl:col-span-3"
            aria-label="Destination weather"
            aria-live="polite"
            aria-busy="true"
        >
            <div className="animate-pulse rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/15">
                <span className="sr-only" role="status">
                    Loading destination weather
                </span>
                <div className="h-3 w-32 rounded-full bg-white/10" />
                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
                    <div className="h-28 rounded-2xl bg-white/[0.07]" />
                    <div className="grid grid-cols-5 gap-2">
                        {Array.from({ length: 5 }, (_, index) => (
                            <div key={index} className="h-28 rounded-2xl bg-white/[0.07]" />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

export default function TripWeatherCard({ tripId }: { tripId: string }) {
    const [state, setState] = useState<WeatherCardState>({ type: "loading" });
    const [requestVersion, setRequestVersion] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setState({ type: "loading" });

        requestWeather(tripId, requestVersion > 0)
            .then((data) => {
                if (cancelled) return;
                setState(
                    data.status === "success"
                        ? { type: "success", data }
                        : { type: "unavailable", data }
                );
            })
            .catch(() => {
                if (!cancelled) setState({ type: "error" });
            });

        return () => {
            cancelled = true;
        };
    }, [requestVersion, tripId]);

    if (state.type === "loading") return <LoadingCard />;

    if (state.type === "unavailable") {
        return (
            <TripOverviewWeatherUnavailablePresentation
                destinationName={state.data.destinationName}
            />
        );
    }

    if (state.type === "error") {
        return (
            <section
                className="md:col-span-2 xl:col-span-3 rounded-[1.35rem] border border-amber-300/20 bg-amber-300/[0.06] p-5 text-white shadow-xl shadow-black/15"
                aria-labelledby="trip-weather-title"
            >
                <h2 id="trip-weather-title" className="text-sm font-black">
                    Destination weather
                </h2>
                <p className="mt-1 text-sm font-semibold text-amber-100" role="alert">
                    Weather could not be loaded right now.
                </p>
                <button
                    type="button"
                    onClick={() => setRequestVersion((version) => version + 1)}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-200/30 bg-amber-100 px-4 text-sm font-black text-amber-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Retry weather
                </button>
            </section>
        );
    }

    const { destinationName, forecast } = state.data;
    const today = forecast.daily[0];

    return (
        <section
            className="md:col-span-2 xl:col-span-3 overflow-hidden rounded-[1.35rem] border border-sky-300/20 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.13),transparent_38%),rgba(255,255,255,0.06)] p-5 text-white shadow-xl shadow-black/15 md:p-6"
            aria-labelledby="trip-weather-title"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-200">
                        Destination weather
                    </p>
                    <h2 id="trip-weather-title" className="mt-1 text-lg font-black">
                        {destinationName}
                    </h2>
                </div>
                <p className="text-[10px] font-bold text-slate-400">
                    {formatUpdatedAt(forecast.updatedAt, forecast.timeZone)}
                </p>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.6fr)] lg:items-stretch">
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex items-center gap-4">
                        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06]">
                            <WeatherIcon
                                iconUri={forecast.current.condition.iconUri}
                                description={forecast.current.condition.description}
                                size={72}
                            />
                        </span>
                        <div>
                            <p className="text-4xl font-black tracking-tight">
                                {formatTemperature(
                                    forecast.current.temperature,
                                    forecast.temperatureUnit
                                )}
                            </p>
                            <p className="mt-1 text-sm font-bold text-slate-200">
                                {forecast.current.condition.description}
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-300">
                        <p className="flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2">
                            <Thermometer className="h-4 w-4 text-sky-200" aria-hidden="true" />
                            Feels like{" "}
                            {forecast.current.feelsLikeTemperature === null
                                ? "—"
                                : formatTemperature(
                                      forecast.current.feelsLikeTemperature,
                                      forecast.temperatureUnit
                                  )}
                        </p>
                        <p className="flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2">
                            <Droplets className="h-4 w-4 text-sky-200" aria-hidden="true" />
                            Rain{" "}
                            {forecast.current.precipitationProbability === null
                                ? "—"
                                : `${Math.round(
                                      forecast.current.precipitationProbability
                                  )}%`}
                        </p>
                        <p className="col-span-2 rounded-xl bg-white/[0.05] px-3 py-2">
                            Today · High{" "}
                            {formatTemperature(
                                today.highTemperature,
                                forecast.temperatureUnit
                            )}{" "}
                            · Low{" "}
                            {formatTemperature(
                                today.lowTemperature,
                                forecast.temperatureUnit
                            )}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-5 gap-2 overflow-x-auto pb-1">
                    {forecast.daily.map((day) => (
                        <article
                            key={day.date}
                            className="min-w-[88px] rounded-2xl border border-white/10 bg-white/[0.05] px-2 py-3 text-center"
                            aria-label={`${formatForecastDay(day.date)}: ${day.condition.description}, high ${formatTemperature(day.highTemperature, forecast.temperatureUnit)}, low ${formatTemperature(day.lowTemperature, forecast.temperatureUnit)}`}
                        >
                            <p className="text-xs font-black text-slate-200">
                                {formatForecastDay(day.date)}
                            </p>
                            <span className="mx-auto mt-2 flex h-11 w-11 items-center justify-center">
                                <WeatherIcon
                                    iconUri={day.condition.iconUri}
                                    description={day.condition.description}
                                    size={42}
                                />
                            </span>
                            <p className="mt-2 text-xs font-black">
                                {formatTemperature(
                                    day.highTemperature,
                                    forecast.temperatureUnit
                                )}
                            </p>
                            <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                                {formatTemperature(
                                    day.lowTemperature,
                                    forecast.temperatureUnit
                                )}
                            </p>
                            {day.precipitationProbability !== null ? (
                                <p className="mt-2 text-[10px] font-bold text-sky-200">
                                    {Math.round(day.precipitationProbability)}% rain
                                </p>
                            ) : null}
                        </article>
                    ))}
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[10px] font-semibold leading-4 text-slate-400">
                <span className="font-black text-slate-300">Google Maps</span>
                <span>Source: Includes weather data from Google</span>
            </div>
        </section>
    );
}
