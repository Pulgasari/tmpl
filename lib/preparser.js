// preparser.js - Raw template string transformation

// :::::: MAIN

function preParse (code) {
  if (!code) return '';
  code = processTagNames        (code);
  code = processPositionalArgs  (code)
  code = processMultiAttr       (code);
  coee = processSelfClosingTags (code);
  
  return code;
}

// :::::: EXPORT

export       { preParse };
export default preParse;

// :::::: META

const voidElements = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'track', 'wbr']);

// HELPERS

const isVoid = (tag) => voidElements.has(tag.toLowerCase());

// :::::: PROCESSORS

// Matches positional quoted strings right after tag name or class/id definitions

function processTagNames (code) {
  // 1. Convert tag-level CSS selectors: <tag.class1.class2#my-id -> <tag class="class1 class2" id="my-id"
  return code.replace(/<([a-zA-Z0-9_-]+)((?:[\.#][a-zA-Z0-9_-]+)+)/g, (_, tagName, selectors) => {
    const classes = [];
    let id = null;

    // Parse .className and #id parts
    selectors.replace(/([\.#])([a-zA-Z0-9_-]+)/g, (__, type, name) => {
      if (type === '.') classes.push(name);
      if (type === '#') id = name;
    });

    let result = `<${tagName}`;
    if (classes.length > 0) result += ` class="${classes.join(' ')}"`;
    if (id) result += ` id="${id}"`;

    return result;
  });
}

// expand multi-attribute assignment
// [id, name]="val" -> id="val" name="val"

const REGEXP_MULTI_ATTR = /\[\s*([a-zA-Z0-9_,\s-]+)\s*\]\s*=\s*(["'])(.*?)\2/g;
function expandMultiAttr (code) {
  return code = input.replace(REGEXP_MULTI_ATTR, (_, attrs, quote, val) => {
    return attrs.split(',').map(a => `${a.trim()}=${quote}${val}${quote}`).join(' ');
  });
}

// convert positional string arguments
// <tag 'value' -> <tag $attr="value"

const REGEXP_POS_ARGS = /(<[a-zA-Z0-9_-]+(?:\s+[^>]*?)?)\s+(["'])(.*?)\2/g;
function processPositionalArgs (code) {
  return code.replace(REGEXP_POS_ARGS, (_, tagStart, quote, val) => {
    return `${tagStart} $attr="${val}"`;
  });
}


// expand self-closing custom tags
// <card /> -> <card></card>

const REGEXP_VOID_TAGS = /<([a-zA-Z0-9-]+)([^>]*?)\/>/g;
function processSelfClosingTags (code) {
  return code.replace(REGEXP_VOID_TAGS, (match, tag, attrs) => {
    return isVoid(tag) ? match : `<${tag}${attrs}></${tag}>`;
  });
}
