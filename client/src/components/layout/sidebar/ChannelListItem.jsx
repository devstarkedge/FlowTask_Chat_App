import React from "react";
import { Hash, Lock, Users, MessageCircle, Volume2, BookMarked } from "lucide-react";
import SidebarItem from "./SidebarItem";

const CHANNEL_ICONS = {
  project: Hash,
  department: Users,
  team: Users,
  dm: MessageCircle,
  system: Volume2,
  public: Hash,
  private: Lock,
  self: BookMarked,
};

export default function ChannelListItem({
  channel,
  isActive,
  unread,
  onClick,
  hasDraft,
  onRemove,
}) {
  let Icon = CHANNEL_ICONS[channel.type] || Hash;
  if (channel.visibility === "private") Icon = Lock;
  else if (channel.visibility === "public") Icon = Hash;
  else if (channel.type === "private" && channel.visibility !== "private") Icon = Hash;

  return (
    <SidebarItem
      icon={<Icon size={18} style={{ opacity: isActive ? 1 : 0.6 }} />}
      label={channel.name}
      sublabel={
        hasDraft ? (
          <span
            className="flex items-center gap-1"
            style={{ color: "var(--accent-primary)", fontSize: 11 }}
          >
            <span style={{ fontSize: 10 }}>✏️</span> Draft
          </span>
        ) : undefined
      }
      isActive={isActive}
      isBold={unread > 0 || hasDraft}
      badge={unread}
      onClick={onClick}
      onRemove={onRemove}
    />
  );
}
