import React, { useMemo } from "react";
import { useCanvasStore } from "../../../stores/canvasStore";

const CursorOverlay = React.memo(({ awarenessUsers = [] }) => {
  const socketCursors = useCanvasStore((s) => s.cursors || {});
  const socketTyping = useCanvasStore((s) => s.typing || {});

  // Build cursor map: awareness cursors take precedence over socket cursors
  const cursorMap = useMemo(() => {
    const map = {};
    
    (awarenessUsers || []).forEach((u) => {
      if (!u || !u.id) return;
      if (u.cursor && u.cursor.blockId) {
        map[u.id] = {
          blockId: u.cursor.blockId,
          x: typeof u.cursor.x === 'number' ? u.cursor.x : null,
          y: typeof u.cursor.y === 'number' ? u.cursor.y : null,
          name: u.name || 'Anonymous',
          color: u.color || '#4e7cff',
        };
      }
    });

    Object.keys(socketCursors || {}).forEach((k) => {
      if (map[k]) return; // awareness wins
      const c = socketCursors[k];
      if (!c || !c.blockId) return;
      map[k] = { blockId: c.blockId, x: c.x, y: c.y, name: c.name || 'Anonymous', color: c.color || '#4e7cff' };
    });
    
    return map;
  }, [awarenessUsers, socketCursors]);

  const cursorEntries = useMemo(() => Object.entries(cursorMap || {}), [cursorMap]);

  const typingBlocks = useMemo(() => {
    const blocks = {};
    (awarenessUsers || []).forEach((u) => {
      if (!u || !u.id) return;
      if (u.typing && u.cursor && u.cursor.blockId) {
        blocks[u.cursor.blockId] = blocks[u.cursor.blockId] || {};
        blocks[u.cursor.blockId][u.id] = u.name || 'Anonymous';
      }
    });
    Object.entries(socketTyping || {}).forEach(([blockId, users]) => {
      blocks[blockId] = { ...(blocks[blockId] || {}), ...(users || {}) };
    });
    return blocks;
  }, [awarenessUsers, socketTyping]);

  if (!cursorEntries.length && Object.keys(typingBlocks).length === 0) return null;

  return (
    <div className="canvas-cursor-overlay" aria-hidden>
      {cursorEntries.map(([userId, c]) => {
        if (!c || !c.blockId) return null;
        try {
          const el = document.querySelector(`[data-block-id="${c.blockId}"]`);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const container = document.querySelector('.canvas-document-surface');
          const containerRect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };

          const left = typeof c.x === 'number' ? Math.round(c.x + 6) : Math.round(rect.right - containerRect.left + 6);
          const top = typeof c.y === 'number' ? Math.round(c.y + 6) : Math.round(rect.top - containerRect.top + 6);

          const name = c.name || "Anonymous";

          return (
            <div
              key={userId}
              className="cursor-indicator"
              style={{ position: "absolute", left: `${left}px`, top: `${top}px`, pointerEvents: "none" }}
            >
              <div className="cursor-badge" style={{ background: c.color || '#4e7cff' }}>{name[0] || '?'}</div>
              <div className="cursor-name">{name}</div>
            </div>
          );
        } catch (err) {
          return null;
        }
      })}

      {/* Typing bubbles (may not have a cursor coord; fall back to block position) */}
      {Object.entries(typingBlocks).flatMap(([blockId, users]) =>
        Object.entries(users || {}).map(([userId, name]) => {
          try {
            const c = cursorMap[userId];
            let left = 0;
            let top = 0;
            const container = document.querySelector('.canvas-document-surface');
            const containerRect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };

            if (c && typeof c.x === 'number' && typeof c.y === 'number') {
              left = c.x + 8;
              top = c.y - 10;
            } else {
              const el = document.querySelector(`[data-block-id="${blockId}"]`);
              if (!el) return null;
              const rect = el.getBoundingClientRect();
              left = Math.round(rect.right - containerRect.left - 40);
              top = Math.round(rect.top - containerRect.top - 8);
            }

            return (
              <div
                key={`typing-${userId}`}
                className="typing-bubble"
                style={{ position: "absolute", left: `${left}px`, top: `${top}px`, pointerEvents: "none" }}
              >
                {name}
              </div>
            );
          } catch (err) {
            return null;
          }
        })
      )}
    </div>
  );
});

export default CursorOverlay;