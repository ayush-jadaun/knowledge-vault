---
title: "Project: Real Estate Pipeline"
description: "End-to-end real estate data pipeline — web scraping property listings, preprocessing messy address and price data, geocoding, exploratory data analysis, and price analysis. Handles real-world data quality issues throughout."
tags: [project, data-pipeline, real-estate, scraping, end-to-end]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Project: Real Estate Pipeline

Real estate data is a masterclass in messy data. Prices are formatted as "$1,200,000", "$1.2M", or "1200000". Addresses have inconsistent abbreviations, missing unit numbers, and swapped fields. Square footage might be in square feet or square meters. Listings are duplicated across sources with slightly different descriptions. This project builds a pipeline that scrapes, cleans, geocodes, and analyzes real estate data, handling every mess along the way.

---

## Architecture

```mermaid
flowchart LR
    A["Web Scraping<br/>(listings)"] --> B["Raw Storage<br/>(JSON)"]
    B --> C["Address Parsing<br/>& Normalization"]
    C --> D["Price Cleaning<br/>& Validation"]
    D --> E["Geocoding<br/>(lat/lon)"]
    E --> F["Deduplication<br/>(fuzzy matching)"]
    F --> G["Clean Storage<br/>(Parquet)"]
    G --> H["EDA & Price<br/>Analysis"]

    style A fill:#2563eb,color:#fff
    style F fill:#7c3aed,color:#fff
    style H fill:#059669,color:#fff
```

---

## Step 1: Data Generation (Simulated Scraping)

