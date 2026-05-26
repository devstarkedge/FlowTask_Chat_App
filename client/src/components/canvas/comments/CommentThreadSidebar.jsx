import { useState } from "react";
import { Check, MessageSquarePlus, X } from "lucide-react";

function authorName(author) {
  return author?.name || author?.authorId?.name || "Teammate";
}

export default function CommentThreadSidebar({
  comments = [],
  onClose,
  onResolve,
  onReply,
  onCreateDocumentComment,
}) {
  const [replyByComment, setReplyByComment] = useState({});
  const [newComment, setNewComment] = useState("");

  return (
    <aside className="canvas-sidebar" aria-label="Canvas comments">
      <div className="canvas-sidebar-header">
        <div>
          <strong>Comments</strong>
          <span>{comments.length} open</span>
        </div>
        <button type="button" aria-label="Close comments" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="canvas-comment-composer">
        <textarea
          value={newComment}
          placeholder="Start a thread..."
          onChange={(event) => setNewComment(event.target.value)}
        />
        <button
          type="button"
          disabled={!newComment.trim()}
          onClick={() => {
            onCreateDocumentComment?.(newComment.trim());
            setNewComment("");
          }}
        >
          <MessageSquarePlus size={14} />
          Add
        </button>
      </div>

      <div className="canvas-comment-list">
        {comments.length === 0 ? (
          <div className="canvas-sidebar-empty">No unresolved threads</div>
        ) : (
          comments.map((comment) => {
            const reply = replyByComment[comment._id] || "";

            return (
              <article className="canvas-comment-thread" key={comment._id}>
                <header>
                  <strong>{authorName(comment.authorId)}</strong>
                  <button type="button" onClick={() => onResolve(comment._id)}>
                    <Check size={13} />
                    Resolve
                  </button>
                </header>
                <p>{comment.content}</p>
                {(comment.replies || []).map((item, index) => (
                  <div className="canvas-comment-reply" key={`${comment._id}-${index}`}>
                    <strong>{authorName(item.authorId)}</strong>
                    <span>{item.content}</span>
                  </div>
                ))}
                <div className="canvas-comment-reply-box">
                  <input
                    value={reply}
                    placeholder="Reply..."
                    onChange={(event) =>
                      setReplyByComment((state) => ({
                        ...state,
                        [comment._id]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || !reply.trim()) return;
                      onReply(comment._id, reply.trim());
                      setReplyByComment((state) => ({ ...state, [comment._id]: "" }));
                    }}
                  />
                </div>
              </article>
            );
          })
        )}
      </div>
    </aside>
  );
}
