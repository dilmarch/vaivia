import type { Tables } from "@/src/types/supabase";
import type { TripAccommodation } from "@/lib/accommodations";
import type {
  TripAudienceOption,
  TripAudienceParticipantKind,
} from "@/lib/tripAudience";
import type { TripIdea } from "@/lib/tripIdeas";
import type { TripFoodItem } from "@/lib/tripFood";
import type { GovernmentTravelAdvisoryResult } from "@/lib/governmentTravelAdvisoryShared";
import type { TripDestinationRecord } from "@/lib/tripDestinations";
import type {
  BudgetParticipant,
  TripBudget,
  TripBudgetLineItem,
  TripExpense,
  TripExpenseSettlement,
  TripExpenseSplit,
} from "@/lib/budget";
import type { DashboardData } from "@/lib/dashboard/contracts";

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

export type MobileTripLegMutationInput = {
  id?: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  countryCode?: string | null;
  placeId?: string | null;
};

export type MobileTripMutationInput = {
  title: string;
  slug?: string;
  destination?: string;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string;
  legs?: MobileTripLegMutationInput[];
  initialInviteIdentifiers?: string[];
  initialFamilyMemberIds?: string[];
  countdownTargetType?: "itinerary_item" | "transportation_item" | null;
  countdownTargetId?: string | null;
};

export type MobileTripMutationResponse = {
  trip: {
    id: string;
    slug?: string | null;
    title?: string | null;
    destination?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    notes?: string | null;
    archived_at?: string | null;
  };
};

export type MobileTripCollaborationResponse = {
  trip: { id: string; user_id: string; title: string };
  permissions: { isOwner: boolean; canEdit: boolean; canInvite: boolean };
  members: Array<{
    id: string;
    user_id: string;
    role: string;
    status: string;
    joined_at: string | null;
    personal_start_date: string | null;
    personal_end_date: string | null;
    profile: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      username: string | null;
      email: string | null;
      avatar_url: string | null;
    } | null;
  }>;
  invitations: Array<{
    id: string;
    invited_user_id: string | null;
    invited_email: string | null;
    invited_username: string | null;
    status: string;
    created_at: string | null;
    invited_start_date: string | null;
    invited_end_date: string | null;
  }>;
  familyMembers: Array<{
    id: string;
    family_member_id: string;
    status: string;
    created_at: string;
    profile: {
      id: string;
      name: string;
      relationship: string | null;
      avatar_url: string | null;
      notes: string | null;
    };
  }>;
  availableFamilyMembers: Array<{
    id: string;
    name: string;
    relationship: string | null;
    avatar_url: string | null;
    notes: string | null;
  }>;
  legs: Array<{
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
    country_code: string | null;
    google_place_id: string | null;
    sort_order: number;
  }>;
  memberLegAssignments: Array<{
    id: string;
    trip_member_id: string;
    trip_leg_id: string;
    is_joining: boolean;
    start_date: string | null;
    end_date: string | null;
  }>;
};

export type MobileHomeResponse = DashboardData;

export type MobileTripDetailResponse = {
  trip: MobileTripSummary &
    Pick<
      TripRow,
      | "notes"
      | "cover_image_source"
      | "cover_image_photographer_name"
      | "cover_image_photographer_url"
      | "countdown_target_type"
      | "countdown_target_id"
    >;
  overview: MobileTripOverview;
  itinerary: MobileItineraryItem[];
  itineraryTimezones: string[];
  ideas: TripIdea[];
  budget: MobileTripBudgetData;
  stays?: MobileTripStaysData;
  food?: MobileTripFoodData;
  healthSafety?: MobileTripHealthSafetyData;
};

export type MobileTripFoodData = {
  items: TripFoodItem[];
};

export type MobileTripHealthSafetyData = {
  destinations: TripDestinationRecord[];
  advisoryResult: GovernmentTravelAdvisoryResult;
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
  | "archived_at"
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

export type MobileNotificationHistoryResponse = {
  notifications: MobileNotification[];
  activeActionNotificationIds: string[];
};

export type MobileApiFieldErrors = Record<string, string[]>;

export type MobileApiErrorPayload = {
  code: string;
  message: string;
  fieldErrors?: MobileApiFieldErrors;
  retryable?: boolean;
};

export type MobileApiErrorResponse = {
  error: string | MobileApiErrorPayload;
  code?: string;
  message?: string;
  fieldErrors?: MobileApiFieldErrors;
  retryable?: boolean;
};

export type MobileApiSuccessResponse<T> = {
  data: T;
};

export type MobileAccountProfile = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
  joinedAt: string | null;
  role: string;
  termsAcceptedAt: string | null;
  marketingEmailsConsent: boolean;
  accountDeletionRequestedAt: string | null;
  points: number;
  level: number;
  levelName: string;
  canChangeEmail: boolean;
};

export type MobileAccountResponse = {
  profile: MobileAccountProfile;
};

export type MobileSettingsResponse = {
  preferences: {
    themeMode: string;
    countdownDisplayMode: string;
    clockFormat: string;
    defaultTimeZone: string | null;
    itineraryDefaultView: string;
    newsFeedMode: string;
    homeCurrency: string;
    marketingEmailsConsent: boolean;
  };
  notificationPreferences: Array<{
    notificationType: string;
    masterEnabled: boolean;
    inAppEnabled: boolean;
    pushEnabled: boolean;
    emailEnabled: boolean;
  }>;
  categories: Array<{ id: string; name: string; colorKey: string | null }>;
  familyMembers: Array<{
    id: string;
    name: string;
    relationship: string | null;
  }>;
  capabilities: {
    profileEditing: boolean;
    passwordChange: boolean;
    avatarUpload: boolean;
    notificationMutation: boolean;
    categoryMutation: boolean;
    familyMutation: boolean;
  };
};

export type MobileDataExportRecord = {
  id: string;
  status: "requested" | "preparing" | "ready" | "expired" | "failed";
  requestedAt: string;
  processingStartedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  schemaVersion: string | null;
  failureCode: string | null;
  downloadedAt: string | null;
};

export type MobileDataExportsResponse = {
  exports: MobileDataExportRecord[];
};
