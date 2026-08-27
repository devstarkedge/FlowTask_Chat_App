import React from 'react';
import { Image } from 'react-native';

export default function Logo({ width = 32, height = 32, style }) {
  return (
    <Image 
      source={require('../../assets/Vector.png')} 
      style={[{ width, height, resizeMode: 'contain' }, style]} 
    />
  );
}
