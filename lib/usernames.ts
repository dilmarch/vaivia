export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function getUsernameValidationError(value: string) {
  const username = normalizeUsername(value);

  if (!username) return "Please create a username to continue.";
  if (username.length < 3) return "Username must be at least 3 characters.";
  if (username.length > 30) return "Username must be 30 characters or fewer.";
  if (!USERNAME_PATTERN.test(username)) {
    return "Use 3-30 lowercase letters, numbers, underscores, or hyphens. Start with a letter or number.";
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
