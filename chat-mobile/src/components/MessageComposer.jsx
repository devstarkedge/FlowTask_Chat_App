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
import { RichEditor, actions } from 'react-native-pell-rich-editor';
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
} from "lucide-react-native";
import logger from '../utils/logger';
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
import { pellToTipTap } from "../utils/formatConverter";

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
    const items = match.trim().split('\n').map(line => {
      const content = line.replace(/^[-*]\s+/, '');
      return `<li>${content}</li>`;
    }).join('');
    return `<ul>${items}</ul>`;
  });

  // Numbered list blocks (consecutive lines starting with digits)
  html = html.replace(/(?:^\d+\.\s+.*(?:\r?\n|$))+/gm, (match) => {
    const items = match.trim().split('\n').map(line => {
      const content = line.replace(/^\d+\.\s+/, '');
      return `<li>${content}</li>`;
    }).join('');
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
      const plainContent = rawHtml.replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, " ").trim();
      
      if (plainContent) {
        setDraft(
          channelId,
          rawHtml.includes('<') ? pellToTipTap(rawHtml) : markdownToHtml(rawHtml),
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
      const plainContent = val.replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, " ");
      
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
      const mentionText = `<strong>@${member.name}</strong>&nbsp;`;
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
    const plainContent = rawHtml.replace(/<[^>]*>?/gm, "").replace(/&nbsp;/g, " ").trim();

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

    const htmlContent = rawHtml.includes('<') ? pellToTipTap(rawHtml) : markdownToHtml(rawHtml);
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
      if (!text.trim() || !scheduledAt) return;

      const htmlContent = markdownToHtml(text);
      onSend(text.trim(), {
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

  // ─── Emoji select ─────────────────────────────────────────────────────────
  const handleEmojiSelect = useCallback(
    (emoji) => {
      onChangeText(text + emoji);
    },
    [text, onChangeText],
  );

  // ─── File attachment — pick and upload to server ──────────────────────────
  const uploadFilesToServer = useCallback(
    async (pickedFiles) => {
      try {
        const formData = new FormData();
        pickedFiles.forEach((file) => {
          // Normalize properties from various pickers (ImagePicker, DocumentPicker, MediaLibrary)
          let name = file.name || file.fileName || file.filename || `file_${Date.now()}.jpg`;
          if (!name.includes('.')) name += '.jpg';
          
          let type = file.mimeType || file.type;
          if (!type || type === 'image' || type === 'video' || type === 'application/octet-stream') {
            const ext = name.split('.').pop().toLowerCase();
            if (ext === 'jpg' || ext === 'jpeg') type = 'image/jpeg';
            else if (ext === 'png') type = 'image/png';
            else if (ext === 'gif') type = 'image/gif';
            else if (ext === 'webp') type = 'image/webp';
            else if (ext === 'mp4') type = 'video/mp4';
            else if (ext === 'pdf') type = 'application/pdf';
            else type = 'image/jpeg'; // Safe default for mobile uploads if completely unknown
          }
          
          formData.append("files", {
            uri: file.uri,
            name,
            type,
          });
        });

        const { data } = await fileAPI.uploadFiles(channelId, formData);
        const uploadedFiles = data.data?.files || [];

        // Replace pending local file entries with server file objects
        setPendingFiles((prev) => {
          const result = [...prev];
          uploadedFiles.forEach((serverFile) => {
            const localIdx = result.findIndex(
              (f) =>
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

  const handleFilesSelected = useCallback(async (pickedFiles) => {
    if (!pickedFiles || !pickedFiles.length) return;

    // Add local files as "uploading" pending entries
    const localEntries = pickedFiles.map((f) => ({
      name: f.name || "attachment",
      uploading: true,
      uploadFailed: false,
    }));
    setPendingFiles((prev) => [...prev, ...localEntries]);

    // Upload to server
    await uploadFilesToServer(pickedFiles);
  }, [uploadFilesToServer]);

  const removePendingFile = useCallback((index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

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
              borderLeftColor: editingMessage
                ? colors.warning
                : colors.primary,
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
            style={{ padding: 4 }}
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
            switch(format) {
              case 'bold': richText.current.sendAction(actions.setBold, 'result'); break;
              case 'italic': richText.current.sendAction(actions.setItalic, 'result'); break;
              case 'underline': richText.current.sendAction(actions.setUnderline, 'result'); break;
              case 'strikethrough': richText.current.sendAction(actions.setStrikethrough, 'result'); break;
              case 'unorderedList': richText.current.sendAction(actions.insertBulletsList, 'result'); break;
              case 'orderedList': richText.current.sendAction(actions.insertOrderedList, 'result'); break;
              case 'blockquote': richText.current.sendAction(actions.setBlockQuote, 'result'); break;
              case 'code': richText.current.sendAction(actions.code, 'result'); break;
              case 'codeBlock': richText.current.sendAction(actions.code, 'result'); break;
              case 'link': richText.current.sendAction(actions.insertLink, 'Add Link', 'https://'); break;
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
      <View style={[styles.inputBar, { backgroundColor: colors.background }]}>
        <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
          
          <TouchableOpacity style={styles.iconButton} onPress={handleAttach}>
            <Plus size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={() => setShowToolbar((v) => !v)}>
            <CaseSensitive size={18} color={showToolbar ? colors.primary : colors.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1, minHeight: 40, maxHeight: 120 }}>
            <RichEditor
              ref={richText}
              style={{ flex: 1 }}
              placeholder={editingMessage ? "Edit message..." : "Message..."}
              initialContentHTML={text}
              editorStyle={{
                backgroundColor: colors.inputBackground,
                color: colors.inputText,
                placeholderColor: colors.inputPlaceholder,
                contentCSSText: 'font-size: 15px; font-family: sans-serif;',
              }}
              onChange={(html) => {
                handleTextChange(html);
              }}
              editorInitializedCallback={() => setIsEditorReady(true)}
            />
          </View>

          <TouchableOpacity style={styles.iconButton} onPress={() => setShowEmojiPicker(true)}>
            <Smile size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          {text.trim() ? (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSend}
              onLongPress={() => setShowScheduleModal(true)}
              delayLongPress={500}
            >
              <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 15 }}>Send</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.iconButton}>
              <Mic size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

        </View>
      </View>

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
      />

      {/* Recent Canvases Modal */}
      <RecentCanvasesModal
        visible={showRecentCanvases}
        onClose={() => setShowRecentCanvases(false)}
        colors={colors}
        onSelectCanvas={(canvas) => {
          const md = `[📄 ${canvas.title || 'Untitled Canvas'}](/canvas/${canvas._id})`;
          onChangeText(text ? `${text}\n${md}` : md);
        }}
      />

      {/* Recent Files Modal */}
      <RecentFilesModal
        visible={showRecentFiles}
        onClose={() => setShowRecentFiles(false)}
        colors={colors}
        onSelectFile={(file) => {
          setPendingFiles((prev) => [...prev, {
            _id: file._id,
            name: file.originalName || file.fileName || file.name || 'Unknown',
            url: file.url || file.secureUrl,
            thumbnailUrl: file.thumbnailUrl,
            mimeType: file.mimeType,
            fileSize: file.fileSize,
            uploading: false,
          }]);
        }}
      />

      {/* GIF Picker Modal */}
      <GifPickerModal
        visible={showGifPicker}
        onClose={() => setShowGifPicker(false)}
        colors={colors}
        onSelectGif={(gif) => {
          const gifMarkdown = `![GIF](${gif.url})`;
          onChangeText(text ? `${text}\n${gifMarkdown}` : gifMarkdown);
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
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderLeftWidth: 3,
      gap: 8,
    },
    bannerLabel: {
      fontSize: 12,
      fontWeight: "600",
    },
    bannerText: {
      fontSize: 13,
      marginTop: 1,
    },
    pendingFilesRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 12,
      paddingVertical: 6,
      gap: 6,
    },
    pendingFileChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 4,
      maxWidth: 160,
    },
    pendingFileName: {
      fontSize: 12,
      flexShrink: 1,
    },
    inputBar: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      paddingBottom: 24, // safe area padding
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 24,
      borderWidth: 1,
      paddingHorizontal: 4,
      minHeight: 48,
    },
    iconButton: {
      padding: 8,
    },
    input: {
      flex: 1,
      fontSize: 16,
      maxHeight: 100,
      paddingVertical: Platform.OS === 'android' ? 6 : 8,
      paddingHorizontal: Platform.OS === 'android' ? 4 : 4,
      textAlignVertical: 'center',
      letterSpacing: 0,
      ...(Platform.OS === "web" && { outlineWidth: 0, outlineStyle: "none" }),
    },
    sendButton: {
      padding: 8,
      paddingHorizontal: 12,
    },
  });

export default MessageComposer;
