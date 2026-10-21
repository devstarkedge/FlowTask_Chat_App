// Map pointer positions to the displayed video, excluding the Fit letterbox.
export function screenPoint(event,rect,width,height) {
  if(!width || !height || !rect.width || !rect.height)return null;
  const scale=Math.min(rect.width/width,rect.height/height);
  const w=width*scale,h=height*scale;
  const x=(event.clientX-rect.left-(rect.width-w)/2)/w;
  const y=(event.clientY-rect.top-(rect.height-h)/2)/h;
  return x<0 || y<0 || x>1 || y>1?null:{x,y};
}
