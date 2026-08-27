// Flow Task — Privacy Policy
// Source: Flow Task Privacy Policy document.
// Rendered in the registration flow (RegisterScreen) and Settings via PrivacyModal.

// export const PRIVACY_LAST_UPDATED = 'August 25, 2026';

export const PRIVACY_INTRO = [
  'Welcome to Flow Task. We respect your privacy and are committed to protecting the personal information you share with us.',
  'This Privacy Policy explains what information we collect, how we use it, who we share it with, and your choices regarding your information when you use the Flow Task application ("Service").',
];

export const PRIVACY_SECTIONS = [
  {
    heading: '1. Information We Collect',
    blocks: [
      { type: 'p', text: 'We may collect the following types of information when you use Flow Task:' },
      { type: 'ul', items: [
        'Account Information: Name, email address, password, and profile picture.',
        'User-Generated Content (UGC): Messages, tasks, boards, comments, media, files, and other data you upload or send.',
        'Device and Usage Data: IP address, device type, operating system, app usage statistics, crash reports, and identifiers.',
        'Camera and Audio: We may collect images or audio if you grant us permission to use your camera and microphone within the app.',
        'Third-Party Integrations: Data from third-party services you connect to Flow Task.'
      ] },
    ],
  },
  {
    heading: '2. How We Use Your Information',
    blocks: [
      { type: 'p', text: 'We use the collected information for the following purposes:' },
      { type: 'ul', items: [
        'To provide, maintain, and improve the Service.',
        'To authenticate users and secure accounts.',
        'To process and store your messages, tasks, and media.',
        'To send notifications, updates, and support messages.',
        'To detect, prevent, and address technical issues or abuse (such as spam or harassment).'
      ] },
    ],
  },
  {
    heading: '3. Information Sharing',
    blocks: [
      { type: 'p', text: 'We do not sell your personal data. We may share your information only in the following situations:' },
      { type: 'ul', items: [
        'With other users: Content you share in workspaces or direct messages is visible to those users.',
        'With service providers: Third-party vendors that provide hosting, analytics, and infrastructure (e.g., cloud storage, push notifications).',
        'For legal reasons: If required by law, subpoena, or to protect the safety and rights of Flow Task or its users.',
        'Business transfers: In the event of a merger, acquisition, or sale of assets.'
      ] },
    ],
  },
  {
    heading: '4. Third-Party SDKs and Services',
    blocks: [
      { type: 'p', text: 'Our app uses third-party Software Development Kits (SDKs) and APIs to provide essential functionality (e.g., Expo, push notifications, analytics). These services may collect device identifiers and usage data in accordance with their own privacy policies.' },
    ],
  },
  {
    heading: '5. Data Retention and Deletion',
    blocks: [
      { type: 'p', text: 'We retain your personal data for as long as your account is active or as needed to provide you the Service.' },
      { type: 'p', text: 'You can request account deletion at any time from the app preferences. Upon request, your account and associated data will be queued for deletion and permanently removed after a 90-day grace period, unless retention is required by law.' },
    ],
  },
  {
    heading: '6. Security',
    blocks: [
      { type: 'p', text: 'We implement industry-standard security measures to protect your data. However, no method of transmission over the internet or electronic storage is 100% secure, and we cannot guarantee absolute security.' },
    ],
  },
  {
    heading: '7. Your Choices and Rights',
    blocks: [
      { type: 'p', text: 'Depending on your location, you may have rights to access, update, or delete your personal information.' },
      { type: 'p', text: 'You can manage app permissions (camera, microphone, photo library) directly in your device settings.' },
    ],
  },
  {
    heading: '8. Changes to this Privacy Policy',
    blocks: [
      { type: 'p', text: 'We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last Updated" date and providing notice through the app when appropriate.' },
    ],
  },
  {
    heading: '9. Contact Us',
    blocks: [
      { type: 'p', text: 'If you have questions or concerns about this Privacy Policy or your data, please contact us:' },
      { type: 'p', text: 'Email: info@starkedge.com' },
    ],
  },
];
