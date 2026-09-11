/** Parse one amount only. Ambiguous/free-form ranges are not executable prices. */
export function moneyMinor(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value*100)) ? Math.round(value*100) : undefined;
  if (typeof value !== 'string') return undefined;
  let text=value.trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
  if (!/^\d+(?:[.,]\d+)*$/.test(text)) return undefined;
  if (text.includes(',')) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(text)) return undefined;
    text=text.replace(/\./g,'').replace(',','.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) text=text.replace(/\./g,'');
  else if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return undefined;
  const amount=Number(text)*100;
  return Number.isFinite(amount) && Number.isSafeInteger(Math.round(amount)) ? Math.round(amount) : undefined;
}

