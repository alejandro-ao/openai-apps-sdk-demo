# Building a Widget-Backed FastMCP Server for the OpenAI Apps SDK

This tutorial walks through wiring an existing Model Context Protocol (MCP) server into the OpenAI Apps SDK so that it can return custom widgets and accept tool calls that originate from those widgets. It assumes you already know the basics of MCP (initialize lifecycle, request handlers, etc.) but have not yet built an Apps SDK widget.

We will use the `fastmcp` Python helper to keep the server concise and TypeScript + Vite to bundle the UI component.

---

## 1. Project Layout

Start with a repository that separates the MCP server from the web bundle:

```
.
├── server/                  # FastMCP server
│   └── main.py
├── web/                     # React widget source code
│   ├── package.json
│   ├── scripts/build-widget-assets.js
│   └── src/
│       └── hello-world/index.tsx
└── docs/
    └── tutorial.md          # (this file)
```

The Apps SDK expects widgets to be packaged as single-file HTML entries. The provided `build-widget-assets.js` script uses Vite to compile each `src/<widget>/index.tsx` into `dist/widgets/<widget>-<hash>.{js,css}` and emits a manifest (`dist/widgets/manifest.json`), which we read from the server.

---

## 2. Build the Widget

Create `web/src/hello-world/index.tsx` with a standard React component. The key differences from a regular React app are:

1. Use the global `window.openai` bridge to talk to the host.
2. Listen for `openai:set_globals` events to react to tool re-runs or layout changes.
3. Handle structured tool output so your UI stays in sync with server responses.

```tsx
// web/src/hello-world/index.tsx
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const OPENAI_SET_GLOBALS_EVENT = 'openai:set_globals'

declare global {
  interface Window {
    openai?: {
      callTool?: (name: string, args?: Record<string, unknown>) => Promise<unknown>
      toolOutput?: unknown
    }
  }
}

function App() {
  const [message, setMessage] = useState<string | null>(extractMessage(window.openai?.toolOutput))

  // Hydrate when the host pushes new tool output.
  useEffect(() => {
    function handleSetGlobals(event: CustomEvent<{ globals?: Record<string, unknown> }>) {
      if (event.detail.globals?.toolOutput) {
        setMessage(extractMessage(event.detail.globals.toolOutput))
      }
    }

    window.addEventListener(OPENAI_SET_GLOBALS_EVENT, handleSetGlobals as EventListener)
    return () => window.removeEventListener(OPENAI_SET_GLOBALS_EVENT, handleSetGlobals as EventListener)
  }, [])

  async function sendMessage() {
    if (!window.openai?.callTool) return
    const response = await window.openai.callTool('message_from_ui', { message: 'hello from ui!' })
    setMessage(extractMessage(response))
  }

  return (
    <div>
      <button onClick={sendMessage}>Send MCP Message</button>
      <p>{message ?? 'No message yet.'}</p>
    </div>
  )
}

createRoot(document.getElementById('hello-world-root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

> **Tip**: `extractMessage` is a helper that looks at both `structuredContent` and `message` fields. ChatGPT hydrates the last tool run into `window.openai.toolOutput`, so you always get the most recent payload without re-issuing API calls.

### 2.1 Calling MCP Tools from the Widget

`window.openai.callTool(name, args)` invokes an MCP tool directly. The host will:

- inject tool input into the conversation,
- deliver the resulting tool response,
- hydrate `toolOutput`, `toolResponseMetadata`, and `toolInvocationStatus`.

Design your tools to be idempotent, because users can hit buttons repeatedly and ChatGPT may retry failed calls.

### 2.2 Responding to Tool Output

Use `structuredContent` (or other metadata) to ship machine-readable payloads back to the widget:

```ts
return types.ServerResult(
  types.CallToolResult(
    content=[types.TextContent(type="text", text="Message noted!")],
    structuredContent={"message": message},
    _meta={
      "openai/toolInvocation/invoking": "Sending message...",
      "openai/toolInvocation/invoked": "Message delivered.",
    },
  )
)
```

When this completes, the widget automatically receives the new `toolOutput` via `openai:set_globals`.

---

## 3. Compile Widget Assets

From the `web/` directory run:

```bash
npm install       # once
npm run build:widgets
```

You should see `dist/widgets/manifest.json` containing entries like:

```json
{
  "entries": {
    "hello-world": {
      "js": "widgets/hello-world-xtuhy.js",
      "css": "widgets/hello-world-xtuhy.css",
      "rootId": "hello-world-root",
      "hash": "xtuhy"
    }
  }
}
```

The MCP server will embed these assets as inline HTML to give ChatGPT a self-contained widget.

---

## 4. Author the FastMCP Server

`fastmcp.FastMCP` provides high-level decorators for tool/resource registration and an HTTP/SSE transport compatible with the Apps SDK. The outline:

```py
# server/main.py
import json
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Dict, List

