---
title: "Datetime Preprocessing"
description: "Production datetime preprocessing — parsing 50+ date formats, timezone normalization, handling ambiguous dates, fiscal calendar alignment, business day calculations, feature extraction pipeline, and Daylight Saving Time edge cases."
tags: [preprocessing, datetime, timezone, parsing, python]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Datetime Preprocessing

Datetime data breaks pipelines more than any other type. "01/02/03" could be January 2, 2003 or February 1, 2003 or March 2, 2001 depending on locale. A timestamp without timezone information is a lie — it looks precise but tells you nothing about when the event actually happened. Daylight Saving Time creates hours that happen twice and hours that do not exist. This page covers every technique for turning messy datetime strings into reliable, timezone-aware, feature-rich temporal data.

---

## The Date Parsing Problem

```python
# date_parsing.py — Parse dates from any format
import pandas as pd
import numpy as np
from datetime import datetime, timezone
from dateutil import parser as dateutil_parser
from dateutil.tz import gettz
import re
import logging

logger = logging.getLogger(__name__)


class DateParser:
    """Parse dates from dozens of formats into consistent datetime objects."""

    # Explicit format patterns ordered by specificity
    FORMATS = [
        # ISO 8601 (most unambiguous)
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",

        # Year-first (unambiguous)
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d",
        "%Y%m%d",
        "%Y%m%d%H%M%S",

        # US formats (month first)
        "%m/%d/%Y %I:%M:%S %p",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M",
        "%m/%d/%Y",
        "%m-%d-%Y",
        "%m/%d/%y",

        # European formats (day first)
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d.%m.%Y",
        "%d %b %Y",
        "%d %B %Y",

        # Named month formats
        "%b %d, %Y",
        "%B %d, %Y",
        "%d %b %Y %H:%M:%S",
        "%b %d %Y",
        "%B %d %Y",

        # Compact formats
        "%Y%m%d",
        "%d%b%Y",

        # Unix timestamps
        # Handled separately
    ]

    @classmethod
    def parse_single(
        cls,
        value: str,
        dayfirst: bool = False,
        yearfirst: bool = True,
    ) -> datetime | None:
        """Parse a single date string, trying multiple strategies."""
        if not value or not isinstance(value, str):
            return None

        value = value.strip()

        # Check for Unix timestamp (numeric)
        if re.match(r"^\d{10,13}$", value):
            ts = float(value)
            if ts > 1e12:  # Milliseconds
                ts = ts / 1000
            return datetime.fromtimestamp(ts, tz=timezone.utc)

        # Try explicit formats first (fastest)
        for fmt in cls.FORMATS:
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue

        # Fall back to dateutil (flexible but slower)
        try:
            return dateutil_parser.parse(
                value,
                dayfirst=dayfirst,
                yearfirst=yearfirst,
                fuzzy=True,
            )
        except (ValueError, OverflowError):
            return None

    @classmethod
    def parse_column(
        cls,
        series: pd.Series,
        dayfirst: bool = False,
        format_hint: str | None = None,
    ) -> pd.Series:
        """
        Parse a column of dates with comprehensive fallback logic.

        Strategy:
        1. Try pandas built-in parsing (fastest for uniform formats)
        2. Try explicit format hint if provided
        3. Fall back to per-value parsing for remaining failures
        """
        # Step 1: Try pandas built-in
        if format_hint:
            try:
                return pd.to_datetime(series, format=format_hint, errors="coerce")
            except Exception:
                pass

        try:
            result = pd.to_datetime(
                series,
                infer_datetime_format=True,
                dayfirst=dayfirst,
                errors="coerce",
            )
            success_rate = result.notna().sum() / series.notna().sum()
            if success_rate > 0.95:
                failed = series.notna() & result.isna()
                if failed.sum() > 0:
                    logger.warning(
                        f"Failed to parse {failed.sum()} dates: "
                        f"{series[failed].head(3).tolist()}"
                    )
                return result
        except Exception:
            pass

        # Step 2: Per-value parsing for the failures
        logger.info("Falling back to per-value date parsing")
        return series.apply(
            lambda x: cls.parse_single(str(x), dayfirst=dayfirst) if pd.notna(x) else pd.NaT
        )

    @classmethod
    def detect_format(cls, series: pd.Series, sample_size: int = 100) -> dict:
        """Detect the most likely date format in a column."""
        sample = series.dropna().astype(str).head(sample_size)
        format_scores = {}

        for fmt in cls.FORMATS:
            successes = 0
            for value in sample:
                try:
                    datetime.strptime(value.strip(), fmt)
                    successes += 1
                except ValueError:
                    continue
            if successes > 0:
                format_scores[fmt] = successes / len(sample)

        if not format_scores:
            return {"format": None, "confidence": 0, "ambiguous": True}

        best_format = max(format_scores, key=format_scores.get)
        return {
            "format": best_format,
            "confidence": format_scores[best_format],
            "ambiguous": cls._is_ambiguous(best_format),
            "all_formats": format_scores,
        }

    @staticmethod
    def _is_ambiguous(fmt: str) -> bool:
        """Check if a format has day/month ambiguity."""
        # Formats where day and month positions could be swapped
        return any(
            fmt.startswith(prefix)
            for prefix in ["%m/%d", "%d/%m", "%m-%d", "%d-%m"]
        )


# Usage
parser = DateParser()

# Detect format
detection = parser.detect_format(df["created_at"])
print(f"Detected format: {detection['format']} ({detection['confidence']:.0%})")
if detection["ambiguous"]:
    print("WARNING: Date format is ambiguous (day/month could be swapped)")

# Parse with confidence
df["created_at_parsed"] = parser.parse_column(
    df["created_at"],
    dayfirst=False,
    format_hint=detection["format"],
)
```

