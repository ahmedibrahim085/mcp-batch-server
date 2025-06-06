#!/bin/bash
# Setup script for MCP Batch Operations Server

echo "🚀 Setting up MCP Batch Operations Server..."

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js first."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building the project..."
npm run build

# Create the MCP config directory if it doesn't exist
CONFIG_DIR="$HOME/Library/Application Support/Claude"
if [ ! -d "$CONFIG_DIR" ]; then
    echo "📁 Creating Claude configuration directory..."
    mkdir -p "$CONFIG_DIR"
fi

# Check if config file exists
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
if [ -f "$CONFIG_FILE" ]; then
    echo "⚠️  Claude configuration file already exists."
    echo "Please add the following to your $CONFIG_FILE manually:"
    echo ""
    cat << EOF
{
  "mcpServers": {
    "batch-operations": {
      "command": "node",
      "args": [
        "$PWD/dist/index.js"
      ]
    }
  }
}
EOF
else
    # Create config file
    echo "📝 Creating Claude configuration..."
    cat << EOF > "$CONFIG_FILE"
{
  "mcpServers": {
    "batch-operations": {
      "command": "node",
      "args": [
        "$PWD/dist/index.js"
      ]
    }
  }
}
EOF
    echo "✅ Configuration created at $CONFIG_FILE"
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Restart Claude Desktop to load the new MCP server"
echo "2. Use the batch operations tools in your conversations"
echo ""
echo "Available tools:"
echo "- batch_file_operations"
echo "- batch_code_analysis"
echo "- batch_transform"
echo ""
echo "Check README.md for usage examples!"