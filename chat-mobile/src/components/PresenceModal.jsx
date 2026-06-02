import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
} from 'react-native';
import AccessibleModal from './AccessibleModal';
import { useThemeStore } from '../stores/themeStore';
import { X, Circle } from 'lucide-react-native';
import { rnShadowToBoxShadow } from '../utils/styleUtils';

const PresenceModal = ({ visible, onClose }) => {
  const { colors } = useThemeStore();

  const presenceOptions = [
    { label: 'Active', value: 'active', color: colors.online, description: 'Let people know you\'re available' },
    { label: 'Away', value: 'away', color: colors.away, description: 'You\'re away from your device' },
    { label: 'Busy', value: 'busy', color: colors.busy, description: 'Do not disturb mode' },
    { label: 'Invisible', value: 'invisible', color: colors.offline, description: 'Appear offline to others' },
  ];

  const handleSelect = (presence) => {
    console.log('Set presence to:', presence);
    if (Platform.OS === 'web') {
      document.activeElement?.blur();
    }
    onClose();
  };

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
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Set yourself as</Text>
            <TouchableOpacity onPress={handleClose}>
              <X size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Presence Options */}
          <View style={styles.content}>
            {presenceOptions.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.presenceItem,
                  index < presenceOptions.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
                onPress={() => handleSelect(option)}
                activeOpacity={0.7}
              >
                <Circle size={12} color={option.color} fill={option.color} />
                <View style={styles.presenceContent}>
                  <Text style={[styles.presenceLabel, { color: colors.textPrimary }]}>{option.label}</Text>
                  <Text style={[styles.presenceDescription, { color: colors.textSecondary }]}>
                    {option.description}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
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
    width: '85%',
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
  content: {
    paddingVertical: 8,
  },
  presenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  presenceContent: {
    flex: 1,
  },
  presenceLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  presenceDescription: {
    fontSize: 13,
  },
});

export default PresenceModal;
