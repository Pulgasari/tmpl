// tmpl.js — the browser runtime
//
// Pipeline:
//   1. preParse()          string shorthand -> parseable html
//   2. collectDefs()       pull out <tmpl> definitions into a registry
//   3. expand()            resolve custom tags (mappings, templates, div-fallback)
//   4. bindEvents()        wire up on:event handlers (render() only)
//
//   compile(src)         -> html string
//   render(src, target)  -> mounts into target and binds events

import { preParse } from './preparser.js';
import { VOID_TAGS, STANDARD_TAGS } from './meta.js';

// :::::: PUBLIC API

function compile (source) {
  const host = document.createElement('div');
  host.innerHTML = preParse(source);

  const defs = collectDefs(host);
  expand(host, defs);

  return host.innerHTML;
}

function render (source, target) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) throw new Error(`tmpl: mount target not found: ${target}`);
  el.innerHTML = compile(source);
  bindEvents(el);
  return el;
}

// :::::: AUTO-INIT & IN-PLACE SCRIPT REPLACEMENT

function processScriptNode (script) {
  const source = script.textContent;
  const host = document.createElement('div');
  host.innerHTML = preParse(source);

  const defs = collectDefs(host);
  expand(host, defs);
  bindEvents(host);

  const fragment = document.createDocumentFragment();
  while (host.firstChild) {
    fragment.appendChild(host.firstChild);
  }

  script.replaceWith(fragment);
}

function autoInit () {
  if (typeof document === 'undefined') return;

  // Added script[type="tmpl"] to supported selectors
  const selector = 'script[type="tmpl"], script[type="text/tmpl"]';
  document.querySelectorAll(selector).forEach(processScriptNode);
}


// Run automatically on load or immediately if DOM is already ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
}

// :::::: OPTIONAL WEB COMPONENT
//
// Keeps backward compatibility for <tmpl-root src="app.tmpl"> or <tmpl-root> wrappers.

class TmplRootElement extends HTMLElement {
  connectedCallback () {
    if (this.__mounted) return;
    this.__mounted = true;

    const src = this.getAttribute('src');
    if (src) {
      fetch(src)
        .then((r) => r.text())
        .then((text) => this.mount(text))
        .catch((err) => { this.innerHTML = `<pre>tmpl: failed to load ${src}\n${err}</pre>`; });
    } else {
      const script = this.querySelector('script[type="text/tmpl"], script[type="dsl"]');
      this.mount(script ? script.textContent : this.textContent);
    }
  }

  mount (source) {
    this.innerHTML = compile(source || '');
    bindEvents(this);
    this.dispatchEvent(new CustomEvent('tmpl:mounted', { bubbles: true }));
  }
}

function defineElement (name = 'tmpl-root') {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) {
    customElements.define(name, TmplRootElement);
  }
}

defineElement();

export { compile, render, autoInit, defineElement };
export default { compile, render, autoInit, defineElement };

// :::::: DEFINITIONS

function collectDefs (root) {
  const defs = new Map();

  root.querySelectorAll('tmpl').forEach((node) => {
    const tag = (node.getAttribute('tag') || '').toLowerCase();
    if (tag) {
      const is = node.getAttribute('is');
      if (is) {
        defs.set(tag, { kind: 'map', is, attr: node.getAttribute('attr') });
      } else {
        defs.set(tag, { kind: 'template', html: node.innerHTML });
      }
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
        if (def.kind === 'map') expandMapping(el, def);
        else                    expandTemplate(el, def);
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
  const nu = document.createElement(def.is);

  for (const attr of Array.from(el.attributes)) {
    if (attr.name === '$attr') {
      if (def.attr) nu.setAttribute(def.attr, attr.value);
      else          nu.appendChild(document.createTextNode(attr.value));
    } else {
      nu.setAttribute(attr.name, attr.value);
    }
  }

  if (!VOID_TAGS.has(def.is.toLowerCase())) {
    while (el.firstChild) nu.appendChild(el.firstChild);
  }

  el.replaceWith(nu);
}

function expandTemplate (el, def) {
  const holder = document.createElement('template');
  holder.innerHTML = substitute(def.html, el);
  el.replaceWith(holder.content);
}

function expandToDiv (el, tag) {
  const div = document.createElement('div');
  const existing = el.getAttribute('class');
  div.setAttribute('class', existing ? `${tag} ${existing}` : tag);

  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'class') continue;
    if (attr.name === '$attr') {
      div.appendChild(document.createTextNode(attr.value));
    } else {
      div.setAttribute(attr.name, attr.value);
    }
  }

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
    for (const attr of Array.from(el.attributes)) {
      if (!attr.name.startsWith('data-on-')) continue;

      const type = attr.name.slice('data-on-'.length);
      const body = attr.value;
      el.removeAttribute(attr.name);

      el.addEventListener(type, function (event) {
        try {
          // eslint-disable-next-line no-new-func — author-controlled template code
          new Function('event', 'el', body).call(el, event, el);
        } catch (err) {
          console.error(`tmpl: error in on:${type} handler`, err);
        }
      });
    }
  });
}