import mcp.types as types
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, ValidationError

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIST_DIR = BASE_DIR / "web" / "dist"
MANIFEST_PATH = WEB_DIST_DIR / "widgets" / "manifest.json"

manifest = json.loads(MANIFEST_PATH.read_text("utf-8"))["entries"]
hello_entry = manifest["hello-world"]

@dataclass(frozen=True)
class Widget:
    identifier: str
    title: str
    template_uri: str
    invoking: str
    invoked: str
    html: str
    response_text: str

# Inline the compiled JS + CSS so the host can render the widget.
hello_html = f"""
<div id="{hello_entry["rootId"]}"></div>
<style>{(WEB_DIST_DIR / hello_entry["css"]).read_text("utf-8")}</style>
<script>{(WEB_DIST_DIR / hello_entry["js"]).read_text("utf-8")}</script>
"""

HelloWorldWidget = Widget(
    identifier="hello-world",
    title="Hello World",
    template_uri=f'ui://widget/hello-world_{hello_entry["hash"]}.html',
    invoking="Hand-tossing a hello world",
    invoked="Served a hello world",
    html=hello_html,
    response_text="Rendered a hello world!",
)
```

### 4.1 Register Tools and Resources

Use the FastMCP decorators to expose both the widget tool and any additional component-triggered tools:

```py
MIME_TYPE = "text/html+skybridge"
MESSAGE_TOOL_NAME = "message_from_ui"

class HelloWorldInput(BaseModel):
    widget_input: str = Field(..., alias="widgetInput")

class MessageFromUIInput(BaseModel):
    message: str

mcp = FastMCP(
    name="hello-world-python",
    sse_path="/mcp",
    message_path="/mcp/messages",
    stateless_http=True,
)

@mcp._mcp_server.list_tools()
async def _list_tools() -> List[types.Tool]:
    return [
        types.Tool(
            name=HelloWorldWidget.identifier,
            title=HelloWorldWidget.title,
            description=HelloWorldWidget.title,
            inputSchema=HelloWorldInput.model_json_schema(),
            _meta={
                "openai/outputTemplate": HelloWorldWidget.template_uri,
                "openai/widgetAccessible": True,
                "openai/resultCanProduceWidget": True,
            },
        ),
        types.Tool(
            name=MESSAGE_TOOL_NAME,
            title="Message from UI",
            description="Receives button presses from the widget.",
            inputSchema=MessageFromUIInput.model_json_schema(),
            _meta={
                "openai/widgetAccessible": True,
                "openai/toolInvocation/invoking": "Sending message...",
                "openai/toolInvocation/invoked": "Message delivered.",
            },
        ),
    ]
```

Set `openai/widgetAccessible: true` on any tool that the widget should be able to invoke via `window.openai.callTool`. Tools that render a widget also need `openai/outputTemplate` and `openai/resultCanProduceWidget`.

Provide a `list_resources` handler so ChatGPT can fetch the widget HTML:

```py
@mcp._mcp_server.list_resources()
async def _list_resources() -> List[types.Resource]:
    return [
        types.Resource(
            name=HelloWorldWidget.title,
            title=HelloWorldWidget.title,
            uri=HelloWorldWidget.template_uri,
            description="Hello World widget",
            mimeType=MIME_TYPE,
        )
    ]
