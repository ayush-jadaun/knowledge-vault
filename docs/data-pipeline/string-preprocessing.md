---
title: "String Preprocessing"
description: "Production string preprocessing — unicode normalization, encoding detection and fixing, regex-based extraction, address parsing, name standardization, phone and email normalization, and fuzzy deduplication for messy text data."
tags: [preprocessing, strings, regex, normalization, text-cleaning]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# String Preprocessing

String data is the messiest data type. The same name can appear as "John Smith", "JOHN SMITH", "john  smith", "Smith, John", and "J. Smith" — and your pipeline needs to recognize these as the same entity. Addresses, phone numbers, emails, and free text each have their own normalization challenges. This page covers every technique for turning chaotic string data into clean, consistent, matchable values.

---

## Unicode Normalization

The invisible problem: two strings can look identical but differ at the byte level.

```python
# unicode_normalization.py — Fix invisible string differences
import unicodedata
import re


def normalize_unicode(text: str, form: str = "NFKC") -> str:
    """
    Normalize Unicode representation.

    Forms:
    - NFC:  Canonical composition (e.g., e + combining accent -> e-accent)
    - NFD:  Canonical decomposition (e-accent -> e + combining accent)
    - NFKC: Compatibility composition (ligatures expanded, symbols normalized)
    - NFKD: Compatibility decomposition

    NFKC is usually the best choice for data pipelines because it:
    - Normalizes full-width characters (common in CJK data)
    - Expands ligatures (fi -> fi)
    - Normalizes symbols (ohm symbol -> Greek omega)
    """
    if not text:
        return text
    return unicodedata.normalize(form, text)


# Demonstration
s1 = "caf\u00e9"           # "cafe" with combined e-accent
s2 = "cafe\u0301"          # "cafe" with combining acute accent
print(f"Look the same: '{s1}' == '{s2}' -> {s1 == s2}")  # False!
print(f"After NFC: {normalize_unicode(s1) == normalize_unicode(s2)}")  # True

# Full-width characters (common in Japanese/Chinese systems)
fw = "\uff21\uff22\uff23"  # Full-width "ABC"
print(f"Full-width: '{fw}' -> '{normalize_unicode(fw)}'")  # "ABC"


def remove_control_characters(text: str) -> str:
    """Remove non-printable control characters."""
    return "".join(
        char for char in text
        if unicodedata.category(char)[0] != "C"
        or char in ("\n", "\t")  # Keep newline and tab
    )


def normalize_whitespace(text: str) -> str:
    """Collapse all whitespace to single spaces, strip edges."""
    return re.sub(r"\s+", " ", text).strip()


def full_string_normalize(text: str) -> str:
    """Complete string normalization pipeline."""
    if not isinstance(text, str):
        return str(text) if text is not None else ""

    text = normalize_unicode(text, "NFKC")
    text = remove_control_characters(text)
    text = normalize_whitespace(text)
    return text
```

---

## Encoding Detection and Fixing

