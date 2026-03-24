---
title: "Plotly for EDA"
description: "Interactive visualization with Plotly for EDA — Plotly Express, hover data, animations, facets, dashboards, and export to HTML/images"
tags: [plotly, interactive-visualization, plotly-express, animation, dashboards]
difficulty: intermediate
prerequisites: [pandas-fundamentals, matplotlib]
lastReviewed: "2026-03-24"
---

# Plotly for EDA

Plotly creates interactive, browser-based visualizations where you can zoom, pan, hover for details, and filter data on the fly. This interactivity makes it ideal for exploratory analysis where you want to drill into specific data points.

---

## Plotly Express Quickstart

```python
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np

# Simulated dataset
np.random.seed(42)
n = 3000
df = pd.DataFrame({
    'date':       pd.date_range('2023-01-01', periods=n, freq='h')[:n],
    'revenue':    np.random.lognormal(4, 1, n).round(2),
    'quantity':   np.random.poisson(5, n),
    'category':   np.random.choice(['Electronics', 'Clothing', 'Food', 'Books'], n),
    'region':     np.random.choice(['North', 'South', 'East', 'West'], n),
    'channel':    np.random.choice(['Online', 'Store', 'Phone'], n, p=[0.5, 0.35, 0.15]),
    'satisfaction': np.random.uniform(1, 5, n).round(1),
    'return_rate':  np.random.beta(2, 10, n).round(3),
})
df['month'] = df['date'].dt.to_period('M').astype(str)
df['profit'] = df['revenue'] * np.random.uniform(0.1, 0.4, n)
```

---

## Scatter Plots

```python
# Basic scatter with rich hover data
fig = px.scatter(
    df, x='revenue', y='profit',
    color='category', size='quantity',
    hover_data=['region', 'channel', 'satisfaction'],
    title='Revenue vs Profit by Category',
    opacity=0.6,
    log_x=True, log_y=True,
    labels={'revenue': 'Revenue ($)', 'profit': 'Profit ($)'},
)
fig.update_layout(height=600, width=900)
fig.show()

# Scatter matrix (pairplot equivalent)
fig = px.scatter_matrix(
    df[['revenue', 'profit', 'quantity', 'satisfaction', 'category']].sample(500),
    dimensions=['revenue', 'profit', 'quantity', 'satisfaction'],
    color='category',
    title='Scatter Matrix: Key Metrics',
    opacity=0.4,
)
fig.update_traces(diagonal_visible=False)
fig.update_layout(height=800, width=800)
fig.show()
```

---

## Distribution Plots

```python
# Histogram with marginal
fig = px.histogram(
    df, x='revenue', color='category',
    marginal='box',           # box, violin, rug
    nbins=60,
    title='Revenue Distribution by Category',
    barmode='overlay',
    opacity=0.6,
    log_x=True,
)
fig.show()

# KDE-like: histogram with curve
fig = px.histogram(
    df, x='satisfaction', color='channel',
    histnorm='probability density',
    nbins=30,
    marginal='violin',
    title='Satisfaction Distribution by Channel',
    barmode='overlay', opacity=0.5,
)
fig.show()

# Box plot
fig = px.box(
    df, x='category', y='revenue',
    color='channel',
    title='Revenue by Category and Channel',
    log_y=True,
    notched=True,
    points='outliers',
)
fig.show()

# Violin plot
fig = px.violin(
    df, x='region', y='satisfaction',
    color='region', box=True, points='all',
    title='Satisfaction by Region',
)
fig.show()
```

---

## Bar Charts

```python
# Aggregated bar
agg = df.groupby('category').agg(
    total_revenue=('revenue', 'sum'),
    avg_satisfaction=('satisfaction', 'mean'),
    n_orders=('revenue', 'count'),
).reset_index()

fig = px.bar(
    agg, x='category', y='total_revenue',
    color='category',
    text='total_revenue',
    title='Total Revenue by Category',
    labels={'total_revenue': 'Total Revenue ($)'},
)
fig.update_traces(texttemplate='$%{text:,.0f}', textposition='outside')
fig.show()

# Stacked bar
monthly = df.groupby(['month', 'category'])['revenue'].sum().reset_index()
fig = px.bar(
    monthly, x='month', y='revenue', color='category',
    title='Monthly Revenue by Category (Stacked)',
    barmode='stack',
)
fig.update_xaxes(tickangle=45)
fig.show()

# Grouped bar with percentage
fig = px.histogram(
    df, x='region', color='channel',
    barnorm='percent',
    title='Channel Mix by Region (%)',
    text_auto='.1f',
)
fig.show()
```

---

## Line Charts and Time Series

