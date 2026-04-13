import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

export const GET: APIRoute = async ({ url }) => {
  try {
    const range = url.searchParams.get('range') || '24h';
    
    // Configurazione dinamica della query in base all'intervallo richiesto
    let interval: string;
    let grouping: string;
    let dateFormat: string;

    switch (range) {
      case '7d':
        interval = '7 days';
        grouping = 'day';
        dateFormat = 'DD/MM';
        break;
      case '30d':
        interval = '30 days';
        grouping = 'day';
        dateFormat = 'DD/MM';
        break;
      case '90d':
        interval = '90 days';
        grouping = 'week';
        dateFormat = 'DD/MM';
        break;
      case '1y':
        interval = '1 year';
        grouping = 'month';
        dateFormat = 'Mon YY';
        break;
      case '24h':
      default:
        interval = '24 hours';
        grouping = 'hour';
        dateFormat = 'HH24:00';
        break;
    }

    // 1. Calcolo Medie Attuali (KPI Globali) delle ultime 6 ore
    const currentStats = await sql<any>(`
      SELECT 
        AVG(temperature) as avg_temp,
        AVG(humidity) as avg_hum,
        AVG(moisture) as avg_moist,
        COUNT(DISTINCT vine_zone_id) as total_nodes
      FROM sensor_data 
      WHERE timestamp > NOW() - INTERVAL '6 hours'
    `);

    // 2. Analisi Stress Idrico
    const healthAlerts = await sql<any>(`
      WITH latest_readings AS (
        SELECT DISTINCT ON (vine_zone_id) moisture, vine_zone_id
        FROM sensor_data
        ORDER BY vine_zone_id, timestamp DESC
      )
      SELECT COUNT(*) as critical_count
      FROM latest_readings
      WHERE moisture < 20
    `);

    // 3. Storico DINAMICO (Raggruppato per il periodo scelto)
    const history = await sql<any>(`
      SELECT 
        TO_CHAR(date_trunc($1, timestamp), $2) as time,
        ROUND(AVG(temperature)::numeric, 1) as temperature,
        ROUND(AVG(humidity)::numeric, 1) as humidity,
        ROUND(AVG(moisture)::numeric, 1) as moisture,
        date_trunc($1, timestamp) as sort_key
      FROM sensor_data
      WHERE timestamp > NOW() - $3::interval
      GROUP BY date_trunc($1, timestamp)
      ORDER BY sort_key ASC
    `, [grouping, dateFormat, interval]);

    // 4. Logica Previsionale
    const baseYieldPerNode = 250;
    const nodes = parseInt(currentStats.rows[0].total_nodes || "0");
    const avgMoist = parseFloat(currentStats.rows[0].avg_moist || "0");
    const moistureFactor = avgMoist > 0 ? Math.min(avgMoist / 35, 1.2) : 0;
    const predictedWine = Math.round(baseYieldPerNode * nodes * moistureFactor);

    const data = {
      global: {
        temp: Math.round(currentStats.rows[0].avg_temp || 0),
        hum: Math.round(currentStats.rows[0].avg_hum || 0),
        moist: parseFloat((currentStats.rows[0].avg_moist || 0).toFixed(1)),
        nodes: nodes
      },
      health: {
        critical: parseInt(healthAlerts.rows[0].critical_count || 0),
        stable_pct: nodes > 0 
          ? Math.round(((nodes - parseInt(healthAlerts.rows[0].critical_count || 0)) / nodes) * 100) 
          : 0
      },
      production: {
        estimated_liters: predictedWine,
        confidence: 85,
        leaves_analyzed: nodes * 2500
      },
      chartData: history.rows
    };

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