```python
# encoding_fix.py — Detect and fix encoding issues
import chardet
from ftfy import fix_text  # pip install ftfy
import codecs
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


def detect_encoding(filepath: str, sample_size: int = 100_000) -> dict:
    """Detect file encoding with confidence score."""
    with open(filepath, "rb") as f:
        raw = f.read(sample_size)
    result = chardet.detect(raw)
    return {
        "encoding": result["encoding"],
        "confidence": result["confidence"],
        "language": result.get("language", "unknown"),
    }


def fix_mojibake(text: str) -> str:
    """
    Fix mojibake — text that was decoded with the wrong encoding.

    Common patterns:
    - "caf\u00c3\u00a9" (UTF-8 bytes decoded as Latin-1) -> "cafe"
    - "â€™" (smart quotes mangled) -> "'"
    - "Ã¼" -> "u"
    """
    return fix_text(text)


def fix_encoding_column(series, encodings_to_try=None):
    """Fix encoding issues in a pandas Series."""
    import pandas as pd

    if encodings_to_try is None:
        encodings_to_try = ["utf-8", "latin-1", "cp1252", "iso-8859-1"]

    def fix_value(val):
        if not isinstance(val, str):
            return val
        # Try ftfy first (handles most mojibake)
        fixed = fix_text(val)
        if fixed != val:
            return fixed
        return val

    return series.apply(fix_value)


# Common encoding artifacts and their fixes
ENCODING_FIXES = {
    "â€™": "'",   # Right single quotation mark
    "â€œ": '"',   # Left double quotation mark
    "â€\x9d": '"',  # Right double quotation mark
    "â€"": "—",   # Em dash
    "â€"": "–",   # En dash
    "Ã¡": "a",    # a with accent (mojibake)
    "Ã©": "e",    # e with accent (mojibake)
    "Ã¼": "u",    # u with umlaut (mojibake)
    "Ã¶": "o",    # o with umlaut (mojibake)
    "Ã±": "n",    # n with tilde (mojibake)
}

def fix_common_encoding_artifacts(text: str) -> str:
    """Fix known encoding artifacts with direct replacement."""
    for bad, good in ENCODING_FIXES.items():
        text = text.replace(bad, good)
    return text
```

---

## Regex-Based Extraction

```python
# regex_extraction.py — Extract structured data from strings
import re
import pandas as pd
from typing import Optional


class DataExtractor:
    """Extract structured data from unstructured text using regex."""

    # Compiled patterns for performance
    EMAIL_PATTERN = re.compile(
        r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
    )
    PHONE_PATTERN = re.compile(
        r"(?:\+?1[-.]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})"
    )
    URL_PATTERN = re.compile(
        r"https?://[^\s<>\"']+|www\.[^\s<>\"']+"
    )
    CURRENCY_PATTERN = re.compile(
        r"\$[\d,]+\.?\d*|\d+\.?\d*\s*(?:USD|EUR|GBP)"
    )
    IP_PATTERN = re.compile(
        r"\b(?:\d{1,3}\.){3}\d{1,3}\b"
    )
    DATE_PATTERN = re.compile(
        r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}"
    )

    @classmethod
    def extract_emails(cls, text: str) -> list[str]:
        return cls.EMAIL_PATTERN.findall(text)

    @classmethod
    def extract_phones(cls, text: str) -> list[str]:
        matches = cls.PHONE_PATTERN.findall(text)
        return [f"({m[0]}) {m[1]}-{m[2]}" for m in matches]

    @classmethod
    def extract_urls(cls, text: str) -> list[str]:
        return cls.URL_PATTERN.findall(text)

    @classmethod
    def extract_currency(cls, text: str) -> list[str]:
        return cls.CURRENCY_PATTERN.findall(text)

    @classmethod
    def extract_all(cls, text: str) -> dict:
        """Extract all recognized entities from text."""
        return {
            "emails": cls.extract_emails(text),
            "phones": cls.extract_phones(text),
            "urls": cls.extract_urls(text),
            "currency": cls.extract_currency(text),
            "ips": cls.IP_PATTERN.findall(text),
            "dates": cls.DATE_PATTERN.findall(text),
        }


# Advanced: Extract structured data from semi-structured strings
def parse_address_regex(address: str) -> dict:
    """
    Parse a US-style address string into components.
    Handles common formats but not all edge cases.
    For production, use the usaddress library.
    """
    patterns = {
        "zip_code": r"\b(\d{5}(?:-\d{4})?)\b",
        "state": r"\b([A-Z]{2})\b(?=\s*\d{5}|\s*$)",
        "street_number": r"^(\d+)\s",
        "unit": r"(?:apt|suite|unit|#|ste)\.?\s*(\w+)",
    }

    result = {}
    for field, pattern in patterns.items():
        match = re.search(pattern, address, re.IGNORECASE)
        if match:
            result[field] = match.group(1)

    return result


# Extract from DataFrame columns
def extract_column_entities(df: pd.DataFrame, column: str) -> pd.DataFrame:
    """Extract all entities from a text column into new columns."""
    extractor = DataExtractor()

    entities = df[column].apply(
        lambda x: extractor.extract_all(str(x)) if pd.notna(x) else {}
    )

    df_result = df.copy()
    df_result[f"{column}_emails"] = entities.apply(
        lambda x: x.get("emails", [])
    )
    df_result[f"{column}_phones"] = entities.apply(
        lambda x: x.get("phones", [])
    )
    df_result[f"{column}_urls"] = entities.apply(
        lambda x: x.get("urls", [])
    )

    return df_result
```

