import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { X, Download, Image as ImageIcon } from 'lucide-react-native';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import ImageViewer from 'react-native-image-zoom-viewer';
import { scale, verticalScale, moderateScale } from '../../../utils/responsive';
import { downloadAndSaveFile } from '../../../utils/fileDownload';
import FileService from '../../../services/FileService';
import logger from '../../../utils/logger';

export default function ImagePreviewModal({
  visible,
  fileUrl,
  name,
  mimeType,
  headers,
  cacheFile,
  onClose,
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [displayUri, setDisplayUri] = useState(fileUrl);
  const [caching, setCaching] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Dynamically compute the header top padding so it sits flush below the
  // status bar on every device (notched, Dynamic Island, legacy Android, etc.)
  // We do NOT hard-code any top margin — insets.top IS the status-bar height.
  const headerTopPadding = Math.max(insets.top, Platform.OS === 'ios' ? 44 : 24);

  useEffect(() => {
    if (!visible) {
      setLoaded(false);
      setError(false);
      setDisplayUri(fileUrl);
      return;
    }

    let cancelled = false;
    setLoaded(false);
    setError(false);
    setDisplayUri(fileUrl);

    const warmCache = async () => {
      if (!cacheFile?.url && !fileUrl) return;
      setCaching(true);
      try {
        const localUri = await FileService.downloadFile(
          cacheFile || { url: fileUrl, originalFileName: name }
        );
        if (!cancelled && localUri) {
          setDisplayUri(localUri);
        }
      } catch (err) {
        logger.warn('[ImagePreviewModal] Cache download failed, using remote URL', err?.message);
      } finally {
        if (!cancelled) setCaching(false);
      }
    };

    warmCache();
    return () => {
      cancelled = true;
    };
  }, [visible, fileUrl, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = useCallback(async () => {
    try {
      await downloadAndSaveFile(fileUrl, name, mimeType);
    } catch (e) {
      logger.error('[ImagePreviewModal] Download failed', e);
    }
  }, [fileUrl, name, mimeType]);

  const imageUrls = [
    {
      url: displayUri,
      props: {
        source: {
          uri: displayUri,
          ...(displayUri && displayUri.startsWith('http') ? { headers } : {}),
        },
      },
    },
  ];

  // The available height for the image viewer is the total screen height
  // minus the measured header height. This ensures the image is NEVER hidden
  // behind the header — no hardcoded offsets, fully dynamic.
  const imageAreaHeight = screenHeight - headerHeight;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaProvider>
        <View style={styles.root}>
        {/* ── Fixed header — measured dynamically ────────────────────────── */}
        <View
          style={[styles.header, { paddingTop: headerTopPadding }]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0) setHeaderHeight(h);
          }}
        >
          <TouchableOpacity
            onPress={onClose}
            style={styles.headerBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {name}
          </Text>
          <TouchableOpacity onPress={handleDownload} style={styles.headerBtn}>
            <Download size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Image viewer — occupies only the remaining space ────────────── */}
        {headerHeight > 0 && (
          <View style={{ width: screenWidth, height: imageAreaHeight }}>
            <ImageViewer
              imageUrls={imageUrls}
              enableSwipeDown
              onSwipeDown={onClose}
              onCancel={onClose}
              renderIndicator={() => null}
              // No custom renderHeader — the real header above handles that
              renderError={() => (
                <View style={styles.errorBox}>
                  <ImageIcon size={48} color="rgba(255,255,255,0.4)" />
                  <Text style={styles.errorText}>Failed to load image</Text>
                </View>
              )}
              loadingRender={() => (
                <ActivityIndicator color="#fff" size="large" />
              )}
              saveToLocalByLongPress={false}
              backgroundColor="#000"
              // Tell the viewer the exact canvas dimensions so it centres
              // the image perfectly within the remaining space.
              style={{ width: screenWidth, height: imageAreaHeight }}
            />
          </View>
        )}

        {/* Render a loading spinner while the header height hasn't been measured yet */}
        {headerHeight === 0 && (
          <View style={styles.centeredFlex}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        )}
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingBottom: verticalScale(12),
    backgroundColor: 'rgba(0,0,0,0.75)',
    // No position:'absolute' — this is a real layout element so its height
    // is properly measured and subtracted from the image area.
    zIndex: 10,
  },
  headerBtn: {
    padding: moderateScale(8),
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: moderateScale(15),
    fontWeight: '600',
    marginHorizontal: scale(10),
  },
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: moderateScale(14),
  },
  centeredFlex: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
