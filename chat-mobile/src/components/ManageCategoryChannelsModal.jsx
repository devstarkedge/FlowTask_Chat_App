import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, FlatList, Alert, Platform } from 'react-native';
import KeyboardAwareContainer from './common/KeyboardAwareContainer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import { categoryAPI, directoriesAPI } from '../services/api';
import { X, Check, Search, Hash, Lock } from 'lucide-react-native';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import { isChatAppChannel } from '../utils/channelOrigin';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useChannels } from '../hooks/queries/useChannels';

const ManageCategoryChannelsModal = ({ visible, onClose, category, mode = 'add' }) => {
  const { colors } = useThemeStore();
  const { fetchCategories } = useChannelStore();
  const { activeWorkspace } = useWorkspaceStore();
  const { data: channels = [], refetch: fetchChannels } = useChannels(activeWorkspace?._id);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  // Get channels that are in this category (for remove mode) or NOT in this category (for add mode)
  const availableChannels = useMemo(() => {
    if (!category) return [];
    
    if (mode === 'remove') {
      // For remove mode, show channels that ARE in this category
      return channels.filter(c => {
        if (!isChatAppChannel(c) || c.isArchived) return false;
        const channelIdStr = c._id?.toString ? c._id.toString() : c._id;
        const inCustomCategory = Array.isArray(category.channelIds) && category.channelIds.includes(channelIdStr);
        const inDeptCategory = category.type === 'department' && c.departmentRef?.departmentId === (category.departmentId?._id || category.departmentId);
        return inCustomCategory || inDeptCategory;
      });
    } else {
      // For add mode, show Chat App channels that are NOT in this category
      return channels.filter(c => {
        if (!isChatAppChannel(c) || c.isArchived) return false;
        const channelIdStr = c._id?.toString ? c._id.toString() : c._id;
        const inCustomCategory = Array.isArray(category.channelIds) && category.channelIds.includes(channelIdStr);
        const inDeptCategory = category.type === 'department' && c.departmentRef?.departmentId === (category.departmentId?._id || category.departmentId);
        return !(inCustomCategory || inDeptCategory);
      });
    }
  }, [channels, category, mode]);

  // Filter channels by search query
  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return availableChannels;
    const q = searchQuery.toLowerCase();
    return availableChannels.filter(c => c.name?.toLowerCase().includes(q));
  }, [availableChannels, searchQuery]);

  // Get already selected channel IDs
  const selectedIds = useMemo(() => 
    selectedChannels.map(c => c._id), 
    [selectedChannels]
  );

  const handleToggleChannel = (channel) => {
    if (selectedIds.includes(channel._id)) {
      setSelectedChannels(prev => prev.filter(c => c._id !== channel._id));
    } else {
      setSelectedChannels(prev => [...prev, channel]);
    }
  };

  const handleRemoveChannel = (channelId) => {
    setSelectedChannels(prev => prev.filter(c => c._id !== channelId));
  };

  const handleSubmit = async () => {
    if (selectedChannels.length === 0) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      const channelIds = selectedChannels.map(c => c._id);
      
      if (mode === 'remove') {
        // Remove channels from category
        for (const channelId of channelIds) {
          await categoryAPI.removeChannel(category._id, channelId);
        }
        Alert.alert("Success", `Removed ${selectedChannels.length} channel${selectedChannels.length > 1 ? 's' : ''} from ${category.name}`);
      } else {
        // Add channels to category
        await categoryAPI.addBulkChannels(category._id, channelIds);
        Alert.alert("Success", `Added ${selectedChannels.length} channel${selectedChannels.length > 1 ? 's' : ''} to ${category.name}`);
      }
      
      // Refresh data
      await fetchCategories();
      await fetchChannels();
      
      onClose();
    } catch (err) {
      Alert.alert("Error", err.response?.data?.message || `Failed to ${mode === 'remove' ? 'remove' : 'add'} channels to category`);
    }
    setIsSubmitting(false);
  };

  const handleClose = () => {
    setSelectedChannels([]);
    setSearchQuery('');
    onClose();
  };

  const getChannelIcon = (channel) => {
    if (channel.visibility === 'private' || channel.type === 'private') {
      return <Lock size={14} color={colors.textSecondary} />;
    }
    return <Hash size={14} color={colors.textSecondary} />;
  };

  const renderSelectedChannel = (channel) => (
    <TouchableOpacity 
      key={channel._id} 
      style={[styles.selectedChip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
      onPress={() => handleRemoveChannel(channel._id)}
    >
      {getChannelIcon(channel)}
      <Text style={[styles.selectedChipText, { color: colors.textPrimary }]}>
        {channel.name}
      </Text>
      <X size={12} color={colors.textSecondary} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );

  const renderChannelItem = ({ item }) => {
    const isSelected = selectedIds.includes(item._id);
    
    return (
      <TouchableOpacity 
        style={[styles.channelItem, { borderBottomColor: colors.border }]}
        onPress={() => handleToggleChannel(item)}
      >
        <View style={styles.channelItemLeft}>
          {getChannelIcon(item)}
          <Text style={[styles.channelItemName, { color: colors.textPrimary }]}>
            {item.name}
          </Text>
        </View>
        {isSelected && (
          <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
            <Check size={12} color="#fff" strokeWidth={3} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAwareContainer 
        style={[styles.overlay, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]} 
        disablePadding={false}
      >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <X size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {mode === 'remove' ? 'Remove Channels from' : 'Add Channels to'} {category?.name}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {selectedChannels.length > 0 && (
          <View style={styles.selectedContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Selected ({selectedChannels.length})
            </Text>
            <View style={styles.selectedChipsContainer}>
              {selectedChannels.map(renderSelectedChannel)}
            </View>
          </View>
        )}

        <View style={[styles.searchContainer, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <Search size={16} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder={mode === 'remove' ? "Search channels in category..." : "Search channels..."}
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>

        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
          {mode === 'remove' ? 'Channels in this Category' : 'Available Channels'}
        </Text>

          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={filteredChannels}
              keyExtractor={(item) => item._id}
              renderItem={renderChannelItem}
              style={styles.channelList}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <TouchableOpacity 
            style={[styles.cancelButton, { borderColor: colors.border }]}
            onPress={handleClose}
            disabled={isSubmitting}
          >
            <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.addButton, { backgroundColor: colors.primary, opacity: selectedChannels.length === 0 ? 0.5 : 1 }]}
            onPress={handleSubmit}
            disabled={selectedChannels.length === 0 || isSubmitting}
          >
          <Text style={styles.addButtonText}>
            {isSubmitting 
              ? (mode === 'remove' ? 'Removing...' : 'Adding...') 
              : (mode === 'remove' 
                  ? `Remove ${selectedChannels.length} Channel${selectedChannels.length !== 1 ? 's' : ''}` 
                  : `Add ${selectedChannels.length} Channel${selectedChannels.length !== 1 ? 's' : ''}`)}
          </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </KeyboardAwareContainer>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  container: {
    maxHeight: '90%',
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  closeButton: { padding: 4 },
  content: { flex: 1, padding: 16 },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },
  selectedContainer: { marginBottom: 16 },
  selectedChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  selectedChipText: { fontSize: 12, fontWeight: '500' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  channelList: { marginTop: 8 },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  channelItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  channelItemName: { fontSize: 15 },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelButtonText: { fontSize: 15, fontWeight: '600' },
  addButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  addButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default ManageCategoryChannelsModal;