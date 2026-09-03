// preparser.js — raw template-string transformation
// Pure string -> string rewriting. No DOM here; this is the first pass that
// turns tmpl shorthand into something a browser can actually parse. The DOM
// work (definitions, custom-tag expansion, mounting) lives in tmpl.js.
//
// Performance notes:
// - One pass over the template instead of five complete regex passes.
// - Only tag-like regions are parsed; ordinary text is copied as-is.
// - No intermediate full-template strings are created.
// - All shorthand transformations are handled while parsing the same tag.
// - Self-closing handling is integrated into the same pass.
// - VOID_TAGS lookup happens only for actual self-closing tags.

/*
<tag.foo.bar#id />
<tag 'value'>
<tag "value">
<tag [id,name]="value">
<tag on:click={foo()}>
<tag on:click={foo({ a: 1 })}>
<img />
<input />
<div title="hello world">
*/

import { VOID_TAGS } from './meta.js';

// :::::: MAIN

function preParse (code) {
  if (!code) return '';

  const parts = [];
  let last = 0;
  let pos = 0;

  while ((pos = code.indexOf('<', pos)) !== -1) {
    const parsed = parseTag(code, pos);

    if (!parsed) {
      pos++;
      continue;
    }

    // Keep everything before the tag untouched.
    if (last < pos) {
      parts.push(code.slice(last, pos));
    }

    parts.push(parsed.output);

    pos = parsed.end;
    last = pos;
  }

  // Remaining text.
  if (last < code.length) {
    parts.push(code.slice(last));
  }

  return parts.join('');
}

// :::::: EXPORT

export { preParse };
export default preParse;

// :::::: CONSTANTS

const CHAR_LT     = 60;  // <
const CHAR_GT     = 62;  // >
const CHAR_SLASH  = 47;  // /
const CHAR_DOT    = 46;  // .
const CHAR_HASH   = 35;  // #
const CHAR_COLON  = 58;  // :
const CHAR_EQUAL  = 61;  // =
const CHAR_SPACE  = 32;
const CHAR_TAB    = 9;
const CHAR_NL     = 10;
const CHAR_CR     = 13;
const CHAR_QUOTE  = 34;  // "
const CHAR_APOS   = 39;  // '
const CHAR_LBRACE = 123; // {
const CHAR_RBRACE = 125; // }

// :::::: HELPERS

const isSpace = (code, pos) => {
  const c = code.charCodeAt(pos);
  return (
       c === CHAR_SPACE
    || c === CHAR_TAB
    || c === CHAR_NL
    || c === CHAR_CR
  );
};

const isNameChar = (c) => (
     (c >= 48 && c <= 57)  // 0-9
  || (c >= 65 && c <= 90)  // A-Z
  || (c >= 97 && c <= 122) // a-z
  || c === 95              // _
  || c === 45              // -
);

const isSelectorChar = isNameChar;

const isVoid = (tag) => VOID_TAGS.has(tag.toLowerCase());

