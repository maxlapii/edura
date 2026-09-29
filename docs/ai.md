# AI assistant

The AI layer is an **assistant on top of the system**, never the system itself.

```
User → Edura AI → Authentication → Permission check → Intent (model) → Approved tool → Business logic → DB → Result → Answer
```

* `lib/ai/client.ts` — Anthropic client (`ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL`).
* `lib/ai/tools.ts` — the registry of approved tools. Each tool declares a Zod input schema, the permissions it
  needs and an `execute(user, input)` that calls an existing module service — so every tool call goes through
  the same permission and school-scope checks as the UI. There is no raw SQL and no write tool.
* `modules/ai/service.ts` — `chat` (agentic loop with tools), `draftLessonPlan`, `draftParentMessage`,
  `rewriteText`, `summarizeStudentProgress`, `summarizeMeeting`, `answerAdminQuestion`. Drafts are returned to
  the user for editing; nothing is saved or sent by the AI.
* Routes under `app/api/ai/*`, UI at `/ai` (chat + drafting tools). Lesson plan pages can request an AI draft.

## Safety rules

1. Respect permissions — tools are filtered by role (`toolsForUser`), services re-check.
2. Use approved tools only; never execute arbitrary SQL.
3. Never silently change records — the AI has no write tools; consequential actions stay with the user.
4. Clearly distinguish database facts (tool results) from generated suggestions (system prompt + UI labels).
5. Every AI call is audited (`ai.*` actions) with the tools that were invoked.

Without `ANTHROPIC_API_KEY` the assistant is disabled and the UI says so; everything else keeps working.
