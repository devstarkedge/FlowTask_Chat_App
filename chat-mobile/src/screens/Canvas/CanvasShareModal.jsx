import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { X, Shield, UserPlus, Globe, Check } from 'lucide-react-native';
import Avatar from '../../components/Avatar';
import api from '../../services/api';

export default function CanvasShareModal({ visible, onClose, canvasId }) {
  const [isPublic, setIsPublic] = useState(false);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && canvasId) {
      loadPermissions();
    }
  }, [visible, canvasId]);

  const loadPermissions = async () => {
    setLoading(true);
    try {
      // Fetch canvas properties & permission list
      const res = await api.get(`/canvas/by-id/${canvasId}`);
      if (res.data?.success) {
        const c = res.data.data.canvas;
        setIsPublic(c.isPublic || false);
        // Load active channel members or customized list
        const memsRes = await api.get(`/channels/${c.channelId}/members`);
        setMembers(memsRes.data?.data || []);
      }
    } catch (err) {
      console.warn('loadPermissions error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePublic = async (val) => {
    setIsPublic(val);
    try {
      await api.put(`/canvas/update/${canvasId}`, { isPublic: val });
    } catch (err) {
      Alert.alert('Error', 'Failed to update visibility setting.');
      setIsPublic(!val);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Shield size={18} color="#4f46e5" style={styles.headerIcon} />
              <Text style={styles.headerTitle}>Permissions & Share</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#4f46e5" />
            </View>
          ) : (
            <View style={styles.content}>
              <View style={styles.publicToggleRow}>
                <View style={styles.publicToggleText}>
                  <View style={styles.iconLabelRow}>
                    <Globe size={16} color="#4b5563" style={styles.rowIcon} />
                    <Text style={styles.rowTitle}>Public in Channel</Text>
                  </View>
                  <Text style={styles.rowSubtitle}>
                    Anyone in this channel can view this canvas
                  </Text>
                </View>
                <Switch
                  value={isPublic}
                  onValueChange={handleTogglePublic}
                  trackColor={{ false: '#767577', true: '#818cf8' }}
                  thumbColor={isPublic ? '#4f46e5' : '#f4f3f4'}
                />
              </View>

              <Text style={styles.sectionHeader}>Channel Members</Text>
              <FlatList
                data={members}
                keyExtractor={(item) => item._id}
                style={styles.membersList}
                renderItem={({ item }) => (
                  <View style={styles.memberRow}>
                    <Avatar userId={item._id} size={32} />
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{item.name || 'Member'}</Text>
                      <Text style={styles.memberRole}>{item.email || 'Workspace Member'}</Text>
                    </View>
                    <View style={styles.accessBadge}>
                      <Check size={14} color="#4f46e5" />
                      <Text style={styles.accessText}>Access</Text>
                    </View>
                  </View>
                )}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    maxHeight: '80%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  publicToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  publicToggleText: {
    flex: 1,
    marginRight: 16,
  },
  iconLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    marginRight: 6,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 10,
  },
  membersList: {
    maxHeight: 250,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  memberRole: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
  },
  accessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f3ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  accessText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4f46e5',
    marginLeft: 4,
  },
  centered: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
