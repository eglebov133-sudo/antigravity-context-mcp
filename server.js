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

// ─── Config ───────────────────────────────────────────────────────────────────
const MAX_CHARS_PER_ARTIFACT = 1500;
const MAX_TOTAL_CHARS = 4000;
const CREDENTIALS_FILENAME = ".credentials";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

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
      return { name, full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function readBrainArtifacts(folderPath) {
  const files = ["task.md", "walkthrough.md", "implementation_plan.md"];
  const results = {};
  for (const file of files) {
    const content = readFileSafe(path.join(folderPath, file));
    if (content.trim()) {
      results[file] = content.slice(0, MAX_CHARS_PER_ARTIFACT);
    }
  }
  return results;
}

function getRelevantKnowledgeItems() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) return [];
  const items = [];
  const kiDirs = fs.readdirSync(KNOWLEDGE_DIR).filter((d) => {
    if (d === "knowledge.lock") return false;
    const full = path.join(KNOWLEDGE_DIR, d);
    return fs.existsSync(full) && fs.statSync(full).isDirectory();
  });

  for (const kiDir of kiDirs) {
    const metaPath = path.join(KNOWLEDGE_DIR, kiDir, "metadata.json");
    const meta = readFileSafe(metaPath);
    if (!meta) continue;
    try {
      const parsed = JSON.parse(meta);
      items.push({ name: kiDir, summary: parsed.summary || "" });
    } catch {
      items.push({ name: kiDir, summary: "" });
    }
  }
  return items;
}

