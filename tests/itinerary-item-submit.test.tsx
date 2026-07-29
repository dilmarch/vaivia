import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ItineraryItemForm from "@/components/ItineraryItemForm";

vi.mock("next/navigation", () => ({
    usePathname: () => "/trips/trip-a/itinerary",
    useSearchParams: () => new URLSearchParams("view=day&date=2026-09-24"),
}));

vi.mock("next/script", () => ({
    default: () => null,
}));

afterEach(() => cleanup());

describe("itinerary item submission", () => {
    it("submits an event in place while preserving the active itinerary view", async () => {
        const submitAction = vi.fn(async (formData: FormData) => {
            void formData;
        });

        render(
            <ItineraryItemForm
                tripId="trip-a"
                submitAction={submitAction}
                defaultDate="2026-09-24"
                defaultStartTime="10:15"
                defaultEndTime="11:45"
            />
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Add itinerary item" })
        );
        fireEvent.change(screen.getByLabelText("Title"), {
            target: { value: "Gallery opening" },
        });
        expect(screen.getByLabelText("Start time, optional")).toHaveValue("10:15");
        expect(screen.getByLabelText("End time, optional")).toHaveValue("11:45");
        fireEvent.click(screen.getByRole("button", { name: "SAVE" }));

        await waitFor(() => {
            expect(submitAction).toHaveBeenCalledTimes(1);
        });

        const submitted = submitAction.mock.calls[0]?.[0] as FormData;
        expect(submitted.get("title")).toBe("Gallery opening");
        expect(submitted.get("item_date")).toBe("2026-09-24");
        expect(submitted.get("start_time")).toBe("10:15");
        expect(submitted.get("end_time")).toBe("11:45");
        expect(submitted.get("preserve_itinerary_view")).toBe("true");
    });
});
