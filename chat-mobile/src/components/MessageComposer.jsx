/**
 * MessageComposer — mobile composer matching web MessageInput.
 *
 * Uses the same TipTap rich-text architecture as the web app / Canvas editor
 * (ChatRichTextEditor WebView). Formatting toolbar toggles TipTap marks —
 * users see bold/italic/underline visually, never raw Markdown.
 *
 * Send payload mirrors web: content (plain getText) + htmlContent (getHTML).
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Image,
  useWindowDimensions,
  TextInput,
  ScrollView,
  Modal,
} from "react-native";
import { Video } from "expo-av";
import {
  Plus,
  Clock,
  X,
  FileText,
  CaseSensitive,
  Loader2,
  Camera as CameraIcon,
  Smile,
  AtSign,
  Send,
  Play,
  File,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import logger from "../utils/logger";
import { buildReplyToSnapshot, resolveMessageSenderName, getMessagePlainText } from "../utils/replyUtils";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useDraftStore } from "../stores/draftStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useScheduledStore } from "../stores/scheduledStore";
import { scheduledAPI, fileAPI } from "../services/api";
import { emitTyping } from "../services/socket";
import ScheduleModal from "./ScheduleModal";
import MentionDropdown from "./MentionDropdown";
import FormattingToolbar from "./FormattingToolbar";
import ChatRichTextEditor from "./chat/ChatRichTextEditor";
import MediaPickerSheet from "./MediaPickerSheet";
import GifPickerModal from "./GifPickerModal";
import RecentCanvasesModal from "./RecentCanvasesModal";
import RecentFilesModal from "./RecentFilesModal";
import AudioRecorderUI from "./AudioRecorderUI";
import VideoRecorderModal from "./VideoRecorderModal";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useVideoRecorder } from "../hooks/useVideoRecorder";
import { scale, verticalScale, moderateScale } from "../utils/responsive";

const stripHtml = (html) => {
  if (!html) return "";
  return html
    .replace(/<[^>]*>?/gm, "")
    .replace(/&nbsp;/g, " ")
    .trim();
};

/**
 * Convert markdown-style formatting to HTML for backend compatibility.
 * Handles: **bold**, *italic*, ~~strike~~, `code`, ```code blocks```,
 * > blockquotes, bullet/numbered lists, links, <hr>
 */
const markdownToHtml = (text) => {
  if (!text) return "";

  let html = text
    // Escape HTML special chars first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (```...```)
  html = html.replace(
    /```([\s\S]*?)```/g,
    (_, code) => `<pre><code>${code.trim()}</code></pre>`,
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Underline (underscore-based)
  html = html.replace(/__(.+?)__/g, "<u>$1</u>");

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>");

  // Blockquotes (lines starting with >)
  html = html.replace(/^&gt;\s?(.*)$/gm, "<blockquote>$1</blockquote>");

  // Bullet list blocks (consecutive lines starting with - or *)
  html = html.replace(/(?:^[-*]\s+.*(?:\r?\n|$))+/gm, (match) => {
    const items = match
      .trim()
      .split("\n")
      .map((line) => {
        const content = line.replace(/^[-*]\s+/, "");
        return `<li>${content}</li>`;
      })
      .join("");
    return `<ul>${items}</ul>`;
  });

  // Numbered list blocks (consecutive lines starting with digits)
  html = html.replace(/(?:^\d+\.\s+.*(?:\r?\n|$))+/gm, (match) => {
    const items = match
      .trim()
      .split("\n")
      .map((line) => {
        const content = line.replace(/^\d+\.\s+/, "");
        return `<li>${content}</li>`;
      })
      .join("");
    return `<ol>${items}</ol>`;
  });

  // Each Enter line → its own <p> so display preserves breaks (WhatsApp / TipTap style)
  html = html
    .split(/\n\n/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "<p><br></p>";
      if (/^<(pre|blockquote|ul|ol|li|hr)/.test(trimmed)) return trimmed;
      if (trimmed.includes("<li>") && !trimmed.includes("<ul") && !trimmed.includes("<ol")) {
        return `<ul>${trimmed}</ul>`;
      }
      const lines = trimmed.split(/\n/);
      if (lines.length === 1) {
        return `<p>${lines[0]}</p>`;
      }
      return lines.map((line) => (line ? `<p>${line}</p>` : `<p><br></p>`)).join("");
    })
    .join("");

  return html || "<p></p>";
};

