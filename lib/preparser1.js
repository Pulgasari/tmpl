// preparser.js — raw template-string transformation
// Pure string -> string rewriting. No DOM here; this is the first pass that
// turns tmpl shorthand into something a browser can actually parse. The DOM
// work (definitions, custom-tag expansion, mounting) lives in tmpl.js.

import { VOID_TAGS } from './meta.js';

// :::::: MAIN

function preParse (code) {
  if (!code) return '';
  code = processTagNames        (code);
  code = processEventBindings   (code);
  code = processPositionalArgs  (code);
  code = processMultiAttr       (code);
  code = processSelfClosingTags (code);
  return code;
}

// :::::: EXPORT

export       { preParse };
export default preParse;

// :::::: HELPERS

const isVoid     = (tag) => VOID_TAGS.has(tag.toLowerCase());
const escapeAttr = (str) => String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// :::::: PROCESSORS

// Convert tag-level CSS selectors:
// <tag.class1.class2#my-id  ->  <tag class="class1 class2" id="my-id"
const RGX_TAGS = /<([a-zA-Z0-9_-]+)((?:[.#][a-zA-Z0-9_-]+)+)/g;
function processTagNames (code) {
  return code.replace(RGX_TAGS, (_, tagName, selectors) => {
    const classes = [];
    let id = null;

    selectors.replace(/([.#])([a-zA-Z0-9_-]+)/g, (__, type, name) => {
      if (type === '.') classes.push(name);
      else id = name;
      return '';
    });

    let result = `<${tagName}`;
    if (classes.length > 0) result += ` class="${classes.join(' ')}"`;
    if (id)                 result += ` id="${id}"`;

    return result;
  });
}

// Convert event shorthand into a data-attribute the runtime can bind later:
// on:click={alert('hi')}  ->  data-on-click="alert('hi')"
const RGX_EVENT = /\bon:([a-zA-Z]+)\s*=\s*\{([^}]*)\}/g;
function processEventBindings (code) {
  return code.replace(RGX_EVENT, (_, ev, expr) => {
    return `data-on-${ev.toLowerCase()}="${escapeAttr(expr)}"`;
  });
}

// Convert positional string arguments:
// <tag 'value'  ->  <tag $attr="value"
// The leading whitespace before the quote is what distinguishes a positional
// argument from a normal attr="value" (which has `=` before the quote).
const RGX_POS_ARGS = /(<[a-zA-Z0-9_-]+(?:\s+[^>]*?)?)\s+(["'])(.*?)\2/g;
function processPositionalArgs (code) {
  return code.replace(RGX_POS_ARGS, (_, tagStart, _quote, val) => {
    return `${tagStart} $attr="${escapeAttr(val)}"`;
  });
}

// Expand multi-attribute assignment:
// [id, name]="val"  ->  id="val" name="val"
const RGX_MULTI_ATTR = /\[\s*([a-zA-Z0-9_,\s-]+)\s*\]\s*=\s*(["'])(.*?)\2/g;
function processMultiAttr (code) {
  return code.replace(RGX_MULTI_ATTR, (_, attrs, quote, val) => {
    return attrs
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
      .map((a) => `${a}=${quote}${val}${quote}`)
      .join(' ');
  });
}

// Expand self-closing custom tags:
// <card />  ->  <card></card>   (real void tags such as <img /> are left alone)
const RGX_SELF_CLOSING = /<([a-zA-Z0-9-]+)([^>]*?)\/>/g;
function processSelfClosingTags (code) {
  return code.replace(RGX_SELF_CLOSING, (match, tag, attrs) => {
    return isVoid(tag) ? match : `<${tag}${attrs}></${tag}>`;
  });
}
