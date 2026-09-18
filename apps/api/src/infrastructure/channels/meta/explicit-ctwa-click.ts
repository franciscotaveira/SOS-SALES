/** Accept only an explicit provider click ID, never encoded conversion signals or message text. */
export function explicitCtwaClick(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const envelope = raw as Record<string, any>;
  const message = envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : envelope;
  const candidates = [message.referral?.ctwa_clid, message._data?.referral?.ctwa_clid,
    message._data?.ctwaContext?.ctwa_clid];
  return candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? null;
}
