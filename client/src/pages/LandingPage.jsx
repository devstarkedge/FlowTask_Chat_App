import { Link } from 'react-router-dom'
import {
  MessageSquare, Users, Zap, FolderKanban, Shield, ArrowRight,
  CheckCircle2, Globe, Clock, FileText,
} from 'lucide-react'

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Real-Time Messaging',
    description: 'Instant messaging with rich text, mentions, reactions, and threaded conversations.',
  },
  {
    icon: Users,
    title: 'Workspace Management',
    description: 'Organize your teams into workspaces with channels, roles, and granular permissions.',
  },
  {
    icon: FolderKanban,
    title: 'FlowTask Integration',
    description: 'Auto-sync project channels, task updates, and team members with FlowTask.',
  },
  {
    icon: FileText,
    title: 'File Sharing',
    description: 'Share files, images, and documents with drag-and-drop uploads via Cloudinary.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Role-based access control, workspace isolation, and encrypted communications.',
  },
  {
    icon: Zap,
    title: 'Slack-Level Performance',
    description: 'Optimistic UI, cursor pagination, and real-time Socket.IO for zero-lag chat.',
  },
]

const PRICING_TIERS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For small teams getting started',
    features: ['Up to 50 members', '20 channels', '5GB storage', 'Community support'],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$8',
    period: 'per user/month',
    description: 'For growing teams that need more',
    features: ['Up to 500 members', 'Unlimited channels', '50GB storage', 'FlowTask integration', 'Priority support'],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'contact us',
    description: 'For organizations at scale',
    features: ['Unlimited members', 'Unlimited channels', 'Unlimited storage', 'SSO & SAML', 'Dedicated support', 'Custom integrations'],
    cta: 'Contact Sales',
    highlighted: false,
  },
]

