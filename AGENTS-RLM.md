# Recursive Language Model (RLM) Patterns

> **When to use this document**: Context exceeds ~100K tokens, or task requires processing most/all of a large input.
>
> **Main guidelines**: See [`AGENTS.md`](./AGENTS.md) for core requirements (testing, verification blocks, complexity triggers).

Based on Zhang, Kraska & Khattab (2025). Use these patterns when handling large contexts, long documents, multi-file analysis, or information-dense tasks that would otherwise exceed effective context limits or suffer from context rot.

---

## Core Principle

**Treat long prompts as part of an external environment, not as direct neural network input.** Load context as a variable that can be programmatically examined, decomposed, and recursively processed.

---

## When to Use RLM Patterns

| Trigger | Action |
|---------|--------|
| Context > 100K tokens | Always use RLM patterns |
| Information-dense task (need most/all of input) | Use chunking + sub-calls |
| Multi-document reasoning | Use REPL examination + aggregation |
| Task scales with input size (O(N) or O(N²)) | Use recursive decomposition |
| Simple needle-in-haystack | May use direct approach if context fits |

---

## REPL Environment Model

Conceptually treat the context as a variable in a Python REPL:

```python
# Context is loaded as a variable you can manipulate
context = "<the full input text or document list>"

# You have access to:
# 1. The context variable (string or list)
# 2. An llm_query() function for recursive sub-calls
# 3. print() to observe intermediate results
# 4. Standard Python for programmatic manipulation
```

## The `llm_query()` Function

Use recursive sub-LLM calls to process chunks that are too large or require semantic understanding:

```python
def llm_query(prompt: str) -> str:
    """
    Invoke a sub-LLM on the given prompt.
    Sub-LLMs can handle ~500K characters.
    Use for semantic tasks that can't be done programmatically.
    """
    pass
```

**Key guidance:**
- Batch aggressively: aim for ~100-200K chars per sub-call
- Don't call per-line unless absolutely necessary (expensive!)
- Sub-LLMs are powerful — use them for semantic classification, summarisation, extraction

---

## Core Strategies

### Strategy 1: Probe → Filter → Process

First examine the context structure, then filter programmatically, then process semantically:

```python
# 1. PROBE: Understand the structure
print(f"Total length: {len(context)} chars")
print(f"First 500 chars: {context[:500]}")
lines = context.split('\n')
print(f"Total lines: {len(lines)}")

# 2. FILTER: Use code to narrow down (regex, keywords, structure)
import re
relevant = [l for l in lines if re.search(r'keyword|pattern', l, re.I)]
print(f"Found {len(relevant)} relevant lines")

# 3. PROCESS: Use sub-LLM only on filtered content
result = llm_query(f"Analyse these relevant sections: {relevant[:50]}")
```

### Strategy 2: Chunk → Map → Reduce

For tasks requiring full context examination:

```python
# Determine chunk size based on sub-LLM capacity (~500K chars)
chunk_size = len(context) // 10  # 10 chunks

answers = []
for i in range(10):
    start = i * chunk_size
    end = (i + 1) * chunk_size if i < 9 else len(context)
    chunk = context[start:end]
    
    # MAP: Process each chunk with sub-LLM
    answer = llm_query(f"""
        Task: {original_query}
        Chunk {i+1}/10:
        {chunk}
        
        Extract relevant information only.
    """)
    answers.append(answer)
    print(f"Chunk {i+1}: {answer[:100]}...")

# REDUCE: Aggregate results
final = llm_query(f"""
    Original question: {original_query}
    
    Findings from all chunks:
    {chr(10).join(answers)}
    
    Synthesise into final answer.
""")
```

### Strategy 3: Iterative Refinement with Buffers

Build up answers progressively using variables:

```python
buffer = ""
for i, section in enumerate(sections):
    if i == len(sections) - 1:
        # Final section: produce answer
        buffer = llm_query(f"""
            Previous findings: {buffer}
            Final section: {section}
            Original query: {query}
            
            Produce final answer.
        """)
    else:
        # Intermediate: accumulate relevant info
        buffer = llm_query(f"""
            Previous findings: {buffer}
            Current section {i+1}/{len(sections)}: {section}
            Query: {query}
            
            Update findings with any relevant new information.
        """)
    print(f"After section {i+1}: {buffer[:200]}...")

FINAL_ANSWER = buffer
```

