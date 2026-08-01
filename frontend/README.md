# Insight Engine Frontend Architecture

This document explains the engineering decisions behind the Insight Engine frontend. Rather than documenting React itself, it describes why the application is structured the way it is, how data flows through the system, and the tradeoffs made during implementation.

The frontend was intentionally designed to remain simple while still following architectural principles appropriate for a production-quality application. Each component has a clearly defined responsibility, application state has a single owner, and the user interface is separated from application orchestration to make future enhancements straightforward.

---

# 1. Design Goals

- Single ownership of application state
- Predictable one-way data flow
- Components with one clearly defined responsibility
- Separation of presentation from orchestration
- Separation of networking from UI (dedicated API layer)
- Accessibility by default
- Minimal coupling between components
- Straightforward extensibility

---

# 2. Directory Structure

```text
frontend/src/
├── api/
│   └── client.js          (all backend communication)
├── components/
│   ├── AboutCard.jsx
│   ├── AnswerCard.jsx
│   ├── AskQuestionTab.jsx
│   ├── ConfirmClearDialog.jsx
│   ├── ErrorDialog.jsx
│   ├── HighlightedPreviewCard.jsx
│   ├── HighlighterTab.jsx
│   ├── HowItWorksDialog.jsx
│   ├── InstructionSection.jsx
│   ├── InstructionStep.jsx
│   ├── PageUrlCard.jsx
│   ├── RoutingErrorNotice.jsx
│   ├── SourcesCard.jsx
│   ├── SuccessDialog.jsx
│   └── SystemCheckDialog.jsx
├── App.jsx
├── App.css
├── main.jsx
└── assets/
```

`api/` is a dedicated networking layer, separate from `components/`, since backend communication is not a UI concern. `components/` holds every presentation component. `App.jsx` and `main.jsx` stay at the `src/` root as entry points.

---

# 3. High-Level Architecture

```text
Browser
    │
    ▼
 App.jsx ──── api/client.js (backend communication)
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
 ├─ ErrorDialog
 ├─ ConfirmClearDialog
 ├─ SuccessDialog
 └─ HowItWorksDialog
      ├─ InstructionSection
      └─ InstructionStep
```

`App.jsx` owns the application's shared state and calls into `api/client.js` for all backend communication. Every other component has a focused presentation responsibility.

---

# 4. State Management Philosophy

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

# 5. Component Responsibilities

## App.jsx
- Owns shared application state
- Calls into `api/client.js` for backend communication
- Manages loading and error state
- Passes data to presentation components

## api/client.js
- Owns all backend communication (ingest, query, health, clear)
- Builds the highlight proxy URL
- Exposes `API_BASE_ERROR` for routing misconfiguration
- Has no knowledge of UI state or rendering

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

## ErrorDialog
Shows a warning-icon modal whenever a backend call fails (ingest, query, health, or clear), rather than surfacing failures only as an easy-to-miss inline status line.

## ConfirmClearDialog
Gates the destructive Clear Store action behind an explicit confirm/cancel step, replacing the native browser `confirm()` dialog so the app stays visually consistent instead of exposing the raw origin/port.

## SuccessDialog
Shows a success-icon modal for actions like Clear Store, where a small inline status line could easily go unnoticed.

## HowItWorksDialog
Provides a detailed walkthrough.

## InstructionSection / InstructionStep
Reusable instructional components.

---

# 6. Backend Communication

All backend communication is isolated to `api/client.js`. `App.jsx` is the only component that imports from it; presentation components remain unaware of networking details entirely.

- POST `/api/ingest-urls`
- POST `/api/query`
- GET `/api/health`
- DELETE `/api/clear`

---

# 7. User Interaction Lifecycle

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

# 8. Error Handling

The frontend explicitly handles:

- Backend unavailable
- Invalid routing configuration
- Invalid URLs
- Ingestion failures
- Query failures
- Loading states
- Failed health checks

---

# 9. Accessibility

Radix UI provides accessible dialogs and tabs, including keyboard navigation, focus management, and screen-reader-friendly behavior.

---

# 10. Extensibility

The architecture supports future additions including:

- Authentication
- Persistent vector databases
- Multiple documents
- Conversation history
- Streaming responses
- Additional document sources
- User workspaces
- Additional API modules under `api/` (e.g. splitting `client.js` into `client.js` + `endpoints.js` as the surface area grows)

---

# 11. Architectural Tradeoffs

- Centralized state keeps behavior predictable.
- Props make dependencies explicit.
- Radix UI provides mature accessibility primitives.
- Presentation remains separate from orchestration.
- A dedicated `api/` folder keeps networking swappable and testable independent of UI code.

---

# 12. Evolution

The project evolved from a large `App.jsx` into focused components with clear responsibilities, and from a flat `src/` directory into a structure with dedicated `api/` and `components/` folders, improving maintainability, extensibility, and readability.

---

# 13. Conclusion

The frontend emphasizes clear ownership, predictable state management, separation of concerns, accessibility, and extensibility. Although built as an MVP, its architecture follows engineering practices intended to support future growth without major restructuring.
