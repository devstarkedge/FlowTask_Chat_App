/**
 * GifPickerModal.jsx — Web GIF picker using GIPHY/Klipy API.
 *
 * Features:
 *  - Search with 350ms debounce
 *  - Category chips (Trending, Reactions, Funny, Love, Animals, Sports, etc.)
 *  - Smooth native 2-column grid scroll (zero flicker/jumping)
 *  - IntersectionObserver + scroll listener infinite pagination
 *  - Strict item deduplication to prevent repeated GIFs
 *  - Skeleton, error & empty states
 *  - "Powered by Klipy" attribution
 */
import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { X, Search, RefreshCw } from 'lucide-react';
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
  
  const total = responseData.pagination?.total_count ?? null;
  const nextOffset = (typeof offset === 'number' ? offset : 0) + gifs.length;
  
  let hasMore = gifs.length > 0 && gifs.length >= PAGE_SIZE;
  if (total !== null && typeof offset === 'number') {
    if (offset + gifs.length >= total) {
      hasMore = false;
    }
  }

  const result = { 
    gifs, 
    hasMore,
    nextOffset 
  };
  
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
        <div key={i} className="gif-picker-skeleton" style={{ paddingBottom: `${(i % 3 === 0 ? 0.8 : i % 3 === 1 ? 0.6 : 1.0) * 100}%` }} />
      ))}
    </div>
  );
}

// ─── GIF Item ─────────────────────────────────────────────────────────────────

const GifItem = memo(function GifItem({ gif, onSelect }) {
  const [loaded, setLoaded] = useState(false);
  const rawRatio = (gif.width && gif.height && gif.width > 0) ? (gif.height / gif.width) : 0.75;
  const clampedRatio = Math.min(Math.max(rawRatio, 0.55), 1.3);

  return (
    <button
      type="button"
      className="gif-picker-item"
      style={{ paddingBottom: `${clampedRatio * 100}%` }}
      onClick={() => onSelect(gif)}
      title={gif.title || 'GIF'}
    >
      <img
        src={gif.previewUrl || gif.gifUrl}
        alt={gif.title || 'GIF'}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 200ms ease-in-out' }}
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
  const requestIdRef = useRef(0);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const loadMoreGifsRef = useRef(null);
  const sentinelRef = useRef(null);

  hasMoreRef.current = hasMore;

  // Debounce query (350ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Initial load
  const loadInitialGifs = useCallback(async (q, cat) => {
    const fetchId = ++requestIdRef.current;
    loadingRef.current = true;
    setError(null);
    setIsLoading(true);
    offsetRef.current = 0;
    setHasMore(true);
    hasMoreRef.current = true;

    try {
      const result = await fetchPage(q, cat, 0);
      if (fetchId !== requestIdRef.current) return;

      setGifs(result.gifs);
      offsetRef.current = result.nextOffset;
      setHasMore(result.hasMore);
      hasMoreRef.current = result.hasMore;

      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    } catch {
      if (fetchId === requestIdRef.current) {
        setError('Failed to load GIFs. Check your internet connection.');
      }
    } finally {
      if (fetchId === requestIdRef.current) {
        setIsLoading(false);
        loadingRef.current = false;
      }
    }
  }, []);

  // Load more GIFs on scroll
  const loadMoreGifs = useCallback(async () => {
    if (!hasMoreRef.current || loadingRef.current) return;
    const fetchId = requestIdRef.current;
    loadingRef.current = true;
    setIsLoadingMore(true);

    const currentOffset = offsetRef.current;
    try {
      const result = await fetchPage(debouncedQuery, activeCategory, currentOffset);
      if (fetchId !== requestIdRef.current) return;

      if (!result.gifs || result.gifs.length === 0) {
        setHasMore(false);
        hasMoreRef.current = false;
        return;
      }

      setGifs(prev => {
        const existingIds = new Set(prev.map(g => g.id || g.providerId || g.gifUrl));
        const uniqueNewGifs = result.gifs.filter(g => {
          const id = g.id || g.providerId || g.gifUrl;
          return id && !existingIds.has(id);
        });

        if (uniqueNewGifs.length === 0 || !result.hasMore) {
          setHasMore(false);
          hasMoreRef.current = false;
        } else {
          setHasMore(result.hasMore);
          hasMoreRef.current = result.hasMore;
        }

        return [...prev, ...uniqueNewGifs];
      });

      offsetRef.current = result.nextOffset;
    } catch (err) {
      console.error('Failed to load more GIFs:', err);
    } finally {
      if (fetchId === requestIdRef.current) {
        setIsLoadingMore(false);
        loadingRef.current = false;
      }
    }
  }, [debouncedQuery, activeCategory]);

  loadMoreGifsRef.current = loadMoreGifs;

  useEffect(() => {
    if (!isOpen) return;
    setGifs([]);
    offsetRef.current = 0;
    setHasMore(true);
    hasMoreRef.current = true;
    loadInitialGifs(debouncedQuery, activeCategory);
  }, [debouncedQuery, activeCategory, isOpen, loadInitialGifs]);

  // Focus input on open
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

  // Stable IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!isOpen || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (!loadingRef.current && hasMoreRef.current) {
            loadMoreGifsRef.current?.();
          }
        }
      },
      {
        root: scrollRef.current,
        rootMargin: '250px',
        threshold: 0.01,
      }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  // Backup scroll event handler
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !hasMoreRef.current || loadingRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop - clientHeight < 250) {
      loadMoreGifsRef.current?.();
    }
  }, []);

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

        {/* Scroll Container */}
        <div ref={scrollRef} className="gif-picker-scroll" onScroll={handleScroll}>
          {error ? (
            <div className="gif-picker-empty">
              <span style={{ fontSize: 32 }}>😕</span>
              <p>{error}</p>
              <button
                type="button"
                className="gif-picker-retry"
                onClick={() => loadInitialGifs(debouncedQuery, activeCategory)}
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
            <>
              <div className="gif-picker-grid">
                {gifs.map((gif) => (
                  <GifItem key={gif.id || gif.providerId || gif.gifUrl} gif={gif} onSelect={handleSelectGif} />
                ))}
              </div>

              {/* Permanent infinite scroll sentinel container */}
              <div ref={sentinelRef} className="gif-picker-sentinel">
                <div className={`gif-picker-load-more ${isLoadingMore ? 'visible' : ''}`}>
                  <div className="gif-picker-spinner" />
                </div>
              </div>
            </>
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