export default function LandingPage() {
  return (
    <div style={{ background: '#0a0a0f', color: '#e5e7eb', height: '100%', overflowY: 'auto' }}>
      {/* Nav */}
      <nav
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'rgba(10, 10, 15, 0.8)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <MessageSquare size={18} color="white" />
              </div>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>FlowTask Chat</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Link
                to="/login"
                style={{
                  color: '#a1a1aa', fontSize: 14, textDecoration: 'none', padding: '8px 16px',
                  borderRadius: 8, transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'white')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#a1a1aa')}
              >
                Sign In
              </Link>
              <Link
                to="/register"
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: 'white', fontSize: 14, fontWeight: 600,
                  padding: '8px 20px', borderRadius: 8, textDecoration: 'none',
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: '100px 24px 80px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Gradient orbs */}
        <div style={{
          position: 'absolute', top: -200, left: '50%', transform: 'translateX(-50%)',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ maxWidth: 800, margin: '0 auto', position: 'relative' }}>
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 30, padding: '6px 16px', marginBottom: 28, fontSize: 13, color: '#a5b4fc',
            }}
          >
            <Zap size={14} />
            Now with FlowTask Integration
          </div>
          <h1 style={{
            fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 800,
            lineHeight: 1.1, marginBottom: 20, color: 'white',
            background: 'linear-gradient(to right, white, #a5b4fc)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Team Chat Built for{' '}
            <span style={{ background: 'linear-gradient(135deg, #6366f1, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Modern Work
            </span>
          </h1>
          <p style={{ fontSize: 18, color: '#9ca3af', lineHeight: 1.7, maxWidth: 600, margin: '0 auto 36px' }}>
            A workspace-based messaging platform with deep project management integration. Built for teams that ship fast.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Link
              to="/register"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: 'white', fontSize: 16, fontWeight: 600,
                padding: '14px 28px', borderRadius: 12, textDecoration: 'none',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 0 30px rgba(99,102,241,0.3)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(99,102,241,0.5)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(99,102,241,0.3)' }}
            >
              Start for Free <ArrowRight size={18} />
            </Link>
            <Link
              to="/login"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#d1d5db', fontSize: 16, fontWeight: 500,
                padding: '14px 28px', borderRadius: 12, textDecoration: 'none',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
            >
              Sign In
            </Link>
          </div>
          {/* Social proof */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32,
            marginTop: 48, flexWrap: 'wrap',
          }}>
            {[
              { icon: Globe, text: 'Multi-Workspace' },
              { icon: Clock, text: 'Real-Time' },
              { icon: Shield, text: 'Enterprise-Ready' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 14 }}>
                <item.icon size={16} style={{ color: '#6366f1' }} />
                {item.text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '80px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: 'white', marginBottom: 12 }}>
            Everything your team needs
          </h2>
          <p style={{ fontSize: 16, color: '#9ca3af', maxWidth: 500, margin: '0 auto' }}>
            Powerful features designed for teams of every size, from startups to enterprises.
          </p>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
        }}>
          {FEATURES.map((feature, i) => (
            <div
              key={i}
              style={{
                padding: 28,
                borderRadius: 16,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                transition: 'border-color 0.2s, background 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
              }}
            >
              <div
                style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'rgba(99,102,241,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <feature.icon size={22} style={{ color: '#818cf8' }} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'white', marginBottom: 8 }}>{feature.title}</h3>
              <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6 }}>{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: 'white', marginBottom: 12 }}>
            Simple, transparent pricing
          </h2>
          <p style={{ fontSize: 16, color: '#9ca3af' }}>
            Start free. Upgrade when you're ready.
          </p>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          alignItems: 'start',
        }}>
          {PRICING_TIERS.map((tier, i) => (
            <div
              key={i}
              style={{
                padding: 32,
                borderRadius: 16,
                background: tier.highlighted
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))'
                  : 'rgba(255,255,255,0.03)',
                border: tier.highlighted
                  ? '1px solid rgba(99,102,241,0.4)'
                  : '1px solid rgba(255,255,255,0.06)',
                position: 'relative',
              }}
            >
              {tier.highlighted && (
                <div
                  style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: 'white', fontSize: 11, fontWeight: 600,
                    padding: '4px 14px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 1,
                  }}
                >
                  Popular
                </div>
              )}
              <h3 style={{ fontSize: 20, fontWeight: 600, color: 'white', marginBottom: 4 }}>{tier.name}</h3>
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>{tier.description}</p>
              <div style={{ marginBottom: 24 }}>
                <span style={{ fontSize: 40, fontWeight: 800, color: 'white' }}>{tier.price}</span>
                <span style={{ fontSize: 14, color: '#6b7280', marginLeft: 4 }}>/{tier.period}</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tier.features.map((f, fi) => (
                  <li key={fi} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#d1d5db' }}>
                    <CheckCircle2 size={16} style={{ color: '#6366f1', flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/register"
                style={{
                  display: 'block', textAlign: 'center', padding: '12px 0', borderRadius: 10,
                  fontSize: 14, fontWeight: 600, textDecoration: 'none',
                  background: tier.highlighted
                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                    : 'transparent',
                  color: tier.highlighted ? 'white' : '#a5b4fc',
                  border: tier.highlighted ? 'none' : '1px solid rgba(99,102,241,0.3)',
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div style={{
          maxWidth: 700, margin: '0 auto', padding: 48, borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.08))',
          border: '1px solid rgba(99,102,241,0.2)',
        }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: 'white', marginBottom: 12 }}>
            Ready to transform your team communication?
          </h2>
          <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 28 }}>
            Join thousands of teams already using FlowTask Chat.
          </p>
          <Link
            to="/register"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: 'white', fontSize: 16, fontWeight: 600,
              padding: '14px 32px', borderRadius: 12, textDecoration: 'none',
              boxShadow: '0 0 30px rgba(99,102,241,0.3)',
            }}
          >
            Get Started Free <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '40px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
        maxWidth: 1200, margin: '0 auto',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <MessageSquare size={14} color="white" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>FlowTask Chat</span>
          </div>
          <p style={{ fontSize: 13, color: '#4b5563' }}>
            &copy; {new Date().getFullYear()} FlowTask. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
