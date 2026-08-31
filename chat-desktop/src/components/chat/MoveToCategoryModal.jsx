import { useState, useMemo, useEffect } from "react";
import { useChannelStore } from "../../stores/channelStore";
import { X, Search, Check, FolderInput, Hash, Lock, Volume2 } from 'lucide-react';
import Loader from '../shared/Loader';
import toast from "react-hot-toast";
import api from "../../services/api";
import { isPersonalCategoryChannel } from "../../utils/channelOrigin";

const STYLES = `
  .ccm-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--overlay-bg, rgba(0,0,0,0.55)); backdrop-filter: blur(8px); animation: ccm-overlay-in 180ms ease; }
  @keyframes ccm-overlay-in { from { opacity:0; } to { opacity:1; } }
  .ccm-shell { position: relative; width: 100%; max-width: 460px; border-radius: 20px; overflow: hidden; background: var(--bg-modal, var(--surface-primary)); border: 1px solid var(--border-primary); box-shadow: 0 32px 80px rgba(0,0,0,0.55); }
  .ccm-stripe { height: 3px; width: 100%; background: linear-gradient(90deg, var(--accent-primary) 0%, #7c3aed 100%); }
  .ccm-header { display: flex; align-items: center; gap: 13px; padding: 18px 20px; border-bottom: 1px solid var(--border-primary); }
  .ccm-header__copy { flex: 1; min-width: 0; }
  .ccm-header__title { font-size: 15px; font-weight: 800; color: var(--text-white); margin: 0 0 2px; }
  .ccm-header__sub { font-size: 12px; color: var(--text-muted); margin: 0; }
  .ccm-header__close { width: 30px; height: 30px; border-radius: 8px; border: none; background: transparent; color: var(--text-muted); display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .ccm-header__close:hover { background: var(--surface-hover, var(--bg-hover)); color: var(--text-primary); }
  .ccm-body { padding: 20px; display: flex; flex-direction: column; gap: 20px; max-height: 52vh; overflow-y: auto; }
  .ccm-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px; }
  .ccm-input-wrap { display: flex; align-items: center; gap: 10px; background: var(--bg-input, var(--surface-secondary)); border: 1.5px solid var(--border-primary); border-radius: 12px; padding: 11px 14px; }
  .ccm-input-wrap:focus-within { border-color: var(--accent-primary); background: var(--surface-primary, var(--bg-primary)); }
  .ccm-input { flex: 1; background: transparent; border: none; outline: none; color: var(--text-primary); font-size: 14px; }
  .ccm-search-results { margin-top: 6px; background: var(--bg-modal, var(--surface-primary)); border: 1px solid var(--border-primary); border-radius: 12px; max-height: 240px; overflow-y: auto; }
  .ccm-search-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; }
  .ccm-search-row:hover { background: var(--surface-hover, var(--bg-hover)); }
  .ccm-search-row.is-selected { background: color-mix(in srgb, var(--accent-primary) 5%, transparent); }
  .ccm-search-row__name { font-size: 13px; color: var(--text-primary); flex: 1; }
  .ccm-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 16px 20px 20px; border-top: 1px solid var(--border-primary); }
  .ccm-btn-cancel { padding: 9px 18px; border-radius: 10px; border: 1px solid var(--border-primary); background: transparent; color: var(--text-secondary); font-size: 13px; font-weight: 600; cursor: pointer; }
  .ccm-btn-cancel:hover { background: var(--surface-hover, var(--bg-hover)); color: var(--text-primary); }
  .ccm-btn-submit { padding: 9px 20px; border-radius: 10px; border: none; background: var(--accent-primary); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 7px; }
  .ccm-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
  .ccm-selected-users { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; max-height: 90px; overflow-y: auto; }
  .ccm-selected-chip { display: inline-flex; align-items: center; gap: 6px; background: color-mix(in srgb, var(--accent-primary) 12%, var(--surface-secondary)); border: 1px solid color-mix(in srgb, var(--accent-primary) 22%, var(--border-primary)); padding: 4px 8px; border-radius: 999px; }
  .ccm-selected-chip__name { font-size: 11.5px; font-weight: 600; color: var(--text-primary); }
  .ccm-selected-chip__remove { background: transparent; border: none; color: var(--text-muted); cursor: pointer; }
`;

