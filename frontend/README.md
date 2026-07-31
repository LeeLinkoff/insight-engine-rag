# Insight Engine Frontend Architecture

This document explains the engineering decisions behind the Insight Engine frontend. Rather than documenting React itself, it describes why the application is structured the way it is, how data flows through the system, and the tradeoffs made during implementation.

The frontend was intentionally designed to remain simple while still following architectural principles appropriate for a production-quality application. Each component has a clearly defined responsibility, application state has a single owner, and the user interface is separated from application orchestration to make future enhancements straightforward.

---

# 1. Design Goals

- Single ownership of application state
- Predictable one-way data flow
- Components with one clearly defined responsibility
- Separation of presentation from orchestration
- Accessibility by default
- Minimal coupling between components
- Straightforward extensibility

---

# 2. High-Level Architecture

```text
Browser
    │
    ▼
 App.jsx
    │
 ├───────────────┐
 │               │
 ▼               ▼
AboutCard    PageUrlCard
    │
    ▼
   Tabs
 ├───────────────┐
 │               │
 ▼               ▼
Highlighter   Ask Question
                  │
      ┌───────────┼────────────┐
      ▼           ▼            ▼
 AnswerCard  SourcesCard  HighlightedPreviewCard

Dialogs
 ├─ SystemCheckDialog
 └─ HowItWorksDialog
      ├─ InstructionSection
      └─ InstructionStep
```

`App.jsx` owns the application's shared state and backend communication. Every other component has a focused responsibility.

---

# 3. State Management Philosophy

The application intentionally keeps shared state inside `App.jsx` rather than introducing Redux, Zustand, MobX, or global Context.

Current workflow:

```text
Enter URL
↓
Load Document
↓
Ask Question
↓
Display Answer
↓
Display Sources
↓
Highlight Evidence
```

This provides one source of truth, predictable rendering, easier debugging, and avoids unnecessary architectural complexity.

---

# 4. Component Responsibilities

## App.jsx
- Owns shared application state
- Coordinates backend communication
- Manages loading and error state
- Passes data to presentation components

## AboutCard
Introduces the application and links to detailed documentation.

## PageUrlCard
Collects the target URL and initiates ingestion.

## HighlighterTab
Displays highlighted source material.

## AskQuestionTab
Coordinates the question-answering experience.

## AnswerCard
Renders answers together with safety and source-diversity information.

## SourcesCard
Displays cited sources independently of the answer.

## HighlightedPreviewCard
Displays highlighted evidence returned by the proxy endpoint.

## SystemCheckDialog
Performs backend health verification before use.

## HowItWorksDialog
Provides a detailed walkthrough.

## InstructionSection / InstructionStep
Reusable instructional components.

---

# 5. Backend Communication

Only `App.jsx` communicates directly with the backend.

- POST `/api/ingest-urls`
- POST `/api/query`
- GET `/api/health`

Presentation components remain unaware of networking details.

---

# 6. User Interaction Lifecycle

```text
User enters URL
↓
Document ingested
↓
Content chunked
↓
Embeddings generated
↓
Question submitted
↓
Relevant context retrieved
↓
Grounded answer generated
↓
Safety evaluation
↓
Sources displayed
↓
Evidence highlighted
```

---

# 7. Error Handling

The frontend explicitly handles:

- Backend unavailable
- Invalid routing configuration
- Invalid URLs
- Ingestion failures
- Query failures
- Loading states
- Failed health checks

---

# 8. Accessibility

Radix UI provides accessible dialogs and tabs, including keyboard navigation, focus management, and screen-reader-friendly behavior.

---

# 9. Extensibility

The architecture supports future additions including:

- Authentication
- Persistent vector databases
- Multiple documents
- Conversation history
- Streaming responses
- Additional document sources
- User workspaces

---

# 10. Architectural Tradeoffs

- Centralized state keeps behavior predictable.
- Props make dependencies explicit.
- Radix UI provides mature accessibility primitives.
- Presentation remains separate from orchestration.

---

# 11. Evolution

The project evolved from a large `App.jsx` into focused components with clear responsibilities, improving maintainability, extensibility, and readability.

---

# 12. Conclusion

The frontend emphasizes clear ownership, predictable state management, separation of concerns, accessibility, and extensibility. Although built as an MVP, its architecture follows engineering practices intended to support future growth without major restructuring.
