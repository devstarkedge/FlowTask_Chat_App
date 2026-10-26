import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import * as Y from 'yjs';
const feature=vi.hoisted(()=>({update:vi.fn(),screen:vi.fn(),request:vi.fn(),ingest:vi.fn()}));
vi.mock('../../services/huddleAudioService',()=>({toggleHuddleScreen:feature.screen,updateHuddleFeature:feature.update}));
vi.mock('../../services/huddleRequest',()=>({sendHuddleRequest:feature.request}));
vi.mock('../../stores/huddleStore',()=>({useHuddleStore:{getState:()=>({session:{id:'one'},ingest:feature.ingest})}}));
import {disposeSharedNotesSession} from '../../features/huddle/services/sharedNotes.service';
import HuddleTools from './HuddleTools';
import HuddleSummary from './HuddleSummary';
let root,container,notesDoc;
const encoded=doc=>btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc)));
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;container=globalThis.document.createElement('div');globalThis.document.body.append(container);root=createRoot(container);vi.clearAllMocks();feature.update.mockResolvedValue({huddle:{notes:'Decision',notesVersion:1}});notesDoc=new Y.Doc();notesDoc.getText('notes').insert(0,'Decision');feature.request.mockImplementation(async()=>({state:{notesDocument:encoded(notesDoc),huddle:{notes:'Decision',notesVersion:1}}}));});
afterEach(async()=>{await act(()=>root.unmount());disposeSharedNotesSession('one');notesDoc.destroy();container.remove();vi.useRealTimers();});
const state={huddle:{notes:'Decision',notesVersion:0},participants:[{id:'one',name:'Alice',handRaised:false}]};
async function render(snapshot=state){await act(()=>root.render(<HuddleTools state={snapshot} session={{id:'one',channelId:'channel'}} audio={{}}/>));}
async function click(text){await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent===text).click();await Promise.resolve();});}
it('captures only on Share click and sends own hand/reaction actions',async()=>{await render();expect(feature.screen).not.toHaveBeenCalled();await click('Share screen');expect(feature.screen).toHaveBeenCalledOnce();await click('Raise hand');expect(feature.update).toHaveBeenCalledWith('hand',{raised:true});await click('React');await click('👏');expect(feature.update).toHaveBeenCalledWith('reaction',{emoji:'👏'});});
it('opens the shared draft and saves it without capturing media',async()=>{await render();await click('Notes');expect(container.querySelector('textarea').value).toBe('Decision');await click('Save notes');expect(feature.request).toHaveBeenCalledWith('notes-save',{channelId:'channel'});expect(container.textContent).toContain('Notes saved');expect(feature.screen).not.toHaveBeenCalled();});
it('updates open notes live and shows the other editor name until typing expires',async()=>{
 vi.useFakeTimers();await render();await click('Notes');notesDoc.getText('notes').insert(8,' shared');
 await render({...state,notesDocument:encoded(notesDoc),participants:[...state.participants,{id:'two',name:'Bob',connection:'connected',notesTypingAt:Date.now()}]});
 expect(container.querySelector('textarea').value).toBe('Decision shared');expect(container.textContent).toContain('Bob is typing');
 await act(()=>vi.advanceTimersByTimeAsync(6000));expect(container.textContent).not.toContain('Bob is typing');
});
it('renders a persisted call summary and safe notes in chat',async()=>{await act(()=>root.render(<HuddleSummary message={{huddleMeta:{startedAt:'2026-01-01T00:00:00Z',endedAt:'2026-01-01T00:02:10Z',attendees:['A','B'],notes:'<script>not executable</script>'}}}/>));expect(container.textContent).toContain('2m 10s · 2 participants');expect(container.querySelector('details')).not.toBeNull();expect(container.querySelector('script')).toBeNull();});
