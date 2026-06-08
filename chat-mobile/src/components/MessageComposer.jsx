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
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Image,
} from "react-native";
import {
  Send,
  Image as ImageIcon,
  Smile,
  Clock,
  X,
  FileText,
  AtSign,
  CaseSensitive,
  Loader2,
} from "lucide-react-native";
import { useDraftStore } from "../stores/draftStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useScheduledStore } from "../stores/scheduledStore";
import { scheduledAPI, fileAPI } from "../services/api";
import { emitTyping } from "../services/socket";
import EmojiPickerModal from "./EmojiPickerModal";
import ScheduleModal from "./ScheduleModal";
import MentionDropdown from "./MentionDropdown";
import FormattingToolbar from "./FormattingToolbar";

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

  // Bullet list items (lines starting with - or *)
  html = html.replace(/^[-*]\s+(.*)$/gm, "<li>$1</li>");

  // Numbered list items
  html = html.replace(/^\d+\.\s+(.*)$/gm, "<li>$1</li>");

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
  const inputRef = useRef(null);

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
      if (text.trim()) {
        setDraft(
          channelId,
          markdownToHtml(text),
          text,
          activeWorkspaceId,
          null,
        );
        lastSavedRef.current = text.trim();
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

      // Detect @mention trigger
      const match = val.slice(0, val.length).match(/@([^\s@]*)$/);
      if (match) {
        setMentionQuery(match[1]);
        setMentionRangeStart(val.length - match[0].length);
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
      if (mentionRangeStart < 0) return;
      const before = text.slice(0, mentionRangeStart);
      const after = text.slice(text.length);
      const mentionText = `@${member.name}`;
      const newText = `${before}${mentionText} ${after}`;
      onChangeText(newText);
      setPendingMentions((prev) => [
        ...prev,
        { userId: member._id, username: member.name, type: "user" },
      ]);
      setMentionVisible(false);
      setMentionRangeStart(-1);
    },
    [text, mentionRangeStart, onChangeText],
  );

  // ─── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!text.trim()) return;

    // Filter to only successfully uploaded files
    const uploadedFiles = pendingFiles.filter((f) => f._id);
    if (
      pendingFiles.length > 0 &&
      uploadedFiles.length === 0 &&
      pendingFiles.some((f) => f.uploading)
    ) {
      return; // Still uploading, prevent send
    }

    const htmlContent = markdownToHtml(text);
    const mentionPayload =
      pendingMentions.length > 0 ? pendingMentions : undefined;

    onSend(text.trim(), {
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
          formData.append("files", {
            uri: file.uri,
            name: file.name,
            type: file.type || "application/octet-stream",
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
        console.error("[Composer] File upload failed:", err);
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

  const handleAttach = useCallback(async () => {
    let pickedFiles = [];
    try {
      const DocumentPicker = require("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        type: "*/*",
      });
      if (result.canceled) return;
      pickedFiles = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name || asset.fileName,
        type: asset.mimeType || asset.type,
        size: asset.size,
      }));
    } catch (err) {
      try {
        const ImagePicker = require("expo-image-picker");
        const result = await ImagePicker.launchImageLibraryAsync({
          allowsMultipleSelection: true,
          mediaTypes: ["images", "videos"],
        });
        if (result.canceled) return;
        pickedFiles = result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName || "image",
          type: asset.mimeType || "image/jpeg",
          size: asset.fileSize,
        }));
      } catch (innerErr) {
        Alert.alert(
          "Error",
          "Unable to pick files. Make sure expo-document-picker or expo-image-picker is installed.",
        );
        return;
      }
    }

    if (!pickedFiles.length) return;

    // Add local files as "uploading" pending entries
    const localEntries = pickedFiles.map((f) => ({
      name: f.name,
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
              backgroundColor: colors.cardBackground || colors.inputBackground,
              borderLeftColor: editingMessage
                ? colors.warning || "#e8c46a"
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
          text={text}
          onChangeText={onChangeText}
          colors={colors}
          selectionStart={selStart}
          selectionEnd={selEnd}
          onInsertMention={() => {
            const newText = text + "@";
            onChangeText(newText);
            setMentionRangeStart(newText.length - 1);
            setMentionQuery("");
            setMentionVisible(true);
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
                  borderColor: colors.error || "#e53935",
                  borderWidth: 1,
                },
              ]}
            >
              {file.uploading ? (
                <Loader2 size={12} color={colors.primary} />
              ) : file.uploadFailed ? (
                <X size={12} color={colors.error || "#e53935"} />
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
          { borderTopColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        <TouchableOpacity style={styles.iconButton} onPress={handleAttach}>
          <ImageIcon size={22} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Toolbar toggle */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setShowToolbar((v) => !v)}
        >
          <CaseSensitive
            size={20}
            color={showToolbar ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity>

        <View
          style={[
            styles.inputContainer,
            { backgroundColor: colors.inputBackground },
          ]}
        >
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.inputText }]}
            placeholder={editingMessage ? "Edit message..." : "Message..."}
            placeholderTextColor={colors.inputPlaceholder}
            value={text}
            onChangeText={handleTextChange}
            onSelectionChange={(e) => {
              const { start, end } = e.nativeEvent.selection;
              setSelStart(start);
              setSelEnd(end);
            }}
            multiline
          />
          <TouchableOpacity onPress={() => setShowEmojiPicker(true)}>
            <Smile size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: text.trim() ? colors.primary : colors.border },
          ]}
          onPress={handleSend}
          onLongPress={() => {
            if (text.trim()) setShowScheduleModal(true);
          }}
          disabled={!text.trim()}
          delayLongPress={500}
        >
          <Send size={18} color={colors.textInverse} />
        </TouchableOpacity>
      </View>

      {/* Emoji Picker */}
      <EmojiPickerModal
        visible={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={handleEmojiSelect}
        colors={colors}
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
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderTopWidth: 1,
      gap: 8,
    },
    iconButton: {
      padding: 8,
    },
    inputContainer: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    input: {
      flex: 1,
      fontSize: 15,
      maxHeight: 100,
      paddingVertical: 8,
      ...(Platform.OS === "web" && { outlineWidth: 0, outlineStyle: "none" }),
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
    },
  });

export default MessageComposer;
