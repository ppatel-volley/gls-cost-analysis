# /unstuck

Break through stagnation with lateral thinking modes.

## Usage

Invoke with `/unstuck` or `/unstuck [mode]`.

## Available Modes

| Mode | Style | When to Use |
|------|-------|-------------|
| **contrarian** | "What if we're solving the wrong problem?" | When assumptions need challenging |
| **simplifier** | "Cut scope, return to MVP" | When complexity is overwhelming |
| **researcher** | "What information are we missing?" | When the problem is unclear |
| **architect** | "Restructure the approach entirely" | When the current design is wrong |
| **ontologist** | "What IS this, really?" | When requirements are vague or you're solving symptoms |
| **hacker** | "Make it work first, elegance later" | When overthinking blocks progress |

## Instructions

When the user invokes this skill:

1. Determine context:
   - What is the user stuck on? (Check recent conversation)
   - What approaches have been tried?
   - Which mode would help most?

2. If a specific mode is requested, use it. Otherwise, route based on context:
   - Repeated similar failures -> **contrarian** (challenge assumptions)
   - Too many options -> **simplifier** (reduce scope)
   - Missing information -> **researcher** (seek data)
   - Analysis paralysis -> **hacker** (just make it work)
   - Structural issues -> **architect** (redesign)

3. Adopt the chosen mode fully. Apply its core question (see AGENTS.md S6 Thinking Modes) to the current situation:
   - Reframe the problem through that lens
   - Ask 2-3 pointed questions from that perspective
   - Suggest concrete next steps

## Example

```
User: I'm stuck on the database schema design

Mode: Simplifier
---
Start with exactly 2 tables. If you can't build the core feature
with 2 tables, you haven't found the core feature yet.

Questions to consider:
- What is the ONE query your users will run most?
- Can you use a single JSON column instead of normalised tables?
- What if you started with flat files and added a DB later?
```
