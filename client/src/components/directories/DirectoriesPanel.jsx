import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Users, Hash, UsersRound, Globe, Mail, Contact } from "lucide-react";
import PeopleTab from "./PeopleTab";
import ChannelsTab from "./ChannelsTab";
import UserGroupsTab from "./UserGroupsTab";
import ExternalTab from "./ExternalTab";
import InvitationsTab from "./InvitationsTab";

const TABS = [
  { id: "people", label: "People", icon: Users, color: "#4e7cff" },
  { id: "channels", label: "Channels", icon: Hash, color: "#059669" },
  {
    id: "userGroups",
    label: "User Groups",
    icon: UsersRound,
    color: "#7c3aed",
  },
  { id: "external", label: "External", icon: Globe, color: "#ea580c" },
  { id: "invitations", label: "Invitations", icon: Mail, color: "#0891b2" },
];

export default function DirectoriesPanel() {
  const [searchParams] = useSearchParams();
  const initialTab = TABS.some((t) => t.id === searchParams.get("tab"))
    ? searchParams.get("tab")
    : "people";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [indicatorStyle, setIndicatorStyle] = useState({});
  const tabRefs = useRef({});
  const tabBarRef = useRef(null);

  // Move the sliding indicator to the active tab
  useEffect(() => {
    const el = tabRefs.current[activeTab];
    const bar = tabBarRef.current;
    if (!el || !bar) return;
    const barRect = bar.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setIndicatorStyle({
      left: elRect.left - barRect.left + bar.scrollLeft,
      width: elRect.width,
    });
  }, [activeTab]);

  const activeColor =
    TABS.find((t) => t.id === activeTab)?.color ||
    "var(--accent-color, var(--accent-primary))";

  return (
    <section className="dir-panel-root">
      {/* ── Header ── */}
      <div className="dir-panel-header">
        <div className="dir-panel-title-row">
          {/* Title + Icon */}
          <div className="dir-panel-title-wrap">
            <Contact size={18} className="dir-panel-title-icon" />

            <h6 className="dir-panel-title">Directories</h6>
          </div>

          <p className="dir-panel-subtitle">
            Browse your workspace members, channels & groups
          </p>
        </div>

        {/* ── Tab bar ── */}
        <div className="dir-tab-bar-wrap" ref={tabBarRef}>
          <div className="dir-tab-bar">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[tab.id] = el;
                  }}
                  onClick={() => setActiveTab(tab.id)}
                  className={`dir-tab ${isActive ? "dir-tab--active" : ""}`}
                  style={isActive ? { "--tab-color": tab.color } : {}}
                >
                  <span className="dir-tab-icon-wrap">
                    <Icon size={15} />
                  </span>

                  <span className="dir-tab-label">{tab.label}</span>
                </button>
              );
            })}

            {/* Sliding underline indicator */}
            <span
              className="dir-tab-indicator"
              style={{
                ...indicatorStyle,
                background: activeColor,
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="dir-panel-body" key={activeTab}>
        {activeTab === "people" && <PeopleTab />}
        {activeTab === "channels" && <ChannelsTab />}
        {activeTab === "userGroups" && <UserGroupsTab />}
        {activeTab === "external" && <ExternalTab />}
        {activeTab === "invitations" && <InvitationsTab />}
      </div>
    </section>
  );
}
