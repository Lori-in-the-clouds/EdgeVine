import { useState, useEffect } from 'react';
import { Camera, Save, AlertCircle, Focus, Ruler, MoveHorizontal, SlidersHorizontal } from 'lucide-react';
import {
  DEFAULT_CAMERA_PARAMS,
  DEFAULT_INFERENCE_THRESHOLDS,
  MAX_DEPTH_UNCERTAINTY_PCT,
  type CameraParams,
  type InferenceThresholds
} from '../../lib/visionSettings';

function numberOrDefault(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function SettingsDashboard() {
  const [uncertainty, setUncertainty] = useState<number>(10);
  const [cameraParams, setCameraParams] = useState<CameraParams>(DEFAULT_CAMERA_PARAMS);
  const [inferenceThresholds, setInferenceThresholds] = useState<InferenceThresholds>(DEFAULT_INFERENCE_THRESHOLDS);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    // Fetch initial settings
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.settings) {
          const val = data.settings.depth_uncertainty_pct;
          const nextCameraParams = data.settings.camera_params || data.settings;
          const nextThresholds = data.settings.inference_thresholds || data.settings;
          setUncertainty(val !== undefined && val !== null ? Math.min(val, MAX_DEPTH_UNCERTAINTY_PCT) : 10);
          setCameraParams({
            focal_length: numberOrDefault(nextCameraParams.focal_length, DEFAULT_CAMERA_PARAMS.focal_length),
            sensor_width: numberOrDefault(nextCameraParams.sensor_width, DEFAULT_CAMERA_PARAMS.sensor_width),
            distance: numberOrDefault(nextCameraParams.distance, DEFAULT_CAMERA_PARAMS.distance)
          });
          setInferenceThresholds({
            grape_confidence: numberOrDefault(nextThresholds.grape_confidence, DEFAULT_INFERENCE_THRESHOLDS.grape_confidence),
            leaf_confidence: numberOrDefault(nextThresholds.leaf_confidence, DEFAULT_INFERENCE_THRESHOLDS.leaf_confidence),
            disease_threshold: numberOrDefault(nextThresholds.disease_threshold, DEFAULT_INFERENCE_THRESHOLDS.disease_threshold),
            stress_threshold: numberOrDefault(nextThresholds.stress_threshold, DEFAULT_INFERENCE_THRESHOLDS.stress_threshold)
          });
        }
      })
      .catch(console.error);
  }, []);

  const updateCameraParam = (key: keyof CameraParams, value: string) => {
    const numeric = Number(value);
    setCameraParams((current) => ({
      ...current,
      [key]: Number.isFinite(numeric) ? numeric : 0
    }));
  };

  const updateInferenceThreshold = (key: keyof InferenceThresholds, value: string) => {
    const numeric = Number(value);
    setInferenceThresholds((current) => ({
      ...current,
      [key]: Number.isFinite(numeric) ? numeric : 0
    }));
  };

  const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          depth_uncertainty_pct: uncertainty,
          camera_params: cameraParams,
          inference_thresholds: inferenceThresholds
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: 'Settings saved successfully. Future inferences will use this calibration.', type: 'success' });
      } else {
        setMessage({ text: data.error || 'Failed to save settings', type: 'error' });
      }
    } catch (e: any) {
      setMessage({ text: e.message || 'Network error', type: 'error' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Vision Settings Card */}
      <div className="bg-white rounded-[2.5rem] p-8 shadow-ambient border border-stone-100 flex flex-col relative overflow-hidden">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-500">
            <Camera className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-manrope font-black text-stone-800">AI Vision Calibration</h2>
            <p className="text-stone-400 font-inter text-sm">Adjust optical parameters for yield estimation</p>
          </div>
        </div>

        <div className="bg-stone-50 rounded-2xl p-6 border border-stone-100 mb-8">
          <div className="flex justify-between items-center mb-4">
            <label className="font-manrope font-bold text-stone-700 flex items-center gap-2">
              <Focus className="h-4 w-4 text-stone-400" />
              Camera Depth Uncertainty Margin
            </label>
            <span className="text-2xl font-black text-indigo-500">± {uncertainty}%</span>
          </div>
          
          <input
            type="range"
            min="0"
            max={MAX_DEPTH_UNCERTAINTY_PCT}
            step="1"
            value={uncertainty}
            onChange={(e) => setUncertainty(parseInt(e.target.value))}
            className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          
          <div className="flex justify-between text-[10px] font-black text-stone-400 uppercase tracking-widest mt-2">
            <span>0% (Fixed Plane)</span>
            <span>10%</span>
            <span>{MAX_DEPTH_UNCERTAINTY_PCT}% (Max)</span>
          </div>
        </div>

        <div className="bg-stone-50 rounded-2xl p-6 border border-stone-100 mb-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-manrope font-black text-stone-800">Inference Thresholds</h3>
              <p className="text-stone-400 font-inter text-xs">Confidence gates for grape, leaf, and disease detection</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ThresholdSlider
              label="Grape Detection"
              value={inferenceThresholds.grape_confidence}
              onChange={(value) => updateInferenceThreshold('grape_confidence', value)}
              formatPercent={formatPercent}
            />
            <ThresholdSlider
              label="Leaf Detection"
              value={inferenceThresholds.leaf_confidence}
              onChange={(value) => updateInferenceThreshold('leaf_confidence', value)}
              formatPercent={formatPercent}
            />
            <ThresholdSlider
              label="Disease"
              value={inferenceThresholds.disease_threshold}
              onChange={(value) => updateInferenceThreshold('disease_threshold', value)}
              formatPercent={formatPercent}
            />
            <ThresholdSlider
              label="Stress"
              value={inferenceThresholds.stress_threshold}
              onChange={(value) => updateInferenceThreshold('stress_threshold', value)}
              formatPercent={formatPercent}
            />
          </div>
        </div>

        <div className="bg-stone-50 rounded-2xl p-6 border border-stone-100 mb-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-[#228B22]">
              <Ruler className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-manrope font-black text-stone-800">Camera Parameters</h3>
              <p className="text-stone-400 font-inter text-xs">Optical calibration used by the yield estimator</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Focal Length</span>
              <div className="flex items-center gap-2 rounded-2xl bg-white border border-stone-200 px-4">
                <Focus className="h-4 w-4 text-stone-400" />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={cameraParams.focal_length}
                  onChange={(e) => updateCameraParam('focal_length', e.target.value)}
                  className="w-full h-12 bg-transparent text-sm font-black text-stone-800 outline-none"
                />
                <span className="text-[10px] font-black text-stone-400">mm</span>
              </div>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Sensor Width</span>
              <div className="flex items-center gap-2 rounded-2xl bg-white border border-stone-200 px-4">
                <MoveHorizontal className="h-4 w-4 text-stone-400" />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={cameraParams.sensor_width}
                  onChange={(e) => updateCameraParam('sensor_width', e.target.value)}
                  className="w-full h-12 bg-transparent text-sm font-black text-stone-800 outline-none"
                />
                <span className="text-[10px] font-black text-stone-400">mm</span>
              </div>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Distance</span>
              <div className="flex items-center gap-2 rounded-2xl bg-white border border-stone-200 px-4">
                <Camera className="h-4 w-4 text-stone-400" />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={cameraParams.distance}
                  onChange={(e) => updateCameraParam('distance', e.target.value)}
                  className="w-full h-12 bg-transparent text-sm font-black text-stone-800 outline-none"
                />
                <span className="text-[10px] font-black text-stone-400">mm</span>
              </div>
            </label>
          </div>

          <div className="mt-6 flex gap-3 p-4 bg-amber-50 text-amber-800 rounded-xl border border-amber-200/50">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium">
              Increasing the uncertainty margin accounts for the natural depth variance of grape bunches on the canopy. 
              The system currently uses a focal distance of <strong>{cameraParams.distance}mm</strong>. A margin of <strong>±{uncertainty}%</strong> means
              inferences will output an estimated yield range considering depths from <strong>{Math.round(cameraParams.distance * (1 - uncertainty / 100))}mm</strong> to <strong>{Math.round(cameraParams.distance * (1 + uncertainty / 100))}mm</strong>.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            {message && (
              <span className={`text-sm font-bold ${message.type === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                {message.text}
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-[#228B22] hover:bg-[#1a6e1a] text-white px-8 py-3 rounded-xl font-bold transition-all disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}

type ThresholdSliderProps = {
  label: string;
  value: number;
  onChange: (value: string) => void;
  formatPercent: (value: number) => string;
};

function ThresholdSlider({ label, value, onChange, formatPercent }: ThresholdSliderProps) {
  return (
    <label className="rounded-2xl bg-white border border-stone-200 p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">{label}</span>
        <span className="text-xl font-black text-indigo-500">{formatPercent(value)}</span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
      />
      <div className="flex justify-between text-[9px] font-black text-stone-300 uppercase tracking-widest mt-2">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </label>
  );
}
