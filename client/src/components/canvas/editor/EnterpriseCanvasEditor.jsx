import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { EditorContent } from "@tiptap/react";
import debounce from "lodash/debounce";
import {
  Plus,
  Type,
  Smile,
  Paperclip,
  CheckSquare,
  Table2,
  Columns3,
  MoreHorizontal,
  Image as ImageIcon,
  Mic,
} from "lucide-react";
import { useCanvasStore } from "../../../stores/canvasStore";
import { useCanvasUiStore } from "../../../stores/canvasUiStore";
import CommentThreadSidebar from "../comments/CommentThreadSidebar";
import CanvasHistoryPanel from "../history/CanvasHistoryPanel";
import CanvasDetailsSidebar from "../details/CanvasDetailsSidebar";
import CanvasShareModal from "../CanvasShareModal";
import PresenceBar from "../realtime/PresenceBar";
import { useCanvasCollaboration } from "../realtime/useCanvasCollaboration";
import CursorOverlay from "../realtime/CursorOverlay";
import SlashCommandMenu from "../slash-commands/SlashCommandMenu";
import SelectionToolbar from "../toolbars/SelectionToolbar";
import { useCanvasEditor } from "./useCanvasEditor";
import MentionDropdown from "../../chat/MentionDropdown";
import CanvasCover from "../CanvasCover";
import CanvasThreeDotMenu from "../CanvasThreeDotMenu";
import EmojiPickerPortal from "../../chat/EmojiPickerPortal";
import CanvasBottomToolbar from "../CanvasBottomToolbar";
import CanvasInsertMenu from "../CanvasInsertMenu";
import "../canvas-enterprise.css";

const COLLAB_TIMEOUT_MS = 4_000;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

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

