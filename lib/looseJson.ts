/**
 * Tolerant reader for the document editor, so people don't have to write
 * strict JSON. Accepts, in order:
 *
 *   1. strict JSON                     {"name":"ada","age":25}
 *   2. JSON5-ish objects/arrays        {name: 'ada', age: 25,}   (unquoted keys,
 *                                       single quotes, trailing commas)
 *   3. brace-less "key: value" lines   name: ada           (one field per line;
 *                                       age: 25              "=" also accepted)
 *   4. a bare scalar                   hello  → "hello",  42 → 42,  true, null
 *
 * Values in modes 3/4 are auto-typed (numbers, booleans, null, nested
 * JSON), but leading-zero strings like "007" are preserved as strings so
 * ids / zip codes / phone numbers survive.
 */

export type LooseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/** Coerce a bare token to a typed value, preserving ambiguous strings. */
export function coerceScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === "") return "";
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null") return null;
  // plain number, but not leading-zero ids (007) or version-like (1.2.3)
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(v)) return Number(v);
  // nested object/array or an explicitly quoted string → real JSON
  const c = v[0];
  if (c === "{" || c === "[" || c === '"') {
    try {
      return JSON.parse(v);
    } catch {
      /* fall through to string */
    }
  }
  // single-quoted string
  if (c === "'" && v.endsWith("'")) {
    return v.slice(1, -1);
  }
  return v;
}

/* A hand-rolled JSON5-subset parser. More reliable than regex-rewriting JSON,
   which trips over colons/commas/braces inside string values. */
class Reader {
  private i = 0;
  constructor(private readonly s: string) {}

  parse(): unknown {
    this.ws();
    const v = this.value();
    this.ws();
    if (this.i < this.s.length) {
      throw new Error(`unexpected "${this.s[this.i]}" at position ${this.i + 1}`);
    }
    return v;
  }

  private ws() {
    for (;;) {
      const c = this.s[this.i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") {
        this.i++;
      } else if (c === "/" && this.s[this.i + 1] === "/") {
        while (this.i < this.s.length && this.s[this.i] !== "\n") this.i++;
      } else if (c === "/" && this.s[this.i + 1] === "*") {
        this.i += 2;
        while (this.i < this.s.length && !(this.s[this.i] === "*" && this.s[this.i + 1] === "/")) this.i++;
        this.i += 2;
      } else {
        break;
      }
    }
  }

  private value(): unknown {
    const c = this.s[this.i];
    if (c === "{") return this.object();
    if (c === "[") return this.array();
    if (c === '"' || c === "'") return this.string(c);
    // anything else — number, boolean, null, or an unquoted bareword string —
    // is read up to the next delimiter and typed by coerceScalar, so
    // `{age: 25}`, `{id: 007}` and `{name: ada}` all just work.
    return this.bareValue();
  }

  private bareValue(): unknown {
    const start = this.i;
    while (this.i < this.s.length && !",}]\n".includes(this.s[this.i])) this.i++;
    const raw = this.s.slice(start, this.i).trim();
    if (raw === "") throw new Error(`expected a value at position ${start + 1}`);
    return coerceScalar(raw);
  }

  private object(): Record<string, unknown> {
    this.i++; // {
    const out: Record<string, unknown> = {};
    this.ws();
    if (this.s[this.i] === "}") {
      this.i++;
      return out;
    }
    for (;;) {
      this.ws();
      const key =
        this.s[this.i] === '"' || this.s[this.i] === "'"
          ? this.string(this.s[this.i])
          : this.bareKey();
      this.ws();
      if (this.s[this.i] !== ":") throw new Error(`expected ":" after key "${key}"`);
      this.i++;
      this.ws();
      out[key] = this.value();
      this.ws();
      const ch = this.s[this.i];
      if (ch === ",") {
        this.i++;
        this.ws();
        if (this.s[this.i] === "}") {
          this.i++;
          return out;
        } // trailing comma
        continue;
      }
      if (ch === "}") {
        this.i++;
        return out;
      }
      throw new Error(`expected "," or "}" in object`);
    }
  }

