import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
  TextInput,
  Linking,
  Share,
  Alert,
  Platform,
} from "react-native";
import { fileAPI, messageAPI } from "../services/api";
import { getSocket } from "../services/socket";
import { useThemeStore } from "../stores/themeStore";
import {
  FileText,
  Copy,
  Video,
  Download,
  Trash2,
  Share2,
  Search,
  CircleChevronLeft,
} from "lucide-react-native";
import Toast from "react-native-toast-message";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { downloadAndSaveFile } from "../utils/fileDownload";
import logger from '../utils/logger';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0,
    value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString();
}

function getFileKind(mimeType = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

export default function FilesScreen({ route, navigation }) {
  const { channelId, channelName } = route.params || {};
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [preview, setPreview] = useState(null);
  const socketRef = useRef(null);

  const loadFiles = useCallback(async () => {
    try {
      setIsLoading(true);
      let res;
      if (channelId) {
        res = await fileAPI.listByChannel(channelId, { limit: 200 });
      } else {
        res = await fileAPI.listWorkspace({ limit: 200 });
      }
      const items = res?.data?.data?.items || res?.data?.items || [];
      setFiles(items);
    } catch (err) {
      logger.error(
        "Failed to load files",
        err?.response?.data || err?.message || err,
      );
      Toast.show({ type: "error", text1: "Failed to load files" });
    } finally {
      setIsLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    if (!socket) return;

    const handler = (payload) => {
      // If a message contains fileReferences / attachments, refresh relevant list
      const msg = payload?.message || payload;
      if (!msg) return;
      const hasFiles =
        (msg.fileReferences && msg.fileReferences.length) ||
        (msg.attachments && msg.attachments.length);
      if (!hasFiles) return;
      // If viewing channel-specific files only update for that channel
      if (channelId) {
        if (msg.channelId === channelId) loadFiles();
      } else {
        // workspace-wide view — refresh
        loadFiles();
      }
    };

    socket.on("message:create", handler);
    return () => socket.off("message:create", handler);
  }, [channelId, loadFiles]);

  const handleOpen = async (file) => {
    try {
      const url = file.url || messageAPI.getFileProxyUrl(file._id);
      if (!url) return Toast.show({ type: "error", text1: "No URL available" });
      // For images show internal preview
      if (getFileKind(file.mimeType) === "image") {
        setPreview({ type: "image", src: url, file });
        return;
      }
      // Otherwise open externally
      const supported = await Linking.canOpenURL(url);
      if (supported) Linking.openURL(url);
      else Toast.show({ type: "error", text1: "Cannot open file" });
    } catch (err) {
      logger.error(err);
      Toast.show({ type: "error", text1: "Failed to open file" });
    }
  };

  const handleDownload = async (file) => {
    try {
      const url = file.url || messageAPI.getFileProxyUrl(file._id);
      if (!url)
        return Toast.show({ type: "error", text1: "No URL to download" });
      await downloadAndSaveFile(url, file.fileName || 'download', file.mimeType);
    } catch (err) {
      logger.error(err);
      Toast.show({ type: "error", text1: "Download failed" });
    }
  };

  const handleShare = async (file) => {
    try {
      const url = file.url || messageAPI.getFileProxyUrl(file._id);
      await Share.share({ message: `${file.fileName}\n${url}` });
    } catch (err) {
      logger.error(err);
      Toast.show({ type: "error", text1: "Share failed" });
    }
  };

  const handleCopyLink = async (file) => {
    try {
      const url = file.url || messageAPI.getFileProxyUrl(file._id);
      if (!url) return Toast.show({ type: "error", text1: "No URL available" });
      await Clipboard.setStringAsync(url);
      Toast.show({ type: "success", text1: "Link copied" });
    } catch (err) {
      logger.error(err);
      Toast.show({ type: "error", text1: "Failed to copy link" });
    }
  };

  const handleDelete = async (file) => {
    if (!channelId)
      return Alert.alert(
        "Delete not allowed",
        "Can only delete files from a channel context",
      );
    Alert.alert("Delete file", `Delete "${file.fileName}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await fileAPI.deleteFromChannel(channelId, file._id);
            setFiles((prev) =>
              prev.filter((f) => f.referenceId !== file.referenceId),
            );
            Toast.show({ type: "success", text1: "File removed" });
          } catch (err) {
            logger.error(err);
            Toast.show({ type: "error", text1: "Failed to delete" });
          }
        },
      },
    ]);
  };

  const filtered = files.filter((f) => {
    const kind = getFileKind(f.mimeType);
    if (
      query &&
      !(
        (f.fileName || "").toLowerCase().includes(query.toLowerCase()) ||
        (f.uploadedBy?.name || "").toLowerCase().includes(query.toLowerCase())
      )
    )
      return false;
    if (filter === "all") return true;
    return kind === filter;
  });

  const renderItem = ({ item }) => {
    const kind = getFileKind(item.mimeType);
    return (
      <View style={[styles.row, { backgroundColor: colors.card }]}>
        <TouchableOpacity style={styles.thumb} onPress={() => handleOpen(item)}>
          {kind === "image" && item.thumbnailUrl ? (
            <Image
              source={{ uri: item.thumbnailUrl || item.url }}
              style={styles.imageThumb}
            />
          ) : (
            <View style={styles.fileIcon}>
              <FileText size={28} color={colors.textSecondary} />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.meta}>
          <Text
            style={[styles.name, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {item.fileName}
          </Text>
          <Text style={[styles.sub, { color: colors.textTertiary }]}>
            {item.uploadedBy?.name || "Unknown"} • {formatDate(item.uploadedAt)}{" "}
            • {formatSize(item.fileSize)}
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => handleShare(item)}
            style={styles.actionBtn}
          >
            <Share2 size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDownload(item)}
            style={styles.actionBtn}
          >
            <Download size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleCopyLink(item)}
            style={styles.actionBtn}
          >
            <Copy size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            style={styles.actionBtn}
          >
            <Trash2 size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.border,
            backgroundColor: colors.backgroundSecondary,
            paddingTop: verticalScale(8),
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.back}
        >
          <Text style={{ color: colors.primary }}>
            <CircleChevronLeft
              size={28}
              color={colors.primary}
              strokeWidth={2}
            />
          </Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {channelName ? `${channelName} — Files` : "Files"}
        </Text>
      </View>

      <View style={[styles.searchRow, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.searchInput,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.border,
            },
          ]}
        >
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            placeholder="Search files"
            placeholderTextColor={colors.inputPlaceholder}
            value={query}
            onChangeText={setQuery}
            style={{ flex: 1, color: colors.inputText, marginLeft: scale(8) }}
          />
        </View>
      </View>

      <View style={[styles.filterRow, { backgroundColor: colors.background }]}>
        {["all", "image", "video", "audio", "file"].map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.pill,
              filter === f && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={{
                color: filter === f ? "#fff" : colors.textSecondary,
                fontWeight: "700",
              }}
            >
              {f === "file"
                ? "Docs"
                : f === "image"
                  ? "Images"
                  : f === "all"
                    ? "All"
                    : f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: verticalScale(30) }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.referenceId || item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: moderateScale(12) }}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
        />
      )}

      {/* Image preview modal */}
      <Modal
        visible={!!preview}
        animationType="slide"
        onRequestClose={() => setPreview(null)}
      >
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <TouchableOpacity
            style={{ padding: moderateScale(12) }}
            onPress={() => setPreview(null)}
          >
            <Text style={{ color: "#fff" }}>Close</Text>
          </TouchableOpacity>
          {preview?.type === "image" && (
            <Image
              source={{ uri: preview.src }}
              style={{ flex: 1, resizeMode: "contain" }}
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: moderateScale(12),
    borderBottomWidth: 1,
  },
  back: { padding: moderateScale(6) },
  title: { fontSize: moderateScale(16), fontWeight: "700", marginLeft: scale(12) },
  searchRow: { padding: moderateScale(12) },
  searchInput: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: moderateScale(12),
    padding: moderateScale(8),
    borderWidth: 1,
  },
  filterRow: { flexDirection: "row", paddingHorizontal: scale(12), gap: 8 },
  pill: {
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(10),
    borderRadius: moderateScale(999),
    marginRight: scale(8),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: moderateScale(10),
    borderRadius: moderateScale(10),
    marginBottom: verticalScale(10),
  },
  thumb: {
    width: scale(64),
    height: verticalScale(64),
    borderRadius: moderateScale(8),
    overflow: "hidden",
    backgroundColor: "#222",
    justifyContent: "center",
    alignItems: "center",
  },
  imageThumb: { width: "100%", height: "100%", resizeMode: "cover" },
  meta: { flex: 1, paddingHorizontal: scale(10) },
  name: { fontSize: moderateScale(14), fontWeight: "700" },
  sub: { fontSize: moderateScale(12), marginTop: verticalScale(4) },
  actions: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionBtn: { padding: moderateScale(6), marginLeft: scale(6) },
});
