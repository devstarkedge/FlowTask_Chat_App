import React from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { Check, Info, AlertTriangle } from 'lucide-react-native';
import { moderateScale } from '../../utils/responsive';

const SuccessToast = ({ text1, type }) => {
  let IconComponent = Check;
  let iconColor = "#fff";

  if (type === 'error') {
    IconComponent = AlertTriangle;
    iconColor = "#ef4444";
  } else if (type === 'info') {
    IconComponent = Info;
    iconColor = "#3b82f6";
  }

  return (
    <View style={styles.container}>
      <IconComponent size={moderateScale(48)} color={iconColor} strokeWidth={1.5} />
      <Text style={styles.text}>{text1}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2A2A2A', 
    width: moderateScale(140),
    height: moderateScale(140),
    borderRadius: moderateScale(16),
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
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

export default SuccessToast;