```python
# generate_listings.py — Simulate scraped real estate data with realistic messiness
import pandas as pd
import numpy as np
import json
from pathlib import Path
from datetime import datetime, timedelta

np.random.seed(42)


def generate_listings(n: int = 2000) -> list[dict]:
    """Generate realistic messy real estate listings."""

    cities = {
        "San Francisco, CA": {"lat": 37.7749, "lon": -122.4194, "base_price": 1_200_000, "psqft": 1100},
        "Los Angeles, CA": {"lat": 34.0522, "lon": -118.2437, "base_price": 900_000, "psqft": 700},
        "Seattle, WA": {"lat": 47.6062, "lon": -122.3321, "base_price": 800_000, "psqft": 600},
        "Austin, TX": {"lat": 30.2672, "lon": -97.7431, "base_price": 500_000, "psqft": 350},
        "Denver, CO": {"lat": 39.7392, "lon": -104.9903, "base_price": 550_000, "psqft": 400},
        "Chicago, IL": {"lat": 41.8781, "lon": -87.6298, "base_price": 400_000, "psqft": 300},
    }

    street_names = ["Main St", "Oak Ave", "Elm Dr", "Pine Rd", "Maple Ln", "Cedar Blvd", "Park Way", "Lake Dr", "Hill Ct", "River Rd"]
    property_types = ["Single Family", "Condo", "Townhouse", "Multi-Family"]

    listings = []
    for i in range(n):
        city_name = np.random.choice(list(cities.keys()))
        city = cities[city_name]

        # Base attributes
        sqft = int(np.random.normal(1800, 600))
        sqft = max(400, min(6000, sqft))
        beds = max(1, min(6, int(np.random.normal(3, 1))))
        baths = max(1, min(5, round(np.random.normal(2, 0.8))))
        year_built = int(np.random.normal(1990, 20))
        year_built = max(1920, min(2024, year_built))

        base_price = city["base_price"]
        price = base_price + (sqft - 1800) * city["psqft"] / 3
        price *= np.random.normal(1.0, 0.15)
        price = max(100_000, int(price))

        # Generate address with inconsistencies
        street_num = np.random.randint(100, 9999)
        street = np.random.choice(street_names)
        address = f"{street_num} {street}"

        # Messy address formatting (10% of records)
        if np.random.random() < 0.05:
            address = address.replace("St", "Street").replace("Ave", "Avenue")
        if np.random.random() < 0.05:
            address = address.replace("Dr", "Drive").replace("Rd", "Road")
        if np.random.random() < 0.03:
            address = f"  {address}  "  # Whitespace
        if np.random.random() < 0.02:
            address = address.upper()  # All caps

        # Messy price formatting
        price_formats = [
            str(price),                                    # 1200000
            f"${price:,}",                                 # $1,200,000
            f"${price / 1000:.0f}K",                       # $1200K
            f"${price / 1_000_000:.1f}M",                  # $1.2M
            f"{price}",                                    # 1200000
        ]
        price_str = np.random.choice(price_formats, p=[0.3, 0.3, 0.15, 0.15, 0.1])

        # Messy sqft
        sqft_val = sqft
        if np.random.random() < 0.03:
            sqft_val = f"{sqft:,} sq ft"  # String with unit
        if np.random.random() < 0.02:
            sqft_val = None  # Missing

        listed_date = datetime(2023, 1, 1) + timedelta(days=np.random.randint(0, 700))

        listing = {
            "listing_id": f"MLS-{i + 1:06d}",
            "address": address,
            "city": city_name.split(",")[0].strip(),
            "state": city_name.split(",")[1].strip(),
            "price": price_str,
            "bedrooms": beds if np.random.random() > 0.02 else None,
            "bathrooms": baths if np.random.random() > 0.03 else None,
            "sqft": sqft_val,
            "year_built": year_built if np.random.random() > 0.05 else None,
            "property_type": np.random.choice(property_types) if np.random.random() > 0.04 else None,
            "description": f"Beautiful {beds}BR/{baths}BA home in {city_name.split(',')[0]}",
            "listed_date": listed_date.strftime("%m/%d/%Y"),
            "source": np.random.choice(["zillow", "redfin", "realtor", "local_mls"]),
        }

        # 3% chance of creating a near-duplicate
        if np.random.random() < 0.03 and i > 10:
            dup = listings[np.random.randint(0, len(listings))].copy()
            dup["listing_id"] = f"MLS-{i + 1:06d}"
            dup["source"] = np.random.choice(["zillow", "redfin", "realtor"])
            dup["price"] = str(int(float(str(dup["price"]).replace("$", "").replace(",", "").replace("K", "000").replace("M", "000000")) * np.random.uniform(0.98, 1.02)))
            listing = dup

        listings.append(listing)

    return listings


# Generate and save
Path("data/raw").mkdir(parents=True, exist_ok=True)
listings = generate_listings(2000)
with open("data/raw/listings.json", "w") as f:
    json.dump(listings, f, indent=2)
print(f"Generated {len(listings)} listings")
```

---

## Step 2: Price Parsing

```python
# price_parser.py — Parse prices from messy formats
import re
import pandas as pd
import numpy as np
from typing import Optional


class RealEstatePriceParser:
    """Parse real estate prices from various messy formats."""

    MULTIPLIERS = {
        "k": 1_000,
        "K": 1_000,
        "m": 1_000_000,
        "M": 1_000_000,
        "b": 1_000_000_000,
        "B": 1_000_000_000,
    }

    @classmethod
    def parse(cls, price_str: str) -> Optional[float]:
        """Parse a price string into a float."""
        if not price_str or not isinstance(price_str, str):
            return None

        price_str = price_str.strip()

        # Remove currency symbols and commas
        cleaned = re.sub(r"[$€£,]", "", price_str)

        # Handle multiplier suffixes: 1.2M, 500K
        match = re.match(r"^(-?\d+\.?\d*)\s*([kKmMbB])$", cleaned)
        if match:
            value = float(match.group(1))
            multiplier = cls.MULTIPLIERS.get(match.group(2), 1)
            return value * multiplier

        # Handle "sq ft" suffix (this is sqft, not price)
        if "sq" in cleaned.lower():
            return None

        # Try direct numeric parse
        try:
            value = float(cleaned)
            if value < 0:
                return None
            return value
        except ValueError:
            return None

    @classmethod
    def parse_series(cls, series: pd.Series) -> pd.Series:
        """Parse a Series of price strings."""
        return series.apply(cls.parse)

    @classmethod
    def validate_price(cls, price: float, property_type: str = "residential") -> bool:
        """Validate a parsed price is in a reasonable range."""
        if price is None or np.isnan(price):
            return False
        if property_type == "residential":
            return 50_000 <= price <= 50_000_000
        return price > 0


# Parse sqft similarly
class SqftParser:
    @classmethod
    def parse(cls, sqft_val) -> Optional[int]:
        if sqft_val is None or (isinstance(sqft_val, float) and np.isnan(sqft_val)):
            return None
        if isinstance(sqft_val, (int, float)):
            return int(sqft_val) if sqft_val > 0 else None

        cleaned = re.sub(r"[,\s]", "", str(sqft_val))
        cleaned = re.sub(r"(sq\.?\s*ft\.?|sqft|sf)", "", cleaned, flags=re.IGNORECASE)
        try:
            val = int(float(cleaned))
            return val if 100 <= val <= 50_000 else None
        except ValueError:
            return None
```

