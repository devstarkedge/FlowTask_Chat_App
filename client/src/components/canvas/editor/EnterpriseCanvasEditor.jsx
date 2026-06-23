import { useEffect, useState, useCallback, useRef } from "react";
import { EditorContent } from "@tiptap/react";
import { useCanvasStore } from "../../../stores/canvasStore";
import { useCanvasUiStore } from "../../../stores/canvasUiStore";
import CommentThreadSidebar from "../comments/CommentThreadSidebar";
import CanvasHistoryPanel from "../history/CanvasHistoryPanel";
import CanvasDetailsModal from "../details/CanvasDetailsModal";
import CanvasShareModal from "../CanvasShareModal";
import PresenceBar from "../realtime/PresenceBar";
import { useCanvasCollaboration } from "../realtime/useCanvasCollaboration";
import CursorOverlay from "../realtime/CursorOverlay";
import SlashCommandMenu from "../slash-commands/SlashCommandMenu";
import SelectionToolbar from "../toolbars/SelectionToolbar";
import { useCanvasEditor } from "./useCanvasEditor";
import CanvasBottomToolbar from "../CanvasBottomToolbar";
import CanvasInsertMenu from "../CanvasInsertMenu";
import CanvasHeader from "../header/CanvasHeader";
import { useCanvasFileUpload } from "../overlays/CanvasFileUpload";
import { useCanvasMediaRecorder } from "../overlays/CanvasMediaRecorder";
import { useCanvasMentionDropdown } from "../overlays/CanvasMentionDropdown";
import { useCanvasEmojiPicker } from "../overlays/CanvasEmojiPicker";
import "../styles/canvas-shell.css";
import "../styles/canvas-editor.css";
import "../styles/canvas-toolbar.css";
import "../styles/canvas-cover.css";
import "../styles/canvas-sidebars.css";
import "../styles/canvas-overlays.css";
import "../styles/canvas-media.css";

