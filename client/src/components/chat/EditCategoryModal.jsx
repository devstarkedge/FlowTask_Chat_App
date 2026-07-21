import { useState, useRef, useEffect } from "react";
import { useChannelStore } from "../../stores/channelStore";
import { X, FolderEdit } from 'lucide-react';
import Loader from '../shared/Loader';
import toast from "react-hot-toast";
import { categoryAPI } from "../../services/api";

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
  .ccm-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 16px 20px 20px; border-top: 1px solid var(--border-primary); }
  .ccm-btn-cancel { padding: 9px 18px; border-radius: 10px; border: 1px solid var(--border-primary); background: transparent; color: var(--text-secondary); font-size: 13px; font-weight: 600; cursor: pointer; }
  .ccm-btn-cancel:hover { background: var(--surface-hover, var(--bg-hover)); color: var(--text-primary); }
  .ccm-btn-submit { padding: 9px 20px; border-radius: 10px; border: none; background: var(--accent-primary); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 7px; }
  .ccm-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
`;

export default function EditCategoryModal({ category, onClose }) {
  const { fetchCategories } = useChannelStore();
  const [name, setName] = useState(category.name);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const nameInputRef = useRef(null);

  useEffect(() => { nameInputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error("Category name is required");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await categoryAPI.update(category._id, { name: cleanName });
      toast.success("Category updated");
      await fetchCategories();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update category");
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
              <FolderEdit size={20} color="var(--accent-primary)" />
            </div>
          </div>
          <div className="ccm-header__copy">
            <h2 className="ccm-header__title">Edit Category</h2>
            <p className="ccm-header__sub">Rename your custom category</p>
          </div>
          <button className="ccm-header__close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="ccm-body">
          <div className="ccm-field">
            <div className="ccm-label">Category Name</div>
            <div className="ccm-input-wrap">
              <input
                ref={nameInputRef}
                className="ccm-input"
                type="text"
                placeholder="e.g. Project Alpha"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
              />
            </div>
          </div>
        </form>

        <div className="ccm-footer">
          <button type="button" className="ccm-btn-cancel" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" className="ccm-btn-submit" onClick={handleSubmit} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? (
              <><Loader size="sm" /> Saving...</>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
