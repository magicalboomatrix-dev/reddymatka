import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { buildUploadUrl } from '../utils/api';

const EXACT_PROVIDER_LABELS = {
  paytm: 'Paytm',
  ppay: 'PhonePe',
  ybl: 'PhonePe',
  ibl: 'PhonePe',
  pbhim: 'PhonePe BHIM',
  axl: 'Amazon Pay',
  apl: 'Amazon Pay',
  amazonpay: 'Amazon Pay',
  okaxis: 'Google Pay Axis',
  oksbi: 'Google Pay SBI',
  okhdfcbank: 'Google Pay HDFC',
  okicici: 'Google Pay ICICI',
  okkotak: 'Google Pay Kotak',
  okyesbank: 'Google Pay Yes Bank',
  okindus: 'Google Pay IndusInd',
  okbizaxis: 'Google Pay Axis Biz',
  okbizicici: 'Google Pay ICICI Biz',
  gpay: 'Google Pay',
  airtel: 'Airtel Payments Bank',
  airtelpaymentsbank: 'Airtel Payments Bank',
  freecharge: 'Freecharge',
  fam: 'FamPay',
  jio: 'Jio Payments Bank',
  jiopay: 'Jio Payments Bank',
  kotak: 'Kotak Mahindra Bank',
  hdfcbank: 'HDFC Bank',
  icici: 'ICICI Bank',
  icicibank: 'ICICI Bank',
  axisbank: 'Axis Bank',
  sbi: 'State Bank of India',
  sbin: 'State Bank of India',
  yesbank: 'Yes Bank',
  yesbankltd: 'Yes Bank',
  unionbank: 'Union Bank of India',
  barodampay: 'Bank of Baroda',
  bob: 'Bank of Baroda',
  pnb: 'Punjab National Bank',
  canarabank: 'Canara Bank',
  indus: 'IndusInd Bank',
  idfcfirstbank: 'IDFC First Bank',
  federal: 'Federal Bank',
  hsbc: 'HSBC',
  slice: 'Slice',
  superyes: 'Super Money',
  naviaxis: 'Navi Axis',
  timecosmos: 'Timepay Cosmos',
  waaxis: 'WhatsApp Pay Axis',
};

const PROVIDER_RULES = [
  { test: (handle) => handle.startsWith('ok'), label: 'Google Pay' },
  { test: (handle) => handle.includes('paytm'), label: 'Paytm' },
  { test: (handle) => handle.includes('phonepe') || handle.endsWith('ybl') || handle.endsWith('ibl'), label: 'PhonePe' },
  { test: (handle) => handle.includes('amazon') || handle.endsWith('axl') || handle.endsWith('apl'), label: 'Amazon Pay' },
  { test: (handle) => handle.includes('airtel'), label: 'Airtel Payments Bank' },
  { test: (handle) => handle.includes('freecharge'), label: 'Freecharge' },
  { test: (handle) => handle.includes('jio'), label: 'Jio Payments Bank' },
  { test: (handle) => handle.includes('fampay') || handle === 'fam', label: 'FamPay' },
  { test: (handle) => handle.includes('axis'), label: 'Axis Bank' },
  { test: (handle) => handle.includes('hdfc'), label: 'HDFC Bank' },
  { test: (handle) => handle.includes('icici'), label: 'ICICI Bank' },
  { test: (handle) => handle.includes('sbi'), label: 'State Bank of India' },
  { test: (handle) => handle.includes('kotak'), label: 'Kotak Mahindra Bank' },
  { test: (handle) => handle.includes('yesbank') || handle.includes('yes'), label: 'Yes Bank' },
  { test: (handle) => handle.includes('unionbank') || handle.includes('ubi'), label: 'Union Bank of India' },
  { test: (handle) => handle.includes('baroda') || handle.includes('bob'), label: 'Bank of Baroda' },
  { test: (handle) => handle.includes('pnb'), label: 'Punjab National Bank' },
  { test: (handle) => handle.includes('canara'), label: 'Canara Bank' },
  { test: (handle) => handle.includes('indus'), label: 'IndusInd Bank' },
  { test: (handle) => handle.includes('idfc'), label: 'IDFC First Bank' },
  { test: (handle) => handle.includes('federal'), label: 'Federal Bank' },
  { test: (handle) => handle.includes('hsbc'), label: 'HSBC' },
  { test: (handle) => handle.includes('whatsapp') || handle.startsWith('wa'), label: 'WhatsApp Pay' },
  { test: (handle) => handle.includes('slice'), label: 'Slice' },
  { test: (handle) => handle.includes('super'), label: 'Super Money' },
  { test: (handle) => handle.includes('navi'), label: 'Navi' },
];

