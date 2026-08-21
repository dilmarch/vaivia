import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMobileMutation } from "@/mobile/src/lib/useMobileMutation";
import { useLatestMobileRequest } from "@/mobile/src/lib/useLatestMobileRequest";

describe("useMobileMutation", () => {
  it("prevents duplicate submissions and exposes submitting state", async () => {
    let resolve!: (value: { id: string }) => void;
    const execute = vi.fn(
      () =>
        new Promise<{ id: string }>((complete) => {
          resolve = complete;
        }),
    );
    const { result } = renderHook(() => useMobileMutation(execute));

    let first!: Promise<{ id: string }>;
    let duplicate!: Promise<{ id: string }>;
    act(() => {
      first = result.current.submit({ title: "Trip" });
      duplicate = result.current.submit({ title: "Trip" });
    });
    expect(result.current.isSubmitting).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(duplicate).toBe(first);

    await act(async () => resolve({ id: "record-1" }));
    await expect(first).resolves.toEqual({ id: "record-1" });
    expect(result.current.status).toBe("success");
  });

  it("supports future optimistic rollback without changing existing screens", async () => {
    const onOptimistic = vi.fn(() => ({ previous: "Before" }));
    const onRollback = vi.fn();
    const execute = vi.fn(async () => {
      throw new Error("Safe failure");
    });
    const { result } = renderHook(() =>
      useMobileMutation(execute, { onOptimistic, onRollback }),
    );

    await act(async () => {
      await expect(result.current.submit({ label: "After" })).rejects.toThrow(
        "Safe failure",
      );
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(onRollback).toHaveBeenCalledWith(
      { previous: "Before" },
      expect.any(Error),
      { label: "After" },
    );
  });

  it("cancels stale requests and cleans up the latest request on unmount", () => {
    const { result, unmount } = renderHook(() => useLatestMobileRequest());
    const first = result.current.beginRequest();
    const second = result.current.beginRequest();

    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
    unmount();
    expect(second.aborted).toBe(true);
  });
});
