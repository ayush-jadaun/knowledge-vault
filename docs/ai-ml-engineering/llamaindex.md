---
title: "LlamaIndex"
description: "LlamaIndex deep dive — data framework for LLMs, index types, query engines, chat engines, data connectors, and how it compares to LangChain."
tags: [llamaindex, rag, indexing, llm, data-framework]
difficulty: intermediate
prerequisites: [llm-integration, embeddings]
lastReviewed: "2026-03-20"
---

# LlamaIndex

LlamaIndex is a data framework for building LLM applications that need to ingest, structure, and query private data. Where [LangChain](/ai-ml-engineering/langchain) is a general-purpose orchestration framework, LlamaIndex is laser-focused on the data problem: how do you take your documents, databases, APIs, and knowledge bases and make them queryable by a language model?

If LangChain is a Swiss Army knife for LLM applications, LlamaIndex is a purpose-built power tool for data indexing and retrieval. It provides specialized index structures, advanced query engines, and a rich ecosystem of data connectors that make building [RAG pipelines](/ai-ml-engineering/rag-architecture) faster and more flexible.

## Why LlamaIndex Exists

Every RAG application has the same fundamental challenge: turning unstructured data into something an LLM can reason over. This involves:

1. **Loading** — Getting data from PDFs, databases, APIs, Notion, Confluence, Slack, code repos
2. **Parsing** — Extracting clean text from complex formats (tables, images, nested structures)
3. **Indexing** — Organizing data into structures optimized for different query patterns
4. **Querying** — Translating natural language questions into retrieval operations
5. **Synthesizing** — Combining retrieved information into coherent answers

LlamaIndex provides purpose-built abstractions for each of these stages.

```mermaid
graph LR
    subgraph Load["Load"]
        Sources["130+ data<br/>connectors"]
    end
    subgraph Parse["Parse"]
        Parsing["Node parsers<br/>& splitters"]
    end
    subgraph Index["Index"]
        Indexes["Vector, list,<br/>tree, keyword"]
    end
    subgraph Query["Query"]
        Engines["Query engines<br/>& chat engines"]
    end
    subgraph Synthesize["Respond"]
        Response["Response<br/>synthesis"]
    end

    Load --> Parse --> Index --> Query --> Synthesize
```

## Core Architecture

### Documents and Nodes

The two fundamental data structures:

- **Document** — A container for a source document (a PDF page, a web page, a database row). Has text content and metadata.
- **Node** — A chunk of a document. Nodes are the atomic units that get indexed, embedded, and retrieved. Each node maintains a reference to its parent document and optional references to sibling nodes.

```python
from llama_index.core import Document
from llama_index.core.node_parser import SentenceSplitter

# Create documents
documents = [
    Document(
        text="LlamaIndex is a data framework for LLM applications...",
        metadata={"source": "docs", "category": "framework"},
    ),
]

# Parse into nodes (chunks)
parser = SentenceSplitter(chunk_size=1024, chunk_overlap=200)
nodes = parser.get_nodes_from_documents(documents)

# Each node has:
# - node.text (the chunk content)
# - node.metadata (inherited from document + node-specific)
# - node.relationships (parent doc, prev/next siblings)
```

```typescript
import { Document, SentenceSplitter } from "llamaindex";

const documents = [
  new Document({
    text: "LlamaIndex is a data framework...",
    metadata: { source: "docs", category: "framework" },
  }),
];

const splitter = new SentenceSplitter({ chunkSize: 1024, chunkOverlap: 200 });
const nodes = splitter.getNodesFromDocuments(documents);
```

## Index Types

LlamaIndex provides multiple index structures, each optimized for different query patterns. This is its key differentiator from other frameworks.

### Vector Store Index

The most common index type. Embeds every node and stores them in a vector database for similarity search.

```python
from llama_index.core import VectorStoreIndex, Settings
from llama_index.embeddings.openai import OpenAIEmbedding

Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-small")

# Build index from documents
index = VectorStoreIndex.from_documents(documents)

# Query
query_engine = index.as_query_engine(similarity_top_k=5)
response = query_engine.query("How does LlamaIndex handle chunking?")
print(response)
```

### Summary Index (formerly List Index)

Stores all nodes in a flat list. At query time, it iterates through every node (or a subset) and synthesizes a response. Best for summarization tasks where you need the model to consider all the data.

```python
from llama_index.core import SummaryIndex

index = SummaryIndex.from_documents(documents)
query_engine = index.as_query_engine(
    response_mode="tree_summarize"
)
response = query_engine.query("Provide a comprehensive summary of all documents")
```

### Tree Index

