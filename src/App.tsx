import React, { useState, useEffect, FormEvent } from 'react';
import { Facility, CrowdZone, TransportOption, EmergencyReport } from './types';
import MapComponent from './components/MapComponent';
import Dashboards from './components/Dashboards';
import { 
  Shield, Accessibility, Volume2, Globe, Sparkles, RefreshCw, LogIn, Award, PlayCircle, LogOut, CheckCircle, AlertOctagon 
} from 'lucide-react';

export default function App() {
  // Hackathon login states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [ticketCode, setTicketCode] = useState('FIFA-2026-USA');
  const [userRole, setUserRole] = useState<'fan' | 'volunteer' | 'organizer'>('fan');
  const [userName, setUserName] = useState('Alex Morgan');

  // Master platform states
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [crowdZones, setCrowdZones] = useState<CrowdZone[]>([]);
  const [transportOptions, setTransportOptions] = useState<TransportOption[]>([]);
  const [emergencies, setEmergencies] = useState<EmergencyReport[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');
  const [activeRoute, setActiveRoute] = useState<any | null>(null);

  // Settings states
  const [activeLanguage, setActiveLanguage] = useState('English');
  const [highContrast, setHighContrast] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sysStatus, setSysStatus] = useState<'nominal' | 'alert'>('nominal');

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'warn' | 'error' } | null>(null);

  // Show a visual toast notification helper
  const showToast = (message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000);
  };

  // Speak directions aloud for Accessibility / Screen readers
  const handleNarrateRoute = (textToSpeak: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const cleanText = textToSpeak.replace(/[#*`_]/g, ''); // strip markdown formatting characters
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    
    // Choose appropriate voice depending on active language if supported by OS
    window.speechSynthesis.speak(utterance);
    showToast("Screen Reader: Playing route audio narrative...", "info");
  };

  // Fetch all stadium parameters on mount & refresh intervals
  const fetchStadiumStatus = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      // 1. Fetch live emergencies
      const emgRes = await fetch('/api/emergencies');
      const emgData = await emgRes.json();
      setEmergencies(emgData.emergencies);

      // 2. Fetch live crowd analytics
      const crowdRes = await fetch('/api/crowd');
      const crowdData = await crowdRes.json();
      setCrowdZones(crowdData.zones);

      // 3. Populate default local options for facilities and transit if empty
      if (facilities.length === 0) {
        // Fetch static from server state or use the direct client structures
        const { NYNJ_STADIUM_FACILITIES, NYNJ_STADIUM_TRANSPORT } = await import('./data/stadiumData');
        setFacilities(NYNJ_STADIUM_FACILITIES);
        setTransportOptions(NYNJ_STADIUM_TRANSPORT);
      }

      // Update global systems status indicator
      const activeUnresolved = emgData.emergencies.filter((e: any) => e.status !== 'resolved' && e.alertLevel === 'critical').length;
      setSysStatus(activeUnresolved > 0 ? 'alert' : 'nominal');

      if (!silent) {
        showToast("Stadium data synchronized with operations server.", "success");
      }
    } catch (err) {
      console.error("Operational sync failure:", err);
      showToast("Sync Error: Operations server unreachable.", "error");
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  };

  // Report and register a new emergency incident
  const handleSubmitEmergencyReport = async (type: 'medical' | 'lost_child' | 'fire' | 'security', location: string, details: string) => {
    try {
      const response = await fetch('/api/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, location, details })
      });
      const data = await response.json();
      
      // Prepend to emergencies list
      setEmergencies(prev => [data.report, ...prev]);
      setSysStatus(data.report.alertLevel === 'critical' ? 'alert' : sysStatus);
      showToast(`EMERGENCY ALERT: ${type.toUpperCase()} registered at ${location}. Responder units dispatched.`, "error");

      // Auto narrate emergency safety advisory if voice accessibility is active
      if (voiceEnabled) {
        handleNarrateRoute(data.report.recommendedAction);
      }
    } catch (err) {
      console.error("Emergency broadcast failed:", err);
      showToast("Failed to broadcast emergency report.", "error");
    }
  };

  // Resolve an emergency incident
  const handleResolveEmergencyIncident = async (id: string) => {
    try {
      const response = await fetch('/api/emergency/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await response.json();
      if (data.success) {
        setEmergencies(prev => prev.map(e => e.id === id ? { ...e, status: 'resolved' } : e));
        showToast("Incident successfully resolved and logged into archives.", "success");
        fetchStadiumStatus(true);
      }
    } catch (err) {
      console.error("Failed to resolve emergency:", err);
      showToast("Failed to mark incident as resolved.", "error");
    }
  };

  // Map click selector syncing
  const handleSelectFacilityFromMap = (facility: Facility) => {
    setSelectedFacilityId(facility.id);
    showToast(`Selected Point: ${facility.name} (${facility.location})`, "info");
  };

  // Perform operational synchronizations periodically (every 30 seconds)
  useEffect(() => {
    fetchStadiumStatus(true);
    const interval = setInterval(() => {
      fetchStadiumStatus(true);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Monitor voice changes for route updates
  useEffect(() => {
    if (activeRoute?.aiExplanation && voiceEnabled) {
      handleNarrateRoute(activeRoute.aiExplanation);
    }
  }, [activeRoute, voiceEnabled]);

  // Hook up custom routing trigger from search inputs
  const triggerNavigatorSearch = async (from: string, to: string, ada: boolean) => {
    try {
      const response = await fetch('/api/navigator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, accessibilityRequired: ada })
      });
      const data = await response.json();
      setActiveRoute({
        from,
        to,
        steps: data.steps,
        walkingTime: data.walkingTime,
        congestionScore: data.congestionScore,
        aiExplanation: data.aiExplanation
      });
      
      if (voiceEnabled) {
        handleNarrateRoute(data.aiExplanation);
      }
    } catch (err) {
      console.error("Navigator search failure:", err);
    }
  };

  // Handle mock sign in bypass
  const handleMockLogin = (e: FormEvent) => {
    e.preventDefault();
    if (!ticketCode.trim()) return;

    // Allocate suitable mock names depending on role chosen
    if (userRole === 'volunteer') {
      setUserName("Elena Rostova (Liaison Guide)");
    } else if (userRole === 'organizer') {
      setUserName("Director J. Abhishek (NYNJ Operations)");
    } else {
      setUserName("Alex Morgan (General Spectator)");
    }

    setIsLoggedIn(true);
    showToast(`Access granted! Signed in securely as ${userRole.toUpperCase()}.`, "success");
    fetchStadiumStatus();
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${
      highContrast ? 'bg-black text-white selection:bg-yellow-400 selection:text-black' : 'bg-[#05070A] text-slate-200'
    }`}>
      
      {/* Dynamic Toast Alerts banner */}
      {toast && (
        <div
          id="toast-notification-card"
          className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border flex items-start gap-2.5 shadow-2xl backdrop-blur-md max-w-sm animate-bounce ${
            toast.type === 'error' ? 'bg-red-950/90 border-red-800/40 text-red-200' :
            toast.type === 'success' ? 'bg-emerald-950/90 border-emerald-800/40 text-emerald-200' :
            toast.type === 'warn' ? 'bg-amber-950/90 border-amber-800/40 text-amber-200' : 'bg-[#0D1117]/95 border-white/10 text-slate-200'
          }`}
          role="alert"
        >
          {toast.type === 'error' ? <AlertOctagon className="w-5 h-5 flex-shrink-0" /> : <CheckCircle className="w-5 h-5 flex-shrink-0" />}
          <div>
            <p className="text-xs font-semibold leading-relaxed">{toast.message}</p>
          </div>
        </div>
      )}

      {/* ==================================== LOGIN PAGE (BYPASS FOR HACKATHON) ==================================== */}
      {!isLoggedIn ? (
        <main className="flex-1 flex items-center justify-center p-4 relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/20 via-[#05070A] to-[#05070A]">
          
          {/* Neon Grid Backing */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

          <div className="w-full max-w-md bg-[#0D1117] border border-white/5 p-8 rounded-3xl backdrop-blur-xl shadow-2xl shadow-blue-500/5 relative z-10">
            <div className="flex flex-col items-center text-center gap-2 mb-6">
              <div className="p-3 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-2xl mb-1 flex items-center justify-center shadow-lg shadow-blue-500/10">
                <Shield className="w-8 h-8 text-white animate-pulse" />
              </div>
              <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5 font-sans">
                StadiumMind AI
              </h1>
              <p className="text-xs text-slate-400 font-medium">FIFA World Cup Hackathon Operations Control Hub</p>
            </div>

            <form onSubmit={handleMockLogin} className="flex flex-col gap-4">
              <div>
                <label htmlFor="input-login-ticket" className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Ticket ID / Staff Code</label>
                <input
                  id="input-login-ticket"
                  type="text"
                  value={ticketCode}
                  onChange={(e) => setTicketCode(e.target.value)}
                  className="w-full bg-[#0A0C12] border border-white/5 text-slate-100 text-xs rounded-xl p-3 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                  placeholder="e.g. FIFA-2026-N12"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Operational Interface Profile</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'fan', label: '🏟️ Fan' },
                    { id: 'volunteer', label: '🤝 Staff' },
                    { id: 'organizer', label: '👔 Director' }
                  ].map(role => (
                    <button
                      key={role.id}
                      type="button"
                      id={`btn-role-select-${role.id}`}
                      onClick={() => setUserRole(role.id as any)}
                      className={`py-2 px-1.5 rounded-xl border text-[10px] font-bold text-center transition-all cursor-pointer ${
                        userRole === role.id
                          ? 'bg-blue-500/10 border-blue-500 text-blue-400 shadow-md'
                          : 'bg-[#0A0C12] border-white/5 text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      {role.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[#0A0C12] p-3 rounded-xl border border-white/5 text-[11px] text-slate-400 leading-relaxed">
                ⭐ <span className="font-semibold text-slate-200">Hackathon bypass note:</span> All roles are unlocked. Pick <span className="text-blue-400">Director</span> to test the interactive Recharts analytics and Gemini operational risk summaries.
              </div>

              <button
                id="btn-login-submit"
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition shadow-xl shadow-blue-500/10 cursor-pointer mt-2"
              >
                Access Operation Center
              </button>
            </form>
          </div>
        </main>
      ) : (
        
        // ==================================== MAIN PLATFORM DASHBOARD SHELL ====================================
        <>
          {/* Header Panel */}
          <header className={`px-6 py-4 bg-[#0A0C12]/90 border-b border-white/5 backdrop-blur-md sticky top-0 z-[100] flex flex-wrap items-center justify-between gap-4`}>
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-xl shadow-md shadow-blue-500/5">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-wider text-white font-sans uppercase">StadiumMind AI</h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-2 h-2 rounded-full ${sysStatus === 'nominal' ? 'bg-emerald-400' : 'bg-red-500 animate-ping'}`}></span>
                  <span className="text-[10px] text-slate-400 font-semibold font-mono tracking-wider uppercase">
                    SYSTEM STATUS: {sysStatus === 'nominal' ? 'NOMINAL (SECURE)' : 'CRITICAL (ALERTS)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Accessibility, Narrator, & Profile settings widgets */}
            <div className="flex items-center gap-3">
              
              {/* Screen reader narrator accessibility switch */}
              <button
                id="btn-narrator-switch"
                onClick={() => {
                  setVoiceEnabled(prev => !prev);
                  showToast(!voiceEnabled ? "Voice assistant enabled. AI directions will speak aloud." : "Voice assistant disabled.", "info");
                }}
                className={`p-2 rounded-xl border cursor-pointer transition flex items-center gap-1.5 text-xs font-semibold ${
                  voiceEnabled
                    ? 'bg-blue-500/10 border-blue-500 text-blue-400'
                    : 'bg-[#0D1117] border-white/5 text-slate-400 hover:text-slate-200'
                }`}
                aria-label="Toggle voice screen narrator"
              >
                <Volume2 className="w-4 h-4" />
                Narrator: {voiceEnabled ? 'ACTIVE' : 'OFF'}
              </button>

              {/* High Contrast accessible switcher */}
              <button
                id="btn-contrast-switch"
                onClick={() => {
                  setHighContrast(prev => !prev);
                  showToast(!highContrast ? "High Contrast Mode Active." : "Standard Theme Active.", "info");
                }}
                className={`p-2 rounded-xl border cursor-pointer transition flex items-center gap-1.5 text-xs font-semibold ${
                  highContrast
                    ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400'
                    : 'bg-[#0D1117] border-white/5 text-slate-400 hover:text-slate-200'
                }`}
                aria-label="Toggle high contrast theme"
              >
                <Accessibility className="w-4 h-4" />
                Contrast
              </button>

              {/* Refresh trigger */}
              <button
                id="btn-manual-sync"
                onClick={() => fetchStadiumStatus()}
                disabled={isRefreshing}
                className="p-2 bg-[#0D1117] border border-white/5 hover:border-white/10 text-slate-400 hover:text-slate-200 rounded-xl transition cursor-pointer disabled:opacity-50"
                aria-label="Synchronize live operations data"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>

              {/* User profile capsule info */}
              <div className="flex items-center gap-2 border-l border-white/5 pl-3">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block font-mono">{userRole}</span>
                  <span className="text-xs text-slate-200 block font-semibold">{userName}</span>
                </div>
                <button
                  id="btn-signout"
                  onClick={() => {
                    setIsLoggedIn(false);
                    showToast("Signed out securely.", "info");
                  }}
                  className="p-2 bg-[#0D1117] border border-white/5 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded-xl transition cursor-pointer"
                  aria-label="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>

            </div>
          </header>

          {/* Main Workspace Frame (Bento Grid layout) */}
          <main className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
            
            {/* Interactive Map Block (Left 5-columns, stays prominent) */}
            <section id="map-workspace" className="xl:col-span-5 h-[calc(100vh-140px)] min-h-[500px]">
              <MapComponent
                facilities={facilities}
                crowdZones={crowdZones}
                transportOptions={transportOptions}
                activeRoute={activeRoute}
                onSelectFacility={handleSelectFacilityFromMap}
                emergencies={emergencies}
              />
            </section>

            {/* Dashboards Panels Workspace Block (Right 7-columns) */}
            <section id="dashboards-workspace" className="xl:col-span-7 h-[calc(100vh-140px)] min-h-[500px] overflow-y-auto pr-1">
              <Dashboards
                facilities={facilities}
                crowdZones={crowdZones}
                transportOptions={transportOptions}
                emergencies={emergencies}
                onSubmitEmergency={handleSubmitEmergencyReport}
                onResolveEmergency={handleResolveEmergencyIncident}
                onSelectFacility={(id) => {
                  setSelectedFacilityId(id);
                  // Auto fill Navigator targets
                  const matched = facilities.find(f => f.id === id);
                  if (matched) {
                    showToast(`Route destination synced: ${matched.name}`, "success");
                  }
                }}
                selectedFacilityId={selectedFacilityId}
                activeLanguage={activeLanguage}
                onLanguageChange={(lang) => {
                  setActiveLanguage(lang);
                  showToast(`Language translation switched to ${lang}.`, "success");
                }}
                highContrast={highContrast}
              />
            </section>

          </main>

          {/* Footer status markers */}
          <footer className="px-6 py-2 bg-[#0A0C12] border-t border-white/5 text-[10px] text-slate-500 font-mono flex flex-wrap items-center justify-between gap-2">
            <span>🏟️ StadiumMind AI Platform &bull; NYNJ Host Committee</span>
            <span>Local Time: 2026-07-19T08:53:39-07:00 &bull; Secure Encrypted HTTPS Node</span>
          </footer>
        </>
      )}

    </div>
  );
}
