import{j as s}from"./jsx-runtime.hJLe0pNH.js";import{r}from"./index.C2cq821n.js";import{L as a}from"./leaflet-src.BT9gw1gc.js";function j(){const u=r.useRef(null),e=r.useRef(null),d=r.useRef(null),[p,g]=r.useState([]),[f,x]=r.useState(!0),[m,b]=r.useState(null);return r.useEffect(()=>{if(!u.current||e.current)return;const t=[43.4633,11.3126];return e.current=a.map(u.current,{center:t,zoom:18,zoomControl:!1,attributionControl:!1}),a.tileLayer("https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",{subdomains:["0","1","2","3"],maxZoom:20}).addTo(e.current),d.current=a.layerGroup().addTo(e.current),setTimeout(()=>{e.current?.invalidateSize()},200),()=>{e.current?.remove(),e.current=null}},[]),r.useEffect(()=>{(async()=>{try{const[i,n]=await Promise.all([fetch("/api/sensors"),fetch("/api/vineyard/config")]),l=await i.json(),c=await n.json();if(c.success&&c.data&&e.current){const o=c.data;if(o.perimeter){const h=typeof o.perimeter=="string"?JSON.parse(o.perimeter):o.perimeter,y=a.geoJSON(h,{style:{color:"#228B22",weight:4,fillOpacity:.15,dashArray:"8, 8",lineJoin:"round"}}).addTo(e.current);e.current.fitBounds(y.getBounds(),{padding:[50,50]})}else o.latitude&&o.longitude&&e.current.setView([o.latitude,o.longitude],18)}l.success&&l.data&&g(l.data)}catch(i){console.error("Fetch error:",i),b("Errore sincronizzazione spaziale.")}finally{x(!1)}})()},[]),r.useEffect(()=>{!e.current||!d.current||p.length===0||(d.current.clearLayers(),p.forEach(t=>{if(!t.latitude||!t.longitude)return;const i=t.moisture;let n="#ef4444";i>30?n="#228B22":i>=20&&(n="#fbbf24");const l=a.divIcon({className:"custom-leaflet-marker",html:`
          <div style="position: relative; width: 28px; height: 28px;">
            <div style="position: absolute; width:100%; height:100%; background-color:${n}; border-radius:50%; opacity:0.3; animation:pulse-ring 2s infinite;"></div>
            <div style="position: absolute; width:14px; height:14px; left:7px; top:7px; background-color:${n}; border-radius:50%; border:2.5px solid white; box-shadow:0 4px 10px rgba(0,0,0,0.3);"></div>
          </div>
          <style>
            @keyframes pulse-ring {
              0% { transform: scale(0.8); opacity: 0.6; }
              50% { transform: scale(1.6); opacity: 0; }
              100% { transform: scale(0.8); opacity: 0.6; }
            }
          </style>
        `,iconSize:[28,28],iconAnchor:[14,14]}),c=`
        <div style="font-family:'Manrope',sans-serif; padding:12px; min-width:200px;">
          <h3 style="color:#228B22; font-weight:800; border-bottom:1px solid #eee; padding-bottom:8px; margin-bottom:8px;">Zona ${t.zone_number}</h3>
          <div style="display:grid; grid-template-cols:1fr 1fr; font-size:13px; color:#555;">
             <span>Umidità:</span> <b style="text-align:right;">${t.humidity??"--"}%</b>
             <span>Temp:</span> <b style="text-align:right;">${t.temperature??"--"}°C</b>
          </div>
          <div style="margin-top:12px; background:#f8f9fa; padding:8px; border-radius:8px;">
             <p style="font-size:10px; text-transform:uppercase; color:#999; margin:0;">Previsione Resa</p>
             <p style="font-size:24px; color:#228B22; font-weight:800; margin:0;">${t.predictedWineLiters??"--"} <small>L</small></p>
          </div>
        </div>
      `;a.marker([t.latitude,t.longitude],{icon:l}).bindPopup(c,{className:"custom-popup-vanilla"}).addTo(d.current)}))},[p]),s.jsxs("div",{className:"absolute inset-0 rounded-[2rem] overflow-hidden border border-white/5 shadow-inner bg-stone-950 z-0",children:[s.jsx("div",{ref:u,className:"w-full h-full select-none cursor-grab active:cursor-grabbing",style:{isolation:"isolate"}}),f&&s.jsxs("div",{className:"absolute inset-0 flex flex-col items-center justify-center bg-stone-900 z-[1000] gap-4",children:[s.jsx("div",{className:"absolute inset-0 bg-gradient-to-br from-forest-green/10 to-transparent"}),s.jsx("div",{className:"w-12 h-12 border-4 border-[#228B22] border-t-transparent rounded-full animate-spin"}),s.jsx("p",{className:"text-stone-300 font-inter font-medium uppercase tracking-[0.2em] text-[10px]",children:"Precision Calibration..."})]}),m&&!f&&s.jsx("div",{className:"absolute inset-0 flex items-center justify-center bg-red-950 text-red-200 z-[2000] p-6 text-center",children:s.jsx("p",{className:"font-bold underline",children:m})})]})}export{j as DashboardMap};
