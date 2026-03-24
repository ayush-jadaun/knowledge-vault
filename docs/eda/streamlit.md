---
title: "Streamlit for EDA"
description: "Build interactive EDA dashboards with Streamlit — widgets, layout, caching, session state, multi-page apps, and deployment"
tags: [streamlit, dashboard, interactive, widgets, deployment]
difficulty: intermediate
prerequisites: [pandas-fundamentals, matplotlib, plotly]
lastReviewed: "2026-03-24"
---

# Streamlit for EDA

Streamlit turns Python scripts into interactive web apps in minutes. For EDA, it replaces static Jupyter notebooks with shareable, interactive dashboards where stakeholders can explore data themselves.

---

## Quickstart

```python
# app.py
import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px

st.set_page_config(
    page_title="EDA Dashboard",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.title("Exploratory Data Analysis Dashboard")
st.markdown("Upload a CSV file to begin exploring your data.")

# File upload
uploaded = st.file_uploader("Upload CSV", type=['csv', 'xlsx'])

if uploaded is not None:
    df = pd.read_csv(uploaded)
    st.success(f"Loaded {df.shape[0]:,} rows and {df.shape[1]} columns")
    st.dataframe(df.head(20), use_container_width=True)
else:
    st.info("Please upload a file to get started.")
```

Run with: `streamlit run app.py`

---

## Layout and Organization

### Columns and Containers

```python
# Two-column layout
col1, col2 = st.columns(2)
with col1:
    st.metric("Total Rows", f"{len(df):,}")
with col2:
    st.metric("Total Columns", df.shape[1])

# Three columns with custom ratios
left, center, right = st.columns([1, 2, 1])
with center:
    st.plotly_chart(fig, use_container_width=True)

# Expander for collapsible sections
with st.expander("View Raw Data", expanded=False):
    st.dataframe(df, use_container_width=True)

# Tabs
tab1, tab2, tab3 = st.tabs(["Overview", "Distributions", "Correlations"])
with tab1:
    st.write("Dataset overview here")
with tab2:
    st.write("Distribution plots here")
with tab3:
    st.write("Correlation analysis here")
```

### Sidebar

```python
with st.sidebar:
    st.header("Controls")

    # Column selector
    numeric_cols = df.select_dtypes(include='number').columns.tolist()
    selected_col = st.selectbox("Select Column", numeric_cols)

    # Range filter
    min_val, max_val = float(df[selected_col].min()), float(df[selected_col].max())
    range_filter = st.slider(
        "Value Range",
        min_value=min_val, max_value=max_val,
        value=(min_val, max_val)
    )

    # Categorical filter
    if 'category' in df.columns:
        categories = st.multiselect(
            "Filter Categories",
            options=df['category'].unique().tolist(),
            default=df['category'].unique().tolist()
        )

    # Number input
    n_bins = st.number_input("Histogram Bins", min_value=5, max_value=200, value=50)

    # Checkbox
    show_outliers = st.checkbox("Show Outliers", value=True)
```

---

## Essential Widgets for EDA

```python
# Text input
search = st.text_input("Search Column Names", "")
matching = [c for c in df.columns if search.lower() in c.lower()]
st.write(f"Matching columns: {matching}")

# Radio buttons
chart_type = st.radio("Chart Type", ["Histogram", "Box Plot", "Violin"])

# Select slider (discrete steps)
confidence = st.select_slider("Confidence Level", options=[0.90, 0.95, 0.99], value=0.95)

# Date input
start_date = st.date_input("Start Date", value=pd.Timestamp('2024-01-01'))

# Download button
csv_data = df.to_csv(index=False).encode('utf-8')
st.download_button(
    "Download Filtered Data",
    data=csv_data,
    file_name="filtered_data.csv",
    mime="text/csv"
)

# Progress bar for long operations
progress = st.progress(0)
for i in range(100):
    progress.progress(i + 1)

# Display code
with st.echo():
    result = df.describe()
    st.write(result)
```