### Strategy 4: Structural Decomposition

When context has clear structure (headers, chapters, files):

```python
import re

# Split by markdown headers
sections = re.split(r'\n## (.+)\n', context)

summaries = []
for i in range(1, len(sections), 2):
    header = sections[i]
    content = sections[i + 1]
    
    summary = llm_query(f"Summarise the '{header}' section: {content}")
    summaries.append(f"{header}: {summary}")

final = llm_query(f"""
    Section summaries:
    {chr(10).join(summaries)}
    
    Answer: {query}
""")
```

---

## Emergent Patterns

### Pattern: Filtering with Model Priors

Use domain knowledge to construct targeted searches:

```python
# Model knows relevant terms even without seeing full context
keywords = ["festival", "La Union", "beauty pageant", "anniversary"]
results = {}

for kw in keywords:
    hits = [l for l in lines if kw.lower() in l.lower()]
    if hits:
        results[kw] = hits[:5]  # Top 5 hits per keyword
        print(f"'{kw}': {len(hits)} hits")

# Process only relevant hits
for kw, hits in results.items():
    analysis = llm_query(f"Analyse these '{kw}' references: {hits}")
```

### Pattern: Answer Verification via Sub-calls

Use separate sub-LLM calls to verify answers (avoids context rot):

```python
# Get initial answer
answer = llm_query(f"Based on {chunk}, what is X?")

# Verify with fresh context (no accumulated errors)
verification = llm_query(f"""
    Claim: {answer}
    Evidence: {relevant_chunk}
    
    Is this claim supported? Return YES/NO with explanation.
""")

if "NO" in verification:
    # Retry with different approach
    answer = llm_query(f"Re-examine {chunk} for X, previous answer was wrong.")
```

### Pattern: Long Output via Variable Stitching

For outputs that exceed generation limits:

```python
# Process pairs and accumulate in variable (not in generation)
formatted_pairs = []

for i, pair in enumerate(pairs_to_process):
    result = llm_query(f"Process pair {pair}")
    formatted_pairs.append(f"({pair[0]}, {pair[1]}): {result}")

# Final output is the variable, not a generation
final_result = "\n".join(formatted_pairs)
FINAL_VAR(final_result)  # Return variable, not generated text
```

---

## Cost-Performance Trade-offs

| Approach | When to Use | Cost Profile |
|----------|-------------|--------------|
| Direct LLM | Short context, simple task | Low, fixed |
| RLM (no sub-calls) | Long context, can filter programmatically | Low-medium |
| RLM (with sub-calls) | Information-dense, semantic processing needed | Medium-high, variable |
| Per-line sub-calls | Avoid if possible | Very high |

**Optimisation tips:**
- Batch sub-calls: 100+ items per call, not 1
- Filter before semantic processing
- Use code for anything that doesn't require understanding
- Cache intermediate results in variables

---

## Context Rot: Why RLMs Matter

**Context rot** is the phenomenon where LLM quality degrades as context length increases, even within the model's stated context window. This is not just about hitting token limits—it's about degradation in the *effective* use of context.

### Key Findings

| Context Length | Typical Degradation |
|----------------|---------------------|
| < 16K tokens | Minimal degradation |
| 16K - 64K | Noticeable quality loss on complex tasks |
| 64K - 128K | Significant degradation, especially for information-dense tasks |
| > 128K | Severe degradation; RLM patterns strongly recommended |

### Why It Happens

1. **Attention dilution** — information early in context gets less attention
2. **Position bias** — models favour recent tokens over distant ones
3. **Interference** — unrelated content interferes with relevant retrieval
4. **Compounding errors** — small mistakes early cascade into larger errors

### RLM Solution

By treating context as an external environment:
- Only relevant snippets enter the neural network at any time
- Sub-calls operate on fresh, focused context (no accumulated noise)
- Programmatic filtering removes irrelevant content before semantic processing
- Variables preserve intermediate results without re-processing

