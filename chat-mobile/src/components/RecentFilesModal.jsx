import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Image,
} from 'react-native';
import { X, FileText, Image as ImageIcon, Video, Music } from 'lucide-react-native';
import { fileAPI } from '../services/api';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


export default function RecentFilesModal({ visible, onClose, onSelectFile, colors }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      loadFiles();
    }
  }, [visible]);

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await fileAPI.listWorkspace({ limit: 50 });
      if (data.success && data.data) {
        setFiles(data.data.items || []);
      }
    } catch (e) {
      setError('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (mimeType) => {
    if (!mimeType) return FileText;
    if (mimeType.startsWith('image/')) return ImageIcon;
    if (mimeType.startsWith('video/')) return Video;
    if (mimeType.startsWith('audio/')) return Music;
    return FileText;
  };

  const renderItem = ({ item }) => {
    const Icon = getFileIcon(item.mimeType);
    return (
      <TouchableOpacity
        style={[styles.item, { borderBottomColor: colors.border }]}
        onPress={() => {
          onSelectFile(item);
          onClose();
        }}
      >
        <View style={[styles.iconContainer, { backgroundColor: colors.backgroundSecondary }]}>
          {item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
          ) : (
            <Icon size={20} color={colors.primary} />
          )}
        </View>
        <View style={styles.itemInfo}>
          <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.originalName || item.fileName || 'Unknown File'}
          </Text>
          <Text style={[styles.itemSub, { color: colors.textTertiary }]}>
            {new Date(item.uploadedAt).toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Recent Files</Text>
          <View style={{ width: scale(36) }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={{ color: colors.error }}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={files}
            keyExtractor={item => item._id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textTertiary }]}>
                No recent files found
              </Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: verticalScale(40) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingBottom: verticalScale(16),
    borderBottomWidth: 1,
  },
  closeBtn: { padding: moderateScale(4) },
  title: { fontSize: moderateScale(18), fontWeight: '700' },
  list: { paddingHorizontal: scale(16), paddingBottom: verticalScale(24) },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
  },
  iconContainer: {
    width: scale(40),
    height: verticalScale(40),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(12),
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: moderateScale(16), fontWeight: '500', marginBottom: verticalScale(2) },
  itemSub: { fontSize: moderateScale(12) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: verticalScale(40) },
});
