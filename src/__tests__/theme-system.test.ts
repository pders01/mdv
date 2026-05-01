/**
 * Tests for system appearance detection and `auto` theme resolution.
 *
 * Detection probes (defaults/gsettings) are platform-dependent and gated
 * behind env/COLORFGBG checks here so the assertions stay deterministic.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { detectSystemAppearance, resolveTheme } from "../theme/system.js";

const originalAppearance = process.env.MDV_APPEARANCE;
const originalColorfgbg = process.env.COLORFGBG;

function clearEnv() {
  delete process.env.MDV_APPEARANCE;
  delete process.env.COLORFGBG;
}

function restoreEnv() {
  if (originalAppearance === undefined) delete process.env.MDV_APPEARANCE;
  else process.env.MDV_APPEARANCE = originalAppearance;
  if (originalColorfgbg === undefined) delete process.env.COLORFGBG;
  else process.env.COLORFGBG = originalColorfgbg;
}

describe("detectSystemAppearance", () => {
  beforeEach(clearEnv);
  afterEach(restoreEnv);

  test("MDV_APPEARANCE=light wins", () => {
    process.env.MDV_APPEARANCE = "light";
    expect(detectSystemAppearance()).toBe("light");
  });

  test("MDV_APPEARANCE=dark wins", () => {
    process.env.MDV_APPEARANCE = "dark";
    expect(detectSystemAppearance()).toBe("dark");
  });

  test("MDV_APPEARANCE is case-insensitive", () => {
    process.env.MDV_APPEARANCE = "LIGHT";
    expect(detectSystemAppearance()).toBe("light");
  });

  test("COLORFGBG with light bg returns light", () => {
    process.env.COLORFGBG = "0;15";
    expect(detectSystemAppearance()).toBe("light");
  });

  test("COLORFGBG with dark bg returns dark", () => {
    process.env.COLORFGBG = "15;0";
    expect(detectSystemAppearance()).toBe("dark");
  });

  test("COLORFGBG bg=8 (bright black) treated as dark", () => {
    process.env.COLORFGBG = "7;8";
    expect(detectSystemAppearance()).toBe("dark");
  });

  test("COLORFGBG with three segments uses last", () => {
    process.env.COLORFGBG = "15;default;0";
    expect(detectSystemAppearance()).toBe("dark");
  });

  test("MDV_APPEARANCE wins over COLORFGBG", () => {
    process.env.MDV_APPEARANCE = "dark";
    process.env.COLORFGBG = "0;15"; // would otherwise say light
    expect(detectSystemAppearance()).toBe("dark");
  });
});

describe("resolveTheme", () => {
  beforeEach(clearEnv);
  afterEach(restoreEnv);

  test("passes through concrete theme names", () => {
    expect(resolveTheme("nord")).toBe("nord");
    expect(resolveTheme("dracula")).toBe("dracula");
    expect(resolveTheme("github-light")).toBe("github-light");
  });

  test("resolves auto -> github-dark when system is dark", () => {
    process.env.MDV_APPEARANCE = "dark";
    expect(resolveTheme("auto")).toBe("github-dark");
  });

  test("resolves auto -> github-light when system is light", () => {
    process.env.MDV_APPEARANCE = "light";
    expect(resolveTheme("auto")).toBe("github-light");
  });
});
