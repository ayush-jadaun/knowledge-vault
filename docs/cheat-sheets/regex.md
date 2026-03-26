---
title: "Regex Cheat Sheet"
description: "Quick reference for regular expressions — character classes, quantifiers, anchors, lookaround, groups, and common patterns"
tags: [regex, cheat-sheet, reference, patterns, text-processing]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-20"
---

# Regex Cheat Sheet

Complete reference for regular expressions. Covers syntax, character classes, quantifiers, anchors, groups, lookaround, common patterns, and language-specific differences.

---

## Character Classes

| Pattern | Matches | Example |
|---------|---------|---------|
| `.` | Any character except newline | `a.c` matches `abc`, `a1c` |
| `\d` | Digit `[0-9]` | `\d{3}` matches `123` |
| `\D` | Non-digit `[^0-9]` | `\D+` matches `abc` |
| `\w` | Word character `[a-zA-Z0-9_]` | `\w+` matches `hello_123` |
| `\W` | Non-word character | `\W` matches `@`, `!` |
| `\s` | Whitespace `[ \t\n\r\f\v]` | `\s+` matches spaces/tabs |
| `\S` | Non-whitespace | `\S+` matches `hello` |
| `[abc]` | Any of a, b, or c | `[aeiou]` matches vowels |
| `[^abc]` | Not a, b, or c | `[^0-9]` matches non-digits |
| `[a-z]` | Range: a through z | `[a-zA-Z]` matches letters |
| `[a-zA-Z0-9]` | Alphanumeric | Same as `\w` minus `_` |

---

## Quantifiers

| Pattern | Meaning | Example |
|---------|---------|---------|
| `*` | 0 or more (greedy) | `ab*c` matches `ac`, `abc`, `abbc` |
| `+` | 1 or more (greedy) | `ab+c` matches `abc`, `abbc` (not `ac`) |
| `?` | 0 or 1 (optional) | `colou?r` matches `color`, `colour` |
| `{n}` | Exactly n | `\d{4}` matches `2024` |
| `{n,}` | n or more | `\d{2,}` matches `12`, `123`, `1234` |
| `{n,m}` | Between n and m | `\d{2,4}` matches `12`, `123`, `1234` |
| `*?` | 0 or more (lazy) | `".*?"` matches shortest quoted string |
| `+?` | 1 or more (lazy) | `<.+?>` matches single HTML tag |
| `??` | 0 or 1 (lazy) | Prefer 0 |
| `*+` | 0 or more (possessive) | No backtracking (some engines) |

::: tip
Greedy quantifiers match as much as possible, then backtrack. Lazy quantifiers match as little as possible. Use lazy when you need the shortest match, e.g. `".*?"` to match individual quoted strings rather than everything between the first and last quote.
:::

---

## Anchors

| Pattern | Matches |
|---------|---------|
| `^` | Start of string (or line with `m` flag) |
| `$` | End of string (or line with `m` flag) |
| `\b` | Word boundary |
| `\B` | Non-word boundary |
| `\A` | Start of string (ignores multiline flag) |
| `\Z` | End of string (ignores multiline flag) |

```
\bword\b    → matches "word" but not "sword" or "wordy"
^Start      → matches "Start" only at beginning of string
end$        → matches "end" only at end of string
```

---

## Groups & Capturing

| Pattern | Description |
|---------|-------------|
| `(abc)` | Capturing group |
| `(?:abc)` | Non-capturing group |
| `(?<name>abc)` | Named capturing group |
| `\1` | Backreference to group 1 |
| `\k<name>` | Backreference to named group |
| `(a\|b)` | Alternation (a or b) |

### Examples

```regex
# Capture date components
(\d{4})-(\d{2})-(\d{2})
# \1 = year, \2 = month, \3 = day

# Named groups
(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})

# Backreference: match repeated words
\b(\w+)\s+\1\b
# Matches "the the", "is is"

# Non-capturing group for alternation
(?:https?|ftp)://
# Groups without capturing
```

---

## Lookahead & Lookbehind

Zero-width assertions that check for patterns without consuming characters.

| Pattern | Name | Description |
|---------|------|-------------|
| `(?=abc)` | Positive lookahead | Followed by `abc` |
| `(?!abc)` | Negative lookahead | NOT followed by `abc` |
| `(?<=abc)` | Positive lookbehind | Preceded by `abc` |
| `(?<!abc)` | Negative lookbehind | NOT preceded by `abc` |