const COLLAB_TIMEOUT_MS = 4_000;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function CanvasEditorUI({
  canvas,
  onSave,
  onBack,
  tabs = [],
  activeTab = "untitled",
}) {
  const [collabTimedOut, setCollabTimedOut] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const handleOpenShareModal = useCallback(() => setShowShareModal(true), []);
  const emojiBtnRef = useRef(null);
  const toggleBtnRef = useRef(null);
  const editorWrapperRef = useRef(null);

  const {
    comments,
    history,
    blocks,
    fetchHistory,
    restoreVersion,
    createComment,
    replyToComment,
    resolveComment,
  } = useCanvasStore();

  const slashMenu = useCanvasUiStore((s) => s.slashMenu);
  const selectionToolbar = useCanvasUiStore((s) => s.selectionToolbar);
  const activeSidebar = useCanvasUiStore((s) => s.activeSidebar);
  const viewingVersion = useCanvasUiStore((s) => s.viewingVersion);
  const clearViewingVersion = useCanvasUiStore((s) => s.clearViewingVersion);
  const openSidebar = useCanvasUiStore((s) => s.openSidebar);
  const closeSidebar = useCanvasUiStore((s) => s.closeSidebar);
  const closeSlashMenu = useCanvasUiStore((s) => s.closeSlashMenu);
  const openSlashMenu = useCanvasUiStore((s) => s.openSlashMenu);

  const { ydoc, provider, status, awarenessUsers } = useCanvasCollaboration(
    canvas?._id,
  );
  const { editor, saveStatus, wordCount } = useCanvasEditor({
    canvas,
    onSave,
    provider,
    ydoc,
  });

  // Canvas is always editable for authenticated users
  const isViewOnly = false;

  // Toolbar visibility: only re-render on focus/blur, NOT on every
  // editor update or selection change.  Use a counter state that
  // forces a re-render only when the boolean value actually flips.
  const [toolbarVisible, setToolbarVisible] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const check = () => {
      const next = editor.isFocused || editor.state.doc.content.size > 2;
      setToolbarVisible((prev) => {
        if (prev === next) return prev; // no change - no re-render
        return next;
      });
    };
    check();
    editor.on("focus", check);
    editor.on("blur", check);
    // Also re-check after collaborative updates that change doc size
    editor.on("update", check);
    return () => {
      try {
        editor.off("focus", check);
        editor.off("blur", check);
        editor.off("update", check);
      } catch (e) {}
    };
  }, [editor]);

  const showBottomToolbar = toolbarVisible;

  const [isInsertMenuOpen, setIsInsertMenuOpen] = useState(false);

  // ── Overlay hooks (extracted from monolith) ─────────────────────────────────
  const {
    triggerFileSelect,
    handleFileChange,
    insertMedia,
    fileInputRef,
  } = useCanvasFileUpload(editor, canvas, isViewOnly);

  const {
    startRecording,
    RecorderOverlay,
  } = useCanvasMediaRecorder({ isViewOnly, onInsertMedia: insertMedia });

  const {
    handleMentionFromToolbar,
    MentionDropdownPortal,
  } = useCanvasMentionDropdown({
    editor,
    isViewOnly,
    channelId: canvas?.channelId,
  });

  const {
    toggleEmojiPicker,
    EmojiPicker,
  } = useCanvasEmojiPicker({ editor, isViewOnly, emojiBtnRef });

  // Insert Menu Handlers - handles all item IDs from the new grouped menu
  const handleInsertMenuSelect = (id) => {
    if (!editor) return;

    switch (id) {
      case "text":
        editor.chain().focus().insertContent({ type: "paragraph" }).run();
        break;
      case "heading1":
        editor.chain().focus().toggleHeading({ level: 1 }).run();
        break;
      case "record-video":
        startRecording("video");
        break;
      case "record-audio":
        startRecording("audio");
        break;
      case "divider":
        editor.chain().focus().setHorizontalRule().run();
        break;
      case "table":
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
        break;
      case "bullet-list":
        editor.chain().focus().toggleBulletList().run();
        break;
      case "checklist":
        editor.chain().focus().toggleTaskList().run();
        break;
      case "columns-3":
        editor
          .chain()
          .focus()
          .insertContent({
            type: "columns",
            attrs: { count: 3 },
            content: [
              { type: "column", content: [{ type: "paragraph" }] },
              { type: "column", content: [{ type: "paragraph" }] },
              { type: "column", content: [{ type: "paragraph" }] },
            ],
          })
          .run();
        break;
      case "code-block":
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case "callout":
        editor
          .chain()
          .focus()
          .insertContent({
            type: "callout",
            attrs: { type: "info", emoji: "💡" },
            content: [{ type: "text", text: "Important note" }],
          })
          .run();
        break;
      case "date":
        const todayStr = new Date().toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        editor.chain().focus().insertContent(todayStr).run();
        break;
      case "image":
        triggerFileSelect("image");
        break;
      case "file":
        triggerFileSelect("fileAttachment");
        break;
      case "blockquote":
        editor.chain().focus().toggleBlockquote().run();
        break;
      default:
        if (id.startsWith("placeholder-")) {
          const phName = id.replace("placeholder-", "");
          editor
            .chain()
            .focus()
            .insertContent({
              type: "templateVariable",
              attrs: { name: phName, value: "" },
            })
            .run();
        } else {
          editor.chain().focus().insertContent(`{{${id}}}`).run();
        }
    }
  };

  // Mention detection, emoji selection, and mention toolbar are now
  // handled by useCanvasMentionDropdown and useCanvasEmojiPicker hooks.

  // Collaboration timeout
  useEffect(() => {
    setCollabTimedOut(false);
    if (!provider) return undefined;
    const timer = setTimeout(() => setCollabTimedOut(true), COLLAB_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [provider, canvas?._id]);

  useEffect(() => {
    if (status === "connected" || status === "synced") setCollabTimedOut(false);
  }, [status]);

  // Title sync, cover actions, and share modal are now in CanvasHeader.

  const handleOpenHistory = async () => {
    if (canvas?._id) await fetchHistory(canvas._id);
    openSidebar("history");
  };

  const handleRestore = async (historyId) => {
    if (!canvas?._id) return;
    await restoreVersion(canvas._id, historyId);
    clearViewingVersion();
    closeSidebar();
  };

  // Handle version preview (read-only mode)
  const handlePreviewVersion = useCallback((item) => {
    if (!editor || !item.snapshot) return;
    // Load snapshot content into editor in read-only mode
    try {
      editor.setEditable(false);
      if (item.snapshot.content) {
        editor.commands.setContent(item.snapshot.content);
      }
    } catch (e) {
      console.error('Failed to preview version:', e);
    }
  }, [editor]);

  // Exit read-only mode when clearing viewingVersion
  useEffect(() => {
    if (!viewingVersion && editor && !isViewOnly) {
      editor.setEditable(true);
    }
  }, [viewingVersion, editor, isViewOnly]);

  const handleDocumentComment = (content) => {
    const firstBlockId = blocks[0]?._id;
    if (!firstBlockId) return;
    createComment(firstBlockId, content);
  };

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

  return (
    <div className="canvas-editor-ui-shell">
      {/* Header: tabs, cover, title, three-dot menu (extracted) */}
      <CanvasHeader
        canvas={canvas}
        onBack={onBack}
        onOpenShareModal={handleOpenShareModal}
        tabs={tabs}
        activeTab={activeTab}
      />

      {/* Main Content */}
      <div className="canvas-editor-container">
        <main className="canvas-scroll-surface">
          <article className="canvas-document-surface">
            {/* Editor */}
            <div ref={editorWrapperRef} style={{ position: "relative" }}>
              <EditorContent editor={editor} spellCheck={false} />
              {MentionDropdownPortal}
            </div>
            <CursorOverlay awarenessUsers={awarenessUsers} />
          </article>
        </main>

        {/* Sidebars */}
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
            onPreviewVersion={handlePreviewVersion}
          />
        )}
        {activeSidebar === "details" && (
          <CanvasDetailsModal
            canvas={canvas}
            onClose={closeSidebar}
            onOpenShareModal={handleOpenShareModal}
            historyCount={history?.length}
          />
        )}
      </div>

      {/* Hidden File Picker */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Media Recorder Overlay (extracted to useCanvasMediaRecorder hook) */}
      {RecorderOverlay}

      {/* Floating Bottom Toolbar with Insert Menu */}
      <CanvasBottomToolbar
        editor={editor}
        showBottomToolbar={showBottomToolbar}
        isInsertMenuOpen={isInsertMenuOpen}
        onToggleInsertMenu={() => setIsInsertMenuOpen((v) => !v)}
        onEmojiClick={toggleEmojiPicker}
        onFileClick={() => triggerFileSelect("fileAttachment")}
        onMentionClick={handleMentionFromToolbar}
        emojiBtnRef={emojiBtnRef}
        toggleBtnRef={toggleBtnRef}
      >
        {/* Insert Menu - rendered inside toolbar container for proper positioning */}
        {isInsertMenuOpen && (
          <CanvasInsertMenu
            editor={editor}
            onSelect={handleInsertMenuSelect}
            onClose={() => setIsInsertMenuOpen(false)}
            triggerRef={toggleBtnRef}
          />
        )}
      </CanvasBottomToolbar>

      {/* Emoji Picker Portal (extracted to useCanvasEmojiPicker hook) */}
      {EmojiPicker}

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

      {/* Share Modal (state managed here, triggered by header + details sidebar) */}
      {showShareModal && (
        <CanvasShareModal
          canvas={canvas}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          channelId={canvas?.channelId}
        />
      )}
    </div>
  );
}