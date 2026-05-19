import React, { useState, useRef } from 'react';
import { Camera, Trash2, Cpu, Beaker, CheckCircle, AlertTriangle, Layers } from 'lucide-react';

export function VisionConsole() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setPreviewUrl(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const runAnalysis = async () => {
    if (!selectedFile) return;
    setIsAnalyzing(true);
    setResult(null);

    const formData = new FormData();
    formData.append('image', selectedFile);

    try {
      const response = await fetch('/api/vision/analyze', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        setResult(data.data);
      } else {
        alert("Inference Error: " + data.error);
      }
    } catch (err) {
      alert("Failed to connect to AI Server.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const reset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
      
      {/* Upload & Preview Section */}
      <div className="lg:col-span-12 xl:col-span-8 flex flex-col gap-6">
        <div className="bg-white border-2 border-dashed border-stone-200 rounded-[3rem] p-4 min-h-[500px] flex items-center justify-center relative overflow-hidden group transition-all hover:border-[#228B22]/30">
          {!previewUrl ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-6 cursor-pointer group-hover:scale-105 transition-all duration-500"
            >
              <div className="w-24 h-24 bg-stone-50 rounded-[2.5rem] flex items-center justify-center text-stone-300 group-hover:bg-[#228B22]/5 group-hover:text-[#228B22] transition-colors shadow-inner">
                <Camera size={40} />
              </div>
              <div className="text-center space-y-2">
                <p className="text-xl font-black text-stone-800">Toss your field image here</p>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">DRAG & DROP OR TAP TO BROWSE</p>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            </div>
          ) : (
            <div className="w-full h-full relative group/img">
              <img 
                src={result?.processed_image_url || previewUrl} 
                className={`w-full h-full object-contain rounded-[2.5rem] transition-all duration-700 ${isAnalyzing ? 'blur-md grayscale opacity-50' : ''}`} 
              />
              
              {isAnalyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
                  <div className="w-20 h-20 border-t-4 border-[#228B22] border-solid rounded-full animate-spin"></div>
                  <div className="px-6 py-2 bg-stone-900 rounded-full">
                    <span className="text-xs font-black text-[#228B22] uppercase tracking-[0.3em] animate-pulse">Running YOLOv8 Inference...</span>
                  </div>
                </div>
              )}

              {!isAnalyzing && !result && (
                <button 
                  onClick={runAnalysis}
                  className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-[#228B22] text-white px-10 py-5 rounded-2xl font-black uppercase text-sm tracking-widest shadow-2xl hover:bg-[#1B4332] hover:scale-105 transition-all flex items-center gap-3"
                >
                  <Cpu size={20} /> Analyze Now
                </button>
              )}

              {result && (
                <div className="absolute top-6 left-6 px-6 py-3 bg-[#228B22] rounded-2xl shadow-xl flex items-center gap-3">
                   <CheckCircle className="text-white" size={18} />
                   <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Scanning Complete</span>
                </div>
              )}

              <button 
                onClick={reset}
                className="absolute top-6 right-6 w-14 h-14 bg-white/90 backdrop-blur-md rounded-2xl flex items-center justify-center text-stone-900 shadow-xl hover:bg-stone-900 hover:text-white transition-all"
              >
                <Trash2 size={24} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Control & Results Sidebar */}
      <div className="lg:col-span-12 xl:col-span-4 flex flex-col gap-6">
        
        {/* Results Card */}
        <div className="bg-stone-900 rounded-[3rem] p-10 flex flex-col gap-10 shadow-2xl relative overflow-hidden min-h-[500px]">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#228B22] to-transparent"></div>
          
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-white tracking-tight">Inference Results</h3>
            <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">REAL-TIME COMPUTER VISION DATA</p>
          </div>

          <div className="flex flex-col gap-6">
            
            {/* Metric: Liters */}
            <div className={`p-8 rounded-[2rem] border border-white/5 transition-all duration-700 ${result ? 'bg-white/5 transform translate-y-0 opacity-100' : 'opacity-20 translate-y-4'}`}>
               <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[#228B22]/20 flex items-center justify-center text-[#228B22]">
                    <Beaker size={18} />
                  </div>
                  <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Est. Wine Yield</span>
               </div>
               <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black text-white">{result?.liters_estimated || '0.00'}</span>
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-widest font-manrope">Liters</span>
               </div>
            </div>

            {/* Metric: Grapes Count */}
            <div className={`p-8 rounded-[2rem] border border-white/5 transition-all duration-700 delay-100 ${result ? 'bg-white/5 transform translate-y-0 opacity-100' : 'opacity-20 translate-y-4'}`}>
               <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[#228B22]/20 flex items-center justify-center text-[#228B22]">
                    <Layers size={18} />
                  </div>
                  <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Detected Bunches</span>
               </div>
               <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black text-white">{result?.grape_count || '0'}</span>
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-widest font-manrope">Units</span>
               </div>
            </div>

            {/* Metric: Diseases */}
            <div className={`p-8 rounded-[2rem] border border-white/5 transition-all duration-700 delay-200 ${result ? 'bg-white/5 transform translate-y-0 opacity-100' : 'opacity-20 translate-y-4'}`}>
               <div className="flex items-center gap-3 mb-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${result?.diseases_detected?.length > 0 ? 'bg-amber-500/20 text-amber-500' : 'bg-[#228B22]/20 text-[#228B22]'}`}>
                    {result?.diseases_detected?.length > 0 ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
                  </div>
                  <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Health Status</span>
               </div>
               
               {result?.diseases_detected?.length > 0 ? (
                  <div className="space-y-3">
                    <span className="text-xl font-black text-amber-500 tracking-tight">Pathogens Detected</span>
                    <div className="flex flex-wrap gap-2">
                      {result.diseases_detected.map((d: string) => (
                        <span key={d} className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[9px] font-black text-amber-500 uppercase tracking-widest">{d}</span>
                      ))}
                    </div>
                  </div>
               ) : (
                  <span className="text-xl font-black text-white tracking-tight">{result ? 'No diseases found' : 'Ready to scan'}</span>
               )}
            </div>

          </div>

          <div className="mt-auto pt-6 text-center">
             <p className="text-[8px] font-black text-stone-600 uppercase tracking-[0.4em]">EdgeVine proprietary computer vision v1.02</p>
          </div>
        </div>

      </div>
    </div>
  );
}