export default function CanvasEditorUI({
  canvas,
  onSave,
  onBack,
  tabs = [],
  activeTab = "untitled",
}) {
  const [title, setTitle] = useState(canvas?.title || "");
  const [collabTimedOut, setCollabTimedOut] = useState(false);
  const [mentionType, setMentionType] = useState(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [coverHovered, setCoverHovered] = useState(false);
  const [titleHovered, setTitleHovered] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const showCoverActions = coverHovered || titleHovered || showCoverPicker;
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showCoverMenu, setShowCoverMenu] = useState(false);
  const [showThreeDotMenu, setShowThreeDotMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isRepositioning, setIsRepositioning] = useState(false);
  const emojiBtnRef = useRef(null);
  const toggleBtnRef = useRef(null);
  const threeDotBtnRef = useRef(null);

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

  const [isEditorActive, setIsEditorActive] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const updateVisibility = () => {
      setIsEditorActive(editor.isFocused || editor.state.doc.content.size > 2);
    };
    updateVisibility();
    editor.on("focus", updateVisibility);
    editor.on("blur", updateVisibility);
    editor.on("update", updateVisibility);
    editor.on("selectionUpdate", updateVisibility);

    return () => {
      try {
        editor.off("focus", updateVisibility);
        editor.off("blur", updateVisibility);
        editor.off("update", updateVisibility);
        editor.off("selectionUpdate", updateVisibility);
      } catch (e) {}
    };
  }, [editor]);

  // Bottom toolbar visible: editor is focused OR has content
  const showBottomToolbar = editor && (editor.isFocused || editor.state.doc.content.size > 2);

  const [isInsertMenuOpen, setIsInsertMenuOpen] = useState(false);
  const [recordingType, setRecordingType] = useState(null); // 'video' | 'audio'
  const [recordingState, setRecordingState] = useState("idle"); // 'idle' | 'recording' | 'preview'
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);

  const fileInputRef = useRef(null);
  const fileTypeRef = useRef("fileAttachment");
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const videoPreviewRef = useRef(null);

  // File Upload Helper
  const triggerFileSelect = (nodeType) => {
    fileTypeRef.current = nodeType;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = fileTypeRef.current;
    await insertMedia(file, type);
  };

  const insertMedia = async (file, nodeType) => {
    if (!editor) return;
    const localUrl = URL.createObjectURL(file);
    const name = file.name;
    const size = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

    // 1. Insert Node with loading: true
    let nodeAttrs = { loading: true };
    if (nodeType === "image") {
      nodeAttrs = { src: localUrl, loading: true };
    } else if (nodeType === "videoBlock") {
      nodeAttrs = { src: localUrl, loading: true };
    } else if (nodeType === "audioBlock") {
      nodeAttrs = { src: localUrl, loading: true };
    } else if (nodeType === "fileAttachment") {
      nodeAttrs = { url: localUrl, name, size, loading: true };
    }

    editor
      .chain()
      .focus()
      .insertContent({ type: nodeType, attrs: nodeAttrs })
      .run();

    // 2. Simulate Cloudinary / Backend upload delay
    setTimeout(() => {
      if (!editor) return;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === nodeType && node.attrs.loading === true) {
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              loading: false,
            }),
          );
        }
      });
    }, 1500);
  };

  // Media Recording Triggers
  const startRecording = async (type) => {
    setIsInsertMenuOpen(false);
    setRecordingType(type);
    setRecordingState("recording");
    setRecordedBlob(null);
    setRecordedUrl(null);
    try {
      const constraints =
        type === "video" ? { video: true, audio: true } : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Small timeout to let ref attach
      setTimeout(() => {
        if (type === "video" && videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
          videoPreviewRef.current.play().catch(() => {});
        }
      }, 100);

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, {
          type: type === "video" ? "video/webm" : "audio/webm",
        });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        setRecordingState("preview");
      };
      recorder.start();
    } catch (err) {
      console.error("Failed to start media recorder:", err);
      alert("Microphone/Camera permission denied or not supported.");
      setRecordingState("idle");
      setRecordingType(null);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  const saveRecordedClip = () => {
    if (!recordedBlob) return;
    const file = new File(
      [recordedBlob],
      `recorded-${recordingType}-${Date.now()}.webm`,
      { type: recordingType === "video" ? "video/webm" : "audio/webm" },
    );
    insertMedia(file, recordingType === "video" ? "videoBlock" : "audioBlock");
    closeMediaRecorder();
  };

  const closeMediaRecorder = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setRecordingState("idle");
    setRecordingType(null);
    setRecordedBlob(null);
    setRecordedUrl(null);
  };

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

  // Mention detection
  useEffect(() => {
    if (!editor) return undefined;
    const detect = () => {
      try {
        const { state } = editor;
        const { from } = state.selection;
        const textBefore = state.doc.textBetween(
          Math.max(0, from - 50),
          from,
          "\n",
        );
        if (!textBefore) {
          setMentionType(null);
          setMentionQuery("");
          return;
        }
        const match = textBefore.match(/([@#])([^\s@#]*)$/);
        if (match) {
          const triggerChar = match[1];
          const query = match[2];
          setMentionType(triggerChar === "@" ? "user" : "channel");
          setMentionQuery(query);
        } else {
          setMentionType(null);
          setMentionQuery("");
        }
      } catch (err) {}
    };
    detect();
    editor.on("update", detect);
    editor.on("selectionUpdate", detect);
    return () => {
      try {
        editor.off("update", detect);
        editor.off("selectionUpdate", detect);
      } catch (e) {}
    };
  }, [editor]);

  const handleMentionSelect = useCallback(
    (item) => {
      if (!editor) return;
      try {
        const { state } = editor;
        const { from } = state.selection;
        const textBefore = state.doc.textBetween(
          Math.max(0, from - 50),
          from,
          "\n",
        );
        const match = textBefore.match(/([@#])([^\s@#]*)$/);
        if (match) {
          const deleteCount = match[0].length;
          editor
            .chain()
            .focus()
            .deleteRange({ from: from - deleteCount, to: from })
            .run();
        }
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "mention",
              attrs: {
                id: item.id,
                label: item.name,
                mentionType: mentionType === "user" ? "user" : "channel",
              },
            },
            { type: "text", text: " " },
          ])
          .run();
        setMentionType(null);
        setMentionQuery("");
      } catch (err) {}
    },
    [editor, mentionType],
  );

  // Mention from toolbar button
  const handleMentionFromToolbar = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertContent("@").run();
  }, [editor]);

  // Emoji insert at cursor
  const handleEmojiSelect = useCallback(
    (emoji) => {
      if (!editor) return;
      editor.chain().focus().insertContent(emoji).run();
      setShowEmojiPicker(false);
    },
    [editor],
  );

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

  useEffect(() => {
    setTitle(canvas?.title || "");
  }, [canvas?._id, canvas?.title]);

  // ── Sync browser tab title with canvas title ───────────────────────────────
  useEffect(() => {
    if (canvas?.title) {
      document.title = `${canvas.title} | FlowTask`;
    }
  }, [canvas?.title]);

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

  // Cover actions
  const handleCoverReplace = useCallback(() => {
    setShowCoverPicker(true);
  }, []);

  const handleCoverReposition = useCallback(() => {
    setIsRepositioning(true);
  }, []);

  const handleCoverRemove = useCallback(async () => {
    if (canvas?._id) {
      await updateCanvasMetadata(canvas._id, { cover: null });
    }
    setIsRepositioning(false);
  }, [canvas?._id, updateCanvasMetadata]);

  const handleOpenShareModal = useCallback(() => {
    setShowShareModal(true);
  }, []);

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
    if (!viewingVersion && editor) {
      editor.setEditable(true);
    }
  }, [viewingVersion, editor]);

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

  const currentCoverStyle = coverStyle(canvas?.cover);

  return (
    <div className="canvas-editor-ui-shell">
      {/* Secondary Tab Navigation */}
      {tabs.length > 0 && (
        <div className="canvas-tab-nav">
          <div className="canvas-tabs-container">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`canvas-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={tab.onClick}
              >
                {tab.icon && (
                  <span className="canvas-tab-icon">{tab.icon}</span>
                )}
                <span className="canvas-tab-label">{tab.label}</span>
              </button>
            ))}
          </div>
          <div style={{ position: "relative" }}>
            <button
              className="canvas-topbar-menu"
              aria-label="More options"
              onClick={() => setShowThreeDotMenu((v) => !v)}
            >
              <MoreHorizontal size={18} />
            </button>
            <CanvasThreeDotMenu
              canvas={canvas}
              isOpen={showThreeDotMenu}
              onClose={() => setShowThreeDotMenu(false)}
              onOpenCoverPicker={() => {
                setShowCoverPicker(true);
                setShowThreeDotMenu(false);
              }}
              onBack={onBack}
              onOpenShareModal={handleOpenShareModal}
              onCoverReplace={handleCoverReplace}
              onCoverReposition={handleCoverReposition}
              onCoverRemove={handleCoverRemove}
              hasCover={!!canvas?.cover}
            />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="canvas-editor-container">
        <main className="canvas-scroll-surface">
          <article className="canvas-document-surface">
            {/* Unified hover zone for cover + title */}
            <div
              className="canvas-cover-title-zone"
              onMouseEnter={() => {
                setCoverHovered(true);
                setTitleHovered(true);
              }}
              onMouseLeave={() => {
                setCoverHovered(false);
                setTitleHovered(false);
              }}
            >
              {/* Cover Image (when present) */}
              {currentCoverStyle && (
                <div className="canvas-cover-strip" style={currentCoverStyle}>
                  <div className="canvas-cover-actions">
                    <button
                      className="canvas-cover-change-btn"
                      onClick={() => setShowCoverPicker(true)}
                    >
                      <ImageIcon size={14} />
                      Change cover
                    </button>
                    <button
                      className="canvas-cover-remove-btn"
                      onClick={async () => {
                        if (canvas?._id) {
                          await updateCanvasMetadata(canvas._id, {
                            cover: null,
                          });
                        }
                        setShowCoverPicker(false);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {/* Add Cover Button (only when no cover) */}
              {!canvas?.cover && (
                <button
                  className={`canvas-add-cover-btn${showCoverActions ? " is-visible" : ""}`}
                  onClick={() => setShowCoverPicker(true)}
                >
                  <ImageIcon size={14} />
                  Add cover
                </button>
              )}

              {/* Always-visible three-dot menu button */}
              <button
                ref={threeDotBtnRef}
                className="canvas-title-zone-three-dot"
                onClick={() => setShowThreeDotMenu((v) => !v)}
                aria-label="Canvas options"
                title="Canvas options"
              >
                <MoreHorizontal size={16} />
              </button>

              {/* Title Input */}
              <input
                className="canvas-title-input"
                value={title}
                placeholder="Your canvas title"
                spellCheck={false}
                onChange={(event) => {
                  setTitle(event.target.value);
                  debouncedTitleSave(event.target.value);
                }}
                onBlur={() => debouncedTitleSave.flush()}
              />
            </div>

            {/* Cover Picker Modal */}
            {showCoverPicker && (
              <div
                className="canvas-cover-picker-overlay"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setShowCoverPicker(false);
                }}
              >
                <div className="canvas-cover-picker-panel">
                  <CanvasCover
                    cover={canvas?.cover}
                    canvasId={canvas?._id}
                    canvasTitle={title}
                    channelId={canvas?.channelId}
                    onClose={() => setShowCoverPicker(false)}
                  />
                </div>
              </div>
            )}

            {/* Editor */}
            <div style={{ position: "relative" }}>
              <EditorContent editor={editor} spellCheck={false} />
              {mentionType && (
                <MentionDropdown
                  type={mentionType}
                  query={mentionQuery}
                  channelId={canvas?.channelId}
                  position={{ bottom: "100%", left: 0 }}
                  onSelect={handleMentionSelect}
                  onClose={() => setMentionType(null)}
                />
              )}
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
          <CanvasDetailsSidebar
            canvas={canvas}
            onClose={closeSidebar}
            onOpenShareModal={handleOpenShareModal}
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

      {/* Media Recorder Overlay Dialog */}
      {recordingType && (
        <div className="canvas-media-recorder-overlay">
          <div className="canvas-media-recorder-card">
            <h3>
              Record {recordingType === "video" ? "Video Clip" : "Audio Clip"}
            </h3>

            {recordingType === "video" && (
              <div className="canvas-video-record-preview-wrapper">
                {recordingState === "recording" && (
                  <video
                    ref={videoPreviewRef}
                    muted
                    playsInline
                    className="canvas-recording-video"
                  />
                )}
                {recordingState === "preview" && recordedUrl && (
                  <video
                    src={recordedUrl}
                    controls
                    className="canvas-recording-video"
                  />
                )}
              </div>
            )}

            {recordingType === "audio" && (
              <div className="canvas-audio-record-preview-wrapper">
                {recordingState === "recording" && (
                  <div className="canvas-audio-pulse">
                    <Mic size={32} />
                    <span>Recording...</span>
                  </div>
                )}
                {recordingState === "preview" && recordedUrl && (
                  <audio
                    src={recordedUrl}
                    controls
                    className="canvas-recording-audio"
                  />
                )}
              </div>
            )}

            <div className="canvas-media-recorder-actions">
              {recordingState === "recording" && (
                <button
                  className="canvas-media-btn stop-btn"
                  onClick={stopRecording}
                >
                  Stop Recording
                </button>
              )}
              {recordingState === "preview" && (
                <>
                  <button
                    className="canvas-media-btn insert-btn"
                    onClick={saveRecordedClip}
                  >
                    Insert into Canvas
                  </button>
                  <button
                    className="canvas-media-btn retry-btn"
                    onClick={() => startRecording(recordingType)}
                  >
                    Record Again
                  </button>
                </>
              )}
              <button
                className="canvas-media-btn cancel-btn"
                onClick={closeMediaRecorder}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Toolbar with Insert Menu */}
      <CanvasBottomToolbar
        editor={editor}
        showBottomToolbar={showBottomToolbar}
        isInsertMenuOpen={isInsertMenuOpen}
        onToggleInsertMenu={() => setIsInsertMenuOpen((v) => !v)}
        onEmojiClick={() => setShowEmojiPicker((v) => !v)}
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

      {/* Emoji Picker Portal */}
      <EmojiPickerPortal
        anchorRef={emojiBtnRef}
        isOpen={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={handleEmojiSelect}
        position="top-start"
        zIndex={1100}
      />

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

      {/* Three-dot menu rendered via portal to avoid scroll-surface clipping */}
      {showThreeDotMenu &&
        createPortal(
          <CanvasThreeDotMenu
            canvas={canvas}
            isOpen={true}
            onClose={() => setShowThreeDotMenu(false)}
            onOpenCoverPicker={() => {
              setShowCoverPicker(true);
              setShowThreeDotMenu(false);
            }}
            onBack={onBack}
            onOpenShareModal={handleOpenShareModal}
            onCoverReplace={handleCoverReplace}
            onCoverReposition={handleCoverReposition}
            onCoverRemove={handleCoverRemove}
            hasCover={!!canvas?.cover}
            styleOverride={(() => {
              const btn = threeDotBtnRef.current;
              if (!btn) return { position: "fixed", top: 60, right: 20, margin: 0 };
              const rect = btn.getBoundingClientRect();
              const menuMaxH = 480;
              const spaceBelow = window.innerHeight - rect.bottom - 20;
              const flipUp = spaceBelow < menuMaxH && rect.top > spaceBelow;
              return {
                position: "fixed",
                ...(flipUp
                  ? { bottom: window.innerHeight - rect.top + 6 }
                  : { top: rect.bottom + 6 }),
                right: window.innerWidth - rect.right,
                margin: 0,
              };
            })()}
          />,
          document.body
        )}

      {/* Share Canvas Modal */}
      <CanvasShareModal
        canvas={canvas}
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        channelId={canvas?.channelId}
      />
    </div>
  );
}