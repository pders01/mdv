/**
 * End-to-end tests for `mdv serve` boot + routes.
 *
 * Boots the server against a fixture directory on a high port, hits a few
 * routes, asserts shape. Each test gets a unique port to avoid flakes when
 * the suite runs in parallel.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { startServer } from "../../server/index.js";
import type { CliArgs } from "../../cli.js";

let tempDir: string;
let port: number;

const BASE_ARGS: CliArgs = {
  theme: "github-dark",
  filePath: null,
  showHelp: false,
  showVersion: false,
  listThemes: false,
  debug: false,
  noMouse: false,
  watch: false,
  exclude: [],
  noMermaid: false,
  serve: true,
  port: 0,
  host: "localhost",
  open: false,
};

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "mdv-server-test-"));
  await writeFile(
    join(tempDir, "README.md"),
    "# Hello\n\nSome text.\n\n```ts\nconst x: number = 1;\n```\n",
  );
  await mkdir(join(tempDir, "guide"));
  await writeFile(join(tempDir, "guide", "intro.md"), "# Intro\n\nNested doc.\n");
  await writeFile(join(tempDir, "guide", "skip.txt"), "not markdown");

  // Pick an ephemeral port; Bun.serve with port 0 works but startServer
  // logs the chosen one. We assign a high range here to keep CI simple.
  port = 4380 + Math.floor(Math.random() * 100);
  await startServer({ ...BASE_ARGS, filePath: tempDir, port });
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("server routes", () => {
  test("GET / renders the first markdown file in sort order", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1");
    // scanDirectory sorts case-insensitively; "guide/intro.md" precedes "README.md"
    expect(html).toContain("Intro");
    expect(html).toContain('class="mdv-sidebar__entry"');
  });

  test("GET /<file>.md renders that file", async () => {
    const res = await fetch(`http://localhost:${port}/guide/intro.md`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Intro");
    expect(html).toContain("Nested doc.");
  });

  test("Shiki highlighting present in code blocks", async () => {
    // README has the fenced ```ts block; intro.md (the default route) does not
    const res = await fetch(`http://localhost:${port}/README.md`);
    const html = await res.text();
    expect(html).toContain("shiki");
    expect(html).toMatch(/<span style="color:/);
  });

  test("sidebar lists only .md files", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    const html = await res.text();
    expect(html).toContain("README.md");
    expect(html).toContain("guide/intro.md");
    expect(html).not.toContain("skip.txt");
  });

  test("static CSS served", async () => {
    const res = await fetch(`http://localhost:${port}/_static/app.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    const css = await res.text();
    expect(css).toContain(".mdv-prose");
  });

  test("static client.js served", async () => {
    const res = await fetch(`http://localhost:${port}/_static/client.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  test("path traversal denied", async () => {
    const res = await fetch(`http://localhost:${port}/../etc/hosts`);
    expect(res.status).toBe(404);
  });

  test("missing file returns 404", async () => {
    const res = await fetch(`http://localhost:${port}/does-not-exist.md`);
    expect(res.status).toBe(404);
  });

  test("theme variables emitted in head", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    const html = await res.text();
    expect(html).toContain("--mdv-fg:");
    expect(html).toContain("--mdv-code-bg:");
  });
});
