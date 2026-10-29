const ringtoneUrl=new URL('../assets/huddle-incoming.wav',import.meta.url).href;

// One local audio element per ringing invitation, including when hidden to tray.
export class HuddleRingtone {
  constructor({Audio=globalThis.Audio,url=ringtoneUrl}={}){this.Audio=Audio;this.url=url;this.audio=null;this.id=null;}
  async start(id){
    if(!this.Audio)return Promise.reject(new Error('Call sound is unavailable.'));
    if(this.id!==id){this.stop();this.id=id;this.audio=new this.Audio(this.url);this.audio.loop=true;this.audio.volume=1;}
    return Promise.resolve(this.audio.play());
  }
  stop(){if(this.audio){this.audio.pause();this.audio.currentTime=0;this.audio.src='';}this.audio=null;this.id=null;}
}
