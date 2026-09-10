// TaskChat — Public HTML Privacy Policy Generator

import { PRIVACY_LAST_UPDATED, PRIVACY_INTRO, PRIVACY_SECTIONS } from '../../client/src/data/privacyContent.js';

export function getPrivacyPolicyHTML() {
  const introHTML = PRIVACY_INTRO.map(p => `<p>${p}</p>`).join('');

  const sectionsHTML = PRIVACY_SECTIONS.map(section => {
    const blocksHTML = section.blocks.map(block => {
      if (block.type === 'p') {
        const textWithLinks = block.text.replace(
          'Email: info@starkedge.com',
          'Email: <a href="mailto:info@starkedge.com" class="link">info@starkedge.com</a>'
        );
        return `<p>${textWithLinks}</p>`;
      }
      if (block.type === 'ul') {
        const items = block.items.map(item => `<li>${item}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      return '';
    }).join('');

    return `
      <section class="section">
        <h2>${section.heading}</h2>
        ${blocksHTML}
      </section>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>TaskChat — Privacy Policy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-gradient: linear-gradient(180deg, #09090b 0%, #121217 100%);
      --topbar-bg: rgba(18, 18, 23, 0.95);
      --card-bg: #181820;
      --card-border: #272732;
      --card-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
      
      --text-primary: #f4f4f5;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      
      --accent-gradient: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      --accent-glow: rgba(99, 102, 241, 0.35);
      --accent-link: #818cf8;
      --border-header: #272732;
    }

    @media (prefers-color-scheme: light) {
      :root {
        --bg-gradient: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
        --topbar-bg: rgba(255, 255, 255, 0.95);
        --card-bg: #ffffff;
        --card-border: #e2e8f0;
        --card-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
        
        --text-primary: #0f172a;
        --text-secondary: #334155;
        --text-muted: #64748b;
        
        --accent-gradient: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
        --accent-glow: rgba(99, 102, 241, 0.25);
        --accent-link: #4f46e5;
        --border-header: #e2e8f0;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 100%;
      min-height: 100%;
      background: var(--bg-gradient);
      background-attachment: fixed;
      color: var(--text-primary);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch;
    }

    /* Sticky Header Bar */
    .top-header {
      width: 100%;
      background: var(--topbar-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-header);
      padding: 14px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-sizing: border-box;
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: var(--text-primary);
      flex-shrink: 0;
    }

    /* Message Bubble Logo Icon matching TaskChat App branding */
    .logo-svg {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--accent-gradient);
      box-shadow: 0 4px 12px var(--accent-glow);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      flex-shrink: 0;
    }

    .logo-title {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      white-space: nowrap;
    }

    .app-link {
      color: #ffffff;
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 600;
      padding: 8px 18px;
      border-radius: 8px;
      background: var(--accent-gradient);
      box-shadow: 0 4px 12px var(--accent-glow);
      white-space: nowrap;
      flex-shrink: 0;
      transition: all 0.2s ease;
    }

    .app-link:hover {
      opacity: 0.92;
      transform: translateY(-1px);
    }

    .page-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 16px 60px 16px;
      width: 100%;
      box-sizing: border-box;
    }

    main {
      max-width: 840px;
      width: 100%;
      box-sizing: border-box;
    }

    .card {
      background: var(--card-bg);
      border-radius: 16px;
      padding: 40px 36px;
      border: 1px solid var(--card-border);
      box-shadow: var(--card-shadow);
      box-sizing: border-box;
      width: 100%;
    }

    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      background: rgba(99, 102, 241, 0.12);
      border: 1px solid rgba(99, 102, 241, 0.25);
      color: var(--accent-link);
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 14px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    h1 {
      font-size: 30px;
      font-weight: 800;
      margin-bottom: 6px;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      line-height: 1.3;
      word-wrap: break-word;
    }

    .last-updated {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 28px;
      font-weight: 500;
    }

    .intro {
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 24px;
      margin-bottom: 28px;
    }

    .intro p {
      font-size: 15px;
      color: var(--text-secondary);
      line-height: 1.7;
      margin-bottom: 12px;
    }

    .intro p:last-child {
      margin-bottom: 0;
    }

    .section {
      margin-bottom: 28px;
    }

    h2 {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 12px;
      line-height: 1.4;
      word-wrap: break-word;
    }

    p {
      font-size: 14.5px;
      color: var(--text-secondary);
      line-height: 1.7;
      margin-bottom: 10px;
      word-wrap: break-word;
    }

    ul {
      padding-left: 22px;
      margin: 8px 0 14px 0;
      color: var(--text-secondary);
      font-size: 14.5px;
      line-height: 1.7;
    }

    li {
      margin-bottom: 6px;
      word-wrap: break-word;
    }

    li::marker {
      color: var(--accent-link);
    }

    .link {
      color: var(--accent-link);
      text-decoration: none;
      font-weight: 600;
      word-break: break-all;
    }

    .link:hover {
      text-decoration: underline;
    }

    footer {
      margin-top: 40px;
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
      padding-bottom: 20px;
    }

    /* Mobile Device Responsiveness */
    @media (max-width: 640px) {
      .top-header {
        padding: 12px 16px;
      }
      .logo-svg {
        width: 28px;
        height: 28px;
      }
      .logo-svg svg {
        width: 16px;
        height: 16px;
      }
      .logo-title {
        font-size: 16px;
      }
      .app-link {
        font-size: 12px;
        padding: 6px 12px;
      }
      .page-wrapper {
        padding: 16px 12px 40px 12px;
      }
      .card {
        padding: 24px 18px;
        border-radius: 12px;
      }
      h1 {
        font-size: 22px;
      }
      h2 {
        font-size: 16.5px;
      }
      p, ul, li {
        font-size: 14px;
        line-height: 1.65;
      }
    }
  </style>
</head>
<body>
  <!-- Sticky Header Bar -->
  <header class="top-header">
    <a href="/" class="logo-container">
      <div class="logo-svg">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
        </svg>
      </div>
      <span class="logo-title">TaskChat</span>
    </a>
    <a href="/login" class="app-link">Open App</a>
  </header>

  <!-- Page Content Container -->
  <div class="page-wrapper">
    <main>
      <div class="card">
        <span class="badge">Legal & Security</span>
        <h1>TaskChat Privacy Policy</h1>

        <div class="intro">
          ${introHTML}
        </div>

        ${sectionsHTML}
      </div>
    </main>

    <footer>
      <p>&copy; ${new Date().getFullYear()} TaskChat. All rights reserved.</p>
    </footer>
  </div>
</body>
</html>`;
}
