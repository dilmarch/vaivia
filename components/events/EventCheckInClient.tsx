"use client";

import { useEffect, useRef, useState } from "react";
import { EventCheckInPresentation } from "@/components/events/EventCheckInPresentation";
import type { EventCheckInResult } from "@/lib/events/operationsContracts";

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
};

export default function EventCheckInClient({ eventId }: { eventId: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<EventCheckInResult | null>(null);
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
    const body = (await response
      .json()
      .catch(() => ({ result: "error" }))) as EventCheckInResult;
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
  return (
    <EventCheckInPresentation
      manual={manual}
      result={result}
      scanning={scanning}
      pending={pending}
      cameraPreview={
        <video
          ref={videoRef}
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      }
      onManualChange={setManual}
      onSubmit={() => void submit(manual)}
      onToggleCamera={scanning ? stopCamera : () => void startCamera()}
    />
  );
}
