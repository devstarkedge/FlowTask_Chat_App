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
import { messageAPI } from "../../../services/api";
import { useCanvasUiStore } from "../../../stores/canvasUiStore";
import { useAuthStore } from "../../../stores/authStore";
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
import toast from "react-hot-toast";
import "../canvas-enterprise.css";

const COLLAB_TIMEOUT_MS = 4_000;
const PERMISSION_TOAST_MESSAGE = "You do not have permission to edit this canvas.";

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

// ── Permission Role Helpers ──────────────────────────────────────────────────────
// Helper to extract ID from populated or non-populated user fields.
// (canvas.createdBy can be a populated object { _id, name, avatar } or a plain ObjectId)
function extractUserId(field) {
  if (!field) return null;
  if (typeof field === 'object' && field._id) return field._id.toString();
  return field.toString();
}

// Priority: Owner > Editor > Viewer
function getCanvasRole(canvas) {
  if (!canvas) return null;
  const currentUser = useAuthStore.getState().user;
  if (!currentUser) return null;
  const userId = currentUser._id?.toString();
  if (!userId) return null;

  // 1. Owner — full access, overrides ALL share settings
  const createdById = extractUserId(canvas.createdBy);
  if (createdById === userId) return "owner";

  // 2. Editor — explicit editor permission via share settings
  const users = canvas.permissions?.users || [];
  const userPerm = users.find((u) => u.userId?.toString() === userId);
  if (userPerm && userPerm.role === "editor") return "editor";

  // 3. Editor — via accessLevel "edit" (channel members can edit)
  if (canvas.permissions?.accessLevel === "edit") return "editor";

  // 4. Viewer — explicit viewer permission via share settings
  if (userPerm && userPerm.role === "viewer") return "viewer";

  // 5. Viewer — legacy allowedUserIds
  const legacyIds = canvas.permissions?.allowedUserIds || [];
  if (legacyIds.some((id) => id.toString() === userId)) return "viewer";

  // 6. Viewer — via accessLevel "view" (channel members can view)
  if (canvas.permissions?.accessLevel === "view") return "viewer";

  // 7. Viewer — via visibility "channel" or "workspace"
  const visibility = canvas.permissions?.visibility || "channel";
  if (visibility === "channel" || visibility === "workspace") return "viewer";

  // 8. No access — "invite_only" with no explicit permission
  return null;
}

function canEditCanvas(canvas) {
  const role = getCanvasRole(canvas);
  return role === "owner" || role === "editor";
}