function getChannelIcon(channel) {
  if (channel.visibility === 'private' || channel.type === 'private') return <Lock size={14} />;
  if (channel.type === 'system') return <Volume2 size={14} />;
  return <Hash size={14} />;
}

export default function MoveToCategoryModal({ initialCategory, onClose }) {
  const { channels, fetchChannels } = useChannelStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChannels, setSelectedChannels] = useState([]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nonDmChannels = useMemo(() => {
    return channels.filter(c => {
      if (!isPersonalCategoryChannel(c)) return false;
      const cCatId = c.categoryId?._id ?? c.categoryId;
      return String(cCatId ?? '') !== String(initialCategory ?? '');
    });
  }, [channels, initialCategory]);

  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return nonDmChannels.filter(c => 
      c.name?.toLowerCase().includes(q) &&
      !selectedChannels.some(s => s._id === c._id)
    );
  }, [searchQuery, nonDmChannels, selectedChannels]);

  const handleToggleChannel = (ch) => {
    if (selectedChannels.some(s => s._id === ch._id)) {
      setSelectedChannels(prev => prev.filter(s => s._id !== ch._id));
    } else {
      setSelectedChannels(prev => [...prev, ch]);
      setSearchQuery("");
    }
  };

  const handleRemoveChannel = (id) => {
    setSelectedChannels(prev => prev.filter(s => s._id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedChannels.length === 0) return;
    
    setIsSubmitting(true);
    try {
      await api.post(`/categories/${initialCategory}/bulk-channels`, {
        channelIds: selectedChannels.map(c => c._id),
      });
      
      toast.success(`Channels moved to category`);
      // Update store so it fetches latest structure
      await fetchChannels();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to move channels");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ccm-overlay" onClick={onClose}>
      <style>{STYLES}</style>
      <div className="ccm-shell" onClick={(e) => e.stopPropagation()}>
        <div className="ccm-stripe" />
        
        <div className="ccm-header">
          <div className="ccm-header__icon-ring">
            <div style={{ width: 37, height: 37, borderRadius: '50%', background: 'var(--bg-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FolderInput size={20} color="var(--accent-primary)" />
            </div>
          </div>
          <div className="ccm-header__copy">
            <h2 className="ccm-header__title">Move Channels</h2>
            <p className="ccm-header__sub">Move channels into this category</p>
          </div>
          <button className="ccm-header__close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="ccm-body">
          <div className="ccm-field">
            {selectedChannels.length > 0 && (
              <div className="ccm-selected-users">
                {selectedChannels.map(ch => (
                  <div key={ch._id} className="ccm-selected-chip">
                    {getChannelIcon(ch)}
                    <span className="ccm-selected-chip__name">{ch.name}</span>
                    <button
                      type="button"
                      className="ccm-selected-chip__remove"
                      onClick={() => handleRemoveChannel(ch._id)}
                    >
                      <X size={10} strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="ccm-input-wrap">
              <Search size={16} className="ccm-input-wrap__icon" />
              <input
                className="ccm-input"
                type="text"
                placeholder="Search channels to add..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            <div className="ccm-search-results">
              {searchResults.length === 0 ? (
                <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                  No channels found matching "{searchQuery}"
                </div>
              ) : (
                searchResults.map(ch => {
                  const isSelected = selectedChannels.some(s => s._id === ch._id);
                  return (
                    <div
                      key={ch._id}
                      className={`ccm-search-row ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => handleToggleChannel(ch)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: 'var(--surface-secondary)', color: 'var(--text-muted)' }}>
                        {getChannelIcon(ch)}
                      </div>
                      <span className="ccm-search-row__name">{ch.name}</span>
                      {isSelected ? (
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={10} strokeWidth={3} />
                        </div>
                      ) : (
                        <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--border-primary)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <X size={10} style={{ transform: 'rotate(45deg)' }} />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </form>

        <div className="ccm-footer">
          <button type="button" className="ccm-btn-cancel" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" className="ccm-btn-submit" onClick={handleSubmit} disabled={isSubmitting || selectedChannels.length === 0}>
            {isSubmitting ? (
              <><Loader size="sm" /> Moving...</>
            ) : (
              'Move Channels'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
