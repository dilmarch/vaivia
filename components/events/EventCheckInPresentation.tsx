import type { ReactNode } from "react";
import { Camera, CheckCircle2, Search, XCircle } from "lucide-react";
import type { EventCheckInResult } from "@/lib/events/operationsContracts";

export function eventCheckInLabel(result: EventCheckInResult | null) {
  if (!result) return "";
  return (
    {
      checked_in: "Ticket checked in",
      already_used: `Already checked in${result.checked_in_at ? ` at ${new Date(result.checked_in_at).toLocaleString()}` : ""}`,
      refunded: "Refunded ticket — entry denied",
      cancelled: "Cancelled ticket — entry denied",
      void: "Void ticket — entry denied",
      wrong_event: "Ticket belongs to another event",
      invalid: "Ticket not found",
      camera_unsupported:
        "QR camera scanning isn’t supported here. Use ticket search.",
      camera_denied: "Camera access was unavailable. Use ticket search.",
      error: "Ticket could not be checked in",
    } satisfies Record<EventCheckInResult["result"], string>
  )[result.result];
}

export function EventCheckInPresentation({
  manual,
  result,
  scanning,
  pending,
  cameraPreview,
  cameraUnavailableMessage,
  onManualChange,
  onSubmit,
  onToggleCamera,
}: {
  manual: string;
  result: EventCheckInResult | null;
  scanning: boolean;
  pending: boolean;
  cameraPreview?: ReactNode;
  cameraUnavailableMessage?: string;
  onManualChange: (value: string) => void;
  onSubmit: () => void;
  onToggleCamera?: () => void;
}) {
  const successful = result?.result === "checked_in";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-[2rem] border border-white/10 bg-[#080511] p-6">
        <h2 className="flex items-center gap-2 text-2xl font-black">
          <Camera className="h-6 w-6 text-lime-300" />
          Scan QR code
        </h2>
        <div className="mt-5 aspect-[4/3] overflow-hidden rounded-[1.5rem] bg-black">
          {cameraPreview || (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm font-semibold text-slate-400">
              {cameraUnavailableMessage || "Camera scanning is unavailable."}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleCamera}
          disabled={!onToggleCamera}
          className="mt-4 w-full rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scanning ? "Stop camera" : "Start camera"}
        </button>
      </section>
      <section className="rounded-[2rem] border border-white/10 bg-[#080511] p-6">
        <h2 className="flex items-center gap-2 text-2xl font-black">
          <Search className="h-6 w-6 text-lime-300" />
          Ticket search
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-400">
          Enter the public ticket number when camera scanning isn’t available.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="mt-5 flex gap-3"
        >
          <input
            value={manual}
            onChange={(event) => onManualChange(event.target.value)}
            placeholder="VAE-XXXXXXXXXXXX"
            aria-label="Ticket number"
            className="h-12 min-w-0 flex-1 rounded-2xl border border-white/15 bg-slate-950 px-4 font-mono text-sm font-bold text-white"
          />
          <button
            disabled={pending || !manual.trim()}
            className="rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Checking…" : "Check"}
          </button>
        </form>
        {result ? (
          <div
            role="status"
            className={`mt-6 rounded-[1.5rem] border p-5 ${successful ? "border-lime-300/30 bg-lime-300/10" : "border-red-300/25 bg-red-300/10"}`}
          >
            {successful ? (
              <CheckCircle2 className="h-9 w-9 text-lime-300" />
            ) : (
              <XCircle className="h-9 w-9 text-red-200" />
            )}
            <p className="mt-3 text-lg font-black">
              {eventCheckInLabel(result)}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