---

## Task Complexity Classification

The **effective context window** depends on task complexity, not just token count. Classify tasks by how processing requirements scale with input size:

### O(1) — Constant Complexity

**Definition:** Answer depends on finding a fixed amount of information, regardless of total input size.

**Examples:**
- Needle-in-a-haystack (find one specific fact)
- Lookup queries (find a named entity)
- Single-document questions

**RLM Strategy:** Probe → Filter → Direct answer. Sub-calls often unnecessary.

```python
# O(1): Find the API key in config files
for file in files:
    if 'API_KEY' in file:
        match = re.search(r'API_KEY\s*=\s*["\'](.+?)["\']', file)
        if match:
            FINAL(match.group(1))
            break
```

### O(N) — Linear Complexity

**Definition:** Must examine most/all entries to produce answer. Work scales linearly with input size.

**Examples:**
- Count all items matching criteria
- Summarise all sections of a document
- Aggregate statistics across entries
- Classification of each entry

**RLM Strategy:** Chunk → Map → Reduce. Batch aggressively.

```python
# O(N): Classify 1000 questions into 6 categories
chunk_size = 100  # 10 chunks of 100
category_counts = {}

for i in range(0, len(questions), chunk_size):
    chunk = questions[i:i+chunk_size]
    classifications = llm_query(f"""
        Classify each question into one of: 
        numeric_value, entity, location, description, abbreviation, human_being
        
        Questions:
        {chr(10).join(chunk)}
        
        Return: one category per line
    """)
    for cat in classifications.split('\n'):
        category_counts[cat] = category_counts.get(cat, 0) + 1
```

### O(N²) — Quadratic Complexity

**Definition:** Must examine pairs (or higher-order combinations) of entries. Work scales quadratically with input size.

**Examples:**
- Find all pairs satisfying a condition
- Compare each entry against all others
- Relationship extraction between entities
- Duplicate/similarity detection

**RLM Strategy:** This is where RLMs shine brightest. Without RLM, models fail catastrophically on O(N²) tasks even at modest input sizes.

```python
# O(N²): Find all user pairs where both have specific label combinations
# First pass: classify all users (O(N))
user_labels = {}
for i in range(0, len(users), 100):
    chunk = users[i:i+100]
    labels = llm_query(f"Classify each user's entries: {chunk}")
    # Parse and store labels...

# Second pass: find qualifying pairs (O(N²) but done programmatically)
qualifying_pairs = []
user_ids = list(user_labels.keys())
for i, uid1 in enumerate(user_ids):
    for uid2 in user_ids[i+1:]:
        if meets_criteria(user_labels[uid1], user_labels[uid2]):
            qualifying_pairs.append((uid1, uid2))

FINAL_VAR(qualifying_pairs)
```

### Complexity Decision Table

| Task Type | Base LLM Viable? | RLM Benefit |
|-----------|------------------|-------------|
| O(1), short context | ✅ Yes | Minimal |
| O(1), long context | ⚠️ Maybe | Moderate (filtering helps) |
| O(N), short context | ⚠️ Maybe | Moderate |
| O(N), long context | ❌ No | **High** |
| O(N²), any context | ❌ No | **Critical** |

---

## Completion Conventions: FINAL() and FINAL_VAR()

When working in RLM mode, use explicit completion signals to distinguish between intermediate reasoning and final answers.

### FINAL(answer)

Use when your final answer is a direct string/value:

```python
# After processing, return direct answer
FINAL("The authentication function is handleUserLogin() in auth/login.ts")

# For simple answers
FINAL("42")

# For formatted answers
FINAL(f"Found {count} matching entries: {', '.join(matches)}")
```

### FINAL_VAR(variable_name)

Use when your answer is stored in a variable (especially for long outputs):

```python
# Build up result in variable
all_pairs = []
for i, pair in enumerate(pairs):
    result = llm_query(f"Process {pair}")
    all_pairs.append(f"{pair}: {result}")

formatted_output = "\n".join(all_pairs)

# Return the variable, not a generation
FINAL_VAR(formatted_output)
```

### When to Use Which