---

## Name Standardization

```python
# name_standardization.py — Normalize personal names
import re
import unicodedata


class NameStandardizer:
    """Standardize personal names for matching and deduplication."""

    PREFIXES = {
        "mr", "mrs", "ms", "miss", "dr", "prof", "rev",
        "sir", "lady", "lord", "hon", "judge",
    }
    SUFFIXES = {
        "jr", "sr", "ii", "iii", "iv", "v",
        "md", "phd", "esq", "dds", "dvm",
    }
    PARTICLES = {"de", "del", "della", "di", "van", "von", "le", "la", "el", "al"}

    @classmethod
    def standardize(cls, name: str) -> dict:
        """
        Parse and standardize a name string.

        Returns dict with: prefix, first, middle, last, suffix, standardized
        """
        if not name or not isinstance(name, str):
            return {"standardized": "", "first": "", "last": ""}

        # Normalize unicode and whitespace
        name = unicodedata.normalize("NFKC", name)
        name = re.sub(r"\s+", " ", name).strip()

        # Remove periods after initials
        name = re.sub(r"\.(?=\s|$)", "", name)

        # Handle "Last, First" format
        if "," in name:
            parts = name.split(",", 1)
            name = f"{parts[1].strip()} {parts[0].strip()}"

        # Split into parts
        parts = name.split()
        if not parts:
            return {"standardized": "", "first": "", "last": ""}

        # Extract prefix
        prefix = ""
        if parts[0].lower().rstrip(".") in cls.PREFIXES:
            prefix = parts.pop(0).rstrip(".")

        # Extract suffix
        suffix = ""
        if parts and parts[-1].lower().rstrip(".") in cls.SUFFIXES:
            suffix = parts.pop().rstrip(".")

        if not parts:
            return {"standardized": name, "first": "", "last": ""}

        # Assign first, middle, last
        first = parts[0].title()
        last = parts[-1].title() if len(parts) > 1 else ""
        middle = " ".join(parts[1:-1]).title() if len(parts) > 2 else ""

        # Handle name particles (van, von, de, etc.)
        if last.lower() in cls.PARTICLES and len(parts) > 2:
            last = f"{last.lower()} {parts[-1].title()}" if len(parts) > 2 else last

        standardized = " ".join(filter(None, [first, middle, last]))

        return {
            "prefix": prefix,
            "first": first,
            "middle": middle,
            "last": last,
            "suffix": suffix,
            "standardized": standardized,
        }

    @classmethod
    def normalize_for_matching(cls, name: str) -> str:
        """Create a normalized key for name matching."""
        result = cls.standardize(name)
        # Lowercase, remove particles, sort components
        components = [
            result["first"].lower(),
            result["last"].lower(),
        ]
        return " ".join(c for c in components if c)


# Usage
names = [
    "Dr. John Smith Jr.",
    "Smith, John",
    "JOHN SMITH",
    "john  smith",
    "J. Smith",
    "Mr. John A. Smith III",
]

for name in names:
    result = NameStandardizer.standardize(name)
    key = NameStandardizer.normalize_for_matching(name)
    print(f"  {name:30s} -> {result['standardized']:25s} key='{key}'")
```

