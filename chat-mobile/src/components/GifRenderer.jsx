import React from 'react';
import { View, Text, Image, useWindowDimensions } from 'react-native';
import { verticalScale, moderateScale } from '../utils/responsive';

const GifRenderer = ({ item, contentColor, styles }) => {
  const { width: screenWidth } = useWindowDimensions();
  const MAX_WIDTH = Math.min(Math.floor(screenWidth * 0.55), 220);
  const MAX_HEIGHT = 220;

  const srcW = item.gifMeta?.width || MAX_WIDTH;
  const srcH = item.gifMeta?.height || MAX_HEIGHT;

  const scale = Math.min(1, MAX_WIDTH / srcW, MAX_HEIGHT / srcH);
  const displayW = Math.floor(srcW * scale);
  const displayH = Math.floor(srcH * scale);

  const uri = item.gifUrl || item.gifMeta?.gifUrl || item.gifMeta?.previewUrl;

  return (
    <View style={{ marginTop: item.content ? 8 : 0, alignSelf: 'flex-start', width: '100%' }}>
      {item.content ? (
        <Text style={[styles.messageText, { color: contentColor, marginBottom: verticalScale(8) }]}>
          {item.content}
        </Text>
      ) : null}
      <Image
        source={{ uri }}
        style={{ 
          width: displayW, 
          height: displayH, 
          maxWidth: '100%', 
          borderRadius: moderateScale(8),
          aspectRatio: srcW / srcH,
        }}
        resizeMode="contain"
      />
    </View>
  );
};

export default GifRenderer;
