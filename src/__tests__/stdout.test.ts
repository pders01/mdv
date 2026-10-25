import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCliArgs, buildHelp } from "../cli.js";
import { stdoutColorEnabled } from "../stdout.js";
import { terminalText } from "../render/ansi.js";
import { cellWidth } from "../util/width.js";

const entry = join(import.meta.dir, "../index.ts");
const fixture = join(import.meta.dir, "golden/inputs/18-wide-tables.md");
function args(...values: string[]) {
  return parseCliArgs(["bun", "mdv", ...values]);
}
async function cli(values: string[], input = "", env: Record<string, string> = {}) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.NO_COLOR;
  delete cleanEnv.FORCE_COLOR;
  const child = Bun.spawn([process.execPath, entry, ...values], {
    stdin: new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...cleanEnv, MDV_APPEARANCE: "dark", ...env },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

describe("stdout CLI", () => {
  it("keeps the TUI default and parses explicit stdout controls", () => {
    expect(args("file.md").stdout).toBe(false);
    expect(args("--stdout", "-")).toMatchObject({
      stdout: true,
      filePath: "-",
      width: null,
      color: "auto",
      serve: false,
    });
    expect(args("--stdout", "--width", "42", "--color", "always", "file.md")).toMatchObject({
      width: 42,
      color: "always",
    });
    expect(buildHelp()).toContain("--stdout");
    expect(buildHelp()).toContain("--color <mode>");
  });

  it("validates widths, colors, and incompatible modes", () => {
    for (const width of ["0", "-1", "1.2", "12px", "", "Infinity", "1e2", "9007199254740992"]) {
      expect(() => args("--stdout", `--width=${width}`, "-")).toThrow("positive integer");
    }
    expect(() => args("--stdout", "--color", "yes", "-")).toThrow("auto, always, or never");
    for (const values of [
      ["--watch"],
      ["--serve"],
      ["serve"],
      ["--print"],
      ["--open"],
      ["--port", "5000"],
    ]) {
      expect(() => args("--stdout", ...values, "-")).toThrow();
    }
    expect(() => args("--stdout", "one.md", "two.md")).toThrow("one file");
    expect(() => args("--width", "40", "file.md")).toThrow("require --stdout");
    expect(() => args("--color", "never", "file.md")).toThrow("require --stdout");
  });

  it("honors color modes, TTY detection, and environment overrides", () => {
    expect(stdoutColorEnabled("auto", true, {})).toBe(true);
    expect(stdoutColorEnabled("auto", false, {})).toBe(false);
    expect(stdoutColorEnabled("auto", true, { NO_COLOR: "1", FORCE_COLOR: "1" })).toBe(false);
    expect(stdoutColorEnabled("auto", false, { FORCE_COLOR: "1" })).toBe(true);
    expect(stdoutColorEnabled("auto", true, { FORCE_COLOR: "0" })).toBe(false);
    expect(stdoutColorEnabled("always", false, { NO_COLOR: "1" })).toBe(true);
    expect(stdoutColorEnabled("never", true, { FORCE_COLOR: "1" })).toBe(false);
  });

  it("renders stdin without ANSI or TUI lifecycle output when redirected", async () => {
    const result = await cli(
      ["--stdout", "-"],
      "# Hello **world**\n\nA [link](https://example.com).",
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Hello world");
    expect(result.stdout).toContain("A link");
    expect(result.stdout).not.toContain("\x1b");
  });

  it("uses 80 columns when redirected and honors --width", async () => {
    const content = "a".repeat(90);
    const normal = await cli(["--stdout", "-"], content);
    expect(normal.stdout.split("\n")[0]).toHaveLength(80);
    const narrow = await cli(["--stdout", "--width", "30", "-"], content);
    expect(narrow.stdout).toBe(`${"a".repeat(30)}\n`.repeat(3));
  });

  it("renders files and adaptive tables within the requested width", async () => {
    const result = await cli(["--stdout", "--width", "40", "--no-mermaid", fixture]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("billing");
    for (const line of result.stdout.split("\n")) expect(cellWidth(line)).toBeLessThanOrEqual(40);
  });

  it("preserves themes and syntax colors without terminal cursor sequences", async () => {
    const content = "# Heading\n\n```ts\nconst x = 42;\n```";
    const dark = await cli(
      ["--stdout", "--color", "always", "--theme", "github-dark", "-"],
      content,
    );
    const light = await cli(
      ["--stdout", "--color", "always", "--theme", "github-light", "-"],
      content,
    );
    expect(dark.code).toBe(0);
    expect(light.code).toBe(0);
    expect(dark.stdout).toContain("38;2;");
    expect(dark.stdout).toContain("48;2;");
    expect(dark.stdout).not.toBe(light.stdout);
    expect(terminalText(dark.stdout)).toBe(terminalText(light.stdout));
    const styling = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, "g");
    expect(dark.stdout.replace(styling, "")).not.toContain("\x1b");
    const never = await cli(["--stdout", "--color", "never", "-"], content, { FORCE_COLOR: "1" });
    expect(never.stdout).not.toContain("\x1b");
    const forced = await cli(["--stdout", "-"], content, { FORCE_COLOR: "1" });
    expect(forced.stdout).toContain("\x1b[");
    const disabled = await cli(["--stdout", "-"], content, { NO_COLOR: "1" });
    expect(disabled.stdout).not.toContain("\x1b");
  });

  it("preserves styled graphemes and long code indentation through the CLI", async () => {
    for (const color of ["never", "always"]) {
      const emoji = await cli(
        ["--stdout", "--width", "2", "--color", color, "-"],
        "❤**️**x\n\n👩‍**💻**",
      );
      expect(emoji.code).toBe(0);
      expect(emoji.stderr).toBe("");
      expect(terminalText(emoji.stdout)).toBe("❤️\nx\n\n👩‍💻\n");
      const code = await cli(
        ["--stdout", "--width", "10", "--color", color, "-"],
        "```text\n     abcdefghijklmnop\n```",
      );
      expect(code.code).toBe(0);
      expect(terminalText(code.stdout).split("\n")[0]!.trimEnd()).toBe("      abc");
    }
  });

  it("handles empty input without emitting anything", async () => {
    for (const content of ["", " \n\n"])
      expect(await cli(["--stdout", "-"], content)).toEqual({ code: 0, stdout: "", stderr: "" });
  });

  it("reports errors only on stderr", async () => {
    for (const values of [
      ["--stdout"],
      ["--stdout", import.meta.dir],
      ["--stdout", "/nonexistent/mdv/file.md"],
      ["--stdout", "--width", "0", "-"],
      ["--stdout", "--theme", "not-a-real-theme", "-"],
    ]) {
      const result = await cli(values, "text");
      expect(result.code).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toStartWith("mdv: ");
    }
  });

  it("reuses Mermaid ASCII rendering and honors --no-mermaid", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mdv-stdout-"));
    try {
      const bin = join(dir, "mermaid-ascii");
      await writeFile(bin, "#!/bin/sh\ncat >/dev/null\nprintf 'ASCII diagram\\n'\n");
      await chmod(bin, 0o755);
      const env = { MDV_MERMAID_BIN: bin, MDV_MERMAID_CACHE: join(dir, "cache") };
      const content = "```mermaid\ngraph TD\nA --> B\n```";
      const rendered = await cli(["--stdout", "-"], content, env);
      expect(rendered.stdout).toContain("ASCII diagram");
      expect(rendered.stdout).not.toContain("graph TD");
      const disabled = await cli(["--stdout", "--no-mermaid", "-"], content, env);
      expect(disabled.stdout).toContain("graph TD");
      expect(disabled.stdout).not.toContain("ASCII diagram");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
