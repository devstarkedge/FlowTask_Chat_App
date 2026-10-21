import {prepareScreenTrack} from './screenQuality.service.js';

// One compositor per local share, independent of the visible Huddle panel.
// Annotations are burned into the outgoing track: no new signaling protocol,
// and old clients also receive the drawing. Audio tracks pass through unchanged.
export class ScreenPresentation {
  async start(source) {
    this.stop();
    const generation=this.generation;
    this.source=source;
    const video=document.createElement('video');this.video=video;
    video.muted=true;video.playsInline=true;video.srcObject=source;
    this.canvas=document.createElement('canvas');
    this.ink=document.createElement('canvas');
    const context=this.canvas.getContext('2d',{alpha:false});
    this.inkContext=this.ink.getContext('2d');
    if(!context || !this.inkContext || !this.canvas.captureStream)throw new Error('Screen annotation is unavailable in this build.');
    await video.play();
    if(generation!==this.generation)throw new Error('Screen sharing was cancelled.');
    const settings=source.getVideoTracks()[0].getSettings();
    this.resize(video.videoWidth || settings.width || 1920,video.videoHeight || settings.height || 1080);
    const paint=()=>{
      if(generation!==this.generation)return;
      if(video.videoWidth && video.videoHeight)this.resize(video.videoWidth,video.videoHeight);
      context.drawImage(video,0,0,this.canvas.width,this.canvas.height);
      context.drawImage(this.ink,0,0);
    };
    paint();
    // Timers continue when the Huddle is minimized. requestAnimationFrame does not.
    this.timer=setInterval(paint,1000/15);
    this.output=this.canvas.captureStream(15);
    for(const track of source.getAudioTracks())this.output.addTrack(track);
    prepareScreenTrack(this.output.getVideoTracks()[0]);
    return this.output;
  }

  resize(width,height) {
    // Do not upscale a lower-resolution source; keep original pixel coordinates.
    const scale=Math.min(1,3840/width,2160/height);
    width=Math.max(1,Math.round(width*scale));height=Math.max(1,Math.round(height*scale));
    if(this.canvas.width===width && this.canvas.height===height)return;
    this.canvas.width=width;this.canvas.height=height;
    this.ink.width=width;this.ink.height=height;this.last=null;
  }

  point(point,{tool='pen',color='#facc15',start=false}={}) {
    if(!this.output || !['pen','eraser'].includes(tool))return;
    const x=Math.max(0,Math.min(1,point.x)),y=Math.max(0,Math.min(1,point.y));
    const from=start || !this.last?{x,y}:this.last;
    const context=this.inkContext;
    context.save();context.globalCompositeOperation=tool==='eraser'?'destination-out':'source-over';
    context.strokeStyle=/^#[0-9a-f]{6}$/i.test(color)?color:'#facc15';
    context.lineWidth=Math.max(3,this.ink.width/640)*(tool==='eraser'?7:1);
    context.lineCap='round';context.lineJoin='round';context.beginPath();
    context.moveTo(from.x*this.ink.width,from.y*this.ink.height);
    context.lineTo(x*this.ink.width+.01,y*this.ink.height+.01);context.stroke();context.restore();
    this.last={x,y};
  }

  endStroke(){this.last=null;}
  clear(){this.inkContext?.clearRect(0,0,this.ink.width,this.ink.height);this.last=null;}
  owns(stream){return this.output===stream;}
  stop() {
    this.generation=(this.generation || 0)+1;
    clearInterval(this.timer);this.timer=null;this.last=null;
    const source=this.source,output=this.output;this.source=this.output=null;
    for(const track of new Set([...(source?.getTracks() || []),...(output?.getTracks() || [])])){track.onended=null;track.stop();}
    if(this.video){this.video.pause();this.video.srcObject=null;}
    this.video=this.canvas=this.ink=this.inkContext=null;
  }
}

export const screenPresentation=new ScreenPresentation();

// Map pointer positions to the displayed video, excluding the Fit letterbox.
export function screenPoint(event,rect,width,height) {
  if(!width || !height || !rect.width || !rect.height)return null;
  const scale=Math.min(rect.width/width,rect.height/height);
  const w=width*scale,h=height*scale;
  const x=(event.clientX-rect.left-(rect.width-w)/2)/w;
  const y=(event.clientY-rect.top-(rect.height-h)/2)/h;
  return x<0 || y<0 || x>1 || y>1?null:{x,y};
}