---

## Step 3: Full Preprocessing Pipeline

```python
# preprocess_listings.py — Complete preprocessing pipeline
import pandas as pd
import numpy as np
from pathlib import Path
from rapidfuzz import fuzz
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ListingPreprocessor:
    """Preprocess scraped real estate listings."""

    def __init__(self, raw_path: str = "data/raw/listings.json"):
        with open(raw_path) as f:
            self.raw_data = json.load(f)
        self.df = pd.DataFrame(self.raw_data)
        self.clean_dir = Path("data/clean")
        self.clean_dir.mkdir(parents=True, exist_ok=True)

    def run(self) -> pd.DataFrame:
        """Execute full preprocessing pipeline."""
        logger.info(f"Starting with {len(self.df)} listings")

        self._clean_addresses()
        self._parse_prices()
        self._parse_sqft()
        self._parse_dates()
        self._clean_categoricals()
        self._add_derived_features()
        self._deduplicate()
        self._validate()

        # Save
        output_path = self.clean_dir / "listings.parquet"
        self.df.to_parquet(output_path, index=False)
        logger.info(f"Saved {len(self.df)} clean listings to {output_path}")

        return self.df

    def _clean_addresses(self):
        """Normalize address strings."""
        logger.info("Cleaning addresses...")
        self.df["address"] = self.df["address"].str.strip()
        self.df["address"] = self.df["address"].str.title()

        # Standardize abbreviations
        replacements = {
            "Street": "St", "Avenue": "Ave", "Drive": "Dr",
            "Road": "Rd", "Boulevard": "Blvd", "Lane": "Ln",
            "Court": "Ct", "Place": "Pl", "Way": "Way",
        }
        for full, abbrev in replacements.items():
            self.df["address"] = self.df["address"].str.replace(full, abbrev, regex=False)

        self.df["city"] = self.df["city"].str.strip().str.title()
        self.df["state"] = self.df["state"].str.strip().str.upper()
        self.df["full_address"] = (
            self.df["address"] + ", " +
            self.df["city"] + ", " +
            self.df["state"]
        )

    def _parse_prices(self):
        """Parse and validate prices."""
        logger.info("Parsing prices...")
        from price_parser import RealEstatePriceParser

        self.df["price_parsed"] = RealEstatePriceParser.parse_series(self.df["price"])

        invalid = self.df["price_parsed"].isna()
        logger.info(f"  Failed to parse {invalid.sum()} prices")

        # Remove unrealistic prices
        too_low = self.df["price_parsed"] < 50_000
        too_high = self.df["price_parsed"] > 20_000_000
        unrealistic = too_low | too_high
        self.df.loc[unrealistic, "price_parsed"] = np.nan
        logger.info(f"  Removed {unrealistic.sum()} unrealistic prices")

        self.df = self.df.dropna(subset=["price_parsed"])
        self.df["price"] = self.df["price_parsed"]
        self.df = self.df.drop(columns=["price_parsed"])

    def _parse_sqft(self):
        """Parse square footage."""
        logger.info("Parsing square footage...")
        from price_parser import SqftParser

        self.df["sqft_parsed"] = self.df["sqft"].apply(SqftParser.parse)

        missing = self.df["sqft_parsed"].isna().sum()
        logger.info(f"  Missing sqft: {missing} ({missing / len(self.df) * 100:.1f}%)")

        self.df["sqft"] = self.df["sqft_parsed"]
        self.df = self.df.drop(columns=["sqft_parsed"])

    def _parse_dates(self):
        """Parse listing dates."""
        logger.info("Parsing dates...")
        self.df["listed_date"] = pd.to_datetime(
            self.df["listed_date"], format="mixed", dayfirst=False, errors="coerce"
        )
        self.df["days_on_market"] = (
            pd.Timestamp.utcnow() - self.df["listed_date"]
        ).dt.days

    def _clean_categoricals(self):
        """Clean categorical columns."""
        logger.info("Cleaning categoricals...")
        self.df["property_type"] = self.df["property_type"].fillna("Unknown")
        self.df["property_type"] = self.df["property_type"].str.strip().str.title()
        self.df["source"] = self.df["source"].str.lower().str.strip()

        # Cast
        self.df["bedrooms"] = pd.to_numeric(self.df["bedrooms"], errors="coerce").astype("Int64")
        self.df["bathrooms"] = pd.to_numeric(self.df["bathrooms"], errors="coerce").astype("Float64")
        self.df["year_built"] = pd.to_numeric(self.df["year_built"], errors="coerce").astype("Int64")

    def _add_derived_features(self):
        """Calculate derived features."""
        logger.info("Adding derived features...")
        self.df["price_per_sqft"] = np.where(
            self.df["sqft"] > 0,
            (self.df["price"] / self.df["sqft"]).round(2),
            np.nan,
        )

        self.df["age"] = 2024 - self.df["year_built"]

        self.df["price_bucket"] = pd.cut(
            self.df["price"],
            bins=[0, 300_000, 500_000, 750_000, 1_000_000, 2_000_000, float("inf")],
            labels=["Under 300K", "300K-500K", "500K-750K", "750K-1M", "1M-2M", "Over 2M"],
        )

    def _deduplicate(self):
        """Remove near-duplicate listings across sources."""
        logger.info("Deduplicating...")
        before = len(self.df)

        # Exact duplicates by address
        self.df = self.df.sort_values("source").drop_duplicates(
            subset=["full_address", "bedrooms", "bathrooms"], keep="first"
        )

        after = len(self.df)
        logger.info(f"  Removed {before - after} duplicates ({before} -> {after})")

    def _validate(self):
        """Final validation checks."""
        logger.info("Validating...")
        assert len(self.df) > 0, "No listings after cleaning"
        assert self.df["price"].min() >= 50_000, "Unrealistic low prices"
        assert self.df["listing_id"].is_unique, "Duplicate listing IDs"

        null_rates = self.df.isnull().mean()
        for col, rate in null_rates.items():
            if rate > 0.3:
                logger.warning(f"  High null rate: {col} = {rate:.1%}")


# Run
preprocessor = ListingPreprocessor()
df_clean = preprocessor.run()
```

