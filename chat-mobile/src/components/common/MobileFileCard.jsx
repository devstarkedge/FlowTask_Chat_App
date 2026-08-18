import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import { normalizeMediaUrl, getFileKind } from '../../utils/mediaUtils';
import { useAuthStore } from '../../stores/authStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import logger from '../../utils/logger';
import FilePreviewRenderer, { AudioPlayerCard, KIND_COLORS, formatFileSize, resolvePreviewFile } from '../chat/preview';
import {
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileArchive,
  FileCode,
  Table2,
  File,
  Play,
  Download,
} from 'lucide-react-native';

function KindIcon({ kind, color, size = 22 }) {
  const p = { size, color };
  switch (kind) {
    case 'image':        return <ImageIcon {...p} />;
    case 'video':        return <Film {...p} />;
    case 'audio':        return <Music {...p} />;
    case 'archive':      return <FileArchive {...p} />;
    case 'code':
    case 'text':         return <FileCode {...p} />;
    case 'csv':
    case 'spreadsheet':  return <Table2 {...p} />;
    case 'pdf':
    case 'word':
    case 'presentation': return <FileText {...p} />;
    default:             return <File {...p} />;
  }
}

export default function MobileFileCard({ file, colors, onLongPress, isUploading = false }) {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [imgError, setImgError] = useState(false);
  const openPreview = useCallback(() => setPreviewVisible(true), []);

  if (!file) return null;

  const resolved = resolvePreviewFile(file);
  const name = resolved?.name || file.originalName || file.fileName || file.name || 'File';
  const size = resolved?.size || file.fileSize || file.size || file.fileSizeBytes;
  const mime = resolved?.mime || file.mimeType || file.type || '';
  const ext  = (name.split('.').pop() || '').toLowerCase();

  const rawUrl = file.url || file.secureUrl || file.secure_url || file.path || file.uri || file.location || file.fileUrl || file.downloadUrl || '';
  const fileUrl = resolved?.fileUrl || normalizeMediaUrl(rawUrl);

  const rawThumb = file.thumbnailUrl || file.thumbUrl || file.previewUrl || (mime.startsWith('image/') || ext.match(/^(jpg|jpeg|png|gif|webp)$/i) ? rawUrl : null);
  const thumbUrl = resolved?.thumbUrl || normalizeMediaUrl(rawThumb);

  const kind = resolved?.kind || getFileKind(mime, name, fileUrl);

  const activeColor = (KIND_COLORS[kind] || KIND_COLORS.file);
  const isPlaceholder = !fileUrl || fileUrl.includes('/placeholder-loading');

  if (kind === 'image' && isPlaceholder) {
    return (
      <TouchableOpacity
        style={[ms.card, { backgroundColor: colors.backgroundSecondary || colors.background, borderColor: colors.border }]}
        onLongPress={onLongPress}
        activeOpacity={0.75}
      >
        <ActivityIndicator size="small" color={colors.primary || '#1264a3'} style={{ marginRight: scale(8) }} />
        <Text style={[ms.fileName, { color: colors.textSecondary, fontSize: moderateScale(12) }]}>Uploading image...</Text>
      </TouchableOpacity>
    );
  }

  const token = useAuthStore.getState().accessToken;
  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
  const imageHeaders = resolved?.headers || {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
  };

  const preview = (
    <FilePreviewRenderer
      visible={previewVisible}
      file={file}
      onClose={() => setPreviewVisible(false)}
      colors={colors}
    />
  );

  if (kind === 'image' && imgError) {
    return (
      <>
        <TouchableOpacity
          style={[ms.card, { backgroundColor: colors.backgroundSecondary || colors.background, borderColor: colors.border }]}
          onPress={() => { setImgError(false); }}
          onLongPress={onLongPress}
          activeOpacity={0.75}
        >
          <View style={[ms.iconBox, { backgroundColor: activeColor + '20' }]}>
            <ImageIcon size={22} color={activeColor} />
          </View>
          <View style={ms.info}>
            <Text style={[ms.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
            <Text style={[ms.sizeText, { color: colors.textTertiary }]}>Tap to retry image loading</Text>
          </View>
          <TouchableOpacity
            style={[ms.actionBtn, { backgroundColor: activeColor + '15' }]}
            onPress={openPreview}
          >
            <Download size={16} color={activeColor} />
          </TouchableOpacity>
        </TouchableOpacity>
        {preview}
      </>
    );
  }

  if (kind === 'image') {
    const targetUri = thumbUrl || fileUrl;

    logger.info('[MobileFileCard] Final image props:', {
      name,
      targetUri,
      hasAuthToken: !!token,
      hasWorkspaceId: !!workspaceId,
    });

    return (
      <>
        <TouchableOpacity onPress={openPreview} onLongPress={onLongPress} activeOpacity={0.85} style={ms.imgThumbContainer}>
          <Image
            source={{ uri: targetUri, headers: imageHeaders }}
            style={ms.imgThumb}
            resizeMode="cover"
            onError={(err) => {
              logger.warn('[MobileFileCard Image] onError FAILURE:', {
                targetUri,
                error: err?.nativeEvent?.error || err?.nativeEvent,
              });
              setImgError(true);
            }}
          />
          {isUploading && (
            <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' }]} pointerEvents="none">
              <ActivityIndicator color={colors.primary || '#1264a3'} size="large" />
            </View>
          )}
        </TouchableOpacity>
        {preview}
      </>
    );
  }

  // Audio stays inline in chat (Files Screen uses AudioPlayerModal via FilePreviewRenderer).
  if (kind === 'audio') {
    return (
      <AudioPlayerCard
        fileUrl={fileUrl}
        name={name}
        activeColor={activeColor}
        colors={colors}
        cacheFile={resolved?.cacheFile}
      />
    );
  }

  if (kind === 'video') {
    return (
      <>
        <TouchableOpacity onPress={openPreview} onLongPress={onLongPress} activeOpacity={0.85} style={ms.vidPoster}>
          {thumbUrl ? (
            <Image source={{ uri: thumbUrl }} style={ms.vidPosterImg} resizeMode="cover" />
          ) : (
            <View style={[ms.vidPosterPlaceholder, { backgroundColor: activeColor + '25' }]}>
              <Film size={40} color={activeColor} />
            </View>
          )}
          <View style={ms.vidPlayOverlay}>
            <View style={ms.vidPlayCircle}>
              <Play size={22} color="#fff" style={{ marginLeft: scale(3) }} />
            </View>
          </View>
        </TouchableOpacity>
        {preview}
      </>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[ms.card, { backgroundColor: colors.backgroundSecondary || colors.background, borderColor: colors.border }]}
        onPress={openPreview}
        onLongPress={onLongPress}
        activeOpacity={0.75}
      >
        <View style={[ms.iconBox, { backgroundColor: activeColor + '20' }]}>
          <KindIcon kind={kind} color={activeColor} size={22} />
        </View>
        <View style={ms.info}>
          <Text style={[ms.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
          <View style={ms.metaRow}>
            {ext ? (
              <View style={[ms.badge, { backgroundColor: activeColor + '20' }]}>
                <Text style={[ms.badgeText, { color: activeColor }]}>{ext.toUpperCase()}</Text>
              </View>
            ) : null}
            {size > 0 && <Text style={[ms.sizeText, { color: colors.textTertiary }]}>{formatFileSize(size)}</Text>}
          </View>
        </View>
      </TouchableOpacity>
      {preview}
    </>
  );
}

const ms = StyleSheet.create({
  imgThumbContainer: {
    width: scale(250),
    height: verticalScale(200),
    borderRadius: moderateScale(12),
    overflow: 'hidden',
    marginVertical: verticalScale(4),
  },
  imgThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1e1e1e',
  },
  vidPoster: {
    width: '100%',
    minWidth: scale(240),
    maxWidth: scale(340),
    borderRadius: moderateScale(12),
    overflow: 'hidden',
    marginVertical: verticalScale(4),
  },
  vidPosterImg: { width: '100%', height: verticalScale(220) },
  vidPosterPlaceholder: {
    width: '100%',
    height: verticalScale(220),
    justifyContent: 'center',
    alignItems: 'center',
  },
  vidPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vidPlayCircle: {
    width: scale(50),
    height: verticalScale(50),
    borderRadius: moderateScale(25),
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: moderateScale(12),
    borderWidth: 1,
    padding: moderateScale(10),
    marginVertical: verticalScale(3),
    gap: 10,
    width: '100%',
    minWidth: scale(220),
  },
  iconBox: {
    width: scale(42),
    height: scale(42),
    borderRadius: moderateScale(10),
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1, gap: 4 },
  fileName: { fontSize: moderateScale(13), fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: scale(6), paddingVertical: verticalScale(2), borderRadius: moderateScale(4) },
  badgeText: { fontSize: moderateScale(9), fontWeight: '700', letterSpacing: 0.5 },
  sizeText: { fontSize: moderateScale(11) },
  actionBtn: {
    width: scale(34),
    height: verticalScale(34),
    borderRadius: moderateScale(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
});
