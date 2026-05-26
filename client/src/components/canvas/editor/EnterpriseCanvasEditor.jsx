import { useEffect, useMemo, useState } from "react";
import { EditorContent } from "@tiptap/react";
import debounce from "lodash/debounce";
import { ArrowLeft, MoreHorizontal, Share2, Tag } from "lucide-react";
import TemplateVariablesPanel from "../TemplateVariablesPanel";

import { useCanvasStore } from "../../../stores/canvasStore";
import { useCanvasUiStore } from "../../../stores/canvasUiStore";
import CommentThreadSidebar from "../comments/CommentThreadSidebar";
import CanvasHistoryPanel from "../history/CanvasHistoryPanel";
import PresenceBar from "../realtime/PresenceBar";
import { useCanvasCollaboration } from "../realtime/useCanvasCollaboration";
import SlashCommandMenu from "../slash-commands/SlashCommandMenu";
import EditorToolbar from "../toolbars/EditorToolbar";
import SelectionToolbar from "../toolbars/SelectionToolbar";
import { useCanvasEditor } from "./useCanvasEditor";
import "../canvas-enterprise.css";
import BlockList from "../blocks/BlockList";

// How long to wait for the WebSocket to connect before showing the editor
// anyway. This prevents an infinite "Loading canvas..." when the
// collaboration server is unreachable.
const COLLAB_TIMEOUT_MS = 4_000;

function coverStyle(cover) {
  if (!cover) return null;
  if (cover.type === "image") {
    return {
      backgroundImage: `url(${cover.value})`,
      backgroundSize: "cover",
      backgroundPosition: `center ${cover.yOffset ?? 50}%`,
    };
  }
  return { background: cover.value };
}

