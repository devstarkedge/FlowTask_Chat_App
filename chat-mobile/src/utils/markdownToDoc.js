/**
 * A lightweight markdown to TipTap JSON document parser.
 * Supports:
 * - Headings (e.g. # H1, ## H2, ### H3)
 * - Paragraphs
 * - Blockquotes (lines starting with >)
 * - Lists (unordered with - or *, ordered with 1., 2.)
 * - Task lists (e.g. - [ ] Task, - [x] Task)
 * - Code blocks (fenced with ```)
 * - Inline formatting: bold (**text**), italic (*text*), inline code (`code`), links ([label](url)), images (![alt](url))
 */

function parseInline(text = "") {
  if (!text) return [];

  const tokens = [];
  let remaining = text;

  // Simple tokenizer for inline elements
  // Regexes for inline formats:
  // 1. Image: !\[([^\]]*)\]\(([^)]+)\)
  // 2. Link: \[([^\]]+)\]\(([^)]+)\)
  // 3. Bold: \*\*([^*]+)\*\*
  // 4. Italic: \*([^*]+)\*
  // 5. Code: `([^`]+)`
  
  const inlineRegex = /(!\[.*?\]\(.*?\)|\[.*?\]\(.*?\)|`.*?`|\*\*.*?\*\*|\*.*?\*)/g;
  const parts = remaining.split(inlineRegex);

  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith('![') && part.includes('](')) {
      const match = part.match(/!\[(.*?)\]\((.*?)\)/);
      if (match) {
        tokens.push({
          type: "image",
          attrs: { src: match[2], alt: match[1] }
        });
        continue;
      }
    }

    if (part.startsWith('[') && part.includes('](')) {
      const match = part.match(/\[(.*?)\]\((.*?)\)/);
      if (match) {
        tokens.push({
          type: "text",
          text: match[1],
          marks: [{ type: "link", attrs: { href: match[2] } }]
        });
        continue;
      }
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      tokens.push({
        type: "text",
        text: inner,
        marks: [{ type: "bold" }]
      });
      continue;
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      const inner = part.slice(1, -1);
      tokens.push({
        type: "text",
        text: inner,
        marks: [{ type: "italic" }]
      });
      continue;
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      const inner = part.slice(1, -1);
      tokens.push({
        type: "text",
        text: inner,
        marks: [{ type: "code" }]
      });
      continue;
    }

    // Default plain text
    tokens.push({
      type: "text",
      text: part
    });
  }

  return tokens.length ? tokens : [];
}

export function markdownToDoc(markdown = "") {
  const lines = String(markdown || "").split(/\r?\n/);
  const content = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced Code Block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      content.push({
        type: "codeBlock",
        attrs: { language: lang },
        content: [{ type: "text", text: codeLines.join("\n") }]
      });
      i++;
      continue;
    }

    // Headings
    if (line.startsWith("#")) {
      const match = line.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        const children = parseInline(text);
        content.push(children.length ? { type: "heading", attrs: { level }, content: children } : { type: "heading", attrs: { level } });
        i++;
        continue;
      }
    }

    // Blockquote
    if (line.startsWith(">")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quoteLines.push(lines[i].slice(1).replace(/^\s/, ""));
        i++;
      }
      const quoteDoc = markdownToDoc(quoteLines.join("\n"));
      content.push({
        type: "blockquote",
        content: quoteDoc.content
      });
      continue;
    }

    // Task Lists / Unordered Lists
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ") || line.trim().match(/^\d+\.\s+/)) {
      const listItems = [];
      const isOrdered = line.trim().match(/^\d+\.\s+/);
      let isTaskList = false;

      while (i < lines.length) {
        const currentLine = lines[i];
        const trimCurrent = currentLine.trim();

        const taskMatch = trimCurrent.match(/^-\s+\[([ xX])\]\s+(.*)$/);
        const ulMatch = trimCurrent.match(/^[-*]\s+(.*)$/);
        const olMatch = trimCurrent.match(/^\d+\.\s+(.*)$/);

        if (taskMatch) {
          isTaskList = true;
          const checked = taskMatch[1].toLowerCase() === 'x';
          listItems.push({
            type: "taskItem",
            attrs: { checked },
            content: [{ type: "paragraph", content: parseInline(taskMatch[2]) }]
          });
          i++;
        } else if (ulMatch) {
          listItems.push({
            type: "listItem",
            content: [{ type: "paragraph", content: parseInline(ulMatch[1]) }]
          });
          i++;
        } else if (olMatch) {
          listItems.push({
            type: "listItem",
            content: [{ type: "paragraph", content: parseInline(olMatch[1]) }]
          });
          i++;
        } else {
          break; // end of list
        }
      }

      if (isTaskList) {
        content.push({
          type: "taskList",
          content: listItems
        });
      } else {
        content.push({
          type: isOrdered ? "orderedList" : "bulletList",
          content: listItems
        });
      }
      continue;
    }

    // Empty line or paragraph
    if (!line.trim()) {
      content.push({ type: "paragraph" });
    } else {
      content.push({
        type: "paragraph",
        content: parseInline(line)
      });
    }
    i++;
  }

  return { type: "doc", content };
}

export default markdownToDoc;
