export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export function emailError(v: string): string | null {
  if (!v.trim()) return "Enter your email address.";
  return isEmail(v) ? null : "That doesn't look like an email address.";
}
export function passwordError(v: string): string | null {
  if (!v) return "Enter a password.";
  if (v.length < 8) return "Use at least 8 characters.";
  if (v.length > 100) return "Use 100 characters or fewer.";
  return null;
}
