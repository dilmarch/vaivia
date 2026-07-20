import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TripLegLocationLine, {
  type TripLegLocation,
} from "@/components/TripLegLocationLine";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/components/AnimatedModal", () => ({
  default: ({
    children,
    onClose,
  }: {
    children: (controls: { requestClose: () => void }) => React.ReactNode;
    onClose: () => void;
  }) => <div>{children({ requestClose: onClose })}</div>,
}));

const manualLeg: TripLegLocation = {
  id: "leg-1",
  source: "manual",
  name: "Lisbon",
  cityName: "Lisbon",
  startDate: "2026-09-10",
  endDate: "2026-09-12",
  memberIds: ["member-1"],
  canDelete: true,
  canClearDates: true,
};

function renderLegEditor({
  location = manualLeg,
  upsertLegAction = vi.fn(async () => undefined),
  deleteLegAction = vi.fn(async () => undefined),
}: {
  location?: TripLegLocation;
  upsertLegAction?: (formData: FormData) => Promise<void>;
  deleteLegAction?: (formData: FormData) => Promise<void>;
} = {}) {
  render(
    <TripLegLocationLine
      tripId="trip-1"
      locations={[location]}
      memberOptions={[
        { id: "member-1", displayName: "Avery Traveler" },
      ]}
      upsertLegAction={upsertLegAction}
      deleteLegAction={deleteLegAction}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit Lisbon" }));
}

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

describe("trip leg editor actions", () => {
  it("clears dates without deleting the leg", async () => {
    const upsertLegAction = vi.fn<(formData: FormData) => Promise<void>>(
      async () => undefined,
    );
    const deleteLegAction = vi.fn<(formData: FormData) => Promise<void>>(
      async () => undefined,
    );
    renderLegEditor({ upsertLegAction, deleteLegAction });

    fireEvent.click(screen.getByRole("button", { name: "Clear dates" }));

    await waitFor(() => expect(upsertLegAction).toHaveBeenCalledOnce());
    const submitted = upsertLegAction.mock.calls[0][0];
    expect(submitted.get("trip_leg_id")).toBe("leg-1");
    expect(submitted.get("start_date")).toBe("");
    expect(submitted.get("end_date")).toBe("");
    expect(deleteLegAction).not.toHaveBeenCalled();
  });

  it("requires confirmation before deleting a manual leg", async () => {
    const deleteLegAction = vi.fn<(formData: FormData) => Promise<void>>(
      async () => undefined,
    );
    renderLegEditor({ deleteLegAction });

    fireEvent.click(screen.getByRole("button", { name: "Delete leg" }));
    expect(deleteLegAction).not.toHaveBeenCalled();
    expect(screen.getByText("Delete this leg?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete leg" }));

    await waitFor(() => expect(deleteLegAction).toHaveBeenCalledOnce());
    expect(deleteLegAction.mock.calls[0][0].get("trip_leg_id")).toBe("leg-1");
  });

  it("does not offer deletion for a destination-derived row", () => {
    renderLegEditor({
      location: {
        ...manualLeg,
        id: "destination-1",
        source: "destination",
        persistedLegId: "leg-1",
        canClearDates: true,
      },
    });

    expect(
      screen.queryByRole("button", { name: "Delete leg" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear dates" }),
    ).toBeInTheDocument();
  });
});
