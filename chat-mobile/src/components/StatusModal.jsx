import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import AccessibleModal from './AccessibleModal';
import { useThemeStore } from '../stores/themeStore';
import { X, Clock } from 'lucide-react-native';
import { rnShadowToBoxShadow } from '../utils/styleUtils';

const StatusModal = ({ visible, onClose }) => {
  const { colors } = useThemeStore();
  const [statusText, setStatusText] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('');

  const statusPresets = [
    { emoji: '🟢', label: 'Available', text: 'Available' },
    { emoji: '🌴', label: 'On Leave', text: 'On vacation' },
    { emoji: '📞', label: 'In Meeting', text: 'In a meeting' },
    { emoji: '🏠', label: 'Working Remote', text: 'Working from home' },
    { emoji: '🎧', label: 'Focusing', text: 'Focusing' },
    { emoji: '☕', label: 'On Break', text: 'Taking a break' },
    { emoji: '🚀', label: 'Busy', text: 'Busy' },
    { emoji: '🤒', label: 'Sick', text: 'Out sick' },
  ];

  const expirationOptions = [
    { label: '30 minutes', value: 30 },
    { label: '1 hour', value: 60 },
    { label: '4 hours', value: 240 },
    { label: 'Today', value: 'today' },
    { label: 'This week', value: 'week' },
    { label: "Don't clear", value: null },
  ];

  const handleClose = () => {
    if (Platform.OS === 'web') {
      document.activeElement?.blur();
    }
    onClose();
  };

  const styles = createStyles(colors);

  return (
    <AccessibleModal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <View style={[styles.modal, { backgroundColor: colors.background }]} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Set a status</Text>
            <TouchableOpacity onPress={handleClose}>
              <X size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Custom Status Input */}
            <View style={styles.section}>
              <View style={[styles.inputContainer, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <Text style={styles.emojiInput}>{selectedEmoji || '😊'}</Text>
                <TextInput
                  style={[styles.textInput, { color: colors.textPrimary }]}
                  placeholder="What's your status?"
                  placeholderTextColor={colors.textTertiary}
                  value={statusText}
                  onChangeText={setStatusText}
                />
              </View>
            </View>

            {/* Presets */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SUGGESTIONS</Text>
              {statusPresets.map((preset, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.presetItem}
                  onPress={() => {
                    setSelectedEmoji(preset.emoji);
                    setStatusText(preset.text);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.presetEmoji}>{preset.emoji}</Text>
                  <Text style={[styles.presetLabel, { color: colors.textPrimary }]}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Expiration */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CLEAR AFTER</Text>
              {expirationOptions.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.expirationItem}
                  onPress={() => {}}
                  activeOpacity={0.7}
                >
                  <Clock size={18} color={colors.textSecondary} />
                  <Text style={[styles.expirationLabel, { color: colors.textPrimary }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.clearButton, { backgroundColor: colors.backgroundSecondary }]}
                onPress={() => {
                  setStatusText('');
                  setSelectedEmoji('');
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.buttonText, { color: colors.textPrimary }]}>Clear status</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  if (Platform.OS === 'web') {
                    document.activeElement?.blur();
                  }
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.buttonText, { color: colors.textInverse }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Pressable>
    </AccessibleModal>
  );
};

const createStyles = (colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 16,
    ...(Platform.OS !== 'web'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
          elevation: 8,
        }
      : { boxShadow: rnShadowToBoxShadow('#000', { width: 0, height: 4 }, 0.2, 12) }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  emojiInput: {
    fontSize: 24,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
  },
  presetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  presetEmoji: {
    fontSize: 20,
  },
  presetLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  expirationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  expirationLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButton: {},
  saveButton: {},
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default StatusModal;
