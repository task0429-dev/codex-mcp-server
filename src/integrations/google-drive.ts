import { createSign } from "crypto";
import { z } from "zod";
import { AccessPolicy } from "../policies/policies";
import { logger } from "../core/logger";
import { config } from "../config/config";
import { requestJson, requestText } from "../core/api-client";

const ListFilesSchema = z.object({
  query: z.string().optional().describe("Drive search query"),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
  agentName: z.string().describe("Agent requesting access")
});

const GetFileSchema = z.object({
  fileId: z.string().describe("Google Drive file ID"),
  downloadAsText: z.boolean().optional().default(false),
  agentName: z.string().describe("Agent requesting access")
});

const CreateFolderSchema = z.object({
  name: z.string().describe("Folder name"),
  parentId: z.string().optional().describe("Optional parent folder ID"),
  agentName: z.string().describe("Agent requesting access")
});

const UploadTextFileSchema = z.object({
  name: z.string().describe("File name"),
  content: z.string().describe("Text file content"),
  parentId: z.string().optional().describe("Optional parent folder ID"),
  mimeType: z.string().optional().default("text/plain"),
  agentName: z.string().describe("Agent requesting access")
});

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
}

interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
}

export class GoogleDriveIntegration {
  private static cachedToken: { token: string; expiresAt: number } | null = null;

  private static encodeBase64Url(value: string): string {
    return Buffer.from(value)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  private static async getTokenFromRefreshToken(): Promise<string | null> {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REFRESH_TOKEN) {
      return null;
    }

    const body = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      refresh_token: config.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token"
    }).toString();

    const tokenResponse = await requestJson<OAuthTokenResponse>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    this.cachedToken = {
      token: tokenResponse.access_token,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000
    };

    return tokenResponse.access_token;
  }

  private static async getTokenFromServiceAccount(): Promise<string | null> {
    if (!config.GOOGLE_SERVICE_ACCOUNT_EMAIL || !config.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = this.encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = this.encodeBase64Url(
      JSON.stringify({
        iss: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        scope: "https://www.googleapis.com/auth/drive",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now
      })
    );

    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const signature = signer.sign(config.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, "base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const assertion = `${header}.${payload}.${signature}`;
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString();

    const tokenResponse = await requestJson<OAuthTokenResponse>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    this.cachedToken = {
      token: tokenResponse.access_token,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000
    };

    return tokenResponse.access_token;
  }

  private static async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.token;
    }

    const refreshTokenAccessToken = await this.getTokenFromRefreshToken();
    if (refreshTokenAccessToken) {
      return refreshTokenAccessToken;
    }

    if (config.GOOGLE_DRIVE_ACCESS_TOKEN) {
      return config.GOOGLE_DRIVE_ACCESS_TOKEN;
    }

    const serviceAccountAccessToken = await this.getTokenFromServiceAccount();
    if (serviceAccountAccessToken) {
      return serviceAccountAccessToken;
    }

    throw new Error(
      "Google Drive credentials not configured. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN, GOOGLE_DRIVE_ACCESS_TOKEN, or service account credentials."
    );
  }

  private static async getHeaders(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${await this.getAccessToken()}`
    };
  }

  static async listFiles(input: z.infer<typeof ListFilesSchema>) {
    const { query, pageSize, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "google_drive", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Google Drive`);
    }

    const params = new URLSearchParams({
      pageSize: String(pageSize),
      fields: "files(id,name,mimeType,webViewLink,modifiedTime,size,parents),nextPageToken"
    });
    if (query) params.set("q", query);

    const response = await requestJson<{ files: GoogleDriveFile[]; nextPageToken?: string }>(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { headers: await this.getHeaders() }
    );

    logger.info(`Agent ${agentName} listed Google Drive files`, { count: response.files.length });
    return { files: response.files, count: response.files.length, nextPageToken: response.nextPageToken };
  }

  static async getFile(input: z.infer<typeof GetFileSchema>) {
    const { fileId, downloadAsText, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "google_drive", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Google Drive`);
    }

    const headers = await this.getHeaders();
    const metadata = await requestJson<GoogleDriveFile>(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,webViewLink,modifiedTime,size,parents`,
      { headers }
    );

    let content: string | undefined;
    if (downloadAsText) {
      // Google Docs files are not downloadable with alt=media and must be exported.
      if (metadata.mimeType === "application/vnd.google-apps.document") {
        content = await requestText(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, { headers });
      } else {
        content = await requestText(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers });
      }
    }

    logger.info(`Agent ${agentName} retrieved Google Drive file`, { fileId, downloadAsText });
    return { file: metadata, content };
  }

  static async createFolder(input: z.infer<typeof CreateFolderSchema>) {
    const { name, parentId, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "google_drive", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for Google Drive`);
    }

    const response = await requestJson<GoogleDriveFile>("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        ...(await this.getHeaders()),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId || config.GOOGLE_DRIVE_DEFAULT_FOLDER_ID].filter(Boolean)
      })
    });

    logger.info(`Agent ${agentName} created Google Drive folder`, { name, folderId: response.id });
    return { folder: response };
  }

  static async uploadTextFile(input: z.infer<typeof UploadTextFileSchema>) {
    const { name, content, parentId, mimeType, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "google_drive", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for Google Drive`);
    }

    const boundary = `codex-${Date.now()}`;
    const metadata = {
      name,
      mimeType,
      parents: [parentId || config.GOOGLE_DRIVE_DEFAULT_FOLDER_ID].filter(Boolean)
    };

    const multipartBody = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      "",
      content,
      `--${boundary}--`
    ].join("\r\n");

    const response = await requestJson<GoogleDriveFile>(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,modifiedTime,size,parents",
      {
        method: "POST",
        headers: {
          ...(await this.getHeaders()),
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      }
    );

    logger.info(`Agent ${agentName} uploaded Google Drive file`, { name, fileId: response.id });
    return { file: response };
  }
}

export const googleDriveTools = [
  {
    name: "google_drive_list_files",
    description: "List Google Drive files available to the configured account",
    inputSchema: ListFilesSchema,
    handler: GoogleDriveIntegration.listFiles.bind(GoogleDriveIntegration)
  },
  {
    name: "google_drive_get_file",
    description: "Get Google Drive file metadata and optionally download plain text content",
    inputSchema: GetFileSchema,
    handler: GoogleDriveIntegration.getFile.bind(GoogleDriveIntegration)
  },
  {
    name: "google_drive_create_folder",
    description: "Create a folder in Google Drive",
    inputSchema: CreateFolderSchema,
    handler: GoogleDriveIntegration.createFolder.bind(GoogleDriveIntegration)
  },
  {
    name: "google_drive_upload_text_file",
    description: "Upload a text file into Google Drive",
    inputSchema: UploadTextFileSchema,
    handler: GoogleDriveIntegration.uploadTextFile.bind(GoogleDriveIntegration)
  }
];
