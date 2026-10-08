import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { Search, ChevronRight, User, MessageSquare, UserMinus } from 'lucide-react-native';
import { AppAvatar } from '../common';
import { useChannelStore } from '../../stores/channelStore';
import { getWorkspaceOrigin, getWorkspaceMemberActions } from '../../utils/workspaceSettings';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import Toast from 'react-native-toast-message';

const ROLE_COLORS = { owner: '#f59e0b', admin: '#8b5cf6', member: '#38bdf8', guest: '#9ca3af' };

export default function WorkspaceMembersSection({ members = [], loading, error, onRetry, currentUserId, canManage, colors, onRemove, onUpdateRole, navigation, workspace, isCurrentWorkspace }) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [messaging, setMessaging] = useState(false);
  const createDM = useChannelStore(s => s.createDM);
  const selected = members.find(member => member.userId._id === selectedId);
  const actions = getWorkspaceMemberActions(workspace, selected, currentUserId, canManage);
  const origin = getWorkspaceOrigin(workspace);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members.filter(member => !query || member.name.toLowerCase().includes(query) || member.email.toLowerCase().includes(query));
  }, [members, search]);

  const messageMember = async () => {
    if (!actions.canMessage || !isCurrentWorkspace() || messaging) return;
    setMessaging(true);
    try {
      const channel = await createDM(selected.userId._id);
      if (channel?._id && isCurrentWorkspace()) {
        setSelectedId(null);
        navigation.navigate('Chat', { channelId: channel._id, channelName: selected.name });
      }
    } catch (err) {
      if (isCurrentWorkspace()) Toast.show({ type: 'error', text1: 'Failed to message member' });
    } finally { setMessaging(false); }
  };

  return (
    <View style={styles.content}>
      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Search size={16} color={colors.textTertiary} />
        <TextInput style={[styles.input, { color: colors.textPrimary }]} placeholder="Search members..." placeholderTextColor={colors.textTertiary} value={search} onChangeText={setSearch} />
      </View>
      <Text style={{ color: colors.textSecondary }}>{members.length} {members.length === 1 ? 'member' : 'members'}</Text>
      {origin === 'flowtask' && <Text style={{ color: colors.textSecondary }}>Membership and roles are managed by FlowTask. Use FlowTask to invite members or change their access.</Text>}
      {canManage && origin === 'independent' && (
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate('InviteManagement')}>
          <Text style={styles.primaryText}>Invite People</Text>
        </TouchableOpacity>
      )}
      {loading ? <ActivityIndicator color={colors.primary} /> : error ? (
        <View>
          <Text style={{ color: colors.error || colors.textSecondary }}>Failed to load workspace members.</Text>
          <TouchableOpacity onPress={onRetry}><Text style={{ color: colors.primary }}>Retry</Text></TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? <Text style={{ color: colors.textSecondary }}>{search ? 'No members found' : 'No workspace members yet'}</Text> : filtered.map(member => {
        const memberActions = getWorkspaceMemberActions(workspace, member, currentUserId, canManage);
        const roleColor = ROLE_COLORS[member.role] || ROLE_COLORS.member;
        return (
          <View key={member.userId._id} style={[styles.row, { borderColor: colors.border }]}>
            <AppAvatar user={member.userId} size={44} />
            <View style={styles.info}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{member.name}{member.userId._id === String(currentUserId) ? ' · you' : ''}</Text>
              {!!member.email && <Text style={{ color: colors.textSecondary }} numberOfLines={1}>{member.email}</Text>}
              <Text style={{ color: roleColor }}>{member.role}</Text>
              {!!member.flowTaskAccess?.role && <Text style={{ color: colors.textTertiary }}>Synced from FlowTask</Text>}
            </View>
            {memberActions.canViewProfile && (
              <TouchableOpacity accessibilityLabel={`Actions for ${member.name}`} onPress={() => setSelectedId(member.userId._id)}>
                <ChevronRight size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelectedId(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setSelectedId(null)} accessibilityLabel="Close member actions" />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.name, { color: colors.textPrimary }]}>{selected?.name || 'Member actions'}</Text>
            {actions.canViewProfile && <Action icon={User} label="View Profile" colors={colors} onPress={() => {
              if (!isCurrentWorkspace()) return;
              setSelectedId(null);
              navigation.navigate('UserProfile', { user: { ...selected.userId, role: selected.role } });
            }} />}
            {actions.canMessage && <Action icon={MessageSquare} label={messaging ? 'Opening conversation...' : 'Message Member'} colors={colors} onPress={messageMember} />}
            {actions.canEditRole && ['admin', 'member', 'guest'].filter(role => role !== selected.role).map(role => (
              <Action key={role} label={`Make ${role.charAt(0).toUpperCase() + role.slice(1)}`} colors={colors} onPress={() => { onUpdateRole(selectedId, role); setSelectedId(null); }} />
            ))}
            {actions.canRemove && <Action icon={UserMinus} label="Remove Member" colors={colors} danger onPress={() => { onRemove(selectedId, selected.name); setSelectedId(null); }} />}
            <Action label="Cancel" colors={colors} onPress={() => setSelectedId(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Action({ icon: Icon, label, colors, onPress, danger }) {
  const color = danger ? '#ef4444' : colors.textPrimary;
  return <TouchableOpacity onPress={onPress} style={styles.action}>{Icon && <Icon size={18} color={color} />}<Text style={{ color }}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  content: { gap: verticalScale(14), paddingHorizontal: scale(20), paddingTop: verticalScale(16) },
  search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: moderateScale(12), paddingHorizontal: scale(12) },
  input: { flex: 1, paddingVertical: verticalScale(12), marginLeft: scale(8) },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(12), borderBottomWidth: StyleSheet.hairlineWidth, gap: scale(12) },
  info: { flex: 1, gap: verticalScale(3) }, name: { fontSize: moderateScale(16), fontWeight: '600' },
  primaryButton: { padding: moderateScale(13), borderRadius: moderateScale(12), alignItems: 'center' }, primaryText: { color: '#fff', fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: scale(24) },
  sheet: { borderRadius: moderateScale(16), padding: moderateScale(20) },
  action: { flexDirection: 'row', alignItems: 'center', gap: scale(10), paddingVertical: verticalScale(14) },
});
