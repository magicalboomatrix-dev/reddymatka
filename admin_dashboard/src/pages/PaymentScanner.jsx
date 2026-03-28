import { useEffect, useMemo, useRef, useState } from 'react';
import api, { buildUploadUrl } from '../utils/api';

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

export default function PaymentScanner() {
  const [scanner, setScanner] = useState(null);
  const [form, setForm] = useState({ scanner_label: '', upi_id: '', scanner_enabled: true, qr_code_image: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const labelInputRef = useRef(null);
  const upiInputRef = useRef(null);
  const qrInputRef = useRef(null);
  const upiValidation = validateUpiId(form.upi_id);
  const labelValidation = validateScannerLabel(form.scanner_label);
  const qrValidation = validateQrRequirement({
    scannerEnabled: form.scanner_enabled,
    existingQrCodeImage: scanner?.qr_code_image,
    nextQrCodeImage: form.qr_code_image,
  });

  const previewUrl = useMemo(() => {
    if (form.qr_code_image instanceof File) {
      return URL.createObjectURL(form.qr_code_image);
    }
    if (scanner?.qr_code_image) {
      return buildUploadUrl(scanner.qr_code_image);
    }
    return '';
  }, [form.qr_code_image, scanner]);

  useEffect(() => {
    return () => {
      if (form.qr_code_image instanceof File && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [form.qr_code_image, previewUrl]);

  useEffect(() => {
    const loadScanner = async () => {
      try {
        const res = await api.get('/moderator/scanner');
        const nextScanner = res.data.scanner || null;
        setScanner(nextScanner);
        setForm({
          scanner_label: nextScanner?.scanner_label || '',
          upi_id: nextScanner?.upi_id || '',
          scanner_enabled: !!nextScanner?.scanner_enabled,
          qr_code_image: null,
        });
      } catch (loadError) {
        setError(loadError.response?.data?.error || 'Failed to load scanner');
      } finally {
        setLoading(false);
      }
    };

    loadScanner();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!labelValidation.isValid) {
      labelInputRef.current?.focus();
      labelInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setError(labelValidation.message);
      return;
    }

    if (!upiValidation.isValid) {
      upiInputRef.current?.focus();
      upiInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setError(upiValidation.message);
      return;
    }

    if (!qrValidation.isValid) {
      qrInputRef.current?.focus();
      qrInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setError(qrValidation.message);
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();
      formData.append('scanner_label', form.scanner_label || '');
      formData.append('upi_id', form.upi_id || '');
      formData.append('scanner_enabled', form.scanner_enabled ? '1' : '0');
      if (form.qr_code_image) {
        formData.append('qr_code_image', form.qr_code_image);
      }

      await api.put('/moderator/scanner', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const res = await api.get('/moderator/scanner');
      const nextScanner = res.data.scanner || null;
      setScanner(nextScanner);
      setForm({
        scanner_label: nextScanner?.scanner_label || '',
        upi_id: nextScanner?.upi_id || '',
        scanner_enabled: !!nextScanner?.scanner_enabled,
        qr_code_image: null,
      });
      setMessage('Payment scanner updated.');
    } catch (saveError) {
      setError(saveError.response?.data?.error || 'Failed to update scanner');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-10 text-gray-500">Loading payment scanner...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border bg-white p-5">
          <p className="text-sm text-gray-500">Float Balance</p>
          <p className="text-2xl font-bold text-green-700 mt-1">₹{Number(scanner?.float_balance || 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="border bg-white p-5 lg:col-span-2">
          <p className="text-sm text-gray-500">Scanner Status</p>
          <p className="text-lg font-semibold mt-1 text-gray-800">{scanner?.scanner_enabled ? 'Enabled' : 'Disabled'}</p>
          <p className="text-xs text-gray-500 mt-1">Deposits are routed only when your scanner is active.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border p-6 space-y-4 max-w-3xl">
        <h3 className="text-lg font-semibold text-gray-800">Payment Scanner</h3>
        {message && <div className="p-3 bg-green-50 text-green-700 text-sm">{message}</div>}
        {error && <div className="p-3 bg-red-50 text-red-700 text-sm">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Scanner Label"
            ref={labelInputRef}
            value={form.scanner_label}
            onChange={(e) => setForm((current) => ({ ...current, scanner_label: e.target.value }))}
            className={`px-4 py-2 border focus:ring-2 focus:ring-primary-500 outline-none ${labelValidation.isValid ? '' : 'border-red-300 bg-red-50'}`}
          />
          <input
            type="text"
            placeholder="UPI ID"
            ref={upiInputRef}
            value={form.upi_id}
            onChange={(e) => setForm((current) => ({ ...current, upi_id: e.target.value }))}
            className={`px-4 py-2 border focus:ring-2 focus:ring-primary-500 outline-none ${upiValidation.isValid ? '' : 'border-red-300 bg-red-50'}`}
          />
        </div>

        {!labelValidation.isValid ? <div className="text-sm text-red-600">{labelValidation.message}</div> : null}
        {!upiValidation.isValid ? <div className="text-sm text-red-600">{upiValidation.message}</div> : null}
        {!qrValidation.isValid ? <div className="text-sm text-red-600">{qrValidation.message}</div> : null}

        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={form.scanner_enabled}
            onChange={(e) => setForm((current) => ({ ...current, scanner_enabled: e.target.checked }))}
          />
          Scanner Enabled
        </label>

        <input
          type="file"
          ref={qrInputRef}
          accept="image/*"
          onChange={(e) => setForm((current) => ({ ...current, qr_code_image: e.target.files?.[0] || null }))}
          className="block w-full text-sm text-gray-500"
        />

        {previewUrl && (
          <img src={previewUrl} alt="Scanner preview" className="h-48 w-48 border object-contain bg-white p-2" />
        )}

        <button type="submit" disabled={saving || !upiValidation.isValid || !labelValidation.isValid || !qrValidation.isValid} className="px-5 py-2 bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Scanner'}
        </button>
      </form>
    </div>
  );
}