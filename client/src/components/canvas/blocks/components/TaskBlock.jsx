import React from 'react';
import { useCanvasStore } from '../../../../stores/canvasStore';

export default function TaskBlock({ block, checked = false, onToggle, children, onOpenComments }) {
  const comments = useCanvasStore((s) => s.comments);
  const count = block?._id ? comments.filter((c) => c.blockId === block._id).length : 0;

  return (
    <div className="task-block">
      <label className="task-left" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <input
          type="checkbox"
          className="task-checkbox"
          checked={!!checked}
          onChange={() => onToggle && onToggle()}
          aria-label={checked ? 'Mark task incomplete' : 'Mark task complete'}
        />
      </label>

      <div className="task-content">{children}</div>

      <div className="task-meta">
        <button type="button" className="block-comment-indicator" onClick={onOpenComments}>
          {count > 0 ? `💬 ${count}` : '💬'}
        </button>
        {block?.reactions && (
          <div className="block-reactions-inline">
            {Object.entries(block.reactions).map(([emoji, users]) => (
              <span key={emoji} className="reaction-pill">
                {emoji} {Array.isArray(users) ? users.length : users}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