---

## Caching for Performance

```python
@st.cache_data
def load_data(filepath):
    """Load and cache data. Re-runs only if filepath changes."""
    df = pd.read_csv(filepath)
    # Preprocessing
    df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')
    for col in df.select_dtypes(include='object').columns:
        if df[col].nunique() < 50:
            df[col] = df[col].astype('category')
    return df

@st.cache_data
def compute_statistics(df):
    """Cache expensive statistical computations."""
    stats = {
        'describe': df.describe(),
        'missing': df.isna().sum(),
        'correlations': df.select_dtypes(include='number').corr(),
        'skewness': df.select_dtypes(include='number').skew(),
    }
    return stats

@st.cache_resource
def get_model():
    """Cache ML models or database connections."""
    # from sklearn.ensemble import IsolationForest
    # return IsolationForest(random_state=42)
    pass

# Clear cache when needed
# st.cache_data.clear()
```

### Cache with TTL and Hashing

```python
@st.cache_data(ttl=3600)  # expire after 1 hour
def load_from_api(url):
    """Cache API responses with time-to-live."""
    return pd.read_json(url)

@st.cache_data(show_spinner="Computing statistics...")
def expensive_computation(df):
    """Show custom spinner during computation."""
    import time
    time.sleep(2)  # simulate slow computation
    return df.describe()
```

---

## Session State

```python
# Initialize session state
if 'analysis_history' not in st.session_state:
    st.session_state.analysis_history = []
if 'current_filter' not in st.session_state:
    st.session_state.current_filter = {}

# Use session state for stateful interactions
if st.button("Run Analysis"):
    result = df.describe()
    st.session_state.analysis_history.append({
        'timestamp': pd.Timestamp.now(),
        'type': 'describe',
        'result': result,
    })
    st.success(f"Analysis #{len(st.session_state.analysis_history)} completed!")

# Display history
if st.session_state.analysis_history:
    st.subheader(f"Analysis History ({len(st.session_state.analysis_history)} runs)")
    for i, entry in enumerate(st.session_state.analysis_history[-5:]):
        with st.expander(f"Run {i+1} — {entry['timestamp'].strftime('%H:%M:%S')}"):
            st.write(entry['result'])

# Callback-based state updates
def on_column_change():
    st.session_state.current_filter['column'] = st.session_state.col_select

st.selectbox("Column", numeric_cols, key='col_select', on_change=on_column_change)
```

---

## Display Methods

```python
# DataFrame display
st.dataframe(df.head(50), use_container_width=True, height=400)

# Static table (no scrolling)
st.table(df.describe().round(2))

# Metrics row
col1, col2, col3, col4 = st.columns(4)
col1.metric("Mean", f"${df['revenue'].mean():,.0f}", delta="+5.2%")
col2.metric("Median", f"${df['revenue'].median():,.0f}", delta="-1.3%")
col3.metric("Std Dev", f"${df['revenue'].std():,.0f}")
col4.metric("Missing", f"{df['revenue'].isna().sum()}")

# JSON display
st.json({'shape': list(df.shape), 'dtypes': {c: str(d) for c, d in df.dtypes.items()}})

# Matplotlib figure
import matplotlib.pyplot as plt
fig, ax = plt.subplots()
ax.hist(df['revenue'], bins=50)
st.pyplot(fig)

# Plotly chart
fig = px.histogram(df, x='revenue', color='category')
st.plotly_chart(fig, use_container_width=True)
```

---

## Multi-Page Apps

```
my_app/
  app.py              # Main entry point
  pages/
    1_Overview.py      # Page 1
    2_Distributions.py # Page 2
    3_Correlations.py  # Page 3
    4_Export.py         # Page 4
```

