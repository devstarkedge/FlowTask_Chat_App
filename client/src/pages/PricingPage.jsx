import { Link, useNavigate } from 'react-router-dom'
import { MessageSquare, Check, ArrowRight } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For small teams getting started',
    features: [
      'Up to 50 members',
      '20 channels',
      '5 MB file uploads',
      'Threads & reactions',
      'Community support',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$8',
    period: 'per user/month',
    description: 'For growing teams that need more',
    features: [
      'Up to 500 members',
      'Unlimited channels',
      '25 MB file uploads',
      'Custom emoji',
      'Guest access',
      'Advanced search',
      'FlowTask integration',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: 'contact us',
    description: 'For organizations at scale',
    features: [
      'Unlimited members',
      'Unlimited channels',
      '100 MB file uploads',
      'SSO & SAML',
      'Video calls',
      'Audit log',
      'Dedicated support',
      'Custom integrations',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
]

export default function PricingPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const handleSelect = (planId) => {
    if (user) {
      navigate(`/create-workspace?plan=${planId}`)
    } else {
      navigate(`/register?plan=${planId}`)
    }
  }

  return (
    <div style={{ background: '#0a0a0f', color: '#e5e7eb', minHeight: '100vh' }}>
      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10, 10, 15, 0.8)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MessageSquare size={18} color="white" />
              </div>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>FlowTask Chat</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {user ? (
                <Link to="/select-workspace" style={{
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: 'white', fontSize: 14, fontWeight: 600,
                  padding: '8px 20px', borderRadius: 8, textDecoration: 'none',
                }}>
                  Go to Workspaces
                </Link>
              ) : (
                <>
                  <Link to="/login" style={{ color: '#a1a1aa', fontSize: 14, textDecoration: 'none', padding: '8px 16px' }}>
                    Sign In
                  </Link>
                  <Link to="/register" style={{
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: 'white', fontSize: 14, fontWeight: 600,
                    padding: '8px 20px', borderRadius: 8, textDecoration: 'none',
                  }}>
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section style={{ padding: '80px 24px 40px', textAlign: 'center' }}>
        <h1 style={{
          fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 800,
          color: 'white', marginBottom: 16,
        }}>
          Simple, transparent pricing
        </h1>
        <p style={{ maxWidth: 540, margin: '0 auto', color: '#a1a1aa', fontSize: 18 }}>
          Choose the plan that fits your team. Upgrade or downgrade anytime.
        </p>
      </section>

      {/* Plan Cards */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 100px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              style={{
                background: plan.highlighted
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))'
                  : 'rgba(255,255,255,0.03)',
                border: plan.highlighted
                  ? '2px solid rgba(99,102,241,0.4)'
                  : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16, padding: 32,
                display: 'flex', flexDirection: 'column',
              }}
            >
              {plan.highlighted && (
                <span style={{
                  alignSelf: 'flex-start', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: 1, color: '#a5b4fc',
                  background: 'rgba(99,102,241,0.15)', padding: '4px 12px', borderRadius: 20, marginBottom: 16,
                }}>Most Popular</span>
              )}
              <h3 style={{ fontSize: 22, fontWeight: 700, color: 'white', marginBottom: 8 }}>{plan.name}</h3>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 40, fontWeight: 800, color: 'white' }}>{plan.price}</span>
                <span style={{ fontSize: 14, color: '#a1a1aa', marginLeft: 6 }}>{plan.period}</span>
              </div>
              <p style={{ fontSize: 14, color: '#a1a1aa', marginBottom: 24 }}>{plan.description}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', flex: 1 }}>
                {plan.features.map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 14, color: '#d1d5db' }}>
                    <Check size={16} style={{ color: '#6366f1', flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSelect(plan.id)}
                style={{
                  width: '100%', padding: '12px 24px', borderRadius: 10, border: 'none',
                  fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: plan.highlighted
                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                    : 'rgba(255,255,255,0.08)',
                  color: 'white',
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {plan.cta} <ArrowRight size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
