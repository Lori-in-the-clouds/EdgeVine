import type { APIRoute } from 'astro';
import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execFilePromise = promisify(execFile);

type PredictionResponse = {
  success: boolean;
  status?: 'ready' | 'no_data' | 'unavailable';
  data?: unknown;
  error?: string;
};

function jsonResponse(payload: PredictionResponse): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function parsePythonOutput(stdout: string): PredictionResponse {
  const output = stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1);
  if (!output) {
    throw new Error('Prediction script returned empty output.');
  }

  return JSON.parse(output) as PredictionResponse;
}

export const GET: APIRoute = async () => {
  const pythonScriptPath = path.join(process.cwd(), '..', 'Predictions', 'analysis_utils.py');
  const pythonExecutable = process.env.PREDICTION_PYTHON ?? 'python3';
  const timeout = Number(process.env.PREDICTION_TIMEOUT_MS ?? '120000');

  try {
    const { stdout, stderr } = await execFilePromise(pythonExecutable, [pythonScriptPath], {
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
      timeout
    });

    if (stderr.trim()) {
      console.warn('Prediction Python warnings:', stderr);
    }

    return jsonResponse(parsePythonOutput(stdout));
  } catch (error: any) {
    if (typeof error?.stdout === 'string' && error.stdout.trim()) {
      try {
        return jsonResponse(parsePythonOutput(error.stdout));
      } catch (parseError) {
        console.error('Prediction output parse error:', parseError);
      }
    }

    console.error('Predictions API Error:', error);

    return jsonResponse({
      success: false,
      status: 'unavailable',
      error: error instanceof Error ? error.message : 'Unknown prediction error'
    });
  }
};
