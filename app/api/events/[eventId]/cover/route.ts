import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireEventManager } from "@/lib/events/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  await requireEventManager(eventId);
  const form = await request.formData();
  const file = form.get("cover");
  if (!(file instanceof File))
    return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (
    !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
      file.type,
    ) ||
    file.size > 10 * 1024 * 1024
  )
    return NextResponse.json(
      { error: "Use a JPEG, PNG, WebP or AVIF under 10 MB." },
      { status: 400 },
    );
  try {
    const source = Buffer.from(await file.arrayBuffer());
    const image = sharp(source);
    const metadata = await image.metadata();
    if ((metadata.width || 0) < 800 || (metadata.height || 0) < 450)
      return NextResponse.json(
        { error: "Cover images must be at least 800 × 450." },
        { status: 400 },
      );
    const output = await image
      .rotate()
      .resize(1600, 900, { fit: "cover", position: "centre" })
      .webp({ quality: 86 })
      .toBuffer();
    const service = createServiceRoleClient();
    const { data: current } = await service
      .from("events")
      .select("cover_image_storage_path")
      .eq("id", eventId)
      .single();
    const path = `${eventId}/cover-${Date.now()}.webp`;
    const { error: uploadError } = await service.storage
      .from("event-covers")
      .upload(path, output, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      });
    if (uploadError) throw uploadError;
    const { error: updateError } = await service
      .from("events")
      .update({ cover_image_storage_path: path })
      .eq("id", eventId);
    if (updateError) throw updateError;
    if (
      current?.cover_image_storage_path &&
      current.cover_image_storage_path !== path
    )
      await service.storage
        .from("event-covers")
        .remove([current.cover_image_storage_path]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "The cover image could not be processed." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  await requireEventManager(eventId);
  const service = createServiceRoleClient();
  const { data: event } = await service
    .from("events")
    .select("cover_image_storage_path")
    .eq("id", eventId)
    .single();
  if (event?.cover_image_storage_path)
    await service.storage
      .from("event-covers")
      .remove([event.cover_image_storage_path]);
  await service
    .from("events")
    .update({ cover_image_storage_path: null })
    .eq("id", eventId);
  return NextResponse.json({ ok: true });
}
