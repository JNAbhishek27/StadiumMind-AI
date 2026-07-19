import React, { useState, useEffect, FormEvent } from 'react';
import { Facility, CrowdZone, TransportOption, EmergencyReport, DashboardInsights, SmartQAResponse } from '../types';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { 
  Navigation, Bus, AlertTriangle, Shield, CheckCircle, RefreshCw, Volume2, Globe, Send, Sparkles, 
  Leaf, Accessibility, Clock, MapPin, Search, CheckSquare, Plus, ChevronRight, BarChart3, Users, HelpCircle 
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// Colors for Recharts
const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316'];

interface DashboardsProps {
  facilities: Facility[];
  crowdZones: CrowdZone[];
  transportOptions: TransportOption[];
  emergencies: EmergencyReport[];
  onSubmitEmergency: (type: 'medical' | 'lost_child' | 'fire' | 'security', location: string, details: string) => Promise<void>;
  onResolveEmergency: (id: string) => Promise<void>;
  onSelectFacility: (id: string) => void;
  selectedFacilityId: string;
  activeLanguage: string;
  onLanguageChange: (lang: string) => void;
  highContrast: boolean;
}

export default function Dashboards({
  facilities,
  crowdZones,
  transportOptions,
  emergencies,
  onSubmitEmergency,
  onResolveEmergency,
  onSelectFacility,
  selectedFacilityId,
  activeLanguage,
  onLanguageChange,
  highContrast
}: DashboardsProps) {
  const [activeTab, setActiveTab] = useState<'fan' | 'volunteer' | 'organizer'>('fan');

  // Common loading states
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [loadingQA, setLoadingQA] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [loadingTranslate, setLoadingTranslate] = useState(false);

  // Navigator state
  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const [accessibilityRequired, setAccessibilityRequired] = useState(false);
  const [navigationResult, setNavigationResult] = useState<any | null>(null);

  // Q&A state
  const [qaInput, setQAInput] = useState('');
  const [qaResponse, setQAResponse] = useState<SmartQAResponse | null>(null);
  const [suggestedQuestions] = useState([
    "Where is the nearest restroom near Gate C?",
    "Where can I recharge my phone?",
    "Can I carry a portable power bank?",
    "Where is Messi merchandise?",
    "Are refillable water bottles allowed?"
  ]);

  // Sustainability state
  const [refillsCount, setRefillsCount] = useState(0);
  const [recycledItems, setRecycledItems] = useState(0);
  const [walkDistance, setWalkDistance] = useState(0); // in km
  const carbonSavedRefill = 0.15; // kg CO2 saved per plastic bottle avoided
  const carbonSavedRecycle = 0.08; // kg CO2 saved per item recycled
  const carbonSavedWalk = 0.22; // kg CO2 saved per km walked vs car
  const totalCarbonSaved = (refillsCount * carbonSavedRefill) + (recycledItems * carbonSavedRecycle) + (walkDistance * carbonSavedWalk);

  // Emergency form state
  const [emgType, setEmgType] = useState<'medical' | 'lost_child' | 'fire' | 'security'>('medical');
  const [emgLocation, setEmgLocation] = useState('');
  const [emgDetails, setEmgDetails] = useState('');
  const [emgSubmitted, setEmgSubmitted] = useState(false);
  const [submittingEmergency, setSubmittingEmergency] = useState(false);

  // Broadcast state
  const [broadcastSuccessText, setBroadcastSuccessText] = useState<string | null>(null);

  // Dashboards Insights state
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [insightsType, setInsightsType] = useState<'volunteer' | 'organizer'>('organizer');

  // Trigger Routing request to Express backend
  const handleGenerateRoute = async () => {
    if (!routeFrom || !routeTo) return;
    setLoadingRoute(true);
    try {
      const response = await fetch('/api/navigator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: routeFrom, to: routeTo, accessibilityRequired })
      });
      const data = await response.json();
      setNavigationResult(data);

      // If active language is not English, automatically translate the directions
      if (activeLanguage !== 'English') {
        await translateText(data.aiExplanation);
      }
    } catch (err) {
      console.error("Failed to fetch route:", err);
    } finally {
      setLoadingRoute(false);
    }
  };

  // Trigger Q&A request
  const handleAskQuestion = async (questionText: string) => {
    const q = questionText || qaInput;
    if (!q.trim()) return;
    if (!questionText) setQAInput('');
    setLoadingQA(true);
    try {
      const response = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q })
      });
      const data = await response.json();
      
      if (activeLanguage !== 'English') {
        setLoadingQA(true);
        const transRes = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: data.answer, targetLang: activeLanguage })
        });
        const transData = await transRes.json();
        setQAResponse({
          answer: transData.translatedText,
          groundingSources: data.groundingSources
        });
      } else {
        setQAResponse(data);
      }
    } catch (err) {
      console.error("Q&A failed:", err);
    } finally {
      setLoadingQA(false);
    }
  };

  // Trigger Translate helper
  const translateText = async (text: string) => {
    setLoadingTranslate(true);
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLang: activeLanguage })
      });
      const data = await response.json();
      if (navigationResult) {
        setNavigationResult((prev: any) => ({
          ...prev,
          aiExplanation: data.translatedText
        }));
      }
    } catch (err) {
      console.error("Translation failed:", err);
    } finally {
      setLoadingTranslate(false);
    }
  };

  // Trigger insights regeneration
  const fetchDashboardInsights = async (type: 'volunteer' | 'organizer') => {
    setLoadingInsights(true);
    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardType: type })
      });
      const data = await response.json();
      setInsights(data.insights);
    } catch (err) {
      console.error("Failed to load dashboard insights:", err);
    } finally {
      setLoadingInsights(false);
    }
  };

  // Trigger emergency dispatch reporting
  const handleReportEmergencySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!emgLocation.trim()) return;
    setSubmittingEmergency(true);
    try {
      await onSubmitEmergency(emgType, emgLocation, emgDetails);
      setEmgSubmitted(true);
      setEmgLocation('');
      setEmgDetails('');
      setTimeout(() => setEmgSubmitted(false), 5000);
    } catch (err) {
      console.error("Emergency submit error:", err);
    } finally {
      setSubmittingEmergency(false);
    }
  };

  // Sync route target from map selection
  useEffect(() => {
    if (selectedFacilityId) {
      const matched = facilities.find(f => f.id === selectedFacilityId);
      if (matched) {
        if (!routeFrom) {
          setRouteFrom(matched.id);
        } else if (routeFrom !== matched.id) {
          setRouteTo(matched.id);
        }
      }
    }
  }, [selectedFacilityId, facilities]);

  // Load appropriate insights on tab changes
  useEffect(() => {
    if (activeTab === 'organizer') {
      fetchDashboardInsights('organizer');
    } else if (activeTab === 'volunteer') {
      fetchDashboardInsights('volunteer');
    }
  }, [activeTab]);

  // Handle active language translation shifts
  useEffect(() => {
    if (navigationResult?.aiExplanation && activeLanguage !== 'English') {
      translateText(navigationResult.aiExplanation);
    }
  }, [activeLanguage]);

  return (
    <div className="flex flex-col w-full h-full gap-6">
      
      {/* Tab Navigation buttons */}
      <div className="flex bg-[#0A0C12] p-1.5 rounded-xl border border-white/5 self-start z-10">
        <button
          id="tab-fan-view"
          onClick={() => setActiveTab('fan')}
          className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wider uppercase transition-all duration-200 cursor-pointer flex items-center gap-2 ${
            activeTab === 'fan'
              ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#161B22]/50'
          }`}
        >
          <Users className="w-4 h-4" />
          Fan Assistant
        </button>
        <button
          id="tab-volunteer-view"
          onClick={() => setActiveTab('volunteer')}
          className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wider uppercase transition-all duration-200 cursor-pointer flex items-center gap-2 ${
            activeTab === 'volunteer'
              ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#161B22]/50'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          Volunteer Hub
        </button>
        <button
          id="tab-organizer-view"
          onClick={() => setActiveTab('organizer')}
          className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wider uppercase transition-all duration-200 cursor-pointer flex items-center gap-2 ${
            activeTab === 'organizer'
              ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#161B22]/50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Organizer Panel
        </button>
      </div>

      {/* =========================================================================
                                      FAN ASSISTANT VIEW
         ========================================================================= */}
      {activeTab === 'fan' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Navigator & Transport (7 spans) */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* AI Stadium Navigator */}
            <section id="sec-ai-navigator" className="bg-[#0D1117] backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4 shadow-xl shadow-blue-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <Navigation className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      AI Stadium Navigator
                      <span className="text-[10px] bg-blue-500/15 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono">Real-Time</span>
                    </h2>
                    <p className="text-xs text-slate-400">GenAI-powered indoor directions & congestion avoidance</p>
                  </div>
                </div>
                
                {/* Translator Language indicator */}
                <div className="flex items-center gap-1 bg-[#0A0C12] border border-white/5 px-2 py-1 rounded-lg">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    id="select-lang-navigator"
                    value={activeLanguage}
                    onChange={(e) => onLanguageChange(e.target.value)}
                    className="bg-transparent text-slate-300 text-xs font-semibold focus:outline-none cursor-pointer pr-1"
                  >
                    {['English', 'Spanish', 'French', 'Portuguese', 'Hindi', 'Arabic'].map(lang => (
                      <option key={lang} value={lang} className="bg-[#0D1117] text-slate-300">{lang}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Form entries */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="select-route-from" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Start Position</label>
                  <select
                    id="select-route-from"
                    value={routeFrom}
                    onChange={(e) => setRouteFrom(e.target.value)}
                    className="w-full bg-[#0A0C12] border border-white/5 text-slate-300 text-xs rounded-xl p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition cursor-pointer"
                  >
                    <option value="">-- Choose Facility or Gate --</option>
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name} ({f.location})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="select-route-to" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Destination</label>
                  <select
                    id="select-route-to"
                    value={routeTo}
                    onChange={(e) => setRouteTo(e.target.value)}
                    className="w-full bg-[#0A0C12] border border-white/5 text-slate-300 text-xs rounded-xl p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition cursor-pointer"
                  >
                    <option value="">-- Choose Facility or Store --</option>
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name} ({f.location})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ADA Accessibility checkbox */}
              <div className="flex items-center justify-between bg-[#0A0C12]/50 p-3 rounded-xl border border-white/5">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    id="chk-route-ada"
                    type="checkbox"
                    checked={accessibilityRequired}
                    onChange={(e) => setAccessibilityRequired(e.target.checked)}
                    className="rounded text-blue-500 bg-[#0A0C12] border-white/10 focus:ring-blue-500 mt-0.5 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block flex items-center gap-1">
                      <Accessibility className="w-3.5 h-3.5 text-blue-400" />
                      Request Barrier-Free Accessibility Route
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Prioritizes ramps, ADA elevators, and low-congestion wide corridors.</span>
                  </div>
                </label>
              </div>

              {/* Submit button */}
              <button
                id="btn-navigate-search"
                disabled={loadingRoute || !routeFrom || !routeTo}
                onClick={handleGenerateRoute}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition shadow-lg shadow-blue-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {loadingRoute ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Analyzing Stadium Crowd & Routing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate AI Route Plan
                  </>
                )}
              </button>

              {/* Routing Output Result */}
              {navigationResult && (
                <div className="mt-2 p-4 bg-[#0A0C12] border border-white/5 rounded-xl flex flex-col gap-3 relative overflow-hidden animate-fade-in">
                  
                  {/* Local fallback alert badge if API key is mock */}
                  {navigationResult.usingLocalFallback && (
                    <div className="absolute top-2 right-2 bg-[#161B22] text-slate-400 border border-white/5 text-[9px] px-1.5 py-0.5 rounded font-mono font-medium">
                      Offline Mode (Local Fallback)
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 font-mono border-b border-white/5 pb-2">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      EST. WALK TIME: <span className="text-blue-400 font-bold">{navigationResult.walkingTime} MINS</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
                      CONGESTION SCORE: <span className={`font-bold ${navigationResult.congestionScore > 70 ? 'text-red-400' : 'text-amber-400'}`}>{navigationResult.congestionScore}/100</span>
                    </div>
                  </div>

                  <div className="text-slate-200 text-xs leading-relaxed markdown-body">
                    <ReactMarkdown>{navigationResult.aiExplanation}</ReactMarkdown>
                  </div>
                </div>
              )}
            </section>

            {/* AI Transport & Parking Coordinator */}
            <section id="sec-ai-transport" className="bg-[#0D1117] backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4 shadow-xl shadow-blue-500/5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <Bus className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">AI Transport Assistant</h2>
                  <p className="text-xs text-slate-400">Live regional traffic alerts, parking occupancy, and carbon savings</p>
                </div>
              </div>

              {/* Outer Transport Status Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {transportOptions.map(option => (
                  <div key={option.name} className="bg-[#0A0C12] p-3 rounded-xl border border-white/5 flex items-start gap-2.5 hover:border-[#161B22]/80 transition">
                    <div className="text-lg mt-0.5">
                      {option.mode === 'metro' ? '🚇' : option.mode === 'bus' ? '🚌' : option.mode === 'parking' ? '🚗' : option.mode === 'taxi' ? '🚕' : '🚶'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <h4 className="text-xs font-bold text-slate-200 truncate">{option.name}</h4>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                          option.status === 'normal' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                          option.status === 'fast' ? 'bg-teal-500/15 text-teal-400' :
                          option.status === 'delayed' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'
                        }`}>
                          {option.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 truncate">{option.recommendationReason}</p>
                      
                      <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-slate-400 border-t border-white/5 pt-1.5">
                        <span>⏳ {option.durationMinutes}m</span>
                        <span>💵 {option.cost}</span>
                        <span className="text-blue-400 font-semibold">🌱 -{option.carbonSavingKg}kg CO2</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </div>

          {/* Right Column: Grounded Q&A, Sustainability, & Emergency Forms (5 spans) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Grounded Smart Q&A */}
            <section id="sec-smart-qa" className="bg-[#0D1117] backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4 shadow-xl shadow-blue-500/5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <HelpCircle className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">Smart Stadium Q&A</h2>
                  <p className="text-xs text-slate-400">Ask rules, item policy, merchandise, and restroom facilities</p>
                </div>
              </div>

              {/* Input container */}
              <div className="flex gap-2">
                <input
                  id="input-qa-search"
                  type="text"
                  value={qaInput}
                  onChange={(e) => setQAInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAskQuestion(''); }}
                  placeholder="Can I carry a water bottle?"
                  className="flex-1 bg-[#0A0C12] border border-white/5 text-slate-300 text-xs rounded-xl p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
                <button
                  id="btn-ask-qa"
                  disabled={loadingQA || !qaInput.trim()}
                  onClick={() => handleAskQuestion('')}
                  className="px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl transition cursor-pointer disabled:opacity-50"
                  aria-label="Send question"
                >
                  {loadingQA ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>

              {/* Suggested Questions Bubble */}
              <div className="flex flex-wrap gap-1.5">
                {suggestedQuestions.map((sq, i) => (
                  <button
                    key={i}
                    id={`btn-suggest-q-${i}`}
                    onClick={() => handleAskQuestion(sq)}
                    className="text-[10px] font-medium bg-[#0A0C12] hover:bg-[#161B22] text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-lg border border-white/5 transition cursor-pointer"
                  >
                    {sq}
                  </button>
                ))}
              </div>

              {/* QA Output answer */}
              {qaResponse && (
                <div className="mt-2 p-3.5 bg-[#0A0C12] border border-white/5 rounded-xl text-xs text-slate-300 relative animate-fade-in">
                  <h4 className="font-bold text-blue-400 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Concierge Answer:
                  </h4>
                  <p className="leading-relaxed text-slate-200">{qaResponse.answer}</p>
                  
                  {/* Grounded sources tag */}
                  <div className="mt-3 pt-2 border-t border-white/5 flex flex-wrap gap-1.5 items-center">
                    <span className="text-[9px] text-slate-500 uppercase font-mono tracking-wider">SOURCES GROUNDED:</span>
                    {qaResponse.groundingSources.map((src, idx) => (
                      <span key={idx} className="bg-[#161B22] text-slate-400 text-[8px] px-1.5 py-0.5 rounded font-mono">{src}</span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Sustainability Carbon Calculator */}
            <section id="sec-sustainability" className="bg-[#0D1117] backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4 shadow-xl shadow-blue-500/5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-lg">
                  <Leaf className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100">Green Goal Sustainability Tracker</h2>
                  <p className="text-xs text-slate-400">Calculate and log your carbon-saving activities</p>
                </div>
              </div>

              {/* Dynamic click logging */}
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  id="btn-log-refill"
                  onClick={() => setRefillsCount(prev => prev + 1)}
                  className="bg-[#0A0C12] p-2.5 rounded-xl border border-white/5 hover:border-teal-500/30 transition cursor-pointer flex flex-col items-center text-center gap-1 group"
                >
                  <span className="text-lg">🥤</span>
                  <span className="text-[10px] font-bold text-slate-200 group-hover:text-teal-400">Water Refill</span>
                  <span className="text-[9px] text-slate-500 font-mono">+{refillsCount} times</span>
                </button>

                <button
                  id="btn-log-recycle"
                  onClick={() => setRecycledItems(prev => prev + 1)}
                  className="bg-[#0A0C12] p-2.5 rounded-xl border border-white/5 hover:border-teal-500/30 transition cursor-pointer flex flex-col items-center text-center gap-1 group"
                >
                  <span className="text-lg">♻️</span>
                  <span className="text-[10px] font-bold text-slate-200 group-hover:text-teal-400">Smart Recycle</span>
                  <span className="text-[9px] text-slate-500 font-mono">+{recycledItems} items</span>
                </button>

                <button
                  id="btn-log-walk"
                  onClick={() => setWalkDistance(prev => prev + 0.5)}
                  className="bg-[#0A0C12] p-2.5 rounded-xl border border-white/5 hover:border-teal-500/30 transition cursor-pointer flex flex-col items-center text-center gap-1 group"
                >
                  <span className="text-lg">🚶</span>
                  <span className="text-[10px] font-bold text-slate-200 group-hover:text-teal-400">Pedestrian Walk</span>
                  <span className="text-[9px] text-slate-500 font-mono">+{walkDistance.toFixed(1)} km</span>
                </button>
              </div>

              {/* Total calculations visual */}
              <div className="bg-[#0A0C12] p-3.5 rounded-xl border border-white/5 flex items-center justify-between">
                <div>
                  <span className="text-[9px] text-slate-400 block font-mono uppercase tracking-wider">YOUR CARBON OFFSET SAVINGS</span>
                  <span className="text-2xl font-black text-teal-400 font-mono">{totalCarbonSaved.toFixed(2)} <span className="text-sm font-bold">kg CO₂</span></span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block font-sans">Equivalent of planting</span>
                  <span className="text-xs font-bold text-emerald-400">{(totalCarbonSaved * 0.05).toFixed(3)} tree-days 🌳</span>
                </div>
              </div>
            </section>

            {/* AI Emergency Incident Dispatch Panel */}
            <section id="sec-fan-emergency" className="bg-red-950/15 backdrop-blur-md border border-red-500/20 rounded-2xl p-5 flex flex-col gap-4 shadow-xl shadow-red-500/5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-red-400">AI Emergency Assistant</h2>
                  <p className="text-xs text-slate-400">Report medical, security or fire hazard instantly to Ops Command</p>
                </div>
              </div>

              <form onSubmit={handleReportEmergencySubmit} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="select-emg-type" className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Incident Type</label>
                    <select
                      id="select-emg-type"
                      value={emgType}
                      onChange={(e: any) => setEmgType(e.target.value)}
                      className="w-full bg-[#0A0C12] border border-white/5 text-slate-300 text-xs rounded-xl p-2 focus:border-red-500 focus:ring-1 focus:ring-red-500 cursor-pointer"
                    >
                      <option value="medical">Medical Help</option>
                      <option value="lost_child">Lost Child</option>
                      <option value="fire">Fire Hazard</option>
                      <option value="security">Security Alert</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="input-emg-loc" className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Exact Location</label>
                    <input
                      id="input-emg-loc"
                      type="text"
                      value={emgLocation}
                      onChange={(e) => setEmgLocation(e.target.value)}
                      placeholder="e.g. Section 112, Row 14"
                      className="w-full bg-[#0A0C12] border border-white/5 text-slate-300 text-xs rounded-xl p-2 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="input-emg-details" className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Brief Details</label>
                  <textarea
                    id="input-emg-details"
                    value={emgDetails}
                    onChange={(e) => setEmgDetails(e.target.value)}
                    placeholder="Describe symptoms, package appearance, or threat specifics..."
                    className="w-full h-16 bg-[#0A0C12] border border-white/5 text-slate-300 text-xs rounded-xl p-2 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none resize-none"
                  />
                </div>

                <button
                  id="btn-report-emergency"
                  type="submit"
                  disabled={submittingEmergency || !emgLocation.trim()}
                  className="w-full py-2 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white text-xs font-bold uppercase rounded-xl transition cursor-pointer disabled:opacity-50 shadow-md shadow-red-500/10"
                >
                  {submittingEmergency ? "Broadcasting Emergency..." : "Broadcast Emergency Now"}
                </button>
              </form>

              {emgSubmitted && (
                <div id="alert-emg-success" className="bg-emerald-950/40 border border-emerald-900/40 text-emerald-400 text-[11px] p-2.5 rounded-xl flex items-center gap-1.5 animate-pulse">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <div>
                    <span className="font-bold">Broadcast Successful!</span> Stadium Medical & Security units have been mobilized. Monitor action protocols on active map.
                  </div>
                </div>
              )}
            </section>

          </div>

        </div>
      )}

      {/* =========================================================================
                                  VOLUNTEER DASHBOARD HUB
         ========================================================================= */}
      {activeTab === 'volunteer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Shift Brief & Help Alerts (8 spans) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Shift Briefing generated by Gemini */}
            <section id="sec-vol-brief" className="bg-[#0D1117] backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4 shadow-xl shadow-blue-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <Sparkles className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-100">AI Shift Briefing (Volunteers)</h2>
                    <p className="text-xs text-slate-400">Real-time team motivation, sector priorities, and crowd status</p>
                  </div>
                </div>

                <button
                  id="btn-refresh-vol-brief"
                  onClick={() => fetchDashboardInsights('volunteer')}
                  className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-[#161B22] rounded-lg transition cursor-pointer"
                  aria-label="Refresh Shift briefing"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingInsights ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingInsights ? (
                <div className="space-y-3 py-6">
                  <div className="h-4 bg-[#161B22] rounded animate-pulse w-3/4"></div>
                  <div className="h-4 bg-[#161B22] rounded animate-pulse"></div>
                  <div className="h-4 bg-[#161B22] rounded animate-pulse w-5/6"></div>
                </div>
              ) : (
                <div className="text-slate-300 text-xs leading-relaxed flex flex-col gap-3">
                  <div className="bg-[#0A0C12] p-4 rounded-xl border border-white/5">
                    <h4 className="font-bold text-blue-400 text-xs mb-1.5">📢 SHIFT OVERVIEW:</h4>
                    <p>{insights?.liveSummary}</p>
                  </div>

                  <div className="bg-[#0A0C12] p-4 rounded-xl border border-white/5">
                    <h4 className="font-bold text-amber-400 text-xs mb-1.5">♿ ACCESSIBILITY & SECTOR FOCUS:</h4>
                    <p>{insights?.riskAnalysis}</p>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-100 text-xs mb-2">📋 CRITICAL VOLUNTEER DISPATCH ACTION ITEMS:</h4>
                    <ul className="space-y-2">
                      {insights?.recommendedActions.map((action, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11px] bg-[#0A0C12]/40 p-2.5 rounded-lg border border-white/5">
                          <ChevronRight className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>

            {/* Live emergencies dispatch management list */}
            <section id="sec-vol-incidents" className="bg-[#0D1117] backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4 shadow-xl shadow-blue-500/5">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Active Stadium Incident Reports
                <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-mono font-bold animate-pulse">
                  {emergencies.filter(e => e.status !== 'resolved').length} CRITICAL ALERTS
                </span>
              </h2>

              <div className="space-y-3">
                {emergencies.map(emg => (
                  <div key={emg.id} className={`p-4 rounded-xl border transition flex flex-col gap-3 ${
                    emg.status === 'resolved' ? 'bg-[#0A0C12]/40 border-white/5 opacity-60' :
                    emg.alertLevel === 'critical' ? 'bg-red-950/15 border-red-500/20' :
                    emg.alertLevel === 'high' ? 'bg-amber-950/10 border-amber-500/20' : 'bg-[#0A0C12] border-white/5'
                  }`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {emg.type === 'medical' ? '❤️' : emg.type === 'lost_child' ? '👶' : emg.type === 'fire' ? '🔥' : '🔒'}
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                            {emg.type.replace('_', ' ').toUpperCase()} REPORT
                            <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ${
                              emg.alertLevel === 'critical' ? 'bg-red-600 text-white' :
                              emg.alertLevel === 'high' ? 'bg-amber-500 text-slate-950' : 'bg-[#161B22] text-slate-400'
                            }`}>
                              {emg.alertLevel.toUpperCase()}
                            </span>
                          </h4>
                          <span className="text-[10px] text-slate-400 block flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {emg.location}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                          emg.status === 'pending' ? 'bg-red-500/20 text-red-400 border border-red-500/10' :
                          emg.status === 'dispatched' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/10' :
                          'bg-emerald-500/20 text-emerald-400 border border-emerald-500/10'
                        }`}>
                          {emg.status.toUpperCase()}
                        </span>

                        {emg.status !== 'resolved' && (
                          <button
                            id={`btn-resolve-emg-${emg.id}`}
                            onClick={() => onResolveEmergency(emg.id)}
                            className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-[10px] px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 shadow-sm"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Resolve
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 italic bg-[#0A0C12]/80 p-2.5 rounded-lg border border-white/5">
                      &ldquo;{emg.details}&rdquo;
                    </p>

                    <div className="bg-[#0A0C12] p-3 rounded-lg border border-white/5 text-[11px] text-slate-300 flex flex-col gap-1.5">
                      <span className="font-bold text-blue-400 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" /> AI Recommended Action:
                      </span>
                      <p className="leading-relaxed text-slate-300">{emg.recommendedAction}</p>
                    </div>

                    {/* Active dispatch targets */}
                    <div className="flex flex-wrap gap-1.5 items-center mt-1">
                      <span className="text-[8px] text-slate-500 font-mono tracking-wider">SYSTEM BROADCASTS:</span>
                      {emg.alertsRaised.map((alt, i) => (
                        <span key={i} className="bg-[#161B22] text-slate-400 text-[9px] px-1.5 py-0.5 rounded border border-white/5">{alt}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </div>

          {/* Right Column: Active Checklists & Allocations (4 spans) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Shift checklist tasks */}
            <section id="sec-vol-tasks" className="bg-[#0D1117] backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4 shadow-xl shadow-blue-500/5">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
                <CheckSquare className="w-5 h-5 text-blue-400" />
                Shift Checklist Tasks
              </h2>
              
              <div className="flex flex-col gap-2.5 text-xs text-slate-300">
                <label className="flex items-start gap-2.5 cursor-pointer hover:bg-[#161B22]/40 p-2 rounded-lg transition">
                  <input type="checkbox" defaultChecked className="rounded text-blue-500 bg-[#0A0C12] border-white/10 mt-0.5 w-4 h-4" />
                  <div>
                    <span className="font-bold text-slate-200">Confirm ECO water stations are filled</span>
                    <p className="text-[10px] text-slate-500">North Sec 111 & South Sec 135 checked.</p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer hover:bg-[#161B22]/40 p-2 rounded-lg transition">
                  <input type="checkbox" className="rounded text-blue-500 bg-[#0A0C12] border-white/10 mt-0.5 w-4 h-4" />
                  <div>
                    <span className="font-bold text-slate-200">ADA lift key verify near Section 124</span>
                    <p className="text-[10px] text-slate-500">Make sure elevators are operating with priority guides.</p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer hover:bg-[#161B22]/40 p-2 rounded-lg transition">
                  <input type="checkbox" className="rounded text-blue-500 bg-[#0A0C12] border-white/10 mt-0.5 w-4 h-4" />
                  <div>
                    <span className="font-bold text-slate-200">Megastore crowd queues monitoring</span>
                    <p className="text-[10px] text-slate-500">Volunteers required to redirect fans to Sector 2 stalls.</p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer hover:bg-[#161B22]/40 p-2 rounded-lg transition">
                  <input type="checkbox" className="rounded text-blue-500 bg-[#0A0C12] border-white/10 mt-0.5 w-4 h-4" />
                  <div>
                    <span className="font-bold text-slate-200">Pre-match stadium perimeter sweep</span>
                    <p className="text-[10px] text-slate-500">Alert any unattended luggage instantly to Gate A officers.</p>
                  </div>
                </label>
              </div>
            </section>

            {/* Volunteer Allocations info */}
            <section id="sec-vol-alloc" className="bg-[#0D1117] backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4 shadow-xl shadow-blue-500/5">
              <h2 className="text-base font-bold text-slate-100">Live Team Allocation</h2>
              <div className="space-y-3 font-mono text-xs text-slate-300">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span>Guides & Wayfinding:</span>
                  <span className="text-blue-400 font-bold">{insights?.resourceAllocation?.volunteers || 510} active</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span>Medical Station Assistants:</span>
                  <span className="text-blue-400 font-bold">{insights?.resourceAllocation?.medicalTeams || 35} active</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span>Security Liaisons:</span>
                  <span className="text-blue-400 font-bold">{insights?.resourceAllocation?.securityStaff || 120} active</span>
                </div>
              </div>
            </section>

          </div>

        </div>
      )}

      {/* =========================================================================
                                  ORGANIZER DASHBOARD PANEL
         ========================================================================= */}
      {activeTab === 'organizer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Gemini Operational Summary & Risk vectors (7 spans) */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Live Operational summary & decisions */}
            <section id="sec-org-insights" className="bg-[#0D1117] backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4 shadow-xl shadow-blue-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <Sparkles className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-100">AI Decision Support Summary</h2>
                    <p className="text-xs text-slate-400">Gemini-generated real-time operational diagnostics and safety allocation</p>
                  </div>
                </div>

                <button
                  id="btn-refresh-org-insights"
                  onClick={() => fetchDashboardInsights('organizer')}
                  className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-[#161B22] rounded-lg transition cursor-pointer"
                  aria-label="Refresh shift insights"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingInsights ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingInsights ? (
                <div className="space-y-3 py-12">
                  <div className="h-4 bg-[#161B22] rounded animate-pulse w-2/3"></div>
                  <div className="h-4 bg-[#161B22] rounded animate-pulse"></div>
                  <div className="h-4 bg-[#161B22] rounded animate-pulse w-5/6"></div>
                </div>
              ) : (
                <div className="text-slate-300 text-xs leading-relaxed flex flex-col gap-3">
                  <div className="bg-[#0A0C12] p-4 rounded-xl border border-white/5">
                    <h4 className="font-bold text-blue-400 text-xs mb-1.5 uppercase">📈 Live Stadium Assessment:</h4>
                    <p>{insights?.liveSummary}</p>
                  </div>

                  <div className="bg-[#0A0C12] p-4 rounded-xl border border-white/5">
                    <h4 className="font-bold text-red-400 text-xs mb-1.5 uppercase">🚨 Risk & Vulnerability Analysis:</h4>
                    <p>{insights?.riskAnalysis}</p>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-100 text-xs mb-2 uppercase">🛡️ Recommended Tactical Actions:</h4>
                    <ul className="space-y-2">
                      {insights?.recommendedActions.map((action, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-[11px] bg-[#0A0C12]/40 p-2.5 rounded-lg border border-white/5">
                          <span className="bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[9px] px-1.5 py-0.5 rounded font-mono flex-shrink-0">Action #{i+1}</span>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>

            {/* Stadium-wide manual broadcast alerts panel */}
            <section id="sec-org-broadcast" className="bg-[#0D1117] backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4 shadow-xl shadow-blue-500/5">
              <h2 className="text-base font-bold text-slate-100">Broadcast Public Alert</h2>
              <div className="flex gap-2">
                <input
                  id="input-org-broadcast"
                  type="text"
                  placeholder="e.g. Metro lines are congested, please use regional Bus shuttles..."
                  className="flex-1 bg-[#0A0C12] border border-white/5 text-slate-300 text-xs rounded-xl p-2.5 focus:border-blue-500 outline-none"
                />
                <button
                  id="btn-org-broadcast"
                  onClick={() => {
                    const inp = document.getElementById('input-org-broadcast') as HTMLInputElement;
                    if (inp?.value.trim()) {
                      setBroadcastSuccessText(inp.value);
                      inp.value = '';
                      setTimeout(() => setBroadcastSuccessText(null), 6000);
                    }
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-bold uppercase rounded-xl transition cursor-pointer"
                >
                  Broadcast
                </button>
              </div>

              {broadcastSuccessText && (
                <div className="bg-emerald-950/40 border border-emerald-900/40 text-emerald-400 text-[11px] p-2.5 rounded-xl flex items-center gap-1.5 animate-pulse mt-1">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <div>
                    <span className="font-bold">Broadcast active:</span> &ldquo;{broadcastSuccessText}&rdquo; has been dispatched to all fan mobile feeds and screens stadium-wide.
                  </div>
                </div>
              )}
            </section>

          </div>

          {/* Right Column: Recharts Operational Visual Analytics (5 spans) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Charts Visualizer panel */}
            <section id="sec-org-analytics" className="bg-[#0D1117] backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col gap-4 shadow-xl shadow-blue-500/5">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                Live Stadium Heatmap Analytics
              </h2>

              {/* Chart 1: Crowd Congestion levels */}
              <div className="bg-[#0A0C12] p-3.5 rounded-xl border border-white/5">
                <h3 className="text-xs font-bold text-slate-300 mb-2 font-sans">Sector Congestion Index (%)</h3>
                <div className="w-full h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={crowdZones}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#161B22" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={9} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={9} width={20} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0D1117', borderColor: '#30363d', borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                      />
                      <Bar dataKey="currentCongestion" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                        {crowdZones.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.currentCongestion > 75 ? '#ef4444' : entry.currentCongestion > 50 ? '#f59e0b' : '#3b82f6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Facility queue times */}
              <div className="bg-[#0A0C12] p-3.5 rounded-xl border border-white/5">
                <h3 className="text-xs font-bold text-slate-300 mb-2 font-sans">Facility Queue Waiting Times (Mins)</h3>
                <div className="w-full h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={facilities.filter(f => f.type === 'food' || f.type === 'gate' || f.type === 'merchandise')}>
                      <defs>
                        <linearGradient id="colorQueue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#161B22" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={8} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={9} width={20} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0D1117', borderColor: '#30363d', borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                      />
                      <Area type="monotone" dataKey="estimatedQueueTime" stroke="#3b82f6" fillOpacity={1} fill="url(#colorQueue)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Resource numbers indicator */}
              <div className="bg-[#0A0C12] p-4 rounded-xl border border-white/5 text-xs text-slate-300 space-y-3">
                <h4 className="font-bold text-slate-200 uppercase tracking-wider font-mono text-[10px] border-b border-white/5 pb-1.5">ORGANIZER FORCE ALLOCATION</h4>
                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="p-2 bg-[#161B22] rounded-lg border border-white/5">
                    <span className="text-[10px] text-slate-400 block">SECURITY</span>
                    <span className="text-sm font-bold text-red-400">{insights?.resourceAllocation?.securityStaff || 850}</span>
                  </div>
                  <div className="p-2 bg-[#161B22] rounded-lg border border-white/5">
                    <span className="text-[10px] text-slate-400 block">VOLUNTEERS</span>
                    <span className="text-sm font-bold text-blue-400">{insights?.resourceAllocation?.volunteers || 1300}</span>
                  </div>
                  <div className="p-2 bg-[#161B22] rounded-lg border border-white/5">
                    <span className="text-[10px] text-slate-400 block">MEDICAL</span>
                    <span className="text-sm font-bold text-teal-400">{insights?.resourceAllocation?.medicalTeams || 50}</span>
                  </div>
                </div>
              </div>

            </section>

          </div>

        </div>
      )}

    </div>
  );
}
