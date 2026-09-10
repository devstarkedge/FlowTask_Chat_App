import React from 'react';
import { Link } from 'react-router-dom';
import { PRIVACY_LAST_UPDATED, PRIVACY_INTRO, PRIVACY_SECTIONS } from '../data/privacyContent';

const PrivacyPolicyPage = () => {
  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        maxHeight: '100vh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        backgroundColor: 'var(--bg-primary, #0f0f13)',
        color: 'var(--text-primary, #e2e2e5)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 0 60px 0',
      }}
    >
      {/* Top Bar Header */}
      <header
        style={{
          width: '100%',
          backgroundColor: 'var(--bg-secondary, #16161e)',
          borderBottom: '1px solid var(--border-light, #282836)',
          padding: '16px 24px',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          boxSizing: 'border-box',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              color: '#ffffff',
              fontSize: '16px',
            }}
          >
            T
          </div>
          <span style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.02em' }}>
            TaskChat
          </span>
        </Link>

        <Link
          to="/login"
          style={{
            color: 'var(--accent-primary, #6366f1)',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '600',
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            transition: 'all 0.2s ease',
          }}
        >
          Open App
        </Link>
      </header>

      {/* Main Container */}
      <main
        style={{
          maxWidth: '800px',
          width: '100%',
          padding: '40px 24px 0 24px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--bg-secondary, #1a1a24)',
            borderRadius: '16px',
            padding: '36px',
            border: '1px solid var(--border-light, #2a2a3a)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
          }}
        >
          <h1
            style={{
              fontSize: '28px',
              fontWeight: '800',
              marginBottom: '8px',
              letterSpacing: '-0.02em',
              color: '#ffffff',
            }}
          >
            TaskChat — Privacy Policy
          </h1>

          {PRIVACY_LAST_UPDATED && (
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-tertiary, #727280)',
                marginBottom: '24px',
                fontWeight: '500',
              }}
            >
              Last Updated: {PRIVACY_LAST_UPDATED}
            </p>
          )}

          <div
            style={{
              borderBottom: '1px solid var(--border-light, #2a2a3a)',
              paddingBottom: '20px',
              marginBottom: '28px',
            }}
          >
            {PRIVACY_INTRO.map((paragraph, index) => (
              <p
                key={index}
                style={{
                  lineHeight: '1.7',
                  color: 'var(--text-secondary, #a0a0ab)',
                  fontSize: '15px',
                  marginBottom: index === PRIVACY_INTRO.length - 1 ? 0 : '12px',
                }}
              >
                {paragraph}
              </p>
            ))}
          </div>

          {/* Policy Sections */}
          {PRIVACY_SECTIONS.map((section, idx) => (
            <section
              key={idx}
              style={{
                marginBottom: '28px',
              }}
            >
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: '700',
                  color: '#ffffff',
                  marginBottom: '12px',
                  lineHeight: '1.4',
                }}
              >
                {section.heading}
              </h2>

              {section.blocks.map((block, bIdx) => {
                if (block.type === 'p') {
                  const isContactEmail = block.text.includes('Email:');
                  return (
                    <p
                      key={bIdx}
                      style={{
                        lineHeight: '1.65',
                        color: 'var(--text-secondary, #a0a0ab)',
                        fontSize: '14.5px',
                        marginBottom: '10px',
                      }}
                    >
                      {isContactEmail ? (
                        <>
                          Email:{' '}
                          <a
                            href="mailto:info@starkedge.com"
                            style={{
                              color: 'var(--accent-primary, #6366f1)',
                              textDecoration: 'none',
                              fontWeight: '600',
                            }}
                          >
                            info@starkedge.com
                          </a>
                        </>
                      ) : (
                        block.text
                      )}
                    </p>
                  );
                }

                if (block.type === 'ul') {
                  return (
                    <ul
                      key={bIdx}
                      style={{
                        paddingLeft: '22px',
                        margin: '8px 0 14px 0',
                        color: 'var(--text-secondary, #a0a0ab)',
                        lineHeight: '1.65',
                        fontSize: '14.5px',
                      }}
                    >
                      {block.items.map((item, itemIdx) => (
                        <li key={itemIdx} style={{ marginBottom: '6px' }}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  );
                }

                return null;
              })}
            </section>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          marginTop: '40px',
          textAlign: 'center',
          color: 'var(--text-tertiary, #656575)',
          fontSize: '13px',
        }}
      >
        <p>© {new Date().getFullYear()} TaskChat. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default PrivacyPolicyPage;
