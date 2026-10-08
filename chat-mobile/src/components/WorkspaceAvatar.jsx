import React, { useCallback, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SvgUri } from 'react-native-svg';
import { useThemeStore } from '../stores/themeStore';
import { normalizeMediaUrl } from '../utils/mediaUtils';
import logger from '../utils/logger';

const defaultGradients = (colors) => [
  [colors.primary, colors.primaryHover || colors.primary],
  [colors.primaryHover || colors.primary, colors.primary],
  [colors.success, colors.primary],
  [colors.warning || colors.primary, colors.error || colors.primary],
  [colors.inputBackground, colors.card],
  [(colors.headerGradient && colors.headerGradient[0]) || colors.primary, (colors.headerGradient && colors.headerGradient[1]) || colors.primaryHover || colors.primary],
];

const getWorkspaceGradient = (workspaceName, colors, index = 0) => {
  const gradients = defaultGradients(colors);
  if (!workspaceName) return gradients[0];

  let hash = 0;
  for (let i = 0; i < workspaceName.length; i++) {
    hash = workspaceName.charCodeAt(i) + ((hash << 5) - hash);
  }

  const gradientIndex = Math.abs(hash) % gradients.length;
  return gradients[gradientIndex];
};

const WorkspaceAvatar = ({ 
  workspace, 
  index = 0,
  size = 40, 
  style,
  showBorder = false 
}) => {
  const { colors } = useThemeStore();
  
  const workspaceLogo = normalizeMediaUrl(workspace?.logo);
  const [failedLogo, setFailedLogo] = useState(null);
  const workspaceName = workspace?.name || 'W';
  const initial = workspaceName[0]?.toUpperCase() || 'W';
  const gradient = getWorkspaceGradient(workspaceName, colors, index);
  const handleLogoError = useCallback(() => {
    setFailedLogo(workspaceLogo);
    logger.warn('Failed to load workspace logo', { workspaceId: workspace?._id });
  }, [workspaceLogo, workspace?._id]);
  const isSvg = /\.svg(?:[?#]|$)/i.test(workspaceLogo) || /^data:image\/svg\+xml/i.test(workspaceLogo);

  if (workspaceLogo && failedLogo !== workspaceLogo) {
    return (
      <View
        style={[
          styles.logoFrame,
          {
            width: size,
            height: size,
            borderRadius: size * 0.25,
            borderWidth: showBorder ? 2 : 0,
            borderColor: showBorder ? `${colors.messageTextSent}80` : 'transparent',
          },
          style,
        ]}
      >
        {isSvg ? (
          <SvgUri uri={workspaceLogo} width={size} height={size} onError={handleLogoError} accessibilityLabel={`${workspaceName} logo`} />
        ) : (
          <Image source={{ uri: workspaceLogo }} style={styles.logo} onError={handleLogoError} accessibilityLabel={`${workspaceName} logo`} />
        )}
      </View>
    );
  }

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.gradient,
        {
          width: size,
          height: size,
          borderRadius: size * 0.25,
          borderWidth: showBorder ? 2 : 0,
            borderColor: showBorder ? `${colors.messageTextSent}80` : 'transparent',
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.initial,
          { fontSize: size * 0.45, color: colors.messageTextSent },
        ]}
      >
        {initial}
      </Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  logo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  logoFrame: {
    overflow: 'hidden',
  },
  gradient: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: {
    fontWeight: '800',
  },
});

export default WorkspaceAvatar;
export { getWorkspaceGradient };
