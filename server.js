import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import os from "os";

// ─── Paths ────────────────────────────────────────────────────────────────────
const ANTIGRAVITY_DIR = path.join(os.homedir(), ".gemini", "antigravity");
const BRAIN_DIR = path.join(ANTIGRAVITY_DIR, "brain");
const KNOWLEDGE_DIR = path.join(ANTIGRAVITY_DIR, "knowledge");
const CODE_TRACKER_DIR = path.join(ANTIGRAVITY_DIR, "code_tracker", "active");
const CREDENTIALS_FILENAME = ".credentials";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

/** Get all brain folders sorted by mtime descending, with artifact info */
function getBrainFoldersSorted() {
  if (!fs.existsSync(BRAIN_DIR)) return [];
  return fs
    .readdirSync(BRAIN_DIR)
    .filter((name) => {
      const full = path.join(BRAIN_DIR, name);
      return fs.statSync(full).isDirectory() && name !== "tempmediaStorage";
    })
    .map((name) => {
      const full = path.join(BRAIN_DIR, name);
      const artifactFiles = ["task.md", "walkthrough.md", "implementation_plan.md"];
      const hasArtifacts = artifactFiles.some((f) => {
        const content = readFileSafe(path.join(full, f));
        return content.trim().length > 0;
      });
      return { name, full, mtime: fs.statSync(full).mtimeMs, hasArtifacts };
    })
    .filter((f) => f.hasArtifacts)
    .sort((a, b) => b.mtime - a.mtime);
}

/** Extract first meaningful line from task.md as a title */
function extractTitle(folderPath) {
  const taskContent = readFileSafe(path.join(folderPath, "task.md"));
  if (!taskContent.trim()) {
    const planContent = readFileSafe(path.join(folderPath, "implementation_plan.md"));
    const firstLine = planContent.split(/\r?\n/).find((l) => l.trim().startsWith("#"));
    return firstLine ? firstLine.replace(/^#+\s*/, "").trim() : "Untitled session";
  }
  const firstHeading = taskContent.split(/\r?\n/).find((l) => l.trim().startsWith("#"));
  if (firstHeading) return firstHeading.replace(/^#+\s*/, "").trim();
  const firstLine = taskContent.split(/\r?\n/).find((l) => l.trim().length > 0);
  return firstLine ? firstLine.trim().slice(0, 80) : "Untitled session";
}

/** Read only task.md from a brain folder */
function readTaskOnly(folderPath) {
  return readFileSafe(path.join(folderPath, "task.md"));
}

/** Read all artifacts from a brain folder (full content) */
function readAllArtifacts(folderPath) {
  const files = ["task.md", "walkthrough.md", "implementation_plan.md", "session_notes.md"];
  const results = {};
  for (const file of files) {
    const content = readFileSafe(path.join(folderPath, file));
    if (content.trim()) results[file] = content;
  }
  return results;
}

/** Append a note to session_notes.md in a brain folder */
function appendNote(folderPath, note, tag) {
  const filePath = path.join(folderPath, "session_notes.md");
  const now = new Date().toISOString().replace("T", " ").slice(0, 16);
  const tagStr = tag ? ` #${tag}` : "";
  const entry = `### [${now}]${tagStr}\n${note}\n\n---\n\n`;
  // Create header if file doesn't exist
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `# Session Notes\n\n${entry}`, "utf8");
  } else {
    fs.appendFileSync(filePath, entry, "utf8");
  }
  return filePath;
}

/** Search notes across brain folders */
function searchNotes(query, tag, lastN = 5) {
  const folders = getBrainFoldersSorted().slice(0, lastN);
  const results = [];
  for (const folder of folders) {
    const notesPath = path.join(folder.full, "session_notes.md");
    const content = readFileSafe(notesPath);
    if (!content.trim()) continue;
    // Split into individual notes by --- separator
    const entries = content.split(/^---$/m).map((e) => e.trim()).filter(Boolean);
    for (const entry of entries) {
      if (entry.startsWith("# Session Notes")) continue;
      const matchesQuery = !query || entry.toLowerCase().includes(query.toLowerCase());
      const matchesTag = !tag || entry.includes(`#${tag}`);
      if (matchesQuery && matchesTag) {
        const title = extractTitle(folder.full);
        const date = new Date(folder.mtime).toISOString().slice(0, 10);
        results.push({ sessionId: folder.name, date, title, entry });
      }
    }
  }
  return results;
}

