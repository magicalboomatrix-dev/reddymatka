import { useEffect, useState, useRef } from 'react';
import api, { buildUploadUrl } from '../utils/api';
import { useToast, ToastContainer, useConfirm, ConfirmModal } from '../components/ui';

const EMPTY_FORM = {
  title: '',
  content: '',
  extra_text: '',
  button_text: '',
  button_link: '',
  display_order: 0,
  status: 1,
};

export default function CustomAds() {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAd, setEditingAd] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const { toasts, success, error: toastError, dismiss } = useToast();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  useEffect(() => {
    loadAds();
  }, []);

  const loadAds = async () => {
    setLoading(true);
    try {
      const res = await api.get('/custom-ads/all');
      setAds(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load custom ads:', err);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingAd(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview('');
    setError('');
    setShowModal(true);
  };

  const openEdit = (ad) => {
    setEditingAd(ad);
    setForm({
      title: ad.title || '',
      content: ad.content || '',
      extra_text: ad.extra_text || '',
      button_text: ad.button_text || '',
      button_link: ad.button_link || '',
      display_order: ad.display_order || 0,
      status: ad.status ?? 1,
    });
    setImageFile(null);
    setImagePreview(ad.image_url ? buildUploadUrl(ad.image_url) : '');
    setError('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingAd(null);
    setImageFile(null);
    setImagePreview('');
    setError('');
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (imageFile) fd.append('image', imageFile);

      if (editingAd) {
        await api.put(`/custom-ads/${editingAd.id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post('/custom-ads', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      closeModal();
      loadAds();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (ad) => {
    try {
      const res = await api.patch(`/custom-ads/${ad.id}/toggle`);
      setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, status: res.data.status } : a)));
    } catch (err) {
      toastError(err.response?.data?.error || 'Toggle failed.');
    }
  };

  const handleDelete = async (ad) => {
    const ok = await confirm(`Delete "${ad.title || 'this ad'}"? This cannot be undone.`, 'Delete Ad', 'danger');
    if (!ok) return;
    try {
      await api.delete(`/custom-ads/${ad.id}`);
      setAds((prev) => prev.filter((a) => a.id !== ad.id));
    } catch (err) {
      toastError(err.response?.data?.error || 'Delete failed.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Custom Ads</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage promotional advertisement banners shown on the user home page.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 rounded"
        >
          + New Ad
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : ads.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No custom ads yet. Create one!</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Order</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Image</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Title</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Content</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Button</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ads.map((ad) => (
                <tr key={ad.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{ad.display_order}</td>
                  <td className="px-4 py-3">
                    {ad.image_url ? (
                      <img
                        src={buildUploadUrl(ad.image_url)}
                        alt="ad"
                        className="h-12 w-20 object-cover rounded border border-gray-200"
                      />
                    ) : (
                      <span className="text-gray-400 text-xs">No image</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">{ad.title}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs">
                    <div className="truncate">{ad.content}</div>
                    {ad.extra_text && (
                      <div className="truncate text-xs text-gray-400 mt-0.5">{ad.extra_text}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {ad.button_text ? (
                      <a
                        href={ad.button_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs"
                      >
                        {ad.button_text}
                      </a>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(ad)}
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        ad.status
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {ad.status ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 space-x-2">
                    <button
                      onClick={() => openEdit(ad)}
                      className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(ad)}
                      className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingAd ? 'Edit Custom Ad' : 'Create Custom Ad'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl font-bold">
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. 🔥 सट्टा मार्केट अपडेट 🔥"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  rows={4}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="Main text content. Use line breaks for multiple lines."
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
                />
              </div>

              {/* Extra Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Extra Text</label>
                <input
                  type="text"
                  value={form.extra_text}
                  onChange={(e) => setForm({ ...form, extra_text: e.target.value })}
                  placeholder="e.g. 📊 बाजार को समझने के लिए हमारे चैनल से जुड़ें!"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Button Text & Link */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Button Text</label>
                  <input
                    type="text"
                    value={form.button_text}
                    onChange={(e) => setForm({ ...form, button_text: e.target.value })}
                    placeholder="e.g. WhatsApp"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Button / Image Link</label>
                  <input
                    type="url"
                    value={form.button_link}
                    onChange={(e) => setForm({ ...form, button_link: e.target.value })}
                    placeholder="https://wa.me/xxxxxxxxxx"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ad Image <span className="text-gray-400 font-normal">(optional — clicking image opens Button Link)</span>
                </label>
                <div className="flex items-start gap-3">
                  {imagePreview ? (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt="preview"
                        className="h-24 w-36 object-cover rounded border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={removeImage}
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-700"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="h-24 w-36 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 hover:bg-gray-50"
                    >
                      <span className="text-2xl">📷</span>
                      <span className="text-xs text-gray-500 mt-1">Upload Image</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 border border-gray-300"
                    >
                      {imagePreview ? 'Change Image' : 'Choose Image'}
                    </button>
                    {imagePreview && (
                      <button
                        type="button"
                        onClick={removeImage}
                        className="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded hover:bg-red-100 border border-red-200"
                      >
                        Remove Image
                      </button>
                    )}
                    <p className="text-xs text-gray-400">JPEG, PNG, WebP · max 5MB</p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>

              {/* Order & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    min="0"
                    value={form.display_order}
                    onChange={(e) => setForm({ ...form, display_order: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value={1}>Active (visible)</option>
                    <option value={0}>Inactive (hidden)</option>
                  </select>
                </div>
              </div>

              {/* Preview */}
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <p className="text-xs font-medium text-gray-500 mb-2">Live Preview</p>
                <div className="rounded-2xl border-4 border-dashed border-red-500 bg-gradient-to-b from-yellow-400 to-yellow-100 p-4 text-center shadow-md max-w-xs mx-auto">
                  {form.title && (
                    <p className="text-base font-black text-[#1a0000] mb-2">{form.title}</p>
                  )}
                  {form.content && (
                    <p className="text-sm font-semibold text-[#2b0000] whitespace-pre-line">{form.content}</p>
                  )}
                  {form.extra_text && (
                    <p className="mt-2 text-sm font-bold text-[#5a0000]">{form.extra_text}</p>
                  )}
                  {imagePreview && (
                    <img src={imagePreview} alt="preview" className="mt-2 mx-auto max-h-20 rounded-xl object-contain" />
                  )}
                  {!imagePreview && form.button_text && (
                    <span className="mt-3 inline-block rounded-full bg-[#1a1a1a] px-5 py-1.5 text-xs font-black uppercase text-white">
                      {form.button_text}
                    </span>
                  )}
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-medium bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingAd ? 'Save Changes' : 'Create Ad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
}

