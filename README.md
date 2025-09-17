# Postman API Lint Server

VS Code extension that runs Postman governance checks on your API specs in real-time. Issues show up directly in the Problems panel with line-precise positioning.

## What It Does

Your API specifications get validated against Postman's governance rules as you write them. Each violation appears with the exact line number, severity level, and rule violated. Works with your existing Postman CLI authentication.

## Prerequisites

```bash
npm install -g @postman/cli
postman login --with-api-key YOUR_API_KEY
```

Verify:
```bash
postman login status
postman api lint --help
```

## Installation

### From Source

```bash
git clone https://github.com/jaredboynton/postman-lint-server
cd postman-lint-server
npm run install:all
npm run compile
```

Press F5 in VS Code to launch the Extension Development Host.

### From VSIX

```bash
code --install-extension postman-lint-server-0.1.0.vsix
```

## Configuration

VS Code settings:

```json
{
  "postmanLintServer.enable": true,
  "postmanLintServer.postmanCliPath": "postman",
  "postmanLintServer.lintOnSave": true,
  "postmanLintServer.lintOnChange": false,
  "postmanLintServer.lintOnChangeDelay": 500,
  "postmanLintServer.maxFileSize": 10485760
}
```

- **enable**: Turn extension on/off
- **postmanCliPath**: Path to Postman CLI binary
- **lintOnSave**: Validate when files are saved
- **lintOnChange**: Real-time validation as you type
- **lintOnChangeDelay**: Debounce delay in ms for real-time mode
- **maxFileSize**: Max file size to lint (default 10MB)

Real-time validation works but can impact performance on large specs. Each validation takes 200-500ms for typical files.

## Commands

Via Command Palette (Ctrl+Shift+P):

- **Postman: Lint Current File** - Manually lint active file
- **Postman: Lint All OpenAPI Files in Workspace** - Batch validate
- **Postman: Check Authentication Status** - Verify CLI auth
- **Postman: Reload Postman CLI Configuration** - Refresh settings

## Supported Files

- OpenAPI 3.0 (`.yaml`, `.yml`, `.json`)
- Swagger 2.0 (`.yaml`, `.yml`, `.json`)
- Any YAML/JSON that Postman CLI recognizes as an API spec

## How It Works

1. Monitors your API specification files
2. Executes `postman api lint` on changes
3. Parses CLI output for violations
4. Maps violations to VS Code diagnostics
5. Shows issues in Problems panel

Uses Language Server Protocol for clean integration. Reads Postman CLI credentials from `~/.postman/postmanrc`.

## Troubleshooting

### Extension Not Working

1. Check CLI: `postman --version`
2. Check auth: `postman login status`
3. Test directly: `postman api lint your-spec.yaml`
4. Check Output panel for "Postman Lint Server" logs

### Common Issues

**CLI not found**
```bash
npm install -g @postman/cli
# Or set custom path
"postmanLintServer.postmanCliPath": "/path/to/postman"
```

**Authentication required**
```bash
postman login --with-api-key YOUR_KEY
```

**No issues appearing**
Ensure your file is valid. Test with:
```bash
postman api lint your-file.yaml
```

**Performance problems**
Disable real-time linting:
```json
{
  "postmanLintServer.lintOnChange": false
}
```

## Architecture

```
postman-lint-server/
├── client/          # VS Code extension
├── server/          # LSP server
└── shared/          # Common types
```

### Key Components

- **GovernanceScorer**: Runs Postman CLI and parses output
- **AuthManager**: Handles CLI authentication
- **CliValidator**: Validates CLI availability
- **DiagnosticsMapper**: Converts CLI output to VS Code diagnostics

The extension integrates proven CLI execution logic adapted for real-time VS Code integration.

## Building

```bash
npm run install:all    # Install dependencies
npm run compile        # Build everything
npm run watch          # Watch mode
npm run test           # Run tests
npm run package        # Create VSIX
```

## Contributing

This solves a real problem for API developers using Postman governance. Focus areas for contribution:
- Error handling improvements
- Performance optimization for large specs
- Additional file format support
- Postman workspace integration