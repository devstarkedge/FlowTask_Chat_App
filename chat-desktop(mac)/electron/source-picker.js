let sources=[],selected=null,kind='screen';
const grid=document.querySelector('#sources'),share=document.querySelector('#share');
function render(){
  grid.replaceChildren();const visible=sources.filter(source=>source.kind===kind);
  document.querySelector('#empty').hidden=visible.length>0;
  for(const source of visible){
    const button=document.createElement('button');button.type='button';button.className='source';button.setAttribute('aria-pressed',String(selected===source.id));button.setAttribute('aria-label',source.name);
    const preview=document.createElement('div');preview.className='preview';
    if(source.thumbnail?.startsWith('data:image/')){const image=document.createElement('img');image.src=source.thumbnail;image.alt='';preview.append(image);}else preview.textContent='Preview unavailable';
    const label=document.createElement('div');label.className='label';
    if(source.icon?.startsWith('data:image/')){const icon=document.createElement('img');icon.src=source.icon;icon.alt='';label.append(icon);}
    const name=document.createElement('span');name.textContent=source.name;label.append(name);
    const check=document.createElement('span');check.className='check';check.textContent='✓';check.setAttribute('aria-hidden','true');
    button.append(preview,label,check);button.addEventListener('click',()=>{selected=source.id;render();grid.querySelector(`[aria-pressed="true"]`)?.focus();});grid.append(button);
  }
  share.disabled=!sources.some(source=>source.id===selected);
  for(const [id,type] of [['screens','screen'],['windows','window']])document.getElementById(id).setAttribute('aria-pressed',String(kind===type));
}
for(const [id,type] of [['screens','screen'],['windows','window']])document.getElementById(id).addEventListener('click',()=>{kind=type;selected=null;render();});
document.getElementById('cancel').addEventListener('click',()=>window.capturePicker.select(null));
share.addEventListener('click',()=>{if(selected && !share.disabled)window.capturePicker.select(selected,document.getElementById('share-audio').checked);});
document.addEventListener('keydown',event=>{if(event.key==='Escape')window.capturePicker.select(null);});
window.capturePicker.onSources((list,audioAvailable)=>{document.getElementById('audio-options').hidden=!audioAvailable;document.getElementById('share-audio').checked=false;sources=list;selected=null;kind=list.some(source=>source.kind==='screen')?'screen':'window';render();});
