# Code blocks

Inline `code` and ``code with `backticks` inside``.

Plain fence:

```
plain text
no language
```

TypeScript:

```ts
interface Foo {
  bar: string;
  baz?: number;
}

const f: Foo = { bar: "hello" };
console.log(f.bar);
```

JavaScript:

```js
function add(a, b) {
  return a + b;
}
```

Bash:

```bash
echo "hello"
ls -la
```

Indented code block (4-space indent):

    line one
    line two
        deeper

Empty fence:

```
```

Fence with HTML in content:

```html
<div class="foo">
  <span>text</span>
</div>
```

Tilde fence:

~~~
tilde fence content
~~~

Fence with info string after lang:

```ts highlight=2
const x = 1;
const y = 2;
```