  private array(): unknown[] {
    this.i++; // [
    const out: unknown[] = [];
    this.ws();
    if (this.s[this.i] === "]") {
      this.i++;
      return out;
    }
    for (;;) {
      this.ws();
      out.push(this.value());
      this.ws();
      const ch = this.s[this.i];
      if (ch === ",") {
        this.i++;
        this.ws();
        if (this.s[this.i] === "]") {
          this.i++;
          return out;
        }
        continue;
      }
      if (ch === "]") {
        this.i++;
        return out;
      }
      throw new Error(`expected "," or "]" in array`);
    }
  }

  private string(quote: string): string {
    this.i++; // opening quote
    let out = "";
    for (;;) {
      const c = this.s[this.i];
      if (c === undefined) throw new Error("unterminated string");
      if (c === "\\") {
        const n = this.s[this.i + 1];
        const map: Record<string, string> = {
          n: "\n",
          t: "\t",
          r: "\r",
          b: "\b",
          f: "\f",
          "/": "/",
          "\\": "\\",
          '"': '"',
          "'": "'",
        };
        if (n === "u") {
          out += String.fromCharCode(parseInt(this.s.slice(this.i + 2, this.i + 6), 16));
          this.i += 6;
        } else {
          out += map[n] ?? n;
          this.i += 2;
        }
        continue;
      }
      if (c === quote) {
        this.i++;
        return out;
      }
      out += c;
      this.i++;
    }
  }

  private bareKey(): string {
    const start = this.i;
    while (/[A-Za-z0-9_$-]/.test(this.s[this.i] ?? "")) this.i++;
    if (this.i === start) throw new Error(`expected a key at position ${this.i + 1}`);
    return this.s.slice(start, this.i);
  }
}

/** Split a brace-less body on top-level commas/newlines, ignoring separators
 *  inside strings/brackets, so `a: 1, b: {c: 2}` and multi-line input work. */
function splitFields(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      cur += c;
      if (c === quote && body[i - 1] !== "\\") quote = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (c === "{" || c === "[") depth++;
    if (c === "}" || c === "]") depth--;
    if (depth === 0 && (c === "," || c === "\n")) {
      if (cur.trim()) parts.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** Parse brace-less "key: value" / "key = value" lines into an object. */
function parseFieldLines(input: string): Record<string, unknown> | null {
  const fields = splitFields(input);
  if (fields.length === 0) return null;
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const m = field.match(/^\s*(['"]?)([^'":=]+)\1\s*[:=]\s*([\s\S]*)$/);
    if (!m) return null; // not a clean key/value line → bail to other modes
    const key = m[2].trim();
    if (!key) return null;
    out[key] = coerceScalar(m[3]);
  }
  return out;
}

/** The forgiving entry point used by the editor. */
export function looseParse(input: string): LooseResult {
  const t = input.trim();
  if (!t) return { ok: false, error: "nothing to write yet" };

  // 1. strict / JSON5-ish objects, arrays, quoted strings, numbers, keywords
  const first = t[0];
  if ("{[\"'-".includes(first) || (first >= "0" && first <= "9")) {
    try {
      return { ok: true, value: new Reader(t).parse() };
    } catch (e) {
      // an object/array that won't parse is a real error; keep the message
      if (first === "{" || first === "[") {
        return { ok: false, error: e instanceof Error ? e.message : "invalid input" };
      }
      // otherwise fall through to scalar/field handling
    }
  }

  // 2. brace-less "key: value" lines → object
  if (/^[A-Za-z0-9_$-]+\s*[:=]/.test(t)) {
    const obj = parseFieldLines(t);
    if (obj) return { ok: true, value: obj };
  }

  // 3. bare scalar (plain text, number, boolean, null)
  return { ok: true, value: coerceScalar(t) };
}
