import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  DataExportServiceError,
  listUserDataExports,
  requestUserDataExport,
} from "@/lib/data-export/exportService";

function exportError(error: unknown) {
  if (error instanceof DataExportServiceError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("Data export operation failed", {
    message: error instanceof Error ? error.message : "unknown_error",
  });
  return NextResponse.json(
    { error: "Could not complete the data export request.", code: "export_error" },
    { status: 500 },
  );
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to view data exports.", code: "not_authenticated" },
      { status: 401 },
    );
  }
  try {
    return NextResponse.json({ exports: await listUserDataExports(supabase, user.id) });
  } catch (error) {
    return exportError(error);
  }
}

export async function POST() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to request a data export.", code: "not_authenticated" },
      { status: 401 },
    );
  }
  try {
    return NextResponse.json(await requestUserDataExport(supabase, user));
  } catch (error) {
    return exportError(error);
  }
}
