import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AuthStatus } from 'postman-lint-server-shared';

/**
 * Manages Postman CLI authentication by reading from ~/.postman/postmanrc
 * Refactored from unified.js getPostmanApiKey function
 */
export class AuthManager {
  private readonly postmanrcPath: string;

  constructor() {
    this.postmanrcPath = path.join(os.homedir(), '.postman', 'postmanrc');
  }

  /**
   * Get Postman API key from postmanrc file
   * Returns null if not found or invalid
   */
  public async getPostmanApiKey(): Promise<string | null> {
    try {
      // Check if file exists
      const fileExists = await fs.access(this.postmanrcPath).then(() => true).catch(() => false);
      if (!fileExists) {
        return null;
      }

      // Read and parse the config file
      const configData = await fs.readFile(this.postmanrcPath, 'utf8');
      const config = JSON.parse(configData);

      if (
        config.login &&
        config.login._profiles &&
        config.login._profiles.length > 0
      ) {
        // Get the default profile or first profile
        const profile =
          config.login._profiles.find((p: any) => p.alias === 'default') ||
          config.login._profiles[0];
        
        if (profile && profile.postmanApiKey) {
          return profile.postmanApiKey;
        }
      }
    } catch (error) {
      console.warn(`Failed to read Postman API key: ${error}`);
      return null;
    }

    return null;
  }

  /**
   * Get comprehensive authentication status
   */
  public async getAuthStatus(): Promise<AuthStatus> {
    try {
      const apiKey = await this.getPostmanApiKey();

      if (!apiKey) {
        return {
          isAuthenticated: false,
          error: 'No Postman API key found. Please run: postman login --with-api-key YOUR_KEY'
        };
      }

      // Try to get profile information
      const configData = await fs.readFile(this.postmanrcPath, 'utf8');
      const config = JSON.parse(configData);
      
      let profile = 'default';
      if (config.login && config.login._profiles && config.login._profiles.length > 0) {
        const activeProfile = config.login._profiles.find((p: any) => p.alias === 'default') ||
                              config.login._profiles[0];
        profile = activeProfile.alias || activeProfile.id || 'unknown';
      }

      return {
        isAuthenticated: true,
        apiKey,
        profile
      };

    } catch (error) {
      return {
        isAuthenticated: false,
        error: `Failed to check authentication: ${error}`
      };
    }
  }

  /**
   * Check if the postmanrc file exists
   */
  public async hasPostmanrcFile(): Promise<boolean> {
    try {
      await fs.access(this.postmanrcPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the path to the postmanrc file
   */
  public getPostmanrcPath(): string {
    return this.postmanrcPath;
  }
}