Builds a tree structure where leaf nodes are the original chunks and parent nodes are LLM-generated summaries. Queries traverse the tree from root to relevant leaves.

```python
from llama_index.core import TreeIndex

index = TreeIndex.from_documents(documents, num_children=5)
query_engine = index.as_query_engine()
response = query_engine.query("What are the main themes across these documents?")
```

### Keyword Table Index

Extracts keywords from each node and builds a keyword-to-node mapping. Queries are matched against keywords to find relevant nodes. Useful when semantic similarity is not the right retrieval strategy.

```python
from llama_index.core import KeywordTableIndex

index = KeywordTableIndex.from_documents(documents)
query_engine = index.as_query_engine()
response = query_engine.query("error handling retry backoff")
```

### Index Type Comparison

| Index Type | Retrieval Strategy | Best For | Latency | Cost |
|------------|-------------------|----------|---------|------|
| **VectorStoreIndex** | Embedding similarity | Semantic search, Q&A | Low | Embedding calls |
| **SummaryIndex** | Iterate all nodes | Summarization | High | Many LLM calls |
| **TreeIndex** | Tree traversal | Hierarchical documents | Medium | Summary generation |
| **KeywordTableIndex** | Keyword matching | Exact term lookup | Low | Keyword extraction |

::: tip Start with VectorStoreIndex
For 90% of use cases, VectorStoreIndex is the right choice. Use other index types when your retrieval requirements specifically call for them — summarization, hierarchical navigation, or keyword matching.
:::

## Query Engines

Query engines are the primary interface for asking questions of your indexed data. They handle retrieval, optional reranking, and response synthesis.

### Basic Query Engine

```python
# Simple query engine from an index
query_engine = index.as_query_engine(
    similarity_top_k=5,
    response_mode="compact",  # compact, refine, tree_summarize, simple
)

response = query_engine.query("What is the architecture of the system?")
print(response.response)       # The synthesized answer
print(response.source_nodes)   # The retrieved chunks
print(response.metadata)       # Query metadata
```

### Response Modes

| Mode | How It Works | Best For |
|------|-------------|----------|
| `compact` | Stuff as many nodes as possible into one LLM call | Short answers, most queries |
| `refine` | Iterate through nodes, refining the answer with each | Detailed answers from many sources |
| `tree_summarize` | Recursively summarize groups of nodes | Long document summarization |
| `simple` | Just concatenate node text (no LLM synthesis) | Debugging, inspection |
| `accumulate` | Generate a response per node, then combine | Multi-perspective answers |

### Sub-Question Query Engine

Decomposes complex questions into sub-questions, queries different data sources for each, then synthesizes a final answer.

```python
from llama_index.core.tools import QueryEngineTool, ToolMetadata
from llama_index.question_gen.openai import OpenAIQuestionGenerator
from llama_index.core.query_engine import SubQuestionQueryEngine

# Create tools for different data sources
tools = [
    QueryEngineTool(
        query_engine=financial_index.as_query_engine(),
        metadata=ToolMetadata(
            name="financials",
            description="Financial reports and earnings data",
        ),
    ),
    QueryEngineTool(
        query_engine=product_index.as_query_engine(),
        metadata=ToolMetadata(
            name="products",
            description="Product documentation and specifications",
        ),
    ),
]

query_engine = SubQuestionQueryEngine.from_defaults(
    query_engine_tools=tools,
    question_gen=OpenAIQuestionGenerator.from_defaults(),
)

# This decomposes into sub-questions automatically
response = query_engine.query(
    "Compare the revenue growth with the number of new product launches"
)
```

```mermaid
graph TD
    Q["Complex question"] --> Decompose["Decompose into<br/>sub-questions"]
    Decompose --> SQ1["Sub-Q 1:<br/>Revenue growth?"]
    Decompose --> SQ2["Sub-Q 2:<br/>Product launches?"]
    SQ1 --> QE1["Financial<br/>query engine"]
    SQ2 --> QE2["Product<br/>query engine"]
    QE1 --> A1["Answer 1"]
    QE2 --> A2["Answer 2"]
    A1 --> Synthesize["Synthesize<br/>final answer"]
    A2 --> Synthesize
    Synthesize --> Final["Complete answer"]
```

### Router Query Engine

Routes queries to the most appropriate index or query engine based on the question content:

