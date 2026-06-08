import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useThemeStore } from '../../stores/themeStore';

const CreateWorkspaceScreen = () => {
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}> 
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Create Workspace</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Coming soon...</Text>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
    },
  });

export default CreateWorkspaceScreen;
