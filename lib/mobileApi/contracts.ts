import type { Tables } from "@/src/types/supabase";

type TripRow = Tables<"trips">;
type ItineraryItemRow = Tables<"itinerary_items">;
type NotificationRow = Tables<"notifications">;

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
  archived_at?: TripRow["archived_at"];
  membershipRole: string | null;
  viewerTripMemberId?: string | null;
  viewerAssignedLegCount?: number;
  viewerStartDate?: string | null;
  viewerEndDate?: string | null;
  memberProfiles?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  }[];
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

export type MobileNotification = Pick<
  NotificationRow,
  | "id"
  | "type"
  | "title"
  | "body"
  | "read_at"
  | "created_at"
  | "trip_id"
  | "invitation_id"
> & {
  metadata?: Record<string, unknown> | null;
};

export type MobileNotificationsResponse = {
  notifications: MobileNotification[];
  navigationProfile: {
    role: string | null;
    avatar_url: string | null;
  } | null;
  pendingImportCount: number;
};

export type MobileApiErrorResponse = {
  error: string;
};
