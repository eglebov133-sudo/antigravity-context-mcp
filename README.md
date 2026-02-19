# antigravity-context-mcp

You've been coding with your AI agent for two hours. The feature is almost done. You're in the flow.

Then the context window overflows. The session crashes.

You open a new chat. The agent looks at you like you've never met. *"Hi! How can I help you today?"*

Everything you built together — the decisions, the architecture, the twenty files you touched — gone. You start explaining from scratch. Again.

**This MCP server gives Antigravity its memory back.**

🇷🇺 [Читать на русском](README.ru.md)

---

## How it works

Session crashed. New chat. You type:

> *"continue"*

The agent calls `recall` and gets the task checklist from the last session — what was done, what's in progress, where things stopped.

Need more detail?

> *"show me the details of that session"*

The agent fetches the full context — walkthrough, plan, decisions made.

Want to look back at the week?

> *"show recent sessions"*

You get a list with dates and titles. Pick one — the agent loads details **only for that session**.

Context loads **progressively** — the agent decides how much it needs. Not everything at once, but on demand, like a normal conversation.

## Install

Paste the link to this repo into an Antigravity chat:

> *"install this MCP server: https://github.com/eglebov133-sudo/antigravity-context-mcp"*

The agent will clone it, install dependencies, and configure everything. Restart Antigravity — done.

<details>
<summary>Manual installation</summary>

```bash
git clone https://github.com/eglebov133-sudo/antigravity-context-mcp.git
cd antigravity-context-mcp
npm install
```

Add to `~/.gemini/antigravity/mcp_config.json`:

```json
{
  "mcpServers": {
    "context": {
      "command": "node",
      "args": ["/path/to/antigravity-context-mcp/server.js"]
    }
  }
}
```

Restart Antigravity.

</details>

## What it reads

The server taps into what Antigravity already stores but doesn't use between sessions:

- Task checklists — what's done, what's in progress
- Walkthroughs — summaries of completed work
- Implementation plans — architectural decisions made

All local. No network. Just files on your disk that were always there.

## Beyond context

**Passwords between sessions.** You know the drill — you give the agent your hosting password, the session dies, the next agent asks for it again. The server stores credentials encrypted with AES-256-GCM (key derived from your machine), auto-excluded from Git.

**Persistent notes.** Save code words, instructions, decisions with `save_note` — search them later with `recall_notes`.

**Context snapshots.** The agent can save an `AGENT_CONTEXT.md` into your project — persistent memory that survives any number of crashes.

**Project list.** Shows what Antigravity knows about, so you can switch projects without orientation time.

**Diagnostics.** `context_status` shows server health — sessions, notes, disk usage, encryption status.

## What's new in v4.0

- **🔐 Encrypted credentials** — AES-256-GCM instead of plaintext. Key is machine-bound. Old `.credentials` files auto-migrate.
- **🛡️ Error handling** — every tool wrapped in try/catch with clear error messages. No more silent failures.
- **📏 Response limits** — 50,000 char cap with `[TRUNCATED]` warning. Prevents context window overflow.
- **🩺 Diagnostics** — `context_status` tool shows session count, notes, disk usage, encryption status.
- **✅ Input validation** — path existence checks and session ID format validation before execution.

## Security

- Runs locally via stdio — no open ports, no network
- Read-only by default — writes only when you explicitly ask
- Credentials encrypted with AES-256-GCM, key bound to machine
- Auto-migration from plaintext to encrypted
- Zero telemetry, zero external requests

## Requirements

- Node.js 18+
- Antigravity

## License

MIT

---

*Built because we got tired of introducing ourselves to our own AI agent.*

