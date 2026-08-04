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
} from "react-native";
import {
  Plus,
  Smile,
  Clock,
  X,
  FileText,
  CaseSensitive,
  Loader2,
  Camera as CameraIcon,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import logger from "../utils/logger";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useDraftStore } from "../stores/draftStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useScheduledStore } from "../stores/scheduledStore";
import { scheduledAPI, fileAPI } from "../services/api";
import { emitTyping } from "../services/socket";
import EmojiPickerModal from "./EmojiPickerModal";
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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
  const latestContentRef = useRef({ html: '', text: '' });
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((state) => state.height);
  // Android window already resizes; only iOS needs height subtracted for expand math.
  const imeInset = Platform.OS === 'android' ? 0 : keyboardHeight;
  const audioRecorder = useAudioRecorder();
  const videoRecorder = useVideoRecorder();
  const [showVideoModal, setShowVideoModal] = useState(false);

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
      return;
    }

    const draft = getDraft(channelId, activeWorkspaceId, null);
    if (draft?.html || draft?.text) {
      const html = draft.html || markdownToHtml(draft.text || '');
      latestContentRef.current = { html, text: draft.text || stripHtml(html) };
      onChangeText(html);
      editorRef.current?.setContent(html);
    } else {
      latestContentRef.current = { html: '', text: '' };
      onChangeText('');
      editorRef.current?.clear();
    }
  }, [channelId, editingMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Draft auto-save (800ms debounce) ──────────────────────────────────────
  useEffect(() => {
    if (editingMessage) return;

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);

    const { html, text: plain } = latestContentRef.current;
    const signature = (html || '').trim();
    if (signature === lastSavedRef.current) return;

    draftTimerRef.current = setTimeout(() => {
      const plainContent = (plain || stripHtml(html)).trim();
      if (plainContent) {
        setDraft(channelId, html || markdownToHtml(plainContent), plainContent, activeWorkspaceId, null);
        lastSavedRef.current = signature;
      } else {
        clearDraft(channelId, activeWorkspaceId, null);
        lastSavedRef.current = '';
      }
    }, 800);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [text, channelId, editingMessage, activeWorkspaceId]);

  const handleEditorUpdate = useCallback(
    ({ html, text: plain, isEmpty }) => {
      latestContentRef.current = { html: html || '', text: plain || '' };
      onChangeText(html || '');
      emitTyping(channelId, !isEmpty);
    },
    [channelId, onChangeText],
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

  const handleEmojiSelect = useCallback(
    (emoji) => {
      editorRef.current?.insertEmoji(emoji);
      setShowEmojiPicker(false);
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

    onSend(plainContent, {
      htmlContent: htmlContent || undefined,
      threadId: replyingTo?._id || null,
      fileReferences: uploadedFiles.map((f) => f._id),
      attachments: attachmentObjects,
      mentions: mentionPayload,
    });

    latestContentRef.current = { html: '', text: '' };
    editorRef.current?.clear();
    onChangeText('');
    setPendingFiles([]);
    setPendingMentions([]);
    clearDraft(channelId, activeWorkspaceId, null);
    lastSavedRef.current = '';
    emitTyping(channelId, false);
  }, [
    text,
    onSend,
    replyingTo,
    pendingFiles,
    pendingMentions,
    channelId,
    activeWorkspaceId,
    clearDraft,
    onChangeText,
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

      onSend(plainContent, {
        htmlContent: htmlContent || undefined,
        scheduledAt,
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
    ],
  );

  // ─── File attachment — pick and upload to server ──────────────────────────
  const uploadFilesToServer = useCallback(
    async (pickedFiles, localEntries) => {
      try {
        const formData = new FormData();
        for (let i = 0; i < pickedFiles.length; i++) {
          const file = pickedFiles[i];
          let name = file.name || file.fileName || localEntries[i]?.name || `file_${Date.now()}`;
          
          let type = file.mimeType || file.type || '';
          
          // Extension to MIME map
          const extToMime = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            mp4: 'video/mp4',
            mov: 'video/quicktime',
            pdf: 'application/pdf',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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

          let fileUri = file.uri || '';
          if (fileUri.startsWith('ph://') || fileUri.startsWith('assets-library://')) {
            try {
              const FileSystem = require('expo-file-system/legacy');
              const fileExt = name.split('.').pop() || 'jpg';
              const destPath = `${FileSystem.cacheDirectory}upload_${Date.now()}_${i}.${fileExt}`;
              await FileSystem.copyAsync({ from: fileUri, to: destPath });
              fileUri = destPath;
            } catch (e) {
              logger.warn('[Composer] Copy asset URI to cache failed:', e);
            }
          }

          if (Platform.OS === 'android' && fileUri && !fileUri.startsWith('file://') && !fileUri.startsWith('content://')) {
            fileUri = `file://${fileUri}`;
          }

          logger.info('[Composer Audit] Appending file to FormData:', {
            index: i,
            uri: fileUri,
            name,
            type,
          });

          formData.append("files", {
            uri: fileUri,
            name,
            type,
          });
        }

        const { data } = await fileAPI.uploadFiles(channelId, formData, undefined, true);
        const uploadedFiles = data.data?.files || [];

        // Replace pending local file entries with server file objects using exact matching
        setPendingFiles((prev) => {
          const result = [...prev];
          uploadedFiles.forEach((serverFile, i) => {
            // Find the pending item by matching the temporary URI or name
            const sourceLocalEntry = localEntries[i];
            const localIdx = result.findIndex(
              (f) =>
                f._tempUri === sourceLocalEntry?._tempUri ||
                f.name === sourceLocalEntry?.name ||
                f.name === serverFile.originalName ||
                f.name === serverFile.fileName,
            );

            if (localIdx >= 0) {
              result[localIdx] = {
                _id: serverFile._id,
                name:
                  serverFile.originalName ||
                  serverFile.fileName ||
                  serverFile.name,
                url: serverFile.url || serverFile.secureUrl,
                thumbnailUrl: serverFile.thumbnailUrl,
                mimeType: serverFile.mimeType,
                fileSize: serverFile.fileSize,
                uploading: false,
              };
            } else {
              result.push({
                _id: serverFile._id,
                name:
                  serverFile.originalName ||
                  serverFile.fileName ||
                  serverFile.name,
                url: serverFile.url || serverFile.secureUrl,
                thumbnailUrl: serverFile.thumbnailUrl,
                mimeType: serverFile.mimeType,
                fileSize: serverFile.fileSize,
                uploading: false,
              });
            }
          });
          return result;
        });
      } catch (err) {
        const serverErrorMessage =
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.response?.data?.error ||
          err.message;

        logger.error("[Composer Audit] File upload failed details:", {
          message: err.message,
          code: err.code,
          isAxiosError: err.isAxiosError,
          responseStatus: err.response?.status,
          responseData: err.response?.data,
          requestSent: !!err.request,
          requestUrl: err.config?.url,
          requestHeaders: err.config?.headers,
        });

        // Mark the failed files so user can remove them
        setPendingFiles((prev) =>
          prev.map((f) =>
            pickedFiles.some((p) => p.name === f.name) && !f._id
              ? { ...f, uploading: false, uploadFailed: true }
              : f,
          ),
        );
        Alert.alert(
          "Upload Failed",
          serverErrorMessage ? `Upload failed: ${serverErrorMessage}` : "Could not upload files. Please remove them and try again.",
        );
      }
    },
    [channelId],
  );

  const handleAttach = useCallback(() => {
    setShowMediaPicker(true);
  }, []);

  const handleFilesSelected = useCallback(
    async (pickedFiles) => {
      if (!pickedFiles || !pickedFiles.length) return;

      // Add local files as "uploading" pending entries
      const localEntries = pickedFiles.map((f) => ({
        name: f.name || f.fileName || f.filename || `file_${Date.now()}.jpg`,
        uploading: true,
        uploadFailed: false,
        _tempUri: f.uri, // Use URI as a reliable matching fallback
      }));
      setPendingFiles((prev) => [...prev, ...localEntries]);

      // Upload to server
      await uploadFilesToServer(pickedFiles, localEntries);
    },
    [uploadFilesToServer],
  );

  const removePendingFile = useCallback((index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

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
        onSend("", {
          contentType: type,
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
  }, [channelId, onSend]);

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
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerLabel, { color: colors.textSecondary }]}>
              {editingMessage
                ? "Editing message"
                : `Replying to ${replyingTo?.senderSnapshot?.name || replyingTo?.authorId?.name || "User"}`}
            </Text>
            <Text
              style={[styles.bannerText, { color: colors.textTertiary }]}
              numberOfLines={1}
            >
              {editingMessage?.content || replyingTo?.content || ""}
            </Text>
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

      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <View style={styles.pendingFilesRow}>
          {pendingFiles.map((file, i) => (
            <View
              key={i}
              style={[
                styles.pendingFileChip,
                { backgroundColor: colors.inputBackground },
                file.uploadFailed && {
                  borderColor: colors.error,
                  borderWidth: 1,
                },
              ]}
            >
              {file.uploading ? (
                <Loader2 size={12} color={colors.primary} />
              ) : file.uploadFailed ? (
                <X size={12} color={colors.error} />
              ) : (
                <FileText size={12} color={colors.textSecondary} />
              )}
              <Text
                style={[
                  styles.pendingFileName,
                  { color: colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {file.name}
                {file.uploading
                  ? " (uploading...)"
                  : file.uploadFailed
                    ? " (failed)"
                    : ""}
              </Text>
              <TouchableOpacity onPress={() => removePendingFile(i)}>
                <X size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

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

          <View style={styles.composerRow}>
            <View style={styles.sideButtons}>
              <TouchableOpacity style={styles.iconButton} onPress={handleAttach}>
                <Plus size={20} color={colors.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setShowToolbar((v) => !v)}
              >
                <CaseSensitive
                  size={18}
                  color={showToolbar ? colors.primary : colors.textSecondary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setShowEmojiPicker(true)}
              >
                <Smile size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View key="editor-wrapper" style={styles.editorSlot}>
              <ChatRichTextEditor
                ref={editorRef}
                placeholder={editingMessage ? 'Edit message...' : 'Message...'}
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

            <View style={styles.sideButtons}>
              {stripHtml(text).trim() || pendingFiles.length > 0 ? (
                <>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => setShowScheduleModal(true)}
                  >
                    <Clock size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.sendButton}
                    onPress={handleSend}
                    onLongPress={() => setShowScheduleModal(true)}
                    delayLongPress={500}
                  >
                    <Text
                      style={{
                        color: colors.primary,
                        fontWeight: 'bold',
                        fontSize: moderateScale(15),
                      }}
                    >
                      Send
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity style={styles.iconButton} onPress={() => setShowVideoModal(true)}>
                    <CameraIcon size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <AudioRecorderUI
                    isRecording={audioRecorder.isRecording}
                    isPaused={audioRecorder.isPaused}
                    recordingDuration={audioRecorder.recordingDuration}
                    onStart={audioRecorder.startRecording}
                    onPause={audioRecorder.pauseRecording}
                    onResume={audioRecorder.resumeRecording}
                    onStop={audioRecorder.stopRecording}
                    onCancel={audioRecorder.cancelRecording}
                    onSend={async (data) => {
                      let finalData = data;
                      if (!finalData && audioRecorder.recordingUri) {
                        finalData = { uri: audioRecorder.recordingUri, duration: audioRecorder.recordingDuration };
                      }
                      if (finalData) {
                        await handleMediaSend(finalData.uri, 'audio', finalData.duration);
                        audioRecorder.cancelRecording();
                      }
                    }}
                    colors={colors}
                  />
                </>
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

      {/* Emoji Picker */}
      <EmojiPickerModal
        visible={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={handleEmojiSelect}
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
          onSend('', {
            contentType: 'gif',
            gifMeta: gif,
            threadId: replyingTo?._id || null,
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
      flexDirection: 'row',
      alignItems: 'flex-end',
      borderRadius: moderateScale(24),
      borderWidth: 1,
      paddingHorizontal: moderateScale(4),
      minHeight: moderateScale(48),
      overflow: 'hidden',
    },
    inputContainerWithToolbar: {
      flexDirection: 'column',
      alignItems: 'stretch',
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
