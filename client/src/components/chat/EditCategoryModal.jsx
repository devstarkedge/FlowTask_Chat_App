import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, FolderEdit, Hash, Lock, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useChannelStore } from '../../stores/channelStore';
import { categoryAPI } from '../../services/api';
import Loader from '../shared/Loader';

const STYLES = `
  .ecm-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); }
  .ecm-shell { width: 100%; max-width: 480px; border-radius: 12px; overflow: hidden; background: var(--bg-primary, #fff); box-shadow: 0 8px 30px rgba(0,0,0,0.24); }
  .ecm-header { display: flex; align-items: flex-start; gap: 12px; padding: 22px 24px 18px; border-bottom: 1px solid var(--border-primary, #ebecef); }
  .ecm-header-copy { flex: 1; }
  .ecm-title { margin: 0 0 4px; font-size: 18px; color: var(--text-primary, #1d1c1d); }
  .ecm-subtitle { margin: 0; font-size: 13px; color: var(--text-secondary, #616061); }
  .ecm-close { border: 0; background: transparent; color: var(--text-secondary, #616061); cursor: pointer; padding: 4px; }
  .ecm-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 18px; max-height: 58vh; overflow-y: auto; }
  .ecm-type-selector { display: flex; flex-direction: column; gap: 10px; }
  .ecm-radio { display: flex; align-items: center; gap: 9px; color: var(--text-primary, #1d1c1d); font-size: 14px; cursor: pointer; }
  .ecm-radio input { width: 16px; height: 16px; accent-color: var(--accent-primary, #007a5a); }
  .ecm-field { display: flex; flex-direction: column; gap: 8px; }
  .ecm-label { font-size: 12px; font-weight: 700; color: var(--text-secondary, #616061); text-transform: uppercase; letter-spacing: .4px; }
  .ecm-input, .ecm-select { width: 100%; box-sizing: border-box; border: 1px solid var(--border-secondary, #cfcfcf); border-radius: 7px; padding: 11px 13px; background: var(--bg-primary, #fff); color: var(--text-primary, #1d1c1d); font-size: 14px; outline: none; }
  .ecm-input:focus, .ecm-select:focus { border-color: var(--accent-primary, #007a5a); box-shadow: 0 0 0 3px var(--accent-primary-alpha, rgba(0,122,90,.12)); }
  .ecm-search { position: relative; }
  .ecm-search svg { position: absolute; left: 12px; top: 12px; color: var(--text-secondary, #616061); }
  .ecm-search .ecm-input { padding-left: 38px; }
  .ecm-channel-list { border: 1px solid var(--border-primary, #ebecef); border-radius: 7px; max-height: 190px; overflow-y: auto; }
  .ecm-channel-row { display: flex; align-items: center; gap: 9px; width: 100%; padding: 9px 12px; border: 0; background: transparent; color: var(--text-primary, #1d1c1d); text-align: left; cursor: pointer; }
  .ecm-channel-row:hover, .ecm-channel-row.selected { background: var(--bg-secondary, #f8f8f8); }
  .ecm-channel-name { flex: 1; font-size: 13px; }
  .ecm-empty { padding: 14px; color: var(--text-secondary, #616061); font-size: 13px; text-align: center; }
  .ecm-note { padding: 11px 13px; border-radius: 7px; background: var(--bg-secondary, #f8f8f8); color: var(--text-secondary, #616061); font-size: 12px; line-height: 1.45; }
  .ecm-error { color: #9f1239; font-size: 12px; }
  .ecm-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--border-primary, #ebecef); }
  .ecm-btn { padding: 9px 18px; border-radius: 7px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .ecm-cancel { border: 1px solid var(--border-secondary, #cfcfcf); background: var(--bg-primary, #fff); color: var(--text-primary, #1d1c1d); }
  .ecm-save { border: 0; background: var(--accent-primary, #007a5a); color: #fff; display: flex; align-items: center; gap: 7px; }
  .ecm-btn:disabled { opacity: .5; cursor: not-allowed; }
`;

function idOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return idOf(value._id || value.id);
}

