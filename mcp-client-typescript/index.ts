import OpenAI from "openai";
import { ChatCompletionMessageParam, ChatCompletionFunctionTool, ChatCompletionMessageFunctionToolCall } from "openai/resources/chat/completions";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";

dotenv.config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is not set");
}

class MCPClient {
    private mcp: Client;
    private openai: OpenAI;
    private transport: StdioClientTransport | null = null;
    private tools: ChatCompletionFunctionTool[] = [];

    constructor() {
        this.openai = new OpenAI({
            apiKey: DEEPSEEK_API_KEY,
            baseURL: "https://api.deepseek.com",
        });
        this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    }

    async connectToServer(serverScriptPath: string) {
        const isJs = serverScriptPath.endsWith(".js");
        const isPy = serverScriptPath.endsWith(".py");
        if (!isJs && !isPy) {
            throw new Error("Server script must be a .js or .py file");
        }
        const command = isPy
            ? process.platform === "win32" ? "python" : "python3"
            : process.execPath;

        this.transport = new StdioClientTransport({
            command,
            args: [serverScriptPath],
        });
        await this.mcp.connect(this.transport);

        const toolsResult = await this.mcp.listTools();
        this.tools = toolsResult.tools.map((tool) => ({
            type: "function" as const,
            function: {
                name: tool.name,
                description: tool.description ?? "",
                parameters: tool.inputSchema as Record<string, unknown>,
            },
        }));
        console.log(
            "Connected to server with tools:",
            this.tools.map((t) => t.function.name)
        );
    }

    async processQuery(query: string) {
        const messages: ChatCompletionMessageParam[] = [
            { role: "user", content: query },
        ];

        const response = await this.openai.chat.completions.create({
            model: "deepseek-chat",
            max_tokens: 1000,
            messages,
            tools: this.tools.length > 0 ? this.tools : undefined,
        });

        const choice = response.choices[0];
        const assistantMsg = choice.message;
        messages.push(assistantMsg);

        const finalText: string[] = [];

        if (assistantMsg.content) {
            finalText.push(assistantMsg.content);
        }

        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
            for (const toolCall of assistantMsg.tool_calls) {
                const fc = toolCall as ChatCompletionMessageFunctionToolCall;
                const toolName = fc.function.name;
                const toolArgs = JSON.parse(fc.function.arguments || "{}");

                finalText.push(
                    `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`
                );

                const result = await this.mcp.callTool({
                    name: toolName,
                    arguments: toolArgs,
                });

                const resultText = typeof result.content === "string"
                    ? result.content
                    : JSON.stringify(result.content);

                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: resultText,
                });
            }

            const followUp = await this.openai.chat.completions.create({
                model: "deepseek-chat",
                max_tokens: 1000,
                messages,
            });

            const followUpContent = followUp.choices[0].message.content;
            if (followUpContent) {
                finalText.push(followUpContent);
            }
        }

        return finalText.join("\n");
    }

    async chatLoop() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        try {
            console.log("\nMCP Client Started!");
            console.log("Type your queries or 'quit' to exit.");

            while (true) {
                const message = await rl.question("\nQuery: ");
                if (message.toLowerCase() === "quit") {
                    break;
                }
                const response = await this.processQuery(message);
                console.log("\n" + response);
            }
        } finally {
            rl.close();
        }
    }

    async cleanup() {
        await this.mcp.close();
    }
}

async function main() {
    if (process.argv.length < 3) {
        console.log("Usage: npx ts-node index.ts <path_to_server_script>");
        return;
    }
    const mcpClient = new MCPClient();
    try {
        await mcpClient.connectToServer(process.argv[2]);
        await mcpClient.chatLoop();
    } finally {
        await mcpClient.cleanup();
        process.exit(0);
    }
}

main();