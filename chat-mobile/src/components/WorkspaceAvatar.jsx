import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeStore } from '../stores/themeStore';

const WORKSPACE_GRADIENTS = [
  ['#3B82F6', '#2563EB'],  // Blue
  ['#8B5CF6', '#7C3AED'],  // Purple
  ['#10B981', '#059669'],  // Green
  ['#F97316', '#EA580C'],  // Orange
  ['#EF4444', '#DC2626'],  // Red
  ['#06B6D4', '#0891B2'],  // Cyan
];

const getWorkspaceGradient = (workspaceName, index = 0) => {
  if (!workspaceName) return WORKSPACE_GRADIENTS[0];
  
  let hash = 0;
  for (let i = 0; i < workspaceName.length; i++) {
    hash = workspaceName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const gradientIndex = Math.abs(hash) % WORKSPACE_GRADIENTS.length;
  return WORKSPACE_GRADIENTS[gradientIndex];
};

const WorkspaceAvatar = ({ 
  workspace, 
  index = 0,
  size = 40, 
  style,
  showBorder = false 
}) => {
  const { colors } = useThemeStore();
  
  const workspaceLogo = workspace?.logo;
  const workspaceName = workspace?.name || 'W';
  const initial = workspaceName[0]?.toUpperCase() || 'W';
  const gradient = getWorkspaceGradient(workspaceName, index);

  if (workspaceLogo) {
    return (
      <View style={style}>
        <Image
          source={{ uri: workspaceLogo }}
          style={[
            styles.logo,
            {
              width: size,
              height: size,
              borderRadius: size * 0.25,
              borderWidth: showBorder ? 2 : 0,
              borderColor: showBorder ? 'rgba(255,255,255,0.5)' : 'transparent',
            },
          ]}
        />
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
          borderColor: showBorder ? 'rgba(255,255,255,0.5)' : 'transparent',
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.initial,
          { fontSize: size * 0.45, color: '#FFFFFF' },
        ]}
      >
        {initial}
      </Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  logo: {
    resizeMode: 'cover',
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