function channelsForDepartment(channels, department) {
  const externalId = department?.externalId || idOf(department);
  if (!externalId) return [];
  return channels.filter((channel) => {
    if (channel.isArchived || channel.type === 'dm' || channel.type === 'self') return false;
    const directDepartment = channel.flowTaskRef?.entityType === 'department'
      && String(channel.flowTaskRef?.entityId) === String(externalId);
    const projectDepartment = channel.departmentRef?.departmentId
      && String(channel.departmentRef.departmentId) === String(externalId);
    return directDepartment || projectDepartment;
  });
}

export default function EditCategoryModal({ category, onClose }) {
  const {
    channels,
    categories,
    departments: storedDepartments,
    fetchCategories,
    fetchChannels,
    fetchDepartments,
  } = useChannelStore();
  const [name, setName] = useState(category.name || '');
  const [categoryType, setCategoryType] = useState(category.type || 'custom');
  const [departmentId, setDepartmentId] = useState(idOf(category.departmentId));
  const [departments, setDepartments] = useState(storedDepartments || []);
  const [departmentError, setDepartmentError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannelIds, setSelectedChannelIds] = useState(() => (
    category.type === 'custom' ? (category.channelIds || []).map(idOf).filter(Boolean) : []
  ));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const seededDepartmentChannels = useRef(false);

  useEffect(() => {
    fetchChannels();
    let active = true;
    (async () => {
      try {
        const { data } = await categoryAPI.getDepartments();
        if (active) setDepartments(Array.isArray(data.data) ? data.data : []);
      } catch {
        if (active) setDepartmentError('Unable to load FlowTask departments.');
      }
    })();
    return () => { active = false; };
  }, [fetchChannels]);

  useEffect(() => {
    if (storedDepartments?.length) setDepartments(storedDepartments);
  }, [storedDepartments]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const accessibleChannels = useMemo(() => channels
    .filter((channel) => channel.type !== 'dm' && channel.type !== 'self' && !channel.isArchived)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '')), [channels]);

  const usedDepartmentIds = useMemo(() => new Set(categories
    .filter((item) => item._id !== category._id && item.type === 'department')
    .map((item) => idOf(item.departmentId))
    .filter(Boolean)), [categories, category._id]);

  const selectableDepartments = useMemo(() => departments.filter(
    (department) => !usedDepartmentIds.has(idOf(department)),
  ), [departments, usedDepartmentIds]);

  const visibleChannels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return accessibleChannels
      .filter((channel) => !query || channel.name?.toLowerCase().includes(query))
      .slice(0, 75);
  }, [accessibleChannels, searchQuery]);

  useEffect(() => {
    if (category.type !== 'department' || categoryType !== 'custom' || seededDepartmentChannels.current) return;
    const ids = channelsForDepartment(accessibleChannels, category.departmentId).map((channel) => idOf(channel._id));
    setSelectedChannelIds(ids);
    seededDepartmentChannels.current = true;
  }, [accessibleChannels, category.departmentId, category.type, categoryType]);

  const changeType = (nextType) => {
    setCategoryType(nextType);
    if (nextType === 'department' && !departmentId) {
      const firstDepartment = selectableDepartments[0];
      if (firstDepartment) {
        setDepartmentId(idOf(firstDepartment));
        setName(firstDepartment.name || name);
      }
    }
    if (nextType === 'custom' && category.type === 'department') {
      const ids = channelsForDepartment(accessibleChannels, category.departmentId).map((channel) => idOf(channel._id));
      setSelectedChannelIds(ids);
      seededDepartmentChannels.current = true;
    }
  };

  const selectDepartment = (nextDepartmentId) => {
    setDepartmentId(nextDepartmentId);
    const department = departments.find((item) => idOf(item) === nextDepartmentId);
    if (department?.name) setName(department.name);
  };

  const toggleChannel = (channelId) => {
    setSelectedChannelIds((current) => current.includes(channelId)
      ? current.filter((id) => id !== channelId)
      : [...current, channelId]);
  };

  const isValid = name.trim().length > 0
    && (categoryType === 'custom' || Boolean(departmentId));

  const handleSubmit = async (event) => {
    event?.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await categoryAPI.update(category._id, {
        name: name.trim(),
        type: categoryType,
        departmentId: categoryType === 'department' ? departmentId : null,
        channelIds: categoryType === 'custom' ? selectedChannelIds : [],
      });
      await Promise.all([fetchCategories(), fetchDepartments()]);
      toast.success(`Category changed to ${categoryType === 'department' ? 'Department' : 'Custom'}`);
      onClose();
    } catch (error) {
      toast.error(
        error.response?.data?.error?.message
        || error.response?.data?.message
        || 'Failed to update category',
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ecm-overlay" onClick={onClose}>
      <style>{STYLES}</style>
      <div className="ecm-shell" onClick={(event) => event.stopPropagation()}>
        <div className="ecm-header">
          <FolderEdit size={22} color="var(--accent-primary, #007a5a)" />
          <div className="ecm-header-copy">
            <h2 className="ecm-title">Edit Category</h2>
            <p className="ecm-subtitle">Rename the category or change how its channels are organized</p>
          </div>
          <button type="button" className="ecm-close" onClick={onClose} aria-label="Close modal"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="ecm-body">
            <div className="ecm-field">
              <div className="ecm-label">Category Type</div>
              <div className="ecm-type-selector">
                <label className="ecm-radio">
                  <input type="radio" name="editCategoryType" checked={categoryType === 'department'} onChange={() => changeType('department')} />
                  Department
                </label>
                <label className="ecm-radio">
                  <input type="radio" name="editCategoryType" checked={categoryType === 'custom'} onChange={() => changeType('custom')} />
                  Custom Category
                </label>
              </div>
            </div>

            {categoryType === 'department' && (
              <div className="ecm-field">
                <label className="ecm-label" htmlFor="edit-category-department">FlowTask Department</label>
                <select
                  id="edit-category-department"
                  className="ecm-select"
                  value={departmentId}
                  onChange={(event) => selectDepartment(event.target.value)}
                >
                  <option value="">Select a department</option>
                  {selectableDepartments.map((department) => (
                    <option key={idOf(department)} value={idOf(department)}>{department.name}</option>
                  ))}
                </select>
                {departmentError && <div className="ecm-error" role="alert">{departmentError}</div>}
                <div className="ecm-note">Department categories automatically show the channels linked to the selected FlowTask department.</div>
              </div>
            )}

            <div className="ecm-field">
              <label className="ecm-label" htmlFor="edit-category-name">Category Name</label>
              <input
                id="edit-category-name"
                className="ecm-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                placeholder="Category name"
              />
            </div>

            {categoryType === 'custom' && (
              <div className="ecm-field">
                <div className="ecm-label">Channels</div>
                <div className="ecm-search">
                  <Search size={16} />
                  <input className="ecm-input" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search your channels..." />
                </div>
                <div className="ecm-channel-list" aria-label="Accessible channels">
                  {visibleChannels.length === 0 ? (
                    <div className="ecm-empty">No accessible channels are available.</div>
                  ) : visibleChannels.map((channel) => {
                    const channelId = idOf(channel._id);
                    const selected = selectedChannelIds.includes(channelId);
                    return (
                      <button type="button" key={channelId} className={`ecm-channel-row${selected ? ' selected' : ''}`} onClick={() => toggleChannel(channelId)}>
                        {channel.visibility === 'private' || channel.type === 'private' ? <Lock size={14} /> : <Hash size={14} />}
                        <span className="ecm-channel-name"># {channel.name}</span>
                        {selected && <Check size={14} aria-label="Selected" />}
                      </button>
                    );
                  })}
                </div>
                <div className="ecm-note">When changing a Department category to Custom, its currently visible department channels are selected automatically and can be adjusted here.</div>
              </div>
            )}
          </div>

          <div className="ecm-footer">
            <button type="button" className="ecm-btn ecm-cancel" onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button type="submit" className="ecm-btn ecm-save" disabled={!isValid || isSubmitting}>
              {isSubmitting ? <><Loader size="sm" /> Saving...</> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
