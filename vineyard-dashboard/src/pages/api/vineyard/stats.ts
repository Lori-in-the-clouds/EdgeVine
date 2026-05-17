import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

export const GET: APIRoute = async ({ url }) => {
  const range = url.searchParams.get('range') || '24h';
  
  let timeInterval = "INTERVAL '24 hours'";
  let grouping = "hour";
  let dateFormat = "HH:00";

  if (range === '7d') {
    timeInterval = "INTERVAL '7 days'";
    grouping = "day";
    dateFormat = "DD/MM";
  } else if (range === '30d') {
    timeInterval = "INTERVAL '30 days'";
    grouping = "day";
    dateFormat = "DD/MM";
  } else if (range === '90d') {
    timeInterval = "INTERVAL '90 days'";
    grouping = "week";
    dateFormat = "WW";
  } else if (range === '1y') {
    timeInterval = "INTERVAL '1 year'";
    grouping = "month";
    dateFormat = "MM/YY";
  }

  try {
    // 1. Statistiche Globali (Ultima lettura conosciuta per ogni sensore)
    const currentStats = await sql<any>(`
      WITH latest_readings AS (
        SELECT DISTINCT ON (sensor_id) 
          temperature, humidity, moisture, sensor_id 
        FROM sensor_data 
        ORDER BY sensor_id, timestamp DESC
      )
      SELECT 
        AVG(temperature) as avg_temp,
        AVG(humidity) as avg_hum,
        AVG(moisture) as avg_moist,
        COUNT(*) as total_nodes
      FROM latest_readings
    `);

    // 2. Analisi Salute GRANULARE (Conteggio Foglie AI)
    const healthData = await sql<any>(`
      WITH latest_zone_status AS (
        SELECT DISTINCT ON (sensor_id) 
          leaf_healthy_count, 
          leaf_stress_count, 
          leaf_disease_count,
          sensor_id
        FROM sensor_data
        ORDER BY sensor_id, timestamp DESC
      )
      SELECT 
        SUM(leaf_healthy_count) as total_healthy,
        SUM(leaf_stress_count) as total_stress,
        SUM(leaf_disease_count) as total_disease
      FROM latest_zone_status
    `);

    // 3. Storico DINAMICO
    const history = await sql<any>(`
      SELECT 
        TO_CHAR(date_trunc($1, timestamp), $2) as time,
        AVG(temperature) as temperature,
        AVG(humidity) as humidity,
        AVG(moisture) as moisture
      FROM sensor_data
      WHERE timestamp > NOW() - ${timeInterval}
      GROUP BY 1
      ORDER BY MIN(timestamp) ASC
    `, [grouping, dateFormat]);

    // Fetch uncertainty setting from db
    let uncertainty = 10;
    try {
      const setRes = await sql<any>(`SELECT value FROM app_settings WHERE key = 'vision'`);
      if (setRes.rows.length > 0) {
        const val = typeof setRes.rows[0].value === 'string' ? JSON.parse(setRes.rows[0].value) : setRes.rows[0].value;
        if (val && typeof val.depth_uncertainty_pct === 'number') {
          uncertainty = val.depth_uncertainty_pct;
        }
      }
    } catch(e) { console.warn("Failed to fetch settings, using default uncertainty"); }

    const uFactorMin = Math.pow(1 - uncertainty / 100, 2);
    const uFactorMax = Math.pow(1 + uncertainty / 100, 2);

    // 4. Ultime Acquisizioni Visione Artificiale (deduplicate by image_url)
    const captures = await sql<any>(`
      SELECT * FROM (
        SELECT DISTINCT ON (sd.image_url)
          sd.id,
          COALESCE(vz.name, vz.external_id) as sensor_name,
          sd.timestamp,
          TO_CHAR(sd.timestamp, 'DD/MM') as date,
          TO_CHAR(sd.timestamp, 'HH24:MI') as time,
          sd.image_url,
          sd.grape_count,
          sd.health_status,
          sd.estimated_liters,
          COALESCE(sd.estimated_liters_min, sd.estimated_liters * $1) as estimated_liters_min,
          COALESCE(sd.estimated_liters_max, sd.estimated_liters * $2) as estimated_liters_max,
          sd.processed_image_url
        FROM sensor_data sd
        JOIN vine_zone vz ON vz.id = sd.sensor_id
        WHERE sd.image_url IS NOT NULL
        ORDER BY sd.image_url, sd.timestamp DESC
      ) sub
      ORDER BY sub.timestamp DESC
      LIMIT 20
    `, [uFactorMin, uFactorMax]);

    // 5. Logica Previsionale basata su AI
    const aiPrediction = await sql<any>(`
      WITH latest_ai AS (
        SELECT DISTINCT ON (sensor_id) estimated_liters, estimated_liters_min, estimated_liters_max
        FROM sensor_data
        WHERE estimated_liters IS NOT NULL
        ORDER BY sensor_id, timestamp DESC
      )
      SELECT 
        SUM(estimated_liters) as total_predicted_liters,
        SUM(COALESCE(estimated_liters_min, estimated_liters * $1)) as total_predicted_min,
        SUM(COALESCE(estimated_liters_max, estimated_liters * $2)) as total_predicted_max
      FROM latest_ai
    `, [uFactorMin, uFactorMax]);

    const leafHealthy = parseInt(healthData.rows[0].total_healthy || 0);
    const leafStress = parseInt(healthData.rows[0].total_stress || 0);
    const leafDisease = parseInt(healthData.rows[0].total_disease || 0);
    const totalLeaves = leafHealthy + leafStress + leafDisease;

    const totalZones = await sql<any>(`SELECT COUNT(*) FROM vine_zone`).then(res => parseInt(res.rows[0].count || 0));

    const data = {
      global: {
        nodes: totalZones,
        temp: Math.round(parseFloat(currentStats.rows[0].avg_temp || "0") * 10) / 10,
        hum: Math.round(parseFloat(currentStats.rows[0].avg_hum || "0") * 10) / 10,
        moist: Math.round(parseFloat(currentStats.rows[0].avg_moist || "0") * 10) / 10
      },
      health: {
        healthy: leafHealthy,
        stress: leafStress,
        disease: leafDisease,
        stable_pct: totalLeaves > 0 
          ? Math.round((leafHealthy / totalLeaves) * 100) 
          : 0
      },
      production: {
        estimated_liters: Math.round(parseFloat(aiPrediction.rows[0].total_predicted_liters || "0")),
        estimated_liters_min: Math.round(parseFloat(aiPrediction.rows[0].total_predicted_min || "0")),
        estimated_liters_max: Math.round(parseFloat(aiPrediction.rows[0].total_predicted_max || "0")),
        confidence: 94,
        leaves_analyzed: totalLeaves
      },
      chartData: history.rows,
      recentCaptures: captures.rows
    };

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("Stats API Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
