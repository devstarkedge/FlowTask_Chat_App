import { Home, MessageCircle, Users, TrendingUp } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

export default function HomePage() {
  const { user } = useAuthStore()

  return (
    <div className="page-container">
      <div className="page-header">
        <Home size={20} style={{ color: 'var(--accent-primary)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-white)' }}>Home</h1>
      </div>
      <div className="page-body">
        <div className="text-center py-16">
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-white)' }}>
            Welcome back{user?.name ? `, ${user.name}` : ''}!
          </h2>
          <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
            Here's what's happening in your workspace
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
            <QuickStat icon={MessageCircle} label="Unread" value="—" />
            <QuickStat icon={Users} label="Online" value="—" />
            <QuickStat icon={TrendingUp} label="Threads" value="—" />
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickStat({ icon: Icon, label, value }) {
  return (
    <div
      className="rounded-xl p-4 text-center"
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
    >
      <Icon size={20} className="mx-auto mb-2" style={{ color: 'var(--accent-primary)' }} />
      <div className="text-lg font-bold" style={{ color: 'var(--text-white)' }}>{value}</div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}
