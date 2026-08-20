import type { MobileTripSummary } from "@/lib/mobileApi/contracts";
import { TripCardPresentation } from "@/components/trips/TripCardPresentation";

type MobileTripCardProps = {
  trip: MobileTripSummary;
  index: number;
  onOpen: () => void;
};

export function MobileTripCard({ trip, index, onOpen }: MobileTripCardProps) {
  return (
    <TripCardPresentation
      trip={trip}
      index={index}
      coverImageUrl={trip.cover_image_url}
      memberProfiles={trip.memberProfiles || []}
      disableHoverTransform
      assetBaseUrl="."
      renderAction={({ children, className, ariaLabel }) => (
        <button
          type="button"
          onClick={onOpen}
          className={`${className} text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300`}
          aria-label={ariaLabel}
        >
          {children}
        </button>
      )}
    />
  );
}
