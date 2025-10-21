# ChatGPT App SDK Demo

This repository demonstrates how to use the **ChatGPT App SDK** released by OpenAI, showcasing the integration of MCP (Model Context Protocol) servers with interactive graphical user interfaces.

> **Note:** This is currently a demo implementation. This repository will serve as supporting material for a future tutorial.

## Overview

This demo showcases OpenAI's revolutionary ChatGPT App SDK, which allows developers to create ChatGPT applications built on top of the MCP protocol. Unlike traditional MCP tools that only provide text-based interactions, this SDK enables the creation of **interactive widgets** with graphical user interfaces that are embedded directly into the ChatGPT interface.

### Key Features

- **MCP Server Integration**: Full MCP protocol implementation for tool execution
- **Interactive Widgets**: React-based UI components that load within ChatGPT
- **Iframe Embedding**: Widgets are seamlessly integrated into the chat window
- **Direct Tool Interaction**: Users can interact with MCP tools through both text/voice and GUI
- **Real-time Updates**: Dynamic widget updates and tool execution

## Repository Structure

```
chatgpt-apps-sdk/
├── server/          # MCP Server implementation
│   ├── main.py      # FastMCP server with widget integration
│   ├── pyproject.toml
│   └── README.md
└── web/             # React widgets directory
    ├── src/
    │   ├── App.tsx  # Main widget component
    │   └── ...
    ├── package.json
    └── dist/        # Built widget assets
```

## How It Works

### 1. MCP Server (`/server`)

The MCP server is located in the `server` directory and includes the OpenAI App SDK integration. It:

- Implements the MCP protocol using FastMCP
- Provides tools that can be executed by AI agents (currently ChatGPT-compatible only)
- Returns widget resources that reference HTML files containing the actual UI components
- Serves interactive widgets as embedded resources with MIME type `text/html+skybridge`

### 2. Widget System (`/web`)

The `web` directory contains all the interactive widgets:

- **Technology**: React with TypeScript
- **Build System**: Vite for fast development and optimized builds
- **Components**: Reusable UI widgets that integrate with MCP tools
- **Root Component**: The main widget demonstrated in this quick demo

### 3. Integration Flow

1. **Tool Execution**: ChatGPT calls MCP tools through the server
2. **Widget Response**: Tools return resources that reference HTML widget files
3. **UI Rendering**: The HTML widgets (built from React components) are loaded into an iframe within the ChatGPT interface
4. **User Interaction**: Users can interact with the graphical interface directly
5. **Tool Updates**: Widget interactions can trigger additional MCP tool calls

## Revolutionary Aspects

This approach is groundbreaking because it:

- **Extends Interaction Modes**: Users can interact with MCP tools via voice, text, AND graphical interfaces
- **Seamless Integration**: Widgets load directly within the chat window as iframes
- **Direct Tool Access**: GUI interactions can directly call MCP server tools
- **Enhanced UX**: Provides rich, interactive experiences beyond traditional text-based AI interactions

## Compatibility

- **Currently Supported**: ChatGPT (with OpenAI App SDK)
- **Protocol**: MCP (Model Context Protocol)
- **Future**: Designed to be extensible to other AI platforms

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- ChatGPT with App SDK support

### Server Setup

```bash
cd server
pip install -e .
python main.py
```

### Widget Development

```bash
cd web
npm install
npm run build  # Build widgets for production
npm run dev    # Development mode
```

## Demo Widget

The current demo includes a simple "Hello World" counter widget that demonstrates:

- React component integration
- State management within widgets
- CSS styling and responsive design
- MCP tool integration patterns

## Future Development

This repository will be expanded to include:

- Comprehensive tutorials
- Multiple widget examples
- Advanced MCP integration patterns
- Best practices for ChatGPT App SDK development

## Contributing

This is currently a demo repository. Contribution guidelines will be added as the project evolves.

## License

[License information to be added]

---

**Powered by OpenAI's ChatGPT App SDK and the MCP Protocol**
