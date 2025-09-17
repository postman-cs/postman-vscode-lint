import * as vscode from 'vscode';
import * as path from 'path';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  RevealOutputChannelOn
} from 'vscode-languageclient/node';

/**
 * Postman Lint Language Client wrapper
 */
export class PostmanLintClient {
  private client: LanguageClient | null = null;
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.outputChannel = vscode.window.createOutputChannel('Postman Lint Server');
  }

  /**
   * Start the Language Server and client
   */
  public async start(): Promise<void> {
    try {
      // Create server options
      const serverOptions = this.createServerOptions();
      
      // Create client options
      const clientOptions = this.createClientOptions();

      // Create the language client
      this.client = new LanguageClient(
        'postmanLintServer',
        'Postman Lint Server',
        serverOptions,
        clientOptions
      );

      // Start the client (this will also launch the server)
      await this.client.start();

      this.outputChannel.appendLine('Postman Lint Server started successfully');

    } catch (error) {
      this.outputChannel.appendLine(`Failed to start Postman Lint Server: ${error}`);
      throw error;
    }
  }

  /**
   * Stop the Language Server and client
   */
  public async stop(): Promise<void> {
    if (this.client) {
      await this.client.stop();
      this.client = null;
      this.outputChannel.appendLine('Postman Lint Server stopped');
    }
  }

  /**
   * Check if the client is running
   */
  public isRunning(): boolean {
    return this.client !== null && this.client.state === 2; // Running state
  }

  /**
   * Send a request to the server
   */
  public async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.client) {
      throw new Error('Language client is not running');
    }
    return await this.client.sendRequest(method, params);
  }

  /**
   * Send a notification to the server
   */
  public async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.client) {
      throw new Error('Language client is not running');
    }
    await this.client.sendNotification(method, params);
  }

  /**
   * Create server options for the Language Server
   */
  private createServerOptions(): ServerOptions {
    // Path to the server module (bundled with extension)
    const serverModule = this.context.asAbsolutePath(
      path.join('server', 'server.js')
    );

    // Debug options for the server
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    return {
      run: {
        module: serverModule,
        transport: TransportKind.ipc
      },
      debug: {
        module: serverModule,
        transport: TransportKind.ipc,
        options: debugOptions
      }
    };
  }

  /**
   * Create client options for the Language Client
   */
  private createClientOptions(): LanguageClientOptions {
    return {
      // Register the server for yaml and json files
      documentSelector: [
        { scheme: 'file', language: 'yaml' },
        { scheme: 'file', language: 'json' },
        { scheme: 'file', pattern: '**/*.{yaml,yml,json}' }
      ],

      // Synchronize configuration section to the server
      synchronize: {
        configurationSection: 'postmanLintServer',
        fileEvents: [
          vscode.workspace.createFileSystemWatcher('**/*.{yaml,yml,json}')
        ]
      },

      // Output channel for server logs
      outputChannel: this.outputChannel,
      
      // Reveal output channel on errors
      revealOutputChannelOn: RevealOutputChannelOn.Error,

      // Initialize options
      initializationOptions: {
        settings: vscode.workspace.getConfiguration('postmanLintServer')
      },

      // Middleware for custom handling
      middleware: {
        provideDocumentFormattingEdits: undefined, // Disable formatting
        provideDocumentRangeFormattingEdits: undefined, // Disable range formatting
        
        // Custom diagnostic handling
        handleDiagnostics: (uri, diagnostics, next) => {
          // Filter diagnostics to only show ones from our server
          const filteredDiagnostics = diagnostics.filter(diagnostic => {
            return diagnostic.source === 'postman-governance';
          });

          next(uri, filteredDiagnostics);
        },

      }
    };
  }
}
