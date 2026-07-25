import { describe, it, expect } from "bun:test";
import {
  ClaudeMemPlugin,
  parseSearchResponse,
  REGISTERED_OPENCODE_HOOKS,
  REAL_OPENCODE_EVENT_TYPES,
} from "../../src/integrations/opencode-plugin/index";

/**
 * Regression guard for plan-08 (OpenCode event-contract correctness).
 *
 * The old plugin subscribed to bus event names that do not exist in OpenCode
 * (`session.created`, `message.updated`, `session.compacted`, `file.edited`,
 * `session.deleted` on a `(name, payload)` switch) and parsed `data.items`
 * instead of the worker's real `data.content` blocks — so it captured nothing
 * and search always returned "No results". These tests fail CI if either
 * contract regresses.
 */

// The real OpenCode plugin hook names. Anything the plugin returns as a hook
// key must be in this allowlist; a future typo (e.g. "session.created") fails.
const REAL_OPENCODE_HOOK_NAMES = new Set<string>([
  "tool.execute.after",
  "chat.message",
  "event",
  "experimental.session.compacting",
  "experimental.chat.system.transform",
  "tool.execute.before",
  "permission.ask",
  "auth",
  "config",
  // `tool` is the custom-tool registration map, part of the plugin return shape.
  "tool",
]);

// Bus event names the old code used that DO NOT exist in OpenCode's contract.
const PHANTOM_BUS_EVENT_NAMES = [
  "session.created",
  "message.updated",
  "session.compacted",
  "file.edited",
];

const pluginCtx = {
  client: {},
  project: { name: "test-project", path: "/tmp/x" },
  directory: "/tmp/x",
  worktree: "/tmp/x",
  serverUrl: new URL("http://127.0.0.1:1234"),
  $: {},
};

