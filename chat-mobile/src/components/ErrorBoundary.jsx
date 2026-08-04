import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import logger from '../utils/logger';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // In production, send to error reporting service (Sentry, Bugsnag, etc.)
    logger.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const colors = useThemeStore.getState().colors;
      return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.content}>
            <Text style={styles.emoji}>⚠️</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Something went wrong</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              The app encountered an unexpected error. Please try restarting.
            </Text>

            <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={this.handleReset}>
              <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: moderateScale(24),
  },
  emoji: {
    fontSize: moderateScale(48),
    marginBottom: verticalScale(16),
  },
  title: {
    fontSize: moderateScale(20),
    fontWeight: '700',
    marginBottom: verticalScale(8),
  },
  message: {
    fontSize: moderateScale(15),
    textAlign: 'center',
    marginBottom: verticalScale(24),
    lineHeight: 22,
  },
  debugContainer: {
    borderRadius: moderateScale(8),
    padding: moderateScale(12),
    marginBottom: verticalScale(24),
    width: '100%',
  },
  debugTitle: {
    fontSize: moderateScale(12),
    fontWeight: '700',
    marginBottom: verticalScale(4),
  },
  debugText: {
    fontSize: moderateScale(11),
    fontFamily: 'monospace',
  },
  button: {
    paddingHorizontal: scale(24),
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(10),
  },
  buttonText: {
    fontSize: moderateScale(15),
    fontWeight: '600',
  },
});

export default ErrorBoundary;
