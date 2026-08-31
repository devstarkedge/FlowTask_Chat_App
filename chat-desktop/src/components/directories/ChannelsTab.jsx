import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Hash, Lock, Plus, Users, ChevronDown, X, Globe, TrendingUp, CheckCircle2 } from 'lucide-react';
import Loader from '../shared/Loader';
import { Virtuoso } from "react-virtuoso";
import { directoriesAPI } from "../../services/directoriesAPI";
import { useAuthStore } from "../../stores/authStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChannelStore } from "../../stores/channelStore";
import { getChannelPath } from "../../utils/chatRoutes";
import { ListSkeleton } from "./Skeletons";
import EmptyState from "./EmptyState";
import CreateChannelModal from "../chat/CreateChannelModal";

const TYPE_OPTIONS = [
  { value: "", label: "All", icon: Globe },
  { value: "public", label: "Public", icon: Hash },
  { value: "private", label: "Private", icon: Lock },
];

export default function ChannelsTab() {
  const user = useAuthStore((s) => s.user);
  const { activeWorkspaceId, members } = useWorkspaceStore();
  const navigate = useNavigate();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("asc");
  const [showCreate, setShowCreate] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const debounceRef = useRef(null);

  const currentMembership = members.find(
    (m) => (m.userId?._id || m.userId) === user?._id,
  );
  const isAdmin =
    currentMembership?.role === "owner" || currentMembership?.role === "admin";

  const fetchChannels = useCallback(
    async (searchVal = "", typeVal = "", sortVal = "asc") => {
      if (!activeWorkspaceId) return;
      setLoading(true);
      try {
        const { data } = await directoriesAPI.getChannels({
          search: searchVal,
          type: typeVal,
          sort: sortVal,
          limit: 100,
        });
        let channelsList = data.data?.channels || data.data || []
        
        // Client-side sorting to ensure correct order
        if (sortVal === 'asc') {
          channelsList = [...channelsList].sort((a, b) => {
            const nameA = (a.name || '').toLowerCase()
            const nameB = (b.name || '').toLowerCase()
            return nameA.localeCompare(nameB)
          })
        } else if (sortVal === 'desc') {
          channelsList = [...channelsList].sort((a, b) => {
            const nameA = (a.name || '').toLowerCase()
            const nameB = (b.name || '').toLowerCase()
            return nameB.localeCompare(nameA)
          })
        } else if (sortVal === 'members') {
          channelsList = [...channelsList].sort((a, b) => {
            return (b.memberCount || 0) - (a.memberCount || 0)
          })
        }
        
        setChannels(channelsList);
      } catch {
        setChannels([]);
      } finally {
        setLoading(false);
      }
    },
    [activeWorkspaceId],
  );

  useEffect(() => {
    fetchChannels(search, type, sort);
  }, [activeWorkspaceId, type, sort]);

  // Derive a compact signature of channel visibility states from the store.
  // When any channel's visibility changes (via socket or editChannel), the
  // signature changes and triggers a directory refetch to stay in sync.
  const channelVisibilitySignature = useChannelStore((s) =>
    s.channels.map((c) => `${c._id}:${c.visibility}`).join(',')
  );
  const sigRef = useRef(channelVisibilitySignature);
  useEffect(() => {
    // Skip the initial render (only react to subsequent changes)
    if (sigRef.current === channelVisibilitySignature) return;
    sigRef.current = channelVisibilitySignature;
    if (!loading) {
      fetchChannels(search, type, sort);
    }
  }, [channelVisibilitySignature, fetchChannels, search, type, sort, loading]);

  const handleSearchInput = (e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchChannels(val, type, sort), 300);
  };

  const clearSearch = () => {
    setSearch("");
    fetchChannels("", type, sort);
  };

  const handleJoinLeave = async (e, channel) => {
    e.stopPropagation();
    if (joiningId) return;
    const wasJoined = channel.isJoined;
    setJoiningId(channel._id);

    setChannels((prev) =>
      prev.map((c) =>
        c._id === channel._id ? { ...c, isJoined: !wasJoined } : c,
      ),
    );

    try {
      if (wasJoined) {
        await directoriesAPI.leaveChannel(channel._id);
      } else {
        await directoriesAPI.joinChannel(channel._id);
      }
    } catch {
      setChannels((prev) =>
        prev.map((c) =>
          c._id === channel._id ? { ...c, isJoined: wasJoined } : c,
        ),
      );
    } finally {
      setJoiningId(null);
    }
  };

  const joinedCount = channels.filter((c) => c.isJoined).length;
  const publicCount = channels.filter(
    (c) => !(c.isPrivate ?? c.visibility === 'private'),
  ).length;

  return (
    <div className="dir-channels-root">
      {/* ── Top banner ── */}
      <div className="dir-channels-banner">
        <div className="dir-channels-banner-copy">
          <h3 className="dir-channels-banner-title">Browse Channels</h3>
          <p className="dir-channels-banner-sub">
            {publicCount} channels · {joinedCount} joined
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="dir-create-btn"
          >
            <Plus size={14} />
            <span>New Channel</span>
          </button>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="dir-channels-filters">
        {/* Search */}
        <div
          className="dir-search-wrap"
          style={{ flex: 1, minWidth: 0, maxWidth: 340 }}
        >
          <Search size={14} className="dir-search-icon" />
          <input
            type="text"
            value={search}
            onChange={handleSearchInput}
            placeholder="Search channels…"
            className="dir-search-input"
          />
          {search && (
            <button onClick={clearSearch} className="dir-search-clear">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Type pills */}
        <div className="dir-type-pills">
          {TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setType(value)}
              className={`dir-type-pill ${type === value ? "active" : ""}`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="dir-select-wrap">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="dir-select"
          >
            <option value="asc">A → Z</option>
            <option value="desc">Z → A</option>
            <option value="members">Most members</option>
          </select>
          <ChevronDown size={13} className="dir-select-arrow" />
        </div>
      </div>

      {/* Create Channel Banner */}
      {!bannerDismissed && (
      <div className="dsl-channel-banner">
        <button
          className="dsl-channel-banner-close"
          onClick={() => setBannerDismissed(true)}
        >
          <X size={16} />
        </button>
        <h2 className="dsl-channel-banner-title">
          Organize your team's conversations
        </h2>
        <p className="dsl-channel-banner-desc">
          Channels are spaces for gathering all the right people, messages,
          files and tools. Organize them by any project, group, initiative or
          topic of your choosing.
        </p>
        <button
          className="dsl-channel-banner-btn"
          onClick={() => setShowCreate(true)}
        >
          Create a channel
        </button>
      </div>
      )}

      {/* ── List ── */}
      <div className="dir-channels-body">
        {loading ? (
          <div style={{ padding: "8px 12px" }}>
            <ListSkeleton count={8} />
          </div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon={Hash}
            title="No channels found"
            description={
              search
                ? "Try a different search term"
                : "No channels in this workspace yet"
            }
          />
        ) : (
          <Virtuoso
            data={channels}
            overscan={200}
            style={{ height: "100%" }}
            itemContent={(index, ch) => (
              <ChannelRow
                channel={ch}
                index={index}
                joiningId={joiningId}
                onNavigate={() =>
                  navigate(getChannelPath(activeWorkspaceId, ch._id))
                }
                onJoinLeave={(e) => handleJoinLeave(e, ch)}
              />
            )}
          />
        )}
      </div>

      {showCreate && (
        <CreateChannelModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

function ChannelRow({
  channel: ch,
  index,
  joiningId,
  onNavigate,
  onJoinLeave,
}) {
  const received =
    [...(ch.name || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const accentColor = `hsl(${received}, 55%, 52%)`;
  // Derive privacy flag: trust isPrivate if present, fallback to visibility field
  const isPrivate = ch.isPrivate ?? ch.visibility === 'private';

  return (
    <div
      className="dir-channel-row"
      onClick={onNavigate}
      style={{ animationDelay: `${Math.min(index * 25, 350)}ms` }}
    >
      {/* Left icon */}
      <div
        className="dir-channel-icon"
        style={{
          background: `hsl(${received}, 55%, 52%, 0.12)`,
          color: accentColor,
          borderColor: `hsl(${received}, 55%, 52%, 0.2)`,
        }}
      >
        {isPrivate ? <Lock size={15} /> : <Hash size={15} />}
      </div>

      {/* Info */}
      <div className="dir-channel-info">
        <div className="dir-channel-name-row">
          <span className="dir-channel-name">{ch.name}</span>
          {ch.isJoined && (
            <span className="dir-channel-joined-badge">
              <CheckCircle2 size={10} />
              Joined
            </span>
          )}
          {isPrivate && (
            <span className="dir-channel-private-badge">Private</span>
          )}
        </div>
        {ch.description && <p className="dir-channel-desc">{ch.description}</p>}
      </div>

      {/* Members */}
      <div className="dir-channel-meta">
        <Users size={12} />
        <span>{ch.memberCount ?? "—"}</span>
      </div>

      {/* Join / Leave */}
      {!isPrivate && (
        <button
          onClick={onJoinLeave}
          disabled={joiningId === ch._id}
          className={`dir-channel-action-btn ${ch.isJoined ? "leave" : "join"}`}
        >
          {joiningId === ch._id ? (
            <Loader size={12} />
          ) : ch.isJoined ? (
            "Leave"
          ) : (
            "Join"
          )}
        </button>
      )}
    </div>
  );
}
