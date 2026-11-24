import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import {
  Sparkles,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react-native';
import { useUpdateStore } from '../../stores/updateStore';
import { useThemeStore } from '../../stores/themeStore';
import { scale, moderateScale, verticalScale } from '../../utils/responsive';

export default function AboutUpdateSection() {
  const colors = useThemeStore((state) => state.colors);
  const status = useUpdateStore((state) => state.status);
  const nativeAppVersion = useUpdateStore((state) => state.nativeAppVersion);
  const availableUpdate = useUpdateStore((state) => state.availableUpdate);
  const downloadedUpdate = useUpdateStore((state) => state.downloadedUpdate);
  const downloadProgress = useUpdateStore((state) => state.downloadProgress);
  const error = useUpdateStore((state) => state.error);
  const lastCheckedAt = useUpdateStore((state) => state.lastCheckedAt);
  const lastSuccessfulUpdate = useUpdateStore((state) => state.lastSuccessfulUpdate);
  const checkForUpdate = useUpdateStore((state) => state.checkForUpdate);
  const downloadUpdate = useUpdateStore((state) => state.downloadUpdate);
  const restartApp = useUpdateStore((state) => state.restartApp);

  const handleCheck = () => {
    checkForUpdate({ isManual: true });
  };

  return (
    <View style={styles.container}>
      {/* ────────────────────────────────────────── */}
      {/* 1. App Header Card (Matches Desktop)       */}
      {/* ────────────────────────────────────────── */}
      <View
        style={[
          styles.headerCard,
          {
            backgroundColor: colors.backgroundSecondary || colors.background,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.logoWrap}>
          <Image
            source={require('../../../assets/Vector.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.headerInfo}>
          <View style={styles.titleRow}>
            <Text style={[styles.appName, { color: colors.textPrimary }]}>TaskChat</Text>
            <View style={styles.mobileBadge}>
              <Text style={styles.mobileBadgeText}>Mobile</Text>
            </View>
          </View>
          <Text style={[styles.appDescription, { color: colors.textSecondary }]}>
            Real-time team communication and huddle collaboration
          </Text>
        </View>
      </View>

      {/* ────────────────────────────────────────── */}
      {/* 2. Version Status Card (Matches Desktop)   */}
      {/* ────────────────────────────────────────── */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.backgroundSecondary || colors.background,
            borderColor: colors.border,
          },
        ]}
      >
        {/* Installed Version Header & Check Button */}
        <View style={styles.versionRow}>
          <View>
            <Text style={[styles.versionLabel, { color: colors.textTertiary }]}>
              INSTALLED VERSION
            </Text>
            <Text style={[styles.versionValue, { color: colors.textPrimary }]}>
              v{nativeAppVersion}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.checkBtn, { borderColor: colors.border }]}
            onPress={handleCheck}
            disabled={status === 'checking' || status === 'downloading' || status === 'restarting'}
            activeOpacity={0.7}
          >
            {status === 'checking' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <RefreshCw size={13} color={colors.primary} style={styles.btnIcon} />
            )}
            <Text style={[styles.checkBtnText, { color: colors.primary }]}>
              {status === 'checking' ? 'Checking for updates…' : 'Check for Updates'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Status Indicator Banners ── */}

        {/* Up To Date Banner */}
        {status === 'up-to-date' && (
          <View
            style={[
              styles.statusBanner,
              {
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderColor: 'rgba(16, 185, 129, 0.25)',
              },
            ]}
          >
            <CheckCircle2 size={16} color={colors.success || '#10b981'} style={styles.bannerIcon} />
            <Text style={[styles.bannerText, { color: colors.success || '#10b981' }]}>
              TaskChat is up to date (version {nativeAppVersion}).
            </Text>
          </View>
        )}

        {/* Error Banner */}
        {status === 'error' && error && (
          <View
            style={[
              styles.statusBanner,
              {
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderColor: 'rgba(239, 68, 68, 0.25)',
              },
            ]}
          >
            <AlertTriangle size={16} color={colors.error || '#ef4444'} style={styles.bannerIcon} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTextBold, { color: colors.error || '#ef4444' }]}>
                Update check failed:
              </Text>
              <Text style={[styles.bannerSubText, { color: colors.error || '#ef4444' }]}>
                {error}
              </Text>
            </View>
          </View>
        )}

        {/* Available Update Card */}
        {status === 'available' && (
          <View
            style={[
              styles.actionCard,
              {
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderColor: 'rgba(59, 130, 246, 0.3)',
              },
            ]}
          >
            <View style={styles.actionCardHeader}>
              <View style={styles.actionCardTitleRow}>
                <Sparkles size={16} color="#3b82f6" />
                <Text style={styles.availableTitle}>
                  New Version Available
                </Text>
              </View>
              {availableUpdate?.createdAt && (
                <Text style={[styles.actionCardDate, { color: colors.textTertiary }]}>
                  {new Date(availableUpdate.createdAt).toLocaleDateString()}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
              onPress={downloadUpdate}
              activeOpacity={0.8}
            >
              <Download size={15} color="#FFFFFF" style={styles.btnIcon} />
              <Text style={styles.primaryActionBtnText}>Download Update</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Downloading State Card */}
        {status === 'downloading' && (
          <View
            style={[
              styles.actionCard,
              {
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                borderColor: 'rgba(59, 130, 246, 0.25)',
              },
            ]}
          >
            <View style={styles.downloadingRow}>
              <Text style={[styles.downloadingText, { color: colors.textPrimary }]}>
                Downloading update…
              </Text>
              <Text style={styles.downloadingPercent}>
                {downloadProgress !== null ? `${downloadProgress}%` : ''}
              </Text>
            </View>

            <View style={[styles.progressBarTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: colors.primary,
                    width: `${downloadProgress !== null ? Math.min(100, Math.max(0, downloadProgress)) : 0}%`,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Downloaded / Ready State Card */}
        {status === 'downloaded' && (
          <View
            style={[
              styles.actionCard,
              {
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderColor: 'rgba(16, 185, 129, 0.3)',
              },
            ]}
          >
            <View style={styles.readyHeader}>
              <CheckCircle2 size={18} color={colors.success || '#10b981'} />
              <View style={{ marginLeft: scale(8), flex: 1 }}>
                <Text style={[styles.readyTitle, { color: colors.textPrimary }]}>
                  Update Ready to Install
                </Text>
                <Text style={[styles.readySubtitle, { color: colors.textSecondary }]}>
                  Restart now to complete the update.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: colors.success || '#10b981' }]}
              onPress={restartApp}
              activeOpacity={0.8}
            >
              <RotateCcw size={15} color="#FFFFFF" style={styles.btnIcon} />
              <Text style={styles.primaryActionBtnText}>Restart Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Update Successful State Banner */}
        {status === 'update-success' && (
          <View
            style={[
              styles.statusBanner,
              {
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderColor: 'rgba(16, 185, 129, 0.3)',
              },
            ]}
          >
            <CheckCircle2 size={16} color={colors.success || '#10b981'} style={styles.bannerIcon} />
            <Text style={[styles.bannerText, { color: colors.success || '#10b981' }]}>
              TaskChat has been successfully updated and verified.
            </Text>
          </View>
        )}

        {/* Footer Meta Row */}
        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.textTertiary }]}>
            Last checked:{' '}
            {lastCheckedAt
              ? new Date(lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Never in this session'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: verticalScale(14),
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: moderateScale(14),
    borderRadius: moderateScale(14),
    borderWidth: 1,
  },
  logoWrap: {
    width: scale(48),
    height: scale(48),
    borderRadius: moderateScale(12),
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(12),
  },
  logoImage: {
    width: scale(32),
    height: scale(32),
  },
  headerInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  appName: {
    fontSize: moderateScale(17),
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  mobileBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.25)',
    borderWidth: 1,
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(1),
    borderRadius: moderateScale(5),
  },
  mobileBadgeText: {
    fontSize: moderateScale(10.5),
    fontWeight: '600',
    color: '#3b82f6',
  },
  appDescription: {
    fontSize: moderateScale(12),
    marginTop: verticalScale(3),
    lineHeight: moderateScale(16),
  },
  card: {
    padding: moderateScale(14),
    borderRadius: moderateScale(14),
    borderWidth: 1,
    gap: verticalScale(12),
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  versionLabel: {
    fontSize: moderateScale(10.5),
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  versionValue: {
    fontSize: moderateScale(15),
    fontWeight: '700',
    marginTop: verticalScale(2),
  },
  checkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(8),
    borderWidth: 1,
  },
  checkBtnText: {
    fontSize: moderateScale(12),
    fontWeight: '600',
  },
  btnIcon: {
    marginRight: scale(5),
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(12),
    borderRadius: moderateScale(8),
    borderWidth: 1,
  },
  bannerIcon: {
    marginRight: scale(8),
  },
  bannerText: {
    fontSize: moderateScale(12.5),
    fontWeight: '500',
    flex: 1,
  },
  bannerTextBold: {
    fontSize: moderateScale(12.5),
    fontWeight: '700',
  },
  bannerSubText: {
    fontSize: moderateScale(11.5),
    marginTop: verticalScale(2),
  },
  actionCard: {
    padding: moderateScale(12),
    borderRadius: moderateScale(10),
    borderWidth: 1,
    gap: verticalScale(10),
  },
  actionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  availableTitle: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: '#2563eb',
  },
  actionCardDate: {
    fontSize: moderateScale(11),
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(9),
    borderRadius: moderateScale(8),
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: moderateScale(13),
    fontWeight: '700',
  },
  downloadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  downloadingText: {
    fontSize: moderateScale(12.5),
    fontWeight: '600',
  },
  downloadingPercent: {
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    color: '#3b82f6',
  },
  progressBarTrack: {
    height: verticalScale(6),
    borderRadius: moderateScale(3),
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: moderateScale(3),
  },
  readyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  readyTitle: {
    fontSize: moderateScale(13.5),
    fontWeight: '700',
  },
  readySubtitle: {
    fontSize: moderateScale(11.5),
    marginTop: verticalScale(1),
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: verticalScale(2),
  },
  footerText: {
    fontSize: moderateScale(11),
  },
});