function canDeleteCanvas(canvas) {
  const role = getCanvasRole(canvas);
  return role === "owner";
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
  // Position for the mention dropdown, computed from the cursor coordinates
  // so it opens beside the caret rather than at a fixed location.
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
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
  // Ref for the editor wrapper so we can compute cursor-relative positions
  // for floating UI like the mention dropdown.
  const editorWrapperRef = useRef(null);

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

  // ── Permission enforcement ───────────────────────────────────────────────────────
  const isViewOnly = !canEditCanvas(canvas);
  const permissionToastShownRef = useRef(false);

  const { ydoc, provider, status, awarenessUsers } = useCanvasCollaboration(
    canvas?._id,
  );
  const { editor, saveStatus, wordCount } = useCanvasEditor({
    canvas,
    onSave,
    provider,
    ydoc,
  });

  // Enforce read-only for viewers: set editor to non-editable and show toast
  useEffect(() => {
    if (!editor) return;
    if (isViewOnly) {
      editor.setEditable(false);
      if (!permissionToastShownRef.current) {
        permissionToastShownRef.current = true;
        toast.error(PERMISSION_TOAST_MESSAGE, { duration: 4000 });
      }
    } else {
      // Only re-enable if not viewing a historical version
      if (!viewingVersion) {
        editor.setEditable(true);
      }
    }
  }, [editor, isViewOnly, viewingVersion]);

  // Reset toast flag when canvas changes
  useEffect(() => {
    permissionToastShownRef.current = false;
  }, [canvas?._id]);

  // Block typing/paste events for view-only users at the DOM level
  useEffect(() => {
    if (!editor || !isViewOnly) return;
    const dom = editor.view?.dom;
    if (!dom) return;

    const blockEdit = (e) => {
      // Allow Tab key for accessibility
      if (e.key === "Tab") return;
      // Allow Ctrl+C / Cmd+C for copy
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") return;
      e.preventDefault();
      e.stopPropagation();
      if (!permissionToastShownRef.current) {
        permissionToastShownRef.current = true;
        toast.error(PERMISSION_TOAST_MESSAGE, { duration: 3000 });
      }
    };

    dom.addEventListener("keydown", blockEdit, true);
    dom.addEventListener("paste", (e) => { e.preventDefault(); }, true);
    dom.addEventListener("drop", (e) => { e.preventDefault(); }, true);
    dom.addEventListener("input", (e) => { e.preventDefault(); }, true);

    return () => {
      dom.removeEventListener("keydown", blockEdit, true);
    };
  }, [editor, isViewOnly]);

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
    if (isViewOnly) {
      toast.error(PERMISSION_TOAST_MESSAGE);
      return;
    }
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

  // Check if a file is an image type
  const isImageFile = (file) => {
    return file && file.type && file.type.startsWith("image/");
  };

  // Upload file to backend server
  const uploadFileToServer = async (file, channelId) => {
    const formData = new FormData();
    formData.append("files", file);
    
    // Use the channel upload endpoint if we have a channel context
    try {
      const channelIdToUse = channelId || canvas?.channelId;
      if (channelIdToUse) {
        const response = await messageAPI.uploadFiles(channelIdToUse, formData);
        const uploadedFile = response?.data?.data?.files?.[0] || response?.data?.data?.file || response?.data;
        const fileUrl = uploadedFile?.url || uploadedFile?.secure_url || uploadedFile?.path;
        if (fileUrl) return { url: fileUrl, data: uploadedFile };
      }
      
      // Fallback: try canvas-specific upload or return null
      console.warn("[Canvas Upload] No channel context for upload, using blob URL");
      return null;
    } catch (err) {
      console.error("[Canvas Upload] Upload failed:", err);
      return null;
    }
  };

  // Helper to update a loading node's attributes after upload
  const updateNodeAfterUpload = (editorInstance, nodeType, newAttrs) => {
    if (!editorInstance) return;
    editorInstance.state.doc.descendants((node, pos) => {
      if (node.type.name === nodeType && node.attrs.loading === true) {
        editorInstance.view.dispatch(
          editorInstance.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            ...newAttrs,
            loading: false,
          }),
        );
      }
    });
  };

  const insertMedia = async (file, nodeType) => {
    if (isViewOnly) {
      toast.error(PERMISSION_TOAST_MESSAGE);
      return;
    }
    if (!editor) return;
    const localUrl = URL.createObjectURL(file);
    const name = file.name;
    const size = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    const isImage = isImageFile(file);

    // Auto-detect image type from file
    if (isImage && nodeType === "fileAttachment") {
      nodeType = "image";
    }

    // 1. Insert Node with loading: true (shows loading placeholder)
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

    // 2. Upload file to server
    const uploadResult = await uploadFileToServer(file);
    
    // 3. Update the loading node with the uploaded URL
    if (uploadResult?.url) {
      const finalUrl = uploadResult.url;
      if (nodeType === "image") {
        updateNodeAfterUpload(editor, nodeType, { src: finalUrl });
      } else if (nodeType === "videoBlock" || nodeType === "audioBlock") {
        updateNodeAfterUpload(editor, nodeType, { src: finalUrl });
      } else if (nodeType === "fileAttachment") {
        updateNodeAfterUpload(editor, nodeType, { url: finalUrl, name, size });
      }
    } else {
      // Upload failed or no server available - fall back to blob URL
      // The image will show via blob URL but won't persist after refresh
      console.warn("[Canvas Upload] No upload result, using local blob URL as fallback");
      setTimeout(() => {
        updateNodeAfterUpload(editor, nodeType, {
          ...(nodeType === "image" ? { src: localUrl } : {}),
          ...(nodeType === "fileAttachment" ? { url: localUrl, name, size } : {}),
        });
      }, 500);
    }
  };

  // Media Recording Triggers
  const startRecording = async (type) => {
    if (isViewOnly) {
      toast.error(PERMISSION_TOAST_MESSAGE);
      return;
    }
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

  // Mention detection — also computes cursor-relative position for the
  // dropdown so it opens beside the caret (not at a fixed location).
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
          // Compute caret position in viewport coordinates so the
          // mention dropdown renders directly beside the cursor.
          try {
            const coords = editor.view.coordsAtPos(from);
            setMentionPosition({
              top: coords.bottom + 4,  // 4px below the caret baseline
              left: coords.left,
            });
          } catch (_) {
            // fall back to last known position on positioning errors
          }
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
      if (isViewOnly) {
        toast.error(PERMISSION_TOAST_MESSAGE);
        return;
      }
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
    [editor, mentionType, isViewOnly],
  );

  // Mention from toolbar button
  const handleMentionFromToolbar = useCallback(() => {
    if (isViewOnly) {
      toast.error(PERMISSION_TOAST_MESSAGE);
      return;
    }
    if (!editor) return;
    editor.chain().focus().insertContent("@").run();
  }, [editor, isViewOnly]);

  // Emoji insert at cursor
  const handleEmojiSelect = useCallback(
    (emoji) => {
      if (isViewOnly) {
        toast.error(PERMISSION_TOAST_MESSAGE);
        return;
      }
      if (!editor) return;
      editor.chain().focus().insertContent(emoji).run();
      setShowEmojiPicker(false);
    },
    [editor, isViewOnly],
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
        // Block title rename for view-only users
        if (isViewOnly) {
          toast.error(PERMISSION_TOAST_MESSAGE);
          setTitle(canvas.title || "Untitled");
          return;
        }
        await updateCanvasMetadata(canvas._id, {
          title: nextTitle.trim() || "Untitled canvas",
        });
      }, 600),
    [canvas?._id, updateCanvasMetadata, isViewOnly],
  );

  useEffect(() => () => debouncedTitleSave.cancel(), [debouncedTitleSave]);

  const handleOpenHistory = async () => {
    if (canvas?._id) await fetchHistory(canvas._id);
    openSidebar("history");
  };

  // Cover actions
  const handleCoverReplace = useCallback(() => {
    if (isViewOnly) {
      toast.error(PERMISSION_TOAST_MESSAGE);
      return;
    }
    setShowCoverPicker(true);
  }, [isViewOnly]);

  const handleCoverReposition = useCallback(() => {
    if (isViewOnly) {
      toast.error(PERMISSION_TOAST_MESSAGE);
      return;
    }
    setIsRepositioning(true);
  }, [isViewOnly]);

  const handleCoverRemove = useCallback(async () => {
    if (isViewOnly) {
      toast.error(PERMISSION_TOAST_MESSAGE);
      return;
    }
    if (canvas?._id) {
      await updateCanvasMetadata(canvas._id, { cover: null });
    }
    setIsRepositioning(false);
  }, [canvas?._id, updateCanvasMetadata, isViewOnly]);

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

  const currentCoverStyle = coverStyle(canvas?.cover);

  return (
    <div className="canvas-editor-ui-shell">
      {/* Secondary Tab Navigation — always render to keep three-dot button available */}
      <div className="canvas-tab-nav">
        <div className="canvas-tabs-container">
          {tabs.length > 0 && tabs.map((tab) => (
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
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            className="canvas-topbar-menu"
            aria-label="More options"
            onClick={() => setShowThreeDotMenu((v) => !v)}
          >
            {/* <MoreHorizontal size={18} /> */}
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
            isViewOnly={isViewOnly}
            canvasRole={getCanvasRole(canvas)}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="canvas-editor-container">
        <main className="canvas-scroll-surface">
          <article className="canvas-document-surface">
            {/* View-only banner */}
            {isViewOnly && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--warning-color, #f59e0b)",
                  background: "var(--bg-secondary)",
                  borderBottom: "1px solid var(--border-primary)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                View-only — You do not have permission to edit this canvas.
              </div>
            )}

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
                      onClick={() => {
                        if (isViewOnly) {
                          toast.error(PERMISSION_TOAST_MESSAGE);
                          return;
                        }
                        setShowCoverPicker(true);
                      }}
                    >
                      <ImageIcon size={14} />
                      Change cover
                    </button>
                    <button
                      className="canvas-cover-remove-btn"
                      onClick={async () => {
                        if (isViewOnly) {
                          toast.error(PERMISSION_TOAST_MESSAGE);
                          return;
                        }
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
                  onClick={() => {
                    if (isViewOnly) {
                      toast.error(PERMISSION_TOAST_MESSAGE);
                      return;
                    }
                    setShowCoverPicker(true);
                  }}
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
                readOnly={isViewOnly}
                style={isViewOnly ? { cursor: "default", opacity: 0.8 } : {}}
                onChange={(event) => {
                  if (isViewOnly) return;
                  setTitle(event.target.value);
                  debouncedTitleSave(event.target.value);
                }}
                onBlur={() => !isViewOnly && debouncedTitleSave.flush()}
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
                    isViewOnly={isViewOnly}
                  />
                </div>
              </div>
            )}

            {/* Share Modal */}
            {showShareModal && (
              <CanvasShareModal
                canvas={canvas}
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                channelId={canvas?.channelId}
              />
            )}

            {/* Editor */}
            <div ref={editorWrapperRef} style={{ position: "relative" }}>
              {isViewOnly && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 5,
                    cursor: "default",
                  }}
                  onClick={() => {
                    if (!permissionToastShownRef.current) {
                      permissionToastShownRef.current = true;
                      toast.error(PERMISSION_TOAST_MESSAGE, { duration: 3000 });
                    }
                  }}
                />
              )}
              <EditorContent editor={editor} spellCheck={false} />
              {/* Mention dropdown rendered via portal so it is not clipped
                  by overflow containers.  Position is computed from the caret
                  coordinates using editor.view.coordsAtPos(). */}
              {mentionType &&
                createPortal(
                  <MentionDropdown
                    type={mentionType}
                    query={mentionQuery}
                    channelId={canvas?.channelId}
                    position={mentionPosition}
                    onSelect={handleMentionSelect}
                    onClose={() => setMentionType(null)}
                  />,
                  document.body,
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
      {!isViewOnly && (
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
      )}

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
    </div>
  );
}