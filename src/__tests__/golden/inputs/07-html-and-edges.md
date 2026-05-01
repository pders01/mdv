# HTML and edge cases

Block HTML:

<div class="custom">
  <p>Inside HTML</p>
</div>

Inline HTML: this <span style="color:red">word</span> is red.

HTML entities: &copy; &amp; &lt; &gt; &nbsp; &#35; &#x22; &AElig;.

Invalid entities: &madeup; &copy (no semi).

Backslash escapes: \* \_ \[ \] \( \) \\ \` \! \# \+.

Horizontal rules:

---

***

___

Empty line behavior:

Para one.



Para two (after multiple blank lines).

Inline link with title containing entities: [foo](url "title with &copy; entity").

Link with parens in URL: [link](https://example.com/(group)/x).

Link with bracket in label: [foo \[bar\]](url).

Code span with leading/trailing space: ` code `.

Code span with backtick: `` ` ``.

Reference at end of doc:

[ref-end]: https://example.com/end
