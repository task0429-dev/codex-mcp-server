import { createSign } from "crypto";
import { config } from "../config/config";
import { requestJson } from "../core/api-client";

interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
}

interface GoogleCalendarEventDate {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface GoogleCalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleCalendarEventDate;
  end?: GoogleCalendarEventDate;
  htmlLink?: string;
}

interface GoogleCalendarEventsResponse {
  items?: GoogleCalendarEvent[];
}

export interface MissionCalendarEvent {
  id: string;
  externalEventId: string;
  source: "google-calendar";
  title: string;
  owner: string;
  linkedProject: string;
  start: string;
  end: string;
  location: string;
  status: string;
  detail: string;
  calendarId: string;
  htmlLink?: string;
}

export interface CalendarCreateInput {
  calendarId?: string;
  title: string;
  owner?: string;
  linkedProject?: string;
  start: string;
  end: string;
  location?: string;
  detail?: string;
}

export interface CalendarUpdateInput {
  calendarId?: string;
  eventId: string;
  title?: string;
  owner?: string;
  linkedProject?: string;
  start?: string;
  end?: string;
  location?: string;
  detail?: string;
}

export class GoogleCalendarService {
  private static cachedToken: { token: string; expiresAt: number } | null = null;

  private static encodeBase64Url(value: string): string {
    return Buffer.from(value)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  static hasCredentials() {
    if (config.GOOGLE_DRIVE_ACCESS_TOKEN && config.GOOGLE_DRIVE_ACCESS_TOKEN.trim()) {
      return true;
    }
    if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REFRESH_TOKEN) {
      return true;
    }
    if (config.GOOGLE_SERVICE_ACCOUNT_EMAIL && config.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
      return true;
    }
    return false;
  }

  private static async getTokenFromRefreshToken(): Promise<string | null> {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REFRESH_TOKEN) {
      return null;
    }

    const body = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      refresh_token: config.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }).toString();

    const tokenResponse = await requestJson<OAuthTokenResponse>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    this.cachedToken = {
      token: tokenResponse.access_token,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000,
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
        scope: "https://www.googleapis.com/auth/calendar",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now,
      })
    );

    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const signature = signer
      .sign(config.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, "base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const assertion = `${header}.${payload}.${signature}`;
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString();

    const tokenResponse = await requestJson<OAuthTokenResponse>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    this.cachedToken = {
      token: tokenResponse.access_token,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000,
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
      "Google Calendar credentials not configured. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN, GOOGLE_DRIVE_ACCESS_TOKEN, or service account credentials."
    );
  }

  private static async getHeaders(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${await this.getAccessToken()}`,
      "Content-Type": "application/json",
    };
  }

  private static normalizeDate(value?: GoogleCalendarEventDate): string {
    if (!value) {
      return new Date().toISOString();
    }
    if (value.dateTime) {
      return new Date(value.dateTime).toISOString();
    }
    if (value.date) {
      return new Date(`${value.date}T09:00:00`).toISOString();
    }
    return new Date().toISOString();
  }

  private static fromGoogleEvent(entry: GoogleCalendarEvent, calendarId: string): MissionCalendarEvent {
    return {
      id: `gcal-${entry.id}`,
      externalEventId: entry.id,
      source: "google-calendar",
      title: entry.summary || "Untitled event",
      owner: "TASK",
      linkedProject: "Calendar",
      start: this.normalizeDate(entry.start),
      end: this.normalizeDate(entry.end),
      location: entry.location || "Google Calendar",
      status: entry.status === "cancelled" ? "cancelled" : "scheduled",
      detail: entry.description || "Imported from Google Calendar.",
      calendarId,
      htmlLink: entry.htmlLink,
    };
  }

  static async listUpcomingEvents(calendarId = "primary", maxResults = 20): Promise<MissionCalendarEvent[]> {
    const encodedCalendarId = encodeURIComponent(calendarId);
    const params = new URLSearchParams({
      maxResults: String(Math.max(1, Math.min(maxResults, 50))),
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: new Date().toISOString(),
    });

    const response = await requestJson<GoogleCalendarEventsResponse>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events?${params.toString()}`,
      { headers: await this.getHeaders() }
    );

    return (response.items || []).map((entry) => this.fromGoogleEvent(entry, calendarId));
  }

  static async createEvent(input: CalendarCreateInput): Promise<MissionCalendarEvent> {
    const calendarId = input.calendarId || "primary";
    const encodedCalendarId = encodeURIComponent(calendarId);
    const response = await requestJson<GoogleCalendarEvent>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events`,
      {
        method: "POST",
        headers: await this.getHeaders(),
        body: JSON.stringify({
          summary: input.title,
          description: input.detail || "",
          location: input.location || "",
          start: { dateTime: new Date(input.start).toISOString(), timeZone: "America/Chicago" },
          end: { dateTime: new Date(input.end).toISOString(), timeZone: "America/Chicago" },
        }),
      }
    );

    const event = this.fromGoogleEvent(response, calendarId);
    event.owner = input.owner || "TASK";
    event.linkedProject = input.linkedProject || "Calendar";
    if (input.detail) {
      event.detail = input.detail;
    }
    return event;
  }

  static async updateEvent(input: CalendarUpdateInput): Promise<MissionCalendarEvent> {
    const calendarId = input.calendarId || "primary";
    const encodedCalendarId = encodeURIComponent(calendarId);
    const encodedEventId = encodeURIComponent(input.eventId);
    const patch: Record<string, unknown> = {};

    if (input.title) {
      patch.summary = input.title;
    }
    if (typeof input.detail === "string") {
      patch.description = input.detail;
    }
    if (typeof input.location === "string") {
      patch.location = input.location;
    }
    if (input.start) {
      patch.start = { dateTime: new Date(input.start).toISOString(), timeZone: "America/Chicago" };
    }
    if (input.end) {
      patch.end = { dateTime: new Date(input.end).toISOString(), timeZone: "America/Chicago" };
    }

    const response = await requestJson<GoogleCalendarEvent>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events/${encodedEventId}`,
      {
        method: "PATCH",
        headers: await this.getHeaders(),
        body: JSON.stringify(patch),
      }
    );

    const event = this.fromGoogleEvent(response, calendarId);
    if (input.owner) {
      event.owner = input.owner;
    }
    if (input.linkedProject) {
      event.linkedProject = input.linkedProject;
    }
    if (typeof input.detail === "string") {
      event.detail = input.detail;
    }
    return event;
  }
}