function escapeAttr (str) {
  // Keep the original semantics:
  // - & -> &amp;
  // - " -> &quot;
  //
  // Most event / positional values are small, so using two highly optimized
  // native String.replace calls is preferable to a JS character-by-character
  // loop here.
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function normalizeQuote(value, quote) {
  // Preserve the original quoted value semantics.
  // Multi-attr assignments intentionally preserve the original quote type.
  return `${quote}${value}${quote}`;
}

// :::::: TAG PARSER

/**
 * Parse one tag starting at "<".
 *
 * Supported syntax:
 *
 *   <tag.class1.class2#id
 *   on:click={...}
 *   <tag 'value'
 *   [id, name]="value"
 *   <card />
 *
 * Returns:
 *   { output: string, end: number }
 *
 * or null if the "<" does not start a tag we handle here.
 */
function parseTag(code, start) {
  const length = code.length;

  if (start + 1 >= length) return null;

  let pos = start + 1;

  // :::::: CLOSING TAG

  if (code.charCodeAt(pos) === CHAR_SLASH) {
    pos++;

    // </#app>
    if (code.charCodeAt(pos) === CHAR_HASH) {
      return parseImplicitDivClosingTag(code, start, pos);
    }

    // Normale Closing-Tags bleiben unverändert.
    return null;
  }

  // :::::: IMPLICIT DIV

  // <#app>
  if (code.charCodeAt(pos) === CHAR_HASH) {
    return parseImplicitDivOpeningTag(code, start, pos);
  }

  // :::::: NORMAL TAG

  const tagStart = pos;

  while (pos < length && isNameChar(code.charCodeAt(pos))) {
    pos++;
  }

  if (pos === tagStart) {
    return null;
  }

  const originalTag = code.slice(tagStart, pos);

  // .class / #id direkt nach dem Tagnamen
  let classes = '';
  let id = '';

  while (pos < length) {
    const marker = code.charCodeAt(pos);

    if (marker !== CHAR_DOT && marker !== CHAR_HASH) {
      break;
    }

    pos++;

    const nameStart = pos;

    while (pos < length && isSelectorChar(code.charCodeAt(pos))) {
      pos++;
    }

    if (pos === nameStart) {
      pos--;
      break;
    }

    const name = code.slice(nameStart, pos);

    if (marker === CHAR_DOT) {
      classes += classes ? ` ${name}` : name;
    } else {
      id = name;
    }
  }

  const attrStart = pos;

  let quote = 0;
  let braceDepth = 0;

  while (pos < length) {
    const c = code.charCodeAt(pos);

    if (quote) {
      if (c === quote) {
        quote = 0;
      } else if (c === 92) {
        // Escape character inside quoted strings.
        pos++;
      }

      pos++;
      continue;
    }

    if (c === CHAR_QUOTE || c === CHAR_APOS) {
      quote = c;
      pos++;
      continue;
    }

    if (c === CHAR_LBRACE) {
      braceDepth++;
      pos++;
      continue;
    }

    if (c === CHAR_RBRACE && braceDepth > 0) {
      braceDepth--;
      pos++;
      continue;
    }

    if (c === CHAR_GT && braceDepth === 0) {
      break;
    }

    pos++;
  }

  if (pos >= length) {
    return null;
  }

  const rawAttrs = code.slice(attrStart, pos);

  let attrEnd = rawAttrs.length;

  while (attrEnd > 0 && isSpace(rawAttrs, attrEnd - 1)) {
    attrEnd--;
  }

  const selfClosing =
    attrEnd > 0 &&
    rawAttrs.charCodeAt(attrEnd - 1) === CHAR_SLASH;

  const attrsWithoutSlash = selfClosing
    ? rawAttrs.slice(0, attrEnd - 1)
    : rawAttrs;

  const output = transformTag(
    originalTag,
    attrsWithoutSlash,
    classes,
    id,
    selfClosing
  );

  return {
    output,
    end: pos + 1
  };
}

// :::::: TAG TRANSFORMATION

function transformTag(tagName, attrs, classes, id, selfClosing) {
  const parts = [`<${tagName}`];

  if (classes) {
    parts.push(` class="${classes}"`);
  }

  if (id) {
    parts.push(` id="${id}"`);
  }

  transformAttributes(attrs, parts);

  // Preserve old behavior:
  // <img />  -> unchanged
  // <card /> -> <card></card>
  if (selfClosing) {
    if (isVoid(tagName)) {
      parts.push(' />');
      return parts.join('');
    }

    return `${parts.join('')}></${tagName}>`;
  }

  parts.push('>');

  return parts.join('');
}

// :::::: ATTRIBUTE TRANSFORMER

/**
 * Parse the attribute area once and emit:
 *
 * - on:event={expr}
 * - positional "value"
 * - positional 'value'
 * - [a,b]="value"
 * - ordinary HTML attributes unchanged
 *
 * Important: ordinary attributes are copied as faithfully as possible.
 */
function transformAttributes(attrs, parts) {
  const length = attrs.length;
  let pos = 0;
  let segmentStart = 0;

  while (pos < length) {
    const c = attrs.charCodeAt(pos);

    // Fast path:
    // most characters in attributes are ordinary chars.
    if (c !== CHAR_SPACE &&
        c !== CHAR_TAB &&
        c !== CHAR_NL &&
        c !== CHAR_CR) {
      pos++;
      continue;
    }

    const wsStart = pos;

    while (pos < length && isSpace(attrs, pos)) {
      pos++;
    }

    // Look ahead after whitespace.
    const next = attrs.charCodeAt(pos);

    // Positional argument:
    // <tag 'value'
    // <tag "value"
    //
    // The original regex distinguished this by requiring whitespace directly
    // before the quoted value.
    if (next === CHAR_QUOTE || next === CHAR_APOS) {
      if (segmentStart < wsStart) {
        parts.push(attrs.slice(segmentStart, wsStart));
      }

      const quote = next;
      const valueStart = pos + 1;

      pos = findQuotedEnd(attrs, valueStart, quote);

      // Unterminated quote: preserve the rest rather than corrupting it.
      if (pos === -1) {
        parts.push(attrs.slice(wsStart));
        return;
      }

      const value = attrs.slice(valueStart, pos);

      parts.push(' $attr="');
      parts.push(escapeAttr(value));
      parts.push('"');

      pos++;
      segmentStart = pos;
      continue;
    }

    // Check for [a,b]="value" beginning after whitespace.
    if (next === 91) { // [
      const multi = parseMultiAttr(attrs, pos);

      if (multi) {
        if (segmentStart < wsStart) {
          parts.push(attrs.slice(segmentStart, wsStart));
        }

        parts.push(' ');
        parts.push(multi.output);

        pos = multi.end;
        segmentStart = pos;
        continue;
      }
    }

    // Check for on:event={...}
    //
    // We only inspect after whitespace to keep the common path cheap.
    if (startsWithOnEvent(attrs, pos)) {
      if (segmentStart < wsStart) {
        parts.push(attrs.slice(segmentStart, wsStart));
      }

      const event = parseEventBinding(attrs, pos);

      if (event) {
        parts.push(' ');
        parts.push(event.output);

        pos = event.end;
        segmentStart = pos;
        continue;
      }
    }

    // Ordinary whitespace.
    // We do not emit yet; let the next recognized construct decide.
  }

  if (segmentStart < length) {
    parts.push(attrs.slice(segmentStart));
  }
}

function parseImplicitDivOpeningTag (code, start, hashPos) {
  const length = code.length;

  let pos = hashPos + 1;

  const idStart = pos;

  while (pos < length && isSelectorChar(code.charCodeAt(pos))) {
    pos++;
  }

  // <#> ist kein gültiger implicit-div tag.
  if (pos === idStart) {
    return null;
  }

  // Der erste #name ist die ID.
  const id = code.slice(idStart, pos);

  let classes = '';

  // Weitere .class / #id Selector
  while (pos < length) {
    const marker = code.charCodeAt(pos);

    if (marker !== CHAR_DOT && marker !== CHAR_HASH) {
      break;
    }

    pos++;

    const nameStart = pos;

    while (pos < length && isSelectorChar(code.charCodeAt(pos))) {
      pos++;
    }

    if (pos === nameStart) {
      pos--;
      break;
    }

    const name = code.slice(nameStart, pos);

    if (marker === CHAR_DOT) {
      classes += classes ? ` ${name}` : name;
    } else {
      // Gleiche Semantik wie bei normalen Tags:
      // letzter #name gewinnt.
      //
      // Da der implizite Tag bereits seine ID aus #app bekommen hat,
      // überschreibt ein weiterer #id diese.
      //
      // Dafür müssen wir später id neu setzen.
      return parseImplicitDivOpeningWithSelectors(
        code,
        start,
        id,
        classes,
        name,
        pos
      );
    }
  }

  return finishImplicitDivOpening(
    code,
    start,
    pos,
    id,
    classes
  );
}

// :::::: EVENT BINDING

function startsWithOnEvent(attrs, pos) {
  // Need at least:
  // on:x=
  if (
    attrs.charCodeAt(pos) !== 111 || // o
    attrs.charCodeAt(pos + 1) !== 110 || // n
    attrs.charCodeAt(pos + 2) !== CHAR_COLON
  ) {
    return false;
  }

  let p = pos + 3;
  const start = p;

  while (p < attrs.length) {
    const c = attrs.charCodeAt(p);

    if (
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122)
    ) {
      p++;
      continue;
    }

    break;
  }

  return p > start;
}

