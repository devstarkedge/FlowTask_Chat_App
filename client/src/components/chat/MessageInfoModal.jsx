import { useRef, useEffect } from 'react';
import { X, Loader, CheckCheck, Check, User } from 'lucide-react';
import useReceipts from '../../hooks/useReceipts';
import { format } from 'date-fns';
import './custom-css/messageInfoModal.css';

const formatReceiptTime = (timestamp) => {
  if (!timestamp) return null;
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return null;
    const isToday = new Date().toDateString() === date.toDateString();
    return format(date, isToday ? "h:mm a" : "MMM d, h:mm a");
  } catch {
    return null;
  }
};

const ReceiptList = ({ data, timeKey, title, icon: Icon, iconColorClass }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="message-info-section">
      {/* Subheader */}
      <div className="message-info-section-header">
        <Icon className={iconColorClass} size={16} />
        <h3 className="message-info-section-header-title">
          <span>{title}</span>
          <span className="message-info-badge">
            {data.length}
          </span>
        </h3>
      </div>
      
      {/* List Items */}
      <div className="message-info-list">
        {data.map((item) => {
          const formattedTime = formatReceiptTime(item[timeKey]);
          return (
            <div key={item.userId} className="message-info-item">
              <div className="message-info-user-info">
                {/* Avatar */}
                <div className="message-info-avatar-container">
                  {item.avatar ? (
                    <img src={item.avatar} alt={item.name} className="message-info-avatar-img" />
                  ) : (
                    <div className="message-info-avatar-placeholder">
                      {item.name ? item.name.charAt(0).toUpperCase() : <User size={16} />}
                    </div>
                  )}
                </div>
                {/* User Details */}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="message-info-username" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {item.name}
                  </span>
                  {item.email && (
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                      {item.email}
                    </span>
                  )}
                </div>
              </div>
              {/* Timestamp */}
              {formattedTime && (
                <div className="message-info-time-container">
                  <span className="message-info-time">
                    {formattedTime}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function MessageInfoModal({ onClose, channelId, messageId }) {
  const modalRef = useRef(null);
  const { deliveredTo, readBy, loading } = useReceipts(channelId, messageId);

  // Close on ESC or outside click
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Separate read and delivered users so readers don't duplicate under delivered
  const readUserIds = new Set((readBy || []).map((item) => String(item.userId)));
  const filteredDeliveredTo = (deliveredTo || []).filter(
    (item) => !readUserIds.has(String(item.userId))
  );

  const hasAnyReceipts = (readBy && readBy.length > 0) || (filteredDeliveredTo && filteredDeliveredTo.length > 0);

  return (
    <div className="message-info-overlay">
      <div ref={modalRef} className="message-info-container">
        {/* Header */}
        <div className="message-info-header">
          <h2 className="message-info-title">
            Message Info
          </h2>
          <button 
            onClick={onClose}
            className="message-info-close-btn"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Body content */}
        <div className="message-info-body">
          {loading && !hasAnyReceipts ? (
            <div className="message-info-loading">
              <Loader className="animate-spin" size={28} style={{ color: 'var(--accent-primary)' }} />
              <span className="message-info-loading-text">Fetching details...</span>
            </div>
          ) : (
            <div>
              <ReceiptList 
                title="Read by" 
                data={readBy} 
                timeKey="readAt" 
                icon={CheckCheck} 
                iconColorClass="text-blue-500"
              />
              <ReceiptList 
                title="Delivered to" 
                data={filteredDeliveredTo} 
                timeKey="deliveredAt" 
                icon={Check} 
                iconColorClass="text-muted"
              />
              
              {!hasAnyReceipts && (
                <div className="message-info-empty">
                  <div className="message-info-empty-icon-wrap">
                    <Check size={28} style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <p className="message-info-empty-text">
                    No read or delivery receipts yet.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
