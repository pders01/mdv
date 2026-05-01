/*
 * Client-side TUI-parity keymap for `mdv serve`.
 *
 * Mirrors src/input/keyboard.ts and src/input/pane-keyboard.ts: vim motions,
 * `/` search, `\` sidebar toggle, Tab/Ctrl-h/Ctrl-l pane focus.
 *
 * Pure DOM, no framework. Server-rendered HTML stays usable with JS off
 * (links still navigate); this script only adds keyboard ergonomics on top.
 */

(() => {
  "use strict";

  const body = document.body;
  const content = document.getElementById("content");
  const sidebar = document.getElementById("sidebar");
  const prose = document.getElementById("prose");
  const statusbar = document.getElementById("statusbar");
  const modeEl = document.getElementById("status-mode");
  const posEl = document.getElementById("status-pos");
  const notifyEl = document.getElementById("status-notify");
  const searchEl = document.getElementById("search");
  const searchInput = document.getElementById("search-input");
  const searchStatus = document.getElementById("search-status");

  // The sidebar is a WAI-ARIA tree: file rows are <li role="treeitem"> with
  // data-path; directory rows are also treeitems but without data-path so we
  // skip them when iterating selectable entries. The cursor / search state
  // lives on the <li> so CSS `parent[data-cursor] > .mdv-sidebar__entry`
  // selectors apply correctly. The <ul role="tree"> is the focusable element
  // and holds aria-activedescendant per the ARIA tree pattern.
  const sidebarTree = sidebar.querySelector(".mdv-sidebar__tree");
  const sidebarEntries = Array.from(sidebar.querySelectorAll(".mdv-sidebar__node--file"));

  // ============================== state ==============================

  /** "sidebar" | "content" — mirrors src/input/focus.ts */
  let focus = "content";
  let cursorIndex = sidebarEntries.findIndex((li) => li.getAttribute("aria-current") === "page");
  if (cursorIndex < 0) cursorIndex = 0;

  /** "normal" | "search" — visual line mode is intentionally not ported */
  let mode = "normal";

  /** g pending-prefix state for `gg` motion */
  let gPending = false;
  /** y pending-prefix state for `yy` motion */
  let yPending = false;

  /**
   * Active search target. Set when `/` opens the overlay, based on which
   * pane has focus. Determines which highlighter runs and which result set
   * `n`/`N` cycle through.
   */
  let searchTarget = "content"; // "content" | "sidebar"

  /** content-search state: <mark> elements wrapping matched text. */
  let searchHits = [];
  let activeHit = -1;
  /** sidebar-search state: indices into `sidebarEntries` of matching rows. */
  let sidebarMatches = [];
  let activeSidebarMatch = -1;
  let lastQuery = "";

  let notifyTimer = null;

  // ============================== utilities ==============================

  function setMode(next) {
    mode = next;
    statusbar.classList.remove("mode-search", "mode-visual");
    if (next === "search") {
      statusbar.classList.add("mode-search");
      modeEl.textContent = "SEARCH";
    } else {
      modeEl.textContent = "NORMAL";
    }
  }

  function setFocus(next) {
    focus = next;
    body.classList.remove("mdv--sidebar", "mdv--content");
    body.classList.add(`mdv--${next}`);
    // Sidebar focus lands on the inner <ul role="tree"> (ARIA-correct),
    // content focus lands on the <main>. Both carry tabindex="0".
    if (next === "sidebar") sidebarTree?.focus();
    else content.focus();
    paintCursor();
  }

  function notify(msg, ms = 1500) {
    notifyEl.textContent = msg;
    if (notifyTimer) clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      notifyEl.textContent = "";
    }, ms);
  }

  function paintCursor() {
    sidebarEntries.forEach((li, i) =>
      li.toggleAttribute("data-cursor", focus === "sidebar" && i === cursorIndex),
    );
    const active = sidebarEntries[cursorIndex];
    if (active) {
      // aria-activedescendant points the screen reader at the visual cursor
      // even though we don't move real focus per row. The sidebar container
      // owns the focus; AT announces the descendant by id.
      sidebarTree?.setAttribute("aria-activedescendant", active.id);
      if (focus === "sidebar") active.scrollIntoView({ block: "nearest" });
    }
  }

  function updatePos() {
    if (focus !== "content") {
      posEl.textContent = `${sidebarEntries.length} files`;
      return;
    }
    const total = Math.max(1, content.scrollHeight - content.clientHeight);
    const pct = total > 0 ? Math.round((content.scrollTop / total) * 100) : 0;
    posEl.textContent = `${pct}%`;
  }
  content.addEventListener("scroll", updatePos, { passive: true });

  // ============================== motions ==============================

  function viewportPx() {
    return content.clientHeight;
  }

  function scrollBy(amount, smooth = false) {
    content.scrollTo({
      top: content.scrollTop + amount,
      behavior: smooth ? "smooth" : "instant",
    });
  }

  function scrollTo(top, smooth = false) {
    content.scrollTo({ top, behavior: smooth ? "smooth" : "instant" });
  }

  // Approximate "one line" — use line-height of prose as the unit so j/k feel
  // proportional to the rendered text rather than hard-coded pixels.
  function lineHeight() {
    const cs = getComputedStyle(prose);
    const lh = parseFloat(cs.lineHeight);
    return Number.isFinite(lh) && lh > 0 ? lh : 24;
  }

  function moveContent(delta) {
    scrollBy(delta * lineHeight());
  }

  // ============================== sidebar nav ==============================

  function moveSidebar(delta) {
    if (sidebarEntries.length === 0) return;
    cursorIndex = (cursorIndex + delta + sidebarEntries.length) % sidebarEntries.length;
    paintCursor();
  }

  function openSidebarSelection() {
    const entry = sidebarEntries[cursorIndex];
    if (!entry) return;
    const link = entry.querySelector("a.mdv-sidebar__entry");
    if (link) window.location.assign(link.href);
  }

  // ============================== sidebar toggle ==============================

  function toggleSidebar() {
    body.classList.toggle("no-sidebar");
    if (body.classList.contains("no-sidebar") && focus === "sidebar") setFocus("content");
  }

  // ============================== yank ==============================

  async function yank(text) {
    try {
      await navigator.clipboard.writeText(text);
      notify("Yanked");
    } catch {
      notify("Yank failed (clipboard unavailable)", 2500);
    }
  }

  function yankVisibleLine() {
    // Approximation: find the element nearest the top of the viewport and
    // yank its trimmed textContent. Cheaper and closer to TUI semantics than
    // building an actual line-buffer model in the DOM.
    const viewportTop = content.scrollTop + 8;
    let nearest = null;
    let bestDelta = Infinity;
    for (const el of prose.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, pre, blockquote")) {
      const top = el.offsetTop;
      const delta = Math.abs(top - viewportTop);
      if (delta < bestDelta) {
        bestDelta = delta;
        nearest = el;
      }
    }
    if (nearest) yank(nearest.textContent.trim());
    else notify("Nothing to yank");
  }

  // ============================== search ==============================

  /** Clear all search state for whichever target is currently active. */
  function clearSearch() {
    clearContentHits();
    clearSidebarHits();
    searchStatus.textContent = "";
  }

  function clearContentHits() {
    for (const hit of searchHits) {
      const parent = hit.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(hit.textContent), hit);
      parent.normalize();
    }
    searchHits = [];
    activeHit = -1;
  }

  function clearSidebarHits() {
    for (const a of sidebarEntries) a.removeAttribute("data-match");
    sidebarMatches = [];
    activeSidebarMatch = -1;
  }

  /** Run the search for whichever target is currently active. */
  function performSearch(query) {
    if (searchTarget === "sidebar") return highlightSidebar(query);
    return highlightContent(query);
  }

  function highlightSidebar(query) {
    clearSidebarHits();
    if (!query) {
      searchStatus.textContent = "";
      return;
    }
    const lower = query.toLowerCase();
    for (let i = 0; i < sidebarEntries.length; i++) {
      const path = sidebarEntries[i].dataset.path || sidebarEntries[i].textContent || "";
      if (path.toLowerCase().includes(lower)) {
        sidebarEntries[i].setAttribute("data-match", "");
        sidebarMatches.push(i);
      }
    }
    if (sidebarMatches.length === 0) {
      searchStatus.textContent = "no matches";
      return;
    }
    activeSidebarMatch = 0;
    cursorIndex = sidebarMatches[0];
    paintCursor();
    searchStatus.textContent = `${activeSidebarMatch + 1}/${sidebarMatches.length}`;
  }

  function highlightContent(query) {
    clearContentHits();
    if (!query) return;
    const lower = query.toLowerCase();

    const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest("pre")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);

    for (const node of targets) {
      const text = node.nodeValue;
      const lowerText = text.toLowerCase();
      let from = 0;
      let idx;
      const fragments = [];
      while ((idx = lowerText.indexOf(lower, from)) !== -1) {
        if (idx > from) fragments.push(document.createTextNode(text.slice(from, idx)));
        const mark = document.createElement("mark");
        mark.className = "mdv-hit";
        mark.textContent = text.slice(idx, idx + query.length);
        fragments.push(mark);
        searchHits.push(mark);
        from = idx + query.length;
      }
      if (fragments.length) {
        if (from < text.length) fragments.push(document.createTextNode(text.slice(from)));
        const parent = node.parentNode;
        for (const f of fragments) parent.insertBefore(f, node);
        parent.removeChild(node);
      }
    }

    if (searchHits.length === 0) {
      searchStatus.textContent = "no matches";
      return;
    }
    activeHit = 0;
    focusActiveHit();
  }

  function focusActiveHit() {
    searchHits.forEach((h, i) => h.classList.toggle("mdv-hit--active", i === activeHit));
    const hit = searchHits[activeHit];
    if (hit) hit.scrollIntoView({ block: "center" });
    searchStatus.textContent = `${activeHit + 1}/${searchHits.length}`;
  }

  /** Cycle to the next match in whichever target search is active for. */
  function nextHit() {
    if (searchTarget === "sidebar") return cycleSidebar(1);
    if (!searchHits.length) return;
    activeHit = (activeHit + 1) % searchHits.length;
    focusActiveHit();
  }
  function prevHit() {
    if (searchTarget === "sidebar") return cycleSidebar(-1);
    if (!searchHits.length) return;
    activeHit = (activeHit - 1 + searchHits.length) % searchHits.length;
    focusActiveHit();
  }

  function cycleSidebar(delta) {
    if (!sidebarMatches.length) return;
    activeSidebarMatch =
      (activeSidebarMatch + delta + sidebarMatches.length) % sidebarMatches.length;
    cursorIndex = sidebarMatches[activeSidebarMatch];
    paintCursor();
    searchStatus.textContent = `${activeSidebarMatch + 1}/${sidebarMatches.length}`;
  }

  function openSearch() {
    // Pick target at open time based on which pane has focus. Sticky for the
    // duration of this search session (n/N cycle within target).
    searchTarget = focus === "sidebar" ? "sidebar" : "content";
    setMode("search");
    searchEl.hidden = false;
    searchInput.value = lastQuery;
    searchInput.focus();
    searchInput.select();
    // Run an initial highlight so opening with a remembered query shows
    // matches without the user re-typing.
    if (lastQuery) performSearch(lastQuery);
  }
  function closeSearch(commit) {
    if (commit) lastQuery = searchInput.value;
    // Explicitly blur before hiding: in some browsers, hiding a focused
    // input doesn't move focus, which means subsequent keydowns hit the
    // input target and our document-level handler short-circuits on the
    // HTMLInputElement check — n/N would get silently swallowed.
    searchInput.blur();
    searchEl.hidden = true;
    setMode("normal");
    // Return focus to the pane that owned the search.
    if (searchTarget === "sidebar") sidebar.focus();
    else content.focus();
  }

  searchInput.addEventListener("input", () => performSearch(searchInput.value));
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      closeSearch(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      clearSearch();
      closeSearch(false);
    }
  });

  // ============================== global keys ==============================

  // Map of single-press, no-modifier keys to actions for the active focus.
  // Anything that should consume the event MUST return true so we can
  // preventDefault and avoid the browser doing something weird (e.g., `/`
  // triggering Firefox quick-find).
  function handleNormal(e) {
    const k = e.key;
    const ctrl = e.ctrlKey;
    const shift = e.shiftKey;

    // gg motion: two-press prefix
    if (k === "g" && !ctrl && !shift) {
      if (gPending) {
        gPending = false;
        if (focus === "content") scrollTo(0);
        else {
          cursorIndex = 0;
          paintCursor();
        }
        return true;
      }
      gPending = true;
      // gPending auto-clears on next non-g key
      return true;
    }
    if (gPending) gPending = false;

    // yy motion: two-press prefix (content focus only)
    if (k === "y" && !ctrl && !shift && focus === "content") {
      if (yPending) {
        yPending = false;
        yankVisibleLine();
        return true;
      }
      yPending = true;
      return true;
    }
    if (yPending && k !== "y") yPending = false;

    // Pane switching
    if (k === "Tab") {
      setFocus(focus === "content" ? "sidebar" : "content");
      return true;
    }
    if (ctrl && k === "h") {
      setFocus("sidebar");
      return true;
    }
    if (ctrl && k === "l") {
      setFocus("content");
      return true;
    }

    if (k === "\\") {
      toggleSidebar();
      return true;
    }

    if (k === "Escape") {
      clearSearch();
      return true;
    }

    if (k === "/") {
      openSearch();
      return true;
    }

    if (k === "n" && !ctrl) {
      if (shift) prevHit();
      else nextHit();
      return true;
    }
    if (k === "N" && !ctrl) {
      prevHit();
      return true;
    }

    // Focus-specific motions. Vim keys plus arrow / Home / End / PageUp /
    // PageDown aliases so users who reach for the standard navigation keys
    // (a colleague's first instinct on the TUI) get the same behavior
    // without learning the vim subset.
    if (focus === "sidebar") {
      if (k === "j" || k === "ArrowDown") return (moveSidebar(1), true);
      if (k === "k" || k === "ArrowUp") return (moveSidebar(-1), true);
      if (k === "Home") {
        cursorIndex = 0;
        paintCursor();
        return true;
      }
      if (k === "End" || (k === "G" && shift)) {
        cursorIndex = sidebarEntries.length - 1;
        paintCursor();
        return true;
      }
      if (k === "Enter") return (openSidebarSelection(), true);
      return false;
    }

    // content focus
    if (k === "j" || k === "ArrowDown") return (moveContent(1), true);
    if (k === "k" || k === "ArrowUp") return (moveContent(-1), true);
    if (k === "Home") return (scrollTo(0), true);
    if (k === "End" || (k === "G" && shift)) return (scrollTo(content.scrollHeight), true);
    if ((ctrl && k === "d") || (k === "PageDown" && shift))
      return (scrollBy(viewportPx() / 2), true);
    if ((ctrl && k === "u") || (k === "PageUp" && shift))
      return (scrollBy(-viewportPx() / 2), true);
    if ((ctrl && k === "f") || k === "PageDown") return (scrollBy(viewportPx()), true);
    if ((ctrl && k === "b") || k === "PageUp") return (scrollBy(-viewportPx()), true);

    return false;
  }

  document.addEventListener("keydown", (e) => {
    // Don't hijack typing in inputs (search field has its own handler)
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    // Leave Cmd/Meta combos alone — that's the user's OS, not ours.
    if (e.metaKey) return;

    if (mode === "search") {
      if (e.key === "Escape") {
        clearSearch();
        closeSearch(false);
        e.preventDefault();
      }
      return;
    }

    if (handleNormal(e)) e.preventDefault();
  });

  // Click an entry → server navigation (default <a> behavior). We just keep
  // the cursor index in sync if user clicks something.
  for (let i = 0; i < sidebarEntries.length; i++) {
    sidebarEntries[i].addEventListener("click", () => {
      cursorIndex = i;
    });
  }

  // Sync internal focus state when focus arrives via Tab or click rather
  // than our own setFocus() — keeps body class and JS state correct so the
  // keymap routes to the right pane regardless of how focus moved.
  sidebarTree?.addEventListener("focus", () => {
    if (focus !== "sidebar") setFocus("sidebar");
  });
  content.addEventListener("focus", () => {
    if (focus !== "content") setFocus("content");
  });

  // ============================== live reload ==============================

  // State preservation across live reloads. Only saved when our own
  // WebSocket triggers reload — ordinary browser refresh and navigation
  // get the default top-of-page behavior. Path-scoped so reloading file A
  // doesn't restore A's scroll position when the user navigates to file B.
  const RELOAD_STATE_KEY = "mdv:reload-state:" + location.pathname;

  function captureReloadState() {
    try {
      sessionStorage.setItem(
        RELOAD_STATE_KEY,
        JSON.stringify({
          scroll: content.scrollTop,
          cursor: cursorIndex,
          focus,
        }),
      );
    } catch {
      // Storage might be disabled or full — fall back to a plain reload.
    }
  }

  /** True when boot is restoring state from a live reload, false otherwise. */
  function restoreReloadState() {
    let raw;
    try {
      raw = sessionStorage.getItem(RELOAD_STATE_KEY);
      if (raw) sessionStorage.removeItem(RELOAD_STATE_KEY);
    } catch {
      return false;
    }
    if (!raw) return false;
    let state;
    try {
      state = JSON.parse(raw);
    } catch {
      return false;
    }
    if (typeof state.scroll === "number") {
      restoreScrollPosition(state.scroll);
    }
    if (
      typeof state.cursor === "number" &&
      state.cursor >= 0 &&
      state.cursor < sidebarEntries.length
    ) {
      cursorIndex = state.cursor;
    }
    if (state.focus === "sidebar" || state.focus === "content") {
      setFocus(state.focus);
    }
    return true;
  }

  /**
   * Restore scroll position robustly across two layout phases:
   *   - double-rAF lands the scroll once initial text layout commits
   *   - re-assigning after every <img> in the prose finishes loading
   *     handles image-heavy pages whose final scrollHeight grows past
   *     what the first attempt could see
   */
  function restoreScrollPosition(target) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        content.scrollTop = target;
      });
    });
    const pending = Array.from(prose.querySelectorAll("img")).filter((img) => !img.complete);
    if (pending.length === 0) return;
    Promise.all(
      pending.map(
        (img) =>
          new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          }),
      ),
    ).then(() => {
      content.scrollTop = target;
    });
  }

  // Connect to /_ws when the server is running with --watch. The server
  // broadcasts {"type":"reload"} on every debounced fs change; we capture
  // a small slice of UI state, then location.reload(). The boot phase
  // restores state when sessionStorage shows we just came from a live
  // reload. Reconnects with capped exponential backoff so dev-server
  // restarts heal themselves silently.
  // Cap reconnect attempts so a server that's permanently rejecting the
  // upgrade (or a stale tab against a long-gone dev server) doesn't loop
  // forever. With max delay 30s and 20 attempts the page will keep trying
  // for ~10 minutes total, then give up with a notice. `attempts` resets
  // on each successful open, so a transient drop doesn't burn the budget.
  const MAX_RECONNECT_ATTEMPTS = 20;

  function startLiveReload() {
    let attempts = 0;
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/_ws`);
      ws.addEventListener("open", () => {
        attempts = 0;
      });
      ws.addEventListener("message", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "reload") {
            captureReloadState();
            location.reload();
          }
        } catch {
          // Ignore malformed messages — the server only sends one shape.
        }
      });
      ws.addEventListener("close", () => {
        attempts += 1;
        if (attempts > MAX_RECONNECT_ATTEMPTS) {
          notify("Live reload disconnected — refresh manually", 5000);
          return;
        }
        const delay = Math.min(30000, 500 * 2 ** Math.min(attempts, 6));
        setTimeout(connect, delay);
      });
    };
    connect();
  }

  // ============================== boot ==============================

  setFocus("content");
  setMode("normal");
  paintCursor();
  updatePos();

  // Restore live-reload state before live-reload setup runs so we don't
  // race with another reload-triggered overwrite of the saved state.
  // Skip the help notification when we just came from a reload — the user
  // already knows the keys; flashing it on every save is noise.
  const restoredFromReload = restoreReloadState();
  if (!restoredFromReload) {
    notify("j/k scroll · Tab pane · / search · \\ sidebar", 2500);
  }

  if (body.dataset.watch === "on") startLiveReload();
})();
