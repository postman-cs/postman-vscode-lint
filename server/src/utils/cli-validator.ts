import { spawn } from 'child_process';
import { CliInfo } from 'postman-lint-server-shared';

/**
 * Validates Postman CLI availability and compatibility
 */
export class CliValidator {
  private cliPath: string;

  constructor(cliPath: string = 'postman') {
    this.cliPath = cliPath;
  }

  /**
   * Update the CLI path
   */
  public setCliPath(cliPath: string): void {
    this.cliPath = cliPath;
  }

  /**
   * Validate that Postman CLI is available and get version info
   */
  public async validateCli(): Promise<CliInfo> {
    try {
      // Try to run 'postman --version' to check availability
      const result = await this.executeCommand(this.cliPath, ['--version']);

      if (result.success && result.stdout) {
        const version = this.extractVersion(result.stdout);

        // Check if version is compatible (minimum version requirement)
        const isCompatible = this.isVersionCompatible(version);

        if (!isCompatible) {
          return {
            available: false,
            version,
            path: this.cliPath,
            error: `Postman CLI version ${version} is not compatible. Please update to the latest version.`
          };
        }

        return {
          available: true,
          version,
          path: this.cliPath
        };
      }

      // CLI command failed
      return {
        available: false,
        path: this.cliPath,
        error: `Postman CLI not found at '${this.cliPath}'. Please install Postman CLI or update the path in settings.`
      };

    } catch (error) {
      return {
        available: false,
        path: this.cliPath,
        error: `Failed to validate Postman CLI: ${error}`
      };
    }
  }

  /**
   * Check if the CLI can execute the 'api lint' command
   */
  public async validateLintCommand(): Promise<{ success: boolean; error?: string }> {
    try {
      // Try to run 'postman api lint --help' to check if the command exists
      const result = await this.executeCommand(this.cliPath, ['api', 'lint', '--help']);

      if (result.success) {
        return { success: true };
      }

      return {
        success: false,
        error: 'Postman CLI does not support the "api lint" command. Please update to the latest version.'
      };

    } catch (error) {
      return {
        success: false,
        error: `Failed to validate lint command: ${error}`
      };
    }
  }

  /**
   * Execute a command and return the result
   */
  private async executeCommand(command: string, args: string[], timeoutMs: number = 10000): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    code: number | null;
  }> {
    return new Promise((resolve) => {
      // Use shell execution for better compatibility with different CLI installations
      const fullCommand = `"${command}" ${args.map(arg => `"${arg}"`).join(' ')}`;
      const child = spawn('sh', ['-c', fullCommand], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Set a timeout
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          stdout,
          stderr: stderr + '\nCommand timed out',
          code: null
        });
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          success: code === 0,
          stdout,
          stderr,
          code
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          stdout,
          stderr: stderr + error.message,
          code: null
        });
      });
    });
  }

  /**
   * Extract version from CLI output
   */
  private extractVersion(output: string): string {
    // Try to extract version from various possible formats
    const versionPatterns = [
      /version\s+(\d+\.\d+\.\d+)/i,
      /v?(\d+\.\d+\.\d+)/,
      /(\d+\.\d+\.\d+)/
    ];

    for (const pattern of versionPatterns) {
      const match = output.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return 'unknown';
  }

  /**
   * Check if the CLI version is compatible
   * For now, we'll be permissive and only reject very old versions
   */
  private isVersionCompatible(version: string): boolean {
    if (version === 'unknown') {
      // If we can't determine the version, assume it's compatible
      return true;
    }

    try {
      const [major, minor] = version.split('.').map(Number);

      // Postman CLI version 1.x.x and above are compatible
      // (Current versions are 1.x.x as of 2024)
      if (major < 1) {
        return false;
      }

      return true;
    } catch {
      // If version parsing fails, assume compatible
      return true;
    }
  }

  /**
   * Get detailed CLI information for debugging
   */
  public async getDetailedCliInfo(): Promise<{
    pathExists: boolean;
    versionInfo: CliInfo;
    lintCommandAvailable: boolean;
    environmentInfo: {
      NODE_VERSION?: string;
      PATH?: string;
      POSTMAN_API_KEY?: string;
    };
  }> {
    const versionInfo = await this.validateCli();
    const lintCommand = await this.validateLintCommand();
    
    return {
      pathExists: versionInfo.available,
      versionInfo,
      lintCommandAvailable: lintCommand.success,
      environmentInfo: {
        NODE_VERSION: process.version,
        PATH: process.env.PATH,
        POSTMAN_API_KEY: process.env.POSTMAN_API_KEY ? '[REDACTED]' : undefined
      }
    };
  }
}
