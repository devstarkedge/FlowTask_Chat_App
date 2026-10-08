import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
  TextInput,
  Switch,
  RefreshControl,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  X,
  Settings,
  Users,
  LogOut,
  ChevronRight,
  Mail,
  Copy,
  Trash2,
  Share2,
  RefreshCw,
  Check,
  Shield,
  Bell,
  Zap,
  Link2,
  Globe,
  Lock,
  Clock,
  Crown,
  Shield as ShieldIcon,
  UserMinus,
  Search,
  Plus,
  UserPlus,
  Eye,
  AlertTriangle,
  Smartphone,
  Upload,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';

import { useThemeStore } from '../../stores/themeStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useAuthStore } from '../../stores/authStore';
import { workspaceAPI, fileAPI, getWorkspaceContextVersion } from '../../services/api';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import WorkspaceAvatar from '../../components/WorkspaceAvatar';
import ENV from '../../config/environment';
import { useWorkspaceMembers } from '../../hooks/queries/useWorkspaceMembers';
import { useWorkspaceDetails, useWorkspaceSetting } from '../../hooks/queries/useWorkspaceSettings';
import { getWorkspaceOrigin, normalizeWorkspaceMembers, getWorkspaceMemberActions, mergeWorkspaceDetails } from '../../utils/workspaceSettings';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../queries/queryKeys';
import MembersTab from '../../components/workspace/WorkspaceMembersSection';
import WorkspaceInviteOptions from '../../components/workspace/WorkspaceInviteOptions';

/* ───────────────────────────────────────
   TAB CONFIG
   ─────────────────────────────────────── */
const TABS = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'invite', label: 'Invite', icon: Link2 },
  { id: 'integrations', label: 'Integrations', icon: Zap },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

/* ───────────────────────────────────────
   MAIN COMPONENT
   ─────────────────────────────────────── */
export default function WorkspaceSettingsScreen({ navigation }) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  return <WorkspaceSettingsContent key={workspaceId || 'no-workspace'} navigation={navigation} />;
}

