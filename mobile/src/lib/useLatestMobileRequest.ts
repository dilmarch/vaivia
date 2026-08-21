import { useCallback, useEffect, useRef } from "react";

export function useLatestMobileRequest() {
  const controllerRef = useRef<AbortController | null>(null);

  const beginRequest = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller.signal;
  }, []);

  const cancelRequest = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => cancelRequest, [cancelRequest]);

  return { beginRequest, cancelRequest };
}
