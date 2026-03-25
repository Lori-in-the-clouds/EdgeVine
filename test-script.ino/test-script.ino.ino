#include <DHT.h>
#include <WiFiS3.h>
#include <PubSubClient.h>
#include "Arduino_LED_Matrix.h"

#define DHTPIN 2
#define DHTTYPE DHT22

char*   WIFI_SSID = "FASTWEB-2427EF"; 
char*   WIFI_PASSWD = "91WP6P437Z";

const char*   MQTT_BROKER = "192.168.1.159";
const int     MQTT_PORT = 1883;
const char*   MQTT_USER = "arduino";
const char*   MQTT_PASSWD = "mosquitto";

WiFiClient espClient;
PubSubClient client(espClient);
DHT dht(DHTPIN, DHTTYPE);
ArduinoLEDMatrix matrix;

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
  Serial.print("Local IP: ");
  Serial.println(WiFi.localIP());
}

void connectMQTT() {
  while (!client.connected()) {
    Serial.print("Connecting MQTT...");
    byte mac[6];
    WiFi.macAddress(mac);

    String clientId = "arduino1-";
    for (int i = 0; i < 6; i++) {
      if (mac[i] < 16) clientId += "0";
      clientId += String(mac[i], HEX);
    }

    if (client.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWD)) {
      Serial.println("connected");
    } else {
      Serial.print("Error, rc=");
      Serial.print(client.state());
      Serial.println(" retry in 2 seconds");
      delay(2000);
    }
  }
}

int mosture = 0;

uint8_t cuore[8][12] = {
  {0,0,1,1,0,0,0,0,1,1,0,0},
  {0,1,1,1,1,1,1,1,1,1,1,0},
  {1,1,1,1,1,1,1,1,1,1,1,1},
  {0,1,1,1,1,1,1,1,1,1,1,0},
  {0,0,1,1,1,1,1,1,1,1,0,0},
  {0,0,0,1,1,1,1,1,1,0,0,0},
  {0,0,0,0,1,1,1,1,0,0,0,0},
  {0,0,0,0,0,1,1,0,0,0,0,0}
};

void setup() {
  pinMode(A0, OUTPUT);
  pinMode(A1, INPUT);

  Serial.begin(9600);

  dht.begin();
  connectWiFi();
  client.setServer(MQTT_BROKER, MQTT_PORT);
  matrix.begin();
  matrix.renderBitmap(cuore, 8, 12);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  if (!client.connected()) {
    connectMQTT();
  }

  client.loop();
  
  digitalWrite(A0, HIGH);
  delay(10);

  mosture = analogRead(A1);

  digitalWrite(A0, LOW);

  Serial.print("Mosture: ");
  Serial.print(mosture);
  Serial.println("%");
  char valueStr[16];
  snprintf(valueStr, sizeof(valueStr), "%d", mosture);
  client.publish("zone/1/sensor/mosture", valueStr, true);

  float h = dht.readHumidity();
  snprintf(valueStr, sizeof(valueStr), "%.2f", h);
  client.publish("zone/1/sensor/humidity", valueStr, true);
  float t = dht.readTemperature();
  snprintf(valueStr, sizeof(valueStr), "%.2f", t);
  client.publish("zone/1/sensor/temperature", valueStr, true);

  Serial.print("Umidità: ");
  Serial.print(h);
  Serial.print("%  Temperatura: ");
  Serial.print(t);
  Serial.println("°C");

  Serial.println("Data published");

  delay(2000);
}
