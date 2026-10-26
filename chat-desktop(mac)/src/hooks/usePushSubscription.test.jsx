import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ register: vi.fn(), subscribe: vi.fn(), status: vi.fn(), key: vi.fn(), error: vi.fn() }));
vi.mock('../services/api', () => ({ pushAPI: { getStatus: f.status, getPublicKey: f.key } }));
vi.mock('../utils/logger', () => ({ default: { debug: vi.fn(), error: f.error } }));
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: () => ({ updatePreferences: vi.fn() }) } }));
vi.mock('../stores/notificationStore', () => ({ useNotificationStore: { getState: () => ({ updatePreferences: vi.fn() }) } }));
import usePushSubscription from './usePushSubscription';
let root, container, hook;
function Harness() { hook = usePushSubscription(); return null; }
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('Notification', { permission: 'granted' });
  vi.stubGlobal('PushManager', function PushManager() {});
  vi.stubGlobal('BroadcastChannel', class { close() {} });
  vi.stubGlobal('navigator', { onLine: true, userAgent: 'Chrome/130', serviceWorker: { register: f.register } });
  f.register.mockResolvedValue({ pushManager: { getSubscription: async () => null, subscribe: f.subscribe } });
  f.status.mockResolvedValue({ data: { data: {} } });
  f.key.mockResolvedValue({ data: { publicKey: 'AQID' } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); delete window.electronAPI; vi.unstubAllGlobals(); });
it('uses native desktop notifications without push registration or an unsupported-browser prompt', async () => {
  window.electronAPI = {};
  await act(async () => root.render(<Harness />));
  expect(f.register).not.toHaveBeenCalled();
  expect(hook.prompt.isOpen).toBe(false);
  await expect(hook.requestPermissionAndSubscribe()).resolves.toEqual({ success: false, reason: 'native_notifications' });
});
it('reports an unavailable browser push service honestly and avoids automatic retry loops', async () => {
  f.subscribe.mockRejectedValue(Object.assign(new Error('Registration failed - push service not available'), { name: 'AbortError' }));
  await act(async () => root.render(<Harness />));
  expect(f.subscribe).toHaveBeenCalledOnce();
  expect(f.error).not.toHaveBeenCalled();
  await act(async () => { await hook.requestPermissionAndSubscribe({ silent: true }); });
  expect(f.subscribe).toHaveBeenCalledOnce();
  await act(async () => { await hook.requestPermissionAndSubscribe(); });
  expect(f.subscribe).toHaveBeenCalledTimes(2);
  expect(hook.prompt.error).toContain('could not connect to its push service');
});
