import {expect,it,vi} from 'vitest';
import {openHuddlePopout,huddleCaptureDevices} from './huddlePopout.service';
it('ports presentation/styles to a separate document without copying credentials or creating media, then cleans up',()=>{
  const doc=document.implementation.createHTMLDocument('');
  const listeners={},capture={getDisplayMedia:vi.fn()},onClosed=vi.fn();
  const popup={document:doc,navigator:{mediaDevices:capture},closed:false,addEventListener:(event,fn)=>listeners[event]=fn,removeEventListener:vi.fn(),close:vi.fn()};
  const opener={document,open:vi.fn(()=>popup)};
  const handle=openHuddlePopout({label:'Design',onClosed,opener});
  expect(opener.open).toHaveBeenCalledWith('about:blank','taskchat-huddle');expect(doc.title).toBe('TaskChat — Huddle · Design');expect(handle.host.ownerDocument).toBe(doc);
  expect(huddleCaptureDevices()).toBe(capture);expect(capture.getDisplayMedia).not.toHaveBeenCalled();expect(doc.querySelector('script')).toBeNull();expect(doc.body.className).toBe('huddle-popout');
  handle.close();handle.close();expect(popup.close).toHaveBeenCalledOnce();expect(onClosed).not.toHaveBeenCalled();expect(huddleCaptureDevices()).toBe(navigator.mediaDevices);
});
it('reports a user-closed window once and restores capture to the original window',()=>{
  const doc=document.implementation.createHTMLDocument(''),listeners={},onClosed=vi.fn();
  const popup={document:doc,navigator:{mediaDevices:{}},closed:false,addEventListener:(event,fn)=>listeners[event]=fn,removeEventListener:vi.fn(),close:vi.fn()};
  const handle=openHuddlePopout({onClosed,opener:{document,open:()=>popup}});
  listeners.pagehide();listeners.pagehide();handle.close();expect(onClosed).toHaveBeenCalledOnce();expect(huddleCaptureDevices()).toBe(navigator.mediaDevices);
});
