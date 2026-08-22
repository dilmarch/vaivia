import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plane, RotateCcw, Trash2 } from "lucide-react";
import { getEditableImportedFlight } from "@/lib/travelEmailImportReview";
import type { MobileTravelImportReviewResponse } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "../lib/apiClient";
import { ScreenMessage } from "../components/ScreenMessage";

export function TravelImportReviewScreen({
  apiClient,
  importId,
  currentUserId,
  onTrip,
  onBack,
}: {
  apiClient: MobileApiClient;
  importId: string;
  currentUserId: string;
  onTrip: (id: string) => void;
  onBack: () => void;
}) {
  const [data, setData] = useState<MobileTravelImportReviewResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void apiClient
      .getTravelImport(importId, controller.signal)
      .then(setData)
      .catch((caught) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load this import.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [apiClient, importId, reload]);
  const flights = useMemo(
    () =>
      (data?.items || [])
        .filter((item) => item.item_type === "flight")
        .map((item) => ({
          item,
          flight: getEditableImportedFlight(
            item.id,
            item.extracted_data,
            item.reviewed_data,
          ),
        })),
    [data],
  );
  async function action(name: "retry" | "ignore") {
    setSubmitting(true);
    setError("");
    try {
      await apiClient.mutateTravelImport(
        importId,
        { action: name },
        { idempotencyKey: crypto.randomUUID() },
      );
      setNotice(name === "retry" ? "Import retry started." : "Import ignored.");
      setReload((value) => value + 1);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update this import.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    const tripId = String(form.get("tripId") || "");
    const items = flights.map(({ item, flight }) => ({
      item_id: item.id,
      include: form.get(`include-${item.id}`) === "on",
      match_action: "create",
      reviewed_data: {
        airline_name: flight.airlineName,
        airline_code: flight.airlineCode,
        flight_number: flight.flightNumber,
        departure_location: flight.departureLocation,
        arrival_location: flight.arrivalLocation,
        departure_date: flight.departureDate,
        departure_time: flight.departureTime,
        arrival_date: flight.arrivalDate,
        arrival_time: flight.arrivalTime,
        departure_timezone: flight.departureTimezone,
        arrival_timezone: flight.arrivalTimezone,
        reservation_code: flight.reservationCode,
        cost: flight.cost,
        currency: flight.currency,
        status: flight.status,
        notes: flight.notes,
      },
    }));
    setSubmitting(true);
    setError("");
    try {
      const result = await apiClient.mutateTravelImport(
        importId,
        {
          action: "add-flights",
          tripId,
          items,
          travelers: {
            userIds: [currentUserId],
            familyMemberIds: form.getAll("familyMemberIds").map(String),
            guestNames: [],
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      onTrip(typeof result.tripId === "string" ? result.tripId : tripId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not add these flights.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  if (loading && !data)
    return (
      <main className="px-4 py-10 text-white" aria-busy="true">
        Loading travel import…
      </main>
    );
  if (!data)
    return (
      <main className="px-4 py-10">
        <ScreenMessage
          title="Travel import unavailable"
          message={error || "VAIVIA could not load this import."}
          actionLabel="Try again"
          onAction={() => setReload((value) => value + 1)}
        />
      </main>
    );
  const status = String(data.import.status || "received");
  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-10 pt-28 text-white">
      <div className="mx-auto max-w-4xl space-y-5">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-white/10 px-4 py-2 text-sm font-black"
        >
          Back to imports
        </button>
        <section className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-6">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-lime-200">
            Travel import
          </p>
          <h1 className="mt-2 text-3xl font-black">
            {String(data.import.subject || "Forwarded confirmation")}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Status: {status.replaceAll("_", " ")}
          </p>
        </section>
        {notice ? (
          <p
            className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-4 text-sm font-bold text-lime-100"
            role="status"
          >
            {notice}
          </p>
        ) : null}
        {error ? (
          <p
            className="rounded-2xl border border-red-300/20 bg-red-400/10 p-4 text-sm font-bold text-red-100"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {status === "failed" ? (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void action("retry")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-lime-300 px-5 font-black text-slate-950"
          >
            <RotateCcw className="h-4 w-4" /> Retry extraction
          </button>
        ) : null}
        {status !== "imported" && status !== "rejected" ? (
          <button
            type="button"
            disabled={submitting}
            onClick={() =>
              window.confirm("Ignore this travel import?") &&
              void action("ignore")
            }
            className="ml-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-5 font-black"
          >
            <Trash2 className="h-4 w-4" /> Ignore
          </button>
        ) : null}
        <form onSubmit={add} className="space-y-4">
          <label className="block text-xs font-black uppercase tracking-wide text-lime-200">
            Trip
            <select
              name="tripId"
              required
              className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-white"
            >
              <option value="">Select a trip</option>
              {data.trips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.title}
                </option>
              ))}
            </select>
          </label>
          {data.familyMembers.length ? (
            <fieldset className="rounded-2xl border border-white/10 p-4">
              <legend className="px-2 text-xs font-black uppercase tracking-wide text-lime-200">
                Travelers
              </legend>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" checked disabled /> You
              </label>
              {data.familyMembers.map((member) => (
                <label
                  key={member.id}
                  className="flex min-h-11 items-center gap-3"
                >
                  <input
                    type="checkbox"
                    name="familyMemberIds"
                    value={member.id}
                  />{" "}
                  {member.name}
                </label>
              ))}
            </fieldset>
          ) : null}
          {flights.map(({ item, flight }) => (
            <article
              key={item.id}
              className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5"
            >
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name={`include-${item.id}`}
                  defaultChecked
                />
                <Plane className="h-5 w-5 text-lime-200" />
                <strong>{flight.flightNumber || "Flight"}</strong>
              </label>
              <p className="mt-3 text-sm font-semibold text-slate-300">
                {flight.departureLocation || "Departure"} →{" "}
                {flight.arrivalLocation || "Arrival"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {flight.departureDate} {flight.departureTime}
              </p>
            </article>
          ))}
          {flights.length && status !== "imported" && status !== "rejected" ? (
            <button
              type="submit"
              disabled={submitting}
              className="min-h-12 w-full rounded-full bg-lime-300 px-5 font-black text-slate-950"
            >
              {submitting ? "Adding…" : "Add selected flights"}
            </button>
          ) : null}
        </form>
      </div>
    </main>
  );
}
