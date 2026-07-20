import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const migration = read(
  "supabase/migrations/20260720092831_create_events_marketplace.sql",
);
const grants = read(
  "supabase/migrations/20260720095808_restrict_event_function_execute_privileges.sql",
);
const hardening = read(
  "supabase/migrations/20260720103718_harden_event_access_helpers.sql",
);
const indexes = read(
  "supabase/migrations/20260720103821_index_event_foreign_keys.sql",
);

describe("events database model", () => {
  it("keeps events separate from Trips with the complete normalized model", () => {
    for (const table of [
      "events",
      "event_team_members",
      "event_ticket_types",
      "event_orders",
      "event_order_items",
      "event_tickets",
      "event_rsvps",
      "saved_events",
      "event_invitations",
      "event_check_ins",
      "event_webhook_events",
      "event_audit_log",
    ])
      expect(migration).toContain(`create table public.${table}`);
    expect(migration).not.toMatch(
      /alter table public\.(trips|itinerary_items).*rename/i,
    );
  });

  it("locks inventory and snapshots authoritative money values", () => {
    expect(migration).toContain(
      "from public.event_ticket_types where id = selected.ticket_type_id for update",
    );
    expect(migration).toContain(
      "quantity_held + quantity_sold <= total_quantity",
    );
    expect(migration).toContain("unit_price_minor integer not null");
    expect(migration).toContain("ticket_name_snapshot text not null");
    expect(migration).toContain(
      "hold_until timestamptz := now() + interval '30 minutes'",
    );
    expect(migration).toContain("Insufficient ticket inventory");
  });

  it("stores QR secrets outside the exposed public schema", () => {
    expect(migration).toContain("create table private.event_ticket_secrets");
    expect(migration).toContain("redemption_hash text not null unique");
    expect(migration).toContain(
      "encode(digest(ticket_secret, 'sha256'), 'hex')",
    );
    expect(migration).not.toContain(
      "grant all on private.event_ticket_secrets to authenticated",
    );
  });

  it("enables RLS and scopes public, attendee, organizer, and admin access", () => {
    expect(migration).toContain(
      "alter table public.events enable row level security",
    );
    expect(migration).toContain("events_public_read");
    expect(migration).toContain(
      "status = 'published' and visibility = 'public'",
    );
    expect(migration).toContain("event_tickets_owner_read");
    expect(migration).toContain("owner_user_id = auth.uid()");
    expect(migration).toContain("public.event_user_can_manage");
    expect(migration).toContain("Only super admins can update users");
  });

  it("removes default Data API execute grants from privileged functions", () => {
    expect(grants).toContain(
      "revoke all on function public.finalize_event_order(uuid, text, text, text) from public, anon, authenticated, service_role",
    );
    expect(grants).toContain(
      "grant execute on function public.finalize_event_order(uuid, text, text, text) to service_role",
    );
    expect(grants).toContain(
      "grant execute on function public.reserve_event_order(jsonb, uuid) to authenticated, service_role",
    );
    expect(grants).toContain(
      "grant execute on function public.get_event_ticket_secret(uuid) to service_role",
    );
  });

  it("prevents caller-supplied user IDs from becoming an access oracle", () => {
    expect(hardening).toContain("target_user_id = auth.uid()");
    expect(hardening).toContain("auth.role() = 'service_role'");
    expect(hardening).toContain(
      "revoke all on function public.event_user_can_view(uuid, uuid)",
    );
    expect(hardening).toContain("event_ticket_types_public_read");
    expect(hardening).toContain("event_ticket_types_authenticated_read");
  });

  it("indexes all event foreign-key access paths identified by the advisor", () => {
    expect(indexes).toContain("event_audit_log_actor_idx");
    expect(indexes).toContain("event_order_items_ticket_type_idx");
    expect(indexes).toContain("event_tickets_order_idx");
    expect(indexes).toContain("event_webhook_events_order_idx");
  });
});
