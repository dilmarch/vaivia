import { useEffect, useState, type ReactNode } from "react";
import {
  BedDouble,
  CalendarCheck,
  ListChecks,
  Mail,
  PiggyBank,
  ReceiptText,
  Route,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { MobileTripDetailResponse } from "@/lib/mobileApi/contracts";
import TripCountdown from "@/components/TripCountdown";
import {
  TripHeaderPresentation,
  TripHeaderTitlePresentation,
} from "@/components/trips/TripHeaderPresentation";
import {
  TripOverviewComparisonPresentation,
  TripOverviewCountdownPresentation,
  TripOverviewLocationDatesPresentation,
  TripOverviewPeoplePresentation,
  TripOverviewPresentation,
  TripOverviewStayTimeline,
  TripOverviewTilePresentation,
  TripOverviewTransportTimeline,
  TripOverviewWeatherUnavailablePresentation,
} from "@/components/trips/TripOverviewPresentation";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

type TripDetailScreenProps = {
  apiClient: MobileApiClient;
  tripId: string;
  onItinerary?: () => void;
  onIdeas?: () => void;
  onTransport?: () => void;
  onFood?: () => void;
  onStays?: () => void;
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function OverviewTile({
  title,
  description,
  icon,
  buttonLabel,
  children,
  alignTop = false,
  onAction,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  buttonLabel: string;
  children?: ReactNode;
  alignTop?: boolean;
  onAction?: () => void;
}) {
  return (
    <TripOverviewTilePresentation
      title={title}
      description={description}
      icon={icon}
      buttonLabel={buttonLabel}
      disabled={!onAction}
      alignTop={alignTop}
      renderAction={
        onAction
          ? (props) => <button type="button" onClick={onAction} {...props} />
          : undefined
      }
    >
      {children}
    </TripOverviewTilePresentation>
  );
}

export function TripDetailScreen({
  apiClient,
  tripId,
  onItinerary,
  onIdeas,
  onTransport,
  onFood,
  onStays,
}: TripDetailScreenProps) {
  const [data, setData] = useState<MobileTripDetailResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [coverLoadError, setCoverLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage("");
    setCoverLoadError("");

    void apiClient
      .getTrip(tripId, controller.signal)
      .then(setData)
      .catch((error) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load this trip.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [apiClient, reloadKey, tripId]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#0c0115] pb-10 pt-0 text-white">
        <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
          <div
            className="vaivia-trip-header-cover vaivia-trip-header-cover-fallback min-h-72 animate-pulse bg-white/[0.05] motion-reduce:animate-none"
            role="status"
            aria-label="Loading trip overview"
          />
        </header>
        <div className="mx-auto grid max-w-7xl gap-3 px-4 sm:px-6 md:grid-cols-2 md:gap-4">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-[1.35rem] border border-white/10 bg-white/[0.06] motion-reduce:animate-none"
            />
          ))}
        </div>
      </main>
    );
  }

  if (errorMessage || !data) {
    return (
      <main className="min-h-screen bg-[#0c0115] px-5 pb-10 pt-28 text-white">
        <ScreenMessage
          title="Trip unavailable"
          message={errorMessage || "This trip could not be found."}
          actionLabel="Try again"
          onAction={() => setReloadKey((key) => key + 1)}
        />
      </main>
    );
  }

  const { trip, overview } = data;
  const shouldStackGoing = overview.invited.length > 2;
  const isGroupTrip = overview.going.length > 1 || overview.invited.length > 0;
  const destinationName =
    overview.locations[0]?.label || trip.destination || "Trip destination";
  const budgetDescription = overview.budget.hasBudget
    ? `${formatMoney(overview.budget.budgeted, overview.budget.currency)} budget · ${formatMoney(
        overview.budget.spent,
        overview.budget.currency,
      )} spent`
    : "No budget yet. Add one when you are ready.";

  return (
    <main className="min-h-screen bg-[#0c0115] pb-10 pt-0 text-white">
      <header className="mb-8 overflow-hidden border-b border-white/10 bg-[#03030a] text-white shadow-2xl shadow-black/40">
        <TripHeaderPresentation
          coverImageUrl={trip.cover_image_url}
          imageErrorMessage={coverLoadError}
          onImageLoad={() => setCoverLoadError("")}
          onImageError={() => setCoverLoadError("This image could not be loaded.")}
          attribution={
            trip.cover_image_source === "unsplash" &&
            trip.cover_image_photographer_name ? (
              <div className="absolute left-4 top-4 rounded-full bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-white shadow-xl shadow-black/30 backdrop-blur">
                Photo by{" "}
                {trip.cover_image_photographer_url ? (
                  <a
                    href={trip.cover_image_photographer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-white/40 underline-offset-2 hover:text-lime-100"
                  >
                    {trip.cover_image_photographer_name}
                  </a>
                ) : (
                  trip.cover_image_photographer_name
                )}{" "}
                on{" "}
                <a
                  href="https://unsplash.com/?utm_source=vaivia&utm_medium=referral"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-white/40 underline-offset-2 hover:text-lime-100"
                >
                  Unsplash
                </a>
              </div>
            ) : null
          }
        >
          <TripHeaderTitlePresentation
            tripTitle={trip.title || "Untitled trip"}
            pageLabel="Trip Overview"
          />
        </TripHeaderPresentation>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <TripOverviewPresentation>
          <TripOverviewLocationDatesPresentation
            locations={overview.locations}
            startDate={overview.displayStartDate}
            endDate={overview.displayEndDate}
            missingDateLabel={overview.missingDateLabel}
          />

          <div
            className={`grid gap-3 ${shouldStackGoing ? "grid-cols-1" : "grid-cols-2"}`}
          >
            <TripOverviewPeoplePresentation
              title="Invited"
              people={overview.invited}
              emptyText="No pending invites"
            />
            {!shouldStackGoing ? (
              <TripOverviewPeoplePresentation
                title="Going"
                people={overview.going}
                emptyText="Just you for now"
              />
            ) : null}
          </div>

          {shouldStackGoing ? (
            <TripOverviewPeoplePresentation
              title="Going"
              people={overview.going}
              emptyText="Just you for now"
            />
          ) : null}

          <TripOverviewCountdownPresentation>
            <TripCountdown startDate={overview.displayStartDate} />
          </TripOverviewCountdownPresentation>

          <TripOverviewWeatherUnavailablePresentation
            destinationName={destinationName}
            message="Live weather remains available in the web app."
          />

          <div className="grid grid-cols-2 gap-3">
            <OverviewTile
              title="Itinerary"
              description="Schedule the days, tickets, and timed plans."
              icon={CalendarCheck}
              buttonLabel="Visit itinerary"
              onAction={onItinerary}
            />
            <OverviewTile
              title="Trip Ideas"
              description="Brainstorm ideas of trip activities without scheduling them for a specific time on the itinerary."
              icon={Sparkles}
              buttonLabel="Visit trip ideas"
              onAction={onIdeas}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <OverviewTile
              title="Transport"
              description="Transportation from start to finish."
              icon={Route}
              buttonLabel="Visit transport"
              alignTop
              onAction={onTransport}
            >
              <TripOverviewTransportTimeline items={overview.transportation} />
            </OverviewTile>
            <OverviewTile
              title="Stays"
              description="Booked hotels, homes, or places to sleep."
              icon={BedDouble}
              buttonLabel="Visit stays"
              alignTop
              onAction={onStays}
            >
              <TripOverviewStayTimeline items={overview.stays} />
            </OverviewTile>
          </div>

          <TripOverviewComparisonPresentation flightsDisabled />

          <div className="grid grid-cols-2 gap-3">
            <OverviewTile
              title="Restaurants"
              description="Add places you want to check out."
              icon={Utensils}
              buttonLabel="Visit restaurants"
              onAction={onFood}
            />
            <OverviewTile
              title="Foods"
              description="Track foods you want to try."
              icon={ListChecks}
              buttonLabel="Visit foods"
              onAction={onFood}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <OverviewTile
              title="Budget"
              description={budgetDescription}
              icon={PiggyBank}
              buttonLabel={overview.budget.hasBudget ? "Visit budget" : "Add budget"}
            />
            <OverviewTile
              title="Expenses"
              description={`${formatMoney(
                overview.budget.spent,
                overview.budget.currency,
              )} tracked so far.`}
              icon={ReceiptText}
              buttonLabel="Add expense"
            />
          </div>

          {isGroupTrip ? (
            <OverviewTile
              title="Who owes what"
              description="Open the web app to review trip balances."
              icon={Mail}
              buttonLabel="Visit budget"
            />
          ) : null}
        </TripOverviewPresentation>
      </div>
    </main>
  );
}
