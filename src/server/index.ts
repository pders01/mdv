/**
 * `mdv serve` HTTP server.
 *
 * Bun.serve replaces md's Express setup. Same goals as the old md package —
 * render markdown, list directories, serve static assets — but on the same
 * Shiki + marked + scanDirectory plumbing the TUI uses, so theming, exclude
 * rules, and parser version stay in lockstep across both modes.
 *
 * Code-block extensions (mermaid, future PlantUML/math/etc.) plug in via
 * the CodeAdapterRegistry. Each adapter declares its supported langs, its
 * render output, and any static assets the server should expose under
 * /_static. The server route layer stays ignorant of any specific adapter.
 */

import { basename, dirname, join, resolve, relative, sep } from "path";
import type { BundledTheme } from "shiki";

import type { CliArgs } from "../cli.js";
import { scanDirectory, type FileTree } from "../fs/tree.js";
import { createHighlighterInstance, type HighlighterInstance } from "../highlighting/shiki.js";
import { extractThemeColors } from "../theme/index.js";

import { createMarkdown } from "./html.js";
import { renderSidebar } from "./sidebar.js";
import { themeColorsToCss } from "./theme-vars.js";
import { CodeAdapterRegistry } from "./adapters/index.js";
import { createShikiAdapter } from "./adapters/shiki.js";
import { createMermaidAdapter } from "./adapters/mermaid.js";
import { escapeHtml, escapeAttr } from "../util/escape.js";
import { printBanner, logAccess } from "./log.js";
import { startWatching } from "./watch.js";

import type { ServerWebSocket } from "bun";

const WS_PATH = "/_ws";

// Page assets are imported as files so Bun embeds them in `--compile`
// binaries. Resolving via import.meta.dir works in dev but yields empty
// strings in compiled mode because the source tree isn't on disk.
import templatePath from "./assets/template.html" with { type: "file" };
import appCssPath from "./assets/app.css" with { type: "file" };
import clientJsPath from "./assets/client.js" with { type: "file" };

interface ServerContext {
  rootDir: string;
  rootIsDirectory: boolean;
  singleFilePath: string | null;
  highlighter: HighlighterInstance;
  themeCss: string;
  template: string;
  appCss: string;
  clientJs: string;
  registry: CodeAdapterRegistry;
  /** One Marked instance for the lifetime of the server — stateless between requests. */
  marked: ReturnType<typeof createMarkdown>;
  excludes: string[];
  headAssets: string;
  bodyAssets: string;
  staticAssets: Record<string, string>;
  quiet: boolean;
  debug: boolean;
  watch: boolean;
  /** Connected WebSocket clients for live reload broadcasts. */
  clients: Set<ServerWebSocket<unknown>>;
}

