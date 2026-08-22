import {
  authenticateMobileRequest,
  mobileError,
  mobileOptions,
  mobileSuccess,
} from "@/lib/mobileApi/server";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function OPTIONS(request: Request) {
  return mobileOptions(request, "POST, OPTIONS");
}

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth instanceof Response) return auth;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return mobileError(request, {
      status: 400,
      code: "validation_error",
      message: "Choose an avatar image.",
    });
  }
  const file = form.get("avatar");
  if (
    !(file instanceof File) ||
    !ALLOWED_TYPES.has(file.type) ||
    file.size <= 0 ||
    file.size > MAX_AVATAR_BYTES
  ) {
    return mobileError(request, {
      status: 422,
      code: "validation_error",
      message: "Use a JPEG, PNG, or WebP image up to 5 MB.",
    });
  }
  const extension =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const path = `${auth.user.id}/avatar.${extension}`;
  const upload = await auth.supabase.storage
    .from("avatars")
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: true,
    });
  if (upload.error) {
    console.error("Mobile avatar upload failed:", {
      userId: auth.user.id,
      code: upload.error.name,
      fileType: file.type,
      fileSize: file.size,
    });
    return mobileError(request, {
      status: 500,
      code: "avatar_upload_failed",
      message: "VAIVIA could not upload this avatar.",
    });
  }
  const publicUrl = auth.supabase.storage.from("avatars").getPublicUrl(path)
    .data.publicUrl;
  const profile = await auth.supabase
    .from("user_profiles")
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", auth.user.id)
    .select("avatar_url")
    .single();
  if (profile.error)
    return mobileError(request, {
      status: 500,
      code: "avatar_profile_failed",
      message: "The avatar uploaded, but VAIVIA could not update your profile.",
    });
  return mobileSuccess(request, { avatarUrl: profile.data.avatar_url });
}
