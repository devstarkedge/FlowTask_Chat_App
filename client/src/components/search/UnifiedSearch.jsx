/**
 * UnifiedSearch — Slack-level unified search component.
 *
 * ONE component, ONE API, TWO scopes:
 *   scope="global"  → top-bar pill + dropdown (Ctrl+K / Cmd+K)
 *   scope="channel" → contextual popup controlled by `open` prop (Ctrl+F)
 *
 * External API (via ref, global only):
 *   ref.current.open()   — programmatically open the global search
 *   ref.current.close()  — programmatically close
 *   ref.current.focus()  — alias for open()
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search, SlidersHorizontal, X, BrushCleaning } from "lucide-react";
import { messageAPI, searchAPI } from "../../services/api";
import { useChannelStore } from "../../stores/channelStore";
import { useChatStore } from "../../stores/chatStore";
import { useDraftStore } from "../../stores/draftStore";
import logger from "../../utils/logger";
import SearchDropdown from "./SearchDropdown";
import ScopeChip from "./ScopeChip";
import {
  getScopeLabel,
  getScopeTargetLabel,
  normalizeRecentMessages,
  normalizeSearchMessages,
} from "./searchUtils";
import "./UnifiedSearch.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_RESULTS_GLOBAL = {
  topMatches: [],
  users: [],
  messages: [],
  channels: [],
  dms: [],
  files: [],
  links: [],
  pages: [],
};
const EMPTY_META = { engine: "mongo-native", limits: {}, sections: {} };
const EMPTY_HISTORY = { queries: [], clicks: [], people: {} };

const MAX_RECENT_SEARCHES = 10;
const MAX_RECENT_CLICKS = 6;
const MAX_SUGGESTED_RESULTS = 10;
const RECENT_LIMIT = 12;
const DEBOUNCE_MS = 300;

const GLOBAL_SECTION_KEYS = [
  "topMatches",
  "users",
  "messages",
  "channels",
  "dms",
  "files",
  "links",
  "pages",
];

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
const SHORTCUT_LABEL = IS_MAC ? "⌘K" : "Ctrl K";

// ─── History helpers (global mode, localStorage-backed) ───────────────────────

function historyKey(userId, workspaceId) {
  return `global_search_history_${userId || "anon"}_${
    workspaceId || "workspace"
  }`;
}

function normalizeHistory(raw = {}) {
  const queries = Array.isArray(raw.queries)
    ? raw.queries
        .filter((q) => typeof q === "string" && q.trim())
        .slice(0, MAX_RECENT_SEARCHES)
    : [];
  const clicks = Array.isArray(raw.clicks)
    ? raw.clicks.filter((c) => c?.id && c?.type).slice(0, MAX_RECENT_CLICKS)
    : [];
  const people = Object.fromEntries(
    Object.entries(raw.people || {})
      .filter(([id, v]) => id && v && typeof v === "object")
      .slice(0, 20),
  );
  return { queries, clicks, people };
}

function readHistory(userId, workspaceId) {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(historyKey(userId, workspaceId)) || "null",
    );
    if (parsed) return normalizeHistory(parsed);
  } catch {
    /* ignore */
  }
  return EMPTY_HISTORY;
}

function writeHistory(userId, workspaceId, next) {
  localStorage.setItem(
    historyKey(userId, workspaceId),
    JSON.stringify(normalizeHistory(next)),
  );
}

function updateHistory(userId, workspaceId, updater) {
  const next = normalizeHistory(updater(readHistory(userId, workspaceId)));
  writeHistory(userId, workspaceId, next);
  return next;
}

function saveRecentQuery(userId, workspaceId, query) {
  const value = query.trim();
  if (!value) return readHistory(userId, workspaceId);
  return updateHistory(userId, workspaceId, (h) => ({
    ...h,
    queries: [
      value,
      ...h.queries.filter((q) => q.toLowerCase() !== value.toLowerCase()),
    ].slice(0, MAX_RECENT_SEARCHES),
  }));
}

function getItemKey(item) {
  return [
    item?.type,
    item?.referenceId,
    item?.messageId,
    item?.channelId,
    item?.path,
    item?.id,
    item?.url,
    item?.label,
  ]
    .filter(Boolean)
    .join(":");
}