export async function startServer(args: CliArgs): Promise<void> {
  if (!args.filePath) {
    console.error("mdv serve: missing path argument");
    console.error("Usage: mdv serve [options] <file-or-directory>");
    process.exit(1);
  }

  const targetPath = resolve(args.filePath);
  const stat = await Bun.file(targetPath).stat().catch(() => null);
  if (!stat) {
    console.error(`mdv serve: path not found: ${targetPath}`);
    process.exit(1);
  }
  const rootIsDirectory = stat.isDirectory();
  const rootDir = rootIsDirectory ? targetPath : dirname(targetPath);
  const singleFilePath = rootIsDirectory ? null : targetPath;

  const highlighter = await createHighlighterInstance(args.theme);
  const themeColors = extractThemeColors(highlighter.highlighter, args.theme as BundledTheme);
  highlighter.colors = themeColors;
  const themeCss = themeColorsToCss(themeColors);

  // Order matters: specific-language adapters register first so they win
  // over the default Shiki adapter when a fence claims their lang.
  const registry = new CodeAdapterRegistry();
  if (!args.noMermaid) {
    registry.register(createMermaidAdapter({ themeName: args.theme }));
  }
  registry.register(createShikiAdapter(highlighter));

  const [template, appCss, clientJs] = await Promise.all([
    Bun.file(templatePath).text(),
    Bun.file(appCssPath).text(),
    Bun.file(clientJsPath).text(),
  ]);

  const ctx: ServerContext = {
    rootDir,
    rootIsDirectory,
    singleFilePath,
    highlighter,
    themeCss,
    template,
    appCss,
    clientJs,
    registry,
    marked: createMarkdown(registry),
    excludes: args.exclude,
    headAssets: registry.collectHeadAssets(),
    bodyAssets: registry.collectBodyAssets(),
    staticAssets: registry.collectStaticAssets(),
    quiet: args.quiet,
    debug: args.debug,
    watch: args.watch,
    clients: new Set(),
  };

  const server = Bun.serve({
    port: args.port,
    hostname: args.host,
    fetch: (req, srv) => {
      // Live-reload WebSocket upgrade is the only non-HTTP path. Everything
      // else funnels through handleAndLog so it shows up in the access log.
      const url = new URL(req.url);
      if (url.pathname === WS_PATH) {
        if (srv.upgrade(req)) return undefined;
        return new Response("Expected WebSocket upgrade", { status: 400 });
      }
      return handleAndLog(req, ctx);
    },
    websocket: {
      open(ws) {
        ctx.clients.add(ws);
      },
      close(ws) {
        ctx.clients.delete(ws);
      },
      message() {
        // Clients don't send messages today; ignore anything that arrives.
      },
    },
    error: (err) => {
      if (args.debug) console.error("[server error]", err);
      return new Response("Internal server error", { status: 500 });
    },
  });

  if (args.watch) {
    // Directory mode: recursive watch filtered to the known .md files we
    // already scanned (so noise from sibling directories doesn't trigger
    // reloads). Single-file mode: watch just that path with the
    // reconnect-on-close behavior matching tui.ts.
    if (rootIsDirectory) {
      const tree = await scanDirectory(rootDir, { exclude: args.exclude }).catch(() => null);
      const knownPaths = new Set(tree?.entries.map((e) => e.path) ?? []);
      startWatching(rootDir, { recursive: true, knownPaths }, () => broadcastReload(ctx));
    } else if (singleFilePath) {
      startWatching(singleFilePath, { recursive: false }, () => broadcastReload(ctx));
    }
  }

  if (!args.quiet) {
    const initialFileCount = rootIsDirectory
      ? (await scanDirectory(rootDir, { exclude: args.exclude }).catch(() => null))?.entries.length ?? 0
      : 1;
    printBanner({
      url: `http://${server.hostname}:${server.port}`,
      rootDir,
      rootIsDirectory,
      fileCount: initialFileCount,
      theme: args.theme,
      mermaid: !args.noMermaid,
    });
  }

  if (args.open) {
    openUrl(`http://${server.hostname}:${server.port}`).catch(() => {});
  }
}

/**
 * Send a reload message to every connected client. Errors per-client are
 * swallowed so one dead socket can't block the others — the WebSocket
 * close handler will purge them from the set on its own.
 */
function broadcastReload(ctx: ServerContext): void {
  const payload = JSON.stringify({ type: "reload" });
  for (const ws of ctx.clients) {
    try {
      ws.send(payload);
    } catch {
      // Client is in an unsendable state; close handler will clean it up.
    }
  }
}

/**
 * Wrap handleRequest with timing and access-log emission. Catches any throw
 * from the handler and converts it to a logged 500 — Bun.serve's `error:`
 * handler exists as a last resort but bypasses our log, so we'd rather
 * handle errors here and keep the access log complete.
 *
 * Logging goes to stderr so stdout stays clean for piping.
 */
async function handleAndLog(req: Request, ctx: ServerContext): Promise<Response> {
  const start = performance.now();
  let res: Response;
  try {
    res = await handleRequest(req, ctx);
  } catch (err) {
    if (ctx.debug) console.error("[handleRequest error]", err);
    const body = "Internal server error";
    res = new Response(body, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Length": String(body.length) },
    });
  }
  if (!ctx.quiet) {
    const url = new URL(req.url);
    const len = res.headers.get("content-length");
    const bytes = len ? Number.parseInt(len, 10) : NaN;
    logAccess({
      method: req.method,
      path: url.pathname,
      status: res.status,
      bytes,
      durationMs: performance.now() - start,
    });
  }
  return res;
}

async function handleRequest(req: Request, ctx: ServerContext): Promise<Response> {
  const url = new URL(req.url);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/_static/app.css") {
    return cssResponse(ctx.appCss);
  }
  if (pathname === "/_static/client.js") {
    return jsResponse(ctx.clientJs);
  }

  // Adapter-owned static assets (mermaid bundle, etc.).
  const adapterAsset = ctx.staticAssets[pathname];
  if (adapterAsset) return await fileResponse(adapterAsset);

  // Build a fresh tree on each request so newly created files appear without
  // a server restart. scanDirectory is fast for typical doc trees.
  const tree = ctx.rootIsDirectory
    ? await scanDirectory(ctx.rootDir, { exclude: ctx.excludes }).catch(() => null)
    : await singleFileTree(ctx.singleFilePath!);
  if (!tree) return notFound();

  if (pathname === "/" || pathname === "") {
    if (tree.entries.length === 0) return renderEmpty(ctx, tree);
    return renderEntry(ctx, tree, tree.entries[0]!.relativePath);
  }

  const requestedRel = pathname.replace(/^\/+/, "");
  const resolved = resolveSafe(ctx.rootDir, requestedRel);
  if (!resolved) return notFound();

  const fileStat = await Bun.file(resolved).stat().catch(() => null);
  if (!fileStat || fileStat.isDirectory()) return notFound();

  if (resolved.endsWith(".md")) {
    const rel = relative(ctx.rootDir, resolved);
    return renderEntry(ctx, tree, rel);
  }

  // Non-markdown asset adjacent to the served tree (e.g., images linked from
  // markdown). Bun.file infers the content type from the extension.
  return await fileResponse(resolved);
}

