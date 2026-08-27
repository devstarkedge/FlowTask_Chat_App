import React from 'react';
import { Link } from 'react-router-dom';

const AccountDeletionPage = () => {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary, #0f0f13)',
      color: 'var(--text-primary, #e2e2e5)',
      fontFamily: 'Inter, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 20px',
    }}>
      <div style={{
        maxWidth: '600px',
        width: '100%',
        backgroundColor: 'var(--bg-secondary, #1a1a21)',
        borderRadius: '16px',
        padding: '32px',
        border: '1px solid var(--border-light, #2a2a35)',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
          FlowTask Account Deletion Request
        </h1>
        
        <p style={{ lineHeight: '1.6', marginBottom: '20px', color: 'var(--text-secondary, #9a9a9d)' }}>
          To request the deletion of your FlowTask account and all associated data, you can do so directly from within the FlowTask mobile application or web dashboard. 
        </p>

        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
          Delete via Mobile App:
        </h2>
        <ul style={{ paddingLeft: '20px', marginBottom: '20px', color: 'var(--text-secondary, #9a9a9d)', lineHeight: '1.6' }}>
          <li>Open the FlowTask Chat app on your iOS or Android device.</li>
          <li>Navigate to your Profile / Preferences screen.</li>
          <li>Scroll down to the "Danger Zone" section.</li>
          <li>Tap "Delete Account" and confirm with your password.</li>
        </ul>

        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
          Manual Deletion Request:
        </h2>
        <p style={{ lineHeight: '1.6', marginBottom: '20px', color: 'var(--text-secondary, #9a9a9d)' }}>
          If you no longer have access to the app, you can request account deletion by emailing our support team at <strong>support@flowtask.com</strong> from the email address associated with your account.
        </p>

        <p style={{ lineHeight: '1.6', marginBottom: '32px', color: 'var(--text-secondary, #9a9a9d)' }}>
          <strong>Note:</strong> Once requested, your account will enter a 90-day grace period during which you can cancel the deletion. After 90 days, your personal data, messages, and files will be permanently deleted.
        </p>

        <Link 
          to="/"
          style={{
            display: 'inline-block',
            backgroundColor: 'var(--accent-primary, #6366f1)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: '600',
            textAlign: 'center'
          }}
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
};

export default AccountDeletionPage;
