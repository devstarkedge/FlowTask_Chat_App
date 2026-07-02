import {
  FileText,
  Users,
  Zap,
  Target,
  BookOpen,
  BarChart3,
  CheckSquare,
  Newspaper,
  Briefcase,
  Heart,
  AlertTriangle,
  UserPlus,
  Code,
  Rocket,
  Calendar,
} from "lucide-react-native";
import { markdownToDoc } from "./markdownToDoc";

const TEMPLATES = [
  {
    id: "sprint_planning",
    icon: Code,
    label: "Engineering Sprint Planning",
    subtitle: "Plan goals, stories & tracking",
    description: "Enterprise-grade sprint planning template for engineering teams.",
    category: "Engineering",
    iconBg: "rgba(124, 58, 237, 0.12)",
    iconColor: "#7c3aed",
    cover: {
      variations: [
        { id: "sprint-photo", type: "image", url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=1200&h=260" },
        { id: "sprint-gradient", type: "gradient", colorPalette: ["#1e1b4b", "#312e81"] },
      ],
    },
    tags: ["sprint", "engineering", "planning"],
    variables: [
      { name: "sprint_name", example: "Sprint 42" },
      { name: "scrum_master", example: "Alex" },
    ]
  },
  {
    id: "product_prd",
    icon: Rocket,
    label: "Product PRD",
    subtitle: "Objective, scope, and specs",
    description: "Detailed Product Requirements Document for feature launches.",
    category: "Product",
    iconBg: "rgba(59, 130, 246, 0.12)",
    iconColor: "#3b82f6",
    cover: {
      variations: [
        { id: "prd-photo", type: "image", url: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&q=80&w=1200&h=260" },
        { id: "prd-gradient", type: "gradient", colorPalette: ["#eff6ff", "#bfdbfe"] },
      ],
    },
    tags: ["product", "prd", "planning"],
    variables: [
      { name: "feature_name", example: "Dark Mode" },
      { name: "pm", example: "Sarah" },
    ]
  },
  {
    id: "meeting_notes",
    icon: Users,
    label: "Meeting Notes",
    subtitle: "Agenda, decisions & actions",
    description: "Structured meeting notes to keep discussions focused and actionable.",
    category: "Meetings",
    iconBg: "rgba(245, 158, 11, 0.12)",
    iconColor: "#f59e0b",
    cover: {
      variations: [
        { id: "meeting-photo", type: "image", url: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&q=80&w=1200&h=260" },
        { id: "meeting-gradient", type: "gradient", colorPalette: ["#fef3c7", "#fde68a"] },
      ],
    },
    tags: ["meeting", "notes", "agenda"],
    variables: [
      { name: "date", example: "Oct 24" },
    ]
  },
  {
    id: "employee_onboarding",
    icon: UserPlus,
    label: "Employee Onboarding",
    subtitle: "Welcome to the team",
    description: "Comprehensive 30-60-90 day onboarding plan for new hires.",
    category: "HR",
    iconBg: "rgba(16, 185, 129, 0.12)",
    iconColor: "#10b981",
    cover: {
      variations: [
        { id: "hr-photo", type: "image", url: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200&h=260" },
        { id: "hr-gradient", type: "gradient", colorPalette: ["#d1fae5", "#a7f3d0"] },
      ],
    },
    tags: ["hr", "onboarding", "newhire"],
    variables: [
      { name: "employee_name", example: "Jordan" },
    ]
  },
  {
    id: "monthly_newsletter",
    icon: Newspaper,
    label: "Monthly Newsletter",
    subtitle: "Community updates & highlights",
    description: "Newsletter template for community updates, events, and highlights.",
    category: "Marketing",
    iconBg: "rgba(99, 102, 241, 0.08)",
    iconColor: "#6366f1",
    cover: {
      variations: [
        { id: "newsletter-photo", type: "image", url: "https://picsum.photos/seed/newsletter-cover/1200/360" },
        { id: "newsletter-gradient", type: "gradient", colorPalette: ["#f3e8ff", "#e9d5ff"] },
      ],
    },
    tags: ["newsletter", "marketing", "community"],
    variables: []
  },
];

// Production templates from production-templates.json
const PROD_TEMPLATES = {
  "templates": [
    {
      "id": "out_of_office",
      "label": "Out of Office Coverage Plan",
      "subtitle": "Quick handover & emergency contacts",
      "description": "Structured checklist for coverage, backups, handover notes, and escalation.",
      "category": "HR",
      "icon": Calendar,
      "tags": ["ooo", "handover", "support"],
      "cover": {
        "variations": [
          {
            "id": "v1",
            "type": "image",
            "url": "https://picsum.photos/seed/ooo-illustration/1200/400",
            "colorPalette": ["#0EA5A4", "#60A5FA"]
          },
          {
            "id": "v2",
            "type": "gradient",
            "colorPalette": ["#60A5FA", "#A78BFA"]
          }
        ]
      },
      "sections": [
        {
          "id": "ooo-details",
          "title": "OOO Details",
          "icon": "📌",
          "type": "rich_text",
          "contentMarkdown": "**Dates offline:** [start_date] — [end_date]\n\n**Availability:** Completely offline"
        },
        {
          "id": "project-coverage",
          "title": "Project Coverage",
          "icon": "🔁",
          "type": "list",
          "contentMarkdown": "- Primary backup: [primary_backup]\n- Handover notes"
        },
        {
          "id": "emergency-contacts",
          "title": "Emergency Contacts",
          "icon": "📞",
          "type": "list",
          "contentMarkdown": "- Escalation contact\n- Support channel link"
        }
      ],
      "variables": [
        {
          "name": "start_date",
          "description": "First OOO date",
          "example": "2026-06-01"
        },
        {
          "name": "primary_backup",
          "description": "Primary backup person",
          "example": "Alex"
        }
      ]
    },
    {
      "id": "product_brief",
      "label": "Product Brief",
      "subtitle": "One-page scope, goals & audience",
      "description": "High-level overview, target audience and requirements",
      "category": "Product",
      "icon": Rocket,
      "tags": ["product", "brief"],
      "cover": {
        "variations": [
          {
            "id": "v1",
            "type": "gradient",
            "colorPalette": ["#6366F1", "#60A5FA"]
          },
          {
            "id": "v2",
            "type": "image",
            "url": "https://picsum.photos/seed/product/1200/400"
          }
        ]
      },
      "sections": [
        {
          "id": "overview",
          "title": "Overview",
          "icon": "📌",
          "type": "rich_text",
          "contentMarkdown": "One-paragraph summary"
        },
        {
          "id": "goals",
          "title": "Goals",
          "icon": "🎯",
          "type": "list",
          "contentMarkdown": "- Goal 1\n- Goal 2"
        }
      ],
      "variables": []
    },
    {
      "id": "technical_specifications",
      "label": "Technical Specifications",
      "subtitle": "API, data model, architecture and constraints",
      "description": "Enterprise-ready technical spec template: architecture, APIs, schema, risks and timeline.",
      "category": "Engineering",
      "icon": Code,
      "tags": ["technical", "specs", "api", "architecture", "database"],
      "cover": {
        "variations": [
          {
            "id": "v1",
            "type": "gradient",
            "colorPalette": ["#0EA5A4", "#06B6D4"]
          },
          {
            "id": "v2",
            "type": "image",
            "url": "https://images.unsplash.com/photo-1526378721623-4d2b4f6f4d4e?auto=format&fit=crop&q=80&w=1200&h=400"
          }
        ]
      },
      "sections": [
        {
          "id": "overview",
          "title": "Overview",
          "icon": "🧾",
          "type": "rich_text",
          "contentMarkdown": "Purpose: Provide a concise overview of the system, scope, and design decisions.\n\nScope: Covers API surface, data model, architecture, scaling considerations and security notes."
        },
        {
          "id": "metadata",
          "title": "Metadata",
          "icon": "📋",
          "type": "rich_text",
          "contentMarkdown": "**Owner:** @platform-team\n**Status:** Planned\n**Priority:** High\n**Reviewers:** @infra, @security\n**Created:** 2026-05-01"
        },
        {
          "id": "architecture",
          "title": "Architecture",
          "icon": "🏗️",
          "type": "rich_text",
          "contentMarkdown": "High-level architecture: Frontend → API Gateway → Services → Redis / Primary DB. Include a diagram and callouts for critical components."
        },
        {
          "id": "architecture-diagram",
          "title": "Architecture Diagram",
          "icon": "🖼️",
          "type": "rich_text",
          "contentMarkdown": "![Architecture diagram](https://picsum.photos/seed/technical-arch/1200/360)"
        },
        {
          "id": "api",
          "title": "API Endpoints",
          "icon": "🔗",
          "type": "list",
          "contentMarkdown": "- `POST /api/canvas/create` — Create a new canvas (returns canvas id)\n- `GET /api/templates` — List production templates\n- `PATCH /api/canvas/:id` — Patch canvas content (optimistic patch)\n- `GET /api/canvas/:id` — Fetch canvas with metadata"
        },
        {
          "id": "database_schema",
          "title": "Database Schema",
          "icon": "🧱",
          "type": "code",
          "contentMarkdown": "```sql\nCREATE TABLE canvases (\n  id UUID PRIMARY KEY,\n  workspace_id UUID NOT NULL,\n  channel_id UUID NULL,\n  created_by UUID NOT NULL,\n  permissions JSONB DEFAULT '{}'::jsonb,\n  content JSONB NOT NULL,\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);\n\nCREATE INDEX idx_canvases_workspace ON canvases(workspace_id);\n```"
        },
        {
          "id": "components",
          "title": "Components",
          "icon": "🧩",
          "type": "list",
          "contentMarkdown": "- Editor Service (Web, client integration)\n- Collaboration Service (Yjs + WebSocket)\n- API Gateway (auth, rate limiting)\n- Storage (Primary DB, S3 for attachments)\n- Redis (pub/sub and caching)"
        },
        {
          "id": "risks",
          "title": "Risks & Mitigations",
          "icon": "⚠️",
          "type": "rich_text",
          "contentMarkdown": "**Risk:** Redis scaling limits may cause delayed fan-out.\n**Mitigation:** Shard channels, add backpressure and fallbacks to polling.\n\n**Risk:** Large canvas payloads cause slow writes.\n**Mitigation:** Store deltas and snapshots, avoid full payload writes on every edit."
        },
        {
          "id": "timeline",
          "title": "Timeline & Milestones",
          "icon": "🗓️",
          "type": "list",
          "contentMarkdown": "- Milestone 1 — Design (2 weeks)\n- Milestone 2 — Implementation (6 weeks)\n- Milestone 3 — Beta & Monitoring (2 weeks)"
        }
      ],
      "variables": []
    },
    {
      "id": "sales_enablement_hub",
      "label": "Sales Enablement Hub",
      "subtitle": "Collateral, playbooks, and contact points",
      "description": "Central hub for sales materials and quick links",
      "category": "Sales",
      "icon": Briefcase,
      "tags": ["sales", "enablement"],
      "cover": {
        "variations": [
          {
            "id": "v1",
            "type": "photo",
            "url": "https://picsum.photos/seed/sales/1200/400"
          },
          {
            "id": "v2",
            "type": "gradient",
            "colorPalette": ["#F97316", "#FB7185"]
          }
        ]
      },
      "sections": [
        {
          "id": "collateral",
          "title": "Collateral",
          "icon": "📁",
          "type": "list",
          "contentMarkdown": "- One-pager\n- Case study\n- Pricing sheet"
        },
        {
          "id": "contacts",
          "title": "Contacts",
          "icon": "📇",
          "type": "list",
          "contentMarkdown": "- Sales lead: [name]"
        }
      ],
      "variables": []
    },
    {
      "id": "weekly_sync",
      "label": "Weekly Sync",
      "subtitle": "Standup notes and blockers",
      "description": "A simple weekly sync template to capture updates",
      "category": "Meetings",
      "icon": Users,
      "tags": ["weekly", "sync"],
      "cover": {
        "variations": [
          {
            "id": "v1",
            "type": "gradient",
            "colorPalette": ["#60A5FA", "#A78BFA"]
          }
        ]
      },
      "sections": [
        {
          "id": "updates",
          "title": "Updates",
          "icon": "🔄",
          "type": "list",
          "contentMarkdown": "- What I did\n- What I'm doing\n- Blockers"
        }
      ],
      "variables": []
    },
    {
      "id": "agenda",
      "label": "Agenda",
      "subtitle": "Meeting agenda & objectives",
      "description": "Structured agenda for efficient meetings",
      "category": "Meetings",
      "icon": Calendar,
      "tags": ["agenda", "meetings"],
      "cover": {
        "variations": [
          {
            "id": "v1",
            "type": "gradient",
            "colorPalette": ["#FDE68A", "#FDBA74"]
          }
        ]
      },
      "sections": [
        {
          "id": "agenda-items",
          "title": "Agenda Items",
          "icon": "🗂️",
          "type": "list",
          "contentMarkdown": "- Topic 1\n- Topic 2\n- Timebox"
        }
      ],
      "variables": []
    },
    {
      "id": "todo_list",
      "label": "To-do list",
      "subtitle": "Personal or team checklist",
      "description": "Simple actionable checklist for tasks",
      "category": "General",
      "icon": CheckSquare,
      "tags": ["todo", "checklist"],
      "cover": {
        "variations": [
          {
            "id": "v1",
            "type": "gradient",
            "colorPalette": ["#34D399", "#86EFAC"]
          }
        ]
      },
      "sections": [
        {
          "id": "tasks",
          "title": "Tasks",
          "icon": "✅",
          "type": "taskList",
          "contentMarkdown": "- [ ] Task 1\n- [ ] Task 2"
        }
      ],
      "variables": []
    },
    {
      "id": "weekly_1_1",
      "label": "Weekly 1:1",
      "subtitle": "Structure for regular check-ins",
      "description": "Discussion guide for manager/engineer 1:1s",
      "category": "People",
      "icon": UserPlus,
      "tags": ["1:1", "people"],
      "cover": {
        "variations": [
          {
            "id": "v1",
            "type": "photo",
            "url": "https://picsum.photos/seed/oneonone/1200/400"
          }
        ]
      },
      "sections": [
        {
          "id": "checkin",
          "title": "Check-in",
          "icon": "🗣️",
          "type": "rich_text",
          "contentMarkdown": "Quick personal check-in and wins."
        }
      ],
      "variables": []
    },
    {
      "id": "company_handbook",
      "label": "Company Handbook",
      "subtitle": "Policies, mission, and ways of working",
      "description": "Comprehensive handbook for employees",
      "category": "HR",
      "icon": BookOpen,
      "tags": ["handbook", "policies"],
      "cover": {
        "variations": [
          {
            "id": "v1",
            "type": "gradient",
            "colorPalette": ["#0EA5A4", "#34D399"]
          }
        ]
      },
      "sections": [
        {
          "id": "intro",
          "title": "Introduction",
          "icon": "🏢",
          "type": "rich_text",
          "contentMarkdown": "Company mission and values."
        },
        {
          "id": "policies",
          "title": "Policies",
          "icon": "📜",
          "type": "list",
          "contentMarkdown": "- Code of conduct\n- Leave policy\n- Security"
        }
      ],
      "variables": []
    }
  ]
};

// Merge production templates into TEMPLATES array
try {
  PROD_TEMPLATES.templates.forEach((pt) => {
    const idx = TEMPLATES.findIndex((t) => t.id === pt.id);
    const mapped = {
      label: pt.label || pt.id,
      description: pt.description || "",
      category: pt.category || "General",
      cover: pt.cover || null,
      subtitle: pt.subtitle || "",
      tags: pt.tags || [],
      sections: pt.sections || [],
      variables: pt.variables || [],
      id: pt.id,
      icon: pt.icon || FileText,
      iconBg: pt.iconBg || "rgba(107, 114, 128, 0.06)",
      iconColor: pt.iconColor || "#6b7280",
    };

    if (idx !== -1) {
      TEMPLATES[idx] = { ...TEMPLATES[idx], ...mapped };
    } else {
      TEMPLATES.push(mapped);
    }
  });
} catch (err) {
  console.warn("Failed to merge production templates:", err);
}

const CATEGORIES = ["All", "Engineering", "Product", "Design", "HR", "Marketing", "Meetings", "Operations", "Sales", "People", "General"];

function buildTemplateContent(templateIdOrTemplate) {
  const p = (text = "") => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
  const h = (level, text) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
  const li = (text = "") => ({ type: "listItem", content: [p(text)] });
  const bullet = (...items) => ({ type: "bulletList", content: items.map((t) => li(t)) });
  const bold = (text) => ({ type: "text", text, marks: [{ type: "bold" }] });
  
  const table = () => ({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableHeader", content: [p("Assignee")] },
          { type: "tableHeader", content: [p("Status")] },
          { type: "tableHeader", content: [p("Due Date")] }
        ]
      },
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [p("@alex")] },
          { type: "tableCell", content: [p("In Progress")] },
          { type: "tableCell", content: [p("Oct 25")] }
        ]
      }
    ]
  });

  const templates = {
    blank: { type: "doc", content: [p()] },
    
    sprint_planning: {
      type: "doc",
      content: [
        h(1, "Sprint Planning: [sprint_name]"),
        { type: "blockquote", content: [p("Scrum Master: [scrum_master] | Dates: Oct 20 - Nov 3")] },
        p(""),
        h(2, "🎯 Sprint Goals"),
        bullet("Ship the new Canvas Editor", "Resolve 5 high-priority P1 bugs", "Complete the DB migration"),
        p(""),
        h(2, "Priority Tasks"),
        table(),
        p(""),
        h(2, "🚧 Bug Tracking & Blockers"),
        { type: "taskList", content: [
          { type: "taskItem", attrs: { checked: true }, content: [p("Fix WebSocket reconnection loop")] },
          { type: "taskItem", attrs: { checked: false }, content: [p("Investigate Redis latency spikes")] },
        ]},
        p(""),
        h(2, "🚀 Deployment Notes"),
        { type: "codeBlock", attrs: { language: "bash" }, content: [{ type: "text", text: "npm run build && npm run deploy:prod" }] },
      ],
    },

    product_prd: {
      type: "doc",
      content: [
        h(1, "PRD: [feature_name]"),
        { type: "blockquote", content: [p("Product Manager: [pm] | Status: Drafting | Target Release: Q4")] },
        p(""),
        h(2, "Objective & Problem Statement"),
        p("Users currently struggle to format documents quickly. The editor feels dated. We need a modern, block-based editor."),
        p(""),
        h(2, "🎯 Success Metrics"),
        bullet("Increase Daily Active Editors by 20%", "Reduce time-to-publish by 15%"),
        p(""),
        h(2, "🛠 Scope & User Stories"),
        { type: "taskList", content: [
          { type: "taskItem", attrs: { checked: false }, content: [p("As a user, I can type '/' to open a command menu.")] },
          { type: "taskItem", attrs: { checked: false }, content: [p("As a user, I can drag and drop blocks.")] },
        ]},
        p(""),
        h(2, "Timeline & Milestones"),
        table(),
      ],
    },

    meeting_notes: {
      type: "doc",
      content: [
        h(1, "Weekly Sync - [date]"),
        { type: "blockquote", content: [p("Attendees: @all")] },
        p(""),
        h(2, "📋 Agenda"),
        bullet("Review metrics from last week", "Discuss Q4 roadmap updates", "Blockers & round-robin"),
        p(""),
        h(2, "💡 Decisions & Notes"),
        p("We decided to postpone the DB migration to next week due to high traffic."),
        p(""),
        h(2, "✅ Action Items"),
        { type: "taskList", content: [
          { type: "taskItem", attrs: { checked: false }, content: [p("@jordan to schedule follow-up with DevOps")] },
          { type: "taskItem", attrs: { checked: false }, content: [p("@sarah to update the PRD with new scope")] },
        ]},
      ],
    },

    employee_onboarding: {
      type: "doc",
      content: [
        h(1, "Welcome to the Team, [employee_name]! 👋"),
        { type: "blockquote", content: [p("We are so excited to have you join us. This document will guide you through your first few weeks.")] },
        p(""),
        h(2, "Day 1: The Basics"),
        { type: "taskList", content: [
          { type: "taskItem", attrs: { checked: false }, content: [p("Set up your laptop and email")] },
          { type: "taskItem", attrs: { checked: false }, content: [p("Log into Slack, Jira, and GitHub")] },
          { type: "taskItem", attrs: { checked: false }, content: [p("Read the Company Handbook")] },
        ]},
        p(""),
        h(2, "Week 1: Meet the Team"),
        table(),
        p(""),
        h(2, "🚀 30-Day Goals"),
        bullet("Complete compliance training", "Ship your first PR to production", "Shadow 3 customer calls"),
      ],
    },

    monthly_newsletter: {
      type: "doc",
      content: [
        h(1, "Monthly Newsletter"),
        p("👋 Hello Community — Welcome to the latest edition of our newsletter! We're thrilled to share some exciting updates."),
        h(3, "Monthly Spotlight"),
        bullet(
          "Team achievements",
          "Customer wins",
          "Product highlights"
        ),
        h(3, "Upcoming Events"),
        bullet(
          "Hear from the VP of Sales on how to create culture",
          "Happy Hour at Amelie Wine Bar",
          "Monthly lightning networking event"
        ),
      ],
    },
  };

  if (templateIdOrTemplate && typeof templateIdOrTemplate === "object") {
    const tpl = templateIdOrTemplate;
    if (tpl.sections && tpl.sections.length > 0) {
      const content = [];
      tpl.sections.forEach((s) => {
        if (s.title) content.push(h(2, s.title));
        const md = s.contentMarkdown || s.content || "";
        if (!md || !md.trim()) {
          content.push(p(""));
          return;
        }

        const part = markdownToDoc(md);
        if (part && part.content && part.content.length) {
          content.push(...part.content);
        } else {
          content.push(p(""));
        }
      });

      return { type: "doc", content };
    }
  }

  const templateId = typeof templateIdOrTemplate === "string" ? templateIdOrTemplate : (templateIdOrTemplate && templateIdOrTemplate.id);
  return templates[templateId] || { type: "doc", content: [p()] };
}

export { TEMPLATES, CATEGORIES, buildTemplateContent };
