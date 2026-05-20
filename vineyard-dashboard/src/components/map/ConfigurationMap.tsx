import { useEffect, useState, useRef } from 'react';
import { 
  calculateCenter, 
  rotateLine, 
  getDistance, 
  clipLineToPolygon,
  booleanPointInPolygon
} from '../../lib/spatialUtils';
import L from 'leaflet';
import { Search, Plus, Minus, MousePointer2, Hexagon, Square, MapPin, Trash2, Pencil, Layers, Lock, Unlock } from 'lucide-react';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

interface Sentinel {
  number: number;
  name: string;
  latitude: number;
  longitude: number;
}

export interface Sector {
  id: string;
  name: string;
  perimeter: any;
  rows: any[];
  rowOrientation: number;
  rowSpacing: number;
  targetRowCount: number | '';
  showRows: boolean;
  colorTheme: {
    poly: string;
    rows: string;
  };
}

interface ConfigurationMapProps {
  onAreaUpdate?: (area: string, centroid: string) => void;
  onGeometryUpdate?: (geometry: any) => void;
  onSentinelsUpdate?: (sentinels: Sentinel[]) => void;
  onSentinelNameChange?: (number: number, newName: string) => boolean;
  sectors: Sector[];
  selectedSectorId: string | null;
  onSectorsUpdate: (sectors: Sector[]) => void;
  onSectorSelect: (id: string | null) => void;
  onInvalidPlacement?: () => void;
  initialZones?: Sentinel[];
}

