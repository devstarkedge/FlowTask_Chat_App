import { useRef, useEffect } from 'react';
import { X, Loader, CheckCheck, Check, User } from 'lucide-react';
import useReceipts from '../../hooks/useReceipts';
import { format } from 'date-fns';

const ReceiptList = ({ data, timeKey, title, icon: Icon, iconBgClass, iconColorClass }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="mb-6 last:mb-0 animate-in slide-in-from-bottom-4 fade-in duration-500 fill-mode-both">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${iconBgClass}`}>
          <Icon className={`w-4 h-4 ${iconColorClass}`} />
        </div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">
          {title} <span className="text-gray-400 font-normal">({data.length})</span>
        </h3>
      </div>
      
      <div className="space-y-4">
        {data.map((item, index) => (
          <div 
            key={item.userId} 
            className="group flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-all duration-200"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-500/20 dark:to-purple-500/20 flex-shrink-0 border border-black/5 dark:border-white/5 shadow-sm">
                {item.avatar ? (
                  <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    {item.name ? item.name.charAt(0).toUpperCase() : <User size={18} />}
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-base font-medium text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-none">
                  {item.name}
                </span>
              </div>
            </div>
            {item[timeKey] && (
              <div className="flex items-center h-full">
                <span className="text-sm font-medium text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors bg-gray-100/50 dark:bg-gray-800/50 px-3 py-1.5 rounded-full leading-none">
                  {format(new Date(item[timeKey]), "h:mm a")}
                </span>
              </div>
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
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div 
        ref={modalRef}
        className="w-full max-w-md bg-white/95 dark:bg-[#1a1d21]/95 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-2xl shadow-[0_8px_40px_rgb(0,0,0,0.12)] flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-300"
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800/60 bg-white/50 dark:bg-black/20">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white bg-clip-text">
            Message Info
          </h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-all active:scale-95 flex items-center justify-center"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-5 pt-7 overflow-y-auto flex-1 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col justify-center items-center py-16 text-gray-400 space-y-4">
              <Loader className="animate-spin text-indigo-500" size={32} />
              <span className="text-sm font-medium">Fetching details...</span>
            </div>
          ) : (
            <div className="space-y-6">
              <ReceiptList 
                title="Read by" 
                data={readBy} 
                timeKey="readAt" 
                icon={CheckCheck} 
                iconBgClass="bg-blue-50 dark:bg-blue-500/10"
                iconColorClass="text-blue-500"
              />
              <ReceiptList 
                title="Delivered to" 
                data={deliveredTo} 
                timeKey="deliveredAt" 
                icon={Check} 
                iconBgClass="bg-gray-100 dark:bg-gray-500/10"
                iconColorClass="text-gray-500"
              />
              
              {!loading && (!readBy || readBy.length === 0) && (!deliveredTo || deliveredTo.length === 0) && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-gray-50 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <Check className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
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
