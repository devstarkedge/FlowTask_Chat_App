export function getPrivacyPolicyHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TaskChat — Privacy Policy</title>
  <style>
    :root {
      --bg-primary: #0f0f13;
      --bg-secondary: #1a1a24;
      --border-color: #2a2a3a;
      --text-primary: #ffffff;
      --text-secondary: #a0a0ab;
      --text-tertiary: #727280;
      --accent: #6366f1;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding-bottom: 60px;
    }
    header {
      width: 100%;
      background-color: #16161e;
      border-bottom: 1px solid var(--border-color);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--text-primary);
    }
    .logo {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: #fff;
      font-size: 18px;
    }
    .brand-name {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .container {
      max-width: 820px;
      margin: 40px auto 0 auto;
      padding: 0 20px;
    }
    .card {
      background-color: var(--bg-secondary);
      border-radius: 16px;
      padding: 40px;
      border: 1px solid var(--border-color);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    }
    h1 {
      font-size: 28px;
      font-weight: 800;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .last-updated {
      font-size: 13px;
      color: var(--text-tertiary);
      margin-bottom: 24px;
      font-weight: 500;
    }
    .intro {
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 20px;
      margin-bottom: 28px;
    }
    .intro p {
      color: var(--text-secondary);
      font-size: 15px;
      margin-bottom: 12px;
    }
    section {
      margin-bottom: 28px;
    }
    h2 {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 12px;
    }
    p {
      color: var(--text-secondary);
      font-size: 14.5px;
      margin-bottom: 10px;
    }
    ul {
      padding-left: 22px;
      margin: 8px 0 14px 0;
      color: var(--text-secondary);
      font-size: 14.5px;
    }
    li {
      margin-bottom: 6px;
    }
    a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
    }
    a:hover {
      text-decoration: underline;
    }
    footer {
      margin-top: 40px;
      text-align: center;
      color: var(--text-tertiary);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="logo">T</div>
      <span class="brand-name">TaskChat</span>
    </div>
  </header>

  <main class="container">
    <div class="card">
      <h1>TaskChat — Privacy Policy</h1>
      <p class="last-updated">Last Updated: August 25, 2026</p>

      <div class="intro">
        <p>Welcome to TaskChat. We respect your privacy and are committed to protecting the personal information you share with us.</p>
        <p>This Privacy Policy explains what information we collect, how we use it, who we share it with, and your choices regarding your information when you use the TaskChat application ("Service").</p>
      </div>

      <section>
        <h2>1. Information We Collect</h2>
        <p>We may collect the following types of information when you use TaskChat:</p>
        <ul>
          <li><strong>Account Information:</strong> Name, email address, password, and profile picture.</li>
          <li><strong>User-Generated Content (UGC):</strong> Messages, tasks, boards, comments, media, files, and other data you upload or send.</li>
          <li><strong>Device and Usage Data:</strong> IP address, device type, operating system, app usage statistics, crash reports, and identifiers.</li>
          <li><strong>Camera and Audio:</strong> We may collect images or audio if you grant us permission to use your camera and microphone within the app.</li>
          <li><strong>Third-Party Integrations:</strong> Data from third-party services you connect to TaskChat.</li>
        </ul>
      </section>

      <section>
        <h2>2. How We Use Your Information</h2>
        <p>We use the collected information for the following purposes:</p>
        <ul>
          <li>To provide, maintain, and improve the Service.</li>
          <li>To authenticate users and secure accounts.</li>
          <li>To process and store your messages, tasks, and media.</li>
          <li>To send notifications, updates, and support messages.</li>
          <li>To detect, prevent, and address technical issues or abuse (such as spam or harassment).</li>
        </ul>
      </section>

      <section>
        <h2>3. Information Sharing</h2>
        <p>We do not sell your personal data. We may share your information only in the following situations:</p>
        <ul>
          <li><strong>With other users:</strong> Content you share in workspaces or direct messages is visible to those users.</li>
          <li><strong>With service providers:</strong> Third-party vendors that provide hosting, analytics, and infrastructure (e.g., cloud storage, push notifications).</li>
          <li><strong>For legal reasons:</strong> If required by law, subpoena, or to protect the safety and rights of TaskChat or its users.</li>
          <li><strong>Business transfers:</strong> In the event of a merger, acquisition, or sale of assets.</li>
        </ul>
      </section>

      <section>
        <h2>4. Third-Party SDKs and Services</h2>
        <p>Our app uses third-party Software Development Kits (SDKs) and APIs to provide essential functionality (e.g., Expo, push notifications, analytics). These services may collect device identifiers and usage data in accordance with their own privacy policies.</p>
      </section>

      <section>
        <h2>5. Data Retention and Deletion</h2>
        <p>We retain your personal data for as long as your account is active or as needed to provide you the Service.</p>
        <p>You can request account deletion at any time from the app preferences. Upon request, your account and associated data will be queued for deletion and permanently removed after a 90-day grace period, unless retention is required by law.</p>
      </section>

      <section>
        <h2>6. Security</h2>
        <p>We implement industry-standard security measures to protect your data. However, no method of transmission over the internet or electronic storage is 100% secure, and we cannot guarantee absolute security.</p>
      </section>

      <section>
        <h2>7. Your Choices and Rights</h2>
        <p>Depending on your location, you may have rights to access, update, or delete your personal information.</p>
        <p>You can manage app permissions (camera, microphone, photo library) directly in your device settings.</p>
      </section>

      <section>
        <h2>8. Changes to this Privacy Policy</h2>
        <p>We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last Updated" date and providing notice through the app when appropriate.</p>
      </section>

      <section>
        <h2>9. Contact Us</h2>
        <p>If you have questions or concerns about this Privacy Policy or your data, please contact us:</p>
        <p>Email: <a href="mailto:info@starkedge.com">info@starkedge.com</a></p>
      </section>
    </div>
  </main>

  <footer>
    <p>© ${new Date().getFullYear()} TaskChat. All rights reserved.</p>
  </footer>
</body>
</html>`;
}
