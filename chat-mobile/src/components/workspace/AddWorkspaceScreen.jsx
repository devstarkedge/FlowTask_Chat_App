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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, LayoutGrid, UserPlus, Plus } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import WorkspaceEmailCard from './WorkspaceEmailCard';
import WorkspaceActionRow from './WorkspaceActionRow';
import CreateWorkspaceModal from './CreateWorkspaceModal';
import Toast from 'react-native-toast-message';

/**
 * AddWorkspaceScreen
 *
 * Slack-style "Add workspaces" screen shown when user taps
 * "Add a Workspace" in the WorkspaceSwitcher sidebar.
 *
 * Options:
 *  1. Sign in to another workspace  → triggers logout so user can re-auth
 *  2. Join another workspace        → invite-code modal
 *  3. Create a new workspace        → reuses CreateWorkspaceModal
 */
const AddWorkspaceScreen = ({ visible, onClose, navigation }) => {
  const { colors } = useThemeStore();
  const { logout } = useAuthStore();
  const { joinByInviteCode, fetchWorkspaces, switchWorkspace } = useWorkspaceStore();

  // Sub-modal states
  const [createVisible, setCreateVisible] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);

  // Join form state
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleSignInAnother = () => {
    Alert.alert(
      'Sign in to another workspace',
      'You will be signed out of the current session. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            onClose();
            await logout();
          },
        },
      ]
    );
  };

  const handleOpenJoin = () => {
    setInviteCode('');
    setJoinError('');
    setJoinVisible(true);
  };

  const handleJoin = async () => {
    const code = inviteCode.trim();
    if (!code) {
      setJoinError('Please enter an invite code.');
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const workspace = await joinByInviteCode(code);
      Toast.show({
        type: 'success',
        text1: `Joined "${workspace?.name}"`,
        text2: 'Switching workspace…',
      });
      setJoinVisible(false);
      onClose();
      await fetchWorkspaces();
      if (workspace?._id) {
        await switchWorkspace(workspace._id);
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.message ||
        'Invalid invite code. Please try again.';
      setJoinError(msg);
    } finally {
      setJoining(false);
    }
  };

  const handleOpenCreate = () => {
    setCreateVisible(true);
  };

  const handleCreateClose = () => {
    setCreateVisible(false);
  };

  const handleCreateSuccess = () => {
    setCreateVisible(false);
    onClose();
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top', 'bottom']}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { borderBottomColor: colors.borderLight ?? colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <View style={[styles.closeCircle, { backgroundColor: colors.backgroundSecondary ?? colors.card }]}>
              <X size={18} color={colors.textPrimary} strokeWidth={2} />
            </View>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Add workspaces
          </Text>
          {/* spacer to balance close button */}
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Email + Status Card ── */}
          <WorkspaceEmailCard />

          {/* ── Divider ── */}
          <View style={[styles.divider, { backgroundColor: colors.borderLight ?? colors.border }]} />

          {/* ── Options Section ── */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Not the workspaces you're looking for?
          </Text>

          <WorkspaceActionRow
            icon={LayoutGrid}
            label="Sign in to another workspace"
            onPress={handleSignInAnother}
          />

          <WorkspaceActionRow
            icon={UserPlus}
            label="Join another workspace"
            onPress={handleOpenJoin}
          />

          <WorkspaceActionRow
            icon={Plus}
            label="Create a new workspace"
            onPress={handleOpenCreate}
          />
        </ScrollView>
      </SafeAreaView>

      {/* ── Create Workspace Modal (reused) ── */}
      <CreateWorkspaceModal
        visible={createVisible}
        onClose={handleCreateClose}
        onSuccess={handleCreateSuccess}
        navigation={navigation}
      />

      {/* ── Join Workspace Modal ── */}
      <Modal
        visible={joinVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setJoinVisible(false)}
      >
        <SafeAreaView
          style={[styles.container, { backgroundColor: colors.background }]}
          edges={['top', 'bottom']}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* Join Header */}
            <View style={[styles.header, { borderBottomColor: colors.borderLight ?? colors.border }]}>
              <TouchableOpacity
                onPress={() => setJoinVisible(false)}
                style={styles.closeBtn}
                hitSlop={12}
              >
                <View style={[styles.closeCircle, { backgroundColor: colors.backgroundSecondary ?? colors.card }]}>
                  <X size={18} color={colors.textPrimary} strokeWidth={2} />
                </View>
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                Join a workspace
              </Text>
              <TouchableOpacity
                onPress={handleJoin}
                disabled={joining || !inviteCode.trim()}
                style={[
                  styles.joinBtn,
                  { backgroundColor: colors.primary },
                  (joining || !inviteCode.trim()) && styles.joinBtnDisabled,
                ]}
              >
                {joining ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.joinBtnText}>Join</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Join Form */}
            <View style={styles.joinForm}>
              <Text style={[styles.joinLabel, { color: colors.textSecondary }]}>
                INVITE CODE
              </Text>
              <TextInput
                style={[
                  styles.joinInput,
                  {
                    color: colors.inputText ?? colors.textPrimary,
                    borderColor: joinError ? colors.error : colors.border,
                    backgroundColor: colors.inputBackground ?? colors.card,
                  },
                ]}
                placeholder="e.g. WS-A1B2C3"
                placeholderTextColor={colors.inputPlaceholder ?? colors.textTertiary}
                value={inviteCode}
                onChangeText={(t) => {
                  setInviteCode(t);
                  setJoinError('');
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleJoin}
              />
              {!!joinError && (
                <Text style={[styles.joinError, { color: colors.error }]}>
                  {joinError}
                </Text>
              )}
              <Text style={[styles.joinHint, { color: colors.textTertiary }]}>
                Ask your workspace administrator for an invite code, then enter
                it above to join their workspace.
              </Text>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </Modal>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    marginRight: 4,
  },
  closeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 34,
  },
  // Scroll
  scrollContent: {
    paddingBottom: 40,
  },
  // Divider
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 0,
    marginTop: 20,
    marginBottom: 20,
  },
  // Section title
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  // Join modal
  joinBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnDisabled: {
    opacity: 0.4,
  },
  joinBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  joinForm: {
    padding: 20,
  },
  joinLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  joinInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 1.5,
  },
  joinError: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
  },
  joinHint: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
});

export default AddWorkspaceScreen;
