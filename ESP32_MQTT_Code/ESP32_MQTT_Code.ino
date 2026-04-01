/*
  ESP32 Concentration Optimizer IoT
  Pins:
  - DHT22: 4
  - PIR: 17
  - KY-033: 5
  - LDR: 36
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>

// --- CONFIGURATION ---
const char* ssid = "MyHotspot";
const char* password = "dhch3316";

// HiveMQ Cloud Settings
const char* mqtt_server = "cf5a35658f1e496580cfdac39054baa8.s1.eu.hivemq.cloud"; // e.g. "xxxx.s1.eu.hivemq.cloud"
const int mqtt_port = 8883;
const char* mqtt_user = "esp32_user";
const char* mqtt_pass = "Concentration123!";

// MQTT Topics
const char* topic_publish = "concentration/sensors";

// Sensor Pins
#define DHT22_PIN 4
#define PIR_PIN 17
#define KY033_PIN 5
#define LDR_PIN 36

DHT dht(DHT22_PIN, DHT22);
WiFiClientSecure espClient;
PubSubClient client(espClient);

void setup_wifi() {
  delay(10);
  Serial.println("\n--- WiFi Diagnostic Mode ---");
  
  // 1. Scan for networks
  Serial.println("Scanning for nearby WiFi networks...");
  int n = WiFi.scanNetworks();
  bool found = false;
  if (n == 0) {
    Serial.println("No networks found! Check if your hotspot is ON.");
  } else {
    Serial.print(n);
    Serial.println(" networks found:");
    for (int i = 0; i < n; ++i) {
      Serial.print(i + 1);
      Serial.print(": ");
      Serial.print(WiFi.SSID(i));
      Serial.print(" (");
      Serial.print(WiFi.RSSI(i));
      Serial.println(")");
      if (WiFi.SSID(i) == ssid) found = true;
      delay(10);
    }
  }

  if (!found) {
    Serial.print("CRITICAL ERROR: Your SSID '");
    Serial.print(ssid);
    Serial.println("' was NOT found in the scan.");
    Serial.println("Check if your hotspot is set to 2.4GHz and is visible.");
  } else {
    Serial.println("SUCCESS: Your hotspot was found! Attempting connection...");
  }

  // 2. Attempt connection
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    attempt++;
    
    if (attempt % 20 == 0) {
      Serial.println();
      Serial.print("Still trying... WiFi Status: ");
      Serial.print(WiFi.status());
      
      // Detailed status explanation
      switch(WiFi.status()) {
        case 1: Serial.println(" (No SSID Found)"); break;
        case 4: Serial.println(" (Connection Failed - Check Password)"); break;
        case 6: Serial.println(" (Disconnected - Rejected by Phone)"); break;
        default: Serial.println(" (Searching...)"); break;
      }
    }
  }

  Serial.println("\nWiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    if (client.connect("ESP32Client", mqtt_user, mqtt_pass)) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(500);
    }
  }
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  analogSetAttenuation(ADC_11db); // Set ADC attenuation for 0-3.3V range
  pinMode(PIR_PIN, INPUT);
  pinMode(KY033_PIN, INPUT);
  // pinMode(LDR_PIN, INPUT); // Removed: analogRead does not require pinMode and it can interfere on some pins

  setup_wifi();
  
  // For HiveMQ Cloud (SSL)
  espClient.setInsecure(); // Use this for testing, or set CA certificate for production
  
  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Read Sensors
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int motion = digitalRead(PIR_PIN);
  int line = digitalRead(KY033_PIN);
  int light = analogRead(LDR_PIN);
  Serial.print("Raw Light Value: ");
  Serial.println(light);

  if (isnan(temp) || isnan(hum)) {
    Serial.println("Failed to read from DHT sensor!");
    return;
  }

  // Create JSON payload
  StaticJsonDocument<256> doc;
  doc["temperature"] = temp;
  doc["humidity"] = hum;
  doc["motion"] = (motion == HIGH);
  doc["lineDetected"] = (line == LOW);
  doc["lightLevel"] = light;
  doc["timestamp"] = millis(); // Or use NTP for real timestamp

  char buffer[256];
  serializeJson(doc, buffer);

  // Publish to HiveMQ
  Serial.print("Publishing message: ");
  Serial.println(buffer);
  client.publish(topic_publish, buffer);

  delay(5000); // Send data every 5 seconds
}
