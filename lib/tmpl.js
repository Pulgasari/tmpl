// tmpl.js — lightweight runtime for script-based DSL templates
//
// Pipeline:
//   1. preParse()          string shorthand -> parseable html
//   2. collectDefs()       pull out <tmpl> definitions into a registry
//   3. expand()            resolve custom tags (mappings, templates, div-fallback)
//   4. bindEvents()        wire up on:event handlers
//
//   compile(src)         -> html string
//   render(src, target)  -> mounts into target and binds events
//   autoInit()           -> processes all <script type="tmpl"> tags in-place

import { preParse } from './preparser2.js';
import { VOID_TAGS, STANDARD_TAGS } from './meta.js';

// :::::: HELPERS

const dom = {};

dom.attrOf = (spec)          => Array.from(spec.attributes),
dom.text   = (str)           => document.createTextNode(String(str));
dom.get    = (spec)          => (typeof spec === 'string') ? document.querySelector(selector) : spec;     
dom.list   = (spec)          => Array.from(document.querySelectorAll(spec));
dom.each   = (spec, fn)      => document.querySelectorAll(spec).forEach(fn);
dom.create = (tag, props)    => Object.assign(document.createElement(tag ?? 'div'), props);
dom.on     = (el, event, fn) => (el ?? document).addEventListener(event, fn);

dom.body = document.body;
dom.head = document.head;
dom.root = document.documentElement;

// :::::: PUBLIC API

function compile (source) {
  const host = dom.create('div', { innerHTML: preParse(source) });
  const defs = collectDefs(host);
  expand(host, defs);

  return host.innerHTML;
}

function render (source, target) {
  const el = dom.get(target); if (!el) throw new Error(`tmpl: mount target not found: ${target}`);
  el.innerHTML = compile(source);
  bindEvents(el);
  return el;
}

// :::::: AUTO-INIT & IN-PLACE REPLACEMENT

function processScriptNode (script) {
  const source = script.textContent;
  const host   = dom.create('div', { innerHTML: preParse(source) });
  const defs   = collectDefs(host);
  expand(host, defs);
  bindEvents(host);

  const fragment = document.createDocumentFragment();
  while (host.firstChild) fragment.appendChild(host.firstChild);

  script.replaceWith(fragment);
}

function autoInit () {
  if (typeof document === 'undefined') return;

  const selector = 'script[type="tmpl"], script[type="text/tmpl"]';
  dom.each(selector, processScriptNode);
}

// Auto-run on load or immediately if DOM is already ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    dom.on('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
}

export         { compile, render, autoInit };
export default { compile, render, autoInit };

// :::::: DEFINITIONS

function collectDefs (root) {
  const defs = new Map;

  root.querySelectorAll('tmpl').forEach((node) => {
    const tag = (node.getAttribute('tag') || '').toLowerCase();
    if (tag) {
      const is = node.getAttribute('is');
      if (is) defs.set(tag, { kind: 'map', is, attr: node.getAttribute('attr') });
      else    defs.set(tag, { kind: 'template', html: node.innerHTML });
    }
    node.remove();
  });

  return defs;
}

// :::::: EXPANSION

function expand (root, defs) {
  let guard = 0;

  for (let changed = true; changed && guard < 100; guard++) {
    changed = false;

    for (const el of Array.from(root.querySelectorAll('*'))) {
      const tag = el.tagName.toLowerCase();

      if (tag === 'tmpl') {
        el.remove();
        changed = true;
      } else if (defs.has(tag)) {
        const def = defs.get(tag);
        if (def.kind === 'map') expandMapping  (el, def);
        else                    expandTemplate (el, def);
        changed = true;
      } else if (STANDARD_TAGS.has(tag) || tag.includes('-')) {
        continue;
      } else {
        expandToDiv(el, tag);
        changed = true;
      }
    }
  }
}

function expandMapping (el, def) {
  const nu = dom.create(def.is);

  for (const { name, value } of Array.from(el.attributes)) {
    if (attr.name === '$attr') {
      if (def.attr) nu.setAttribute(def.attr, value);
      else          nu.appendChild(dom.text(value));
    }
    else nu.setAttribute(name, value);
  }

  if (!VOID_TAGS.has(def.is.toLowerCase())) {
    while (el.firstChild) nu.appendChild(el.firstChild);
  }

  el.replaceWith(nu);
}

function expandTemplate (el, def) {
  const holder = dom.create('template', { innerHTML: substitute(def.html, el) });
  el.replaceWith(holder.content);
}

function expandToDiv (el, tag) {
  const div      = dom.create('div');
  const existing = el.getAttribute('class');
  div.setAttribute('class', existing ? `${tag} ${existing}` : tag);

  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'class') continue;
    if (attr.name === '$attr') {
      div.appendChild(dom.text(attr.value));
    } else {
      div.setAttribute(attr.name, attr.value);
    }
  }

  /*
  for (const { name, value } of dom.attrOf(el)) switch (name) {
    case 'class' : continue;
    case '$attr' : div.appendChild(dom.text(value));
    default      : div.setAttribute(name, value);
  }
  */

  while (el.firstChild) div.appendChild(el.firstChild);
  el.replaceWith(div);
}

function substitute (html, el) {
  return html.replace(/\$([a-zA-Z_][\w-]*)/g, (_, name) => {
    const value = name === 'attr' ? el.getAttribute('$attr') : el.getAttribute(name);
    return value == null ? '' : value;
  });
}

// :::::: EVENTS

function bindEvents (scope) {
  scope.querySelectorAll('*').forEach((el) => {
    for (const attr of dom.attrOf(el)) {
      if (!attr.name.startsWith('data-on-')) continue;

      const type = attr.name.slice('data-on-'.length);
      const body = attr.value;
      el.removeAttribute(attr.name);

      dom.on(el, type, function (event) {
        // eslint-disable-next-line no-new-func — author-controlled template code
        try         { new Function('event', 'el', body).call(el, event, el); }
        catch (err) { console.error(`tmpl: error in on:${type} handler`, err); }
      });
    }
  });
}
