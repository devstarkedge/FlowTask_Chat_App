import {it,expect,vi,afterEach} from 'vitest';
import {ScreenAnnotations} from './screenAnnotations.service';
afterEach(()=>vi.useRealTimers());
const start={id:'event-1',shareId:'share-1',creatorSessionId:'alice',type:'start',strokeId:'stroke-1',tool:'pen',color:'#facc15',points:[{x:.2,y:.3}]};
it('draws optimistically during snapshot loading and replays once',async()=>{
  const store=new ScreenAnnotations();let resolve;
  const pending=store.sync('share-1',()=>new Promise(done=>{resolve=done;}));
  store.receive(start,{optimistic:true});expect(store.get('share-1')).toHaveLength(1);
  resolve({events:[start]});await pending;expect(store.get('share-1')).toHaveLength(1);
  store.receive({...start,id:'move',type:'move',points:[{x:.4,y:.5}]});
  store.receive({...start,id:'move',type:'move',points:[{x:.4,y:.5}]});expect(store.get('share-1')[0].points).toHaveLength(2);
  store.receive({...start,id:'clear',type:'clear'});expect(store.get('share-1')).toEqual([]);store.reset();
});
it('keeps laser transient, deduplicated and isolated from drawings and other generations',()=>{
  vi.useFakeTimers();const store=new ScreenAnnotations();store.receive(start);
  const event={id:'pointer',shareId:'share-1',type:'pointer',points:[{x:.7,y:.8}]};
  store.receive(event);const revision=store.snapshot();store.receive(event);
  expect(store.snapshot()).toBe(revision);expect(store.pointer('share-1')).toEqual({x:.7,y:.8});expect(store.get('share-1')).toHaveLength(1);
  expect(store.pointer('share-2')).toBeUndefined();vi.advanceTimersByTime(2000);expect(store.pointer('share-1')).toBeUndefined();
  store.receive({...event,id:'again'});store.receive({id:'hide',shareId:'share-1',type:'pointer-hide'});expect(store.pointer('share-1')).toBeUndefined();
  store.receive({...event,id:'last'});store.reset('share-1');expect(store.pointerTimers.size).toBe(0);expect(store.get('share-1')).toEqual([]);
});
