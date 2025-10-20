import mcp.types as types
from mcp.server.fastmcp import FastMCP
from dataclasses import dataclass
import mcp.types as types
from pydantic import BaseModel, ConfigDict, Field, ValidationError
import logging
import time

logger = logging.getLogger(__name__)

from copy import deepcopy
from typing import Any, Dict, List

# ----------------------------------------------------------------------
# Initialize the Widget
# ----------------------------------------------------------------------

@dataclass(frozen=True)
class Widget:
    identifier: str
    title: str
    template_uri: str
    invoking: str
    invoked: str
    html: str
    response_text: str
    
HelloWorldWidget: Widget = Widget(
    identifier="hello-world",
    title="Hello World",
    template_uri="ui://widget/hello-world.html",
    invoking="Hand-tossing a hello world",
    invoked="Served a hello world",
    html="<div id=\"hello-world-root\"><h1>Hello, World!</h1></div>",
    response_text="Rendered a hello world!",
)

MIME_TYPE = "text/html+skybridge"

# ----------------------------------------------------------------------
# Widget Input Schema
# ----------------------------------------------------------------------

TOOL_INPUT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "widgetInput": {
            "type": "string",
            "description": "Input to mention when rendering the widget.",
        }
    },
    "required": ["widgetInput"],
    "additionalProperties": False,
}

# ----------------------------------------------------------------------
# Setup the Server
# ----------------------------------------------------------------------

mcp = FastMCP(
    name="hello-world-python",
    sse_path="/mcp",
    message_path="/mcp/messages",
    stateless_http=True,
)

# ----------------------------------------------------------------------
# Helper Functions
# ----------------------------------------------------------------------

def _tool_meta(widget: Widget) -> Dict[str, Any]:
    return {
        "openai/outputTemplate": widget.template_uri,
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
        "openai/widgetAccessible": True,
        "openai/resultCanProduceWidget": True,
        "annotations": {
          "destructiveHint": False,
          "openWorldHint": False,
          "readOnlyHint": True,
        }
    }

def _embedded_widget_resource(widget: Widget) -> types.EmbeddedResource:
    return types.EmbeddedResource(
        type="resource",
        resource=types.TextResourceContents(
            uri=widget.template_uri,
            mimeType=MIME_TYPE,
            text=widget.html,
            title=widget.title,
        ),
    )
    
# ----------------------------------------------------------------------
# List Tools && Resources
# ----------------------------------------------------------------------

@mcp._mcp_server.list_tools()
async def _list_tools() -> List[types.Tool]:
    return [
        types.Tool(
            name=HelloWorldWidget.identifier,
            title=HelloWorldWidget.title,
            description=HelloWorldWidget.title,
            inputSchema=deepcopy(TOOL_INPUT_SCHEMA),
            _meta=_tool_meta(HelloWorldWidget),
        )
    ]

@mcp._mcp_server.list_resources()
async def _list_resources() -> List[types.Resource]:
    return [
        types.Resource(
            name=HelloWorldWidget.title,
            title=HelloWorldWidget.title,
            uri=HelloWorldWidget.template_uri,
            description=HelloWorldWidget.title + " widget",
            mimeType=MIME_TYPE,
            _meta=_tool_meta(HelloWorldWidget),
        )
    ]

# ----------------------------------------------------------------------
# Handle Resource Reads && Tool Calls
# ----------------------------------------------------------------------

class HelloWorldInput(BaseModel):
    """Schema for hello world tools."""

    widget_input: str = Field(
        ...,
        alias="widgetInput",
        description="Input to mention when rendering the widget.",
    )

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


async def _handle_read_resource(req: types.ReadResourceRequest) -> types.ServerResult:
    widget: Widget | None = None
    logger.info(f"Read resource: {req.params.uri}")
    logger.info(f"Widget URI: {HelloWorldWidget.template_uri}")
    
    if (str(req.params.uri).strip() == HelloWorldWidget.template_uri.strip()):
        widget = HelloWorldWidget

    if widget is None:
        return types.ServerResult(
            types.ReadResourceResult(
                contents=[],
                _meta={"error": f"Unknown resource: {req.params.uri}"},
            )
        )

    contents = [
        types.TextResourceContents(
            uri=widget.template_uri,
            mimeType=MIME_TYPE,
            text=widget.html,
            _meta=_tool_meta(widget),
        )
    ]

    return types.ServerResult(types.ReadResourceResult(contents=contents))

async def _call_tool_request(req: types.CallToolRequest) -> types.ServerResult:
    widget: Widget | None = None
    
    if (req.params.name == HelloWorldWidget.identifier):
        widget = HelloWorldWidget

    if widget is None:
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text=f"Unknown tool: {req.params.name}",
                    )
                ],
                isError=True,
            )
        )

    arguments = req.params.arguments or {}
    try:
        payload = HelloWorldInput.model_validate(arguments)
    except ValidationError as exc:
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text=f"Input validation error: {exc.errors()}",
                    )
                ],
                isError=True,
            )
        )

    input = payload.widget_input
    widget_resource = _embedded_widget_resource(widget)
    meta: Dict[str, Any] = {
        "openai.com/widget": widget_resource.model_dump(mode="json"),
        "openai/outputTemplate": widget.template_uri,
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
        "openai/widgetAccessible": True,
        "openai/resultCanProduceWidget": True,
    }
    
    # do something
    logging.info(f"Calling tool: {req.params.name} with input: {input}")
    logging.info(f"Working for 2 seconds...")
    time.sleep(2)
    logging.info(f"Done!")
    


    return types.ServerResult(
        types.CallToolResult(
            content=[
                types.TextContent(
                    type="text",
                    text=widget.response_text,
                )
            ],
            structuredContent={"widgetInput": input},
            _meta=meta,
        )
    )

mcp._mcp_server.request_handlers[types.CallToolRequest] = _call_tool_request
mcp._mcp_server.request_handlers[types.ReadResourceRequest] = _handle_read_resource

# ----------------------------------------------------------------------
# Initialize the Server
# ----------------------------------------------------------------------

app = mcp.streamable_http_app()

try:
    from starlette.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
    )
except Exception:
    pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000)
