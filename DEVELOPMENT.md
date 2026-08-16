# Antalya GO — Development Log

This is a public development log for **Antalya GO**, an interactive Go
(Baduk) learning platform, tracking how its deterministic teaching engine
is being extended into an AI-assisted teacher.

The central design principle across every version below is unchanged:

> **The LLM is never the source of Go truth.** Board state, rule
> legality, and pedagogical correctness are always computed by the
> deterministic engine (`core/ruleEngine.js`, `core/actionHandler.js`,
> `core/lessonEngine.js`). The LLM only turns already-verified engine
> output into a short pedagogical message, or requests a narrow,
> permission-checked teaching action. It never invents coordinates, never
> recalculates a Go rule, and never writes to the board directly.

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ | Completed and deployed to production (antalyago.net) |
| 🧪 | Completed, tested (unit + browser), not yet deployed |
| 📝 | Planned — not started |

---

## v0.1 — Deterministic Teaching Foundation

**Status:** ✅ Completed and deployed (predates this log — the entire
project history up to the Teacher Lab work below constitutes this
version; there is no single milestone commit to point to).

**Architectural goal:** Build a complete, correct, LLM-free Go learning
engine: a 3D board renderer, a real rule engine (captures, ko, suicide),
a lesson/curriculum system, and pedagogical feedback — all deterministic
and unit-testable without any network dependency.

**Main changes:**
- `core/boardState.js`, `core/ruleEngine.js` — board representation and
  Go rules (groups, liberties, captures, ko, suicide).
- `core/lessonEngine.js`, `core/curriculum.js` — step-by-step lesson
  state machine and the full Turkish-language curriculum data (B1–B3:
  temel kurallar → temel teknikler → strateji).
- `core/actionHandler.js` — single entry point translating student
  actions into a renderer-agnostic `effects[]` instruction stream.
- `core/pedagogyEngine.js` — pattern analysis and static pedagogical
  feedback (`fb_ok`/`fb_err`, liberty highlighting).
- `ogren-3d.html` — the 3D board engine and student-facing UI consuming
  `effects[]`.

**Safety boundaries:** N/A — no AI involved at this stage. This version
*is* the safety boundary that every later version is validated against.

**Commit:** predates this log; see full repository history.

---

## v0.2 — Teacher Lab / Observation Layer

**Status:** ✅ Completed and deployed.

**Architectural goal:** Before adding any AI, build an **offline,
deterministic observation layer** — a debug/observation sidebar (Teacher
Panel) that surfaces exactly what the engine is doing (lesson/step state,
board state, atari/capture detection, event log) without touching the
existing rule/lesson code. This becomes the substrate the LLM layer
(v0.3+) later reads from.

**Main changes:**
- `core/eventLog.js` — pure, DOM-free event log (`EventLog` class,
  `createEvent`), persisted via a small `teacherLogStorage` adapter kept
  strictly *outside* `core/` (localStorage never touches core logic).
- `core/captureObservation.js` — pure atari/group detection built only on
  existing `getGroup`/`getLiberties` primitives (`findAtariGroups`,
  `isPointInAtari`).
- `core/teacherPanelBridge.js` — translates `ActionHandler` action/result
  pairs into a Teacher Panel view-model and normalized semantic events
  (`atari_detected`, `capture_attempt`, `capture_completed`), derived
  from the *real* `REMOVE_STONES` effect and board transition — never
  from curriculum-asserted "expected answer" data.
- `core/actionHandler.js` — additive `legal` field (rule-illegal vs.
  curriculum-wrong are now distinguishable) and a new
  `SHOW_LIBERTIES_REQUEST` action reusing the existing
  `SHOW_LIBERTY_HIGHLIGHTS` effect.
- Teacher Panel UI in `ogren-3d.html`: 14 read-only observation fields +
  7 manual teacher tools (reload step, show liberties, hint, next/prev,
  clear board, clear log), hidden by default behind a `🎓` tab or
  `?teacher=1`.

