import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions } from 'react-native';
import { FileText, ChevronRight, Copy, Check } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';
import { canvasAPI } from '../../services/api';
import { navigateApp } from '../../services/pushNotificationService';
import ENV from '../../config/environment';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(Math.max(SCREEN_WIDTH * 0.74, 270), 320);

export default function CanvasDocumentCard({ canvasData, channelId, navigation, colors }) {
  const [details, setDetails] = useState({
    title: canvasData?.title && canvasData.title !== 'Canvas Document' ? canvasData.title : '',
    previewText: canvasData?.previewText || '',
  });
  const [copied, setCopied] = useState(false);

  const canvasId = canvasData?.canvasId;
  const isPublic = canvasData?.isPublic;
  const token = canvasData?.token;

  useEffect(() => {
    let isMounted = true;
    if (canvasId && (!details.title || !details.previewText)) {
      canvasAPI
        .getById(canvasId)
        .then((res) => {
          if (!isMounted) return;
          const c = res.data?.data?.canvas || res.data?.data;
          if (c) {
            setDetails((prev) => ({
              title: prev.title || c.title || 'Canvas Document',
              previewText: prev.previewText || c.summary || (typeof c.content === 'string' ? c.content.slice(0, 100) : ''),
            }));
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [canvasId]);

  let hookNav;
  try {
    hookNav = useNavigation();
  } catch (e) {}
  const nav = navigation || hookNav;

  const handleOpen = () => {
    const targetCanvasId = canvasId || canvasData?.canvasId;
    const targetToken = token || canvasData?.token;

    if (targetCanvasId || targetToken) {
      if (nav && nav.navigate) {
        nav.navigate('CanvasEditor', {
          canvasId: targetCanvasId,
          token: targetToken,
          channelId: channelId || canvasData?.channelId,
        });
        return;
      }
      navigateApp('CanvasEditor', {
        canvasId: targetCanvasId,
        token: targetToken,
        channelId: channelId || canvasData?.channelId,
      });
    }
  };

  const handleCopyLink = async () => {
    const url = isPublic && token
      ? `${ENV.CLIENT_URL}/public/canvas/${token}`
      : `${ENV.CLIENT_URL}/canvas/${canvasId}`;
    await Clipboard.setStringAsync(url);
    setCopied(true);
    Toast.show({ type: 'success', text1: 'Canvas link copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  const displayTitle = details.title || canvasData?.title || 'Canvas Document';
  const displayPreview = details.previewText || canvasData?.previewText || '';

  return (
    <TouchableOpacity
      onPress={handleOpen}
      activeOpacity={0.88}
      style={[
        styles.card,
        {
          width: CARD_WIDTH,
          backgroundColor: colors.card || '#ffffff',
          borderColor: colors.border || '#e2e8f0',
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <FileText size={22} color="#0284c7" />
        </View>

        <View style={styles.textContainer}>
          <Text
            style={[styles.title, { color: colors.textPrimary || '#1e293b' }]}
            numberOfLines={1}
          >
            {displayTitle}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary || '#64748b' }]}>
            {isPublic ? 'Public Canvas · Tap to view' : 'Canvas Document · Tap to open'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            handleCopyLink();
          }}
          style={[styles.copyButton, { borderColor: colors.border || '#e2e8f0', backgroundColor: colors.backgroundSecondary || '#f8fafc' }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Copy Canvas link"
        >
          {copied ? (
            <Check size={14} color="#10b981" />
          ) : (
            <Copy size={14} color={colors.textSecondary || '#64748b'} />
          )}
        </TouchableOpacity>
      </View>

      {displayPreview ? (
        <View style={styles.previewContainer}>
          <Text
            style={[styles.previewText, { color: colors.textSecondary || '#64748b' }]}
            numberOfLines={2}
          >
            {displayPreview}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.backgroundSecondary || '#f8fafc',
            borderTopColor: colors.border || '#e2e8f0',
          },
        ]}
      >
        <Text style={[styles.openLabel, { color: colors.primary || '#6366f1' }]}>
          Open Document
        </Text>
        <ChevronRight size={15} color={colors.primary || '#6366f1'} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: moderateScale(14),
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: verticalScale(4),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(14),
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(12),
    gap: scale(10),
  },
  iconContainer: {
    width: scale(42),
    height: scale(42),
    borderRadius: moderateScale(11),
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  title: {
    fontSize: moderateScale(14.5),
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: verticalScale(2),
  },
  subtitle: {
    fontSize: moderateScale(12),
  },
  copyButton: {
    width: scale(30),
    height: scale(30),
    borderRadius: moderateScale(8),
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContainer: {
    paddingHorizontal: scale(14),
    paddingBottom: verticalScale(10),
  },
  previewText: {
    fontSize: moderateScale(12),
    lineHeight: 17,
  },
  footer: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(9),
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  openLabel: {
    fontSize: moderateScale(13),
    fontWeight: '600',
  },
});