---

## Phone and Email Normalization

```python
# contact_normalization.py — Standardize phone numbers and emails
import re
from typing import Optional


class PhoneNormalizer:
    """Normalize phone numbers to a standard format."""

    @staticmethod
    def normalize(phone: str, country_code: str = "1") -> Optional[str]:
        """
        Normalize phone to E.164 format: +{country}{number}

        Examples:
        - "(555) 123-4567"  -> "+15551234567"
        - "555.123.4567"    -> "+15551234567"
        - "+1-555-123-4567" -> "+15551234567"
        - "5551234567"      -> "+15551234567"
        """
        if not phone or not isinstance(phone, str):
            return None

        # Remove all non-digit characters except leading +
        digits = re.sub(r"[^\d]", "", phone)

        # Handle country code
        if digits.startswith(country_code) and len(digits) == 11:
            return f"+{digits}"
        elif len(digits) == 10:
            return f"+{country_code}{digits}"
        elif len(digits) == 7:
            return None  # Local number, cannot standardize
        else:
            return None  # Invalid

    @staticmethod
    def format_display(phone: str) -> str:
        """Format normalized phone for display: (555) 123-4567"""
        normalized = PhoneNormalizer.normalize(phone)
        if not normalized:
            return phone  # Return original if can't normalize
        digits = normalized.lstrip("+")
        if len(digits) == 11:
            return f"({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
        return phone

    @staticmethod
    def is_valid(phone: str) -> bool:
        """Check if a phone number is valid."""
        return PhoneNormalizer.normalize(phone) is not None


class EmailNormalizer:
    """Normalize email addresses."""

    # Major providers that ignore dots and plus addressing
    GMAIL_DOMAINS = {"gmail.com", "googlemail.com"}

    @staticmethod
    def normalize(email: str) -> Optional[str]:
        """
        Normalize an email address.

        Rules:
        - Lowercase everything
        - Strip whitespace
        - For Gmail: remove dots, strip +suffix
        - Validate basic format
        """
        if not email or not isinstance(email, str):
            return None

        email = email.strip().lower()

        # Basic validation
        if "@" not in email or email.count("@") != 1:
            return None

        local, domain = email.rsplit("@", 1)

        # Remove comments and whitespace
        local = local.strip()
        domain = domain.strip()

        if not local or not domain or "." not in domain:
            return None

        # Gmail-specific normalization
        if domain in EmailNormalizer.GMAIL_DOMAINS:
            # Remove dots from local part
            local = local.replace(".", "")
            # Remove plus addressing
            if "+" in local:
                local = local.split("+")[0]
            domain = "gmail.com"  # Normalize googlemail.com

        return f"{local}@{domain}"

    @staticmethod
    def extract_domain(email: str) -> Optional[str]:
        """Extract domain from email."""
        normalized = EmailNormalizer.normalize(email)
        if normalized:
            return normalized.split("@")[1]
        return None

    @staticmethod
    def is_valid(email: str) -> bool:
        """Validate email format."""
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        return bool(re.match(pattern, str(email).strip()))


# Usage with pandas
import pandas as pd

def normalize_contacts(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize phone and email columns in a DataFrame."""
    result = df.copy()

    if "phone" in result.columns:
        result["phone_normalized"] = result["phone"].apply(
            PhoneNormalizer.normalize
        )
        result["phone_valid"] = result["phone"].apply(
            PhoneNormalizer.is_valid
        )

    if "email" in result.columns:
        result["email_normalized"] = result["email"].apply(
            EmailNormalizer.normalize
        )
        result["email_domain"] = result["email"].apply(
            EmailNormalizer.extract_domain
        )
        result["email_valid"] = result["email"].apply(
            EmailNormalizer.is_valid
        )

    return result
```

---

## Fuzzy String Deduplication

