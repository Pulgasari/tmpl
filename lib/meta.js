// meta.js

const NATIVE_TAGS = new Set([
  'a', 'b', 'body', 'button', 'div', 'em', 'footer', 'form', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'head', 'header', 'html', 'img', 'input', 'li', 'link',
  'meta', 'nav', 'ol', 'p', 'script', 'section', 'span', 'strong', 'style', 'table', 'td', 'tr', 'label', 'select', 'option', 'code'
]);

const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'track', 'wbr']);

export {
  NATIVE_TAGS,
  VOID_TAGS,
};
