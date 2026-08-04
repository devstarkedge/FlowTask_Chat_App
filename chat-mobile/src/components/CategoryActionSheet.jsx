import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import KeyboardAwareContainer from './common/KeyboardAwareContainer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import { categoryAPI } from '../services/api';
import { X, Check, Edit2, Trash2, FolderInput, FolderOutput } from 'lucide-react-native';
import { scale, verticalScale, moderateScale } from '../utils/responsive';

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
    // Capture ID synchronously before closing anything
    const categoryId = category._id;
    const categoryName = category.name;

    Alert.alert(
      "Delete Category",
      `Are you sure you want to delete "${categoryName}"? The channels will remain in your workspace.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            // Close the sheet first so the parent clears activeCategory safely
            onClose();
            try {
              await categoryAPI.delete(categoryId);
              // Socket category:deleted event will update the store in real-time.
              // fetchCategories is a fallback in case socket delivery is delayed.
              await fetchCategories();
            } catch (err) {
              Alert.alert("Error", err.response?.data?.message || "Failed to delete category");
            }
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

  useEffect(() => {
    if (visible) {
      setShowRenameInput(false);
      setNewName(category?.name || '');
      setIsDeleting(false);
    }
  }, [visible, category]);

  if (!category) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAwareContainer style={{ flex: 1 }} disablePadding={false}>
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
      </KeyboardAwareContainer>
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
    borderTopLeftRadius: moderateScale(16),
    borderTopRightRadius: moderateScale(16),
    borderTopWidth: 1,
    maxHeight: '75%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(12),
    borderBottomWidth: 1,
  },
  title: {
    fontSize: moderateScale(16),
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