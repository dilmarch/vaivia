import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItineraryItemEditorPresentation } from "@/components/itinerary/ItineraryItemEditorPresentation";

afterEach(cleanup);

describe("shared itinerary item editor", () => {
  it("collects the current web itinerary fields into a typed mutation", () => {
    const onSubmit = vi.fn();
    render(
      <ItineraryItemEditorPresentation
        categories={[{ id: "category-1", name: "Things to do" }]}
        audienceOptions={[{ kind: "member", id: "member-1", label: "Alex" }]}
        defaultDate="2026-09-12"
        defaultTimezone="America/Toronto"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Museum tour" } });
    fireEvent.change(screen.getByLabelText("Amount, optional"), { target: { value: "45" } });
    fireEvent.click(screen.getByLabelText("Alex"));
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      title: "Museum tour",
      itemDate: "2026-09-12",
      timezone: "America/Toronto",
      cost: "45",
      participants: expect.objectContaining({ memberIds: ["member-1"] }),
    }));
  });

  it("exposes cancel and destructive controls only when appropriate", () => {
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    render(
      <ItineraryItemEditorPresentation
        item={{ id: "item-1", trip_id: "trip-1", source_id: "item-1", source: "itinerary", title: "Dinner", item_date: "2026-09-12", end_date: null, start_time: null, end_time: null, category: "food", category_name: "Food", category_color_hex: "#fff", status: "confirmed", location: null, notes: null, cover_image_url: null, timezone: "America/Toronto", is_private: false, audience_mode: "everyone", formatted_address: null, google_place_id: null, location_lat: null, location_lng: null, timezone_source: "manual", url: null, ticket_website: null, location_website: null, trip_leg_id: null, people: [] }}
        categories={[]}
        audienceOptions={[]}
        defaultDate="2026-09-12"
        defaultTimezone="UTC"
        onSubmit={vi.fn()}
        onCancel={onCancel}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