### Examples

```regex
# Password: at least one uppercase, one lowercase, one digit
^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$

# Match "foo" only if NOT followed by "bar"
foo(?!bar)
# Matches "fooX", "foo ", but not "foobar"

# Match numbers NOT preceded by $
(?<!\$)\d+
# Matches "42" in "count: 42" but not in "$42"

# Extract value after "price: "
(?<=price:\s)\d+\.?\d*
# From "price: 19.99" captures "19.99"

# Match word followed by comma
\w+(?=,)
# From "a, b, c" matches "a", "b"
```

::: warning
Lookbehind has restrictions in some engines. JavaScript historically only supported fixed-length lookbehind; modern engines (V8, SpiderMonkey) support variable-length. Java and .NET support variable-length. Python's `re` module requires fixed-length, but the `regex` module does not.
:::

---

## Flags / Modifiers

| Flag | Name | Description |
|------|------|-------------|
| `i` | Case-insensitive | `a` matches `A` |
| `g` | Global | Find all matches, not just first |
| `m` | Multiline | `^`/`$` match line start/end |
| `s` | Dotall / Single-line | `.` matches newline too |
| `u` | Unicode | Enable Unicode matching |
| `x` | Extended / Verbose | Ignore whitespace, allow comments |

### Verbose Mode Example

```regex
# Python or PCRE with x flag
(?x)
^                   # Start of string
(?P<protocol>       # Protocol group
  https?|ftp        # http, https, or ftp
)
://                 # Separator
(?P<domain>         # Domain group
  [a-zA-Z0-9.-]+   # Domain characters
)
(?::(?P<port>\d+))? # Optional port
(?P<path>/\S*)?     # Optional path
$                   # End of string
```

---

## Common Patterns

### Email (Simplified)

```regex
^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$
```

### URL

```regex
https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:/[^\s]*)?
```

### IPv4 Address

```regex
\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b
```

### IPv6 Address (Simplified)

```regex
(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}
```

### Phone Number (US)

```regex
(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}
```

### Date (YYYY-MM-DD)

```regex
\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])
```

### Time (HH:MM:SS, 24h)

```regex
(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?
```

### Hex Color

```regex
#(?:[0-9a-fA-F]{3}){1,2}\b
```

### Semantic Version

```regex
^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$
```

### UUID

```regex
[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
```

### Slug (URL-friendly)

```regex
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

### HTML Tag

```regex
<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>(.*?)</\1>
```

::: danger
Do not parse HTML with regex in production. Use a proper HTML parser. Regex is fine for quick extraction from well-known formats, but it cannot handle nested tags, attributes with `>`, or self-closing tags correctly.
:::

---

## Language-Specific Differences

### JavaScript

```javascript
// Literal syntax
const re = /pattern/flags;

// Constructor (dynamic patterns)
const re = new RegExp('pattern', 'flags');

// Methods
'hello'.match(/l+/g);           // ['ll']
'hello'.replace(/l/g, 'r');     // 'herro'
'hello'.search(/ll/);           // 2
/ll/.test('hello');              // true
'a,b,,c'.split(/,+/);           // ['a', 'b', 'c']

// Named groups (ES2018+)
const m = '2024-03-20'.match(/(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})/);
m.groups.y; // '2024'

// matchAll (ES2020+)
const matches = [...'a1 b2 c3'.matchAll(/([a-z])(\d)/g)];
```

### Python

```python
import re

# Match (beginning of string only)
re.match(r'\d+', '123abc')

# Search (anywhere in string)
re.search(r'\d+', 'abc123')

# Find all
re.findall(r'\d+', 'a1 b2 c3')        # ['1', '2', '3']

# Substitution
re.sub(r'\d+', 'X', 'a1 b2')           # 'aX bX'

# Compiled pattern (better for reuse)
pattern = re.compile(r'\d+')
pattern.findall('a1 b2')

# Named groups
m = re.search(r'(?P<year>\d{4})', '2024')
m.group('year')                         # '2024'

# Verbose mode
pattern = re.compile(r"""
    ^(\d{4})    # year
    -(\d{2})    # month
    -(\d{2})    # day
    $
""", re.VERBOSE)
```

### Go

```go
import "regexp"

