/**
 * Formats Brazilian E.164 phone numbers into canonical representation: +55 49 98765-4321.
 * Other countries or non-matching numbers are preserved as provided.
 */

export const formatPhone = (phoneInput?: string | null): string => {
  if (!phoneInput) return "";

  const raw = phoneInput.trim();

  // If explicit international prefix other than +55, preserve verbatim
  if (raw.startsWith("+") && !raw.startsWith("+55")) {
    return raw;
  }

  const digitsOnly = raw.replace(/\D/g, "");

  // Brazilian number with 55 country code (55 + 2 DDD + 8/9 phone number)
  if (digitsOnly.startsWith("55") && (digitsOnly.length === 12 || digitsOnly.length === 13)) {
    const ddd = digitsOnly.slice(2, 4);
    const rest = digitsOnly.slice(4);

    if (rest.length === 9) {
      return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }

  // Brazilian number without country code (10 or 11 digits: DDD + 8/9 phone number)
  // Only apply when raw does not have explicit non-+55 prefix
  if (!raw.startsWith("+")) {
    if (digitsOnly.length === 11) {
      const ddd = digitsOnly.slice(0, 2);
      const rest = digitsOnly.slice(2);
      return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (digitsOnly.length === 10) {
      const ddd = digitsOnly.slice(0, 2);
      const rest = digitsOnly.slice(2);
      return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }

  if (raw.startsWith("+")) return raw;
  return `+${digitsOnly || raw}`;
};
