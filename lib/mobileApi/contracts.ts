import type { Tables } from "@/src/types/supabase";
import type { TripAccommodation } from "@/lib/accommodations";
import type {
  TripAudienceOption,
  TripAudienceParticipantKind,
} from "@/lib/tripAudience";
import type { TripIdea } from "@/lib/tripIdeas";
import type {
  BudgetParticipant,
  TripBudget,
  TripBudgetLineItem,
  TripExpense,
  TripExpenseSettlement,
  TripExpenseSplit,
} from "@/lib/budget";

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

export type MobileItineraryPerson = {
  id: string;
  name: string;
  avatar_url: string | null;
  initials: string;
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
  | "timezone"
  | "is_private"
  | "audience_mode"
> & {
  source: "itinerary" | "transportation";
  source_id: string;
  category_id?: string | null;
  category_name: string;
  category_color_hex: string;
  transportation_mode?: string | null;
  airline_name?: string | null;
  airline_code?: string | null;
  flight_number?: string | null;
  reservation_code?: string | null;
  duration?: string | null;
  departure_location?: string | null;
  arrival_location?: string | null;
  departure_timezone?: string | null;
  arrival_timezone?: string | null;
  departure_terminal?: string | null;
  arrival_terminal?: string | null;
  is_assigned_to_viewer?: boolean;
  accommodation_hold_kind?: "check_in" | "check_out" | null;
  is_flight_departure_buffer?: boolean;
  people: MobileItineraryPerson[];
};

export type MobileTripsResponse = {
  trips: MobileTripSummary[];
};

export type MobileTripDetailResponse = {
  trip: MobileTripSummary &
    Pick<
      TripRow,
      | "notes"
      | "cover_image_source"
      | "cover_image_photographer_name"
      | "cover_image_photographer_url"
    >;
  overview: MobileTripOverview;
  itinerary: MobileItineraryItem[];
  itineraryTimezones: string[];
  ideas: TripIdea[];
  budget: MobileTripBudgetData;
  stays?: MobileTripStaysData;
};

export type MobileStayAudienceParticipant = {
  item_id: string;
  participant_kind?: string | null;
  trip_member_id?: string | null;
  user_id?: string | null;
  invitation_id?: string | null;
  family_member_id?: string | null;
  guest_name?: string | null;
};

export type MobileStayCoverageTraveler = {
  kind: TripAudienceParticipantKind;
  id: string;
  requiredLegIds?: string[];
  userId?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  secondaryLabel?: string | null;
  isCurrentUser?: boolean;
};

export type MobileStayCoverageLeg = {
  id: string;
  startDate?: string | null;
  endDate?: string | null;
  memberIds: string[];
  memberDatesByMemberId?: Record<
    string,
    { startDate?: string | null; endDate?: string | null }
  >;
};

export type MobileTripStaysData = {
  accommodations: TripAccommodation[];
  audienceOptions: TripAudienceOption[];
  participants: MobileStayAudienceParticipant[];
  travelers: MobileStayCoverageTraveler[];
  legs: MobileStayCoverageLeg[];
  currentUserTripMemberId: string | null;
};

export type MobileTripBudgetData = {
  budget: TripBudget | null;
  lineItems: TripBudgetLineItem[];
  expenses: TripExpense[];
  splits: TripExpenseSplit[];
  settlementPayments: TripExpenseSettlement[];
  participants: BudgetParticipant[];
  defaultCurrency: string;
};

export type MobileTripOverviewLocation = {
  id: string;
  flag: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
};

export type MobileTripOverviewPerson = {
  id: string;
  label: string;
  avatarUrl: string | null;
  initial: string;
};

export type MobileTripOverviewTransportation = {
  id: string;
  modeEmoji: string;
  departureLabel: string | null;
  arrivalLabel: string | null;
  summary: string;
  detail: string | null;
  pauseLabel: string | null;
};

export type MobileTripOverviewStay = {
  id: string;
  checkInDate: string;
  checkOutDate: string;
  label: string;
  kind: "booked" | "missing" | "tentative";
  omitCheckIn?: boolean;
};

export type MobileTripOverview = {
  locations: MobileTripOverviewLocation[];
  going: MobileTripOverviewPerson[];
  invited: MobileTripOverviewPerson[];
  displayStartDate: string | null;
  displayEndDate: string | null;
  missingDateLabel: string;
  transportation: MobileTripOverviewTransportation[];
  stays: MobileTripOverviewStay[];
  budget: {
    currency: string;
    budgeted: number;
    spent: number;
    hasBudget: boolean;
  };
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
