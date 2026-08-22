import { useEffect, useState } from "react";
import { EventCheckInPresentation } from "@/components/events/EventCheckInPresentation";
import type {
  EventCheckInResult,
  EventOperationsDetail,
} from "@/lib/events/operationsContracts";
import type { MobileApiClient } from "../lib/apiClient";
import { ScreenMessage } from "../components/ScreenMessage";

export function EventCheckInScreen({
  apiClient,
  eventId,
  onBack,
}: {
  apiClient: MobileApiClient;
  eventId: string;
  onBack: () => void;
}) {
  const [event, setEvent] = useState<EventOperationsDetail["event"] | null>(null);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<EventCheckInResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void apiClient
      .getManagedEvent(eventId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setEvent(response.event);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Check-in could not be opened.",
          );
        }
      });
    return () => controller.abort();
  }, [apiClient, eventId]);

  async function submit() {
    if (!manual.trim() || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await apiClient.checkInEvent(eventId, manual);
      setResult(response);
      if (response.result === "checked_in") setManual("");
    } catch (reason) {
      setResult({ result: "error" });
      setError(
        reason instanceof Error
          ? reason.message
          : "The ticket could not be checked in.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!event) {
    return (
      <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white">
        <ScreenMessage
          title={error ? "Check-in is unavailable" : "Opening check-in"}
          message={error || "Loading the event’s door tools."}
          actionLabel="Back"
          onAction={onBack}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">
            Door tools
          </p>
          <h1 className="mt-2 text-4xl font-black">
            Check in · {event.title}
          </h1>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 rounded-full border border-white/15 px-4 py-2 text-sm font-black"
          >
            Attendee list
          </button>
        </header>
        {error ? (
          <p role="alert" className="mb-5 rounded-2xl border border-red-300/25 bg-red-300/10 p-4 text-sm font-bold text-red-100">
            {error}
          </p>
        ) : null}
        <EventCheckInPresentation
          manual={manual}
          result={result}
          scanning={false}
          pending={pending}
          cameraUnavailableMessage="Native camera scanning will be activated with the iOS camera capability phase. Ticket-number and pasted QR-value check-in are available now."
          onManualChange={setManual}
          onSubmit={() => void submit()}
        />
      </div>
    </main>
  );
}
