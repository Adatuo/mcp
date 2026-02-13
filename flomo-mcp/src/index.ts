#!/usr/bin/env node

/**
 * This is a template MCP server that implements a simple notes system.
 * It demonstrates core MCP concepts like resources and tools by allowing:
 * - Listing notes as resources
 * - Reading individual notes
 * - Creating new notes via a tool
 * - Summarizing all notes via a prompt
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { FlomoClient } from "./flomo.js";
/**
 * Type alias for a note object.
 */
type Note = { title: string, content: string };

/**
 * Simple in-memory storage for notes.
 * In a real implementation, this would likely be backed by a database.
 */
const notes: { [id: string]: Note } = {
  "1": { title: "First Note", content: "This is note 1" },
  "2": { title: "Second Note", content: "This is note 2" }
};

/**
 * Create an MCP server with capabilities for resources (to list/read notes),
 * tools (to create new notes), and prompts (to summarize notes).
 */
const server = new Server(
  {
    name: "flomo-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);


const args = parseArgs()
const apiUrl = args.flomo_api_url || process.env.FLOMO_API_URL || ""

/**
 * Handler that lists available tools.
 * Exposes a single "create_note" tool that lets clients create new notes.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "write_note",
        description: "Write a note to flomo",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Text content of the note with Markdown format"
            }
          },
          required: ["content"]
        }
      }
    ]
  };
});

/**
 * Handler for the create_note tool.
 * Creates a new note with the provided title and content, and returns success message.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "write_note": {
      if (!apiUrl) {
        throw new Error("Flomo API URL is not set");
      }
      const content = String(request.params.arguments?.content);
      if (!content) {
        throw new Error("content is required");
      }

      // const apiUrl = "https://flomoapp.com/iwh/MjY3NjI2Mg/9aae9a0df25d4405fe53d3572e43ea61/"
      const flomoClient = new FlomoClient({ apiUrl })
      const res = await flomoClient.writeNote({ content })

      if (!res.memo || !res.memo.slug) {
        throw new Error(`Failed to write note to flomo: ${res?.message || "unknown error"}`)
      }

      const flomoUrl = `https://v.flomoapp.com/mine/?memo_id=${res.memo.slug}`


      return {
        content: [{
          type: "text",
          text: `write note to flomo success: ${flomoUrl}`
        }]
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * 解析命令行参数
 */

function parseArgs() {
  const args: Record<string, string> = {}
  process.argv.slice(2).forEach((arg) => {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=")
      args[key] = value
    }
  })
  return args
}


/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
