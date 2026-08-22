import { useCallback, useEffect, useState } from "react";
import type { MobileEventCheckoutStatusResponse } from "@/lib/mobileApi/contracts";
import { ScreenMessage } from "../components/ScreenMessage";
import type { MobileApiClient } from "../lib/apiClient";

export function EventCheckoutScreen({ apiClient, orderId, resultHint, onMyEvents }: { apiClient: MobileApiClient; orderId: string; resultHint?: "pending" | "success" | "cancelled"; onMyEvents: () => void }) {
  const [status, setStatus] = useState<MobileEventCheckoutStatusResponse | null>(null);
  const [error, setError] = useState("");
  const load = useCallback((signal?: AbortSignal) => apiClient.getEventCheckoutStatus(orderId, signal), [apiClient, orderId]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let attempts = 0;
    const refresh = async () => {
      attempts += 1;
      try {
        const next = await load(controller.signal);
        if (controller.signal.aborted) return;
        setStatus(next);
        setError("");
        if (!next.ready && resultHint === "success" && attempts < 8) {
          timer = window.setTimeout(refresh, 1500);
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Checkout status is unavailable.",
          );
        }
      }
    };
    const refreshOnResume = () => {
      if (document.visibilityState !== "visible") return;
      attempts = 0;
      if (timer) window.clearTimeout(timer);
      void refresh();
    };
    document.addEventListener("visibilitychange", refreshOnResume);
    void refresh();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshOnResume);
    };
  }, [load, resultHint]);
  const title = status?.ready ? "Your tickets are ready" : resultHint === "cancelled" ? "Checkout cancelled" : "Confirming your payment";
  const message = status?.ready ? "Stripe confirmed the payment with VAIVIA. Your tickets are available in My Events." : resultHint === "cancelled" ? "No completed payment was reported. You can return to the event and try again." : "VAIVIA is waiting for secure server confirmation from Stripe. Do not close the app yet.";
  return <main className="min-h-screen bg-[#0c0115] px-4 pb-28 pt-28 text-white"><div className="mx-auto max-w-xl"><ScreenMessage title={error ? "Checkout status unavailable" : title} message={error || message} actionLabel={status?.ready ? "Open My Events" : undefined} onAction={status?.ready ? onMyEvents : undefined} /></div></main>;
}
