// TaskChat — Public HTML Privacy Policy Generator

import { PRIVACY_INTRO, PRIVACY_SECTIONS } from '../../client/src/data/privacyContent.js';

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
      --bg-gradient: linear-gradient(180deg, #0b0d14 0%, #06070a 100%);
      --topbar-bg: rgba(11, 13, 20, 0.95);
      --card-bg: #121520;
      --card-border: #1e2333;
      --card-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      
      --text-heading: #ffffff;
      --text-body: #cbd5e1;
      --text-muted: #64748b;
      
      --accent-link: #818cf8;
      --border-header: #1e2333;
    }

    @media (prefers-color-scheme: light) {
      :root {
        --bg-gradient: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
        --topbar-bg: rgba(255, 255, 255, 0.95);
        --card-bg: #ffffff;
        --card-border: #cbd5e1;
        --card-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
        
        --text-heading: #000000;
        --text-body: #0f172a;
        --text-muted: #334155;
        
        --accent-link: #4f46e5;
        --border-header: #cbd5e1;
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
      color: var(--text-body);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch;
    }

    /* Sticky Top Header Bar matching user mockup */
    .top-header {
      width: 100%;
      background: var(--topbar-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-header);
      padding: 16px 40px;
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
      gap: 12px;
      text-decoration: none;
      color: var(--text-heading);
      flex-shrink: 0;
    }

    /* TaskChat Brand Logo Icon (Stacked Orange Horizontal Bars) */
    .brand-logo-icon {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      gap: 4px;
      width: 28px;
      height: 24px;
      flex-shrink: 0;
    }
    .brand-logo-icon span {
      display: block;
      height: 3.5px;
      border-radius: 2px;
      background: linear-gradient(90deg, #ff5e00 0%, #ff8c00 100%);
    }
    .brand-logo-icon span:nth-child(1) { width: 24px; }
    .brand-logo-icon span:nth-child(2) { width: 16px; margin-left: 4px; }
    .brand-logo-icon span:nth-child(3) { width: 20px; }

    .logo-title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text-heading);
      white-space: nowrap;
    }

    /* Ghost Button Header Action matching mockup */
    .app-link {
      color: var(--text-heading);
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 8px;
      background: var(--bg-tertiary, #1e293b);
      border: 1px solid var(--border-header, #334155);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
      flex-shrink: 0;
      transition: all 0.2s ease;
    }
    @media (prefers-color-scheme: light) {
      .app-link {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        color: #0f172a;
      }
    }
    .app-link:hover {
      background: var(--card-border, #334155);
      border-color: var(--accent-link, #818cf8);
    }

    .page-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 44px 16px 60px 16px;
      width: 100%;
      box-sizing: border-box;
    }

    main {
      max-width: 800px;
      width: 100%;
      box-sizing: border-box;
    }

    .card {
      background: var(--card-bg);
      border-radius: 16px;
      padding: 44px 40px;
      border: 1px solid var(--card-border);
      box-shadow: var(--card-shadow);
      box-sizing: border-box;
      width: 100%;
    }

    h1 {
      font-size: 30px;
      font-weight: 800;
      margin-bottom: 24px;
      letter-spacing: -0.02em;
      color: var(--text-heading);
      line-height: 1.3;
      word-wrap: break-word;
    }

    .intro {
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 24px;
      margin-bottom: 32px;
    }

    .intro p {
      font-size: 15.5px;
      font-weight: 500;
      color: var(--text-body);
      line-height: 1.75;
      margin-bottom: 14px;
    }

    .intro p:last-child {
      margin-bottom: 0;
    }

    .section {
      margin-bottom: 32px;
    }

    h2 {
      font-size: 19px;
      font-weight: 800;
      color: var(--text-heading);
      margin-bottom: 12px;
      line-height: 1.4;
      word-wrap: break-word;
    }

    p {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-body);
      line-height: 1.7;
      margin-bottom: 12px;
      word-wrap: break-word;
    }

    ul {
      padding-left: 22px;
      margin: 10px 0 16px 0;
      color: var(--text-body);
      font-size: 15px;
      font-weight: 500;
      line-height: 1.7;
    }

    li {
      margin-bottom: 8px;
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
      font-size: 13.5px;
      font-weight: 500;
      padding-bottom: 20px;
    }

    /* Mobile Device Responsiveness */
    @media (max-width: 640px) {
      .top-header {
        padding: 12px 16px;
      }
      .logo-title {
        font-size: 18px;
      }
      .app-link {
        font-size: 12.5px;
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
        font-size: 17px;
      }
      p, ul, li {
        font-size: 14.5px;
        line-height: 1.65;
      }
    }
  </style>
</head>
<body>
  <!-- Header Bar matching target design mockup -->
  <header class="top-header">
    <a href="/" class="logo-container">
      <div class="brand-logo-icon">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span class="logo-title">TaskChat</span>
    </a>
    <a href="/login" class="app-link">
      <span>Open App</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
    </a>
  </header>

  <!-- Page Content Container -->
  <div class="page-wrapper">
    <main>
      <div class="card">
        <h1>TaskChat — Privacy Policy</h1>

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
