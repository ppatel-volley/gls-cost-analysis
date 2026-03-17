# React/TypeScript Agent Guidelines

> Supplements [`AGENTS.md`](./AGENTS.md) with React, TypeScript, and JavaScript-specific patterns.
>
> **Template**: Customize or replace for your stack (e.g., `AGENTS-PYTHON.md`, `AGENTS-CSHARP.md`).
> For project-specific commands (test, build, dev), see [`AGENTS-PROJECT.md`](./AGENTS-PROJECT.md).

---

## TypeScript Testing (Vitest)

> Standard Vitest API (assertions, mocking, spies, timers) is assumed knowledge. Only project-specific patterns documented here.

### Mock Context Pattern (for State Machines/Reducers)

```typescript
const createMockContext = <TState>(initialState: TState) => {
    let state = initialState
    return {
        getState: () => state,
        setState: (newState: TState) => { state = newState },
        dispatch: (action: Action) => {
            state = reducer(state, action)
        },
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        },
    }
}
```

---

## React Testing

> Standard React Testing Library API (render, screen, fireEvent, waitFor, userEvent) is assumed knowledge. Key rules only:

- **Query priority**: `getByRole` > `getByLabelText` > `getByText` > `getByTestId` (last resort)
- **User events**: prefer `userEvent.setup()` over `fireEvent` for realistic interaction simulation
- **Async**: use `findBy*` (built-in waiting) or `waitFor()` for elements that appear after async operations

---

## React Patterns

> Standard React patterns (function components, hooks, context, reducers) are assumed knowledge. Project-specific rules only:

### Performance

- **Don't prematurely memoize** — only use `useMemo`/`useCallback` when you've measured a performance problem or the value is passed to a memoized child
- **Avoid inline object/array literals in JSX props** — `style={{ color: 'red' }}` creates a new object every render. Hoist to a constant or use `useMemo` if it causes re-renders
- **Use `React.lazy()` for route-level code splitting** — don't lazy-load small components
- **Be aware of bundle size** — check the import cost before adding a large library for a small feature. Tree-shakeable imports (`import { pick } from 'lodash-es'`) over full imports (`import _ from 'lodash'`)

---

## Three.js Development

> **Conditional**: For Three.js/shader/R3F work, see [`AGENTS-THREEJS.md`](./AGENTS-THREEJS.md). Not loaded by default — read only when the task involves 3D, shaders, or WebGL.

---

## TypeScript Best Practices

> Standard TypeScript patterns (interfaces, utility types, generics, type guards, optional chaining) are assumed knowledge. Project-specific rules only:

- **Interfaces for objects, types for unions/intersections** — don't mix
- **`unknown` over `any`** — always. Narrow with type guards, never cast blindly.
- **Explicit return types on exported functions** — internal functions can rely on inference
- **Prefix unused params with underscore** — `_event: Event` not `event: Event`
- **Discriminated unions for result types** — use `{ success: true; data: T } | { success: false; error: string }` pattern
- **Strict null handling** — prefer proper null checks and optional chaining over non-null assertions (`!`). Use `!` only when you can prove the value exists.
