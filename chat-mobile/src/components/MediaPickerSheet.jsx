import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  FlatList,
  Image,
} from 'react-native';
import { Camera, Image as ImageIcon, Mic, Video, FileText, Smile, Layers, Clock, X } from 'lucide-react-native';
import MediaLibrary from '../utils/safeMediaLibrary';
import * as ImagePicker from 'expo-image-picker';
import { ensureCapturePermission } from '../utils/capturePermissions';
import logger from '../utils/logger';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


export default function MediaPickerSheet({
  visible,
  onClose,
  colors,
  onPickFiles,
  onOpenGifPicker,
  onOpenRecentCanvases,
  onOpenRecentFiles,
  onRecordAudio,
  onRecordVideo,
  contextId,
}) {
  const [photos, setPhotos] = useState([]);
  const [sheetVisible, setSheetVisible] = useState(visible);
  const [isBusy, setIsBusy] = useState(false);
  const pendingAction = useRef(null), busy = useRef(false), mounted = useRef(true), generation = useRef(0);
  const insets = useSafeAreaInsets();
  const trace = (action, stage) => logger.info('[MediaPicker]', { action, stage, platform: Platform.OS });

  useEffect(() => {
    mounted.current = true;
    busy.current = false;
    setIsBusy(false);
    return () => { mounted.current = false; generation.current++; pendingAction.current = null; };
  }, [contextId]);

  useEffect(() => { setSheetVisible(visible); }, [visible]);

  const runPendingAction = async () => {
    const pending = pendingAction.current;
    if (!pending || !mounted.current) return;
    pendingAction.current = null;
    const attempt = generation.current;
    const current = () => mounted.current && generation.current === attempt;
    trace(pending.name, 'sheet_dismissed');
    try {
      const result = await pending.run(current);
      if (current()) trace(pending.name, result === false ? 'cancelled_or_denied' : 'completed');
    } catch (error) {
      logger.warn('[MediaPicker] action failed', { action: pending.name, code: error?.code, message: error?.message });
      if (current()) Alert.alert('Attachment Unavailable', `Unable to open ${pending.name}. Please try again.`);
    } finally {
      if (current()) { busy.current = false; setIsBusy(false); }
    }
  };

  const dismissThenRun = (name, run) => {
    if (busy.current) return;
    busy.current = true;
    setIsBusy(true);
    pendingAction.current = { name, run };
    trace(name, 'selected');
    setSheetVisible(false);
    onClose();
  };

  useEffect(() => {
    // iOS keeps its presenter mounted through the dismissal animation.
    // Android dismisses/removes the Dialog with the hidden-modal commit and
    // never emits Modal.onDismiss. Do not wait for that iOS-only event there.
    if (!sheetVisible && Platform.OS !== 'ios') void runPendingAction();
  }, [sheetVisible]);

  useEffect(() => {
    let cancelled = false;
    if (visible) {
      (async () => {
        const res = await MediaLibrary.getPermissionsAsync();
        if (!cancelled && (res?.granted || res?.status === 'granted')) {
          await loadRecentPhotos(() => !cancelled);
        } else if (!cancelled) {
          setPhotos([]);
        }
      })().catch(error => logger.warn('[MediaPicker] recent media unavailable', { code: error?.code }));
    }
    return () => { cancelled = true; };
  }, [visible]);

  const loadRecentPhotos = async (current) => {
    try {
      const { assets } = await MediaLibrary.getAssetsAsync({
        first: 20,
        mediaType: ['photo', 'video'],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      const previews = await Promise.all((assets || []).map(async asset => {
        if (!/^(ph|assets-library):\/\//.test(asset.uri || '')) return asset;
        const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
        return info?.localUri?.startsWith('file://') ? { ...asset, uri: info.localUri } : asset;
      }));
      if (current()) setPhotos(previews);
    } catch (e) {
      console.log('Error loading photos', e);
    }
  };

  const handleLaunchCamera = async (current) => {
    trace('camera', 'permission_check');
    if (!await ensureCapturePermission(ImagePicker.getCameraPermissionsAsync, ImagePicker.requestCameraPermissionsAsync, 'Camera') || !current()) return false;
    trace('camera', 'picker_presenting');
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!current() || result.canceled) return false;
    await onPickFiles(result.assets);
  };

  const handleLaunchLibrary = async (current) => {
    if (Platform.OS !== 'web') {
      trace('photo library', 'permission_check');
      const granted = await ensureCapturePermission(MediaLibrary.getPermissionsAsync, MediaLibrary.requestPermissionsAsync, 'Photo Library');
      if (!granted || !current()) return false;
    }
    trace('photo library', 'picker_presenting');
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 10,
      mediaTypes: ['images', 'videos'],
    });
    if (!current() || result.canceled) return false;
    await onPickFiles(result.assets);
  };

  const handlePickDocument = async (current) => {
    trace('file picker', 'picker_presenting');
    const DocumentPicker = require('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (!current() || result.canceled) return false;
    await onPickFiles(result.assets);
  };

  const handlePhotoSelect = async (asset, current) => {
    let localUri = asset.uri;
    let fileName = asset.filename || asset.fileName || '';
    let mimeType = asset.mimeType || asset.type;

    try {
      if (asset.id || asset.uri?.startsWith('ph://')) {
        const info = await MediaLibrary.getAssetInfoAsync(asset.id || asset);
        if (info?.localUri || info?.uri) {
          localUri = info.localUri || info.uri;
        }
        if (info?.filename) fileName = info.filename;
      }
    } catch (e) {
      console.log('[MediaPicker] getAssetInfoAsync error:', e);
    }

    if (!fileName) {
      const cleanUri = (localUri || '').split('?')[0];
      const uriExt = cleanUri.split('.').pop().toLowerCase();
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mov', 'heic', 'heif', 'tiff', 'tif', 'dng', 'raw', 'avif'].includes(uriExt)) {
        fileName = `media_${Date.now()}.${uriExt}`;
      } else {
        fileName = `media_${Date.now()}.${asset.mediaType === 'video' ? 'mp4' : 'png'}`;
      }
    }

    const ext = fileName.split('.').pop().toLowerCase();
    if (!mimeType || mimeType === 'image' || mimeType === 'video') {
      if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'gif') mimeType = 'image/gif';
      else if (ext === 'webp') mimeType = 'image/webp';
      else if (ext === 'heic') mimeType = 'image/heic';
      else if (ext === 'heif') mimeType = 'image/heif';
      else if (ext === 'tiff' || ext === 'tif') mimeType = 'image/tiff';
      else if (ext === 'avif') mimeType = 'image/avif';
      else if (ext === 'dng') mimeType = 'image/dng';
      else if (ext === 'raw') mimeType = 'image/x-raw';
      else if (ext === 'mp4') mimeType = 'video/mp4';
      else if (ext === 'mov') mimeType = 'video/quicktime';
      else mimeType = asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
    }

    if (!current()) return false;
    await onPickFiles([{
      uri: localUri,
      name: fileName,
      fileName,
      type: mimeType,
      mimeType,
      size: asset.fileSize || 0,
    }]);
  };

  const renderPhotoItem = ({ item }) => {
    if (item.isCameraBtn) {
      return (
        <TouchableOpacity
          style={[styles.cameraBtn, { borderColor: colors.border }]}
          disabled={isBusy}
          onPress={() => dismissThenRun('camera', handleLaunchCamera)}
        >
          <Camera size={28} color={colors.textSecondary} />
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        style={styles.photoThumb}
        disabled={isBusy}
        onPress={() => dismissThenRun('recent photo', current => handlePhotoSelect(item, current))}
      >
        {!/^(ph|assets-library):\/\//.test(item.uri || '') ? <Image source={{ uri: item.uri }} style={styles.photoImg} /> : <ImageIcon size={24} color={colors.textSecondary} />}
      </TouchableOpacity>
    );
  };

  const data = [{ id: 'camera', isCameraBtn: true }, ...photos];

  return (
    <Modal
      visible={sheetVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={() => { void runPendingAction(); }}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: Math.max(verticalScale(24), insets.bottom + verticalScale(8)) }]}>
          <View style={styles.dragHandleContainer}>
            <View style={[styles.dragHandle, { backgroundColor: colors.borderDark }]} />
          </View>
          
          <View style={styles.header}>
            <TouchableOpacity disabled={isBusy} onPress={() => dismissThenRun('photo library', handleLaunchLibrary)}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Photos & Videos</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={isBusy} onPress={() => dismissThenRun('photo library', handleLaunchLibrary)}>
              <Text style={[styles.headerAction, { color: colors.primary }]}>View Library</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.photoStripContainer}>
            <FlatList
              horizontal
              data={data}
              keyExtractor={(item) => item.id}
              renderItem={renderPhotoItem}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoStripList}
            />
          </View>

          <View style={styles.optionsList}>
            {/* <OptionRow
              icon={Mic}
              label="Record an Audio Clip"
              colors={colors}
              disabled={isBusy}
              onPress={() => dismissThenRun('audio recorder', onRecordAudio)}
            />
            <OptionRow
              icon={Video}
              label="Record a Video Clip"
              colors={colors}
              disabled={isBusy}
              onPress={() => dismissThenRun('video recorder', onRecordVideo)}
            /> */}
            <OptionRow
              icon={FileText}
              label="Upload a File"
              colors={colors}
              disabled={isBusy}
              onPress={() => dismissThenRun('file picker', handlePickDocument)}
            />
            <OptionRow
              icon={Smile}
              label="Add a GIF"
              colors={colors}
              disabled={isBusy}
              onPress={() => dismissThenRun('GIF picker', onOpenGifPicker)}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <OptionRow
              icon={Layers}
              label="Recent Canvases"
              colors={colors}
              disabled={isBusy}
              onPress={() => dismissThenRun('recent canvases', onOpenRecentCanvases)}
            />
            <OptionRow
              icon={Clock}
              label="Recent Files"
              colors={colors}
              disabled={isBusy}
              onPress={() => dismissThenRun('recent files', onOpenRecentFiles)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const OptionRow = ({ icon: Icon, label, colors, onPress, disabled }) => (
  <TouchableOpacity style={styles.optionRow} onPress={onPress} disabled={disabled}>
    <View style={styles.optionIcon}>
      <Icon size={20} color={colors.textPrimary} strokeWidth={1.5} />
    </View>
    <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: verticalScale(24), maxHeight: '90%' },
  dragHandleContainer: { alignItems: 'center', paddingVertical: verticalScale(12) },
  dragHandle: { width: scale(40), height: verticalScale(4), borderRadius: moderateScale(2) },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: scale(16), marginBottom: verticalScale(12), alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(16), fontWeight: '700' },
  headerAction: { fontSize: moderateScale(14), fontWeight: '600' },
  photoStripContainer: { height: verticalScale(100), marginBottom: verticalScale(16) },
  photoStripList: { paddingHorizontal: scale(16), gap: 8 },
  cameraBtn: { width: scale(100), height: verticalScale(100), borderRadius: moderateScale(12), borderWidth: 1, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed' },
  photoThumb: { width: scale(100), height: verticalScale(100), borderRadius: moderateScale(12), overflow: 'hidden' },
  photoImg: { width: '100%', height: '100%' },
  optionsList: { paddingHorizontal: scale(16) },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(12) },
  optionIcon: { width: scale(32), alignItems: 'center', marginRight: scale(12) },
  optionLabel: { fontSize: moderateScale(16), fontWeight: '500' },
  divider: { height: verticalScale(1), marginVertical: verticalScale(8), marginHorizontal: scale(8) }
});
