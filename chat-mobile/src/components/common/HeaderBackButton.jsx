import React from 'react';
import { ChevronLeft } from 'lucide-react-native';
import IconButton from './IconButton';

const HeaderBackButton = ({ onPress, style, iconColor }) => {
  return (
    <IconButton 
      icon={ChevronLeft}
      variant="card"
      size={44}
      iconSize={24}
      onPress={onPress}
      style={[style, { paddingRight: 2 }]} // Optical alignment for ChevronLeft
      iconColor={iconColor}
    />
  );
};

export default HeaderBackButton;
