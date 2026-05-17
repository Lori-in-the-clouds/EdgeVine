import { useState, useEffect } from 'react';
import { Camera, Save, AlertCircle, Focus } from 'lucide-react';

export function SettingsDashboard() {
  const [uncertainty, setUncertainty] = useState<number>(10);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    // Fetch initial settings
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.settings) {
          const val = data.settings.depth_uncertainty_pct;
          setUncertainty(val !== undefined && val !== null ? val : 10);
        }
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depth_uncertainty_pct: uncertainty })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: 'Settings saved successfully. Future inferences will use this margin.', type: 'success' });
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
            max="50"
            step="1"
            value={uncertainty}
            onChange={(e) => setUncertainty(parseInt(e.target.value))}
            className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          
          <div className="flex justify-between text-[10px] font-black text-stone-400 uppercase tracking-widest mt-2">
            <span>0% (Fixed Plane)</span>
            <span>25%</span>
            <span>50% (High Variance)</span>
          </div>

          <div className="mt-6 flex gap-3 p-4 bg-amber-50 text-amber-800 rounded-xl border border-amber-200/50">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium">
              Increasing the uncertainty margin accounts for the natural depth variance of grape bunches on the canopy. 
              The system currently assumes a standard focal distance of 2000mm. A margin of <strong>±{uncertainty}%</strong> means 
              inferences will output an estimated yield range considering depths from <strong>{2000 * (1 - uncertainty / 100)}mm</strong> to <strong>{2000 * (1 + uncertainty / 100)}mm</strong>.
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
