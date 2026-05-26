import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

function parseInline(inlineTokens) {
  const out = [];
  const markStack = [];

  for (const t of inlineTokens || []) {
    if (t.type === "text") {
      const node = { type: "text", text: t.content };
      if (markStack.length) {
        node.marks = markStack.map((m) => {
          if (m.type === "bold") return { type: "bold" };
          if (m.type === "italic") return { type: "italic" };
          if (m.type === "code") return { type: "code" };
          if (m.type === "link") return { type: "link", attrs: { href: m.href } };
          return null;
        }).filter(Boolean);
      }
      out.push(node);
    } else if (t.type === "softbreak" || t.type === "hardbreak") {
      out.push({ type: "text", text: "\n" });
    } else if (t.type === "code_inline") {
      out.push({ type: "text", text: t.content, marks: [{ type: "code" }] });
    } else if (t.type === "strong_open") {
      markStack.push({ type: "bold" });
    } else if (t.type === "strong_close") {
      markStack.pop();
    } else if (t.type === "em_open") {
      markStack.push({ type: "italic" });
    } else if (t.type === "em_close") {
      markStack.pop();
    } else if (t.type === "link_open") {
      const href = (t.attrs || []).find((a) => a[0] === "href")?.[1] || "";
      markStack.push({ type: "link", href });
    } else if (t.type === "link_close") {
      markStack.pop();
    } else if (t.type === "image") {
      const src = (t.attrs || []).find((a) => a[0] === "src")?.[1] || "";
      const alt = t.content || "";
      out.push({ type: "image", attrs: { src, alt } });
    }
  }

  return out;
}

export function markdownToDoc(markdown = "") {
  const tokens = md.parse(String(markdown || ""), {});
  const content = [];
  let i = 0;

  while (i < tokens.length) {
    const tk = tokens[i];

    if (tk.type === "heading_open") {
      const level = parseInt(tk.tag.replace(/[^0-9]/g, ""), 10) || 1;
      const inline = tokens[i + 1];
      const children = inline && inline.type === "inline" ? parseInline(inline.children) : [];
        // If there are no inline children, create a heading node without
        // an empty text node. ProseMirror/Tiptap disallow text nodes with
        // empty `text` values, so omit the `content` property instead.
        if (children.length) {
          content.push({ type: "heading", attrs: { level }, content: children });
        } else {
          content.push({ type: "heading", attrs: { level } });
        }
      i += 3;
      continue;
    }

    if (tk.type === "paragraph_open") {
      const inline = tokens[i + 1];
      const children = inline && inline.type === "inline" ? parseInline(inline.children) : [];
      content.push({ type: "paragraph", content: children });
      i += 3;
      continue;
    }

    if (tk.type === "fence" || tk.type === "code_block") {
      content.push({ type: "codeBlock", attrs: { language: tk.info || "" }, content: [{ type: "text", text: tk.content || "" }] });
      i += 1;
      continue;
    }

    if (tk.type === "blockquote_open") {
      const inner = [];
      i += 1;
      while (i < tokens.length && tokens[i].type !== "blockquote_close") {
        if (tokens[i].type === "paragraph_open" && tokens[i + 1] && tokens[i + 1].type === "inline") {
          inner.push({ type: "paragraph", content: parseInline(tokens[i + 1].children) });
          i += 3;
        } else {
          i += 1;
        }
      }
      content.push({ type: "blockquote", content: inner });
      i += 1;
      continue;
    }

    if (tk.type === "bullet_list_open" || tk.type === "ordered_list_open") {
      const isOrdered = tk.type === "ordered_list_open";
      const items = [];
      i += 1;
      while (i < tokens.length && !(isOrdered ? tokens[i].type === "ordered_list_close" : tokens[i].type === "bullet_list_close")) {
        if (tokens[i].type === "list_item_open") {
          let j = i + 1;
          const itemContent = [];
          while (j < tokens.length && tokens[j].type !== "list_item_close") {
            if (tokens[j].type === "paragraph_open" && tokens[j + 1] && tokens[j + 1].type === "inline") {
              itemContent.push({ type: "paragraph", content: parseInline(tokens[j + 1].children) });
              j += 3;
            } else {
              j += 1;
            }
          }
          items.push({ type: "listItem", content: itemContent.length ? itemContent : [{ type: "paragraph", content: [] }] });
          i = j + 1;
          continue;
        }
        i += 1;
      }
      content.push({ type: isOrdered ? "orderedList" : "bulletList", content: items });
      i += 1;
      continue;
    }

    if (tk.type === "inline") {
      content.push({ type: "paragraph", content: parseInline(tk.children) });
      i += 1;
      continue;
    }

    i += 1;
  }

  return { type: "doc", content };
}

export default markdownToDoc;