/** Check if a brain folder's artifacts mention a given project path or name */
function matchesProject(folderPath, projectPath) {
  if (!projectPath) return true;
  const normalized = projectPath.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  const projectName = normalized.split("/").pop();
  const files = ["task.md", "implementation_plan.md", "walkthrough.md"];
  for (const file of files) {
    const content = readFileSafe(path.join(folderPath, file)).toLowerCase();
    if (content.includes(normalized) || content.includes(projectName)) return true;
  }
  return false;
}

function listKnownProjects() {
  if (!fs.existsSync(CODE_TRACKER_DIR)) return [];
  return fs
    .readdirSync(CODE_TRACKER_DIR)
    .filter((d) => fs.statSync(path.join(CODE_TRACKER_DIR, d)).isDirectory())
    .map((d) => ({
      project: d.split("_")[0],
      tracker_key: d,
      file_count: fs.readdirSync(path.join(CODE_TRACKER_DIR, d)).length,
    }));
}

function readCredentials(projectPath) {
  const filePath = path.join(projectPath, CREDENTIALS_FILENAME);
  const content = readFileSafe(filePath);
  if (!content.trim()) return null;
  const creds = {};
  let currentSection = "general";
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      currentSection = trimmed.replace(/^#+\s*/, "");
      continue;
    }
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!creds[currentSection]) creds[currentSection] = {};
      creds[currentSection][key] = value;
    }
  }
  return creds;
}

