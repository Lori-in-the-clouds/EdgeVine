import { useState, useEffect, useRef } from 'react';
import { MapPin, Maximize, Save, RefreshCw, Layers, Radio, Trash2, AlertTriangle, XCircle } from 'lucide-react';
import { point } from '@turf/helpers';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { ConfigurationMap, type Sector } from '../map/ConfigurationMap';
import { calculateArea, calculateCenter } from '../../lib/spatialUtils';

export function EditForm() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [mapKey, setMapKey] = useState(1);
   const [showSaveSuccess, setShowSaveSuccess] = useState(false);
   const [showPlacementError, setShowPlacementError] = useState(false);
   const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [, setLandArea] = useState('---');
  const [landCentroid, setLandCentroid] = useState('---');
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [sentinels, setSentinels] = useState<any[]>([]);
  const [duplicateModal, setDuplicateModal] = useState<{ show: boolean, id: string }>({ show: false, id: '' });
  // Always-current ref for sectors - avoids stale closure issues in event handlers
  const sectorsRef = useRef<Sector[]>([]);
  useEffect(() => { sectorsRef.current = sectors; }, [sectors]);

  const sentinelsRef = useRef<any[]>([]);
  useEffect(() => { sentinelsRef.current = sentinels; }, [sentinels]);


  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [configRes, sensorsRes] = await Promise.all([
          fetch('/api/vineyard/config'),
          fetch('/api/sensors')
        ]);
        
        const configData = await configRes.json();
        const sensorsData = await sensorsRes.json();

        if (configData.success && configData.data) {
          const v = configData.data;
          setLandArea(v.area || '---');
          setLandCentroid(`${v.latitude}° N, ${v.longitude}° E`);
          
          if (v.sectors) {
             setSectors(v.sectors);
             if (v.sectors.length > 0) setSelectedSectorId(v.sectors[0].id);
          } else if (v.perimeter) {
            // Migrate single vineyard to first sector
            const p = typeof v.perimeter === 'string' ? JSON.parse(v.perimeter) : v.perimeter;
            const r = typeof v.rows === 'string' ? JSON.parse(v.rows) : v.rows;
            const legacySector: Sector = {
              id: 'sector-1',
              name: 'Vineyard 1',
              perimeter: p,
              rows: r || [],
              rowSpacing: v.row_spacing || 2.5,
              rowOrientation: v.row_orientation || 0,
              targetRowCount: v.target_row_count || '',
              showRows: true,
              colorTheme: { poly: '#228B22', rows: '#FFD700' }
            };
            setSectors([legacySector]);
            setSelectedSectorId('sector-1');
          }
        }

        if (sensorsData.success && sensorsData.data) {
          const zones = sensorsData.data.map((s: any) => ({
            number: s.zone_number,
            name: s.zone_name || `Sentinel ${s.zone_number}`,
            external_id: s.external_id || `S-${s.zone_number.toString().padStart(2, '0')}`,
            latitude: s.latitude,
            longitude: s.longitude
          }));
          setSentinels(zones);
        }
      } catch (e) {
        console.error("Error loading config:", e);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  const handleAreaUpdate = (area: string, centroid: string) => {
    setLandArea(area);
    setLandCentroid(centroid);
  };

  const handleSentinelNameChange = (number: number, newName: string, oldName?: string, inputEl?: HTMLInputElement): boolean => {
    const trimmed = newName.trim();
    if (!trimmed) return false;
    if (oldName && trimmed === oldName.trim()) return true;

    // Check against all sentinels (excluding self if it's a sentinel)
    const duplicateInSentinels = sentinels.some(s => 
      s.name.trim().toLowerCase() === trimmed.toLowerCase() && s.number !== number
    );

    // Check against ALL rows in ALL sectors
    const duplicateInRows = sectors.some(s => 
      (s.rows || []).some(r => {
        const rId = (r.id || r.name || '').toString().trim().toLowerCase();
        // If we're updating a row (number === -1), we must still check collisions.
        // The trimmed === oldName check above already handled "editing to same value".
        return rId === trimmed.toLowerCase();
      })
    );
    
    if (duplicateInSentinels || duplicateInRows) {
      setDuplicateModal({ show: true, id: trimmed });
      if (inputEl && oldName) inputEl.value = oldName; 
      return false;
    }

    if (number !== -1) { 
       setSentinels(prev => prev.map(s => s.number === number ? { ...s, name: trimmed, external_id: trimmed } : s));
    }
    return true;
  };


  const handleRowIdChange = (oldId: string, newId: string, sectorId: string, idx: number, inputEl: HTMLInputElement): boolean => {
    const trimmed = newId.trim();
    if (!trimmed) { inputEl.value = oldId; return false; }
    if (trimmed === oldId.trim()) return true; // no change, skip

    // Use ref to always get the latest sectors - avoids stale closure
    const currentSectors = sectorsRef.current;
    const currentSentinels = sentinelsRef.current;

    // Check ALL rows in ALL sectors, but exclude self (same sectorId AND same idx)
    const duplicateInRows = currentSectors.some(s =>
      (s.rows || []).some((r, i) => {
        if (s.id === sectorId && i === idx) return false; // skip self
        return (r.id || '').trim().toLowerCase() === trimmed.toLowerCase();
      })
    );

    // Also check against sentinels
    const duplicateInSentinels = currentSentinels.some(s =>
      (s.name || '').trim().toLowerCase() === trimmed.toLowerCase()
    );

    if (duplicateInRows || duplicateInSentinels) {
      setDuplicateModal({ show: true, id: trimmed });
      inputEl.value = oldId; // revert
      return false;
    }

    // Valid - update state
    setSectors(prev => prev.map(s => {
      if (s.id !== sectorId) return s;
      const newRows = s.rows.map((r, i) => i === idx ? { ...r, id: trimmed, name: trimmed } : r);
      return { ...s, rows: newRows };
    }));
    return true;
  };


  const handleClearAll = () => {
    setShowClearConfirm(true);
  };

  const executeClearAll = async () => {
    setSentinels([]);
    setSectors([]);
    setSelectedSectorId(null);
    setLandArea('---');
    setLandCentroid('---');
    setMapKey(prev => prev + 1);
    setShowClearConfirm(false);

    setIsSaving(true);
    try {
      await fetch('/api/vineyard/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area: '---',
          centroid: '---',
          sectors: [],
          zones: []
        })
      });
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } catch(err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Calculate real area from all sectors
      const totalArea = sectors.reduce((acc, s) => acc + calculateArea(s.perimeter), 0);
      const areaStr = totalArea > 0 ? `${totalArea.toLocaleString(undefined, { maximumFractionDigits: 0 })} m²` : '---';
      
      const response = await fetch('/api/vineyard/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area: areaStr,
          centroid: landCentroid,
          sectors: sectors,
          zones: sentinels.map(s => {
            let s_id = null;
            try {
              const lng = Number(s.longitude);
              const lat = Number(s.latitude);
              
              if (!isNaN(lng) && !isNaN(lat)) {
                const sector = sectors.find(sec => {
                  if (!sec.perimeter) return false;
                  return booleanPointInPolygon(point([lng, lat]), sec.perimeter);
                });
                if (sector) {
                  s_id = sector.name; // Salviamo il NOME (es. "Sector 1")
                  console.log(`Sentinel ${s.number} matched to: ${s_id}`);
                } else {
                  console.warn(`Sentinel ${s.number} is OUTSIDE all sectors`);
                }
              }
            } catch (spatialErr) {
              console.error("Spatial check error:", spatialErr);
            }

            return {
              ...s,
              external_id: s.external_id || (typeof s.name === 'string' && s.name.startsWith('S-') ? s.name : `S-${s.number.toString().padStart(2, '0')}`),
              sector_id: s_id
            };
          })
        })
      });
      
      const result = await response.json();
      if (result.success) {
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 3000);
      } else {
        alert("Server Error: " + (result.error || "Unknown error during save"));
      }
    } catch (err: any) {
      console.error("Save error:", err);
      alert("Network Error: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const totalRowsLength = sectors.reduce((acc, s) => acc + (s.rows?.reduce((ra, r) => ra + (r.length || 0), 0) || 0), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#228B22]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-12 max-w-7xl mx-auto p-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 relative">
      
      {showPlacementError && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[10000] bg-stone-900 border-2 border-yellow-500/50 text-white px-8 py-5 rounded-[2rem] shadow-[0_20px_50px_rgba(234,179,8,0.2)] flex items-center gap-5 animate-in fade-in slide-in-from-top-10 duration-700">
          <div className="relative">
             <div className="absolute inset-0 bg-yellow-500 blur-md opacity-20 animate-pulse"></div>
             <AlertTriangle className="h-8 w-8 text-yellow-500 relative" />
          </div>
          <div className="flex flex-col">
            <span className="font-black uppercase tracking-widest text-[10px] text-yellow-500">Placement Blocked</span>
            <span className="font-bold text-stone-300 text-[11px]">Sentinels must be placed inside a sector perimeter.</span>
          </div>
          <button onClick={() => setShowPlacementError(false)} className="ml-4 p-2 hover:bg-white/5 rounded-full transition-all text-stone-500 hover:text-white">
            <XCircle className="h-5 w-5" />
          </button>
        </div>
      )}

      {showSaveSuccess && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[9999] bg-[#1B4332] border-2 border-[#228B22] text-white px-8 py-4 rounded-full shadow-[0_10px_40px_rgba(34,139,34,0.3)] flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
          <Save className="h-5 w-5 text-[#228B22]" />
          <span className="font-black uppercase tracking-widest text-xs">Configuration saved successfully!</span>
        </div>
      )}

      {/* Duplicate ID Warning Modal */}
      {duplicateModal.show && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-stone-900 border border-white/10 p-8 rounded-[2rem] shadow-2xl max-w-sm w-full text-center">
            <div className="mx-auto w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-6">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">Duplicate ID</h3>
            <p className="text-stone-400 text-sm mb-8">
              The ID <span className="text-amber-500 font-bold">"{duplicateModal.id}"</span> is already assigned. Please use a unique identifier for this asset.
            </p>
            <button 
              onClick={() => setDuplicateModal({ show: false, id: '' })} 
              className="w-full px-4 py-3 rounded-xl bg-blend-soft-light bg-stone-100 text-stone-900 font-black uppercase tracking-widest text-[10px] hover:bg-white transition-all shadow-xl"
            >
              Return to Grid
            </button>
          </div>
        </div>
      )}

      {/* Clear Confirmation Custom Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-stone-900 border border-white/10 p-8 rounded-[2rem] shadow-2xl max-w-sm w-full text-center">
            <div className="mx-auto w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">Clear Map?</h3>
            <p className="text-stone-400 text-sm mb-8">This will permanently delete all sentinels and all configured vineyard sectors. This action cannot be undone.</p>
            <div className="flex gap-4">
              <button 
                onClick={() => setShowClearConfirm(false)} 
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 text-white font-bold hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={executeClearAll} 
                className="flex-1 px-4 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

       {/* Precision Mapping Engine */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
             <h3 className="text-xl font-manrope font-black text-stone-800 uppercase tracking-widest">Geographic Mapping</h3>
          </div>
        </div>
        <ConfigurationMap 
          key={mapKey}
          onAreaUpdate={handleAreaUpdate} 
          onGeometryUpdate={() => {}} // We'll handle geometry via sectors prop
          onSentinelsUpdate={(newSentinels) => {
             setSentinels(prev => newSentinels.map(ns => {
               const existing = prev.find(ps => ps.number === ns.number);
               // L'ID esterno è il nome inserito, oppure il vecchio ID, o un default
               const identifier = ns.name || existing?.external_id || `S-${ns.number.toString().padStart(2, '0')}`;
               return { 
                 ...ns, 
                 name: identifier,
                 external_id: identifier
               };
             }));
          }}
          onSentinelNameChange={handleSentinelNameChange}
          sectors={sectors}
          selectedSectorId={selectedSectorId}
          onSectorsUpdate={setSectors}
          onSectorSelect={setSelectedSectorId}
          onInvalidPlacement={() => {
            setShowPlacementError(true);
            setTimeout(() => setShowPlacementError(false), 4500);
          }}
          initialZones={sentinels} 
        />
      </section>

      {/* Configuration Console - MOVED HERE between map and Land Sheet */}
      <div className="sticky top-4 z-[40] mb-8 pointer-events-none">
        <div className="bg-black/80 backdrop-blur-2xl border border-white/10 px-8 py-4 rounded-[2rem] shadow-2xl flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-4">
             <div className="bg-[#228B22] p-2 rounded-lg shadow-lg">
               <MapPin className="h-4 w-4 text-white" />
             </div>
             <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] hidden sm:block">Configuration Console</h3>
          </div>
          
          <div className="flex items-center gap-3">
             <button 
                onClick={handleClearAll}
                className="flex items-center gap-2 text-[10px] font-black text-red-400 bg-red-400/10 hover:bg-red-400 hover:text-white px-5 py-3 rounded-xl uppercase tracking-widest transition-all"
             >
                <Trash2 className="h-4 w-4" /> Clear Setup
             </button>
             <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 text-[10px] font-black text-white bg-[#228B22] hover:bg-[#2d5a44] px-6 py-3 rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-green-900/20 disabled:opacity-50"
             >
                {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 
                {isSaving ? 'Saving...' : 'Save'}
             </button>
          </div>
        </div>
      </div>

      {/* Land Sheet */}
      <div className="bg-white rounded-[3rem] p-12 shadow-2xl border border-stone-100 relative overflow-hidden transition-all duration-500 hover:shadow-[0_40px_80px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-4 mb-10">
          <div className="bg-stone-900 p-3 rounded-2xl">
            <Layers className="h-6 w-6 text-[#228B22]" />
          </div>
          <h2 className="text-4xl font-manrope font-black text-stone-900 tracking-tight">
            Land <span className="text-[#228B22]">Sheet</span>
          </h2>
        </div>

        {/* Global Overview Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-10 bg-stone-50 border border-stone-100 rounded-[2.5rem] mb-12">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-stone-400">
              <Maximize className="h-4 w-4" />
              <p className="text-[10px] uppercase font-black tracking-[0.2em]">Total Surface Area</p>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-4xl font-black font-manrope text-stone-900 tracking-tighter">
                {sectors.reduce((acc, s) => acc + calculateArea(s.perimeter), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <span className="text-xs font-black text-stone-300 uppercase">m²</span>
            </div>
          </div>

          <div className="space-y-3 border-x border-stone-200 px-8">
            <div className="flex items-center gap-2 text-stone-400">
              <MapPin className="h-4 w-4" />
              <p className="text-[10px] uppercase font-black tracking-[0.2em]">Primary Centroid</p>
            </div>
            <p className="text-xl font-black font-manrope text-stone-900 tracking-tight truncate">
              {sectors.length > 0 ? (
                (() => {
                  let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
                  sectors.forEach(s => {
                    if (!s.perimeter) return;
                    const center = calculateCenter(s.perimeter);
                    const [lng, lat] = center.geometry.coordinates;
                    if (lng < minLng) minLng = lng;
                    if (lng > maxLng) maxLng = lng;
                    if (lat < minLat) minLat = lat;
                    if (lat > maxLat) maxLat = lat;
                  });
                  return `${((minLat + maxLat)/2).toFixed(5)}° N, ${((minLng + maxLng)/2).toFixed(5)}° E`;
                })()
              ) : '---'}
            </p>
          </div>

          <div className="space-y-3 pl-8">
            <div className="flex items-center gap-2 text-stone-400">
              <div className="w-2 h-2 rounded-full bg-[#FFD700]"></div>
              <p className="text-[10px] uppercase font-black tracking-[0.2em]">Asset Density</p>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-[#228B22] font-manrope tracking-tighter">
                {totalRowsLength.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
              <span className="text-xs font-black text-stone-300 uppercase">Total m</span>
            </div>
          </div>
        </div>

        {/* Detailed Breakdown Table */}
        {sectors.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-6 px-4">
              <div className="w-1.5 h-6 bg-[#228B22] rounded-full"></div>
              <h3 className="text-xs font-black text-stone-500 uppercase tracking-widest">Sector Breakdown Metrics</h3>
            </div>
            
            <div className="rounded-[2rem] border border-stone-100 overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-100">
                    <th className="px-8 py-5 text-[9px] font-black text-stone-400 uppercase tracking-widest">Sector Unit</th>
                    <th className="px-8 py-5 text-[9px] font-black text-stone-400 uppercase tracking-widest">Surface Area</th>
                    <th className="px-8 py-5 text-[9px] font-black text-stone-400 uppercase tracking-widest">GPS Position</th>
                    <th className="px-8 py-5 text-[9px] font-black text-stone-400 uppercase tracking-widest text-right">Row Metrics</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {sectors.map((sector) => {
                    const area = calculateArea(sector.perimeter);
                    const center = calculateCenter(sector.perimeter);
                    const rowLen = sector.rows?.reduce((acc, r) => acc + (r.length || 0), 0) || 0;
                    
                    return (
                      <tr key={`land-sheet-${sector.id}`} className="group hover:bg-stone-50/50 transition-colors">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: sector.colorTheme.poly }} />
                            <span className="text-sm font-black text-stone-800">{sector.name}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-black text-stone-700">{area.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                            <span className="text-[10px] font-black text-stone-300 uppercase">m²</span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className="text-[10px] font-mono font-black text-stone-400">
                            {center.geometry.coordinates[1].toFixed(5)}, {center.geometry.coordinates[0].toFixed(5)}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-black text-[#228B22]">{rowLen.toLocaleString(undefined, { maximumFractionDigits: 1 })} m</span>
                            <span className="text-[8px] font-bold text-stone-300 uppercase">{sector.rows?.length || 0} Rows</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Unified Inventory & Configuration Block */}
      <div className="bg-white rounded-[3rem] shadow-2xl border border-stone-100 overflow-hidden">
        <div className="p-10 border-b border-stone-50 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-r from-stone-50 to-white">
          <div className="flex items-center gap-5">
            <div className="bg-stone-900 p-4 rounded-[1.2rem] shadow-xl shadow-stone-900/10">
              <Radio className="h-6 w-6 text-[#228B22]" />
            </div>
            <div>
              <h2 className="text-3xl font-manrope font-black text-stone-900 tracking-tight">Inventory <span className="text-[#228B22]">Management</span></h2>
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.3em] mt-1">Spatial Asset Optimization</p>
            </div>
          </div>
          
          <div className="flex items-center gap-8">
            <div className="text-right">
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Active Assets</p>
              <div className="flex items-baseline gap-2 justify-end">
                <span className="text-2xl font-black text-stone-900">
                  {sectors.reduce((acc, s) => acc + (s.rows?.length || 0), 0) + sentinels.length}
                </span>
                <span className="text-[10px] font-bold text-stone-300 uppercase">Objects</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Row Inventory */}
          <div className="p-10 border-r border-stone-100">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-2 h-2 rounded-full bg-[#FFD700]"></div>
              <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Vineyard Rows</h3>
            </div>

            <div className="rounded-[2rem] border border-stone-100 overflow-hidden bg-stone-50/30">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-stone-900 border-b border-white/5">
                    <th className="px-8 py-5 text-[9px] font-black text-stone-400 uppercase tracking-[0.2em] w-[22%]">Asset Detail</th>
                    <th className="px-8 py-5 text-[9px] font-black text-stone-400 uppercase tracking-[0.2em] w-[38%]">Sector</th>
                    <th className="px-8 py-5 text-[9px] font-black text-stone-400 uppercase tracking-[0.2em] w-[20%]">Metrics</th>
                    <th className="px-8 py-5 text-right w-[20%]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {sectors.flatMap(sector => (sector.rows || []).map((row, idx) => ({ ...row, sector, idx }))).length > 0 ? 
                   sectors.flatMap(sector => (sector.rows || []).map((row, idx) => ({ ...row, sector, idx }))).map((item) => {
                     const { sector, idx, ...row } = item;
                     return (
                      <tr key={`${sector.id}-row-${idx}`} className="group hover:bg-white transition-all">
                        <td className="px-8 py-4">
                          <input 
                             type="text" 
                             defaultValue={row.id}
                             onBlur={(e) => {
                                // handleRowIdChange validates with useRef (always fresh), reverts on dup, updates state
                                handleRowIdChange(row.id, e.target.value, sector.id, idx, e.target);
                              }}
                             className={`bg-transparent border-none text-xs font-black focus:ring-0 p-0 w-full text-stone-800`}
                          />
                        </td>
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sector.colorTheme.poly }} />
                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{sector.name}</span>
                          </div>
                        </td>
                        <td className="px-8 py-4">
                          <div className="flex items-baseline gap-1">
                              <span className="text-xs font-mono font-black text-[#228B22]">
                                {row.length ? row.length.toFixed(1) : '---'}
                              </span>
                              <span className="text-[8px] font-black text-stone-300 uppercase">m</span>
                          </div>
                        </td>
                        <td className="px-8 py-4 text-right">
                          <button 
                            onClick={() => {
                              const newRows = sector.rows.filter((_: any, i: number) => i !== idx);
                              setSectors(prev => prev.map(s => s.id === sector.id ? { ...s, rows: newRows } : s));
                            }}
                            className="p-1.5 text-stone-200 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )}) : (
                    <tr>
                      <td colSpan={4} className="px-8 py-12 text-center text-[10px] font-black text-stone-300 uppercase tracking-widest">
                        Draw a sector on the map to begin
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sentinel Inventory */}
          <div className="p-10 bg-stone-50/20">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-2 h-2 rounded-full bg-[#228B22]"></div>
              <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Sentinels</h3>
            </div>

            <div className="rounded-[2rem] border border-stone-100 overflow-hidden bg-stone-50/30">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-stone-900 border-b border-white/5">
                    <th className="px-8 py-5 text-[9px] font-black text-stone-400 uppercase tracking-[0.2em] w-[30%]">Sentinel ID</th>
                    <th className="px-8 py-5 text-[9px] font-black text-stone-400 uppercase tracking-[0.2em] w-[50%]">Sector</th>
                    <th className="px-8 py-5 text-[9px] font-black text-stone-400 uppercase tracking-[0.2em] text-right w-[20%]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {sentinels.length > 0 ? sentinels.map((s) => {
                    const sector = sectors.find(sec => booleanPointInPolygon([s.longitude, s.latitude], sec.perimeter));
                    return (
                      <SentinelRow 
                        key={s.number} 
                        sentinel={s} 
                        sectorName={sector?.name || 'Unassigned'}
                        sectorColor={sector?.colorTheme.poly || '#d1d5db'}
                        onRename={handleSentinelNameChange} 
                        onDelete={(num) => setSentinels(prev => prev.filter(ps => ps.number !== num))} 
                      />
                    );
                  }) : (
                    <tr>
                      <td colSpan={3} className="px-8 py-12 text-center text-[10px] font-black text-stone-300 uppercase tracking-widest">
                        No sentinels found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-[10px] text-stone-400 font-extrabold uppercase tracking-[0.5em] pt-12 pb-16 opacity-40">
        Organic Precision Management • EdgeVine Systems Engine
      </p>
    </div>
  );
}

function SentinelRow({ sentinel, sectorName, sectorColor, onRename, onDelete }: { 
  sentinel: any, 
  sectorName: string, 
  sectorColor: string, 
  onRename: (n: number, s: string, o: string, el: HTMLInputElement) => boolean, 
  onDelete: (n: number) => void 
}) {
  return (
    <tr className="group hover:bg-white transition-all">
      <td className="px-8 py-4">
        <input 
          type="text" 
          value={sentinel.name} 
          onChange={(e) => onRename(sentinel.number, e.target.value, sentinel.name, e.target)}
          onBlur={(e) => {
             const success = onRename(sentinel.number, e.target.value, sentinel.name, e.target);
             if (!success) e.target.value = sentinel.name;
          }}
          className={`bg-transparent border-none p-0 text-xs font-black focus:ring-0 focus:outline-none w-full text-stone-800`}
        />
      </td>
      <td className="px-8 py-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sectorColor }} />
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{sectorName}</span>
        </div>
      </td>
      <td className="px-8 py-4 text-right">
        <button 
          onClick={() => onDelete(sentinel.number)}
          className="p-1 px-2 text-stone-200 hover:text-red-500 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
