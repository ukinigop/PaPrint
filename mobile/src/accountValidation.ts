export const passwordRequirements = (password: string) => [
  { label: "At least 10 characters", met: password.length >= 10 },
  {
    label: "128 characters or fewer",
    met: password.length > 0 && password.length <= 128,
  },
];

export const phoneDigits = (value: string) =>
  value.replace(/[^0-9]/g, "").slice(0, 11);
export const validPhone = (value: string) => /^[0-9]{11}$/.test(value);

export function signupValidation(
  phone: string,
  password: string,
  confirmation: string,
) {
  if (!validPhone(phone)) return "Enter an 11-digit mobile number.";
  if (!passwordRequirements(password).every((rule) => rule.met))
    return "Use a password of 10–128 characters.";
  if (!confirmation) return "Please confirm your password.";
  if (password !== confirmation) return "Passwords do not match.";
  return "";
}