```python
# Daily aggregation with moving average
daily = df.set_index('date').resample('D')['revenue'].agg(['sum', 'count']).reset_index()
daily.columns = ['date', 'daily_revenue', 'n_orders']
daily['ma_7'] = daily['daily_revenue'].rolling(7).mean()
daily['ma_30'] = daily['daily_revenue'].rolling(30).mean()

fig = go.Figure()
fig.add_trace(go.Scatter(
    x=daily['date'], y=daily['daily_revenue'],
    name='Daily Revenue', mode='lines', opacity=0.3, line=dict(color='steelblue')
))
fig.add_trace(go.Scatter(
    x=daily['date'], y=daily['ma_7'],
    name='7-Day MA', mode='lines', line=dict(color='orange', width=2)
))
fig.add_trace(go.Scatter(
    x=daily['date'], y=daily['ma_30'],
    name='30-Day MA', mode='lines', line=dict(color='red', width=3)
))

fig.update_layout(
    title='Daily Revenue with Moving Averages',
    xaxis_title='Date', yaxis_title='Revenue ($)',
    hovermode='x unified',
    height=500,
)
fig.show()
```

---

## Heatmaps and Correlation

```python
# Correlation heatmap
numeric_cols = ['revenue', 'profit', 'quantity', 'satisfaction', 'return_rate']
corr = df[numeric_cols].corr()

fig = px.imshow(
    corr,
    text_auto='.2f',
    color_continuous_scale='RdBu_r',
    zmin=-1, zmax=1,
    title='Correlation Matrix',
    aspect='equal',
)
fig.update_layout(height=500, width=600)
fig.show()

# Pivot heatmap
pivot = df.groupby(['category', 'region'])['revenue'].mean().reset_index()
pivot_wide = pivot.pivot(index='category', columns='region', values='revenue')

fig = px.imshow(
    pivot_wide,
    text_auto='.0f',
    color_continuous_scale='YlOrRd',
    title='Average Revenue: Category x Region',
)
fig.show()
```

---

## Faceted Plots (Small Multiples)

```python
# Faceted scatter
fig = px.scatter(
    df.sample(1000), x='revenue', y='profit',
    color='channel',
    facet_col='category', facet_row='region',
    title='Revenue vs Profit by Category (cols) & Region (rows)',
    opacity=0.5, log_x=True, log_y=True,
    height=800, width=1000,
)
fig.show()

# Faceted histogram
fig = px.histogram(
    df, x='satisfaction',
    facet_col='category', facet_col_wrap=2,
    color='category',
    nbins=20,
    title='Satisfaction Distribution by Category',
    height=600,
)
fig.update_layout(showlegend=False)
fig.show()
```

---

## Animations

```python
# Animated scatter over time
monthly_agg = df.groupby(['month', 'category']).agg(
    revenue=('revenue', 'sum'),
    avg_satisfaction=('satisfaction', 'mean'),
    orders=('revenue', 'count'),
).reset_index()

fig = px.scatter(
    monthly_agg,
    x='revenue', y='avg_satisfaction',
    size='orders', color='category',
    animation_frame='month',
    range_x=[0, monthly_agg['revenue'].max() * 1.1],
    range_y=[1, 5],
    title='Category Performance Over Time (Animated)',
    size_max=40,
    height=600,
)
fig.show()

# Animated bar chart race
fig = px.bar(
    monthly_agg.sort_values(['month', 'revenue']),
    x='revenue', y='category', color='category',
    animation_frame='month',
    orientation='h',
    range_x=[0, monthly_agg['revenue'].max() * 1.1],
    title='Revenue Race by Category',
    height=400,
)
fig.update_layout(showlegend=False)
fig.show()
```

---

## Advanced: Subplots with Graph Objects

```python
fig = make_subplots(
    rows=2, cols=2,
    subplot_titles=['Revenue Distribution', 'Revenue by Category',
                    'Satisfaction vs Revenue', 'Channel Mix'],
    specs=[
        [{'type': 'histogram'}, {'type': 'bar'}],
        [{'type': 'scatter'}, {'type': 'pie'}],
    ]
)

# 1. Histogram
fig.add_trace(
    go.Histogram(x=df['revenue'], nbinsx=50, marker_color='steelblue', name='Revenue'),
    row=1, col=1
)

# 2. Bar chart
cat_rev = df.groupby('category')['revenue'].sum().sort_values()
fig.add_trace(
    go.Bar(x=cat_rev.values, y=cat_rev.index, orientation='h',
           marker_color=['#2563eb', '#dc2626', '#16a34a', '#f59e0b'], name='Category'),
    row=1, col=2
)

# 3. Scatter
sample = df.sample(500, random_state=42)
fig.add_trace(
    go.Scatter(x=sample['satisfaction'], y=sample['revenue'],
               mode='markers', marker=dict(size=5, opacity=0.4, color='steelblue'),
               name='Orders'),
    row=2, col=1
)

# 4. Pie
channel_counts = df['channel'].value_counts()
fig.add_trace(
    go.Pie(labels=channel_counts.index, values=channel_counts.values, hole=0.4),
    row=2, col=2
)

fig.update_layout(height=700, width=1000, title_text='EDA Dashboard', showlegend=False)
fig.show()
```

---

## Hover Customization