```python
from llama_index.core.query_engine import RouterQueryEngine
from llama_index.core.selectors import LLMSingleSelector

query_engine = RouterQueryEngine(
    selector=LLMSingleSelector.from_defaults(),
    query_engine_tools=[
        QueryEngineTool(
            query_engine=code_index.as_query_engine(),
            metadata=ToolMetadata(
                name="code_docs",
                description="Technical API documentation and code examples",
            ),
        ),
        QueryEngineTool(
            query_engine=policy_index.as_query_engine(),
            metadata=ToolMetadata(
                name="policies",
                description="Company policies, HR documents, compliance guides",
            ),
        ),
    ],
)
```

## Chat Engines

Chat engines add conversation memory to query engines, enabling multi-turn interactions:

```python
chat_engine = index.as_chat_engine(
    chat_mode="condense_plus_context",
    similarity_top_k=5,
)

# Multi-turn conversation
response1 = chat_engine.chat("What is the system architecture?")
response2 = chat_engine.chat("What databases does it use?")  # uses context from prior turn
response3 = chat_engine.chat("How are they configured?")     # maintains full history

# Reset conversation
chat_engine.reset()
```

| Chat Mode | How It Works | Best For |
|-----------|-------------|----------|
| `condense_question` | Rewrites follow-up questions as standalone queries | Simple conversational Q&A |
| `context` | Retrieves context for every turn | When every question needs fresh retrieval |
| `condense_plus_context` | Condenses question AND retrieves context | Most production use cases |
| `simple` | Sends all history to LLM (no retrieval) | Casual chat, no knowledge base |
| `react` | Full ReAct agent with tools | Complex multi-step reasoning |

## Data Connectors (LlamaHub)

LlamaHub is the ecosystem of 130+ data connectors for loading data from virtually any source. Think of it as the ingestion layer.

```python
from llama_index.readers.web import SimpleWebPageReader
from llama_index.readers.database import DatabaseReader
from llama_index.readers.notion import NotionPageReader
from llama_index.readers.github import GithubRepositoryReader

# Web pages
web_docs = SimpleWebPageReader(html_to_text=True).load_data(
    ["https://docs.example.com/api"]
)

# SQL database
db_docs = DatabaseReader(uri="postgresql://user:pass@localhost/mydb").load_data(
    query="SELECT title, content FROM articles WHERE published = true"
)

# Notion
notion_docs = NotionPageReader(integration_token="secret_xxx").load_data(
    page_ids=["page-id-1", "page-id-2"]
)

# GitHub repository
github_docs = GithubRepositoryReader(
    owner="org",
    repo="repo",
    filter_file_extensions=([".py", ".md"], GithubRepositoryReader.FilterType.INCLUDE),
).load_data(branch="main")
```

### Common Data Connectors

| Connector | Source | Package |
|-----------|--------|---------|
| `SimpleDirectoryReader` | Local files (PDF, DOCX, CSV, etc.) | Built-in |
| `SimpleWebPageReader` | Web pages | `llama-index-readers-web` |
| `DatabaseReader` | SQL databases | `llama-index-readers-database` |
| `NotionPageReader` | Notion pages | `llama-index-readers-notion` |
| `SlackReader` | Slack channels | `llama-index-readers-slack` |
| `GithubRepositoryReader` | GitHub repos | `llama-index-readers-github` |
| `ConfluenceReader` | Confluence spaces | `llama-index-readers-confluence` |
| `GoogleDocsReader` | Google Docs | `llama-index-readers-google` |
| `S3Reader` | AWS S3 buckets | `llama-index-readers-s3` |

## Advanced Patterns

### Metadata Filtering

Combine vector similarity with metadata filters for precise retrieval:

```python
from llama_index.core.vector_stores.types import (
    MetadataFilters,
    MetadataFilter,
    FilterOperator,
)

filters = MetadataFilters(
    filters=[
        MetadataFilter(key="category", value="engineering", operator=FilterOperator.EQ),
        MetadataFilter(key="year", value=2025, operator=FilterOperator.GTE),
    ]
)

query_engine = index.as_query_engine(
    similarity_top_k=10,
    filters=filters,
)
```

### Auto-Retrieval

Let the LLM generate metadata filters from the natural language query:

```python
from llama_index.core.retrievers import VectorIndexAutoRetriever
from llama_index.core.vector_stores.types import VectorStoreInfo, MetadataInfo

vector_store_info = VectorStoreInfo(
    content_info="Technical documentation for software products",
    metadata_info=[
        MetadataInfo(name="product", type="str", description="Product name"),
        MetadataInfo(name="version", type="str", description="Software version"),
        MetadataInfo(name="category", type="str", description="Doc category"),
    ],
)

retriever = VectorIndexAutoRetriever(
    index,
    vector_store_info=vector_store_info,
)

# The retriever automatically infers filters from the query
# "How do I configure caching in ProductX v3?" ->
# filters: product=ProductX, version=v3
nodes = retriever.retrieve("How do I configure caching in ProductX v3?")
```

