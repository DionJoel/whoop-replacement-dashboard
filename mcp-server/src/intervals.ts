export class IntervalsError extends Error {
  constructor(
    message: string,
    public statusCode = 500,
    public kind = 'intervals_error'
  ) {
    super(message);
    this.name = 'IntervalsError';
  }
}

export interface IntervalsActivity {
  date: string;
  name: string;
  discipline: string;
  distance?: number;
  duration?: number;
  avgHR?: number;
  maxHR?: number;
  calories?: number;
}

export interface IntervalsFitness {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface IntervalsAthlete {
  id: string;
  firstName: string;
  lastName: string;
  birthdate?: string;
  weight?: number;
  restingHeartRate?: number;
}

class IntervalsClient {
  private apiKey: string;
  private intervalsKey: string;
  private athleteId: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.API_KEY ?? '';
    this.intervalsKey = process.env.INTERVALS_KEY ?? '';
    this.athleteId = process.env.ATHLETE_ID ?? '';
    this.baseUrl = process.env.INTERVALS_API_BASE_URL ?? 'https://intervals.icu/api/v1';

    if (!this.apiKey || !this.intervalsKey || !this.athleteId) {
      throw new Error(
        'Intervals.icu credentials required: API_KEY, INTERVALS_KEY, and ATHLETE_ID must be set in environment.'
      );
    }
  }

  private getAuthHeader(): string {
    return `Basic ${Buffer.from(`API_KEY:${this.intervalsKey}`).toString('base64')}`;
  }

  private async request(endpoint: string, method: string = 'GET', params?: Record<string, string | number>): Promise<Response> {
    let url = `${this.baseUrl}${endpoint}`;
    
    if (params && Object.keys(params).length > 0) {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        queryParams.append(key, String(value));
      });
      url += `?${queryParams.toString()}`;
    }

    const headers: Record<string, string> = {
      Authorization: this.getAuthHeader(),
      'Accept': 'application/json',
      'User-Agent': 'WHOOP-Replacement-Dashboard/1.0',
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new IntervalsError(
          `Intervals.icu API returned ${response.status}: ${errorText || response.statusText}`,
          response.status,
          'api_error'
        );
      }

      return response;
    } catch (error: any) {
      if (error instanceof IntervalsError) {
        throw error;
      }
      throw new IntervalsError(
        `Network error contacting Intervals.icu: ${error?.message ?? 'unknown'}`,
        502,
        'network_error'
      );
    }
  }

  async getAthlete(): Promise<IntervalsAthlete> {
    const response = await this.request(`/athlete/${this.athleteId}`);
    const data = await response.json();
    return {
      id: data.id ?? this.athleteId,
      firstName: data.firstName ?? '',
      lastName: data.lastName ?? '',
      birthdate: data.birthdate,
      weight: data.weight,
      restingHeartRate: data.restingHeartRate,
    };
  }

  async getFitnessTraining(startDate?: string, endDate?: string): Promise<IntervalsFitness[]> {
    const params: Record<string, string | number> = {};
    if (startDate) params.oldest = startDate;
    if (endDate) params.newest = endDate;

    const response = await this.request(`/athlete/${this.athleteId}/wellness`, 'GET', params);
    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new IntervalsError(
        'Intervals.icu returned unexpected wellness data format',
        502,
        'invalid_response'
      );
    }

    return data.map((entry: any) => ({
      date: entry.date ?? '',
      ctl: entry.ctl ?? 0,
      atl: entry.atl ?? 0,
      tsb: entry.tsb ?? 0,
    }));
  }

  async getActivities(startDate?: string, endDate?: string, limit: number = 100): Promise<IntervalsActivity[]> {
    const params: Record<string, string | number> = {
      limit,
    };
    if (startDate) params.oldest = startDate;
    if (endDate) params.newest = endDate;

    const response = await this.request(`/athlete/${this.athleteId}/activities`, 'GET', params);
    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new IntervalsError(
        'Intervals.icu returned unexpected activities data format',
        502,
        'invalid_response'
      );
    }

    return data.map((activity: any) => ({
      date: activity.date ?? '',
      name: activity.name ?? '',
      discipline: activity.discipline ?? '',
      distance: activity.distance,
      duration: activity.duration,
      avgHR: activity.avgHR,
      maxHR: activity.maxHR,
      calories: activity.calories,
    }));
  }

  async exportFitnessCsv(startDate?: string, endDate?: string): Promise<string> {
    const data = await this.getFitnessTraining(startDate, endDate);

    if (data.length === 0) {
      return 'date,ctl,atl,tsb\n';
    }

    const csvLines = [
      'date,ctl,atl,tsb',
      ...data.map((entry) =>
        [entry.date, entry.ctl.toFixed(2), entry.atl.toFixed(2), entry.tsb.toFixed(2)].join(',')
      ),
    ];

    return csvLines.join('\n');
  }

  async exportActivitiesCsv(startDate?: string, endDate?: string): Promise<string> {
    const data = await this.getActivities(startDate, endDate, 500);

    if (data.length === 0) {
      return 'date,name,discipline,distance,duration,avgHR,maxHR,calories\n';
    }

    const csvLines = [
      'date,name,discipline,distance,duration,avgHR,maxHR,calories',
      ...data.map((activity) =>
        [
          activity.date,
          `"${activity.name}"`,
          activity.discipline,
          activity.distance ?? '',
          activity.duration ?? '',
          activity.avgHR ?? '',
          activity.maxHR ?? '',
          activity.calories ?? '',
        ].join(',')
      ),
    ];

    return csvLines.join('\n');
  }
}

export async function fetchIntervalsAthlete(): Promise<IntervalsAthlete> {
  const client = new IntervalsClient();
  return client.getAthlete();
}

export async function fetchIntervalsFitness(startDate?: string, endDate?: string): Promise<IntervalsFitness[]> {
  const client = new IntervalsClient();
  return client.getFitnessTraining(startDate, endDate);
}

export async function fetchIntervalsActivities(startDate?: string, endDate?: string): Promise<IntervalsActivity[]> {
  const client = new IntervalsClient();
  return client.getActivities(startDate, endDate);
}

export async function exportIntervalsFitnessCsv(startDate?: string, endDate?: string): Promise<string> {
  const client = new IntervalsClient();
  return client.exportFitnessCsv(startDate, endDate);
}

export async function exportIntervalsActivitiesCsv(startDate?: string, endDate?: string): Promise<string> {
  const client = new IntervalsClient();
  return client.exportActivitiesCsv(startDate, endDate);
}
