import * as vscode from 'vscode';
import * as path from 'path';
import { LanguageClient } from 'vscode-languageclient/node';
import { PostmanLintClient } from './client';
import { COMMANDS } from 'postman-lint-server-shared';

let client: PostmanLintClient;

/**
 * Extension activation function
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    // Create and start the language client
    client = new PostmanLintClient(context);
    await client.start();

    // Register commands
    registerCommands(context);

    // Set up status bar
    setupStatusBar(context);
  } catch (error) {
    console.error('Failed to activate Postman Lint Server extension:', error);
    vscode.window.showErrorMessage(
      `Failed to activate Postman Lint Server: ${error}`
    );
  }
}

/**
 * Extension deactivation function
 */
export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
  }
}

/**
 * Register all extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // Lint current file command
  const lintCurrentFile = vscode.commands.registerCommand(
    COMMANDS.LINT_CURRENT_FILE,
    async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showWarningMessage('No active file to lint');
        return;
      }

      const uri = activeEditor.document.uri.toString();
      
      try {
        vscode.window.showInformationMessage('Linting current file...');
        const result = await client.sendRequest('postmanLintServer/lintDocument', { uri });
        
        if (result && result.issues) {
          vscode.window.showInformationMessage(
            `Linting complete: ${result.issues.length} issues found`
          );
        } else {
          vscode.window.showInformationMessage('Linting complete: No issues found');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Linting failed: ${error}`);
      }
    }
  );

  // Lint workspace command
  const lintWorkspace = vscode.commands.registerCommand(
    COMMANDS.LINT_WORKSPACE,
    async () => {
      vscode.window.showInformationMessage('Workspace linting not yet implemented');
    }
  );

  // Check authentication status command
  const checkAuthStatus = vscode.commands.registerCommand(
    COMMANDS.CHECK_AUTH_STATUS,
    async () => {
      try {
        const authStatus = await client.sendRequest('postmanLintServer/checkAuthStatus', {});
        
        if (authStatus.isAuthenticated) {
          vscode.window.showInformationMessage(
            `Postman CLI authenticated (Profile: ${authStatus.profile || 'default'})`
          );
        } else {
          vscode.window.showWarningMessage(
            `Postman CLI not authenticated: ${authStatus.error || 'Unknown error'}`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to check authentication: ${error}`);
      }
    }
  );

  // Reload configuration command
  const reloadConfig = vscode.commands.registerCommand(
    COMMANDS.RELOAD_CONFIG,
    async () => {
      try {
        await client.sendNotification('workspace/didChangeConfiguration', {
          settings: vscode.workspace.getConfiguration('postmanLintServer')
        });
        vscode.window.showInformationMessage('Postman Lint Server configuration reloaded');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to reload configuration: ${error}`);
      }
    }
  );

  // Register all commands with context
  context.subscriptions.push(
    lintCurrentFile,
    lintWorkspace,
    checkAuthStatus,
    reloadConfig
  );
}

/**
 * Set up status bar indicators
 */
function setupStatusBar(context: vscode.ExtensionContext): void {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );

  statusBarItem.text = "$(sync~spin) Postman Lint";
  statusBarItem.tooltip = "Postman API Governance Linting";
  statusBarItem.command = COMMANDS.CHECK_AUTH_STATUS;
  
  // Show status bar item
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Update status based on client state
  const updateStatus = () => {
    if (client && client.isRunning()) {
      statusBarItem.text = "$(check) Postman Lint";
      statusBarItem.color = undefined;
    } else {
      statusBarItem.text = "$(error) Postman Lint";
      statusBarItem.color = new vscode.ThemeColor('errorForeground');
    }
  };

  // Initial status update
  setTimeout(updateStatus, 2000);

  // Update status when configuration changes
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('postmanLintServer')) {
      updateStatus();
    }
  });
}
