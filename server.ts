import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { NYNJ_STADIUM_FACILITIES, NYNJ_STADIUM_CROWD_ZONES, NYNJ_STADIUM_TRANSPORT, STADIUM_RULES_GROUNDING } from './src/data/stadiumData.js';
import { EmergencyReport, RouteResponse, CrowdZone, TransportOption, DashboardInsights, SmartQAResponse } from './src/types.js';

// Setup environment variables
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Lazy initialization of Google GenAI SDK to prevent startup crashes if key is missing
let aiInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (aiInstance) return aiInstance;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    console.warn("⚠️ GEMINI_API_KEY is not defined. The system will use high-fidelity local AI fallback simulation.");
    return null;
  }
  try {
    aiInstance = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("✅ Google GenAI SDK successfully initialized.");
    return aiInstance;
  } catch (err) {
    console.error("❌ Failed to initialize Google GenAI SDK:", err);
    return null;
  }
}

function safeParseJSON(text: string): any {
  if (!text) return {};
  let cleaned = text.trim();
  
  // Find the first '{' and last '}' to isolate the JSON object
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  
  // Strip code block markers if they are still somehow present
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```json|```/g, '').trim();
  }
  
  // Clean up trailing commas in objects and arrays to prevent parse failures
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  
  return JSON.parse(cleaned);
}

// Global active emergency memory storage (resets on server restart, but acts as persistent state during session)
let activeEmergencies: EmergencyReport[] = [
  {
    id: 'emg-1',
    type: 'medical',
    location: 'North Concourse Section 112, near Taco Cantina',
    details: 'A fan is experiencing signs of heat exhaustion and dizziness.',
    timestamp: new Date(Date.now() - 30 * 60000).toISOString(), // 30 mins ago
    status: 'dispatched',
    nearestEmergencyPoint: 'First Aid & Medical Station 1 (Section 114)',
    recommendedAction: 'Apply cold compress, administer electrolytes, and keep patient seated in shaded space until medical team arrives.',
    alertLevel: 'medium',
    alertsRaised: ['Medical Dispatch Team 1 notified', 'North Stand Concourse Stewards alerted'],
  },
  {
    id: 'emg-2',
    type: 'security',
    location: 'Gate A Security Checkpoint',
    details: 'Unattended travel rucksack discovered near ticket scan bar.',
    timestamp: new Date(Date.now() - 10 * 60000).toISOString(), // 10 mins ago
    status: 'pending',
    nearestEmergencyPoint: 'Main Stadium Command & Security Office (Section 100)',
    recommendedAction: 'Isolate immediate 5-meter radius, do not touch package, dispatch explosive detection team, and check perimeter CCTV logs.',
    alertLevel: 'high',
    alertsRaised: ['Security Team Delta mobilized', 'Perimeter CCTV Camera 14 locked'],
  }
];

// AI Caching structures to limit Gemini free-tier quota exhaustion
let cachedCrowdResponse: any = null;
let lastCrowdFetchTime = 0;
const CROWD_CACHE_TTL_MS = 180 * 1000; // 3 minutes cache TTL

const cachedInsights: Record<string, { data: any; timestamp: number }> = {};
const INSIGHTS_CACHE_TTL_MS = 180 * 1000; // 3 minutes cache TTL

// ----------------- API ROUTES -----------------

// 1. Health & Configuration Check
app.get('/api/health', (req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY";
  res.json({
    status: 'ok',
    geminiConfigured: hasKey,
    stadiumName: 'NYNJ Stadium (FIFA 2026)',
    activeEmergenciesCount: activeEmergencies.length,
    timestamp: new Date().toISOString()
  });
});

