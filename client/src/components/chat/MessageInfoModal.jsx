import { useRef, useEffect } from 'react';
import { X, Loader } from 'lucide-react';
import useReceipts from '../../hooks/useReceipts';
import { Avatar } from './MemberAvatarGroup';
import { format } from 'date-fns';

const ReceiptList = ({ data, timeKey, title }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wider">
        {title} ({data.length})
      </h3>
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.userId} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
                {item.avatar ? (
                  <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-medium text-gray-500 dark:text-gray-400">
                    {item.name?.charAt(0)?.toUpperCase()}
                  </div>
                )}
              </div>
              <span className="text-[15px] font-medium text-gray-900 dark:text-gray-100">{item.name}</span>
            </div>
            {item[timeKey] && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {format(new Date(item[timeKey]), "h:mm a")}
              </span>
            )}
          </div>
        ))}
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
    // Use mousedown instead of click to prevent issues with text selection dragging outside
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div 
        ref={modalRef}
        className="w-full max-w-md bg-white dark:bg-[#1a1d21] rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Message Info</h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center items-center py-12 text-gray-500">
              <Loader className="animate-spin mr-2" size={24} />
              <span>Loading receipts...</span>
            </div>
          ) : (
            <>
              <ReceiptList title="Read By" data={readBy} timeKey="readAt" />
              <ReceiptList title="Delivered To" data={deliveredTo} timeKey="deliveredAt" />
              
              {!loading && (!readBy || readBy.length === 0) && (!deliveredTo || deliveredTo.length === 0) && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                  No read or delivery receipts yet.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
