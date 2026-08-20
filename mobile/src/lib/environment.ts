export type MobileEnvironment = {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

function normalizeUrl(value: string, label: string) {
  const trimmedValue = value.trim().replace(/\/+$/, "");
  if (!trimmedValue) {
    throw new Error(`${label} is not configured.`);
  }

  let url: URL;
  try {
    url = new URL(trimmedValue);
  } catch {
    throw new Error(`${label} must be a valid absolute URL.`);
  }

  const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !isLocalDevelopment) {
    throw new Error(`${label} must use HTTPS outside local development.`);
  }

  return url.toString().replace(/\/$/, "");
}

function validatePublishableKey(value: string) {
  const key = value.trim();
  if (!key) {
    throw new Error("Mobile Supabase publishable key is not configured.");
  }
  if (key.startsWith("sb_secret_") || /service[_-]?role/i.test(key)) {
    throw new Error("A server secret cannot be bundled into the mobile app.");
  }
  return key;
}

export function getMobileEnvironment(): MobileEnvironment {
  return {
    apiBaseUrl: normalizeUrl(
      __VAIVIA_MOBILE_CONFIG__.apiBaseUrl,
      "Mobile API base URL",
    ),
    supabaseUrl: normalizeUrl(
      __VAIVIA_MOBILE_CONFIG__.supabaseUrl,
      "Mobile Supabase URL",
    ),
    supabasePublishableKey: validatePublishableKey(
      __VAIVIA_MOBILE_CONFIG__.supabasePublishableKey,
    ),
  };
}