---

## Timezone Normalization

```python
# timezone_normalization.py — Handle timezone chaos
import pandas as pd
import pytz
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo  # Python 3.9+
import logging

logger = logging.getLogger(__name__)


class TimezoneNormalizer:
    """Normalize all timestamps to a consistent timezone."""

    COMMON_ABBREVIATIONS = {
        "EST": "US/Eastern",
        "EDT": "US/Eastern",
        "CST": "US/Central",
        "CDT": "US/Central",
        "MST": "US/Mountain",
        "MDT": "US/Mountain",
        "PST": "US/Pacific",
        "PDT": "US/Pacific",
        "GMT": "UTC",
        "BST": "Europe/London",
        "CET": "Europe/Berlin",
        "CEST": "Europe/Berlin",
        "IST": "Asia/Kolkata",
        "JST": "Asia/Tokyo",
        "AEST": "Australia/Sydney",
        "AEDT": "Australia/Sydney",
    }

    def __init__(self, target_tz: str = "UTC"):
        self.target_tz = ZoneInfo(target_tz)

    def normalize_column(
        self,
        series: pd.Series,
        source_tz: str | None = None,
        assume_utc_if_naive: bool = True,
    ) -> pd.Series:
        """
        Normalize datetime column to target timezone.

        Rules:
        1. If timezone-aware: convert to target timezone.
        2. If timezone-naive and source_tz provided: localize, then convert.
        3. If timezone-naive and no source_tz: assume UTC (configurable).
        """
        if not pd.api.types.is_datetime64_any_dtype(series):
            series = pd.to_datetime(series, errors="coerce")

        # Check if timezone-aware
        if series.dt.tz is not None:
            # Already timezone-aware: convert
            return series.dt.tz_convert(str(self.target_tz))

        # Timezone-naive
        if source_tz:
            tz = self._resolve_timezone(source_tz)
            return series.dt.tz_localize(tz).dt.tz_convert(str(self.target_tz))

        if assume_utc_if_naive:
            logger.warning("Assuming UTC for naive timestamps")
            return series.dt.tz_localize("UTC").dt.tz_convert(str(self.target_tz))

        logger.warning("Timestamps are timezone-naive and no source TZ specified")
        return series

    def _resolve_timezone(self, tz_string: str) -> str:
        """Resolve timezone abbreviation to IANA name."""
        if tz_string in self.COMMON_ABBREVIATIONS:
            return self.COMMON_ABBREVIATIONS[tz_string]
        return tz_string

    def normalize_mixed_timezones(
        self,
        timestamps: pd.Series,
        timezone_column: pd.Series,
    ) -> pd.Series:
        """
        Normalize when each row has a different timezone.
        Common in datasets with users across multiple timezones.
        """
        results = pd.Series(index=timestamps.index, dtype="datetime64[ns, UTC]")

        for tz_value in timezone_column.unique():
            if pd.isna(tz_value):
                continue

            mask = timezone_column == tz_value
            resolved_tz = self._resolve_timezone(str(tz_value))

            subset = timestamps[mask]
            if subset.dt.tz is None:
                localized = subset.dt.tz_localize(resolved_tz, ambiguous="NaT", nonexistent="NaT")
            else:
                localized = subset

            results[mask] = localized.dt.tz_convert("UTC")

        return results


# Usage
normalizer = TimezoneNormalizer(target_tz="UTC")

# Simple case: all timestamps from one timezone
df["event_time_utc"] = normalizer.normalize_column(
    df["event_time"],
    source_tz="US/Pacific",
)

# Mixed timezones
df["event_time_utc"] = normalizer.normalize_mixed_timezones(
    df["event_time"],
    df["user_timezone"],
)
```

