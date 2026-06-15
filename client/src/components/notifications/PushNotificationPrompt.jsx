import { AnimatePresence, motion } from "framer-motion";
import { Bell, Lock, Sparkles, X } from "lucide-react";

export default function PushNotificationPrompt({ prompt }) {
  if (!prompt?.isOpen) return null;

  const needsGuidance = prompt.mode === "blocked" || prompt.mode === "denied";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="push-prompt-overlay"
        style={{
          position: "fixed",
          inset: 0,
          background:
            "linear-gradient(var(--bg-overlay-light, rgba(15,23,42,0.55)), var(--bg-overlay-dark, rgba(15,23,42,0.7)))",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.94 }}
          transition={{
            duration: 0.35,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="push-prompt-card"
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 430,
            overflow: "hidden",
            borderRadius: 28,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "linear-gradient(180deg, var(--surface-primary, #ffffff) 0%, var(--surface-secondary, #f8fafc) 100%)",
            boxShadow:
              "0 30px 80px rgba(0,0,0,0.28), 0 10px 30px rgba(0,0,0,0.12)",
            color: "var(--text-primary)",
          }}
        >
          {/* Glow */}
          <div
            style={{
              position: "absolute",
              top: -120,
              right: -100,
              width: 260,
              height: 260,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, var(--accent-primary, #2563eb) 0%, transparent 70%)",
              opacity: 0.15,
              pointerEvents: "none",
            }}
          />

          {needsGuidance ? (
            <div style={{ padding: 32, position: "relative" }}>
              <button
                onClick={prompt.onLater}
                style={{
                  position: "absolute",
                  top: 18,
                  right: 18,
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border: "1px solid var(--border-primary)",
                  background: "var(--bg-secondary, rgba(255,255,255,0.65))",
                  backdropFilter: "blur(10px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  transition: "0.2s ease",
                }}
              >
                <X size={18} />
              </button>

              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                style={{
                  width: 82,
                  height: 82,
                  margin: "0 auto 24px",
                  borderRadius: 24,
                  background:
                    "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(249,115,22,0.12))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid rgba(239,68,68,0.15)",
                  boxShadow: "0 10px 30px rgba(239,68,68,0.12)",
                }}
              >
                <Lock size={36} color="var(--danger-primary, #ef4444)" />
              </motion.div>

              <div style={{ textAlign: "center" }}>
                <h2
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    marginBottom: 12,
                    letterSpacing: "-0.03em",
                  }}
                >
                  Notifications are blocked
                </h2>

                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: "var(--text-secondary)",
                    marginBottom: 28,
                  }}
                >
                  Your browser is currently blocking notifications for FlowTask.
                  Click the lock icon 🔒 in your browser address bar and change
                  notifications access to <strong>Allow</strong>.
                </p>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 18,
                  background: "var(--bg-card, rgba(255,255,255,0.7))",
                  border: "1px solid var(--border-primary)",
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      minWidth: 36,
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      background: "linear-gradient(135deg, #f97316, #ef4444)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                    }}
                  >
                    <Sparkles size={16} />
                  </div>

                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: "var(--text-secondary)",
                      }}
                    >
                      Once enabled, you'll instantly receive updates for
                      mentions, assignments, and new activity.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={prompt.onLater}
                style={{
                  width: "100%",
                  height: 50,
                  borderRadius: 16,
                  border: "1px solid var(--border-primary)",
                  background:
                    "var(--bg-button-secondary, linear-gradient(180deg, var(--bg-primary, #ffffff), var(--bg-secondary, rgba(255,255,255,0.85))))",
                  color: "var(--text-primary)",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "0.2s ease",
                }}
              >
                Got it
              </button>
            </div>
          ) : (
            <div style={{ padding: 34, position: "relative" }}>
              {/* Badge */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderRadius: 999,
                  background:
                    "linear-gradient(135deg, rgba(37,99,235,0.14), rgba(99,102,241,0.12))",
                  border: "1px solid rgba(37,99,235,0.14)",
                  marginBottom: 26,
                }}
              >
                <Sparkles size={14} color="var(--accent-primary, #2563eb)" />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--accent-primary, #2563eb)",
                  }}
                >
                  Smart Notifications
                </span>
              </div>

              {/* Icon */}
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.05 }}
                style={{
                  width: 92,
                  height: 92,
                  margin: "0 auto 26px",
                  borderRadius: 28,
                  background:
                    "linear-gradient(135deg, var(--accent-primary, #2563eb), #7c3aed)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 20px 40px rgba(37,99,235,0.28)",
                }}
              >
                <Bell size={42} color="#fff" />
              </motion.div>

              <div style={{ textAlign: "center" }}>
                <h2
                  style={{
                    fontSize: 30,
                    lineHeight: 1.1,
                    fontWeight: 800,
                    letterSpacing: "-0.04em",
                    margin: "0 0 16px",
                  }}
                >
                  Never miss an update
                </h2>

                <p
                  style={{
                    fontSize: 15,
                    lineHeight: 1.75,
                    color: "var(--text-secondary)",
                    margin: "0 0 30px",
                  }}
                >
                  Stay connected with real-time alerts for tasks, mentions,
                  comments, and important workspace activity — even when
                  FlowTask is closed.
                </p>
              </div>

              {/* Features */}
              <div
                style={{
                  display: "grid",
                  gap: 14,
                  marginBottom: 30,
                }}
              >
                {[
                  "Task assignments & status updates",
                  "Mentions in chats and comments",
                  "Project activity & team updates",
                ].map((item, index) => (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 16px",
                      borderRadius: 18,
                      background: "var(--bg-card, rgba(255,255,255,0.7))",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "var(--accent-primary, #2563eb)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {item}
                    </span>
                  </div>
                ))}
              </div>

              {/* Buttons */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ scale: 1.01 }}
                  onClick={async () => {
                    try {
                      await prompt.onEnable({ silent: false });

                      // auto close popup after enabling
                      prompt.onLater?.();
                    } catch (error) {
                      console.error(error);
                    }
                  }}
                  disabled={prompt.isBusy}
                  style={{
                    width: "100%",
                    height: 54,
                    borderRadius: 18,
                    border: "none",
                    background:
                      "linear-gradient(135deg, var(--accent-primary, #2563eb), #7c3aed)",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    boxShadow: "0 16px 30px rgba(37,99,235,0.24)",
                  }}
                >
                  <Bell size={18} />
                  {prompt.isBusy
                    ? "Enabling notifications..."
                    : "Enable notifications"}
                </motion.button>

                <button
                  onClick={prompt.onLater}
                  disabled={prompt.isBusy}
                  style={{
                    width: "100%",
                    height: 52,
                    borderRadius: 18,
                    border: "1px solid var(--border-primary)",
                    background: "var(--bg-button-disabled, rgba(255,255,255,0.65))",
                    color: "var(--text-secondary)",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  Maybe later
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
