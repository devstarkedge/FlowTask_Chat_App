import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  Dimensions,
  FlatList,
} from 'react-native';
import { Zap, Shield, Users, Sparkles, ArrowRight, Check } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const LandingScreen = ({ navigation }) => {
  const features = [
    {
      id: '1',
      icon: Zap,
      title: 'Real-Time Messaging',
      desc: 'Instant message delivery powered by WebSocket',
      color: '#d97706',
    },
    {
      id: '2',
      icon: Shield,
      title: 'Enterprise Security',
      desc: 'JWT auth, RBAC, and HMAC verification',
      color: '#6366f1',
    },
    {
      id: '3',
      icon: Users,
      title: 'Project Channels',
      desc: 'Auto-created from your FlowTask projects',
      color: '#059669',
    },
    {
      id: '4',
      icon: Sparkles,
      title: 'Smart Integrations',
      desc: 'Connect GitHub, Slack, and other tools',
      color: '#7c3aed',
    },
  ];

  const benefits = [
    'Free forever with no credit card required',
    'Enterprise-grade security and encryption',
    'Unlimited team members and messages',
    'Real-time collaboration and presence',
    'File sharing and media support',
    'Mobile app and desktop sync',
  ];

  const renderFeature = ({ item }) => {
    const Icon = item.icon;
    return (
      <View style={styles.featureCard}>
        <View style={[styles.featureIcon, { backgroundColor: `${item.color}15` }]}>
          <Icon size={24} color={item.color} />
        </View>
        <Text style={styles.featureTitle}>{item.title}</Text>
        <Text style={styles.featureDesc}>{item.desc}</Text>
      </View>
    );
  };

  const renderBenefit = ({ item }) => (
    <View style={styles.benefitItem}>
      <Check size={18} color="#10b981" style={styles.benefitCheck} />
      <Text style={styles.benefitText}>{item}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logo}>
            <View style={styles.logoIcon}>
              <Sparkles size={20} color="white" />
            </View>
            <Text style={styles.logoText}>FlowTask Chat</Text>
          </View>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.badge}>
            <Sparkles size={12} color="#6366f1" />
            <Text style={styles.badgeText}>Enterprise · Secure · Real-time</Text>
          </View>

          <Text style={styles.heroHeading}>
            Team communication,{'\n'}reimagined
          </Text>

          <Text style={styles.heroSubheading}>
            Real-time messaging with project-aware channels and enterprise security
          </Text>

          <View style={styles.heroButtons}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate('Register')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Get Started Free</Text>
              <ArrowRight size={16} color="white" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>Sign In</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.heroNote}>✨ Free forever. No credit card required.</Text>
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
          <Text style={styles.sectionHeading}>Why choose FlowTask Chat?</Text>

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
          <Shield size={32} color="#6366f1" style={styles.securityIcon} />
          <Text style={styles.securityHeading}>Enterprise-Grade Security</Text>
          <Text style={styles.securityDesc}>
            Your data is protected with JWT authentication, role-based access control, and HMAC verification.
          </Text>

          <View style={styles.securityBadges}>
            <View style={styles.securityBadge}>
              <Shield size={14} color="#6366f1" />
              <Text style={styles.securityBadgeText}>JWT Secured</Text>
            </View>
            <View style={styles.securityBadge}>
              <Shield size={14} color="#6366f1" />
              <Text style={styles.securityBadgeText}>RBAC Roles</Text>
            </View>
            <View style={styles.securityBadge}>
              <Shield size={14} color="#6366f1" />
              <Text style={styles.securityBadgeText}>HMAC Verified</Text>
            </View>
          </View>
        </View>

        {/* CTA Section */}
        <View style={styles.ctaSection}>
          <Text style={styles.ctaHeading}>Ready to get started?</Text>
          <Text style={styles.ctaDesc}>Join thousands of teams already collaborating</Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Create Your Account</Text>
            <ArrowRight size={16} color="white" />
          </TouchableOpacity>

          <View style={styles.ctaFooter}>
            <Text style={styles.ctaFooterText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.ctaLink}>Sign in here</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2025 FlowTask Chat. All rights reserved.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f7f4',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.04)',
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
    letterSpacing: -0.5,
  },
  heroSection: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    gap: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366f1',
    letterSpacing: 0.5,
  },
  heroHeading: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1f2937',
    lineHeight: 37,
    marginBottom: 12,
    letterSpacing: -0.6,
  },
  heroSubheading: {
    fontSize: 14.5,
    color: '#6b7280',
    lineHeight: 23,
    marginBottom: 20,
  },
  heroButtons: {
    gap: 10,
    marginBottom: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 11,
    backgroundColor: '#6366f1',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'white',
    letterSpacing: -0.3,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 11,
    backgroundColor: 'white',
    borderWidth: 1.5,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6366f1',
    letterSpacing: -0.3,
  },
  heroNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#6b7280',
  },
  featuresSection: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    backgroundColor: 'white',
  },
  sectionHeading: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: -0.6,
  },
  featureRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  featureCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    padding: 18,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 6,
  },
  featureDesc: {
    fontSize: 12.5,
    color: '#6b7280',
    lineHeight: 19,
  },
  benefitsSection: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    backgroundColor: 'rgba(99, 102, 241, 0.04)',
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  benefitCheck: {
    marginTop: 2,
  },
  benefitText: {
    fontSize: 13.5,
    color: '#374151',
    lineHeight: 21,
    flex: 1,
  },
  securitySection: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    alignItems: 'center',
  },
  securityIcon: {
    marginBottom: 12,
    opacity: 0.8,
  },
  securityHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  securityDesc: {
    fontSize: 13.5,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  securityBadges: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  securityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6366f1',
  },
  ctaSection: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    alignItems: 'center',
  },
  ctaHeading: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.6,
  },
  ctaDesc: {
    fontSize: 13.5,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  ctaFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    justifyContent: 'center',
  },
  ctaFooterText: {
    fontSize: 12.5,
    color: '#6b7280',
  },
  ctaLink: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#6366f1',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.04)',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#9ca3af',
  },
});

export default LandingScreen;