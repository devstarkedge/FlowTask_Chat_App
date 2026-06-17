import { useState, useRef, useEffect } from "react";
import { Check, MessageSquarePlus, X, Reply, Clock } from "lucide-react";
import { Avatar } from "../../chat/MemberAvatarGroup";

function formatTime(value) {
  if (!value) return "";
  const d = new Date(value);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getAuthorInfo(author) {
  if (!author) return { name: "Unknown", avatar: null };
  const obj = author.authorId || author;
  if (typeof obj === "string") return { name: "User", avatar: null };
  return {
    name: obj.name || "Unknown",
    avatar: obj.avatar || null,
  };
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
  const listEndRef = useRef(null);

  // Auto-scroll to bottom when new comments arrive
  useEffect(() => {
    if (listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [comments.length]);

  return (
    <aside className="canvas-sidebar canvas-comments-sidebar" aria-label="Canvas comments">
      <div className="canvas-sidebar-header">
        <div>
          <strong>Comments</strong>
          <span className="canvas-comment-count">{comments.length} unresolved</span>
        </div>
        <button type="button" aria-label="Close comments" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {/* New comment composer */}
      <div className="canvas-comment-composer">
        <textarea
          value={newComment}
          placeholder="Start a thread..."
          rows={2}
          onChange={(event) => setNewComment(event.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (newComment.trim()) {
                onCreateDocumentComment?.(newComment.trim());
                setNewComment("");
              }
            }
          }}
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

      {/* Comment threads list */}
      <div className="canvas-comment-list">
        {comments.length === 0 ? (
          <div className="canvas-sidebar-empty">
            <div className="canvas-comment-empty-icon">💬</div>
            <p>No unresolved threads</p>
            <p className="canvas-comment-empty-hint">
              Select text in the canvas and click the comment button to start a thread.
            </p>
          </div>
        ) : (
          comments.map((comment) => {
            const author = getAuthorInfo(comment.authorId);
            const replyValue = replyByComment[comment._id] || "";
            const replies = comment.replies || [];

            return (
              <article className="canvas-comment-thread" key={comment._id}>
                {/* Main comment header */}
                <header className="canvas-comment-thread-header">
                  <div className="canvas-comment-author-row">
                    <Avatar member={{ name: author.name, avatar: author.avatar }} size={24} />
                    <div className="canvas-comment-author-info">
                      <strong className="canvas-comment-author-name">{author.name}</strong>
                      <span className="canvas-comment-time">{formatTime(comment.createdAt)}</span>
                    </div>
                    <button
                      className="canvas-comment-resolve-btn"
                      type="button"
                      onClick={() => onResolve(comment._id)}
                      title="Resolve thread"
                    >
                      <Check size={13} />
                    </button>
                  </div>
                  {/* Highlighted text reference */}
                  {comment.textRange?.selectedText && (
                    <div className="canvas-comment-highlighted-text">
                      <span>"{comment.textRange.selectedText}"</span>
                    </div>
                  )}
                </header>

                {/* Comment content */}
                <div className="canvas-comment-content">{comment.content}</div>

                {/* Block reference badge */}
                {comment.blockId && (
                  <div className="canvas-comment-block-badge">
                    <span>💬</span>
                    <span>Line comment</span>
                  </div>
                )}

                {/* Replies */}
                {replies.length > 0 && (
                  <div className="canvas-comment-replies">
                    {replies.map((item, index) => {
                      const replyAuthor = getAuthorInfo(item);
                      return (
                        <div className="canvas-comment-reply" key={`${comment._id}-${index}`}>
                          <Avatar member={{ name: replyAuthor.name, avatar: replyAuthor.avatar }} size={20} />
                          <div className="canvas-comment-reply-body">
                            <div className="canvas-comment-reply-header">
                              <strong className="canvas-comment-reply-name">{replyAuthor.name}</strong>
                              <span className="canvas-comment-time">{formatTime(item.createdAt)}</span>
                            </div>
                            <span className="canvas-comment-reply-text">{item.content}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Reply input */}
                <div className="canvas-comment-reply-box">
                  <Reply size={12} className="canvas-comment-reply-icon" />
                  <input
                    value={replyValue}
                    placeholder="Reply..."
                    onChange={(event) =>
                      setReplyByComment((state) => ({
                        ...state,
                        [comment._id]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || !replyValue.trim()) return;
                      onReply(comment._id, replyValue.trim());
                      setReplyByComment((state) => ({ ...state, [comment._id]: "" }));
                    }}
                  />
                </div>
              </article>
            );
          })
        )}
        <div ref={listEndRef} />
      </div>
    </aside>
  );
}