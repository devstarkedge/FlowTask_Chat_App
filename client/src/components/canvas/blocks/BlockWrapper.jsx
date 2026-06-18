import React, { useEffect, useMemo } from "react";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { useCanvasStore } from "../../../stores/canvasStore";
import { useCanvasCollabStore } from "../../../stores/canvasCollabStore";
import { useCanvasUiStore } from "../../../stores/canvasUiStore";
import ParagraphBlock from "./components/ParagraphBlock";
import HeadingBlock from "./components/HeadingBlock";
import TaskBlock from "./components/TaskBlock";
import { MessageSquare } from "lucide-react";

/**
 * CommentBadge — inline marker for anchored comments on a block.
 * Shows count and hover preview of the comment.
 */
function CommentBadge({ comment, index }) {
  const authorName = comment?.authorId?.name || "Teammate";
  const preview = comment?.content?.slice(0, 80) || "";
  const time = comment?.createdAt
    ? new Date(comment.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <span
      className="canvas-comment-badge"
      title={`${authorName}: ${preview}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        marginLeft: 2,
        padding: "1px 5px",
        borderRadius: 10,
        background: "rgba(78, 124, 255, 0.12)",
        color: "var(--accent-primary, #4e7cff)",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        verticalAlign: "super",
        lineHeight: 1,
        border: "1px solid rgba(78, 124, 255, 0.2)",
      }}
    >
      <MessageSquare size={10} />
      {index + 1}
    </span>
  );
}

export default function BlockWrapper({ node, editor, getPos }) {
  const blocks = useCanvasStore((s) => s.blocks);
  const comments = useCanvasStore((s) => s.comments);
  const openSidebar = useCanvasUiStore((s) => s.openSidebar);
  const setHoveredBlockId = useCanvasUiStore((s) => s.setHoveredBlockId);
  const presence = useCanvasCollabStore((s) => s.presence);
  const cursors = useCanvasCollabStore((s) => s.cursors);
  const typing = useCanvasCollabStore((s) => s.typing);

  const attrBlockId = node?.attrs?.blockId;

  const index = (() => {
    // If the node already has a blockId attribute, prefer that mapping.
    if (attrBlockId) {
      const idx = blocks.findIndex((b) => b._id === attrBlockId);
      if (idx !== -1) return idx;
    }

    // Fallback: compute index by walking the ProseMirror doc children sizes
    try {
      const pos = typeof getPos === "function" ? getPos() : null;
      if (typeof pos !== "number") return null;
      const doc = editor.state.doc;
      let p = 0;
      for (let i = 0; i < doc.childCount; i++) {
        if (p === pos) return i;
        p += doc.child(i).nodeSize;
      }
    } catch (e) {
      // ignore and return null
    }
    return null;
  })();

  const block = attrBlockId
    ? blocks.find((b) => b._id === attrBlockId)
    : index != null
    ? blocks[index]
    : null;

  useEffect(() => {
    // If the node didn't have a blockId but we could map it to an existing
    // block in the store, persist that mapping into the editor's node attrs
    // so future sessions/clients can reconcile by id.
    if (!attrBlockId && block && editor && typeof getPos === "function") {
      try {
        const pos = getPos();
        if (typeof pos === "number") {
          editor.commands.command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: block._id });
            editor.view.dispatch(tr);
            return true;
          });
        }
      } catch (err) {
        // best-effort only
        // console.debug("BlockWrapper: failed to set blockId attr", err);
      }
    }
  }, [attrBlockId, block, editor, getPos, node]);

  const handleOpenComments = () => {
    if (block) setHoveredBlockId(block._id);
    openSidebar("comments");
  };

  // Compute comments anchored to this block (via textRange or blockId match)
  const blockComments = useMemo(() => {
    if (!block?._id || !comments?.length) return [];
    return comments.filter((c) => {
      const cBlockId = c.blockId?._id || c.blockId;
      return String(cBlockId) === String(block._id) && !c.resolved;
    });
  }, [block?._id, comments]);

  return (
    <NodeViewWrapper className="block-node-wrapper" data-block-id={block?._id}>
      <div className="block-node-left">
        <button
          type="button"
          className="block-node-add-btn"
          onClick={() => {
            try {
              const pos = typeof getPos === "function" ? getPos() : null;
              if (typeof pos !== "number") return;
              const endPos = pos + node.nodeSize;
              editor.chain().focus().insertContentAt(endPos, { type: "paragraph" }).run();
            } catch (e) {}
          }}
          aria-label="Add block below"
          title="Add block"
        >
          +
        </button>
        <button
          type="button"
          className="block-node-handle"
          onMouseDown={(e) => e.preventDefault()}
          aria-label="Block actions"
          title="Drag to move"
        >
          ☰
        </button>
      </div>

      <div className="block-node-content">
        {(() => {
          const type = node?.type?.name;
          if (type === "heading") {
            const level = node?.attrs?.level || 1;
            return (
              <HeadingBlock block={block} level={level} onOpenComments={handleOpenComments}>
                <NodeViewContent />
              </HeadingBlock>
            );
          }

          if (type === "taskItem" || type === "taskItemChecked" || type === "task_item") {
            const checked = Boolean(node?.attrs?.checked);
            const toggle = () => {
              try {
                const pos = typeof getPos === "function" ? getPos() : null;
                if (typeof pos !== "number") return;
                editor.commands.command(({ tr }) => {
                  tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !checked });
                  editor.view.dispatch(tr);
                  return true;
                });
              } catch (err) {
                console.warn("Task toggle failed", err);
              }
            };

            return (
              <TaskBlock block={block} checked={checked} onToggle={toggle} onOpenComments={handleOpenComments}>
                <NodeViewContent />
              </TaskBlock>
            );
          }

          // Default to paragraph block
          return (
            <ParagraphBlock block={block} onOpenComments={handleOpenComments}>
              <NodeViewContent />
            </ParagraphBlock>
          );
        })()}

        {/* Inline comment badges for anchored comments on this block */}
        {blockComments.length > 0 && (
          <span className="canvas-comment-badges-row" style={{ display: "inline", marginLeft: 4 }}>
            {blockComments.map((c, i) => (
              <CommentBadge key={c._id} comment={c} index={i} />
            ))}
          </span>
        )}
      </div>

      <div className="block-node-right">
        {/* Per-block presence avatars and typing indicator */}
        {block?._id && (() => {
          const presenceList = presence || [];

          const cursorUsers = Object.entries(cursors || {})
            .map(([userId, c]) => ({ userId, name: c.name, color: c.color, avatar: (presenceList.find(p => p.userId === userId)?.avatar || null), blockId: c.blockId }))
            .filter(u => u.blockId === block._id);

          const typingUsers = Object.entries(typing?.[block._id] || {}).map(([userId, name]) => ({ userId, name, avatar: (presenceList.find(p => p.userId === userId)?.avatar || null), color: null }));

          // Merge unique users by userId (cursors first)
          const merged = [];
          const seen = new Set();
          cursorUsers.concat(typingUsers).forEach((u) => {
            if (!seen.has(u.userId)) {
              seen.add(u.userId);
              merged.push(u);
            }
          });

          const avatars = merged.slice(0, 3);
          const typingNames = Object.values(typing?.[block._id] || {}).slice(0, 3).join(", ");

          return (
            <div className="block-presence">
              <div className="block-presence-avatars">
                {avatars.map((u) => (
                  <div key={u.userId} className="block-presence-avatar" style={{ background: u.color || "var(--presence-color)" }} title={u.name}>
                    {u.avatar ? <img src={u.avatar} alt={u.name} /> : (u.name ? u.name[0] : "?")}
                  </div>
                ))}
                {merged.length > 3 && (
                  <div className="block-presence-avatar" style={{ background: "var(--bg-secondary)" }}>+{merged.length - 3}</div>
                )}
              </div>
              {typingNames ? <div className="block-typing">{typingNames} is typing…</div> : null}
            </div>
          );
        })()}

        <button
          type="button"
          className="block-comment-btn"
          onClick={handleOpenComments}
          aria-label="Open comments"
          title="Open comments"
        >
          💬
        </button>

        {block?.reactions && (
          <div className="block-reactions" aria-hidden>
            {Object.keys(block.reactions).length}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
