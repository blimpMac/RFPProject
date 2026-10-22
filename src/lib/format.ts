export const php = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
export const manilaDate = (value?: string | null, withTime = false) =>
  value
    ? new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
      }).format(new Date(value))
    : '—';
export const labelize = (key: string) =>
  key
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace('Rfp', 'RFP');
export const statusTone = (status?: string) => {
  const s = (status || '').toLowerCase();
  return s.includes('reject') || s.includes('returned')
    ? 'rejected'
    : s.includes('approved') || s.includes('released') || s === 'paid'
      ? 'approved'
      : s.includes('pending') || s.includes('awaiting') || s === 'processing'
        ? 'pending'
        : 'neutral';
};
