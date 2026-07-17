import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchTrending, searchGifs, fetchByCategory } from '../services/gifService';

/**
 * useGiphySearch
 * Debounced GIPHY search hook with infinite scroll support.
 *
 * @param {string}  query       - current search query
 * @param {string}  category    - active category id (used when query is empty)
 * @param {number}  debounceMs  - debounce delay in ms
 *
 * Returns:
 *   { gifs, isLoading, isLoadingMore, hasMore, error, loadMore, reset }
 */
export default function useGiphySearch(query, category, debounceMs = 400) {
  const [gifs, setGifs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const offsetRef = useRef(0);
  const abortRef = useRef(false);

  const _load = useCallback(async (q, cat, offset) => {
    abortRef.current = false;
    setError(null);

    try {
      let result;
      if (q && q.trim()) {
        result = await searchGifs(q.trim(), offset);
      } else if (cat && cat !== 'trending') {
        result = await fetchByCategory(cat, offset);
      } else {
        result = await fetchTrending(offset);
      }

      if (abortRef.current) return;

      if (offset === 0) {
        setGifs(result.gifs);
      } else {
        setGifs(prev => {
          const ids = new Set(prev.map(g => g.id));
          const newGifs = result.gifs.filter(g => !ids.has(g.id));
          return [...prev, ...newGifs];
        });
      }

      offsetRef.current = offset + result.gifs.length;
      setHasMore(result.hasMore);
    } catch (err) {
      if (!abortRef.current) setError('Failed to load GIFs. Check your connection.');
    } finally {
      if (!abortRef.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, []);

  // Initial / query-changed load (debounced)
  useEffect(() => {
    abortRef.current = true; // cancel previous
    setGifs([]);
    offsetRef.current = 0;
    setHasMore(true);
    setError(null);

    const timer = setTimeout(() => {
      setIsLoading(true);
      _load(query, category, 0);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      abortRef.current = true;
    };
  }, [query, category, debounceMs, _load]);

  const loadMore = useCallback(() => {
    if (isLoadingMore || isLoading || !hasMore) return;
    setIsLoadingMore(true);
    _load(query, category, offsetRef.current);
  }, [isLoadingMore, isLoading, hasMore, query, category, _load]);

  const reset = useCallback(() => {
    abortRef.current = true;
    setGifs([]);
    offsetRef.current = 0;
    setHasMore(true);
    setError(null);
    setIsLoading(false);
    setIsLoadingMore(false);
  }, []);

  return { gifs, isLoading, isLoadingMore, hasMore, error, loadMore, reset };
}
