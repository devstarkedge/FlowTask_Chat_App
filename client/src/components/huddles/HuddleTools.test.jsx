import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const feature=vi.hoisted(()=>({update:vi.fn(),screen:vi.fn()}));
vi.mock('../../services/huddleAudioService',()=>({toggleHuddleScreen:feature.screen,updateHuddleFeature:feature.update}));
import HuddleTools from './HuddleTools';
import HuddleSummary from './HuddleSummary';
let root,container;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.append(container);root=createRoot(container);vi.clearAllMocks();feature.update.mockResolvedValue({huddle:{notes:'Decision',notesVersion:1}});});
afterEach(async()=>{await act(()=>root.unmount());container.remove();});
const state={huddle:{notes:'Decision',notesVersion:0},participants:[{id:'one',name:'Alice',handRaised:false}]};
async function render(){await act(()=>root.render(<HuddleTools state={state} session={{id:'one'}} audio={{}}/>));}
async function click(text){await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent===text).click();await Promise.resolve();});}
it('captures only on Share click and sends own hand/reaction actions',async()=>{await render();expect(feature.screen).not.toHaveBeenCalled();await click('Share screen');expect(feature.screen).toHaveBeenCalledOnce();await click('Raise hand');expect(feature.update).toHaveBeenCalledWith('hand',{raised:true});await click('React');await click('👏');expect(feature.update).toHaveBeenCalledWith('reaction',{emoji:'👏'});});
it('opens shared notes without capturing and saves the loaded version',async()=>{await render();await click('Notes');expect(container.querySelector('textarea').value).toBe('Decision');await click('Save notes');expect(feature.update).toHaveBeenCalledWith('notes',{text:'Decision',version:0});expect(container.textContent).toContain('Notes saved');expect(feature.screen).not.toHaveBeenCalled();});
it('renders a persisted call summary and safe notes in chat',async()=>{await act(()=>root.render(<HuddleSummary message={{huddleMeta:{startedAt:'2026-01-01T00:00:00Z',endedAt:'2026-01-01T00:02:10Z',attendees:['A','B'],notes:'<script>not executable</script>'}}}/>));expect(container.textContent).toContain('2m 10s · 2 participants');expect(container.querySelector('details')).not.toBeNull();expect(container.querySelector('script')).toBeNull();});
