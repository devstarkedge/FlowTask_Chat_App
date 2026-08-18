import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { X, Download } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { downloadAndSaveFile } from '../../../utils/fileDownload';
import { PreviewUnsupported } from './PreviewStateViews';
import { scale, verticalScale, moderateScale } from '../../../utils/responsive';

export default function UnsupportedPreviewModal({ visible, name, fileUrl, mimeType, onClose }) {
  const insets = useSafeAreaInsets();
  const headerTopPadding = insets.top; // purely inset-derived, no hardcoded fallback
  const handleDownload = async () => {
    await downloadAndSaveFile(fileUrl, name, mimeType);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalBg}>
        <View style={[styles.header, { paddingTop: headerTopPadding }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <X size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{name || 'File'}</Text>
          <TouchableOpacity onPress={handleDownload} style={styles.headerBtn}>
            <Download size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.contentArea}>
          <PreviewUnsupported onDownload={handleDownload} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingBottom: verticalScale(12),
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
  },
  title: {
    flex: 1,
    color: '#e6edf3',
    fontSize: moderateScale(15),
    fontWeight: '600',
    marginHorizontal: scale(10),
  },
  headerBtn: { padding: moderateScale(8) },
  contentArea: { flex: 1 },
});
