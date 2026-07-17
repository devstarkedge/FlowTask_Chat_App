import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { LOADING_MESSAGES } from "../../constants/loadingMessages";
import { scale, verticalScale, moderateScale } from '../../utils/responsive';


const HomeHeaderLoader = ({ colors }) => {
  const [loadingContent, setLoadingContent] = useState({ text: "", emoji: "" });
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Select a random message
    const randomIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
    setLoadingContent(LOADING_MESSAGES[randomIndex]);

    // Fade In
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // Floating Emoji
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -5,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    return () => {
      fadeAnim.stopAnimation();
      floatAnim.stopAnimation();
    };
  }, [fadeAnim, floatAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Animated.Text style={[styles.emoji, { transform: [{ translateY: floatAnim }] }]}>
        {loadingContent.emoji}
      </Animated.Text>
      <Text style={[styles.loadingText, { color: colors.textOnPrimary }]}>
        {loadingContent.text}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: verticalScale(12),
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emoji: {
    fontSize: moderateScale(24),
  },
  loadingText: {
    fontSize: moderateScale(14),
    fontWeight: "600",
  },
});

export default HomeHeaderLoader;
