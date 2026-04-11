export interface SensorData {
  timestamp: number;
  temperature: number;
  humidity: number;
  motion: boolean;
  noiseDetected: boolean;
  lightLevel: number;
  cameraPresence?: boolean;
  concentrationScore: number;
  recommendation: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
}
