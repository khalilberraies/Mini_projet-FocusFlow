import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, 
  Thermometer, 
  Droplets, 
  Move, 
  Sun, 
  Brain, 
  History, 
  LogOut, 
  LogIn,
  AlertCircle,
  CheckCircle2,
  Zap,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  LayoutDashboard,
  Timer,
  Trophy,
  Settings,
  Wind,
  Play,
  Pause,
  RotateCcw,
  UserCheck,
  UserMinus,
  Camera,
  Video
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Webcam from 'react-webcam';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import mqtt from 'mqtt';
import { auth, db } from './firebase';
import { analyzeConcentration } from './services/concentrationService';
import { cn } from './lib/utils';
import { SensorData } from './types';

// --- MQTT CONFIGURATION ---
const MQTT_CONFIG = {
  url: import.meta.env.VITE_MQTT_URL || 'wss://xxxxxx.s1.eu.hivemq.cloud:8884/mqtt',
  topic: import.meta.env.VITE_MQTT_TOPIC || 'concentration/sensors',
  username: import.meta.env.VITE_MQTT_USERNAME || 'YOUR_MQTT_USERNAME',
  password: import.meta.env.VITE_MQTT_PASSWORD || 'YOUR_MQTT_PASSWORD'
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [realtimeData, setRealtimeData] = useState<SensorData | null>(null);
  const [history, setHistory] = useState<SensorData[]>([]);
  const [mqttStatus, setMqttStatus] = useState<'connected' | 'disconnected' | 'connecting' | 'error'>('disconnected');
  const [mqttError, setMqttError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ score: number; recommendation: string; status: 'optimal' | 'warning' | 'critical' }>({ 
    score: 50, 
    recommendation: "Waiting for sensor data...",
    status: 'warning'
  });
  
  // --- NEW FEATURES STATE ---
  const [activeTab, setActiveTab] = useState<'dashboard' | 'camera'>('dashboard');
  const [cameraPresence, setCameraPresence] = useState<boolean | undefined>(undefined);
  const cameraPresenceRef = useRef<boolean | undefined>(undefined);

  // Update ref when state changes
  useEffect(() => {
    cameraPresenceRef.current = cameraPresence;
  }, [cameraPresence]);
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [timerActive, setTimerActive] = useState(false);
  const [dailyFocusMinutes, setDailyFocusMinutes] = useState(120); // Mocked daily progress
  const [focusGoalMinutes] = useState(300); // 5 hours goal
  
  // Timer Logic
  useEffect(() => {
    let interval: any;
    if (timerActive && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds(s => s - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setTimerActive(false);
    }
    return () => clearInterval(interval);
  }, [timerActive, timerSeconds]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const toggleTimer = () => setTimerActive(!timerActive);
  const resetTimer = () => {
    setTimerActive(false);
    setTimerSeconds(25 * 60);
  };
  const analysisResultRef = useRef(analysisResult);
  const lastAnalysisTimeRef = useRef<number>(0);

  // Sync ref with state
  useEffect(() => {
    analysisResultRef.current = analysisResult;
  }, [analysisResult]);

  // --- AUTHENTICATION ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  // --- MQTT REAL-TIME DATA ---
  useEffect(() => {
    if (!user) return;

    setMqttStatus('connecting');
    setMqttError(null);
    
    // Connect with credentials
    const client = mqtt.connect(MQTT_CONFIG.url, {
      username: MQTT_CONFIG.username,
      password: MQTT_CONFIG.password,
      clientId: 'web_client_' + Math.random().toString(16).substring(2, 8),
      connectTimeout: 4000,
      reconnectPeriod: 1000,
    });

    client.on('connect', () => {
      setMqttStatus('connected');
      setMqttError(null);
      client.subscribe(MQTT_CONFIG.topic);
    });

    const ANALYSIS_INTERVAL = 60000; // Only analyze every 60 seconds automatically to save quota

    client.on('message', async (topic, message) => {
      try {
        const rawData = JSON.parse(message.toString());
        const now = Date.now();
        
        // Use rule-based analysis (instant, reliable)
        const analysis = analyzeConcentration({
          temperature: rawData.temperature,
          humidity: rawData.humidity,
          motion: rawData.motion,
          noiseDetected: rawData.noiseDetected,
          lightLevel: rawData.lightLevel,
          cameraPresence: cameraPresenceRef.current
        });
        
        setAnalysisResult(analysis);

        const fullData = {
          ...rawData,
          timestamp: now,
          cameraPresence: cameraPresenceRef.current,
          concentrationScore: analysis.score,
          recommendation: analysis.recommendation
        };

        setRealtimeData(fullData as SensorData);

        // Store in Firebase
        const readingsPath = `users/${user.uid}/readings`;
        try {
          await addDoc(collection(db, readingsPath), {
            ...fullData,
            userId: user.uid,
            timestamp: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, readingsPath);
        }

      } catch (error) {
        console.error("MQTT Message Processing Error:", error);
      }
    });

    client.on('error', (err: any) => {
      console.error("MQTT Error:", err);
      setMqttStatus('error');
      
      let errorMessage = err.message || "Connection failed";
      if (errorMessage.includes('Not authorized')) {
        errorMessage = "Invalid MQTT Username or Password. Check HiveMQ Access Management.";
      } else if (MQTT_CONFIG.username === 'YOUR_MQTT_USERNAME') {
        errorMessage = "MQTT Credentials not set. Please update your environment variables in AI Studio Settings.";
      }
      
      setMqttError(errorMessage);
    });

    return () => {
      client.end();
    };
  }, [user]);

  const handleManualAnalyze = async () => {
    if (!realtimeData || isAnalyzing) return;
    
    setIsAnalyzing(true);
    // Simulate a brief "thinking" period for better UX
    setTimeout(() => {
      const analysis = analyzeConcentration({
        temperature: realtimeData.temperature,
        humidity: realtimeData.humidity,
        motion: realtimeData.motion,
        noiseDetected: realtimeData.noiseDetected,
        lightLevel: realtimeData.lightLevel,
        cameraPresence: cameraPresence
      });
      setAnalysisResult(analysis);
      setRealtimeData(prev => prev ? {
        ...prev,
        concentrationScore: analysis.score,
        recommendation: analysis.recommendation
      } : null);
      setIsAnalyzing(false);
    }, 500);
  };

  // --- HISTORICAL DATA ---
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, `users/${user.uid}/readings`),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const readingsPath = `users/${user.uid}/readings`;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`Fetched ${snapshot.docs.length} historical readings from Firestore.`);
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          ...d,
          timestamp: (d.timestamp as Timestamp)?.toMillis() || Date.now()
        } as SensorData;
      }).reverse();
      setHistory(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, readingsPath);
    });

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#141414] border border-[#222] rounded-2xl p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto">
            <Brain className="w-10 h-10 text-orange-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-white tracking-tight">FocusFlow</h1>
            <p className="text-gray-400 text-sm">Optimize your concentration with real-time IoT monitoring and AI insights.</p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full py-4 px-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-3 group"
          >
            <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 font-sans">
      {/* Header */}
      <header className="border-b border-[#1a1a1a] bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-orange-500 rounded-lg">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight hidden sm:block">FocusFlow</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] rounded-full border border-[#222]">
              <div className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                mqttStatus === 'connected' ? "bg-green-500" : 
                mqttStatus === 'error' ? "bg-red-500" : "bg-yellow-500"
              )} />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {mqttStatus}
              </span>
            </div>
            
            <div className="hidden md:flex items-center bg-[#111] p-1 rounded-xl border border-[#1a1a1a]">
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                  activeTab === 'dashboard' ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-gray-500 hover:text-gray-300"
                )}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </button>
              <button 
                onClick={() => setActiveTab('camera')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                  activeTab === 'camera' ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" : "text-gray-500 hover:text-gray-300"
                )}
              >
                <Camera className="w-3.5 h-3.5" />
                Camera
                {cameraPresence === false && (
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                )}
              </button>
            </div>

            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-[#1a1a1a] rounded-full transition-colors text-gray-400 hover:text-white"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {mqttError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3 text-red-500 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{mqttError}</p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Real-time Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <StatCard 
                  icon={<Thermometer className="w-5 h-5 text-orange-500" />}
                  label="Temperature"
                  value={realtimeData?.temperature ? `${realtimeData.temperature.toFixed(1)}°C` : '--'}
                  subValue="Ambient Room"
                  status={!realtimeData ? 'neutral' : (realtimeData.temperature >= 20 && realtimeData.temperature <= 24) ? 'optimal' : 'suboptimal'}
                />
                <StatCard 
                  icon={<Droplets className="w-5 h-5 text-blue-500" />}
                  label="Humidity"
                  value={realtimeData?.humidity ? `${realtimeData.humidity.toFixed(1)}%` : '--'}
                  subValue="Air Quality"
                  status={!realtimeData ? 'neutral' : (realtimeData.humidity >= 40 && realtimeData.humidity <= 60) ? 'optimal' : 'suboptimal'}
                />
                <StatCard 
                  icon={<Sun className="w-5 h-5 text-yellow-500" />}
                  label="Light Level"
                  value={realtimeData?.lightLevel ?? '--'}
                  subValue="LDR Intensity"
                  status={!realtimeData ? 'neutral' : (realtimeData.lightLevel >= 300 && realtimeData.lightLevel <= 800) ? 'optimal' : 'suboptimal'}
                />
                <StatCard 
                  icon={<Volume2 className="w-5 h-5 text-purple-500" />}
                  label="Sound Level"
                  value={realtimeData?.noiseDetected ? 'Loud' : 'Quiet'}
                  subValue="KY-038 Sensor"
                  status={!realtimeData ? 'neutral' : !realtimeData.noiseDetected ? 'optimal' : 'suboptimal'}
                />
                <StatCard 
                  icon={<Move className="w-5 h-5 text-green-500" />}
                  label="Motion"
                  value={realtimeData?.motion ? 'Detected' : 'Still'}
                  subValue="PIR Sensor"
                  status={!realtimeData ? 'neutral' : !realtimeData.motion ? 'optimal' : 'suboptimal'}
                />
                <StatCard 
                  icon={<Camera className="w-5 h-5 text-blue-400" />}
                  label="Cam Presence"
                  value={cameraPresence === undefined ? 'Off' : cameraPresence ? 'Present' : 'Away'}
                  subValue="Webcam Monitor"
                  status={cameraPresence === undefined ? 'neutral' : cameraPresence ? 'optimal' : 'suboptimal'}
                />
              </div>

              {/* Focus Session & Daily Progress */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-[#111] border border-[#1a1a1a] rounded-3xl p-8 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/10 rounded-xl">
                        <Timer className="w-6 h-6 text-blue-500" />
                      </div>
                      <h2 className="text-xl font-bold">Focus Timer</h2>
                    </div>
                    <button onClick={resetTimer} className="p-2 hover:bg-[#1a1a1a] rounded-lg text-gray-500 hover:text-white transition-colors">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-col items-center justify-center space-y-6 flex-grow">
                    <div className="text-6xl font-black tracking-tighter text-white font-mono">
                      {formatTime(timerSeconds)}
                    </div>
                    <button 
                      onClick={toggleTimer}
                      className={cn(
                        "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all",
                        timerActive ? "bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white" : "bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white"
                      )}
                    >
                      {timerActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                      {timerActive ? "Pause Session" : "Start Focus"}
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-2 bg-[#111] border border-[#1a1a1a] rounded-3xl p-8 space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-500/10 rounded-xl">
                        <Trophy className="w-6 h-6 text-yellow-500" />
                      </div>
                      <h2 className="text-xl font-bold">Daily Focus Goal</h2>
                    </div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                      {Math.round((dailyFocusMinutes / focusGoalMinutes) * 100)}% Complete
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div className="h-4 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(dailyFocusMinutes / focusGoalMinutes) * 100}%` }}
                        className="h-full bg-gradient-to-r from-yellow-500 to-orange-500"
                      />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400 font-medium">{dailyFocusMinutes}m focused</span>
                      <span className="text-gray-600">Goal: {focusGoalMinutes}m</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
                    <div className="p-4 bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] text-center">
                      <p className="text-xs text-gray-500 uppercase font-bold mb-1">Streak</p>
                      <p className="text-xl font-black text-white">5 Days</p>
                    </div>
                    <div className="p-4 bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] text-center">
                      <p className="text-xs text-gray-500 uppercase font-bold mb-1">Sessions</p>
                      <p className="text-xl font-black text-white">12</p>
                    </div>
                    <div className="p-4 bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] text-center">
                      <p className="text-xs text-gray-500 uppercase font-bold mb-1">Avg Score</p>
                      <p className="text-xl font-black text-white">84%</p>
                    </div>
                    <div className="p-4 bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a] text-center">
                      <p className="text-xs text-gray-500 uppercase font-bold mb-1">Best Day</p>
                      <p className="text-xl font-black text-white">Tue</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Noise Timeline */}
              <div className="bg-[#111] border border-[#1a1a1a] rounded-3xl p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-xl">
                      <Mic className="w-6 h-6 text-purple-500" />
                    </div>
                    <h2 className="text-xl font-bold">Noise Timeline</h2>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-gray-500">Quiet</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-gray-500">Loud</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-1 h-12">
                  {history.slice(-60).map((reading, i) => (
                    <div 
                      key={i}
                      className={cn(
                        "flex-grow rounded-sm transition-all duration-500",
                        reading.noiseDetected ? "bg-red-500/40 hover:bg-red-500" : "bg-green-500/40 hover:bg-green-500"
                      )}
                      title={new Date(reading.timestamp).toLocaleTimeString()}
                    />
                  ))}
                </div>
              </div>

              {/* AI Insight & Score */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-[#111] border border-[#1a1a1a] rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Brain className="w-48 h-48 text-orange-500" />
                  </div>
                  
                  <div className="space-y-6 relative z-10">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/10 rounded-xl">
                          <Zap className="w-6 h-6 text-orange-500" />
                        </div>
                        <h2 className="text-2xl font-bold">Focus Analysis</h2>
                      </div>
                      <button 
                        onClick={handleManualAnalyze}
                        disabled={isAnalyzing || !realtimeData}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
                          isAnalyzing ? "bg-gray-800 text-gray-500 cursor-not-allowed" : "bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white"
                        )}
                      >
                        <Activity className={cn("w-4 h-4", isAnalyzing && "animate-spin")} />
                        {isAnalyzing ? "Analyzing..." : "Recalculate"}
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      {isAnalyzing ? (
                        <div className="flex items-center gap-3 py-2">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                          <p className="text-sm font-medium text-orange-500 uppercase tracking-widest">Recalculating...</p>
                        </div>
                      ) : (
                        <p className="text-xl text-gray-300 leading-relaxed max-w-2xl">
                          {analysisResult.recommendation}
                        </p>
                      )}
                      
                      <div className="flex flex-wrap gap-3">
                        {realtimeData?.noiseDetected && (
                          <Badge icon={<AlertCircle className="w-3 h-3" />} text="Noise Detected" color="red" />
                        )}
                        {realtimeData?.motion && (
                          <Badge icon={<Activity className="w-3 h-3" />} text="Movement" color="blue" />
                        )}
                        {cameraPresence === false && (
                          <Badge icon={<UserMinus className="w-3 h-3" />} text="User Away (Cam)" color="red" />
                        )}
                        {realtimeData && (
                          <Badge icon={<CheckCircle2 className="w-3 h-3" />} text="Real-time Active" color="green" />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 pt-8 border-t border-[#1a1a1a] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-orange-500/20">
                        <img src={user.photoURL || ""} alt={user.displayName || ""} referrerPolicy="no-referrer" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{user.displayName}</p>
                        <p className="text-xs text-gray-500">Session Active</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Status</p>
                      <p className="text-sm font-bold text-green-500">OPTIMIZING</p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#111] border border-[#1a1a1a] rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-6">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em]">Concentration Score</h3>
                  <div className="relative w-48 h-48 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="96"
                        cy="96"
                        r="88"
                        fill="transparent"
                        stroke="#1a1a1a"
                        strokeWidth="12"
                      />
                      <circle
                        cx="96"
                        cy="96"
                        r="88"
                        fill="transparent"
                        stroke="url(#gradient)"
                        strokeWidth="12"
                        strokeDasharray={552.92}
                        strokeDashoffset={552.92 * (1 - (realtimeData?.concentrationScore || 0) / 100)}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                      />
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#f97316" />
                          <stop offset="100%" stopColor="#ea580c" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-5xl font-black text-white">{realtimeData?.concentrationScore || 0}</span>
                      <span className="text-xs font-bold text-gray-500 mt-1">%</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400">
                    {realtimeData?.concentrationScore && realtimeData.concentrationScore > 80 
                      ? "Peak performance detected." 
                      : "Room for improvement."}
                  </p>
                </div>
              </div>

              {/* Historical Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard 
                  title="Concentration History" 
                  icon={<History className="w-4 h-4" />}
                  data={history}
                  dataKey="concentrationScore"
                  color="#f97316"
                />
                <ChartCard 
                  title="Environment (Temp/Hum)" 
                  icon={<LayoutDashboard className="w-4 h-4" />}
                  data={history}
                  multi
                />
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="camera"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl mx-auto"
            >
              <CameraMonitor onPresenceChange={setCameraPresence} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, subValue, status = 'neutral' }: { icon: React.ReactNode, label: string, value: string | number, subValue: string, status?: 'optimal' | 'suboptimal' | 'neutral' }) {
  return (
    <div className="bg-[#111] border border-[#1a1a1a] p-6 rounded-2xl hover:border-orange-500/30 transition-colors group relative overflow-hidden">
      {status !== 'neutral' && (
        <div className={cn(
          "absolute top-0 right-0 px-2 py-1 text-[8px] font-black uppercase tracking-widest rounded-bl-lg",
          status === 'optimal' ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
        )}>
          {status}
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-[#1a1a1a] rounded-lg group-hover:bg-orange-500/10 transition-colors">
          {icon}
        </div>
        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Live</span>
      </div>
      <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <p className="text-xs text-gray-600">{subValue}</p>
    </div>
  );
}

function Badge({ icon, text, color }: { icon: React.ReactNode, text: string, color: 'red' | 'blue' | 'green' }) {
  const colors = {
    red: "bg-red-500/10 text-red-500 border-red-500/20",
    blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    green: "bg-green-500/10 text-green-500 border-green-500/20"
  };
  return (
    <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border", colors[color])}>
      {icon}
      {text}
    </div>
  );
}

function CameraMonitor({ onPresenceChange }: { onPresenceChange: (present: boolean) => void }) {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPresent, setIsPresent] = useState<boolean>(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [lastAiResponse, setLastAiResponse] = useState<string>("");
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [isInitializingAi, setIsInitializingAi] = useState(false);

  // Initialize MediaPipe Face Landmarker
  const initLandmarker = async () => {
    if (isInitializingAi) return;
    setIsInitializingAi(true);
    setLastAiResponse("Initializing Local AI...");
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "IMAGE",
        numFaces: 1
      });
      setFaceLandmarker(landmarker);
      setLastAiResponse("Local AI Ready.");
      console.log("Local AI (MediaPipe) initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Local AI:", error);
      setLastAiResponse("Error: Failed to load local AI model. Check your connection.");
    } finally {
      setIsInitializingAi(false);
    }
  };

  useEffect(() => {
    initLandmarker();
  }, []);

  // AI Face Detection Logic (Now Local)
  useEffect(() => {
    const aiInterval = setInterval(async () => {
      if (webcamRef.current && isCameraReady && faceLandmarker && !isAiAnalyzing) {
        const video = webcamRef.current.video;
        if (video && video.readyState === 4) {
          setIsAiAnalyzing(true);
          try {
            const results = faceLandmarker.detect(video);
            
            if (results.faceLandmarks && results.faceLandmarks.length > 0) {
              setIsPresent(true);
              onPresenceChange(true);
              
              // Simple focus analysis: check if face is roughly centered
              const landmarks = results.faceLandmarks[0];
              const nose = landmarks[1]; // Nose tip
              const isCentered = nose.x > 0.3 && nose.x < 0.7 && nose.y > 0.3 && nose.y < 0.7;
              
              setLastAiResponse(isCentered ? "Focusing: Face centered and detected." : "Warning: Face detected but not centered.");
            } else {
              setIsPresent(false);
              onPresenceChange(false);
              setLastAiResponse("No human detected in frame.");
            }
          } catch (error) {
            console.error("Local AI Detection Error:", error);
            setLastAiResponse("Error: Local AI processing failed.");
          } finally {
            setIsAiAnalyzing(false);
          }
        }
      }
    }, 2000); // Faster updates since it's local

    return () => clearInterval(aiInterval);
  }, [isCameraReady, isAiAnalyzing, onPresenceChange, faceLandmarker]);

  return (
    <div className="bg-[#111] border border-[#1a1a1a] rounded-3xl p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-xl">
            <Video className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold">AI Camera Monitor</h2>
            <p className="text-xs text-gray-500 font-medium">Smart human presence detection</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAiAnalyzing && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 rounded-full border border-orange-500/20">
              <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">AI Scanning...</span>
            </div>
          )}
          <div className={cn(
            "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2",
            isPresent ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
          )}>
            {isPresent ? <UserCheck className="w-4 h-4" /> : <UserMinus className="w-4 h-4" />}
            {isPresent ? "Human Detected" : "No Human Found"}
          </div>
        </div>
      </div>

      <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-[#1a1a1a]">
        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-[#0a0a0a] p-8 text-center">
            <div className="p-4 bg-red-500/10 rounded-full">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-bold text-white">Camera Access Error</p>
              <p className="text-sm text-gray-400 max-w-md">
                {cameraError.includes('Permission denied') 
                  ? "Please allow camera access in your browser settings and refresh the page."
                  : "Could not initialize camera. Please ensure no other app is using it."}
              </p>
            </div>
            <button 
              onClick={() => {
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(registrations => {
                    for (let registration of registrations) {
                      registration.unregister();
                    }
                    window.location.reload();
                  });
                } else {
                  window.location.reload();
                }
              }}
              className="px-6 py-2 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors"
            >
              Hard Refresh
            </button>
          </div>
        ) : (
          <>
            <Webcam
              ref={webcamRef}
              audio={false}
              mirrored={true}
              screenshotFormat="image/jpeg"
              screenshotQuality={1.0}
              videoConstraints={{
                facingMode: { ideal: "user" }
              }}
              onUserMedia={() => {
                setIsCameraReady(true);
                setCameraError(null);
              }}
              onUserMediaError={(err) => {
                console.error("Webcam Error:", err);
                setCameraError(typeof err === 'string' ? err : "Permission denied or hardware error");
              }}
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {!isCameraReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-[#0a0a0a]">
                <div className="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Initializing Camera...</p>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest">Check for browser permission prompt</p>
              </div>
            )}
          </>
        )}

        {isPresent && isCameraReady && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-green-500/20 backdrop-blur-md border border-green-500/30 rounded-full"
          >
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-green-500 uppercase tracking-widest">Tracking Active</span>
          </motion.div>
        )}

        {lastAiResponse && (
          <div className="absolute bottom-4 left-4 right-4 p-3 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">AI Status</p>
              <p className="text-xs text-white font-medium">{lastAiResponse}</p>
            </div>
            {lastAiResponse.includes("Error") && (
              <button 
                onClick={() => initLandmarker()}
                className="px-3 py-1 bg-orange-500 text-white text-[10px] font-bold rounded-lg hover:bg-orange-600 transition-colors uppercase tracking-widest"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-6 bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a]">
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Brain className="w-4 h-4 text-orange-500" />
            Smart Local AI
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            We use local MediaPipe AI to analyze frames and verify that a human is actually present. This runs entirely in your browser for maximum privacy and speed.
          </p>
        </div>
        <div className="p-6 bg-[#0a0a0a] rounded-2xl border border-[#1a1a1a]">
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            Privacy First
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Video processing happens entirely in your browser. No images or video feeds are ever sent to the cloud or stored on our servers.
          </p>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, icon, data, dataKey, color, multi }: { title: string, icon: React.ReactNode, data: any[], dataKey?: string, color?: string, multi?: boolean }) {
  return (
    <div className="bg-[#111] border border-[#1a1a1a] rounded-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#1a1a1a] rounded-lg text-gray-400">
            {icon}
          </div>
          <h3 className="font-bold text-gray-200">{title}</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-[10px] text-gray-500 uppercase font-bold">Score</span>
          </div>
        </div>
      </div>
      
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {multi ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
              <XAxis 
                dataKey="timestamp" 
                hide 
              />
              <YAxis stroke="#444" fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#111', border: '1px solid #222', borderRadius: '12px' }}
                itemStyle={{ fontSize: '12px' }}
              />
              <Line type="monotone" dataKey="temperature" stroke="#f97316" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="humidity" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          ) : (
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
              <XAxis 
                dataKey="timestamp" 
                hide 
              />
              <YAxis stroke="#444" fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#111', border: '1px solid #222', borderRadius: '12px' }}
                itemStyle={{ fontSize: '12px' }}
              />
              <Area type="monotone" dataKey={dataKey} stroke={color} fillOpacity={1} fill="url(#colorScore)" strokeWidth={3} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
