import { useEffect, useState, type ReactNode } from "react";
import {
  NotificationHistoryActionsPresentation,
  NotificationHistoryPresentation,
} from "@/components/notifications/NotificationHistoryPresentation";
import type { MobileNotificationHistoryResponse } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "../lib/apiClient";

const EMPTY_HISTORY: MobileNotificationHistoryResponse = {
  notifications: [],
  activeActionNotificationIds: [],
};

export function NotificationHistoryScreen({
  apiClient,
  supportedTripIds,
  onBack,
  onOpenTrip,
}: {
  apiClient: MobileApiClient;
  supportedTripIds: readonly string[];
  onBack: () => void;
  onOpenTrip: (tripId: string) => void;
}) {
  const [history, setHistory] =
    useState<MobileNotificationHistoryResponse>(EMPTY_HISTORY);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

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

  const disabledAction = (props: {
    className: string;
    children: ReactNode;
    "aria-label"?: string;
  }) => (
    <button
      type="button"
      disabled
      title="Unavailable in the read-only mobile notification centre"
      {...props}
      className={`${props.className} cursor-not-allowed opacity-50`}
    />
  );

  return (
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
        const reviewTripId =
          actionRequired &&
            notification.type === "weather_alert" &&
            notification.trip_id &&
            supportedTripIds.includes(notification.trip_id)
            ? notification.trip_id
            : null;

        return (
          <NotificationHistoryActionsPresentation
            notification={notification}
            actionRequired={actionRequired}
            renderReviewAction={
              actionRequired
                ? reviewTripId
                  ? (props) => (
                      <button
                        type="button"
                        onClick={() => onOpenTrip(reviewTripId)}
                        {...props}
                      />
                    )
                  : disabledAction
                : undefined
            }
            renderReadAction={
              notification.read_at ? undefined : disabledAction
            }
            renderArchiveAction={
              notification.archived_at ? undefined : disabledAction
            }
            renderRestoreAction={
              notification.archived_at ? disabledAction : undefined
            }
          />
        );
      }}
    />
  );
}
