---
title: "Regex Mastery"
description: "Complete regular expressions tutorial — from basics to lookaround, backreferences, performance pitfalls, and regex in 5 languages with 30+ worked examples"
---

# Regex Mastery

Regular expressions are one of the most powerful tools in a programmer's arsenal — and one of the most misunderstood. A single regex can replace dozens of lines of string-parsing code. But a poorly written regex can crash your server, introduce security vulnerabilities, or silently pass invalid input. This tutorial takes you from zero to mastery, building each concept on the last, with worked examples in multiple languages.

> For a quick-reference card you can keep open while coding, see the [Regex Cheat Sheet](/cheat-sheets/regex).

---

## Part 1: Foundations

### What Regex Is and Why It Matters

A **regular expression** (regex or regexp) is a sequence of characters that defines a search pattern. Regex engines scan text left-to-right, attempting to match the pattern at each position. When a match is found, the engine reports its location and contents.

Regex is used everywhere:

- **Validation** — email addresses, phone numbers, passwords
- **Search and replace** — refactoring code, transforming data
- **Parsing** — extracting fields from logs, CSVs, URLs
- **Routing** — matching URL patterns in web frameworks
- **Security** — intrusion detection rules, WAF filters
- **Data cleaning** — normalizing messy input in ETL pipelines

::: tip Key Takeaway
Regex is not a programming language — it is a pattern-matching language embedded inside other languages. Every major language has regex support, but the syntax and engine behavior vary.
:::

---

### Literal Characters

The simplest regex is a literal string. The pattern `cat` matches the substring "cat" in "concatenate", "category", and "the cat sat".

```
Pattern:  cat
Text:     the cat sat on the mat
Match:        ^^^
```

Most characters match themselves literally. The exceptions are **metacharacters** — characters with special meaning in regex.

### Metacharacters

These characters have special meaning and must be escaped with `\` if you want to match them literally:

```
.  ^  $  *  +  ?  {  }  [  ]  (  )  |  \
```

| Metacharacter | Meaning |
|---------------|---------|
| `.` | Any character except newline |
| `^` | Start of string/line |
| `$` | End of string/line |
| `*` | Zero or more of the preceding |
| `+` | One or more of the preceding |
| `?` | Zero or one of the preceding |
| `{` `}` | Quantifier bounds |
| `[` `]` | Character class |
| `(` `)` | Group |
| `\|` | Alternation (OR) |
| `\` | Escape character |

To match a literal dot, use `\.`. To match a literal backslash, use `\\`.

```
Pattern:  3\.14
Text:     The value of pi is 3.14 not 3X14
Match:                        ^^^^
```

---

### Character Classes

A **character class** matches any single character from a set. Defined with square brackets.

#### Custom Character Classes

| Pattern | Matches |
|---------|---------|
| `[abc]` | Any one of a, b, or c |
| `[a-z]` | Any lowercase letter |
| `[A-Z]` | Any uppercase letter |
| `[0-9]` | Any digit |
| `[a-zA-Z0-9]` | Any alphanumeric character |
| `[^abc]` | Any character EXCEPT a, b, or c |
| `[^0-9]` | Any non-digit character |

The caret `^` inside brackets means **negation**. Outside brackets, it means start-of-string.

```
Pattern:  [aeiou]
Text:     hello world
Matches:   ^  ^   ^ ^    (e, o, o)

Pattern:  [^aeiou\s]
Text:     hello world
Matches:  ^  ^^  ^^^     (h, l, l, w, r, l, d)
```

::: warning
Inside a character class, most metacharacters lose their special meaning. The exceptions are `]` (closes the class), `\` (escape), `^` (negation, only at the start), and `-` (range, only between characters). To include a literal `-`, place it first or last: `[-abc]` or `[abc-]`.
:::

#### Shorthand Character Classes

| Shorthand | Equivalent | Matches |
|-----------|-----------|---------|
| `\d` | `[0-9]` | Any digit |
| `\D` | `[^0-9]` | Any non-digit |
| `\w` | `[a-zA-Z0-9_]` | Any "word" character |
| `\W` | `[^a-zA-Z0-9_]` | Any non-word character |
| `\s` | `[ \t\n\r\f\v]` | Any whitespace |
| `\S` | `[^ \t\n\r\f\v]` | Any non-whitespace |

#### The Dot (`.`)

The dot matches **any single character except newline** (unless the `s`/dotall flag is set).

```
Pattern:  a.c
Text:     abc a1c a c a\nc
Matches:  ^^^ ^^^ ^^^        (not a\nc unless dotall)
```

---

### Anchors

Anchors match **positions**, not characters. They are zero-width — they do not consume any text.

| Anchor | Position |
|--------|----------|
| `^` | Start of string (or start of line with `m` flag) |
| `$` | End of string (or end of line with `m` flag) |
| `\b` | Word boundary |
| `\B` | Non-word boundary |
| `\A` | Absolute start of string (ignores multiline) |
| `\Z` | Absolute end of string (ignores multiline) |

#### Word Boundaries

A word boundary `\b` occurs at the position between a word character (`\w`) and a non-word character (`\W`), or at the start/end of the string if it begins/ends with a word character.

```
Pattern:  \bcat\b
Text:     the cat sat on the caterpillar concatenate
Matches:      ^^^                     (only the standalone word)
```

Without `\b`, the pattern `cat` would also match inside "caterpillar" and "concatenate."

```
Pattern:  \Bcat\B
Text:     concatenate
Matches:      ^^^      (cat NOT at a word boundary)
```

---

### Quantifiers

Quantifiers control how many times the preceding element must occur.

| Quantifier | Meaning | Example |
|-----------|---------|---------|
| `*` | 0 or more | `ab*c` matches `ac`, `abc`, `abbc` |
| `+` | 1 or more | `ab+c` matches `abc`, `abbc` (not `ac`) |
| `?` | 0 or 1 | `colou?r` matches `color` and `colour` |
| `{n}` | Exactly n | `\d{4}` matches `2026` |
| `{n,}` | n or more | `\d{2,}` matches `12`, `123`, `1234` |
| `{n,m}` | Between n and m | `\d{2,4}` matches `12`, `123`, `1234` |

```
Pattern:  \d{3}-\d{4}
Text:     Call 555-1234 today
Match:         ^^^^^^^^
```

---

### Greedy vs Lazy vs Possessive Quantifiers

This is one of the most important concepts in regex, and the source of countless bugs.

#### Greedy (Default)

Greedy quantifiers match **as much as possible**, then backtrack if the rest of the pattern fails.

```
Pattern:  ".+"
Text:     She said "hello" and "goodbye"
Match:             ^^^^^^^^^^^^^^^^^^^^^^   (too much!)
```

The `".+"` greedily consumes from the first `"` to the LAST `"`, capturing `"hello" and "goodbye"`.

#### Lazy (Reluctant)

Add `?` after the quantifier to make it lazy — it matches **as little as possible**.

```
Pattern:  ".+?"
Text:     She said "hello" and "goodbye"
Match 1:          ^^^^^^^
Match 2:                      ^^^^^^^^^
```

| Greedy | Lazy |
|--------|------|
| `*` | `*?` |
| `+` | `+?` |
| `?` | `??` |
| `{n,m}` | `{n,m}?` |

#### Possessive

Add `+` after the quantifier to make it possessive — it matches **as much as possible and never backtracks**. Available in Java, PCRE, and some other engines (not JavaScript or Python's `re` module).

| Greedy | Possessive |
|--------|-----------|
| `*` | `*+` |
| `+` | `++` |
| `?` | `?+` |

```
Pattern:  ".*+"    (possessive)
Text:     "hello"
Result:   No match! The .* consumes everything including the closing ",
          and possessive means it will NOT give back the " for the
          trailing literal " to match.