// 2. AI Stadium Navigator
app.post('/api/navigator', async (req, res) => {
  const { from, to, accessibilityRequired } = req.body;
  if (!from || !to) {
    res.status(400).json({ error: "Missing start ('from') or destination ('to') location." });
    return;
  }

  const ai = getGeminiClient();
  const matchedFrom = NYNJ_STADIUM_FACILITIES.find(f => f.id === from || f.name.toLowerCase().includes(from.toLowerCase()));
  const matchedTo = NYNJ_STADIUM_FACILITIES.find(f => f.id === to || f.name.toLowerCase().includes(to.toLowerCase()));

  // Logical route computation (Ground-truth anchor)
  const isFromGate = matchedFrom?.type === 'gate';
  const steps: string[] = [];
  let walkingTime = 5;
  let congestionScore = 30;
  let accessibilityRoute = accessibilityRequired;
  let nearestRestroom = matchedTo?.nearestRestroom || 'Restroom E2';

  if (matchedFrom && matchedTo) {
    const dx = matchedTo.coordinates[0] - matchedFrom.coordinates[0];
    const dy = matchedTo.coordinates[1] - matchedFrom.coordinates[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    walkingTime = Math.max(2, Math.round(distance / 5));
    congestionScore = Math.round((matchedFrom.congestionScore + matchedTo.congestionScore) / 2);

    steps.push(`Start at ${matchedFrom.name}.`);
    if (accessibilityRequired) {
      steps.push("Locate the glowing green accessibility floor tiles to follow the level barrier-free walkway.");
      steps.push("Take elevator #4 situated near the main section entry to transition between levels.");
      accessibilityRoute = true;
    } else {
      steps.push("Navigate along the main wide concourse stream, staying to the outer lane.");
    }
    steps.push(`Pass near Section ${matchedFrom.location.includes('Section') ? matchedFrom.location.match(/\d+/)?.[0] : '115'}.`);
    steps.push(`Arrive at ${matchedTo.name}.`);
  } else {
    steps.push(`Depart from your current position (${from}).`);
    steps.push(`Move towards the nearest concourse directory panel.`);
    steps.push(`Follow indicators pointing towards ${to}.`);
    steps.push(`Arrive safely at ${to}.`);
  }

  const directionsText = steps.join(" ");

  if (ai) {
    try {
      const prompt = `
        You are the Head of Stadium Routing Operations for the FIFA World Cup 2026.
        A fan requests directions inside NYNJ Stadium:
        - Origin/Start: "${matchedFrom ? matchedFrom.name : from}" (${matchedFrom ? matchedFrom.description : 'General stand position'})
        - Destination: "${matchedTo ? matchedTo.name : to}" (${matchedTo ? matchedTo.description : 'Stadium facility'})
        - Accessibility Assistance Required: ${accessibilityRequired ? 'YES' : 'NO'}
        - Estimated base walking time: ${walkingTime} minutes.
        - Current combined congestion score: ${congestionScore}/100.
        
        Using this precise stadium data, generate a concise, visually elegant, and helpful route guide in markdown.
        Your response must include:
        1. A step-by-step navigational instruction that sounds natural and fits the World Cup atmosphere.
        2. Specifically note the accessibility route advice (e.g., specific elevators, ramp access, flat pathways) if accessibility is required.
        3. Identify the closest restroom along this route.
        4. Provide an encouraging eco-tip (e.g. suggesting water refill, waste recycling).
        
        Structure your response clearly and keep it under 150 words.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
      });

      res.json({
        steps,
        walkingTime,
        congestionScore,
        accessibilityRoute,
        nearestRestroom,
        directionsText,
        aiExplanation: response.text || "Directions generated.",
        usingLocalFallback: false
      });
      return;
    } catch (err: any) {
      console.log("ℹ️ [Gemini Client] Local fallback simulation active (Route Navigator).");
    }
  }

  // Fallback AI simulation (if Gemini API key is missing or fails)
  const fallbackAccessibility = accessibilityRequired 
    ? "♿ Accessible Route Active: Elevator ADA-02 is located directly next to Section 112. Avoid the stairs on Sector 4 concourse, which has a 12% incline. Restrooms are fitted with touchless automated push-doors."
    : "Standard Route Active: The route follows the wide, level concrete concourse. Proceed past the main sponsor exhibits.";

  const fallbackText = `### Navigating from ${matchedFrom ? matchedFrom.name : from} to ${matchedTo ? matchedTo.name : to}
  
  **Estimated Time:** ${walkingTime} mins | **Congestion:** ${congestionScore}% (Moderate Flow)
  
  **Navigational Steps:**
  1. Exit ${matchedFrom ? matchedFrom.name : from} and head toward the nearest wide concourse lane.
  2. ${fallbackAccessibility}
  3. Keep left as you pass the bustling food concourses to avoid vendor queue lines.
  4. Your destination **${matchedTo ? matchedTo.name : to}** will be clearly visible on your right under the stadium tier guides.
  
  *Nearest restroom along this path:* **${nearestRestroom}**.
  🌱 *Sustainability tip:* Refill your water bottle at the **ECO Refill Station North** near Section 111 to save 0.15kg CO2!`;

  res.json({
    steps,
    walkingTime,
    congestionScore,
    accessibilityRoute,
    nearestRestroom,
    directionsText,
    aiExplanation: fallbackText,
    usingLocalFallback: true
  });
});

// 3. AI Crowd Prediction & Explanations
app.get('/api/crowd', async (req, res) => {
  const now = Date.now();
  if (cachedCrowdResponse && (now - lastCrowdFetchTime < CROWD_CACHE_TTL_MS)) {
    res.json({
      ...cachedCrowdResponse,
      usingCachedAI: true
    });
    return;
  }

  const ai = getGeminiClient();

  // Create a structured list of zones and request Gemini to analyze them
  if (ai) {
    try {
      const prompt = `
        You are a Stadium Security & Crowd Flow Analyst for FIFA World Cup 2026.
        Here is the current operational crowd density data for NYNJ Stadium:
        ${NYNJ_STADIUM_CROWD_ZONES.map(z => `- ${z.name}: Congestion ${z.currentCongestion}%, Trend: ${z.trend}, Predicted in 20/40/60m: ${z.predictedCongestion20}% / ${z.predictedCongestion40}% / ${z.predictedCongestion60}%`).join('\n')}
        
        Analyze this data and return a JSON object containing short operational explanations for each zone.
        You must strictly return valid JSON matching this schema:
        {
          "explanations": [
            { "zoneId": "zone-north", "text": "Explanation string..." },
            { "zoneId": "zone-east", "text": "Explanation string..." },
            { "zoneId": "zone-south", "text": "Explanation string..." },
            { "zoneId": "zone-west", "text": "Explanation string..." },
            { "zoneId": "zone-pitch", "text": "Explanation string..." }
          ],
          "globalSummary": "A concise 2-sentence tactical summary of stadium crowd safety status."
        }
        Do not add any Markdown syntax around the JSON (no backticks or "json" specifiers).
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      let responseText = response.text || "{}";
      const parsed = safeParseJSON(responseText);

      // Map the generated explanations back to our crowd zones
      const zonesWithAiExplanations = NYNJ_STADIUM_CROWD_ZONES.map(zone => {
        const matchingExplanation = parsed.explanations?.find((e: any) => e.zoneId === zone.id);
        return {
          ...zone,
          explanation: matchingExplanation ? matchingExplanation.text : zone.explanation
        };
      });

      const responseData = {
        zones: zonesWithAiExplanations,
        globalSummary: parsed.globalSummary || "All stadium zones flowing within safety thresholds. Monitor North Stand bottleneck closely.",
        usingLocalFallback: false
      };

      // Store in memory cache
      cachedCrowdResponse = responseData;
      lastCrowdFetchTime = now;

      res.json(responseData);
      return;
    } catch (err: any) {
      console.log("ℹ️ [Gemini Client] Local fallback simulation active (Crowd Flow).");
    }
  }

  // Fallback
  res.json({
    zones: NYNJ_STADIUM_CROWD_ZONES,
    globalSummary: "NYNJ Stadium is operating at high load (75% general capacity). North stands are heavily congested due to nearby bus arrivals; volunteers are actively re-routing ticket-holders to East Gates to distribute flow.",
    usingLocalFallback: true
  });
});

// 4. AI Transport Assistant
app.post('/api/transport', async (req, res) => {
  const { startPoint, targetGate } = req.body;
  const ai = getGeminiClient();

  if (ai) {
    try {
      const prompt = `
        You are a FIFA 2026 Smart Mobility Coordinator.
        A fan wants to travel from "${startPoint || 'Local fan zone'}" to NYNJ Stadium, aiming for "${targetGate || 'Gate A (North Entrance)'}".
        We have these real-time transport options with current states:
        ${NYNJ_STADIUM_TRANSPORT.map(t => `- ${t.name} (${t.mode}): Duration: ${t.durationMinutes}m, Status: ${t.status}, Carbon Offset: ${t.carbonSavingKg}kg CO2`).join('\n')}
        
        Write an intelligent transit advisory in markdown format, pointing out:
        1. The absolute most eco-friendly route (highlighting the carbon savings).
        2. The fastest route based on current delays/congestion.
        3. Parking and rideshare tips.
        Keep it highly encouraging, practical, and under 120 words.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt
      });

      res.json({
        options: NYNJ_STADIUM_TRANSPORT,
        recommendationText: response.text,
        usingLocalFallback: false
      });
      return;
    } catch (err: any) {
      console.log("ℹ️ [Gemini Client] Local fallback simulation active (Transit Guide).");
    }
  }

  // Fallback transit advice
  const fallbackAdvice = `### FIFA World Cup Mobility Advisory 🚇

  For the fastest and most seamless journey from **${startPoint || 'Metropolitan Fan Zone'}** to **${targetGate || 'Gate A'}**, we highly recommend:
  
  1. **Metro Express (East Station):** The ultimate champion! It takes only **18 minutes** and saves **3.2kg of CO2** per person. Plus, it is completely free with your FIFA Match Ticket. Directly exits to Gate B (accessible path).
  2. **Active Pedestrian Path (Meadowlands Trail):** If you are staying at a nearby hotel, enjoy a scenic 20-minute walk on our designated, secure trail. It saves a maximum **4.5kg of CO2** and has zero queue times!
  3. **Self-Driving Advisory:** Avoid Stadium Lot C, which is currently **90% congested** and costs $40. Instead, drive to **Park-and-Ride Lot F** ($15, only 35% full) and hop on our rapid shuttle directly to Gate D!`;

  res.json({
    options: NYNJ_STADIUM_TRANSPORT,
    recommendationText: fallbackAdvice,
    usingLocalFallback: true
  });
});

// 5. AI Emergency Assistant
app.post('/api/emergency', async (req, res) => {
  const { type, location, details } = req.body;
  if (!type || !location) {
    res.status(400).json({ error: "Emergency type and location are required." });
    return;
  }

  // Identify nearest emergency response facility logically
  let nearestFacility = 'First Aid & Medical Station 1 (Section 114)';
  let alertLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium';
  
  if (type === 'fire') {
    nearestFacility = 'Main Stadium Command & Security Office (Section 100) / Local Fire Wardens';
    alertLevel = 'critical';
  } else if (type === 'security') {
    nearestFacility = 'Main Stadium Command & Security Office (Section 100)';
    alertLevel = 'high';
  } else if (type === 'lost_child') {
    nearestFacility = 'Main Stadium Command & Security Office (Section 100) / Nearest Information Booth';
    alertLevel = 'medium';
  } else {
    // Medical
    if (location.toLowerCase().includes('south') || location.toLowerCase().includes('13') || location.toLowerCase().includes('12')) {
      nearestFacility = 'First Aid Station 2 (South Concourse Section 132)';
    }
    alertLevel = 'high';
  }

  const ai = getGeminiClient();
  let actionPlan = "";
  let alertsRaised: string[] = [];

  if (ai) {
    try {
      const prompt = `
        You are a Senior FIFA Stadium Incident Commander.
        An emergency has been reported inside the stadium:
        - Incident Type: ${type.toUpperCase()}
        - Reported Location: "${location}"
        - Details: "${details || 'No additional details provided.'}"
        - Assigned nearest defense facility: "${nearestFacility}"
        - Assessed default severity: ${alertLevel.toUpperCase()}
        
        Generate a tactical response action plan in markdown format. It must have two parts:
        1. **Fan Safety Instructions (1-2 sentences)**: What the reporting fan should immediately do on the scene.
        2. **Ops Dispatch Protocol (1-2 sentences)**: Action steps for volunteers and security stewards dispatching to this location.
        Keep it highly authoritative, direct, and under 100 words.
        Also suggest exactly 2 system alerts to be broadcast to staff (e.g. "Alerting Sector 4 Supervisors", "CCTV Lock on Gate A").
        Return the result as JSON matching this schema:
        {
          "actionPlan": "Markdown action plan...",
          "alertsRaised": ["Alert 1", "Alert 2"]
        }
        Do not add any Markdown syntax around the JSON (no backticks or "json" specifiers).
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      let responseText = response.text || "{}";
      const parsed = safeParseJSON(responseText);
      actionPlan = parsed.actionPlan || `Safety instructions generated for ${type}.`;
      alertsRaised = parsed.alertsRaised || [`Dispatching stewards to ${location}`];
    } catch (err: any) {
      console.log("ℹ️ [Gemini Client] Local fallback simulation active (Emergency Coordinator).");
    }
  }

  if (!actionPlan) {
    // Local safety guidelines fallback
    if (type === 'medical') {
      actionPlan = `**For the Fan:** Keep the patient calm, seated, and in shade. Do not attempt to move them if they suspect spine injury. Volunteer stewards are arriving with water and cold compresses.
      
**For Operations:** Dispatch Medical Team 2 with transport stretcher immediately from **${nearestFacility}**. Log incident into FIFA Command board.`;
      alertsRaised = [`Medical Unit Mobilized to ${location}`, `Sector Stewards notified to clear pathway`];
    } else if (type === 'lost_child') {
      actionPlan = `**For the Fan:** Keep the child safe and stationary at your exact location. Reassure them. Do not move unless directed by a uniformed officer.
      
**For Operations:** Dispatch a Volunteer Welfare Coordinator. Broadcast the child's description over the encrypted staff channel. Alert all perimeter exit gates.`;
      alertsRaised = [`Welfare team dispatched to ${location}`, `Perimeter exit security informed`];
    } else if (type === 'fire') {
      actionPlan = `**For the Fan:** Evacuate the immediate area in an orderly fashion. Walk, do not run. Follow the illuminated green exit signs towards Gate exits. Do not use elevators.
      
**For Operations:** Sound localized pre-alarm alert. Dispatched Fire Warden Team B with dry-chemical suppressors. Inform city emergency trunk line.`;
      alertsRaised = [`Fire Suppression Team B deployed`, `Regional emergency trunk alerted`];
    } else {
      // Security
      actionPlan = `**For the Fan:** Do not touch or handle suspicious packages. Walk away at least 15 meters. Alert nearest supervisor. Keep calm.
      
**For Operations:** Lock down CCTV feed. Dispatch Security Unit Sector C. Clear immediate concourse area. Prepare for perimeter cordon.`;
      alertsRaised = [`Security Patrol mobilized`, `Sector CCTV target feed locked`];
    }
  }

  const newReport: EmergencyReport = {
    id: `emg-${Date.now()}`,
    type,
    location,
    details: details || "No further text",
    timestamp: new Date().toISOString(),
    status: 'pending',
    nearestEmergencyPoint: nearestFacility,
    recommendedAction: actionPlan,
    alertLevel,
    alertsRaised
  };

  activeEmergencies.unshift(newReport);

  res.json({
    report: newReport,
    activeCount: activeEmergencies.length,
    usingLocalFallback: !ai
  });
});

// GET active emergencies list (for staff dashboards)
app.get('/api/emergencies', (req, res) => {
  res.json({
    emergencies: activeEmergencies
  });
});

// Resolve an emergency incident
app.post('/api/emergency/resolve', (req, res) => {
  const { id } = req.body;
  if (!id) {
    res.status(400).json({ error: "Missing emergency ID." });
    return;
  }
  const reportIndex = activeEmergencies.findIndex(e => e.id === id);
  if (reportIndex !== -1) {
    activeEmergencies[reportIndex].status = 'resolved';
    res.json({ success: true, updatedReport: activeEmergencies[reportIndex] });
  } else {
    res.status(404).json({ error: "Incident report not found." });
  }
});

// 6. Multilingual Translator API
app.post('/api/translate', async (req, res) => {
  const { text, targetLang } = req.body;
  if (!text || !targetLang) {
    res.status(400).json({ error: "Text and target language are required." });
    return;
  }

  const ai = getGeminiClient();

  if (ai) {
    try {
      const prompt = `
        Translate the following stadium operational text precisely into the requested language.
        Maintain all markdown styling, bold text, lists, and numbers. Do not add any conversational meta-text.
        - Text to Translate: "${text}"
        - Target Language: ${targetLang}
        
        Only return the translated string.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt
      });

      res.json({
        translatedText: response.text || text,
        detectedLanguage: "en",
        usingLocalFallback: false
      });
      return;
    } catch (err: any) {
      console.log("ℹ️ [Gemini Client] Local fallback simulation active (Translator).");
    }
  }

  // Fallback translators for common languages
  let translatedText = text;
  const langUpper = targetLang.toUpperCase();

  if (langUpper.includes("SPANISH") || langUpper === "ES") {
    translatedText = `[ESPAÑOL Fallback]\n${text
      .replace(/Estimated Time/g, "Tiempo Estimado")
      .replace(/Congestion/g, "Congestión")
      .replace(/Navigational Steps/g, "Pasos de Navegación")
      .replace(/Nearest restroom/g, "Baño más cercano")
      .replace(/Sustainability tip/g, "Consejo de sostenibilidad")}`;
  } else if (langUpper.includes("FRENCH") || langUpper === "FR") {
    translatedText = `[FRANÇAIS Fallback]\n${text
      .replace(/Estimated Time/g, "Temps Estimé")
      .replace(/Congestion/g, "Congestion")
      .replace(/Navigational Steps/g, "Étapes de Navigation")
      .replace(/Nearest restroom/g, "Toilettes les plus proches")
      .replace(/Sustainability tip/g, "Conseil écologie")}`;
  } else if (langUpper.includes("PORTUGUESE") || langUpper === "PT") {
    translatedText = `[PORTUGUÊS Fallback]\n${text
      .replace(/Estimated Time/g, "Tempo Estimado")
      .replace(/Congestion/g, "Congestionamento")
      .replace(/Navigational Steps/g, "Passos de Navegação")
      .replace(/Nearest restroom/g, "Banheiro mais próximo")
      .replace(/Sustainability tip/g, "Dica de sustentabilidade")}`;
  } else if (langUpper.includes("ARABIC") || langUpper === "AR") {
    translatedText = `[العربية Fallback]\n${text
      .replace(/Estimated Time/g, "الوقت المتوقع")
      .replace(/Congestion/g, "الازدحام")
      .replace(/Nearest restroom/g, "أقرب دورة مياه")}`;
  } else if (langUpper.includes("HINDI") || langUpper === "HI") {
    translatedText = `[हिन्दी Fallback]\n${text
      .replace(/Estimated Time/g, "अनुमानित समय")
      .replace(/Congestion/g, "भीड़")
      .replace(/Nearest restroom/g, "निकटतम शौचालय")}`;
  }

  res.json({
    translatedText,
    detectedLanguage: "en",
    usingLocalFallback: true
  });
});

// 7. Grounded Smart Q&A
app.post('/api/qa', async (req, res) => {
  const { question } = req.body;
  if (!question) {
    res.status(400).json({ error: "Missing question." });
    return;
  }

  const ai = getGeminiClient();

  if (ai) {
    try {
      const prompt = `
        You are an intelligent AI Stadium Concierge desk for the FIFA World Cup 2026.
        Answering a fan question strictly grounded in the official stadium rules and facilities below:
        
        STADIUM KNOWLEDGE RESOURCE:
        ${STADIUM_RULES_GROUNDING}
        
        STADIUM FACILITIES:
        ${NYNJ_STADIUM_FACILITIES.map(f => `- ${f.name} (Type: ${f.type}): ${f.description}. Located at: ${f.location}`).join('\n')}
        
        Fan Question: "${question}"
        
        Provide a polite, accurate, and direct answer based ONLY on the stadium knowledge.
        If the answer is not mentioned in the stadium knowledge resource, politely state that you can only provide information about the stadium rules and facilities, but give a general helpful guess.
        Keep the response clear, visually clean, and under 100 words.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt
      });

      res.json({
        answer: response.text || "I apologize, I could not generate an answer at this time.",
        groundingSources: ["Official FIFA 2026 Stadium Grounding ruleset", "NYNJ Facilities Directory"],
        usingLocalFallback: false
      });
      return;
    } catch (err: any) {
      console.log("ℹ️ [Gemini Client] Local fallback simulation active (Concierge Q&A).");
    }
  }

  // High-fidelity fallback logic for common Q&A queries
  let answer = "I apologize, but that specific facility is not listed in my local stadium database. However, most stadium sectors feature information desks. Please contact the nearest volunteer steward or visit the Main command center at Sector 100 for immediate assistance.";
  const qClean = question.toLowerCase();

  if (qClean.includes("gate c")) {
    answer = "Gate C (South Entrance) is located at the South Concourse, Ground Level. It is currently operating with a moderate congestion level (65%), and has an estimated queue wait time of 18 minutes. It's close to Parking Lot C. Please note: this entrance does not feature a dedicated ADA ramp; wheelchair users should prefer Gate B or Gate D.";
  } else if (qClean.includes("messi") || qClean.includes("merchandise") || qClean.includes("merch") || qClean.includes("store")) {
    answer = "Official Messi & FIFA World Cup merchandise can be purchased at the **FIFA Official Megastore** in the East Concourse Plaza near Gate B. It features jersey customization services. Note: It is currently very crowded (90% congestion) with a 22-minute queue. An express alternative is the **World Cup Merchandise Kiosk** on North Concourse Level 2.";
  } else if (qClean.includes("recharge") || qClean.includes("charge") || qClean.includes("power bank") || qClean.includes("powerbank")) {
    answer = "Under FIFA World Cup 2026 Stadium Rules, small portable power banks are **fully permitted** inside the stadium as long as they fit in your pocket or clutch bag (maximum size 4.5\" x 6.5\"). Charging stations are located near all major food venues, including **World Cup Brews Cafe** at Section 104 and the **Megastore Lounge** at East Concourse.";
  } else if (qClean.includes("restroom") || qClean.includes("bathroom") || qClean.includes("toilet")) {
    answer = "Wheelchair-accessible restrooms are located on all concourses: **Restroom N1** (North Concourse Section 110), **Restroom E2** (East Concourse Section 124), **Restroom S1** (South Concourse Section 136), and **Restroom W1** (West Concourse Section 102). W1 features private family-friendly cabins and fully-automated ADA assistance doors.";
  } else if (qClean.includes("water") || qClean.includes("refill") || qClean.includes("eco") || qClean.includes("drink")) {
    answer = "Free cold drinking water refill stations are placed at **ECO Refill Station North** (near Section 111) and **ECO Refill Station South** (near Section 135). You can bring reusable bottles, but they **must be empty** upon entry through security checkpoints.";
  } else if (qClean.includes("bag") || qClean.includes("clear") || qClean.includes("rules")) {
    answer = "All bags must be clear plastic, vinyl, or PVC, and must not exceed 12\" x 6\" x 12\" in dimensions. Small non-transparent clutch bags (4.5\" x 6.5\" maximum) are allowed. Bags exceeding these specifications will be denied entry, and the stadium does not provide secure bag-storage lockers.";
  }

  res.json({
    answer,
    groundingSources: ["Local Stadium Rules Database (Offline)"],
    usingLocalFallback: true
  });
});

