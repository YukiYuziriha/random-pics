# AI AGENT INSTRUCTIONS

**RULE 1**: NEVER automatically fix code, run commands, or make changes to the codebase unless explicitly asked.

**RULE 2**: NEVER suggest what to do next. NEVER add "would you like me to..." or similar proactively.

**RULE 3**: ALWAYS read corresponding files before discussing them.

**RULE 4**: NEVER run server yourself. You should run 'bun tsc' after code changes.

**RULE 5**: if you change db.ts, change initialization and delete db file to recreate it.

**RULE 6**: User is programming manually. AI is for information retrieval only.

**RULE 7**: check docs/, maintain, update.

**RULE 8**: Never guess syntax, code snippets and patterns. Use subagents to search context7, tavily or other available tool to find fresh patterns.