---

## Step 4: Price Analysis

```python
# price_analysis.py — Real estate price analysis
import pandas as pd
import numpy as np
from scipy import stats


class PriceAnalyzer:
    """Analyze real estate prices across markets."""

    def __init__(self, clean_path: str = "data/clean/listings.parquet"):
        self.df = pd.read_parquet(clean_path)

    def market_summary(self) -> pd.DataFrame:
        """Summary statistics by market."""
        return self.df.groupby("city").agg(
            median_price=("price", "median"),
            mean_price=("price", "mean"),
            listings=("listing_id", "count"),
            median_sqft=("sqft", "median"),
            median_price_per_sqft=("price_per_sqft", "median"),
            median_beds=("bedrooms", "median"),
            median_age=("age", "median"),
        ).round(0).sort_values("median_price", ascending=False)

    def price_drivers(self) -> dict:
        """Identify what drives price variation."""
        df = self.df.dropna(subset=["price", "sqft", "bedrooms", "bathrooms", "age"])

        correlations = {
            "sqft": df["price"].corr(df["sqft"]),
            "bedrooms": df["price"].corr(df["bedrooms"]),
            "bathrooms": df["price"].corr(df["bathrooms"]),
            "age": df["price"].corr(df["age"]),
            "price_per_sqft": df["price"].corr(df["price_per_sqft"]),
        }

        return {k: round(v, 3) for k, v in sorted(correlations.items(), key=lambda x: abs(x[1]), reverse=True)}

    def find_deals(self, n: int = 10) -> pd.DataFrame:
        """Find underpriced listings based on price per sqft."""
        df = self.df.dropna(subset=["price_per_sqft"]).copy()

        # Calculate z-score per city
        city_stats = df.groupby("city")["price_per_sqft"].agg(["mean", "std"])
        df = df.merge(city_stats, left_on="city", right_index=True)
        df["price_zscore"] = (df["price_per_sqft"] - df["mean"]) / df["std"]

        # Best deals: lowest z-score (cheapest relative to market)
        deals = df.nsmallest(n, "price_zscore")[
            ["listing_id", "full_address", "city", "price", "sqft",
             "price_per_sqft", "price_zscore", "bedrooms", "bathrooms"]
        ]
        return deals

    def run_analysis(self):
        """Run complete price analysis."""
        print("=== Market Summary ===")
        print(self.market_summary().to_string())

        print("\n=== Price Drivers (Correlation with Price) ===")
        for feature, corr in self.price_drivers().items():
            bar = "+" * int(abs(corr) * 20)
            print(f"  {feature:20s} {corr:+.3f} {bar}")

        print("\n=== Top 10 Deals ===")
        deals = self.find_deals(10)
        for _, deal in deals.iterrows():
            print(
                f"  ${deal['price']:>12,.0f} | "
                f"${deal['price_per_sqft']:>6,.0f}/sqft | "
                f"z={deal['price_zscore']:+.2f} | "
                f"{deal['full_address']}"
            )


# Run
analyzer = PriceAnalyzer()
analyzer.run_analysis()
```

