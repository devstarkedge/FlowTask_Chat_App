import React from 'react';
import { useCanvasStore } from '../../../../stores/canvasStore';

export default function TaskBlock({ block, checked = false, onToggle, children, onOpenComments }) {
  const comments = useCanvasStore((s) => s.comments);
  const count = block?._id ? comments.filter((c) => c.blockId === block._id).length : 0;

  return (
    <div className="task-block" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <label
        className="task-left"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 3,
          cursor: 'pointer',
        }}
        contentEditable={false}
      >
        <input
          type="checkbox"
          className="task-checkbox"
          checked={!!checked}
          onChange={() => onToggle && onToggle()}
          aria-label={checked ? 'Mark task incomplete' : 'Mark task complete'}
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            border: '2px solid var(--border-primary)',
            cursor: 'pointer',
            accentColor: 'var(--accent-primary)',
            flexShrink: 0,
          }}
        />
      </label>

      <div
        className="task-content"
        style={{
          flex: 1,
          minWidth: 0,
          lineHeight: 1.6,
          outline: 'none',
        }}
      >
        {children}
      </div>

      <div className="task-meta" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }} contentEditable={false}>
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