---

## Handling Ambiguous Dates

```python
# ambiguous_dates.py — Resolve ambiguous date formats
import pandas as pd
import numpy as np
from datetime import datetime


class AmbiguousDateResolver:
    """
    Resolve day/month ambiguity in date strings.

    "01/02/2024" = January 2 (US) or February 1 (EU)?
    Strategy: Use statistical analysis of the column to decide.
    """

    @staticmethod
    def detect_day_month_order(series: pd.Series) -> str:
        """
        Analyze a column to determine if dates are day-first or month-first.

        Logic:
        - If any value in position 1 exceeds 12, position 1 must be day.
        - If any value in position 2 exceeds 12, position 2 must be day.
        - If both positions are always <= 12, check for consistency patterns.
        """
        sample = series.dropna().astype(str).head(1000)

        # Extract first two numeric fields
        import re
        first_values = []
        second_values = []

        for date_str in sample:
            match = re.match(r"(\d{1,2})[/\-.](\d{1,2})", date_str)
            if match:
                first_values.append(int(match.group(1)))
                second_values.append(int(match.group(2)))

        if not first_values:
            return "unknown"

        first_max = max(first_values)
        second_max = max(second_values)

        if first_max > 12 and second_max <= 12:
            return "dayfirst"  # First position has values > 12, must be day
        elif second_max > 12 and first_max <= 12:
            return "monthfirst"  # Second position has values > 12, must be day
        elif first_max <= 12 and second_max <= 12:
            # Ambiguous — use distribution analysis
            # Days should have more even distribution (1-28/30/31)
            # Months should cluster 1-12
            first_range = max(first_values) - min(first_values)
            second_range = max(second_values) - min(second_values)

            if first_range > second_range:
                return "dayfirst (inferred)"
            else:
                return "monthfirst (inferred)"
        else:
            return "unknown"

    @staticmethod
    def resolve_column(
        series: pd.Series,
        override: str | None = None,
    ) -> pd.Series:
        """Parse dates with automatic day/month resolution."""
        if override:
            dayfirst = override.startswith("day")
        else:
            detection = AmbiguousDateResolver.detect_day_month_order(series)
            dayfirst = detection.startswith("day")
            print(f"Date order detected: {detection}")

        return pd.to_datetime(
            series,
            dayfirst=dayfirst,
            errors="coerce",
        )
```

---

## DST Edge Cases

```python
# dst_handling.py — Handle Daylight Saving Time transitions
import pandas as pd
from zoneinfo import ZoneInfo
from datetime import datetime, timedelta


def handle_dst_transitions(
    series: pd.Series,
    timezone: str,
) -> pd.Series:
    """
    Handle DST transitions safely.

    Problem: "2024-03-10 02:30:00" does not exist in US/Eastern (spring forward).
    Problem: "2024-11-03 01:30:00" happens twice in US/Eastern (fall back).
    """
    tz = ZoneInfo(timezone)

    result = series.copy()

    # Handle nonexistent times (spring forward gap)
    try:
        result = result.dt.tz_localize(
            timezone,
            ambiguous="NaT",       # Fall-back duplicates become NaT
            nonexistent="shift_forward",  # Spring-forward gaps shift to next valid time
        )
    except TypeError:
        # Fallback for older pandas versions
        result = result.dt.tz_localize(timezone, ambiguous="NaT", nonexistent="NaT")

    return result


def create_dst_safe_range(
    start: str,
    end: str,
    freq: str,
    timezone: str,
) -> pd.DatetimeIndex:
    """Create a date range that properly handles DST transitions."""
    # Generate in UTC first, then convert
    start_utc = pd.Timestamp(start, tz="UTC")
    end_utc = pd.Timestamp(end, tz="UTC")

    rng = pd.date_range(start=start_utc, end=end_utc, freq=freq)
    return rng.tz_convert(timezone)


def detect_dst_issues(series: pd.Series, timezone: str) -> dict:
    """Check a datetime column for DST-related issues."""
    tz = ZoneInfo(timezone)

    issues = {
        "nonexistent_times": 0,
        "ambiguous_times": 0,
        "examples": [],
    }

    for ts in series.dropna().head(10000):
        try:
            if hasattr(ts, 'tzinfo') and ts.tzinfo is None:
                ts.replace(tzinfo=tz)
        except Exception as e:
            if "nonexistent" in str(e).lower():
                issues["nonexistent_times"] += 1
            elif "ambiguous" in str(e).lower():
                issues["ambiguous_times"] += 1
            issues["examples"].append({"timestamp": str(ts), "error": str(e)})

    return issues
```

