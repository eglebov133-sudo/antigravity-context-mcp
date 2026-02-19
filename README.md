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

The agent calls `recall`, reads the last task — what was done, what's in progress, what was planned — and picks up where it left off.

Need a broader picture?

> *"what have we been working on this week?"*

The agent calls `recall_all` — last few sessions plus accumulated project knowledge.

No paths, no arguments, no commands. Just talk.

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

The response is capped at ~4000 characters — so it won't overload the new session with the same volume that crashed the previous one.

## Beyond context

**Passwords between sessions.** You know the drill — you give the agent your hosting password, the session dies, the next agent asks for it again. The server stores credentials in a `.credentials` file in your project, auto-excluded from Git.

**Context snapshots.** The agent can save an `AGENT_CONTEXT.md` into your project — persistent memory that survives any number of crashes.

**Project list.** Shows what Antigravity knows about, so you can switch projects without orientation time.

## Security

- Runs locally via stdio — no open ports, no network
- Read-only by default — writes only when you explicitly ask
- Credentials stay on your machine, auto-excluded from Git
- Zero telemetry, zero external requests

## Requirements

- Node.js 18+
- Antigravity

## License

MIT

---

*Built because we got tired of introducing ourselves to our own AI agent.*