function listKnownProjects() {
  if (!fs.existsSync(CODE_TRACKER_DIR)) return [];
  return fs
    .readdirSync(CODE_TRACKER_DIR)
    .filter((d) => fs.statSync(path.join(CODE_TRACKER_DIR, d)).isDirectory())
    .map((d) => {
      const repoName = d.split("_")[0];
      const files = fs.readdirSync(path.join(CODE_TRACKER_DIR, d));
      return {
        project: repoName,
        tracker_key: d,
        file_count: files.length,
        sample_files: files.slice(0, 3).map((f) => f.replace(/^[a-f0-9]+_/, "")),
      };
    });
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

/** Build context output with total character limit */
function buildContext(sessions, includeKI) {
  let output = "";
  let totalChars = 0;

  for (const session of sessions) {
    const modDate = new Date(session.mtime).toISOString().slice(0, 10);
    let block = `### Session (${modDate})\n`;

    if (session.artifacts["task.md"]) {
      block += `**Tasks:**\n${session.artifacts["task.md"]}\n`;
    }
    if (session.artifacts["walkthrough.md"]) {
      block += `**Walkthrough:**\n${session.artifacts["walkthrough.md"]}\n`;
    }
    if (session.artifacts["implementation_plan.md"]) {
      block += `**Plan:**\n${session.artifacts["implementation_plan.md"]}\n`;
    }

    if (totalChars + block.length > MAX_TOTAL_CHARS) {
      block = block.slice(0, MAX_TOTAL_CHARS - totalChars) + "\n...(truncated)\n";
      output += block;
      break;
    }

    output += block + "\n";
    totalChars += block.length;
  }

  if (includeKI) {
    const kiItems = getRelevantKnowledgeItems();
    if (kiItems.length > 0) {
      const kiBlock = "\n## Knowledge Items\n" +
        kiItems.slice(0, 5).map((ki) => `- **${ki.name}**: ${(ki.summary).slice(0, 150)}`).join("\n");
      output += kiBlock;
    }
  }

  return output;
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: "antigravity-context", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "recall",
      description:
        "Recall the last task from the most recent Antigravity session. Use when the user says things like 'continue', 'what were we doing', 'продолжи', 'что мы делали'. No arguments required — returns the last session's tasks, walkthrough, and plan. This is the most commonly needed tool.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "recall_all",
      description:
        "Recall context from the last N Antigravity sessions plus knowledge items. Use when the user wants a broader picture: 'show full context', 'покажи весь контекст', 'что мы делали на этой неделе'. Project path is optional — if omitted, returns the most recent sessions regardless of project.",
      inputSchema: {
        type: "object",
        properties: {
          project_path: {
            type: "string",
            description: "Optional. Absolute path to the project directory. If omitted, returns recent sessions globally.",
          },
          last_n_sessions: {
            type: "number",
            description: "How many recent sessions to include (default: 3, max: 10)",
          },
        },
      },
    },
    {
      name: "list_projects",
      description: "List all known projects tracked by Antigravity.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_credentials",
      description:
        "Read saved credentials (.credentials file) from the project directory. Returns passwords, API keys, SSH logins that persist between sessions.",
      inputSchema: {
        type: "object",
        properties: {
          project_path: {
            type: "string",
            description: "Absolute path to the project directory",
          },
        },
        required: ["project_path"],
      },
    },
    {
      name: "save_credentials",
      description:
        "Save credentials to .credentials file in the project directory. Automatically adds to .gitignore.",
      inputSchema: {
        type: "object",
        properties: {
          project_path: {
            type: "string",
            description: "Absolute path to the project directory",
          },
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
      description:
        "Write an AGENT_CONTEXT.md file into the project directory with a context snapshot.",
      inputSchema: {
        type: "object",
        properties: {
          project_path: {
            type: "string",
            description: "Absolute path to the project directory",
          },
          context_text: {
            type: "string",
            description: "Markdown content to write into AGENT_CONTEXT.md",
          },
        },
        required: ["project_path", "context_text"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // ── recall (last task only) ────────────────────────────────────────────────
  if (name === "recall") {
    const brainFolders = getBrainFoldersSorted();

    // Find the most recent folder with actual artifacts
    for (const folder of brainFolders.slice(0, 10)) {
      const artifacts = readBrainArtifacts(folder.full);
      if (Object.keys(artifacts).length > 0) {
        const output = buildContext([{ ...folder, artifacts }], false);
        return {
          content: [{ type: "text", text: `# Last Session\n\n${output}` }],
        };
      }
    }

    return {
      content: [{ type: "text", text: "No recent sessions with artifacts found." }],
    };
  }

  // ── recall_all ─────────────────────────────────────────────────────────────
  if (name === "recall_all") {
    const lastN = Math.min(args?.last_n_sessions ?? 3, 10);
    const brainFolders = getBrainFoldersSorted().slice(0, lastN * 3);

    const sessions = [];
    for (const folder of brainFolders) {
      if (sessions.length >= lastN) break;
      const artifacts = readBrainArtifacts(folder.full);
      if (Object.keys(artifacts).length > 0) {
        sessions.push({ ...folder, artifacts });
      }
    }

    if (sessions.length === 0) {
      return {
        content: [{ type: "text", text: "No recent sessions with artifacts found." }],
      };
    }

    const output = buildContext(sessions, true);
    return {
      content: [{ type: "text", text: `# Context (${sessions.length} sessions)\n\n${output}` }],
    };
  }

  // ── list_projects ──────────────────────────────────────────────────────────
  if (name === "list_projects") {
    const projects = listKnownProjects();
    const text = projects
      .map((p) => `- **${p.project}** (${p.file_count} files): ${p.sample_files.join(", ")}`)
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
        content: [{
          type: "text",
          text: `📭 No .credentials file in ${args.project_path}\n\nUse save_credentials to store passwords.`,
        }],
      };
    }
    let text = `# Credentials: ${args.project_path}\n\n`;
    for (const [section, pairs] of Object.entries(creds)) {
      text += `## ${section}\n`;
      for (const [key, value] of Object.entries(pairs)) {
        text += `- **${key}**: ${value}\n`;
      }
      text += "\n";
    }
    return { content: [{ type: "text", text }] };
  }

  // ── save_credentials ───────────────────────────────────────────────────────
  if (name === "save_credentials") {
    try {
      const filePath = writeCredentials(args.project_path, args.credentials);
      return {
        content: [{
          type: "text",
          text: `✅ Saved to: ${filePath}\n(auto-added to .gitignore)`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `❌ Error: ${err.message}` }],
      };
    }
  }

  // ── save_context_file ──────────────────────────────────────────────────────
  if (name === "save_context_file") {
    const filePath = path.join(args.project_path, "AGENT_CONTEXT.md");
    try {
      fs.writeFileSync(filePath, args.context_text, "utf8");
      return {
        content: [{ type: "text", text: `✅ Context saved to: ${filePath}` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `❌ Error: ${err.message}` }],
      };
    }
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
  };
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("✅ Antigravity Context MCP Server v1.1 running\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});
