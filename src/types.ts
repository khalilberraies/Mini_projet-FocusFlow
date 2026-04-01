export interface SensorData {
  timestamp: number;
  temperature: number;
  humidity: number;
  motion: boolean;
  lineDetected: boolean;
  lightLevel: number;
  concentrationScore: number;
  recommendation: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
}
