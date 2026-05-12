/**
 * Spec → Renderable mounter.
 *
 * Stage 5 of the pipeline. The only place that calls `new BoxRenderable`
 * / `new TextRenderable` for spec-emitting block renderers. All side
 * effects (OpenTUI object construction, scroll-graph attachment) live
 * here; the upstream stages remain pure data transforms.
 *
 * Why not call `new BoxRenderable` inside each block renderer? Because
 * tests then need a `CliRenderer` to construct anything, golden output
 * is observed via paint instead of read off the IR, and any deviation
 * between spec and rendered tree is invisible until a frame is captured.
 * Funnelling construction through one function keeps the IR a contract.
 */

import {
  BoxRenderable,
  TextRenderable,
  StyledText,
  type Renderable,
  type RenderContext,
} from "@opentui/core";
import type { Spec } from "./spec.js";

export function mountSpec(renderer: RenderContext, spec: Spec): Renderable {
  if (spec.kind === "legacy") {
    return spec.renderable;
  }

  if (spec.kind === "text") {
    const styled = new StyledText(spec.chunks as unknown as ConstructorParameters<typeof StyledText>[0]);
    return new TextRenderable(renderer, {
      ...(spec.id ? { id: spec.id } : {}),
      content: styled,
      ...(spec.wrapMode ? { wrapMode: spec.wrapMode } : {}),
    });
  }

  // BoxSpec
  const box = new BoxRenderable(renderer, {
    ...(spec.id ? { id: spec.id } : {}),
    ...(spec.padding !== undefined ? { padding: spec.padding } : {}),
    ...(spec.paddingLeft !== undefined ? { paddingLeft: spec.paddingLeft } : {}),
    ...(spec.paddingRight !== undefined ? { paddingRight: spec.paddingRight } : {}),
    ...(spec.paddingTop !== undefined ? { paddingTop: spec.paddingTop } : {}),
    ...(spec.paddingBottom !== undefined ? { paddingBottom: spec.paddingBottom } : {}),
    ...(spec.marginTop !== undefined ? { marginTop: spec.marginTop } : {}),
    ...(spec.marginBottom !== undefined ? { marginBottom: spec.marginBottom } : {}),
    ...(spec.flexDirection ? { flexDirection: spec.flexDirection } : {}),
  });

  for (const child of spec.children) {
    box.add(mountSpec(renderer, child));
  }

  return box;
}
