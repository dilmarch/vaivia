import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createUserDataExportDownload,
  DataExportServiceError,
} from "@/lib/data-export/exportService";

type RouteContext = { params: Promise<{ exportId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { exportId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to download your data export.", code: "not_authenticated" },
      { status: 401 },
    );
  }
  try {
    return NextResponse.json(
      await createUserDataExportDownload(supabase, user.id, exportId),
    );
  } catch (error) {
    if (error instanceof DataExportServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("Data export download failed", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return NextResponse.json(
      { error: "Could not create a download link.", code: "download_error" },
      { status: 500 },
    );
  }
}
