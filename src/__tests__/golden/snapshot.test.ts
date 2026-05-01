/**
 * Golden HTML snapshots — regression net for the markdown rendering pipeline.
 *
 * Each `inputs/*.md` is rendered through the production server pipeline
 * (with a deterministic stub code adapter, see `helper.ts`) and the output
 * is compared byte-for-byte to its `expected/*.expected.html` sibling.
 *
 * Update workflow:
 *   1. Make a renderer change.
 *   2. Run `bun run scripts/gen-golden.ts`.
 *   3. Inspect the diff in `expected/*.html`.
 *   4. Commit if the changes are intentional.
 *
 * Designed to make the upcoming micromark migration safe: every accepted
 * deviation in HTML output becomes a visible diff that has to be reviewed.
 */

import { describe, test, expect } from "bun:test";
import { listGoldenInputs, readExpected, readInput, renderGolden } from "./helper.js";

describe("golden HTML snapshots", () => {
  for (const name of listGoldenInputs()) {
    test(name, () => {
      const actual = renderGolden(readInput(name));
      const expected = readExpected(name);
      expect(actual).toBe(expected);
    });
  }
});