function toHistoryItem(item) {
  if (!item?.type) return null;
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    label: item.label,
    title: item.title,
    avatar: item.avatar,
    status: item.status,
    email: item.email,
    role: item.role,
    customStatus: item.customStatus,
    flowTaskUserId: item.flowTaskUserId,
    channelId: item.channelId,
    channelType: item.channelType,
    channelName: item.channelName,
    visibility: item.visibility,
    memberCount: item.memberCount,
    topic: item.topic,
    description: item.description,
    snippet: item.snippet,
    mimeType: item.mimeType,
    uploadedBy: item.uploadedBy,
    referenceId: item.referenceId,
    messageId: item.messageId,
    url: item.url,
    path: item.path,
    iconKey: item.iconKey,
    reasonLabel: "Recent open",
  };
}

function saveRecentClick(userId, workspaceId, item) {
  const hi = toHistoryItem(item);
  if (!hi?.id && !hi?.path && !hi?.url) return readHistory(userId, workspaceId);
  return updateHistory(userId, workspaceId, (h) => {
    const nextClicks = [
      { ...hi, viewedAt: Date.now() },
      ...h.clicks.filter((e) => getItemKey(e) !== getItemKey(hi)),
    ].slice(0, MAX_RECENT_CLICKS);
    const nextPeople = { ...h.people };
    if (hi.type === "user" && hi.id) {
      const cur = nextPeople[hi.id] || {};
      nextPeople[hi.id] = {
        ...cur,
        ...hi,
        count: (cur.count || 0) + 1,
        lastClickedAt: Date.now(),
        reasonLabel: "Frequent teammate",
      };
    }
    return { ...h, clicks: nextClicks, people: nextPeople };
  });
}

// ─── Global-mode suggestion builders ─────────────────────────────────────────

function sortByActivity(items) {
  return [...items].sort((a, b) => {
    const bt = new Date(
      b.lastMessageAt || b.updatedAt || b.createdAt || b.timestamp || 0,
    ).getTime();
    const at = new Date(
      a.lastMessageAt || a.updatedAt || a.createdAt || a.timestamp || 0,
    ).getTime();
    return bt - at;
  });
}

function toConversationSuggestion(channel, reasonLabel) {
  if (!channel?._id) return null;
  return {
    id: channel._id,
    type: channel.type === "dm" ? "dm" : "channel",
    name: channel.name || channel.slug || "Conversation",
    slug: channel.slug,
    description: channel.lastMessagePreview || channel.description,
    topic: channel.topic,
    visibility: channel.visibility,
    memberCount: channel.memberCount,
    channelType: channel.type,
    lastMessageAt: channel.lastMessageAt,
    reasonLabel,
  };
}

function toDraftSuggestion(draft, channel) {
  if (!draft || !channel?._id) return null;
  return {
    id: channel._id,
    type: channel.type === "dm" ? "dm" : "channel",
    name: channel.name || channel.slug || "Conversation",
    slug: channel.slug,
    description: draft.text || "Draft in progress",
    topic: channel.topic,
    visibility: channel.visibility,
    memberCount: channel.memberCount,
    channelType: channel.type,
    timestamp: draft.timestamp,
    reasonLabel: "Draft conversation",
  };
}

function quickPages() {
  return [
    {
      id: "profile",
      label: "Profile",
      type: "page",
      path: "profile",
      iconKey: "user",
    },
    {
      id: "settings",
      label: "Settings",
      type: "page",
      path: "settings",
      iconKey: "settings",
    },
    {
      id: "notifications",
      label: "Notifications",
      type: "page",
      path: "activity",
      iconKey: "bell",
    },
    {
      id: "threads",
      label: "Threads",
      type: "page",
      path: "threads",
      iconKey: "message",
    },
    {
      id: "starred",
      label: "Starred",
      type: "page",
      path: "starred",
      iconKey: "star",
    },
    {
      id: "directories",
      label: "Directories",
      type: "page",
      path: "directories",
      iconKey: "users",
    },
    {
      id: "files",
      label: "Files",
      type: "page",
      path: "files",
      iconKey: "files",
    },
  ];
}

