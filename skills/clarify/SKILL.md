# /clarify

Structured requirements elicitation when a task is ambiguous.

## Usage

Invoke with `/clarify` or `/clarify [topic]`.

## Instructions

When the user invokes this skill:

1. **Adopt the interviewer role.** You are ONLY gathering information. Do not write code, edit files, or start solving until the interview is complete.

2. **Identify the biggest ambiguity.** Review the user's request and determine the single most important unknown. Don't scatter-shot — focus on one thing at a time.

3. **Ask with structure.** For each question:
   - Present 2-3 likely answers as options (don't leave it open-ended)
   - The user can always give a custom answer
   - Binary questions: use the natural choices (yes/no, greenfield/brownfield)
   - Technology choices: suggest common options for the context
   - Open-ended questions: suggest representative answer categories

4. **Build on responses.** Each follow-up question should target the next biggest ambiguity based on what you've learned so far. Use ontological questions when helpful:
   - "What are you assuming?"
   - "What must exist before this can work?"
   - "Is this the root problem, or a symptom?"

5. **Know when to stop.** End the interview when:
   - The Ambiguity Pre-check would now pass (goal, constraints, and success criteria are clear)
   - The user says "done" or "that's enough"
   - You've asked 5-7 questions without uncovering new ambiguity

6. **Summarise and transition.** After the interview:
   - Restate the clarified requirements in 3-5 bullet points
   - Confirm with the user before proceeding to implementation
   - Note any remaining assumptions (mark as unverified)

## Interviewer Behaviour

- Always end responses with a question (until the interview is complete)
- Target the biggest source of ambiguity, not trivia
- NEVER write code, edit files, or run commands during the interview
- Keep questions to 1-2 sentences — be concise

## Example

```
User: Build a REST API

Q1: What domain will this API serve?
   a) Task/project management
   b) E-commerce / inventory
   c) Something else (please describe)

User: Task management

Q2: What operations should tasks support?
   a) Full CRUD (create, read, update, delete)
   b) Read-only (display/reporting)
   c) CRUD plus workflow (status transitions, assignments)

User: CRUD plus workflow

Q3: Will tasks have relationships to other entities?
   a) Standalone tasks only
   b) Subtasks / parent-child hierarchy
   c) Tags, categories, or labels for organisation

User: Tags for organising

Summary:
- REST API for task management
- Full CRUD with workflow (status transitions, assignments)
- Tasks have tags for organisation
- Assumption: standard REST conventions (JSON, HTTP status codes) [unverified]

Shall I proceed with this scope?
```
