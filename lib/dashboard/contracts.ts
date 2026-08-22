import type { CountdownUnit } from "@/lib/countdownDisplay";
import type { TripCardPresentationTrip } from "@/components/trips/TripCardPresentation";

export type DashboardTrip = TripCardPresentationTrip & {
  slug?: string | null;
  user_id?: string | null;
  cover_image_url?: string | null;
  cover_image_source?: string | null;
  cover_image_storage_path?: string | null;
  cover_image_unsplash_id?: string | null;
  cover_image_photographer_name?: string | null;
  cover_image_photographer_url?: string | null;
  trip_cover_image_url?: string | null;
  countdown_target_type?: string | null;
  countdown_target_id?: string | null;
  countdown_target_itinerary_item_id?: string | null;
  archived_at?: string | null;
  archived_reason?: string | null;
  notes?: string | null;
  planning?: {
    accommodations?: Array<{
      id: string;
      check_in_date: string | null;
      check_out_date: string | null;
      status?: string | null;
      city?: string | null;
      region?: string | null;
      country?: string | null;
    }>;
    transportation?: Array<{
      id: string;
      departure_location?: string | null;
      arrival_location?: string | null;
      status?: string | null;
      title?: string | null;
      transport_type?: string | null;
    }>;
  };
};

export type DashboardCountdownTarget = {
  tripTitle: string;
  targetTitle: string;
  targetDateIso: string;
};

export type DashboardPassportStamp = {
  id: string;
  countryCode: string;
  countryName: string;
  flagEmoji?: string | null;
  firstVisitYear?: string | null;
  welcomeLabel?: string | null;
  airportCode?: string | null;
  airportCity?: string | null;
  portOfEntryName?: string | null;
};

export type DashboardProfileSummary = {
  name: string;
  username?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

export type DashboardWishlistItem = {
  id: string;
  placeLabel: string;
  city?: string | null;
  region?: string | null;
  countryName?: string | null;
  flagEmoji?: string | null;
  status: "in_progress" | "completed";
  completedAt?: string | null;
};

export type DashboardEvent = {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  timezone: string;
  venue: string;
  status: string;
  admissionType: "Ticket" | "RSVP";
};

export type DashboardData = {
  name: string;
  countdownTarget: DashboardCountdownTarget | null;
  countdownUnit: CountdownUnit;
  trips: DashboardTrip[];
  passportStamps: DashboardPassportStamp[];
  profile: DashboardProfileSummary;
  wishlistItems: DashboardWishlistItem[];
  events: DashboardEvent[];
  canManageEvents: boolean;
  currentUserId: string;
};

export type DashboardLoadResult = {
  data: DashboardData;
  tripLoadError: { message: string; code?: string } | null;
};
