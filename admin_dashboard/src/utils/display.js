export function cleanDisplayText(value, fallback = '-') {
  if (value === undefined || value === null) return fallback;

  const normalized = String(value)
    .replace(/\bundefined\b/gi, '-')
    .replace(/\bnull\b/gi, '-')
    .replace(/\s+/g, ' ')
    .replace(/-\s*-+/g, '-')
    .trim();

  if (!normalized) return fallback;
  if (normalized === '-' || normalized === '--') return fallback;

  return normalized;
}