```python
# fuzzy_dedup.py — Find and merge near-duplicate strings
from rapidfuzz import fuzz, process
import pandas as pd
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


class FuzzyDeduplicator:
    """Find and merge near-duplicate string values."""

    def __init__(self, threshold: float = 85.0):
        self.threshold = threshold

    def find_duplicates(
        self,
        values: list[str],
        method: str = "token_sort_ratio",
    ) -> dict[str, list[str]]:
        """
        Group similar strings together.

        Returns: {canonical: [variant1, variant2, ...]}
        """
        scorer = getattr(fuzz, method, fuzz.token_sort_ratio)
        unique_values = list(set(v for v in values if v))
        groups = {}
        assigned = set()

        for value in sorted(unique_values, key=len, reverse=True):
            if value in assigned:
                continue

            # Find all matches above threshold
            matches = process.extract(
                value,
                [v for v in unique_values if v not in assigned],
                scorer=scorer,
                limit=None,
                score_cutoff=self.threshold,
            )

            if matches:
                # Use the longest match as canonical
                variants = [m[0] for m in matches]
                canonical = max(variants, key=len)
                groups[canonical] = sorted(variants)
                assigned.update(variants)

        return groups

    def build_mapping(
        self,
        values: list[str],
        method: str = "token_sort_ratio",
    ) -> dict[str, str]:
        """Build a variant -> canonical mapping."""
        groups = self.find_duplicates(values, method)
        mapping = {}
        for canonical, variants in groups.items():
            for variant in variants:
                mapping[variant] = canonical
        return mapping

    def deduplicate_column(
        self,
        df: pd.DataFrame,
        column: str,
        method: str = "token_sort_ratio",
    ) -> pd.DataFrame:
        """Replace fuzzy duplicates in a column with canonical values."""
        values = df[column].dropna().unique().tolist()
        mapping = self.build_mapping(values, method)

        result = df.copy()
        result[f"{column}_original"] = result[column]
        result[column] = result[column].map(mapping).fillna(result[column])

        n_merged = len(values) - len(set(mapping.values()))
        logger.info(
            f"Fuzzy dedup on '{column}': "
            f"{len(values)} unique -> {len(set(mapping.values()))} "
            f"({n_merged} variants merged)"
        )

        return result


# Usage
dedup = FuzzyDeduplicator(threshold=80)

company_names = [
    "Microsoft Corporation",
    "Microsoft Corp",
    "Microsoft Corp.",
    "MICROSOFT CORPORATION",
    "Google LLC",
    "Google Inc",
    "Google Inc.",
    "Alphabet / Google",
    "Apple Inc",
    "Apple Inc.",
    "APPLE INC",
]

groups = dedup.find_duplicates(company_names)
for canonical, variants in groups.items():
    print(f"  {canonical}:")
    for v in variants:
        print(f"    - {v}")
```

---

## Complete String Preprocessing Pipeline

