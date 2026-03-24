---
title: "Project: Financial Data EDA"
description: "Complete financial EDA — stock price analysis, returns distributions, volatility modeling, risk metrics, correlation, and technical indicators"
tags: [finance, stock-analysis, volatility, risk-metrics, technical-indicators]
difficulty: advanced
prerequisites: [pandas-advanced, matplotlib, scipy-stats]
lastReviewed: "2026-03-24"
---

# Project: Financial Data EDA

Financial data has unique characteristics: time dependence, heavy-tailed returns, volatility clustering, and regime changes. This project demonstrates a complete financial EDA covering price analysis, return distributions, risk metrics, portfolio correlation, and technical indicators.

---

## Dataset Setup

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats

sns.set_theme(style='whitegrid')
np.random.seed(42)

# Simulate realistic stock price data for 5 stocks
n_days = 1000  # ~4 years
dates = pd.bdate_range('2021-01-04', periods=n_days)

def simulate_gbm(mu, sigma, s0, n):
    """Geometric Brownian Motion for stock prices."""
    dt = 1/252
    returns = np.random.normal(mu * dt, sigma * np.sqrt(dt), n)
    prices = s0 * np.exp(np.cumsum(returns))
    return prices

stocks = pd.DataFrame({
    'date': dates,
    'TECH':   simulate_gbm(0.15, 0.30, 150, n_days),
    'BANK':   simulate_gbm(0.08, 0.20, 45, n_days),
    'RETAIL': simulate_gbm(0.05, 0.25, 80, n_days),
    'ENERGY': simulate_gbm(0.10, 0.35, 60, n_days),
    'HEALTH': simulate_gbm(0.12, 0.18, 120, n_days),
}).set_index('date').round(2)

# Simulate volume
volume = pd.DataFrame({
    ticker: np.random.lognormal(15, 0.5, n_days).astype(int)
    for ticker in stocks.columns
}, index=dates)

print(stocks.tail())
print(f"\nDate range: {stocks.index[0]} to {stocks.index[-1]}")
print(f"Trading days: {len(stocks)}")
```

---

## Price Analysis

```python
# Normalize prices for comparison (base 100)
normalized = stocks / stocks.iloc[0] * 100

fig, axes = plt.subplots(2, 1, figsize=(14, 10))

# Absolute prices
for col in stocks.columns:
    axes[0].plot(stocks.index, stocks[col], label=col, linewidth=1.5)
axes[0].set_title('Stock Prices', fontsize=14, fontweight='bold')
axes[0].set_ylabel('Price ($)')
axes[0].legend()
axes[0].grid(True, alpha=0.3)

# Normalized
for col in normalized.columns:
    axes[1].plot(normalized.index, normalized[col], label=col, linewidth=1.5)
axes[1].set_title('Normalized Prices (Base = 100)', fontsize=14, fontweight='bold')
axes[1].set_ylabel('Indexed Price')
axes[1].axhline(y=100, color='black', linestyle='--', alpha=0.3)
axes[1].legend()
axes[1].grid(True, alpha=0.3)

plt.tight_layout()
plt.show()

# Price statistics
price_stats = stocks.describe().round(2)
print("\nPrice Statistics:")
print(price_stats)
```

---

## Returns Analysis

```python
# Daily returns (log returns preferred for financial analysis)
log_returns = np.log(stocks / stocks.shift(1)).dropna()
simple_returns = stocks.pct_change().dropna()

# Summary statistics
return_stats = pd.DataFrame({
    'Annual Return': (log_returns.mean() * 252).round(4),
    'Annual Vol': (log_returns.std() * np.sqrt(252)).round(4),
    'Sharpe (rf=4%)': ((log_returns.mean() * 252 - 0.04) / (log_returns.std() * np.sqrt(252))).round(3),
    'Skewness': log_returns.skew().round(3),
    'Kurtosis': log_returns.kurtosis().round(3),
    'Min Daily': log_returns.min().round(4),
    'Max Daily': log_returns.max().round(4),
    'VaR 5%': log_returns.quantile(0.05).round(4),
})
print("Return Statistics:")
print(return_stats)

