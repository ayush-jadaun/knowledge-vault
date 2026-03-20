---
title: "LangGraph"
description: "Graph-based agent orchestration with LangGraph — state machines for AI agents, nodes, edges, conditional routing, human-in-the-loop, persistence, and multi-agent coordination."
tags: [langgraph, agents, state-machines, orchestration, ai-framework]
difficulty: advanced
prerequisites: [langchain, ai-agents]
lastReviewed: "2026-03-20"
---

# LangGraph

LangGraph is a framework for building stateful, multi-step AI agent applications as directed graphs. Where [LangChain](/ai-ml-engineering/langchain) gives you composable chains (linear pipelines), LangGraph gives you graphs — nodes that perform work, edges that define transitions, and state that persists across the entire execution. This is the difference between a script and a state machine.

If your agent needs to loop, branch, backtrack, wait for human approval, or coordinate with other agents, you need a graph. LangGraph is the production-grade tool for building these systems on top of the LangChain ecosystem.

## Why Graph-Based Orchestration

Linear chains break down when agents need to:

1. **Loop** — Try an approach, evaluate the result, try again if needed
2. **Branch** — Take different paths based on intermediate results
3. **Checkpoint** — Save state so execution can resume after interruption
4. **Wait** — Pause for human review or external events
5. **Coordinate** — Hand off work between multiple specialized agents

Traditional agent loops (like the ReAct pattern) are just `while True` loops with no structure. LangGraph makes the control flow explicit, debuggable, and persistent.

```mermaid
graph LR
    subgraph Linear["Linear Chain"]
        A["Step 1"] --> B["Step 2"] --> C["Step 3"]
    end

    subgraph Graph["LangGraph"]
        N1["Research"] --> N2{"Sufficient<br/>info?"}
        N2 -->|No| N1
        N2 -->|Yes| N3["Draft"]
        N3 --> N4{"Human<br/>approved?"}
        N4 -->|No| N3
        N4 -->|Yes| N5["Publish"]
    end
```

## Core Concepts

### State

State is the central data structure that flows through your graph. Every node reads from state and writes to state. By default, state updates are merged using a reducer function.

```python
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph
from operator import add

class AgentState(TypedDict):
    messages: Annotated[list, add]  # append new messages
    research_notes: str
    draft: str
    approved: bool
    iteration_count: int
```

The `Annotated[list, add]` syntax tells LangGraph to append new messages to the existing list rather than replacing it. This is how conversation history accumulates.

```typescript
import { StateGraph, Annotation } from "@langchain/langgraph";

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  researchNotes: Annotation<string>(),
  draft: Annotation<string>(),
  approved: Annotation<boolean>(),
  iterationCount: Annotation<number>(),
});
```

### Nodes

Nodes are functions that take the current state and return a partial state update. They are where the actual work happens — LLM calls, tool execution, data processing.

```python
from langchain_openai import ChatOpenAI

model = ChatOpenAI(model="gpt-4o")

def research_node(state: AgentState) -> dict:
    """Perform research based on the current question."""
    messages = state["messages"]
    response = model.invoke(messages)
    return {"messages": [response]}

def draft_node(state: AgentState) -> dict:
    """Draft a response based on research notes."""
    prompt = f"Based on these notes:\n{state['research_notes']}\n\nDraft a response."
    response = model.invoke([("human", prompt)])
    return {
        "draft": response.content,
        "iteration_count": state["iteration_count"] + 1,
    }
```

### Edges

Edges define the transitions between nodes. There are three types:

1. **Normal edges** — Always go from A to B
2. **Conditional edges** — Route to different nodes based on state
3. **Entry/exit edges** — Define where the graph starts and ends

```python
from langgraph.graph import StateGraph, START, END

graph = StateGraph(AgentState)

# Add nodes
graph.add_node("research", research_node)
graph.add_node("draft", draft_node)
graph.add_node("review", review_node)

# Normal edge
graph.add_edge(START, "research")
graph.add_edge("draft", "review")

# Conditional edge
def should_continue_research(state: AgentState) -> str:
    if state.get("research_notes") and len(state["research_notes"]) > 200:
        return "draft"
    return "research"

graph.add_conditional_edges(
    "research",
    should_continue_research,
    {"draft": "draft", "research": "research"},
)

# Conditional exit
def is_approved(state: AgentState) -> str:
    if state.get("approved"):
        return END
    if state["iteration_count"] >= 3:
        return END  # give up after 3 iterations
    return "draft"

graph.add_conditional_edges("review", is_approved)

# Compile
app = graph.compile()
```

