import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { workspaceAPI } from "../services/api";
import { motion } from "framer-motion";
import {
  UserPlus,
  Check,
  Clock,
  AlertCircle,
  Loader2,
  Building2,
  Shield,
  User,
} from "lucide-react";
import toast from "react-hot-toast";
import "./custom-css/acceptInvitePage.css";

/**
 * AcceptInvitePage — Public page for accepting workspace invites.
 * Route: /invite/:token
 *
 * Enterprise flow:
 *   Scenario A (authenticated):
 *     Accept Invite → Validate Token → Join Workspace → Set Active Workspace → Redirect Directly To Invited Workspace
 *     No login page. No signup page.
 *
 *   Scenario B (not authenticated):
 *     Accept Invite → Store invite token → Redirect to Login/Register → Complete Auth → Resume Invitation Flow → Join Workspace → Open Invited Workspace
 */
export default function AcceptInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { accessToken, user } = useAuthStore();
  const { fetchWorkspaces, switchWorkspace } = useWorkspaceStore();

  const [inviteInfo, setInviteInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [expiresIn, setExpiresIn] = useState("");
  const autoAcceptTriggered = useRef(false);

  // ─── Accept invite logic (shared by auto-accept and manual click) ───
  const acceptInvite = async () => {
    if (!accessToken) {
      // Scenario B: Store pending invite token in session storage for post-login resume
      sessionStorage.setItem("pendingInviteToken", token);
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }

    setAccepting(true);
    try {
      const response = await workspaceAPI.acceptEmailInvite(token);
      const data = response.data?.data || response.data;

      setSuccess(true);
      toast.success(`Welcome to ${inviteInfo.workspaceName}!`);

      // Determine the workspace ID from multiple sources for robustness
      const workspaceId =
        data.workspaceId ||
        data.workspace?._id ||
        inviteInfo?.workspaceId;

      // Refresh workspaces list without auto-selecting (skipAutoSelect = true)
      // This prevents the store from selecting the first workspace before we switch
      await fetchWorkspaces(true);

      if (workspaceId) {
        // Scenario A: Switch to the invited workspace directly
        await switchWorkspace(workspaceId);
        // Use redirectTo from backend if available, otherwise construct
        const redirectTo = data.redirectTo || `/workspace/${workspaceId}`;
        navigate(redirectTo);
      } else {
        navigate("/select-workspace");
      }
    } catch (err) {
      const message =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        "Failed to accept invite. Please try again.";
      toast.error(message);
      setError(message);
    } finally {
      setAccepting(false);
    }
  };

  // ─── Fetch invite info on mount ───
  useEffect(() => {
    if (!token) {
      setError("Invalid invite link.");
      setLoading(false);
      return;
    }

    const fetchInviteInfo = async () => {
      try {
        const response = await workspaceAPI.getInviteInfo(token);
        const data = response.data?.data || response.data;
        setInviteInfo(data);

        // Calculate expiry countdown
        if (data.expiresAt) {
          const expiryDate = new Date(data.expiresAt);
          const now = new Date();
          const diffMs = expiryDate - now;

          if (diffMs <= 0) {
            setError("This invite has expired.");
            setLoading(false);
            return;
          }

          const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor(
            (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
          );
          setExpiresIn(
            days > 0
              ? `${days} day${days > 1 ? "s" : ""}`
              : `${hours} hour${hours > 1 ? "s" : ""}`,
          );
        }
      } catch (err) {
        const message =
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          "Invalid or expired invite.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchInviteInfo();
  }, [token]);

  // ─── Auto-accept (Scenario A): when authenticated and invite info is loaded ───
  useEffect(() => {
    if (
      !loading &&
      !error &&
      inviteInfo &&
      accessToken &&
      !success &&
      !accepting &&
      !autoAcceptTriggered.current
    ) {
      autoAcceptTriggered.current = true;
      acceptInvite();
    }
  }, [loading, error, inviteInfo, accessToken, success, accepting]);

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="aip-container">
        <div className="aip-loading">
          <Loader2 size={48} className="aip-spinner" />
          <p>Loading invite details...</p>
        </div>
      </div>
    );
  }

  // ─── Error state (invite info could not be loaded) ───
  if (error && !inviteInfo) {
    return (
      <div className="aip-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="aip-error-card"
        >
          <AlertCircle size={48} className="aip-error-icon" />
          <h2>Unable to Accept Invite</h2>
          <p>{error}</p>
          <div className="aip-error-actions">
            <Link to="/login" className="aip-btn aip-btn-primary">
              Sign In
            </Link>
            <Link to="/register" className="aip-btn aip-btn-secondary">
              Create Account
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── Auto-accepting state (authenticated user, accepting in progress) ───
  if (accepting && accessToken) {
    return (
      <div className="aip-container">
        <div className="aip-loading">
          <Loader2 size={48} className="aip-spinner" />
          <p>Joining {inviteInfo?.workspaceName}...</p>
        </div>
      </div>
    );
  }

  // ─── Success state ───
  if (success) {
    return (
      <div className="aip-container">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="aip-success-card"
        >
          <div className="aip-success-icon">
            <Check size={48} />
          </div>
          <h2>Welcome aboard!</h2>
          <p>
            You've successfully joined{" "}
            <strong>{inviteInfo?.workspaceName}</strong>.
          </p>
          <p className="aip-redirect-text">Redirecting to workspace...</p>
        </motion.div>
      </div>
    );
  }

  // ─── Main invite display (unauthenticated users or manual accept) ───
  return (
    <div className="aip-container">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="aip-card"
      >
        {/* Header */}
        <div className="aip-header">
          <div className="aip-header-icon">
            <UserPlus size={32} color="#fff" />
          </div>
          <h1>You're Invited!</h1>
          <p className="aip-subtitle">
            <strong>{inviteInfo.inviterName}</strong> invited you to join
          </p>
        </div>

        {/* Workspace Info */}
        <div className="aip-workspace-info">
          {inviteInfo.workspaceLogo ? (
            <img
              src={inviteInfo.workspaceLogo}
              alt={inviteInfo.workspaceName}
              className="aip-workspace-logo"
            />
          ) : (
            <div className="aip-workspace-logo-placeholder">
              <Building2 size={32} />
            </div>
          )}
          <div className="aip-workspace-details">
            <h2>{inviteInfo.workspaceName}</h2>
            <div className="aip-badge-row">
              <span className={`aip-badge aip-badge-${inviteInfo.inviteType}`}>
                {inviteInfo.inviteType === "guest" ? (
                  <>
                    <Shield size={12} />
                    Guest Access
                  </>
                ) : (
                  <>
                    <User size={12} />
                    Member
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Invite Details */}
        <div className="aip-details">
          <div className="aip-detail-item">
            <Clock size={16} />
            <span>{expiresIn ? `Expires in ${expiresIn}` : "Expires in 7 days"}</span>
          </div>
          <div className="aip-detail-item">
            <Shield size={16} />
            <span>
              Role: <strong className="aip-capitalize">{inviteInfo.role}</strong>
            </span>
          </div>
          {inviteInfo.inviteType === "guest" && (
            <div className="aip-guest-notice">
              <AlertCircle size={14} />
              <span>Guest accounts have limited access to specific channels only.</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="aip-actions">
          {accessToken ? (
            <>
              <p className="aip-signed-in-as">
                Signed in as <strong>{user?.email}</strong>
              </p>
              {error && <p className="aip-inline-error">{error}</p>}
              <button
                onClick={acceptInvite}
                disabled={accepting}
                className="aip-accept-btn"
              >
                {accepting ? (
                  <>
                    <Loader2 size={18} className="aip-spinner-sm" />
                    Accepting...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Accept Invite
                  </>
                )}
              </button>
              <Link to="/select-workspace" className="aip-skip-link">
                Not now
              </Link>
            </>
          ) : (
            <>
              <Link
                to={`/login?redirect=${encodeURIComponent(location.pathname)}`}
                className="aip-btn aip-btn-primary aip-full-width"
              >
                Sign In to Accept
              </Link>
              <Link
                to={`/register?redirect=${encodeURIComponent(location.pathname)}`}
                className="aip-btn aip-btn-secondary aip-full-width"
              >
                Create Account
              </Link>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}