```python
# string_pipeline.py — Full string preprocessing pipeline
import pandas as pd
import re
import unicodedata
from typing import Callable


class StringPreprocessor:
    """Configurable string preprocessing pipeline."""

    def __init__(self):
        self.steps: list[tuple[str, Callable]] = []

    def add(self, name: str, fn: Callable) -> "StringPreprocessor":
        self.steps.append((name, fn))
        return self

    def process(self, text: str) -> str:
        if not isinstance(text, str):
            return str(text) if text is not None else ""
        for name, fn in self.steps:
            text = fn(text)
        return text

    def process_series(self, series: pd.Series) -> pd.Series:
        return series.apply(
            lambda x: self.process(x) if pd.notna(x) else x
        )

    # Pre-built step factories
    @staticmethod
    def unicode_normalize(form="NFKC"):
        return lambda t: unicodedata.normalize(form, t)

    @staticmethod
    def strip():
        return lambda t: t.strip()

    @staticmethod
    def lowercase():
        return lambda t: t.lower()

    @staticmethod
    def uppercase():
        return lambda t: t.upper()

    @staticmethod
    def collapse_whitespace():
        return lambda t: re.sub(r"\s+", " ", t).strip()

    @staticmethod
    def remove_punctuation(keep: str = ""):
        pattern = f"[^\\w\\s{re.escape(keep)}]"
        return lambda t: re.sub(pattern, "", t)

    @staticmethod
    def remove_digits():
        return lambda t: re.sub(r"\d", "", t)

    @staticmethod
    def remove_html():
        return lambda t: re.sub(r"<[^>]+>", "", t)

    @staticmethod
    def replace_pattern(pattern: str, replacement: str):
        compiled = re.compile(pattern)
        return lambda t: compiled.sub(replacement, t)

    @staticmethod
    def truncate(max_length: int):
        return lambda t: t[:max_length]


# Build a reusable preprocessor
product_name_cleaner = (
    StringPreprocessor()
    .add("unicode", StringPreprocessor.unicode_normalize())
    .add("strip", StringPreprocessor.strip())
    .add("collapse_ws", StringPreprocessor.collapse_whitespace())
    .add("lowercase", StringPreprocessor.lowercase())
    .add("remove_html", StringPreprocessor.remove_html())
    .add("truncate", StringPreprocessor.truncate(200))
)

# Apply to DataFrame
df["name_clean"] = product_name_cleaner.process_series(df["name"])
```

---

## Quick Reference

| Problem | Solution | Function |
|---------|----------|----------|
| Unicode inconsistencies | NFKC normalization | `unicodedata.normalize("NFKC", text)` |
| Mojibake (wrong encoding) | ftfy library | `ftfy.fix_text(text)` |
| Unknown file encoding | chardet detection | `chardet.detect(raw_bytes)` |
| Inconsistent whitespace | Regex collapse | `re.sub(r"\s+", " ", text).strip()` |
| Phone format variations | E.164 normalization | Custom normalizer |
| Email variants (Gmail dots) | Provider-aware normalization | Custom normalizer |
| Near-duplicate strings | Fuzzy matching | `rapidfuzz.fuzz.token_sort_ratio()` |
| "Last, First" names | Name parser | Split on comma, reorder |
| Embedded HTML | Tag stripping | `re.sub(r"<[^>]+>", "", text)` |
| Control characters | Unicode category filter | Check `unicodedata.category()` |

---

::: tip Key Takeaway
- Two strings can look identical to the human eye but differ at the byte level due to Unicode normalization forms; always normalize with NFKC before comparing.
- Phone numbers, emails, and names each require domain-specific normalization -- generic `str.lower().strip()` is never enough for matching.
- Fuzzy deduplication with rapidfuzz finds near-duplicate strings (e.g., "Microsoft Corp" and "MICROSOFT CORPORATION") that exact matching misses entirely.
:::

::: details Exercise
**Build a Contact Normalizer**

Write a function that takes a DataFrame with `name`, `email`, and `phone` columns and:
1. Normalizes names to "First Last" format (handles "Last, First" and title case).
2. Normalizes emails (lowercase, Gmail dot removal, plus-addressing removal).
3. Normalizes phones to E.164 format (+1XXXXXXXXXX).
4. Creates a `match_key` column by concatenating the normalized name and email domain for deduplication.

**Solution Sketch**

