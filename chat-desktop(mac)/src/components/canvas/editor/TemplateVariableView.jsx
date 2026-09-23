import React, { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';

export default function TemplateVariableView({ node, updateAttributes, editor, getPos }) {
  const name = node?.attrs?.name || '';
  const attrValue = node?.attrs?.value || '';
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(attrValue);
  const inputRef = useRef(null);

  useEffect(() => {
    setValue(attrValue);
  }, [attrValue, name]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    try {
      updateAttributes({ value: value || '' });
    } catch (err) {
      // fallback: use a transaction to set node attrs
      try {
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (typeof pos === 'number') {
          editor.commands.command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, value: value || '' });
            editor.view.dispatch(tr);
            return true;
          });
        }
      } catch (e) {
        // ignore
      }
    }
  };

  const cancel = () => {
    setEditing(false);
    setValue(attrValue);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      // place cursor after node
      const pos = typeof getPos === 'function' ? getPos() : null;
      if (typeof pos === 'number') {
        try {
          editor.commands.setTextSelection(pos + 1);
          editor.commands.focus();
        } catch (err) {
          // ignore
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <NodeViewWrapper className="template-variable-nodeview" data-var={name}>
      {!editing ? (
        <span
          className="template-variable"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.preventDefault();
            setEditing(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setEditing(true);
            }
          }}
          title={name}
        >
          {attrValue ? attrValue : `{{${name}}}`}
        </span>
      ) : (
        <input
          ref={inputRef}
          className="template-variable-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          aria-label={`Edit value for ${name}`}
        />
      )}
    </NodeViewWrapper>
  );
}