---

## Feature Extraction Pipeline

```python
# datetime_features.py — Extract rich features from datetime columns
import pandas as pd
import numpy as np
from typing import Optional
import holidays  # pip install holidays


class DatetimeFeatureExtractor:
    """Extract comprehensive features from datetime columns."""

    def __init__(self, country: str = "US"):
        self.country = country
        self.holiday_calendar = holidays.country_holidays(country)

    def extract_all(
        self,
        df: pd.DataFrame,
        column: str,
        prefix: str | None = None,
    ) -> pd.DataFrame:
        """Extract all datetime features into new columns."""
        result = df.copy()
        ts = pd.to_datetime(result[column])
        p = prefix or column

        # Basic components
        result[f"{p}_year"] = ts.dt.year
        result[f"{p}_month"] = ts.dt.month
        result[f"{p}_day"] = ts.dt.day
        result[f"{p}_hour"] = ts.dt.hour
        result[f"{p}_minute"] = ts.dt.minute
        result[f"{p}_dayofweek"] = ts.dt.dayofweek  # 0=Monday
        result[f"{p}_dayofyear"] = ts.dt.dayofyear
        result[f"{p}_weekofyear"] = ts.dt.isocalendar().week.astype(int)
        result[f"{p}_quarter"] = ts.dt.quarter

        # Derived features
        result[f"{p}_is_weekend"] = ts.dt.dayofweek >= 5
        result[f"{p}_is_month_start"] = ts.dt.is_month_start
        result[f"{p}_is_month_end"] = ts.dt.is_month_end
        result[f"{p}_is_quarter_start"] = ts.dt.is_quarter_start
        result[f"{p}_is_quarter_end"] = ts.dt.is_quarter_end
        result[f"{p}_is_year_start"] = ts.dt.is_year_start
        result[f"{p}_is_year_end"] = ts.dt.is_year_end

        # Holiday features
        result[f"{p}_is_holiday"] = ts.dt.date.apply(
            lambda d: d in self.holiday_calendar if pd.notna(d) else False
        )

        # Time of day categories
        result[f"{p}_part_of_day"] = pd.cut(
            ts.dt.hour,
            bins=[-1, 6, 12, 18, 24],
            labels=["night", "morning", "afternoon", "evening"],
        )

        # Cyclical encoding (for models that need continuous features)
        result[f"{p}_month_sin"] = np.sin(2 * np.pi * ts.dt.month / 12)
        result[f"{p}_month_cos"] = np.cos(2 * np.pi * ts.dt.month / 12)
        result[f"{p}_hour_sin"] = np.sin(2 * np.pi * ts.dt.hour / 24)
        result[f"{p}_hour_cos"] = np.cos(2 * np.pi * ts.dt.hour / 24)
        result[f"{p}_dow_sin"] = np.sin(2 * np.pi * ts.dt.dayofweek / 7)
        result[f"{p}_dow_cos"] = np.cos(2 * np.pi * ts.dt.dayofweek / 7)

        # Days since epoch (useful for trend features)
        result[f"{p}_days_since_epoch"] = (
            ts - pd.Timestamp("1970-01-01")
        ).dt.days

        return result


# Business day calculations
def add_business_days(
    date: pd.Timestamp,
    n_days: int,
    country: str = "US",
) -> pd.Timestamp:
    """Add business days, skipping weekends and holidays."""
    cal = holidays.country_holidays(country)
    current = date
    days_added = 0

    direction = 1 if n_days >= 0 else -1
    target = abs(n_days)

    while days_added < target:
        current += pd.Timedelta(days=direction)
        if current.weekday() < 5 and current.date() not in cal:
            days_added += 1

    return current


# Usage
extractor = DatetimeFeatureExtractor(country="US")
df = extractor.extract_all(df, "order_date", prefix="order")
```

