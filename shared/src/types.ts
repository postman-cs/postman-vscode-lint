import { Diagnostic, DiagnosticSeverity, Range, Position } from 'vscode-languageserver-types';

/**
 * Configuration options for the Postman Lint Server
 */
export interface PostmanLintServerSettings {
  /** Enable/disable the linting functionality */
  enable: boolean;
  /** Path to the Postman CLI executable */
  postmanCliPath: string;
  /** Lint files when they are saved */
  lintOnSave: boolean;
  /** Lint files as they are being edited (real-time) */
  lintOnChange: boolean;
  /** Delay in milliseconds for real-time linting (debounce) */
  lintOnChangeDelay: number;
  /** Maximum file size in bytes to lint */
  maxFileSize: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_SETTINGS: PostmanLintServerSettings = {
  enable: true,
  postmanCliPath: 'postman',
  lintOnSave: true,
  lintOnChange: false,
  lintOnChangeDelay: 500,
  maxFileSize: 1048576 // 1MB
};

/**
 * Postman CLI issue format (from unified.js parsing)
 */
export interface PostmanIssue {
  severity: 'error' | 'warn' | 'info' | 'hint';
  line: number;
  column: number;
  message: string;
  rule: string;
  path?: string;
}

/**
 * Summary of issues by severity
 */
export interface IssueSummary {
  total: number;
  error: number;
  warn: number;
  info: number;
  hint: number;
}

/**
 * Result of linting a file
 */
export interface LintResult {
  success: boolean;
  issues: PostmanIssue[];
  summary: IssueSummary;
  error?: string;
  timestamp: string;
}

/**
 * Authentication status from Postman CLI
 */
export interface AuthStatus {
  isAuthenticated: boolean;
  apiKey?: string;
  profile?: string;
  error?: string;
}

/**
 * Postman CLI information
 */
export interface CliInfo {
  available: boolean;
  version?: string;
  path: string;
  error?: string;
}

/**
 * File type detection result
 */
export interface FileTypeInfo {
  isSupported: boolean;
  type?: 'openapi-3.0' | 'swagger-2.0' | 'collection' | 'unknown';
  version?: string;
}

/**
 * Convert PostmanIssue severity to LSP DiagnosticSeverity
 */
export function toVSCodeSeverity(severity: PostmanIssue['severity']): DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return DiagnosticSeverity.Error;
    case 'warn':
      return DiagnosticSeverity.Warning;
    case 'info':
      return DiagnosticSeverity.Information;
    case 'hint':
    default:
      return DiagnosticSeverity.Hint;
  }
}

/**
 * Create a VS Code Range from line and column numbers (0-based)
 */
export function createRange(line: number, column: number): Range {
  // Convert from 1-based (Postman CLI) to 0-based (VS Code)
  const adjustedLine = Math.max(0, line - 1);
  const adjustedColumn = Math.max(0, column - 1);
  
  const start: Position = { line: adjustedLine, character: adjustedColumn };
  const end: Position = { line: adjustedLine, character: adjustedColumn + 1 };
  
  return { start, end };
}

/**
 * Convert PostmanIssue to VS Code Diagnostic
 */
export function toDiagnostic(issue: PostmanIssue): Diagnostic {
  return {
    range: createRange(issue.line, issue.column),
    severity: toVSCodeSeverity(issue.severity),
    message: issue.message,
    source: 'postman-governance',
    code: issue.rule
  };
}

/**
 * Command identifiers used by the extension
 */
export const COMMANDS = {
  LINT_CURRENT_FILE: 'postmanLintServer.lintCurrentFile',
  LINT_WORKSPACE: 'postmanLintServer.lintWorkspace',
  CHECK_AUTH_STATUS: 'postmanLintServer.checkAuthStatus',
  RELOAD_CONFIG: 'postmanLintServer.reloadConfig'
} as const;

/**
 * Notification types for client-server communication
 */
export const NOTIFICATIONS = {
  CONFIG_CHANGED: 'postmanLintServer/configChanged',
  AUTH_STATUS_CHANGED: 'postmanLintServer/authStatusChanged',
  CLI_STATUS_CHANGED: 'postmanLintServer/cliStatusChanged'
} as const;
