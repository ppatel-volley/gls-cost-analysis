# /review

Structured self-evaluation for Critical-mode tasks. Run this before marking a task as done.

## Usage

Invoke with `/review` after implementation passes the Verification Block.

## Instructions

When the user invokes this skill:

1. **Gather context:**
   - What was the original request?
   - What was implemented?
   - Did the Verification Block pass? (If not, fix that first — this skill is for code that *works* but may not be *right*.)

2. **Score against 3 dimensions:**

   | Dimension | Question | Score |
   |-----------|----------|-------|
   | **Correctness** | Does the implementation do exactly what was asked? Not more, not less. | YES / PARTIAL / NO |
   | **Completeness** | Are all requirements addressed? Edge cases? Error states? | YES / PARTIAL — [what's missing] |
   | **Intent alignment** | Does the approach match the *spirit* of the request, not just the letter? Would the user look at this and say "yes, that's what I meant"? | YES / CAVEAT — [concern] |

3. **Write a verdict:**

   ```
   ## Review Verdict

   - Correctness: [score] — [1-line reason]
   - Completeness: [score] — [1-line reason]
   - Intent alignment: [score] — [1-line reason]

   **Overall:** PASS / ITERATE — [what needs to change]
   ```

4. **If any dimension is PARTIAL or NO:**
   - Write a structured critique: what specifically is wrong, what needs to change, and why
   - Iterate on the implementation with the critique as context
   - Re-run the Verification Block after changes
   - Score again (max 2 iterations — if still not passing, escalate to user)

5. **If all dimensions are YES:** Mark the task as done. Include the verdict in your final response.

## When NOT to Use

- Quick-mode tasks (the abbreviated Verification Block is sufficient)
- Standard-mode tasks where the change is straightforward
- Pure refactors with no behaviour change (tests are the arbiter, not semantic review)

## Example

```
User: /review

## Review Verdict

- Correctness: YES — Timer pauses on keyboard open, resumes on close
- Completeness: PARTIAL — Back key closes keyboard but doesn't resume timer
  (dispatch("RESUME_TIMER") is in the cleanup effect but Back handler
  calls onClose() before the effect runs)
- Intent alignment: YES — On-screen keyboard with D-pad navigation matches
  the request

**Overall:** ITERATE — Fix the Back key handler to explicitly resume the
timer before calling onClose(), rather than relying on the cleanup effect
ordering.
```
