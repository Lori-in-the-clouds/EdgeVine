#include <Arduino.h>
#include <ArduinoJson.h>
#include <LoRa_E220.h>
#include <Arduino_LED_Matrix.h>
#include <ArduinoGraphics.h>

#define ID 0
#define LORA_RX 2
#define LORA_TX 3
#define LORA_AUX 7
#define LORA_M0 4
#define LORA_M1 5
#define BUTTON_PIN 8
#define DEBOUNCE_DELAY 50

LoRa_E220 lora(LORA_RX, LORA_TX, LORA_AUX, LORA_M0, LORA_M1);

ArduinoLEDMatrix matrix;

int lastReading = LOW;
int buttonState = LOW;
unsigned long lastChangeTime = 0;

void sendRequest() {
  JsonDocument json;
  json["type"] = "request";
  String msg;
  serializeJson(json, msg);
  Serial.println(msg);
}

void printText(const char* text) {
  String output = "     " + String(text);
  matrix.beginDraw();

  matrix.stroke(0xFFFFFF);
  matrix.textScrollSpeed(100);
  matrix.textFont(Font_4x6);
  matrix.beginText(0, 1, 0xFFFFFF);

  matrix.println(output);
  matrix.endText(SCROLL_LEFT);

  matrix.endDraw();
}

void setup() {
  Serial.begin(9600);
  lora.begin();
  matrix.begin();

  pinMode(BUTTON_PIN, INPUT_PULLUP);

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

  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    JsonDocument json;
    deserializeJson(json, input);
    if (json["type"] == "response") {
      printText("Received response:");
      Serial.println("Received response:");
      for (JsonVariant str : json["strings"].as<JsonArray>()) {
        printText(str.as<const char*>());
        delay(500);
      }
    }
  }
  
  int buttonReading = digitalRead(BUTTON_PIN);

  if (buttonReading != lastReading) {
    lastChangeTime = millis();
    lastReading = buttonReading;
  }

  if ((millis() - lastChangeTime >= DEBOUNCE_DELAY) && (buttonReading != buttonState)) {
    buttonState = buttonReading;

    if (buttonState == HIGH) {
      sendRequest();
    }
  }
}