---

## Fiscal Calendar Alignment

```python
# fiscal_calendar.py — Align dates to fiscal calendars
import pandas as pd
from dataclasses import dataclass


@dataclass
class FiscalCalendar:
    """Fiscal calendar configuration."""
    fiscal_year_start_month: int = 4  # April = start of FY (common for many companies)

    def fiscal_year(self, date: pd.Timestamp) -> int:
        """Get fiscal year for a date."""
        if date.month >= self.fiscal_year_start_month:
            return date.year + 1  # FY2025 starts April 2024
        return date.year

    def fiscal_quarter(self, date: pd.Timestamp) -> int:
        """Get fiscal quarter (1-4)."""
        month_offset = (date.month - self.fiscal_year_start_month) % 12
        return (month_offset // 3) + 1

    def fiscal_month(self, date: pd.Timestamp) -> int:
        """Get fiscal month (1-12, where 1 = first month of FY)."""
        return ((date.month - self.fiscal_year_start_month) % 12) + 1

    def add_fiscal_columns(
        self, df: pd.DataFrame, date_column: str
    ) -> pd.DataFrame:
        """Add fiscal calendar columns to DataFrame."""
        result = df.copy()
        ts = pd.to_datetime(result[date_column])

        result["fiscal_year"] = ts.apply(self.fiscal_year)
        result["fiscal_quarter"] = ts.apply(self.fiscal_quarter)
        result["fiscal_month"] = ts.apply(self.fiscal_month)
        result["fiscal_period"] = (
            result["fiscal_year"].astype(str) + "-Q" +
            result["fiscal_quarter"].astype(str)
        )

        return result


# Usage
calendar = FiscalCalendar(fiscal_year_start_month=4)  # April FY start
df = calendar.add_fiscal_columns(df, "transaction_date")
```

---

## Quick Reference

| Problem | Solution |
|---------|----------|
| Unknown date format | `DateParser.detect_format()` then explicit format string |
| Mixed date formats | Per-value parsing with `dateutil.parser.parse()` |
| Day/month ambiguity | Statistical detection + `dayfirst` parameter |
| Timezone-naive timestamps | Localize with `dt.tz_localize()`, then convert |
| Mixed timezones per row | Per-row localization using timezone column |
| DST spring-forward gap | `nonexistent="shift_forward"` |
| DST fall-back duplicate | `ambiguous="NaT"` or `ambiguous="infer"` |
| Cyclical time features | sin/cos encoding: `sin(2 * pi * hour / 24)` |
| Business day math | `holidays` library + weekday check |
| Fiscal calendar | Custom offset from fiscal year start month |

| Feature Type | Columns Created | Use Case |
|-------------|----------------|----------|
| Calendar components | year, month, day, hour, dow | Basic temporal patterns |
| Boolean flags | is_weekend, is_holiday, is_month_end | Binary event indicators |
| Cyclical encoding | sin/cos pairs | Distance-based models |
| Days since epoch | Single numeric | Linear trend modeling |
| Fiscal periods | FY, quarter, period | Business reporting |

---

::: tip Key Takeaway
- A timestamp without timezone information is ambiguous and unreliable -- always localize naive timestamps and convert to UTC for storage.
- Daylight Saving Time creates nonexistent times (spring forward) and ambiguous times (fall back) that crash naive datetime code.
- Cyclical encoding (sin/cos) is essential for time features in distance-based models because midnight (hour 0) and 11 PM (hour 23) are 1 hour apart, not 23.
:::

::: details Exercise
**Build a Timezone-Aware Feature Extractor**

Write a function that:
1. Parses a date column with mixed formats (ISO 8601, US, European).
2. Localizes all timestamps to a specified source timezone, then converts to UTC.
3. Extracts: year, month, day_of_week, hour, is_weekend, is_holiday (US).
4. Adds cyclical encoding for month and hour (sin/cos pairs).
5. Handles DST transitions without errors.

**Solution Sketch**

