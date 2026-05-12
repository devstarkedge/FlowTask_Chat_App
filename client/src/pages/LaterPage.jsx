import { useState, useRef, useEffect } from 'react'
import { Clock, PencilLine, ClockFading, Sparkles } from 'lucide-react'
import { useParams } from 'react-router-dom'
import DraftsSidebar from '../components/chat/DraftsSidebar'
import ScheduledMessagesList from '../components/chat/ScheduledMessagesList'
import { countWorkspaceDrafts, useDraftStore } from '../stores/draftStore'
import { useUIStore } from '../stores/uiStore'
import './custom-css/laterPage.css'

export default function LaterPage() {
  const { workspaceId } = useParams()
  const [activeTab, setActiveTab] = useState('drafts')
  const [scheduledCount, setScheduledCount] = useState(0)
  const [animating, setAnimating] = useState(false)
  const [prevTab, setPrevTab] = useState(null)
  const contentRef = useRef(null)
  const draftCount = useDraftStore((s) => countWorkspaceDrafts(s.drafts, workspaceId))

  const activeLaterPage = useUIStore((s) => s.activeLaterPage)
  const setActiveLaterPage = useUIStore((s) => s.setActiveLaterPage)
  const clearActiveLaterPage = useUIStore((s) => s.clearActiveLaterPage)

  // Initialize tab from global UI intent (if any). Accept both 'sent' and 'scheduled'.
  useEffect(() => {
    if (!activeLaterPage) return
    const map = {
      drafts: 'drafts',
      sent: 'scheduled',
      scheduled: 'scheduled',
    }
    const mapped = map[activeLaterPage] || activeLaterPage
    if (mapped && mapped !== activeTab) setActiveTab(mapped)
    // clear the intent after consuming it
    clearActiveLaterPage()
  // Intentionally only run when the external intent changes
  }, [activeLaterPage])

  const TABS = [
    {
      id: "drafts",
      label: "Drafts",
      count: draftCount,
      icon: PencilLine,
      color: "var(--accent-primary)",
      description: "Unsent messages saved for later",
    },
    {
      id: "scheduled",
      label: "Scheduled",
      count: scheduledCount,
      icon: ClockFading,
      color: "var(--accent-yellow)",
      description: "Messages queued to send automatically",
    },
  ];

  const handleTabChange = (tabId) => {
    if (tabId === activeTab || animating) return;
    setPrevTab(activeTab);
    setAnimating(true);

    // fade-out → swap → fade-in
    if (contentRef.current) {
      contentRef.current.style.opacity = "0";
      contentRef.current.style.transform = "translateY(6px)";
    }

    setTimeout(() => {
      setActiveTab(tabId);
      if (contentRef.current) {
        contentRef.current.style.opacity = "1";
        contentRef.current.style.transform = "translateY(0)";
      }
      setAnimating(false);
      // reflect change in global UI store (so navigation intents stay in sync)
      try { setActiveLaterPage(tabId) } catch (e) { /* ignore */ }
    }, 160);
  };

  const activeTabData = TABS.find((t) => t.id === activeTab);

  return (
    <div className="later-root page-container">
      {/* ── HERO HEADER ── */}
      <div className="later-hero">
        {/* ambient glow orbs */}
        <div className="later-orb later-orb--1" aria-hidden="true" />
        <div className="later-orb later-orb--2" aria-hidden="true" />

        <div className="later-hero__inner">
          {/* icon + title row */}
          <div className="later-hero__identity">
            <div className="later-hero__icon-wrap">
              <Clock size={20} strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="later-hero__title">Later</h1>
              <p className="later-hero__subtitle animate-fade-in">
                {activeTabData?.description}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <div className="later-tabbar" role="tablist">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabChange(tab.id)}
              className={`later-tab ${isActive ? "later-tab--active" : ""}`}
              style={{ "--tab-accent": tab.color }}
            >
              {/* icon */}
              <span className="later-tab__icon">
                <tab.icon size={14} strokeWidth={2} />
              </span>

              {/* label */}
              <span className="later-tab__label">{tab.label}</span>
              {/* count badge */}
              {tab.count > 0 && (
                <span
                  className={`later-tab__badge ${isActive ? "later-tab__badge--active" : ""}`}
                >
                  {tab.count}
                </span>
              )}

              {/* active indicator bar */}
              {isActive && <span className="later-tab__bar" />}
            </button>
          );
        })}

        {/* right edge hint */}
        <div className="later-tabbar__hint">
          <Sparkles
            size={11}
            style={{ color: "var(--text-muted)", opacity: 0.5 }}
          />
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div
        ref={contentRef}
        className="later-body page-body"
        role="tabpanel"
        style={{ transition: "opacity 160ms ease, transform 160ms ease" }}
      >
        {activeTab === "drafts" ? (
          <DraftsSidebar />
        ) : (
          <ScheduledMessagesList onCountChange={setScheduledCount} />
        )}
      </div>
    </div>
  );
}