```python
fig = px.scatter(
    df.sample(500), x='revenue', y='profit',
    color='category', size='quantity',
    hover_name='category',
    hover_data={
        'revenue': ':.2f',
        'profit': ':.2f',
        'quantity': True,
        'satisfaction': ':.1f',
        'return_rate': ':.1%',
        'region': True,
    },
    custom_data=['region', 'channel'],
    title='Hover-Rich Scatter',
)

# Custom hover template
fig.update_traces(
    hovertemplate=(
        "<b>%{hovertext}</b><br>"
        "Revenue: $%{x:,.2f}<br>"
        "Profit: $%{y:,.2f}<br>"
        "Region: %{customdata[0]}<br>"
        "Channel: %{customdata[1]}<br>"
        "<extra></extra>"
    )
)
fig.show()
```

---

## Sunburst and Treemap — Hierarchical Data

```python
# Treemap: hierarchical composition
tree_data = df.groupby(['region', 'category', 'channel'])['revenue'].sum().reset_index()

fig = px.treemap(
    tree_data,
    path=['region', 'category', 'channel'],
    values='revenue',
    color='revenue',
    color_continuous_scale='Blues',
    title='Revenue Hierarchy: Region > Category > Channel',
)
fig.show()

# Sunburst: radial hierarchy
fig = px.sunburst(
    tree_data,
    path=['region', 'category', 'channel'],
    values='revenue',
    title='Revenue Sunburst',
)
fig.show()
```

---

## Maps (Geographic Data)

```python
# Choropleth (US states example with random data)
state_data = pd.DataFrame({
    'state': ['CA', 'TX', 'NY', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI',
              'NJ', 'VA', 'WA', 'AZ', 'MA', 'TN', 'IN', 'MO', 'MD', 'WI'],
    'revenue': np.random.lognormal(12, 0.5, 20).round(0),
    'growth':  np.random.uniform(-0.1, 0.3, 20).round(3),
})

fig = px.choropleth(
    state_data,
    locations='state',
    locationmode='USA-states',
    color='revenue',
    color_continuous_scale='Viridis',
    scope='usa',
    title='Revenue by State',
    hover_data=['growth'],
)
fig.show()
```

---

## Export and Sharing

```python
# Save as interactive HTML
fig.write_html('eda_dashboard.html', include_plotlyjs='cdn')

# Save as static image (requires kaleido)
fig.write_image('plot.png', width=1200, height=800, scale=2)
fig.write_image('plot.svg')
fig.write_image('plot.pdf')

# Embed in Jupyter with specific dimensions
fig.update_layout(width=800, height=500)
fig.show()

# Convert to JSON for web embedding
json_str = fig.to_json()
```

---

## EDA Dashboard Template

```python
def plotly_eda_dashboard(df, title="EDA Dashboard"):
    """Generate a comprehensive interactive EDA dashboard."""
    numeric = df.select_dtypes(include='number').columns.tolist()[:6]
    categorical = df.select_dtypes(include=['object', 'category']).columns.tolist()[:4]

    n_plots = len(numeric) + len(categorical) + 1  # +1 for correlation
    n_cols = 2
    n_rows = (n_plots + 1) // 2

    fig = make_subplots(
        rows=n_rows, cols=n_cols,
        subplot_titles=[f'{c} Distribution' for c in numeric] +
                       [f'{c} Counts' for c in categorical] +
                       ['Correlation Matrix'],
    )

    row, col = 1, 1
    for c in numeric:
        fig.add_trace(
            go.Histogram(x=df[c], nbinsx=40, name=c, showlegend=False),
            row=row, col=col,
        )
        col += 1
        if col > n_cols:
            col = 1
            row += 1

    for c in categorical:
        vc = df[c].value_counts().head(10)
        fig.add_trace(
            go.Bar(x=vc.values, y=vc.index, orientation='h', name=c, showlegend=False),
            row=row, col=col,
        )
        col += 1
        if col > n_cols:
            col = 1
            row += 1

    # Correlation heatmap
    if len(numeric) >= 2:
        corr = df[numeric].corr()
        fig.add_trace(
            go.Heatmap(
                z=corr.values, x=corr.columns, y=corr.index,
                colorscale='RdBu_r', zmid=0,
                text=corr.values.round(2), texttemplate='%{text}',
            ),
            row=row, col=col,
        )

    fig.update_layout(
        height=350 * n_rows, width=1000,
        title_text=title, showlegend=False,
    )
    fig.show()
    return fig

# Usage:
# plotly_eda_dashboard(df, title='E-Commerce EDA')
```

---

## Key Takeaways

- **Plotly Express** provides one-line interactive charts with `hover_data` for instant drill-down during EDA
- Use **`marginal='box'`** or **`marginal='violin'`** on histograms to see distribution and outliers simultaneously
- **Animations** with `animation_frame` reveal temporal patterns that static plots miss
- **Faceted plots** with `facet_col` and `facet_row` replace dozens of manual subplots
- **Treemaps and sunbursts** visualize hierarchical composition better than nested bar charts
- **`make_subplots`** with Graph Objects provides full control for complex multi-panel dashboards
- Export with **`write_html`** for shareable interactive reports, or **`write_image`** for static documents
