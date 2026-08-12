import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Image,
} from 'react-native';
import { Camera, Image as ImageIcon, Mic, Video, FileText, Smile, Layers, Clock, X } from 'lucide-react-native';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
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
}) {
  const [photos, setPhotos] = useState([]);
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible && (!permissionResponse || permissionResponse.status !== 'granted')) {
      requestPermission();
    }
  }, [visible, permissionResponse]);

  useEffect(() => {
    if (visible && permissionResponse?.status === 'granted') {
      loadRecentPhotos();
    }
  }, [visible, permissionResponse]);

  const loadRecentPhotos = async () => {
    try {
      const { assets } = await MediaLibrary.getAssetsAsync({
        first: 20,
        mediaType: ['photo', 'video'],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      setPhotos(assets);
    } catch (e) {
      console.log('Error loading photos', e);
    }
  };

  const handleLaunchCamera = async (mediaTypes = ['images']) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Camera permission is required.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes,
      quality: 0.8,
    });
    if (!result.canceled) {
      onPickFiles(result.assets);
      onClose();
    }
  };

  const handleLaunchLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images', 'videos'],
    });
    if (!result.canceled) {
      onPickFiles(result.assets);
      onClose();
    }
  };

  const handlePickDocument = async () => {
    try {
      const DocumentPicker = require('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        type: '*/*',
      });
      if (!result.canceled) {
        onPickFiles(result.assets);
        onClose();
      }
    } catch (e) {
      console.log('Doc picker error', e);
    }
  };

  const handlePhotoSelect = async (asset) => {
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
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mov', 'heic', 'heif'].includes(uriExt)) {
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
      else if (ext === 'mp4') mimeType = 'video/mp4';
      else if (ext === 'mov') mimeType = 'video/quicktime';
      else mimeType = asset.mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
    }

    onPickFiles([{
      uri: localUri,
      name: fileName,
      fileName,
      type: mimeType,
      mimeType,
      size: asset.fileSize || 0,
    }]);
    onClose();
  };

  const renderPhotoItem = ({ item }) => {
    if (item.isCameraBtn) {
      return (
        <TouchableOpacity
          style={[styles.cameraBtn, { borderColor: colors.border }]}
          onPress={() => handleLaunchCamera()}
        >
          <Camera size={28} color={colors.textSecondary} />
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        style={styles.photoThumb}
        onPress={() => handlePhotoSelect(item)}
      >
        <Image source={{ uri: item.uri }} style={styles.photoImg} />
      </TouchableOpacity>
    );
  };

  const data = [{ id: 'camera', isCameraBtn: true }, ...photos];

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: Math.max(verticalScale(24), insets.bottom + verticalScale(8)) }]}>
          <View style={styles.dragHandleContainer}>
            <View style={[styles.dragHandle, { backgroundColor: colors.borderDark }]} />
          </View>
          
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Photos & Videos</Text>
            <TouchableOpacity onPress={handleLaunchLibrary}>
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
            <OptionRow
              icon={Mic}
              label="Record an Audio Clip"
              colors={colors}
              onPress={() => {
                onClose();
                onRecordAudio?.();
              }}
            />
            <OptionRow
              icon={Video}
              label="Record a Video Clip"
              colors={colors}
              onPress={() => {
                onClose();
                onRecordVideo?.();
              }}
            />
            <OptionRow
              icon={FileText}
              label="Upload a File"
              colors={colors}
              onPress={handlePickDocument}
            />
            <OptionRow
              icon={Smile}
              label="Add a GIF"
              colors={colors}
              onPress={() => { onClose(); onOpenGifPicker(); }}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <OptionRow
              icon={Layers}
              label="Recent Canvases"
              colors={colors}
              onPress={() => {
                onClose();
                onOpenRecentCanvases?.();
              }}
            />
            <OptionRow
              icon={Clock}
              label="Recent Files"
              colors={colors}
              onPress={() => {
                onClose();
                onOpenRecentFiles?.();
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const OptionRow = ({ icon: Icon, label, colors, onPress }) => (
  <TouchableOpacity style={styles.optionRow} onPress={onPress}>
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