function detectUpiProvider(handle) {
  const normalizedHandle = String(handle || '').trim().toLowerCase();

  if (!normalizedHandle) {
    return '';
  }

  if (EXACT_PROVIDER_LABELS[normalizedHandle]) {
    return EXACT_PROVIDER_LABELS[normalizedHandle];
  }

  const matchedRule = PROVIDER_RULES.find((rule) => rule.test(normalizedHandle));
  if (matchedRule) {
    return matchedRule.label;
  }

  return normalizedHandle.toUpperCase();
}

function cleanupPreviewUrl(previewUrl) {
  if (previewUrl && previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl);
  }
}

function createDraft(moderator, currentDraft) {
  return {
    scanner_label: currentDraft?.scanner_label ?? (moderator.scanner_label || ''),
    upi_id: currentDraft?.upi_id ?? (moderator.upi_id || ''),
    scanner_enabled: currentDraft?.scanner_enabled ?? Boolean(moderator.scanner_enabled),
    qr_code_image: currentDraft?.qr_code_image ?? null,
    qr_preview_url: currentDraft?.qr_preview_url ?? '',
  };
}

function normalizeText(value) {
  return String(value || '').trim();
}

function validateUpiId(upiId) {
  const value = normalizeText(upiId);

  if (!value) {
    return { isValid: true, message: '' };
  }

  if (!value.includes('@')) {
    return { isValid: false, message: 'UPI ID must include @handle.' };
  }

  const [username = '', handle = '', ...extra] = value.split('@');

  if (!username || !handle || extra.length > 0) {
    return { isValid: false, message: 'UPI ID must be in the format name@provider.' };
  }

  if (!/^[a-zA-Z0-9._-]{2,}$/.test(username)) {
    return { isValid: false, message: 'UPI user part contains invalid characters.' };
  }

  if (!/^[a-zA-Z0-9.-]{2,}$/.test(handle)) {
    return { isValid: false, message: 'UPI handle contains invalid characters.' };
  }

  return { isValid: true, message: '' };
}

function validateScannerLabel(scannerLabel) {
  const value = normalizeText(scannerLabel);

  if (!value) {
    return { isValid: true, message: '' };
  }

  if (value.length < 3) {
    return { isValid: false, message: 'Scanner label must be at least 3 characters long.' };
  }

  if (value.length > 100) {
    return { isValid: false, message: 'Scanner label must be 100 characters or less.' };
  }

  if (!/^[a-zA-Z0-9 ._()\-&/]+$/.test(value)) {
    return { isValid: false, message: 'Scanner label contains invalid characters.' };
  }

  return { isValid: true, message: '' };
}

function validateQrRequirement({ scannerEnabled, existingQrCodeImage, nextQrCodeImage }) {
  if (!scannerEnabled) {
    return { isValid: true, message: '' };
  }

  if (existingQrCodeImage || nextQrCodeImage instanceof File) {
    return { isValid: true, message: '' };
  }

  return { isValid: false, message: 'QR code image is required when scanner is enabled.' };
}

function isDraftDirty(moderator, draft) {
  if (!draft) {
    return false;
  }

  return normalizeText(draft.scanner_label) !== normalizeText(moderator.scanner_label)
    || normalizeText(draft.upi_id) !== normalizeText(moderator.upi_id)
    || Boolean(draft.scanner_enabled) !== Boolean(moderator.scanner_enabled)
    || draft.qr_code_image instanceof File;
}

