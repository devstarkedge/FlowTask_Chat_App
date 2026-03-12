import { useState, useEffect } from 'react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { CreditCard, Check, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import logger from '../../utils/logger'

const PLAN_DETAILS = {
  free: { name: 'Free', price: '$0', period: 'forever', color: '#71717a' },
  pro: { name: 'Pro', price: '$8', period: 'per user/mo', color: '#6366f1' },
  enterprise: { name: 'Enterprise', price: 'Custom', period: '', color: '#f59e0b' },
}

export default function BillingSettingsPanel() {
  const { activeWorkspace, activeWorkspaceId, fetchBilling, upgradePlan } = useWorkspaceStore()
  const [billing, setBilling] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(null)
  const [error, setError] = useState(null)
  const [confirmPlan, setConfirmPlan] = useState(null)

  useEffect(() => {
    if (!activeWorkspaceId) return
    setIsLoading(true)
    setError(null)
    fetchBilling(activeWorkspaceId)
      .then((data) => setBilling(data))
      .catch((err) => {
        const msg = err?.response?.data?.error?.message || 'Failed to load billing information'
        setError(msg)
      })
      .finally(() => setIsLoading(false))
  }, [activeWorkspaceId, fetchBilling])

  const currentPlan = activeWorkspace?.plan || 'free'

  const handleUpgrade = async (newPlan) => {
    setConfirmPlan(null)
    setUpgrading(newPlan)
    try {
      await upgradePlan(activeWorkspaceId, newPlan)
      const data = await fetchBilling(activeWorkspaceId)
      setBilling(data)
    } catch (err) {
      const msg = err?.response?.data?.error?.message || 'Failed to change plan'
      setError(msg)
      logger.error('Plan change error:', err)
    } finally {
      setUpgrading(null)
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)', margin: '0 auto' }} />
      </div>
    )
  }

  if (error && !billing) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <AlertCircle size={32} style={{ color: '#ef4444', margin: '0 auto 12px' }} />
        <p style={{ color: '#ef4444', marginBottom: 16, fontSize: 14 }}>{error}</p>
        <button
          onClick={() => {
            setError(null)
            setIsLoading(true)
            fetchBilling(activeWorkspaceId)
              .then((data) => setBilling(data))
              .catch((e) => setError(e?.response?.data?.error?.message || 'Failed to load billing information'))
              .finally(() => setIsLoading(false))
          }}
          style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--accent-primary)', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-white)', marginBottom: 4 }}>
        <CreditCard size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
        Billing & Plan
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
        Manage your workspace plan and billing.
      </p>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#ef4444' }}>{error}</span>
        </div>
      )}

      {/* Current Plan */}
      <div style={{
        background: 'var(--bg-tertiary)', borderRadius: 12, padding: 20, marginBottom: 24,
        border: '1px solid var(--border-primary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 4 }}>
              Current Plan
            </p>
            <p style={{ fontSize: 22, fontWeight: 700, color: PLAN_DETAILS[currentPlan]?.color || 'var(--text-white)' }}>
              {PLAN_DETAILS[currentPlan]?.name || currentPlan}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-white)' }}>
              {PLAN_DETAILS[currentPlan]?.price}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {PLAN_DETAILS[currentPlan]?.period}
            </p>
          </div>
        </div>

        {billing?.usage && (
          <div style={{
            display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)',
            borderTop: '1px solid var(--border-secondary)', paddingTop: 12,
          }}>
            <span>
              Members: <strong style={{ color: 'var(--text-white)' }}>{billing.usage.members}</strong>
              {billing.limits?.maxMembers > 0 && ` / ${billing.limits.maxMembers}`}
            </span>
          </div>
        )}
      </div>

      {/* Plan Options */}
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-white)', marginBottom: 12 }}>
        Available Plans
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Object.entries(PLAN_DETAILS).map(([planId, details]) => {
          const isCurrent = planId === currentPlan
          return (
            <div
              key={planId}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', borderRadius: 10,
                background: isCurrent ? 'rgba(99,102,241,0.08)' : 'var(--bg-primary)',
                border: isCurrent ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--border-secondary)',
              }}
            >
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-white)' }}>
                  {details.name}
                  {isCurrent && (
                    <span style={{
                      fontSize: 11, background: 'rgba(99,102,241,0.2)', color: '#a5b4fc',
                      padding: '2px 8px', borderRadius: 12, marginLeft: 8, fontWeight: 500,
                    }}>Current</span>
                  )}
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                  {details.price} {details.period}
                </p>
              </div>
              {!isCurrent && planId !== 'enterprise' && (
                confirmPlan === planId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Confirm change?</span>
                    <button
                      onClick={() => handleUpgrade(planId)}
                      disabled={!!upgrading}
                      style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--accent-primary)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: !!upgrading ? 0.6 : 1 }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmPlan(null)}
                      disabled={!!upgrading}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-secondary)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmPlan(planId)}
                    disabled={!!upgrading}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: 'var(--accent-primary)', color: 'white',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                      opacity: !!upgrading ? 0.6 : 1,
                    }}
                  >
                    {upgrading === planId ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                    {upgrading === planId ? 'Changing...' : 'Select'}
                  </button>
                )
              )}
              {isCurrent && <Check size={18} style={{ color: 'var(--accent-primary)' }} />}
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
        Payment processing coming soon. Plan changes take effect immediately.
      </p>
    </div>
  )
}
