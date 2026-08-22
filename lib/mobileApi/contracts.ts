import type { Json, Tables } from "@/src/types/supabase";
import type { TripAccommodation } from "@/lib/accommodations";
import type {
  TripAudienceOption,
  TripAudienceParticipantKind,
} from "@/lib/tripAudience";
import type { TripIdea } from "@/lib/tripIdeas";
import type { NotepadLocation } from "@/lib/notepadEntries";
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
  ExpenseCategory,
  SplitMethod,
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
  cost?: number | null;
  currency?: string | null;
  formatted_address?: string | null;
  google_place_id?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  timezone_source?: string | null;
  url?: string | null;
  ticket_website?: string | null;
  location_website?: string | null;
  trip_leg_id?: string | null;
  audienceSelections?: string[];
};

export type MobileItineraryMutationInput = {
  title: string;
  categoryId?: string | null;
  category?: string | null;
  status?: "tentative" | "confirmed";
  itemDate: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  timezoneSource?: string | null;
  location?: string | null;
  formattedAddress?: string | null;
  googlePlaceId?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  url?: string | null;
  ticketWebsite?: string | null;
  locationWebsite?: string | null;
  notes?: string | null;
  isPrivate?: boolean;
  audienceMode?: "everyone" | "custom" | "just_me";
  participants?: {
    memberIds?: string[];
    invitationIds?: string[];
    familyMemberIds?: string[];
    guestNames?: string[];
  };
  tripLegId?: string | null;
  cost?: number | string | null;
  currency?: string | null;
  splitMethod?: "equal" | "exact" | "percentage" | "just_me";
  includedParticipants?: string[];
  coverImageUrl?: string | null;
  removeCover?: boolean;
};

export type MobileItineraryEditorResponse = {
  trip: Pick<MobileTripSummary, "id" | "title" | "start_date" | "end_date">;
  item: MobileItineraryItem | null;
  categories: Array<{
    id: string;
    name: string;
    color_key: string | null;
  }>;
};

export type MobileItineraryMutationResponse = {
  item: MobileItineraryItem;
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
  ideaNotepadLocations?: NotepadLocation[];
  budget: MobileTripBudgetData;
  stays?: MobileTripStaysData;
  food?: MobileTripFoodData;
  healthSafety?: MobileTripHealthSafetyData;
};

export type MobileIdeaMutationInput = {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  daysOfWeek?: string[];
  availabilityStartDate?: string | null;
  availabilityEndDate?: string | null;
  timeOfDay?: string[];
  opensAt?: string | null;
  closesAt?: string | null;
  location?: string | null;
  formattedAddress?: string | null;
  googlePlaceId?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationCity?: string | null;
  locationRegion?: string | null;
  locationCountry?: string | null;
  locationCountryCode?: string | null;
  locationPostalCode?: string | null;
  timezone?: string | null;
  timezoneSource?: string | null;
  url?: string | null;
  estimatedCost?: number | string | null;
  currency?: string | null;
  is24Hours?: boolean;
  ticketPolicy?: string | null;
  agePolicy?: string | null;
  dressCode?: string | null;
  isPrivate?: boolean;
  tripLegId?: string | null;
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
  planningOptions?: TripAccommodation[];
  audienceOptions: TripAudienceOption[];
  participants: MobileStayAudienceParticipant[];
  travelers: MobileStayCoverageTraveler[];
  legs: MobileStayCoverageLeg[];
  currentUserTripMemberId: string | null;
};

export type MobileMutationParticipants = {
  memberIds?: string[];
  invitationIds?: string[];
  familyMemberIds?: string[];
  guestNames?: string[];
};

export type MobileTransportationMutationInput = {
  title?: string | null;
  transportType: string;
  status?: string | null;
  transportNumber?: string | null;
  providerName?: string | null;
  providerCode?: string | null;
  providerUrl?: string | null;
  reservationCode?: string | null;
  bookingUrl?: string | null;
  departureDate: string;
  arrivalDate?: string | null;
  departureTime?: string | null;
  arrivalTime?: string | null;
  departureLocation: string;
  arrivalLocation: string;
  departureFormattedAddress?: string | null;
  arrivalFormattedAddress?: string | null;
  departureGooglePlaceId?: string | null;
  arrivalGooglePlaceId?: string | null;
  departureLat?: number | null;
  departureLng?: number | null;
  arrivalLat?: number | null;
  arrivalLng?: number | null;
  departureTimezone?: string | null;
  arrivalTimezone?: string | null;
  departureTerminal?: string | null;
  arrivalTerminal?: string | null;
  departureGate?: string | null;
  arrivalGate?: string | null;
  departurePlatform?: string | null;
  arrivalPlatform?: string | null;
  seatNumber?: string | null;
  cabinClass?: string | null;
  fareClass?: string | null;
  baggageInfo?: string | null;
  preferredRideProvider?: string | null;
  cost?: number | string | null;
  currency?: string | null;
  paidStatus?: string | null;
  notes?: string | null;
  isPrivate?: boolean;
  audienceMode?: "everyone" | "custom" | "just_me";
  participants?: MobileMutationParticipants;
  tripLegId?: string | null;
  routeStops?: Array<{
    order?: number;
    label: string;
    placeId?: string | null;
  }>;
};