function parseUpiDetails(upiId) {
  const value = String(upiId || '').trim();

  if (!value) {
    return {
      full: '',
      username: '',
      handle: '',
      isValid: false,
    };
  }

  const [username = '', handle = ''] = value.split('@');
  const normalizedHandle = handle.toLowerCase();

  return {
    full: value,
    username,
    handle,
    provider: detectUpiProvider(normalizedHandle),
    isValid: Boolean(username && handle),
  };
}

function getFileName(filePath) {
  if (!filePath) {
    return '';
  }

  return String(filePath).split('/').pop() || filePath;
}

export default function ModeratorScanners() {
  const [moderators, setModerators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [feedback, setFeedback] = useState({});
  const [activeFilters, setActiveFilters] = useState([]);
  const draftsRef = useRef({});
  const labelInputRefs = useRef({});
  const upiInputRefs = useRef({});
  const qrInputRefs = useRef({});

  const loadModerators = async () => {
    setLoading(true);
    try {
      const res = await api.get('/moderators');
      setModerators(Array.isArray(res.data.moderators) ? res.data.moderators : []);
    } catch (error) {
      console.error(error);
      setModerators([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModerators();
  }, []);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };

      moderators.forEach((moderator) => {
        next[moderator.id] = createDraft(moderator, current[moderator.id]);
      });

      return next;
    });
  }, [moderators]);

  useEffect(() => () => {
    Object.values(draftsRef.current).forEach((draft) => cleanupPreviewUrl(draft?.qr_preview_url));
  }, []);

  const filteredModerators = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return moderators.filter((moderator) => {
      const upi = parseUpiDetails(moderator.upi_id);
      const matchesSearch = !keyword || [
        moderator.name,
        moderator.phone,
        moderator.referral_code,
        moderator.scanner_label,
        upi.full,
        upi.username,
        upi.handle,
      ].some((value) => String(value || '').toLowerCase().includes(keyword));

      if (!matchesSearch) {
        return false;
      }

      return activeFilters.every((filter) => {
        if (filter === 'no-upi') {
          return !normalizeText(moderator.upi_id);
        }

        if (filter === 'no-qr') {
          return !normalizeText(moderator.qr_code_image);
        }

        if (filter === 'disabled') {
          return !moderator.scanner_enabled;
        }

        return true;
      });
    });
  }, [activeFilters, moderators, query]);

  const summary = useMemo(() => ({
    total: moderators.length,
    active: moderators.filter((moderator) => moderator.scanner_enabled).length,
    withUpi: moderators.filter((moderator) => moderator.upi_id).length,
    withQr: moderators.filter((moderator) => moderator.qr_code_image).length,
  }), [moderators]);

  const unsavedCount = useMemo(
    () => moderators.filter((moderator) => isDraftDirty(moderator, drafts[moderator.id] || createDraft(moderator))).length,
    [drafts, moderators]
  );

  const filterChips = [
    { key: 'no-upi', label: 'No UPI', count: moderators.filter((moderator) => !normalizeText(moderator.upi_id)).length },
    { key: 'no-qr', label: 'No QR', count: moderators.filter((moderator) => !normalizeText(moderator.qr_code_image)).length },
    { key: 'disabled', label: 'Disabled Scanner', count: moderators.filter((moderator) => !moderator.scanner_enabled).length },
  ];

  const setDraftField = (moderatorId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [moderatorId]: {
        ...(current[moderatorId] || {}),
        [field]: value,
      },
    }));
  };

  const selectQrFile = (moderatorId, file) => {
    setDrafts((current) => {
      const existing = current[moderatorId] || {};
      cleanupPreviewUrl(existing.qr_preview_url);

      return {
        ...current,
        [moderatorId]: {
          ...existing,
          qr_code_image: file || null,
          qr_preview_url: file ? URL.createObjectURL(file) : '',
        },
      };
    });
  };

  const resetDraft = (moderator) => {
    setDrafts((current) => {
      const existing = current[moderator.id] || {};
      cleanupPreviewUrl(existing.qr_preview_url);

      return {
        ...current,
        [moderator.id]: createDraft(moderator),
      };
    });
    setFeedback((current) => ({
      ...current,
      [moderator.id]: 'Changes reset',
    }));
  };

  const toggleFilter = (filterKey) => {
    setActiveFilters((current) => (
      current.includes(filterKey)
        ? current.filter((value) => value !== filterKey)
        : [...current, filterKey]
    ));
  };

  const copyText = async (moderatorId, label, value) => {
    if (!value) {
      setFeedback((current) => ({
        ...current,
        [moderatorId]: `${label} is not available`,
      }));
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setFeedback((current) => ({
        ...current,
        [moderatorId]: `${label} copied`,
      }));
    } catch (error) {
      setFeedback((current) => ({
        ...current,
        [moderatorId]: `Failed to copy ${label.toLowerCase()}`,
      }));
    }
  };

  const saveScanner = async (moderatorId) => {
    const draft = drafts[moderatorId] || {};
    const labelValidation = validateScannerLabel(draft.scanner_label);
    const validation = validateUpiId(draft.upi_id);
    const qrValidation = validateQrRequirement({
      scannerEnabled: draft.scanner_enabled,
      existingQrCodeImage: moderators.find((moderator) => moderator.id === moderatorId)?.qr_code_image,
      nextQrCodeImage: draft.qr_code_image,
    });

    if (!labelValidation.isValid) {
      const input = labelInputRefs.current[moderatorId];
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setFeedback((current) => ({
        ...current,
        [moderatorId]: labelValidation.message,
      }));
      return;
    }

    if (!validation.isValid) {
      const input = upiInputRefs.current[moderatorId];
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setFeedback((current) => ({
        ...current,
        [moderatorId]: validation.message,
      }));
      return;
    }

    if (!qrValidation.isValid) {
      const input = qrInputRefs.current[moderatorId];
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setFeedback((current) => ({
        ...current,
        [moderatorId]: qrValidation.message,
      }));
      return;
    }

    const formData = new FormData();
    formData.append('scanner_label', draft.scanner_label || '');
    formData.append('upi_id', draft.upi_id || '');
    formData.append('scanner_enabled', draft.scanner_enabled ? '1' : '0');

    if (draft.qr_code_image instanceof File) {
      formData.append('qr_code_image', draft.qr_code_image);
    }

    try {
      setSavingId(moderatorId);
      await api.put(`/moderators/${moderatorId}/scanner`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFeedback((current) => ({
        ...current,
        [moderatorId]: 'Scanner updated',
      }));
      setDrafts((current) => {
        const existing = current[moderatorId] || {};
        cleanupPreviewUrl(existing.qr_preview_url);

        return {
          ...current,
          [moderatorId]: {
            ...existing,
            qr_code_image: null,
            qr_preview_url: '',
          },
        };
      });
      await loadModerators();
    } catch (error) {
      setFeedback((current) => ({
        ...current,
        [moderatorId]: error.response?.data?.error || 'Failed to update scanner',
      }));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">Moderator Scanners</h3>
          <p className="text-sm text-gray-500 mt-1">UPI IDs, QR uploads, scanner status, and direct drilldown to moderator details.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/moderators" className="px-4 py-2 bg-white border hover:bg-gray-50 text-sm font-medium text-gray-700">Moderators</Link>
          <Link to="/moderator-floats" className="px-4 py-2 bg-white border hover:bg-gray-50 text-sm font-medium text-gray-700">Float Table</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Total Moderators</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{summary.total}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">Active Scanners</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{summary.active}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">UPI Configured</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{summary.withUpi}</p>
        </div>
        <div className="bg-white border p-5">
          <p className="text-sm text-gray-500">QR Uploaded</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{summary.withQr}</p>
        </div>
      </div>

      <div className="bg-white border p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-gray-800">Unsaved Scanner Changes</p>
          <p className="text-xs text-gray-500">Rows with pending scanner label, UPI, status, or QR edits.</p>
        </div>
        <div className={`px-3 py-1.5 text-sm font-semibold ${unsavedCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
          {unsavedCount} row{unsavedCount === 1 ? '' : 's'} pending
        </div>
      </div>

      <div className="bg-white border p-4">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search moderator, phone, referral, UPI, or scanner label"
          className="w-full px-4 py-2 border"
        />
        <div className="flex flex-wrap gap-2 mt-3">
          {filterChips.map((chip) => {
            const active = activeFilters.includes(chip.key);

            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => toggleFilter(chip.key)}
                className={`px-3 py-1.5 text-xs font-medium border ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                {chip.label} ({chip.count})
              </button>
            );
          })}
          {activeFilters.length > 0 ? (
            <button
              type="button"
              onClick={() => setActiveFilters([])}
              className="px-3 py-1.5 text-xs font-medium border bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            >
              Clear Filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="bg-white border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Moderator</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">UPI Details</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">QR Details</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Edit Scanner</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredModerators.map((moderator) => {
              const upi = parseUpiDetails(moderator.upi_id);
              const qrFileName = getFileName(moderator.qr_code_image);
              const draft = drafts[moderator.id] || createDraft(moderator);
              const qrUrl = buildUploadUrl(moderator.qr_code_image);
              const selectedFileName = draft.qr_code_image instanceof File ? draft.qr_code_image.name : '';
              const previewUrl = draft.qr_preview_url || qrUrl;
              const dirty = isDraftDirty(moderator, draft);
              const upiValidation = validateUpiId(draft.upi_id);
              const labelValidation = validateScannerLabel(draft.scanner_label);
              const qrValidation = validateQrRequirement({
                scannerEnabled: draft.scanner_enabled,
                existingQrCodeImage: moderator.qr_code_image,
                nextQrCodeImage: draft.qr_code_image,
              });
              const severityBadges = [
                !normalizeText(moderator.upi_id) ? { label: 'No UPI', className: 'bg-red-100 text-red-800' } : null,
                !normalizeText(moderator.qr_code_image) ? { label: 'No QR', className: 'bg-amber-100 text-amber-800' } : null,
                !moderator.scanner_enabled ? { label: 'Disabled', className: 'bg-slate-200 text-slate-800' } : null,
              ].filter(Boolean);

              return (
                <tr key={moderator.id} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium text-gray-800">{moderator.name}</div>
                      {dirty ? <span className="px-2 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-800">Unsaved</span> : null}
                    </div>
                    <div className="text-xs text-gray-500">{moderator.phone}</div>
                    <div className="text-xs text-gray-500">{moderator.referral_code}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {severityBadges.map((badge) => (
                        <span key={badge.label} className={`px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2">
                      <span className={`px-2 py-1 text-xs font-medium ${moderator.scanner_enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {moderator.scanner_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 min-w-[220px]">
                    <div className="space-y-1">
                      <div className="font-mono text-gray-700 break-all">{upi.full || '-'}</div>
                      <div><span className="font-medium text-gray-800">User:</span> {upi.username || '-'}</div>
                      <div><span className="font-medium text-gray-800">Handle:</span> {upi.handle || '-'}</div>
                      <div><span className="font-medium text-gray-800">Provider:</span> {upi.provider || '-'}</div>
                      <div><span className="font-medium text-gray-800">Format:</span> {upi.isValid ? 'Valid' : 'Missing or invalid'}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(moderator.id, 'UPI ID', upi.full)}
                      className="mt-2 px-3 py-1 border text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Copy UPI
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 min-w-[220px]">
                    {previewUrl ? (
                      <div className="flex items-start gap-3">
                        <img src={previewUrl} alt={`${moderator.name} QR`} className="h-16 w-16 border object-contain bg-white p-1 shrink-0" />
                        <div className="space-y-1">
                          <div><span className="font-medium text-gray-800">File:</span> {selectedFileName || qrFileName || '-'}</div>
                          <div className="break-all"><span className="font-medium text-gray-800">Path:</span> {selectedFileName ? 'Pending new upload' : (moderator.qr_code_image || '-')}</div>
                          {qrUrl ? <a href={qrUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-block">Open saved QR</a> : null}
                          {selectedFileName ? <div className="text-amber-700">Previewing unsaved QR</div> : null}
                          <button
                            type="button"
                            onClick={() => copyText(moderator.id, 'QR link', qrUrl)}
                            className="block px-3 py-1 border text-xs text-gray-700 hover:bg-gray-50"
                          >
                            Copy QR Link
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <span className="text-gray-400 block">No QR uploaded</span>
                        <button
                          type="button"
                          onClick={() => copyText(moderator.id, 'QR link', '')}
                          className="px-3 py-1 border text-xs text-gray-700 hover:bg-gray-50"
                        >
                          Copy QR Link
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 min-w-[320px]">
                    <div className="space-y-2">
                      <input
                        ref={(element) => {
                          labelInputRefs.current[moderator.id] = element;
                        }}
                        type="text"
                        value={draft.scanner_label}
                        onChange={(event) => setDraftField(moderator.id, 'scanner_label', event.target.value)}
                        placeholder="Scanner label"
                        className={`w-full px-3 py-2 border text-xs ${labelValidation.isValid ? '' : 'border-red-300 bg-red-50'}`}
                      />
                      {!labelValidation.isValid ? (
                        <div className="text-[11px] text-red-600">{labelValidation.message}</div>
                      ) : null}
                      <input
                        ref={(element) => {
                          upiInputRefs.current[moderator.id] = element;
                        }}
                        type="text"
                        value={draft.upi_id}
                        onChange={(event) => setDraftField(moderator.id, 'upi_id', event.target.value)}
                        placeholder="UPI ID"
                        className={`w-full px-3 py-2 border text-xs ${upiValidation.isValid ? '' : 'border-red-300 bg-red-50'}`}
                      />
                      {!upiValidation.isValid ? (
                        <div className="text-[11px] text-red-600">{upiValidation.message}</div>
                      ) : null}
                      <label className="flex items-center gap-2 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={draft.scanner_enabled}
                          onChange={(event) => setDraftField(moderator.id, 'scanner_enabled', event.target.checked)}
                        />
                        Scanner Enabled
                      </label>
                      <input
                        type="file"
                        ref={(element) => {
                          qrInputRefs.current[moderator.id] = element;
                        }}
                        accept="image/*"
                        onChange={(event) => selectQrFile(moderator.id, event.target.files?.[0] || null)}
                        className="block w-full text-xs text-gray-500"
                      />
                      <div className="text-[11px] text-gray-500">
                        {selectedFileName ? `Selected file: ${selectedFileName}` : 'Leave empty to keep the current QR image'}
                      </div>
                      {!qrValidation.isValid ? (
                        <div className="text-[11px] text-red-600">{qrValidation.message}</div>
                      ) : null}
                      {feedback[moderator.id] ? (
                        <div className="text-[11px] text-gray-600">{feedback[moderator.id]}</div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={savingId === moderator.id || !upiValidation.isValid || !labelValidation.isValid || !qrValidation.isValid}
                        onClick={() => saveScanner(moderator.id)}
                        className="px-3 py-1 bg-emerald-600 text-white text-xs hover:bg-emerald-700 inline-block disabled:opacity-50"
                      >
                        {savingId === moderator.id ? 'Saving...' : 'Save'}
                      </button>
                      <div>
                        <button
                          type="button"
                          disabled={savingId === moderator.id}
                          onClick={() => resetDraft(moderator)}
                          className="px-3 py-1 border text-gray-700 text-xs hover:bg-gray-50 disabled:opacity-50 inline-block"
                        >
                          Reset
                        </button>
                      </div>
                      <div>
                        <Link
                          to={`/moderators/${moderator.id}`}
                          className="px-3 py-1 bg-blue-600 text-white text-xs hover:bg-blue-700 inline-block"
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredModerators.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">{loading ? 'Loading scanners...' : 'No moderator scanners found'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}