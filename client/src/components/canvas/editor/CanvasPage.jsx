import { useState, useCallback, useRef, lazy, Suspense, useMemo, useEffect } from "react";
import { EditorContent } from "@tiptap/react";
import { useCanvasStore } from "../../../stores/canvasStore";
import { useCanvasUiStore } from "../../../stores/canvasUiStore";
import { useCanvasCollaboration } from "../realtime/useCanvasCollaboration";
import CursorOverlay from "../realtime/CursorOverlay";
import PresenceBar from "../realtime/PresenceBar";
import SlashCommandMenu from "../slash-commands/SlashCommandMenu";
import SelectionToolbar from "../toolbars/SelectionToolbar";
import { useCanvasEditor } from "./useCanvasEditor";
import CanvasBottomToolbar from "../CanvasBottomToolbar";
import CanvasInsertMenu from "../CanvasInsertMenu";
import CanvasHeader from "../header/CanvasHeader";
import CanvasShareModal from "../CanvasShareModal";
import CanvasDetailsModal from "../details/CanvasDetailsModal";
import toast from "react-hot-toast";
import { useChannelStore } from "../../../stores/channelStore";
import { useCanvasPermissions, PERMISSION_TOAST_MESSAGE } from "../permissions/useCanvasPermissions";
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

// ── Lazy-loaded sidebars (reduced initial bundle) ──────────────────────────
const CommentThreadSidebar = lazy(() => import("../comments/CommentThreadSidebar"));
const CanvasHistoryPanel = lazy(() => import("../history/CanvasHistoryPanel"));

const SIDEBAR_FALLBACK = <div className="canvas-loading"><span />Loading...</div>;

const COLLAB_TIMEOUT_MS = 4_000;

/**
 * CanvasPage — Slim root orchestrator that composes all extracted modules.
 * Replaces both CanvasPanel and EnterpriseCanvasEditor as the main entry point.
 */