# Return distributions
fig, axes = plt.subplots(2, 3, figsize=(18, 10))
for i, ticker in enumerate(stocks.columns):
    r = i // 3
    c = i % 3
    ax = axes[r, c]

    returns_data = log_returns[ticker]
    ax.hist(returns_data, bins=60, density=True, alpha=0.6,
            edgecolor='white', color='steelblue', label='Actual')

    # Overlay normal distribution
    x = np.linspace(returns_data.min(), returns_data.max(), 200)
    normal_pdf = stats.norm.pdf(x, returns_data.mean(), returns_data.std())
    ax.plot(x, normal_pdf, 'r-', linewidth=2, label='Normal')

    ax.set_title(f'{ticker} (kurt={returns_data.kurtosis():.2f})')
    ax.legend(fontsize=8)

axes[1, 2].set_visible(False)
plt.suptitle('Daily Log Return Distributions', fontsize=14, fontweight='bold')
plt.tight_layout()
plt.show()
```

### Normality Testing

```python
print("\nNormality Tests for Returns:")
print(f"{'Ticker':<10} {'Shapiro p':>10} {'JB p':>10} {'Normal?':>10}")
print("-" * 45)

for ticker in stocks.columns:
    returns_data = log_returns[ticker].values
    _, p_shapiro = stats.shapiro(returns_data[:5000])
    _, p_jb = stats.jarque_bera(returns_data)
    is_normal = p_shapiro > 0.05 and p_jb > 0.05
    print(f"{ticker:<10} {p_shapiro:>10.4f} {p_jb:>10.4f} {'Yes' if is_normal else 'No':>10}")

# QQ plot for the most non-normal stock
fig, axes = plt.subplots(1, 2, figsize=(14, 5))
most_kurtotic = log_returns.kurtosis().idxmax()
stats.probplot(log_returns[most_kurtotic], dist='norm', plot=axes[0])
axes[0].set_title(f'{most_kurtotic} — Normal QQ')

# Compare with t-distribution
from scipy.stats import t
params = t.fit(log_returns[most_kurtotic])
stats.probplot(log_returns[most_kurtotic], dist=t, sparams=params, plot=axes[1])
axes[1].set_title(f'{most_kurtotic} — Student-t QQ (df={params[0]:.1f})')

plt.tight_layout()
plt.show()
```

---

## Volatility Analysis

```python
# Rolling volatility (annualized)
rolling_vol = log_returns.rolling(window=21).std() * np.sqrt(252)

fig, ax = plt.subplots(figsize=(14, 6))
for ticker in stocks.columns:
    ax.plot(rolling_vol.index, rolling_vol[ticker], label=ticker, linewidth=1.2)
ax.set_title('21-Day Rolling Volatility (Annualized)', fontsize=14, fontweight='bold')
ax.set_ylabel('Volatility')
ax.legend()
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()

# Volatility clustering: squared returns autocorrelation
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

ticker = 'TECH'
squared_returns = log_returns[ticker] ** 2

# Autocorrelation of squared returns (ARCH effect)
from statsmodels.graphics.tsaplots import plot_acf
plot_acf(squared_returns.dropna(), lags=40, ax=axes[0], alpha=0.05)
axes[0].set_title(f'{ticker} — Squared Returns ACF (Volatility Clustering)')

# Absolute returns autocorrelation
plot_acf(log_returns[ticker].abs().dropna(), lags=40, ax=axes[1], alpha=0.05)
axes[1].set_title(f'{ticker} — Absolute Returns ACF')

