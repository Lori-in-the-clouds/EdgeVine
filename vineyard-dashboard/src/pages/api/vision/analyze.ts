import type { APIRoute } from 'astro';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { DEFAULT_VISION_SETTINGS, normalizeVisionSettings } from '../../../lib/visionSettings';

const execFilePromise = promisify(execFile);

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

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const image = formData.get('image') as File | null;
    const imagePath = formData.get('imagePath') as string | null;
    
    if (!image && !imagePath) {
      return new Response(JSON.stringify({ success: false, error: "No image or path provided" }), { status: 400 });
    }

    // 1. Setup paths
    const tempDir = path.join(process.cwd(), 'public', 'cv_temp');
    const resultsDir = path.join(process.cwd(), 'public', 'cv_results');
    
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    let inputPath: string;
    let fileName: string;

    if (image) {
      fileName = `input_${Date.now()}.png`;
      inputPath = path.join(tempDir, fileName);
      const buffer = Buffer.from(await image.arrayBuffer());
      fs.writeFileSync(inputPath, buffer);
    } else {
      // Use existing file in public folder (security check: ensure it starts with /captures/)
      if (!imagePath?.startsWith('/captures/')) {
        return new Response(JSON.stringify({ success: false, error: "Invalid path access" }), { status: 403 });
      }
      fileName = path.basename(imagePath);
      inputPath = path.join(process.cwd(), 'public', imagePath);
      
      if (!fs.existsSync(inputPath)) {
        return new Response(JSON.stringify({ success: false, error: "File not found" }), { status: 404 });
      }
    }

    const outputName = `result_${Date.now()}.png`;

    // 3. Prepare Python command
    const pythonScriptPath = path.join(process.cwd(), '..', 'CV', 'inference.py');
    const pythonExecutable = process.env.CV_PYTHON ?? 'python3';
    const timeout = Number(process.env.CV_TIMEOUT_MS ?? '300000');
    
    // Fetch camera and uncertainty settings from db
    const { sql } = await import('../../../lib/db');
    let visionSettings = DEFAULT_VISION_SETTINGS;
    try {
      const setRes = await sql<any>(`SELECT value FROM app_settings WHERE key = 'vision'`);
      if (setRes.rows.length > 0) {
        const val = typeof setRes.rows[0].value === 'string' ? JSON.parse(setRes.rows[0].value) : setRes.rows[0].value;
        visionSettings = normalizeVisionSettings(val);
      }
    } catch(e) { console.warn("Failed to fetch settings, using default vision settings"); }

    console.log(`🚀 RUNNING_AI: ${fileName} using ${pythonScriptPath} with uncertainty ${visionSettings.depth_uncertainty_pct}%`);

    // 4. Execute Inference
    let stdout: string, stderr: string;
    try {
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
          String(visionSettings.inference_thresholds.disease_threshold)
        ],
        {
          env: process.env,
          maxBuffer: 10 * 1024 * 1024,
          timeout
        }
      );
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execErr: any) {
      console.error("Exec Error:", execErr);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Python execution failed. Ensure CV_PYTHON points to an environment with the CV dependencies installed.", 
        details: execErr.message,
        stdout: execErr.stdout,
        stderr: execErr.stderr
      }), { status: 500 });
    }
    
    if (stderr && !stderr.includes('YOLO') && !stderr.includes('fenced')) {
      console.warn("Python Warnings:", stderr);
    }

    // 5. Parse JSON output from Python
    try {
      const resultData = parseInferenceOutput(stdout);
      
      const scriptGeneratedPath = path.join(process.cwd(), '..', 'CV', 'images', outputName);
      const publicOutputPath = path.join(resultsDir, outputName);

      if (fs.existsSync(scriptGeneratedPath)) {
        // Use copy + unlink instead of rename to avoid EXDEV error across Docker volumes
        fs.copyFileSync(scriptGeneratedPath, publicOutputPath);
        fs.unlinkSync(scriptGeneratedPath);
      } else {
        console.error("Output image not found at:", scriptGeneratedPath);
      }

      return new Response(JSON.stringify({
        success: true,
        data: {
          ...resultData,
          original_image: imagePath || `/cv_temp/${fileName}`,
          processed_image_url: `/cv_results/${outputName}`
        }
      }), { status: 200 });
      
    } catch (parseErr: any) {
      console.error("Output Parse Error:", stdout);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Inference failed to return valid data", 
        raw: stdout,
        details: parseErr.message 
      }), { status: 500 });
    }

  } catch (err: any) {
    console.error("Vision API Error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
};
