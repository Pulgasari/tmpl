// meta.js — tag metadata for the tmpl runtime

// Native HTML tags that must never be rewritten into <div>s.
const NATIVE_TAGS = new Set([
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'blockquote', 'body',
  'button', 'canvas', 'caption', 'code', 'datalist', 'dd', 'details', 'dialog',
  'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'html', 'i', 'iframe',
  'kbd', 'label', 'legend', 'li', 'main', 'mark', 'nav', 'ol', 'optgroup',
  'option', 'output', 'p', 'picture', 'pre', 'progress', 'q', 's', 'samp',
  'script', 'section', 'select', 'small', 'span', 'strong', 'style', 'sub',
  'summary', 'sup', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead',
  'time', 'title', 'tr', 'u', 'ul', 'video'
]);

// Void tags never receive a closing tag or children.
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr'
]);

// Everything the runtime recognises as "real HTML" (so it leaves it alone).
const STANDARD_TAGS = new Set([...NATIVE_TAGS, ...VOID_TAGS]);

export {
  NATIVE_TAGS,
  VOID_TAGS,
  STANDARD_TAGS,
};