**Safety boundaries:**
- Zero coupling between `core/*.js` and `localStorage`/DOM — persistence
  lives only in the browser-side bridge.
- No new capture/rule logic — 100% reuse of existing `ruleEngine.js`
  primitives.
- No curriculum rewrites; existing Turkish pedagogical text reused as-is.

**Commit:** [`ece0bcd`](https://github.com/Marfg/antalyago/commit/ece0bcda078585911933ca7a70a40c80f4e93461) — *"Teacher Lab ve AI öğretmen asistanını ekle"* (shared with v0.3, deployed together as one milestone).

---

## v0.3 — LLM Teacher

**Status:** ✅ Completed and deployed.

**Architectural goal:** Introduce the first LLM layer as a strictly
downstream *interpreter* of deterministic state:

```
Deterministic Go Engine → Structured Teacher Context → LLM →
Validated Teacher Response → Student message
```

with a hard guarantee: **AI off → the app works exactly as before. AI on
and failing → deterministic feedback is used instead.** The AI is never
a required dependency.

**Main changes:**
- `core/teacherContext.js` — pure builder turning lesson/board/action/
  result state into a small JSON context (`lesson`, `student.attempt`,
  `task`, `action`, `evaluation`, `boardObservation`) — reuses v0.2's
  atari detection, never re-derives it.
- `core/teacherResponseSchema.js` — strict validation of the LLM's
  structured output (`action` ∈ {`say`,`give_hint`}, message
  type/length/hint-level checks); handles the observed real-world case of
  Claude wrapping JSON in a markdown code fence.
- `core/teacherSystemPrompt.js` — single-source system prompt (Turkish,
  "nefes noktası" terminology enforced, coordinate-leaking forbidden).
- `core/mockTeacherProvider.js` / `core/claudeTeacherProvider.js` —
  interchangeable providers behind one contract
  (`{name, generateTeacherResponse(context)}`); `TeacherAssistant` never
  knows which one is active.
- `core/teacherAssistant.js` — orchestrator implementing the
  request → validate → fallback chain, plus the "only call the LLM on a
  real evaluation" gate (`shouldRequestTeacherResponse`).
- `scripts/ai/teacher-proxy.mjs` — a small localhost-only Node proxy
  holding `ANTHROPIC_API_KEY`; the browser never sees the key.
- Teacher Panel "AI Öğretmen" section: mode, provider, context, raw
  response, message source (AI vs. fallback), error, plus manual AI
  controls (toggle, retry, approve/reject).

**Safety boundaries:**
- API key never enters the browser bundle — only a localhost dev proxy
  holds it.
- Every AI failure mode (network error, malformed JSON, invalid schema)
  falls back to the existing deterministic feedback; verified live
  against the real Claude API with the proxy intentionally killed.
- AI never produces `effects[]` directly — only a short message.

**Commit:** [`ece0bcd`](https://github.com/Marfg/antalyago/commit/ece0bcda078585911933ca7a70a40c80f4e93461) — *"Teacher Lab ve AI öğretmen asistanını ekle"* (shared with v0.2).

---

## v0.4 — Teacher Tools

**Status:** 🧪 Completed and tested locally (unit tests + real-browser
verification, including against the live Claude API); **not yet
committed/deployed to production.**

**Architectural goal:** Let the LLM request a small set of *named*
teaching tools instead of only talking — without ever letting it become
the source of board coordinates:

```
LLM → {"tool": "show_liberties"}  (name only)
   → Teacher Tool Router → permission check → real board observation
   → existing SHOW_LIBERTY_HIGHLIGHTS effect
```

**Main changes:**
- `core/teacherToolRouter.js` — pure router. `say`/`give_hint` pass
  straight through; `show_liberties` is validated against real lesson/
  step/board state (via v0.2's `primaryAtariGroup`) and only then turned
  into the existing `SHOW_LIBERTY_HIGHLIGHTS` effect. Four rejection
  reasons: `no_target_group`, `not_allowed_for_step`, `invalid_context`,
  `unsupported_tool`.
- `core/teacherResponseSchema.js` — extended action enum
  (`+show_liberties`) plus a strict guard rejecting any response
  containing `points`/`coordinates`/`targets` fields, regardless of
  action.
- `core/teacherSystemPrompt.js` / `core/mockTeacherProvider.js` —
  graduated-help pedagogy: attempt 1–2 → verbal hint, attempt 3+ (only if
  a real target exists) → `show_liberties`.
- Teacher Panel "Teacher Tool" section: requested tool, allowed (Y/N),
  rejection reason, generated effect, target count, execution result
  (`applied`/`rejected`).
- New event types: `teacher_tool_requested`, `teacher_tool_allowed`,
  `teacher_tool_rejected`, `teacher_tool_applied`.

**Safety boundaries:**
- Three independent layers keep the LLM from ever supplying a coordinate:
  the system prompt forbids it, the response schema rejects any
  coordinate-shaped field, and the router itself never reads coordinates
  out of the LLM's response — it recomputes the target from the live
  board.
- Rejected tool requests never touch `effects[]`; the lesson continues
  uninterrupted.
- Verified live against the real Claude API: the model naturally followed
  the attempt-based escalation and requested `show_liberties` with zero
  coordinates in its response.

**Commit:** not yet committed — pending an explicit deploy instruction.

---

## v0.5 — Student Model

**Status:** 📝 Planned.

**Architectural goal:** Give the deterministic layer (not the LLM) a
lightweight, session/local-scoped model of how a specific student is
doing on the current micro-curriculum — attempt patterns, concept
strengths/gaps — so both the deterministic fallback and the AI Teacher
context can adapt without the LLM inventing student history.

**Main changes (planned):** a small, pure `core/studentModel.js`
extending the existing per-step `mistakeCount` into a persisted,
concept-level summary (reusing `core/learningContext.js`'s existing
`concepts`/`stage` classification); a `student` field expansion in
`core/teacherContext.js`.

**Safety boundaries (intended):** local-only, session/device-scoped —
explicitly *not* a long-term cross-device profile; no data leaves the
device; still LLM-read-only (the model informs the context, the LLM
still cannot write to it).

**Commit:** not started.

---

## v0.6 — RAG

**Status:** 📝 Planned.

**Architectural goal:** Ground the AI Teacher's explanations in curated
Go teaching material (beyond the compact system prompt) for the parts of
the curriculum where a short prompt isn't enough — while preserving the
same non-negotiable rule: retrieved text may inform *phrasing*, never
board truth.

**Main changes (planned):** a retrieval step between
`teacherContext.js` and the provider call; explicitly out of scope for
every version up to v0.4, first design pass not yet started.

**Safety boundaries (intended):** retrieval augments pedagogical
language only; board state, legality, and captures remain 100%
deterministic-engine-sourced, unaffected by retrieval content.

**Commit:** not started.

---

## v0.7 — Curriculum Expansion

**Status:** 📝 Planned.

**Architectural goal:** Extend the AI Teacher (context, tool router,
system prompt) beyond the current micro-curriculum (liberties → atari →
capture) to the rest of the existing curriculum data already in
`core/curriculum.js` — ko, forbidden moves, connection/cutting, ladders,
nets, snapback, life & death, opening/midgame/endgame — using the same
tool-routing pattern established in v0.4.

**Main changes (planned):** per-concept `boardObservation` builders
alongside the existing atari/capture one; additional narrowly-scoped
tools following the v0.4 permission-router pattern (e.g. a future
`show_ko_point`), each independently reviewed for the same
LLM-never-sources-truth guarantee.

**Safety boundaries (intended):** identical to v0.4 — every new tool
must pass through a router that derives its target from the
deterministic engine, never from the LLM's response.

**Commit:** not started.