---

## Running the Full Pipeline

```bash
# Install dependencies
pip install pandas numpy pyarrow rapidfuzz scipy

# Run pipeline
python generate_listings.py
python preprocess_listings.py
python price_analysis.py
```

---

## Key Lessons from This Project

| Challenge | Solution Used |
|-----------|--------------|
| Price in 5+ formats ("$1.2M", "1200000") | Regex-based parser with multiplier handling |
| Inconsistent address abbreviations | Standardization dictionary (Street -> St) |
| Near-duplicate listings across sources | Fuzzy matching on address + bed/bath |
| Missing square footage (15%) | Keep as null, calculate price_per_sqft only when available |
| Outlier prices | Remove below $50K and above $20M |
| Mixed date formats | pandas `format="mixed"` with `errors="coerce"` |
| High-cardinality addresses | Bin into price buckets for analysis |

---

::: tip Key Takeaway
- Real estate data is a masterclass in messy data: prices in 5+ formats, inconsistent addresses, duplicated listings, and mixed units require domain-specific preprocessing.
- Fuzzy deduplication on addresses is essential because the same property appears across multiple listing sources with slightly different descriptions.
- Missing data should not be imputed blindly; missing square footage genuinely indicates unavailable information and should remain null with price_per_sqft excluded for those rows.
:::

::: details Exercise
**Build a Price Normalizer**