function WorkspaceSettingsContent({ navigation }) {
  const { colors } = useThemeStore();
  const user = useAuthStore((s) => s.user);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { data: rawMembers = [], isLoading: membersLoading, error: membersError, refetch: refetchMembers } = useWorkspaceMembers(activeWorkspaceId);
  const members = useMemo(() => normalizeWorkspaceMembers(rawMembers, activeWorkspaceId), [rawMembers, activeWorkspaceId]);
  const details = useWorkspaceDetails(activeWorkspaceId);
  const queryClient = useQueryClient();
  const contextVersion = getWorkspaceContextVersion();
  const isCurrentWorkspace = () => useWorkspaceStore.getState().activeWorkspaceId === activeWorkspaceId && getWorkspaceContextVersion() === contextVersion;
  const currentWorkspace = mergeWorkspaceDetails(activeWorkspace, details.data, activeWorkspaceId);
  const workspaceOrigin = getWorkspaceOrigin(currentWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const leaveWorkspace = useWorkspaceStore((s) => s.leaveWorkspace);

  const [activeTab, setActiveTab] = useState('general');
  const [refreshing, setRefreshing] = useState(false);
  const [isRemovingWorkspace, setIsRemovingWorkspace] = useState(false);

  const userRole = useMemo(() => {
    const m = members.find((m) => (m.userId?._id || m.userId) === user?._id);
    return m?.role || activeWorkspace?.role || 'member';
  }, [members, user, activeWorkspace]);

  const isOwner = userRole === 'owner';
  const isAdmin = isOwner || userRole === 'admin';
  const canManage = isAdmin;
  const canManageMembership = canManage && workspaceOrigin === 'independent';
  const canManageAccess = canManage && currentWorkspace?.source === 'independent';
  const security = useWorkspaceSetting(activeWorkspaceId, 'security', canManage && activeTab === 'security');
  const notifications = useWorkspaceSetting(activeWorkspaceId, 'notifications', canManage && activeTab === 'notifications');
  const integrations = useWorkspaceSetting(activeWorkspaceId, 'integrations', canManage && activeTab === 'integrations');
  const billingQuery = useWorkspaceSetting(activeWorkspaceId, 'billing', canManage);

  // ── Redirect if unauthorized ──
  useEffect(() => {
    // Rely on activeWorkspace.role for instant checks, otherwise wait for members to load
    if (!canManage && !membersLoading && activeWorkspace) {
      Toast.show({ type: 'error', text1: 'Access Denied', text2: 'You do not have permission to view Workspace Settings.' });
      navigation.goBack();
    }
  }, [canManage, membersLoading, activeWorkspace, navigation]);

  const loadWorkspaceData = () => details.refetch();
  const handleWorkspaceUpdated = async (updated) => {
    if (!isCurrentWorkspace()) return;
    await queryClient.cancelQueries({ queryKey: queryKeys.workspaceDetails(activeWorkspaceId) });
    if (!isCurrentWorkspace()) return;
    const merged = mergeWorkspaceDetails(currentWorkspace, updated, activeWorkspaceId);
    if (!merged) return;
    queryClient.setQueryData(queryKeys.workspaceDetails(activeWorkspaceId), merged);
    queryClient.setQueryData(queryKeys.workspaces, (old = []) => old.map(item => item._id === activeWorkspaceId ? { ...item, ...merged } : item));
    useWorkspaceStore.setState({ activeWorkspace: merged });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchMembers(), details.refetch(), billingQuery.refetch()]);
    } finally {
      if (isCurrentWorkspace()) setRefreshing(false);
    }
  }, [activeWorkspaceId, contextVersion, refetchMembers, details.refetch, billingQuery.refetch]);
  const inviteLink = currentWorkspace
    ? `${ENV.CLIENT_URL}/invite/${currentWorkspace.inviteCode || currentWorkspace._id || activeWorkspaceId}`
    : '';

  const copyInviteLink = async () => {
    if (!canManageMembership || !isCurrentWorkspace()) return;
    await Clipboard.setStringAsync(inviteLink);
    Toast.show({ type: 'success', text1: 'Invite link copied' });
  };

  const shareInviteLink = async () => {
    if (!canManageMembership || !isCurrentWorkspace()) return;
    try {
      await Share.share({ message: `Join my workspace on TaskChat: ${inviteLink}` });
    } catch (error) {}
  };

  const copyInviteCode = async () => {
    if (!canManageMembership || !isCurrentWorkspace()) return;
    if (currentWorkspace?.inviteCode) {
      await Clipboard.setStringAsync(currentWorkspace.inviteCode);
      Toast.show({ type: 'success', text1: 'Invite code copied' });
    }
  };

  const handleRegenerateInviteCode = async () => {
    if (!canManageMembership || !isCurrentWorkspace()) return;
    Alert.alert('Regenerate Code', 'This will invalidate the current invite code. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Regenerate',
        onPress: async () => {
          if (!canManageMembership || !isCurrentWorkspace()) return;
          try {
            await workspaceAPI.regenerateInviteCode(activeWorkspaceId);
            if (!isCurrentWorkspace()) return;
            Toast.show({ type: 'success', text1: 'Invite code regenerated' });
            loadWorkspaceData();
          } catch (e) {
            if (!isCurrentWorkspace()) return;
            Toast.show({ type: 'error', text1: 'Failed to regenerate code' });
          }
        },
      },
    ]);
  };

  const handleLeaveWorkspace = () => {
    if (isRemovingWorkspace || !canManageAccess || !isCurrentWorkspace()) return;

    const title = isOwner ? 'Delete Workspace' : 'Leave Workspace';
    const message = isOwner
      ? 'This action will permanently delete this workspace and all its data for every member. This action cannot be undone.'
      : 'Are you sure you want to leave this workspace?';
    const confirmText = isOwner ? 'Delete' : 'Leave';

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: confirmText,
        style: 'destructive',
        onPress: async () => {
          if (!isCurrentWorkspace()) return;
          setIsRemovingWorkspace(true);
          try {
            const result = isOwner
              ? await deleteWorkspace(activeWorkspaceId)
              : await leaveWorkspace(activeWorkspaceId);

            Toast.show({
              type: 'success',
              text1: isOwner ? 'Workspace deleted' : 'Left workspace',
            });

            if (result?.remaining) {
              // Switched to another workspace — land on Home
              navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
            }
            // No remaining workspaces → activeWorkspaceId cleared;
            // AppNavigation automatically shows WorkspaceSelector empty state.
          } catch (error) {
            Toast.show({
              type: 'error',
              text1: isOwner ? 'Failed to delete workspace' : 'Failed to leave workspace',
              text2: error?.message,
            });
          } finally {
            setIsRemovingWorkspace(false);
          }
        },
      },
    ]);
  };

  const handleRemoveMember = (memberId, memberName) => {
    const member = members.find(item => item.userId._id === memberId);
    if (!isCurrentWorkspace() || !getWorkspaceMemberActions(currentWorkspace, member, user?._id, canManage).canRemove) return;
    Alert.alert('Remove Member', `${memberName} will lose access to this workspace.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (!isCurrentWorkspace()) return;
          try {
            await workspaceAPI.removeMember(activeWorkspaceId, memberId);
            if (!isCurrentWorkspace()) return;
            Toast.show({ type: 'success', text1: 'Member removed' });
            refetchMembers();
          } catch (e) {
            if (!isCurrentWorkspace()) return;
            Toast.show({ type: 'error', text1: 'Failed to remove member' });
          }
        },
      },
    ]);
  };

  const handleUpdateRole = (memberId, role) => {
    const member = members.find(item => item.userId._id === memberId);
    if (!isCurrentWorkspace() || !getWorkspaceMemberActions(currentWorkspace, member, user?._id, canManage).canEditRole) return;
    Alert.alert('Update Role', `Change this member's role to ${role}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Change',
        onPress: async () => {
          if (!isCurrentWorkspace()) return;
          try {
            await workspaceAPI.updateMemberRole(activeWorkspaceId, memberId, role);
            if (!isCurrentWorkspace()) return;
            Toast.show({ type: 'success', text1: `Role changed to ${role}` });
            refetchMembers();
          } catch (e) {
            if (!isCurrentWorkspace()) return;
            Toast.show({ type: 'error', text1: 'Failed to update role' });
          }
        },
      },
    ]);
  };

  const handleSaveSecurity = async (updates) => {
    if (!canManage || !isCurrentWorkspace()) return;
    try {
      await workspaceAPI.updateSecuritySettings(activeWorkspaceId, updates);
      if (!isCurrentWorkspace()) return;
      Toast.show({ type: 'success', text1: 'Security settings saved' });
      security.refetch();
    } catch (e) {
      if (!isCurrentWorkspace()) return;
      Toast.show({ type: 'error', text1: 'Failed to save security settings' });
    }
  };

  const handleSaveNotifications = async (updates) => {
    if (!canManage || !isCurrentWorkspace()) return;
    try {
      await workspaceAPI.updateNotificationSettings(activeWorkspaceId, updates);
      if (!isCurrentWorkspace()) return;
      Toast.show({ type: 'success', text1: 'Notification settings saved' });
      notifications.refetch();
    } catch (e) {
      if (!isCurrentWorkspace()) return;
      Toast.show({ type: 'error', text1: 'Failed to save notification settings' });
    }
  };

  const handleSaveIntegration = async (updates) => {
    if (!canManage || !isCurrentWorkspace()) return;
    try {
      await workspaceAPI.updateIntegrationSettings(activeWorkspaceId, updates);
      if (!isCurrentWorkspace()) return;
      Toast.show({ type: 'success', text1: 'Integration settings saved' });
      integrations.refetch();
      details.refetch();
    } catch (e) {
      if (!isCurrentWorkspace()) return;
      Toast.show({ type: 'error', text1: 'Failed to save integration settings' });
    }
  };

  const TabButton = ({ id, label, icon: Icon }) => (
    <TouchableOpacity
      style={[styles.tabButton, activeTab === id && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
      onPress={() => setActiveTab(id)}
    >
      <Icon size={16} color={activeTab === id ? colors.primary : colors.textSecondary} />
      <Text style={[styles.tabText, { color: activeTab === id ? colors.primary : colors.textSecondary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
  const selectedSettings = { security, notifications, integrations }[activeTab];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
          <X size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Workspace Settings</Text>
        <View style={styles.headerRight} />
      </View>

      {/* ── Tabs ── */}
      <View style={[styles.tabsContainer, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {TABS.map((tab) => (
            <TabButton key={tab.id} id={tab.id} label={tab.label} icon={tab.icon} />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!currentWorkspace && (
          <SettingsNotice colors={colors} message={details.isLoading ? 'Loading workspace...' : 'Select a workspace to view its settings.'} />
        )}
        {currentWorkspace && workspaceOrigin === 'flowtask' && (
          <SettingsNotice colors={colors} message="Synced with FlowTask. Workspace membership and roles are managed by FlowTask." />
        )}
        {currentWorkspace && !workspaceOrigin && (
          <SettingsNotice colors={colors} message="Workspace source is unavailable. Refresh workspace details before managing membership." onRetry={loadWorkspaceData} />
        )}
        {details.error && (
          <SettingsNotice colors={colors} message="Failed to refresh workspace details." onRetry={loadWorkspaceData} />
        )}
        {selectedSettings?.error && (
          <SettingsNotice colors={colors} message={`Failed to load ${activeTab} settings.`} onRetry={selectedSettings.refetch} />
        )}
        {currentWorkspace && activeTab === 'general' && (
          <GeneralTab
            workspace={currentWorkspace}
            memberCount={membersLoading || membersError ? currentWorkspace.memberCount : members.length}
            billing={billingQuery.data}
            canManage={canManage}
            isOwner={isOwner}
            userRole={userRole}
            colors={colors}
            onLeave={handleLeaveWorkspace}
            isRemovingWorkspace={isRemovingWorkspace}
            onRefresh={loadWorkspaceData}
            onWorkspaceUpdated={handleWorkspaceUpdated}
            canLeave={canManageAccess}
            isCurrentWorkspace={isCurrentWorkspace}
          />
        )}
        {activeTab === 'members' && (
          <MembersTab
            members={members}
            loading={membersLoading}
            error={membersError}
            onRetry={refetchMembers}
            currentUserId={user?._id}
            canManage={canManage}
            colors={colors}
            onRemove={handleRemoveMember}
            onUpdateRole={handleUpdateRole}
            navigation={navigation}
            workspace={currentWorkspace}
            isCurrentWorkspace={isCurrentWorkspace}
          />
        )}
        {activeTab === 'invite' && (
          <InviteTab
            workspace={currentWorkspace}
            canManage={canManageMembership}
            isOwner={isOwner}
            inviteLink={inviteLink}
            colors={colors}
            onCopyLink={copyInviteLink}
            onShareLink={shareInviteLink}
            onCopyCode={copyInviteCode}
            onRegenerate={handleRegenerateInviteCode}
            navigation={navigation}
            onRefresh={loadWorkspaceData}
            isCurrentWorkspace={isCurrentWorkspace}
          />
        )}
        {activeTab === 'integrations' && !integrations.error && (
          <IntegrationsTab
            settings={integrations.data}
            loading={integrations.isLoading}
            canManage={canManage}
            colors={colors}
            onSave={handleSaveIntegration}
          />
        )}
        {activeTab === 'security' && !security.error && (
          <SecurityTab
            settings={security.data}
            loading={security.isLoading}
            canManage={canManage}
            colors={colors}
            onSave={handleSaveSecurity}
          />
        )}
        {activeTab === 'notifications' && !notifications.error && (
          <NotificationsTab
            settings={notifications.data}
            loading={notifications.isLoading}
            canManage={canManage}
            colors={colors}
            onSave={handleSaveNotifications}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsNotice({ colors, message, onRetry }) {
  return (
    <View style={{ padding: moderateScale(14), marginBottom: verticalScale(12), borderRadius: moderateScale(12), backgroundColor: colors.card }}>
      <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>{message}</Text>
      {onRetry && <TouchableOpacity onPress={onRetry}><Text style={{ color: colors.primary, fontWeight: '600' }}>Retry</Text></TouchableOpacity>}
    </View>
  );
}

/* ───────────────────────────────────────
   GENERAL TAB
   ─────────────────────────────────────── */
function GeneralTab({ workspace, memberCount, billing, canManage, isOwner, userRole, colors, onLeave, isRemovingWorkspace, onRefresh, onWorkspaceUpdated, canLeave, isCurrentWorkspace }) {
  const [name, setName] = useState(workspace?.name || '');
  const [description, setDescription] = useState(workspace?.description || '');
  const [logo, setLogo] = useState(workspace?.logo || null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(workspace?.name || '');
    setDescription(workspace?.description || '');
    setLogo(workspace?.logo || null);
  }, [workspace?.name, workspace?.description, workspace?.logo]);

  const handlePickLogo = async () => {
    if (!canManage || !isCurrentWorkspace()) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (!isCurrentWorkspace()) return;
    if (result.canceled || !asset?.uri) return;
    if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
      Toast.show({ type: 'error', text1: 'Logo must be 2 MB or smaller' });
      return;
    }

    setUploadingLogo(true);
    try {
      const filename = asset.fileName || asset.uri.split('/').pop() || 'workspace-logo.jpg';
      const formData = new FormData();
      formData.append('files', { uri: asset.uri, name: filename, type: asset.mimeType || 'image/jpeg' });
      const uploadRes = await fileAPI.uploadFiles('000000000000000000000000', formData, null, true);
      const uploaded = uploadRes?.data?.data?.files?.[0] || uploadRes?.data?.files?.[0];
      if (!uploaded?.url) throw new Error('Upload returned no URL');
      if (!isCurrentWorkspace()) return;
      setLogo(uploaded.url);
      Toast.show({ type: 'success', text1: 'Logo ready', text2: 'Save changes to synchronize it' });
    } catch (error) {
      if (!isCurrentWorkspace()) return;
      Toast.show({ type: 'error', text1: 'Failed to upload workspace logo' });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || saving || !canManage || !isCurrentWorkspace()) return;
    setSaving(true);
    try {
      const { data } = await workspaceAPI.update(workspace?._id, { name: name.trim(), description: description.trim(), logo });
      if (!isCurrentWorkspace()) return;
      await onWorkspaceUpdated(data?.data);
      Toast.show({ type: 'success', text1: 'Workspace updated' });
      onRefresh();
    } catch (e) {
      if (!isCurrentWorkspace()) return;
      Toast.show({ type: 'error', text1: 'Failed to update workspace' });
    }
    setSaving(false);
  };

  const planLabel = workspace?.plan?.toUpperCase() || 'FREE';
  const planColor = workspace?.plan === 'enterprise' ? '#8b5cf6' : workspace?.plan === 'pro' ? '#f59e0b' : '#38bdf8';

  return (
    <View style={styles.tabContent}>
      {/* Workspace Avatar & Name */}
      <View style={styles.wsHeader}>
        <WorkspaceAvatar workspace={{ ...workspace, name, logo }} size={72} />
        {canManage && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              style={[styles.logoButton, { borderColor: colors.border }]}
              onPress={handlePickLogo}
              disabled={uploadingLogo}
            >
              {uploadingLogo ? <ActivityIndicator size="small" color={colors.primary} /> : <Upload size={15} color={colors.primary} />}
              <Text style={{ color: colors.primary, fontWeight: '600' }}>{uploadingLogo ? 'Uploading…' : 'Choose logo'}</Text>
            </TouchableOpacity>
            {logo && (
              <TouchableOpacity style={[styles.logoButton, { borderColor: colors.border }]} onPress={() => setLogo(null)}>
                <Text style={{ color: colors.error, fontWeight: '600' }}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <Text style={[styles.wsName, { color: colors.textPrimary }]}>{workspace?.name}</Text>
        <View style={[styles.planBadge, { backgroundColor: planColor + '20', borderColor: planColor }]}>
          <Text style={[styles.planText, { color: planColor }]}>{planLabel}</Text>
        </View>
      </View>

      {/* Info Cards */}
      <View style={styles.infoGrid}>
        <InfoCard label="Members" value={memberCount == null ? '—' : String(memberCount)} icon={Users} color="#06b6d4" colors={colors} />
        <InfoCard label="Slug" value={workspace?.slug || '—'} icon={Link2} color="#6366f1" colors={colors} />
        <InfoCard label="Plan" value={planLabel} icon={Zap} color={planColor} colors={colors} />
        <InfoCard label="Role" value={userRole?.charAt(0).toUpperCase() + userRole?.slice(1) || 'Member'} icon={Crown} color="#f59e0b" colors={colors} />
      </View>

      {/* Edit Fields */}
      {canManage && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>WORKSPACE NAME</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.textPrimary, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            placeholder="Workspace name"
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.card, color: colors.textPrimary, borderColor: colors.border }]}
            value={description}
            onChangeText={setDescription}
            placeholder="What is this workspace for?"
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary }]}
            onPress={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Check size={16} color="#fff" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </>
      )}

      {/* Danger Zone */}
      <View style={[styles.dangerZone, { borderColor: '#fca5a5' }]}>
        <View style={styles.dangerHeader}>
          <AlertTriangle size={16} color="#ef4444" />
          <Text style={styles.dangerTitle}>Danger Zone</Text>
        </View>
        <TouchableOpacity
          style={[styles.leaveButton, isRemovingWorkspace && { opacity: 0.6 }]}
          onPress={onLeave}
          disabled={isRemovingWorkspace || !canLeave}
        >
          {isRemovingWorkspace ? (
            <ActivityIndicator size="small" color="#ef4444" />
          ) : isOwner ? (
            <Trash2 size={18} color="#ef4444" />
          ) : (
            <LogOut size={18} color="#ef4444" />
          )}
          <Text style={styles.leaveText}>
            {isRemovingWorkspace
              ? (isOwner ? 'Deleting…' : 'Leaving…')
              : (isOwner ? 'Delete Workspace' : 'Leave Workspace')}
          </Text>
        </TouchableOpacity>
        {!canLeave && <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>{getWorkspaceOrigin(workspace) === 'flowtask' ? 'Workspace access is managed by FlowTask. Use FlowTask to leave or delete this workspace.' : 'Workspace access cannot be changed until its source and your permissions are confirmed.'}</Text>}
      </View>
    </View>
  );
}

/* ───────────────────────────────────────
   MEMBERS TAB
   ─────────────────────────────────────── */


/* ───────────────────────────────────────
   INVITE TAB
   ─────────────────────────────────────── */
function InviteTab({ workspace, canManage, isOwner, inviteLink, colors, onCopyLink, onShareLink, onCopyCode, onRegenerate, navigation, onRefresh, isCurrentWorkspace }) {
  const origin = getWorkspaceOrigin(workspace);
  const isFlowTaskWorkspace = origin === 'flowtask';

  if (isFlowTaskWorkspace) {
    return (
      <View style={styles.tabContent}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Workspace Invitations</Text>
        <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
          Workspace membership and roles are managed by FlowTask. To invite new members to this workspace, please use FlowTask's workspace invitation flow.
        </Text>
      </View>
    );
  }
  if (!origin) return <SettingsNotice colors={colors} message="Confirm the workspace source before inviting members." onRetry={onRefresh} />;

  return (
    <View style={styles.tabContent}>
      {/* Invite Code Section */}
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Invite Code</Text>
      <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
        Share this code with anyone you'd like to add to this workspace.
      </Text>
      {workspace?.inviteCode ? (
        <View style={styles.codeRow}>
          <View style={[styles.codeBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.codeText, { color: colors.textPrimary }]} selectable>{workspace.inviteCode}</Text>
          </View>
          <TouchableOpacity style={[styles.iconButton, { backgroundColor: colors.card }]} onPress={onCopyCode}>
            <Copy size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={[styles.noCode, { color: colors.textTertiary }]}>For invite code, please contact workspace's admin or owner.</Text>
      )}
      {canManage && (
        <TouchableOpacity style={[styles.ghostButton, { borderColor: colors.border }]} onPress={onRegenerate}>
          <RefreshCw size={16} color={colors.textPrimary} />
          <Text style={[styles.ghostButtonText, { color: colors.textPrimary }]}>
            {workspace?.inviteCode ? 'Regenerate Code' : 'Generate Invite Code'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Invite Link Section */}
      <View style={styles.divider} />
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Invite Link</Text>
      <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
        Share the invite link directly with others.
      </Text>
      <View style={[styles.linkBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.linkText, { color: colors.textPrimary }]} numberOfLines={2}>{inviteLink}</Text>
      </View>
      <View style={styles.inviteActions}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={onCopyLink}>
          <Copy size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={onShareLink}>
          <Share2 size={16} color="#fff" />
          <Text style={styles.actionBtnText}>Share</Text>
        </TouchableOpacity>
      </View>

      {/* Invite by Email */}
      {canManage && (
        <>
          <View style={styles.divider} />
          <TouchableOpacity
            style={[styles.emailInviteBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('InviteManagement')}
          >
            <Mail size={16} color="#fff" />
            <Text style={styles.emailInviteText}>Invite by Email</Text>
          </TouchableOpacity>
        </>
      )}
      <WorkspaceInviteOptions workspace={workspace} canManage={canManage} isOwner={isOwner} colors={colors} onRefresh={onRefresh} isCurrentWorkspace={isCurrentWorkspace} />
    </View>
  );
}

/* ───────────────────────────────────────
   INTEGRATIONS TAB
   ─────────────────────────────────────── */
function IntegrationsTab({ settings, loading, canManage, colors, onSave }) {
  const [autoCreate, setAutoCreate] = useState(true);
  const [syncMembers, setSyncMembers] = useState(true);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (settings) {
      setAutoCreate(settings.autoCreateChannels ?? true);
      setSyncMembers(settings.syncMembers ?? true);
      setEnabled(settings.integrationEnabled ?? false);
    }
  }, [settings]);

  if (loading) return <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />;

  const connected = enabled;
  const lastSync = settings?.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString() : 'Never';

  return (
    <View style={styles.tabContent}>
      {/* Status Card */}
      <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: connected ? '#22c55e' : '#ef4444' }]}>
        <View style={[styles.statusDot, { backgroundColor: connected ? '#22c55e' : '#ef4444' }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>FlowTask Integration</Text>
          <Text style={[styles.statusSub, { color: connected ? '#22c55e' : '#ef4444' }]}>
            {connected ? 'Connected & active' : 'Not connected'}
          </Text>
        </View>
        {canManage && (
          <Switch
            value={enabled}
            onValueChange={(val) => {
              setEnabled(val);
              onSave({ integrationEnabled: val });
            }}
            trackColor={{ true: colors.primary }}
          />
        )}
      </View>

      <Text style={[styles.sectionDesc, { color: colors.textSecondary, marginTop: 12 }]}>
        Last sync: {lastSync}
      </Text>

      {canManage && connected && (
        <>
          <ToggleRow
            label="Auto-create project channels"
            desc="Automatically create channels for new FlowTask projects"
            value={autoCreate}
            onChange={(v) => { setAutoCreate(v); onSave({ autoCreateChannels: v }); }}
            colors={colors}
          />
          <ToggleRow
            label="Sync team members"
            desc="Auto-add FlowTask project members to channels"
            value={syncMembers}
            onChange={(v) => { setSyncMembers(v); onSave({ syncMembers: v }); }}
            colors={colors}
          />
        </>
      )}
    </View>
  );
}

/* ───────────────────────────────────────
   SECURITY TAB
   ─────────────────────────────────────── */
function SecurityTab({ settings, loading, canManage, colors, onSave }) {
  const [requireVerification, setRequireVerification] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState('7d');
  const [twoFactor, setTwoFactor] = useState(false);

  useEffect(() => {
    if (settings) {
      setRequireVerification(settings.requireEmailVerification ?? true);
      setSessionTimeout(settings.sessionTimeout || '7d');
      setTwoFactor(settings.twoFactorEnabled ?? false);
    }
  }, [settings]);

  if (loading) return <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />;

  return (
    <View style={styles.tabContent}>
      {canManage ? (
        <>
          <ToggleRow
            label="Require email verification"
            desc="New members must verify email before accessing the workspace"
            value={requireVerification}
            onChange={(v) => { setRequireVerification(v); onSave({ requireEmailVerification: v }); }}
            colors={colors}
          />
          <ToggleRow
            label="Two-factor authentication"
            desc="Coming soon — enforce 2FA for all workspace members"
            value={twoFactor}
            onChange={(v) => { setTwoFactor(v); onSave({ twoFactorEnabled: v }); }}
            colors={colors}
          />

          <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 20 }]}>SESSION TIMEOUT</Text>
          <View style={styles.timeoutRow}>
            {['1d', '7d', '30d', 'never'].map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.timeoutOption, {
                  backgroundColor: sessionTimeout === opt ? colors.primary : colors.card,
                  borderColor: sessionTimeout === opt ? colors.primary : colors.border,
                }]}
                onPress={() => { setSessionTimeout(opt); onSave({ sessionTimeout: opt }); }}
              >
                <Text style={[styles.timeoutText, {
                  color: sessionTimeout === opt ? '#fff' : colors.textPrimary,
                }]}>
                  {opt === '1d' ? '1 Day' : opt === '7d' ? '7 Days' : opt === '30d' ? '30 Days' : 'Never'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : (
        <Text style={[styles.noPerms, { color: colors.textTertiary }]}>
          Only workspace owners and admins can modify security settings.
        </Text>
      )}
    </View>
  );
}

/* ───────────────────────────────────────
   NOTIFICATIONS TAB
   ─────────────────────────────────────── */
function NotificationsTab({ settings, loading, canManage, colors, onSave }) {
  const [toggles, setToggles] = useState({
    mentions: true,
    directMessages: true,
    threadReplies: true,
    taskUpdates: true,
    workspaceAnnouncements: true,
    channelNotifications: true,
    emailNotifications: true,
    pushNotifications: true,
  });

  useEffect(() => {
    if (settings) {
      setToggles({
        mentions: settings.mentions ?? true,
        directMessages: settings.directMessages ?? true,
        threadReplies: settings.threadReplies ?? true,
        taskUpdates: settings.taskUpdates ?? true,
        workspaceAnnouncements: settings.workspaceAnnouncements ?? true,
        channelNotifications: settings.channelNotifications ?? true,
        emailNotifications: settings.emailNotifications ?? true,
        pushNotifications: settings.pushNotifications ?? true,
      });
    }
  }, [settings]);

  if (loading) return <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />;

  const toggle = (key) => {
    const newVal = !toggles[key];
    setToggles((prev) => ({ ...prev, [key]: newVal }));
    onSave({ [key]: newVal });
  };

  const labels = {
    mentions: { label: 'Mentions', desc: 'When someone mentions @you' },
    directMessages: { label: 'Direct Messages', desc: 'Messages sent directly to you' },
    threadReplies: { label: 'Thread Replies', desc: 'Replies to threads you follow' },
    taskUpdates: { label: 'Task Updates', desc: 'Task assignments and status changes' },
    workspaceAnnouncements: { label: 'Workspace Announcements', desc: 'Important workspace-wide announcements' },
    channelNotifications: { label: 'Channel Notifications', desc: 'All messages in channels you joined' },
    emailNotifications: { label: 'Email Notifications', desc: 'Receive notifications via email' },
    pushNotifications: { label: 'Push Notifications', desc: 'Receive push notifications on mobile' },
  };

  if (!canManage) {
    return (
      <View style={styles.tabContent}>
        <Text style={[styles.noPerms, { color: colors.textTertiary }]}>
          Only workspace owners and admins can modify notification settings.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      {Object.entries(labels).map(([key, { label, desc }]) => (
        <ToggleRow
          key={key}
          label={label}
          desc={desc}
          value={toggles[key]}
          onChange={() => toggle(key)}
          colors={colors}
        />
      ))}
    </View>
  );
}

/* ───────────────────────────────────────
   REUSABLE COMPONENTS
   ─────────────────────────────────────── */
function InfoCard({ label, value, icon: Icon, color, colors }) {
  return (
    <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.infoIcon, { backgroundColor: color + '20' }]}>
        <Icon size={16} color={color} />
      </View>
      <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function ToggleRow({ label, desc, value, onChange, colors }) {
  return (
    <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>{label}</Text>
        {desc ? <Text style={[styles.toggleDesc, { color: colors.textSecondary }]}>{desc}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={value ? '#fff' : '#ccc'}
      />
    </View>
  );
}

/* ───────────────────────────────────────
   STYLES
   ─────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerRight: { width: 32 },
  tabsContainer: { borderBottomWidth: 1 },
  tabsScroll: { flexDirection: 'row', paddingHorizontal: 8 },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 4,
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  content: { paddingBottom: 60 },
  tabContent: { padding: 16 },

  // General
  wsHeader: { alignItems: 'center', marginBottom: 20 },
  wsName: { fontSize: 22, fontWeight: 'bold', marginTop: 12 },
  logoButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  planBadge: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  planText: { fontSize: 13, fontWeight: '700' },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  infoCard: {
    width: '47%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  infoValue: { fontSize: 20, fontWeight: '700' },
  infoLabel: { fontSize: 12, marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', marginTop: 16, marginBottom: 6, letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 20,
  },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Danger Zone
  dangerZone: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    borderStyle: 'dashed',
  },
  dangerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  dangerTitle: { fontSize: 14, fontWeight: '700', color: '#ef4444' },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  leaveText: { color: '#ef4444', fontSize: 15, fontWeight: '600' },

  // Members
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15 },
  memberCount: { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  inviteButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mAvatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  mAvatarText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  mInfo: { flex: 1 },
  mNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mName: { fontSize: 15, fontWeight: '500' },
  youBadge: { fontSize: 11, fontWeight: '700', opacity: 0.7 },
  mEmail: { fontSize: 12, marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 4 },
  roleText: { fontSize: 11, fontWeight: '600' },
  mAction: { padding: 8 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  roleModal: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
  },
  roleModalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 16 },
  roleOption: { paddingVertical: 14 },
  roleOptionText: { fontSize: 16 },
  roleDivider: { height: 1, marginVertical: 8 },
  roleOptionDanger: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
  roleOptionDangerText: { color: '#ef4444', fontSize: 16 },

  // Invite
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  sectionDesc: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  codeBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  codeText: { fontSize: 14, fontFamily: 'monospace' },
  iconButton: { padding: 14, borderRadius: 10 },
  noCode: { fontSize: 13, fontStyle: 'italic', marginBottom: 12 },
  ghostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 16,
  },
  ghostButtonText: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 16 },
  linkBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  linkText: { fontSize: 13 },
  inviteActions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  emailInviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  emailInviteText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Integrations
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusTitle: { fontSize: 15, fontWeight: '600' },
  statusSub: { fontSize: 12, marginTop: 2 },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleLabel: { fontSize: 15, fontWeight: '500' },
  toggleDesc: { fontSize: 12, marginTop: 2 },

  // Security
  timeoutRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  timeoutOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  timeoutText: { fontSize: 13, fontWeight: '600' },

  // Status
  noPerms: { fontSize: 14, fontStyle: 'italic', textAlign: 'center', marginTop: 40, paddingHorizontal: 20 },
});
