import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { workspaceAPI } from '../../services/api';
import { getWorkspaceOrigin } from '../../utils/workspaceSettings';
import Toast from 'react-native-toast-message';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';

export default function WorkspaceInviteOptions({ workspace, canManage, isOwner, colors, onRefresh, isCurrentWorkspace }) {
  const [domainEnabled, setDomainEnabled] = useState(false);
  const [domains, setDomains] = useState('');
  const [maxGuests, setMaxGuests] = useState('-1');
  const [restrictGuests, setRestrictGuests] = useState(true);
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState('');
  const [inviteType, setInviteType] = useState('');
  const [page, setPage] = useState(1);
  const allowed = canManage && getWorkspaceOrigin(workspace) === 'independent';
  const invitations = useQuery({
    queryKey: ['workspaceInvites', workspace?._id, status, inviteType, page],
    queryFn: async ({ signal }) => {
      const { data } = await workspaceAPI.getAllInvites(workspace._id, { status: status || undefined, inviteType: inviteType || undefined, page, limit: 10 }, { signal, headers: { 'X-Workspace-Id': workspace._id } });
      return data?.data ?? {};
    },
    enabled: !!allowed && !!workspace?._id,
    retry: 1,
    refetchOnMount: 'always',
  });
  useEffect(() => {
    setDomainEnabled(workspace?.settings?.domainRestrictions?.enabled ?? false);
    setDomains((workspace?.settings?.domainRestrictions?.allowedDomains || []).join(', '));
    setMaxGuests(String(workspace?.settings?.guestSettings?.maxGuests ?? -1));
    setRestrictGuests(workspace?.settings?.guestSettings?.guestChannelRestriction ?? true);
  }, [workspace?.settings]);

  const run = async (action, request, refreshWorkspace = false) => {
    if (!allowed || !isCurrentWorkspace() || busy) return;
    setBusy(action);
    try {
      await request();
      if (!isCurrentWorkspace()) return;
      Toast.show({ type: 'success', text1: action });
      if (refreshWorkspace) await onRefresh();
      else await invitations.refetch();
    } catch (error) {
      if (isCurrentWorkspace()) Toast.show({ type: 'error', text1: 'Unable to update workspace invitations', text2: error?.response?.data?.error?.message || error?.message });
    } finally { setBusy(null); }
  };
  const saveDomains = () => {
    const allowedDomains = [...new Set(domains.split(/[\s,]+/).map(domain => domain.toLowerCase().replace(/^@/, '')).filter(Boolean))];
    if (allowedDomains.some(domain => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))) {
      Toast.show({ type: 'error', text1: 'Enter valid domains, such as company.com' }); return;
    }
    run('Domain restrictions saved', () => workspaceAPI.updateDomainRestrictions(workspace._id, { enabled: domainEnabled, allowedDomains }), true);
  };
  const revoke = invitation => Alert.alert('Revoke invitation', `Revoke the invitation for ${invitation.email}?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Revoke', style: 'destructive', onPress: () => run('Invitation revoked', () => workspaceAPI.revokeInvite(workspace._id, invitation._id)) },
  ]);
  if (!allowed) return null;
  const entries = Array.isArray(invitations.data?.invites) ? invitations.data.invites : [];
  const guestAccess = ['pro', 'enterprise'].includes(workspace.plan);
  return (
    <View style={styles.content}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Invitations</Text>
      <View style={styles.filters}>{['', 'pending', 'accepted', 'expired', 'revoked'].map(value => <Button key={value || 'all'} colors={colors} selected={status === value} label={value ? value.charAt(0).toUpperCase() + value.slice(1) : 'All'} onPress={() => { setStatus(value); setPage(1); }} />)}</View>
      <View style={styles.filters}>{['', 'member', 'guest'].map(value => <Button key={value || 'all-types'} colors={colors} selected={inviteType === value} label={value || 'All types'} onPress={() => { setInviteType(value); setPage(1); }} />)}</View>
      {invitations.isLoading ? <ActivityIndicator color={colors.primary} /> : invitations.error ? <View><Text style={{ color: colors.textSecondary }}>Failed to load invitations.</Text><Button label="Retry" colors={colors} onPress={() => invitations.refetch()} /></View> : entries.length === 0 ? <Text style={{ color: colors.textSecondary }}>No invitations found</Text> : entries.map(invitation => (
        <View key={invitation._id} style={[styles.invitation, { borderColor: colors.border }]}>
          <Text style={{ color: colors.textPrimary }}>{invitation.email}</Text>
          <Text style={{ color: colors.textSecondary }}>{invitation.inviteType || 'member'} · {invitation.role || 'member'} · {invitation.status}</Text>
          {invitation.status === 'pending' && <View style={styles.filters}>
            <Button label="Resend" colors={colors} disabled={!!busy || (invitation.resendCount ?? 0) >= 3} onPress={() => run('Invitation resent', () => workspaceAPI.resendInvite(workspace._id, invitation._id))} />
            <Button label="Revoke" colors={colors} disabled={!!busy} onPress={() => revoke(invitation)} />
          </View>}
        </View>
      ))}
      <View style={styles.filters}>
        <Button label="Previous" colors={colors} disabled={page <= 1} onPress={() => setPage(current => current - 1)} />
        <Text style={{ color: colors.textSecondary }}>Page {page}</Text>
        <Button label="Next" colors={colors} disabled={page >= (invitations.data?.pages || 1)} onPress={() => setPage(current => current + 1)} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Domain Restrictions</Text>
      <View style={styles.filters}><Text style={{ color: colors.textPrimary }}>Restrict invitations by email domain</Text><Switch value={domainEnabled} onValueChange={setDomainEnabled} /></View>
      <TextInput accessibilityLabel="Allowed email domains" style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} value={domains} onChangeText={setDomains} autoCapitalize="none" placeholder="company.com, partner.com" placeholderTextColor={colors.textTertiary} />
      <Button label="Save Domain Restrictions" colors={colors} disabled={!!busy} onPress={saveDomains} />
      {isOwner && guestAccess && <>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Guest Settings</Text>
        <Text style={{ color: colors.textSecondary }}>Maximum guests (-1 for unlimited)</Text>
        <TextInput accessibilityLabel="Maximum guests" style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} value={maxGuests} onChangeText={setMaxGuests} keyboardType="numbers-and-punctuation" />
        <View style={styles.filters}><Text style={{ color: colors.textPrimary }}>Restrict guests to assigned channels</Text><Switch value={restrictGuests} onValueChange={setRestrictGuests} /></View>
        <Button label="Save Guest Settings" colors={colors} disabled={!!busy} onPress={() => {
          const maximum = Number(maxGuests);
          if (!Number.isInteger(maximum) || maximum < -1) { Toast.show({ type: 'error', text1: 'Enter -1 or a non-negative guest limit' }); return; }
          run('Guest settings saved', () => workspaceAPI.updateGuestSettings(workspace._id, { maxGuests: maximum, guestChannelRestriction: restrictGuests }), true);
        }} />
      </>}
    </View>
  );
}
function Button({ label, onPress, colors, disabled, selected }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.button, { borderColor: selected ? colors.primary : colors.border, opacity: disabled ? 0.45 : 1 }]}><Text style={{ color: colors.primary }}>{label}</Text></TouchableOpacity>;
}
const styles = StyleSheet.create({
  content: { gap: verticalScale(12), marginTop: verticalScale(24) },
  title: { fontSize: moderateScale(17), fontWeight: '700', marginTop: verticalScale(12) },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: scale(8) },
  button: { borderWidth: 1, borderRadius: moderateScale(10), paddingHorizontal: scale(10), paddingVertical: verticalScale(9) },
  input: { borderWidth: 1, borderRadius: moderateScale(10), padding: moderateScale(12) },
  invitation: { borderBottomWidth: StyleSheet.hairlineWidth, gap: verticalScale(8), paddingVertical: verticalScale(10) },
});
