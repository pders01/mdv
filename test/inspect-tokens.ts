/**
 * Inspect markdown tokens for each fixture
 * Run with: bun run test/inspect-tokens.ts
 */

import { lexer } from "marked";
import { Glob } from "bun";

const fixturesDir = `${import.meta.dir}/fixtures`;
const glob = new Glob("**/*.md");
const fixtures = Array.from(glob.scanSync(fixturesDir)).sort();

for (const fixture of fixtures) {
  const content = await Bun.file(`${fixturesDir}/${fixture}`).text();
  const tokens = lexer(content);

  console.log("\n" + "=".repeat(60));
  console.log(`FIXTURE: ${fixture}`);
  console.log("=".repeat(60));

  for (const token of tokens) {
    printToken(token, 0);
  }
}

function printToken(token: any, indent: number) {
  const pad = "  ".repeat(indent);
  const type = token.type;

  // Summarize based on type
  switch (type) {
    case "heading":
      console.log(`${pad}[heading] depth=${token.depth} text="${token.text}"`);
      break;
    case "paragraph":
      console.log(`${pad}[paragraph] text="${truncate(token.text, 50)}"`);
      if (token.tokens) {
        for (const t of token.tokens) {
          printToken(t, indent + 1);
        }
      }
      break;
    case "html":
      console.log(
        `${pad}[html] block=${token.block} pre=${token.pre} raw="${truncate(token.raw, 60)}"`
      );
      break;
    case "code":
      console.log(
        `${pad}[code] lang="${token.lang || ""}" text="${truncate(token.text, 40)}"`
      );
      break;
    case "blockquote":
      console.log(`${pad}[blockquote]`);
      if (token.tokens) {
        for (const t of token.tokens) {
          printToken(t, indent + 1);
        }
      }
      break;
    case "list":
      console.log(
        `${pad}[list] ordered=${token.ordered} items=${token.items?.length || 0}`
      );
      if (token.items) {
        for (const item of token.items) {
          console.log(`${pad}  [list_item] text="${truncate(item.text, 40)}"`);
        }
      }
      break;
    case "hr":
      console.log(`${pad}[hr]`);
      break;
    case "space":
      // Skip space tokens
      break;
    case "text":
      console.log(`${pad}[text] "${truncate(token.text, 50)}"`);
      break;
    case "strong":
      console.log(`${pad}[strong] "${token.text}"`);
      break;
    case "em":
      console.log(`${pad}[em] "${token.text}"`);
      break;
    case "codespan":
      console.log(`${pad}[codespan] "${token.text}"`);
      break;
    case "link":
      console.log(`${pad}[link] href="${token.href}" text="${token.text}"`);
      break;
    case "del":
      console.log(`${pad}[del] "${token.text}"`);
      break;
    default:
      console.log(`${pad}[${type}] raw="${truncate(token.raw || "", 50)}"`);
  }
}

function truncate(s: string, max: number): string {
  const clean = s.replace(/\n/g, "\\n");
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 3) + "...";
}
