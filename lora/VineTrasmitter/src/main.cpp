#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <LoRa_E220.h>

#define ID 1
#define DHTPIN 8
#define DHTTYPE DHT22
#define MOISTUREPIN A1
#define LORA_RX 2
#define LORA_TX 3
#define LORA_AUX 7
#define LORA_M0 4
#define LORA_M1 5
#define LORA_MASTER_ADDH 0x00
#define LORA_MASTER_ADDL 0x03
#define LORA_MASTER_CHAN 0x23

LoRa_E220 lora(LORA_RX, LORA_TX, LORA_AUX, LORA_M0, LORA_M1);
DHT dht(DHTPIN, DHTTYPE);

JsonDocument json;

int readDHT() {
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("Failed to read from DHT sensor!");
    return 1;
  }
  json["temperature"] = temperature;
  json["humidity"] = humidity;
  return 0;
}

int readMoisture() {
  int moisture = analogRead(MOISTUREPIN);

  if (moisture < 0) {
    Serial.println("Failed to read from moisture sensor!");
    return 4;
  }

  json["moisture"] = moisture;
  return 0;
}

void setup() {
  Serial.begin(9600);
  lora.begin();
  dht.begin();

  pinMode(MOISTUREPIN, INPUT);
  
  json["id"] = ID;
  
  delay(500);
}

void loop() {  
  int reading = readDHT() + readMoisture();

  if (reading) {
    Serial.println("Error reading sensors, skipping LoRa transmission.");
    Serial.print("Error code: ");
    Serial.println(reading);
    delay(5000);
    return;
  }

  String msg;
  serializeJson(json, msg);
  
  ResponseStatus rs = lora.sendFixedMessage(LORA_MASTER_ADDH, LORA_MASTER_ADDL, LORA_MASTER_CHAN, msg);
  Serial.print("LoRa transmission status: ");
  Serial.println(rs.getResponseDescription());
  Serial.print("Sent message: ");
  Serial.println(msg);
  delay(5000);
}