import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { LogOut, Plus, CircleChevronRight, Briefcase } from 'lucide-react-native';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';

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
          <Text style={styles.welcome}>Welcome back,</Text>
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
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 20, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
    welcome: { fontSize: 14, color: colors.textSecondary },
    userName: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
    logoutButton: { padding: 10, borderRadius: 12, backgroundColor: `${colors.error}14` },
    content: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
    sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', color: colors.textTertiary, letterSpacing: 1, marginBottom: 16 },
    listContent: { gap: 12, paddingBottom: 20 },
    workspaceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
    workspaceIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    workspaceIconText: { color: colors.messageTextSent, fontSize: 20, fontWeight: '700' },
    workspaceInfo: { flex: 1 },
    workspaceName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    workspaceSlug: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loaderText: { fontSize: 14, color: colors.textSecondary },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60, gap: 12 },
    emptyText: { fontSize: 16, color: colors.textTertiary, marginBottom: 8 },
    createButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, gap: 8 },
    createButtonText: { color: colors.messageTextSent, fontWeight: '700', fontSize: 15 },
  });

export default WorkspaceSelectorScreen;
