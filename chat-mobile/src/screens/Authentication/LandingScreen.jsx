import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Logo from "../../components/Logo";
import {
  Zap,
  Shield,
  Users,
  Sparkles,
  CircleChevronRight,
  Check,
} from "lucide-react-native";
import { useThemeStore } from "../../stores/themeStore";
import { scale, verticalScale, moderateScale } from '../../utils/responsive';




const LandingScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const features = [
    {
      id: "1",
      icon: Zap,
      title: "Real-Time Messaging",
      desc: "Instant message delivery powered by WebSocket",
      color: colors.warning,
    },
    {
      id: "2",
      icon: Shield,
      title: "Enterprise Security",
      desc: "JWT auth, RBAC, and HMAC verification",
      color: colors.primary,
    },
    {
      id: "3",
      icon: Users,
      title: "Project Channels",
      desc: "Auto-created from your FlowTask projects",
      color: colors.success,
    },
    {
      id: "4",
      icon: Sparkles,
      title: "Smart Integrations",
      desc: "Connect GitHub, Slack, and other tools",
      color: colors.primaryHover,
    },
  ];

  const benefits = [
    "Free forever with no credit card required",
    "Enterprise-grade security and encryption",
    "Unlimited team members and messages",
    "Real-time collaboration and presence",
    "File sharing and media support",
    "Mobile app and desktop sync",
  ];

  const renderFeature = ({ item }) => {
    const Icon = item.icon;
    return (
      <View style={styles.featureCard}>
        <View
          style={[styles.featureIcon, { backgroundColor: `${item.color}15` }]}
        >
          <Icon size={24} color={item.color} />
        </View>
        <Text style={styles.featureTitle}>{item.title}</Text>
        <Text style={styles.featureDesc}>{item.desc}</Text>
      </View>
    );
  };

  const renderBenefit = ({ item }) => (
    <View style={styles.benefitItem}>
      <Check size={18} color={colors.success} style={styles.benefitCheck} />
      <Text style={styles.benefitText}>{item}</Text>
    </View>
  );

  const styles = createStyles(colors);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View
          style={[styles.header, { borderBottomColor: colors.borderLight }]}
        >
          <View style={styles.logo}>
            <Logo width={32} height={32} style={styles.logoIcon} />
            <Text style={[styles.logoText, { color: colors.textPrimary }]}>
              TaskChat
            </Text>
          </View>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View
            style={[
              styles.badge,
              {
                borderColor: `${colors.primary}20`,
                backgroundColor: `${colors.primary}12`,
              },
            ]}
          >
            <Sparkles size={12} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              Enterprise · Secure · Real-time
            </Text>
          </View>

          <Text style={styles.heroHeading}>
            Team communication,{"\n"}reimagined
          </Text>

          <Text style={styles.heroSubheading}>
            Real-time messaging with project-aware channels and enterprise
            security
          </Text>

          <View style={styles.heroButtons}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primary },
              ]}
              onPress={() => navigation.navigate("Register")}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: colors.messageTextSent },
                ]}
              >
                Get Started Free
              </Text>
              <CircleChevronRight size={16} color={colors.messageTextSent} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                { borderColor: `${colors.primary}30` },
              ]}
              onPress={() => navigation.navigate("Login")}
              activeOpacity={0.85}
            >
              <Text
                style={[styles.secondaryButtonText, { color: colors.primary }]}
              >
                Sign In
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.heroNote}>
            ✨ Free forever. No credit card required.
          </Text>
        </View>

        {/* Features Section */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionHeading}>Everything your team needs</Text>

          <FlatList
            data={features}
            renderItem={renderFeature}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            numColumns={2}
            columnWrapperStyle={styles.featureRow}
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* Benefits Section */}
        <View style={styles.benefitsSection}>
          <Text style={styles.sectionHeading}>Why choose TaskChat?</Text>

          <FlatList
            data={benefits}
            renderItem={renderBenefit}
            keyExtractor={(item, idx) => idx.toString()}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* Security Section */}
        <View style={styles.securitySection}>
          <Shield
            size={32}
            color={colors.primary}
            style={styles.securityIcon}
          />
          <Text style={[styles.securityHeading, { color: colors.textPrimary }]}>
            Enterprise-Grade Security
          </Text>
          <Text style={styles.securityDesc}>
            Your data is protected with JWT authentication, role-based access
            control, and HMAC verification.
          </Text>

          <View style={styles.securityBadges}>
            <View style={styles.securityBadge}>
              <Shield size={14} color={colors.primary} />
              <Text
                style={[styles.securityBadgeText, { color: colors.primary }]}
              >
                JWT Secured
              </Text>
            </View>
            <View style={styles.securityBadge}>
              <Shield size={14} color={colors.primary} />
              <Text
                style={[styles.securityBadgeText, { color: colors.primary }]}
              >
                RBAC Roles
              </Text>
            </View>
            <View style={styles.securityBadge}>
              <Shield size={14} color={colors.primary} />
              <Text
                style={[styles.securityBadgeText, { color: colors.primary }]}
              >
                HMAC Verified
              </Text>
            </View>
          </View>
        </View>

        {/* CTA Section */}
        <View style={styles.ctaSection}>
          <Text style={styles.ctaHeading}>Ready to get started?</Text>
          <Text style={styles.ctaDesc}>
            Join thousands of teams already collaborating
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("Register")}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.primaryButtonText,
                { color: colors.messageTextSent },
              ]}
            >
              Create Your Account
            </Text>
            <CircleChevronRight size={16} color={colors.messageTextSent} />
          </TouchableOpacity>

          <View style={styles.ctaFooter}>
            <Text
              style={[styles.ctaFooterText, { color: colors.textSecondary }]}
            >
              Already have an account?{" "}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={[styles.ctaLink, { color: colors.primary }]}>
                Sign in here
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © 2025 TaskChat. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { flexGrow: 1 },
    header: {
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(16),
      borderBottomWidth: 1,
    },
    logo: { flexDirection: "row", alignItems: "center", gap: 10 },
    logoIcon: {
      width: scale(32),
      height: verticalScale(32),
      borderRadius: moderateScale(8),
    },
    logoText: {
      fontSize: moderateScale(15),
      fontWeight: "700",
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    heroSection: {
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(32),
      backgroundColor: colors.primaryOverlay,
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      borderWidth: 1,
      borderRadius: moderateScale(20),
      paddingVertical: verticalScale(8),
      paddingHorizontal: scale(12),
      marginBottom: verticalScale(16),
      gap: 6,
    },
    badgeText: {
      fontSize: moderateScale(11),
      fontWeight: "700",
      color: colors.primary,
      letterSpacing: 0.5,
    },
    heroHeading: {
      fontSize: moderateScale(32),
      fontWeight: "800",
      color: colors.textPrimary,
      lineHeight: 37,
      marginBottom: verticalScale(12),
      letterSpacing: -0.6,
    },
    heroSubheading: {
      fontSize: 14.5,
      color: colors.textSecondary,
      lineHeight: 23,
      marginBottom: verticalScale(20),
    },
    heroButtons: { gap: 10, marginBottom: verticalScale(16) },
    primaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: verticalScale(14),
      paddingHorizontal: scale(20),
      borderRadius: moderateScale(11),
      gap: 8,
    },
    primaryButtonText: {
      fontSize: moderateScale(15),
      fontWeight: "700",
      color: colors.messageTextSent,
      letterSpacing: -0.3,
    },
    secondaryButton: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: verticalScale(14),
      paddingHorizontal: scale(20),
      borderRadius: moderateScale(11),
      backgroundColor: colors.card,
      borderWidth: 1.5,
    },
    secondaryButtonText: {
      fontSize: moderateScale(15),
      fontWeight: "700",
      color: colors.primary,
      letterSpacing: -0.3,
    },
    heroNote: {
      textAlign: "center",
      fontSize: moderateScale(12),
      color: colors.textSecondary,
    },
    featuresSection: {
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(32),
      backgroundColor: colors.card,
    },
    sectionHeading: {
      fontSize: moderateScale(24),
      fontWeight: "800",
      color: colors.textPrimary,
      textAlign: "center",
      marginBottom: verticalScale(20),
      letterSpacing: -0.6,
    },
    featureRow: { justifyContent: "space-between", marginBottom: verticalScale(12), gap: 12 },
    featureCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: moderateScale(14),
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: moderateScale(18),
    },
    featureIcon: {
      width: scale(36),
      height: verticalScale(36),
      borderRadius: moderateScale(8),
      justifyContent: "center",
      alignItems: "center",
      marginBottom: verticalScale(10),
    },
    featureTitle: {
      fontSize: moderateScale(14),
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: verticalScale(6),
    },
    featureDesc: {
      fontSize: 12.5,
      color: colors.textSecondary,
      lineHeight: 19,
    },
    benefitsSection: {
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(32),
      backgroundColor: colors.primaryOverlayLight,
    },
    benefitItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingVertical: verticalScale(12),
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    benefitCheck: { marginTop: verticalScale(2) },
    benefitText: {
      fontSize: 13.5,
      color: colors.textPrimary,
      lineHeight: 21,
      flex: 1,
    },
    securitySection: {
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(32),
      alignItems: "center",
    },
    securityIcon: { marginBottom: verticalScale(12), opacity: 0.8 },
    securityHeading: {
      fontSize: moderateScale(22),
      fontWeight: "800",
      color: colors.textPrimary,
      marginBottom: verticalScale(8),
      letterSpacing: -0.5,
    },
    securityDesc: {
      fontSize: 13.5,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 21,
      marginBottom: verticalScale(20),
    },
    securityBadges: {
      flexDirection: "row",
      gap: 10,
      justifyContent: "center",
      flexWrap: "wrap",
    },
    securityBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.card,
      borderRadius: moderateScale(12),
      borderWidth: 1,
      paddingVertical: verticalScale(10),
      paddingHorizontal: scale(12),
    },
    securityBadgeText: {
      fontSize: moderateScale(11),
      fontWeight: "600",
      color: colors.primary,
    },
    ctaSection: {
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(32),
      backgroundColor: colors.primaryOverlay,
      alignItems: "center",
    },
    ctaHeading: {
      fontSize: moderateScale(24),
      fontWeight: "800",
      color: colors.textPrimary,
      textAlign: "center",
      marginBottom: verticalScale(8),
      letterSpacing: -0.6,
    },
    ctaDesc: {
      fontSize: 13.5,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: verticalScale(20),
    },
    ctaFooter: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: verticalScale(16),
      justifyContent: "center",
    },
    ctaFooterText: { fontSize: 12.5, color: colors.textSecondary },
    ctaLink: { fontSize: 12.5, fontWeight: "600", color: colors.primary },
    footer: {
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(20),
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
      backgroundColor: colors.surfaceOverlayHeavy,
      alignItems: "center",
    },
    footerText: { fontSize: moderateScale(12), color: colors.textTertiary },
  });

export default LandingScreen;
