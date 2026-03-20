---
title: "LLM API Cheat Sheet"
description: "Quick reference for LLM APIs — OpenAI, Anthropic, Google Gemini, Mistral, and Cohere with model comparisons, function calling syntax, streaming patterns, and pricing."
tags: [llm, api, cheat-sheet, openai, anthropic]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-20"
---

# LLM API Cheat Sheet

Quick reference for the major LLM provider APIs. Covers authentication, chat completions, function calling, streaming, and model selection across OpenAI, Anthropic, Google Gemini, Mistral, and Cohere.

---

## Model Comparison

### Flagship Models (as of early 2026)

| Provider | Model | Context Window | Strengths | Input $/1M tokens | Output $/1M tokens |
|----------|-------|---------------|-----------|-------------------|-------------------|
| **OpenAI** | GPT-4o | 128K | Multimodal, fast, versatile | $2.50 | $10.00 |
| **OpenAI** | o3 | 200K | Deep reasoning, math, code | $10.00 | $40.00 |
| **OpenAI** | GPT-4o mini | 128K | Cheapest, high throughput | $0.15 | $0.60 |
| **Anthropic** | Claude Opus 4 | 200K | Complex reasoning, agentic | $15.00 | $75.00 |
| **Anthropic** | Claude Sonnet 4 | 200K | Best balance | $3.00 | $15.00 |
| **Anthropic** | Claude Haiku 3.5 | 200K | Speed, cost, classification | $0.80 | $4.00 |
| **Google** | Gemini 2.5 Pro | 1M | Huge context, multimodal | $1.25 | $10.00 |
| **Google** | Gemini 2.0 Flash | 1M | Fast, cheap, multimodal | $0.10 | $0.40 |
| **Mistral** | Mistral Large | 128K | Strong reasoning, EU-hosted | $2.00 | $6.00 |
| **Mistral** | Mistral Small | 128K | Cost-effective | $0.10 | $0.30 |
| **Cohere** | Command R+ | 128K | RAG-optimized, multilingual | $2.50 | $10.00 |
| **Cohere** | Command R | 128K | Cost-effective RAG | $0.15 | $0.60 |

::: warning Pricing Changes
LLM pricing changes frequently. These prices are approximate as of early 2026. Always verify current pricing on each provider's website before making architectural decisions.
:::

### Capabilities Matrix

| Capability | OpenAI | Anthropic | Gemini | Mistral | Cohere |
|-----------|--------|-----------|--------|---------|--------|
| Chat completions | Yes | Yes | Yes | Yes | Yes |
| Function calling | Yes | Yes (tool use) | Yes | Yes | Yes |
| Structured output | Yes (JSON schema) | Yes (tool use) | Yes (JSON schema) | Yes (JSON mode) | Yes (JSON mode) |
| Vision (images) | Yes | Yes | Yes | Yes (Pixtral) | No |
| Audio input | Yes (Whisper) | No | Yes (native) | No | No |
| Streaming | Yes | Yes | Yes | Yes | Yes |
| Embeddings | Yes | No (use Voyage) | Yes | Yes | Yes |
| Batch API | Yes | Yes | Yes | Yes | No |
| Prompt caching | Automatic | Explicit | Implicit | No | No |
| Extended thinking | Yes (o-series) | Yes | Yes (thinking mode) | Yes (thinking mode) | No |

---

## Authentication

```python
# OpenAI
from openai import OpenAI
client = OpenAI(api_key="sk-...")  # or OPENAI_API_KEY env var

# Anthropic
import anthropic
client = anthropic.Anthropic(api_key="sk-ant-...")  # or ANTHROPIC_API_KEY env var

# Google Gemini
import google.generativeai as genai
genai.configure(api_key="...")  # or GOOGLE_API_KEY env var

# Mistral
from mistralai import Mistral
client = Mistral(api_key="...")  # or MISTRAL_API_KEY env var

# Cohere
import cohere
client = cohere.ClientV2(api_key="...")  # or CO_API_KEY env var
```

```typescript
// OpenAI
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: "sk-..." });

// Anthropic
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: "sk-ant-..." });

// Google Gemini
import { GoogleGenerativeAI } from "@google/generative-ai";
const genai = new GoogleGenerativeAI("...");

// Mistral
import { Mistral } from "@mistralai/mistralai";
const mistral = new Mistral({ apiKey: "..." });
```

---

## Chat Completions

### OpenAI

```python
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain REST in one sentence."},
    ],
    temperature=0.7,
    max_tokens=256,
)
print(response.choices[0].message.content)
```

### Anthropic

```python
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=256,
    system="You are a helpful assistant.",  # System prompt is a separate parameter
    messages=[
        {"role": "user", "content": "Explain REST in one sentence."},
    ],
    temperature=0.7,
)
print(response.content[0].text)
```

### Google Gemini

```python
model = genai.GenerativeModel(
    model_name="gemini-2.5-pro",
    system_instruction="You are a helpful assistant.",
)
response = model.generate_content("Explain REST in one sentence.")
print(response.text)
```

### Mistral

