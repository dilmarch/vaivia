import { useCallback, useEffect, useRef, useState } from "react";

export type MobileMutationStatus = "idle" | "submitting" | "success" | "error";

export type MobileMutationOptions<TInput, TResult, TRollback> = {
  onOptimistic?: (input: TInput) => TRollback;
  onCommit?: (result: TResult, input: TInput) => void;
  onRollback?: (snapshot: TRollback, error: unknown, input: TInput) => void;
};

export function useMobileMutation<TInput, TResult, TRollback = undefined>(
  execute: (input: TInput) => Promise<TResult>,
  options: MobileMutationOptions<TInput, TResult, TRollback> = {},
) {
  const [status, setStatus] = useState<MobileMutationStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const inFlightRef = useRef<Promise<TResult> | null>(null);
  const mountedRef = useRef(true);
  const { onOptimistic, onCommit, onRollback } = options;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submit = useCallback(
    (input: TInput) => {
      if (inFlightRef.current) return inFlightRef.current;
      const snapshot = onOptimistic?.(input);
      setStatus("submitting");
      setError(null);

      const request = execute(input)
        .then((result) => {
          if (mountedRef.current) {
            onCommit?.(result, input);
            setStatus("success");
          }
          return result;
        })
        .catch((cause: unknown) => {
          if (mountedRef.current) {
            if (snapshot !== undefined) onRollback?.(snapshot, cause, input);
            setError(
              cause instanceof Error
                ? cause
                : new Error("VAIVIA could not complete the request."),
            );
            setStatus("error");
          }
          throw cause;
        })
        .finally(() => {
          if (inFlightRef.current === request) inFlightRef.current = null;
        });

      inFlightRef.current = request;
      return request;
    },
    [execute, onCommit, onOptimistic, onRollback],
  );

  const reset = useCallback(() => {
    if (inFlightRef.current) return;
    setStatus("idle");
    setError(null);
  }, []);

  return {
    submit,
    reset,
    status,
    error,
    isSubmitting: status === "submitting",
  };
}
