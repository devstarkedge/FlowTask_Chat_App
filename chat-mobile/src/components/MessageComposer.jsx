/**
 * MessageComposer — enhanced mobile composer matching web app MessageInput features.
 *
 * Features:
 *  - Draft auto-save (800ms debounce)
 *  - Draft restore on channel change
 *  - Emoji picker (Smile button)
 *  - File attachment (attach button, uses expo-document-picker)
 *  - Reply mode banner
 *  - Edit mode banner
 *  - Schedule message (long-press send)
 *  - Typing indicators
 *
 * Props:
 *   channelId       – current channel _id
 *   channelName     – channel display name
 *   workspaceId     – current workspace _id
 *   colors          – theme colors
 *   onSend          – (content, options) => void
 *   replyingTo      – message object or null
 *   editingMessage  – message object or null
 *   onCancelReply   – () => void
 *   onCancelEdit    – () => void
 *   onChangeText    – (text) => void
 *   text            – current input text
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { RichEditor, actions } from "react-native-pell-rich-editor";
import {
  View,
  Text,
  Keyboard,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Image,
  Dimensions,
  Animated,
  PanResponder,
  useWindowDimensions,
} from "react-native";
import {
  Send,
  Plus,
  Smile,
  Clock,
  X,
  FileText,
  AtSign,
  CaseSensitive,
  Loader2,
  Mic,
  Camera as CameraIcon,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import logger from "../utils/logger";
import { useDraftStore } from "../stores/draftStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useScheduledStore } from "../stores/scheduledStore";
import { scheduledAPI, fileAPI } from "../services/api";
import { emitTyping } from "../services/socket";
import EmojiPickerModal from "./EmojiPickerModal";
import ScheduleModal from "./ScheduleModal";
import MentionDropdown from "./MentionDropdown";
import FormattingToolbar from "./FormattingToolbar";
import MediaPickerSheet from "./MediaPickerSheet";
import GifPickerModal from "./GifPickerModal";
import RecentCanvasesModal from "./RecentCanvasesModal";
import RecentFilesModal from "./RecentFilesModal";
import AudioRecorderUI from "./AudioRecorderUI";
import VideoRecorderModal from "./VideoRecorderModal";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useVideoRecorder } from "../hooks/useVideoRecorder";
import { pellToTipTap } from "../utils/formatConverter";
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

  // Wrap paragraphs
  html = html
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (/^<(pre|blockquote|li|hr)/.test(trimmed)) return trimmed;
      // Wrap consecutive <li> in <ul>
      if (trimmed.includes("<li>")) return `<ul>${trimmed}</ul>`;
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .filter(Boolean)
    .join("\n");

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
  const [mentionRangeStart, setMentionRangeStart] = useState(-1);
  const [pendingMentions, setPendingMentions] = useState([]);
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
  const draftTimerRef = useRef(null);
  const lastSavedRef = useRef("");
  const richText = useRef(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [editorHeight, setEditorHeight] = useState(40);
  const insets = useSafeAreaInsets();
  
  const audioRecorder = useAudioRecorder();
  const videoRecorder = useVideoRecorder();
  const [showVideoModal, setShowVideoModal] = useState(false);

  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const isTablet = screenWidth >= 600;

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState(verticalScale(60));

  const isExpandedRef = useRef(false);
  isExpandedRef.current = isExpanded;

  const collapsedHeightRef = useRef(verticalScale(60));
  collapsedHeightRef.current = collapsedHeight;

  const screenPhysicalHeight = Dimensions.get('screen').height;
  // If the window dimensions height is smaller than the physical screen height by at least 150px,
  // it means the window has already resized (shrunk) to accommodate the keyboard.
  const hasResizedForKeyboard = (screenPhysicalHeight - screenHeight) > 150;
  
  // If the window has already resized, we don't subtract keyboardHeight again (resizing handles it).
  // Otherwise, we subtract keyboardHeight to avoid covering the keyboard.
  const activeKeyboardOffset = hasResizedForKeyboard ? 0 : keyboardHeight;

  // Visible height above keyboard, subtracting status bar / safe area / header (~60px)
  const visibleHeight = screenHeight - activeKeyboardOffset - insets.top - (Platform.OS === 'ios' ? 44 : 56);
  const maxExpandedHeight = visibleHeight * (isTablet ? 0.65 : 0.85);

  const maxExpandedHeightRef = useRef(maxExpandedHeight);
  maxExpandedHeightRef.current = maxExpandedHeight;

  const maxComposerHeight = Math.floor(screenHeight * 0.3);

  const dragStartY = useRef(0);
  const animatedHeight = useRef(new Animated.Value(verticalScale(60))).current;
  const isAnimating = useRef(false);

  const collapseComposer = useCallback((dismissKeyboard = false) => {
    isAnimating.current = true;
    Animated.spring(animatedHeight, {
      toValue: collapsedHeightRef.current,
      useNativeDriver: false,
      tension: 40,
      friction: 7,
    }).start(() => {
      setIsExpanded(false);
      setIsDragging(false);
      isAnimating.current = false;
      if (dismissKeyboard) {
        Keyboard.dismiss();
      }
    });
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: (evt, gestureState) => {
        setIsDragging(true);
        const currentHeight = isExpandedRef.current ? maxExpandedHeightRef.current : collapsedHeightRef.current;
        animatedHeight.setValue(currentHeight);
        dragStartY.current = currentHeight;
      },
      onPanResponderMove: (evt, gestureState) => {
        let newHeight = dragStartY.current - gestureState.dy;
        const cHeight = collapsedHeightRef.current;
        const mHeight = maxExpandedHeightRef.current;
        if (newHeight < cHeight) newHeight = cHeight;
        if (newHeight > mHeight) newHeight = mHeight;
        animatedHeight.setValue(newHeight);
      },
      onPanResponderRelease: (evt, gestureState) => {
        setIsDragging(false);
        const currentHeight = dragStartY.current - gestureState.dy;
        const cHeight = collapsedHeightRef.current;
        const mHeight = maxExpandedHeightRef.current;
        const threshold = cHeight + (mHeight - cHeight) * 0.25;
        
        isAnimating.current = true;
        if (gestureState.vy < -0.5 || currentHeight > threshold) {
          Animated.spring(animatedHeight, {
            toValue: mHeight,
            useNativeDriver: false,
            tension: 40,
            friction: 7,
          }).start(() => {
            setIsExpanded(true);
            isAnimating.current = false;
          });
        } else {
          Animated.spring(animatedHeight, {
            toValue: cHeight,
            useNativeDriver: false,
            tension: 40,
            friction: 7,
          }).start(() => {
            setIsExpanded(false);
            isAnimating.current = false;
            Keyboard.dismiss();
          });
        }
      },
    })
  ).current;

  const handleComposerLayout = useCallback((event) => {
    if (!isExpanded && !isDragging && !isAnimating.current) {
      const height = event.nativeEvent.layout.height;
      if (height > 0) {
        setCollapsedHeight(height);
        animatedHeight.setValue(height);
      }
    }
  }, [isExpanded, isDragging]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardVisible(true);
        if (e && e.endCoordinates) {
          setKeyboardHeight(e.endCoordinates.height);
        }
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [collapseComposer]);

  // Keep composer size in sync with visible height adjustments when keyboard state changes
  useEffect(() => {
    if (isExpanded && !isDragging && !isAnimating.current) {
      Animated.spring(animatedHeight, {
        toValue: maxExpandedHeight,
        useNativeDriver: false,
        tension: 40,
        friction: 7,
      }).start();
    }
  }, [maxExpandedHeight, isExpanded]);

  const bottomPadding = isKeyboardVisible
    ? Platform.OS === "ios"
      ? 8
      : 8
    : Math.max(insets.bottom, 8);

  const activeWorkspaceId =
    workspaceId || useWorkspaceStore.getState().activeWorkspaceId;

  // ─── Draft restore on channel change ─────────────────────────────────────
  useEffect(() => {
    if (editingMessage) {
      onChangeText(editingMessage.content || "");
      return;
    }

    const draft = getDraft(channelId, activeWorkspaceId, null);
    if (draft?.text) {
      onChangeText(draft.text);
    } else {
      onChangeText("");
    }
  }, [channelId, editingMessage]);

  // ─── Draft auto-save (800ms debounce) ──────────────────────────────────────
  useEffect(() => {
    if (editingMessage) return; // Don't auto-save while editing

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);

    const signature = text.trim();
    if (signature === lastSavedRef.current) return;

    draftTimerRef.current = setTimeout(() => {
      const rawHtml = text;
      const plainContent = rawHtml
        .replace(/<[^>]*>?/gm, "")
        .replace(/&nbsp;/g, " ")
        .trim();

      if (plainContent) {
        setDraft(
          channelId,
          rawHtml.includes("<")
            ? pellToTipTap(rawHtml)
            : markdownToHtml(rawHtml),
          plainContent,
          activeWorkspaceId,
          null,
        );
        lastSavedRef.current = plainContent;
      } else {
        clearDraft(channelId, activeWorkspaceId, null);
        lastSavedRef.current = "";
      }
    }, 800);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [text, channelId, editingMessage, activeWorkspaceId]);

  // ─── Typing indicators ─────────────────────────────────────────────────────
  const handleTextChange = useCallback(
    (val) => {
      onChangeText(val);
      emitTyping(channelId, val.length > 0);

      // Strip HTML to get raw text cursor context
      const plainContent = val
        .replace(/<[^>]*>?/gm, "")
        .replace(/&nbsp;/g, " ");

      // Detect @mention trigger
      const match = plainContent.match(/@([^\s@]*)$/);
      if (match) {
        setMentionQuery(match[1]);
        // For HTML, accurate range is hard. We can just append the mention string at the end.
        setMentionRangeStart(val.length - 1);
        setMentionVisible(true);
      } else {
        setMentionVisible(false);
      }
    },
    [channelId, onChangeText],
  );

  // ─── Mention select ───────────────────────────────────────────────────────
  const handleMentionSelect = useCallback(
    (member) => {
      // It's tricky to remove the typed query safely in HTML string, so we'll
      // replace the last @... pattern in the rawHtml.
      const rawHtml = text;
      const mentionText = `<span data-type="mention" class="mention" data-id="${member._id}">@${member.name}</span>&nbsp;`;
      const newText = rawHtml.replace(/@([^\s@<]*)(?!.*@)/, mentionText);

      onChangeText(newText);
      richText.current?.setContentHTML(newText);

      setPendingMentions((prev) => [
        ...prev,
        { userId: member._id, username: member.name, type: "user" },
      ]);
      setMentionVisible(false);
      setMentionRangeStart(-1);
    },
    [text, mentionRangeStart, onChangeText],
  );

  useEffect(() => {
    if (text === "" && isEditorReady && richText.current) {
      richText.current?.setContentHTML("");
    }
  }, [text, isEditorReady]);

  useEffect(() => {
    if (editingMessage && isEditorReady && richText.current) {
      richText.current?.setContentHTML(text);
    }
  }, [editingMessage, isEditorReady]);

  // ─── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const rawHtml = text;
    // Strip simple HTML tags for plain text fallback
    const plainContent = rawHtml
      .replace(/<[^>]*>?/gm, "")
      .replace(/&nbsp;/g, " ")
      .trim();

    if (!plainContent && pendingFiles.length === 0) return;

    // Filter to only successfully uploaded files
    const uploadedFiles = pendingFiles.filter((f) => f._id);
    if (
      pendingFiles.length > 0 &&
      uploadedFiles.length === 0 &&
      pendingFiles.some((f) => f.uploading)
    ) {
      return; // Still uploading, prevent send
    }

    const htmlContent = rawHtml.includes("<")
      ? pellToTipTap(rawHtml)
      : markdownToHtml(rawHtml);
    const mentionPayload =
      pendingMentions.length > 0 ? pendingMentions : undefined;

    onSend(plainContent, {
      htmlContent,
      threadId: replyingTo?._id || null,
      fileReferences: uploadedFiles.map((f) => f._id),
      mentions: mentionPayload,
    });

    onChangeText("");
    setPendingFiles([]);
    setPendingMentions([]);
    clearDraft(channelId, activeWorkspaceId, null);
    lastSavedRef.current = "";
    emitTyping(channelId, false);
    collapseComposer();
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
    collapseComposer,
  ]);

  // ─── Schedule send ─────────────────────────────────────────────────────────
  const handleScheduleSend = useCallback(
    (scheduledAt) => {
      const rawHtml = text;
      const plainContent = rawHtml
        .replace(/<[^>]*>?/gm, "")
        .replace(/&nbsp;/g, " ")
        .trim();

      if (!scheduledAt || (!plainContent && pendingFiles.length === 0)) return;

      const htmlContent = rawHtml.includes("<")
        ? pellToTipTap(rawHtml)
        : markdownToHtml(rawHtml);
      onSend(plainContent, {
        htmlContent,
        scheduledAt,
        fileReferences: pendingFiles.filter((f) => f._id).map((f) => f._id),
      });

      onChangeText("");
      setPendingFiles([]);
      setPendingMentions([]);
      clearDraft(channelId, activeWorkspaceId, null);
      lastSavedRef.current = "";
      setShowScheduleModal(false);
      collapseComposer();
    },
    [
      text,
      onSend,
      pendingFiles,
      channelId,
      activeWorkspaceId,
      clearDraft,
      onChangeText,
      collapseComposer,
    ],
  );

  // ─── Emoji select ─────────────────────────────────────────────────────────
  const handleEmojiSelect = useCallback(
    (emoji) => {
      onChangeText(text + emoji);
    },
    [text, onChangeText],
  );

  // ─── File attachment — pick and upload to server ──────────────────────────
  const uploadFilesToServer = useCallback(
    async (pickedFiles, localEntries) => {
      try {
        const formData = new FormData();
        pickedFiles.forEach((file, index) => {
          // Use the exact name resolved in localEntries
          let name = localEntries[index].name;
          if (!name.includes(".")) name += ".jpg";

          let type = file.mimeType || file.type;
          if (
            !type ||
            type === "image" ||
            type === "video" ||
            type === "application/octet-stream"
          ) {
            const ext = name.split(".").pop().toLowerCase();
            if (ext === "jpg" || ext === "jpeg") type = "image/jpeg";
            else if (ext === "png") type = "image/png";
            else if (ext === "gif") type = "image/gif";
            else if (ext === "webp") type = "image/webp";
            else if (ext === "mp4") type = "video/mp4";
            else if (ext === "pdf") type = "application/pdf";
            else type = "image/jpeg"; // Safe default for mobile uploads if completely unknown
          }

          formData.append("files", {
            uri:
              Platform.OS === "ios"
                ? file.uri.replace("file://", "")
                : file.uri,
            name,
            type,
          });
        });

        const { data } = await fileAPI.uploadFiles(channelId, formData);
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
        logger.error("[Composer] File upload failed:", err);
        // Mark the failed files so user can remove them
        setPendingFiles((prev) =>
          prev.map((f) =>
            pickedFiles.some((p) => p.name === f.name) && !f._id
              ? { ...f, uploading: false, uploadFailed: true }
              : f,
          ),
        );
        Alert.alert(
          "Upload failed",
          "Could not upload files. Please remove them and try again.",
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
      const formData = new FormData();
      formData.append("files", {
        uri: Platform.OS === "ios" ? uri.replace("file://", "") : uri,
        name: file.name,
        type: file.type,
      });

      const { data } = await fileAPI.uploadFiles(channelId, formData);
      // Access uploaded file correctly:
      const uploadedFile = data?.data?.files?.[0] || data?.data?.[0] || data?.files?.[0];
      const fileId = uploadedFile?._id || uploadedFile?.id;
      
      if (fileId) {
        setPendingFiles(prev => prev.filter(f => f._tempUri !== uri));
        onSend("", {
          contentType: type,
          fileReferences: [fileId],
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

  const styles = createStyles(colors);

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

      {/* Mention Dropdown */}
      {mentionVisible && members.length > 0 && (
        <MentionDropdown
          members={members}
          query={mentionQuery}
          onSelect={handleMentionSelect}
          onClose={() => setMentionVisible(false)}
          colors={colors}
        />
      )}

      {/* Formatting Toolbar */}
      {showToolbar && (
        <FormattingToolbar
          colors={colors}
          onInsertMention={() => {
            const newText = text + "@";
            onChangeText(newText);
            setMentionRangeStart(newText.length - 1);
            setMentionQuery("");
            setMentionVisible(true);
          }}
          onFormat={(format) => {
            if (!richText.current) return;
            switch (format) {
              case "bold":
                richText.current.sendAction(actions.setBold, "result");
                break;
              case "italic":
                richText.current.sendAction(actions.setItalic, "result");
                break;
              case "underline":
                richText.current.sendAction(actions.setUnderline, "result");
                break;
              case "strikethrough":
                richText.current.sendAction(actions.setStrikethrough, "result");
                break;
              case "unorderedList":
                richText.current.sendAction(
                  actions.insertBulletsList,
                  "result",
                );
                break;
              case "orderedList":
                richText.current.sendAction(
                  actions.insertOrderedList,
                  "result",
                );
                break;
              case "blockquote":
                richText.current.sendAction(actions.setBlockQuote, "result");
                break;
              case "code":
                richText.current.sendAction(actions.code, "result");
                break;
              case "codeBlock":
                richText.current.sendAction(actions.code, "result");
                break;
              case "link":
                richText.current.sendAction(
                  actions.insertLink,
                  "Add Link",
                  "https://",
                );
                break;
            }
          }}
        />
      )}

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
      <Animated.View
        onLayout={handleComposerLayout}
        style={[
          styles.inputBar,
          { backgroundColor: colors.background, paddingBottom: bottomPadding },
          (isExpanded || isDragging) ? { height: animatedHeight } : null,
        ]}
      >
        {/* Top Drag Handle */}
        <View
          {...panResponder.panHandlers}
          style={styles.dragHandleContainer}
        >
          <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
        </View>

        <View
          style={[
            styles.inputContainer,
            (isExpanded || isDragging) ? styles.inputContainerExpanded : { alignItems: "flex-end" },
            {
              borderColor: colors.border,
              backgroundColor: colors.inputBackground,
            },
          ]}
        >
          {audioRecorder.isRecording || audioRecorder.isPaused || audioRecorder.recordingUri ? (
            <AudioRecorderUI
              isRecording={audioRecorder.isRecording}
              isPaused={audioRecorder.isPaused}
              recordingDuration={audioRecorder.recordingDuration}
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
          ) : (
            <>
              {/* Left Buttons (only when collapsed) */}
              {!(isExpanded || isDragging) && (
                <>
                  <TouchableOpacity style={[styles.iconButton, { marginBottom: verticalScale(4) }]} onPress={handleAttach}>
                    <Plus size={20} color={colors.textSecondary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.iconButton, { marginBottom: verticalScale(4) }]}
                    onPress={() => setShowToolbar((v) => !v)}
                  >
                    <CaseSensitive
                      size={18}
                      color={showToolbar ? colors.primary : colors.textSecondary}
                    />
                  </TouchableOpacity>
                </>
              )}

              {/* Editor wrapper - always mounted with a stable key to preserve focus and typed text */}
              <View 
                key="editor-wrapper"
                style={(isExpanded || isDragging) ? { flex: 1, width: '100%' } : { flex: 1, minHeight: verticalScale(40), height: Math.min(maxComposerHeight, Math.max(verticalScale(40), editorHeight)) }}
              >
                <RichEditor
                  ref={richText}
                  useContainer={false}
                  onHeightChange={(height) => setEditorHeight(height)}
                  style={{ flex: 1 }}
                  scrollEnabled={isExpanded || isDragging || editorHeight >= maxComposerHeight}
                  placeholder={(isExpanded || isDragging) ? "Jot something down" : (editingMessage ? "Edit message..." : "Message...")}
                  initialContentHTML={text}
                  editorStyle={{
                    backgroundColor: colors.inputBackground,
                    color: colors.inputText,
                    placeholderColor: colors.inputPlaceholder,
                    contentCSSText: "font-size: 15px; font-family: sans-serif; overflow-y: auto !important; body { margin: 0 !important; padding: 0 !important; padding-top: 0px !important; } p { margin-top: 0px !important; margin-bottom: 0px !important; line-height: 1.4 !important; } ul, ol { padding-left: 24px !important; margin: 0 !important; margin-top: 4px !important; margin-bottom: 4px !important; } li { margin: 0 !important; padding: 0 !important; list-style-position: outside !important; }",
                  }}
                  onChange={(html) => {
                    handleTextChange(html);
                  }}
                  editorInitializedCallback={() => setIsEditorReady(true)}
                />
              </View>

              {/* Right Buttons (only when collapsed) */}
              {!(isExpanded || isDragging) && (
                <>
                  {stripHtml(text) || pendingFiles.length > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(4) }}>
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
                            fontWeight: "bold",
                            fontSize: moderateScale(15),
                          }}
                        >
                          Send
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(4) }}>
                      <TouchableOpacity style={styles.iconButton} onPress={() => setShowVideoModal(true)}>
                        <CameraIcon size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconButton} onPress={audioRecorder.startRecording}>
                        <Mic size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}

              {/* Bottom Toolbar Row (only when expanded) */}
              {(isExpanded || isDragging) && (
                <>
                  <View style={[styles.toolbarDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.expandedToolbar}>
                    <View style={styles.expandedToolbarLeft}>
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

                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => {
                          const newText = text + "@";
                          onChangeText(newText);
                          setMentionRangeStart(newText.length - 1);
                          setMentionQuery("");
                          setMentionVisible(true);
                        }}
                      >
                        <AtSign size={20} color={colors.textSecondary} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => setShowRecentCanvases(true)}
                      >
                        <FileText size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={styles.iconButton} onPress={handleSend}>
                      <Send size={20} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </Animated.View>

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

const createStyles = (colors) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(8),
      borderLeftWidth: 3,
      gap: 8,
    },
    bannerLabel: {
      fontSize: moderateScale(12),
      fontWeight: "600",
    },
    bannerText: {
      fontSize: moderateScale(13),
      marginTop: verticalScale(1),
    },
    pendingFilesRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(6),
      gap: 6,
    },
    pendingFileChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: scale(8),
      paddingVertical: verticalScale(4),
      borderRadius: moderateScale(12),
      gap: 4,
      maxWidth: scale(160),
    },
    pendingFileName: {
      fontSize: moderateScale(12),
      flexShrink: 1,
    },
    inputBar: {
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    inputContainer: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: moderateScale(24),
      borderWidth: 1,
      paddingHorizontal: scale(4),
      minHeight: verticalScale(48),
    },
    dragHandleContainer: {
      alignItems: "center",
      paddingVertical: verticalScale(6),
      width: "100%",
    },
    dragHandle: {
      width: scale(36),
      height: verticalScale(5),
      borderRadius: moderateScale(3),
    },
    inputContainerExpanded: {
      flex: 1,
      flexDirection: "column",
      alignItems: "stretch",
      borderRadius: moderateScale(16),
      padding: moderateScale(8),
    },
    toolbarDivider: {
      height: 1,
      width: "100%",
      marginVertical: verticalScale(8),
    },
    expandedToolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: scale(4),
      width: "100%",
    },
    expandedToolbarLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(10),
    },
    iconButton: {
      padding: moderateScale(8),
    },
    input: {
      flex: 1,
      fontSize: moderateScale(16),
      maxHeight: verticalScale(100),
      paddingVertical: Platform.OS === "android" ? 6 : 8,
      paddingHorizontal: Platform.OS === "android" ? 4 : 4,
      textAlignVertical: "center",
      letterSpacing: 0,
      ...(Platform.OS === "web" && { outlineWidth: 0, outlineStyle: "none" }),
    },
    sendButton: {
      padding: moderateScale(8),
      paddingHorizontal: scale(12),
    },
  });

export default MessageComposer;
