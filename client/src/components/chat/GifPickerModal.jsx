/**
 * GifPickerModal.jsx — Web GIF picker using GIPHY API.
 *
 * Features:
 *  - Search with 400ms debounce
 *  - Trending GIFs when empty
 *  - Category chips (Trending, Reactions, Funny, Love, Animals, Sports, etc.)
 *  - 2-column masonry-style grid
 *  - Infinite scroll
 *  - Skeletons, error & empty states
 *  - "Powered by Klipy" attribution
 *
 * Props:
 *   isOpen       – boolean
 *   onClose      – () => void
 *   onSelectGif  – (gifData) => void   gifData = { gifUrl, previewUrl, title, width, height }
 *   anchorRef    – optional ref to anchor element for popover positioning
 */
import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { X, Search, RefreshCw } from 'lucide-react';
import { VirtuosoGrid } from 'react-virtuoso';
import './GifPickerStyles.css';
import FloatingPortal from './FloatingPortal';

import { gifsAPI } from '../../services/api';

const PAGE_SIZE = 18;
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
function cacheGet(k) {
  const e = _cache.get(k);
  if (!e || Date.now() - e.ts > CACHE_TTL) { _cache.delete(k); return null; }
  return e.data;
}
function cacheSet(k, v) { _cache.set(k, { data: v, ts: Date.now() }); }

