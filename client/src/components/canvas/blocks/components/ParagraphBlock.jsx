import React from 'react';
import { useCanvasStore } from '../../../../stores/canvasStore';

export default function ParagraphBlock({ block, children, onOpenComments }) {
  const comments = useCanvasStore((s) => s.comments);
  const count = block?._id ? comments.filter((c) => c.blockId === block._id).length : 0;

  return (
    <div className="paragraph-block">
      <div className="paragraph-content">{children}</div>

      <div className="paragraph-meta">
        <button
          type="button"
          className="block-comment-indicator"
          onClick={onOpenComments}
          aria-label="Open comments"
          title="Open comments"
        >
          {count > 0 ? `💬 ${count}` : '💬'}
        </button>

        {block?.reactions && (
          <div className="block-reactions-inline" aria-hidden>
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