// 8. AI Dashboards (Volunteer & Organizer summaries)
app.post('/api/insights', async (req, res) => {
  const { dashboardType } = req.body;
  
  // Check memory cache first
  const now = Date.now();
  if (dashboardType && cachedInsights[dashboardType] && (now - cachedInsights[dashboardType].timestamp < INSIGHTS_CACHE_TTL_MS)) {
    res.json({
      insights: cachedInsights[dashboardType].data,
      usingCachedAI: true,
      usingLocalFallback: false
    });
    return;
  }

  const ai = getGeminiClient();

  const reportsSummary = activeEmergencies.map(e => `[${e.type.toUpperCase()}] at ${e.location} - Status: ${e.status}, Alert Level: ${e.alertLevel}`).join('\n');
  const crowdSummary = NYNJ_STADIUM_CROWD_ZONES.map(z => `${z.name}: Congestion ${z.currentCongestion}% (${z.trend})`).join('\n');

  if (ai) {
    try {
      let prompt = "";
      if (dashboardType === 'organizer') {
        prompt = `
          You are the Chief Operations Director for FIFA World Cup 2026 NYNJ Stadium.
          We have the following live operations metrics:
          
          CROWD DENSITY TRACKING:
          ${crowdSummary}
          
          ACTIVE INCIDENT REPORTS:
          ${reportsSummary}
          
          Generate a high-level operational brief for the Stadium Committee.
          Return exactly a JSON object conforming to this schema:
          {
            "liveSummary": "1-paragraph summary of the current stadium operation health and trends.",
            "riskAnalysis": "1-paragraph assessment of risk vectors (crowd bottle-necks, unresolved emergencies, traffic delays).",
            "recommendedActions": [
              "Action 1 for security command...",
              "Action 2 for crowd stewards...",
              "Action 3 for transport dispatch..."
            ],
            "resourceAllocation": {
              "securityStaff": 820,
              "volunteers": 1250,
              "medicalTeams": 45
            }
          }
          Return ONLY valid JSON.
        `;
      } else {
        // Volunteer
        prompt = `
          You are the Chief Volunteer Coordinator for FIFA World Cup 2026.
          We have these active metrics:
          
          CROWD ZONES:
          ${crowdSummary}
          
          PENDING HELP REQUESTS / INCIDENTS:
          ${reportsSummary}
          
          Generate a daily shift briefing for volunteers.
          Return exactly a JSON object conforming to this schema:
          {
            "liveSummary": "1-paragraph of motivating and practical shift focus (e.g. key arrival flow, weather concerns).",
            "riskAnalysis": "1-paragraph describing key crowd sectors that need customer support or wheelchair escorts.",
            "recommendedActions": [
              "Task 1: Assist at Gate B ramp...",
              "Task 2: Distribute water refills at South Concourse...",
              "Task 3: Direct lost fans at North Terminal..."
            ],
            "resourceAllocation": {
              "securityStaff": 100, // Volunteers on security liaison
              "volunteers": 450, // Active concourse guides
              "medicalTeams": 20 // Volunteers assisting medical stations
            }
          }
          Return ONLY valid JSON.
        `;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      let responseText = response.text || "{}";
      const parsed = safeParseJSON(responseText);

      const responseData = {
        liveSummary: parsed.liveSummary,
        riskAnalysis: parsed.riskAnalysis,
        recommendedActions: parsed.recommendedActions,
        resourceAllocation: parsed.resourceAllocation,
        timestamp: new Date().toISOString()
      };

      // Store in memory cache
      if (dashboardType) {
        cachedInsights[dashboardType] = {
          data: responseData,
          timestamp: now
        };
      }

      res.json({
        insights: responseData,
        usingLocalFallback: false
      });
      return;
    } catch (err: any) {
      console.log("ℹ️ [Gemini Client] Local fallback simulation active (Dashboard Insights).");
    }
  }

  // Fallback dashboard briefings
  let insights: DashboardInsights;

  if (dashboardType === 'organizer') {
    insights = {
      liveSummary: "NYNJ Stadium is in high operational tempo. Total attendance stands at 79,200 (96% of capacity). Gate entries have progressed securely, but traffic congestion remains elevated around the North Concourse. General flow indicators show safe capacity bounds across most seating bowls, but pre-match queues are bottlenecking near official retail venues.",
      riskAnalysis: "High Risk of localized stampedes or crushing near the North Concourse and Gate A, where current density is 85% with an upward trend. Secondary risk stems from the unresolved unattended package report near Gate A. Transit delays at the North Terminal are delaying transit shuttles by 8-12 minutes.",
      recommendedActions: [
        "Instruct Gate B stewards to initiate flow diversion, re-directing new arrivals to the less congested South concourse routes.",
        "Secure the 10-meter perimeter around Gate A ticket scanner bar and dispatch Security Patrol Delta for parcel inspection.",
        "Request Metro Rail coordinators to run two additional peak-hour express train loops to evacuate early crowds post-match."
      ],
      resourceAllocation: {
        securityStaff: 850,
        volunteers: 1300,
        medicalTeams: 50
      },
      timestamp: new Date().toISOString()
    };
  } else {
    // Volunteer shift brief
    insights = {
      liveSummary: "Welcome to Shift 3! We are helping manage NYNJ Stadium under high energy. Our focus today is outstanding hospitality, accessibility support, and rapid incident reporting. With temperatures climbing, we are emphasizing hydration awareness. Be sure to remind fans of our free ECO water refill stations!",
      riskAnalysis: "North Concourse Section 112 is experiencing peak crowd flow. Volunteers stationed here must maintain clear emergency lane routes. Wheelchair users are reporting minor delays near the Section 124 elevators due to general fans blocking access; we need dedicated guides to manage elevator queues.",
      recommendedActions: [
        "Deploy 5 bilingual volunteers to Gate B ramp to assist fans needing physical or language assistance.",
        "Assign 4 sustainability stewards to the East Plaza Smart Recycling bins to assist fans with waste sorting rewards.",
        "Check that all First Aid routes near Section 114 and 132 are fully unobstructed by vendor queues."
      ],
      resourceAllocation: {
        securityStaff: 120, // Liaison guides
        volunteers: 510, // Active shift volunteers
        medicalTeams: 35 // Assisting medics
      },
      timestamp: new Date().toISOString()
    };
  }

  res.json({
    insights,
    usingLocalFallback: true
  });
});


// ----------------- VITE DEVELOPMENT MIDDLEWARE / PRODUCTION ASSETS Serving -----------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Serve client index.html for SPA fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Stadium Operations Server listening on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
  });
}

startServer();
