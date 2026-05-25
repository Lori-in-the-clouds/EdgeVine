import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { sql } from './db';
import { DEFAULT_VISION_SETTINGS, normalizeVisionSettings } from './visionSettings';

const execFilePromise = promisify(execFile);

// Extend globalThis in TS definition
declare global {
  var isPredictionWorkerRunning: boolean | undefined;
}

function parseInferenceOutput(stdout: string) {
  const output = stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1);

  if (!output) {
    throw new Error("Python script returned empty output.");
  }

  return JSON.parse(output);
}

let isWorking = false;

export async function processQueue() {
  if (isWorking) return;
  isWorking = true;

  let currentRowId: number | null = null;

  try {
    // 1. Fetch pending rows (where processed_image_url IS NULL)
    const pending = await sql<any>(`
      SELECT id, image_url, vineyard_id, monitoring_node_id 
      FROM computer_vision_data 
      WHERE processed_image_url IS NULL AND health_status = 'Pending Analysis'
      ORDER BY timestamp ASC
      LIMIT 1
    `);

    if (pending.rows.length === 0) {
      isWorking = false;
      return;
    }

    const row = pending.rows[0];
    const { id, image_url } = row;
    currentRowId = id;

    console.log(`🤖 [Background AI Worker] Found pending analysis for row id=${id}, image_url=${image_url}`);

    // Update status to 'Analyzing...' so UI displays that the analysis is in progress
    await sql(`
      UPDATE computer_vision_data 
      SET health_status = 'Analyzing...' 
      WHERE id = $1
    `, [id]);

    // 2. Fetch vision settings from DB
    let visionSettings = DEFAULT_VISION_SETTINGS;
    try {
      const setRes = await sql<any>(`SELECT value FROM app_settings WHERE key = 'vision'`);
      if (setRes.rows.length > 0) {
        const val = typeof setRes.rows[0].value === 'string' ? JSON.parse(setRes.rows[0].value) : setRes.rows[0].value;
        visionSettings = normalizeVisionSettings(val);
      }
    } catch (e) {
      console.warn("Failed to fetch settings, using default vision settings");
    }

    // 3. Prepare paths
    // The image_url is e.g. '/postgres/seed_images/test5.jpg'
    // The input path on disk is path.join(process.cwd(), 'public', image_url)
    const inputPath = path.join(process.cwd(), 'public', image_url);
    if (!fs.existsSync(inputPath)) {
      console.error(`❌ [Background AI Worker] File not found at: ${inputPath}`);
      await sql(`
        UPDATE computer_vision_data 
        SET health_status = 'Error: File not found' 
        WHERE id = $1
      `, [id]);
      isWorking = false;
      return;
    }

    const outputName = `result_${Date.now()}.png`;
    const pythonScriptPath = path.join(process.cwd(), '..', 'CV', 'inference.py');
    const pythonExecutable = process.env.CV_PYTHON ?? 'python3';
    const timeout = Number(process.env.CV_TIMEOUT_MS ?? '300000');

    console.log(`🤖 [Background AI Worker] Running Python inference on ${image_url}...`);

    // 4. Run Python Script
    const result = await execFilePromise(
      pythonExecutable,
      [
        pythonScriptPath,
        inputPath,
        outputName,
        String(visionSettings.depth_uncertainty_pct),
        '--focal-length',
        String(visionSettings.camera_params.focal_length),
        '--sensor-width',
        String(visionSettings.camera_params.sensor_width),
        '--distance',
        String(visionSettings.camera_params.distance),
        '--grape-confidence',
        String(visionSettings.inference_thresholds.grape_confidence),
        '--leaf-confidence',
        String(visionSettings.inference_thresholds.leaf_confidence),
        '--disease-threshold',
        String(visionSettings.inference_thresholds.disease_threshold),
        '--stress-threshold',
        String(visionSettings.inference_thresholds.stress_threshold)
      ],
      {
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
        timeout
      }
    );

    const resultData = parseInferenceOutput(result.stdout);

    // 5. Move generated image to public cv_results
    const scriptGeneratedPath = path.join(process.cwd(), '..', 'CV', 'images', outputName);
    const resultsDir = path.join(process.cwd(), 'public', 'cv_results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    
    const publicOutputPath = path.join(resultsDir, outputName);
    if (fs.existsSync(scriptGeneratedPath)) {
      fs.copyFileSync(scriptGeneratedPath, publicOutputPath);
      fs.unlinkSync(scriptGeneratedPath);
    } else {
      console.error("❌ Output image not generated at:", scriptGeneratedPath);
    }

    // 6. Update database row with results!
    const processedUrl = `/cv_results/${outputName}`;
    const healthStatus = resultData.health_prediction || 'Healthy';
    const grapeCount = resultData.grape_count || 0;
    const estimatedLiters = resultData.liters_estimated || 0.0;
    const estimatedLitersMin = resultData.liters_min || 0.0;
    const estimatedLitersMax = resultData.liters_max || 0.0;
    const leafHealthy = resultData.leaf_healthy_count || 0;
    const leafStress = resultData.leaf_stress_count || 0;
    const leafDisease = resultData.leaf_disease_count || 0;

    await sql(`
      UPDATE computer_vision_data
      SET processed_image_url = $1,
          grape_count = $2,
          health_status = $3,
          estimated_liters = $4,
          estimated_liters_min = $5,
          estimated_liters_max = $6,
          leaf_healthy_count = $7,
          leaf_stress_count = $8,
          leaf_disease_count = $9
      WHERE id = $10
    `, [
      processedUrl,
      grapeCount,
      healthStatus,
      estimatedLiters,
      estimatedLitersMin,
      estimatedLitersMax,
      leafHealthy,
      leafStress,
      leafDisease,
      id
    ]);

    console.log(`✅ [Background AI Worker] Successfully analyzed row id=${id}. Grapes: ${grapeCount}, Health: ${healthStatus}`);

  } catch (error: any) {
    console.error("❌ [Background AI Worker] Inference Error:", error);
    // Mark the specific row we were processing as errored
    if (currentRowId !== null) {
      try {
        await sql(`
          UPDATE computer_vision_data 
          SET health_status = 'Error during analysis' 
          WHERE id = $1
        `, [currentRowId]);
      } catch (e) {
        console.error("Failed to update error status:", e);
      }
    }
  } finally {
    isWorking = false;
  }
}

export function startPredictionWorker() {
  if (globalThis.isPredictionWorkerRunning) return;
  globalThis.isPredictionWorkerRunning = true;

  console.log("🚀 [Background AI Worker] Starting background prediction loop (checks every 5 seconds)...");
  
  // Run immediately on boot
  processQueue();

  // Run in cascade every 5 seconds
  setInterval(() => {
    processQueue();
  }, 5000);
}
