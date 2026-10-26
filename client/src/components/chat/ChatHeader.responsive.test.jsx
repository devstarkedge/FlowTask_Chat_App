import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ width: 850, required: 1100, change: vi.fn(), add: vi.fn(), observers: [], channel: { _id: 'chat', name: 'Team', type: 'public' } }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ workspaceId: 'team' }) }));
vi.mock('../../stores/channelStore', () => ({ useChannelStore: select => { const s = { channels: [f.channel], membersByChannel: {}, toggleInfoPanel: vi.fn() }; return select ? select(s) : s; } }));
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => ({ user: { name: 'Tester' } }) }));
vi.mock('../../stores/chatStore', () => ({ useChatStore: select => select({ activeThread: null, pinnedMessagesByChannel: {} }) }));
vi.mock('../../stores/favoritesStore', () => ({ useFavoritesStore: () => ({ isFavorited: () => false, toggleFavorite: vi.fn() }) }));
vi.mock('../../stores/canvasStore', () => ({ useCanvasStore: select => select({ activeCanvasIdByChannel: {}, updateCanvasMetadata: vi.fn(), duplicateCanvas: vi.fn() }) }));
vi.mock('../huddles/HuddleHeaderMenu', () => ({ default: () => null }));
vi.mock('../../stores/huddleUiStore', () => ({ useHuddleUiStore: { getState: () => ({ openPanel: vi.fn() }) } }));
import ChatHeader from './ChatHeader';
import CanvasTabContextMenu from '../canvas/CanvasTabContextMenu';
let root, container;
const tabs = Array.from({ length: 12 }, (_, i) => ({ _id: `canvas-${i}`, title: `Project ${i} with a very long canvas title` }));
const resize = () => act(() => f.observers.forEach(callback => callback([])));
const render = () => act(() => root.render(<ChatHeader channel={f.channel} activeTab="canvas:canvas-5" openCanvasTabs={tabs} onTabChange={f.change} onOpenAddCanvasModal={f.add} />));
const button = text => [...container.querySelectorAll('button')].find(b => b.textContent === text);
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; f.width = 850; f.required = 1100; f.observers = []; vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { constructor(callback) { this.callback = callback; f.observers.push(callback); } observe() {} disconnect() { f.observers = f.observers.filter(callback => callback !== this.callback); } });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const width = this.classList.contains('chat-header') ? f.width : this.style.width === 'max-content' ? f.required : 180;
    return { width, height: 140, left: 0, top: 0, right: width, bottom: 140 };
  });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('collapses overflowing tabs even above 480px and keeps every canvas reachable', async () => {
  await render(); expect(button('More')).toBeUndefined();
  expect(container.querySelector('[aria-label="Canvas tabs"]')).toBeTruthy();
  await act(() => button(tabs[11].title).click());
  expect(f.change).toHaveBeenCalledWith('canvas:canvas-11');
  expect(button('Messages')).toBeTruthy(); expect(button('Files')).toBeTruthy();
  await act(() => container.querySelector('[aria-label="Add canvas"]').click());
  expect(f.add).toHaveBeenCalledOnce(); expect(f.change).not.toHaveBeenCalledWith('canvas:add');
});
it('returns to full tabs when space is available and collapses again on resize', async () => {
  await render(); f.width = 1400; await resize(); expect(button('More')).toBeUndefined();
  f.width = 360; await resize(); expect(container.querySelector('[aria-label="More canvases"]')).toBeNull();
  expect(container.querySelector('[aria-label="Canvas tabs"]')).toBeTruthy();
  expect(container.querySelector('[aria-label="Messages"]')).toBeTruthy();
  expect(container.querySelector('[aria-label="Files"]')).toBeTruthy();
  expect(button(tabs[5].title)).toBeTruthy();
});
it('keeps the context menu inside the viewport and repositions on resize', async () => {
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000);
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(600);
  await act(() => root.render(<CanvasTabContextMenu canvasId="canvas" x={990} y={590} onClose={() => {}} />));
  const menu = document.querySelector('[role="menu"]'); expect(menu.parentElement).toBe(document.body);
  expect(menu.style.left).toBe('812px'); expect(menu.style.top).toBe('452px');
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(700);
  await act(() => window.dispatchEvent(new Event('resize'))); expect(menu.style.left).toBe('512px');
});
