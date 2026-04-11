# FocusFlow: IoT Concentration Optimizer 🧠🚀

**FocusFlow** is a full-stack IoT application designed to monitor and optimize your workspace environment for maximum productivity. By combining real-time sensor data with rule-based concentration analysis, it provides actionable insights to help you maintain deep focus.

---

## 🌟 Key Features

- **Real-time Monitoring:** Live dashboard for Temperature, Humidity, Light Intensity, Sound, and Motion.
- **Camera Presence Detection:** Uses **Local AI (MediaPipe)** to monitor if you are at your desk in real-time without sending video to the cloud.
- **Hybrid AI Architecture:** 
  - **Local Computer Vision:** Real-time face detection via MediaPipe.
  - **Expert System:** Deterministic rule-based scoring for environmental factors.
  - **Generative AI:** Integrated with **Google Gemini** for personalized focus recommendations.
- **Concentration Scoring:** Instant calculation of your focus level (0-100%) based on 6 different sensor inputs.
- **Focus Timer (Pomodoro):** Built-in 25-minute timer to manage your work sessions.
- **Noise & Motion Timelines:** Visual history of environmental distractions over the last hour.
- **Daily Progress:** Track your total focus minutes, streaks, and session counts.
- **Cloud Integration:** Secure data logging to Firebase Firestore and real-time communication via MQTT (HiveMQ).

---

## 🛠️ Hardware Requirements

To use the full potential of FocusFlow, you will need the following hardware components:

- **Microcontroller:** ESP32 or ESP8266.
- **Temperature & Humidity:** DHT22 or DHT11 sensor.
- **Motion Detection:** PIR (Passive Infrared) sensor.
- **Noise Detection:** KY-038 Sound Sensor.
- **Light Intensity:** LDR (Light Dependent Resistor).
- **Presence Detection:** Any standard USB or Integrated Webcam.

### Pin Configuration (ESP32 Example)
- **DHT22:** Pin 4
- **PIR:** Pin 17
- **KY-038:** Pin 5
- **LDR:** Pin 32 (Analog)

*Note: You can find the ESP32 source code in the `ESP32_MQTT_Code.ino` file.*

---

## 💻 Software Installation Guide

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher)
- [npm](https://www.npmjs.com/) (comes with Node.js)

### 2. Clone and Install
```bash
# Clone the repository
git clone https://github.com/your-username/concentration-optimizer-iot.git

# Navigate to the project folder
cd concentration-optimizer-iot

# Install dependencies
npm install
```

### 3. Configuration
Create a `.env` file in the root directory (you can copy `.env.example`) and fill in your credentials:

- **Firebase:** Update `firebase-applet-config.json` with your Firebase project credentials.
- **MQTT:** Set the following environment variables:
  - `VITE_MQTT_URL`: Your HiveMQ Cluster URL (wss://...).
  - `VITE_MQTT_USERNAME`: Your HiveMQ username.
  - `VITE_MQTT_PASSWORD`: Your HiveMQ password.
- **AI:** Set `GEMINI_API_KEY` for advanced focus recommendations.

### 4. Run the Application
```bash
# Start the development server
npm run dev
```
The app will be available at `http://localhost:3000`.

---

## 📂 Project Structure

- `src/App.tsx`: Main dashboard component, MQTT logic, and MediaPipe integration.
- `src/services/concentrationService.ts`: Rule-based logic for focus analysis.
- `src/firebase.ts`: Firebase initialization and configuration.
- `ESP32_MQTT_Code.ino`: Firmware for the ESP32 microcontroller.
- `firestore.rules`: Security rules for your database.

---

## 🚀 How to Use

1.  **Sign In:** Use your Google account to log in securely.
2.  **Connect Hardware:** Power up your ESP32 with the provided firmware. It will start publishing data to the MQTT broker.
3.  **Enable Camera:** Switch to the "Camera" tab to initialize the local AI monitor.
4.  **Monitor Live:** Watch the dashboard update in real-time as you work.
5.  **Analyze Focus:** The "Focus Analysis" card provides instant feedback on your environment.
6.  **Set Timer:** Use the Focus Timer to stay on track during deep-work sessions.

---

## 🧠 Hybrid AI Logic

FocusFlow uses a multi-layered AI approach for maximum reliability and privacy:

-   **Local Computer Vision (MediaPipe):** Detects user presence. If the user is not detected for a specific period, the concentration score drops significantly.
-   **Noise Analysis:** If the KY-038 sensor detects high ambient noise, the score is reduced.
-   **Thermal Comfort:** Optimized for **20-24°C**. Points are deducted if it's too cold or too warm.
-   **Lighting:** Points are deducted if the room is too dark (below 300 LDR units) or has excessive glare.
-   **Generative AI (Gemini):** Provides high-level coaching and environment optimization tips based on historical trends.

---

## 🛡️ Security
- **Authentication:** Google Sign-In via Firebase Auth.
- **Database Rules:** Firestore rules ensure that users can only read and write their own data.

---

## 🤝 Contributing
Feel free to fork this project, report issues, or submit pull requests to improve the FocusFlow experience!

---

## 📄 License
This project is licensed under the MIT License.
