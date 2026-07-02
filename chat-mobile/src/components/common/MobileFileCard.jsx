import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Modal, Image } from 'react-native';
import {
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileArchive,
  FileCode,
  Table2,
  File,
  Download,
  ExternalLink,
  X,
} from 'lucide-react-native';

export function getFileKind(mime = '', name = '') {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/^(doc|docx)$/.test(ext) || mime?.includes('word') || mime?.includes('msword')) return 'word';
  if (/^(xls|xlsx)$/.test(ext) || mime?.includes('excel') || mime?.includes('spreadsheet')) return 'spreadsheet';
  if (/^(ppt|pptx)$/.test(ext) || mime?.includes('presentation') || mime?.includes('powerpoint')) return 'presentation';
  if (ext === 'csv') return 'csv';
  if (mime?.startsWith('text/')) return 'code';
  if (mime?.includes('json') || mime?.includes('xml')) return 'code';
  return 'file';
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function KindIcon({ kind, color, size = 20 }) {
  const props = { size, color };
  switch (kind) {
    case 'image': return <ImageIcon {...props} />;
    case 'video': return <Film {...props} />;
    case 'audio': return <Music {...props} />;
    case 'archive': return <FileArchive {...props} />;
    case 'code': return <FileCode {...props} />;
    case 'csv':
    case 'spreadsheet': return <Table2 {...props} />;
    case 'pdf':
    case 'word':
    case 'presentation': return <FileText {...props} />;
    default: return <File {...props} />;
  }
}

export default function MobileFileCard({ file, colors }) {
  if (!file) return null;

  const name = file.originalName || file.fileName || file.name || 'File';
  const size = file.fileSize || file.size || file.fileSizeBytes;
  const mime = file.mimeType || file.type || '';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const kind = getFileKind(mime, name);

  // Mapped kind colors matching web app
  const kindColors = {
    image: colors.primary || '#1264a3',
    video: '#7c3aed',
    audio: '#10b981',
    archive: '#f97316',
    code: '#10b981',
    csv: '#10b981',
    spreadsheet: '#10b981',
    pdf: '#ef4444',
    word: colors.primary || '#1264a3',
    presentation: '#eab308',
    file: colors.textSecondary || '#666',
  };

  const activeColor = kindColors[kind] || kindColors.file;

  const [previewVisible, setPreviewVisible] = useState(false);

  const handleOpen = () => {
    if (kind === 'image') {
      setPreviewVisible(true);
    } else if (file.url) {
      Linking.openURL(file.url).catch(() => {});
    }
  };

  const handleExternalOpen = () => {
    if (file.url) {
      Linking.openURL(file.url).catch(() => {});
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: colors.backgroundSecondary || colors.background,
            borderColor: colors.border,
          },
        ]}
        onPress={handleOpen}
        activeOpacity={0.7}
      >
        {/* Icon Area */}
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: activeColor + '1F' }, // ~12% opacity hex
          ]}
        >
          <KindIcon kind={kind} color={activeColor} size={22} />
        </View>

        {/* Info Area */}
        <View style={styles.info}>
          <Text
            style={[styles.name, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <View style={styles.metaRow}>
            {ext && (
              <View
                style={[
                  styles.extBadge,
                  { backgroundColor: activeColor + '1A' },
                ]}
              >
                <Text style={[styles.extText, { color: activeColor }]}>
                  {ext.toUpperCase()}
                </Text>
              </View>
            )}
            {size > 0 && (
              <Text style={[styles.size, { color: colors.textTertiary }]}>
                {formatFileSize(size)}
              </Text>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleExternalOpen}>
            <ExternalLink size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Fullscreen Image Preview Modal */}
      {kind === 'image' && (
        <Modal
          visible={previewVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setPreviewVisible(false)}
        >
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {name}
              </Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setPreviewVisible(false)}
              >
                <X size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Image Container */}
            <TouchableOpacity
              style={styles.imageWrapper}
              activeOpacity={1}
              onPress={() => setPreviewVisible(false)}
            >
              <Image
                source={{ uri: file.url }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            </TouchableOpacity>

            {/* Bottom Actions */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.footerActionButton}
                onPress={handleExternalOpen}
              >
                <ExternalLink size={16} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.footerActionText}>Open in Browser</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginVertical: 4,
    width: '100%',
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  extBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  extText: {
    fontSize: 10,
    fontWeight: '700',
  },
  size: {
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'space-between',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 16,
  },
  closeButton: {
    padding: 6,
  },
  imageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  modalFooter: {
    paddingBottom: 40,
    paddingTop: 15,
    alignItems: 'center',
  },
  footerActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  footerActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
