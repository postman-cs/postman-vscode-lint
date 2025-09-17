import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PostmanIssue, IssueSummary } from 'postman-lint-server-shared';

/**
 * Options for GovernanceScorer configuration
 */
export interface GovernanceScorerOptions {
  mode?: string;
  teamDomain?: string;
  workspaceId?: string;
}

/**
 * Result of scoring a specification file
 */
export interface ScoreResult {
  score: number;
  violations: PostmanIssue[];
  violationCount: number;
  issues: PostmanIssue[];
  summary: IssueSummary;
  api: string;
  timestamp: string;
  error?: string;
}

/**
 * GovernanceScorer class - refactored from unified.js for LSP integration
 * Handles Postman CLI execution and output parsing
 */
export class GovernanceScorer {
  private apiKey: string;
  private mode: string;
  private teamDomain: string;
  private workspaceId: string;

  constructor(apiKey: string, options: GovernanceScorerOptions = {}) {
    this.apiKey = apiKey;
    this.mode = options.mode || 'local';
    this.teamDomain = options.teamDomain || '';
    this.workspaceId = options.workspaceId || '';
  }

  /**
   * Execute command by redirecting to temp file to avoid truncation issues
   * Refactored from unified.js executeWithTempFile method
   */
  private async executeWithTempFile(command: string, args: string[], apiKey: string): Promise<{
    stdout: string;
    stderr: string;
    code: number | null;
  }> {
    const tempFile = path.join(os.tmpdir(), `postman-output-${Date.now()}.txt`);

    return new Promise((resolve, reject) => {
      // Redirect output to temp file to bypass all buffering/truncation
      const fullCommand = `POSTMAN_API_KEY="${apiKey}" ${command} ${args.join(' ')} > "${tempFile}" 2>&1`;

      const child = spawn('sh', ['-c', fullCommand], {
        stdio: ['ignore', 'inherit', 'inherit'],
        env: { ...process.env, POSTMAN_API_KEY: apiKey },
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Command timeout after 10 minutes'));
      }, 600000);

      child.on('close', async (code) => {
        clearTimeout(timeout);

        try {
          // Read the complete output from temp file
          const stdout = await fs.readFile(tempFile, 'utf8');

          // Clean up temp file
          try {
            await fs.unlink(tempFile);
          } catch (cleanupError) {
            console.warn(`Failed to cleanup temp file: ${cleanupError}`);
          }

          resolve({ stdout, stderr: '', code });
        } catch (readError) {
          reject(new Error(`Failed to read output file: ${readError}`));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Score a spec file using Postman CLI governance linting
   * Refactored from unified.js scoreSpecFile method
   */
  public async scoreSpecFile(specPath: string): Promise<ScoreResult> {
    try {
      let stdout = '';

      try {
        // Use temp file approach to completely bypass any truncation issues
        const result = await this.executeWithTempFile('postman', ['api', 'lint', specPath], this.apiKey);
        stdout = result.stdout;

      } catch (error) {
        // Command failed, but check if we got any output
        stdout = (error as any).stdout || (error as Error).message || '';
      }

      // Check if file not found or parsing error
      if (stdout.includes('Error:') && stdout.includes("Couldn't parse")) {
        return {
          score: 0,
          violations: [],
          violationCount: 0,
          issues: [],
          summary: { total: 0, error: 0, warn: 0, info: 0, hint: 0 },
          api: path.basename(specPath),
          timestamp: new Date().toISOString(),
          error: 'Failed to parse API specification'
        };
      }

      // Parse detailed issues from table output
      const { issues, summary } = this.parseStdoutToIssuesAndSummary(stdout);
      const score = this.computeScore(issues);


      return {
        score,
        violations: issues, // Keep for backward compatibility
        violationCount: issues.length,
        issues, // Detailed array for LSP
        summary, // Summary counts
        api: path.basename(specPath),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        score: 0,
        violations: [],
        violationCount: 0,
        issues: [],
        summary: { total: 0, error: 0, warn: 0, info: 0, hint: 0 },
        api: path.basename(specPath),
        timestamp: new Date().toISOString(),
        error: (error as Error).message
      };
    }
  }

  /**
   * Normalize severity to consistent lowercase format
   * Refactored from unified.js normalizeSeverity method
   */
  private normalizeSeverity(severity: any): PostmanIssue['severity'] {
    if (!severity) return 'hint';
    const cleaned = severity.toString().toLowerCase().trim();

    // Map various input formats to standard expectations
    switch (cleaned) {
      case 'error':
      case 'errors':
        return 'error';
      case 'warn':
      case 'warning':
      case 'warnings':
        return 'warn';
      case 'info':
      case 'information':
        return 'info';
      case 'hint':
      case 'hints':
      default:
        return 'hint';
    }
  }

  /**
   * Parse stdout table format to extract detailed issues and summary
   * Handles multiple tables (Governance, Security, etc.)
   * Refactored from unified.js parseStdoutToIssuesAndSummary method
   */
  private parseStdoutToIssuesAndSummary(stdout: string): { issues: PostmanIssue[]; summary: IssueSummary } {
    const clean = stdout.replace(/\x1b\[[0-9;]*m/g, ''); // Remove ANSI codes
    const lines = clean.split('\n');
    const issues: PostmanIssue[] = [];
    let currentValidationType = 'governance';

    // Parse all table rows across multiple validation types
    for (const line of lines) {
      // Detect validation type headers
      if (line.includes('Validation Type:')) {
        const typeMatch = line.match(/Validation Type:\s*(\w+)/i);
        if (typeMatch) {
          currentValidationType = typeMatch[1].toLowerCase();
        }
        continue;
      }

      if (!line.includes('│')) continue;

      const row = line
        .split('│')
        .map((s) => s.trim())
        .filter(Boolean);

      // Skip headers and separators
      if (
        row.some(
          (cell) =>
            cell.includes('Range') ||
            cell.includes('Severity') ||
            cell.includes('─')
        )
      ) {
        continue;
      }

      // Expected columns: Range, Severity, Description, Path (Path may be empty)
      if (row.length >= 3) {
        const [range, severity, description, pathStr = ''] = row;

        // Extract line and column from range (e.g., "4:12")
        let line = 0,
          column = 0;
        const rangeMatch = range.match(/^(\d+):(\d+)$/);
        if (rangeMatch) {
          line = parseInt(rangeMatch[1]);
          column = parseInt(rangeMatch[2]);
        }

        // Normalize severity to match expected format
        const normalizedSeverity = this.normalizeSeverity(severity);

        issues.push({
          severity: normalizedSeverity,
          rule: `${currentValidationType}-rule`, // Include validation type in rule
          message: description || '',
          path: pathStr || '',
          line: line,
          column: column,
        });
      }
    }

    // If table parsing failed, try to extract from summary line
    if (issues.length === 0) {
      const summaryRegex =
        /.*?(\d+)\s+problems?\s*\((\d+)\s+errors?,\s*(\d+)\s+warnings?,\s*(\d+)\s+infos?,\s*(\d+)\s+hints?\)/;
      const summaryMatch = clean.match(summaryRegex);
      if (summaryMatch) {
        const [, , errors, warnings, infos, hints] = summaryMatch;

        // Create generic issues based on counts
        for (let i = 0; i < parseInt(errors); i++) {
          issues.push({
            severity: this.normalizeSeverity('error'),
            rule: 'governance-rule',
            message: 'Governance error',
            path: '',
            line: 0,
            column: 0,
          });
        }
        for (let i = 0; i < parseInt(warnings); i++) {
          issues.push({
            severity: this.normalizeSeverity('warning'),
            rule: 'governance-rule',
            message: 'Governance warning',
            path: '',
            line: 0,
            column: 0,
          });
        }
        for (let i = 0; i < parseInt(infos); i++) {
          issues.push({
            severity: this.normalizeSeverity('info'),
            rule: 'governance-rule',
            message: 'Governance info',
            path: '',
            line: 0,
            column: 0,
          });
        }
        for (let i = 0; i < parseInt(hints); i++) {
          issues.push({
            severity: this.normalizeSeverity('hint'),
            rule: 'governance-rule',
            message: 'Governance hint',
            path: '',
            line: 0,
            column: 0,
          });
        }
      }
    }

    const summary = this.summarizeIssues(issues);
    return { issues, summary };
  }

  /**
   * Create summary counts from detailed issues
   * Refactored from unified.js summarizeIssues method
   */
  private summarizeIssues(issues: PostmanIssue[]): IssueSummary {
    const summary: IssueSummary = {
      total: issues.length,
      error: 0,
      warn: 0,
      info: 0,
      hint: 0,
    };
    for (const issue of issues) {
      // Use normalized severity for consistent counting
      const normalizedSeverity = this.normalizeSeverity(issue.severity);
      if (normalizedSeverity === 'error') summary.error++;
      else if (normalizedSeverity === 'warn') summary.warn++;
      else if (normalizedSeverity === 'info') summary.info++;
      else summary.hint++;
    }
    return summary;
  }

  /**
   * Compute score from detailed issues
   * Refactored from unified.js computeScore method
   */
  private computeScore(issues: PostmanIssue[]): number {
    let score = 100;
    for (const issue of issues) {
      // Use normalized severity for consistent scoring
      const normalizedSeverity = this.normalizeSeverity(issue.severity);
      switch (normalizedSeverity) {
        case 'error':
          score -= 10;
          break;
        case 'warn':
          score -= 2.5;
          break;
        case 'info':
          score -= 0.5;
          break;
        default:
          score -= 0.05; // hint
      }
    }
    return Math.max(0, Math.round(score * 100) / 100);
  }
}
