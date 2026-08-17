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
import { getFileKind, getCleanFileName } from "../utils/mediaUtils";
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
  X,
} from "lucide-react-native";
import Toast from "react-native-toast-message";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import logger from '../utils/logger';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import { HeaderBackButton } from "../components/common";
import FileService from "../services/FileService";


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



export default function FilesScreen({ route, navigation }) {
  const { channelId, channelName } = route.params || {};
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [preview, setPreview] = useState(null);
  const [downloadingFiles, setDownloadingFiles] = useState({});
  const [copyingFiles, setCopyingFiles] = useState({});
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
      const msg = payload?.message || payload;
      if (!msg) return;
      const hasFiles =
        (msg.fileReferences && msg.fileReferences.length) ||
        (msg.attachments && msg.attachments.length);
      if (!hasFiles) return;
      if (channelId) {
        if (msg.channelId === channelId) loadFiles();
      } else {
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
      const kind = getFileKind(file.mimeType, file.fileName || file.originalName, url);
      if (kind === "image") {
        setPreview({ type: "image", src: url, file });
        return;
      }
      await FileService.previewFile(file, navigation, setPreview);
    } catch (err) {
      logger.error(err);
      Toast.show({ type: "error", text1: "Failed to open file" });
    }
  };

  const handleDownload = async (file) => {
    const fileId = file._id || file.id || String(Math.random());
    if (downloadingFiles[fileId]) return;

    setDownloadingFiles(prev => ({ ...prev, [fileId]: true }));
    try {
      const localUri = await FileService.downloadFile(file);
      await FileService.saveFile(file, localUri);
    } catch (err) {
      logger.error(err);
      Toast.show({ type: "error", text1: "Download failed" });
    } finally {
      setDownloadingFiles(prev => ({ ...prev, [fileId]: false }));
    }
  };

  const handleShare = async (file) => {
    try {
      const url = file.url || messageAPI.getFileProxyUrl(file._id);
      await Share.share({ message: `${file.fileName || file.originalName}\n${url}` });
    } catch (err) {
      logger.error(err);
      Toast.show({ type: "error", text1: "Share failed" });
    }
  };

  const handleCopyLink = async (file) => {
    const fileId = file._id || file.id || String(Math.random());
    const kind = getFileKind(file.mimeType, file.fileName || file.originalName, file.url);
    if (kind === "image") {
      if (copyingFiles[fileId]) return;
      setCopyingFiles(prev => ({ ...prev, [fileId]: true }));
      try {
        await FileService.copyImage(file);
      } catch (err) {
        logger.error(err);
        Toast.show({ type: "error", text1: "Copy failed" });
      } finally {
        setCopyingFiles(prev => ({ ...prev, [fileId]: false }));
      }
    } else {
      try {
        const url = file.url || messageAPI.getFileProxyUrl(file._id);
        if (!url) return Toast.show({ type: "error", text1: "No URL available" });
        await Clipboard.setStringAsync(url);
        Toast.show({ type: "success", text1: "Link copied" });
      } catch (err) {
        logger.error(err);
        Toast.show({ type: "error", text1: "Failed to copy link" });
      }
    }
  };

  const handleDelete = async (file) => {
    if (!channelId)
      return Alert.alert(
        "Delete not allowed",
        "Can only delete files from a channel context",
      );
    Alert.alert("Delete file", `Delete "${file.fileName || file.originalName}"?`, [
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
    const kind = getFileKind(f.mimeType, f.fileName || f.originalName, f.url);
    if (
      query &&
      !(
        (f.fileName || f.originalName || "").toLowerCase().includes(query.toLowerCase()) ||
        (f.uploadedBy?.name || "").toLowerCase().includes(query.toLowerCase())
      )
    )
      return false;
    if (filter === "all") return true;
    return kind === filter;
  });

  const renderItem = ({ item }) => {
    const kind = getFileKind(item.mimeType, item.fileName || item.originalName, item.url);
    const fileId = item._id || item.id || String(Math.random());
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
            {getCleanFileName(item.fileName || item.originalName)}
          </Text>
          <Text style={[styles.sub, { color: colors.textTertiary }]}>
            {item.uploadedBy?.name || "Unknown"} • {formatDate(item.uploadedAt)} {"\n"}
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
            disabled={!!downloadingFiles[fileId]}
          >
            {downloadingFiles[fileId] ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Download size={18} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleCopyLink(item)}
            style={styles.actionBtn}
            disabled={!!copyingFiles[fileId]}
          >
            {copyingFiles[fileId] ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Copy size={18} color={colors.textSecondary} />
            )}
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
        <HeaderBackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.title, { color: colors.textPrimary, marginLeft: scale(12), flex: 1 }]} numberOfLines={1} ellipsizeMode="tail">
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
          contentContainerStyle={{ padding: moderateScale(12), flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {query ? "No files match your search" : "No files have been sent yet"}
              </Text>
            </View>
          }
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
        <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top, paddingBottom: insets.bottom }}>
          {/* Header Row */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: verticalScale(50),
            paddingHorizontal: scale(16),
            borderBottomWidth: 1,
            borderBottomColor: '#222',
            backgroundColor: '#111',
          }}>
            <TouchableOpacity onPress={() => setPreview(null)} style={{ padding: moderateScale(8), minWidth: scale(44), alignItems: 'flex-start' }}>
              <X size={22} color="#fff" />
            </TouchableOpacity>
            
            <Text style={{ color: "#fff", fontSize: moderateScale(15), fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: scale(12) }} numberOfLines={1}>
              {preview?.file ? getCleanFileName(preview.file.fileName || preview.file.originalName) : 'Preview'}
            </Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: scale(44), justifyContent: 'flex-end' }}>
              <TouchableOpacity
                onPress={() => preview?.file && handleDownload(preview.file)}
                style={{ padding: moderateScale(8) }}
                disabled={preview?.file && downloadingFiles[preview.file._id || preview.file.id]}
              >
                {preview?.file && downloadingFiles[preview.file._id || preview.file.id] ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Download size={22} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Image content */}
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            {preview?.type === "image" && (
              <Image
                source={{ uri: preview.src }}
                style={{ width: '100%', height: '100%', resizeMode: "contain" }}
              />
            )}
          </View>
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: verticalScale(60),
  },
  emptyText: {
    fontSize: moderateScale(15),
    textAlign: "center",
  },
});
