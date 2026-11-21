export function safeDesktopRoute(value) {
  if (typeof value !== 'string' || value.length > 12000 || !value.startsWith('/') ||
      value.startsWith('//') || /[\\\s]/.test(value) || /\p{Cc}/u.test(value)) return null;
  try {
    return new URL(value, 'https://navigation.invalid').origin === 'https://navigation.invalid' ? value : null;
  } catch { return null; }
}

export function desktopLoginTarget(route, authenticated) {
  if (!safeDesktopRoute(route)) return null;
  const url = new URL(route, 'https://navigation.invalid');
  if (authenticated || url.pathname === '/login' || url.pathname.startsWith('/invite/')) return route;
  return `/login?redirect=${encodeURIComponent(route)}`;
}

export function withFlowTaskWorkspace(redirect, workspaceId) {
  if (!redirect || !/^[a-f\d]{24}$/i.test(workspaceId || '') || !/^https?:\/\//i.test(redirect.url)) return redirect;
  const url = new URL(redirect.url);
  // Explicit route parameters are authoritative; never replace them with the
  // currently selected workspace (e.g. a link inside a forwarded message).
  if (!url.searchParams.has('workspaceId')) url.searchParams.set('workspaceId', workspaceId);
  return { ...redirect, url: url.href };
}

export function ssoDesktopDestination(workspaceId, redirect) {
  const fallback = workspaceId ? `/workspace/${workspaceId}` : '/select-workspace';
  const route = safeDesktopRoute(redirect);
  if (!workspaceId || !route) return fallback;
  const path = new URL(route, 'https://navigation.invalid').pathname;
  return path === fallback || path.startsWith(fallback + '/') ? route : fallback;
}
