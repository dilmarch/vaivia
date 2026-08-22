import { useEffect, useState } from "react";
import {
  NotificationHistoryActionsPresentation,
  NotificationHistoryPresentation,
  type NotificationHistoryItem,
} from "@/components/notifications/NotificationHistoryPresentation";
import type {
  MobileNotificationDestination,
  MobileNotificationHistoryResponse,
} from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "../lib/apiClient";

const EMPTY_HISTORY: MobileNotificationHistoryResponse = {
  notifications: [],
  activeActionNotificationIds: [],
};

export function NotificationHistoryScreen({
  apiClient,
  onBack,
  onNavigate,
}: {
  apiClient: MobileApiClient;
  onBack: () => void;
  onNavigate: (destination: MobileNotificationDestination) => void;
}) {
  const [history, setHistory] =
    useState<MobileNotificationHistoryResponse>(EMPTY_HISTORY);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [reviewing, setReviewing] = useState<NotificationHistoryItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage("");

    void apiClient
      .getNotificationHistory(controller.signal)
      .then(setHistory)
      .catch((error) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load notification history.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [apiClient, reloadKey]);

  useEffect(() => {
    const reloadOnResume = () => {
      if (document.visibilityState === "visible") {
        setReloadKey((key) => key + 1);
      }
    };

    document.addEventListener("visibilitychange", reloadOnResume);
    return () =>
      document.removeEventListener("visibilitychange", reloadOnResume);
  }, []);

  async function mutateState(
    notificationId: string,
    action: "read" | "archive" | "restore",
  ) {
    setIsSubmitting(true);
    setActionError("");
    try {
      await apiClient.updateNotification(notificationId, action, {
        idempotencyKey: crypto.randomUUID(),
      });
      setReloadKey((key) => key + 1);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not update this notification.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function openOrReview(notification: NotificationHistoryItem) {
    const direct =
      notification.type === "weather_alert" ||
      notification.type?.startsWith("travel_email_") ||
      notification.type === "profile_onboarding_prompt" ||
      notification.type === "theme_exploration_prompt";
    if (!direct) {
      setReviewing(notification);
      return;
    }
    setIsSubmitting(true);
    setActionError("");
    try {
      const result = await apiClient.reviewNotification(
        notification.id,
        "open",
        undefined,
        { idempotencyKey: crypto.randomUUID() },
      );
      setReloadKey((key) => key + 1);
      if (result.destination) onNavigate(result.destination);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not open this notification.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function respond(action: "accept" | "decline", form?: HTMLFormElement) {
    if (!reviewing) return;
    setIsSubmitting(true);
    setActionError("");
    try {
      const values = form ? new FormData(form) : null;
      const stampPatch =
        reviewing.type === "passport_stamp_share_received" && values
          ? {
              firstVisitYear: String(values.get("year") || ""),
              visitMonth: String(values.get("month") || ""),
              visitCity: String(values.get("city") || ""),
              visitRegion: String(values.get("region") || ""),
              visitStatus: String(values.get("status") || "visited"),
              portOfEntryName: String(values.get("portOfEntry") || ""),
            }
          : undefined;
      const result = await apiClient.reviewNotification(
        reviewing.id,
        action,
        stampPatch,
        { idempotencyKey: crypto.randomUUID() },
      );
      setReviewing(null);
      setReloadKey((key) => key + 1);
      if (result.destination) onNavigate(result.destination);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not review this notification.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <NotificationHistoryPresentation
        notifications={history.notifications}
        activeActionNotificationIds={history.activeActionNotificationIds}
        isLoading={isLoading}
        error={errorMessage}
        safeAreaHandledExternally
        renderBackAction={(props) => (
          <button type="button" onClick={onBack} {...props} />
        )}
        renderRetryAction={(props) => (
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            {...props}
          />
        )}
        renderActions={({ notification, actionRequired }) => {
          return (
            <NotificationHistoryActionsPresentation
              notification={notification}
              actionRequired={actionRequired}
              renderReviewAction={
                actionRequired
                  ? (props) => (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => void openOrReview(notification)}
                        {...props}
                      />
                    )
                  : undefined
              }
              renderReadAction={
                notification.read_at
                  ? undefined
                  : (props) => (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() =>
                          void mutateState(notification.id, "read")
                        }
                        {...props}
                      />
                    )
              }
              renderArchiveAction={
                notification.archived_at
                  ? undefined
                  : (props) => (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() =>
                          void mutateState(notification.id, "archive")
                        }
                        {...props}
                      />
                    )
              }
              renderRestoreAction={
                notification.archived_at
                  ? (props) => (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() =>
                          void mutateState(notification.id, "restore")
                        }
                        {...props}
                      />
                    )
                  : undefined
              }
            />
          );
        }}
      />
      {actionError ? (
        <p
          className="fixed bottom-[calc(7rem+var(--safe-area-bottom))] left-4 right-4 z-[110] rounded-2xl border border-red-300/25 bg-red-950/95 p-4 text-sm font-bold text-red-100"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
      {reviewing ? (
        <div
          className="fixed inset-0 z-[120] flex items-end bg-black/70 p-4 pb-[calc(1rem+var(--safe-area-bottom))] sm:items-center sm:justify-center"
          role="presentation"
          onClick={() => !isSubmitting && setReviewing(null)}
        >
          <form
            className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#080914] p-5 text-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-notification-review-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void respond("accept", event.currentTarget);
            }}
          >
            <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">
              Review
            </p>
            <h2
              id="mobile-notification-review-title"
              className="mt-2 text-2xl font-black"
            >
              {reviewing.title || "Notification"}
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
              {reviewing.body}
            </p>
            {reviewing.type === "passport_stamp_share_received" ? (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <label className="text-xs font-black uppercase tracking-wide text-lime-200">
                  Year
                  <input
                    name="year"
                    inputMode="numeric"
                    required
                    className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-white"
                  />
                </label>
                <label className="text-xs font-black uppercase tracking-wide text-lime-200">
                  Month
                  <input
                    name="month"
                    type="number"
                    min="1"
                    max="12"
                    className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-white"
                  />
                </label>
                <label className="col-span-2 text-xs font-black uppercase tracking-wide text-lime-200">
                  City
                  <input
                    name="city"
                    className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-white"
                  />
                </label>
                <input type="hidden" name="region" value="" />
                <input type="hidden" name="status" value="visited" />
                <input type="hidden" name="portOfEntry" value="" />
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void respond("decline")}
                className="min-h-11 rounded-full border border-white/15 px-5 text-sm font-black"
              >
                Decline
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-11 rounded-full bg-lime-300 px-5 text-sm font-black text-slate-950"
              >
                {isSubmitting ? "Saving…" : "Accept"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
