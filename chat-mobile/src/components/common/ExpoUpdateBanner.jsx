import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Check, RefreshCw, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore } from '../../stores/themeStore';

const MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export default function ExpoUpdateBanner() {
  const insets = useSafeAreaInsets();
  const colors = useThemeStore((state) => state.colors);
  const {
    isStartupProcedureRunning,
    isDownloading,
    isUpdatePending,
    downloadProgress,
  } = Updates.useUpdates();
  const lastCheckAt = useRef(0);
  const checkInFlight = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const checkAndDownload = useCallback(async () => {
    if (!Updates.isEnabled || checkInFlight.current) return;
    if (Date.now() - lastCheckAt.current < MIN_CHECK_INTERVAL_MS) return;

    checkInFlight.current = true;
    lastCheckAt.current = Date.now();
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) await Updates.fetchUpdateAsync();
    } catch (error) {
      console.warn('[Updates] Check or download failed:', error?.message);
    } finally {
      checkInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!Updates.isEnabled || isStartupProcedureRunning) return undefined;

    if (AppState.currentState === 'active') checkAndDownload();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAndDownload();
    });
    return () => subscription.remove();
  }, [checkAndDownload, isStartupProcedureRunning]);

  useEffect(() => {
    if (isUpdatePending) setDismissed(false);
  }, [isUpdatePending]);

  const restartToUpdate = async () => {
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch (error) {
      console.warn('[Updates] Restart failed:', error?.message);
      setRestarting(false);
    }
  };

  if (!Updates.isEnabled || dismissed || (!isUpdatePending && !isDownloading)) return null;

  const ready = isUpdatePending;
  const progress = Number.isFinite(downloadProgress)
    ? Math.min(100, Math.max(0, Math.round(downloadProgress * 100)))
    : null;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View
        accessibilityLiveRegion="polite"
        style={[
          styles.card,
          {
            top: Math.max(insets.top, 8) + 8,
            backgroundColor: colors.backgroundSecondary || colors.background,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight || colors.primary }]}>
          {ready ? <Check size={18} color={colors.primary} /> : <RefreshCw size={18} color={colors.primary} />}
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {ready ? 'Update ready' : 'Downloading update'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {ready
              ? 'Restart TaskChat to use the latest version.'
              : progress === null ? 'Your app will be ready shortly.' : `${progress}% downloaded`}
          </Text>
        </View>
        {ready ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restart to update TaskChat"
            disabled={restarting}
            onPress={restartToUpdate}
            style={[styles.action, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.actionText}>{restarting ? 'Restarting…' : 'Restart'}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss update notice"
          hitSlop={10}
          onPress={() => setDismissed(true)}
          style={styles.dismiss}
        >
          <X size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
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
    minHeight: 68,
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
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 9,
    marginLeft: 8,
  },
  actionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  dismiss: {
    padding: 5,
    marginLeft: 5,
  },
});