export default function EnterpriseCanvasEditor({ canvas, onSave, onBack }) {
  const [title, setTitle] = useState(canvas?.title || "");

  // After COLLAB_TIMEOUT_MS we stop waiting for the WebSocket and render
  // the editor in offline mode so the user is never stuck on the spinner.
  const [collabTimedOut, setCollabTimedOut] = useState(false);

  const {
    comments,
    presence,
    history,
    blocks,
    updateCanvasMetadata,
    fetchHistory,
    restoreVersion,
    createComment,
    replyToComment,
    resolveComment,
  } = useCanvasStore();

  const focused = useCanvasUiStore((s) => s.focused);
  const slashMenu = useCanvasUiStore((s) => s.slashMenu);
  const selectionToolbar = useCanvasUiStore((s) => s.selectionToolbar);
  const activeSidebar = useCanvasUiStore((s) => s.activeSidebar);
  const openSidebar = useCanvasUiStore((s) => s.openSidebar);
  const closeSidebar = useCanvasUiStore((s) => s.closeSidebar);
  const closeSlashMenu = useCanvasUiStore((s) => s.closeSlashMenu);

  const { ydoc, provider, status, awarenessUsers } = useCanvasCollaboration(
    canvas?._id,
  );
  const { editor, saveStatus, wordCount } = useCanvasEditor({
    canvas,
    onSave,
    provider,
    ydoc,
  });

  // Reset the timeout whenever the canvas or provider changes.
  useEffect(() => {
    setCollabTimedOut(false);

    if (!provider) return undefined;

    const timer = setTimeout(() => {
      setCollabTimedOut(true);
    }, COLLAB_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [provider, canvas?._id]);

  // Clear the timeout immediately if we do connect successfully.
  useEffect(() => {
    if (status === "connected" || status === "synced") {
      setCollabTimedOut(false);
    }
  }, [status]);

  useEffect(() => {
    setTitle(canvas?.title || "");
  }, [canvas?._id, canvas?.title]);

  const debouncedTitleSave = useMemo(
    () =>
      debounce(async (nextTitle) => {
        if (!canvas?._id) return;
        await updateCanvasMetadata(canvas._id, {
          title: nextTitle.trim() || "Untitled canvas",
        });
      }, 600),
    [canvas?._id, updateCanvasMetadata],
  );

  useEffect(() => () => debouncedTitleSave.cancel(), [debouncedTitleSave]);

  const handleOpenHistory = async () => {
    if (canvas?._id) await fetchHistory(canvas._id);
    openSidebar("history");
  };

  const handleRestore = async (historyId) => {
    if (!canvas?._id) return;
    await restoreVersion(canvas._id, historyId);
    closeSidebar();
  };

  const handleDocumentComment = (content) => {
    const firstBlockId = blocks[0]?._id;
    if (!firstBlockId) return;
    createComment(firstBlockId, content);
  };

  // Show the spinner only while:
  //  • the editor isn't ready yet, OR
  //  • the provider exists, hasn't connected, AND we haven't timed out yet.
  const collaborationLoading =
    provider &&
    status !== "connected" &&
    status !== "synced" &&
    status !== "disabled" &&
    status !== "auth-failed" &&
    !collabTimedOut;

  if (!editor || collaborationLoading) {
    return (
      <div className="canvas-loading">
        <span />
        Loading canvas...
      </div>
    );
  }

  const currentCoverStyle = coverStyle(canvas?.cover);

  return (
    <div className="canvas-enterprise-shell">
      {/* <div className="canvas-topbar"> */}
        {/* <div className="canvas-topbar-left">
          {onBack && (
            <button
              type="button"
              className="canvas-icon-button"
              aria-label="Back"
              onClick={onBack}
            >
              <ArrowLeft size={16} />
            </button>
          )}
        </div> */}

        {/* <PresenceBar
          socketPresence={presence}
          awarenessUsers={awarenessUsers}
          status={status}
        /> */}

        {/* <div className="canvas-topbar-actions">
          <button type="button" className="canvas-command-button">
            <Share2 size={14} />
            Share
          </button>
          <button type="button" className="canvas-icon-button" aria-label="Variables" onClick={() => openSidebar('variables')}>
            <Tag size={16} />
          </button>
          <button
            type="button"
            className="canvas-icon-button"
            aria-label="Canvas actions"
            onClick={handleOpenHistory}
          >
            <MoreHorizontal size={17} />
          </button>
        </div> */}
      {/* </div> */}

      <div className="canvas-workspace">
        <main className="canvas-scroll-surface">
          {currentCoverStyle && (
            <div className="canvas-cover-strip" style={currentCoverStyle} />
          )}
          <article className="canvas-document-surface">
            <input
              className="canvas-title-input"
              value={title}
              placeholder="Your canvas title"
              onChange={(event) => {
                setTitle(event.target.value);
                debouncedTitleSave(event.target.value);
              }}
              onBlur={() => debouncedTitleSave.flush()}
            />
            {/* <p className="canvas-subtitle">
              What&apos;s on the docket for today?
            </p> */}

            <EditorToolbar
              editor={editor}
              visible={focused}
              saveStatus={saveStatus}
              onOpenComments={() => openSidebar("comments")}
              onOpenHistory={handleOpenHistory}
            />

            {/* <BlockList /> */}

            <EditorContent editor={editor} />
          </article>
        </main>

        {activeSidebar === "comments" && (
          <CommentThreadSidebar
            comments={comments}
            onClose={closeSidebar}
            onResolve={resolveComment}
            onReply={replyToComment}
            onCreateDocumentComment={handleDocumentComment}
          />
        )}

        {activeSidebar === "history" && (
          <CanvasHistoryPanel
            history={history}
            onClose={closeSidebar}
            onRestore={handleRestore}
          />
        )}
        {activeSidebar === "variables" && (
          <TemplateVariablesPanel editor={editor} onClose={() => closeSidebar()} />
        )}
      </div>

      <SelectionToolbar
        editor={editor}
        toolbar={selectionToolbar}
        onComment={() => openSidebar("comments")}
      />
      <SlashCommandMenu
        editor={editor}
        menu={slashMenu}
        onClose={closeSlashMenu}
      />

      <div className="canvas-footer">
        <span>
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>
      </div>
    </div>
  );
}