describe("OpenCode plugin event contract", () => {
  it("only registers hooks that are part of OpenCode's real contract", async () => {
    const plugin = await ClaudeMemPlugin(pluginCtx);
    const hookKeys = Object.keys(plugin);

    for (const key of hookKeys) {
      expect(
        REAL_OPENCODE_HOOK_NAMES.has(key),
        `hook "${key}" is not a real OpenCode hook name`,
      ).toBe(true);
    }

    // The exported allowlist of hooks we bind to must itself be real.
    for (const hook of REGISTERED_OPENCODE_HOOKS) {
      expect(REAL_OPENCODE_HOOK_NAMES.has(hook)).toBe(true);
    }

    // The capture-critical hooks must be present.
    expect(hookKeys).toContain("tool.execute.after");
    expect(hookKeys).toContain("chat.message");
    expect(hookKeys).toContain("experimental.session.compacting");
    expect(hookKeys).toContain("experimental.chat.system.transform");
    expect(hookKeys).toContain("event");
  });

  it("does not register the phantom bus event names as hooks", async () => {
    const plugin = await ClaudeMemPlugin(pluginCtx);
    const hookKeys = Object.keys(plugin);
    for (const phantom of PHANTOM_BUS_EVENT_NAMES) {
      expect(hookKeys).not.toContain(phantom);
    }
  });

  it("only reacts to real bus event types", () => {
    // session.idle / session.deleted are real OpenCode bus events; the phantom
    // names must never appear in the reacted-to allowlist.
    expect(REAL_OPENCODE_EVENT_TYPES).toContain("session.idle");
    expect(REAL_OPENCODE_EVENT_TYPES).toContain("session.deleted");
    for (const phantom of PHANTOM_BUS_EVENT_NAMES) {
      expect(REAL_OPENCODE_EVENT_TYPES as readonly string[]).not.toContain(phantom);
    }
  });

  it("posts observations to the worker via tool.execute.after", async () => {
    const posts: Array<{ url: string; body: unknown }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      posts.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(JSON.stringify({ status: "queued" }), { status: 200 });
    }) as typeof fetch;

    try {
      const plugin = await ClaudeMemPlugin(pluginCtx);
      const toolAfter = plugin["tool.execute.after"];
      await toolAfter(
        { tool: "read", sessionID: "ses_1", callID: "c1" },
        { title: "Read", output: "file contents", metadata: {}, args: { path: "/a" } },
      );

      const initPost = posts.find((p) => p.url.includes("/api/sessions/init"));
      const obsPost = posts.find((p) => p.url.includes("/api/sessions/observations"));
      expect(initPost, "tool.execute.after should lazily init the session").toBeTruthy();
      expect(obsPost, "tool.execute.after should POST an observation").toBeTruthy();
      const obsBody = obsPost!.body as Record<string, unknown>;
      expect(obsBody.tool_name).toBe("read");
      expect(obsBody.tool_response).toBe("file contents");

      // Regression guard: every worker call must be tagged so sessions don't
      // get silently bucketed under the "claude" platform in the dashboard.
      const initBody = initPost!.body as Record<string, unknown>;
      expect(initBody.platformSource).toBe("opencode");
      expect(obsBody.platformSource).toBe("opencode");

      // Regression guard: ctx.project has no `name` in the real OpenCode
      // context, so the project must come from the directory basename, not
      // the literal fallback string "opencode".
      expect(initBody.project).toBe("x");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("captures the real user prompt on session init instead of an empty string", async () => {
    const posts: Array<{ url: string; body: unknown }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      posts.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(JSON.stringify({ status: "queued" }), { status: 200 });
    }) as typeof fetch;

    try {
      const plugin = await ClaudeMemPlugin(pluginCtx);
      await plugin["chat.message"](
        {},
        {
          message: { sessionID: "ses_2", role: "user" },
          parts: [{ type: "text", text: "please read the config file and summarize it" }],
        },
      );

      const initPost = posts.find((p) => p.url.includes("/api/sessions/init"));
      expect(initPost, "a user message should lazily init the session").toBeTruthy();
      const initBody = initPost!.body as Record<string, unknown>;
      expect(initBody.prompt).toBe("please read the config file and summarize it");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("injects semantic context into the system prompt for a follow-up user message", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlString = String(url);
      if (urlString.includes("/api/sessions/init")) {
        return new Response(JSON.stringify({ status: "initialized" }), { status: 200 });
      }
      if (urlString.includes("/api/context/semantic")) {
        return new Response(
          JSON.stringify({ context: "## Relevant Past Work\nFixed the login bug.", count: 1 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ status: "queued" }), { status: 200 });
    }) as typeof fetch;

    try {
      const plugin = await ClaudeMemPlugin(pluginCtx);
      await plugin["chat.message"](
        {},
        {
          message: { sessionID: "ses_3", role: "user" },
          parts: [{ type: "text", text: "why did the login flow break last time we touched it" }],
        },
      );

      const output = { system: ["base system prompt"] };
      await plugin["experimental.chat.system.transform"]({ sessionID: "ses_3" }, output);

      expect(output.system).toContain("## Relevant Past Work\nFixed the login bug.");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("skips semantic injection when there is no prior user message for the session", async () => {
    const plugin = await ClaudeMemPlugin(pluginCtx);
    const output = { system: ["base system prompt"] };
    await plugin["experimental.chat.system.transform"]({ sessionID: "ses_never_seen" }, output);
    expect(output.system).toEqual(["base system prompt"]);
  });
});

describe("OpenCode search client response-shape contract", () => {
  it("parses the worker's real data.content blocks and returns the rows", () => {
    // This is exactly what SearchManager.searchObservations returns on a hit.
    const workerResponse = JSON.stringify({
      content: [
        {
          type: "text",
          text:
            'Found 2 observation(s) matching "auth"\n\n| # | Title |\n|---|---|\n1. Added login flow\n2. Fixed token refresh',
        },
      ],
    });

    const rendered = parseSearchResponse(workerResponse, "auth");
    expect(rendered).toContain("Found 2 observation(s)");
    expect(rendered).toContain("Added login flow");
    expect(rendered).toContain("Fixed token refresh");
    expect(rendered).not.toContain("No results");
  });

  it("does NOT parse the old data.items shape (regression guard)", () => {
    // The pre-fix worker contract was wrongly assumed to be { items: [...] }.
    // A client that still reads data.items would render rows here; the real
    // client reads data.content, so this is correctly reported as no results.
    const oldShape = JSON.stringify({
      items: [{ title: "should-not-render" }, { title: "also-not" }],
    });
    const rendered = parseSearchResponse(oldShape, "auth");
    expect(rendered).toContain("No results");
    expect(rendered).not.toContain("should-not-render");
  });

  it("returns a clear no-results message for the worker's empty-content shape", () => {
    const emptyResponse = JSON.stringify({
      content: [{ type: "text", text: 'No observations found matching "zzz"' }],
    });
    const rendered = parseSearchResponse(emptyResponse, "zzz");
    expect(rendered).toContain("No observations found");
  });
});