```mermaid
graph TD
    Start["START"] --> Research["research"]
    Research --> Check{"Sufficient<br/>research?"}
    Check -->|No| Research
    Check -->|Yes| Draft["draft"]
    Draft --> Review["review"]
    Review --> Approved{"Approved?"}
    Approved -->|Yes| End["END"]
    Approved -->|No, iteration < 3| Draft
    Approved -->|No, iteration >= 3| End
```

### Running the Graph

```python
# Invoke (blocking)
result = app.invoke({
    "messages": [("human", "Research the latest trends in edge computing")],
    "research_notes": "",
    "draft": "",
    "approved": False,
    "iteration_count": 0,
})

# Stream node-by-node
for event in app.stream({
    "messages": [("human", "Research edge computing trends")],
    "research_notes": "",
    "draft": "",
    "approved": False,
    "iteration_count": 0,
}):
    for node_name, state_update in event.items():
        print(f"--- {node_name} ---")
        print(state_update)
```

## The Prebuilt ReAct Agent

For standard tool-calling agents, LangGraph provides a prebuilt implementation:

```python
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool

@tool
def search_docs(query: str) -> str:
    """Search internal documentation."""
    return doc_search(query)

@tool
def run_query(sql: str) -> str:
    """Execute a read-only SQL query."""
    return db.execute(sql)

agent = create_react_agent(
    model=ChatOpenAI(model="gpt-4o"),
    tools=[search_docs, run_query],
    state_modifier="You are a data analyst. Use tools to answer questions accurately.",
)

result = agent.invoke({
    "messages": [("human", "How many users signed up last month?")]
})
```

This is equivalent to building a graph with a model node and a tool-execution node connected by conditional edges, but saves the boilerplate.

## Human-in-the-Loop Patterns

One of LangGraph's most important features: pausing execution to wait for human input before continuing.

### Interrupt Before a Node

```python
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()

graph = StateGraph(AgentState)
graph.add_node("research", research_node)
graph.add_node("draft", draft_node)
graph.add_node("publish", publish_node)

graph.add_edge(START, "research")
graph.add_edge("research", "draft")
graph.add_edge("draft", "publish")
graph.add_edge("publish", END)

# Compile with interrupt BEFORE publish
app = graph.compile(
    checkpointer=checkpointer,
    interrupt_before=["publish"],  # pause before publishing
)

# Run — will pause before "publish" node
config = {"configurable": {"thread_id": "article-123"}}
result = app.invoke(
    {"messages": [("human", "Write an article about microservices")]},
    config=config,
)

# At this point, execution is paused. The human reviews the draft.
# To approve and continue:
app.invoke(None, config=config)

# Or to reject and modify state:
app.update_state(
    config,
    {"draft": "Please rewrite with more focus on service mesh"},
)
app.invoke(None, config=config)
```

### Approval Gates

```python
def human_review_node(state: AgentState) -> dict:
    """This node is a placeholder — the real review happens
    when the graph resumes after the interrupt."""
    return {"approved": True}

graph.add_node("human_review", human_review_node)

app = graph.compile(
    checkpointer=checkpointer,
    interrupt_before=["human_review"],
)
```

```mermaid
graph LR
    Research["Research"] --> Draft["Draft"]
    Draft --> Interrupt["INTERRUPT<br/>Human Review"]
    Interrupt --> Publish["Publish"]

    style Interrupt fill:#ff9800,stroke:#e65100,color:#000
```

::: tip Human-in-the-loop is essential for production
Any agent that takes consequential actions (sending emails, modifying databases, deploying code) should have human approval gates. LangGraph makes this a first-class feature rather than a hack.
:::

## Persistence and Checkpointing

LangGraph checkpointers save the complete graph state at every node transition. This enables:

