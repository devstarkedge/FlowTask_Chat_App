import { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Bot,
  Play,
  LayoutGrid,
  LayoutList,
} from "lucide-react";

import WorkspaceSwitcher from "../../workspace/WorkspaceSwitcher";
import SidebarContainer from "../sidebar/SidebarContainer";

const STYLES = `
.tcs-scroll {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0 12px;
}

.tcs-scroll::-webkit-scrollbar {
  width: 4px;
}

.tcs-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.tcs-scroll::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.12);
  border-radius: 999px;
}

.tcs-section-title {
  padding: 10px 16px 6px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.55);
}

.tcs-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}

.tcs-nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: rgba(255,255,255,0.72);
  cursor: pointer;
  transition:
    background 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

.tcs-nav-item:hover {
  background: rgba(255,255,255,0.06);
  color: #ffffff;
}

.tcs-nav-item:active {
  transform: scale(0.985);
}

.tcs-nav-item.is-active {
  background: rgba(255,255,255,0.12);
  color: #ffffff;
}

.tcs-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tcs-label {
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
}

.tcs-nav-item.is-active .tcs-label {
  font-weight: 600;
}
`;

export default function ToolsContextSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaceId } = useParams();

  const NAV_ITEMS = useMemo(
    () => [
      {
        id: "agents",
        label: "Agents",
        icon: Bot,
        path: `/workspace/${workspaceId}/tools/agents`,
      },
      {
        id: "workflows",
        label: "Workflows",
        icon: Play,
        path: `/workspace/${workspaceId}/tools/workflows`,
      },
      {
        id: "apps",
        label: "Apps",
        icon: LayoutGrid,
        path: `/workspace/${workspaceId}/tools/apps`,
      },
      {
        id: "templates",
        label: "Channel Templates",
        icon: LayoutList,
        path: `/workspace/${workspaceId}/tools/templates`,
      },
    ],
    [workspaceId]
  );

  const currentTab =
    NAV_ITEMS.find((item) =>
      location.pathname.startsWith(item.path)
    )?.id || "workflows";

  const handleNav = (path) => {
    navigate(path);
  };

  return (
    <SidebarContainer
      header={<WorkspaceSwitcher />}
      subHeader={
        <div className="tcs-section-title">
          Tools
        </div>
      }
      aria-label="Tools navigation"
    >
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      <div className="tcs-scroll">
        <div className="tcs-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.path)}
                className={`tcs-nav-item ${
                  isActive ? "is-active" : ""
                }`}
              >
                <span className="tcs-icon">
                  <Icon size={18} strokeWidth={2} />
                </span>

                <span className="tcs-label">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </SidebarContainer>
  );
}