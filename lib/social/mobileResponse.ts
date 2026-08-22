import { mobileError } from "@/lib/mobileApi/server";
import { SocialProfileError } from "@/lib/social/profileDomain";

export function socialErrorResponse(request: Request, error: unknown) {
  if (error instanceof SocialProfileError) {
    return mobileError(request, {
      status: error.status,
      code: error.code,
      message: error.message,
    });
  }
  console.error("Mobile social profile request failed:", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return mobileError(request, {
    status: 500,
    code: "social_profile_failed",
    message: "VAIVIA could not update this profile.",
  });
}

export async function readObject(request: Request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