/**
 * Build a Response for a file. Existence is verified up front because
 * Bun.file is a lazy handle: `.size` returns 0 for missing files instead
 * of throwing, which would let us send a `Content-Length: 0` header for a
 * file that's about to fail mid-stream.
 */
async function fileResponse(filePath: string): Promise<Response> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return notFound();
  return new Response(file, { headers: { "Content-Length": String(file.size) } });
}

async function renderEntry(
  ctx: ServerContext,
  tree: FileTree,
  relativePath: string,
): Promise<Response> {
  const fullPath = join(ctx.rootDir, relativePath);
  const source = await Bun.file(fullPath).text().catch(() => null);
  if (source == null) return notFound();

  const html = ctx.marked.parse(source) as string;
  const sidebar = renderSidebar(tree, relativePath);
  const page = renderTemplate(ctx, {
    title: relativePath,
    fileName: basename(fullPath),
    activePath: relativePath,
    sidebar,
    content: html,
  });
  return htmlResponse(page);
}

function renderEmpty(ctx: ServerContext, tree: FileTree): Response {
  const page = renderTemplate(ctx, {
    title: "mdv",
    fileName: "",
    activePath: "",
    sidebar: renderSidebar(tree, null),
    content: `<h1>No markdown files found</h1><p>Add some <code>.md</code> files to <code>${escapeHtml(ctx.rootDir)}</code> to get started.</p>`,
  });
  return htmlResponse(page);
}

function renderTemplate(
  ctx: ServerContext,
  vars: { title: string; fileName: string; activePath: string; sidebar: string; content: string },
): string {
  // String.replace with a string second arg interprets $&, $', $`, $$ — which
  // means rendered markdown containing those sequences would mangle the
  // output. Build a single regex pass with a function replacer so the values
  // are inserted literally regardless of content.
  const slots: Record<string, string> = {
    title: escapeHtml(vars.title || "mdv"),
    themeVars: ctx.themeCss,
    headAssets: ctx.headAssets,
    focus: "content",
    rootName: escapeHtml(basename(ctx.rootDir)),
    activePath: escapeAttr(vars.activePath),
    fileName: escapeHtml(vars.fileName),
    sidebar: vars.sidebar,
    content: vars.content,
    bodyAssets: ctx.bodyAssets,
    watch: ctx.watch ? "on" : "off",
  };
  return ctx.template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    Object.prototype.hasOwnProperty.call(slots, key) ? slots[key]! : "",
  );
}

/**
 * Resolve a request path against the root, refusing anything that would
 * escape the served directory via `..` segments or absolute paths.
 */
function resolveSafe(rootDir: string, requested: string): string | null {
  if (!requested) return null;
  if (requested.startsWith("/")) return null;
  const candidate = resolve(rootDir, requested);
  if (candidate !== rootDir && !candidate.startsWith(rootDir + sep)) return null;
  return candidate;
}

async function singleFileTree(filePath: string): Promise<FileTree> {
  const rootDir = dirname(filePath);
  return {
    rootDir,
    entries: [
      {
        path: filePath,
        relativePath: basename(filePath),
        depth: 0,
      },
    ],
  };
}

function textResponseHeaders(contentType: string, body: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Content-Length": String(Buffer.byteLength(body)),
  };
}

function htmlResponse(body: string): Response {
  return new Response(body, { headers: textResponseHeaders("text/html; charset=utf-8", body) });
}
function cssResponse(body: string): Response {
  return new Response(body, { headers: textResponseHeaders("text/css; charset=utf-8", body) });
}
function jsResponse(body: string): Response {
  return new Response(body, {
    headers: textResponseHeaders("application/javascript; charset=utf-8", body),
  });
}
function notFound(): Response {
  const body = "Not found";
  return new Response(body, {
    status: 404,
    headers: textResponseHeaders("text/plain; charset=utf-8", body),
  });
}

async function openUrl(url: string): Promise<void> {
  // `start` is a cmd.exe builtin, not a binary on PATH; spawning it directly
  // would ENOENT. Route through cmd /c so the same call works on Windows.
  const argv =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  await Bun.spawn(argv).exited;
}
