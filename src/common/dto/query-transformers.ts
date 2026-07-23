// Shared class-transformer `@Transform` helpers for query params, which always
// arrive as strings from the URL.

// Boolean('false') === true, so a naive coercion treats ?flag=false as true.
// Map the two literal strings and leave anything else for @IsBoolean to reject.
export const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  return value;
};

// List params arrive either repeated (?x=a&x=b -> ['a','b']) or comma-joined
// (?x=a,b). Normalize both to a trimmed, non-empty string array so a single
// value and a list are handled the same way. Non-strings are dropped for the
// per-item validator (@IsString) to flag.
export const toStringArray = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null) {
    return value;
  }
  const raw: unknown[] = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      continue;
    }
    for (const part of item.split(',')) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        out.push(trimmed);
      }
    }
  }
  return out;
};

export const toNumberArray = ({ value }: { value: unknown }): unknown => {
  const arr = toStringArray({ value });
  return Array.isArray(arr) ? arr.map((v) => Number(v)) : arr;
};
