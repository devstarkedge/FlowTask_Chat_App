import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import {
  Sparkles,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  X,
  Smartphone,
  Layers,
} from 'lucide-react-native';
import { useUpdateStore } from '../../stores/updateStore';
import { useThemeStore } from '../../stores/themeStore';
import { scale, moderateScale, verticalScale } from '../../utils/responsive';

export default function UpdateModals() {
  const colors = useThemeStore((state) => state.colors);
  const activeModal = useUpdateStore((state) => state.activeModal);
  const dismissModal = useUpdateStore((state) => state.dismissModal);
  const downloadUpdate = useUpdateStore((state) => state.downloadUpdate);
  const restartApp = useUpdateStore((state) => state.restartApp);
  const status = useUpdateStore((state) => state.status);
  const downloadProgress = useUpdateStore((state) => state.downloadProgress);
  const nativeAppVersion = useUpdateStore((state) => state.nativeAppVersion);
  const runningUpdateId = useUpdateStore((state) => state.runningUpdateId);
  const availableUpdate = useUpdateStore((state) => state.availableUpdate);
  const downloadedUpdate = useUpdateStore((state) => state.downloadedUpdate);
  const lastSuccessfulUpdate = useUpdateStore((state) => state.lastSuccessfulUpdate);

  if (activeModal === 'none') return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={activeModal !== 'none'}
      onRequestClose={dismissModal}
    >
      <TouchableWithoutFeedback onPress={dismissModal}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.backgroundSecondary || colors.background,
                  borderColor: colors.border,
                },
              ]}
            >
              {/* Top Close Button */}
              <TouchableOpacity
                onPress={dismissModal}
                style={styles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>

              {/* ────────────────────────────────────────── */}
              {/* 1. UPDATE AVAILABLE MODAL                 */}
              {/* ────────────────────────────────────────── */}
              {activeModal === 'available' && (
                <View style={styles.contentWrap}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: colors.primaryLight || 'rgba(59, 130, 246, 0.15)' },
                    ]}
                  >
                    <Sparkles size={28} color={colors.primary} />
                  </View>

                  <Text style={[styles.title, { color: colors.textPrimary }]}>
                    New Update Available
                  </Text>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>
                    An over-the-air update is ready to download. You can continue chatting while it
                    downloads in the background.
                  </Text>

                  {/* Version Comparison Card */}
                  <View style={[styles.infoCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={styles.infoRow}>
                      <View style={styles.labelCol}>
                        <Smartphone size={14} color={colors.textTertiary} style={styles.miniIcon} />
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                          Current Version:
                        </Text>
                      </View>
                      <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                        v{nativeAppVersion}
                      </Text>
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <View style={styles.infoRow}>
                      <View style={styles.labelCol}>
                        <Layers size={14} color={colors.textTertiary} style={styles.miniIcon} />
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                          Available Version:
                        </Text>
                      </View>
                      <Text style={[styles.infoValueHighlight, { color: colors.primary }]}>
                        New Update
                      </Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.secondaryButton, { borderColor: colors.border }]}
                      onPress={dismissModal}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>
                        Later
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                      onPress={downloadUpdate}
                      activeOpacity={0.8}
                    >
                      <Download size={16} color="#FFFFFF" style={styles.btnIcon} />
                      <Text style={styles.primaryButtonText}>Download Update</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ────────────────────────────────────────── */}
              {/* 2. DOWNLOADING MODAL                       */}
              {/* ────────────────────────────────────────── */}
              {activeModal === 'downloading' && (
                <View style={styles.contentWrap}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: colors.primaryLight || 'rgba(59, 130, 246, 0.15)' },
                    ]}
                  >
                    <Download size={28} color={colors.primary} />
                  </View>

                  <Text style={[styles.title, { color: colors.textPrimary }]}>
                    Downloading Update
                  </Text>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>
                    Downloading the latest changes in the background. You can continue working without
                    interruption.
                  </Text>

                  {/* Progress Bar */}
                  <View style={styles.progressContainer}>
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
                    <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                      {downloadProgress !== null
                        ? `${downloadProgress}% downloaded`
                        : 'Downloading assets…'}
                    </Text>
                  </View>

                  {/* Actions */}
                  <TouchableOpacity
                    style={[styles.secondaryButtonFull, { borderColor: colors.border }]}
                    onPress={dismissModal}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>
                      Continue in Background
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ────────────────────────────────────────── */}
              {/* 3. UPDATE READY MODAL                      */}
              {/* ────────────────────────────────────────── */}
              {activeModal === 'ready' && (
                <View style={styles.contentWrap}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
                    ]}
                  >
                    <RotateCcw size={28} color={colors.success || '#10b981'} />
                  </View>

                  <Text style={[styles.title, { color: colors.textPrimary }]}>
                    Update Ready!
                  </Text>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>
                    The latest update has been downloaded successfully. Restart the application to apply
                    the update.
                  </Text>

                  {/* Info Card */}
                  <View style={[styles.infoCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                        Current Installed:
                      </Text>
                      <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                        v{nativeAppVersion}
                      </Text>
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                        Downloaded Update:
                      </Text>
                      <Text style={[styles.infoValueHighlight, { color: colors.success || '#10b981' }]}>
                        Ready to Install
                      </Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.secondaryButton, { borderColor: colors.border }]}
                      onPress={dismissModal}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>
                        Later
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryButton, { backgroundColor: colors.success || '#10b981' }]}
                      onPress={restartApp}
                      activeOpacity={0.8}
                      disabled={status === 'restarting'}
                    >
                      {status === 'restarting' ? (
                        <ActivityIndicator size="small" color="#FFFFFF" style={styles.btnIcon} />
                      ) : (
                        <RotateCcw size={16} color="#FFFFFF" style={styles.btnIcon} />
                      )}
                      <Text style={styles.primaryButtonText}>
                        {status === 'restarting' ? 'Restarting…' : 'Restart Now'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ────────────────────────────────────────── */}
              {/* 4. UPDATE SUCCESS VERIFICATION MODAL       */}
              {/* ────────────────────────────────────────── */}
              {activeModal === 'success' && (
                <View style={styles.contentWrap}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
                    ]}
                  >
                    <CheckCircle2 size={32} color={colors.success || '#10b981'} />
                  </View>

                  <Text style={[styles.title, { color: colors.textPrimary }]}>
                    Update Successful!
                  </Text>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>
                    TaskChat has been successfully updated and verified.
                  </Text>

                  {/* Verified Card */}
                  <View style={[styles.infoCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                        Current Version:
                      </Text>
                      <Text style={[styles.infoValueHighlight, { color: colors.success || '#10b981' }]}>
                        v{nativeAppVersion}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButtonFull, { backgroundColor: colors.primary }]}
                    onPress={dismissModal}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.primaryButtonText}>Got it</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ────────────────────────────────────────── */}
              {/* 5. NATIVE APP UPDATE REQUIRED MODAL        */}
              {/* ────────────────────────────────────────── */}
              {activeModal === 'native-required' && (
                <View style={styles.contentWrap}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
                    ]}
                  >
                    <AlertTriangle size={30} color={colors.warning || '#f59e0b'} />
                  </View>

                  <Text style={[styles.title, { color: colors.textPrimary }]}>
                    App Store Update Required
                  </Text>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>
                    This update includes native dependency changes that cannot be installed over the air.
                    Please download the latest build from the store to continue.
                  </Text>

                  <View style={[styles.infoCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                        Current Binary:
                      </Text>
                      <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                        v{nativeAppVersion}
                      </Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                        Status:
                      </Text>
                      <Text style={[styles.infoValueHighlight, { color: colors.warning || '#f59e0b' }]}>
                        Store Upgrade Needed
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButtonFull, { backgroundColor: colors.primary }]}
                    onPress={dismissModal}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.primaryButtonText}>Understood</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(20),
  },
  modalCard: {
    width: '100%',
    maxWidth: scale(380),
    borderRadius: moderateScale(20),
    borderWidth: 1,
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(24),
    paddingBottom: verticalScale(20),
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  closeButton: {
    position: 'absolute',
    top: verticalScale(14),
    right: scale(14),
    zIndex: 10,
    padding: moderateScale(6),
  },
  contentWrap: {
    alignItems: 'center',
  },
  iconCircle: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(28),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(14),
  },
  title: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: verticalScale(8),
    letterSpacing: -0.3,
  },
  description: {
    fontSize: moderateScale(13.5),
    lineHeight: moderateScale(19),
    textAlign: 'center',
    marginBottom: verticalScale(16),
  },
  infoCard: {
    width: '100%',
    borderRadius: moderateScale(12),
    borderWidth: 1,
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(14),
    marginBottom: verticalScale(18),
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: verticalScale(4),
  },
  labelCol: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniIcon: {
    marginRight: scale(6),
  },
  infoLabel: {
    fontSize: moderateScale(12.5),
    fontWeight: '500',
  },
  infoValue: {
    fontSize: moderateScale(12.5),
    fontWeight: '600',
  },
  infoValueHighlight: {
    fontSize: moderateScale(12.5),
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: verticalScale(4),
  },
  progressContainer: {
    width: '100%',
    marginBottom: verticalScale(18),
  },
  progressBarTrack: {
    height: verticalScale(8),
    borderRadius: moderateScale(4),
    overflow: 'hidden',
    width: '100%',
    marginBottom: verticalScale(6),
  },
  progressBarFill: {
    height: '100%',
    borderRadius: moderateScale(4),
  },
  progressText: {
    fontSize: moderateScale(12),
    textAlign: 'center',
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: scale(10),
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  secondaryButtonFull: {
    width: '100%',
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 1.5,
    flexDirection: 'row',
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonFull: {
    width: '100%',
    flexDirection: 'row',
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: moderateScale(14),
    fontWeight: '700',
  },
  btnIcon: {
    marginRight: scale(6),
  },
});
