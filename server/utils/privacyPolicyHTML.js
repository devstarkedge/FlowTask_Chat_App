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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TaskChat — Privacy Policy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Shared Design System Tokens */
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --accent-primary: #4e7cff;
      --accent-primary-hover: #8fa8ff;
      
      /* Dark Theme Tokens (Default) */
      --bg-primary: #0a0845;
      --bg-secondary: #151259;
      --bg-tertiary: #1a1570;
      --bg-card: #1a1570;
      
      --text-primary: #e6edf3;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --text-white: #ffffff;
      --text-link: var(--accent-primary-hover);
      
      --border-primary: #2a2578;
      --border-secondary: #1e196b;
      --border-header: #1e196b;
      --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.5);
      --shadow-modal: 0 16px 48px rgba(0, 0, 0, 0.6);
      
      --radius-md: 8px;
      --radius-lg: 12px;
      --radius-xl: 16px;
      --radius-full: 9999px;
    }

    @media (prefers-color-scheme: light) {
      :root {
        --bg-primary: #ffffff;
        --bg-secondary: #f6f8fa;
        --bg-tertiary: #f0f2f5;
        --bg-card: #f6f8fa;
        
        --text-primary: #0f172a;
        --text-secondary: #475569;
        --text-muted: #64748b;
        --text-white: #0f172a;
        --text-link: var(--accent-primary);
        
        --border-primary: #e2e8f0;
        --border-secondary: #cbd5e1;
        --border-header: #e2e8f0;
        --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.08);
        --shadow-modal: 0 16px 48px rgba(0, 0, 0, 0.12);
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html {
      overflow-y: scroll;
      scroll-behavior: smooth;
    }
    body {
      width: 100%;
      min-height: 100vh;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-sans);
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }
    .top-header {
      width: 100%;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-header);
      padding: 16px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
      box-sizing: border-box;
    }
    .logo-container {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--text-primary);
    }
    .logo-badge {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-md);
      background: var(--accent-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      color: #ffffff;
      font-size: 18px;
    }
    .logo-title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text-white);
    }
    .app-link {
      color: #ffffff;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      padding: 10px 20px;
      border-radius: var(--radius-md);
      background: var(--accent-primary);
      transition: background var(--transition-normal, 0.2s ease);
    }
    .app-link:hover {
      background: var(--accent-primary-hover);
    }
    .page-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 24px 80px 24px;
      box-sizing: border-box;
    }
    main {
      max-width: 860px;
      width: 100%;
      box-sizing: border-box;
    }
    .card {
      background: var(--bg-card);
      border-radius: var(--radius-xl);
      padding: 48px 44px;
      border: 1px solid var(--border-primary);
      box-shadow: var(--shadow-lg);
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: var(--radius-full);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      color: var(--text-link);
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    h1 {
      font-size: 32px;
      font-weight: 800;
      margin-bottom: 8px;
      letter-spacing: -0.03em;
      color: var(--text-white);
    }
    .last-updated {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 28px;
      font-weight: 500;
    }
    .intro {
      border-bottom: 1px solid var(--border-primary);
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .intro p {
      font-size: 15.5px;
      color: var(--text-secondary);
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
      font-weight: 700;
      color: var(--text-white);
      margin-bottom: 14px;
      line-height: 1.4;
    }
    p {
      font-size: 15px;
      color: var(--text-secondary);
      line-height: 1.7;
      margin-bottom: 12px;
    }
    ul {
      padding-left: 24px;
      margin: 10px 0 16px 0;
      color: var(--text-secondary);
      font-size: 15px;
      line-height: 1.7;
    }
    li {
      margin-bottom: 8px;
    }
    li::marker {
      color: var(--accent-primary);
    }
    .link {
      color: var(--text-link);
      text-decoration: none;
      font-weight: 600;
    }
    .link:hover {
      text-decoration: underline;
    }
    footer {
      margin-top: 48px;
      text-align: center;
      color: var(--text-muted);
      font-size: 13.5px;
    }
    @media (max-width: 640px) {
      .top-header {
        padding: 14px 20px;
      }
      .card {
        padding: 28px 20px;
        border-radius: var(--radius-lg);
      }
      h1 {
        font-size: 24px;
      }
      h2 {
        font-size: 17px;
      }
      .page-wrapper {
        padding: 24px 14px 48px 14px;
      }
    }
  </style>
</head>
<body>
  <header class="top-header">
    <div class="logo-container">
      <div class="logo-badge">T</div>
      <span class="logo-title">TaskChat</span>
    </div>
    <a href="#" class="app-link">Open App</a>
  </header>

  <div class="page-wrapper">
    <main>
      <div class="card">
        <span class="badge">Legal & Security</span>
        <h1>TaskChat Privacy Policy</h1>
        <p class="last-updated">Last Updated: ${PRIVACY_LAST_UPDATED}</p>

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
