const LOGIN_HTML_URL = 'https://cronometer.com/login/';
const LOGIN_API_URL = 'https://cronometer.com/login';
const GWT_BASE_URL = 'https://cronometer.com/cronometer/app';
const EXPORT_URL = 'https://cronometer.com/export';
const GWT_NOCACHE_JS_URL = 'https://cronometer.com/cronometer/cronometer.nocache.js';
const GWT_CACHE_JS_URL = 'https://cronometer.com/cronometer/{permutation}.cache.js';

const DEFAULT_GWT_CONTENT_TYPE = 'text/x-gwt-rpc; charset=UTF-8';
const DEFAULT_GWT_MODULE_BASE = 'https://cronometer.com/cronometer/';
const DEFAULT_GWT_PERMUTATION = 'CBC38FBB0A1527BD5E68722DD9DABD27';
const DEFAULT_GWT_HEADER = '76FC4464E20E53D16663AC9A96A486B3';

const GWT_AUTHENTICATE =
  '7|0|5|https://cronometer.com/cronometer/|{gwt_header}|' +
  'com.cronometer.shared.rpc.CronometerService|authenticate|java.lang.Integer/3438268394|' +
  '1|2|3|4|1|5|5|-300|';

const GWT_GENERATE_AUTH_TOKEN =
  '7|0|8|https://cronometer.com/cronometer/|{gwt_header}|' +
  'com.cronometer.shared.rpc.CronometerService|generateAuthorizationToken|java.lang.String/2004016611|' +
  'I|com.cronometer.shared.user.AuthScope/2065601159|{nonce}|1|2|3|4|4|5|6|6|7|8|{user_id}|3600|7|2|';

const EXPORT_TYPES: Record<string, string> = {
  servings: 'servings',
  daily_summary: 'dailySummary',
  exercises: 'exercises',
  biometrics: 'biometrics',
  notes: 'notes',
};

type CronometerExportType = keyof typeof EXPORT_TYPES;

type CronometerCookies = Record<string, string>;

function parseSetCookieHeader(header: string): Record<string, string> {
  const cookie: Record<string, string> = {};
  const [rawCookie] = header.split(';');
  const [name, value] = rawCookie.split('=');

  if (name && value) {
    cookie[name.trim()] = value.trim();
  }

  return cookie;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class CronometerError extends Error {
  constructor(
    message: string,
    public statusCode = 500,
    public kind = 'cronometer_error'
  ) {
    super(message);
    this.name = 'CronometerError';
  }
}

function parseDate(value: string, name: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new CronometerError(
      `Invalid ${name} date format: ${value}. Expected YYYY-MM-DD.`,
      400,
      'invalid_date'
    );
  }
  return isoDate(parsed);
}

function validateExportType(exportType: string): CronometerExportType {
  if (!Object.prototype.hasOwnProperty.call(EXPORT_TYPES, exportType)) {
    throw new CronometerError(
      `Unsupported Cronometer export type: ${exportType}. Supported values: ${Object.keys(EXPORT_TYPES).join(', ')}.`,
      400,
      'invalid_export_type'
    );
  }
  return exportType as CronometerExportType;
}

class CronometerClient {
  private username: string;
  private password: string;
  private cookies: CronometerCookies = {};
  private nonce = '';
  private userId = '';
  private gwtPermutation = DEFAULT_GWT_PERMUTATION;
  private gwtHeader = DEFAULT_GWT_HEADER;

  constructor(username?: string, password?: string) {
    this.username = username ?? process.env.CRONOMETER_USERNAME ?? '';
    this.password = password ?? process.env.CRONOMETER_PASSWORD ?? '';

    if (!this.username || !this.password) {
      throw new Error(
        'Cronometer credentials required. Set CRONOMETER_USERNAME and CRONOMETER_PASSWORD in the environment.'
      );
    }
  }

  private get cookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  private updateCookies(response: Response): void {
    const raw = (response.headers as any).raw?.();
    const values = raw?.['set-cookie'] ?? [];

    for (const entry of Array.isArray(values) ? values : [values]) {
      if (!entry) continue;
      const parsed = parseSetCookieHeader(entry);
      Object.assign(this.cookies, parsed);
    }
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };

    if (this.cookieHeader) {
      headers.cookie = this.cookieHeader;
    }

