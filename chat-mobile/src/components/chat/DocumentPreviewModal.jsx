import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { X, Download, FileText, File as FileIcon } from 'lucide-react-native';
import { downloadAndSaveFile } from '../../utils/fileDownload';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import logger from '../../utils/logger';
import { useAuthStore } from '../../stores/authStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function DocumentPreviewModal({ visible, fileUrl, name, mimeType, kind, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [localUri, setLocalUri] = useState(null);
  const [textContent, setTextContent] = useState('');

  useEffect(() => {
    if (!visible || !fileUrl) {
      // Reset state when closing
      setLocalUri(null);
      setTextContent('');
      setError(false);
      setLoading(true);
      return;
    }

    let isMounted = true;
    const fetchToCache = async () => {
      setLoading(true);
      setError(false);
      try {
        const token = useAuthStore.getState().accessToken;
        const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

        const safeFilename = name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const tempUri = `${FileSystem.cacheDirectory}preview_${Date.now()}_${safeFilename}`;

        const downloadRes = await FileSystem.downloadAsync(fileUrl, tempUri, { headers });
        
        if (!isMounted) return;

        if (downloadRes.status !== 200) {
          throw new Error('Failed to download preview file');
        }

        setLocalUri(downloadRes.uri);

        // If it's a text/code file, read the content to display
        if (kind === 'code' || kind === 'text' || kind === 'csv') {
          try {
            const text = await FileSystem.readAsStringAsync(downloadRes.uri);
            if (isMounted) setTextContent(text);
          } catch (e) {
            logger.warn('Failed to read text file content', e);
            if (isMounted) setError(true);
          }
        }
      } catch (err) {
        logger.error('[DocumentPreviewModal] Download for preview failed:', err);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchToCache();

    return () => {
      isMounted = false;
    };
  }, [visible, fileUrl, name, kind]);

  const handleDownload = async () => {
    // Rely on the existing downloadAndSaveFile which performs its own auth/save logic
    // We do NOT use the cached file for the final save, to keep concerns cleanly separated.
    await downloadAndSaveFile(fileUrl, name, mimeType);
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#1264a3" size="large" />
          <Text style={styles.loadingText}>Opening document...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerBox}>
          <FileText size={48} color="rgba(255,255,255,0.3)" />
          <Text style={styles.errorText}>Unable to preview this file</Text>
          <Text style={styles.fileNameLarge} numberOfLines={2}>{name}</Text>
          <TouchableOpacity style={styles.downloadBtnLarge} onPress={handleDownload}>
            <Download size={18} color="#fff" />
            <Text style={styles.downloadBtnText}>Download File</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (kind === 'code' || kind === 'text' || kind === 'csv') {
      return (
        <ScrollView style={styles.codeScroll} horizontal={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <Text style={styles.codeText} selectable>{textContent}</Text>
          </ScrollView>
        </ScrollView>
      );
    }

    // PDF and Office files
    // For iOS, WebView can natively display PDFs and some Office documents if given a local file URI.
    // For Android, WebView cannot natively display PDFs without a viewer.
    if (Platform.OS === 'ios') {
      return (
        <WebView
          source={{ uri: localUri }}
          style={styles.webview}
          originWhitelist={['*']}
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          onError={() => setError(true)}
          renderError={() => (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>Preview failed</Text>
            </View>
          )}
        />
      );
    } else {
      // Android fallback for PDFs and Office docs
      return (
        <View style={styles.centerBox}>
          <FileIcon size={64} color="rgba(255,255,255,0.4)" />
          <Text style={styles.errorText}>Preview unavailable</Text>
          <Text style={styles.fileNameLarge} numberOfLines={2}>{name}</Text>
          <TouchableOpacity style={styles.downloadBtnLarge} onPress={handleDownload}>
            <Download size={18} color="#fff" />
            <Text style={styles.downloadBtnText}>Download File</Text>
          </TouchableOpacity>
        </View>
      );
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalBg}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <X size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{name}</Text>
          <TouchableOpacity onPress={handleDownload} style={styles.headerBtn}>
            <Download size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.contentArea}>
          {renderContent()}
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
    paddingTop: Platform.OS === 'ios' ? 54 : 40,
    paddingHorizontal: scale(12),
    paddingBottom: verticalScale(12),
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
  },
  title: { flex: 1, color: '#e6edf3', fontSize: moderateScale(15), fontWeight: '600', marginHorizontal: scale(10) },
  headerBtn: { padding: moderateScale(8) },
  contentArea: { flex: 1 },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: moderateScale(20), gap: 12 },
  loadingText: { color: 'rgba(255,255,255,0.7)', fontSize: moderateScale(14), marginTop: 10 },
  errorText: { color: 'rgba(255,255,255,0.6)', fontSize: moderateScale(15) },
  fileNameLarge: { color: '#fff', fontSize: moderateScale(16), fontWeight: '500', textAlign: 'center', marginBottom: 20 },
  downloadBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1264a3',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(8),
    gap: 8,
  },
  downloadBtnText: { color: '#fff', fontSize: moderateScale(15), fontWeight: '600' },
  codeScroll: { flex: 1, padding: moderateScale(16), backgroundColor: '#0d1117' },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: moderateScale(13),
    color: '#e6edf3',
    lineHeight: 22,
  },
  webview: { flex: 1, backgroundColor: '#fff' },
});
