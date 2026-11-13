import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link2 } from "lucide-react";
import toast from "react-hot-toast";

export default function MessageLinkContextMenu({ context, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!context) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose();
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [context, onClose]);

  if (!context || typeof document === "undefined") return null;
  const left = Math.max(8, Math.min(context.x, window.innerWidth - 168));
  const top = Math.max(8, Math.min(context.y, window.innerHeight - 48));
  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(context.url);
      else {
        const input = document.createElement("textarea");
        input.value = context.url;
        input.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(input);
        if (!copied) throw new Error("Clipboard copy failed");
      }
      toast.success("Link copied", { duration: 1500 });
    } catch {
      toast.error("Failed to copy link");
    } finally {
      onClose();
    }
  };

  return createPortal(
    <div ref={menuRef} role="menu" style={{ position: "fixed", left, top, zIndex: 100000, minWidth: 160, padding: 4, borderRadius: 8, background: "var(--bg-secondary, #222529)", border: "1px solid var(--border-primary, rgba(255,255,255,0.12))", boxShadow: "0 8px 24px rgba(0,0,0,0.24)" }}>
      <button type="button" role="menuitem" onClick={copyLink} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px", border: 0, borderRadius: 5, background: "transparent", color: "var(--text-primary, #f3f4f6)", font: "inherit", fontSize: 13, textAlign: "left", cursor: "pointer" }} onMouseEnter={(event) => { event.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.08))"; }} onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}>
        <Link2 size={15} />
        Copy Link
      </button>
    </div>,
    document.body,
  );
}
