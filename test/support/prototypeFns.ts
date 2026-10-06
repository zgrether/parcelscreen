/**
 * The prototype as a test oracle: extracts a named top-level function from legacy/parcelscreen.html and
 * evaluates it in Node, so the port's pure helpers can be checked against the original code on many inputs,
 * not just the recorded goldens. Only for self-contained functions (string and number logic); `CFG` and the
 * other globals they read are passed in explicitly.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve(import.meta.dirname, "..", "..", "legacy", "parcelscreen.html"), "utf8");

/** Source of `function name(...){...}` (or `const name=...;` one-liners), by brace matching. */
export function prototypeSource(name: string): string {
  const fn = html.indexOf(`function ${name}(`);
  if (fn >= 0) {
    // Past the parameter list first: a destructured parameter ({partial=false}) has braces of its own.
    let parens = 0,
      body = -1;
    for (let i = fn + `function ${name}`.length; i < html.length; i++) {
      if (html[i] === "(") parens++;
      else if (html[i] === ")" && --parens === 0) {
        body = html.indexOf("{", i);
        break;
      }
    }
    let depth = 0;
    for (let i = body; i < html.length; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}" && --depth === 0) return html.slice(fn, i + 1);
    }
  }
  const arrow = new RegExp(`const ${name}=([^\n]*?);\n`).exec(html);
  if (arrow) return `const ${name}=${arrow[1]};`;
  throw new Error(`prototype function ${name} not found`);
}

/** The prototype's function, with the named globals it closes over supplied. */
export function prototypeFn<T extends (...args: never[]) => unknown>(
  name: string,
  globals: Record<string, unknown> = {},
): T {
  const names = Object.keys(globals);
  return new Function(...names, `${prototypeSource(name)}\nreturn ${name};`)(
    ...names.map((n) => globals[n]),
  ) as T;
}