const MessageComposer = React.memo(function MessageComposer({
  channelId,
  channelName,
  workspaceId,
  colors,
  onSend,
  replyingTo,
  editingMessage,
  onCancelReply,
  onCancelEdit,
  text,
  onChangeText,
  members = [],
}) {
  const { setDraft, getDraft, clearDraft } = useDraftStore();
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showRecentCanvases, setShowRecentCanvases] = useState(false);
  const [showRecentFiles, setShowRecentFiles] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [showToolbar, setShowToolbar] = useState(false);
  const [mentionVisible, setMentionVisible] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [pendingMentions, setPendingMentions] = useState([]);
  const [formatState, setFormatState] = useState({});
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const draftTimerRef = useRef(null);
  const lastSavedRef = useRef("");
  const editorRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const latestContentRef = useRef({ html: '', text: '' });
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((state) => state.height);
  // Subtract keyboard height on both platforms so the composer doesn't grow taller than available space.
  const imeInset = keyboardHeight || 0;
  const audioRecorder = useAudioRecorder();
  const videoRecorder = useVideoRecorder();
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);

  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const isTablet = screenWidth >= 600;

  // Auto-expand only — grow with content up to a large share of visible screen
  const visibleHeight =
    screenHeight - insets.top - (Platform.OS === 'ios' ? 44 : 56) - imeInset;
  const maxComposerHeight = Math.max(
    verticalScale(120),
    Math.floor(visibleHeight * (isTablet ? 0.55 : 0.5)),
  );

  const activeWorkspaceId =
    workspaceId || useWorkspaceStore.getState().activeWorkspaceId;

  const saveDraftNow = useCallback((files = pendingFiles) => {
    if (editingMessage || !channelId || !activeWorkspaceId) return;
    const { html, text: plain } = latestContentRef.current;
    const plainContent = (plain || stripHtml(html)).trim();
    const hasFiles = Array.isArray(files) && files.length > 0;
    
    if (plainContent || hasFiles) {
      setDraft(channelId, html || markdownToHtml(plainContent), plainContent, activeWorkspaceId, null, { pendingFiles: files });
      lastSavedRef.current = (html || '').trim();
    } else {
      clearDraft(channelId, activeWorkspaceId, null);
      lastSavedRef.current = '';
    }
  }, [channelId, activeWorkspaceId, setDraft, clearDraft, pendingFiles, editingMessage]);

  // ─── Draft restore on channel change ─────────────────────────────────────
  useEffect(() => {
    if (editingMessage) {
      const html =
        editingMessage.htmlContent ||
        (editingMessage.content ? markdownToHtml(editingMessage.content) : '');
      latestContentRef.current = {
        html,
        text: editingMessage.content || stripHtml(html),
      };
      onChangeText(html);
      editorRef.current?.setContent(html);
      let existingFiles = [];
      const fileReferences = editingMessage.fileReferences?.filter((r) => r.fileId) || [];
      const rawFiles = editingMessage.files || editingMessage.attachments || [];
      const attachments = fileReferences.length > 0 ? fileReferences.map((r) => r.fileId) : rawFiles;
      
      if (attachments && attachments.length > 0) {
        existingFiles = attachments.map(f => ({
          ...f,
          _id: f._id,
          name: f.originalName || f.fileName || f.name,
          url: f.url || f.secureUrl,
          thumbnailUrl: f.thumbnailUrl,
          mimeType: f.mimeType,
          fileSize: f.fileSize,
          status: 'completed',
          progress: 100,
          uploading: false,
          uploadFailed: false,
        }));
      }

      setPendingFiles(existingFiles);
      return;
    }

    const draft = getDraft(channelId, activeWorkspaceId, null);
    if (draft) {
      const html = draft.html || markdownToHtml(draft.text || '');
      latestContentRef.current = { html, text: draft.text || stripHtml(html) };
      onChangeText(html);
      editorRef.current?.setContent(html);
      
      if (draft.pendingFiles && draft.pendingFiles.length > 0) {
        // Any previously 'uploading' files should now be marked as 'failed' (interrupted) so they can be retried
        const restoredFiles = draft.pendingFiles.map(f => ({
          ...f,
          status: f.status === 'uploading' ? 'failed' : (f.status || 'pending'),
          uploading: false,
          uploadFailed: f.status === 'uploading' || f.status === 'failed' || f.uploadFailed
        }));
        setPendingFiles(restoredFiles);
      } else {
        setPendingFiles([]);
      }
    } else {
      latestContentRef.current = { html: '', text: '' };
      onChangeText('');
      editorRef.current?.clear();
      setPendingFiles([]);
    }
  }, [channelId, editingMessage, activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Draft auto-save (800ms debounce for text) ───────────────────────────
  useEffect(() => {
    if (editingMessage) return;

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);

    const { html } = latestContentRef.current;
    const signature = (html || '').trim();
    // Only skip if the signature hasn't changed (prevents thrashing).
    // Note: pendingFiles changes trigger saveDraftNow synchronously, this is just for text typing.
    if (signature === lastSavedRef.current) return;

    draftTimerRef.current = setTimeout(() => {
      saveDraftNow(pendingFiles);
    }, 800);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [text, channelId, editingMessage, activeWorkspaceId, pendingFiles, saveDraftNow]);

  // ─── Unmount / Channel change cleanup for typing indicator ──────────────
  useEffect(() => {
    return () => {
      emitTyping(channelId, false);
    };
  }, [channelId]);

  const handleEditorUpdate = useCallback(
    ({ html, text: plain, isEmpty }) => {
      latestContentRef.current = { html: html || '', text: plain || '' };
      onChangeText(html || '');
      if (!isEmpty) {
        emitTyping(channelId, true);
        
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          emitTyping(channelId, false);
        }, 3000);
      } else {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          emitTyping(channelId, false);
        }
      }
    },
    [onChangeText, channelId]
  );

  const handleEditorSelection = useCallback((state) => {
    setFormatState((prev) => {
      const keys = [
        'bold',
        'italic',
        'underline',
        'strike',
        'code',
        'codeBlock',
        'blockquote',
        'bulletList',
        'orderedList',
      ];
      const same = keys.every((k) => prev[k] === state[k]);
      return same ? prev : { ...prev, ...state };
    });
  }, []);

  const handleEditorCommand = useCallback((command, value = null) => {
    const ed = editorRef.current;
    if (!ed) return;
    switch (command) {
      case 'toggleBold':
        ed.toggleBold();
        break;
      case 'toggleItalic':
        ed.toggleItalic();
        break;
      case 'toggleUnderline':
        ed.toggleUnderline();
        break;
      case 'toggleStrike':
        ed.toggleStrike();
        break;
      case 'toggleBulletList':
        ed.toggleBulletList();
        break;
      case 'toggleOrderedList':
        ed.toggleOrderedList();
        break;
      case 'toggleBlockquote':
        ed.toggleBlockquote();
        break;
      case 'toggleCode':
        ed.toggleCode();
        break;
      case 'toggleCodeBlock':
        ed.toggleCodeBlock();
        break;
      case 'setLink':
        ed.setLink(value);
        break;
      default:
        break;
    }
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      emitTyping(channelId, false);
    }
  }, [channelId]);

  const handleMentionSelect = useCallback(
    (member) => {
      editorRef.current?.insertMention({
        id: member._id,
        label: member.name || member.username,
      });
      setPendingMentions((prev) => [
        ...prev,
        { userId: member._id, username: member.name || member.username, type: 'user' },
      ]);
      setMentionVisible(false);
      setMentionQuery('');
    },
    [],
  );
  // ─── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const fromEditor = editorRef.current?.getContent?.() || latestContentRef.current;
    let htmlContent = (fromEditor.html || text || '').trim();
    let plainContent = (fromEditor.text || stripHtml(htmlContent)).trim();

    if (htmlContent && !/<[a-z][\s\S]*>/i.test(htmlContent)) {
      plainContent = htmlContent.trim();
      htmlContent = markdownToHtml(plainContent);
    }

    if (!plainContent && pendingFiles.length === 0) return;

    const uploadedFiles = pendingFiles.filter((f) => f._id);
    if (
      pendingFiles.length > 0 &&
      uploadedFiles.length === 0 &&
      pendingFiles.some((f) => f.uploading)
    ) {
      return;
    }

    const mentionPayload =
      pendingMentions.length > 0 ? pendingMentions : undefined;

    const attachmentObjects = uploadedFiles.map((f) => ({
      _id: f._id,
      fileName: f.name,
      originalName: f.name,
      mimeType: f.mimeType || 'image/jpeg',
      fileSize: f.fileSize || 0,
      url: f.url,
      secureUrl: f.url,
      thumbnailUrl: f.thumbnailUrl || f.url,
      source: 'chat_upload',
    }));

    const replyTo = replyingTo?._id ? buildReplyToSnapshot(replyingTo, members) : null;

    onSend(plainContent, {
      htmlContent: htmlContent || undefined,
      ...(replyTo
        ? {
            parentMessageId: replyingTo._id,
            replyTo,
          }
        : {}),
      fileReferences: uploadedFiles.map((f) => f._id),
      attachments: attachmentObjects,
      mentions: mentionPayload,
    });

    // Clear reply/edit banner after send so it never sticks onto the next message
    if (replyingTo) onCancelReply?.();
    else if (editingMessage) onCancelEdit?.();

    latestContentRef.current = { html: '', text: '' };
    editorRef.current?.clear();
    onChangeText('');
    setPendingFiles([]);
    setPendingMentions([]);
    clearDraft(channelId, activeWorkspaceId, null);
    lastSavedRef.current = '';
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    emitTyping(channelId, false);
  }, [
    text,
    onSend,
    replyingTo,
    editingMessage,
    pendingFiles,
    pendingMentions,
    channelId,
    activeWorkspaceId,
    clearDraft,
    onChangeText,
    members,
    onCancelReply,
    onCancelEdit,
  ]);

  // ─── Schedule send ─────────────────────────────────────────────────────────
  const handleScheduleSend = useCallback(
    (scheduledAt) => {
      const fromEditor = editorRef.current?.getContent?.() || latestContentRef.current;
      let htmlContent = (fromEditor.html || text || '').trim();
      let plainContent = (fromEditor.text || stripHtml(htmlContent)).trim();

      if (htmlContent && !/<[a-z][\s\S]*>/i.test(htmlContent)) {
        plainContent = htmlContent.trim();
        htmlContent = markdownToHtml(plainContent);
      }

      if (!scheduledAt || (!plainContent && pendingFiles.length === 0)) return;

      const replyTo = replyingTo?._id ? buildReplyToSnapshot(replyingTo, members) : null;

      onSend(plainContent, {
        htmlContent: htmlContent || undefined,
        scheduledAt,
        ...(replyTo
          ? {
              parentMessageId: replyingTo._id,
              replyTo,
            }
          : {}),
        fileReferences: pendingFiles.filter((f) => f._id).map((f) => f._id),
      });

      latestContentRef.current = { html: '', text: '' };
      editorRef.current?.clear();
      onChangeText('');
      setPendingFiles([]);
      setPendingMentions([]);
      clearDraft(channelId, activeWorkspaceId, null);
      lastSavedRef.current = '';
      setShowScheduleModal(false);
    },
    [
      text,
      onSend,
      pendingFiles,
      channelId,
      activeWorkspaceId,
      clearDraft,
      onChangeText,
      replyingTo,
      members,
    ],
  );

  // ─── File attachment — pick and upload to server ──────────────────────────
  const uploadFilesToServer = useCallback(
    async (filesToUpload) => {
      // Process files concurrently
      const uploadPromises = filesToUpload.map(async (localEntry) => {
        if (localEntry.status === 'completed') return; // Don't re-upload

        try {
          // Update status to uploading immediately
          let nextState = [];
          setPendingFiles((prev) => {
            nextState = prev.map(f => f._tempUri === localEntry._tempUri ? { ...f, status: 'uploading', uploading: true, uploadFailed: false, progress: 0 } : f);
            return nextState;
          });
          // Persist transition to uploading outside the updater
          saveDraftNow(nextState);

          const formData = new FormData();
          let name = localEntry.name || `file_${Date.now()}`;
          let type = localEntry.mimeType || localEntry.type || '';
          
          const extToMime = {
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4',
            mov: 'video/quicktime', pdf: 'application/pdf', doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            zip: 'application/zip',
          };

          const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
          if (!type || type === 'image' || type === 'video' || type === 'application/octet-stream') {
            type = extToMime[ext] || (ext ? `image/${ext}` : 'image/jpeg');
          }
          if (!name.includes('.')) {
            const mimeExtMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };
            name += `.${mimeExtMap[type] || 'jpg'}`;
          }

          let fileUri = localEntry._tempUri || localEntry.uri || '';
          if (fileUri.startsWith('ph://') || fileUri.startsWith('assets-library://')) {
            try {
              const FileSystem = require('expo-file-system/legacy');
              const fileExt = name.split('.').pop() || 'jpg';
              const destPath = `${FileSystem.cacheDirectory}upload_${Date.now()}.${fileExt}`;
              await FileSystem.copyAsync({ from: fileUri, to: destPath });
              fileUri = destPath;
            } catch (e) {
              logger.warn('[Composer] Copy asset URI to cache failed:', e);
            }
          }

          if (Platform.OS === 'android' && fileUri && !fileUri.startsWith('file://') && !fileUri.startsWith('content://')) {
            fileUri = `file://${fileUri}`;
          }

          formData.append("files", { uri: fileUri, name, type });

          const onProgress = (progressEvent) => {
            if (progressEvent.total > 0) {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              // Update progress in local state only (throttle draft persistence)
              setPendingFiles((prev) => 
                prev.map(f => f._tempUri === localEntry._tempUri ? { ...f, progress } : f)
              );
            }
          };

          const { data } = await fileAPI.uploadFiles(channelId, formData, onProgress, true);
          const uploadedFile = (data.data?.files || [])[0];

          if (uploadedFile) {
            let nextState = [];
            setPendingFiles((prev) => {
              nextState = prev.map(f => f._tempUri === localEntry._tempUri ? {
                ...f,
                _id: uploadedFile._id,
                name: uploadedFile.originalName || uploadedFile.fileName || uploadedFile.name,
                url: uploadedFile.url || uploadedFile.secureUrl,
                thumbnailUrl: uploadedFile.thumbnailUrl,
                mimeType: uploadedFile.mimeType,
                fileSize: uploadedFile.fileSize,
                status: 'completed',
                progress: 100,
                uploading: false,
                uploadFailed: false,
              } : f);
              return nextState;
            });
            // Persist completion outside the updater
            saveDraftNow(nextState);
          }
        } catch (err) {
          logger.error("[Composer Audit] File upload failed for file:", localEntry.name, err.message);
          let nextState = [];
          setPendingFiles((prev) => {
            nextState = prev.map(f => f._tempUri === localEntry._tempUri ? { ...f, status: 'failed', uploading: false, uploadFailed: true, progress: 0 } : f);
            return nextState;
          });
          // Persist failure outside the updater
          saveDraftNow(nextState);
        }
      });
      await Promise.all(uploadPromises);
    },
    [channelId, saveDraftNow],
  );

  const handleAttach = useCallback(() => {
    setShowMediaPicker(true);
  }, []);

  const handleFilesSelected = useCallback(
    async (pickedFiles) => {
      if (!pickedFiles || !pickedFiles.length) return;

      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
      const oversizedFiles = pickedFiles.filter(f => (f.fileSize || f.size || 0) > MAX_FILE_SIZE);
      if (oversizedFiles.length > 0) {
        Alert.alert('File Too Large', 'One or more files exceed the 50MB size limit. Please choose smaller files.');
        return;
      }

      if (pendingFiles.length + pickedFiles.length > 10) {
        Alert.alert('Upload Limit', 'You can upload up to 10 files at a time.');
        return;
      }

      // Add local files as "pending" entries
      const localEntries = pickedFiles.map((f) => ({
        name: f.name || f.fileName || f.filename || `file_${Date.now()}.jpg`,
        mimeType: f.mimeType || f.type,
        fileSize: f.fileSize || f.size,
        status: 'pending',
        progress: 0,
        uploading: true,
        uploadFailed: false,
        _tempUri: f.uri,
      }));
      
      let nextState = [];
      setPendingFiles((prev) => {
        nextState = [...prev, ...localEntries];
        return nextState;
      });
      // Persist initial add outside the updater
      saveDraftNow(nextState);

      // Upload concurrently
      await uploadFilesToServer(localEntries);
    },
    [uploadFilesToServer, pendingFiles.length, saveDraftNow],
  );

  const removePendingFile = useCallback((index) => {
    let nextState = [];
    setPendingFiles((prev) => {
      nextState = prev.filter((_, i) => i !== index);
      return nextState;
    });
    saveDraftNow(nextState);
  }, [saveDraftNow]);
  
  const retryUpload = useCallback(async (index) => {
    const fileToRetry = pendingFiles[index];
    if (!fileToRetry || fileToRetry.status === 'completed') return;
    await uploadFilesToServer([fileToRetry]);
  }, [pendingFiles, uploadFilesToServer]);

  const handleMediaSend = useCallback(async (uri, type, duration) => {
    const file = {
      uri,
      // Workaround: The production backend doesn't allow audio/m4a or audio/x-m4a, but it allows video/mp4.
      // Since M4A and MP4 use the same container (ftyp), we can upload it as MP4 to bypass the validation.
      name: type === 'audio' ? `audio_${Date.now()}.mp4` : `video_${Date.now()}.mp4`,
      type: type === 'audio' ? 'video/mp4' : 'video/mp4',
    };
    
    const localEntries = [{
      name: file.name,
      uploading: true,
      uploadFailed: false,
      _tempUri: uri,
    }];
    
    setPendingFiles(prev => [...prev, ...localEntries]);
    
    try {
      let fileUri = uri || '';
      if (fileUri.startsWith('ph://')) {
        try {
          const MediaLibrary = require('expo-media-library');
          const info = await MediaLibrary.getAssetInfoAsync(fileUri);
          if (info?.localUri || info?.uri) {
            fileUri = info.localUri || info.uri;
          }
        } catch (e) {}
      }

      if (Platform.OS === 'android' && fileUri && !fileUri.startsWith('file://') && !fileUri.startsWith('content://')) {
        fileUri = `file://${fileUri}`;
      }

      const formData = new FormData();
      formData.append("files", {
        uri: fileUri,
        name: file.name,
        type: file.type,
      });

      const { data } = await fileAPI.uploadFiles(channelId, formData, undefined, true);
      // Access uploaded file correctly:
      const uploadedFile = data?.data?.files?.[0] || data?.data?.[0] || data?.files?.[0];
      const fileId = uploadedFile?._id || uploadedFile?.id;
      
      if (fileId) {
        setPendingFiles(prev => prev.filter(f => f._tempUri !== uri));
        const replyTo = replyingTo?._id ? buildReplyToSnapshot(replyingTo, members) : null;
        onSend("", {
          contentType: type,
          ...(replyTo
            ? {
                parentMessageId: replyingTo._id,
                replyTo,
              }
            : {}),
          fileReferences: [fileId],
          attachments: [{
            fileName: uploadedFile.fileName || uploadedFile.originalName || file.name,
            originalName: uploadedFile.originalName || file.name,
            mimeType: uploadedFile.mimeType || (type === 'audio' ? 'audio/m4a' : 'video/mp4'),
            fileSize: uploadedFile.fileSize || 0,
            url: uploadedFile.url || uploadedFile.secureUrl,
            thumbnailUrl: uploadedFile.thumbnailUrl,
            source: 'chat_upload',
          }],
          [type === 'audio' ? 'audioMeta' : 'videoMeta']: {
            duration,
            [type === 'audio' ? 'audioUrl' : 'videoUrl']: uploadedFile.url || uploadedFile.secureUrl,
          }
        });
      }
    } catch (err) {
      const serverMessage = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      logger.error(`Failed to upload ${type}:`, serverMessage, err.response?.data);
      Alert.alert(`Upload Error`, `Failed to upload ${type}: ${serverMessage}`);
      setPendingFiles(prev => prev.map(f => f._tempUri === uri ? { ...f, uploading: false, uploadFailed: true } : f));
    }
  }, [channelId, onSend, replyingTo, members]);

  const styles = createStyles(colors, insets);

  return (
    <View>
      {/* Reply/Edit banner */}
      {(replyingTo || editingMessage) && (
        <View
          style={[
            styles.banner,
            {
              backgroundColor: colors.card,
              borderLeftColor: editingMessage ? colors.warning : colors.primary,
            },
          ]}
        >
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            {replyingTo?.attachmentContext && (
              <View style={{ marginRight: moderateScale(8), borderRadius: moderateScale(4), overflow: 'hidden', backgroundColor: colors.border, width: scale(32), height: scale(32), justifyContent: 'center', alignItems: 'center' }}>
                {(replyingTo.attachmentContext.thumbnailUrl || replyingTo.attachmentContext.url || replyingTo.attachmentContext.secureUrl) ? (
                  <Image 
                    source={{ uri: replyingTo.attachmentContext.thumbnailUrl || replyingTo.attachmentContext.url || replyingTo.attachmentContext.secureUrl }} 
                    style={{ width: '100%', height: '100%' }} 
                    resizeMode="cover" 
                  />
                ) : (
                  <File size={16} color={colors.textSecondary} />
                )}
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerLabel, { color: colors.textSecondary }]}>
                {editingMessage
                  ? "Editing message"
                  : `Replying to ${resolveMessageSenderName(replyingTo, members) || "Someone"}`}
              </Text>
              <Text
                style={[styles.bannerText, { color: colors.textTertiary }]}
                numberOfLines={1}
              >
                {replyingTo?.attachmentContext 
                  ? (replyingTo.attachmentContext.name || replyingTo.attachmentContext.fileName || 'Media attached')
                  : (editingMessage
                      ? (getMessagePlainText(editingMessage) || editingMessage?.content || "Editing message")
                      : (getMessagePlainText(replyingTo) || "[Media attached]"))}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => {
              if (editingMessage) onCancelEdit?.();
              else onCancelReply?.();
            }}
            style={{ padding: moderateScale(4) }}
          >
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Mention Popup Modal */}
      <MentionDropdown
        visible={mentionVisible}
        members={members}
        query={mentionQuery}
        onSelect={handleMentionSelect}
        onClose={() => setMentionVisible(false)}
        colors={colors}
      />

      {/* Pending files preview moved inside inputContainer */}

      {/* Input bar */}
      <View
        style={[
          styles.inputBar,
          { backgroundColor: colors.background, paddingBottom: 0 },
        ]}
      >
        <View
          style={[
            styles.inputContainer,
            showToolbar && styles.inputContainerWithToolbar,
            {
              borderColor: colors.border,
              backgroundColor: colors.inputBackground,
            },
          ]}
        >
          {showToolbar && (
            <FormattingToolbar
              colors={colors}
              formatState={formatState}
              onCommand={handleEditorCommand}
              onInsertMention={() => {
                editorRef.current?.insertText('@');
                setMentionQuery('');
                setMentionVisible(true);
              }}
              onLink={() => {
                setLinkUrl('https://');
                setLinkModalVisible(true);
              }}
            />
          )}

          {pendingFiles.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, paddingHorizontal: moderateScale(8), paddingTop: moderateScale(8) }}
              contentContainerStyle={{ gap: 8, paddingRight: moderateScale(16) }}
            >
              {pendingFiles.map((file, i) => {
                const isImage = file.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
                const isVideo = file.mimeType?.startsWith('video/') || /\.(mp4|mov|mkv)$/i.test(file.name);
                return (
                  <View
                    key={i}
                    style={[
                      { 
                        position: 'relative',
                        width: scale(70), 
                        height: scale(70), 
                        borderRadius: moderateScale(8), 
                        backgroundColor: colors.background,
                        overflow: 'hidden',
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: colors.border,
                      },
                      file.uploadFailed && { borderColor: colors.error }
                    ]}
                  >
                    <TouchableOpacity
                      activeOpacity={isImage || isVideo ? 0.8 : 1}
                      style={{ width: '100%', height: '100%' }}
                      onPress={() => {
                        if (isImage || isVideo) {
                          setPreviewFile(file);
                        }
                      }}
                    >
                      {isImage ? (
                        <Image source={{ uri: file.url || file._tempUri || file.thumbnailUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : isVideo ? (
                        <View style={{ width: '100%', height: '100%' }}>
                          <Video source={{ uri: file.url || file._tempUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" shouldPlay={false} useNativeControls={false} />
                          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                            <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 4 }}>
                              <Play size={16} color="#FFF" />
                            </View>
                          </View>
                        </View>
                      ) : (
                        <View style={{ alignItems: 'center', padding: 4, flex: 1, justifyContent: 'center' }}>
                          <FileText size={24} color={colors.textSecondary} />
                          <Text style={{ fontSize: moderateScale(10), color: colors.textSecondary, marginTop: 4, textAlign: 'center' }} numberOfLines={1}>
                            {file.name}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    {file.status === 'uploading' && (
                      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
                        <Loader2 size={24} color="#FFF" />
                        <Text style={{ color: '#FFF', fontSize: 10, marginTop: 4, fontWeight: 'bold' }}>{file.progress || 0}%</Text>
                      </View>
                    )}
                    {file.status === 'failed' && (
                      <TouchableOpacity 
                        style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
                        onPress={() => retryUpload(i)}
                      >
                        <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>Retry</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity 
                      onPress={() => removePendingFile(i)}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        borderRadius: 12,
                        padding: 4,
                      }}
                    >
                      <X size={12} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View key="editor-wrapper" style={{ minHeight: verticalScale(40), width: '100%', paddingHorizontal: moderateScale(12), paddingTop: moderateScale(12) }}>
            <ChatRichTextEditor
              ref={editorRef}
              placeholder="Jot something down"
              colors={colors}
              initialHtml={typeof text === 'string' && text.includes('<') ? text : ''}
              onUpdate={handleEditorUpdate}
              onSelectionChange={handleEditorSelection}
              onMentionQuery={(q) => {
                setMentionQuery(q);
                setMentionVisible(true);
              }}
              onMentionClose={() => setMentionVisible(false)}
              minHeight={verticalScale(40)}
              maxHeight={maxComposerHeight}
            />
          </View>

          <View style={[styles.composerRow, { justifyContent: 'space-between', paddingHorizontal: moderateScale(8), paddingBottom: moderateScale(8) }]}>
            <View style={[styles.sideButtons, { gap: moderateScale(10) }]}>
              <TouchableOpacity style={[styles.iconButton, { backgroundColor: colors.border, borderRadius: moderateScale(16), padding: moderateScale(6), marginLeft: moderateScale(4) }]} onPress={handleAttach}>
                <Plus size={18} color={colors.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setShowToolbar((v) => !v)}
              >
                <CaseSensitive
                  size={20}
                  color={showToolbar ? colors.primary : colors.textSecondary}
                />
              </TouchableOpacity>

              <TouchableOpacity style={styles.iconButton} onPress={() => {
                editorRef.current?.insertText('@');
                setMentionQuery('');
                setMentionVisible(true);
              }}>
                <AtSign size={20} color={colors.textSecondary} />
              </TouchableOpacity>
        
            </View>

            <View style={styles.sideButtons}>
              {stripHtml(text).trim() || pendingFiles.length > 0 ?  (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[styles.iconButton, { padding: moderateScale(4), marginRight: moderateScale(4) }]}
                    onPress={() => setShowScheduleModal(true)}
                  >
                    <Clock size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sendButton, { backgroundColor: colors.primary, borderRadius: moderateScale(20), padding: moderateScale(8), marginRight: moderateScale(4) }]}
                    onPress={handleSend}
                    onLongPress={() => setShowScheduleModal(true)}
                    delayLongPress={500}
                  >
                    <Send size={16} color={colors.background} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.sendButton, { backgroundColor: colors.backgroundSecondary || colors.border, borderRadius: moderateScale(20), padding: moderateScale(8), marginRight: moderateScale(4) }]}
                  onPress={() => {}}
                  activeOpacity={1}
                >
                  <Send size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>


      {/* Link URL prompt */}
      {linkModalVisible && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24, zIndex: 50 }]}>
          <View style={{ backgroundColor: colors.card || colors.background, borderRadius: 12, padding: 16, gap: 12 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 16 }}>Add link</Text>
            <TextInput
              value={linkUrl}
              onChangeText={setLinkUrl}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://"
              placeholderTextColor={colors.inputPlaceholder}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.inputText || colors.textPrimary,
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity onPress={() => setLinkModalVisible(false)}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const url = (linkUrl || '').trim();
                  if (url) handleEditorCommand('setLink', url);
                  setLinkModalVisible(false);
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <VideoRecorderModal
        visible={showVideoModal}
        onClose={() => setShowVideoModal(false)}
        cameraRef={videoRecorder.cameraRef}
        isRecording={videoRecorder.isRecording}
        recordingDuration={videoRecorder.recordingDuration}
        videoUri={videoRecorder.videoUri}
        cameraType={videoRecorder.cameraType}
        flashMode={videoRecorder.flashMode}
        startRecording={videoRecorder.startRecording}
        stopRecording={videoRecorder.stopRecording}
        toggleCamera={videoRecorder.toggleCamera}
        toggleFlash={videoRecorder.toggleFlash}
        onRetake={() => videoRecorder.setVideoUri(null)}
        onSend={async (uri) => {
          setShowVideoModal(false);
          await handleMediaSend(uri, 'video', videoRecorder.recordingDuration);
          videoRecorder.cancelRecording();
        }}
        colors={colors}
      />

      {/* Media Picker Sheet */}
      <MediaPickerSheet
        visible={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        colors={colors}
        onPickFiles={handleFilesSelected}
        onOpenGifPicker={() => setShowGifPicker(true)}
        onOpenRecentCanvases={() => setShowRecentCanvases(true)}
        onOpenRecentFiles={() => setShowRecentFiles(true)}
        onRecordAudio={audioRecorder.startRecording}
        onRecordVideo={() => setShowVideoModal(true)}
      />

      {/* Recent Canvases Modal */}
      <RecentCanvasesModal
        visible={showRecentCanvases}
        onClose={() => setShowRecentCanvases(false)}
        colors={colors}
        onSelectCanvas={(canvas) => {
          const md = `[📄 ${canvas.title || "Untitled Canvas"}](/canvas/${canvas._id})`;
          onChangeText(text ? `${text}\n${md}` : md);
        }}
      />

      {/* Recent Files Modal */}
      <RecentFilesModal
        visible={showRecentFiles}
        onClose={() => setShowRecentFiles(false)}
        colors={colors}
        onSelectFile={(file) => {
          setPendingFiles((prev) => [
            ...prev,
            {
              _id: file._id,
              name:
                file.originalName || file.fileName || file.name || "Unknown",
              url: file.url || file.secureUrl,
              thumbnailUrl: file.thumbnailUrl,
              mimeType: file.mimeType,
              fileSize: file.fileSize,
              uploading: false,
            },
          ]);
        }}
      />

      <GifPickerModal
        visible={showGifPicker}
        onClose={() => setShowGifPicker(false)}
        colors={colors}
        onSelectGif={(gif) => {
          const replyTo = replyingTo?._id ? buildReplyToSnapshot(replyingTo, members) : null;
          onSend('', {
            contentType: 'gif',
            gifMeta: gif,
            ...(replyTo
              ? {
                  parentMessageId: replyingTo._id,
                  replyTo,
                }
              : {}),
          });
          if (editingMessage) onCancelEdit?.();
          else onCancelReply?.();
          onChangeText('');
        }}
      />

      {/* Schedule Modal */}
      <ScheduleModal
        visible={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSchedule={handleScheduleSend}
        colors={colors}
      />

      {/* Media Preview Modal */}
      <Modal
        visible={!!previewFile}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewFile(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 50, right: 20, zIndex: 100, padding: 10 }}
            onPress={() => setPreviewFile(null)}
          >
            <X size={30} color="#FFF" />
          </TouchableOpacity>
          {previewFile && (
            (previewFile.mimeType?.startsWith('video/') || /\.(mp4|mov|mkv)$/i.test(previewFile.name)) ? (
              <Video
                source={{ uri: previewFile.url || previewFile._tempUri }}
                style={{ width: '100%', height: '80%' }}
                resizeMode="contain"
                useNativeControls
                shouldPlay
              />
            ) : (
              <Image
                source={{ uri: previewFile.url || previewFile._tempUri || previewFile.thumbnailUrl }}
                style={{ width: '100%', height: '80%' }}
                resizeMode="contain"
              />
            )
          )}
        </View>
      </Modal>
    </View>
  );
});

const createStyles = (colors, insets) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: moderateScale(16),
      paddingVertical: moderateScale(8),
      borderLeftWidth: 3,
      gap: 8,
    },
    bannerLabel: {
      fontSize: moderateScale(12),
      fontWeight: "600",
    },
    bannerText: {
      fontSize: moderateScale(13),
      marginTop: moderateScale(1),
    },
    pendingFilesRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: moderateScale(12),
      paddingVertical: moderateScale(6),
      gap: 6,
    },
    pendingFileChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: moderateScale(8),
      paddingVertical: moderateScale(4),
      borderRadius: moderateScale(12),
      gap: 4,
      maxWidth: '60%',
    },
    pendingFileName: {
      fontSize: moderateScale(12),
      flexShrink: 1,
    },
    inputBar: {
      paddingHorizontal: moderateScale(12),
      paddingTop: moderateScale(6),
      paddingBottom: moderateScale(6),
    },
    inputContainer: {
      flexDirection: 'column',
      alignItems: 'stretch',
      borderRadius: moderateScale(24),
      borderWidth: 1,
      paddingHorizontal: moderateScale(4),
      minHeight: moderateScale(48),
      overflow: 'hidden',
    },
    inputContainerWithToolbar: {
      minHeight: undefined,
    },
    composerRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      width: '100%',
      minHeight: moderateScale(48),
    },
    sideButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
      paddingBottom: verticalScale(2),
    },
    editorSlot: {
      flex: 1,
      minWidth: 0,
      minHeight: verticalScale(40),
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    iconButton: {
      padding: moderateScale(8),
    },
    input: {
      width: '100%',
      minHeight: moderateScale(48),
      fontSize: moderateScale(16),
      paddingTop: Platform.OS === "android" ? 12 : 14,
      paddingBottom: Platform.OS === "android" ? 12 : 14,
      paddingHorizontal: moderateScale(8),
      textAlignVertical: "top",
      letterSpacing: 0,
      ...(Platform.OS === "web" && { outlineWidth: 0, outlineStyle: "none" }),
    },
    sendButton: {
      padding: moderateScale(8),
      paddingHorizontal: moderateScale(12),
    },
  });

export default MessageComposer;
