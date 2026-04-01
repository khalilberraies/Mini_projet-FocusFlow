
export interface SensorData {
  temperature: number;
  humidity: number;
  motion: boolean;
  lineDetected: boolean;
  lightLevel: number;
}

export interface AnalysisResult {
  score: number;
  recommendation: string;
  status: 'optimal' | 'warning' | 'critical';
}

export function analyzeConcentration(data: SensorData): AnalysisResult {
  let score = 100;
  let issues: string[] = [];
  let status: 'optimal' | 'warning' | 'critical' = 'optimal';

  // 1. Presence Detection (KY-033 Line Tracker used as proximity/desk sensor)
  if (!data.lineDetected) {
    score -= 70;
    issues.push("User away from desk");
    status = 'critical';
  }

  // 2. Temperature Analysis (Ideal: 20-24°C)
  if (data.temperature < 18) {
    score -= 15;
    issues.push("Temperature too low");
  } else if (data.temperature > 26) {
    score -= 20;
    issues.push("Temperature too high");
  } else if (data.temperature > 24 || data.temperature < 20) {
    score -= 5;
  }

  // 3. Humidity Analysis (Ideal: 40-60%)
  if (data.humidity < 30) {
    score -= 10;
    issues.push("Air is too dry");
  } else if (data.humidity > 70) {
    score -= 10;
    issues.push("Humidity is too high");
  }

  // 4. Motion Analysis (PIR Sensor)
  // Constant motion might indicate restlessness or distractions
  if (data.motion && data.lineDetected) {
    score -= 10;
    issues.push("High activity detected");
  }

  // 5. Light Level (LDR)
  if (data.lightLevel < 100) {
    score -= 25;
    issues.push("Insufficient lighting");
  } else if (data.lightLevel > 900) {
    score -= 10;
    issues.push("Excessive glare detected");
  }

  // Final score clamping
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Determine status based on score
  if (score < 40) status = 'critical';
  else if (score < 75) status = 'warning';

  // Generate recommendation
  let recommendation = "Environment is optimal for deep focus.";
  if (issues.length > 0) {
    if (!data.lineDetected) {
      recommendation = "User not detected at workstation. Monitoring paused.";
    } else {
      recommendation = `Focus impacted: ${issues.slice(0, 2).join(" & ")}.`;
    }
  }

  return { score, recommendation, status };
}
