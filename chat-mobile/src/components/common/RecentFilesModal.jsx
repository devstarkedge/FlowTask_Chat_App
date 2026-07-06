import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import { X, FileText, Image as ImageIcon, Video, Music, Archive } from 'lucide-react-native';
import { fileAPI } from '../../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function getFileIcon(mimeType) {
  if (!mimeType) return FileText;
  if (mimeType.startsWith('image/')) return ImageIcon;
  if (mimeType.startsWith('video/')) return Video;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return Archive;
  return FileText;
}

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
      // limit=30 fetches the 30 most recent files
      const res = await fileAPI.listWorkspace({ limit: 30 });
      if (res.data?.success && res.data.data?.items) {
        setFiles(res.data.data.items);
      } else if (res.data?.items) {
        setFiles(res.data.items);
      } else {
        setFiles([]);
      }
    } catch (err) {
      setError('Failed to load recent files');
    } finally {
      setLoading(false);
    }
  };

  const renderFile = ({ item }) => {
    const IconComponent = getFileIcon(item.mimeType);
    return (
      <TouchableOpacity
        style={[styles.fileItem, { borderBottomColor: colors.border }]}
        onPress={() => {
          onSelectFile(item);
          onClose();
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.iconBox, { backgroundColor: colors.backgroundSecondary }]}>
          <IconComponent size={24} color={colors.primary} />
        </View>
        <View style={styles.fileInfo}>
          <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.fileName || item.originalName || 'Unknown file'}
          </Text>
          <Text style={[styles.fileMeta, { color: colors.textTertiary }]}>
            {item.mimeType ? item.mimeType.split('/')[1]?.toUpperCase() : 'FILE'} • {item.fileSize ? (item.fileSize / 1024).toFixed(1) + ' KB' : 'Unknown size'}
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
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={files}
            keyExtractor={(item, index) => item._id || String(index)}
            renderItem={renderFile}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={{ color: colors.textSecondary }}>No recent files found</Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 44 : 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '700' },
  list: { padding: 16, paddingBottom: 60 },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fileInfo: { flex: 1, justifyContent: 'center' },
  fileName: { fontSize: 15, fontWeight: '500', marginBottom: 2 },
  fileMeta: { fontSize: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 14, textAlign: 'center' },
});
