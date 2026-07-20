export type EventStatus =
  "draft" | "scheduled" | "published" | "cancelled" | "completed" | "archived";

export type EventVisibility = "public" | "private";
export type EventRegistrationMode = "rsvp" | "ticketed";

export type EventSummary = {
  id: string;
  slug: string;
  title: string;
  short_summary: string | null;
  description?: string | null;
  category: string | null;
  tags: string[];
  cover_image_storage_path: string | null;
  cover_image_alt: string | null;
  coverImageUrl?: string | null;
  status: EventStatus;
  visibility: EventVisibility;
  registration_mode: EventRegistrationMode;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venue_type: "physical" | "online";
  venue_name: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  organizer_display_name?: string | null;
  accessibility_info?: string | null;
  attendee_notes?: string | null;
  age_restriction?: string | null;
  refund_policy?: string | null;
  overall_capacity?: number | null;
  publish_at?: string | null;
  published_at?: string | null;
  owner_user_id?: string;
  created_at?: string;
};

export type EventTicketType = {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price_minor: number;
  fee_minor: number;
  tax_minor: number;
  currency: string;
  total_quantity: number;
  quantity_held: number;
  quantity_sold: number;
  sales_start_at: string | null;
  sales_end_at: string | null;
  min_per_order: number;
  max_per_order: number;
  max_per_customer: number | null;
  display_order: number;
  state: "active" | "hidden" | "sold_out" | "archived";
  attendee_instructions: string | null;
};

export type EventRole = "basic_user" | "event_organizer" | "super_admin";
