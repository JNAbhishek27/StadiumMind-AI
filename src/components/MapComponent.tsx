import { useState, useEffect, useRef } from 'react';
import { Facility, CrowdZone, TransportOption } from '../types';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { LucideIcon, MapPin, Navigation, Compass, AlertTriangle, Shield, CheckCircle, RefreshCw, Layers } from 'lucide-react';

// Standard Leaflet Icon fix for React Leaflet
// We construct clean SVG-based icons for Leaflet markers so they don't break due to missing assets in bundlers
const createCustomLeafletIcon = (color: string, iconText: string) => {
  return new L.DivIcon({
    html: `
      <div class="relative flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-lg animate-fade-in" style="background-color: ${color};">
        <span class="text-white text-[10px] font-bold font-sans">${iconText}</span>
        <div class="absolute -bottom-1 w-2 h-2 rotate-45" style="background-color: ${color};"></div>
      </div>
    `,
    className: 'custom-leaflet-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 36],
    popupAnchor: [0, -32],
  });
};

const stadiumCoords: [number, number] = [40.8135, -74.0744]; // Coordinates of MetLife Stadium (NYNJ FIFA 2026 venue)

// Helper component to center or adjust map view when locations change
function MapController({ coords }: { coords: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(coords, 14);
  }, [coords, map]);
  return null;
}

interface MapComponentProps {
  facilities: Facility[];
  crowdZones: CrowdZone[];
  transportOptions: TransportOption[];
  activeRoute?: {
    from: string;
    to: string;
    steps: string[];
    walkingTime: number;
    congestionScore: number;
    aiExplanation: string;
  };
  onSelectFacility?: (facility: Facility) => void;
  emergencies?: any[];
}

