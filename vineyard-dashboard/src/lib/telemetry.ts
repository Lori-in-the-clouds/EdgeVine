export type TelemetryValue = number | string | null | undefined;

export const MOISTURE_ADC_WET = 0;
export const MOISTURE_ADC_DRY = 1023;

export function toFiniteNumber(value: TelemetryValue): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizePercent(value: TelemetryValue, decimals = 1): number | null {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return null;
  }

  return roundTo(Math.min(100, Math.max(0, numeric)), decimals);
}

export function normalizeMoisturePercent(value: TelemetryValue, decimals = 1): number | null {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return null;
  }

  if (numeric >= 0 && numeric <= 100) {
    return roundTo(numeric, decimals);
  }

  const raw = Math.min(
    Math.max(numeric, Math.min(MOISTURE_ADC_WET, MOISTURE_ADC_DRY)),
    Math.max(MOISTURE_ADC_WET, MOISTURE_ADC_DRY)
  );
  const percent = ((raw - MOISTURE_ADC_DRY) / (MOISTURE_ADC_WET - MOISTURE_ADC_DRY)) * 100;

  return normalizePercent(percent, decimals);
}

export function moisturePercentSql(columnExpression: string): string {
  return `
    CASE
      WHEN ${columnExpression} BETWEEN 0 AND 100 THEN ${columnExpression}
      ELSE LEAST(
        100.0,
        GREATEST(
          0.0,
          (
            (
              LEAST(
                GREATEST(${columnExpression}, ${Math.min(MOISTURE_ADC_WET, MOISTURE_ADC_DRY)}),
                ${Math.max(MOISTURE_ADC_WET, MOISTURE_ADC_DRY)}
              ) - ${MOISTURE_ADC_DRY}
            ) / (${MOISTURE_ADC_WET} - ${MOISTURE_ADC_DRY})::float8
          ) * 100.0
        )
      )
    END
  `;
}
