import {
  createConnection,
  TextDocuments,
  Diagnostic,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  Connection,
  WorkspaceFolder
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { 
  PostmanLintServerSettings, 
  DEFAULT_SETTINGS,
  LintResult,
  toDiagnostic,
  NOTIFICATIONS
} from 'postman-lint-server-shared';
import { GovernanceScorer } from './linting/governance-scorer';
import { AuthManager } from './utils/auth-manager';
import { CliValidator } from './utils/cli-validator';

/**
 * Main Language Server class for Postman API Governance validation
 */
class PostmanLintServer {
  private connection: Connection;
  private documents: TextDocuments<TextDocument>;
  private settings: PostmanLintServerSettings = DEFAULT_SETTINGS;
  private governanceScorer: GovernanceScorer | null = null;
  private authManager: AuthManager;
  private cliValidator: CliValidator;
  private hasConfigurationCapability = false;
  private hasWorkspaceFolderCapability = false;
  private hasDiagnosticRelatedInformationCapability = false;

  constructor() {
    // Create a connection for the server using ProposedFeatures
    this.connection = createConnection(ProposedFeatures.all);

    // Create a simple text document manager
    this.documents = new TextDocuments(TextDocument);

    // Initialize utility classes
    this.authManager = new AuthManager();
    this.cliValidator = new CliValidator(this.settings.postmanCliPath);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Connection event handlers
    this.connection.onInitialize(this.onInitialize.bind(this));
    this.connection.onInitialized(this.onInitialized.bind(this));
    this.connection.onDidChangeConfiguration(this.onDidChangeConfiguration.bind(this));

    // Document event handlers
    this.documents.onDidClose(this.onDidCloseDocument.bind(this));
    this.documents.onDidSave(this.onDidSaveDocument.bind(this));
    this.documents.onDidChangeContent(this.onDidChangeDocument.bind(this));

    // Completion handler
    this.connection.onCompletion(this.onCompletion.bind(this));
    this.connection.onCompletionResolve(this.onCompletionResolve.bind(this));

    // Command handlers
    this.connection.onRequest('postmanLintServer/lintDocument', this.lintDocument.bind(this));
    this.connection.onRequest('postmanLintServer/checkAuthStatus', this.checkAuthStatus.bind(this));
    this.connection.onRequest('postmanLintServer/getCliInfo', this.getCliInfo.bind(this));

    // Make the text document manager listen on the connection
    this.documents.listen(this.connection);

    // Listen on the connection
    this.connection.listen();
  }

  private async onInitialize(params: InitializeParams): Promise<InitializeResult> {
    const capabilities = params.capabilities;

    // Store capability information
    this.hasConfigurationCapability = !!(
      capabilities.workspace && !!capabilities.workspace.configuration
    );
    this.hasWorkspaceFolderCapability = !!(
      capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    this.hasDiagnosticRelatedInformationCapability = !!(
      capabilities.textDocument &&
      capabilities.textDocument.publishDiagnostics &&
      capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental
      }
    };

    if (this.hasWorkspaceFolderCapability) {
      result.capabilities.workspace = {
        workspaceFolders: {
          supported: true
        }
      };
    }

    return result;
  }

  private async onInitialized(): Promise<void> {
    if (this.hasConfigurationCapability) {
      // Register for configuration changes
      this.connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }

    if (this.hasWorkspaceFolderCapability) {
      this.connection.workspace.onDidChangeWorkspaceFolders((event) => {
        // Handle workspace folder changes
      });
    }

    // Initialize CLI validation and authentication
    await this.initializeServer();
  }

  private async initializeServer(): Promise<void> {
    try {
      // Check CLI availability
      const cliInfo = await this.cliValidator.validateCli();
      if (!cliInfo.available) {
        this.connection.window.showWarningMessage(
          `Postman CLI not found at '${this.settings.postmanCliPath}'. Please install Postman CLI or update the path in settings.`
        );
        return;
      }

      // Check authentication
      const authStatus = await this.authManager.getAuthStatus();
      if (!authStatus.isAuthenticated) {
        this.connection.window.showWarningMessage(
          'Postman CLI authentication required. Please run: postman login --with-api-key YOUR_KEY'
        );
        return;
      }

      // Initialize governance scorer
      this.governanceScorer = new GovernanceScorer(authStatus.apiKey!, {
        mode: 'local',
        teamDomain: '',
        workspaceId: ''
      });

    } catch (error) {
      this.connection.console.error(`Failed to initialize server: ${error}`);
      this.connection.window.showErrorMessage(
        `Failed to initialize Postman Lint Server: ${error}`
      );
    }
  }

  private async onDidChangeConfiguration(): Promise<void> {
    if (this.hasConfigurationCapability) {
      // Fetch new configuration
      const newSettings = await this.connection.workspace.getConfiguration('postmanLintServer');
      this.settings = { ...DEFAULT_SETTINGS, ...newSettings };
    } else {
      // Use default settings
      this.settings = DEFAULT_SETTINGS;
    }

    // Update CLI validator with new path
    this.cliValidator = new CliValidator(this.settings.postmanCliPath);

    // Re-validate all open documents
    this.documents.all().forEach(this.validateTextDocument.bind(this));
  }

  private onDidCloseDocument(event: { document: TextDocument }): void {
    // Clear diagnostics for closed document
    this.connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  }

  private async onDidSaveDocument(event: { document: TextDocument }): Promise<void> {
    if (this.settings.lintOnSave) {
      await this.validateTextDocument(event.document);
    }
  }

  private async onDidChangeDocument(change: { document: TextDocument }): Promise<void> {
    if (this.settings.lintOnChange) {
      // Implement debouncing for real-time linting
      setTimeout(async () => {
        await this.validateTextDocument(change.document);
      }, this.settings.lintOnChangeDelay);
    }
  }

  private async validateTextDocument(textDocument: TextDocument): Promise<void> {
    if (!this.settings.enable || !this.governanceScorer) {
      return;
    }

    try {
      // Check file size limit
      const content = textDocument.getText();
      if (content.length > this.settings.maxFileSize) {
        this.connection.console.warn(
          `File ${textDocument.uri} exceeds maximum size limit (${this.settings.maxFileSize} bytes)`
        );
        return;
      }

      // Check if file type is supported
      if (!this.isSupportedFile(textDocument.uri)) {
        return;
      }

      // Check if content is actually OpenAPI/Swagger
      if (!this.isOpenAPIContent(content)) {
        // Clear any existing diagnostics for non-OpenAPI files
        this.connection.sendDiagnostics({
          uri: textDocument.uri,
          diagnostics: []
        });
        return;
      }

      // Create temporary file and lint it
      const result = await this.lintDocumentContent(content);
      
      // Convert issues to diagnostics
      const diagnostics: Diagnostic[] = result.issues.map(toDiagnostic);

      // Send diagnostics to VS Code
      this.connection.sendDiagnostics({
        uri: textDocument.uri,
        diagnostics
      });

    } catch (error) {
      this.connection.console.error(`Error validating ${textDocument.uri}: ${error}`);
      
      // Send error as diagnostic
      const errorDiagnostic: Diagnostic = {
        severity: 1, // Error
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 }
        },
        message: `Postman linting failed: ${error}`,
        source: 'postman-governance'
      };

      this.connection.sendDiagnostics({
        uri: textDocument.uri,
        diagnostics: [errorDiagnostic]
      });
    }
  }

  private async lintDocumentContent(content: string): Promise<LintResult> {
    if (!this.governanceScorer) {
      throw new Error('Governance scorer not initialized');
    }

    // Create a temporary file
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `postman-lint-${Date.now()}.yaml`);

    try {
      // Write content to temp file
      fs.writeFileSync(tempFile, content);

      // Use governance scorer to lint the file
      const result = await this.governanceScorer.scoreSpecFile(tempFile);

      return {
        success: true,
        issues: result.issues || [],
        summary: result.summary || { total: 0, error: 0, warn: 0, info: 0, hint: 0 },
        timestamp: new Date().toISOString()
      };

    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (cleanupError) {
        this.connection.console.warn(`Failed to cleanup temp file: ${cleanupError}`);
      }
    }
  }

  private isSupportedFile(uri: string): boolean {
    const supportedExtensions = ['.yaml', '.yml', '.json'];
    return supportedExtensions.some(ext => uri.toLowerCase().endsWith(ext));
  }

  private isOpenAPIContent(content: string): boolean {
    try {
      // Try to parse as JSON or YAML and check for OpenAPI/Swagger markers
      const hasOpenAPIMarker = content.includes('openapi:') ||
                               content.includes('"openapi"') ||
                               content.includes('swagger:') ||
                               content.includes('"swagger"');

      return hasOpenAPIMarker;
    } catch {
      return false;
    }
  }

  // Command handlers
  private async lintDocument(params: { uri: string }): Promise<LintResult | null> {
    const document = this.documents.get(params.uri);
    if (!document) {
      return null;
    }

    const content = document.getText();
    return await this.lintDocumentContent(content);
  }

  private async checkAuthStatus(): Promise<any> {
    return await this.authManager.getAuthStatus();
  }

  private async getCliInfo(): Promise<any> {
    return await this.cliValidator.validateCli();
  }

  private async onCompletion(params: any): Promise<any> {
    // Basic completion implementation
    // Return empty array for now to prevent errors
    return [];
  }

  private async onCompletionResolve(item: any): Promise<any> {
    // Resolve additional completion item details
    return item;
  }
}

// Start the server only when run directly (not when imported)
if (require.main === module) {
  new PostmanLintServer();
}