```

Possessive quantifiers are used to **prevent catastrophic backtracking** when you know backtracking cannot lead to a match. We will cover this in detail in the Performance section.

::: tip Key Takeaway
Default quantifiers are greedy. If your regex matches too much text, try the lazy version (`*?`, `+?`). If you need to prevent backtracking for performance, use possessive (`*+`, `++`) or atomic groups.
:::

---

## Part 2: Grouping and Capturing

### Capturing Groups

Parentheses `()` create a **capturing group**. The engine remembers the text matched by the group so you can reference it later.

```
Pattern:  (\d{4})-(\d{2})-(\d{2})
Text:     2026-04-04
Group 0:  2026-04-04    (entire match)
Group 1:  2026          (year)
Group 2:  04            (month)
Group 3:  04            (day)
```

Groups are numbered left-to-right by their opening parenthesis, starting at 1. Group 0 is always the entire match.

#### Nested Groups

```
Pattern:  ((a)(b(c)))
Text:     abc
Group 1:  abc      (outermost)
Group 2:  a
Group 3:  bc
Group 4:  c        (innermost)
```

Count the opening parentheses left-to-right: `(` at position 1, `(` at position 2, `(` at position 3 containing `b(c)`.

### Non-Capturing Groups

If you need grouping for alternation or quantifiers but do not need to capture the text, use `(?:...)`. This avoids the overhead of saving the match.

```
Pattern:  (?:https?|ftp)://(\S+)
Text:     https://example.com
Group 1:  example.com    (only the URL part is captured)
```

Non-capturing groups do not get a group number.

### Named Capturing Groups

Instead of referencing groups by number, you can give them names. This makes your regex self-documenting.

| Syntax | Engine |
|--------|--------|
| `(?P<name>...)` | Python, PCRE |
| `(?<name>...)` | JavaScript (ES2018+), .NET, Java 7+, PCRE |

```
Pattern:  (?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})
Text:     2026-04-04
year:     2026
month:    04
day:      04
```

### Backreferences

A backreference matches the **same text** that was previously matched by a capturing group.

| Syntax | Meaning |
|--------|---------|
| `\1` | Text matched by group 1 |
| `\2` | Text matched by group 2 |
| `\k<name>` | Text matched by named group |

#### Finding Repeated Words

```
Pattern:  \b(\w+)\s+\1\b
Text:     the the cat sat sat on on the mat
Match 1:  ^^^ ^^^
Match 2:              ^^^ ^^^
Match 3:                      ^^ ^^
```

The `\1` does NOT mean "the same pattern again." It means "the exact same text that group 1 matched." If group 1 matched `the`, then `\1` matches only the literal string `the`.

#### Matching Paired HTML Tags

```
Pattern:  <([a-z]+)>.*?</\1>
Text:     <b>bold</b> and <i>italic</i>
Match 1:  ^^^^^^^^^^^
Match 2:                  ^^^^^^^^^^^^^^^
```

The `\1` ensures the closing tag matches the opening tag.

### Alternation

The pipe `|` acts as an OR operator. It has the **lowest precedence** of all regex operators.

```
Pattern:  cat|dog
Text:     I have a cat and a dog
Match 1:         ^^^
Match 2:                   ^^^
```

Use groups to limit the scope of alternation:

```
Pattern:  gr(a|e)y
Text:     gray grey
Match 1:  ^^^^
Match 2:       ^^^^

Pattern:  (Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day
```

Without the parentheses, `cat|dog` means "the entire string `cat` OR the entire string `dog`," not "ca" followed by "t or d" followed by "og."

---

## Part 3: Lookaround

Lookaround assertions check for patterns **without consuming characters**. They are zero-width — after the check, the engine's position in the text does not advance.

### Lookahead

| Syntax | Name | Meaning |
|--------|------|---------|
| `(?=...)` | Positive lookahead | What follows must match |
| `(?!...)` | Negative lookahead | What follows must NOT match |

```
Pattern:  \d+(?= dollars)
Text:     I have 100 dollars and 50 euros
Match:           ^^^
```

The `(?= dollars)` checks that " dollars" follows, but does not include it in the match. The match is just `100`.

```
Pattern:  \d+(?! dollars)
Text:     I have 100 dollars and 50 euros
Match:                           ^^
```

The negative lookahead rejects `100` because it IS followed by " dollars," and matches `50` instead.

### Lookbehind

| Syntax | Name | Meaning |
|--------|------|---------|
| `(?<=...)` | Positive lookbehind | What precedes must match |
| `(?<!...)` | Negative lookbehind | What precedes must NOT match |

```
Pattern:  (?<=\$)\d+
Text:     Price: $42 and 50 units
Match:           ^^
```

The `(?<=\$)` checks that a `$` sign precedes the digits, but the `$` is not part of the match.

```
Pattern:  (?<!\$)\b\d+\b
Text:     Price: $42 and 50 units
Match:                   ^^
```

The negative lookbehind excludes `42` because it IS preceded by `$`.

::: warning
**Lookbehind restrictions vary by engine:**
- JavaScript (modern V8/SpiderMonkey): variable-length lookbehind supported
- Python `re` module: fixed-length only (use `regex` module for variable-length)
- Java: limited variable-length (finite/obvious alternations)
- Go `regexp`: no lookaround at all (RE2 engine)
- PCRE: variable-length via alternation of fixed-length branches
:::

### Practical Lookaround Examples

#### Password Validation

Validate that a password has at least 8 characters, one uppercase, one lowercase, one digit, and one special character — all using lookahead:

```
^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$
```

Breaking it down:

| Part | Purpose |
|------|---------|
| `^` | Start of string |
| `(?=.*[A-Z])` | At least one uppercase letter somewhere |
| `(?=.*[a-z])` | At least one lowercase letter somewhere |
| `(?=.*\d)` | At least one digit somewhere |
| `(?=.*[!@#$%^&*])` | At least one special character somewhere |
| `.{8,}` | At least 8 characters total |
| `$` | End of string |

Each lookahead starts from the same position (the beginning) and scans forward independently. None of them consume any characters, so they stack.

#### Parsing Without Consuming: Extract Numbers Before Units

```
Pattern:  \d+(?=\s*(?:px|em|rem|%))
Text:     font-size: 16px; margin: 1.5rem; width: 100%
Match 1:            ^^
Match 2:                         ^^^     (wait — 1.5 has a dot)
```

Better pattern accounting for decimals:

```
Pattern:  [\d.]+(?=\s*(?:px|em|rem|%))
Match 1:  16
Match 2:  1.5
Match 3:  100
```

#### Comma-Separated Number Formatting

Insert commas into large numbers using lookahead and lookbehind:

```
Pattern:  (?<=\d)(?=(\d{3})+(?!\d))
Replace:  ,
Text:     1234567890
Result:   1,234,567,890
```

This matches the zero-width position between digits where the number of digits to the right is a multiple of 3. One of the most elegant regex tricks.

---

## Part 4: Advanced Techniques

### Atomic Groups

An atomic group `(?>...)` works like a regular group, but once the engine exits it, it **discards all backtracking positions** created inside the group. If a later part of the pattern fails, the engine cannot go back and try different alternatives within the atomic group.

```
Pattern:  (?>a|ab)c
Text:     abc
Result:   No match! The engine matches "a" inside the atomic group,
          exits, then fails on "c" (because "b" is next). Since the
          group is atomic, it cannot go back and try "ab" instead.
```

With a normal group `(a|ab)c`, the engine would backtrack and try the `ab` alternative, finding a match.

Atomic groups are supported in PCRE, Java, .NET, and Rust. They are not available in JavaScript or Python's `re` module.

### Possessive Quantifiers (Revisited)

A possessive quantifier is equivalent to wrapping the quantified element in an atomic group:

```
a*+    is equivalent to    (?>a*)
\d++   is equivalent to    (?>\d+)
```

Use possessive quantifiers when you know that backtracking within the quantified part can never lead to an overall match. This is most useful for preventing catastrophic backtracking.

### Recursive Patterns

Some regex engines (PCRE, Perl, .NET) support recursive patterns for matching nested structures.

#### Matching Balanced Parentheses (PCRE)

```
\((?:[^()]*|(?R))*\)
```

Breaking it down:

| Part | Purpose |
|------|---------|
| `\(` | Match opening parenthesis |
| `(?:` | Start non-capturing group |
| `[^()]*` | Match any non-parenthesis characters |
| `\|` | OR |
| `(?R)` | Recurse — match the entire pattern again |
| `)*` | End group, zero or more times |
| `\)` | Match closing parenthesis |

```
Text:     (a(b(c)d)e)
Match:    ^^^^^^^^^^^   (entire balanced expression)
```

#### Named Recursion for Specific Subpatterns

```
(?<parens>\((?:[^()]*|(?&parens))*\))
```

Here `(?&parens)` recurses into the named group `parens` specifically.

::: warning
Recursive patterns are not available in JavaScript, Python's `re` module, Go, or Rust's `regex` crate. Use a proper parser (stack-based) for nested structures in those languages.
:::

### Conditional Patterns

Some engines support `(?(condition)then|else)` syntax.

```
Pattern:  (\()?\d{3}(?(1)\)|-)\d{3}-\d{4}
```

This matches phone numbers in two formats:
- `(555)123-4567` — if the opening `(` was present, require closing `)`
- `555-123-4567` — if no opening `(`, require a `-`

| Part | Purpose |
|------|---------|
| `(\()?` | Optionally capture an opening parenthesis (group 1) |
| `\d{3}` | Three digits (area code) |
| `(?(1)\|-)` | If group 1 matched, expect `)`, otherwise expect `-` |
| `\d{3}-\d{4}` | Remaining digits |

Conditional patterns are supported in PCRE, .NET, Python, and Perl. Not available in JavaScript, Go, or Rust.

### Unicode Support

Modern regex engines support Unicode character properties with `\p{...}` and its negation `\P{...}`.

| Pattern | Matches |
|---------|---------|
| `\p{L}` | Any Unicode letter (Latin, Greek, Cyrillic, CJK, ...) |
| `\p{Lu}` | Uppercase letter |
| `\p{Ll}` | Lowercase letter |
| `\p{N}` | Any Unicode number |
| `\p{P}` | Any punctuation |
| `\p{S}` | Any symbol |
| `\p{Z}` | Any separator (spaces, line/paragraph separators) |
| `\p{Script=Greek}` | Characters in the Greek script |
| `\p{Script=Han}` | CJK characters |
| `\p{Emoji}` | Emoji characters |

```
Pattern:  \p{L}+
Text:     Hello Мир 世界 مرحبا
Matches:  Hello, Мир, 世界, مرحبا
```

::: tip
Using `\p{L}` instead of `[a-zA-Z]` makes your regex work correctly with non-Latin scripts. This matters for international applications.
:::

**Engine support:**
- JavaScript: use the `u` flag (`/\p{L}+/u`)
- Python: `regex` module (not `re`)
- Java: supported natively
- Go: `regexp` supports Unicode categories
- Rust: `regex` crate supports Unicode by default

### Flags (Modifiers)

| Flag | Name | Effect |
|------|------|--------|
| `g` | Global | Find all matches, not just the first (JS-specific; other languages use "find all" functions) |
| `i` | Case-insensitive | `a` matches `A` and `a` |
| `m` | Multiline | `^` and `$` match at line boundaries, not just string boundaries |
| `s` | Dotall / Single-line | `.` matches newline characters too |
| `u` | Unicode | Enable full Unicode matching (required in JS for `\p{...}`) |
| `x` | Extended / Verbose | Ignore unescaped whitespace and allow `#` comments |

#### The `x` Flag: Self-Documenting Regex

The verbose/extended flag is invaluable for complex patterns:

```python
import re

url_pattern = re.compile(r"""
    ^
    (?P<protocol>https?|ftp)    # Protocol
    ://                          # Separator
    (?P<domain>                  # Domain name
        [a-zA-Z0-9]             #   starts with alphanumeric
        [a-zA-Z0-9.-]*          #   middle can have dots and hyphens
        [a-zA-Z0-9]             #   ends with alphanumeric
    )
    (?::(?P<port>\d{1,5}))?     # Optional port number
    (?P<path>/[^\s?#]*)?        # Optional path
    (?:\?(?P<query>[^\s#]*))?   # Optional query string
    (?:\#(?P<fragment>\S*))?    # Optional fragment
    $
""", re.VERBOSE)
```

This is dramatically more readable than the single-line equivalent, and the comments serve as documentation.

#### Inline Flags

You can enable flags for part of a pattern using `(?flags:...)`:

```
(?i:error|warning|critical):\s+(.+)
```

This makes the keywords case-insensitive but keeps the rest of the pattern case-sensitive.

---

## Part 5: Regex in Different Languages

### JavaScript

```javascript
// Two ways to create a regex
const re1 = /\d+/g;                      // Literal syntax
const re2 = new RegExp('\\d+', 'g');     // Constructor (note double backslash)

// Testing for a match
/^\d+$/.test('42');                       // true

// Finding the first match
'abc 123 def 456'.match(/\d+/);          // ['123', index: 4, ...]

// Finding all matches
'abc 123 def 456'.match(/\d+/g);         // ['123', '456']

// matchAll — returns iterator with capture groups (ES2020)
const text = 'born: 1990, died: 2060';
for (const m of text.matchAll(/(\w+):\s*(\d+)/g)) {
  console.log(m[1], m[2]);
  // 'born' '1990'
  // 'died' '2060'
}

// Replace
'hello world'.replace(/world/, 'regex');  // 'hello regex'
'aabba'.replace(/a/g, 'x');              // 'xxbbx'

// replaceAll (ES2021) — no need for /g flag
'aabba'.replaceAll('a', 'x');            // 'xxbbx'

// Named groups (ES2018)
const dateRe = /(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/;
const result = '2026-04-04'.match(dateRe);
console.log(result.groups.year);          // '2026'
console.log(result.groups.month);         // '04'

// Named groups in replace
'2026-04-04'.replace(
  /(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/,
  '$<month>/$<day>/$<year>'
);
// '04/04/2026'

// Split with regex
'one,  two;three'.split(/[,;]\s*/);       // ['one', 'two', 'three']
```

::: warning
JavaScript's `match` with the `g` flag returns only the matched strings, not capture groups. Use `matchAll` to get capture groups for all matches.
:::

### Python

```python
import re

# search — first match anywhere in string
m = re.search(r'\d+', 'abc 123 def 456')
m.group()       # '123'
m.start()       # 4
m.end()         # 7

# match — only at the BEGINNING of the string
re.match(r'\d+', 'abc 123')    # None (does not start with digits)
re.match(r'\d+', '123 abc')    # Match object for '123'

# fullmatch — entire string must match (Python 3.4+)
re.fullmatch(r'\d+', '123')    # Match
re.fullmatch(r'\d+', '123x')   # None

# findall — all non-overlapping matches
re.findall(r'\d+', 'a1 b22 c333')    # ['1', '22', '333']

# findall with groups — returns list of tuples
re.findall(r'(\w+)=(\d+)', 'x=1 y=2')  # [('x', '1'), ('y', '2')]

# finditer — iterator of match objects
for m in re.finditer(r'\d+', 'a1 b2'):
    print(m.group(), m.span())
# '1' (1, 2)
# '2' (4, 5)

# sub — substitution
re.sub(r'\d+', 'N', 'a1 b2')    # 'aN bN'

# sub with function
re.sub(r'\d+', lambda m: str(int(m.group()) * 2), 'a1 b2')  # 'a2 b4'

# compile — precompile for repeated use
pattern = re.compile(r'(?P<key>\w+)=(?P<val>\d+)')
for m in pattern.finditer('x=1 y=2 z=3'):
    print(f"{m.group('key')} -> {m.group('val')}")

# Named groups use (?P<name>...) syntax in Python
m = re.search(r'(?P<year>\d{4})-(?P<month>\d{2})', '2026-04')
m.group('year')     # '2026'
m.groupdict()       # {'year': '2026', 'month': '04'}

# VERBOSE flag for readable patterns
pattern = re.compile(r"""
    (?P<protocol>https?|ftp)    # protocol
    ://                          # separator
    (?P<host>[^/\s:]+)          # hostname
    (?::(?P<port>\d+))?         # optional port
    (?P<path>/\S*)?             # optional path
""", re.VERBOSE | re.IGNORECASE)
```

### Java

```java
import java.util.regex.*;

// Compile a pattern
Pattern pattern = Pattern.compile("(\\d{4})-(\\d{2})-(\\d{2})");
Matcher matcher = pattern.matcher("Today is 2026-04-04");

// Find and extract groups
if (matcher.find()) {
    System.out.println(matcher.group(0));  // "2026-04-04"
    System.out.println(matcher.group(1));  // "2026"
    System.out.println(matcher.group(2));  // "04"
}

// Named groups (Java 7+)
Pattern p = Pattern.compile("(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})");
Matcher m = p.matcher("2026-04-04");
if (m.find()) {
    System.out.println(m.group("year"));   // "2026"
}

// Find all matches
Pattern digits = Pattern.compile("\\d+");
Matcher dm = digits.matcher("a1 b22 c333");
while (dm.find()) {
    System.out.println(dm.group());  // "1", "22", "333"
}

// Replace
"a1 b2".replaceAll("\\d+", "N");         // "aN bN"

// Split
"one, two; three".split("[,;]\\s*");      // ["one", "two", "three"]

// Flags
Pattern.compile("hello", Pattern.CASE_INSENSITIVE | Pattern.MULTILINE);

// Possessive quantifiers and atomic groups are supported
Pattern.compile("\\d++");        // Possessive
Pattern.compile("(?>\\d+)");    // Atomic group
```

::: tip
Java requires double backslashes in string literals: `\\d` instead of `\d`. Use text blocks (Java 13+) to reduce escaping: `Pattern.compile("""\d+""")`.
:::

### Go

```go
package main

import (
    "fmt"
    "regexp"
)

func main() {
    // Compile — returns (*Regexp, error)
    re, err := regexp.Compile(`\d+`)
    if err != nil {
        panic(err)
    }

    // MustCompile — panics on invalid pattern
    re = regexp.MustCompile(`\d+`)

    // Match testing
    fmt.Println(re.MatchString("abc 123"))   // true

    // Find first match
    fmt.Println(re.FindString("abc 123 def 456"))  // "123"

    // Find all matches
    fmt.Println(re.FindAllString("a1 b22 c333", -1))
    // ["1", "22", "333"]

    // Submatch (capture groups)
    re2 := regexp.MustCompile(`(\w+)=(\d+)`)
    match := re2.FindStringSubmatch("key=42")
    // match[0] = "key=42", match[1] = "key", match[2] = "42"

    // Named groups
    re3 := regexp.MustCompile(`(?P<name>\w+)=(?P<value>\d+)`)
    match = re3.FindStringSubmatch("port=8080")
    for i, name := range re3.SubexpNames() {
        if i != 0 && name != "" {
            fmt.Printf("%s: %s\n", name, match[i])
        }
    }
    // name: port
    // value: 8080

    // Replace
    fmt.Println(re.ReplaceAllString("a1 b2", "N"))  // "aN bN"

    // Replace with function
    result := re.ReplaceAllStringFunc("a1 b2", func(s string) string {
        return "[" + s + "]"
    })
    fmt.Println(result)  // "a[1] b[2]"
}
```

::: danger
Go's `regexp` package uses the **RE2 engine**, which deliberately omits lookahead, lookbehind, backreferences, and possessive quantifiers. This is a design choice: RE2 guarantees linear-time matching, making it safe against ReDoS attacks. If you need these features in Go, use a PCRE binding like `github.com/GijsvanDulmen/go-pcre` or restructure your pattern.
:::

### Rust

```rust
use regex::Regex;

fn main() {
    // Create a regex (compile once, reuse)
    let re = Regex::new(r"\d+").unwrap();

    // Test for a match
    assert!(re.is_match("abc 123"));

    // Find first match
    if let Some(m) = re.find("abc 123 def") {
        println!("{}", m.as_str());  // "123"
        println!("{}..{}", m.start(), m.end());  // 4..7
    }

    // Find all matches
    let matches: Vec<&str> = re.find_iter("a1 b22 c333")
        .map(|m| m.as_str())
        .collect();
    // ["1", "22", "333"]

    // Capture groups
    let re = Regex::new(r"(?P<key>\w+)=(?P<val>\d+)").unwrap();
    for caps in re.captures_iter("x=1 y=2 z=3") {
        println!("{} -> {}", &caps["key"], &caps["val"]);
    }
    // x -> 1
    // y -> 2
    // z -> 3

    // Replace
    let result = re.replace_all("x=1 y=2", "$key:$val");
    println!("{}", result);  // "x:1 y:2"

    // Replace with closure
    let re = Regex::new(r"\d+").unwrap();
    let result = re.replace_all("a1 b2", |caps: &regex::Captures| {
        format!("[{}]", &caps[0])
    });
    println!("{}", result);  // "a[1] b[2]"
}
```

Rust's `regex` crate, like Go's `regexp`, uses a finite automaton engine. It does **not** support lookaround or backreferences. For those features, use the `fancy-regex` crate:

```rust
use fancy_regex::Regex;

let re = Regex::new(r"(?<=@)\w+\.\w+").unwrap();  // Lookbehind works!
```

### SQL

Regex support varies wildly across SQL databases.

| Database | Syntax | Example |
|----------|--------|---------|
| PostgreSQL | `~` (match), `~*` (case-insensitive), `!~` (not match) | `WHERE name ~ '^[A-Z]'` |
| PostgreSQL | `SIMILAR TO` (SQL standard, limited) | `WHERE name SIMILAR TO '[A-Z]%'` |
| MySQL | `REGEXP` or `RLIKE` | `WHERE name REGEXP '^[A-Z]'` |
| SQLite | `REGEXP` (requires extension) | Needs `regexp` function loaded |
| Oracle | `REGEXP_LIKE`, `REGEXP_REPLACE`, `REGEXP_SUBSTR` | `WHERE REGEXP_LIKE(name, '^[A-Z]')` |
| SQL Server | No native regex | Use `LIKE` patterns or CLR functions |

```sql
-- PostgreSQL: find emails in a column
SELECT * FROM users
WHERE email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$';

-- PostgreSQL: extract domain from email
SELECT (regexp_match(email, '@(.+)$'))[1] AS domain
FROM users;

-- MySQL: find rows where name starts with a vowel
SELECT * FROM users
WHERE name REGEXP '^[aeiouAEIOU]';

-- Oracle: replace multiple spaces with a single space
SELECT REGEXP_REPLACE(text, '\s{2,}', ' ') FROM documents;
```

::: warning
`LIKE` is NOT regex. `LIKE` supports only `%` (any sequence of characters) and `_` (any single character). Use `REGEXP`/`~` when you need real pattern matching.
:::

---

## Part 6: Performance

### How Regex Engines Work

There are two fundamental engine types:

**NFA (Nondeterministic Finite Automaton)** — used by most languages (Perl, Python, Java, JavaScript, .NET, PCRE). The NFA engine tries alternatives one at a time, using backtracking when a path fails. This enables features like backreferences and lookaround, but can suffer from exponential backtracking.

**DFA (Deterministic Finite Automaton)** — used by Go (`regexp`) and Rust (`regex`). The DFA engine processes all possible states simultaneously. It guarantees linear-time matching O(n) regardless of the pattern, but cannot support backreferences or lookaround.

| Feature | NFA | DFA |
|---------|-----|-----|
| Backreferences | Yes | No |
| Lookaround | Yes | No |
| Possessive quantifiers | Yes | N/A |
| Catastrophic backtracking | Possible | Impossible |
| Time complexity | O(2^n) worst case | O(n) guaranteed |
| Common engines | PCRE, Python, Java, JS | RE2, Go, Rust |

### Catastrophic Backtracking (ReDoS)

**ReDoS** (Regular Expression Denial of Service) occurs when a regex takes exponential time on certain inputs.

#### The Classic Example

```
Pattern:  (a+)+$
Input:    aaaaaaaaaaaaaaaaX
```

Why is this catastrophic? The engine must decide how to divide the `a` characters among the inner `a+` and the outer `()+`. For each `a`, there are 2 choices (assign it to the current repetition or start a new one). With 16 `a` characters, that is 2^16 = 65,536 combinations to try before failing.

**Timing:**

| Input length | Combinations | Approximate time |
|-------------|-------------|-----------------|
| 10 a's + X | 2^10 = 1,024 | instant |
| 20 a's + X | 2^20 = 1,048,576 | noticeable |
| 30 a's + X | 2^30 = ~1 billion | seconds |
| 40 a's + X | 2^40 = ~1 trillion | hours |
| 50 a's + X | 2^50 | heat death of universe |

#### Patterns That Cause Backtracking

Watch out for these structures:

```
(a+)+          Nested quantifiers on overlapping patterns
(a|aa)+        Alternation with overlapping options
(.*a){10}      Greedy quantifier with repetition
(\w+\s*)+      Common in real code — dangerous on long strings without matches
```

#### How to Fix

1. **Make quantifiers possessive:** `(a++)+` or `(?>a+)+` (atomic group)
2. **Remove nesting:** `a+` instead of `(a+)+`
3. **Use a DFA engine** (Go, Rust) for untrusted patterns
4. **Set timeouts** on regex execution
5. **Limit input length** before applying regex

### Writing Efficient Patterns

| Tip | Example |
|-----|---------|
| Anchor when possible | `^\d{4}-\d{2}-\d{2}$` vs `\d{4}-\d{2}-\d{2}` |
| Put the most likely alternative first | `(?:com\|org\|net)` if `.com` is most common |
| Use character classes over alternation | `[aeiou]` vs `(?:a\|e\|i\|o\|u)` |
| Avoid `.* ` at the start of patterns | Forces the engine to try every position |
| Use non-capturing groups when not capturing | `(?:...)` vs `(...)` |
| Compile and reuse patterns | Avoid recompilation in loops |
| Use possessive quantifiers for known-safe consumption | `\d++` when digits cannot be part of a later match |
| Prefer specific patterns over broad ones | `[a-zA-Z]+` vs `.+` |

### When to Avoid Regex Entirely

Regex is the wrong tool when:

- **Parsing nested structures** (HTML, XML, JSON, programming languages) — use a proper parser
- **The pattern is too complex to read** — if you cannot explain it in 30 seconds, refactor into code
- **Simple string operations suffice** — `str.startswith()`, `str.contains()`, `str.split()` are faster and clearer
- **You need to maintain state** — regex is stateless between matches; use a state machine or parser
- **Performance is critical and input is untrusted** — use a DFA engine or a dedicated parser

::: tip Key Takeaway
Regex is a tool, not a religion. Use it when it makes code simpler and safer. Replace it when it makes code fragile or unreadable.
:::

---

## Part 7: Common Patterns (With Explanations)

### Email Validation

The "simple" version that works for 99% of real addresses:

```
^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$
```

| Part | Matches |
|------|---------|
| `^` | Start of string |
| `[a-zA-Z0-9._%+-]+` | Local part (letters, digits, dots, underscores, %, +, -) |
| `@` | Literal @ sign |
| `[a-zA-Z0-9.-]+` | Domain name |
| `\.` | Literal dot |
| `[a-zA-Z]{2,}` | TLD (at least 2 letters) |
| `$` | End of string |

::: danger Misconception: "I can write the perfect email regex"
The RFC 5322 compliant email regex is over 6,000 characters long and handles edge cases like quoted strings in the local part (`"john doe"@example.com`) and IP address domains (`user@[192.168.1.1]`). In practice, the simple version above plus actually sending a confirmation email is the correct approach. Do not try to validate email addresses perfectly with regex.
:::

### URL Parsing

```
^(?P<scheme>https?|ftp)://
(?P<host>[a-zA-Z0-9.-]+)
(?::(?P<port>\d{1,5}))?
(?P<path>/[^\s?#]*)?
(?:\?(?P<query>[^\s#]*))?
(?:#(?P<fragment>\S*))?$
```

For production use, use your language's built-in URL parser (`new URL()` in JS, `urllib.parse` in Python). Regex is fine for quick extraction but misses edge cases.

### IPv4 Address

Naive version (matches invalid octets like 999):

```
\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}
```

Correct version (each octet 0-255):

```
\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b
```

Breaking down the octet pattern `25[0-5]|2[0-4]\d|[01]?\d\d?`:

| Branch | Range |
|--------|-------|
| `25[0-5]` | 250-255 |
| `2[0-4]\d` | 200-249 |
| `[01]?\d\d?` | 0-199 |

### IPv6 Address

Full form (simplified — does not handle all abbreviation forms):

```
(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}
```

A production-grade IPv6 regex that handles `::` abbreviation is extremely complex. Use your language's networking library instead.

### Phone Numbers (US)

```
(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}
```

This matches: `555-123-4567`, `(555) 123-4567`, `+1 555.123.4567`, `5551234567`

| Part | Matches |
|------|---------|
| `(?:\+1[-.\s]?)?` | Optional country code (+1) with optional separator |
| `\(?` | Optional opening parenthesis |
| `\d{3}` | Area code |
| `\)?` | Optional closing parenthesis |
| `[-.\s]?` | Optional separator |
| `\d{3}` | Exchange |
| `[-.\s]?` | Optional separator |
| `\d{4}` | Subscriber number |

### Date Formats

ISO date (YYYY-MM-DD) with validation:

```
(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])
```

| Part | Matches |
|------|---------|
| `(?:19\|20)\d{2}` | Year 1900-2099 |
| `(?:0[1-9]\|1[0-2])` | Month 01-12 |
| `(?:0[1-9]\|[12]\d\|3[01])` | Day 01-31 |

This does not validate that February has at most 28/29 days or that April has 30. For true date validation, parse the match with a date library.

### CSV Field Extraction

```
(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))
```

This handles:
- Simple fields: `value`
- Quoted fields: `"value with, comma"`
- Escaped quotes: `"value with ""quotes"" inside"`

CSV parsing with regex is fragile. Use a proper CSV parser for production code.

### Log Parsing

#### Apache/Nginx Combined Log Format

```
^(?P<ip>\S+)\s+\S+\s+(?P<user>\S+)\s+
\[(?P<time>[^\]]+)\]\s+
"(?P<method>\S+)\s+(?P<path>\S+)\s+(?P<proto>[^"]+)"\s+
(?P<status>\d{3})\s+
(?P<size>\d+|-)\s+
"(?P<referer>[^"]*)"\s+
"(?P<agent>[^"]*)"
```

Example log line:

```
192.168.1.1 - frank [10/Oct/2025:13:55:36 -0700] "GET /index.html HTTP/1.1" 200 2326 "http://example.com" "Mozilla/5.0"
```

#### JSON Log Lines

For structured JSON logs, do NOT use regex. Use `JSON.parse()` / `json.loads()`. Regex is for when you need to quickly grep through files and extract one field:

```
"level"\s*:\s*"(?P<level>[^"]+)"
```

### HTML Tag Matching

Simple self-closing or paired tags:

```
<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*(?:>(.*?)</\1>|/>)
```

::: danger Misconception: "Regex can parse HTML"
This is perhaps the most famous misconception in programming. HTML is not a regular language — it has arbitrary nesting, optional closing tags, attributes with `>` characters, CDATA sections, comments, and more. The classic Stack Overflow answer on this topic is legendary for a reason. Use a DOM parser (DOMParser in JS, BeautifulSoup in Python, jsoup in Java). Regex is acceptable only for extracting data from a known, controlled HTML fragment.
:::

---

## Part 8: Worked Examples

These exercises build up patterns piece by piece. Try solving each step before reading the solution.

### Exercise 1: Match a Hex Color Code

**Goal:** Match CSS hex colors like `#fff`, `#FF00AA`, `#123abc`

**Step 1:** Match the `#` prefix

```
#
```

**Step 2:** Match exactly 6 hex digits after `#`

```
#[0-9a-fA-F]{6}
```

**Step 3:** Also match 3-digit shorthand (`#fff`)

```
#[0-9a-fA-F]{3}
```

**Step 4:** Combine both — match 3 OR 6 digits (check 6 first since 3 is a prefix of 6)

```
#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})
```

**Step 5:** Add word boundary to avoid matching `#1234567` as `#123456`

```
#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b
```

**Final pattern:**

```
#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b
```

### Exercise 2: Extract Key-Value Pairs

**Goal:** From `"name=Alice age=30 city=NYC"`, extract keys and values.

**Step 1:** Match a key (word characters)

```
\w+
```

**Step 2:** Match key=value

```
\w+=\w+
```

**Step 3:** Capture key and value separately

```
(\w+)=(\w+)
```

**Step 4:** Handle values with spaces (quoted): `name="Alice Smith"`

```
(\w+)=(?:"([^"]+)"|(\w+))
```

**Step 5:** Use named groups for clarity

```
(?P<key>\w+)=(?:"(?P<qval>[^"]+)"|(?P<val>\w+))
```

### Exercise 3: Validate an IP Address

**Goal:** Match valid IPv4 addresses (0.0.0.0 to 255.255.255.255)

**Step 1:** Match the naive version

```
\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}
```

**Step 2:** Constrain each octet. An octet is 0-255. Break it down:

- `250-255`: `25[0-5]`
- `200-249`: `2[0-4]\d`
- `0-199`: `[01]?\d\d?` (optional leading 0 or 1, one or two digits)

```
(?:25[0-5]|2[0-4]\d|[01]?\d\d?)
```

**Step 3:** Repeat 4 times with dots between

```
(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}
```

**Step 4:** Add word boundaries and anchors

```
^(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$
```

### Exercise 4: Parse a URL

**Goal:** Extract scheme, host, port, path, and query from a URL.

**Step 1:** Match the scheme

```
https?://
```

**Step 2:** Match the host

```
https?://([^/:]+)
```

**Step 3:** Optional port

```
https?://([^/:]+)(?::(\d+))?
```

**Step 4:** Optional path

```
https?://([^/:]+)(?::(\d+))?(/[^?#]*)?
```

**Step 5:** Optional query string

```
https?://([^/:]+)(?::(\d+))?(/[^?#]*)?(?:\?([^#]*))?
```

**Step 6:** Add named groups

```
(?P<scheme>https?)://(?P<host>[^/:]+)(?::(?P<port>\d+))?(?P<path>/[^?#]*)?(?:\?(?P<query>[^#]*))?
```

### Exercise 5: Find Duplicate Words

**Goal:** Find repeated adjacent words like "the the" or "is is".

**Step 1:** Match a word

```
\b\w+\b
```

**Step 2:** Capture it

```
\b(\w+)\b
```

**Step 3:** Match whitespace then the same word again

```
\b(\w+)\s+\1\b
```

**Step 4:** Make case-insensitive (catches "The the")

```
\b(\w+)\s+\1\b    with the i flag
```

**Test it:**

```
Text: "The the quick brown fox fox jumped"
Matches: "The the", "fox fox"
```

### Exercise 6: Password Strength Checker

**Goal:** Require 8+ chars, one uppercase, one lowercase, one digit, one special char.

**Step 1:** At least 8 characters

```
^.{8,}$
```

**Step 2:** Must contain an uppercase letter (lookahead)

```
^(?=.*[A-Z]).{8,}$
```

**Step 3:** Add lowercase requirement

```
^(?=.*[A-Z])(?=.*[a-z]).{8,}$
```

**Step 4:** Add digit requirement

```
^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$
```

**Step 5:** Add special character requirement

```
^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).{8,}$
```

### Exercise 7: Extract Markdown Links

**Goal:** From `[text](url)` extract the text and URL.

**Step 1:** Match the bracket structure

```
\[.*\]\(.*\)
```

**Step 2:** Make quantifiers lazy to avoid over-matching

```
\[.*?\]\(.*?\)
```

**Step 3:** Capture text and URL separately

```
\[([^\]]+)\]\(([^)]+)\)
```

Using negated character classes (`[^\]]` and `[^)]`) is more precise than lazy quantifiers here.

**Step 4:** Named groups

```
\[(?P<text>[^\]]+)\]\((?P<url>[^)]+)\)
```

**Test:**

```
Text:    See [Google](https://google.com) and [Docs](https://docs.example.com)
Match 1: text="Google", url="https://google.com"
Match 2: text="Docs", url="https://docs.example.com"
```

### Exercise 8: Validate a Semantic Version

**Goal:** Match semver strings like `1.0.0`, `2.3.1-beta.1`, `1.0.0+build.123`

**Step 1:** Major.minor.patch (digits only)

```
\d+\.\d+\.\d+
```

**Step 2:** No leading zeros (except for 0 itself)

```
(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)
```

**Step 3:** Optional pre-release suffix (`-alpha.1`)

```
(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?
```

**Step 4:** Optional build metadata (`+build.123`)

```
^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$
```

### Exercise 9: Match Balanced Quotes

**Goal:** Match single-quoted or double-quoted strings, handling escaped quotes.

**Step 1:** Match double-quoted strings (naive)

```
"[^"]*"
```

**Step 2:** Handle escaped quotes like `"say \"hello\""`

```
"(?:[^"\\]|\\.)*"
```

This reads: match `"`, then zero or more of (either a non-quote-non-backslash character, or a backslash followed by anything), then `"`.

**Step 3:** Support both single and double quotes

```
(["'])(?:[^"'\\]|\\.)*\1
```

Wait — this incorrectly disallows the other quote type inside the string. Better:

```
"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'
```

### Exercise 10: Build a Log Parser

**Goal:** Parse this Apache log format:

```
192.168.1.1 - admin [04/Apr/2026:10:30:00 +0000] "GET /api/users HTTP/1.1" 200 1234
```

**Step 1:** Match the IP address

```
(\S+)
```

**Step 2:** Skip the identity and user fields

```
(\S+)\s+\S+\s+(\S+)
```

**Step 3:** Match the timestamp in brackets

```
(\S+)\s+\S+\s+(\S+)\s+\[([^\]]+)\]
```

**Step 4:** Match the request line in quotes

```
(\S+)\s+\S+\s+(\S+)\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+([^"]+)"
```

**Step 5:** Match status code and response size

```
(\S+)\s+\S+\s+(\S+)\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+([^"]+)"\s+(\d{3})\s+(\d+|-)
```

**Step 6:** Named groups for the final pattern

```
(?P<ip>\S+)\s+\S+\s+(?P<user>\S+)\s+\[(?P<time>[^\]]+)\]\s+"(?P<method>\S+)\s+(?P<path>\S+)\s+(?P<proto>[^"]+)"\s+(?P<status>\d{3})\s+(?P<bytes>\d+|-)
```

**Python implementation:**

```python
import re

log_pattern = re.compile(r"""
    (?P<ip>\S+)\s+           # Client IP
    \S+\s+                    # Identity (usually -)
    (?P<user>\S+)\s+          # Authenticated user
    \[(?P<time>[^\]]+)\]\s+   # Timestamp
    "(?P<method>\S+)\s+       # HTTP method
     (?P<path>\S+)\s+         # Request path
     (?P<proto>[^"]+)"\s+     # Protocol
    (?P<status>\d{3})\s+      # Status code
    (?P<bytes>\d+|-)          # Response size
""", re.VERBOSE)

line = '192.168.1.1 - admin [04/Apr/2026:10:30:00 +0000] "GET /api/users HTTP/1.1" 200 1234'
m = log_pattern.match(line)
if m:
    print(m.groupdict())
    # {'ip': '192.168.1.1', 'user': 'admin', 'time': '04/Apr/2026:10:30:00 +0000',
    #  'method': 'GET', 'path': '/api/users', 'proto': 'HTTP/1.1',
    #  'status': '200', 'bytes': '1234'}
```

### Exercise 11: Comma-Format Large Numbers

**Goal:** Turn `1234567890` into `1,234,567,890`.

The trick uses lookahead to find positions where commas should be inserted:

```
Pattern:  (?<=\d)(?=(\d{3})+(?!\d))
Replace:  ,
```

**How it works:**

| Part | Purpose |
|------|---------|
| `(?<=\d)` | Position is preceded by a digit |
| `(?=` | Lookahead: what follows must be... |
| `(\d{3})+` | One or more groups of exactly 3 digits |
| `(?!\d)` | NOT followed by another digit (end of number) |
| `)` | End lookahead |

```
Text:     1234567890
Positions: 1,234,567,890
```

In JavaScript:

```javascript
'1234567890'.replace(/\d(?=(\d{3})+(?!\d))/g, '$&,');
// '1,234,567,890'
```

### Exercise 12: Strip HTML Tags

**Goal:** Remove all HTML tags from a string, keeping only text content.

```
Pattern:  <[^>]+>
Replace:  (empty string)
```

```
Input:   <p>Hello <b>world</b></p>
Output:  Hello world
```

This is safe for simple cases. For real HTML processing, always use a DOM parser — this regex fails on `<script>` contents, comments, and attributes containing `>`.

---

## Misconceptions

::: danger 5 Regex Misconceptions That Will Burn You

**1. "Regex can parse HTML."**
HTML is a context-free language with nesting, optional tags, and ambiguous syntax. Regex handles regular languages. You cannot reliably match nested `<div>` tags with regex. Use a DOM parser.

**2. "More complex regex = better."**
A 500-character regex that nobody can read is a maintenance nightmare. If your regex takes more than 30 seconds to explain, break it into multiple simpler patterns or use procedural code.

**3. "Regex is slow."**
Regex is fast when written well. A compiled regex for a simple pattern often outperforms hand-written character-by-character loops. The problem is catastrophic backtracking from poorly written patterns, not the technology itself.

**4. "The `g` flag means global in all languages."**
The `g` flag is a JavaScript concept. Python uses `findall()`/`finditer()`, Java uses `while (matcher.find())`, Go uses `FindAllString()`. Each language has its own API for finding all matches.

**5. "My email regex is RFC-compliant."**
It almost certainly is not. The full RFC 5322 grammar allows quoted strings, comments, IP address domains, and other constructs that nobody uses in practice. Validate with a simple pattern and send a confirmation email.
:::

---

## When NOT to Use Regex

Not every string problem needs regex. Here is a decision framework:

| Task | Use Regex? | Better Alternative |
|------|-----------|-------------------|
| Check if string starts with prefix | No | `str.startswith()` / `str.startsWith()` |
| Split on a fixed delimiter | No | `str.split(',')` |
| Simple string replacement | No | `str.replace('old', 'new')` |
| Parse JSON | No | `JSON.parse()` / `json.loads()` |
| Parse HTML/XML | No | DOM parser (BeautifulSoup, DOMParser) |
| Parse a programming language | No | Lexer/parser generator |
| Validate complex nested structures | No | Grammar-based parser |
| Extract fields from a known log format | Yes | Regex with named groups |
| Validate input format (email, phone) | Yes | Simple regex + library validation |
| Search-and-replace with patterns | Yes | Regex is designed for this |
| Route URL matching | Yes | But frameworks have built-in routers |

---

## Debug This: Fix These Broken Regexes

::: details Challenge 1: Email regex matches partial strings
**Broken pattern:**
```
[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}
```
**Problem:** `"!!!bad@email.com!!!"` matches `bad@email.com` inside the invalid string.

**Fix:** Add anchors.
```
^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$
```
:::

::: details Challenge 2: Greedy match captures too much
**Broken pattern:**
```
<.*>
```
**Input:** `<b>bold</b> and <i>italic</i>`
**Actual match:** `<b>bold</b> and <i>italic</i>` (everything)
**Expected:** Individual tags

**Fix:** Use lazy quantifier or negated character class.
```
<[^>]+>
```
Or: `<.*?>`
:::

::: details Challenge 3: Dot matches newlines unexpectedly
**Broken pattern (with `s` flag):**
```
".*"
```
**Input:**
```
"first"
some text
"second"
```
**Problem:** With `s` flag, `.*` matches across lines, capturing everything from the first `"` to the last.

**Fix:** Be specific about what you want to match.
```
"[^"]*"
```
:::

::: details Challenge 4: Word boundary misunderstanding
**Broken pattern:**
```
\berror\b
```
**Problem:** Does not match `ERROR` or `Error`.

**Fix:** Add the case-insensitive flag.
```
(?i)\berror\b
```
Or in JavaScript: `/\berror\b/i`
:::

::: details Challenge 5: Catastrophic backtracking in production
**Broken pattern:**
```
(\w+\s*)+@example\.com
```
**Input:** A long string of words without `@example.com`
**Problem:** Engine tries every possible way to divide words among the `(\w+\s*)+` group before failing.

**Fix:** Remove the nested quantifier.
```
[\w\s]+@example\.com
```
Or use atomic group: `(?>(\w+\s*)+)@example\.com`
:::

---

## Quiz

::: details Test Your Regex Knowledge (10 Questions)

**Q1: What does `\b` match?**
A word boundary — the position between a `\w` character and a `\W` character (or the start/end of the string).

**Q2: What is the difference between `(.*)` and `(.*?)`?**
`(.*)` is greedy — matches as much as possible. `(.*?)` is lazy — matches as little as possible. Both match zero or more characters.

**Q3: What does `(?:abc)` do differently from `(abc)`?**
`(?:abc)` is a non-capturing group. It groups the pattern for quantifiers or alternation but does not store the match for backreference. `(abc)` captures the match into a numbered group.

**Q4: What will `(?<=\$)\d+` match in `"$42 and 50"`?**
`42` only. The lookbehind requires a `$` before the digits. `50` is not preceded by `$`.

**Q5: Why does Go's `regexp` not support lookaround?**
Go uses the RE2 engine, which implements a DFA-based approach guaranteeing O(n) matching time. Lookaround requires backtracking features of an NFA engine, which RE2 deliberately omits to prevent catastrophic backtracking.

**Q6: What makes `(a+)+` dangerous?**
It causes catastrophic backtracking. When the match fails (e.g., input `"aaaaX"`), the engine explores exponentially many ways to divide the `a` characters between the inner and outer repetitions.

**Q7: How do you match a literal backslash in regex?**
`\\` — one backslash to escape, one to match. In a string literal, you may need `\\\\` (four backslashes) because the string also processes escapes.

**Q8: What is the `x` (verbose/extended) flag used for?**
It allows whitespace and comments (`#`) inside the regex pattern, making complex patterns readable. Literal spaces must be escaped or placed in a character class.

**Q9: In the replacement string, what does `$1` or `\1` refer to?**
The text captured by the first capturing group. `$1` is the syntax in JavaScript and Java replacements; `\1` is used in Python's `re.sub` and within the pattern for backreferences.

**Q10: What is the difference between `re.match()` and `re.search()` in Python?**
`re.match()` only matches at the beginning of the string. `re.search()` finds the first match anywhere in the string.
:::

---

## Exercise: Build a Complete Log Parser

::: details Full Exercise

**Scenario:** You receive Nginx logs in this format:

```
203.0.113.50 - - [04/Apr/2026:14:22:01 +0000] "POST /api/v2/users HTTP/2.0" 201 89 "https://app.example.com/signup" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
```

**Task:** Write a regex that extracts:
1. Client IP
2. Timestamp
3. HTTP method
4. Request path
5. HTTP version
6. Status code
7. Response body size
8. Referer URL
9. User agent string

**Solution:**

```python
import re

nginx_log = re.compile(r"""
    (?P<ip>\d{1,3}(?:\.\d{1,3}){3})   # Client IP address
    \s+-\s+-\s+                         # Identity and auth (usually - -)
    \[(?P<timestamp>[^\]]+)\]           # Timestamp in brackets
    \s+
    "(?P<method>[A-Z]+)                 # HTTP method
    \s+(?P<path>\S+)                    # Request path
    \s+(?P<version>HTTP/[\d.]+)"        # HTTP version
    \s+
    (?P<status>\d{3})                   # Status code
    \s+
    (?P<size>\d+|-)                     # Response size (or -)
    \s+
    "(?P<referer>[^"]*)"               # Referer
    \s+
    "(?P<agent>[^"]*)"                 # User agent
""", re.VERBOSE)

line = '203.0.113.50 - - [04/Apr/2026:14:22:01 +0000] "POST /api/v2/users HTTP/2.0" 201 89 "https://app.example.com/signup" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"'

m = nginx_log.match(line)
if m:
    for key, value in m.groupdict().items():
        print(f"  {key}: {value}")
```

**Output:**
```
  ip: 203.0.113.50
  timestamp: 04/Apr/2026:14:22:01 +0000
  method: POST
  path: /api/v2/users
  version: HTTP/2.0
  status: 201
  size: 89
  referer: https://app.example.com/signup
  agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)
```

**Bonus:** Modify the regex to also handle IPv6 client addresses and log lines where the referer is `-`.
:::

---

## One-Liner Summary

Regular expressions are a pattern-matching language for text -- master character classes, quantifiers, groups, lookaround, and backreferences to search, validate, and transform strings in any language, but know when a proper parser is the better tool.

---

*See also: [Regex Cheat Sheet](/cheat-sheets/regex) for quick reference.*
