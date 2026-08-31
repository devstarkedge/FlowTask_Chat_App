import React, { useEffect, useMemo, useState } from 'react';

export default function TemplateVariablesPanel({ editor, onClose }) {
  const [variables, setVariables] = useState([]);

  const scanVariables = () => {
    if (!editor || !editor.state) return [];
    const vars = {};
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'templateVariable') {
        const name = node.attrs?.name || '';
        const value = node.attrs?.value || '';
        if (!vars[name]) vars[name] = { name, value, count: 0 };
        vars[name].count += 1;
      }
    });
    return Object.values(vars);
  };

  useEffect(() => {
    setVariables(scanVariables());
    const handler = () => setVariables(scanVariables());
    editor?.on('update', handler);
    return () => editor?.off('update', handler);
  }, [editor]);

  const updateVariableValue = (name, value) => {
    if (!editor || !editor.state) return;
    const { tr } = editor.state;
    const { doc, schema } = editor.state;

    const updates = [];
    doc.descendants((node, pos) => {
      if (node.type.name === 'templateVariable' && node.attrs?.name === name) {
        updates.push({ pos, node });
      }
    });

    if (updates.length === 0) return;

    updates.forEach(({ pos, node }) => {
      const newAttrs = { ...node.attrs, value };
      tr.setNodeMarkup(pos, undefined, newAttrs);
    });

    editor.view.dispatch(tr);
    // trigger panel refresh
    setVariables(scanVariables());
  };

  const replaceVariablesWithText = (name) => {
    if (!editor || !editor.state) return;
    const { tr } = editor.state;
    const { doc } = editor.state;
    const updates = [];
    doc.descendants((node, pos) => {
      if (node.type.name === 'templateVariable' && node.attrs?.name === name) {
        updates.push({ pos, node });
      }
    });

    // process from end to start to keep positions valid
    updates.sort((a, b) => b.pos - a.pos).forEach(({ pos, node }) => {
      const text = node.attrs?.value || `{{${node.attrs?.name}}}`;
      tr.replaceWith(pos, pos + 1, editor.state.schema.text(text));
    });

    editor.view.dispatch(tr);
    setVariables(scanVariables());
  };

  if (!editor) return null;

  return (
    <div style={{ width: 360, borderLeft: '1px solid var(--border-primary)', background: 'var(--bg-primary)', padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 14 }}>Template variables</h4>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>Close</button>
      </div>

      {variables.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No variables found in this document.</div>}

      {variables.map((v) => (
        <div key={v.name} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13 }}>{v.name}</strong>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{v.count}×</span>
          </div>
          <input value={v.value || ''} onChange={(e) => updateVariableValue(v.name, e.target.value)} placeholder={`Value for ${v.name}`} style={{ width: '100%', padding: 8, marginTop: 6, borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => replaceVariablesWithText(v.name)} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'var(--accent-primary)', color: '#fff', cursor: 'pointer' }}>Apply</button>
            <button onClick={() => updateVariableValue(v.name, '')} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>Clear values</button>
          </div>
        </div>
      ))}
    </div>
  );
}
