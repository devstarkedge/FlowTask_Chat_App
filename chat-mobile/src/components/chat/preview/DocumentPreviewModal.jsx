import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { X, Download } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { downloadAndSaveFile } from '../../../utils/fileDownload';
import FileSystemAdapter from '../../../services/FileSystemAdapter';
import FileService from '../../../services/FileService';
import { getFilePreviewInfo } from '../../../utils/filePreviewInfo';
import {
  loadCsvRows,
  loadDocxHtml,
  loadTextContent,
  loadXlsxSheets,
} from '../../../utils/filePreviewParsers';
import AndroidPdfViewer from './AndroidPdfViewer';
import CodePreviewView from './CodePreviewView';
import CsvPreviewView from './CsvPreviewView';
import XlsxPreviewView from './XlsxPreviewView';
import DocxPreviewView from './DocxPreviewView';
import { PreviewError, PreviewLoading, PreviewUnsupported } from './PreviewStateViews';
import { scale, verticalScale, moderateScale } from '../../../utils/responsive';
import logger from '../../../utils/logger';

export default function DocumentPreviewModal({
  visible,
  file,
  fileUrl,
  name,
  mimeType,
  onClose,
}) {
  const previewInfo = useMemo(
    () => getFilePreviewInfo({
      ...file,
      mimeType: mimeType || file?.mimeType,
      originalFileName: name || file?.originalFileName,
      name: name || file?.name,
      url: fileUrl || file?.url,
    }),
    [file, fileUrl, mimeType, name],
  );

  const insets = useSafeAreaInsets();
  // Use only the true device safe-area inset — no hardcoded platform minimum.
  // statusBarTranslucent means the modal starts behind the status bar, so
  // insets.top gives us the exact pixels we need to clear it.
  const headerTopPadding = insets.top;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [localUri, setLocalUri] = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [csvRows, setCsvRows] = useState(null);
  const [xlsxSheets, setXlsxSheets] = useState(null);
  const [docxHtml, setDocxHtml] = useState(null);

  const displayName = name || file?.originalFileName || file?.name || 'File';

  useEffect(() => {
    if (!visible || !fileUrl) {
      setLocalUri(null);
      setTextContent(null);
      setCsvRows(null);
      setXlsxSheets(null);
      setDocxHtml(null);
      setError(null);
      setLoading(true);
      return undefined;
    }

    if (!previewInfo.isSupported) {
      setLoading(false);
      return undefined;
    }

    let isMounted = true;
    const loadPreview = async () => {
      setLoading(true);
      setError(null);
      try {
        const cachePayload = file
          ? { ...file, url: fileUrl || file.url }
          : { url: fileUrl, originalFileName: displayName, mimeType };
        const localPath = await FileService.downloadFile(cachePayload);
        if (!isMounted) return;
        setLocalUri(localPath);

        if (previewInfo.isPdf) return;

        if (previewInfo.isDocx) {
          const html = await loadDocxHtml(localPath);
          if (isMounted) setDocxHtml(html);
          return;
        }

        if (previewInfo.isXlsx) {
          const sheets = await loadXlsxSheets(localPath);
          if (isMounted) setXlsxSheets(sheets);
          return;
        }

        if (previewInfo.isCsv) {
          const rows = await loadCsvRows(localPath);
          if (isMounted) setCsvRows(rows);
          return;
        }

        if (previewInfo.isText) {
          const text = await loadTextContent(localPath);
          if (isMounted) setTextContent(text);
        }
      } catch (err) {
        logger.error('[DocumentPreviewModal] Preview load failed:', err);
        if (isMounted) setError(err?.message || 'Failed to load preview');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadPreview();
    return () => {
      isMounted = false;
    };
  }, [visible, fileUrl, displayName, mimeType, file?._id, file?.id, previewInfo, retryCount]);

  const handleDownload = useCallback(async () => {
    await downloadAndSaveFile(fileUrl, displayName, mimeType || previewInfo.mime);
  }, [displayName, fileUrl, mimeType, previewInfo.mime]);

  const handleOpenExternally = useCallback(async () => {
    try {
      if (localUri) {
        const sharingAvailable = await FileSystemAdapter.isSharingAvailable();
        if (sharingAvailable) {
          await FileSystemAdapter.share(localUri, mimeType || previewInfo.mime);
          return;
        }
      }
      await handleDownload();
    } catch (e) {
      logger.error('[DocumentPreviewModal] Failed to open externally', e);
      await handleDownload();
    }
  }, [handleDownload, localUri, mimeType, previewInfo.mime]);

  const renderContent = () => {
    if (!previewInfo.isSupported) {
      return <PreviewUnsupported onDownload={handleDownload} />;
    }

    if (loading) {
      let label = 'Opening document...';
      if (previewInfo.isPdf) label = 'Loading PDF...';
      else if (previewInfo.isDocx) label = 'Loading document...';
      else if (previewInfo.isXlsx) label = 'Loading spreadsheet...';
      else if (previewInfo.isCsv || previewInfo.isText) label = 'Loading file content...';
      return <PreviewLoading label={label} />;
    }

    if (error) {
      return (
        <PreviewError
          title={previewInfo.isPdf ? 'Failed to load PDF' : 'Failed to load file'}
          message={error}
          onDownload={handleDownload}
          onRetry={previewInfo.isPdf ? () => setRetryCount((count) => count + 1) : undefined}
        />
      );
    }

    if (previewInfo.isPdf && localUri) {
      if (Platform.OS === 'android') {
        return (
          <AndroidPdfViewer
            localPath={localUri}
            onError={() => setError('Failed to load PDF')}
          />
        );
      }
      return (
        <WebView
          source={{ uri: localUri }}
          style={styles.webview}
          originWhitelist={['*']}
          allowFileAccess
          allowUniversalAccessFromFileURLs
          onError={() => setError('Failed to load PDF')}
        />
      );
    }

    if (previewInfo.isDocx && docxHtml) {
      return <DocxPreviewView html={docxHtml} />;
    }

    if (previewInfo.isXlsx && xlsxSheets) {
      return <XlsxPreviewView sheets={xlsxSheets} />;
    }

    if (previewInfo.isCsv && csvRows) {
      return <CsvPreviewView rows={csvRows} />;
    }

    if (previewInfo.isText && textContent !== null) {
      return (
        <CodePreviewView
          text={textContent}
          ext={previewInfo.ext}
          isJson={previewInfo.isJson}
        />
      );
    }

    return <PreviewUnsupported onDownload={handleDownload} />;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalBg}>
        <View style={[styles.header, { paddingTop: headerTopPadding }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <X size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{displayName}</Text>
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
  webview: { flex: 1, backgroundColor: '#fff' },
});