1. **Resumption** — Resume execution after interrupts or crashes
2. **Time travel** — Replay execution from any previous checkpoint
3. **Branching** — Fork from a previous state to explore alternatives
4. **Auditing** — Full history of every state transition

```python
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.checkpoint.postgres import PostgresSaver

# In-memory (dev/testing)
checkpointer = MemorySaver()

# SQLite (single-server)
checkpointer = SqliteSaver.from_conn_string("checkpoints.db")

# PostgreSQL (production)
checkpointer = PostgresSaver.from_conn_string(
    "postgresql://user:pass@localhost/langgraph"
)

app = graph.compile(checkpointer=checkpointer)

# Every invocation with the same thread_id shares state
config = {"configurable": {"thread_id": "user-session-abc"}}

# First message
app.invoke({"messages": [("human", "Hello")]}, config)

# Second message — has full history from first
app.invoke({"messages": [("human", "Follow up question")]}, config)

# Time travel — get state at any checkpoint
history = list(app.get_state_history(config))
previous_state = history[1]  # one step back
# Fork from that state
app.invoke(None, {**config, "configurable": {
    "thread_id": "user-session-abc",
    "checkpoint_id": previous_state.config["configurable"]["checkpoint_id"],
}})
```

## Multi-Agent Coordination

LangGraph enables multiple specialized agents to collaborate within a single graph.

### Supervisor Pattern

A supervisor agent routes tasks to specialized worker agents:

```python
from langgraph.graph import StateGraph, START, END

class MultiAgentState(TypedDict):
    messages: Annotated[list, add]
    next_agent: str
    final_answer: str

def supervisor_node(state: MultiAgentState) -> dict:
    """Decide which agent to delegate to."""
    response = supervisor_model.invoke([
        ("system", """You are a supervisor managing these agents:
        - researcher: finds information and data
        - coder: writes and analyzes code
        - writer: drafts polished content

        Based on the conversation, decide which agent should act next,
        or if the task is complete. Respond with the agent name or 'FINISH'."""),
        *state["messages"],
    ])
    return {"next_agent": response.content.strip().lower()}

def researcher_node(state: MultiAgentState) -> dict:
    response = researcher_agent.invoke({"messages": state["messages"]})
    return {"messages": [("ai", f"[Researcher]: {response}")]}

def coder_node(state: MultiAgentState) -> dict:
    response = coder_agent.invoke({"messages": state["messages"]})
    return {"messages": [("ai", f"[Coder]: {response}")]}

def writer_node(state: MultiAgentState) -> dict:
    response = writer_agent.invoke({"messages": state["messages"]})
    return {"messages": [("ai", f"[Writer]: {response}")]}

graph = StateGraph(MultiAgentState)
graph.add_node("supervisor", supervisor_node)
graph.add_node("researcher", researcher_node)
graph.add_node("coder", coder_node)
graph.add_node("writer", writer_node)

graph.add_edge(START, "supervisor")
graph.add_conditional_edges("supervisor", lambda s: s["next_agent"], {
    "researcher": "researcher",
    "coder": "coder",
    "writer": "writer",
    "finish": END,
})

# All workers route back to supervisor
graph.add_edge("researcher", "supervisor")
graph.add_edge("coder", "supervisor")
graph.add_edge("writer", "supervisor")

multi_agent = graph.compile()
```

```mermaid
graph TD
    Start["START"] --> Supervisor["Supervisor"]
    Supervisor --> Route{"Route to<br/>agent"}
    Route -->|research| Researcher["Researcher Agent"]
    Route -->|code| Coder["Coder Agent"]
    Route -->|write| Writer["Writer Agent"]
    Route -->|finish| End["END"]
    Researcher --> Supervisor
    Coder --> Supervisor
    Writer --> Supervisor
```

### Swarm Pattern

Agents hand off directly to each other without a central supervisor:

```python
def researcher_node(state):
    result = do_research(state)
    if needs_code_analysis(result):
        return {"messages": [...], "next": "coder"}
    return {"messages": [...], "next": "writer"}

def route_from_researcher(state) -> str:
    return state["next"]

graph.add_conditional_edges("researcher", route_from_researcher, {
    "coder": "coder",
    "writer": "writer",
})
```

