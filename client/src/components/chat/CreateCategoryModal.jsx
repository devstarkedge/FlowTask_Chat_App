import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useChannelStore } from "../../stores/channelStore";
import { X, Search, Check, FolderPlus, Hash, Lock, Volume2, Users, ChevronDown } from 'lucide-react';
import Loader from '../shared/Loader';
import toast from "react-hot-toast";
import api, { categoryAPI } from "../../services/api";
import EmojiPickerPortal from "./EmojiPickerPortal";

let departmentSyncInFlight = null;

function synchronizeDepartmentsSingleFlight() {
  if (departmentSyncInFlight) return departmentSyncInFlight;

  const request = categoryAPI.syncDepartments();
  departmentSyncInFlight = request;
  const clearRequest = () => {
    if (departmentSyncInFlight === request) departmentSyncInFlight = null;
  };
  request.then(clearRequest, clearRequest);
  return request;
}

const STYLES = `
  .ccm-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); animation: ccm-overlay-in 180ms ease; }
  @keyframes ccm-overlay-in { from { opacity:0; } to { opacity:1; } }
  .ccm-shell { position: relative; width: 100%; max-width: 480px; border-radius: 12px; overflow: hidden; background: var(--bg-primary, #ffffff); box-shadow: 0 8px 30px rgba(0,0,0,0.2); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .ccm-header { display: flex; align-items: flex-start; padding: 24px 24px 20px; border-bottom: 1px solid var(--border-primary, #EBECEF); }
  .ccm-header__icon { margin-right: 12px; color: var(--accent-primary, #005A9E); display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; }
  .ccm-header__copy { flex: 1; }
  .ccm-header__title { font-size: 18px; font-weight: 700; color: var(--text-primary, #1D1C1D); margin: 0 0 4px; }
  .ccm-header__sub { font-size: 13px; color: var(--text-secondary, #616061); margin: 0; }
  .ccm-header__close { background: transparent; border: none; color: var(--text-secondary, #616061); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
  .ccm-header__close:hover { background: var(--bg-secondary, #F8F8F8); color: var(--text-primary, #1D1C1D); }
  .ccm-type-selector { padding: 16px 24px; border-bottom: 1px solid var(--border-primary, #EBECEF); display: flex; flex-direction: column; gap: 12px; }
  .ccm-radio-label { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--text-primary, #1D1C1D); cursor: pointer; }
  .ccm-radio-input { cursor: pointer; width: 16px; height: 16px; accent-color: var(--accent-primary, #005A9E); }
  .ccm-body { padding: 24px; display: flex; flex-direction: column; gap: 24px; max-height: 55vh; overflow-y: auto; }
  .ccm-field-group { display: flex; flex-direction: column; gap: 8px; }
  .ccm-label { font-size: 12px; font-weight: 700; color: var(--text-secondary, #616061); text-transform: uppercase; letter-spacing: 0.5px; }
  .ccm-select-wrap { position: relative; display: flex; align-items: center; border: 1px solid var(--border-secondary, #CFCFCF); border-radius: 6px; padding: 10px 14px; background: var(--bg-primary, #fff); cursor: pointer; transition: all 0.2s ease; }
  .ccm-select-wrap:hover { border-color: var(--text-secondary, #8C8C8C); }
  .ccm-select-wrap.is-open { border-color: var(--accent-primary, #005A9E); box-shadow: 0 0 0 3px var(--accent-primary-alpha, rgba(0, 90, 158, 0.15)); }
  .ccm-select-val { flex: 1; font-size: 14px; color: var(--text-primary, #1D1C1D); display: flex; align-items: center; gap: 8px; }
  .ccm-select-val.is-placeholder { color: var(--text-secondary, #616061); }
  .ccm-dropdown { margin-top: 4px; background: var(--bg-primary, #fff); border: 1px solid var(--border-primary, #EBECEF); border-radius: 6px; max-height: 220px; overflow-y: auto; }
  .ccm-dropdown-item { padding: 10px 14px; font-size: 14px; color: var(--text-primary, #1D1C1D); cursor: pointer; display: flex; align-items: center; gap: 8px; }
  .ccm-dropdown-item:hover { background: var(--bg-secondary, #F8F8F8); }
  .ccm-input-wrap { display: flex; align-items: center; gap: 10px; border: 1px solid var(--border-secondary, #CFCFCF); border-radius: 6px; padding: 10px 14px; background: var(--bg-primary, #fff); transition: all 0.2s ease; }
  .ccm-input-wrap:focus-within { border-color: var(--accent-primary, #005A9E); box-shadow: 0 0 0 3px var(--accent-primary-alpha, rgba(0, 90, 158, 0.15)); }
  .ccm-input { flex: 1; background: transparent; border: none; outline: none; font-size: 14px; color: var(--text-primary, #1D1C1D); }
  .ccm-input::placeholder { color: var(--text-secondary, #616061); }
  .ccm-search-results { margin-top: 8px; border: 1px solid var(--border-primary, #EBECEF); border-radius: 6px; max-height: 160px; overflow-y: auto; }
  .ccm-search-row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; border: 0; background: transparent; text-align: left; font: inherit; cursor: pointer; }
  .ccm-search-row:hover { background: var(--bg-secondary, #F8F8F8); }
  .ccm-search-row.is-selected { background: var(--accent-primary-light, rgba(0, 90, 158, 0.05)); }
  .ccm-search-row__name { font-size: 13px; color: var(--text-primary, #1D1C1D); flex: 1; }
  .ccm-footer { padding: 16px 24px; border-top: 1px solid var(--border-primary, #EBECEF); display: flex; justify-content: flex-end; gap: 12px; background: var(--bg-primary, #fff); }
  .ccm-btn-cancel { padding: 9px 18px; border-radius: 6px; border: 1px solid var(--border-secondary, #CFCFCF); background: var(--bg-primary, #fff); color: var(--text-primary, #1D1C1D); font-size: 14px; font-weight: 600; cursor: pointer; }
  .ccm-btn-cancel:hover { background: var(--bg-secondary, #F8F8F8); }
  .ccm-btn-submit { padding: 9px 18px; border-radius: 6px; border: none; background: var(--accent-primary, #007a5a); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
  .ccm-btn-submit:hover { background: var(--accent-hover, #148567); }
  .ccm-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
  .ccm-dept-item { border: 1px solid var(--border-primary, #EBECEF); border-radius: 6px; margin-bottom: 8px; background: var(--bg-primary, #fff); overflow: hidden; transition: all 0.2s ease; }
  .ccm-dept-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; background: var(--bg-primary, #fff); color: var(--text-primary, #1D1C1D); font-size: 14px; font-weight: 500; }
  .ccm-dept-header:hover { background: var(--bg-secondary, #F8F8F8); }
  .ccm-dept-header.is-selected { background: var(--bg-secondary, #F8F8F8); border-bottom: 1px solid var(--border-primary, #EBECEF); }
  .ccm-dept-channels { padding: 12px 16px; background: var(--bg-primary, #fff); display: flex; flex-direction: column; gap: 8px; }
  .ccm-dept-channel-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary, #616061); }
  .ccm-selected-users { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  .ccm-selected-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--bg-secondary, #F8F8F8); border: 1px solid var(--border-primary, #EBECEF); padding: 4px 10px; border-radius: 16px; }
  .ccm-selected-chip__name { font-size: 12px; font-weight: 500; color: var(--text-primary, #1D1C1D); }
  .ccm-selected-chip__remove { background: transparent; border: none; color: var(--text-secondary, #616061); cursor: pointer; display: flex; align-items: center; padding: 0; }
  .ccm-selected-chip__remove:hover { color: var(--text-primary, #1D1C1D); }
`;