plt.tight_layout()
plt.show()
```

---

## Risk Metrics

```python
def compute_risk_metrics(returns, rf=0.04/252, conf_level=0.95):
    """Compute comprehensive risk metrics."""
    metrics = {}

    # Basic
    metrics['annualized_return'] = returns.mean() * 252
    metrics['annualized_vol'] = returns.std() * np.sqrt(252)
    metrics['sharpe_ratio'] = (returns.mean() - rf) / returns.std() * np.sqrt(252)

    # Value at Risk
    metrics['VaR_95_parametric'] = stats.norm.ppf(1 - conf_level, returns.mean(), returns.std())
    metrics['VaR_95_historical'] = returns.quantile(1 - conf_level)
    metrics['CVaR_95'] = returns[returns <= returns.quantile(1 - conf_level)].mean()

    # Drawdown
    cumulative = (1 + returns).cumprod()
    running_max = cumulative.cummax()
    drawdown = (cumulative - running_max) / running_max
    metrics['max_drawdown'] = drawdown.min()
    metrics['avg_drawdown'] = drawdown[drawdown < 0].mean()

    # Downside risk
    downside = returns[returns < 0]
    metrics['downside_vol'] = downside.std() * np.sqrt(252)
    metrics['sortino_ratio'] = (returns.mean() - rf) / downside.std() * np.sqrt(252)

    # Tail risk
    metrics['skewness'] = returns.skew()
    metrics['kurtosis'] = returns.kurtosis()

    return metrics

# Compute for all stocks
risk_df = pd.DataFrame({
    ticker: compute_risk_metrics(log_returns[ticker])
    for ticker in stocks.columns
}).round(4)

print("\nComprehensive Risk Metrics:")
print(risk_df.T)
```

### Drawdown Analysis

```python
fig, axes = plt.subplots(2, 1, figsize=(14, 10), gridspec_kw={'height_ratios': [2, 1]})

ticker = 'TECH'
cumulative = (1 + log_returns[ticker]).cumprod()
running_max = cumulative.cummax()
drawdown = (cumulative - running_max) / running_max

axes[0].plot(cumulative.index, cumulative, label='Cumulative Return', color='steelblue')
axes[0].plot(running_max.index, running_max, 'r--', label='Running Max', alpha=0.5)
axes[0].set_title(f'{ticker} — Cumulative Returns', fontsize=14, fontweight='bold')
axes[0].legend()
axes[0].grid(True, alpha=0.3)

axes[1].fill_between(drawdown.index, drawdown.values, 0, color='red', alpha=0.5)
axes[1].set_title(f'{ticker} — Drawdown', fontsize=14, fontweight='bold')
axes[1].set_ylabel('Drawdown')
axes[1].grid(True, alpha=0.3)

plt.tight_layout()
plt.show()

max_dd = drawdown.min()
max_dd_end = drawdown.idxmin()
max_dd_start = cumulative[:max_dd_end].idxmax()
print(f"Max Drawdown: {max_dd:.2%}")
print(f"Period: {max_dd_start.date()} to {max_dd_end.date()}")
```

---

## Correlation and Diversification

```python
# Return correlations
corr = log_returns.corr()

fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# Static correlation heatmap
sns.heatmap(corr, annot=True, fmt='.2f', cmap='RdBu_r', center=0,
            vmin=-1, vmax=1, square=True, ax=axes[0])
axes[0].set_title('Return Correlations')

# Rolling correlation (e.g., TECH vs BANK)
rolling_corr = log_returns['TECH'].rolling(60).corr(log_returns['BANK'])
axes[1].plot(rolling_corr.index, rolling_corr.values, color='steelblue')
axes[1].axhline(y=corr.loc['TECH', 'BANK'], color='red', linestyle='--',
                label=f'Full-period: {corr.loc["TECH", "BANK"]:.3f}')
axes[1].set_title('60-Day Rolling Correlation: TECH vs BANK')
axes[1].set_ylabel('Correlation')
axes[1].legend()
axes[1].grid(True, alpha=0.3)

plt.tight_layout()
plt.show()
```

---

## Technical Indicators

```python
ticker = 'TECH'
price = stocks[ticker].copy()

# Moving averages
ma_20 = price.rolling(20).mean()
ma_50 = price.rolling(50).mean()
ma_200 = price.rolling(200).mean()

# Bollinger Bands
bb_mid = price.rolling(20).mean()
bb_std = price.rolling(20).std()
bb_upper = bb_mid + 2 * bb_std
bb_lower = bb_mid - 2 * bb_std

# RSI (Relative Strength Index)
delta = price.diff()
gain = delta.where(delta > 0, 0).rolling(14).mean()
loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
rs = gain / loss
rsi = 100 - (100 / (1 + rs))