```python
import pandas as pd, numpy as np
from dateutil import parser as dateutil_parser
import holidays

def extract_features(df, col, source_tz="US/Eastern"):
    result = df.copy()
    # Parse mixed formats
    result[col] = result[col].apply(
        lambda x: dateutil_parser.parse(str(x), fuzzy=True) if pd.notna(x) else pd.NaT
    )
    ts = pd.to_datetime(result[col])
    # Localize and convert
    ts = ts.dt.tz_localize(source_tz, ambiguous="NaT", nonexistent="shift_forward")
    ts = ts.dt.tz_convert("UTC")
    result[col] = ts
    # Features
    result[f"{col}_year"] = ts.dt.year
    result[f"{col}_month"] = ts.dt.month
    result[f"{col}_dow"] = ts.dt.dayofweek
    result[f"{col}_hour"] = ts.dt.hour
    result[f"{col}_is_weekend"] = ts.dt.dayofweek >= 5
    us_holidays = holidays.US()
    result[f"{col}_is_holiday"] = ts.dt.date.apply(lambda d: d in us_holidays if pd.notna(d) else False)
    # Cyclical
    result[f"{col}_month_sin"] = np.sin(2 * np.pi * ts.dt.month / 12)
    result[f"{col}_month_cos"] = np.cos(2 * np.pi * ts.dt.month / 12)
    result[f"{col}_hour_sin"] = np.sin(2 * np.pi * ts.dt.hour / 24)
    result[f"{col}_hour_cos"] = np.cos(2 * np.pi * ts.dt.hour / 24)
    return result
```
:::

::: details Debugging Scenario
**Your pipeline processes hourly data and works fine all year, but every March it produces duplicate records for one hour and every November it drops records for one hour.**

Diagnose and fix it.

**Answer**

This is a **Daylight Saving Time** issue:

- **March (spring forward)**: 2:00 AM jumps to 3:00 AM. If your pipeline generates hourly timestamps using `pd.date_range` with a local timezone, the 2:00 AM slot is **nonexistent**, and depending on configuration, it may either be skipped (missing data) or shifted, causing misalignment.
- **November (fall back)**: 1:00 AM occurs **twice**. Your pipeline produces records for both occurrences of 1 AM but deduplicates by timestamp string, keeping only one (lost data), or keeps both (apparent duplicates).

Fix: always generate time ranges in **UTC** and convert to local timezone only for display:
```python
# Generate in UTC (no DST transitions)
rng = pd.date_range("2024-01-01", "2024-12-31", freq="h", tz="UTC")
# Convert to local only for display
local = rng.tz_convert("US/Eastern")
```
:::

::: warning Common Misconceptions
- **"Timezone-naive timestamps are in UTC."** They are in *nothing* -- you are assuming a timezone that may be wrong. Always localize explicitly.
- **"DST only affects display, not data."** DST creates nonexistent and ambiguous times that cause real data loss and duplication if not handled programmatically.
- **"Encoding hour as an integer (0-23) is fine for ML models."** Linear and distance-based models see hour 0 and hour 23 as maximally distant (23 units apart). Cyclical encoding with sin/cos makes them 1 unit apart, reflecting reality.
- **"01/02/2024 is January 2nd."** In the US, yes. In Europe, it is February 1st. Date format is locale-dependent and must be detected or explicitly specified.
:::

::: details Quiz
**1. What is the difference between `tz_localize` and `tz_convert` in pandas?**

> `tz_localize` assigns a timezone to a naive (timezone-unaware) timestamp: "this timestamp was recorded in US/Eastern." `tz_convert` changes a timezone-aware timestamp to a different timezone: "show me this UTC time in US/Pacific."

**2. Why does cyclical encoding use both sine and cosine?**

> A single sine function is ambiguous: sin(January) equals sin(November). Using both sine and cosine creates a unique (x, y) coordinate on the unit circle for each time point, making all months/hours distinguishable.

**3. What does `nonexistent="shift_forward"` do during DST spring-forward?**

> It shifts nonexistent times (e.g., 2:30 AM during spring-forward) to the next valid time (3:00 AM) instead of raising an error or producing NaT.

**4. What is a fiscal calendar, and why does it matter for data pipelines?**

> A fiscal calendar defines financial year boundaries that differ from the calendar year (e.g., April-March for many companies). Pipelines feeding financial reports must align dates to fiscal periods, not calendar months.

**5. How do you detect whether a date column uses day-first or month-first format?**

> Examine the data statistically: if values in the first position exceed 12, they must be days (day-first). If both positions stay below 13, analyze the distribution spread -- days have a wider range (1-31) than months (1-12).
:::

> **One-Liner Summary:** Datetime preprocessing is the discipline of turning ambiguous, timezone-naive, format-inconsistent time strings into reliable UTC timestamps with rich cyclical features.