function getChannelIcon(channel) {
  if (channel.visibility === 'private' || channel.type === 'private') return <Lock size={14} color="var(--text-secondary, #616061)" />;
  if (channel.type === 'system') return <Volume2 size={14} color="var(--text-secondary, #616061)" />;
  return <Hash size={14} color="var(--text-secondary, #616061)" />;
}

export default function CreateCategoryModal({ onClose }) {
  const { channels, categories, fetchCategories, fetchChannels, isLoading: channelsLoading } = useChannelStore();
  
  // Category Type
  const [categoryType, setCategoryType] = useState(() => {
    if (categories.some((category) => category.type === 'department')) return 'department';
    if (categories.some((category) => category.type === 'custom')) return 'custom';
    return 'department';
  });
  
  // Department State
  const [departments, setDepartments] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [departmentError, setDepartmentError] = useState(null);
  const [expandedDepts, setExpandedDepts] = useState({});
  const departmentLoadSequence = useRef(0);
  const channelRefreshStarted = useRef(false);

  // Custom Category State
  const [customName, setCustomName] = useState("");
  const [customIcon, setCustomIcon] = useState("✨");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiBtnRef = useRef(null);

  // Common State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChannels, setSelectedChannels] = useState([]);

  const loadDepartments = useCallback(async () => {
    const requestSequence = ++departmentLoadSequence.current;
    setLoadingDepts(true);
    setDepartmentError(null);

    try {
      const { data } = await synchronizeDepartmentsSingleFlight();
      if (requestSequence !== departmentLoadSequence.current) return;
      setDepartments(Array.isArray(data.data) ? data.data : []);
    } catch (syncError) {
      try {
        const { data } = await categoryAPI.getDepartments();
        if (requestSequence !== departmentLoadSequence.current) return;
        const cachedDepartments = Array.isArray(data.data) ? data.data : [];
        setDepartments(cachedDepartments);
        if (cachedDepartments.length === 0) {
          setDepartmentError(
            syncError.response?.data?.error?.message
              || 'Unable to synchronize departments from FlowTask.',
          );
        }
      } catch {
        if (requestSequence !== departmentLoadSequence.current) return;
        setDepartments([]);
        setDepartmentError('Unable to load departments. Check your FlowTask session and try again.');
      }
    } finally {
      if (requestSequence === departmentLoadSequence.current) {
        setLoadingDepts(false);
      }
    }
  }, []);

  // Synchronize before displaying departments. The sequence guard makes the
  // effect safe under React Strict Mode and ignores stale responses.
  useEffect(() => {
    loadDepartments();
    return () => { departmentLoadSequence.current += 1; };
  }, [loadDepartments]);

  // Refresh through the membership-filtered channel endpoint once per modal
  // instance. This keeps the picker authoritative after assignment changes.
  useEffect(() => {
    if (channelRefreshStarted.current) return;
    channelRefreshStarted.current = true;
    fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Toggle department expansion
  const toggleDeptExpand = (deptId) => {
    setExpandedDepts(prev => ({
      ...prev,
      [deptId]: !prev[deptId]
    }));
  };

  // Derived: Channels linked to a department
  const getDeptChannels = (dept) => {
    const targetDeptId = dept.externalId || dept._id;
    return channels.filter(c => {
      if (c.isArchived) return false;
      const isDepartmentChannel = c.flowTaskRef?.entityType === "department" && String(c.flowTaskRef?.entityId) === String(targetDeptId);
      const isProjectInDepartment = c.departmentRef?.departmentId && String(c.departmentRef.departmentId) === String(targetDeptId);
      return isDepartmentChannel || isProjectInDepartment;
    });
  };

  const nonDmChannels = useMemo(() => {
    return channels
      .filter(c => c.type !== 'dm' && c.type !== 'self' && !c.isArchived)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [channels]);

  const existingDepartmentIds = useMemo(() => new Set(
    categories
      .filter((category) => category.type === 'department')
      .flatMap((category) => [
        category.departmentId?._id,
        category.departmentId?.externalId,
        category.departmentId,
      ])
      .filter((id) => typeof id === 'string')
      .map(String),
  ), [categories]);
  const hasDepartmentCategory = existingDepartmentIds.size > 0;

  const missingDepartments = useMemo(() => departments.filter((department) => {
    const isMissing = !existingDepartmentIds.has(String(department._id))
      && !existingDepartmentIds.has(String(department.externalId));
    if (!isMissing) return false;
    return getDeptChannels(department).length > 0;
  }), [departments, existingDepartmentIds, channels]);

  const allDepartmentsImported = !loadingDepts
    && departments.length > 0
    && missingDepartments.length === 0;
  const hideDepartmentImportAction = categoryType === 'department' && allDepartmentsImported;

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return nonDmChannels.filter(c =>
      (!q || c.name?.toLowerCase().includes(q)) &&
      !selectedChannels.some(s => s._id === c._id)
    ).slice(0, 50);
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

  const isFormValid = () => {
    if (categoryType === 'department') return missingDepartments.length > 0 && !loadingDepts;
    if (categoryType === 'custom') return customName.trim().length > 0;
    if (categoryType === 'none') return categories.length > 0;
    return false;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid()) return;
    
    setIsSubmitting(true);
    try {
      let successMessage = "";

      if (categoryType === 'none') {
        const { data } = await categoryAPI.clearAll();
        successMessage = data.message || 'Categories removed. Channels are now shown normally.';
      } else if (categoryType === 'department') {
        if (missingDepartments.length === 0) {
          toast.success("All departments are already imported.");
          onClose();
          setIsSubmitting(false);
          return;
        }

        // Import all missing departments in one action
        const results = await Promise.allSettled(missingDepartments.map(dept => {
          let categoryName = dept.name;
          // Ensure unique name by appending suffix if it already exists
          let counter = 1;
          while (categories.some(c => c.name.toLowerCase() === categoryName.toLowerCase())) {
            categoryName = counter === 1 ? `${dept.name} (Department)` : `${dept.name} (Department ${counter})`;
            counter++;
          }

          return api.post("/categories", {
            name: categoryName,
            type: "department",
            departmentId: dept._id,
            icon: dept.icon || "📁"
          });
        }));
        
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        if (successCount === 0 && missingDepartments.length > 0) {
          throw new Error("Failed to import departments");
        }
        
        successMessage = `Imported ${successCount} department(s) successfully`;
      } else {
        const payload = {
          name: customName.trim(),
          type: "custom",
          departmentId: null,
          icon: customIcon
        };
        
        const res = await api.post("/categories", payload);
        const newCategory = res.data.data;

        // Custom categories use manual mapping
        if (selectedChannels.length > 0) {
          await api.post(`/categories/${newCategory._id}/bulk-channels`, {
            channelIds: selectedChannels.map(c => c._id)
          });
        }
        
        successMessage = `Category "${customName.trim()}" created`;
      }

      toast.success(successMessage);
      if (categoryType === 'none') {
        await Promise.all([fetchCategories(), fetchChannels()]);
      } else {
        await fetchCategories();
      }
      onClose();
    } catch (err) {
      toast.error(
        err.response?.data?.error?.message
        || err.response?.data?.message
        || (categoryType === 'none' ? 'Failed to update category view' : 'Failed to create category'),
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ccm-overlay" onClick={onClose}>
      <style>{STYLES}</style>
      <div className="ccm-shell" onClick={(e) => e.stopPropagation()}>
        
        <div className="ccm-header">
          <div className="ccm-header__icon">
            <FolderPlus size={24} strokeWidth={2} />
          </div>
          <div className="ccm-header__copy">
            <h2 className="ccm-header__title">Create Category</h2>
            <p className="ccm-header__sub">Organize your channels into structured categories</p>
          </div>
          <button className="ccm-header__close" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className="ccm-type-selector">
          <label className="ccm-radio-label">
            <input 
              type="radio" 
              className="ccm-radio-input"
              name="categoryType"
              value="department"
              checked={categoryType === 'department'}
              onChange={() => setCategoryType('department')}
            />
            Department
          </label>
          <label className="ccm-radio-label">
            <input 
              type="radio" 
              className="ccm-radio-input"
              name="categoryType"
              value="custom"
              checked={categoryType === 'custom'}
              onChange={() => setCategoryType('custom')}
            />
            Custom Category
          </label>
          {hasDepartmentCategory && (
            <label className="ccm-radio-label">
              <input
                type="radio"
                className="ccm-radio-input"
                name="categoryType"
                value="none"
                checked={categoryType === 'none'}
                onChange={() => setCategoryType('none')}
              />
              No Category
            </label>
          )}
        </div>

        <form onSubmit={handleSubmit} className="ccm-body">
          
          {categoryType === 'department' ? (
              <div className="ccm-field-group">
                <div style={{ padding: '16px', fontSize: '13px', color: 'var(--text-secondary, #616061)', background: 'var(--bg-secondary, #F8F8F8)', borderRadius: '8px', lineHeight: '1.5', marginBottom: '16px', border: '1px solid var(--border-primary, #EBECEF)' }}>
                  {allDepartmentsImported
                    ? 'All FlowTask departments are already available in your Categories.'
                    : <>Departments are synchronized automatically from FlowTask. Click <strong>"Import Departments"</strong> to import all missing departments and their associated channels.</>}
                </div>
                
                <div className="ccm-label">FLOWTASK DEPARTMENTS</div>
                <div className="ccm-department-list">
                  {loadingDepts ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary, #616061)', fontSize: '13px' }}>Loading...</div>
                  ) : departmentError ? (
                    <div role="alert" style={{ padding: '16px', textAlign: 'center', color: '#9f1239', fontSize: '13px', background: '#fff1f2', borderRadius: '6px' }}>
                      <div>{departmentError}</div>
                      <button type="button" onClick={loadDepartments} style={{ marginTop: '10px', border: '1px solid #fda4af', borderRadius: '5px', padding: '6px 12px', background: '#fff', color: '#9f1239', cursor: 'pointer', fontWeight: 600 }}>
                        Retry
                      </button>
                    </div>
                  ) : departments.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#616061', fontSize: '13px' }}>No FlowTask departments are available for your account.</div>
                  ) : (
                    departments.map(dept => {
                      const isAlreadyImported = existingDepartmentIds.has(String(dept._id))
                        || existingDepartmentIds.has(String(dept.externalId));
                      const isExpanded = expandedDepts[dept._id];
                      
                      const deptChannels = getDeptChannels(dept);

                      return (
                        <div key={dept._id} className="ccm-dept-item" style={{ opacity: isAlreadyImported ? 0.6 : 1 }}>
                          <div 
                            className="ccm-dept-header"
                            onClick={() => toggleDeptExpand(dept._id)}
                          >
                            <span style={{ color: 'var(--text-secondary, #616061)' }}>
                              {isExpanded ? <ChevronDown size={16} /> : <span style={{ display: 'inline-block', transform: 'rotate(-90deg)' }}><ChevronDown size={16} /></span>}
                            </span>
                            <span>{dept.icon || '📁'}</span>
                            <span style={{ flex: 1 }}>{dept.name}</span>
                            {isAlreadyImported && <span style={{ fontSize: '11px', color: 'var(--accent-primary, #005A9E)', background: 'var(--accent-primary-light, rgba(0,90,158,0.1))', padding: '2px 8px', borderRadius: '12px' }}>Imported</span>}
                          </div>
                          
                          {isExpanded && (
                            <div className="ccm-dept-channels">
                              {deptChannels.length === 0 ? (
                                <div style={{ fontStyle: 'italic', fontSize: '12px' }}>No channels are currently linked to this department.</div>
                              ) : (
                                deptChannels.map(c => (
                                  <div key={c._id} className="ccm-dept-channel-item">
                                    <Check size={14} color="var(--accent-primary, #005A9E)" strokeWidth={3} />
                                    <span> {c.name}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
          ) : categoryType === 'custom' ? (
            <div className="ccm-field-group">
              <div className="ccm-label">CATEGORY NAME</div>
              <div className="ccm-input-wrap">
                <input
                  className="ccm-input"
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Design Team"
                  required
                />
                <button
                  type="button"
                  ref={emojiBtnRef}
                  onClick={() => setShowEmojiPicker(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}
                >
                  {customIcon}
                </button>
              </div>
              
              <div className="ccm-label">ADD CHANNELS (OPTIONAL)</div>
              <div className="ccm-search-wrap">
                <div className="ccm-input-wrap">
                  <Search size={16} color="var(--text-secondary, #616061)" />
                  <input
                    className="ccm-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search channels..."
                  />
                </div>
                <div className="ccm-search-results" aria-label="Accessible channels">
                  {channelsLoading && channels.length === 0 ? (
                    <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-secondary, #616061)', fontSize: '13px' }}>Loading your channels...</div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map(ch => (
                      <button
                        type="button"
                        key={ch._id}
                        className={`ccm-search-row ${selectedChannels.some(s => s._id === ch._id) ? 'is-selected' : ''}`}
                        onClick={() => handleToggleChannel(ch)}
                      >
                        {getChannelIcon(ch)}
                        <span className="ccm-search-row__name"> {ch.name}</span>
                        {selectedChannels.some(s => s._id === ch._id) && <Check size={14} color="var(--accent-primary, #005A9E)" />}
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-secondary, #616061)', fontSize: '13px' }}>
                      {searchQuery.trim() ? 'No accessible channels match your search.' : 'No accessible channels are available.'}
                    </div>
                  )}
                </div>
              </div>

              {selectedChannels.length > 0 && (
                <div className="ccm-selected-users">
                  {selectedChannels.map(ch => (
                    <span key={ch._id} className="ccm-selected-chip">
                      {getChannelIcon(ch)}
                      <span className="ccm-selected-chip__name">{ch.name}</span>
                      <button
                        type="button"
                        className="ccm-selected-chip__remove"
                        onClick={() => handleRemoveChannel(ch._id)}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="ccm-field-group">
              <div
                role="alert"
                style={{
                  padding: '16px',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  color: 'var(--text-primary, #1D1C1D)',
                  background: 'var(--bg-secondary, #F8F8F8)',
                  border: '1px solid var(--border-primary, #EBECEF)',
                  borderRadius: '8px',
                }}
              >
                Choose <strong>Update</strong> to remove all category groupings for your account. No channels, messages, memberships, or history will be deleted. All accessible channels will return to the normal channel lists.
              </div>
            </div>
          )}

          <div className="ccm-footer">
            <button type="button" className="ccm-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            {!hideDepartmentImportAction && (
              <button 
                type="submit" 
                className="ccm-btn-submit"
                disabled={!isFormValid() || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader size={14} />
                    {categoryType === 'department'
                      ? 'Importing...'
                      : categoryType === 'none' ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    {categoryType === 'department'
                      ? `Import ${missingDepartments.length} Department${missingDepartments.length === 1 ? '' : 's'}`
                      : categoryType === 'none' ? 'Update' : 'Create Category'}
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
