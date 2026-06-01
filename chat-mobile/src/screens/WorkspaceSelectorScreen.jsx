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
import { LogOut, Plus, ChevronRight, Briefcase } from 'lucide-react-native';
import { useAuthStore } from '../stores/authStore';

const WorkspaceSelectorScreen = () => {
  const { workspaces, isLoading, fetchWorkspaces, switchWorkspace } = useWorkspaceStore();
  const { logout, user } = useAuthStore();

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const renderWorkspaceItem = ({ item }) => (
    <TouchableOpacity
      style={styles.workspaceCard}
      onPress={() => switchWorkspace(item._id)}
      activeOpacity={0.7}
    >
      <View style={styles.workspaceIcon}>
        <Text style={styles.workspaceIconText}>
          {item.name?.substring(0, 1).toUpperCase() || 'W'}
        </Text>
      </View>
      <View style={styles.workspaceInfo}>
        <Text style={styles.workspaceName}>{item.name}</Text>
        <Text style={styles.workspaceSlug}>@{item.slug}</Text>
      </View>
      <ChevronRight size={20} color="#9ca3af" />
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
          <LogOut size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Select a workspace</Text>
        
        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loaderText}>Loading your workspaces...</Text>
          </View>
        ) : (
          <FlatList
            data={workspaces}
            renderItem={renderWorkspaceItem}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Briefcase size={48} color="#d1d5db" />
                <Text style={styles.emptyText}>No workspaces found</Text>
                <TouchableOpacity style={styles.createButton}>
                  <Plus size={20} color="white" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f7f4',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  welcome: {
    fontSize: 14,
    color: '#6b7280',
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f2937',
    letterSpacing: -0.5,
  },
  logoutButton: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#9ca3af',
    letterSpacing: 1,
    marginBottom: 16,
  },
  listContent: {
    gap: 12,
    paddingBottom: 20,
  },
  workspaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  workspaceIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  workspaceIconText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },
  workspaceInfo: {
    flex: 1,
  },
  workspaceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  workspaceSlug: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    fontSize: 14,
    color: '#6b7280',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
    marginBottom: 8,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  createButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default WorkspaceSelectorScreen;
