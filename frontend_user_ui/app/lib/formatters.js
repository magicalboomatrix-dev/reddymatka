const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
  processing: 'Processing',
  win: 'Win',
  loss: 'Loss',
  success: 'Success',
  failed: 'Failed',
  cancelled: 'Cancelled',
  settled: 'Settled',
};

const BET_TYPE_LABELS = {
  jodi: 'Jodi',
  haruf_andar: 'Haruf Andar',
  haruf_bahar: 'Haruf Bahar',
  crossing: 'Crossing',
  single_digit: 'Single Digit',
};

export function formatEnumLabel(value, fallback = '-') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const normalized = String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatStatusLabel(value, fallback = '-') {
  if (!value) {
    return fallback;
  }

  return STATUS_LABELS[value] || formatEnumLabel(value, fallback);
}

export function formatBetType(value, fallback = '-') {
  if (!value) {
    return fallback;
  }

  return BET_TYPE_LABELS[value] || formatEnumLabel(value, fallback);
}

export function formatApprovalRole(value, fallback = '-') {
  if (!value) {
    return fallback;
  }

  if (value === 'admin') {
    return 'Admin';
  }

  if (value === 'moderator') {
    return 'Moderator';
  }

  return formatEnumLabel(value, fallback);
}
