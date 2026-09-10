const pad2 = (value: number) => String(value).padStart(2, "0");

/** Formats a Date for a datetime-local input without converting it to UTC. */
export function formatLocalDateTimeInput(value: Date): string {
  return [
    value.getFullYear(),
    "-",
    pad2(value.getMonth() + 1),
    "-",
    pad2(value.getDate()),
    "T",
    pad2(value.getHours()),
    ":",
    pad2(value.getMinutes()),
  ].join("");
}
