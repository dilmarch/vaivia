import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  list: vi.fn(),
  request: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@/lib/mobileApi/server", () => ({
  authenticateMobileRequest: mocks.authenticate,
  mobileSuccess: (_request: Request, data: unknown, init: ResponseInit = {}) => Response.json({ data }, init),
  mobileError: (_request: Request, options: { status: number; code: string; message: string }) => Response.json({ error: options.message, code: options.code, message: options.message }, { status: options.status }),
  mobileOptions: () => new Response(null, { status: 204 }),
}));

vi.mock("@/lib/data-export/exportService", () => {
  class DataExportServiceError extends Error {
    constructor(message: string, readonly code: string, readonly status = 400) { super(message); }
  }
  return {
    DataExportServiceError,
    listUserDataExports: mocks.list,
    requestUserDataExport: mocks.request,
    createUserDataExportDownload: mocks.download,
  };
});

import { GET, POST } from "@/app/api/mobile/v1/data-exports/route";
import { POST as download } from "@/app/api/mobile/v1/data-exports/[exportId]/download/route";

const context = { user: { id: "user-1" }, supabase: { marker: true } };
const request = (path: string, method = "GET") => new Request(`https://vaivia.app${path}`, { method });

describe("mobile data export routes", () => {
  beforeEach(() => {
    mocks.authenticate.mockReset().mockResolvedValue(context);
    mocks.list.mockReset().mockResolvedValue([
      {
        id: "export-1",
        status: "ready",
        requested_at: "2026-08-22T00:00:00Z",
        processing_started_at: null,
        completed_at: "2026-08-22T00:01:00Z",
        expires_at: "2026-08-29T00:00:00Z",
        export_schema_version: "1",
        failure_code: null,
        downloaded_at: null,
      },
    ]);
    mocks.request.mockReset().mockResolvedValue({ exportId: "export-1", status: "ready" });
    mocks.download.mockReset().mockResolvedValue({ url: "https://storage.example/signed", expiresInSeconds: 600 });
  });

  it("lists only authenticated export status with the mobile contract", async () => {
    const response = await GET(request("/api/mobile/v1/data-exports"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { exports: [{ id: "export-1", requestedAt: "2026-08-22T00:00:00Z" }] },
    });
    expect(mocks.list).toHaveBeenCalledWith(context.supabase, "user-1");
  });

  it("requests and downloads through the shared export service", async () => {
    expect((await POST(request("/api/mobile/v1/data-exports", "POST"))).status).toBe(200);
    const response = await download(
      request("/api/mobile/v1/data-exports/export-1/download", "POST"),
      { params: Promise.resolve({ exportId: "export-1" }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.request).toHaveBeenCalledWith(context.supabase, context.user);
    expect(mocks.download).toHaveBeenCalledWith(context.supabase, "user-1", "export-1");
  });
});