| Situation | Use |
|-----------|-----|
| Short, direct answer | `FINAL("answer")` |
| Answer from single llm_query | `FINAL(result)` |
| Long output built incrementally | `FINAL_VAR(variable)` |
| Output exceeds generation limits | `FINAL_VAR(variable)` |
| Structured data (lists, dicts) | `FINAL_VAR(data)` |

### Important Notes

1. **Don't use FINAL/FINAL_VAR until done** — these signal task completion
2. **Only one FINAL per task** — the first one encountered ends processing
3. **FINAL_VAR returns actual variable contents** — not a description of them
4. **Verify before completing** — once you FINAL, you can't correct

---

## Anti-Patterns and Pitfalls

Based on empirical findings from the RLM paper (Appendix A). Avoid these mistakes:

### ❌ Anti-Pattern 1: Per-Line Sub-Calls

**Problem:** Calling llm_query() for every single line/entry.

```python
# BAD: 1000 sub-calls for 1000 lines
for line in lines:
    classification = llm_query(f"Classify: {line}")  # Extremely expensive!
```

**Solution:** Batch aggressively.

```python
# GOOD: 10 sub-calls for 1000 lines
for i in range(0, len(lines), 100):
    batch = lines[i:i+100]
    classifications = llm_query(f"""
        Classify each line (one category per line):
        {chr(10).join(batch)}
    """)
```

**Impact:** Per-line calls can be 100x more expensive and much slower.

### ❌ Anti-Pattern 2: Over-Verification

**Problem:** Repeatedly verifying correct answers until you get a wrong one.

```python
# BAD: Keep checking until something goes wrong
answer = get_answer()
for i in range(10):
    verification = llm_query(f"Is {answer} correct?")
    if "NO" in verification:
        answer = get_answer()  # Might get worse answer!
```

**Solution:** Verify once, or verify with different evidence.

```python
# GOOD: Single verification with fresh evidence
answer = get_answer(chunk1)
verification = llm_query(f"Given {chunk2}, is '{answer}' supported?")
if "NO" in verification:
    answer = get_answer(chunk1 + chunk2)  # More context, not more iterations
```

### ❌ Anti-Pattern 3: Ignoring Built-Up Variables

**Problem:** Computing answer correctly in variables, then re-generating from scratch.

```python
# BAD: Variable has correct answer, but we ignore it
pairs = compute_all_pairs()  # Correct!
final_answer = llm_query("What are all the pairs?")  # Wrong! Regenerates from memory
```

**Solution:** Return the variable directly.

```python
# GOOD: Return what you computed
pairs = compute_all_pairs()
FINAL_VAR(pairs)
```

### ❌ Anti-Pattern 4: Not Filtering Before Processing

**Problem:** Sending entire context to sub-LLMs when most is irrelevant.

```python
# BAD: Process everything
for chunk in all_chunks:
    result = llm_query(f"Find auth functions: {chunk}")  # Most chunks have none
```

**Solution:** Filter programmatically first.

```python
# GOOD: Filter then process
relevant_chunks = [c for c in all_chunks if 'auth' in c.lower()]
for chunk in relevant_chunks:
    result = llm_query(f"Find auth functions: {chunk}")
```

### ❌ Anti-Pattern 5: Insufficient Coding Capability

**Problem:** Trying to use RLM patterns with models that can't code reliably.

**Symptoms:**
- Syntax errors in REPL code
- Incorrect regex patterns
- Failed string manipulation
- Logic errors in loops

**Solution:** RLM patterns require strong coding abilities. If the base model struggles with code, consider:
- Using a more capable model
- Simplifying the programmatic operations
- Falling back to pure sub-LLM approaches (less efficient)

### ❌ Anti-Pattern 6: Confusing Plan with Execution

**Problem:** Describing what you'll do instead of doing it.

```python
# BAD: Just a plan
"I will first probe the context, then filter for relevant sections, 
then process each with sub-calls, and finally synthesize the results."
# (No actual code executed)
```

**Solution:** Execute immediately.

