// Centralized templates and content builders for Canvas
import { FileText, Users, Zap, Target, BookOpen, BarChart3, CheckSquare, Newspaper, Briefcase, Heart, AlertTriangle, UserPlus, Code, Rocket, Calendar } from "lucide-react";
import PROD_TEMPLATES from "../../data/production-templates.json";
import markdownToDoc from "../../utils/markdownToDoc";

const TEMPLATES = [
  {
    id: "sprint_planning",
    icon: Code,
    label: "Engineering Sprint Planning",
    subtitle: "Plan goals, stories & tracking",
    description: "Enterprise-grade sprint planning template for engineering teams.",
    category: "Engineering",
    iconBg: "rgba(124, 58, 237, 0.12)",
    iconColor: "var(--accent-purple)",
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
    iconColor: "var(--accent-blue)",
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
    iconColor: "var(--accent-yellow)",
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
    iconColor: "var(--accent-green)",
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
    iconColor: "var(--accent-purple)",
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

// Merge production-level templates (adds covers, subtitles, and richer metadata)
try {
  if (PROD_TEMPLATES && Array.isArray(PROD_TEMPLATES.templates)) {
    PROD_TEMPLATES.templates.forEach((pt) => {
      const idx = TEMPLATES.findIndex((t) => t.id === pt.id);
      const mapped = {
        // ensure label exists for older callers
        label: pt.label || pt.title || pt.id,
        description: pt.description || "",
        category: pt.category || "General",
        cover: pt.cover || pt.coverImage || null,
        subtitle: pt.subtitle || pt.tagline || "",
        tags: pt.tags || [],
        sections: pt.sections || [],
        variables: pt.variables || [],
        previewHtml: pt.previewHtml || "",
        actions: pt.actions || ["use","preview","edit"],
        createdBy: pt.createdBy || "system",
        createdAt: pt.createdAt || new Date().toISOString(),
        id: pt.id,
        icon: pt.icon || null,
        iconBg: pt.iconBg || pt.iconBg || "rgba(107, 114, 128, 0.06)",
        iconColor: pt.iconColor || "var(--text-secondary)",
      };

      if (idx !== -1) {
        TEMPLATES[idx] = { ...TEMPLATES[idx], ...mapped };
      } else {
        TEMPLATES.push(mapped);
      }
    });
  }
} catch (err) {
  // don't crash the app if JSON is malformed
  // eslint-disable-next-line no-console
  console.warn("Failed to merge production templates:", err);
}

const CATEGORIES = ["All", "Engineering", "Product", "Design", "HR", "Marketing", "Meetings", "Operations"];

function buildTemplateContent(templateIdOrTemplate) {
  const p = (text = "") => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
  const h = (level, text) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
  const li = (text = "") => ({ type: "listItem", content: [p(text)] });
  const bullet = (...items) => ({ type: "bulletList", content: items.map((t) => li(t)) });
  const ordered = (...items) => ({ type: "orderedList", content: items.map((t) => li(t)) });
  const bold = (text) => ({ type: "text", text, marks: [{ type: "bold" }] });
  
  // Custom helpers for rich content
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
        h(2, "📝 Priority Tasks"),
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
        h(2, "📍 Objective & Problem Statement"),
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
        h(2, "📅 Timeline & Milestones"),
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
        h(2, "📚 Day 1: The Basics"),
        { type: "taskList", content: [
          { type: "taskItem", attrs: { checked: false }, content: [p("Set up your laptop and email")] },
          { type: "taskItem", attrs: { checked: false }, content: [p("Log into Slack, Jira, and GitHub")] },
          { type: "taskItem", attrs: { checked: false }, content: [p("Read the Company Handbook")] },
        ]},
        p(""),
        h(2, "🤝 Week 1: Meet the Team"),
        table(),
        p(""),
        h(2, "🚀 30-Day Goals"),
        bullet("Complete compliance training", "Ship your first PR to production", "Shadow 3 customer calls"),
      ],
    },

    technical_specifications: {
      type: "doc",
      content: [
        h(1, "Technical Specification: [title]"),
        { type: "blockquote", content: [p("Author: @platform-team | Status: Planned | Priority: High")] },
        p(""),
        h(2, "Overview"),
        p("This document describes the system architecture, API surface, data model, scaling strategy, and security considerations for the feature."),
        p("It is written for engineers, infra, and security reviewers to evaluate design choices and validate operational constraints."),
        h(2, "Metadata"),
        {
          type: "table",
          content: [
            { type: "tableRow", content: [ { type: "tableHeader", content: [p("Key")] }, { type: "tableHeader", content: [p("Value")] } ] },
            { type: "tableRow", content: [ { type: "tableCell", content: [p("Owner")] }, { type: "tableCell", content: [p("@platform-team")] } ] },
            { type: "tableRow", content: [ { type: "tableCell", content: [p("Status")] }, { type: "tableCell", content: [p("Planned")] } ] },
            { type: "tableRow", content: [ { type: "tableCell", content: [p("Priority")] }, { type: "tableCell", content: [p("High")] } ] },
            { type: "tableRow", content: [ { type: "tableCell", content: [p("Reviewers")] }, { type: "tableCell", content: [p("@infra, @security")] } ] },
          ],
        },
        h(2, "Architecture"),
        p("High-level architecture: Frontend → API Gateway → Auth Service → Canvas Service → Redis (pub/sub) → Primary DB."),
        { type: "image", attrs: { src: "https://picsum.photos/seed/technical-arch/1200/360", alt: "Architecture diagram" } },
        h(2, "System Flow"),
        p("Frontend → API Gateway → Services → Redis / Database. Realtime updates use Redis Pub/Sub to fan out events to connected websocket workers."),
        h(2, "API Endpoints"),
        {
          type: "table",
          content: [
            { type: "tableRow", content: [ { type: "tableHeader", content: [p("Method")] }, { type: "tableHeader", content: [p("Endpoint")] }, { type: "tableHeader", content: [p("Description")] } ] },
            { type: "tableRow", content: [ { type: "tableCell", content: [ { type: "paragraph", content: [ { type: "text", text: "POST", marks: [{ type: "code" }] } ] } ] }, { type: "tableCell", content: [p("/api/canvas/create")] }, { type: "tableCell", content: [p("Create a new canvas and return its id.")] } ] },
            { type: "tableRow", content: [ { type: "tableCell", content: [ { type: "paragraph", content: [ { type: "text", text: "GET", marks: [{ type: "code" }] } ] } ] }, { type: "tableCell", content: [p("/api/templates")] }, { type: "tableCell", content: [p("List available production templates.")] } ] },
            { type: "tableRow", content: [ { type: "tableCell", content: [ { type: "paragraph", content: [ { type: "text", text: "PATCH", marks: [{ type: "code" }] } ] } ] }, { type: "tableCell", content: [p("/api/canvas/:id")] }, { type: "tableCell", content: [p("Apply an optimistic patch to canvas content.")] } ] },
          ],
        },
        h(2, "Database Schema"),
        { type: "codeBlock", attrs: { language: "sql" }, content: [ { type: "text", text: "CREATE TABLE canvases (\n  id UUID PRIMARY KEY,\n  workspace_id UUID NOT NULL,\n  channel_id UUID NULL,\n  created_by UUID NOT NULL,\n  permissions JSONB DEFAULT '{}'::jsonb,\n  content JSONB NOT NULL,\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);\n\nCREATE INDEX idx_canvases_workspace ON canvases(workspace_id);" } ] },
        h(2, "Components"),
        bullet("Editor Service (client + web integration)", "Collaboration Service (Yjs + WebSocket workers)", "API Gateway (auth, rate limiting)", "Storage (Primary DB + object store)", "Redis (pub/sub and caching)"),
        h(2, "Risks & Mitigations"),
        { type: "blockquote", content: [p("Redis scaling limits may impact realtime fan-out. Mitigation: shard channels, implement backpressure and fallback polling.")] },
        h(2, "Timeline & Milestones"),
        ordered("Design (2 weeks)", "Implementation (6 weeks)", "Beta & Monitoring (2 weeks)"),
        h(2, "Notes"),
        p("Security: require auth tokens for all write endpoints; use signed upload URLs for attachments. Observability: trace edits and monitor pub/sub latency."),
      ],
    },
    monthly_newsletter: {
      type: "doc",
      content: [
        { type: "image", attrs: { src: "https://picsum.photos/seed/newsletter-cover/1200/360", alt: "Newsletter cover" } },
        h(2, "Monthly Newsletter"),
        p("👋 Hello Women @ Acme Community — Welcome to the latest edition of our Women's Equality Group newsletter! We're thrilled to share some exciting updates and news from our organization."),
        h(3, "Monthly Spotlight"),
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [p("Profile")] },
                { type: "tableHeader", content: [p("Profile")] },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    { type: "image", attrs: { src: "https://picsum.photos/seed/profile-1/400/200", alt: "Profile image 1" } },
                    p("Role: VP of Marketing"),
                    p("Team: New Product Marketing"),
                    p("Favorite Food: Pasta"),
                    p("Fun Fact: I ran with the bulls in Pamplona."),
                    { type: "blockquote", content: [p("“I was briefly a teacher, then a researcher and then a barista, before I realized my passion in marketing.”")] },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    { type: "image", attrs: { src: "https://picsum.photos/seed/profile-2/400/200", alt: "Profile image 2" } },
                    p("Role: Director of Design"),
                    p("Team: Research and Design"),
                    p("Favorite Food: Ice Cream"),
                    p("Fun Fact: I played cello for 18 years."),
                    { type: "blockquote", content: [p("“My first job was at the front desk of a music conservatory. I redesigned the practice-room booking process.”")] },
                  ],
                },
              ],
            },
          ],
        },
        h(3, "Recap: Last Month's Events"),
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    { type: "image", attrs: { src: "https://picsum.photos/seed/event-1/600/200", alt: "Recap image 1" } },
                    p("Grow your personal brand — Shelia spoke at Acme Inc last week and did a small group session about finding your personal brand and how to grow it."),
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    { type: "image", attrs: { src: "https://picsum.photos/seed/event-2/600/200", alt: "Recap image 2" } },
                    p("Asking for a raise — CEO Jane Lily spoke to us about how to ask for a raise in the workspace. Watch the video for a quick recap."),
                  ],
                },
              ],
            },
          ],
        },
        h(3, "Upcoming Events"),
        bullet(
          "May 1: Hear from the VP of Sales on how to create culture",
          "May 18: Women at Acme Happy Hour at Amelie Wine Bar",
          "May 15: Monthly lightning networking event — sign up to attend"
        ),
        p("Not part of our calendar group? Add yourself to receive invites and updates."),
      ],
    },
  };

  // Support being passed either a template id (string) or a template
  // object (from PROD_TEMPLATES) that contains `sections`.
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

        // Use markdownToDoc to produce a richer doc structure from markdown
        const part = markdownToDoc(md);
        if (part && part.content && part.content.length) {
          content.push(...part.content);
        } else {
          content.push(p(""));
        }
      });

      return { type: "doc", content };
    }
    if (tpl.previewHtml) {
      return { type: "doc", content: [p(tpl.previewHtml)] };
    }
    // fall through to id-based lookup below if no sections present
  }

  const templateId = typeof templateIdOrTemplate === "string" ? templateIdOrTemplate : (templateIdOrTemplate && templateIdOrTemplate.id);
  return templates[templateId] || { type: "doc", content: [p()] };
}

export { TEMPLATES, CATEGORIES, buildTemplateContent };
