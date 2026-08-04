import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { LogOut, Plus, CircleChevronRight, Briefcase } from 'lucide-react-native';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


const WorkspaceSelectorScreen = () => {
  const { workspaces, isLoading, fetchWorkspaces, switchWorkspace } = useWorkspaceStore();
  const { logout, user } = useAuthStore();
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const renderWorkspaceItem = ({ item }) => (
    <TouchableOpacity style={styles.workspaceCard} onPress={() => switchWorkspace(item._id)} activeOpacity={0.7}>
      <View style={styles.workspaceIcon}>
        <Text style={styles.workspaceIconText}>{item.name?.substring(0, 1).toUpperCase() || 'W'}</Text>
      </View>
      <View style={styles.workspaceInfo}>
        <Text style={styles.workspaceName}>{item.name}</Text>
        <Text style={styles.workspaceSlug}>@{item.slug}</Text>
      </View>
      <CircleChevronRight size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Welcome,</Text>
          <Text style={styles.userName}>{user?.name || 'User'}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutButton}>
          <LogOut size={20} color={colors.error} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Select a workspace</Text>
        
        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loaderText, { color: colors.textSecondary }]}>Loading your workspaces...</Text>
          </View>
        ) : (
          <FlatList
            data={workspaces}
            renderItem={renderWorkspaceItem}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Briefcase size={48} color={colors.border} />
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No workspaces found</Text>
                <TouchableOpacity style={styles.createButton}>
                  <Plus size={20} color={colors.messageTextSent} />
                  <Text style={styles.createButtonText}>Create Workspace</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: scale(20), paddingVertical: verticalScale(20), backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
    welcome: { fontSize: moderateScale(14), color: colors.textSecondary },
    userName: { fontSize: moderateScale(20), fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
    logoutButton: { padding: moderateScale(10), borderRadius: moderateScale(12), backgroundColor: `${colors.error}14` },
    content: { flex: 1, paddingHorizontal: scale(20), paddingTop: verticalScale(24) },
    sectionTitle: { fontSize: moderateScale(13), fontWeight: '700', textTransform: 'uppercase', color: colors.textTertiary, letterSpacing: 1, marginBottom: verticalScale(16) },
    listContent: { gap: 12, paddingBottom: verticalScale(20) },
    workspaceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: moderateScale(16), padding: moderateScale(16), borderWidth: 1, borderColor: colors.border },
    workspaceIcon: { width: scale(48), height: verticalScale(48), borderRadius: moderateScale(12), backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: scale(16) },
    workspaceIconText: { color: colors.messageTextSent, fontSize: moderateScale(20), fontWeight: '700' },
    workspaceInfo: { flex: 1 },
    workspaceName: { fontSize: moderateScale(16), fontWeight: '700', color: colors.textPrimary },
    workspaceSlug: { fontSize: moderateScale(13), color: colors.textSecondary, marginTop: verticalScale(2) },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loaderText: { fontSize: moderateScale(14), color: colors.textSecondary },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: verticalScale(60), gap: 12 },
    emptyText: { fontSize: moderateScale(16), color: colors.textTertiary, marginBottom: verticalScale(8) },
    createButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingVertical: verticalScale(12), paddingHorizontal: scale(20), borderRadius: moderateScale(12), gap: 8 },
    createButtonText: { color: colors.messageTextSent, fontWeight: '700', fontSize: moderateScale(15) },
  });

export default WorkspaceSelectorScreen;
