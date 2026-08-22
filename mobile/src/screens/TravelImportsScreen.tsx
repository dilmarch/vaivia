import { useEffect, useState } from "react";
import {
  TravelImportsPresentation,
  type TravelImportPresentationItem,
} from "@/components/imports/TravelImportsPresentation";
import type { MobileApiClient } from "../lib/apiClient";

export function TravelImportsScreen({
  apiClient,
  onOpen,
  onSettings,
}: {
  apiClient: MobileApiClient;
  onOpen: (id: string) => void;
  onSettings: () => void;
}) {
  const [imports, setImports] = useState<TravelImportPresentationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void apiClient
      .getTravelImports(controller.signal)
      .then((result) =>
        setImports(
          result.imports.map((item) => ({
            id: item.id,
            createdAt: item.created_at,
            subject: item.subject || "Forwarded confirmation",
            senderEmail: item.sender_email || "Unknown sender",
            status: item.status,
            importType: (item.import_type || "Unknown").replaceAll("_", " "),
            confidence: item.extraction_confidence ?? null,
            itemCount: item.itemCount,
          })),
        ),
      )
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load travel imports.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [apiClient, reload]);

  return (
    <TravelImportsPresentation
      imports={imports}
      isLoading={loading}
      error={error}
      safeAreaHandledExternally
      renderSettingsAction={(props) => (
        <button type="button" onClick={onSettings} {...props} />
      )}
      renderImportAction={(item, props) => (
        <button type="button" onClick={() => onOpen(item.id)} {...props} />
      )}
      renderRetryAction={(props) => (
        <button
          type="button"
          onClick={() => setReload((value) => value + 1)}
          {...props}
        />
      )}
    />
  );
}