// Compile (returns error)
re, err := regexp.Compile(`\d+`)

// MustCompile (panics on error)
re := regexp.MustCompile(`\d+`)

re.MatchString("abc123")             // true
re.FindString("abc 123 def")         // "123"
re.FindAllString("a1 b2 c3", -1)    // ["1", "2", "3"]
re.ReplaceAllString("a1 b2", "X")   // "aX bX"

// Named groups
re := regexp.MustCompile(`(?P<year>\d{4})-(?P<month>\d{2})`)
match := re.FindStringSubmatch("2024-03")
// Use re.SubexpNames() to get group names
```

::: warning
Go's `regexp` uses RE2, which does NOT support lookahead, lookbehind, or backreferences. This is by design for guaranteed linear-time matching. If you need these features, use a PCRE library.
:::

### Rust

```rust
use regex::Regex;

let re = Regex::new(r"\d+").unwrap();
re.is_match("abc123");                    // true
re.find("abc 123").unwrap().as_str();     // "123"

// Captures
let re = Regex::new(r"(?P<y>\d{4})-(?P<m>\d{2})").unwrap();
let caps = re.captures("2024-03").unwrap();
&caps["y"]; // "2024"

// Replace
re.replace_all("a1 b2", "X"); // "aX bX"
```

---

## Performance Tips

| Tip | Why |
|-----|-----|
| Anchor patterns with `^` and `$` | Prevents scanning entire string |
| Avoid `.*` at the start | Forces engine to try every position |
| Use non-capturing groups `(?:...)` | Avoids unnecessary memory allocation |
| Use possessive quantifiers `*+` when safe | Prevents catastrophic backtracking |
| Use atomic groups `(?>...)` when safe | Same as possessive, supported by more engines |
| Prefer character classes over alternation | `[aeiou]` is faster than `(a|e|i|o|u)` |
| Compile and reuse patterns | Avoid recompiling in loops |
| Beware of catastrophic backtracking | `(a+)+` on `"aaaaaaaaaaaaaaX"` is O(2^n) |

::: danger
Catastrophic backtracking is a real security vulnerability (ReDoS). Never use user-supplied patterns without timeout or input length limits.
:::

---

---

::: details Test Yourself
1. **What is the difference between `*` and `+` quantifiers?**
   `*` matches 0 or more; `+` matches 1 or more.

2. **How do you make a quantifier lazy (match as little as possible)?**
   Add `?` after it: `*?`, `+?`, `??`

3. **What does `\b` match?**
   A word boundary (the position between a word character and a non-word character).

4. **How do you create a non-capturing group?**
   `(?:pattern)` -- groups without saving the match.

5. **What is a positive lookahead and its syntax?**
   `(?=pattern)` -- asserts that the position is followed by the pattern, without consuming characters.

6. **What regex flag makes `.` match newline characters?**
   `s` (dotall / single-line mode).

7. **How do you match a literal dot in regex?**
   Escape it: `\.`

8. **What backreference syntax matches a previously captured group?**
   `\1` for group 1, `\k<name>` for named groups.

9. **What Python function finds all matches in a string?**
   `re.findall(r'\d+', text)`

10. **Why is `(a+)+` dangerous on certain inputs?**
    It causes catastrophic backtracking (exponential time) on inputs like `"aaaaaX"`.
:::

::: danger Common Gotchas
- **Catastrophic backtracking (ReDoS).** Patterns like `(a+)+`, `(a|aa)+`, or `(.*a){10}` can take exponential time. Never use user-supplied patterns without timeouts.
- **Greedy `.* ` matches too much.** `".*"` matches from the first quote to the LAST quote. Use `".*?"` for the shortest match.
- **Go's `regexp` does not support lookahead/lookbehind.** It uses RE2 for guaranteed linear-time matching. Use a PCRE library if you need these features.
- **Forgetting to anchor patterns.** Without `^` and `$`, a pattern matches anywhere in the string. An email regex without anchors will "validate" `xxinvalid@a.comxxx`.
:::

## One-Liner Summary

Regular expressions are a pattern-matching language for text -- master character classes, quantifiers, groups, and lookaround to search, validate, and transform strings in any language.

*Last updated: 2026-03-20*
