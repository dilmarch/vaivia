export type EventOperationsRole = "event_organizer" | "super_admin";

export type EventOperationsListItem = {
  id: string;
  slug: string;
  title: string;
  status: string;
  visibility: string;
  starts_at: string;
  timezone: string;
  registration_mode: string;
};

export type EventOperationsAttendee = {
  id: string;
  ticketId: string | null;
  ticketNumber: string | null;
  name: string;
  email: string;
  tier: string;
  status: string;
  registeredAt: string;
  checkedInAt: string | null;
};

export type EventOperationsDetail = {
  event: EventOperationsListItem;
  stats: {
    tickets: number;
    confirmedRsvps: number;
    completedOrders: number;
  };
  attendees: EventOperationsAttendee[];
};

export type EventCheckInResult = {
  result:
    | "checked_in"
    | "already_used"
    | "refunded"
    | "cancelled"
    | "void"
    | "wrong_event"
    | "invalid"
    | "camera_unsupported"
    | "camera_denied"
    | "error";
  ticket_id?: string;
  check_in_id?: string;
  checked_in_at?: string;
};