function buildEmptyStateResults({ history, channels, drafts, workspaceId }) {
  const channelById = new Map(channels.map((c) => [c._id, c]));

  const recentSearches = history.queries.map((q) => ({
    id: `recent:${q}`,
    type: "recentSearch",
    label: q,
    reasonLabel: "Recent search",
  }));

  const recentClicks = history.clicks.map((c) => ({
    ...c,
    reasonLabel: c.reasonLabel || "Recent open",
  }));

  const frequentPeople = Object.values(history.people || {})
    .sort((a, b) => {
      if ((b.count || 0) !== (a.count || 0))
        return (b.count || 0) - (a.count || 0);
      return (b.lastClickedAt || 0) - (a.lastClickedAt || 0);
    })
    .slice(0, 4);

  const starredChannels = sortByActivity(
    channels.filter((c) => !c.isArchived && (c.isPinned || c.isStarred)),
  ).map((c) =>
    toConversationSuggestion(
      c,
      c.isPinned ? "Pinned channel" : "Starred channel",
    ),
  );

  const recentConversations = sortByActivity(
    channels.filter((c) => !c.isArchived && c.lastMessageAt),
  ).map((c) => toConversationSuggestion(c, "Recent conversation"));

  const draftConversations = sortByActivity(
    Object.values(drafts || {}).filter((d) => d.workspaceId === workspaceId),
  ).map((d) => toDraftSuggestion(d, channelById.get(d.channelId)));

  const quickLinks = quickPages().map((p) => ({
    ...p,
    reasonLabel: "Quick page",
  }));

  const suggestedResults = [
    ...recentClicks,
    ...frequentPeople,
    ...starredChannels,
    ...recentConversations,
    ...draftConversations,
    ...quickLinks,
  ]
    .filter(Boolean)
    .filter(
      (item, i, arr) =>
        arr.findIndex((c) => getItemKey(c) === getItemKey(item)) === i,
    )
    .slice(0, MAX_SUGGESTED_RESULTS);

  return { recentSearches, suggestedResults };
}

// ─── Normalize / flatten helpers ─────────────────────────────────────────────

function normalizeGlobalResults(payload = {}) {
  return {
    topMatches: Array.isArray(payload.topMatches) ? payload.topMatches : [],
    users: Array.isArray(payload.users) ? payload.users : [],
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    channels: Array.isArray(payload.channels) ? payload.channels : [],
    dms: Array.isArray(payload.dms) ? payload.dms : [],
    files: Array.isArray(payload.files) ? payload.files : [],
    links: Array.isArray(payload.links) ? payload.links : [],
    pages: Array.isArray(payload.pages) ? payload.pages : [],
  };
}

function dedupeResults(results) {
  if (!results.topMatches?.length) return results;
  const keys = new Set(results.topMatches.map(getItemKey));
  return {
    ...results,
    users: results.users.filter((i) => !keys.has(getItemKey(i))),
    messages: results.messages.filter((i) => !keys.has(getItemKey(i))),
    channels: results.channels.filter((i) => !keys.has(getItemKey(i))),
    dms: results.dms.filter((i) => !keys.has(getItemKey(i))),
    files: results.files.filter((i) => !keys.has(getItemKey(i))),
    links: results.links.filter((i) => !keys.has(getItemKey(i))),
    pages: results.pages.filter((i) => !keys.has(getItemKey(i))),
  };
}

function flattenGlobalResults(results) {
  const rows = [];
  for (const key of GLOBAL_SECTION_KEYS) {
    for (const item of results[key] || []) rows.push({ ...item, section: key });
  }
  return rows;
}

function flattenEmptyState(emptyState) {
  return [
    ...(emptyState.recentSearches || []),
    ...(emptyState.suggestedResults || []),
  ];
}

const EMPTY_SEARCH_STATE = { isOpen: false, mode: "global", channelId: null };

// ─── Main Component ───────────────────────────────────────────────────────────

