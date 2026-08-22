export type SignupPasswordInput = {
  password: string;
  email: string;
  username: string;
};

export function getSignupPasswordValidationError({
  password,
  email,
  username,
}: SignupPasswordInput) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one capital letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) return "Password must include at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must include at least one special character.";
  }
  if (/\s/.test(password)) return "Password cannot contain spaces.";

  const normalizedPassword = password.toLowerCase();
  if (username && normalizedPassword.includes(username.toLowerCase())) {
    return "Password cannot contain your username.";
  }
  const emailName = email.split("@")[0]?.toLowerCase() || "";
  if (emailName && normalizedPassword.includes(emailName)) {
    return "Password cannot contain the first part of your email address.";
  }

  return "";
}

export function getSignupPasswordCriteria(input: SignupPasswordInput) {
  const { password, email, username } = input;
  return [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "1 capital letter", met: /[A-Z]/.test(password) },
    { label: "1 lowercase letter", met: /[a-z]/.test(password) },
    { label: "1 number", met: /[0-9]/.test(password) },
    { label: "1 special character", met: /[^A-Za-z0-9]/.test(password) },
    {
      label: "No spaces or obvious account details",
      met:
        password.length > 0 &&
        !/\s/.test(password) &&
        !(username.trim() && password.toLowerCase().includes(username.trim().toLowerCase())) &&
        !(
          email.trim().split("@")[0] &&
          password.toLowerCase().includes(email.trim().split("@")[0].toLowerCase())
        ),
    },
  ];
}