```

### 4.2 Handle Tool Calls

Add a handler for the UI-triggered tool that logs the message, returns structured content, and sets `_meta` so the host can show “Sending message…” status strings:

```py
async def _call_tool_request(req: types.CallToolRequest) -> types.ServerResult:
    if req.params.name == MESSAGE_TOOL_NAME:
        try:
            payload = MessageFromUIInput.model_validate(req.params.arguments or {})
        except ValidationError as exc:
            return types.ServerResult(
                types.CallToolResult(
                    content=[types.TextContent(type="text", text=str(exc.errors()))],
                    isError=True,
                )
            )

        message = payload.message
        return types.ServerResult(
            types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Message noted: {message}")],
                structuredContent={"message": message},
                _meta={
                    "openai/toolInvocation/invoking": "Sending message...",
                    "openai/toolInvocation/invoked": "Message delivered.",
                },
            )
        )

    # Handle the regular widget tool...
```

Register the handler:

```py
mcp._mcp_server.request_handlers[types.CallToolRequest] = _call_tool_request
mcp._mcp_server.request_handlers[types.ReadResourceRequest] = _handle_read_resource
```

Finally expose an ASGI app (FastMCP uses Starlette under the hood):

```py
app = mcp.streamable_http_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
```

---

## 5. Enable Component-Initiated Tool Calls

Recap the metadata requirements for component-triggered calls:

| Property                               | Purpose                                                         |
|---------------------------------------|-----------------------------------------------------------------|
| `openai/widgetAccessible: true`       | Allows `window.openai.callTool` to hit the tool directly.       |
| `openai/outputTemplate`               | Points at the widget HTML resource the host should render.      |
| `openai/resultCanProduceWidget: true` | Signals that the tool will return widget HTML in the response.  |
| `openai/toolInvocation/invoking`      | Optional status string while the tool is running.               |
| `openai/toolInvocation/invoked`       | Optional completion status once the tool finishes.              |

Without `openai/widgetAccessible`, the Apps SDK drops component-initiated tool calls for safety.

---

## 6. Tie It Together

1. `npm run build:widgets` — rebuild the widget bundle whenever the React code changes.
2. Restart your FastMCP server so it reads the updated manifest.
3. In the Apps SDK dashboard or ChatGPT client, register the MCP endpoint (pointing to `http://localhost:8000/mcp` for local testing).
4. Trigger the Hello World tool. ChatGPT renders the widget using the `openai/outputTemplate` HTML.
5. Click **Send MCP Message** in the widget. The component calls `message_from_ui`, your FastMCP handler logs and returns structured content, and the widget updates with the latest message thanks to the globals hydration flow.

---

## 7. Further Ideas

- **Multiple Widgets**: Extend the manifest discovery loop to load several components and add each as a tool/resource pair.
- **Widget State**: Use `window.openai.setWidgetState` to persist user preferences per conversation turn.
- **Metadata-driven UX**: Populate `_meta["openai/toolResponseMetadata"]` or additional keys so the model has richer context for subsequent reasoning steps.
- **Testing**: Mock the `openai` APIs (or export the component for local mounting) to unit test the UI without running ChatGPT.

---

## 8. Reference Links

- [OpenAI Apps SDK – Build a custom UX](https://developers.openai.com/apps-sdk/build/custom-ux)
- [OpenAI Apps SDK – MCP Server docs](https://developers.openai.com/apps-sdk/build/mcp-server)
- [Model Context Protocol specification](https://modelcontextprotocol.io/llms-full.txt)
- [fastmcp documentation](https://gofastmcp.com/llms.txt)
- [Model Context Protocol Python SDK README](https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/refs/heads/main/README.md)

With these pieces in place, you can ship fully interactive, component-driven workflows in ChatGPT while keeping all logic in your MCP server. Happy building!