const UnifiedSearch = forwardRef(function UnifiedSearch(
  {
    onOpenResult,
    onOpenResultsPage,
    onOpenChange,
    user = null,
    workspaceId,
    messages = [],
  },
  ref,
) {
  // ── Store access ────────────────────────────────────────────────────────
  const channels = useChannelStore((state) => state.channels);
  const drafts = useDraftStore((state) => state.drafts);
  const upsertChannelMessages = useChatStore(
    (state) => state.upsertChannelMessages,
  );

  // ── Refs ────────────────────────────────────────────────────────────────
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const panelRef = useRef(null);
  const cacheRef = useRef(new Map());
  const requestIdRef = useRef(0);

  // ── State ───────────────────────────────────────────────────────────────
  const [searchState, setSearchState] = useState(EMPTY_SEARCH_STATE);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // Global mode
  const [globalResults, setGlobalResults] = useState(EMPTY_RESULTS_GLOBAL);
  const [searchMeta, setSearchMeta] = useState(EMPTY_META);
  const [history, setHistory] = useState(() =>
    readHistory(user?._id, workspaceId),
  );

  // Channel mode — per-channel query map so state survives channel switches
  const [queryByChannel, setQueryByChannel] = useState({});

  // Channel mode search results (array of message items)
  const [channelResults, setChannelResults] = useState([]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const channelId = searchState.channelId;
  const channel = useMemo(
    () => channels.find((candidate) => candidate._id === channelId) || null,
    [channels, channelId],
  );
  const isContextual = searchState.mode !== "global";
  const effectiveOpen = searchState.isOpen;

  const channelKey = channelId || "channel-search";
  const channelQuery = queryByChannel[channelKey] || "";
  const activeQuery = isContextual ? channelQuery : query;
  const trimmed = activeQuery.trim();
  const hasQuery = trimmed.length > 0;
  const fallbackScope = useMemo(
    () =>
      isContextual
        ? {
            _id: channelId,
            type: searchState.mode === "dm" ? "dm" : "channel",
            name: channelId || "Conversation",
          }
        : null,
    [channelId, isContextual, searchState.mode],
  );
  const resolvedScope = channel || fallbackScope;

  const scopeLabel = isContextual ? getScopeLabel(resolvedScope) : "";
  const scopeTargetLabel = isContextual
    ? getScopeTargetLabel(resolvedScope)
    : "workspace";
  const panelTitle = isContextual
    ? `Find messages in ${
        resolvedScope?.name || resolvedScope?.slug || "this conversation"
      }`
    : "Search Chat Workspace";
  const panelSubtitle = isContextual
    ? `Scoped to ${scopeLabel}`
    : "Recent searches, suggested results, and live workspace results in one place.";
  const placeholder = isContextual
    ? `Search in this ${scopeTargetLabel}`
    : "Search across people, channels, files, workflows, and more";
  const contextualActionCount = isContextual && hasQuery ? 2 : 0;

  // Recent messages from the messages prop (channel mode)
  const recentMessages = useMemo(
    () => normalizeRecentMessages(messages, resolvedScope, RECENT_LIMIT),
    [messages, resolvedScope],
  );

  // Global mode empty-state suggestions
  const emptyStateResults = useMemo(
    () => buildEmptyStateResults({ history, channels, drafts, workspaceId }),
    [history, channels, drafts, workspaceId],
  );

  // Global mode visible results (deduped when searching)
  const visibleGlobalResults = useMemo(
    () => (hasQuery ? dedupeResults(globalResults) : emptyStateResults),
    [hasQuery, globalResults, emptyStateResults],
  );

  // Flat rows for keyboard navigation
  const rows = useMemo(() => {
    if (isContextual) {
      const base = hasQuery ? channelResults : recentMessages;
      return hasQuery
        ? [
            { id: "__action_scoped__", type: "__action__" },
            { id: "__action_filtered__", type: "__action__" },
            ...base,
          ]
        : base;
    }
    return hasQuery
      ? flattenGlobalResults(visibleGlobalResults)
      : flattenEmptyState(emptyStateResults);
  }, [
    isContextual,
    hasQuery,
    channelResults,
    recentMessages,
    visibleGlobalResults,
    emptyStateResults,
  ]);

  // ── Open / Close ─────────────────────────────────────────────────────────

  const openSearch = useCallback(
    (options = {}) => {
      const nextMode =
        options.mode === "dm"
          ? "dm"
          : options.mode === "channel"
          ? "channel"
          : "global";
      const nextChannelId =
        nextMode === "global" ? null : options.channelId || null;

      setSearchState({
        isOpen: true,
        mode: nextMode,
        channelId: nextChannelId,
      });

      if (typeof options.prefillQuery === "string") {
        if (nextMode === "global") setQuery(options.prefillQuery);
        else if (nextChannelId) {
          setQueryByChannel((prev) => ({
            ...prev,
            [nextChannelId]: options.prefillQuery,
          }));
        }
      }

      if (nextMode === "global") {
        setHistory(readHistory(user?._id, workspaceId));
      }
    },
    [user?._id, workspaceId],
  );

  const openGlobal = useCallback(() => {
    openSearch({ mode: "global" });
  }, [openSearch]);

  const closeSearch = useCallback(() => {
    setSearchState(EMPTY_SEARCH_STATE);
    setActiveIndex(0);
    inputRef.current?.blur();
  }, []);

  // ── Expose ref API ──────────────────────────────────────────────────────

  useImperativeHandle(
    ref,
    () => ({
      open: openSearch,
      close: closeSearch,
      focus: openGlobal,
    }),
    [closeSearch, openGlobal, openSearch],
  );

  useEffect(() => {
    onOpenChange?.(effectiveOpen);
  }, [effectiveOpen, onOpenChange]);

  useEffect(() => {
    if (!effectiveOpen) return undefined;

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [effectiveOpen, searchState.mode, channelId]);

  const isEventInsideSearchSurface = useCallback((event) => {
    const refs = [containerRef.current, panelRef.current].filter(Boolean);
    if (refs.length === 0) return false;

    const target = event.target;
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [];

    return refs.some((node) => {
      if (!node) return false;
      if (path.includes(node)) return true;
      return target instanceof Node && node.contains(target);
    });
  }, []);

  // ── Click-outside to close ──────────────────────────────────────────────

  useEffect(() => {
    if (!effectiveOpen) return undefined;
    const handlePointerDown = (event) => {
      if (isEventInsideSearchSurface(event)) return;
      closeSearch();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [closeSearch, effectiveOpen, isEventInsideSearchSurface]);

  // ── Reset active index when query / open state changes ──────────────────

  useEffect(() => {
    setActiveIndex(rows.length > 0 ? 0 : -1);
  }, [trimmed, effectiveOpen, rows.length]);

  // ── Scroll active row into view ─────────────────────────────────────────

  useEffect(() => {
    if (!panelRef.current) return;
    const el = panelRef.current.querySelector('[aria-selected="true"]');
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  // ── GLOBAL: debounced search ─────────────────────────────────────────────

  useEffect(() => {
    if (isContextual) return undefined;

    setError("");
    setActiveIndex(0);

    if (!effectiveOpen || trimmed.length < 1) {
      setGlobalResults(EMPTY_RESULTS_GLOBAL);
      setSearchMeta(EMPTY_META);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const cacheKey = `global:${workspaceId}:${trimmed.toLowerCase()}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setGlobalResults(cached.results);
      setSearchMeta(cached.meta);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await searchAPI.search({
          q: trimmed,
          signal: controller.signal,
        });
        const results = normalizeGlobalResults(data?.data || {});
        const meta = data?.data?.meta || EMPTY_META;
        cacheRef.current.set(cacheKey, { results, meta });
        setGlobalResults(results);
        setSearchMeta(meta);
      } catch (err) {
        if (controller.signal.aborted) return;
        logger.error("Global search failed:", err);
        setError("Search is unavailable right now. Please try again.");
        setGlobalResults(EMPTY_RESULTS_GLOBAL);
        setSearchMeta(EMPTY_META);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [isContextual, effectiveOpen, trimmed, workspaceId]);

  // ── CONTEXTUAL: load recent messages or scoped search ────────────────────

  useEffect(() => {
    if (!isContextual || !effectiveOpen || !channelId || !workspaceId)
      return undefined;

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    const recentCacheKey = `recent:${workspaceId}:${channelId}`;
    const searchCacheKey = `search:${workspaceId}:${channelId}:${trimmed.toLowerCase()}`;

    const applyState = (items) => {
      if (requestId !== requestIdRef.current) return;
      setChannelResults(items);
      setError("");
      setLoading(false);
    };

    const load = async () => {
      if (!trimmed) {
        if (recentMessages.length > 0) {
          cacheRef.current.set(recentCacheKey, recentMessages);
          applyState(recentMessages);
          return;
        }
        const cachedRecent = cacheRef.current.get(recentCacheKey);
        if (cachedRecent) {
          applyState(cachedRecent);
          return;
        }

        setLoading(true);
        try {
          const { data } = await messageAPI.list(channelId, {
            limit: RECENT_LIMIT,
          });
          const items = data?.data?.items || [];
          const normalized = normalizeRecentMessages(
            items,
            resolvedScope,
            RECENT_LIMIT,
          );
          if (items.length > 0) upsertChannelMessages(channelId, items);
          cacheRef.current.set(recentCacheKey, normalized);
          applyState(normalized);
        } catch {
          if (requestId !== requestIdRef.current) return;
          setChannelResults([]);
          setError("Recent messages are unavailable right now.");
          setLoading(false);
        }
        return;
      }

      const cachedSearch = cacheRef.current.get(searchCacheKey);
      if (cachedSearch) {
        applyState(cachedSearch);
        return;
      }

      setLoading(true);
      try {
        const { data } = await searchAPI.search({
          q: trimmed,
          scope: channelId,
          limit: RECENT_LIMIT,
          signal: controller.signal,
        });
        const normalized = normalizeSearchMessages(
          data?.data?.messages || [],
          resolvedScope,
        );
        cacheRef.current.set(searchCacheKey, normalized);
        applyState(normalized);
      } catch {
        if (controller.signal.aborted || requestId !== requestIdRef.current)
          return;
        setChannelResults([]);
        setError("Search is unavailable right now.");
        setLoading(false);
      }
    };

    void load();
    return () => {
      controller.abort();
      if (requestId === requestIdRef.current) requestIdRef.current += 1;
    };
  }, [
    isContextual,
    effectiveOpen,
    channelId,
    workspaceId,
    trimmed,
    recentMessages,
    resolvedScope,
    upsertChannelMessages,
  ]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleQueryChange = useCallback(
    (e) => {
      const value = e.target.value;
      if (isContextual)
        setQueryByChannel((prev) => ({ ...prev, [channelKey]: value }));
      else setQuery(value);
    },
    [isContextual, channelKey],
  );

  const handleClear = useCallback(() => {
    if (isContextual) {
      setQueryByChannel((prev) => ({ ...prev, [channelKey]: "" }));
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [channelKey, isContextual]);

  const handleRemoveScope = useCallback(() => {
    setQuery(channelQuery);
    setSearchState((prev) => ({
      ...prev,
      mode: "global",
      channelId: null,
      isOpen: true,
    }));
    setHistory(readHistory(user?._id, workspaceId));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [channelQuery, user?._id, workspaceId]);

  const handleSelectResult = useCallback(
    (item) => {
      if (!item) return;

      // "Re-search" item type
      if (item.type === "recentSearch") {
        setQuery(item.label || "");
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      // Save to history (global only)
      if (!isContextual) {
        if (trimmed) saveRecentQuery(user?._id, workspaceId, trimmed);
        setHistory(saveRecentClick(user?._id, workspaceId, item));
      }

      onOpenResult?.(item);
      closeSearch();
    },
    [isContextual, trimmed, user?._id, workspaceId, onOpenResult, closeSearch],
  );

  const handleShowResultsPage = useCallback(() => {
    if (!trimmed || !channelId) return;
    onOpenResultsPage?.(trimmed, channelId);
    closeSearch();
  }, [trimmed, channelId, onOpenResultsPage, closeSearch]);

  const handleInputFocus = useCallback(() => {
    if (!effectiveOpen) openGlobal();
  }, [effectiveOpen, openGlobal]);

  const handleKeyDown = useCallback(
    (e) => {
      if (!effectiveOpen && ["ArrowDown", "Enter"].includes(e.key)) {
        e.preventDefault();
        openGlobal();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (activeQuery) handleClear();
        else closeSearch();
        return;
      }
      if (
        e.key === "Tab" &&
        isContextual &&
        hasQuery &&
        contextualActionCount > 0
      ) {
        e.preventDefault();
        setActiveIndex((index) => {
          if (index >= contextualActionCount) return 0;
          return index === contextualActionCount - 1 ? 0 : index + 1;
        });
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(Math.max(rows.length - 1, 0));
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (isContextual) {
          if (hasQuery && activeIndex < contextualActionCount) {
            handleShowResultsPage();
            return;
          }
          const resultIdx = hasQuery
            ? activeIndex - contextualActionCount
            : activeIndex;
          const item = hasQuery
            ? channelResults[resultIdx]
            : recentMessages[resultIdx];
          handleSelectResult(item);
        } else {
          if (rows[activeIndex]) handleSelectResult(rows[activeIndex]);
        }
      }
    },
    [
      activeIndex,
      activeQuery,
      channelResults,
      closeSearch,
      contextualActionCount,
      effectiveOpen,
      handleClear,
      handleSelectResult,
      handleShowResultsPage,
      hasQuery,
      isContextual,
      openGlobal,
      recentMessages,
      rows,
    ],
  );

  return (
    <>
      {effectiveOpen && (
        <div className="global-search__backdrop" aria-hidden="true" />
      )}

      <div
        ref={containerRef}
        className={`global-search${effectiveOpen ? " is-open" : ""}${
          isContextual ? " is-contextual" : ""
        }`}
      >
        <div
          className="global-search__control"
          onMouseDown={(event) => {
            if (event.target.closest("button")) return;
            if (!effectiveOpen) {
              event.preventDefault();
              openGlobal();
            }
          }}
        >
          <span className="global-search__search-icon">
            <Search size={15} />
          </span>

          {isContextual && scopeLabel && (
            <ScopeChip label={scopeLabel} onRemove={handleRemoveScope} />
          )}

          <input
            ref={inputRef}
            value={activeQuery}
            onChange={handleQueryChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={panelTitle}
            aria-expanded={effectiveOpen}
            aria-controls="global-search-results"
            aria-autocomplete="list"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            inputMode="search"
          />

          <div className="global-search__actions">
            {activeQuery && (
              <button
                type="button"
                className="global-search__clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                aria-label="Clear search"
              >
                <BrushCleaning size={13} />
              </button>
            )}

            {effectiveOpen ? (
              <>
                {/* <button
                  type="button"
                  className="global-search__filter"
                  aria-label="Search filters"
                  title="Search filters"
                >
                  <SlidersHorizontal size={14} />
                </button> */}
                <button
                  type="button"
                  className="global-search__close"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSearch();
                  }}
                  aria-label="Close search"
                >
                  <X size={16} />
                </button>
              </>
            ) : (
              <kbd className="global-search__kbd">{SHORTCUT_LABEL}</kbd>
            )}
          </div>
        </div>

        {effectiveOpen && (
          <div
            id="global-search-results"
            ref={panelRef}
            className="global-search__panel"
            role="listbox"
            aria-label="Search results"
          >
            <div className="global-search__panel-header">
              <div>
                <p className="global-search__eyebrow">
                  {isContextual ? "Contextual Search" : "Workspace Search"}
                </p>
                <h2 className="global-search__title">{panelTitle}</h2>
                <p className="global-search__subtitle">{panelSubtitle}</p>
              </div>
            </div>

            <SearchDropdown
              scope={isContextual ? "channel" : "global"}
              query={activeQuery}
              results={isContextual ? channelResults : visibleGlobalResults}
              searchMeta={searchMeta}
              emptyStateResults={emptyStateResults}
              loading={loading}
              error={error}
              activeIndex={activeIndex}
              rows={rows}
              scopeTargetLabel={scopeTargetLabel}
              scopeLabel={scopeLabel}
              onSelect={handleSelectResult}
              onShowResultsPage={handleShowResultsPage}
            />
          </div>
        )}
      </div>
    </>
  );
});

export default UnifiedSearch;
