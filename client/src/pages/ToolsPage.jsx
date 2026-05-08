import { Wrench } from 'lucide-react'

export default function ToolsPage() {
  const features = [
    'Build focused workflows',
    'Integrate task and chat context',
    'Keep automation discoverable',
  ]

  return (
    <div className="page-container workspace-page-shell">
      <div className="page-header page-header--hero">
        <div className="page-header__eyebrow">Automation</div>
        <div className="page-header__title-block">
          <span className="page-header__icon"><Wrench size={20} /></span>
          <div>
            <h1>Tools</h1>
            <p>Workflows, automations, and integrations should feel like a natural extension of the chat shell, not a separate product.</p>
          </div>
        </div>
      </div>
      <div className="page-body">
        <div className="workspace-page-grid">
          <section className="workspace-surface-card workspace-surface-card--wide workspace-empty-card">
            <div className="workspace-empty-card__icon"><Wrench size={28} /></div>
            <h2 className="workspace-surface-card__title">Workflows and integrations are being redesigned</h2>
            <p className="workspace-surface-card__copy">This page now uses the same shell language as chat and directories, with calmer surfaces, stronger hierarchy, and better empty-state structure.</p>
          </section>

          {features.map((feature) => (
            <section key={feature} className="workspace-surface-card">
              <div className="workspace-surface-card__eyebrow">Capability</div>
              <h2 className="workspace-surface-card__title">{feature}</h2>
              <p className="workspace-surface-card__copy">Design these tools to feel operational and precise, with enterprise-level clarity rather than decorative UI.</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
