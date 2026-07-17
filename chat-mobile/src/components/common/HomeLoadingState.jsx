import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { Hash, Layers, MessageSquare, Headphones, Bookmark, Settings, Edit3, Clock } from "lucide-react-native";
import { LOADING_MESSAGES } from "../../constants/loadingMessages";
import { scale, verticalScale, moderateScale } from '../../utils/responsive';


const SkeletonCard = ({ colors }) => (
  <View style={[styles.skeletonCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
    <View style={[styles.skeletonIcon, { backgroundColor: colors.border }]} />
    <View style={[styles.skeletonTextLabel, { backgroundColor: colors.border }]} />
    <View style={[styles.skeletonTextSub, { backgroundColor: colors.border }]} />
  </View>
);

const SkeletonRow = ({ colors }) => (
  <View style={styles.skeletonRow}>
    <View style={[styles.skeletonRowIcon, { backgroundColor: colors.border }]} />
    <View style={[styles.skeletonRowText, { backgroundColor: colors.border }]} />
  </View>
);

const HomeLoadingState = ({ colors, activeWorkspace }) => {
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
  }, [fadeAnim, floatAnim]);

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Dynamic Loading Message in Blue Header Extension */}
      <View style={[styles.blueHeaderExtension, { backgroundColor: colors.primary }]}>
        <Animated.View style={[styles.messageContainer, { opacity: fadeAnim }]}>
          <Animated.Text style={[styles.emoji, { transform: [{ translateY: floatAnim }] }]}>
            {loadingContent.emoji}
          </Animated.Text>
          <Text style={[styles.loadingText, { color: colors.textOnPrimary }]}>
            {loadingContent.text}
          </Text>
        </Animated.View>
      </View>

      {/* Skeleton Home Layout */}
      <View style={styles.content}>
        {/* Quick Access Cards Skeleton */}
        <View style={styles.cardsRow}>
          <SkeletonCard colors={colors} />
          <SkeletonCard colors={colors} />
          <SkeletonCard colors={colors} />
          <SkeletonCard colors={colors} />
        </View>

        {/* Channels Skeleton */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <View style={[styles.skeletonSectionIcon, { backgroundColor: colors.border }]} />
            <View style={[styles.skeletonSectionTitle, { backgroundColor: colors.border }]} />
          </View>
          <View style={[styles.skeletonSectionChevron, { backgroundColor: colors.border }]} />
        </View>

        <SkeletonRow colors={colors} />
        <SkeletonRow colors={colors} />
        <SkeletonRow colors={colors} />
        <SkeletonRow colors={colors} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  blueHeaderExtension: {
    paddingVertical: verticalScale(32),
    alignItems: "center",
    justifyContent: "center",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: scale(0), height: verticalScale(2) },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  messageContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emoji: {
    fontSize: moderateScale(32),
  },
  loadingText: {
    fontSize: moderateScale(16),
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingTop: verticalScale(10),
  },
  cardsRow: {
    flexDirection: "row",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    gap: 10,
    overflow: "hidden",
  },
  skeletonCard: {
    width: scale(88),
    height: verticalScale(80),
    borderRadius: moderateScale(10),
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: scale(6),
    gap: 8,
  },
  skeletonIcon: {
    width: scale(20),
    height: verticalScale(20),
    borderRadius: moderateScale(10),
    opacity: 0.5,
  },
  skeletonTextLabel: {
    width: scale(50),
    height: verticalScale(10),
    borderRadius: moderateScale(4),
    opacity: 0.5,
  },
  skeletonTextSub: {
    width: scale(30),
    height: verticalScale(8),
    borderRadius: moderateScale(4),
    opacity: 0.5,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(18),
    paddingBottom: verticalScale(6),
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  skeletonSectionIcon: {
    width: scale(14),
    height: verticalScale(14),
    borderRadius: moderateScale(4),
    opacity: 0.5,
  },
  skeletonSectionTitle: {
    width: scale(80),
    height: verticalScale(14),
    borderRadius: moderateScale(4),
    opacity: 0.5,
  },
  skeletonSectionChevron: {
    width: scale(16),
    height: verticalScale(16),
    borderRadius: moderateScale(4),
    opacity: 0.5,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(6),
    gap: 8,
    minHeight: verticalScale(36),
  },
  skeletonRowIcon: {
    width: scale(16),
    height: verticalScale(16),
    borderRadius: moderateScale(4),
    opacity: 0.5,
  },
  skeletonRowText: {
    width: scale(120),
    height: verticalScale(14),
    borderRadius: moderateScale(4),
    opacity: 0.5,
  },
});

export default HomeLoadingState;
