import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Check } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';

const { height: SCREEN_H } = Dimensions.get('window');

const OptionsSelectionModal = ({ visible, onClose, title, options, selectedValue, onSelect }) => {
  const { colors } = useThemeStore();

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={[styles.overlay, { backgroundColor: colors.backdrop }]} activeOpacity={1} onPress={onClose}>
        <View style={[styles.container, { backgroundColor: colors.background, shadowColor: colors.shadowXl }]} onStartShouldSetResponder={() => true}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            {options.map((option, index) => {
              const isSelected = selectedValue === option.value;
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.optionRow,
                    { borderBottomColor: colors.border },
                    index === options.length - 1 && { borderBottomWidth: 0 }
                  ]}
                  onPress={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.optionText, 
                    { color: isSelected ? colors.primary : colors.textPrimary, fontWeight: isSelected ? '600' : '400' }
                  ]}>
                    {option.label}
                  </Text>
                  {isSelected && <Check size={20} color={colors.primary} strokeWidth={2.5} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxHeight: SCREEN_H * 0.7,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  header: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  scroll: {
    width: '100%',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: 16,
  },
});

export default OptionsSelectionModal;
