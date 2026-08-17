import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useThemeStore } from '../stores/themeStore';
import { workspaceAPI } from '../services/api';
import { secureSet, secureGet, secureMultiRemove } from '../utils/secureStorage';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import { Check, X, ShieldAlert, AlertTriangle } from 'lucide-react-native';

const InviteProcessingScreen = ({ route, navigation }) => {
  const { inviteCode } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [inviteData, setInviteData] = useState(null);
  const [errorState, setErrorState] = useState(null); // 'invalid', 'expired', 'deleted', null
  const { accessToken, isInitialized } = useAuthStore();
  const { joinByInviteCode, workspaces, switchWorkspace } = useWorkspaceStore();
  const { colors } = useThemeStore();

  useEffect(() => {
    if (!isInitialized) return;
    if (!inviteCode) {
      setErrorState('invalid');
      setLoading(false);
      return;
    }

    processInvite();
  }, [inviteCode, isInitialized, accessToken]);

  const processInvite = async () => {
    try {
      setLoading(true);
      
      // If user is not logged in, save invite and redirect to login
      if (!accessToken) {
        await secureSet('pending_invite_code', inviteCode);
        navigation.replace('Login');
        return;
      }

      // Fetch invite info publicly first
      const { data } = await workspaceAPI.getInviteInfo(inviteCode);
      const info = data?.data;

      if (!info) {
        setErrorState('invalid');
        return;
      }

      // Fetch latest workspaces list from server to ensure accurate member check
      const { fetchWorkspaces } = useWorkspaceStore.getState();
      await fetchWorkspaces(true);

      const latestWorkspaces = useWorkspaceStore.getState().workspaces || [];
      const isAlreadyMember = latestWorkspaces.some(w => w._id === info.workspaceId);
      if (isAlreadyMember) {
        Alert.alert(
          'Already a Member',
          'You are already a member of this workspace.',
          [
            {
              text: 'OK',
              onPress: () => handleJoin(info.workspaceId, true)
            }
          ]
        );
        return;
      }

      setInviteData(info);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      if (msg.includes('expired')) {
        setErrorState('expired');
      } else if (msg.includes('not found') || msg.includes('deleted')) {
        setErrorState('deleted');
      } else {
        setErrorState('invalid');
      }
    } finally {
      if (!inviteData) setLoading(false);
    }
  };

  const handleJoin = async (workspaceIdOverride = null, isAlreadyMember = false) => {
    setLoading(true);
    try {
      let workspaceId = workspaceIdOverride;
      
      if (!isAlreadyMember) {
        const joinedWorkspace = await joinByInviteCode(inviteCode);
        workspaceId = joinedWorkspace._id;
      }
      
      await secureMultiRemove(['pending_invite_code']);
      
      // The joinByInviteCode logic handles pushing to local workspaces array.
      // Now we switch to it. 
      // Note: switchWorkspace inside workspaceStore will trigger refreshWorkspaceContext 
      // which reconnects sockets, clears cache, and fetches latest channels.
      await switchWorkspace(workspaceId);
      
      // Explicitly navigate/reset to Main stack to prevent screen freezing
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to join workspace');
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    await secureMultiRemove(['pending_invite_code']);
    
    // Go back or to Home
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else if (workspaces.length > 0) {
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } else {
      navigation.replace('WorkspaceSelector');
    }
  };

  const styles = createStyles(colors);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Processing invitation...</Text>
      </SafeAreaView>
    );
  }

  if (errorState) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <ShieldAlert size={48} color={colors.error} style={{ alignSelf: 'center', marginBottom: 20 }} />
          <Text style={styles.title}>
            {errorState === 'expired' ? 'Invite Expired' : errorState === 'deleted' ? 'Workspace Not Found' : 'Invalid Invite'}
          </Text>
          <Text style={styles.subtitle}>
            {errorState === 'expired' 
              ? 'This invitation has expired. Please ask the workspace owner for a new one.' 
              : errorState === 'deleted'
              ? 'This workspace no longer exists.'
              : 'This invitation link is no longer valid.'}
          </Text>
          <TouchableOpacity style={styles.buttonSecondary} onPress={handleDecline}>
            <Text style={styles.buttonSecondaryText}>Go Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>{inviteData?.workspaceName?.charAt(0)?.toUpperCase() || 'W'}</Text>
        </View>
        <Text style={styles.title}>You've been invited!</Text>
        <Text style={styles.subtitle}>
          <Text style={{ fontWeight: 'bold' }}>{inviteData?.inviterName || 'Someone'}</Text> invited you to join <Text style={{ fontWeight: 'bold' }}>{inviteData?.workspaceName}</Text>.
        </Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.buttonPrimary} onPress={() => handleJoin()}>
            <Check size={20} color={colors.textOnPrimary} />
            <Text style={styles.buttonPrimaryText}>Accept Invite</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonSecondary} onPress={handleDecline}>
            <X size={20} color={colors.textPrimary} />
            <Text style={styles.buttonSecondaryText}>Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    padding: scale(20),
  },
  loadingText: {
    marginTop: verticalScale(16),
    textAlign: 'center',
    fontSize: moderateScale(16),
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: moderateScale(16),
    padding: scale(24),
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarContainer: {
    width: scale(64),
    height: scale(64),
    borderRadius: moderateScale(16),
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: verticalScale(20),
  },
  avatarText: {
    fontSize: moderateScale(28),
    fontWeight: 'bold',
    color: colors.textOnPrimary,
  },
  title: {
    fontSize: moderateScale(24),
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: verticalScale(12),
  },
  subtitle: {
    fontSize: moderateScale(16),
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: verticalScale(32),
    lineHeight: 24,
  },
  buttonContainer: {
    gap: verticalScale(12),
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(14),
    borderRadius: moderateScale(12),
    gap: scale(8),
  },
  buttonPrimaryText: {
    color: colors.textOnPrimary,
    fontSize: moderateScale(16),
    fontWeight: 'bold',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(14),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: colors.border,
    gap: scale(8),
  },
  buttonSecondaryText: {
    color: colors.textPrimary,
    fontSize: moderateScale(16),
    fontWeight: '600',
  }
});

export default InviteProcessingScreen;
