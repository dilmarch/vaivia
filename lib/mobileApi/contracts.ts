import type { Tables } from "@/src/types/supabase";

type TripRow = Tables<"trips">;
type ItineraryItemRow = Tables<"itinerary_items">;

export type MobileTripSummary = Pick<
  TripRow,
  | "id"
  | "slug"
  | "title"
  | "destination"
  | "start_date"
  | "end_date"
  | "cover_image_url"
> & {
  membershipRole: string | null;
};

export type MobileItineraryItem = Pick<
  ItineraryItemRow,
  | "id"
  | "trip_id"
  | "title"
  | "item_date"
  | "end_date"
  | "start_time"
  | "end_time"
  | "category"
  | "status"
  | "location"
  | "notes"
  | "cover_image_url"
> & {
  source: "itinerary" | "transportation";
};

export type MobileTripsResponse = {
  trips: MobileTripSummary[];
};

export type MobileTripDetailResponse = {
  trip: MobileTripSummary & Pick<TripRow, "notes">;
  itinerary: MobileItineraryItem[];
};

export type MobileApiErrorResponse = {
  error: string;
};
