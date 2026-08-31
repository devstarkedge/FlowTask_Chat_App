import { useRef } from "react";

export default function useRipple() {
  const ref = useRef(null);

  const trigger = (e) => {
    const el = ref.current;
    if (!el) return;

    const r = document.createElement("span");
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);

    r.style.cssText = `
      position:absolute;
      border-radius:50%;
      pointer-events:none;
      background:rgba(255,255,255,0.30);
      width:${size}px;
      height:${size}px;
      left:${e.clientX - rect.left - size / 2}px;
      top:${e.clientY - rect.top - size / 2}px;
      animation:jw-ripple 0.55s ease-out forwards;
    `;

    el.appendChild(r);
    setTimeout(() => r.remove(), 600);
  };

  return [ref, trigger];
}