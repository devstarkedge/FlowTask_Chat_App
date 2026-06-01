import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { useThemeStore } from '../stores/themeStore';
import { X, Clock } from 'lucide-react-native';

const PauseNotificationsModal = ({ visible, onClose }) => {
  const { colors } = useThemeStore();

  const durations = [
    { label: '30 minutes', value: 30 },
    { label: '1 hour', value: 60 },
    { label: '2 hours', value: 120 },
    { label: '8 hours', value: 480 },
    { label: '24 hours', value: 1440 },
    { label: 'Until tomorrow', value: 'tomorrow' },
    { label: 'Custom time', value: 'custom' },
  ];

  const handleSelect = (duration) => {
    console.log('Pause notifications for:', duration);
    onClose();
  };

  const styles = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={[styles.modal, { backgroundColor: colors.background }]} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Pause notifications</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Duration Options */}
          <View style={styles.content}>
            {durations.map((duration, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.durationItem,
                  index < durations.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
                onPress={() => handleSelect(duration)}
                activeOpacity={0.7}
              >
                <Clock size={20} color={colors.textSecondary} />
                <Text style={[styles.durationLabel, { color: colors.textPrimary }]}>{duration.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
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
    width: '85%',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
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
  content: {
    paddingVertical: 8,
  },
  durationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  durationLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
});

export default PauseNotificationsModal;