    try {
      const response = await fetch(url, {
        ...init,
        headers,
        redirect: 'manual',
      });

      this.updateCookies(response);
      return response;
    } catch (error: any) {
      throw new CronometerError(
        `Network error contacting Cronometer: ${error?.message ?? 'unknown'}`,
        502,
        'network_error'
      );
    }
  }

  private async getAntiCsrf(): Promise<string> {
    const response = await this.request(LOGIN_HTML_URL);
    if (!response.ok) {
      throw new CronometerError(
        `Cronometer login page fetch failed: ${response.status}`,
        502,
        'login_page_unavailable'
      );
    }

    const html = await response.text();
    const match = html.match(/name="anticsrf"\s+value="([^"]+)"/);
    if (!match) {
      throw new CronometerError(
        'Unable to extract Cronometer anti-CSRF token from login page',
        502,
        'csrf_token_missing'
      );
    }

    return match[1];
  }

  private async login(): Promise<void> {
    const anticsrf = await this.getAntiCsrf();
    const form = new URLSearchParams({
      anticsrf,
      username: this.username,
      password: this.password,
    });

    const response = await this.request(LOGIN_API_URL, {
      method: 'POST',
      body: form,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      throw new CronometerError(
        `Cronometer login endpoint returned ${response.status}`,
        502,
        'login_failed'
      );
    }

    const payload = await response.json();
    if (payload.error) {
      throw new CronometerError(
        `Cronometer login failed: ${payload.error}`,
        401,
        'invalid_credentials'
      );
    }

    if (!payload.success && !payload.redirect) {
      throw new CronometerError(
        'Cronometer login failed: unexpected response payload',
        502,
        'login_unexpected_response'
      );
    }

    this.nonce = this.cookies.sesnonce ?? '';
    if (!this.nonce) {
      throw new CronometerError(
        'Cronometer login succeeded but no sesnonce cookie was received',
        502,
        'missing_session_cookie'
      );
    }
  }

  private async discoverGwtHashes(): Promise<void> {
    try {
      const resp = await this.request(GWT_NOCACHE_JS_URL);
      if (!resp.ok) {
        return;
      }

      const text = await resp.text();
      const permMatch = text.match(/='([A-F0-9]{32})'/);
      if (permMatch) {
        this.gwtPermutation = permMatch[1];
      }

      const cacheUrl = GWT_CACHE_JS_URL.replace('{permutation}', this.gwtPermutation);
      const cacheResp = await this.request(cacheUrl);
      if (!cacheResp.ok) {
        return;
      }

      const cacheText = await cacheResp.text();
      const headerMatch = cacheText.match(/'app','([A-F0-9]{32})'/);
      if (headerMatch) {
        this.gwtHeader = headerMatch[1];
      }
    } catch {
      // Keep default fallback hashes when discovery fails.
    }
  }

  private async gwtAuthenticate(): Promise<void> {
    const body = GWT_AUTHENTICATE.replace('{gwt_header}', this.gwtHeader);
    const response = await this.request(GWT_BASE_URL, {
      method: 'POST',
      body,
      headers: {
        'content-type': DEFAULT_GWT_CONTENT_TYPE,
        'x-gwt-module-base': DEFAULT_GWT_MODULE_BASE,
        'x-gwt-permutation': this.gwtPermutation,
      },
    });

    if (!response.ok) {
      throw new Error(`Cronometer GWT authenticate failed: ${response.status}`);
    }

    const text = await response.text();
    const match = text.match(/OK\[(\d+),/);
    if (!match) {
      throw new Error(`Cronometer GWT authenticate failed to parse user id: ${text.slice(0, 200)}`);
    }

    this.userId = match[1];
    const cookieNonce = this.cookies.sesnonce;
    if (cookieNonce) {
      this.nonce = cookieNonce;
    }
  }

  private async generateAuthToken(): Promise<string> {
    const body = GWT_GENERATE_AUTH_TOKEN
      .replace('{gwt_header}', this.gwtHeader)
      .replace('{nonce}', this.nonce)
      .replace('{user_id}', this.userId);

    const response = await this.request(GWT_BASE_URL, {
      method: 'POST',
      body,
      headers: {
        'content-type': DEFAULT_GWT_CONTENT_TYPE,
        'x-gwt-module-base': DEFAULT_GWT_MODULE_BASE,
        'x-gwt-permutation': this.gwtPermutation,
      },
    });

    if (!response.ok) {
      throw new Error(`Cronometer auth token request failed: ${response.status}`);
    }

    const text = await response.text();
    const match = text.match(/"([^"]+)"/);
    if (!match) {
      throw new Error(`Cronometer auth token failed to parse response: ${text.slice(0, 200)}`);
    }

    return match[1];
  }

  async ensureAuthenticated(): Promise<void> {
    if (this.userId && this.nonce) {
      return;
    }

    await this.discoverGwtHashes();
    await this.login();
    await this.gwtAuthenticate();
  }

  async exportRaw(
    exportType: string,
    start?: string,
    end?: string,
  ): Promise<string> {
    const validExportType = validateExportType(exportType);
    const startDate = start ? parseDate(start, 'start') : isoDate(new Date());
    const endDate = end ? parseDate(end, 'end') : isoDate(new Date());

    await this.ensureAuthenticated();

    const token = await this.generateAuthToken();

    const params = new URLSearchParams({
      nonce: token,
      generate: EXPORT_TYPES[validExportType],
      start: startDate,
      end: endDate,
    });

    const response = await this.request(`${EXPORT_URL}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new CronometerError(
        `Cronometer export failed: ${response.status} ${errorText}`,
        502,
        'export_failed'
      );
    }

    return response.text();
  }
}

export async function fetchCronometerHealth(): Promise<{ status: string }> {
  const client = new CronometerClient();
  await client.ensureAuthenticated();
  return { status: 'ok' };
}

export async function fetchCronometerExport(
  exportType: CronometerExportType,
  start?: string,
  end?: string,
): Promise<string> {
  const client = new CronometerClient();
  return client.exportRaw(exportType, start, end);
}
