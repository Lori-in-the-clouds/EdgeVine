"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sql } from "@/lib/db";

function readRequiredText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Il campo ${key} e obbligatorio.`);
  }

  return value.trim();
}

function readRequiredNumber(formData: FormData, key: string): number {
  const value = Number(readRequiredText(formData, key));
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`Il campo ${key} deve essere numerico.`);
  }

  return value;
}

export async function createVineyard(formData: FormData) {
  const name = readRequiredText(formData, "name");
  const owner = readRequiredText(formData, "owner");
  const altitude = readRequiredNumber(formData, "altitude");
  const latitude = readRequiredNumber(formData, "latitude");
  const longitude = readRequiredNumber(formData, "longitude");

  if (latitude < -90 || latitude > 90) {
    throw new Error("La latitudine deve essere compresa tra -90 e 90.");
  }

  if (longitude < -180 || longitude > 180) {
    throw new Error("La longitudine deve essere compresa tra -180 e 180.");
  }

  const result = await sql<{ id: number }>(
    `
      INSERT INTO vineyard (name, owner, altitude, latitude, longitude)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `,
    [name, owner, altitude, latitude, longitude]
  );

  const vineyardId = result.rows[0]?.id;
  if (!vineyardId) {
    throw new Error("Creazione vineyard fallita.");
  }

  revalidatePath("/");
  redirect(`/vineyards/${vineyardId}`);
}

export async function createZone(vineyardId: number, formData: FormData) {
  if (!Number.isInteger(vineyardId) || vineyardId <= 0) {
    throw new Error("Vineyard non valido.");
  }

  const number = readRequiredNumber(formData, "number");
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("Il numero zona deve essere un intero positivo.");
  }

  const vineyardResult = await sql<{ id: number }>(
    `
      SELECT id
      FROM vineyard
      WHERE id = $1
    `,
    [vineyardId]
  );

  if (vineyardResult.rows.length === 0) {
    throw new Error("Il vineyard selezionato non esiste.");
  }

  const existingZone = await sql<{ id: number }>(
    `
      SELECT id
      FROM vine_zone
      WHERE vineyard_id = $1 AND number = $2
    `,
    [vineyardId, number]
  );

  if (existingZone.rows.length > 0) {
    throw new Error(`La zona ${number} esiste gia per questo vineyard.`);
  }

  await sql(
    `
      INSERT INTO vine_zone (number, vineyard_id)
      VALUES ($1, $2)
    `,
    [number, vineyardId]
  );

  revalidatePath("/");
  revalidatePath(`/vineyards/${vineyardId}`);
  redirect(`/vineyards/${vineyardId}`);
}