export default function MapComponent({
  facilities,
  crowdZones,
  transportOptions,
  activeRoute,
  onSelectFacility,
  emergencies = []
}: MapComponentProps) {
  const [mapType, setMapType] = useState<'blueprint' | 'regional'>('blueprint');
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [heatmapEnabled, setHeatmapEnabled] = useState(true);

  // SVG dimensions for Blueprint
  const svgWidth = 800;
  const svgHeight = 600;

  // Filter facilities
  const filteredFacilities = facilities.filter(f => {
    if (filterType === 'all') return true;
    if (filterType === 'gate' && f.type === 'gate') return true;
    if (filterType === 'food' && f.type === 'food') return true;
    if (filterType === 'restroom' && f.type === 'restroom') return true;
    if (filterType === 'emergency' && f.type === 'emergency') return true;
    if (filterType === 'sustainability' && f.type === 'sustainability') return true;
    return false;
  });

  // Calculate coordinates for SVG paths if an active route exists
  const getRouteLine = () => {
    if (!activeRoute) return null;
    const fromFacility = facilities.find(f => f.id === activeRoute.from || f.name.toLowerCase().includes(activeRoute.from.toLowerCase()));
    const toFacility = facilities.find(f => f.id === activeRoute.to || f.name.toLowerCase().includes(activeRoute.to.toLowerCase()));

    if (fromFacility && toFacility) {
      const [x1Percent, y1Percent] = fromFacility.coordinates;
      const [x2Percent, y2Percent] = toFacility.coordinates;
      const x1 = (x1Percent / 100) * svgWidth;
      const y1 = (y1Percent / 100) * svgHeight;
      const x2 = (x2Percent / 100) * svgWidth;
      const y2 = (y2Percent / 100) * svgHeight;
      // We draw an S-curved path for a realistic stadium walkway flow
      return `M ${x1} ${y1} Q ${(x1 + x2) / 2 + 30} ${(y1 + y2) / 2 - 30} ${x2} ${y2}`;
    }
    return null;
  };

  const routePath = getRouteLine();

  return (
    <div id="stadium-map-section" className="relative flex flex-col w-full h-full bg-[#0D1117] border border-white/5 rounded-2xl overflow-hidden shadow-2xl shadow-blue-500/5 transition-all duration-300">
      
      {/* Map Control Header */}
      <div className="flex flex-wrap items-center justify-between p-4 bg-[#0A0C12]/90 border-b border-white/5 backdrop-blur-md z-10 gap-3">
        <div className="flex items-center gap-3">
          <Compass className="w-6 h-6 text-blue-400 animate-pulse" aria-hidden="true" />
          <div>
            <h3 className="text-base font-bold text-slate-100 tracking-tight">FIFA NYNJ Stadium Operations Map</h3>
            <p className="text-xs text-slate-400">Interactive live operational status & routing</p>
          </div>
        </div>

        {/* View Switchers */}
        <div className="flex items-center gap-2">
          <button
            id="btn-view-blueprint"
            onClick={() => setMapType('blueprint')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
              mapType === 'blueprint'
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'bg-[#0A0C12] text-slate-300 hover:bg-[#161B22] border border-white/5'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Stadium Blueprint
          </button>
          <button
            id="btn-view-regional"
            onClick={() => setMapType('regional')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
              mapType === 'regional'
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'bg-[#0A0C12] text-slate-300 hover:bg-[#161B22] border border-white/5'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Regional Transport (Leaflet)
          </button>
        </div>
      </div>

      {/* Filter/Legend bar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-[#0A0C12]/40 border-b border-white/5 text-xs text-slate-300 gap-3 z-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-medium">Filter Floorplan:</span>
          {['all', 'gate', 'food', 'restroom', 'emergency', 'sustainability'].map(type => (
            <button
              key={type}
              id={`filter-map-${type}`}
              onClick={() => setFilterType(type)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                filterType === type
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30 shadow-md'
                  : 'bg-[#0A0C12]/60 text-slate-400 hover:text-slate-200 border border-white/5'
              }`}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>

        {mapType === 'blueprint' && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-200 select-none">
              <input
                id="chk-toggle-heatmap"
                type="checkbox"
                checked={heatmapEnabled}
                onChange={(e) => setHeatmapEnabled(e.target.checked)}
                className="rounded text-blue-500 bg-[#0A0C12] border-white/10 focus:ring-blue-500 focus:ring-offset-slate-900 w-3.5 h-3.5"
              />
              Show Crowd Heatmap
            </label>
          </div>
        )}
      </div>

      {/* Main Map Viewer Stage */}
      <div className="relative flex-1 min-h-[480px] bg-[#05070A] flex items-center justify-center">
        
        {/* ================= MAP TYPE 1: BLUEPRINT (HIGH FIDELITY INTERACTIVE VECTORS) ================= */}
        {mapType === 'blueprint' && (
          <div className="relative w-full h-full flex items-center justify-center p-4 overflow-auto">
            <svg
              id="svg-stadium-blueprint"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full max-w-[800px] h-auto aspect-[4/3] bg-[#05070A]/80 rounded-xl border border-white/5 shadow-inner"
            >
              {/* Outer Ground Ring */}
              <rect x="10" y="10" width={svgWidth - 20} height={svgHeight - 20} rx="30" fill="none" stroke="#1f2937" strokeWidth="2" strokeDasharray="5,5" />
              
              {/* Stadium Bowl - Outer Wall */}
              <ellipse cx={svgWidth / 2} cy={svgHeight / 2} rx="340" ry="240" fill="#0b1329" stroke="#334155" strokeWidth="4" />
              
              {/* Stadium Concourse Ring */}
              <ellipse cx={svgWidth / 2} cy={svgHeight / 2} rx="260" ry="180" fill="none" stroke="#1e293b" strokeWidth="32" className="opacity-40" />
              
              {/* Grandstands sectors */}
              {/* North Stand */}
              <path
                id="blueprint-stand-north"
                d="M 140 180 Q 400 10 660 180 L 600 220 Q 400 80 200 220 Z"
                fill={heatmapEnabled ? `rgba(239, 68, 68, ${0.15 + (crowdZones[0]?.currentCongestion || 85) / 180})` : '#0f172a'}
                stroke="#ef4444"
                strokeWidth={selectedZone === 'zone-north' ? '3' : '1'}
                strokeOpacity="0.6"
                className="transition-all duration-300 cursor-pointer hover:stroke-red-400"
                onClick={() => setSelectedZone('zone-north')}
              />
              {/* East Stand */}
              <path
                id="blueprint-stand-east"
                d="M 660 180 Q 820 300 660 420 L 600 380 Q 740 300 600 220 Z"
                fill={heatmapEnabled ? `rgba(234, 179, 8, ${0.15 + (crowdZones[1]?.currentCongestion || 55) / 180})` : '#0f172a'}
                stroke="#eab308"
                strokeWidth={selectedZone === 'zone-east' ? '3' : '1'}
                strokeOpacity="0.6"
                className="transition-all duration-300 cursor-pointer hover:stroke-yellow-400"
                onClick={() => setSelectedZone('zone-east')}
              />
              {/* South Stand */}
              <path
                id="blueprint-stand-south"
                d="M 660 420 Q 400 590 140 420 L 200 380 Q 400 520 600 380 Z"
                fill={heatmapEnabled ? `rgba(234, 179, 8, ${0.1 + (crowdZones[2]?.currentCongestion || 68) / 180})` : '#0f172a'}
                stroke="#eab308"
                strokeWidth={selectedZone === 'zone-south' ? '3' : '1'}
                strokeOpacity="0.6"
                className="transition-all duration-300 cursor-pointer hover:stroke-orange-400"
                onClick={() => setSelectedZone('zone-south')}
              />
              {/* West Stand (VIP) */}
              <path
                id="blueprint-stand-west"
                d="M 140 420 Q -20 300 140 180 L 200 220 Q 60 300 200 380 Z"
                fill={heatmapEnabled ? `rgba(59, 130, 246, ${0.1 + (crowdZones[3]?.currentCongestion || 22) / 180})` : '#0f172a'}
                stroke="#3b82f6"
                strokeWidth={selectedZone === 'zone-west' ? '3' : '1'}
                strokeOpacity="0.6"
                className="transition-all duration-300 cursor-pointer hover:stroke-blue-400"
                onClick={() => setSelectedZone('zone-west')}
              />

              {/* Pitch / Field */}
              <rect x={svgWidth / 2 - 120} y={svgHeight / 2 - 80} width="240" height="160" rx="6" fill="#14532d" stroke="#22c55e" strokeWidth="2" />
              <circle cx={svgWidth / 2} cy={svgHeight / 2} r="40" fill="none" stroke="#22c55e" strokeWidth="2" />
              <line x1={svgWidth / 2} y1={svgHeight / 2 - 80} x2={svgWidth / 2} y2={svgHeight / 2 + 80} stroke="#22c55e" strokeWidth="2" />
              <rect x={svgWidth / 2 - 120} y={svgHeight / 2 - 40} width="35" height="80" fill="none" stroke="#22c55e" strokeWidth="2" />
              <rect x={svgWidth / 2 + 85} y={svgHeight / 2 - 40} width="35" height="80" fill="none" stroke="#22c55e" strokeWidth="2" />

              {/* Active Emergency Glowing Pulse Dots */}
              {emergencies.filter(e => e.status !== 'resolved').map((e, index) => {
                // Approximate coordinates based on location keywords
                let cx = svgWidth / 2;
                let cy = svgHeight / 2;
                if (e.location.toLowerCase().includes('north') || e.location.includes('112')) {
                  cx = svgWidth / 2 + 50; cy = 110;
                } else if (e.location.toLowerCase().includes('gate a')) {
                  cx = 400; cy = 60;
                } else if (e.location.toLowerCase().includes('south') || e.location.includes('13')) {
                  cx = svgWidth / 2 - 110; cy = 490;
                } else if (e.location.toLowerCase().includes('east') || e.location.includes('gate b')) {
                  cx = 700; cy = 300;
                } else if (e.location.toLowerCase().includes('west') || e.location.includes('100')) {
                  cx = 100; cy = 300;
                }
                return (
                  <g key={e.id} className="cursor-pointer">
                    <circle cx={cx} cy={cy} r="22" fill="none" stroke="#ef4444" strokeWidth="1.5" className="animate-ping" style={{ transformOrigin: `${cx}px ${cy}px`, animationDuration: '2s' }} />
                    <circle cx={cx} cy={cy} r="12" fill="rgba(239, 68, 68, 0.4)" stroke="#dc2626" strokeWidth="2" />
                    <path d={`M ${cx - 4} ${cy - 4} L ${cx + 4} ${cy + 4} M ${cx + 4} ${cy - 4} L ${cx - 4} ${cy + 4}`} stroke="#ffffff" strokeWidth="2" />
                  </g>
                );
              })}

              {/* Draw AI Navigation Route Path */}
              {routePath && (
                <g>
                  {/* Glowing backing stroke */}
                  <path
                    d={routePath}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="8"
                    className="opacity-40 animate-pulse"
                  />
                  {/* Moving dash path */}
                  <path
                    id="route-animated-path"
                    d={routePath}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="3.5"
                    strokeDasharray="10,12"
                    className="animate-[dash_15s_linear_infinite]"
                    style={{ strokeLinecap: 'round' }}
                  />
                </g>
              )}

              {/* Concourse Walkway Connection Network Links */}
              <g id="walkway-connection-links" className="opacity-25 pointer-events-none">
                {/* Concourse Main Ring Network */}
                <ellipse cx={svgWidth / 2} cy={svgHeight / 2} rx="260" ry="180" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="4,6" />
                <ellipse cx={svgWidth / 2} cy={svgHeight / 2} rx="210" ry="145" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,5" />
                
                {/* Gate radial connection walkways */}
                {/* Gate A walkway to concourse ring */}
                <line x1="400" y1="90" x2="400" y2="120" stroke="#10b981" strokeWidth="2" strokeDasharray="2,2" />
                {/* Gate B walkway to concourse ring */}
                <line x1="680" y1="300" x2="660" y2="300" stroke="#10b981" strokeWidth="2" strokeDasharray="2,2" />
                {/* Gate C walkway to concourse ring */}
                <line x1="400" y1="510" x2="400" y2="480" stroke="#10b981" strokeWidth="2" strokeDasharray="2,2" />
                {/* Gate D walkway to concourse ring */}
                <line x1="120" y1="300" x2="140" y2="300" stroke="#10b981" strokeWidth="2" strokeDasharray="2,2" />

                {/* Draw connection pathways to major food/restroom hubs */}
                {/* Food Taco [60, 22] scaled is [480, 132] */}
                <line x1="400" y1="120" x2="480" y2="132" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,3" />
                {/* Restroom N1 [45, 20] scaled is [360, 120] */}
                <line x1="400" y1="120" x2="360" y2="120" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,3" />
                {/* Burger [80, 40] scaled is [640, 240] */}
                <line x1="660" y1="300" x2="640" y2="240" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,3" />
                {/* Restroom E2 [82, 45] scaled is [656, 270] */}
                <line x1="660" y1="300" x2="656" y2="270" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,3" />
                {/* Pizza [40, 78] scaled is [320, 468] */}
                <line x1="400" y1="480" x2="320" y2="468" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,3" />
                {/* Restroom S1 [55, 80] scaled is [440, 480] */}
                <line x1="400" y1="480" x2="440" y2="480" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,3" />
                {/* Cafe [25, 42] scaled is [200, 252] */}
                <line x1="140" y1="300" x2="200" y2="252" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,3" />
                {/* Restroom W1 [20, 55] scaled is [160, 330] */}
                <line x1="140" y1="300" x2="160" y2="330" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,3" />
              </g>

              {/* Dynamic Facilities Markers */}
              {filteredFacilities.map(f => {
                const [xPercent, yPercent] = f.coordinates;
                const x = (xPercent / 100) * svgWidth;
                const y = (yPercent / 100) * svgHeight;
                const isSelected = activeRoute?.from === f.id || activeRoute?.to === f.id;
                
                // Color mapping
                let color = '#3b82f6'; // Blue for default
                let textColor = '#ffffff';
                if (f.type === 'gate') color = '#22c55e'; // Green
                if (f.type === 'food') color = '#eab308'; // Yellow
                if (f.type === 'restroom') color = '#a855f7'; // Purple
                if (f.type === 'emergency') color = '#ef4444'; // Red
                if (f.type === 'sustainability') color = '#10b981'; // Emerald
                if (f.type === 'merchandise') color = '#f97316'; // Orange

                return (
                  <g
                    key={f.id}
                    id={`marker-${f.id}`}
                    transform={`translate(${x}, ${y})`}
                    className="cursor-pointer group select-none"
                    onClick={() => {
                      if (onSelectFacility) onSelectFacility(f);
                    }}
                  >
                    {/* Pulsing ring for selected markers in navigation */}
                    {isSelected && (
                      <circle r="20" fill="none" stroke="#10b981" strokeWidth="2.5" className="animate-ping" style={{ transformOrigin: '0px 0px' }} />
                    )}
                    
                    {/* Base Marker Circle */}
                    <circle
                      r={isSelected ? "14" : "11"}
                      fill={color}
                      stroke={isSelected ? "#ffffff" : "#1e293b"}
                      strokeWidth="2.5"
                      className="transition-all duration-200 group-hover:scale-125"
                    />
                    
                    {/* Short Text label in marker */}
                    <text
                      textAnchor="middle"
                      dy="3.5"
                      fill={textColor}
                      className="text-[9px] font-bold font-mono pointer-events-none select-none"
                    >
                      {f.type === 'gate' ? f.name.replace('Gate ', '')[0] : f.type === 'food' ? '🍔' : f.type === 'restroom' ? 'WC' : f.type === 'emergency' ? '🚨' : f.type === 'sustainability' ? '🌱' : '🛒'}
                    </text>

                    {/* Popover Title on Hover */}
                    <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                      <rect x="-70" y="-45" width="140" height="28" rx="6" fill="#0f172a" stroke="#475569" strokeWidth="1" />
                      <text x="0" y="-31" textAnchor="middle" fill="#ffffff" className="text-[10px] font-semibold">
                        {f.name}
                      </text>
                      <text x="0" y="-21" textAnchor="middle" fill="#94a3b8" className="text-[8px]">
                        Queue: {f.estimatedQueueTime}m | Congestion: {f.congestionScore}%
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>

            {/* Micro Map Overlay Panel */}
            <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 border border-slate-700/50 p-3 rounded-xl backdrop-blur-md text-xs text-slate-300 flex flex-wrap items-center justify-between gap-3 max-w-4xl mx-auto shadow-xl">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>Gates</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>Food/Drink</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>Restrooms</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>First Aid / Emergency</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>Sustainability</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>Merchandise</div>
              </div>
              <p className="text-[11px] text-slate-400 italic">💡 Click any icon to set as Route Point.</p>
            </div>
          </div>
        )}

        {/* ================= MAP TYPE 2: REGIONAL GEOGRAPHY (REAL-WORLD LEAFLET MAP) ================= */}
        {mapType === 'regional' && (
          <div id="leaflet-container" className="w-full h-full min-h-[480px]">
            <MapContainer
              center={stadiumCoords}
              zoom={13}
              scrollWheelZoom={false}
              className="w-full h-full absolute inset-0 z-0"
            >
              {/* Using a high-quality dark-themed map tile layer to fit the FIFA premium layout */}
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              <MapController coords={stadiumCoords} />

              {/* Main Stadium Position */}
              <Marker position={stadiumCoords} icon={createCustomLeafletIcon('#10b981', 'NYNJ')}>
                <Popup>
                  <div className="text-slate-900 font-sans p-1">
                    <h4 className="font-bold text-sm">NYNJ Stadium (MetLife)</h4>
                    <p className="text-xs text-slate-600">FIFA World Cup 2026 Host Venue.</p>
                    <p className="text-xs font-semibold text-emerald-600">Current Attendance: 79,200</p>
                  </div>
                </Popup>
              </Marker>

              {/* Circle around the stadium representing the general safety cordon perimeter */}
              <Circle
                center={stadiumCoords}
                pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.1, weight: 1.5 }}
                radius={800}
              />

              {/* Transport Hubs Markers */}
              <Marker position={[40.8115, -74.0674]} icon={createCustomLeafletIcon('#3b82f6', 'MET')}>
                <Popup>
                  <div className="text-slate-900 font-sans">
                    <h4 className="font-bold text-xs">Metro Train Station (East Hub)</h4>
                    <p className="text-xs text-slate-600">Direct trains every 6 mins. Connects to Gate B.</p>
                    <p className="text-[11px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded inline-block mt-1">Normal Flow</p>
                  </div>
                </Popup>
              </Marker>

              <Marker position={[40.8175, -74.0774]} icon={createCustomLeafletIcon('#f97316', 'BUS')}>
                <Popup>
                  <div className="text-slate-900 font-sans">
                    <h4 className="font-bold text-xs">North Shuttle Bus Terminal</h4>
                    <p className="text-xs text-slate-600">Shuttle services to Gate A.</p>
                    <p className="text-[11px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded inline-block mt-1">8 Min Traffic Delay</p>
                  </div>
                </Popup>
              </Marker>

              <Marker position={[40.8085, -74.0794]} icon={createCustomLeafletIcon('#a855f7', 'PK-F')}>
                <Popup>
                  <div className="text-slate-900 font-sans">
                    <h4 className="font-bold text-xs">Park-and-Ride Lot F</h4>
                    <p className="text-xs text-slate-600">Capacity: 45% full. Connects via rapid ADA shuttle.</p>
                    <p className="text-[11px] bg-green-100 text-green-800 font-bold px-1.5 py-0.5 rounded inline-block mt-1">Available Spaces</p>
                  </div>
                </Popup>
              </Marker>

              <Marker position={[40.8112, -74.0712]} icon={createCustomLeafletIcon('#ef4444', 'PK-C')}>
                <Popup>
                  <div className="text-slate-900 font-sans">
                    <h4 className="font-bold text-xs">General Lot C</h4>
                    <p className="text-xs text-slate-600">Pre-booked only. Capacity: 92% full.</p>
                    <p className="text-[11px] bg-red-100 text-red-800 font-bold px-1.5 py-0.5 rounded inline-block mt-1">HEAVILY CONGESTED</p>
                  </div>
                </Popup>
              </Marker>

              {/* Transit-to-Gate Connection Links */}
              {/* 1. Metro East Station to Stadium (East Gate B) */}
              <Polyline
                positions={[
                  [40.8115, -74.0674], // Metro Station
                  [40.8125, -74.0709], // Intermediate path point
                  [40.8135, -74.0744]  // Stadium Center
                ]}
                pathOptions={{
                  color: '#3b82f6',
                  weight: 3.5,
                  opacity: 0.65,
                  dashArray: '5, 8'
                }}
              />

              {/* 2. North Shuttle Bus Terminal to Stadium (North Gate A) */}
              <Polyline
                positions={[
                  [40.8175, -74.0774], // Bus Terminal
                  [40.8155, -74.0759], // Intermediate path point
                  [40.8135, -74.0744]  // Stadium Center
                ]}
                pathOptions={{
                  color: '#f97316',
                  weight: 3.5,
                  opacity: 0.65,
                  dashArray: '5, 8'
                }}
              />

              {/* 3. Park-and-Ride Lot F to Stadium (West Gate D) */}
              <Polyline
                positions={[
                  [40.8085, -74.0794], // Lot F
                  [40.8110, -74.0769], // Intermediate path point
                  [40.8135, -74.0744]  // Stadium Center
                ]}
                pathOptions={{
                  color: '#a855f7',
                  weight: 3.5,
                  opacity: 0.65,
                  dashArray: '5, 8'
                }}
              />

              {/* 4. General Lot C to Stadium (South Gate C) */}
              <Polyline
                positions={[
                  [40.8112, -74.0712], // Lot C
                  [40.8123, -74.0728], // Intermediate path point
                  [40.8135, -74.0744]  // Stadium Center
                ]}
                pathOptions={{
                  color: '#ef4444',
                  weight: 3.5,
                  opacity: 0.65,
                  dashArray: '5, 8'
                }}
              />
            </MapContainer>

            {/* Geographical Map Overlay */}
            <div className="absolute bottom-4 left-4 right-4 bg-slate-900/95 border border-slate-700/50 p-2.5 rounded-xl backdrop-blur-md text-xs text-slate-300 z-[1000] shadow-2xl max-w-lg mx-auto">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-emerald-400" />
                NYNJ Stadium Outer Transit Cordon
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Showing train hubs, shuttle terminals, and parking fields surrounding the main arena perimeter.</p>
            </div>
          </div>
        )}

      </div>

      {/* Selected Crowd Zone Detail Panel (Interactive) */}
      {selectedZone && (
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 z-10 transition-all">
          <div className="flex-1">
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
              Crowd Status: {crowdZones.find(z => z.id === selectedZone)?.name}
            </h4>
            <p className="text-xs text-slate-300 mt-1">
              {crowdZones.find(z => z.id === selectedZone)?.explanation}
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-mono">CURRENT LOAD</span>
              <span className="text-xl font-bold font-mono text-rose-400">
                {crowdZones.find(z => z.id === selectedZone)?.currentCongestion}%
              </span>
            </div>
            <div className="border-l border-slate-800 pl-3">
              <span className="text-[10px] text-slate-400 block font-mono">TREND IN 40M</span>
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                {crowdZones.find(z => z.id === selectedZone)?.trend === 'up' ? '↗ Increasing' : '↘ Decreasing'} ({crowdZones.find(z => z.id === selectedZone)?.predictedCongestion40}%)
              </span>
            </div>
            <button
              onClick={() => setSelectedZone(null)}
              className="ml-auto md:ml-2 p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
