/**
 * Code-block adapter registry for web rendering.
 *
 * Each adapter claims one or more fence languages and produces the HTML for
 * those blocks. The default adapter (langs includes "*") handles anything no
 * specific adapter claimed — typically the Shiki syntax highlighter.
 *
 * This is the web-side counterpart to the TUI's mermaid prerender pipeline
 * in src/rendering/mermaid.ts. Both sides answer the same question — "given
 * (lang, code), produce platform output" — but the output types and
 * lifecycles differ enough that we keep two parallel interfaces rather than
 * forcing a single polymorphic one.
 */

export interface CodeAdapter {
  /** Fence languages this adapter handles. Use "*" for the default fallback. */
  readonly langs: readonly string[];

  /** Render the fenced block to inline HTML. */
  render(code: string, lang: string): string;

  /**
   * Optional HTML to inject into <head> once per page when this adapter is
   * registered. Used for stylesheet links or page-level config.
   */
  readonly headAssets?: string;

  /**
   * Optional HTML to inject just before </body> once per page when this
   * adapter is registered. Used for client-side scripts (e.g., the mermaid
   * loader and init call).
   */
  readonly bodyAssets?: string;

  /**
   * URL path → filesystem path map for files this adapter wants the server
   * to expose under /_static. Lets adapters ship vendored libraries
   * (mermaid bundle today, PlantUML tomorrow) without the server route
   * layer needing to know about them.
   */
  readonly staticAssets?: Readonly<Record<string, string>>;
}

export class CodeAdapterRegistry {
  private readonly adapters: CodeAdapter[] = [];

  register(adapter: CodeAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * First registered adapter that explicitly claims `lang` wins. If none
   * does, the first adapter that claims "*" is returned.
   */
  resolve(lang: string): CodeAdapter | undefined {
    const explicit = this.adapters.find((a) => a.langs.includes(lang));
    if (explicit) return explicit;
    return this.adapters.find((a) => a.langs.includes("*"));
  }

  collectHeadAssets(): string {
    return this.adapters
      .map((a) => a.headAssets)
      .filter((s): s is string => Boolean(s))
      .join("\n");
  }

  collectBodyAssets(): string {
    return this.adapters
      .map((a) => a.bodyAssets)
      .filter((s): s is string => Boolean(s))
      .join("\n");
  }

  collectStaticAssets(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const adapter of this.adapters) {
      if (!adapter.staticAssets) continue;
      Object.assign(out, adapter.staticAssets);
    }
    return out;
  }
}