export default function CanvasPage({ canvas, onSave, onBack, tabs = [], activeTab = "untitled" }) {
  const [collabTimedOut, setCollabTimedOut] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isInsertMenuOpen, setIsInsertMenuOpen] = useState(false);
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

  // ── Collaboration ──────────────────────────────────────────────────────
  const { ydoc, provider, status, awarenessUsers } = useCanvasCollaboration(canvas?._id);

  // ── Editor ─────────────────────────────────────────────────────────────
  const { editor, saveStatus, wordCount } = useCanvasEditor({
    canvas,
    onSave,
    provider,
    ydoc,
  });

  // ── Permissions ────────────────────────────────────────────────────────
  // Resolve channel from canvas store for permission context
  const channel = useChannelStore((s) =>
    canvas?.channelId ? s.channels.find((c) => c._id === canvas.channelId) : null
  );
  const { isViewOnly, canvasRole, canEdit, canDelete, canShare, canComment, canManagePermissions, permissionToastShownRef } = useCanvasPermissions(
    canvas,
    channel,
    editor,
    viewingVersion,
  );

  // ── Toolbar visibility (memoized from editor state) ────────────────────
  const toolbarVisible = useMemo(() => {
    if (!editor) return false;
    return editor.isFocused || editor.state.doc.content.size > 2;
  }, [editor?.isFocused, editor?.state?.doc?.content?.size]);

  // ── Overlay hooks ──────────────────────────────────────────────────────
  const {
    triggerFileSelect,
    handleFileChange,
    insertMedia,
    fileInputRef,
  } = useCanvasFileUpload(editor, canvas, isViewOnly);

  const { startRecording, RecorderOverlay } = useCanvasMediaRecorder({
    isViewOnly,
    onInsertMedia: insertMedia,
  });

  const { handleMentionFromToolbar, MentionDropdownPortal } = useCanvasMentionDropdown({
    editor,
    isViewOnly,
    channelId: canvas?.channelId,
  });

  const { toggleEmojiPicker, EmojiPicker } = useCanvasEmojiPicker({
    editor,
    isViewOnly,
    emojiBtnRef,
  });

  // ── Insert Menu Handler (memoized) ─────────────────────────────────────
  const handleInsertMenuSelect = useCallback((id) => {
    if (isViewOnly) {
      toast.error(PERMISSION_TOAST_MESSAGE);
      return;
    }
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
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
      case "bullet-list":
        editor.chain().focus().toggleBulletList().run();
        break;
      case "checklist":
        editor.chain().focus().toggleTaskList().run();
        break;
      case "columns-3":
        editor.chain().focus().insertContent({
          type: "columns",
          attrs: { count: 3 },
          content: [
            { type: "column", content: [{ type: "paragraph" }] },
            { type: "column", content: [{ type: "paragraph" }] },
            { type: "column", content: [{ type: "paragraph" }] },
          ],
        }).run();
        break;
      case "code-block":
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case "callout":
        editor.chain().focus().insertContent({
          type: "callout",
          attrs: { type: "info", emoji: "💡" },
          content: [{ type: "text", text: "Important note" }],
        }).run();
        break;
      case "date":
        editor.chain().focus().insertContent(
          new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        ).run();
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
          editor.chain().focus().insertContent({
            type: "templateVariable",
            attrs: { name: id.replace("placeholder-", ""), value: "" },
          }).run();
        } else {
          editor.chain().focus().insertContent(`{{${id}}}`).run();
        }
    }
  }, [editor, isViewOnly, startRecording, triggerFileSelect]);

  // ── History handlers (memoized) ────────────────────────────────────────
  const handleOpenHistory = useCallback(async () => {
    if (canvas?._id) await fetchHistory(canvas._id);
    openSidebar("history");
  }, [canvas?._id, fetchHistory, openSidebar]);

  const handleRestore = useCallback(async (historyId) => {
    if (!canvas?._id) return;
    await restoreVersion(canvas._id, historyId);
    clearViewingVersion();
    closeSidebar();
  }, [canvas?._id, restoreVersion, clearViewingVersion, closeSidebar]);

  const handlePreviewVersion = useCallback((item) => {
    if (!editor || !item.snapshot) return;
    try {
      editor.setEditable(false);
      if (item.snapshot.content) {
        editor.commands.setContent(item.snapshot.content);
      }
    } catch (e) {
      console.error("Failed to preview version:", e);
    }
  }, [editor]);

  const handleDocumentComment = useCallback((content) => {
    const firstBlockId = blocks[0]?._id;
    if (!firstBlockId) return;
    createComment(firstBlockId, content);
  }, [blocks, createComment]);

  // ── Collaboration timeout ──────────────────────────────────────────────
  useEffect(() => {
    setCollabTimedOut(false);
    if (!provider) return undefined;
    const timer = setTimeout(() => setCollabTimedOut(true), COLLAB_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [provider, canvas?._id]);

  useEffect(() => {
    if (status === "connected" || status === "synced") setCollabTimedOut(false);
  }, [status]);

  const collaborationLoading = useMemo(() => {
    if (!provider) return false;
    if (status === "connected" || status === "synced" || status === "disabled" || status === "auth-failed") return false;
    return !collabTimedOut;
  }, [provider, status, collabTimedOut]);

  // ── Loading state ──────────────────────────────────────────────────────
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
      <CanvasHeader
        canvas={canvas}
        isViewOnly={isViewOnly}
        canvasRole={canvasRole}
        onBack={onBack}
        onOpenShareModal={handleOpenShareModal}
        tabs={tabs}
        activeTab={activeTab}
      />
      <div className="canvas-editor-container">
        <main className="canvas-scroll-surface">
          <article className="canvas-document-surface">
            <div ref={editorWrapperRef} style={{ position: "relative" }}>
              <EditorContent editor={editor} spellCheck={false} />
              {MentionDropdownPortal}
            </div>
            <CursorOverlay awarenessUsers={awarenessUsers} />
          </article>
        </main>

        {/* Lazy-loaded sidebars */}
        {activeSidebar === "comments" && (
          <Suspense fallback={SIDEBAR_FALLBACK}>
            <CommentThreadSidebar
              comments={comments}
              onClose={closeSidebar}
              onResolve={resolveComment}
              onReply={replyToComment}
              onCreateDocumentComment={handleDocumentComment}
            />
          </Suspense>
        )}
        {activeSidebar === "history" && (
          <Suspense fallback={SIDEBAR_FALLBACK}>
            <CanvasHistoryPanel
              history={history}
              onClose={closeSidebar}
              onRestore={handleRestore}
              onPreviewVersion={handlePreviewVersion}
            />
          </Suspense>
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

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Media Recorder */}
      {RecorderOverlay}

      {/* Bottom toolbar + insert menu */}
      {!isViewOnly && (
        <CanvasBottomToolbar
          editor={editor}
          showBottomToolbar={toolbarVisible}
          isInsertMenuOpen={isInsertMenuOpen}
          onToggleInsertMenu={() => setIsInsertMenuOpen((v) => !v)}
          onEmojiClick={toggleEmojiPicker}
          onFileClick={() => triggerFileSelect("fileAttachment")}
          onMentionClick={handleMentionFromToolbar}
          emojiBtnRef={emojiBtnRef}
          toggleBtnRef={toggleBtnRef}
        >
          {isInsertMenuOpen && (
            <CanvasInsertMenu
              editor={editor}
              onSelect={handleInsertMenuSelect}
              onClose={() => setIsInsertMenuOpen(false)}
              triggerRef={toggleBtnRef}
            />
          )}
        </CanvasBottomToolbar>
      )}

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