```python
response = client.chat.complete(
    model="mistral-large-latest",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain REST in one sentence."},
    ],
    temperature=0.7,
    max_tokens=256,
)
print(response.choices[0].message.content)
```

### Cohere

```python
response = client.chat(
    model="command-r-plus",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain REST in one sentence."},
    ],
    temperature=0.7,
    max_tokens=256,
)
print(response.message.content[0].text)
```

### Side-by-Side Differences

| Aspect | OpenAI | Anthropic | Gemini | Mistral | Cohere |
|--------|--------|-----------|--------|---------|--------|
| System prompt | In messages array | Separate `system` param | `system_instruction` on model | In messages array | In messages array |
| Response path | `.choices[0].message.content` | `.content[0].text` | `.text` | `.choices[0].message.content` | `.message.content[0].text` |
| Max tokens | Optional (default varies) | **Required** | Optional | Optional | Optional |
| Default temperature | 1.0 | 1.0 | 1.0 | 0.7 | 0.3 |

---

## Streaming

### OpenAI

```python
stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Write a haiku about APIs."}],
    stream=True,
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### Anthropic

```python
with client.messages.stream(
    model="claude-sonnet-4-20250514",
    max_tokens=256,
    messages=[{"role": "user", "content": "Write a haiku about APIs."}],
) as stream:
    for text in stream.text_stream:
        print(text, end="")
```

### Google Gemini

```python
model = genai.GenerativeModel("gemini-2.5-pro")
response = model.generate_content("Write a haiku about APIs.", stream=True)
for chunk in response:
    print(chunk.text, end="")
```

### Mistral

```python
stream = client.chat.stream(
    model="mistral-large-latest",
    messages=[{"role": "user", "content": "Write a haiku about APIs."}],
)
for event in stream:
    if event.data.choices[0].delta.content:
        print(event.data.choices[0].delta.content, end="")
```

---

## Function Calling / Tool Use

### OpenAI

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City name"},
            },
            "required": ["location"],
        },
    },
}]

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Weather in Tokyo?"}],
    tools=tools,
    tool_choice="auto",
)

# Check for tool calls
if response.choices[0].message.tool_calls:
    tc = response.choices[0].message.tool_calls[0]
    print(f"Call: {tc.function.name}({tc.function.arguments})")
```

### Anthropic

```python
tools = [{
    "name": "get_weather",
    "description": "Get current weather for a location",
    "input_schema": {  # Note: input_schema, not parameters
        "type": "object",
        "properties": {
            "location": {"type": "string", "description": "City name"},
        },
        "required": ["location"],
    },
}]

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=256,
    messages=[{"role": "user", "content": "Weather in Tokyo?"}],
    tools=tools,
)

# Check for tool use
for block in response.content:
    if block.type == "tool_use":
        print(f"Call: {block.name}({block.input})")
        print(f"Tool use ID: {block.id}")
```

### Google Gemini

```python
from google.generativeai.types import FunctionDeclaration, Tool

get_weather = FunctionDeclaration(
    name="get_weather",
    description="Get current weather for a location",
    parameters={
        "type": "object",
        "properties": {
            "location": {"type": "string", "description": "City name"},
        },
        "required": ["location"],
    },
)

model = genai.GenerativeModel(
    model_name="gemini-2.5-pro",
    tools=[Tool(function_declarations=[get_weather])],
)

response = model.generate_content("Weather in Tokyo?")
# Check for function calls in response.candidates[0].content.parts
for part in response.candidates[0].content.parts:
    if hasattr(part, "function_call"):
        print(f"Call: {part.function_call.name}({dict(part.function_call.args)})")
```

### Mistral

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City name"},
            },
            "required": ["location"],
        },
    },
}]

response = client.chat.complete(
    model="mistral-large-latest",
    messages=[{"role": "user", "content": "Weather in Tokyo?"}],
    tools=tools,
    tool_choice="auto",
)

# Same structure as OpenAI
if response.choices[0].message.tool_calls:
    tc = response.choices[0].message.tool_calls[0]
    print(f"Call: {tc.function.name}({tc.function.arguments})")
```

### Tool Calling Syntax Comparison

| Aspect | OpenAI | Anthropic | Gemini | Mistral |
|--------|--------|-----------|--------|---------|
| Schema key | `parameters` | `input_schema` | `parameters` | `parameters` |
| Tool wrapper | `{"type": "function", "function": {...}}` | `{...}` (flat) | `FunctionDeclaration` | `{"type": "function", "function": {...}}` |
| Response location | `.tool_calls[].function` | `.content[] (type=tool_use)` | `.parts[].function_call` | `.tool_calls[].function` |
| Tool result role | `"tool"` | `"user"` (with tool_result block) | `"function"` | `"tool"` |
| Parallel calls | Yes | Yes | Yes | Yes |

::: tip Tool Result Format: Anthropic Is Different
Anthropic requires tool results to be sent as a `user` message with a `tool_result` content block, not as a separate `tool` role:
```python
# OpenAI / Mistral
{"role": "tool", "tool_call_id": "call_123", "content": "22°C, cloudy"}

