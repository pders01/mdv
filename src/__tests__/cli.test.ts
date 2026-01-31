/**
 * CLI module tests
 */

import { describe, test, expect } from "bun:test";
import { parseCliArgs } from "../cli.js";

describe("parseCliArgs", () => {
  test("parses file path", () => {
    const args = parseCliArgs(["node", "mdv", "README.md"]);
    expect(args.filePath).toBe("README.md");
    expect(args.showHelp).toBe(false);
    expect(args.listThemes).toBe(false);
  });

  test("parses stdin marker", () => {
    const args = parseCliArgs(["node", "mdv", "-"]);
    expect(args.filePath).toBe("-");
  });

  test("parses theme option short form", () => {
    const args = parseCliArgs(["node", "mdv", "-t", "nord", "file.md"]);
    expect(args.theme).toBe("nord");
    expect(args.filePath).toBe("file.md");
  });

  test("parses theme option long form", () => {
    const args = parseCliArgs(["node", "mdv", "--theme", "dracula", "file.md"]);
    expect(args.theme).toBe("dracula");
  });

  test("uses default theme when not specified", () => {
    const args = parseCliArgs(["node", "mdv", "file.md"]);
    expect(args.theme).toBe("github-dark");
  });

  test("parses help flag short form", () => {
    const args = parseCliArgs(["node", "mdv", "-h"]);
    expect(args.showHelp).toBe(true);
  });

  test("parses help flag long form", () => {
    const args = parseCliArgs(["node", "mdv", "--help"]);
    expect(args.showHelp).toBe(true);
  });

  test("parses list-themes flag", () => {
    const args = parseCliArgs(["node", "mdv", "--list-themes"]);
    expect(args.listThemes).toBe(true);
  });

  test("returns null filePath when no file provided", () => {
    const args = parseCliArgs(["node", "mdv"]);
    expect(args.filePath).toBeNull();
  });

  test("handles multiple options together", () => {
    const args = parseCliArgs(["node", "mdv", "-t", "monokai", "test.md"]);
    expect(args.theme).toBe("monokai");
    expect(args.filePath).toBe("test.md");
    expect(args.showHelp).toBe(false);
    expect(args.listThemes).toBe(false);
  });
});
