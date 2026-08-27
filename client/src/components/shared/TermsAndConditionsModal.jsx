import { useEffect } from "react";
import { X } from "lucide-react";
import { TERMS_LAST_UPDATED, TERMS_INTRO, TERMS_SECTIONS } from "../../data/termsContent";

/**
 * TermsAndConditionsModal — scrollable viewer for the Flow Task Terms &
 * Conditions, shown from the registration page. Locks background scroll
 * while open and closes on overlay click or Escape.
 */
export default function TermsAndConditionsModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Flow Task Terms & Conditions"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(9,9,11,.62)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)",
          maxHeight: "min(82vh, 780px)",
          display: "flex",
          flexDirection: "column",
          borderRadius: 18,
          overflow: "hidden",
          background: "var(--bg-primary, #fff)",
          boxShadow: "0 24px 70px rgba(0,0,0,.35)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-primary, #e4e4e7)",
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: "-.02em", color: "var(--text-primary, #18181b)" }}>
              Flow Task — Terms &amp; Conditions
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted, #71717a)" }}>
              Last Updated: {TERMS_LAST_UPDATED}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Terms & Conditions"
            style={{
              display: "grid",
              placeItems: "center",
              width: 32,
              height: 32,
              borderRadius: 9,
              border: "1px solid var(--border-primary, #e4e4e7)",
              background: "transparent",
              color: "var(--text-secondary, #3f3f46)",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", padding: "18px 22px 26px" }}>
          {TERMS_INTRO.map((text, i) => (
            <p key={i} style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary, #3f3f46)" }}>
              {text}
            </p>
          ))}

          {TERMS_SECTIONS.map(({ heading, blocks }) => (
            <section key={heading} style={{ marginTop: 18 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14.5, fontWeight: 700, letterSpacing: "-.01em", color: "var(--text-primary, #18181b)" }}>
                {heading}
              </h3>
              {blocks.map((block, bi) => {
                if (block.type === "ul") {
                  return (
                    <ul key={bi} style={{ margin: "0 0 10px", paddingLeft: 22 }}>
                      {block.items.map((item, ii) => (
                        <li key={ii} style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--text-secondary, #3f3f46)" }}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  );
                }
                return (
                  <p key={bi} style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.7, color: "var(--text-secondary, #3f3f46)" }}>
                    {block.text}
                  </p>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
