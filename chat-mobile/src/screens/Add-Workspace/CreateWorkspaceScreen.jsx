import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { HeaderBackButton } from '../../components/common';
import {
  X,
  Mail,
  Info,
  Check,
  Grid,
  UserPlus,
  Plus,
} from 'lucide-react-native';
import CreateWorkspaceModal from '../../components/workspace/CreateWorkspaceModal';
import Toast from 'react-native-toast-message';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';


const CreateWorkspaceScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { joinByInviteCode, switchWorkspace, fetchWorkspaces } = useWorkspaceStore();

  const [createVisible, setCreateVisible] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);

  const styles = createStyles(colors);

  const handleSignOut = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out to log in to another workspace?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  const handleJoinWorkspace = async () => {
    const code = inviteCode.trim();
    if (!code) {
      setJoinError('Invite code is required');
      return;
    }

    setJoining(true);
    setJoinError(null);
    try {
      const workspace = await joinByInviteCode(code);
      Toast.show({
        type: 'success',
        text1: 'Joined successfully',
        text2: `Welcome to ${workspace.name}`,
      });
      setJoinVisible(false);
      setInviteCode('');
      
      await fetchWorkspaces();
      if (workspace?._id) {
        await switchWorkspace(workspace._id);
        navigation.navigate('Main');
      }
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to join workspace';
      setJoinError(msg);
    } finally {
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <HeaderBackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Add workspaces</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Account Row */}
      <View style={styles.emailRow}>
        <Mail size={20} color={colors.textSecondary} style={styles.icon} />
        <Text style={styles.emailText}>{user?.email || 'tisha.g@starkedge.com'}</Text>
        <TouchableOpacity hitSlop={8}>
          <Info size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Signed-in Status Card */}
      <View style={styles.statusCard}>
        <View style={styles.checkmarkWrapper}>
          <Check size={16} color={colors.textSecondary} />
        </View>
        <Text style={styles.statusText}>You’re signed in to all workspaces for this email</Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Options Section */}
      <Text style={styles.sectionTitle}>Not the workspaces you’re looking for?</Text>

      <TouchableOpacity style={styles.optionRow} onPress={handleSignOut} activeOpacity={0.6}>
        <Grid size={22} color={colors.textSecondary} />
        <Text style={styles.optionLabel}>Sign in to another workspace</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionRow} onPress={() => setJoinVisible(true)} activeOpacity={0.6}>
        <UserPlus size={22} color={colors.textSecondary} />
        <Text style={styles.optionLabel}>Join another workspace</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionRow} onPress={() => setCreateVisible(true)} activeOpacity={0.6}>
        <Plus size={22} color={colors.textSecondary} />
        <Text style={styles.optionLabel}>Create a new workspace</Text>
      </TouchableOpacity>

      {/* Modals */}
      <CreateWorkspaceModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        navigation={navigation}
      />

      <Modal
        visible={joinVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setJoinVisible(false);
          setJoinError(null);
          setInviteCode('');
        }}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setJoinVisible(false);
                setJoinError(null);
                setInviteCode('');
              }}
              style={styles.modalCloseBtn}
              hitSlop={12}
            >
              <X size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Join workspace</Text>
            <TouchableOpacity
              onPress={handleJoinWorkspace}
              disabled={joining || !inviteCode.trim()}
              style={[styles.modalActionBtn, (!inviteCode.trim() || joining) && { opacity: 0.4 }]}
            >
              {joining ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalActionBtnText}>Join</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.modalForm}>
            <Text style={styles.modalLabel}>Invite Code</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. WS-123456"
              placeholderTextColor={colors.inputPlaceholder}
              value={inviteCode}
              onChangeText={(text) => {
                setInviteCode(text);
                setJoinError(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
            />
            {joinError && (
              <Text style={styles.modalErrorText}>{joinError}</Text>
            )}
            <Text style={styles.modalHint}>
              Enter the invite code shared by your workspace administrator to join.
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(14),
    },
    closeBtn: {
      padding: moderateScale(4),
    },
    headerTitle: {
      fontSize: moderateScale(18),
      fontWeight: '700',
      color: colors.textPrimary,
    },
    placeholder: {
      width: scale(32),
    },
    emailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(16),
      marginTop: verticalScale(8),
    },
    icon: {
      marginRight: scale(16),
    },
    emailText: {
      fontSize: moderateScale(16),
      color: colors.textPrimary,
      fontWeight: '500',
      flex: 1,
    },
    statusCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundTertiary || '#f1f5f9',
      marginHorizontal: scale(20),
      marginTop: verticalScale(4),
      padding: moderateScale(14),
      borderRadius: moderateScale(12),
      gap: 12,
    },
    checkmarkWrapper: {
      width: scale(32),
      height: verticalScale(32),
      borderRadius: moderateScale(8),
      backgroundColor: colors.border || '#cbd5e1',
      justifyContent: 'center',
      alignItems: 'center',
    },
    statusText: {
      fontSize: moderateScale(15),
      color: colors.textPrimary,
      fontWeight: '500',
      flex: 1,
      lineHeight: 20,
    },
    divider: {
      height: verticalScale(1),
      backgroundColor: colors.borderLight || '#e2e8f0',
      marginVertical: verticalScale(24),
    },
    sectionTitle: {
      fontSize: moderateScale(15),
      fontWeight: '700',
      color: colors.textPrimary,
      marginHorizontal: scale(20),
      marginBottom: verticalScale(16),
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(14),
      gap: 14,
    },
    optionLabel: {
      fontSize: moderateScale(16),
      color: colors.textPrimary,
      fontWeight: '500',
    },
    // Modal Styles
    modalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(14),
      borderBottomWidth: 1,
      borderBottomColor: colors.border || '#cbd5e1',
    },
    modalCloseBtn: {
      padding: moderateScale(4),
    },
    modalTitle: {
      fontSize: moderateScale(17),
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'center',
    },
    modalActionBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(8),
      borderRadius: moderateScale(8),
      minWidth: scale(60),
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalActionBtnText: {
      color: colors.textOnPrimary || '#fff',
      fontWeight: '700',
      fontSize: moderateScale(14),
    },
    modalForm: {
      padding: moderateScale(20),
    },
    modalLabel: {
      fontSize: moderateScale(13),
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: verticalScale(8),
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.border || '#cbd5e1',
      backgroundColor: colors.inputBackground || '#f8fafc',
      color: colors.inputText || colors.textPrimary,
      borderRadius: moderateScale(8),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(12),
      fontSize: moderateScale(15),
    },
    modalErrorText: {
      color: colors.error || '#ef4444',
      fontSize: moderateScale(13),
      marginTop: verticalScale(6),
      fontWeight: '500',
    },
    modalHint: {
      fontSize: moderateScale(12),
      color: colors.textTertiary,
      marginTop: verticalScale(12),
      lineHeight: 18,
    },
  });

export default CreateWorkspaceScreen;
