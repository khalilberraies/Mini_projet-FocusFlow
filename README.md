# FocusFlow: IoT Concentration Optimizer 🧠🚀

**FocusFlow** is a full-stack IoT application designed to monitor and optimize your workspace environment for maximum productivity. By combining real-time sensor data with rule-based concentration analysis, it provides actionable insights to help you maintain deep focus.

---

## 🌟 Key Features

- **Real-time Monitoring:** Live dashboard for Temperature, Humidity, Light Intensity, and Presence.
- **Concentration Scoring:** Instant calculation of your focus level (0-100%) based on environmental factors.
- **Focus Timer (Pomodoro):** Built-in 25-minute timer to manage your work sessions.
- **Presence Timeline:** Visual history of your desk presence over the last hour.
- **Daily Progress:** Track your total focus minutes, streaks, and session counts.
- **Cloud Integration:** Secure data logging to Firebase Firestore and real-time communication via MQTT (HiveMQ).
- **Responsive Design:** A sleek, dark-themed dashboard built with Tailwind CSS and Framer Motion.

---

## 🛠️ Hardware Requirements

To use the full potential of FocusFlow, you will need the following hardware components:

- **Microcontroller:** ESP32 or ESP8266.
- **Temperature & Humidity:** DHT22 or DHT11 sensor.
- **Motion Detection:** PIR (Passive Infrared) sensor.
- **Desk Presence:** KY-033 Line Tracker (used as a proximity sensor).
- **Light Intensity:** LDR (Light Dependent Resistor).

### Pin Configuration (ESP32 Example)
- **DHT22:** Pin 4
- **PIR:** Pin 17
- **KY-033:** Pin 5
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

- **Firebase:** Update `src/firebase-applet-config.json` with your Firebase project credentials.
- **MQTT:** Update the `MQTT_CONFIG` object in `src/App.tsx` with your HiveMQ broker URL, username, and password.

### 4. Run the Application
```bash
# Start the development server
npm run dev
```
The app will be available at `http://localhost:3000`.

---

## 📂 Project Structure

- `src/App.tsx`: Main dashboard component and MQTT logic.
- `src/services/concentrationService.ts`: Rule-based logic for focus analysis.
- `src/firebase.ts`: Firebase initialization and configuration.
- `ESP32_MQTT_Code.ino`: Firmware for the ESP32 microcontroller.
- `firestore.rules`: Security rules for your database.

---

## 🚀 How to Use

1.  **Sign In:** Use your Google account to log in securely.
2.  **Connect Hardware:** Power up your ESP32 with the provided firmware. It will start publishing data to the MQTT broker.
3.  **Monitor Live:** Watch the dashboard update in real-time as you work.
4.  **Analyze Focus:** The "Focus Analysis" card provides instant feedback on your environment.
5.  **Set Timer:** Use the Focus Timer to stay on track during deep-work sessions.
6.  **Review History:** Scroll down to see your concentration and environmental history over time.

---

## 🧠 Rule-Based Analysis Logic

Unlike traditional AI models that may be slow or require API keys, FocusFlow uses a **deterministic rule-based system** for maximum reliability:

-   **Presence:** If the KY-033 sensor doesn't detect you at your desk, the score drops to 0.
-   **Temperature:** Optimized for **20-24°C**. Points are deducted if it's too cold or too warm.
-   **Lighting:** Points are deducted if the room is too dark (below 300 LDR units) or has excessive glare.
-   **Humidity:** Ideal range is **40-60%** for maximum comfort and focus.

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