# MACD
ema_12 = price.ewm(span=12).mean()
ema_26 = price.ewm(span=26).mean()
macd = ema_12 - ema_26
signal = macd.ewm(span=9).mean()
macd_hist = macd - signal

# Plot technical analysis dashboard
fig, axes = plt.subplots(4, 1, figsize=(16, 16), gridspec_kw={'height_ratios': [3, 1, 1, 1]})

# Price + MAs + Bollinger
axes[0].plot(price.index, price, label=ticker, color='black', linewidth=1)
axes[0].plot(ma_20.index, ma_20, label='MA20', linewidth=1)
axes[0].plot(ma_50.index, ma_50, label='MA50', linewidth=1)
axes[0].fill_between(bb_upper.index, bb_lower, bb_upper, alpha=0.1, color='blue')
axes[0].set_title(f'{ticker} — Price with Technical Indicators', fontweight='bold')
axes[0].legend(fontsize=9)

# Volume
axes[1].bar(volume.index, volume[ticker], width=1, alpha=0.5, color='steelblue')
axes[1].set_title('Volume')

# RSI
axes[2].plot(rsi.index, rsi, color='purple', linewidth=1)
axes[2].axhline(y=70, color='red', linestyle='--', alpha=0.5)
axes[2].axhline(y=30, color='green', linestyle='--', alpha=0.5)
axes[2].fill_between(rsi.index, 30, 70, alpha=0.05, color='gray')
axes[2].set_title('RSI (14)')
axes[2].set_ylim(0, 100)

# MACD
axes[3].plot(macd.index, macd, label='MACD', color='blue', linewidth=1)
axes[3].plot(signal.index, signal, label='Signal', color='red', linewidth=1)
colors = ['green' if v >= 0 else 'red' for v in macd_hist]
axes[3].bar(macd_hist.index, macd_hist, color=colors, alpha=0.5, width=1)
axes[3].set_title('MACD')
axes[3].legend(fontsize=9)

for ax in axes:
    ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.show()
```

---

## Regime Detection

```python
# Simple volatility regime detection
vol_21 = log_returns['TECH'].rolling(21).std() * np.sqrt(252)
vol_median = vol_21.median()
vol_p75 = vol_21.quantile(0.75)

regime = pd.Series('Normal', index=vol_21.index)
regime[vol_21 > vol_p75] = 'High Vol'
regime[vol_21 < vol_21.quantile(0.25)] = 'Low Vol'
regime[vol_21.isna()] = np.nan

# Regime-dependent return statistics
for r in ['Low Vol', 'Normal', 'High Vol']:
    mask = regime == r
    r_data = log_returns['TECH'][mask]
    print(f"{r:>10}: mean={r_data.mean()*252:.2%}, vol={r_data.std()*np.sqrt(252):.2%}, "
          f"sharpe={(r_data.mean()-0.04/252)/r_data.std()*np.sqrt(252):.2f}, "
          f"n_days={mask.sum()}")

# Calendar analysis
monthly_returns = log_returns.resample('M').sum()
monthly_avg = monthly_returns.groupby(monthly_returns.index.month).mean()

fig, ax = plt.subplots(figsize=(12, 5))
monthly_avg.plot(kind='bar', ax=ax)
ax.set_title('Average Monthly Returns by Calendar Month')
ax.set_xlabel('Month')
ax.set_ylabel('Average Return')
ax.legend(title='Stock')
plt.tight_layout()
plt.show()
```

---

## Key Takeaways

- Financial returns are **not normally distributed** — they exhibit heavy tails (excess kurtosis) and sometimes skewness
- Use **log returns** for analysis (additive over time, approximately normal for small values)
- **Volatility clusters**: periods of high volatility tend to follow each other — check squared returns autocorrelation
- **Risk metrics** beyond standard deviation: VaR, CVaR, maximum drawdown, Sortino ratio tell different stories
- **Rolling correlations** change over time — static correlation matrices can be misleading
- **Drawdown analysis** is more intuitive than volatility for communicating risk to non-technical stakeholders
- Always test for **regime changes** — a single model/distribution rarely fits the entire sample period
