# MCP Batch Operations Server

An efficient Model Context Protocol (MCP) server for executing batch operations with parallel processing, smart grouping, and comprehensive error handling.

## Features

- **Parallel Processing**: Execute multiple operations concurrently with configurable limits
- **Smart Grouping**: Automatically group operations by type for optimal performance
- **Error Resilience**: Continue processing on errors or stop immediately based on configuration
- **Retry Logic**: Built-in retry mechanism for failed operations
- **Comprehensive Logging**: Detailed operation logs for debugging and monitoring
- **Multiple Operation Types**: File operations, code analysis, and transformations

## Installation

1. Clone this repository:
```bash
git clone https://github.com/ahmedibrahim085/mcp-batch-server.git
cd mcp-batch-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the server:
```bash
npm run build
```

## Configuration for Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "batch-operations": {
      "command": "node",
      "args": [
        "/path/to/mcp-batch-server/dist/index.js"
      ]
    }
  }
}
```

## Usage Examples

### Basic File Operations
```javascript
await batch_file_operations({
  operations: [
    { type: "create", path: "/tmp/file1.txt", content: "Hello" },
    { type: "create", path: "/tmp/file2.txt", content: "World" }
  ],
  options: { maxConcurrent: 10 }
});
```

### Batch Code Analysis
```javascript
await batch_code_analysis({
  files: ["/src/app.js", "/src/utils.js"],
  analyses: ["complexity", "dependencies"]
});
```

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## License

MIT