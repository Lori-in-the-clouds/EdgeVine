#include <Arduino.h>
#include <ArduinoJson.h>
#include <LoRa_E220.h>

#define ID 0
#define LORA_RX 2
#define LORA_TX 3
#define LORA_AUX 7
#define LORA_M0 4
#define LORA_M1 5

LoRa_E220 lora(LORA_RX, LORA_TX, LORA_AUX, LORA_M0, LORA_M1);

JsonDocument json;

void setup() {
  Serial.begin(9600);
  lora.begin();
  
  json["id"] = ID;
  
  delay(500);
  Serial.println("LoRa Receiver ready");
}

void loop() {
  if (lora.available() > 1) {
    ResponseContainer rc = lora.receiveMessage();

    if (rc.status.code != 1) {
      Serial.print("Error receiving LoRa message: ");
      Serial.println(rc.status.getResponseDescription());
      return;
    } else {
      Serial.println(rc.data);
    }
  }
}