export type MobileStayMutationInput = {
  hotelName: string;
  accommodationType?: string | null;
  status?: string | null;
  googlePlaceId?: string | null;
  googleMapsUrl?: string | null;
  address?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  checkInDate: string;
  checkOutDate: string;
  freeCancellationEndsOn?: string | null;
  checkInTimeStart?: string | null;
  checkInTimeEnd?: string | null;
  checkOutTime?: string | null;
  website?: string | null;
  bookingUrl?: string | null;
  isPlanningOption?: boolean;
  cost?: number | string | null;
  currency?: string | null;
  isPrivate?: boolean;
  audienceMode?: "everyone" | "custom" | "just_me";
  participants?: MobileMutationParticipants;
  notes?: string | null;
  tripLegId?: string | null;
};

export type MobilePlaceSuggestion = {
  placeId: string;
  name: string;
  address: string | null;
  category: string;
};

export type MobilePlaceDetails = MobilePlaceSuggestion & {
  latitude: number;
  longitude: number;
  mapsUrl: string;
  types: string[];
  rating: number | null;
  userRatingCount: number | null;
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

export type MobileBudgetLineMutationInput = {
  id?: string | null;
  categoryId?: string | null;
  name: string;
  plannedAmount: number | string | null;
  linkedExpenseCategory?: ExpenseCategory | null;
  remove?: boolean;
  remapCategoryId?: string | null;
};

export type MobileBudgetMutationInput = {
  budgetId?: string;
  tripTitle?: string;
  name?: string | null;
  reportingCurrency?: string | null;
  totalBudgetAmount?: number | string | null;
  lines?: MobileBudgetLineMutationInput[];
};

export type MobileExpenseMutationInput = {
  tripId?: string;
  operation?: "duplicate";
  description: string;
  expenseDate?: string | null;
  category?: ExpenseCategory | null;
  budgetCategoryId?: string | null;
  amount: number | string;
  currency?: string | null;
  reportingCurrency?: string | null;
  manualExchangeRate?: number | string | null;
  splitMethod?: SplitMethod | null;
  paidBy?: string | null;
  splits?: Array<{
    participantValue: string;
    amount?: number | string | null;
    percentage?: number | string | null;
  }>;
  notes?: string | null;
};

export type MobileSettlementMutationInput = {
  tripId: string;
  paidByParticipantValue: string;
  receivedByParticipantValue: string;
  amount: number | string;
  reportingCurrency?: string | null;
  settledOn?: string | null;
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
  actor_user_id?: string | null;
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

export type MobileNotificationDestination =
  | { name: "trip"; tripId: string; view: "overview" }
  | { name: "travel-import"; importId: string }
  | { name: "profile"; section?: string }
  | { name: "friend-profile"; userId: string }
  | { name: "settings" };

export type MobileTravelImportSummary = {
  id: string;
  created_at: string;
  extraction_confidence?: number | null;
  extraction_error?: string | null;
  import_type?: string | null;
  imported_at?: string | null;
  matched_trip_id?: string | null;
  sender_email?: string | null;
  status: string;
  subject?: string | null;
  processed_at?: string | null;
  itemCount: number;
};

export type MobileTravelImportsResponse = {
  imports: MobileTravelImportSummary[];
};

export type MobileTravelImportReviewResponse = {
  import: Record<string, unknown> & { id: string; status: string };
  items: Array<{
    id: string;
    confidence: number | null;
    extracted_data: Json;
    item_order: number;
    item_type: string;
    reviewed_data?: Json | null;
    imported_record_id?: string | null;
    imported_at?: string | null;
    is_excluded?: boolean | null;
    matched_trip_id?: string | null;
  }>;
  trips: Array<{
    id: string;
    slug: string | null;
    title: string;
    destination: string | null;
    start_date: string | null;
    end_date: string | null;
  }>;
  familyMembers: Array<{
    id: string;
    name: string;
    relationship: string | null;
  }>;
};

export type MobileSocialFriend = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
  role: string | null;
  joinedAt: string | null;
};

export type MobilePassportStamp = {
  id: string;
  countryCode: string;
  countryName: string;
  flagEmoji: string | null;
  firstVisitedOn: string | null;
  visitCity: string | null;
  visitRegion: string | null;
  visitMonth: number | null;
  visitStatus: string;
  portOfEntryName: string | null;
  welcomeLabel: string | null;
};

export type MobileWishlistItem = {
  id: string;
  placeLabel: string;
  city: string | null;
  region: string | null;
  countryCode: string;
  countryName: string | null;
  flagEmoji: string | null;
  googlePlaceId: string | null;
  googleFormattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  completedAt: string | null;
  passportStampId: string | null;
};

export type MobileFriendInvitation = {
  id: string;
  identifier: string;
  requesterUserId: string;
  addresseeUserId: string | null;
  status: string;
  createdAt: string | null;
};

export type MobileSocialProfileResponse = {
  stats: {
    tripsPlanned: number;
    friendsCount: number;
    points: number;
    level: number;
    levelName: string;
  };
  friends: MobileSocialFriend[];
  sentInvitations: MobileFriendInvitation[];
  incomingInvitations: MobileFriendInvitation[];
  stamps: MobilePassportStamp[];
  wishlist: MobileWishlistItem[];
  scratchMapCountryCodes: string[];
};

export type MobileFriendProfileResponse = {
  friend: MobileSocialFriend;
  points: number;
  level: number;
  levelName: string;
  stamps: MobilePassportStamp[];
  wishlist: MobileWishlistItem[];
  scratchMapCountryCodes: string[];
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
