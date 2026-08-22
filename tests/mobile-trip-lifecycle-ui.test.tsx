import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TripCreateScreen } from "@/mobile/src/screens/TripCreateScreen";
import type { MobileApiClient } from "@/mobile/src/lib/apiClient";

describe("mobile trip lifecycle presentation", () => {
  it("creates a multi-leg trip and includes initial collaborator scope", async () => {
    const createTrip = vi.fn().mockResolvedValue({ trip: { id: "trip-1" } });
    const onCreated = vi.fn();
    const apiClient = {
      createTrip,
      getSettings: vi.fn().mockResolvedValue({
        familyMembers: [{ id: "family-1", name: "Sam", relationship: "Child" }],
      }),
    } as unknown as MobileApiClient;
    render(<TripCreateScreen apiClient={apiClient} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText("Trip title"), { target: { value: "Portugal" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Lisbon, Porto" } });
    fireEvent.click(screen.getByRole("button", { name: "Add destination leg" }));
    fireEvent.change(screen.getAllByLabelText("Destination")[1], { target: { value: "Lisbon" } });
    fireEvent.change(screen.getByLabelText("Emails or usernames"), { target: { value: "friend@example.com" } });
    await waitFor(() => expect(screen.getByText("Sam")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Sam/));
    fireEvent.click(screen.getByRole("button", { name: "Create trip" }));

    await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1));
    expect(createTrip.mock.calls[0][0]).toMatchObject({
      title: "Portugal",
      destination: "Lisbon, Porto",
      legs: [{ name: "Lisbon" }],
      initialInviteIdentifiers: ["friend@example.com"],
      initialFamilyMemberIds: ["family-1"],
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("trip-1"));
  });
});