export function ConfigurationMap({ 
  onAreaUpdate, 
  onGeometryUpdate, 
  onSentinelsUpdate,
  onSentinelNameChange,
  sectors = [],
  selectedSectorId,
  onSectorsUpdate,
  onSectorSelect,
  onInvalidPlacement,
  initialZones = []
}: ConfigurationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const sentinelsRef = useRef<Sentinel[]>(initialZones);
  const rowsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const sectorLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const sectorsRef = useRef<Sector[]>(sectors);
  const activeModeRef = useRef<string>('pan');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [activeMode, setActiveMode] = useState<string>('pan');
  const [isLocked, setIsLocked] = useState(true);
  const [isMapReady, setIsMapReady] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(18);

  const SECTOR_THEMES = [
    { poly: '#10B981', rows: '#FCD34D' }, // Emerald / Amber
    { poly: '#3B82F6', rows: '#FFFFFF' }, // Blue / White
    { poly: '#EA580C', rows: '#22D3EE' }, // Orange / Cyan
    { poly: '#7C3AED', rows: '#4ADE80' }, // Purple / Lime
    { poly: '#DC2626', rows: '#FACC15' }, // Red / Yellow
    { poly: '#DB2777', rows: '#60A5FA' }, // Pink / Electric Blue
    { poly: '#78350F', rows: '#BAE6FD' }, // Brown / Light Sky
    { poly: '#1E3A8A', rows: '#FBCFE8' }, // Dark Navy / Soft Pink
    { poly: '#0D9488', rows: '#E9D5FF' }, // Teal / Lilac
    { poly: '#000000', rows: '#E2E8F0' }, // Black / Silver
  ];

  const getTheme = (currentSectors: Sector[]) => {
    const usedColors = new Set(currentSectors.map(s => s.colorTheme.poly));
    const availableTheme = SECTOR_THEMES.find(t => !usedColors.has(t.poly));
    // Fallback to cycling if all 10 are used
    return availableTheme || SECTOR_THEMES[currentSectors.length % SECTOR_THEMES.length];
  };

  const selectedSector = sectors.find(s => s.id === selectedSectorId);

  // Keep refs in sync
  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  useEffect(() => {
    sectorsRef.current = sectors;
  }, [sectors]);

  // Helper for dynamic line weights
  const getPolyWeight = (zoom: number, _isSelected: boolean) => {
    const base = 4;
    // Aggressive scaling: reduce factor significantly below zoom 17
    const factor = zoom >= 17 ? Math.max(0.2, (zoom - 14) / 4) : 0.15;
    return Math.max(0.5, base * factor);
  };

  const getRowWeight = (zoom: number, _isSelected: boolean) => {
    const base = 1.5;
    const factor = zoom >= 17 ? Math.max(0.1, (zoom - 14) / 4) : 0.05;
    return Math.max(0.1, base * factor);
  };

  // RENDERING SECTORS AND ROWS
  useEffect(() => {
    if (!mapInstanceRef.current || !rowsLayerGroupRef.current || !sectorLayerGroupRef.current || !isMapReady) return;
    
    const rowsGroup = rowsLayerGroupRef.current;
    const sectorGroup = sectorLayerGroupRef.current;
    
    rowsGroup.clearLayers();
    sectorGroup.clearLayers();

    sectors.forEach((sector) => {
      // Draw Perimeter
      if (sector.perimeter) {
        L.geoJSON(sector.perimeter, {
          style: { 
            color: sector.id === selectedSectorId ? '#FFFFFF' : sector.colorTheme.poly, 
            weight: getPolyWeight(zoomLevel, sector.id === selectedSectorId), 
            fillOpacity: sector.id === selectedSectorId ? Math.min(0.35, Math.max(0.05, (zoomLevel - 14) * 0.1)) : 0.15, 
            dashArray: sector.id === selectedSectorId ? '' : '5, 5',
            fill: true,
            interactive: true,
            bubblingMouseEvents: false
          },
          onEachFeature: (_, layer) => {
            layer.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              onSectorSelect(sector.id);
            });
            if (sector.id === selectedSectorId && (layer as any).bringToFront) {
              (layer as any).bringToFront();
            }
          }
        }).addTo(sectorGroup);
      }

      // Draw Rows
      if (sector.showRows && sector.rows) {
        sector.rows.forEach((row, idx) => {
          if (row.points) {
            const poly = L.polyline(row.points, { 
              color: sector.colorTheme.rows, 
              weight: getRowWeight(zoomLevel, sector.id === selectedSectorId), 
              opacity: sector.id === selectedSectorId ? 1 : 0.4, 
              // Trasparente ai click SOLO se stiamo inserendo una sentinella
              interactive: activeMode !== 'marker',
              bubblingMouseEvents: false
            });
            
            if (sector.id === selectedSectorId) poly.bringToFront();
            
            const rowId = row.id || `R-${(idx+1).toString().padStart(2, '0')}`;
            (poly as any).rowId = rowId;
            (poly as any).parentSectorId = sector.id;
            
            poly.bindPopup(() => createRowPopupContent(rowId, row.length, sector.id), { 
              className: 'custom-vineyard-popup',
              maxWidth: 300 
            });
            
            poly.on('click', (e: any) => {
              if (activeModeRef.current === 'remove') {
                L.DomEvent.stopPropagation(e);
                const updatedSectors = sectors.map(s => s.id === sector.id ? { ...s, rows: s.rows.filter(r => r.id !== rowId) } : s);
                onSectorsUpdate(updatedSectors);
                return;
              }
              L.DomEvent.stopPropagation(e);
              onSectorSelect(sector.id);
            });

            poly.addTo(rowsGroup);
          }
        });
      }
    });
  }, [sectors, selectedSectorId, isMapReady, activeMode, zoomLevel]);

  const getNextAvailableRowId = (currentSectors: Sector[], currentSentinels: Sentinel[]) => {
    let maxId = 0;
    const idRegex = /^R-(\d+)$/;

    currentSectors.forEach(s => {
      s.rows.forEach(r => {
        const match = r.id.match(idRegex);
        if (match && match[1]) {
          const num = parseInt(match[1]);
          if (num > maxId) maxId = num;
        }
      });
    });

    currentSentinels.forEach(s => {
      const match = s.name.match(idRegex);
      if (match && match[1]) {
        const num = parseInt(match[1]);
        if (num > maxId) maxId = num;
      }
    });

    return `R-${(maxId + 1).toString().padStart(2, '0')}`;
  };

  const getNextAvailableSentinelId = (currentSectors: Sector[], currentSentinels: Sentinel[]) => {
    let maxId = 0;
    const idRegex = /^S-(\d+)$/;

    currentSectors.forEach(s => {
      s.rows.forEach(r => {
        const match = r.id.match(idRegex);
        if (match && match[1]) {
          const num = parseInt(match[1]);
          if (num > maxId) maxId = num;
        }
      });
    });

    currentSentinels.forEach(s => {
      const match = s.name.match(idRegex);
      if (match && match[1]) {
        const num = parseInt(match[1]);
        if (num > maxId) maxId = num;
      }
    });

    return `S-${(maxId + 1).toString().padStart(2, '0')}`;
  };

  // AUTOMATIC ROW GENERATION
  useEffect(() => {
    if (!isMapReady) return;
    
    let changed = false;
    let currentGlobalMax = 0; // Tracks max row number from ALREADY-PROCESSED sectors only
    const idRegex = /^R-(\d+)$/;

    // Process sectors sequentially: each sector's offset comes only from
    // sectors processed BEFORE it (with their NEW rows), never from its own
    // existing rows (which are about to be replaced).
    const updatedSectors = sectors.map(s => {
      const newRows = generateRowsForSector(s, currentGlobalMax);

      // After generating, advance the global max using NEW rows of this sector
      newRows.forEach(r => {
        const match = r.id.match(idRegex);
        if (match && match[1]) {
          const num = parseInt(match[1]);
          if (num > currentGlobalMax) currentGlobalMax = num;
        }
      });

      if (JSON.stringify(newRows) !== JSON.stringify(s.rows)) {
        changed = true;
        return { ...s, rows: newRows };
      }
      // Rows didn't change: use existing rows to advance max for the next sector
      s.rows.forEach(r => {
        const match = r.id.match(idRegex);
        if (match && match[1]) {
          const num = parseInt(match[1]);
          if (num > currentGlobalMax) currentGlobalMax = num;
        }
      });
      return s;
    });

    if (changed) {
      onSectorsUpdate(updatedSectors);
    }
  }, [
    sectors.map(s => `${s.id}-${s.rowOrientation}-${s.rowSpacing}-${s.targetRowCount}-${s.showRows}-${JSON.stringify(s.perimeter)}`).join('|'),
    isMapReady
  ]);

  const generateRowsForSector = (sector: Sector, startOffset: number = 0) => {
    if (!sector.perimeter || !mapInstanceRef.current || !sector.showRows) return sector.rows;
    
    try {
      const poly = sector.perimeter;
      const polyCenter = calculateCenter(poly);
      const centerCoord = polyCenter.geometry.coordinates as [number, number];
      if (!centerCoord) return sector.rows;

      let polyCoords: [number, number][] = [];
      if (poly.geometry) polyCoords = poly.geometry.coordinates[0];
      else if (poly.coordinates) polyCoords = poly.coordinates[0];
      
      const rotatedPolyPoints = polyCoords.map(p => {
        const [rotatedLng, rotatedLat] = rotateLine([[p[0], p[1]]], -sector.rowOrientation, centerCoord)[0]!;
        return [rotatedLng, rotatedLat] as [number, number];
      });

      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      rotatedPolyPoints.forEach(([lng, lat]) => {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      });

      let finalSpacingDeg = sector.rowSpacing / 111320;
      let iterations = 0;

      if (typeof sector.targetRowCount === 'number' && sector.targetRowCount > 0) {
        iterations = sector.targetRowCount;
        finalSpacingDeg = (maxLat - minLat) / (sector.targetRowCount + 1);
      } else {
        iterations = Math.floor((maxLat - minLat) / finalSpacingDeg) + 1;
      }

      const newRows: any[] = [];
      for (let i = 0; i < iterations; i++) {
        const lat = typeof sector.targetRowCount === 'number' && sector.targetRowCount > 0
          ? minLat + ((i + 1) * finalSpacingDeg)
          : minLat + (i * finalSpacingDeg);
          
        const lineStart: [number, number] = [minLng - 0.01, lat];
        const lineEnd: [number, number] = [maxLng + 0.01, lat];
        
        const [p1, p2] = rotateLine([lineStart, lineEnd], sector.rowOrientation, centerCoord);
        const clippedSegments = clipLineToPolygon([p1!, p2!], poly);

        clippedSegments.forEach((seg: any) => {
          if (seg.length < 2) return;
          const dist = getDistance(seg[0], seg[seg.length - 1]);
          const minAcceptableDist = (typeof sector.targetRowCount === 'number' && sector.targetRowCount > 0) ? 0.1 : 1.0;
          if (dist > minAcceptableDist) {
            newRows.push({
              id: `R-${(startOffset + newRows.length + 1).toString().padStart(2, '0')}`,
              points: seg.map((c: any) => [c[1], c[0]]),
              length: dist
            });
          }
        });
      }
      return newRows;
    } catch (e) {
      console.error("Sector grid generation error:", e);
      return sector.rows;
    }
  };

  const createSentinelIcon = (name: string) => {
    // Calcolo dinamico della larghezza in base alla lunghezza del nome
    const charWidth = 8;
    const padding = 24;
    const minWidth = 32;
    const dynamicWidth = Math.max(minWidth, (name.length * charWidth) + padding);

    return L.divIcon({
      className: 'sentinel-marker-container',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-10 h-10 bg-blue-500/30 rounded-full animate-ping"></div>
          <div class="relative h-8 px-3 bg-blue-600 backdrop-blur-xl border-2 border-blue-300 rounded-full shadow-2xl flex items-center justify-center overflow-hidden" 
               style="width: ${dynamicWidth}px; transition: width 0.3s ease-out;">
            <div class="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent"></div>
            <span class="relative text-white font-black text-[10px] tracking-tighter whitespace-nowrap">${name}</span>
          </div>
          <div class="absolute -bottom-1 w-1 h-1 bg-blue-500 rounded-full shadow-[0_0_8px_#3b82f6]"></div>
        </div>
      `,
      iconSize: [dynamicWidth, 40],
      iconAnchor: [dynamicWidth / 2, 20]
    });
  };

  const createPopupContent = (num: number, name: string) => {
    const container = document.createElement('div');
    container.className = 'p-2 min-w-[120px]';
    container.innerHTML = `
      <div class="flex flex-col gap-2">
        <span class="text-[8px] font-black uppercase tracking-widest text-blue-600">Identification ID</span>
        <input 
          type="text" 
          value="${name}" 
          class="map-name-input w-full bg-stone-100 border-none rounded px-2 py-1 text-xs font-bold text-stone-800 focus:ring-1 focus:ring-[#228B22] outline-none"
          placeholder="New ID..."
        />
      </div>
    `;

    const input = container.querySelector('input');
    if (input) {
      input.addEventListener('change', (e: any) => {
        const newId = e.target.value;
        if (onSentinelNameChange) {
           const success = onSentinelNameChange(num, newId);
           if (success) {
             // Aggiorniamo l'icona del marker immediatamente sulla mappa
             const map = mapInstanceRef.current;
             if (map) {
               map.eachLayer((layer: any) => {
                 if (layer instanceof L.Marker && (layer as any).zoneNumber === num) {
                   (layer as any).zoneName = newId;
                   layer.setIcon(createSentinelIcon(newId));
                 }
               });
             }
           } else {
             e.target.value = name; // Revert
           }
        }
      });
      input.addEventListener('mousedown', (e) => e.stopPropagation());
    }
    return container;
  };

  const createRowPopupContent = (rowId: string, length: number, sectorId: string) => {
    const container = document.createElement('div');
    container.className = 'p-2 min-w-[140px]';
    container.innerHTML = `
      <div class="flex flex-col gap-2">
        <div class="flex flex-col gap-0.5">
          <span class="text-[8px] font-black uppercase tracking-widest text-[#228B22]">Row Identification</span>
          <span class="text-[7px] font-bold text-stone-400 uppercase tracking-tighter">Length: ${length?.toFixed(1)}m</span>
        </div>
        <input 
          type="text" 
          value="${rowId}" 
          class="map-row-input w-full bg-stone-100 border-none rounded px-2 py-1.5 text-xs font-black text-stone-900 focus:ring-1 focus:ring-[#228B22] outline-none shadow-inner"
          placeholder="Es: R-01..."
        />
      </div>
    `;

    const input = container.querySelector('input');
    if (input) {
      input.addEventListener('change', (e: any) => {
        const newId = e.target.value;
        const success = onRowIdChange(rowId, newId, sectorId);
        if (!success) {
           e.target.value = rowId; // Revert
        }
      });
      input.addEventListener('mousedown', (e) => e.stopPropagation());
    }
    return container;
  };

  const onRowIdChange = (oldId: string, newId: string, sectorId: string) => {
    const trimmed = newId.trim();
    if (!trimmed) return false;
    if (trimmed === oldId.trim()) return true;

    const isDuplicate = sectorsRef.current.some(s => s.rows.some(r => r.id === trimmed)) || 
                       sentinelsRef.current.some(s => s.name === trimmed);
    
    if (isDuplicate) {
      if (onSentinelNameChange) onSentinelNameChange(-1, trimmed); // Trigger external alert modal via SN handler
      return false;
    }

    const updatedSectors = sectorsRef.current.map(s => {
      if (s.id === sectorId) {
        return { ...s, rows: s.rows.map(r => r.id === oldId ? { ...r, id: trimmed } : r) };
      }
      return s;
    });
    onSectorsUpdate(updatedSectors);
    return true;
  };

  // Map Initialization
  useEffect(() => {
    const initMap = async () => {
      if (!mapRef.current || mapInstanceRef.current) return;

      const initialCenter: [number, number] = [43.4633, 11.3126];
      const map = L.map(mapRef.current, {
        center: initialCenter,
        zoom: 18,
        zoomControl: false,
        attributionControl: false,
        dragging: !isLocked,
        scrollWheelZoom: !isLocked,
        doubleClickZoom: !isLocked
      });
      mapInstanceRef.current = map;

      L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 20
      }).addTo(map);

      sectorLayerGroupRef.current = L.layerGroup().addTo(map);
      rowsLayerGroupRef.current = L.layerGroup().addTo(map);

      map.on('zoomend', () => {
        setZoomLevel(map.getZoom());
      });

      if ((map as any).pm) {
        (map as any).pm.setGlobalOptions({ pinning: true, snappable: true });

        // Click map background to deselect
        map.on('click', (e) => {
          if (e.originalEvent.defaultPrevented) return;
          onSectorSelect(null);
        });

        // Markers/Sentinels - Handled by reactive useEffect below
        if (sectors.length > 0 && sectors[0]?.perimeter) {
          const firstBounds = L.geoJSON(sectors[0].perimeter).getBounds();
          if (firstBounds.isValid()) {
            map.fitBounds(firstBounds, { padding: [80, 80] });
          }
        }

        map.on('pm:create', (e: any) => {
          const { layer, shape } = e;
          if (shape === 'Marker') {
            const defaultId = getNextAvailableSentinelId(sectorsRef.current, sentinelsRef.current);
            const nextNum = sentinelsRef.current.length + 1;
            layer.setIcon(createSentinelIcon(defaultId));
            (layer as any).zoneNumber = nextNum;
            (layer as any).zoneName = defaultId;
            layer.bindPopup(() => {
              if (activeModeRef.current === 'remove') return '';
              return createPopupContent(nextNum, defaultId) as any;
            }, { className: 'custom-vineyard-popup' }).openPopup();
            layer.on('pm:remove', () => syncSentinels());
            
            // Verifica immediata al posizionamento
            const pos = layer.getLatLng();
            const isInside = sectorsRef.current.some(s => {
              try { return booleanPointInPolygon([pos.lng, pos.lat], s.perimeter); } catch { return false; }
            });

            if (!isInside) {
              map.removeLayer(layer);
              if (onInvalidPlacement) onInvalidPlacement();
              return;
            }

            syncSentinels();
          } else if (shape === 'Polygon' || shape === 'Rectangle') {
            const newId = crypto.randomUUID();
            const theme = getTheme(sectorsRef.current) || SECTOR_THEMES[0]!;
            const newSector: Sector = {
              id: newId,
              name: `Sector ${sectorsRef.current.length + 1}`,
              perimeter: layer.toGeoJSON(),
              rows: [],
              rowOrientation: 0,
              rowSpacing: 2,
              targetRowCount: '',
              showRows: true,
              colorTheme: theme
            };
            
            // Selection logic
            (layer as any).sectorId = newId;
            layer.on('click', (ev: any) => {
              L.DomEvent.stopPropagation(ev);
              onSectorSelect(newId);
            });

            // Update global area info
            const centroid = layer.getBounds().getCenter();
            onAreaUpdate?.(`${Math.floor(Math.random() * 5000 + 10000).toLocaleString()} m²`, `${centroid.lat.toFixed(4)}° N, ${centroid.lng.toFixed(4)}° E`);
            onGeometryUpdate?.(layer.toGeoJSON());
            
            onSectorsUpdate([...sectorsRef.current, newSector]);
            onSectorSelect(newId);
            setActiveMode('pan');
            if (mapInstanceRef.current && (mapInstanceRef.current as any).pm) {
              (mapInstanceRef.current as any).pm.disableDraw();
              (mapInstanceRef.current as any).pm.GlobalEdit.disable();
            }
          } else if (shape === 'Line') {
            // Manual row
            if (!selectedSectorId) {
              map.removeLayer(layer);
              alert('Please select a sector first to draw rows');
              return;
            }
            const sector = sectorsRef.current.find(s => s.id === selectedSectorId);
            if (!sector) return;

            const nextRowId = getNextAvailableRowId(sectorsRef.current, sentinelsRef.current);
            (layer as any).rowId = nextRowId;
            (layer as any).parentSectorId = selectedSectorId;
            
            const points = (layer as any).getLatLngs().map((p: any) => [p.lat, p.lng]);
            const latlngs = (layer as any).getLatLngs();
            let len = 0;
            for(let i=0; i<latlngs.length-1; i++) len += latlngs[i].distanceTo(latlngs[i+1]);
            
            const newRow = { id: nextRowId, points, length: len };
            const updatedSectors = sectorsRef.current.map(s => s.id === selectedSectorId ? { ...s, rows: [...s.rows, newRow] } : s);
            onSectorsUpdate(updatedSectors);
            map.removeLayer(layer); // It will be redrawn by the rendering effect
            setActiveMode('pan');
          }
        });

        map.on('pm:remove', (e: any) => {
          const { layer } = e;
          if (layer instanceof L.Marker && (layer as any).zoneNumber) {
            syncSentinels();
          } else if ((layer as any).sectorId) {
            onSectorsUpdate(sectorsRef.current.filter(s => s.id !== (layer as any).sectorId));
            if (selectedSectorId === (layer as any).sectorId) onSectorSelect(null);
          }
        });

        map.on('pm:drawend', () => setActiveMode('pan'));
        setIsMapReady(true);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
    });

    if (mapRef.current) {
      resizeObserver.observe(mapRef.current);
      initMap();
    }

    return () => {
      resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Re-render logic is handled by sectors/isMapReady effect

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    if (isLocked) {
      if (map.dragging) map.dragging.disable();
      if (map.scrollWheelZoom) map.scrollWheelZoom.disable();
      if (map.doubleClickZoom) map.doubleClickZoom.disable();
    } else {
      if (map.dragging) map.dragging.enable();
      if (map.scrollWheelZoom) map.scrollWheelZoom.enable();
      if (map.doubleClickZoom) map.doubleClickZoom.enable();
    }
  }, [isLocked]);

  const syncSentinels = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const sents: Sentinel[] = [];
    
    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker && (layer as any).zoneNumber) {
        const pos = layer.getLatLng();
        
        // Verifica se è dentro un settore
        const isInside = sectorsRef.current.some(s => {
          try {
            return booleanPointInPolygon([pos.lng, pos.lat], s.perimeter);
          } catch { return false; }
        });

        if (!isInside) {
          map.removeLayer(layer);
          return;
        }

        sents.push({
          number: (layer as any).zoneNumber,
          name: (layer as any).zoneName || `Sentinel ${(layer as any).zoneNumber}`,
          latitude: pos.lat,
          longitude: pos.lng
        });
      }
    });
    sents.sort((a, b) => a.number - b.number);
    sentinelsRef.current = sents;
    if (onSentinelsUpdate) onSentinelsUpdate(sents);
  };

  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady) return;
    const map = mapInstanceRef.current;
    
    // Clear existing marker layers to prevent duplication on re-sync
    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker && (layer as any).zoneNumber) {
        map.removeLayer(layer);
      }
    });

    if (initialZones) {
      initialZones.forEach(zone => {
        if (zone.latitude && zone.longitude) {
          const zName = zone.name || `Sentinel ${zone.number}`;
          const marker = L.marker([zone.latitude, zone.longitude], { 
            icon: createSentinelIcon(zName),
            draggable: true 
          }).addTo(map);
          
          (marker as any).zoneNumber = zone.number;
          (marker as any).zoneName = zName;
          marker.bindPopup(() => createPopupContent(zone.number, zName), { className: 'custom-vineyard-popup' });
          marker.on('pm:dragend', () => syncSentinels());
          marker.on('pm:remove', () => syncSentinels());
        }
      });
    }
  }, [isMapReady, JSON.stringify(initialZones)]);

  const toggleMode = (mode: string) => {
    const map = mapInstanceRef.current as any;
    if (!map) return;
    if (activeMode === mode) {
      map.pm.disableDraw();
      if (activeMode === 'edit') map.pm.disableGlobalEditMode();
      if (activeMode === 'remove') map.pm.disableGlobalRemovalMode();
      setActiveMode('pan');
      return;
    }
    if (activeMode === 'edit') map.pm.disableGlobalEditMode();
    if (activeMode === 'remove') map.pm.disableGlobalRemovalMode();
    setActiveMode(mode);
    switch (mode) {
      case 'polygon': map.pm.enableDraw('Polygon'); break;
      case 'rectangle': map.pm.enableDraw('Rectangle'); break;
      case 'marker': 
        map.pm.enableDraw('Marker', {
          continueDrawing: true,
          markerStyle: {
            icon: L.divIcon({
              className: 'sentinel-pushpin-icon',
              html: `
                <div class="relative flex flex-col items-center pointer-events-none">
                  <!-- Testa della puntina (Sfera Blu con riflesso) -->
                  <div class="relative w-7 h-7 bg-blue-600 rounded-full border border-white/20 shadow-xl flex items-center justify-center">
                    <!-- Riflesso lucido 3D -->
                    <div class="absolute top-1 left-1.5 w-2.5 h-2.5 bg-white/40 rounded-full blur-[1px]"></div>
                    <div class="absolute inset-0 rounded-full bg-gradient-to-tr from-black/20 to-transparent"></div>
                  </div>
                  <!-- Spillo (Ago in argento) -->
                  <div class="w-[3px] h-8 bg-gradient-to-b from-stone-400 via-stone-200 to-transparent rounded-t-full -mt-1 shadow-sm" 
                       style="clip-path: polygon(0% 0%, 100% 0%, 50% 100%);"></div>
                </div>
              `,
              iconSize: [28, 60],
              iconAnchor: [14, 58]
            })
          }
        }); 
        break;
      case 'line': map.pm.enableDraw('Line'); break;
      case 'edit': map.pm.enableGlobalEditMode(); break;
      case 'remove': 
        map.closePopup();
        map.pm.enableGlobalRemovalMode();
        break;
      default: map.pm.disableDraw(); break;
    }
  };

  const handleZoom = (dir: 'in' | 'out') => {
    if (mapInstanceRef.current) {
      if (dir === 'in') mapInstanceRef.current.zoomIn();
      else mapInstanceRef.current.zoomOut();
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery || !mapInstanceRef.current) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        mapInstanceRef.current.setView([parseFloat(lat), parseFloat(lon)], 18);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="relative w-full h-[700px] rounded-[3rem] overflow-hidden border border-white/20 shadow-2xl bg-stone-900 group mb-12 transition-all duration-700">
      <div ref={mapRef} className="w-full h-full z-0" style={{ isolation: 'isolate' }} />

      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full max-w-md px-4">
        <form 
          onSubmit={handleSearch}
          className="pointer-events-auto bg-black/40 backdrop-blur-3xl border border-white/10 p-2 rounded-2xl flex items-center gap-3 shadow-2xl transition-all focus-within:shadow-green-900/30 hover:bg-black/50"
        >
          <div className="pl-3">
            <Search className={`h-4 w-4 ${isSearching ? 'animate-pulse text-[#228B22]' : 'text-stone-400'}`} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vineyard location..."
            className="flex-1 bg-transparent border-none text-white text-sm font-medium focus:ring-0 focus:outline-none py-2"
          />
          <button type="submit" className="bg-[#228B22] text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#2d5a44] transition-all active:scale-95">
            Locate
          </button>
        </form>
      </div>

      <div className="absolute top-12 right-8 z-50 pointer-events-none md:max-w-xs w-full">
        {selectedSector ? (
          <div className="pointer-events-auto bg-black/60 backdrop-blur-2xl border border-white/10 p-6 rounded-[2.5rem] shadow-2xl flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-700">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedSector.colorTheme.poly }} />
                  <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">{selectedSector.name}</h4>
              </div>
              <button 
                onClick={() => onSectorSelect(null)}
                className="text-stone-500 hover:text-white transition-colors"
                title="Deselect Sector"
              >
                <Plus className="h-4 w-4 rotate-45" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Orientation</label>
                  <span className="text-xs font-black text-white bg-white/5 px-2 py-1 rounded-lg border border-white/10">{selectedSector.rowOrientation}°</span>
                </div>
                <input 
                  type="range" min="0" max="180" step="1" 
                  value={selectedSector.rowOrientation} 
                  onChange={(e) => {
                    const updatedSectors = sectors.map(s => s.id === selectedSectorId ? { ...s, rowOrientation: parseInt(e.target.value) } : s);
                    onSectorsUpdate(updatedSectors);
                  }}
                  className="w-full accent-[#228B22] h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest block">Number of Rows</label>
                <div className="relative group">
                  <input 
                    type="number" 
                    value={selectedSector.targetRowCount} 
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : parseInt(e.target.value);
                      const updatedSectors = sectors.map(s => s.id === selectedSectorId ? { ...s, targetRowCount: val as (number | "") } : s);
                      onSectorsUpdate(updatedSectors);
                    }}
                    placeholder="AUTO"
                    className="w-full bg-white/5 border border-white/10 text-white text-lg font-black px-4 py-3 rounded-2xl focus:ring-1 focus:ring-[#228B22] focus:outline-none transition-all placeholder:text-stone-700"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-stone-500 uppercase tracking-widest group-focus-within:text-[#228B22]">Rows</span>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest block">Spacing (m)</label>
                <div className="relative group">
                  <input 
                    type={selectedSector.targetRowCount ? "text" : "number"} 
                    step="0.1" 
                    value={selectedSector.targetRowCount ? "AUTO" : selectedSector.rowSpacing} 
                    onChange={(e) => {
                      if (!selectedSector.targetRowCount) {
                         const updatedSectors = sectors.map(s => s.id === selectedSectorId ? { ...s, rowSpacing: parseFloat(e.target.value) } : s);
                         onSectorsUpdate(updatedSectors);
                      }
                    }}
                    disabled={!!selectedSector.targetRowCount}
                    className={`w-full bg-white/5 border border-white/10 text-white text-lg font-black px-4 py-3 rounded-2xl focus:ring-1 focus:ring-[#228B22] transition-all ${selectedSector.targetRowCount ? 'opacity-50' : ''}`}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-stone-500 uppercase tracking-widest">Meters</span>
                </div>
              </div>

              <div className="flex items-center justify-between bg-stone-900/80 border border-white/5 px-6 py-5 rounded-[1.5rem] mt-4 shadow-xl">
                <span className="text-sm font-bold text-white tracking-tight">Show Rows</span>
                <button 
                  onClick={() => {
                    const updatedSectors = sectors.map(s => s.id === selectedSectorId ? { ...s, showRows: !s.showRows } : s);
                    onSectorsUpdate(updatedSectors);
                  }}
                  className={`relative w-14 h-7 rounded-full transition-all duration-500 ${
                      selectedSector.showRows ? 'bg-[#228B22] shadow-[0_0_15px_rgba(34,139,34,0.4)]' : 'bg-stone-700'
                  }`}
                >
                  <div className={`absolute top-1 left-1 bg-white w-5 h-5 rounded-full transition-all duration-500 transform ${
                      selectedSector.showRows ? 'translate-x-7' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="pointer-events-auto bg-black/60 backdrop-blur-2xl border border-white/10 p-6 rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center gap-3 animate-in fade-in slide-in-from-right-4 duration-700 py-12">
            <Layers className="h-8 w-8 text-stone-600 mb-2" />
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] text-center">Select a Sector<br/>to Configure</p>
          </div>
        )}
      </div>

      <div className="absolute bottom-12 left-8 z-50 flex flex-col gap-6">
        <div className="bg-black/80 backdrop-blur-3xl border border-white/10 rounded-[1.75rem] flex flex-col shadow-2xl overflow-hidden p-1">
          <ToolButton active={activeMode === 'pan'} onClick={() => toggleMode('pan')} icon={<MousePointer2 className="h-5 w-5" />} label="Pan" position="top" />
          <div className="h-px bg-white/5 mx-3" />
          <ToolButton active={activeMode === 'polygon'} onClick={() => toggleMode('polygon')} icon={<Hexagon className="h-5 w-5" />} label="Draw Area" />
          <ToolButton active={activeMode === 'rectangle'} onClick={() => toggleMode('rectangle')} icon={<Square className="h-5 w-5" />} label="Rectangle" />
          <ToolButton active={activeMode === 'marker'} onClick={() => toggleMode('marker')} icon={<MapPin className="h-5 w-5" />} label="Sentinel" />
          <ToolButton active={activeMode === 'edit'} onClick={() => toggleMode('edit')} icon={<Pencil className="h-5 w-5" />} label="Edit" />
          <div className="h-px bg-white/5 mx-3" />
          <ToolButton active={activeMode === 'remove'} onClick={() => toggleMode('remove')} icon={<Trash2 className="h-5 w-5 text-red-500" />} label="Remove" position="bottom" />
        </div>

        <div className="bg-black/80 backdrop-blur-3xl border border-white/10 rounded-[1.75rem] flex flex-col shadow-2xl p-1">
          <ToolButton 
            active={!isLocked} 
            onClick={() => setIsLocked(!isLocked)} 
            icon={isLocked ? <Lock className="h-5 w-5 text-red-400" /> : <Unlock className="h-5 w-5 text-green-400" />} 
            label={isLocked ? "Map Locked" : "Map Unlocked"} 
            position="top"
          />
          <div className="h-px bg-white/5 mx-3" />
          <ToolButton onClick={() => handleZoom('in')} icon={<Plus className="h-5 w-5" />} label="Zoom In" />
          <div className="h-px bg-white/5 mx-3" />
          <ToolButton onClick={() => handleZoom('out')} icon={<Minus className="h-5 w-5" />} label="Zoom Out" position="bottom" />
        </div>
      </div>
    </div>
  );
}

function ToolButton({ active, onClick, icon, label, position }: any) {
  let roundedClass = "rounded-xl";
  if (position === 'top') roundedClass = "rounded-t-[1.5rem] rounded-b-xl";
  if (position === 'bottom') roundedClass = "rounded-b-[1.5rem] rounded-t-xl";

  return (
    <button
      onClick={onClick}
      className={`group relative w-14 h-14 transition-all duration-500 flex items-center justify-center ${roundedClass} ${
        active 
          ? 'bg-[#228B22] text-white shadow-xl shadow-green-900/40 z-10 scale-[1.05]' 
          : 'text-stone-400 hover:text-white hover:bg-white/5 active:scale-90'
      }`}
      title={label}
    >
      {icon}
      <div className="absolute left-full ml-5 px-4 py-2 bg-black/90 backdrop-blur-md text-[10px] font-black text-white rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all translate-x-[-10px] group-hover:translate-x-0 shadow-2xl border border-white/5 whitespace-nowrap uppercase tracking-[0.2em] z-50">
        {label}
      </div>
    </button>
  );
}
