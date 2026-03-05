#include <DHT.h>

#define DHTPIN 2
#define DHTTYPE DHT22

DHT dht(DHTPIN, DHTTYPE);

int mosture = 0;

void setup() {
  pinMode(A0, OUTPUT);
  pinMode(A1, INPUT);

  dht.begin();

  Serial.begin(9600);
}

void loop() {
  digitalWrite(A0, HIGH);
  delay(10);

  mosture = analogRead(A1);

  digitalWrite(A0, LOW);

  Serial.print("Mosture: ");
  Serial.println(mosture);

  float h = dht.readHumidity();
  float t = dht.readTemperature();

  Serial.print("Umidità: ");
  Serial.print(h);
  Serial.print("%  Temperatura: ");
  Serial.print(t);
  Serial.println("°C");

  delay(2000);
}
