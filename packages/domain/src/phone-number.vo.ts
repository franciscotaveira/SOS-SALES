/**
 * PhoneNumber Value Object.
 * Enforces E.164 international standard and provides sanitization.
 */
export class PhoneNumber {
  private readonly value: string;

  constructor(raw: string) {
    const cleaned = raw.replace(/[^\d+]/g, "");
    const formatted = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;

    if (!/^\+[1-9]\d{1,14}$/.test(formatted)) {
      throw new Error(`Invalid E.164 phone number: ${raw}`);
    }

    this.value = formatted;
  }

  public toString(): string {
    return this.value;
  }

  public toMasked(): string {
    // Preserves country code and last 4 digits, masks the rest for log security
    if (this.value.length < 8) return "***";
    const cc = this.value.slice(0, 3);
    const end = this.value.slice(-4);
    return `${cc}*****${end}`;
  }

  public equals(other: PhoneNumber): boolean {
    return this.value === other.value;
  }
}
