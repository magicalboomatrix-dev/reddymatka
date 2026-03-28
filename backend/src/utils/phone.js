function normalizePhone(rawPhone) {
  const sanitized = String(rawPhone || '').trim().replace(/[\s()-]/g, '');

  if (!/^\+[1-9]\d{7,14}$/.test(sanitized)) {
    return null;
  }

  return sanitized;
}

function getPhoneCandidates(rawPhone) {
  const sanitized = String(rawPhone || '').trim().replace(/[\s()-]/g, '');
  if (!sanitized) {
    return [];
  }

  const candidates = [];

  if (/^\+[1-9]\d{7,14}$/.test(sanitized)) {
    candidates.push(sanitized);
    if (/^\+91\d{10}$/.test(sanitized)) {
      candidates.push(sanitized.slice(3));
    }
    return [...new Set(candidates)];
  }

  if (/^\d{10}$/.test(sanitized)) {
    candidates.push(sanitized, `+91${sanitized}`);
    return [...new Set(candidates)];
  }

  if (/^91\d{10}$/.test(sanitized)) {
    const local = sanitized.slice(2);
    candidates.push(local, `+${sanitized}`);
    return [...new Set(candidates)];
  }

  return [];
}

function toE164Phone(rawPhone) {
  const sanitized = String(rawPhone || '').trim().replace(/[\s()-]/g, '');

  if (/^\+[1-9]\d{7,14}$/.test(sanitized)) {
    return sanitized;
  }

  if (/^\d{10}$/.test(sanitized)) {
    return `+91${sanitized}`;
  }

  if (/^91\d{10}$/.test(sanitized)) {
    return `+${sanitized}`;
  }

  return null;
}

module.exports = {
  normalizePhone,
  getPhoneCandidates,
  toE164Phone,
};