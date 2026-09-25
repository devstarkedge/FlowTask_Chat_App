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
          padding: "min(24px, 3vh) min(24px, 4vw)",
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
            width: "min(92vw, 430px)",
            maxWidth: 430,
            maxHeight: "min(90vh, 740px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: "clamp(20px, 3.5vh, 28px)",
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
            <div
              style={{
                padding: "clamp(20px, 3.8vh, 32px) clamp(18px, 4.5vw, 32px)",
                position: "relative",
                overflowY: "auto",
                maxHeight: "100%",
                scrollbarWidth: "thin",
              }}
            >
              <button
                onClick={prompt.onLater}
                style={{
                  position: "absolute",
                  top: "clamp(12px, 2vh, 18px)",
                  right: "clamp(12px, 2vw, 18px)",
                  width: "clamp(30px, 4vh, 34px)",
                  height: "clamp(30px, 4vh, 34px)",
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
                  zIndex: 2,
                }}
              >
                <X style={{ width: "clamp(15px, 2vh, 18px)", height: "clamp(15px, 2vh, 18px)" }} />
              </button>

              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                style={{
                  width: "clamp(64px, 9vh, 82px)",
                  height: "clamp(64px, 9vh, 82px)",
                  margin: "0 auto clamp(14px, 2.8vh, 24px)",
                  borderRadius: "clamp(18px, 2.5vh, 24px)",
                  background:
                    "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(249,115,22,0.12))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid rgba(239,68,68,0.15)",
                  boxShadow: "0 10px 30px rgba(239,68,68,0.12)",
                }}
              >
                <Lock
                  style={{ width: "clamp(28px, 4vh, 36px)", height: "clamp(28px, 4vh, 36px)" }}
                  color="var(--danger-primary, #ef4444)"
                />
              </motion.div>

              <div style={{ textAlign: "center" }}>
                <h2
                  style={{
                    fontSize: "clamp(20px, 3vh, 24px)",
                    fontWeight: 800,
                    marginBottom: "clamp(8px, 1.5vh, 12px)",
                    letterSpacing: "-0.03em",
                  }}
                >
                  Notifications are blocked
                </h2>

                <p
                  style={{
                    fontSize: "clamp(13px, 1.7vh, 14px)",
                    lineHeight: "clamp(1.45, 2vh, 1.7)",
                    color: "var(--text-secondary)",
                    marginBottom: "clamp(16px, 3vh, 28px)",
                  }}
                >
                  Your browser is currently blocking notifications for FlowTask.
                  Click the lock icon 🔒 in your browser address bar and change
                  notifications access to <strong>Allow</strong>.
                </p>
              </div>

              <div
                style={{
                  padding: "clamp(12px, 2vh, 16px)",
                  borderRadius: "clamp(14px, 2vh, 18px)",
                  background: "var(--bg-card, rgba(255,255,255,0.7))",
                  border: "1px solid var(--border-primary)",
                  marginBottom: "clamp(16px, 3vh, 24px)",
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
                      minWidth: "clamp(30px, 4vh, 36px)",
                      width: "clamp(30px, 4vh, 36px)",
                      height: "clamp(30px, 4vh, 36px)",
                      borderRadius: 12,
                      background: "linear-gradient(135deg, #f97316, #ef4444)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    <Sparkles style={{ width: "clamp(14px, 2vh, 16px)", height: "clamp(14px, 2vh, 16px)" }} />
                  </div>

                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "clamp(12px, 1.6vh, 13px)",
                        lineHeight: 1.5,
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
                  height: "clamp(42px, 5.5vh, 50px)",
                  borderRadius: "clamp(12px, 2vh, 16px)",
                  border: "1px solid var(--border-primary)",
                  background:
                    "var(--bg-button-secondary, linear-gradient(180deg, var(--bg-primary, #ffffff), var(--bg-secondary, rgba(255,255,255,0.85))))",
                  color: "var(--text-primary)",
                  fontSize: "clamp(13px, 1.7vh, 14px)",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "0.2s ease",
                }}
              >
                Got it
              </button>
            </div>
          ) : (
            <div
              style={{
                padding: "clamp(20px, 3.8vh, 34px) clamp(18px, 4.5vw, 34px)",
                position: "relative",
                overflowY: "auto",
                maxHeight: "100%",
                scrollbarWidth: "thin",
              }}
            >
              {/* Badge */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "clamp(6px, 1vh, 8px) clamp(10px, 1.5vw, 14px)",
                  borderRadius: 999,
                  background:
                    "linear-gradient(135deg, rgba(37,99,235,0.14), rgba(99,102,241,0.12))",
                  border: "1px solid rgba(37,99,235,0.14)",
                  marginBottom: "clamp(14px, 2.6vh, 26px)",
                }}
              >
                <Sparkles
                  style={{ width: "clamp(12px, 1.6vh, 14px)", height: "clamp(12px, 1.6vh, 14px)" }}
                  color="var(--accent-primary, #2563eb)"
                />
                <span
                  style={{
                    fontSize: "clamp(10px, 1.2vh, 11px)",
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
                  width: "clamp(68px, 10vh, 92px)",
                  height: "clamp(68px, 10vh, 92px)",
                  margin: "0 auto clamp(14px, 2.8vh, 26px)",
                  borderRadius: "clamp(20px, 3vh, 28px)",
                  background:
                    "linear-gradient(135deg, var(--accent-primary, #2563eb), #7c3aed)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 20px 40px rgba(37,99,235,0.28)",
                  flexShrink: 0,
                }}
              >
                <Bell
                  style={{ width: "clamp(30px, 4.5vh, 42px)", height: "clamp(30px, 4.5vh, 42px)" }}
                  color="#fff"
                />
              </motion.div>

              <div style={{ textAlign: "center" }}>
                <h2
                  style={{
                    fontSize: "clamp(22px, 3.4vh, 30px)",
                    lineHeight: 1.15,
                    fontWeight: 800,
                    letterSpacing: "-0.04em",
                    margin: "0 0 clamp(8px, 1.6vh, 16px)",
                  }}
                >
                  Never miss an update
                </h2>

                <p
                  style={{
                    fontSize: "clamp(13px, 1.7vh, 15px)",
                    lineHeight: "clamp(1.45, 2vh, 1.75)",
                    color: "var(--text-secondary)",
                    margin: "0 0 clamp(14px, 3vh, 30px)",
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
                  gap: "clamp(8px, 1.4vh, 14px)",
                  marginBottom: "clamp(14px, 3vh, 30px)",
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
                      gap: "clamp(10px, 1.5vw, 14px)",
                      padding: "clamp(9px, 1.6vh, 14px) clamp(12px, 2vw, 16px)",
                      borderRadius: "clamp(12px, 2vh, 18px)",
                      background: "var(--bg-card, rgba(255,255,255,0.7))",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    <div
                      style={{
                        width: "clamp(8px, 1.1vh, 10px)",
                        height: "clamp(8px, 1.1vh, 10px)",
                        borderRadius: "50%",
                        background: "var(--accent-primary, #2563eb)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "clamp(12.5px, 1.6vh, 14px)",
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
                  gap: "clamp(8px, 1.4vh, 12px)",
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
                    height: "clamp(42px, 5.5vh, 54px)",
                    borderRadius: "clamp(13px, 2vh, 18px)",
                    border: "none",
                    background:
                      "linear-gradient(135deg, var(--accent-primary, #2563eb), #7c3aed)",
                    color: "#fff",
                    fontSize: "clamp(13.5px, 1.7vh, 15px)",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    boxShadow: "0 16px 30px rgba(37,99,235,0.24)",
                  }}
                >
                  <Bell style={{ width: "clamp(15px, 2vh, 18px)", height: "clamp(15px, 2vh, 18px)" }} />
                  {prompt.isBusy
                    ? "Enabling notifications..."
                    : "Enable notifications"}
                </motion.button>

                <button
                  onClick={prompt.onLater}
                  disabled={prompt.isBusy}
                  style={{
                    width: "100%",
                    height: "clamp(40px, 5.2vh, 52px)",
                    borderRadius: "clamp(13px, 2vh, 18px)",
                    border: "1px solid var(--border-primary)",
                    background: "var(--bg-button-disabled, rgba(255,255,255,0.65))",
                    color: "var(--text-secondary)",
                    fontSize: "clamp(13px, 1.6vh, 14px)",
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
