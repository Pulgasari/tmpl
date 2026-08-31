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

export { compile, render, defineElement };
export default { compile, render, defineElement };

// :::::: WEB COMPONENT
//
// <tmpl-root src="app.tmpl">                 loads external tmpl (needs a server)
// <tmpl-root><script type="text/tmpl">…       inline tmpl, works from file:// too
//
// The browser parses real DOM eagerly, which would mangle tmpl shorthands
// (positional strings, on:event, [a,b]=…). So the source has to reach us as
// raw *text* — either an external file or an inner <script type="text/tmpl">.
// The element then replaces the manual render() call: it self-upgrades.

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
      const script = this.querySelector('script[type="text/tmpl"], template.tmpl');
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

// Auto-register on import so dropping <tmpl-root> on a page just works.
defineElement();

// :::::: DEFINITIONS

// Collect every <tmpl> element into a registry and remove it from the tree.
//   <tmpl tag='btn' is='button' />          -> mapping
//   <tmpl tag='pic' is='img' attr='src' />  -> mapping w/ positional target
//   <tmpl tag='card'>…</tmpl>               -> template
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

  // Templates can introduce fresh custom tags, so keep sweeping until the tree
  // stops changing (or we hit the safety guard).
  for (let changed = true; changed && guard < 100; guard++) {
    changed = false;

    for (const el of Array.from(root.querySelectorAll('*'))) {
      const tag = el.tagName.toLowerCase();

      if (tag === 'tmpl') {                 // stray definition
        el.remove();
        changed = true;
      } else if (defs.has(tag)) {           // defined custom tag
        const def = defs.get(tag);
        if (def.kind === 'map') expandMapping(el, def);
        else                    expandTemplate(el, def);
        changed = true;
      } else if (STANDARD_TAGS.has(tag) || tag.includes('-')) {
        // real html or a web component (dash) -> leave it alone
        continue;
      } else {                              // undefined custom tag -> <div>
        expandToDiv(el, tag);
        changed = true;
      }
    }
  }
}

// <btn.primary 'hi'>  with  <tmpl tag='btn' is='button' />
//   -> <button class="primary">hi</button>
// <pic 'sky.jpg'>     with  <tmpl tag='pic' is='img' attr='src' />
//   -> <img src="sky.jpg">
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

// <track title='song1'> with a <tmpl tag='track'> body -> the substituted body.
// Placeholders: $attr -> the positional value, $foo -> the `foo` attribute.
function expandTemplate (el, def) {
  const holder = document.createElement('template');
  holder.innerHTML = substitute(def.html, el);
  el.replaceWith(holder.content);
}

// <box><card/></box> -> <div class="box"><div class="card"></div></div>
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

// Replace $placeholders inside a template body using the host element's attrs.
function substitute (html, el) {
  return html.replace(/\$([a-zA-Z_][\w-]*)/g, (_, name) => {
    const value = name === 'attr' ? el.getAttribute('$attr') : el.getAttribute(name);
    return value == null ? '' : value;
  });
}

// :::::: EVENTS

// Turn data-on-<event>="expr" (produced by the preparser from on:event={expr})
// into real listeners. `event` and `el` are available inside the expression.
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