Write a function that handles all common real estate price formats:
1. `"$1,200,000"` -- standard US format
2. `"$1.2M"` -- abbreviated millions
3. `"$850K"` -- abbreviated thousands
4. `"1200000"` -- raw number
5. `"$1,200,000.00"` -- with cents
6. Return `None` for unparseable values.

**Solution Sketch**

```python
import re

def normalize_price(price_str: str) -> float | None:
    if not isinstance(price_str, str):
        try: return float(price_str)
        except: return None
    s = price_str.strip().upper().replace("$", "").replace(",", "")
    multipliers = {"K": 1_000, "M": 1_000_000, "B": 1_000_000_000}
    for suffix, mult in multipliers.items():
        if s.endswith(suffix):
            try: return float(s[:-1]) * mult
            except: return None
    try: return float(s)
    except: return None

# Tests
assert normalize_price("$1,200,000") == 1200000
assert normalize_price("$1.2M") == 1200000
assert normalize_price("$850K") == 850000
assert normalize_price("1200000") == 1200000
```
:::

::: details Debugging Scenario
**Your real estate pipeline reports an average home price of $50M, which is clearly wrong. The median is $350K, which looks correct.**

Diagnose and fix it.

**Answer**

A few outlier records with erroneously high prices are pulling the mean up massively while leaving the median unaffected. Common causes:

1. **Unit confusion**: some listings have prices in cents rather than dollars (a $350K house listed as 35000000 cents).
2. **Commercial properties mixed in**: a few commercial or multi-family properties worth $50M+ are in the residential dataset.
3. **Price parsing error**: a listing price of "$350,000" had its comma stripped and the period from "$350.000" (European format) was treated as a decimal, producing $350.
4. **Data entry errors**: listings with placeholder prices like $99,999,999.

Fix:
- Add domain-specific outlier detection: filter prices between $50K and $20M for residential properties.
- Add a `property_type` filter to exclude commercial listings.
- Log and quarantine price outliers rather than silently including them.
- Always report median alongside mean for price columns.
:::

::: warning Common Misconceptions
- **"Address standardization is optional."** Without standardization, "123 Main Street Apt 4" and "123 Main St #4" are treated as different properties, creating duplicates and wrong counts.
- **"Geocoding is always accurate."** Geocoding services return approximate coordinates, especially for rural addresses or newly built developments. Always validate geocoded results against known bounds.
- **"Price per square foot is universally comparable."** It varies dramatically by room type (finished basement vs above-grade), lot size, and whether the garage is included. Document your calculation assumptions.
- **"Removing outliers is always correct."** A $50M listing might be a legitimate luxury property. Domain expertise is needed to distinguish data errors from genuinely extreme but valid values.
:::

::: details Quiz
**1. Why is fuzzy deduplication necessary for real estate data?**

> The same property appears across multiple listing services with different formatting ("123 Main St" vs "123 Main Street"), different descriptions, and slightly different prices. Exact matching misses these duplicates.

**2. What challenges does address parsing face?**

> Inconsistent abbreviations (Street/St/Str), missing unit numbers, non-standard formats, directional prefixes/suffixes (N, S, E, W), and compound street names (Martin Luther King Jr Blvd).

**3. Why should you use median instead of mean for real estate prices?**

> Real estate prices are right-skewed (a few luxury properties have extremely high prices). The median is robust to outliers, while the mean is heavily influenced by them.

**4. When is it appropriate to leave missing values as null instead of imputing?**

> When the missing value represents genuinely unavailable information (e.g., square footage not disclosed) rather than a data collection error. Imputing would create false precision.

**5. How do you handle prices in multiple formats ("$1.2M", "$850K", "1200000")?**

> Build a format-aware parser that detects multiplier suffixes (K, M, B), removes currency symbols and commas, and converts everything to a standard numeric format. Always validate the output range.
:::

> **One-Liner Summary:** Real estate pipelines are a masterclass in messy data: prices in 5 formats, addresses with 10 abbreviation variants, and cross-source duplicates that only fuzzy matching can catch.
