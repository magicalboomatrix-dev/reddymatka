import { useState, useEffect, useRef } from 'react';
import api, { buildUploadUrl } from '../utils/api';
import { useToast, ToastContainer, useConfirm, ConfirmModal } from '../components/ui';

const EMPTY_FORM = {
  title: '',
  description_en: '',
  description_hi: '',
  display_order: 0,
};

export default function HowToPlay() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVideo, setEditingVideo] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [videoFile, setVideoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const { toasts, success, error: toastError, dismiss } = useToast();
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  useEffect(() => { loadVideos(); }, []);

  const loadVideos = async () => {
    setLoading(true);
    try {
      const res = await api.get('/how-to-play/admin/all');
      setVideos(res.data.videos || []);
    } catch {
      toastError('Failed to load videos.');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingVideo(null);
    setForm(EMPTY_FORM);
    setVideoFile(null);
    setError('');
    setShowModal(true);
  };

  const openEdit = (v) => {
    setEditingVideo(v);
    setForm({
      title: v.title || '',
      description_en: v.description_en || '',
      description_hi: v.description_hi || '',
      display_order: v.display_order ?? 0,
    });
    setVideoFile(null);
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!editingVideo && !videoFile) { setError('Please select a video file.'); return; }

    setSaving(true);
    setError('');
    try {
      const data = new FormData();
      data.append('title', form.title.trim());
      data.append('description_en', form.description_en.trim());
      data.append('description_hi', form.description_hi.trim());
      data.append('display_order', form.display_order);
      if (videoFile) data.append('video', videoFile);

      if (editingVideo) {
        await api.put(`/how-to-play/admin/${editingVideo.id}`, data, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        success('Video updated successfully.');
      } else {
        await api.post('/how-to-play/admin', data, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        success('Video uploaded successfully.');
      }
      setShowModal(false);
      loadVideos();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (v) => {
    try {
      await api.patch(`/how-to-play/admin/${v.id}/toggle`);
      success(`Video ${v.is_active ? 'deactivated' : 'activated'}.`);
      loadVideos();
    } catch {
      toastError('Failed to toggle video.');
    }
  };

  const handleDelete = async (v) => {
    const ok = await confirm(`Delete "${v.title}"? This cannot be undone.`);
    if (!ok) return;
    try {
      await api.delete(`/how-to-play/admin/${v.id}`);
      success('Video deleted.');
      loadVideos();
    } catch {
      toastError('Failed to delete video.');
    }
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark-900">How To Play — Videos</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors">
          + Upload Video
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400">Loading…</div>
      ) : videos.length === 0 ? (
        <div className="py-16 text-center border border-dashed text-gray-400">
          No videos yet. Click "Upload Video" to add the first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {videos.map((v) => (
            <div key={v.id} className={`bg-white border rounded-lg overflow-hidden shadow-sm flex flex-col ${!v.is_active ? 'opacity-50' : ''}`}>
              {/* Video preview */}
              <div className="bg-black aspect-video flex items-center justify-center">
                {v.video_path ? (
                  <video
                    src={buildUploadUrl(v.video_path)}
                    className="w-full h-full object-contain"
                    controls
                    preload="metadata"
                  />
                ) : (
                  <span className="text-gray-500 text-sm">No video</span>
                )}
              </div>

              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug">{v.title}</h3>
                  <span className={`shrink-0 px-2 py-0.5 text-xs rounded font-medium ${v.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {v.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {v.description_en && (
                  <p className="text-xs text-gray-500 line-clamp-2">{v.description_en}</p>
                )}
                {v.description_hi && (
                  <p className="text-xs text-gray-500 line-clamp-2 font-medium">{v.description_hi}</p>
                )}

                <p className="text-xs text-gray-400 mt-auto">Order: {v.display_order}</p>

                <div className="flex gap-2 pt-2 border-t">
                  <button onClick={() => openEdit(v)} className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                    Edit
                  </button>
                  <button onClick={() => handleToggle(v)} className={`flex-1 px-3 py-1.5 text-xs rounded ${v.is_active ? 'bg-yellow-500 text-white hover:bg-yellow-600' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                    {v.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => handleDelete(v)} className="flex-1 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-lg mx-4 rounded-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-lg text-dark-900">{editingVideo ? 'Edit Video' : 'Upload Video'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="p-6 space-y-4">
              {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">{error}</div>}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full border px-3 py-2 text-sm rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., How to place a Jodi bet"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Description (English)</label>
                <textarea
                  rows={3}
                  value={form.description_en}
                  onChange={e => setForm(p => ({ ...p, description_en: e.target.value }))}
                  className="w-full border px-3 py-2 text-sm rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Step-by-step instructions in English"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Description (हिन्दी)</label>
                <textarea
                  rows={3}
                  value={form.description_hi}
                  onChange={e => setForm(p => ({ ...p, description_hi: e.target.value }))}
                  className="w-full border px-3 py-2 text-sm rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="हिन्दी में निर्देश"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Display Order</label>
                <input
                  type="number"
                  value={form.display_order}
                  onChange={e => setForm(p => ({ ...p, display_order: e.target.value }))}
                  className="w-full border px-3 py-2 text-sm rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                  min={0}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Video File {editingVideo ? '(leave blank to keep existing)' : '*'}
                </label>
                <div
                  className="border-2 border-dashed border-gray-300 rounded p-4 text-center cursor-pointer hover:border-primary-400 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {videoFile ? (
                    <p className="text-sm text-green-700 font-medium">{videoFile.name}</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500">Click to select video</p>
                      <p className="text-xs text-gray-400 mt-1">MP4, WebM, MOV — max 200 MB</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/ogg,video/quicktime"
                  className="hidden"
                  onChange={e => setVideoFile(e.target.files[0] || null)}
                />
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 text-sm border rounded hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : editingVideo ? 'Save Changes' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
