import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../stores/channelStore', () => ({ useChannelStore: { getState: () => ({ channels: [{ _id: 'receiving-conversation', type: 'dm' }] }) } }));
import CanvasDocumentCard from './CanvasDocumentCard';
vi.mock('../huddles/HuddleLinkCard', () => ({ default: () => null }));
vi.mock('../../features/huddle/utils/huddleLinks', () => ({ huddleLinksFromMessage: () => [] }));
import MessageContentResolver from './MessageContentResolver';

let root, container;
function Conversation() {
  const location = useLocation();
  const receivingChannel = location.pathname.match(/\/(?:dms|channel)\/([^/]+)/)?.[1] || 'receiving-conversation';
  return <><output>{location.pathname}</output><CanvasDocumentCard canvasId="shared-document" title="Sprint plan" previewText="Release checklist" channelId={receivingChannel} workspaceId="team" />
    {location.state?.targetTab === 'canvas:shared-document' && <section>Shared canvas editor</section>}</>;
}
it('opens from the workspace Home view using the receiving message conversation', async () => {
  await act(() => root.render(<MemoryRouter initialEntries={['/workspace/team']}><Routes>
    <Route path="/workspace/:workspaceId/*" element={<Conversation />} />
    <Route path="*" element={<p>Left the workspace</p>} />
  </Routes></MemoryRouter>));
  await act(() => container.querySelector('[role="button"]').click());
  expect(container.querySelector('output')?.textContent).toBe('/workspace/team/dms/receiving-conversation');
  expect(container.textContent).toContain('Shared canvas editor');
});
for (const content of ['structured', 'https://taskchat.example/canvas/shared-document', 'See https://taskchat.example/canvas/shared-document']) {
  it(`forwards the receiving conversation for ${content} shared messages opened from Home`, async () => {
    function SharedMessage() {
      const location = useLocation();
      const message = { workspaceId: { _id: 'team' }, channelId: { _id: 'receiving-conversation' },
        ...(content === 'structured' ? { contentType: 'canvas_share', canvasMeta: { canvasId: 'shared-document', title: 'Shared plan' } } : {}) };
      return <><output>{location.pathname}</output><MessageContentResolver rawContent={content} message={message}><p>Shared message</p></MessageContentResolver>
        <section>{location.state?.targetTab}</section></>;
    }
    await act(() => root.render(<MemoryRouter initialEntries={['/workspace/team']}><Routes>
      <Route path="/workspace/:workspaceId/*" element={<SharedMessage />} />
    </Routes></MemoryRouter>));
    await act(() => container.querySelector('[role="button"]').click());
    expect(container.querySelector('output')?.textContent).toBe('/workspace/team/dms/receiving-conversation');
    expect(container.querySelector('section')?.textContent).toBe('canvas:shared-document');
  });
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); });
for (const kind of ['dms', 'channel']) {
  it(`opens a shared canvas inside the receiving ${kind} without leaving the conversation`, async () => {
    const path = `/workspace/team/${kind}/receiving-conversation`;
    await act(() => root.render(<MemoryRouter initialEntries={[path]}><Routes>
      <Route path="/workspace/:workspaceId/*" element={<Conversation />} />
      <Route path="*" element={<p>Left the workspace</p>} />
    </Routes></MemoryRouter>));
    await act(() => container.querySelector('[role="button"]').click());
    expect(container.querySelector('output')?.textContent).toBe(path);
    expect(container.textContent).toContain('Shared canvas editor');
    expect(container.textContent).toContain('Sprint plan');
    expect(container.textContent).toContain('Release checklist');
  });
}
it('keeps standalone internal links usable outside a conversation', async () => {
  await act(() => root.render(<MemoryRouter initialEntries={['/later']}><Routes>
    <Route path="/later" element={<CanvasDocumentCard canvasId="shared-document" />} />
    <Route path="/canvas/:canvasId" element={<p>Standalone canvas</p>} />
  </Routes></MemoryRouter>));
  await act(() => container.querySelector('[role="button"]').click());
  expect(container.textContent).toBe('Standalone canvas');
});
it('keeps public shares on the public view-only route', async () => {
  await act(() => root.render(<MemoryRouter initialEntries={['/workspace/team/dms/receiver']}><Routes>
    <Route path="/workspace/:workspaceId/*" element={<CanvasDocumentCard isPublic token="public-token" canvasId="shared-document" />} />
    <Route path="/public/canvas/:token" element={<p>Public canvas</p>} />
  </Routes></MemoryRouter>));
  await act(() => container.querySelector('[role="button"]').click());
  expect(container.textContent).toBe('Public canvas');
});
it('opens from a highlighted message using the keyboard and removes the old message target', async () => {
  await act(() => root.render(<MemoryRouter initialEntries={['/workspace/team/dms/receiver/message/old-message']}><Routes>
    <Route path="/workspace/:workspaceId/*" element={<Conversation />} />
  </Routes></MemoryRouter>));
  await act(() => container.querySelector('[role="button"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(container.querySelector('output').textContent).toBe('/workspace/team/dms/receiver');
  expect(container.textContent).toContain('Shared canvas editor');
});
