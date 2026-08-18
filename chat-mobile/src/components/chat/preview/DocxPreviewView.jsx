import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const DOCX_STYLES = `
  body { margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .docx-content h1,.docx-content h2,.docx-content h3,.docx-content h4 { margin: 0.9em 0 0.4em; font-weight: 700; }
  .docx-content h1 { font-size: 24px; } .docx-content h2 { font-size: 20px; } .docx-content h3 { font-size: 16px; }
  .docx-content p { margin: 0.4em 0; line-height: 1.7; }
  .docx-content table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  .docx-content td,.docx-content th { border: 1px solid #cbd5e1; padding: 6px 10px; }
  .docx-content img { max-width: 100%; height: auto; }
  .docx-content ul,.docx-content ol { padding-left: 24px; margin: 0.4em 0; }
`;

export default function DocxPreviewView({ html }) {
  const source = useMemo(() => ({
    html: `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${DOCX_STYLES}</style></head><body><div class="docx-content">${html || ''}</div></body></html>`,
  }), [html]);

  return (
    <WebView
      originWhitelist={['*']}
      source={source}
      style={styles.webview}
      javaScriptEnabled={false}
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
});
