import { useMemo, useState, useRef, useEffect } from 'react'
import { Hash, Lock, Users, MessageCircle, Search, Info, Menu, Pin, FileText, Star, Headphones,Plus,MoreVertical, MoreHorizontal } from 'lucide-react'
import MemberAvatarGroup from './MemberAvatarGroup'
import { useChannelStore } from '../../stores/channelStore'
import { useChatStore } from '../../stores/chatStore'
import { channelAPI } from '../../services/api'
import toast from 'react-hot-toast'
import logger from '../../utils/logger'

const TYPE_ICONS = {
  project: Hash,
  department: Users,
  team: Users,
  dm: MessageCircle,
  system: Hash,
};

const EMPTY_PINS = [];

const HEADER_TABS = [
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "files", label: "Files", icon: FileText },
  { id: "untitled", label: "Untitled", icon: FileText },
];

export default function ChatHeader({
  channel,
  onToggleSearch,
  onOpenMobileSidebar,
  onTogglePins,
}) {
  const { membersByChannel, toggleInfoPanel, updateChannel, showInfoPanel } =
    useChannelStore();
  const activeThread = useChatStore((s) => s.activeThread);
  const pinnedMessages =
    useChatStore((s) => s.pinnedMessagesByChannel[channel?._id]) ?? EMPTY_PINS;
  const [showMoreActions, setShowMoreActions] = useState(false);
  const moreMenuRef = useRef(null);

  const isConstrained = showInfoPanel || !!activeThread;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreActions(false);
      }
    };
    if (showMoreActions) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMoreActions]);
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicValue, setTopicValue] = useState("");
  const [activeTab, setActiveTab] = useState("messages");
  const [isStarred, setIsStarred] = useState(false);
  const topicInputRef = useRef(null);

  const handleToggleStar = () => {
    setIsStarred((s) => !s);
  };

  const handleHuddleClick = () => {
    // TODO: implement huddle feature
    logger.log('Huddle clicked for channel:', channel?._id)
  }

  if (!channel) return null;

  let Icon = TYPE_ICONS[channel.type] || Hash;
  const isPrivate = channel.visibility?.toLowerCase() === 'private' || channel.type?.toLowerCase() === 'private' || channel.isPrivate;
  if (isPrivate) {
    Icon = Lock;
  }
  const members = membersByChannel[channel._id] || [];
  const isDM = channel.type === "dm";

  const handleTopicClick = () => {
    setTopicValue(channel.topic || "");
    setEditingTopic(true);
    setTimeout(() => topicInputRef.current?.focus(), 0);
  };

  const handleTopicSave = async () => {
    setEditingTopic(false);
    if (topicValue === (channel.topic || "")) return;
    try {
      await channelAPI.update(channel._id, { topic: topicValue });
      if (updateChannel) updateChannel(channel._id, { topic: topicValue });
    } catch {
      toast.error("Failed to update topic");
    }
  };

  return (
    <div
      className="shrink-0 select-none bg-white"
      style={{
        borderBottom: "1px solid transparent",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      {/* Top row: channel info */}
      <div className="flex items-center px-6 pt-4 pb-2 gap-4">
        {/* Mobile Menu */}
        <button
          onClick={onOpenMobileSidebar}
          className="mobile-menu-btn p-2 rounded-lg cursor-pointer transition-colors"
          style={{
            color: "#8A92A6",
            background: "transparent",
            border: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#EEF1FF")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <Menu size={20} />
        </button>

        {/* Channel Name & Details */}
        <div
          className="flex flex-col min-w-0 cursor-pointer group py-1.5 px-2 -ml-2 rounded-xl hover:bg-[#F7F8FC] transition-colors"
          onClick={toggleInfoPanel}
        >
          <div className="flex items-center gap-2">
            <Icon size={20} style={{ color: "#4F46E5", flexShrink: 0 }} />
            <h2
              className="font-bold text-[20px] truncate group-hover:underline"
              style={{ color: "#1F2A44" }}
            >
              {channel.name || channel.slug}
            </h2>
            {/* Removed redundant Lock icon as it is now the main Icon if private */}
            <button
              className="p-1 rounded cursor-pointer transition-colors shrink-0 hide-mobile z-10 ml-1"
              style={{
                color: isStarred ? "#F59E0B" : "#8A92A6",
                background: "transparent",
                border: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#EEF1FF";
                e.currentTarget.style.color = "#F59E0B";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = isStarred ? "#F59E0B" : "#8A92A6";
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleStar();
              }}
              aria-pressed={isStarred}
              title={isStarred ? "Unstar channel" : "Star channel"}
            >
              <Star size={16} fill={isStarred ? "currentColor" : "none"} />
            </button>
          </div>

          {/* Member count under name (for channels) */}
          {!isDM && (
            <div
              className="flex items-center gap-1 mt-0.5"
              style={{ paddingLeft: "28px" }}
            >
              <span
                className="text-[13px] font-medium group-hover:text-[#1F2A44] transition-colors"
                style={{ color: "#8A92A6" }}
              >
                {members.length} member{members.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {/* Topic — editable on click */}
        {!isDM && (
          <div className="flex items-center hide-mobile">
            <div className="w-px h-8 mx-4" style={{ background: "#E2E8F0" }} />
            {editingTopic ? (
              <input
                ref={topicInputRef}
                value={topicValue}
                onChange={(e) => setTopicValue(e.target.value)}
                onBlur={handleTopicSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.target.blur();
                  }
                  if (e.key === "Escape") setEditingTopic(false);
                }}
                placeholder="Add a topic"
                className="text-[15px] bg-transparent outline-none px-2 py-1 rounded"
                style={{
                  color: "#1F2A44",
                  maxWidth: 300,
                  border: "1px solid #93A4FC",
                }}
              />
            ) : (
              <span
                role="button"
                tabIndex={0}
                className="text-[15px] truncate cursor-pointer hover:underline px-2 py-1 rounded transition-colors hover:bg-[#F7F8FC]"
                style={{ color: "#8A92A6", maxWidth: 300 }}
                onClick={handleTopicClick}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleTopicClick();
                  }
                }}
                title={channel.topic || "Click to add a topic"}
              >
                {channel.topic || "Add a topic"}
              </span>
            )}
          </div>
        )}
      </div>
      {/* Tabs & Actions row as Pill-style Toolbar */}
      <div className="px-6 pb-4">
        <div className="flex items-center justify-between bg-[#F3F4F8] px-3 h-14 shadow-sm relative">
          <div className="flex items-center gap-2 md:gap-3 min-w-0 overflow-x-auto no-scrollbar">
            {HEADER_TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-1 h-10 rounded text-[15px] font-semibold transition-all ${
                    isConstrained ? "w-10 px-0" : "w-30 px-6"
                  } ${
                    isActive
                      ? "bg-[#94A1F7] text-white shadow-sm"
                      : "bg-[#ECEEF5] text-[#2C3A8C] hover:bg-[#E2E5EF]"
                  }`}
                  title={tab.label}
                >
                  <TabIcon size={18} />
                  {!isConstrained && (
                    <span className="flex items-center justify-center">
                      {tab.label}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              className={`flex items-center justify-center gap-1 h-10 rounded-xl bg-[#D8DBE8] text-[#1F2A44] font-semibold hover:bg-[#CDD1E0] transition-all ${
                isConstrained ? "w-10 px-0" : "w-36 px-6 text-nowrap"
              }`}
              title="Add New Tab"
            >
              <Plus size={18} />
              {!isConstrained && <span>Add New Tab</span>}
            </button>
          </div>
          {/* Action Buttons */}
          <div className="flex items-center gap-2 relative" ref={moreMenuRef}>
            {!isConstrained && (
              <>
                <HeaderBtn
                  icon={Pin}
                  title="Pinned messages"
                  label={
                    pinnedMessages.length > 0
                      ? String(pinnedMessages.length)
                      : undefined
                  }
                  onClick={onTogglePins}
                />

                <HeaderBtn
                  icon={Headphones}
                  title="Huddle"
                  className="hide-mobile"
                  onClick={handleHuddleClick}
                />

                <HeaderBtn
                  icon={Search}
                  title="Search"
                  onClick={onToggleSearch}
                />
              </>
            )}

            <HeaderBtn
              icon={MoreVertical}
              title="More"
              onClick={() => setShowMoreActions(!showMoreActions)}
              className={showMoreActions ? "bg-[#E5E7EB]" : ""}
            />

            {showMoreActions && (
              <div
                className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-[#E2E8F0] py-2 z-50 animate-fade-in-up"
                style={{ filter: "drop-shadow(0 15px 30px rgba(0,0,0,0.12))" }}
              >
                {isConstrained && (
                  <>
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F7F8FC] transition-colors text-left group"
                      onClick={() => {
                        onTogglePins();
                        setShowMoreActions(false);
                      }}
                    >
                      <Pin
                        size={18}
                        className="text-[#8A92A6] group-hover:text-[#4F46E5]"
                      />
                      <div className="flex flex-col">
                        <span className="text-[14px] font-semibold text-[#1F2A44]">
                          Pinned Messages
                        </span>
                        {pinnedMessages.length > 0 && (
                          <span className="text-[11px] text-[#8A92A6]">
                            {pinnedMessages.length} items pinned
                          </span>
                        )}
                      </div>
                    </button>

                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F7F8FC] transition-colors text-left group"
                      onClick={() => {
                        onToggleSearch();
                        setShowMoreActions(false);
                      }}
                    >
                      <Search
                        size={18}
                        className="text-[#8A92A6] group-hover:text-[#4F46E5]"
                      />
                      <span className="text-[14px] font-semibold text-[#1F2A44]">
                        Search Messages
                      </span>
                    </button>

                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F7F8FC] transition-colors text-left group md:hidden"
                      onClick={() => {
                        handleHuddleClick();
                        setShowMoreActions(false);
                      }}
                    >
                      <Headphones
                        size={18}
                        className="text-[#8A92A6] group-hover:text-[#4F46E5]"
                      />
                      <span className="text-[14px] font-semibold text-[#1F2A44]">
                        Huddle
                      </span>
                    </button>

                    <div className="h-px bg-[#E2E8F0] my-2 mx-2" />
                  </>
                )}

                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F7F8FC] transition-colors text-left group"
                  onClick={() => {
                    toggleInfoPanel();
                    setShowMoreActions(false);
                  }}
                >
                  <Info
                    size={18}
                    className="text-[#8A92A6] group-hover:text-[#4F46E5]"
                  />
                  <span className="text-[14px] font-semibold text-[#1F2A44]">
                    Channel Details
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeaderBtn({ icon: Icon, title, label, onClick, className = "" }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`shrink-0 flex items-center justify-center gap-2 ${
        label ? "px-4" : "w-10"
      } h-10 rounded-lg cursor-pointer transition-all bg-transparent hover:bg-[#E5E7EB] text-[#4F5B76] ${className}`}
    >
      <Icon size={20} />
      {label && (
        <span className="text-[14px] font-bold hide-mobile ml-0.5">
          {label}
        </span>
      )}
    </button>
  );
}
