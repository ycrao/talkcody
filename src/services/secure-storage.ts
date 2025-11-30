import { BaseDirectory, exists, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import { logger } from '@/lib/logger';

const AUTH_FILE_NAME = 'talkcody-auth.json';

interface AuthData {
  auth_token?: string;
}

class SecureStorageService {
  private async readAuthData(): Promise<AuthData> {
    try {
      const fileExists = await exists(AUTH_FILE_NAME, { baseDir: BaseDirectory.AppData });
      if (!fileExists) {
        return {};
      }
      const content = await readTextFile(AUTH_FILE_NAME, { baseDir: BaseDirectory.AppData });
      return JSON.parse(content) as AuthData;
    } catch (error) {
      logger.error('Failed to read auth data:', error);
      return {};
    }
  }

  private async writeAuthData(data: AuthData): Promise<void> {
    await writeTextFile(AUTH_FILE_NAME, JSON.stringify(data, null, 2), {
      baseDir: BaseDirectory.AppData,
    });
  }

  async setAuthToken(token: string): Promise<void> {
    const data = await this.readAuthData();
    data.auth_token = token;
    await this.writeAuthData(data);
  }

  async getAuthToken(): Promise<string | null> {
    try {
      const data = await this.readAuthData();
      return data.auth_token || null;
    } catch (error) {
      logger.error('Failed to get auth token:', error);
      return null;
    }
  }

  async removeAuthToken(): Promise<void> {
    try {
      const fileExists = await exists(AUTH_FILE_NAME, { baseDir: BaseDirectory.AppData });
      if (fileExists) {
        await remove(AUTH_FILE_NAME, { baseDir: BaseDirectory.AppData });
      }
    } catch (error) {
      logger.error('Failed to remove auth token:', error);
    }
  }

  async hasAuthToken(): Promise<boolean> {
    const token = await this.getAuthToken();
    return token !== null && token.length > 0;
  }
}

export const secureStorage = new SecureStorageService();
