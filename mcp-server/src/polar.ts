export type PolarTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
};

const POLAR_AUTH_URL = 'https://flow.polar.com/oauth2/authorization';
const POLAR_TOKEN_URL = 'https://polarremote.com/oauth2/token';
const POLAR_API_URL = 'https://www.polaraccesslink.com/v2';

const POLAR_CLIENT_ID = process.env.POLAR_CLIENT_ID;
const POLAR_CLIENT_SECRET = process.env.POLAR_CLIENT_SECRET;
const POLAR_REDIRECT_URI = process.env.POLAR_REDIRECT_URI;
const POLAR_SCOPE = process.env.POLAR_SCOPE || 'sleep';

export function getPolarAuthUrl(): string {
  if (!POLAR_CLIENT_ID || !POLAR_REDIRECT_URI) {
    throw new Error('POLAR_CLIENT_ID and POLAR_REDIRECT_URI must be defined');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: POLAR_CLIENT_ID,
    redirect_uri: POLAR_REDIRECT_URI,
    scope: POLAR_SCOPE,
  });

  return `${POLAR_AUTH_URL}?${params.toString()}`;
}

async function fetchPolarToken(body: URLSearchParams): Promise<PolarTokenResponse> {
  if (!POLAR_CLIENT_ID || !POLAR_CLIENT_SECRET) {
    throw new Error('POLAR_CLIENT_ID and POLAR_CLIENT_SECRET must be defined');
  }

  body.set('client_id', POLAR_CLIENT_ID);
  body.set('client_secret', POLAR_CLIENT_SECRET);

  const response = await fetch(POLAR_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Polar token endpoint returned ${response.status}: ${payload}`);
  }

  return response.json();
}

export async function exchangePolarCode(code: string): Promise<PolarTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: POLAR_REDIRECT_URI ?? '',
  });
  return fetchPolarToken(body);
}

export async function refreshPolarToken(refreshToken: string): Promise<PolarTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return fetchPolarToken(body);
}

export async function fetchPolarSleep(accessToken: string): Promise<any> {
  const response = await fetch(`${POLAR_API_URL}/users/me/sleep`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Polar sleep endpoint returned ${response.status}: ${payload}`);
  }

  return response.json();
}