```python
# GOOD: Actually do it
print(f"Context length: {len(context)}")
lines = context.split('\n')
relevant = [l for l in lines if 'keyword' in l.lower()]
print(f"Found {len(relevant)} relevant lines")
# ... continue with actual processing
```

---

## Sub-Model Selection Strategy

The paper found that using different models for root vs. sub-calls offers an excellent cost-performance tradeoff.

### Recommended Configuration

| Role | Model Choice | Rationale |
|------|--------------|-----------|
| Root LLM | Full capability (e.g., GPT-5, Claude Opus) | Orchestration, final synthesis |
| Sub-LLM | Smaller/cheaper (e.g., GPT-5-mini, Claude Sonnet) | Bulk processing, classification |

### Why This Works

1. **Root LLM** handles:
   - Understanding the original query
   - Deciding decomposition strategy
   - Writing REPL code
   - Final answer synthesis
   - These are high-value, low-volume calls

2. **Sub-LLM** handles:
   - Processing individual chunks
   - Classification tasks
   - Extraction tasks
   - These are lower-value, high-volume calls

### Cost Example (from paper)

For a 6-11M token BrowseComp+ task:
- Direct GPT-5: $1.50-$2.75 (if it could fit, which it can't)
- RLM(GPT-5 root + GPT-5-mini subs): $0.99 average
- Performance: RLM beats all baselines by 29%+

---

## Reference: RLM System Prompt

Condensed from the paper's Appendix D. Use this as a template for RLM-style agent instructions:

```
You are tasked with answering a query with associated context. You can access,
transform, and analyze this context interactively in a REPL environment that
can recursively query sub-LLMs.

Your context is a {context_type} with {context_total_length} total characters.

The REPL environment provides:
1. A 'context' variable containing the input data
2. An 'llm_query(prompt)' function to invoke sub-LLMs (~500K char capacity)
3. print() statements to observe intermediate results

IMPORTANT: 
- Sub-LLMs are powerful—batch ~100-200K chars per call, not per-line calls
- Use code (regex, filtering, splitting) before semantic processing
- Build answers in variables, especially for long outputs

Strategies:
1. PROBE: Examine context structure (length, format, sections)
2. FILTER: Use code to narrow down relevant portions  
3. CHUNK: Split into manageable pieces for sub-LLM processing
4. AGGREGATE: Combine sub-results using llm_query or code

When complete, signal with:
- FINAL(answer) — for direct answers
- FINAL_VAR(variable) — for answers stored in variables

Execute your plan immediately—don't just describe what you'll do.
```

### Model-Specific Adjustments

**For aggressive sub-callers (e.g., Qwen3-Coder):**
```
IMPORTANT: Be very careful about using llm_query() as it incurs high runtime 
costs. Always batch as much information as reasonably possible into each call 
(aim for ~200K characters per call). Minimize the number of llm_query() calls 
by batching related information together.
```

**For conservative models:**
```
Don't be afraid to use llm_query() for semantic tasks—sub-LLMs can handle 
~500K characters and are very capable. Use them for classification, 
summarization, and extraction tasks.
```

---

## Quick Reference Card

### Decision Flow

```
Is context > 100K tokens?
├─ No → Is task O(N²)?
│       ├─ No → Consider direct LLM (maybe with simple filtering)
│       └─ Yes → Use RLM with chunked pair processing
└─ Yes → Use RLM
         ├─ Can filter programmatically? → Probe → Filter → Process
         ├─ Need full examination? → Chunk → Map → Reduce  
         └─ Has clear structure? → Structural Decomposition
```

### Cost Minimization Checklist

- [ ] Filter before sub-calling (eliminate irrelevant content)
- [ ] Batch sub-calls (100+ items per call)
- [ ] Use smaller model for sub-calls
- [ ] Cache results in variables (don't recompute)
- [ ] Verify once, not repeatedly
- [ ] Return variables, don't regenerate

### Complexity Cheat Sheet

| Indicator | Likely Complexity |
|-----------|-------------------|
| "Find the X" | O(1) |
| "Count all X" | O(N) |
| "Summarize each section" | O(N) |
| "Find all pairs where..." | O(N²) |
| "Compare each X to all Y" | O(N²) |
