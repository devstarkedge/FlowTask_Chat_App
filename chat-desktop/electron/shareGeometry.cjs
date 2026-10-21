// Electron exposes display bounds and bounds for windows owned by this app.
// Keep geometry entirely in JavaScript; external windows get no guessed border.
const windowSourceKey=id=>/^window:(\d+):\d+$/.exec(id || '')?.[1];
function createShareGeometry({screen,BrowserWindow}){
 return {
  track(source,changed,closed){
   if(source.id.startsWith('screen:')){
    const refresh=()=>{const display=screen.getAllDisplays().find(d=>String(d.id)===String(source.display_id));display?changed(display.bounds):closed();};
    refresh();screen.on('display-metrics-changed',refresh);screen.on('display-removed',refresh);
    return()=>{screen.removeListener('display-metrics-changed',refresh);screen.removeListener('display-removed',refresh);};
   }
   const key=windowSourceKey(source.id);if(!key)return()=>{};
   const own=BrowserWindow.getAllWindows().find(window=>{
    return !window.isDestroyed() && windowSourceKey(window.getMediaSourceId())===key;
   });
   if(own){
    const refresh=()=>changed(own.isMinimized() || !own.isVisible()?null:{...own.getBounds(),captureBounds:own.getContentBounds?.() || own.getBounds()});
    for(const event of ['move','resize','show','hide','minimize','restore'])own.on(event,refresh);
    own.once('closed',closed);refresh();
    return()=>{for(const event of ['move','resize','show','hide','minimize','restore'])own.removeListener(event,refresh);own.removeListener('closed',closed);};
   }
   changed(null);
   return()=>{};
  },
 };
}
function toolbarBounds(bounds,screen,width=620,height=86){
 const area=screen.getDisplayMatching(bounds).workArea;
 return {x:Math.round(Math.max(area.x,Math.min(bounds.x+(bounds.width-width)/2,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(bounds.y+8,area.y+area.height-height))),width:Math.min(width,area.width),height};
}
module.exports={createShareGeometry,toolbarBounds,windowSourceKey};
