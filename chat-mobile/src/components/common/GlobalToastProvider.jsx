import React from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import { Check, Info, AlertTriangle } from 'lucide-react-native';
import { moderateScale } from '../../utils/responsive';
import { useToastStore } from '../../utils/toastStore';

export const GlobalToastProvider = () => {
  const { visible, options } = useToastStore();

  if (!visible || !options) return null;

  let IconComponent = Check;
  let iconColor = "#fff";
  if (options.type === 'error') {
    IconComponent = AlertTriangle;
    iconColor = "#ef4444";
  } else if (options.type === 'info') {
    IconComponent = Info;
    iconColor = "#3b82f6";
  }

  return (
    <Modal 
      transparent 
      visible 
      animationType="fade"
      statusBarTranslucent={true}
      navigationBarTranslucent={true}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.container}>
          <IconComponent size={moderateScale(48)} color={iconColor} strokeWidth={1.5} />
          {!!options.text1 && <Text style={styles.text}>{options.text1}</Text>}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  container: {
    backgroundColor: '#2A2A2A', 
    width: moderateScale(140),
    height: moderateScale(140),
    borderRadius: moderateScale(16),
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    padding: moderateScale(16),
    gap: moderateScale(16),
  },
  text: {
    color: '#fff',
    fontSize: moderateScale(15),
    fontWeight: '500',
    textAlign: 'center',
  },
});
