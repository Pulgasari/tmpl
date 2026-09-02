# tmpl :: spec

A tiny client-side preprocessor that turns terse, custom-tag markup into real
HTML. No build step — it runs in the browser.

live-preview: http://code.pulgasari.dev/tmpl/

## use it in the browser

```html
<script type="module" src="./lib/tmpl.js"></script>

<!-- inline: works from file:// too -->
<script type='tmpl'>
  <tmpl tag='btn' is='button' />

  <#app>
    <grid>
      <card>hello</card>
      <btn.primary 'click me' on:click={alert('moin!')} />
    </grid>
  </#app>
</script>
```

`index.html` is a full self-contained showcase (hero, components and a live
playground) — open it directly in a browser.

## spec

- native html-tags work normally
- webcomponents as well
- one could use custom-tags with or without explicitly defining them
- if they weren't specified they simply become a div with a className of the custom-tag-name
- shorthand `#id`
- shorthand `.class1.class2`

## undefined custom-tags

```xml
<box>
  <card>...</card>
  <card>...</card>
</box>
```

an undefined custom tag evaluates to a `<div>` with a className of that tagName.

```xml
<div class='box'>
  <div class='card'>...</div>
  <div class='card'>...</div>
</div>
```

## define custom-tags by shorthand mapping

```html
<tmpl tag='btn'  is='button' />
<tmpl tag='href' is='a'      attr='href' />
<tmpl tag='pic'  is='image'  attr='src'  />
```

```xml
<href 'https://example.com' />
<btn.primary 'click me!' on:click={alert('moin!')} />
<pic 'https://example.tld/sky.jpg' />
```

## define custom-tags by template

refer to an custom-tag-attribute with `$attr`.

```html
<tmpl tag='track'>
  <div class='track'>
    <img src='./$title.jpg' />
    <audio src='./$title.mp3' />
  </div>
</tmpl>
```

```html
<track title='example1' />
<track title='example2' />
```

or use even `$attr`:

```html
<tmpl tag='track'>
  <div class='track'>
    <img src='./$attr.jpg' />
    <audio src='./$attr.mp3' />
  </div>
</tmpl>
```

```html
<track 'example1' />
<track 'example2' />
```