function writeCredentials(projectPath, entries) {
  const filePath = path.join(projectPath, CREDENTIALS_FILENAME);
  let content = "# Credentials — managed by Antigravity Context MCP\n";
  content += "# DO NOT commit this file to Git!\n\n";
  for (const [section, pairs] of Object.entries(entries)) {
    content += `# ${section}\n`;
    for (const [key, value] of Object.entries(pairs)) {
      content += `${key}=${value}\n`;
    }
    content += "\n";
  }
  fs.writeFileSync(filePath, content, "utf8");
  const gitignorePath = path.join(projectPath, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, "utf8");
    if (!gitignore.includes(CREDENTIALS_FILENAME)) {
      fs.appendFileSync(gitignorePath, `\n# Credentials (auto-added)\n${CREDENTIALS_FILENAME}\n`, "utf8");
    }
  }
  return filePath;
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: "antigravity-context", version: "3.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "recall",
      description:
        "Quick recall: returns ONLY the task checklist (task.md) from the most recent session. Lightweight, won't overload context. Use when user says 'continue', 'продолжи', 'what were we doing'. If you need more detail, follow up with recall_session. By default filters to current project if project_path is provided.",
      inputSchema: {
        type: "object",
        properties: {
          project_path: {
            type: "string",
            description: "Optional. Absolute path to the current project directory. When provided, only sessions mentioning this project are returned.",
          },
        },
      },
    },
    {
      name: "recall_sessions",
      description:
        "List recent sessions with dates and titles. Returns a compact index so you can pick which session to drill into. Use when user wants a broader view: 'what have we been working on', 'покажи сессии'. By default filters to current project if project_path is provided. Use all_projects=true to see everything.",
      inputSchema: {
        type: "object",
        properties: {
          count: {
            type: "number",
            description: "How many sessions to list (default: 10, max: 20)",
          },
          project_path: {
            type: "string",
            description: "Optional. Absolute path to the current project directory. When provided, only sessions mentioning this project are returned.",
          },
          all_projects: {
            type: "boolean",
            description: "Optional. If true, show sessions from ALL projects regardless of project_path. Use when user explicitly asks about other projects.",
          },
        },
      },
    },
    {
      name: "recall_session",
      description:
        "Get FULL details of a specific session by its ID (from recall_sessions). Returns task.md, walkthrough.md, and implementation_plan.md without truncation.",
      inputSchema: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "Session ID from recall_sessions list",
          },
        },
        required: ["session_id"],
      },
    },
    {
      name: "list_projects",
      description: "List all known projects tracked by Antigravity.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_credentials",
      description:
        "Read saved credentials (.credentials file) from the project directory.",
      inputSchema: {
        type: "object",
        properties: {
          project_path: { type: "string", description: "Absolute path to the project directory" },
        },
        required: ["project_path"],
      },
    },
    {
      name: "save_credentials",
      description:
        "Save credentials to .credentials file in the project directory. Auto-adds to .gitignore.",
      inputSchema: {
        type: "object",
        properties: {
          project_path: { type: "string", description: "Absolute path to the project directory" },
          credentials: {
            type: "object",
            description: 'Sections with key-value pairs. Example: {"Hosting": {"LOGIN": "user", "PASSWORD": "pass"}}',
          },
        },
        required: ["project_path", "credentials"],
      },
    },
    {
      name: "save_context_file",
      description: "Write AGENT_CONTEXT.md into the project directory.",
      inputSchema: {
        type: "object",
        properties: {
          project_path: { type: "string", description: "Absolute path to the project directory" },
          context_text: { type: "string", description: "Markdown content to write" },
        },
        required: ["project_path", "context_text"],
      },
    },
    {
      name: "save_note",
      description:
        "Save an important note from the conversation (code words, instructions, decisions, credentials). Use this WHENEVER the user says 'запомни', 'remember', or shares something important that should persist across sessions. Notes are stored in session_notes.md in the brain folder.",
      inputSchema: {
        type: "object",
        properties: {
          note: { type: "string", description: "The note text to save" },
          tag: {
            type: "string",
            description: "Optional tag: codeword, instruction, decision, credential, todo",
          },
          session_id: {
            type: "string",
            description: "Optional session ID. If omitted, saves to the most recent session.",
          },
        },
        required: ["note"],
      },
    },
    {
      name: "recall_notes",
      description:
        "Search saved notes across sessions. Use when user asks about code words, past instructions, or saved information. Returns matching notes with dates and session context.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text to search for in notes" },
          tag: { type: "string", description: "Filter by tag: codeword, instruction, decision, credential, todo" },
          last_n: { type: "number", description: "How many recent sessions to search (default: 5, max: 20)" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // ── recall (task.md only from last session) ────────────────────────────────
  if (name === "recall") {
    const projectPath = args?.project_path || null;
    let folders = getBrainFoldersSorted();
    if (projectPath) {
      folders = folders.filter((f) => matchesProject(f.full, projectPath));
    }
    if (folders.length === 0) {
      return { content: [{ type: "text", text: projectPath ? `No recent sessions found for project: ${projectPath}` : "No recent sessions found." }] };
    }

    const last = folders[0];
    const task = readTaskOnly(last.full);
    const notes = readFileSafe(path.join(last.full, "session_notes.md"));
    const date = new Date(last.mtime).toISOString().slice(0, 10);

    let text = `# Last Session (${date})\n**ID:** ${last.name}\n\n`;
    if (task) {
      text += task;
    } else {
      text += "_No task.md found. Use recall_session to get other artifacts._";
    }
    if (notes.trim()) {
      text += `\n\n## Notes\n${notes}`;
    }
    text += `\n\n_Need more detail? Call recall_session with ID: ${last.name}_`;

    return { content: [{ type: "text", text }] };
  }

  // ── recall_sessions (compact index) ────────────────────────────────────────
  if (name === "recall_sessions") {
    const count = Math.min(args?.count ?? 10, 20);
    const projectPath = args?.project_path || null;
    const allProjects = args?.all_projects === true;
    let allFolders = getBrainFoldersSorted();
    if (projectPath && !allProjects) {
      allFolders = allFolders.filter((f) => matchesProject(f.full, projectPath));
    }
    const folders = allFolders.slice(0, count);

    if (folders.length === 0) {
      return { content: [{ type: "text", text: "No sessions with artifacts found." }] };
    }

    let text = "# Recent Sessions\n\n";
    text += "| # | Date | Title | ID |\n";
    text += "|---|------|-------|----|\n";

    folders.forEach((f, i) => {
      const date = new Date(f.mtime).toISOString().slice(0, 10);
      const title = extractTitle(f.full);
      text += `| ${i + 1} | ${date} | ${title} | \`${f.name}\` |\n`;
    });

    text += "\n_Use recall_session(session_id) to get full details of any session._";

    return { content: [{ type: "text", text }] };
  }

  // ── recall_session (full details of one session) ───────────────────────────
  if (name === "recall_session") {
    const sessionId = args.session_id;
    const folderPath = path.join(BRAIN_DIR, sessionId);

    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      return { content: [{ type: "text", text: `Session not found: ${sessionId}` }] };
    }

    const artifacts = readAllArtifacts(folderPath);
    if (Object.keys(artifacts).length === 0) {
      return { content: [{ type: "text", text: `No artifacts in session: ${sessionId}` }] };
    }

    let text = `# Session: ${sessionId}\n\n`;
    if (artifacts["task.md"]) {
      text += `## Tasks\n${artifacts["task.md"]}\n\n`;
    }
    if (artifacts["session_notes.md"]) {
      text += `## Notes\n${artifacts["session_notes.md"]}\n\n`;
    }
    if (artifacts["walkthrough.md"]) {
      text += `## Walkthrough\n${artifacts["walkthrough.md"]}\n\n`;
    }
    if (artifacts["implementation_plan.md"]) {
      text += `## Implementation Plan\n${artifacts["implementation_plan.md"]}\n\n`;
    }

    return { content: [{ type: "text", text }] };
  }

  // ── list_projects ──────────────────────────────────────────────────────────
  if (name === "list_projects") {
    const projects = listKnownProjects();
    const text = projects
      .map((p) => `- **${p.project}** (${p.file_count} tracked files)`)
      .join("\n");
    return {
      content: [{ type: "text", text: `# Known Projects\n\n${text || "_None found_"}` }],
    };
  }

  // ── get_credentials ────────────────────────────────────────────────────────
  if (name === "get_credentials") {
    const creds = readCredentials(args.project_path);
    if (!creds) {
      return {
        content: [{ type: "text", text: `📭 No .credentials file in ${args.project_path}` }],
      };
    }
    let text = `# Credentials\n\n`;
    for (const [section, pairs] of Object.entries(creds)) {
      text += `## ${section}\n`;
      for (const [key, value] of Object.entries(pairs))
        text += `- **${key}**: ${value}\n`;
      text += "\n";
    }
    return { content: [{ type: "text", text }] };
  }

  // ── save_credentials ───────────────────────────────────────────────────────
  if (name === "save_credentials") {
    try {
      const filePath = writeCredentials(args.project_path, args.credentials);
      return {
        content: [{ type: "text", text: `✅ Saved to: ${filePath} (auto-added to .gitignore)` }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `❌ Error: ${err.message}` }] };
    }
  }

  // ── save_context_file ──────────────────────────────────────────────────────
  if (name === "save_context_file") {
    try {
      const filePath = path.join(args.project_path, "AGENT_CONTEXT.md");
      fs.writeFileSync(filePath, args.context_text, "utf8");
      return { content: [{ type: "text", text: `✅ Saved to: ${filePath}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `❌ Error: ${err.message}` }] };
    }
  }

  // ── save_note ──────────────────────────────────────────────────────────────
  if (name === "save_note") {
    try {
      let folderPath;
      if (args.session_id) {
        folderPath = path.join(BRAIN_DIR, args.session_id);
      } else {
        const folders = getBrainFoldersSorted();
        if (folders.length === 0) {
          return { content: [{ type: "text", text: "❌ No sessions found to save note to." }] };
        }
        folderPath = folders[0].full;
      }
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      const filePath = appendNote(folderPath, args.note, args.tag);
      const tag = args.tag ? ` [#${args.tag}]` : "";
      return {
        content: [{ type: "text", text: `✅ Note saved${tag}: ${filePath}` }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `❌ Error: ${err.message}` }] };
    }
  }

  // ── recall_notes ───────────────────────────────────────────────────────────
  if (name === "recall_notes") {
    const lastN = Math.min(args?.last_n ?? 5, 20);
    const results = searchNotes(args?.query, args?.tag, lastN);
    if (results.length === 0) {
      return {
        content: [{ type: "text", text: "📭 No notes found." + (args?.query ? ` Query: "${args.query}"` : "") }],
      };
    }
    let text = `# Found ${results.length} note(s)\n\n`;
    for (const r of results) {
      text += `**Session:** ${r.title} (${r.date}) \`${r.sessionId}\`\n`;
      text += r.entry + "\n\n---\n\n";
    }
    return { content: [{ type: "text", text }] };
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("✅ Antigravity Context MCP Server v3.0 running\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});
