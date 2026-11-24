import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { RefreshCw, X, RotateCcw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore } from '../../stores/themeStore';
import { useUpdateStore } from '../../stores/updateStore';
import UpdateModals from '../updates/UpdateModals';

export default function ExpoUpdateBanner() {
  const insets = useSafeAreaInsets();
  const colors = useThemeStore((state) => state.colors);

  // Hook into native Expo Updates reactive state safely
  const expoUpdates = Updates.useUpdates ? Updates.useUpdates() : null;
  const isDownloading = Boolean(expoUpdates?.isDownloading);
  const isUpdatePending = Boolean(expoUpdates?.isUpdatePending);
  const isChecking = Boolean(expoUpdates?.isChecking);
  const rawProgress = expoUpdates?.downloadProgress;
  const downloadErrMsg = expoUpdates?.downloadError?.message;
  const checkErrMsg = expoUpdates?.checkError?.message;

  // Selective subscriptions to prevent unnecessary renders
  const status = useUpdateStore((state) => state.status);
  const downloadProgress = useUpdateStore((state) => state.downloadProgress);
  const activeModal = useUpdateStore((state) => state.activeModal);
  const restartApp = useUpdateStore((state) => state.restartApp);
  const openModal = useUpdateStore((state) => state.openModal);

  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Initialize updater and post-restart verification once on mount
  useEffect(() => {
    useUpdateStore.getState().initUpdater();
  }, []);

  // Sync native Expo Updates state to store safely using primitive dependencies
  useEffect(() => {
    if (!expoUpdates) return;
    useUpdateStore.getState().syncWithExpoUpdates({
      isDownloading,
      isUpdatePending,
      downloadProgress: rawProgress,
      isChecking,
      downloadError: expoUpdates.downloadError,
      checkError: expoUpdates.checkError,
    });
  }, [isDownloading, isUpdatePending, rawProgress, isChecking, downloadErrMsg, checkErrMsg]);

  const ready = status === 'downloaded' || isUpdatePending;
  const downloading = status === 'downloading' || isDownloading;
  const restarting = status === 'restarting';

  // Re-show banner if a new update becomes ready
  useEffect(() => {
    if (ready) {
      setBannerDismissed(false);
    }
  }, [ready]);

  const progress =
    downloadProgress !== null
      ? downloadProgress
      : Number.isFinite(rawProgress)
        ? Math.min(100, Math.max(0, Math.round(rawProgress * 100)))
        : null;

  // Don't show top banner if a full modal is already active or banner is dismissed or idle
  const showBanner =
    !bannerDismissed &&
    activeModal === 'none' &&
    (ready || downloading);

  return (
    <>
      {/* Desktop-like full modals for Available, Downloading, Ready, and Verified Success */}
      <UpdateModals />

      {/* Floating status banner when modals are dismissed but update is downloading or ready */}
      {showBanner && (
        <View pointerEvents="box-none" style={styles.overlay}>
          <Pressable
            accessibilityLiveRegion="polite"
            onPress={() => openModal(ready ? 'ready' : 'downloading')}
            style={[
              styles.card,
              {
                top: Math.max(insets.top, 8) + 8,
                backgroundColor: colors.backgroundSecondary || colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: ready
                    ? 'rgba(16, 185, 129, 0.15)'
                    : colors.primaryLight || 'rgba(59, 130, 246, 0.15)',
                },
              ]}
            >
              {ready ? (
                <RotateCcw size={18} color={colors.success || '#10b981'} />
              ) : (
                <RefreshCw size={18} color={colors.primary} />
              )}
            </View>

            <View style={styles.copy}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                {ready ? 'Update ready to install' : 'Downloading update…'}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {ready
                  ? 'Tap to restart TaskChat and apply changes.'
                  : progress === null
                    ? 'Downloading in background…'
                    : `${progress}% downloaded`}
              </Text>
            </View>

            {ready ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Restart to update TaskChat"
                disabled={restarting}
                onPress={(e) => {
                  e.stopPropagation?.();
                  restartApp();
                }}
                style={[styles.action, { backgroundColor: colors.success || '#10b981' }]}
              >
                <Text style={styles.actionText}>{restarting ? 'Restarting…' : 'Restart'}</Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss update notice"
              hitSlop={10}
              onPress={(e) => {
                e.stopPropagation?.();
                setBannerDismissed(true);
              }}
              style={styles.dismiss}
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </Pressable>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 20,
  },
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  copy: {
    flex: 1,
    minWidth: 80,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  actionText: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  dismiss: {
    padding: 6,
    marginLeft: 4,
  },
});
