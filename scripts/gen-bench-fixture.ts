/**
 * Generate a deterministic markdown fixture for `bench-scroll`. Mixes
 * headings, paragraphs, lists, code blocks, blockquotes, and a table so
 * the bench exercises every renderer code path, not just plain text.
 *
 * Deterministic: a fixed seed keeps the file byte-identical between runs
 * so bench results are comparable across commits.
 *
 * Usage: bun run scripts/gen-bench-fixture.ts [out.md] [sections]
 */

import { writeFileSync } from "fs";
import { resolve } from "path";

const DEFAULT_OUT = "src/__tests__/fixtures/big.md";
const DEFAULT_SECTIONS = 80;

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  "render","stream","buffer","theme","cursor","scroll","viewport","markdown",
  "syntax","token","parser","lexer","mermaid","diagram","sidebar","watch",
  "highlight","conceal","yank","clipboard","selection","search","match",
  "shiki","opentui","unicode","emoji","layout","flex","reflow","measure",
];

function pickWord(rng: () => number): string {
  return WORDS[Math.floor(rng() * WORDS.length)]!;
}

function paragraph(rng: () => number, words: number): string {
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(pickWord(rng));
  out[0] = out[0]!.charAt(0).toUpperCase() + out[0]!.slice(1);
  return out.join(" ") + ".";
}

function codeBlock(rng: () => number, lines: number): string {
  const langs = ["typescript", "javascript", "python", "bash", "rust"];
  const lang = langs[Math.floor(rng() * langs.length)]!;
  const body: string[] = [];
  for (let i = 0; i < lines; i++) {
    if (lang === "typescript" || lang === "javascript") {
      body.push(`const ${pickWord(rng)}${i} = ${pickWord(rng)}(${i});`);
    } else if (lang === "python") {
      body.push(`def ${pickWord(rng)}_${i}(x): return ${pickWord(rng)}(x)`);
    } else if (lang === "bash") {
      body.push(`${pickWord(rng)} --${pickWord(rng)} "${pickWord(rng)}"`);
    } else {
      body.push(`fn ${pickWord(rng)}_${i}() -> ${pickWord(rng)} { ${i} }`);
    }
  }
  return "```" + lang + "\n" + body.join("\n") + "\n```";
}

function bulletList(rng: () => number, items: number): string {
  const out: string[] = [];
  for (let i = 0; i < items; i++) out.push(`- ${paragraph(rng, 5 + Math.floor(rng() * 6))}`);
  return out.join("\n");
}

function table(rng: () => number, rows: number): string {
  const out: string[] = [];
  out.push("| col a | col b | col c |");
  out.push("|-------|-------|-------|");
  for (let i = 0; i < rows; i++) {
    out.push(`| ${pickWord(rng)} | ${pickWord(rng)}${i} | ${i * 7} |`);
  }
  return out.join("\n");
}

function section(rng: () => number, idx: number): string {
  const parts: string[] = [];
  parts.push(`## section ${idx}: ${pickWord(rng)} ${pickWord(rng)}`);
  parts.push("");
  parts.push(paragraph(rng, 30 + Math.floor(rng() * 30)));
  parts.push("");
  if (rng() < 0.6) {
    parts.push(`### ${pickWord(rng)} ${pickWord(rng)}`);
    parts.push("");
    parts.push(bulletList(rng, 3 + Math.floor(rng() * 5)));
    parts.push("");
  }
  if (rng() < 0.5) {
    parts.push(codeBlock(rng, 4 + Math.floor(rng() * 8)));
    parts.push("");
  }
  if (rng() < 0.25) {
    parts.push(`> ${paragraph(rng, 12)}`);
    parts.push("");
  }
  if (rng() < 0.2) {
    parts.push(table(rng, 3 + Math.floor(rng() * 4)));
    parts.push("");
  }
  parts.push(paragraph(rng, 20 + Math.floor(rng() * 30)));
  parts.push("");
  return parts.join("\n");
}

function main(): void {
  const out = resolve(process.argv[2] ?? DEFAULT_OUT);
  const sections = Number(process.argv[3] ?? DEFAULT_SECTIONS);
  const rng = mulberry32(0xbeef);
  const blocks: string[] = ["# bench fixture", ""];
  for (let i = 0; i < sections; i++) blocks.push(section(rng, i));
  const text = blocks.join("\n");
  writeFileSync(out, text);
  console.log(`wrote ${out}: ${text.length} bytes, ${text.split("\n").length} lines`);
}

main();
