export interface SystemInfo {
  platform: string;
  arch: string;
  release: string;
  uptimeSeconds: number;
  cpuCount: number;
  totalMemoryMB: number;
  freeMemoryMB: number;
  usedMemoryMB: number;
  nodeVersion: string;
  processUptime: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeatherData {
  city: string;
  temperature: number;
  unit: 'celsius' | 'fahrenheit';
  condition: string;
  humidity: number;
  windSpeedKmh: number;
  timestamp: string;
}
