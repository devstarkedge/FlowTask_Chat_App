import storage from './storage';

const ROOT_ROUTES = new Set(['Main', 'Chat', 'ChannelDetails', 'Threads', 'ThreadDetail', 'Later', 'Drafts', 'Scheduled', 'Notifications', 'Preferences', 'ColorMode', 'NotificationsPreferences', 'EmojiSkinTone', 'SwipeActions', 'Huddles', 'Language', 'Time', 'AccentColor', 'Profile', 'EditContact', 'EditProfile', 'UserProfile', 'Files', 'Search', 'ChannelSearch', 'PinnedMessages', 'People', 'NewMessage', 'CanvasList', 'CanvasEditor', 'StarredMessages', 'WorkspaceSettings', 'ExternalConnections']);
const TABS = new Set(['HomeTab', 'DMsTab', 'ActivityTab', 'MoreTab', 'SearchTab']);
const PARAMS = new Set(['channelId', 'channelName', 'initialTab', 'canvasId', 'messageId', 'rootMessageId', 'highlightedMessageId', 'workspaceId', 'threadId']);
const scopedKey = (userId, workspaceId) => `navigation:v1:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}`;
let writes = Promise.resolve();

export const isNavigationEntryUrl = url => !!url
  && !/^[a-z][a-z0-9+.-]*:\/\/expo-development-client(?:[/?]|$)/i.test(url)
  && !/^exp:\/\/[^/]+\/?$/i.test(url);

// Persist partial navigation state, not React Navigation keys, functions, auth
// tokens, large message snapshots or temporary permission/recording modals.
export function sanitizeNavigationState(state, tabs = false, depth = 0) {
  if (!state || !Array.isArray(state.routes) || !state.routes.length || depth > 1) return undefined;
  const allowed = tabs ? TABS : ROOT_ROUTES;
  const entries = state.routes.flatMap((route, originalIndex) => {
    if (!route || !allowed.has(route.name)) return [];
    const params = {};
    for (const [name, value] of Object.entries(route.params || {})) {
      if (PARAMS.has(name) && ['string', 'number', 'boolean'].includes(typeof value)) params[name] = value;
    }
    if (route.params?.user?._id || route.params?.user?.id) {
      params.user = Object.fromEntries(['_id', 'id', 'name', 'avatar'].flatMap(name =>
        typeof route.params.user[name] === 'string' ? [[name, route.params.user[name]]] : []));
    }
    if (['Chat', 'ChannelDetails', 'Files', 'ChannelSearch', 'PinnedMessages'].includes(route.name) && !params.channelId) return [];
    if (route.name === 'ThreadDetail' && (!params.channelId || !params.rootMessageId)) return [];
    if (route.name === 'CanvasEditor' && !params.canvasId) return [];
    const nested = route.name === 'Main' ? sanitizeNavigationState(route.state, true, depth + 1) : undefined;
    return [{ originalIndex, route: { name: route.name, ...(Object.keys(params).length ? { params } : {}), ...(nested ? { state: nested } : {}) } }];
  });
  if (!entries.length) return undefined;
  const selected = Number.isInteger(state.index) ? state.index : 0;
  let index = entries.findIndex(entry => entry.originalIndex === selected);
  if (index < 0) index = Math.max(0, entries.filter(entry => entry.originalIndex <= selected).length - 1);
  return { index, routes: entries.map(entry => entry.route) };
}

export async function restoreNavigationState(userId, workspaceId, initialUrl) {
  if (!userId || !workspaceId || initialUrl) return undefined;
  try {
    const saved = await storage.getJson(scopedKey(userId, workspaceId));
    if (saved?.version !== 1 || saved.userId !== userId || saved.workspaceId !== workspaceId) return undefined;
    return sanitizeNavigationState(saved.state);
  } catch { return undefined; }
}

export function saveNavigationState(userId, workspaceId, state, stillActive = () => true) {
  const safeState = sanitizeNavigationState(state);
  if (!userId || !workspaceId || !safeState) return Promise.resolve();
  writes = writes.catch(() => {}).then(async () => {
    if (!stillActive()) return;
    await storage.setJson(scopedKey(userId, workspaceId), { version: 1, userId, workspaceId, state: safeState });
  });
  return writes;
}
