"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Search, XCircle } from "lucide-react";

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
};

export default function EventCheckInClient({ eventId }: { eventId: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<{
    result: string;
    checked_in_at?: string;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [pending, setPending] = useState(false);
  async function submit(value: string) {
    if (!value || pending) return;
    setPending(true);
    const response = await fetch(`/api/events/${eventId}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    const body = await response.json().catch(() => ({ result: "error" }));
    setResult(body);
    setPending(false);
    if (response.ok) stopCamera();
  }
  function stopCamera() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }
  async function startCamera() {
    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (options: {
          formats: string[];
        }) => BarcodeDetectorLike;
      }
    ).BarcodeDetector;
    if (!Detector) {
      setResult({ result: "camera_unsupported" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      const detector = new Detector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return;
        const codes = await detector.detect(videoRef.current).catch(() => []);
        if (codes[0]?.rawValue) {
          await submit(codes[0].rawValue);
          return;
        }
        frameRef.current = requestAnimationFrame(scan);
      };
      frameRef.current = requestAnimationFrame(scan);
    } catch {
      setResult({ result: "camera_denied" });
    }
  }
  useEffect(() => () => stopCamera(), []);
  const successful = result?.result === "checked_in";
  const label = result
    ? (
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
        } as Record<string, string>
      )[result.result] || result.result
    : "";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-[2rem] border border-white/10 bg-[#080511] p-6">
        <h2 className="flex items-center gap-2 text-2xl font-black">
          <Camera className="h-6 w-6 text-lime-300" />
          Scan QR code
        </h2>
        <div className="mt-5 aspect-[4/3] overflow-hidden rounded-[1.5rem] bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        </div>
        <button
          type="button"
          onClick={scanning ? stopCamera : startCamera}
          className="mt-4 w-full rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950"
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
          onSubmit={(e) => {
            e.preventDefault();
            submit(manual);
          }}
          className="mt-5 flex gap-3"
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="VAE-XXXXXXXXXXXX"
            className="h-12 min-w-0 flex-1 rounded-2xl border border-white/15 bg-slate-950 px-4 font-mono text-sm font-bold text-white"
          />
          <button
            disabled={pending}
            className="rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950"
          >
            Check
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
            <p className="mt-3 text-lg font-black">{label}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
