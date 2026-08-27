import { Play, LayoutTemplate, User, ChevronDown, Megaphone, FileText, Hand, Bell, Send, Calendar, Layers, Mail, Eye, Activity } from 'lucide-react'

const STYLES = `
.tp-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #111827);
  overflow-y: auto;
  height: 100%;
}

.tp-header {
  display: flex;
  flex-direction: column;
  padding: 24px 32px 0;
  border-bottom: 1px solid var(--border-primary, #e5e7eb);
  background: var(--bg-primary, #fff);
  flex-shrink: 0;
}

.tp-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.tp-title-row h1 {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary, #111827);
}

.tp-tabs {
  display: flex;
  gap: 24px;
}

.tp-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, #4b5563);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  background: transparent;
  border-top: none;
  border-left: none;
  border-right: none;
}

.tp-tab.is-active {
  color: var(--accent-primary, #4f46e5);
  border-bottom-color: var(--accent-primary, #4f46e5);
}

.tp-content {
  padding: 32px;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

.tp-section {
  margin-bottom: 48px;
}

.tp-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  position: relative;
}

.tp-section-header::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: var(--border-primary, #e5e7eb);
  z-index: 1;
}

.tp-section-label {
  display: inline-flex;
  background: var(--bg-primary, #fff);
  padding-right: 16px;
  position: relative;
  z-index: 2;
}

.tp-section-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 16px;
  border-radius: 999px;
  border: 1px solid var(--border-primary, #e5e7eb);
  font-size: 13px;
  font-weight: 700;
  color: var(--accent-primary, #4f46e5);
  background: var(--bg-primary, #fff);
}

.tp-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-primary, #e5e7eb);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #4b5563);
  background: var(--bg-primary, #fff);
  position: relative;
  z-index: 2;
  cursor: pointer;
}

.tp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.tp-card {
  display: flex;
  flex-direction: column;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--border-primary, #e5e7eb);
  background: var(--bg-primary, #fff);
  transition: all 150ms ease;
  cursor: pointer;
}

.tp-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  border-color: var(--border-secondary, #d1d5db);
  transform: translateY(-2px);
}

.tp-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.tp-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--bg-secondary, #f3f4f6);
  color: var(--accent-primary, #4f46e5);
  flex-shrink: 0;
}

.tp-card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary, #111827);
  margin: 0;
  flex: 1;
}

.tp-card-desc {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Dark mode adjustments if needed, though the screenshot looks like a light content area with dark sidebar */
[data-theme="dark"] .tp-container {
  background: var(--bg-primary, #1a1d21);
}
[data-theme="dark"] .tp-header,
[data-theme="dark"] .tp-section-label,
[data-theme="dark"] .tp-section-pill,
[data-theme="dark"] .tp-filter-btn,
[data-theme="dark"] .tp-card {
  background: var(--bg-primary, #1a1d21);
}
[data-theme="dark"] .tp-card-icon {
  background: var(--bg-secondary, #222529);
}
`;

const TEMPLATES = [
  { id: 't1', icon: Megaphone, title: 'Weekly Check in', desc: 'Automatically send a weekly message asking for updates from the team' },
  { id: 't2', icon: FileText, title: 'Google Sheets feedback log', desc: 'Request information in a form and add it to a Google Sheet from TaskChat' },
  { id: 't3', icon: Hand, title: 'New hire onboarding', desc: 'Let newcomers join team channels from a simple link' },
  { id: 't4', icon: Bell, title: 'Emoji reaction notification', desc: 'When someone emoji reacts to a message, send them a link to the...' },
];

const MORE_TEMPLATES = [
  { id: 't5', icon: Send, title: 'Scheduled message', desc: 'Schedule a recurring message to ask for status or project updates' },
  { id: 't6', icon: Calendar, title: 'Giphy meeting reminders', desc: 'Send a GIF with your scheduled weekly meeting reminder' },
  { id: 't7', icon: Layers, title: 'New Jira Cloud issue', desc: 'Fill out a form in TaskChat to create an issue in Jira Cloud' },
  { id: 't8', icon: FileText, title: 'Google Sheets sales lead tracker', desc: 'Fill out a form in TaskChat to add Sales leads to a Google Sheet' },
  { id: 't9', icon: Activity, title: 'Asana task from emoji reaction', desc: 'Use emoji reactions to turn TaskChat messages into Asana tasks' },
  { id: 't10', icon: Mail, title: 'New Gmail message', desc: 'Fill out a form in TaskChat to send a Gmail message' },
  { id: 't11', icon: Calendar, title: 'New Google Calendar event', desc: 'Use TaskChat to create a Google Calendar event' },
  { id: 't12', icon: Eye, title: 'Support response', desc: 'Use emoji reactions to respond to and manage support requests' },
];

export default function ToolsPage() {
  return (
    <div className="tp-container">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="tp-header">
        <div className="tp-title-row">
          <Play size={22} className="text-accent" style={{ color: 'var(--accent-primary, #4f46e5)' }} />
          <h1>Workflows</h1>
        </div>
        <div className="tp-tabs">
          <button className="tp-tab is-active">
            <LayoutTemplate size={16} />
            Templates
          </button>
          <button className="tp-tab">
            <User size={16} />
            Managed by you
          </button>
        </div>
      </div>

      <div className="tp-content">
        <div className="tp-section">
          <div className="tp-section-header">
            <div className="tp-section-label">
              <span className="tp-section-pill">Featured templates</span>
            </div>
          </div>
          <div className="tp-grid">
            {TEMPLATES.map(t => (
              <div key={t.id} className="tp-card">
                <div className="tp-card-header">
                  <div className="tp-card-icon"><t.icon size={18} /></div>
                  <h3 className="tp-card-title">{t.title}</h3>
                </div>
                <p className="tp-card-desc">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="tp-section">
          <div className="tp-section-header">
            <div className="tp-section-label">
              <span className="tp-section-pill" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-primary)' }}>All templates</span>
            </div>
            <button className="tp-filter-btn">
              All connectors <ChevronDown size={14} />
            </button>
          </div>
          <div className="tp-grid">
            {[...TEMPLATES, ...MORE_TEMPLATES].map((t, idx) => (
              <div key={t.id + '-' + idx} className="tp-card">
                <div className="tp-card-header">
                  <div className="tp-card-icon"><t.icon size={18} /></div>
                  <h3 className="tp-card-title">{t.title}</h3>
                </div>
                <p className="tp-card-desc">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