# Anthropic
{"role": "user", "content": [
    {"type": "tool_result", "tool_use_id": "toolu_123", "content": "22°C, cloudy"}
]}
```
:::

---

## Structured Output

```python
# OpenAI — guaranteed JSON schema conformance
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "List 3 programming languages with their types."}],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "languages",
            "schema": {
                "type": "object",
                "properties": {
                    "languages": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "type": {"type": "string", "enum": ["compiled", "interpreted", "jit"]},
                            },
                            "required": ["name", "type"],
                        },
                    },
                },
                "required": ["languages"],
            },
        },
    },
)

# Anthropic — use tool use for structured output
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=256,
    messages=[{"role": "user", "content": "List 3 programming languages with their types."}],
    tools=[{
        "name": "output_languages",
        "description": "Output the list of programming languages",
        "input_schema": {
            "type": "object",
            "properties": {
                "languages": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "type": {"type": "string", "enum": ["compiled", "interpreted", "jit"]},
                        },
                        "required": ["name", "type"],
                    },
                },
            },
            "required": ["languages"],
        },
    }],
    tool_choice={"type": "tool", "name": "output_languages"},  # Force tool use
)

# Gemini — JSON schema
response = model.generate_content(
    "List 3 programming languages with their types.",
    generation_config=genai.GenerationConfig(
        response_mime_type="application/json",
        response_schema={...},  # JSON schema
    ),
)
```

---

## Embeddings

| Provider | Model | Dimensions | Max Tokens | Price (per 1M tokens) |
|----------|-------|-----------|------------|----------------------|
| OpenAI | text-embedding-3-large | 3072 (reducible) | 8191 | $0.13 |
| OpenAI | text-embedding-3-small | 1536 | 8191 | $0.02 |
| Google | text-embedding-004 | 768 | 2048 | $0.006 |
| Mistral | mistral-embed | 1024 | 8192 | $0.10 |
| Cohere | embed-v4.0 | 1024 | 512 | $0.10 |
| Voyage | voyage-3-large | 1024 | 32000 | $0.18 |

```python
# OpenAI
resp = client.embeddings.create(model="text-embedding-3-small", input=["Hello world"])
vector = resp.data[0].embedding  # list[float], length 1536

# Cohere
resp = client.embed(
    model="embed-v4.0",
    texts=["Hello world"],
    input_type="search_document",  # or "search_query"
    embedding_types=["float"],
)
vector = resp.embeddings.float_[0]

# Mistral
resp = client.embeddings.create(model="mistral-embed", inputs=["Hello world"])
vector = resp.data[0].embedding

# Google
result = genai.embed_content(model="models/text-embedding-004", content="Hello world")
vector = result["embedding"]
```

---

## Error Handling Pattern

```python
import time

def call_with_retry(fn, max_retries=3, base_delay=1.0):
    """Universal retry pattern for any LLM API."""
    for attempt in range(max_retries + 1):
        try:
            return fn()
        except Exception as e:
            error_type = type(e).__name__

            # Rate limit — always retry with backoff
            if "rate" in error_type.lower() or "429" in str(e):
                delay = base_delay * (2 ** attempt)
                print(f"Rate limited. Retrying in {delay}s...")
                time.sleep(delay)
                continue

            # Overloaded / server error — retry
            if "overloaded" in str(e).lower() or "500" in str(e) or "529" in str(e):
                delay = base_delay * (2 ** attempt)
                time.sleep(delay)
                continue

            # Authentication, invalid request — do not retry
            if "401" in str(e) or "400" in str(e) or "authentication" in str(e).lower():
                raise

            # Unknown error on last attempt
            if attempt == max_retries:
                raise

    raise RuntimeError("Max retries exceeded")
```

---

## Quick Decision Guide

| I need... | Use |
|-----------|-----|
| Best all-around model | GPT-4o or Claude Sonnet 4 |
| Cheapest for simple tasks | GPT-4o mini or Gemini 2.0 Flash |
| Longest context window | Gemini 2.5 Pro (1M tokens) |
| Best reasoning | o3 or Claude Opus 4 |
| EU data residency | Mistral (hosted in Europe) |
| Best RAG support | Cohere Command R+ |
| Image understanding | GPT-4o, Claude Sonnet 4, or Gemini |
| Audio processing | OpenAI Whisper or Gemini (native) |
| Cheapest embeddings | Google text-embedding-004 |
| Best embeddings quality | OpenAI text-embedding-3-large or Voyage 3 |

---

## See Also

- [OpenAI API Patterns](/ai-ml-engineering/openai-api) — Deep dive into OpenAI-specific patterns
- [Anthropic Claude API Patterns](/ai-ml-engineering/anthropic-claude-api) — Deep dive into Claude-specific patterns
- [LLM Integration Patterns](/ai-ml-engineering/llm-integration) — Provider-agnostic architecture
- [Embeddings Deep Dive](/ai-ml-engineering/embeddings) — Embedding strategies beyond the API
- [AI Agents Architecture](/ai-ml-engineering/ai-agents) — Building agents with tool calling
