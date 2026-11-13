import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  Hash,
  Lock,
  Trash2,
  X,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { getChannelPermissions } from '../utils/channelOrigin';
import { moderateScale, scale, verticalScale } from '../utils/responsive';
import useResponsive from '../hooks/useResponsive';
import Button from './common/Button';
import IconButton from './common/IconButton';

/**
 * EditChannelModal — Mobile counterpart to chat-desktop's EditChannelModal.
 * Supports editing name, visibility (custom channels), canvas permissions,
 * topic, description, and deleting custom channels when authorized.
 */
const EditChannelModal = ({ visible, channel, members = [], onClose, onDeleted }) => {
  const { colors } = useThemeStore();
  const { isTablet, isDesktop, width } = useResponsive();
  const isWide = isTablet || isDesktop || width > 640;

  const editChannel = useChannelStore((s) => s.editChannel);
  const deleteChannel = useChannelStore((s) => s.deleteChannel);
  const user = useAuthStore((s) => s.user);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [topic, setTopic] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [allowAllMembersEditCanvas, setAllowAllMembersEditCanvas] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !channel) return;
    setName(channel.name || '');
    setDescription(channel.description || '');
    setTopic(channel.topic || '');
    setVisibility(
      channel.visibility ||
        (channel.type === 'private' ? 'private' : 'public')
    );
    setAllowAllMembersEditCanvas(channel.allowAllMembersEditCanvas !== false);
    setError('');
    setIsSubmitting(false);
  }, [visible, channel]);

  const initialVisibility =
    channel?.visibility || (channel?.type === 'private' ? 'private' : 'public');
  const {
    isSystem,
    isLocked,
    canDeleteChannel,
  } = getChannelPermissions({ channel, members, user, activeWorkspace });

  const isDirty = useMemo(() => {
    if (!channel) return false;
    return (
      name !== (channel.name || '') ||
      description !== (channel.description || '') ||
      topic !== (channel.topic || '') ||
      visibility !== initialVisibility ||
      allowAllMembersEditCanvas !== (channel.allowAllMembersEditCanvas !== false)
    );
  }, [channel, name, description, topic, visibility, initialVisibility, allowAllMembersEditCanvas]);

  if (!channel) return null;

  const handleToggleCanvasPermission = async (newValue) => {
    const previous = allowAllMembersEditCanvas;
    setAllowAllMembersEditCanvas(newValue);
    try {
      await editChannel(channel._id, { allowAllMembersEditCanvas: newValue });
      Toast.show({
        type: 'success',
        text1: newValue
          ? 'All members can now edit canvases'
          : 'Only admins can now edit canvases',
      });
    } catch {
      setAllowAllMembersEditCanvas(previous);
    }
  };

  const handleSubmit = async () => {
    if (!isLocked && !name.trim()) {
      setError('Channel name is required');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const payload = {
        description: description.trim(),
        topic: topic.trim(),
        allowAllMembersEditCanvas,
      };
      if (!isLocked) {
        payload.name = name.trim();
        payload.visibility = visibility;
      }
      await editChannel(channel._id, payload);
      onClose?.();
    } catch (err) {
      setError(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          'Failed to update channel'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePress = () => {
    Alert.alert(
      'Delete channel',
      `Are you sure you want to delete #${channel.name}? The channel and all its membership associations will be permanently removed. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Channel',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await deleteChannel(channel._id);
              onClose?.();
              onDeleted?.();
            } catch {
              // Error toast is shown by channelStore.deleteChannel
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => !isSubmitting && onClose?.()}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={[
          styles.overlay,
          { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' },
          isWide && styles.wideOverlay,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => !isSubmitting && onClose?.()}
        />

        <View
          style={[
            styles.container,
            { backgroundColor: colors.background },
            isWide && styles.wideContainer,
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <IconButton
              icon={X}
              onPress={() => !isSubmitting && onClose?.()}
              size={40}
              iconSize={22}
              variant="ghost"
              style={{ marginLeft: -8 }}
            />
            <View style={styles.headerCenter}>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                Edit Channel
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                #{channel.name}
                {isLocked ? (isSystem ? ' • System' : ' • Project') : ''}
              </Text>
            </View>
            <Button
              title={isSubmitting ? 'Saving' : 'Save'}
              variant="primary"
              onPress={handleSubmit}
              disabled={!isDirty || isSubmitting || (!isLocked && !name.trim())}
              loading={isSubmitting}
              style={{ minHeight: moderateScale(36), paddingVertical: moderateScale(6) }}
            />
          </View>

          {/* Form Body */}
          <ScrollView
            style={styles.form}
            contentContainerStyle={{ paddingBottom: verticalScale(40) }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {!!error && (
              <View style={[styles.errorBox, { backgroundColor: '#EF44441A', borderColor: '#EF444440' }]}>
                <AlertTriangle size={16} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Channel Name */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  CHANNEL NAME {!isLocked && <Text style={{ color: '#EF4444' }}>*</Text>}
                </Text>
                <Text style={[styles.charCount, { color: colors.textTertiary }]}>
                  {name.length}/50
                </Text>
              </View>
              <View
                style={[
                  styles.inputWrap,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.inputBackground || colors.backgroundSecondary,
                    opacity: isLocked ? 0.6 : 1,
                  },
                ]}
              >
                {visibility === 'private' ? (
                  <Lock size={16} color={colors.textTertiary} />
                ) : (
                  <Hash size={16} color={colors.textTertiary} />
                )}
                <TextInput
                  style={[styles.input, { color: colors.inputText || colors.textPrimary }]}
                  value={name}
                  onChangeText={(text) =>
                    setName(text.toLowerCase().replace(/[^a-z0-9-_]/g, '-'))
                  }
                  editable={!isLocked && !isSubmitting}
                  maxLength={50}
                  placeholder="channel-name"
                  placeholderTextColor={colors.inputPlaceholder || colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {isLocked && (
                <View style={styles.lockedHintRow}>
                  <AlertTriangle size={13} color="#D97706" />
                  <Text style={[styles.lockedHintText, { color: colors.textSecondary }]}>
                    {isSystem
                      ? 'System channel names cannot be modified'
                      : 'Project channel names are synced from FlowTask'}
                  </Text>
                </View>
              )}
            </View>

            {/* Visibility (Custom Channels) */}
            {!isLocked && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textSecondary, marginBottom: verticalScale(8) }]}>
                  VISIBILITY
                </Text>
                <View style={styles.visibilityGrid}>
                  {[
                    {
                      value: 'public',
                      Icon: Globe,
                      label: 'Public',
                      sub: 'Anyone in the workspace can join',
                    },
                    {
                      value: 'private',
                      Icon: Lock,
                      label: 'Private',
                      sub: 'Only invited members can access',
                    },
                  ].map(({ value, Icon, label, sub }) => {
                    const active = visibility === value;
                    return (
                      <TouchableOpacity
                        key={value}
                        activeOpacity={0.8}
                        disabled={isSubmitting}
                        onPress={() => setVisibility(value)}
                        style={[
                          styles.visibilityCard,
                          {
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active
                              ? `${colors.primary}14`
                              : colors.backgroundSecondary,
                          },
                        ]}
                      >
                        <View style={styles.visibilityCardTop}>
                          <View
                            style={[
                              styles.visibilityIconBox,
                              {
                                backgroundColor: active
                                  ? `${colors.primary}22`
                                  : colors.background,
                              },
                            ]}
                          >
                            <Icon
                              size={15}
                              color={active ? colors.primary : colors.textSecondary}
                            />
                          </View>
                          {active && <CheckCircle2 size={16} color={colors.primary} />}
                        </View>
                        <Text
                          style={[
                            styles.visibilityTitle,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {label}
                        </Text>
                        <Text
                          style={[
                            styles.visibilitySub,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {sub}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Canvas Permissions (Private Channels Only) */}
            {visibility === 'private' && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textSecondary, marginBottom: verticalScale(8) }]}>
                  CANVAS PERMISSIONS
                </Text>
                <View
                  style={[
                    styles.permissionCard,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.backgroundSecondary,
                    },
                  ]}
                >
                  <View style={{ flex: 1, paddingRight: scale(12) }}>
                    <Text style={[styles.permissionTitle, { color: colors.textPrimary }]}>
                      Allow all channel members to edit canvases
                    </Text>
                    <Text style={[styles.permissionSub, { color: colors.textSecondary }]}>
                      When disabled, only admins can edit canvases in this private channel.
                    </Text>
                  </View>
                  <Switch
                    value={allowAllMembersEditCanvas}
                    onValueChange={handleToggleCanvasPermission}
                    disabled={isSubmitting}
                    trackColor={{ false: '#767577', true: `${colors.primary}80` }}
                    thumbColor={allowAllMembersEditCanvas ? colors.primary : '#f4f3f4'}
                  />
                </View>
              </View>
            )}

            {/* Topic */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  TOPIC <Text style={styles.optionalTag}>(optional)</Text>
                </Text>
                <Text style={[styles.charCount, { color: colors.textTertiary }]}>
                  {topic.length}/250
                </Text>
              </View>
              <View
                style={[
                  styles.inputWrap,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.inputBackground || colors.backgroundSecondary,
                  },
                ]}
              >
                <TextInput
                  style={[styles.input, { color: colors.inputText || colors.textPrimary }]}
                  value={topic}
                  onChangeText={setTopic}
                  editable={!isSubmitting}
                  maxLength={250}
                  placeholder="What is this channel currently about?"
                  placeholderTextColor={colors.inputPlaceholder || colors.textTertiary}
                />
              </View>
            </View>

            {/* Description */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  DESCRIPTION <Text style={styles.optionalTag}>(optional)</Text>
                </Text>
                <Text style={[styles.charCount, { color: colors.textTertiary }]}>
                  {description.length}/250
                </Text>
              </View>
              <View
                style={[
                  styles.inputWrap,
                  styles.textareaWrap,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.inputBackground || colors.backgroundSecondary,
                  },
                ]}
              >
                <TextInput
                  style={[
                    styles.input,
                    styles.textarea,
                    { color: colors.inputText || colors.textPrimary },
                  ]}
                  value={description}
                  onChangeText={setDescription}
                  editable={!isSubmitting}
                  maxLength={250}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  placeholder="Help others understand what this channel is for..."
                  placeholderTextColor={colors.inputPlaceholder || colors.textTertiary}
                />
              </View>
            </View>

            {/* Danger Zone — Custom Channels Only */}
            {canDeleteChannel && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: '#EF4444', marginBottom: verticalScale(8) }]}>
                  DANGER ZONE
                </Text>
                <View style={styles.dangerCard}>
                  <View style={{ flex: 1, paddingRight: scale(12) }}>
                    <View style={styles.dangerTitleRow}>
                      <Trash2 size={15} color="#EF4444" />
                      <Text style={styles.dangerTitle}>Delete Channel</Text>
                    </View>
                    <Text style={[styles.dangerSub, { color: colors.textSecondary }]}>
                      Permanently remove this channel and all its membership associations.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.dangerBtn}
                    onPress={handleDeletePress}
                    disabled={isSubmitting}
                    activeOpacity={0.75}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Trash2 size={14} color="#fff" />
                        <Text style={styles.dangerBtnText}>Delete</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  wideOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: moderateScale(20),
  },
  container: {
    height: '88%',
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    overflow: 'hidden',
  },
  wideContainer: {
    width: '100%',
    maxWidth: 560,
    height: '82%',
    borderRadius: moderateScale(20),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: scale(8),
  },
  title: {
    fontSize: moderateScale(17),
    fontWeight: '700',
  },
  subtitle: {
    fontSize: moderateScale(12),
    marginTop: 2,
  },
  form: {
    flex: 1,
    paddingHorizontal: scale(18),
    paddingTop: verticalScale(16),
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: moderateScale(12),
    borderRadius: moderateScale(10),
    borderWidth: 1,
    marginBottom: verticalScale(14),
  },
  errorText: {
    flex: 1,
    color: '#EF4444',
    fontSize: moderateScale(13),
    fontWeight: '500',
  },
  fieldGroup: {
    marginBottom: verticalScale(18),
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(6),
  },
  label: {
    fontSize: moderateScale(11.5),
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  optionalTag: {
    fontWeight: '500',
    textTransform: 'none',
    opacity: 0.75,
  },
  charCount: {
    fontSize: moderateScale(11),
    fontWeight: '600',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: moderateScale(10),
    paddingHorizontal: scale(12),
    minHeight: moderateScale(44),
    gap: 8,
  },
  textareaWrap: {
    alignItems: 'flex-start',
    paddingVertical: verticalScale(10),
  },
  input: {
    flex: 1,
    fontSize: moderateScale(15),
    paddingVertical: verticalScale(6),
  },
  textarea: {
    minHeight: verticalScale(72),
  },
  lockedHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: verticalScale(6),
  },
  lockedHintText: {
    fontSize: moderateScale(12),
  },
  visibilityGrid: {
    flexDirection: 'row',
    gap: scale(10),
  },
  visibilityCard: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: moderateScale(12),
    padding: moderateScale(12),
  },
  visibilityCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(8),
  },
  visibilityIconBox: {
    width: moderateScale(30),
    height: moderateScale(30),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityTitle: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    marginBottom: 2,
  },
  visibilitySub: {
    fontSize: moderateScale(11.5),
    lineHeight: moderateScale(16),
  },
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: moderateScale(12),
    padding: moderateScale(12),
  },
  permissionTitle: {
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  permissionSub: {
    fontSize: moderateScale(12),
    marginTop: 3,
    lineHeight: moderateScale(16),
  },
  dangerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: moderateScale(12),
    padding: moderateScale(14),
  },
  dangerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dangerTitle: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: '#EF4444',
  },
  dangerSub: {
    fontSize: moderateScale(12),
    marginTop: 4,
    lineHeight: moderateScale(16),
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EF4444',
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(9),
    borderRadius: moderateScale(8),
  },
  dangerBtnText: {
    color: '#fff',
    fontSize: moderateScale(13),
    fontWeight: '700',
  },
});

export default EditChannelModal;
