import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import { categoryAPI } from '../services/api';
import { X, Check, Edit2, Trash2, FolderInput, FolderOutput } from 'lucide-react-native';

const CategoryActionSheet = ({ visible, onClose, category, onAddChannels, onRemoveChannels }) => {
  const { colors } = useThemeStore();
  const { fetchCategories } = useChannelStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showRenameInput, setShowRenameInput] = useState(false);
  const [newName, setNewName] = useState(category?.name || '');

  const handleRename = async () => {
    if (!newName.trim() || newName.trim() === category.name) {
      setShowRenameInput(false);
      return;
    }
    
    try {
      await categoryAPI.update(category._id, { name: newName.trim() });
      await fetchCategories();
      Alert.alert("Success", "Category renamed successfully");
    } catch (err) {
      Alert.alert("Error", err.response?.data?.message || "Failed to rename category");
    }
    setShowRenameInput(false);
    onClose();
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Category",
      `Are you sure you want to delete "${category.name}"? The channels will remain in your workspace.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              await categoryAPI.delete(category._id);
              await fetchCategories();
              Alert.alert("Success", "Category deleted successfully");
            } catch (err) {
              Alert.alert("Error", err.response?.data?.message || "Failed to delete category");
            }
            setIsDeleting(false);
            onClose();
          }
        }
      ]
    );
  };

  const handleAddChannels = () => {
    onClose();
    onAddChannels(category);
  };

  const handleRemoveChannels = () => {
    onClose();
    onRemoveChannels(category);
  };

  if (!category) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} transparent>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Category Options</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {showRenameInput ? (
            <View style={styles.renameContainer}>
              <TextInput
                style={[styles.renameInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                placeholder="Category name"
                placeholderTextColor={colors.textTertiary}
              />
              <View style={styles.renameButtons}>
                <TouchableOpacity onPress={() => setShowRenameInput(false)} style={styles.renameBtn}>
                  <Text style={[styles.renameBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRename} style={styles.renameBtn}>
                  <Text style={[styles.renameBtnText, { color: colors.primary }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.optionsList}>
              <TouchableOpacity style={styles.option} onPress={() => setShowRenameInput(true)}>
                <Edit2 size={18} color={colors.textPrimary} />
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>Rename / Edit</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.option} onPress={handleAddChannels}>
                <FolderInput size={18} color={colors.textPrimary} />
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>Add Channels</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.option} onPress={handleRemoveChannels}>
                <FolderOutput size={18} color={colors.textPrimary} />
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>Remove Channels</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.option, styles.destructiveOption]} 
                onPress={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Trash2 size={18} color={colors.error} />
                )}
                <Text style={[styles.optionText, { color: colors.error }]}>Delete Category</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    maxHeight: '50%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  optionsList: {
    padding: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  optionText: {
    fontSize: 15,
  },
  destructiveOption: {
    marginTop: 4,
  },
  renameContainer: {
    padding: 16,
  },
  renameInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  renameButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 12,
  },
  renameBtn: {
    padding: 8,
  },
  renameBtnText: {
    fontSize: 15,
    fontWeight: '500',
  },
});

export default CategoryActionSheet;