import { useState, useEffect, useCallback } from "react";
import { workspaceAPI } from "../../services/api";
import { getSocket } from "../../services/socket";
import toast from "react-hot-toast";
import "./custom-css/PendingInvitesList.css";
import { RefreshCw, Ban, Mail, ChevronLeft, ChevronRight, Users, Eye, Shield, Clock, CheckCircle2, XCircle, AlertCircle, Filter } from 'lucide-react';
import Loader from '../shared/Loader';

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────────────────────────────────────── */

const STATUS_TABS = [
  { value: "",         label: "All",      icon: Filter },
  { value: "pending",  label: "Pending",  icon: Clock },
  { value: "accepted", label: "Accepted", icon: CheckCircle2 },
  { value: "expired",  label: "Expired",  icon: AlertCircle },
  { value: "revoked",  label: "Revoked",  icon: XCircle },
];

const TYPE_OPTIONS = [
  { value: "",        label: "All types" },
  { value: "member",  label: "Member" },
  { value: "guest",   label: "Guest" },
];

const STATUS_BADGE = {
  pending:  { label: "Pending",  cls: "pil-badge--pending"  },
  accepted: { label: "Accepted", cls: "pil-badge--accepted" },
  expired:  { label: "Expired",  cls: "pil-badge--expired"  },
  revoked:  { label: "Revoked",  cls: "pil-badge--revoked"  },
};

const TYPE_BADGE = {
  member: { label: "Member", cls: "pil-type--member", Icon: Users },
  guest:  { label: "Guest",  cls: "pil-type--guest",  Icon: Eye  },
};

const PAGE_SIZE = 10;

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────────────────────── */

function formatDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function inviterName(invite) {
  const by = invite.invitedBy;
  if (!by) return "—";
  if (typeof by === "object") return by.name || by.email || "—";
  return "—";
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────────────────────────────────────── */

export default function PendingInvitesList({ workspaceId, refreshKey = 0 }) {
  const [invites, setInvites]     = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [pages, setPages]         = useState(1);
  const [loading, setLoading]     = useState(false);
  const [statusFilter, setStatusFilter]   = useState("");
  const [typeFilter, setTypeFilter]       = useState("");
  const [actionLoading, setActionLoading] = useState({});  // { inviteId: 'resend' | 'revoke' }

  /* ── fetch invites ── */
  const fetchInvites = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const { data } = await workspaceAPI.getAllInvites(workspaceId, {
        status: statusFilter || undefined,
        inviteType: typeFilter || undefined,
        page,
        limit: PAGE_SIZE,
      });
      const result = data.data || data;
      setInvites(result.invites || []);
      setTotal(result.total ?? 0);
      setPages(result.pages ?? 1);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Failed to load invites");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, statusFilter, typeFilter, page]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites, refreshKey]);

  /* ── socket live updates ── */
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleInviteCreated  = () => { fetchInvites(); };
    const handleInviteRevoked  = ({ inviteId } = {}) => {
      setInvites((prev) =>
        prev.map((inv) =>
          inv._id === inviteId ? { ...inv, status: "revoked" } : inv,
        ),
      );
      toast.success("Invite revoked");
    };
    const handleInviteAccepted = ({ inviteId } = {}) => {
      setInvites((prev) =>
        prev.map((inv) =>
          inv._id === inviteId ? { ...inv, status: "accepted" } : inv,
        ),
      );
    };
    const handleInviteResent   = ({ inviteId } = {}) => {
      toast.success("Invite resent successfully");
      fetchInvites();
    };

    socket.on("invite:created",  handleInviteCreated);
    socket.on("invite:revoked",  handleInviteRevoked);
    socket.on("invite:accepted", handleInviteAccepted);
    socket.on("invite:resent",   handleInviteResent);

    return () => {
      socket.off("invite:created",  handleInviteCreated);
      socket.off("invite:revoked",  handleInviteRevoked);
      socket.off("invite:accepted", handleInviteAccepted);
      socket.off("invite:resent",   handleInviteResent);
    };
  }, [fetchInvites]);

  /* ── actions ── */
  const handleResend = async (inviteId) => {
    setActionLoading((p) => ({ ...p, [inviteId]: "resend" }));
    try {
      await workspaceAPI.resendInvite(workspaceId, inviteId);
      toast.success("Invite resent — new link sent to user");
      fetchInvites();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Failed to resend invite");
    } finally {
      setActionLoading((p) => {
        const next = { ...p };
        delete next[inviteId];
        return next;
      });
    }
  };

  const handleRevoke = async (inviteId) => {
    if (!window.confirm("Revoke this invite? The user will no longer be able to accept it.")) return;
    setActionLoading((p) => ({ ...p, [inviteId]: "revoke" }));
    try {
      await workspaceAPI.revokeInvite(workspaceId, inviteId);
      setInvites((prev) =>
        prev.map((inv) =>
          inv._id === inviteId ? { ...inv, status: "revoked" } : inv,
        ),
      );
      toast.success("Invite revoked");
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Failed to revoke invite");
    } finally {
      setActionLoading((p) => {
        const next = { ...p };
        delete next[inviteId];
        return next;
      });
    }
  };

  /* ── filter changes reset page ── */
  const onStatusChange = (v) => { setStatusFilter(v); setPage(1); };
  const onTypeChange   = (v) => { setTypeFilter(v);   setPage(1); };

  /* ──────────────────────────────────────────────────────────────── RENDER ── */
  return (
    <div className="pil-wrap">
      {/* ── Status Tabs ── */}
      <div className="pil-tabs">
        {STATUS_TABS.map(({ value, label, icon: Icon }) => (
          <button
            key={value || "all"}
            type="button"
            className={`pil-tab${statusFilter === value ? " pil-tab--active" : ""}`}
            onClick={() => onStatusChange(value)}
          >
            <Icon size={12} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Type Filter ── */}
      <div className="pil-type-filter">
        {TYPE_OPTIONS.map(({ value, label }) => (
          <button
            key={value || "all"}
            type="button"
            className={`pil-type-btn${typeFilter === value ? " pil-type-btn--active" : ""}`}
            onClick={() => onTypeChange(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="pil-loading">
          <Loader size={18} className="wm-spin" />
          <span>Loading invites…</span>
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && invites.length === 0 && (
        <div className="pil-empty">
          <Mail size={28} />
          <p>No invites found</p>
          <span className="pil-empty-hint">
            {statusFilter
              ? `No ${statusFilter} invitations. Try a different filter.`
              : "Invite people to get started."}
          </span>
        </div>
      )}

      {/* ── Table ── */}
      {!loading && invites.length > 0 && (
        <div className="pil-table-wrap">
          <table className="pil-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Type</th>
                <th>Role</th>
                <th>Status</th>
                <th>Invited by</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => {
                const typeBadge  = TYPE_BADGE[inv.inviteType]   || TYPE_BADGE.member;
                const statBadge  = STATUS_BADGE[inv.status]     || STATUS_BADGE.pending;
                const isPending  = inv.status === "pending";
                const resendBusy = actionLoading[inv._id] === "resend";
                const revokeBusy = actionLoading[inv._id] === "revoke";
                const canResend  = isPending && (inv.resendCount ?? 0) < 3;

                return (
                  <tr key={inv._id}>
                    {/* Email */}
                    <td className="pil-td-email">
                      <Mail size={12} className="pil-email-icon" />
                      {inv.email}
                    </td>

                    {/* Type badge */}
                    <td>
                      <span className={`pil-type-badge ${typeBadge.cls}`}>
                        <typeBadge.Icon size={11} />
                        {typeBadge.label}
                      </span>
                    </td>

                    {/* Role */}
                    <td className="pil-td-role">
                      {inv.role === "guest" ? (
                        <span className="pil-role-guest"><Eye size={11} /> Guest</span>
                      ) : inv.role === "admin" ? (
                        <span className="pil-role-admin"><Shield size={11} /> Admin</span>
                      ) : (
                        <span className="pil-role-member">Member</span>
                      )}
                    </td>

                    {/* Status badge */}
                    <td>
                      <span className={`pil-status-badge ${statBadge.cls}`}>
                        {statBadge.label}
                      </span>
                    </td>

                    {/* Invited by */}
                    <td className="pil-td-inviter">{inviterName(inv)}</td>

                    {/* Date */}
                    <td className="pil-td-date">{formatDate(inv.createdAt)}</td>

                    {/* Actions */}
                    <td className="pil-td-actions">
                      {isPending && (
                        <>
                          <button
                            type="button"
                            className="pil-action-btn pil-action-btn--resend"
                            title={canResend ? `Resend (${3 - (inv.resendCount ?? 0)} left)` : "Max resends reached"}
                            disabled={!canResend || resendBusy || revokeBusy}
                            onClick={() => handleResend(inv._id)}
                          >
                            {resendBusy
                              ? <Loader size={13} className="wm-spin" />
                              : <RefreshCw size={13} />}
                          </button>
                          <button
                            type="button"
                            className="pil-action-btn pil-action-btn--revoke"
                            title="Revoke invite"
                            disabled={revokeBusy || resendBusy}
                            onClick={() => handleRevoke(inv._id)}
                          >
                            {revokeBusy
                              ? <Loader size={13} className="wm-spin" />
                              : <Ban size={13} />}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {pages > 1 && (
        <div className="pil-pagination">
          <button
            type="button"
            className="pil-page-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={14} />
          </button>
          <span className="pil-page-info">
            Page <strong>{page}</strong> of {pages}
            <span className="pil-page-total"> ({total} total)</span>
          </span>
          <button
            type="button"
            className="pil-page-btn"
            disabled={page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