async function fetchPage(query, category, offset) {
  const cacheKey = `${query || category}:${offset}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let json;
  if (query && query.trim()) {
    json = await gifsAPI.search(query.trim(), offset, PAGE_SIZE);
  } else if (category && category !== 'trending') {
    json = await gifsAPI.search(category, offset, PAGE_SIZE);
  } else {
    json = await gifsAPI.getTrending(offset, PAGE_SIZE);
  }
  
  const responseData = json.data?.data || json.data || {};
  const gifs = responseData.data || [];
  
  const total = responseData.pagination?.total_count || gifs.length;
  const count = responseData.pagination?.count || gifs.length;
  const result = { gifs, hasMore: (count > 0 && offset + count < total) };
  
  cacheSet(cacheKey, result);
  return result;
}

// ─── Categories ───────────────────────────────────────────────────────────────

const GIF_CATEGORIES = [
  { id: 'trending', label: '🔥 Trending' },
  { id: 'reactions', label: '😂 Reactions' },
  { id: 'funny', label: '🤣 Funny' },
  { id: 'love', label: '❤️ Love' },
  { id: 'animals', label: '🐶 Animals' },
  { id: 'sports', label: '⚽ Sports' },
  { id: 'movies', label: '🎬 Movies' },
  { id: 'anime', label: '✨ Anime' },
  { id: 'gaming', label: '🎮 Gaming' },
  { id: 'celebrate', label: '🎉 Celebrate' },
];

// ─── Skeleton Grid ────────────────────────────────────────────────────────────

const SKELETONS = Array.from({ length: 12 }, (_, i) => i);

function SkeletonGrid() {
  return (
    <div className="gif-picker-grid">
      {SKELETONS.map((i) => (
        <div key={i} className="gif-picker-skeleton" style={{ height: i % 3 === 0 ? 120 : i % 3 === 1 ? 90 : 140 }} />
      ))}
    </div>
  );
}

// ─── GIF Item ─────────────────────────────────────────────────────────────────

const GifItem = memo(function GifItem({ gif, onSelect }) {
  const aspectRatio = gif.width && gif.height ? gif.height / gif.width : 0.75;
  return (
    <button
      type="button"
      className="gif-picker-item"
      style={{ paddingBottom: `${aspectRatio * 100}%` }}
      onClick={() => onSelect(gif)}
      title={gif.title}
    >
      <img
        src={gif.previewUrl || gif.gifUrl}
        alt={gif.title}
        loading="lazy"
        decoding="async"
      />
    </button>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GifPickerModal({ isOpen, onClose, onSelectGif, anchorRef }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('trending');
  const [gifs, setGifs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);

  const offsetRef = useRef(0);
  const abortRef = useRef(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const loadingRef = useRef(false);

  // Debounce query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  // Load gifs when debounced query or category changes
  const loadGifs = useCallback(async (q, cat, offset) => {
    if (loadingRef.current && offset > 0) return;
    loadingRef.current = true;
    abortRef.current = false;
    setError(null);

    try {
      const result = await fetchPage(q, cat, offset);
      if (abortRef.current) return;

      if (offset === 0) {
        setGifs(result.gifs);
      } else {
        setGifs(prev => {
          const ids = new Set(prev.map(g => g.id));
          return [...prev, ...result.gifs.filter(g => !ids.has(g.id))];
        });
      }
      offsetRef.current = offset + result.gifs.length;
      setHasMore(result.hasMore);
    } catch {
      if (!abortRef.current) setError('Failed to load GIFs. Check your internet connection.');
    } finally {
      if (!abortRef.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
        loadingRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    abortRef.current = true;
    setGifs([]);
    offsetRef.current = 0;
    setHasMore(true);
    setIsLoading(true);
    loadGifs(debouncedQuery, activeCategory, 0);
  }, [debouncedQuery, activeCategory, isOpen, loadGifs]);

  // Focus on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setActiveCategory('trending');
    }
  }, [isOpen]);

  // Keyboard close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Infinite scroll
  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || isLoading) return;
    setIsLoadingMore(true);
    loadGifs(debouncedQuery, activeCategory, offsetRef.current);
  }, [hasMore, isLoadingMore, isLoading, debouncedQuery, activeCategory, loadGifs]);

  const handleSelectGif = useCallback((gif) => {
    onSelectGif({
      provider: gif.provider || 'giphy',
      providerId: gif.providerId || gif.id,
      gifUrl: gif.gifUrl,
      previewUrl: gif.previewUrl,
      title: gif.title,
      width: gif.width,
      height: gif.height
    });
    onClose();
  }, [onSelectGif, onClose]);

  const handleCategoryClick = useCallback((catId) => {
    setActiveCategory(catId);
    setQuery('');
  }, []);

  if (!isOpen) return null;

  return (
    <FloatingPortal
      anchorRef={anchorRef}
      isOpen={isOpen}
      onClose={onClose}
      position="top-start"
      offset={8}
      zIndex={1050}
      minWidth={380}
      minHeight={500}
    >
      {/* Panel */}
      <div className="gif-picker-panel" role="dialog" aria-label="GIF Picker" aria-modal="true">
        {/* Header */}
        <div className="gif-picker-header">
          <span className="gif-picker-title">Add a GIF</span>
          <button type="button" className="gif-picker-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="gif-picker-search-row">
          <div className="gif-picker-search-box">
            <Search size={14} className="gif-picker-search-icon" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GIFs..."
              className="gif-picker-search-input"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button type="button" className="gif-picker-clear" onClick={() => setQuery('')} aria-label="Clear">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Categories */}
        {!query && (
          <div className="gif-picker-categories">
            {GIF_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`gif-picker-cat-chip ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => handleCategoryClick(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        <div className="gif-picker-scroll">
          {error ? (
            <div className="gif-picker-empty">
              <span style={{ fontSize: 32 }}>😕</span>
              <p>{error}</p>
              <button
                type="button"
                className="gif-picker-retry"
                onClick={() => { setError(null); setIsLoading(true); loadGifs(debouncedQuery, activeCategory, 0); }}
              >
                <RefreshCw size={13} /> Try again
              </button>
            </div>
          ) : isLoading ? (
            <SkeletonGrid />
          ) : gifs.length === 0 ? (
            <div className="gif-picker-empty">
              <span style={{ fontSize: 32 }}>🔍</span>
              <p>{query ? `No GIFs found for "${query}"` : 'No GIFs available'}</p>
            </div>
          ) : (
            <VirtuosoGrid
              style={{ height: '100%' }}
              data={gifs}
              endReached={loadMore}
              overscan={200}
              listClassName="gif-picker-grid"
              itemContent={(index, gif) => (
                <GifItem key={gif.id} gif={gif} onSelect={handleSelectGif} />
              )}
              components={{
                Footer: () => isLoadingMore ? (
                  <div className="gif-picker-load-more">
                    <div className="gif-picker-spinner" />
                  </div>
                ) : <div style={{ height: 12 }} />
              }}
            />
          )}
        </div>

        {/* Powered by Klipy */}
        <div className="gif-picker-footer">
          <span className="gif-picker-powered">Powered by Klipy</span>
        </div>
      </div>
    </FloatingPortal>
  );
}