### Reranking

Add a reranker to improve retrieval quality by reordering initial results:

```python
from llama_index.postprocessor.cohere_rerank import CohereRerank

reranker = CohereRerank(top_n=5)

query_engine = index.as_query_engine(
    similarity_top_k=20,  # retrieve more initially
    node_postprocessors=[reranker],  # rerank to top 5
)
```

### Persistent Storage

```python
from llama_index.core import StorageContext, load_index_from_storage

# Save index to disk
index.storage_context.persist(persist_dir="./storage")

# Load from disk later
storage_context = StorageContext.from_defaults(persist_dir="./storage")
index = load_index_from_storage(storage_context)
```

For vector store backends, see [Vector Databases](/ai-ml-engineering/vector-databases).

## LlamaIndex vs LangChain

This is the question every team asks. They are not direct competitors — they have different strengths and can be used together.

| Dimension | LlamaIndex | LangChain |
|-----------|-----------|-----------|
| **Core focus** | Data indexing and retrieval | General LLM orchestration |
| **Index structures** | Multiple (vector, tree, keyword, summary) | Vector store only |
| **Query engines** | Rich (sub-question, router, SQL, etc.) | Basic retrieval chains |
| **Data connectors** | 130+ via LlamaHub | 160+ via community |
| **Agent support** | Basic (via query tools) | Extensive (LangGraph) |
| **Memory** | Chat engine memory | Multiple memory types |
| **Observability** | LlamaTrace, callbacks | LangSmith integration |
| **Composability** | Pipeline-based | LCEL pipe syntax |
| **Learning curve** | Moderate | Moderate-steep |
| **Best for** | Data-heavy RAG applications | Multi-step agent workflows |

### When to Use LlamaIndex

- Your application is primarily about querying private data (documents, databases, APIs)
- You need advanced retrieval patterns (sub-question decomposition, router queries)
- You want multiple index types for different query patterns
- Your RAG pipeline is the core product, not a feature of a larger agent system

### When to Use LangChain

- You are building agents with complex control flow
- You need the broader ecosystem (memory, callbacks, tool integrations)
- Your application involves multi-step reasoning beyond retrieval
- You want tight LangSmith/LangGraph integration

### Using Both Together

LlamaIndex query engines can be used as tools within LangChain agents:

```python
from llama_index.core.tools import QueryEngineTool
from langchain.agents import create_react_agent

# LlamaIndex query engine as a LangChain tool
llama_tool = QueryEngineTool.from_defaults(
    query_engine=index.as_query_engine(),
    name="knowledge_base",
    description="Search the internal knowledge base for technical documentation",
)

# Use in a LangChain agent
agent = create_react_agent(model, tools=[llama_tool, other_tools])
```

::: tip The best approach is often both
Use LlamaIndex for data ingestion and retrieval (what it does best), and LangChain/LangGraph for orchestration and agent logic (what they do best). They are complementary, not competing.
:::

## Common Pitfalls

1. **Not tuning chunk size.** The default chunk size (1024 tokens) is not optimal for every use case. Test with 256, 512, 1024, and 2048 to find the best size for your data and queries.
2. **Ignoring metadata.** Metadata filtering dramatically improves retrieval precision. Always attach source, category, date, and other relevant metadata to your documents.
3. **Using SummaryIndex for Q&A.** SummaryIndex iterates through all nodes — this is slow and expensive for point questions. Use VectorStoreIndex instead.
4. **Not persisting indexes.** Rebuilding indexes from scratch on every restart wastes time and API calls. Use persistent storage or a vector database backend.
5. **Skipping evaluation.** Use LlamaIndex's built-in evaluation modules or external tools to measure retrieval quality and answer accuracy.

## Further Reading

- [RAG Architecture Deep Dive](/ai-ml-engineering/rag-architecture) — The patterns LlamaIndex implements
- [Embeddings & Semantic Search](/ai-ml-engineering/embeddings) — How vector search works under the hood
- [Vector Databases](/ai-ml-engineering/vector-databases) — Storage backends for LlamaIndex indexes
- [LangChain Deep Dive](/ai-ml-engineering/langchain) — The complementary orchestration framework
- [LangSmith & LLM Observability](/ai-ml-engineering/langsmith) — Monitoring LlamaIndex pipelines
- [LlamaIndex Documentation](https://docs.llamaindex.ai/) — Official docs
- [LlamaHub](https://llamahub.ai/) — Data connector ecosystem
