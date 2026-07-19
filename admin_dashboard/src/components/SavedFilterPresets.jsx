import { useEffect, useMemo, useState } from 'react';

function getStorageKey(storageKey) {
  return `admin_saved_filters:${storageKey}`;
}

export default function SavedFilterPresets({ storageKey, currentFilters, onApply }) {
  const resolvedStorageKey = useMemo(() => getStorageKey(storageKey), [storageKey]);
  const [presets, setPresets] = useState([]);
  const [name, setName] = useState('');

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(resolvedStorageKey) || '[]');
      setPresets(Array.isArray(stored) ? stored : []);
    } catch {
      setPresets([]);
    }
  }, [resolvedStorageKey]);

  const persist = (nextPresets) => {
    setPresets(nextPresets);
    window.localStorage.setItem(resolvedStorageKey, JSON.stringify(nextPresets));
  };

  const saveCurrent = () => {
    const label = name.trim();
    if (!label) return;
    const nextPresets = [
      { id: `${Date.now()}`, label, filters: currentFilters },
      ...presets.filter((preset) => preset.label !== label),
    ].slice(0, 8);
    persist(nextPresets);
    setName('');
  };

  const removePreset = (presetId) => {
    persist(presets.filter((preset) => preset.id !== presetId));
  };

  return (
    <div className="flex flex-col gap-3 rounded border border-dashed border-gray-200 bg-gray-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Saved Filters</span>
        {presets.map((preset) => (
          <div key={preset.id} className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs">
            <button type="button" onClick={() => onApply(preset.filters)} className="text-blue-600 hover:underline">
              {preset.label}
            </button>
            <button type="button" onClick={() => removePreset(preset.id)} className="text-gray-400 hover:text-red-600">
              ×
            </button>
          </div>
        ))}
        {presets.length === 0 ? <span className="text-xs text-gray-400">No saved presets yet.</span> : null}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Preset name"
          className="w-36 border bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button type="button" onClick={saveCurrent} className="px-3 py-2 bg-primary-600 text-white text-xs font-medium hover:bg-primary-700">
          Save Current
        </button>
      </div>
    </div>
  );
}