function parseEventBinding(attrs, start) {
  const length = attrs.length;

  let pos = start + 3;
  const eventStart = pos;

  while (pos < length) {
    const c = attrs.charCodeAt(pos);

    if (
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122)
    ) {
      pos++;
      continue;
    }

    break;
  }

  if (pos === eventStart) {
    return null;
  }

  const eventName = attrs.slice(eventStart, pos);

  while (pos < length && isSpace(attrs, pos)) {
    pos++;
  }

  if (attrs.charCodeAt(pos) !== CHAR_EQUAL) {
    return null;
  }

  pos++;

  while (pos < length && isSpace(attrs, pos)) {
    pos++;
  }

  if (attrs.charCodeAt(pos) !== CHAR_LBRACE) {
    return null;
  }

  const exprStart = pos + 1;
  pos++;

  // Parse balanced braces so expressions such as:
  //
  //   on:click={foo({ a: 1 })}
  //
  // are handled correctly.
  let depth = 1;
  let quote = 0;

  while (pos < length) {
    const c = attrs.charCodeAt(pos);

    if (quote) {
      if (c === quote) {
        quote = 0;
      } else if (c === 92) {
        // Backslash escape inside quoted strings.
        pos++;
      }

      pos++;
      continue;
    }

    if (c === CHAR_QUOTE || c === CHAR_APOS) {
      quote = c;
      pos++;
      continue;
    }

    if (c === CHAR_LBRACE) {
      depth++;
    } else if (c === CHAR_RBRACE) {
      depth--;

      if (depth === 0) {
        const expr = attrs.slice(exprStart, pos);

        return {
          output: `data-on-${eventName.toLowerCase()}="${escapeAttr(expr)}"`,
          end: pos + 1
        };
      }
    }

    pos++;
  }

  return null;
}