```python
# pages/1_Overview.py
import streamlit as st
import pandas as pd

st.header("Dataset Overview")

# Access shared data from session state
if 'df' not in st.session_state:
    st.warning("Please upload data on the main page first.")
    st.stop()

df = st.session_state.df

col1, col2, col3 = st.columns(3)
col1.metric("Rows", f"{len(df):,}")
col2.metric("Columns", df.shape[1])
col3.metric("Missing Cells", f"{df.isna().sum().sum():,}")

st.subheader("Column Types")
dtype_counts = df.dtypes.value_counts()
for dtype, count in dtype_counts.items():
    st.write(f"- **{dtype}**: {count} columns")

st.subheader("Sample Data")
n_rows = st.slider("Rows to display", 5, 100, 20)
st.dataframe(df.head(n_rows), use_container_width=True)
```

---

## Deployment

### Streamlit Community Cloud

```python
# requirements.txt
# streamlit>=1.30.0
# pandas>=2.0.0
# plotly>=5.18.0
# numpy>=1.24.0
# seaborn>=0.13.0
# scipy>=1.11.0

# .streamlit/config.toml
# [theme]
# primaryColor = "#2563eb"
# backgroundColor = "#ffffff"
# secondaryBackgroundColor = "#f0f2f6"
# textColor = "#1f2937"
# font = "sans serif"
```

```mermaid
flowchart LR
    A[Write app.py] --> B[Push to GitHub]
    B --> C[Connect to<br>Streamlit Cloud]
    C --> D[Auto Deploy]
    D --> E[Share URL]

    style A fill:#2563eb,color:#fff
    style D fill:#16a34a,color:#fff
    style E fill:#9333ea,color:#fff
```

### Docker Deployment

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8501
HEALTHCHECK CMD curl --fail http://localhost:8501/_stcore/health
ENTRYPOINT ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]
```

---

## Complete EDA Widget Gallery

```python
def eda_widget_gallery(df):
    """Reusable EDA widget gallery component."""

    st.subheader("Quick Statistics")
    numeric = df.select_dtypes(include='number')

    # Stats grid
    cols = st.columns(min(4, len(numeric.columns)))
    for i, col_name in enumerate(numeric.columns[:4]):
        with cols[i]:
            st.metric(col_name, f"{numeric[col_name].mean():.2f}",
                      delta=f"std: {numeric[col_name].std():.2f}")

    st.subheader("Column Explorer")
    col_choice = st.selectbox("Select column to explore", df.columns)
    series = df[col_choice]

    if series.dtype in ['int64', 'float64']:
        tab1, tab2, tab3 = st.tabs(["Distribution", "Statistics", "Outliers"])
        with tab1:
            fig = px.histogram(df, x=col_choice, nbins=50, marginal='box')
            st.plotly_chart(fig, use_container_width=True)
        with tab2:
            st.write(series.describe())
        with tab3:
            q1, q3 = series.quantile(0.25), series.quantile(0.75)
            iqr = q3 - q1
            n_outliers = ((series < q1 - 1.5*iqr) | (series > q3 + 1.5*iqr)).sum()
            st.metric("Outliers (IQR)", n_outliers)
    else:
        vc = series.value_counts().head(20)
        fig = px.bar(x=vc.index, y=vc.values, labels={'x': col_choice, 'y': 'Count'})
        st.plotly_chart(fig, use_container_width=True)

# Usage: eda_widget_gallery(df)
```

---

## Key Takeaways

- Streamlit converts Python scripts into **interactive web dashboards** with `streamlit run app.py`
- Use **`@st.cache_data`** for expensive computations and data loading; it re-runs only when inputs change
- **Session state** (`st.session_state`) persists data across widget interactions and reruns
- **Layout** with `st.columns()`, `st.tabs()`, and `st.expander()` organizes complex EDA into digestible sections
- **Sidebar** is ideal for filters and controls that affect the entire dashboard
- **Multi-page apps** via the `pages/` directory scale to full EDA toolkits
- Deploy to **Streamlit Community Cloud** for free, or Docker for enterprise environments
- For EDA, Streamlit replaces static notebooks with **shareable, interactive** analysis that non-technical stakeholders can use