```python
import re, pandas as pd

def normalize_contacts(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    # Name: handle "Last, First" -> "First Last"
    def norm_name(n):
        if not isinstance(n, str): return ""
        if "," in n:
            parts = n.split(",", 1)
            n = f"{parts[1].strip()} {parts[0].strip()}"
        return " ".join(n.split()).strip().title()

    # Email: lowercase, strip dots for Gmail
    def norm_email(e):
        if not isinstance(e, str): return ""
        e = e.strip().lower()
        local, domain = e.rsplit("@", 1) if "@" in e else (e, "")
        if domain in ("gmail.com", "googlemail.com"):
            local = local.replace(".", "").split("+")[0]
        return f"{local}@{domain}"

    # Phone: digits only -> E.164
    def norm_phone(p):
        digits = re.sub(r"[^\d]", "", str(p))
        if len(digits) == 10: return f"+1{digits}"
        if len(digits) == 11 and digits[0] == "1": return f"+{digits}"
        return None

    result["name_clean"] = result["name"].apply(norm_name)
    result["email_clean"] = result["email"].apply(norm_email)
    result["phone_clean"] = result["phone"].apply(norm_phone)
    result["match_key"] = result["name_clean"].str.lower() + "|" + result["email_clean"].str.split("@").str[1]
    return result
```
:::

::: details Debugging Scenario
**Your deduplication pipeline matches customers by normalized name, but it is merging "John Smith" the plumber in Texas with "John Smith" the accountant in New York as the same person.**

Diagnose and fix it.

**Answer**

The matching key is too broad. Name alone is not a sufficient entity identifier because names are not unique. Fixes:

1. **Compound matching key**: combine name + email domain, or name + zip code, or name + phone. Two "John Smiths" with different email domains are different people.
2. **Multi-field weighted scoring**: instead of a binary match on name, compute a weighted similarity across name (40%), email (30%), address (20%), phone (10%) and require a threshold of 85%+.
3. **Blocking strategy**: only compare records within the same geographic block (zip code prefix) to reduce false positives from common names in distant locations.
4. **Active learning**: flag low-confidence matches for human review and feed decisions back into the model.
:::

::: warning Common Misconceptions
- **"`str.lower().strip()` is sufficient string normalization."** It misses Unicode variants, full-width characters, control characters, inconsistent whitespace, and encoding artifacts.
- **"Two strings that look identical are equal."** Unicode has multiple ways to represent the same visual character (e.g., "e" + combining accent vs. pre-composed "e"). Without NFKC normalization, equality checks fail on visually identical strings.
- **"Fuzzy matching is slow."** Modern libraries like rapidfuzz are implemented in C++ and can compare millions of string pairs per second. With blocking, even million-row datasets are feasible.
- **"Email addresses are case-sensitive."** The local part is technically case-sensitive per RFC 5321, but virtually no email provider enforces this. Always lowercase for matching.
:::

::: details Quiz
**1. What is mojibake, and how do you fix it?**

> Mojibake occurs when text encoded in one character set (e.g., UTF-8) is decoded using a different one (e.g., Latin-1), producing garbled characters like "cafÃ©" instead of "cafe". The `ftfy` library automatically detects and fixes most mojibake patterns.

**2. Why is NFKC the recommended Unicode normalization form for data pipelines?**

> NFKC (Compatibility Composition) normalizes full-width characters, expands ligatures, and composes characters into their canonical forms, handling the widest range of invisible string differences.

**3. What is E.164 phone number format?**

> E.164 is the international standard: a plus sign followed by country code and subscriber number with no spaces or punctuation, e.g., "+15551234567". It enables consistent storage and comparison.

**4. How does rapidfuzz's `token_sort_ratio` differ from `ratio`?**

> `ratio` compares strings character-by-character in order. `token_sort_ratio` splits both strings into tokens, sorts them alphabetically, then compares. This makes "John Smith" and "Smith, John" score 100% instead of a low score.

**5. Why should Gmail email normalization remove dots from the local part?**

> Gmail ignores dots in email addresses: `john.smith@gmail.com` and `johnsmith@gmail.com` deliver to the same inbox. Without dot removal, you treat one person as two separate contacts.
:::

> **One-Liner Summary:** String preprocessing is the art of making "JOHN SMITH", "Smith, John", and "john  smith" resolve to the same entity through Unicode normalization, domain-specific rules, and fuzzy matching.