// :::::: MULTI ATTRIBUTE

function parseMultiAttr(attrs, start) {
  const length = attrs.length;
  let pos = start;

  if (attrs.charCodeAt(pos) !== 91) { // [
    return null;
  }

  pos++;

  const names = [];

  while (pos < length) {
    while (pos < length && isSpace(attrs, pos)) {
      pos++;
    }

    const nameStart = pos;

    while (pos < length) {
      const c = attrs.charCodeAt(pos);

      if (isNameChar(c)) {
        pos++;
        continue;
      }

      break;
    }

    if (pos === nameStart) {
      return null;
    }

    names.push(attrs.slice(nameStart, pos));

    while (pos < length && isSpace(attrs, pos)) {
      pos++;
    }

    const c = attrs.charCodeAt(pos);

    if (c === 44) { // ,
      pos++;
      continue;
    }

    if (c === 93) { // ]
      pos++;
      break;
    }

    return null;
  }

  if (!names.length) {
    return null;
  }

  while (pos < length && isSpace(attrs, pos)) {
    pos++;
  }

  if (attrs.charCodeAt(pos) !== CHAR_EQUAL) {
    return null;
  }

  pos++;

  while (pos < length && isSpace(attrs, pos)) {
    pos++;
  }

  const quote = attrs.charCodeAt(pos);

  if (quote !== CHAR_QUOTE && quote !== CHAR_APOS) {
    return null;
  }

  const valueStart = pos + 1;

  pos = findQuotedEnd(attrs, valueStart, quote);

  if (pos === -1) {
    return null;
  }

  const value = attrs.slice(valueStart, pos);

  const escapedValue = value;

  const output = names
    .map(name => `${name}=${normalizeQuote(escapedValue, String.fromCharCode(quote))}`)
    .join(' ');

  return {
    output,
    end: pos + 1
  };
}

// :::::: QUOTED VALUE SCANNER

function findQuotedEnd(str, start, quote) {
  let pos = start;
  const length = str.length;

  while (pos < length) {
    if (str.charCodeAt(pos) === quote) {
      return pos;
    }

    pos++;
  }

  return -1;
}
