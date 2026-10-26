import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, ChevronDown, Settings, Hash, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCanvasStore } from '../../stores/canvasStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useAuthStore } from '../../stores/authStore';
import { canvasAPI, channelAPI, userAPI, messageAPI } from '../../services/api';
import { getCanvasUrl, getPublicCanvasUrl } from '../../utils/urlUtils';

const idOf = value => String(value?._id || value || '');
const previewText = content => {
  if (typeof content === 'string') return content.replace(/<[^>]*>/g, '').slice(0, 200);
  const text = node => node?.text || (node?.content || []).map(text).join(' ');
  return text(content).slice(0, 200) || null;
};
const buttonStyle = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 8 };

export default function CanvasShareModal({ canvas, isOpen, onClose, channelId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [saving, setSaving] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [sharing, setSharing] = useState(canvas?.sharing || { isPublic: false });
  const [toggling, setToggling] = useState(false);
  const toggleLock = useRef(false);
  const searchRef = useRef(null);
  const workspace = useWorkspaceStore(s => s.activeWorkspace);
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId);
  const user = useAuthStore(s => s.user);
  const canvasId = idOf(canvas?._id);

  useEffect(() => { setSharing(canvas?.sharing || { isPublic: false }); }, [canvas?._id, canvas?.sharing]);
  useEffect(() => {
    if (!isOpen) return;
    setQuery(''); setSelected(null); setAdvanced(false); setResults([]);
    searchRef.current?.focus();
  }, [isOpen, canvasId, workspaceId]);
  useEffect(() => {
    if (!isOpen) return;
    const key = event => { if (event.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [isOpen, onClose, saving]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true); setSearchError(''); setResults([]);
    const timer = setTimeout(async () => {
      const [people, channels] = await Promise.allSettled([
        userAPI.getDMContacts(query.trim()), channelAPI.search(query.trim().replace(/^#/, '')),
      ]);
      if (!active) return;
      const unique = new Map();
      if (people.status === 'fulfilled') {
        for (const person of people.value.data?.data?.contacts || []) {
          if ((person.chatUserId && idOf(person.chatUserId) === idOf(user?._id)) ||
              (person.flowTaskUserId && idOf(person.flowTaskUserId) === idOf(user?.flowTaskUserId))) continue;
          const id = idOf(person.chatUserId || person._id || person.flowTaskUserId);
          if (id) unique.set(`user:${id}`, { ...person, id, kind: 'user', key: `user:${id}` });
        }
      }
      if (channels.status === 'fulfilled') {
        for (const channel of channels.value.data?.data?.channels || []) {
          const id = idOf(channel._id);
          // People are listed once via the workspace directory, not again as DMs.
          if (!id || channel.type === 'dm' || channel.isArchived || channel.isAI || id === idOf(channelId || canvas?.channelId)) continue;
          unique.set(`channel:${id}`, { ...channel, id, kind: 'channel', key: `channel:${id}` });
        }
      }
      setResults([...unique.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      if (people.status === 'rejected' || channels.status === 'rejected') setSearchError('Some results could not be loaded. Try searching again.');
      setLoading(false);
    }, query ? 200 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [isOpen, query, workspaceId, channelId, canvas?.channelId, user?._id, user?.flowTaskUserId]);

  const matches = useMemo(() => {
    const q = query.trim().replace(/^#/, '').toLowerCase();
    return results.filter(item => !q || [item.name, item.email, item.slug].some(value => value?.toLowerCase().includes(q)));
  }, [results, query]);
  const copy = async url => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied to clipboard'); }
    catch { toast.error('Could not copy link'); }
  };
  const share = async () => {
    if (!canvasId || !selected || saving) return;
    setSaving(true);
    try {
      let destination = selected.id;
      if (selected.kind === 'user') {
        if (!selected.chatUserId) throw new Error('This person has not joined Chat yet.');
        const response = await channelAPI.createDM(idOf(selected.chatUserId));
        destination = idOf(response.data?.data?.channel?._id);
        if (!destination) throw new Error('Could not open the direct conversation.');
      }
      // Persist the editor snapshot before the server creates attachment grants.
      if (canvas?.content) await canvasAPI.update(canvasId, { content: canvas.content });
      await messageAPI.send(destination, {
        content: 'I shared a canvas', contentType: 'canvas_share',
        canvasMeta: { canvasId, title: canvas?.title || 'Untitled canvas',
          shareToken: sharing.isPublic ? sharing.publicToken : null,
          previewText: previewText(canvas?.content) },
      });
      toast.success(`Canvas shared with ${selected.name}`); onClose();
    } catch (error) { toast.error(error.response?.data?.error?.message || error.message || 'Failed to share canvas'); }
    finally { setSaving(false); }
  };
  const togglePublic = async () => {
    if (!canvasId || toggleLock.current) return;
    toggleLock.current = true; setToggling(true);
    try {
      const response = await canvasAPI.togglePublicShare(canvasId, !sharing.isPublic);
      const next = response.data?.data?.sharing;
      if (!response.data?.success || typeof next?.isPublic !== 'boolean') throw new Error('Sharing update failed');
      setSharing(next);
      useCanvasStore.setState(state => ({
        activeCanvas: idOf(state.activeCanvas?._id) === canvasId ? { ...state.activeCanvas, sharing: next } : state.activeCanvas,
        canvasesByChannel: Object.fromEntries(Object.entries(state.canvasesByChannel || {}).map(([id, items]) => [id, items.map(item => idOf(item._id) === canvasId ? { ...item, sharing: next } : item)])),
      }));
      toast.success(next.isPublic ? 'Public sharing enabled' : 'Public sharing disabled');
    } catch { toast.error('Failed to toggle public share'); }
    finally { toggleLock.current = false; setToggling(false); }
  };
  if (!isOpen) return null;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Share this canvas" style={{ width: 500, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: 12, background: 'var(--bg-primary, #fff)', color: 'var(--text-primary)', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '24px 24px 16px' }}>
          <div><h2 style={{ fontSize: 18, margin: 0 }}>Share this canvas</h2><p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{canvas?.title || 'Untitled canvas'}</p></div>
          <button aria-label="Close share modal" style={buttonStyle} disabled={saving} onClick={onClose}><X size={20}/></button>
        </header>
        <div style={{ padding: '0 24px 20px' }}>
          <input ref={searchRef} autoFocus placeholder="Search by name, channel or email" value={query} onChange={event => { setQuery(event.target.value); setSelected(null); }} style={{ boxSizing: 'border-box', width: '100%', padding: '12px 14px', border: '1px solid var(--border-primary)', borderRadius: 8, background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14 }}/>
          <div aria-label="Share destinations" style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8 }}>
            {loading ? <p role="status">Loading people and channels...</p> : matches.length === 0 ? <p role="status" style={{fontSize:13,color:'var(--text-muted)'}}>No matching people or channels</p> : matches.map(item => <button key={item.key} aria-pressed={selected?.key === item.key} onClick={() => setSelected(item)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 8px', border: 'none', borderRadius: 6, background: selected?.key === item.key ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>
              {item.kind === 'channel' ? <Hash size={18}/> : <User size={18}/>}
              <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontWeight: 500 }}>{item.name}</span><span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{item.kind === 'channel' ? 'Channel' : item.email || 'Direct message'}</span></span>
            </button>)}
            {searchError && <p role="alert" style={{fontSize:13}}>{searchError}</p>}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Share a link in a direct message or channel. Existing {workspace?.name || 'workspace'} access stays the same.</p>
          <button style={{...buttonStyle,display:'flex',alignItems:'center',gap:8,width:'100%',padding:'14px 0'}} onClick={() => setAdvanced(value => !value)} aria-expanded={advanced}><Settings size={18}/><span style={{flex:1,textAlign:'left'}}>Advanced Settings</span><ChevronDown size={18}/></button>
          {advanced && <div style={{padding:'8px 0',display:'flex',flexDirection:'column',gap:12}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><span>Public link</span><button disabled={toggling} onClick={togglePublic} style={{...buttonStyle,border:'1px solid var(--border-primary)',borderRadius:6}}>{toggling ? '...' : sharing.isPublic ? 'Enabled' : 'Disabled'}</button></div>{sharing.isPublic && sharing.publicToken && <button style={{...buttonStyle,textAlign:'left',color:'#3b82f6'}} onClick={() => copy(getPublicCanvasUrl(sharing.publicToken))}>Copy Public Link</button>}</div>}
        </div>
        <footer style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 24px',borderTop:'1px solid var(--border-secondary)'}}><button style={{...buttonStyle,display:'flex',alignItems:'center',gap:6,color:'#3b82f6'}} onClick={() => copy(getCanvasUrl(canvasId))}><Link2 size={16}/>Copy Link</button><button disabled={!selected || saving} onClick={share} style={{padding:'9px 18px',border:'none',borderRadius:7,background:'#1666aa',color:'#fff',cursor:selected?'pointer':'default',opacity: (!selected || saving) ? 0.5 : 1}}>{saving?'Sharing...':'Share'}</button></footer>
      </div>
    </div>, document.body,
  );
}
