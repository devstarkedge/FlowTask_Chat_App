// TaskChat — Public HTML Privacy Policy Generator

import { PRIVACY_LAST_UPDATED, PRIVACY_INTRO, PRIVACY_SECTIONS } from '../../client/src/data/privacyContent.js';

export function getPrivacyPolicyHTML() {
  const introHTML = PRIVACY_INTRO.map(p => `<p>${p}</p>`).join('');

  const sectionsHTML = PRIVACY_SECTIONS.map(section => {
    const blocksHTML = section.blocks.map(block => {
      if (block.type === 'p') {
        return `<p>${block.text}</p>`;
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
  <style>
    :root {
      --bg-color: #0f172a;
      --card-bg: #1e293b;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #6366f1;
      --border: #334155;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-main);
      line-height: 1.6;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2.5rem 2rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    h1 {
      font-size: 2rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 0.5rem;
    }
    .last-updated {
      font-size: 0.875rem;
      color: var(--text-muted);
    }
    .intro {
      margin-bottom: 2rem;
      font-size: 1.05rem;
      color: #e2e8f0;
    }
    .intro p {
      margin-bottom: 1rem;
    }
    .section {
      margin-bottom: 2rem;
    }
    h2 {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--accent);
      margin-bottom: 0.75rem;
    }
    p {
      margin-bottom: 0.75rem;
      color: #cbd5e1;
    }
    ul {
      margin-left: 1.5rem;
      margin-bottom: 1rem;
      color: #cbd5e1;
    }
    li {
      margin-bottom: 0.5rem;
    }
    footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 0.875rem;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>TaskChat Privacy Policy</h1>
      <p class="last-updated">Last Updated: ${PRIVACY_LAST_UPDATED}</p>
    </header>

    <div class="intro">
      ${introHTML}
    </div>

    ${sectionsHTML}

    <footer>
      &copy; ${new Date().getFullYear()} TaskChat. All rights reserved.
    </footer>
  </div>
</body>
</html>`;
}
