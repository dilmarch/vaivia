export const USERNAME_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "support",
  "security",
  "billing",
  "help",
  "contact",
  "info",
  "postmaster",
  "abuse",
  "privacy",
  "legal",
  "system",
  "vaivia",
]);

export function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function getUsernameValidationError(value: string) {
  const username = normalizeUsername(value);

  if (!username) return "Please create a username to continue.";
  if (username.length < 3) return "Username must be at least 3 characters.";
  if (username.length > 30) return "Username must be 30 characters or fewer.";
  if (RESERVED_USERNAMES.has(username)) {
    return "That username is reserved. Please choose another one.";
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "Use lowercase letters and numbers, with single underscores or hyphens only between them.";
  }

  return null;
}

export function isUsernameConflictError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const details = error as {
    code?: string | null;
    message?: string | null;
    details?: string | null;
  };
  const text = [details.message, details.details].filter(Boolean).join(" ");

  return (
    details.code === "23505" ||
    /user_profiles_username_unique_ci_idx/i.test(text) ||
    /duplicate key/i.test(text)
  );
}
