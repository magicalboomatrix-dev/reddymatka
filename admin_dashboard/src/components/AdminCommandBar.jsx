import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

export default function AdminCommandBar() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const activeTag = document.activeElement?.tagName;
      const isTypingContext = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        return;
      }

      if (!isTypingContext && event.key === '/') {
        event.preventDefault();
        setOpen(true);
      }

      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get('/admin/global-search', { params: { q: query.trim() } });
        setResults(Array.isArray(res.data.sections) ? res.data.sections : []);
      } catch (error) {
        console.error(error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [open, query]);

  const resultCount = useMemo(
    () => results.reduce((count, section) => count + (section.items?.length || 0), 0),
    [results]
  );

  const handleOpen = () => setOpen(true);

  const handleNavigate = (path) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="hidden md:flex items-center justify-between gap-3 w-full max-w-xl rounded border border-gray-300 bg-gray-50 px-4 py-2 text-left text-sm text-gray-500 hover:bg-white"
      >
        <span>Search user, moderator, UTR, withdrawal, bet, referral...</span>
        <span className="rounded border bg-white px-2 py-0.5 text-xs text-gray-400">Ctrl K</span>
      </button>

      <button
        type="button"
        onClick={handleOpen}
        className="md:hidden rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600"
      >
        Search
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] bg-black/40 px-3 py-6 sm:px-6" onClick={() => setOpen(false)}>
          <div className="mx-auto max-w-3xl rounded bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="border-b px-4 py-4 sm:px-5">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search user, moderator, UTR, withdrawal ID, bet ID, referral..."
                className="w-full border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
              />
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>Press Enter on a result or click to open the related screen.</span>
                <span>{loading ? 'Searching...' : `${resultCount} results`}</span>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-5">
              {query.trim().length < 2 ? (
                <div className="rounded border border-dashed border-gray-200 p-6 text-sm text-gray-500">
                  Search users, moderators, deposits by UTR, withdrawals, bets, and referrals from one place.
                </div>
              ) : null}

              {query.trim().length >= 2 && !loading && results.length === 0 ? (
                <div className="rounded border border-dashed border-gray-200 p-6 text-sm text-gray-500">No matches found.</div>
              ) : null}

              <div className="space-y-5">
                {results.map((section) => (
                  <div key={section.key}>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{section.label}</h4>
                    <div className="overflow-hidden rounded border">
                      {section.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleNavigate(item.path)}
                          className="flex w-full items-start justify-between gap-4 border-b px-4 py-3 text-left last:border-b-0 hover:bg-gray-50"
                        >
                          <div>
                            <div className="text-sm font-medium text-gray-800">{item.title}</div>
                            <div className="mt-1 text-xs text-gray-500">{item.subtitle}</div>
                            {item.meta ? <div className="mt-1 text-xs text-gray-400">{item.meta}</div> : null}
                          </div>
                          <span className="text-xs text-blue-600">Open</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}