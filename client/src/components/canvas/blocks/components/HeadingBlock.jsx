import React from 'react';
import { useCanvasStore } from '../../../../stores/canvasStore';

export default function HeadingBlock({ block, level = 1, children, onOpenComments }) {
  const comments = useCanvasStore((s) => s.comments);
  const count = block?._id ? comments.filter((c) => c.blockId === block._id).length : 0;

  const HeadingTag = `h${Math.min(3, Math.max(1, level))}`;

  return (
    <div className="heading-block">
      <div className="heading-content">
        <HeadingTag className="heading-node">{children}</HeadingTag>
      </div>

      <div className="heading-meta">
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
