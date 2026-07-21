import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import { categoryAPI } from '../services/api';
import { X, Check, ChevronDown } from 'lucide-react-native';

const CreateCategoryModal = ({ visible, onClose }) => {
  const { colors } = useThemeStore();
  const [tab, setTab] = useState('department');
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fetchCategories, categories, channels } = useChannelStore();

  const [customName, setCustomName] = useState('');
  const [expandedDepts, setExpandedDepts] = useState({});

  useEffect(() => {
    if (visible && tab === 'department') {
      loadDepartments();
    }
  }, [visible, tab]);

  const loadDepartments = async () => {
    setLoading(true);
    try {
      const res = await categoryAPI.getDepartments();
      const fetchedDepts = res.data?.data || [];
      
      const existingDeptIds = (categories || [])
        .filter(c => c.type === 'department')
        .map(c => String(c.departmentId?._id || c.departmentId));
        
      const missingDepartments = fetchedDepts.filter(d => 
        !existingDeptIds.includes(String(d._id || d.externalId))
      );
      
      setDepartments(missingDepartments);
    } catch (error) {
      console.log(error);
    }
    setLoading(false);
  };

  const toggleDeptExpand = (deptId) => {
    setExpandedDepts(prev => ({
      ...prev,
      [deptId]: !prev[deptId]
    }));
  };

  const getDeptChannels = (dept) => {
    const targetDeptId = dept.externalId || dept._id;
    return channels.filter(c => {
      if (c.visibility === 'private' || c.isArchived) return false;
      const isDepartmentChannel = c.flowTaskRef?.entityType === "department" && String(c.flowTaskRef?.entityId) === String(targetDeptId);
      const isProjectInDepartment = c.departmentRef?.departmentId && String(c.departmentRef.departmentId) === String(targetDeptId);
      return isDepartmentChannel || isProjectInDepartment;
    });
  };

  const handleCreateDepartmentCategories = async () => {
    if (departments.length === 0) return;
    setIsSubmitting(true);
    try {
      const results = await Promise.allSettled(
        departments.map(d => 
          categoryAPI.create({
            departmentId: d.externalId || d._id,
            name: d.name,
            type: 'department',
            icon: d.icon || '📁'
          })
        )
      );
      
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      await fetchCategories();
      
      if (successCount > 0) {
        Alert.alert("Success", `Imported ${successCount} department(s) successfully.`);
        onClose();
      } else {
        Alert.alert("Error", "Failed to import departments.");
      }
    } catch (err) {
      Alert.alert("Error", "Failed to create categories.");
    }
    setIsSubmitting(false);
  };

  const handleCreateCustomCategory = async () => {
    if (!customName.trim()) return;
    setIsSubmitting(true);
    try {
      await categoryAPI.create({ name: customName.trim(), type: 'custom' });
      await fetchCategories();
      Alert.alert("Success", "Custom category created.");
      onClose();
    } catch (err) {
      Alert.alert("Error", err.response?.data?.message || "Failed to create category.");
    }
    setIsSubmitting(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Create Category</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, tab === 'department' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab('department')}
          >
            <Text style={[styles.tabText, { color: tab === 'department' ? colors.primary : colors.textSecondary }]}>Department</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, tab === 'custom' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab('custom')}
          >
            <Text style={[styles.tabText, { color: tab === 'custom' ? colors.primary : colors.textSecondary }]}>Custom</Text>
          </TouchableOpacity>
        </View>

        {tab === 'department' ? (
          <View style={styles.content}>
            <View style={[styles.infoBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                Departments are synchronized automatically from FlowTask. Tap "Create Category" to import all missing departments and their channels.
              </Text>
            </View>

            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
            ) : departments.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 15 }}>All departments are already imported.</Text>
              </View>
            ) : (
              <FlatList
                data={departments}
                keyExtractor={(item) => item.externalId || item._id}
                renderItem={({ item }) => {
                  const isExpanded = expandedDepts[item._id];
                  const deptChannels = getDeptChannels(item);
                  
                  return (
                    <View style={[styles.deptItem, { borderBottomColor: colors.border }]}>
                      <TouchableOpacity 
                        style={styles.deptHeader}
                        onPress={() => toggleDeptExpand(item._id)}
                      >
                        <View style={[styles.deptIcon, { backgroundColor: colors.backgroundSecondary }]}>
                          <Text style={{ fontSize: 20 }}>📁</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.deptName, { color: colors.textPrimary }]}>{item.name}</Text>
                          <Text style={[styles.deptCount, { color: colors.textSecondary }]}>
                            {deptChannels.length} {deptChannels.length === 1 ? 'channel' : 'channels'}
                          </Text>
                        </View>
                        <ChevronDown 
                          size={20} 
                          color={colors.textSecondary} 
                          style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                        />
                      </TouchableOpacity>
                      
                      {isExpanded && deptChannels.length > 0 && (
                        <View style={[styles.deptChannels, { backgroundColor: colors.backgroundSecondary }]}>
                          {deptChannels.map(channel => (
                            <View key={channel._id} style={styles.channelRow}>
                              <Check size={14} color={colors.primary} />
                              <Text style={[styles.channelName, { color: colors.textSecondary }]}>
                                # {channel.name}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                }}
              />
            )}
            
            {departments.length > 0 && (
              <TouchableOpacity 
                style={[styles.submitButton, { backgroundColor: colors.primary, opacity: isSubmitting ? 0.5 : 1 }]}
                disabled={isSubmitting}
                onPress={handleCreateDepartmentCategories}
              >
                <Text style={styles.submitButtonText}>
                  {isSubmitting ? 'Importing...' : `Import ${departments.length} Department${departments.length > 1 ? 's' : ''}`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.content}>
             <Text style={[styles.label, { color: colors.textSecondary }]}>Category Name</Text>
             <TextInput
               style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
               placeholder="e.g. Project Alpha"
               placeholderTextColor={colors.textTertiary}
               value={customName}
               onChangeText={setCustomName}
             />
             <TouchableOpacity 
              style={[styles.submitButton, { backgroundColor: colors.primary, opacity: !customName.trim() || isSubmitting ? 0.5 : 1, marginTop: 20 }]}
              disabled={!customName.trim() || isSubmitting}
              onPress={handleCreateCustomCategory}
            >
              <Text style={styles.submitButtonText}>{isSubmitting ? 'Creating...' : 'Create Custom Category'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  closeButton: { padding: 4 },
  tabContainer: { flexDirection: 'row', width: '100%', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '600' },
  content: { flex: 1, padding: 16 },
  infoBox: { padding: 16, borderRadius: 8, borderWidth: 1, marginBottom: 16 },
  infoText: { fontSize: 13, lineHeight: 18 },
  deptItem: { borderBottomWidth: 1, marginBottom: 8 },
  deptHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  deptIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  deptName: { fontSize: 15, fontWeight: '600' },
  deptCount: { fontSize: 12, marginTop: 2 },
  deptChannels: { paddingVertical: 8, paddingLeft: 64, paddingRight: 16, gap: 6 },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  channelName: { fontSize: 13 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  submitButton: { padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  submitButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' }
});

export default CreateCategoryModal;