## LangGraph vs CrewAI vs AutoGen

| Feature | LangGraph | CrewAI | AutoGen |
|---------|-----------|--------|---------|
| **Paradigm** | Explicit graph | Role-based agents | Conversation-based |
| **Control flow** | Full control (nodes, edges) | Declarative (roles, tasks) | Emergent (agent chat) |
| **State management** | Built-in, typed state | Task context | Conversation history |
| **Human-in-the-loop** | First-class (`interrupt_before`) | Basic support | Proxy agents |
| **Persistence** | Checkpointing system | Limited | Limited |
| **Streaming** | Node-by-node streaming | Limited | Limited |
| **Debugging** | LangSmith integration | Basic logging | Basic logging |
| **Learning curve** | Steeper (graph concepts) | Gentler (natural roles) | Moderate |
| **Production readiness** | High | Medium | Medium |
| **Best for** | Complex, stateful workflows | Simple multi-agent tasks | Research/prototyping |

::: tip Choose based on control needs
Use **LangGraph** when you need precise control over agent behavior, persistence, and human-in-the-loop. Use **CrewAI** when you want to spin up a multi-agent system fast with minimal code. Use **AutoGen** for research and experimentation with conversational agent patterns.
:::

## Production Patterns

### Retry with Backoff

```python
def llm_node_with_retry(state: AgentState) -> dict:
    """LLM call with retry logic built into the node."""
    for attempt in range(3):
        try:
            response = model.invoke(state["messages"])
            return {"messages": [response]}
        except Exception as e:
            if attempt == 2:
                return {"messages": [("ai", f"Error after 3 retries: {e}")]}
            time.sleep(2 ** attempt)
```

### Bounded Loops

Always limit the number of iterations to prevent runaway agents:

```python
def should_continue(state: AgentState) -> str:
    if state["iteration_count"] >= 10:
        return "force_finish"  # hard stop
    if state.get("task_complete"):
        return END
    return "next_step"
```

::: danger Unbounded loops will drain your budget
An agent caught in a loop can make hundreds of LLM calls before you notice. Always set a maximum iteration count. A good default is 10-15 steps. Log a warning when the limit is hit.
:::

### Subgraphs

Compose complex workflows by nesting graphs:

```python
# Define a research subgraph
research_graph = StateGraph(ResearchState)
research_graph.add_node("search", search_node)
research_graph.add_node("summarize", summarize_node)
research_graph.add_edge(START, "search")
research_graph.add_edge("search", "summarize")
research_graph.add_edge("summarize", END)
research_subgraph = research_graph.compile()

# Use it as a node in the parent graph
parent_graph = StateGraph(ParentState)
parent_graph.add_node("research", research_subgraph)
parent_graph.add_node("draft", draft_node)
parent_graph.add_edge(START, "research")
parent_graph.add_edge("research", "draft")
parent_graph.add_edge("draft", END)
```

## LangGraph Platform

LangGraph Platform (formerly LangGraph Cloud) provides managed infrastructure for deploying LangGraph applications:

- **LangGraph Server** — HTTP API for running graphs with built-in persistence
- **Cron jobs** — Scheduled graph executions
- **Assistants API** — Versioned agent configurations
- **Studio** — Visual debugger for stepping through graph execution

```python
# Deploy with LangGraph CLI
# langgraph up --config langgraph.json

# langgraph.json
{
    "graphs": {
        "my_agent": "./agent.py:graph"
    },
    "env": ".env",
    "dependencies": ["requirements.txt"]
}
```

## Further Reading

- [LangChain Deep Dive](/ai-ml-engineering/langchain) — The foundation LangGraph builds on
- [AI Agents Architecture](/ai-ml-engineering/ai-agents) — Agent patterns and architectures
- [LangSmith & LLM Observability](/ai-ml-engineering/langsmith) — Tracing and debugging LangGraph executions
- [AI in Production](/ai-ml-engineering/ai-in-production) — Reliability, cost, and monitoring patterns
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/) — Official docs
- [LangGraph Examples](https://github.com/langchain-ai/langgraph/tree/main/examples) — Reference implementations
