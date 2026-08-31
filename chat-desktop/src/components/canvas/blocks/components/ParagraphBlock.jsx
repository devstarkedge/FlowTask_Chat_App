import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useCanvasStore } from '../../../../stores/canvasStore';

export default function ParagraphBlock({ block, children, onOpenComments }) {
  const comments = useCanvasStore((s) => s.comments);
  const count = block?._id
    ? comments.filter((c) => {
        const cBlockId = c.blockId?._id || c.blockId;
        return String(cBlockId) === String(block._id) && !c.resolved;
      }).length
    : 0;

  return (
    <div className="paragraph-block">
      <div className="paragraph-content">{children}</div>

      <div className="paragraph-meta">
        {block?.reactions && (
          <div className="block-reactions-inline">
            {Object.entries(block.reactions).map(([emoji, users]) => {
              const count = Array.isArray(users) ? users.length : users;
              if (count === 0) return null;
              return (
                <button
                  key={emoji}
                  type="button"
                  className="reaction-pill"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (block?._id) {
                      useCanvasStore.getState().toggleBlockReaction(block._id, emoji);
                    }
                  }}
                >
                  {emoji} {count}
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className={`block-comment-indicator${count > 0 ? ' has-comments' : ''}`}
          onClick={onOpenComments}
          aria-label="Open comments"
          title={count > 0 ? `${count} comment${count !== 1 ? 's' : ''}` : 'Add comment'}
        >
          <MessageSquare size={14} />
          {count > 0 && <span className="block-comment-count">{count}</span>}
        </button>
      </div>
    </div>
  );
}
