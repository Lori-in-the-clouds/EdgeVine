CREATE TABLE IF NOT EXISTS vineyard (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner VARCHAR(255) NOT NULL,
    altitude FLOAT NOT NULL,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL
);

CREATE TABLE IF NOT EXISTS vine_zone (
    id SERIAL PRIMARY KEY,
    number INTEGER NOT NULL,
    vineyard_id INTEGER NOT NULL,
    UNIQUE (vineyard_id, number),
    FOREIGN KEY (vineyard_id) REFERENCES vineyard(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensor_data (
    id SERIAL PRIMARY KEY,
    vine_zone_id INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    temperature FLOAT NOT NULL,
    humidity FLOAT NOT NULL,
    moisture FLOAT NOT NULL,
    FOREIGN KEY (vine_zone_id) REFERENCES vine_zone(id) ON DELETE CASCADE
);
