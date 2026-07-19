# 🏟️ FIFA World Cup 2026 Intelligent Stadium Operations Platform (NYNJ Stadium)

An intelligent, GenAI-powered full-stack stadium operations and fan experience platform designed for the FIFA World Cup 2026. This platform optimizes safety, routing, accessibility, and operational decision-making for fans, volunteers, security personnel, and tournament organizers.

---

## 🏗️ System Architecture

The platform follows a modern, full-stack, clean modular architecture:

```
                  ┌───────────────────────────────┐
                  │      Client-Side Browser      │
                  │   (React SPA, Leaflet, SVG)   │
                  └──────────────┬────────────────┘
                                 │
                   HTTP / JSON   │   REST APIs
                                 ▼
                  ┌───────────────────────────────┐
                  │      Node.js Express API      │
                  │       (server.ts Server)      │
                  └──────────────┬────────────────┘
                                 │
                 Lazy Load &     │   Secure API Proxy
                 Fallbacks       ▼
                  ┌───────────────────────────────┐
                  │     Google Gemini AI SDK      │
                  │       (gemini-3.5-flash)      │
                  └───────────────────────────────┘
```

1. **Frontend Presentation Layer (React + TS + TailwindCSS):**
   - **Interactive Stadium Blueprint (SVG):** Visualizes micro-level indoor navigation paths, gate entrances, family-friendly restrooms, sustainability bins, and active incident hotspots in high contrast.
   - **Regional Geographical Map (Leaflet.js):** Maps macro-level shuttle bus terminal delays, Metro lines, and surrounding park-and-ride lot status.
   - **Dashboard Modules:** Segmented profiles for general Fans (routing, Q&A, green logging), Volunteers (shift tasks, helper logs), and Organizers (live metrics, Recharts trends).

2. **Backend API Layer (Express + tsx):**
   - Handles secure proxy connections to the Gemini AI API, keeping secrets hidden.
   - Embeds a stateful, in-memory active emergency registry to log medical, security, fire, and lost-child reports.
   - Performs coordinate-proximity matching to automatically hook incident coordinates to localized first-aid or command tents.

3. **Intelligent Coprocessor (Google Gemini API):**
   - Uses the modern `@google/genai` TypeScript SDK and the `gemini-3.5-flash` model.
   - Powering:
     - **AI Stadium Navigator:** Translating raw coordinates into natural, step-by-step pedestrian routes.
     - **AI Crowd Prediction:** Generating operational analyses for stadium stands based on real-time crowd wave counts.
     - **AI Transport Coordinator:** Recommending multimodal commutes depending on local delays and carbon footprint scores.
     - **AI Emergency Dispatcher:** Instantly constructing fan-facing safety guidelines and operational responder plans.
     - **Smart Q&A Concierge:** Answering arbitrary stadium queries grounded in stadium rules.

---

## 🌟 Main Features

### 1. AI Stadium Navigator
Translates indoor positions into highly detailed, barrier-free routes with estimated walking times, combined congestion levels, and nearest restrooms.

### 2. AI Crowd Prediction Heatmap
Provides a graphical overlay of individual stadium grandstands and applies Gemini-based operational reasoning to describe crowd surges.

### 3. AI Transport Assistant
Analyzes surrounding parking lot capacities and public rail schedules, offering encouraging suggestions to travel sustainably.

### 4. AI Emergency Assistant
A fast, low-friction reporting module for fans to log medical concerns, fire hazards, or security alerts. Automatically mobilizes nearest support points and creates immediate safety directions.

### 5. Accessibility Assistant
Includes an **audio narration synthesizer** (utilizing the native browser Web Speech API) to speak directions aloud, a **High Contrast Mode** conforming to WCAG, and custom ADA wheelchair routing triggers.

### 6. Green Goal Sustainability Tracker
An interactive logger that counts water bottle refills, smart item recycling, and pedestrian walking distance to calculate carbon-offset scores.

### 7. Volunteer Briefing Hub
Synthesizes daily shift tasks, pending guides, and specialized team allocations based on real-time stadium metrics.

### 8. Organizer Tactical Dashboard
Empowers coordinators with graphical Recharts dashboards representing sector load indexes and facility queue times, accompanied by Gemini-generated risk assessment summaries.

### 9. Multilingual Translation
Leverages Gemini to translate directions and safety alerts on-demand into **Spanish, French, Portuguese, Hindi, or Arabic** for the international crowd.

---

## 🛠️ Tech Stack

- **Frontend:** React 19, Vite 6, Tailwind CSS, Lucide Icons, Framer Motion
- **Backend:** Node.js, Express, tsx (dev compilation)
- **AI Integration:** Google `@google/genai` (Gemini 3.5 Flash)
- **Data Visualizer:** Recharts (responsive bars & area charts)
- **Maps:** Leaflet.js (React Leaflet regional mapping)

---

## ⚙️ Environment Variables

Copy the example variables and insert your keys in `.env`:

```env
# Required for Google Gemini AI processing
GEMINI_API_KEY="AI_STUDIO_KEY_HERE"

# Required for self-referential links or callbacks
APP_URL="YOUR_CLOUD_RUN_URL"
```

---

## 🚀 Installation & Local Launch

1. **Install all packages:**
   ```bash
   npm install
   ```

2. **Run in development mode (Express server + Vite middleware):**
   ```bash
   npm run dev
   ```

3. **Compile for production:**
   ```bash
   npm run build
   ```

4. **Launch production server:**
   ```bash
   npm run start
   ```

---

## 📋 Comprehensive Testing Plan

We provide testing blueprints under `/src/testing` covering:
- **Unit Tests:** Routing calculations and facility distance-proximity logic.
- **Integration Tests:** Secure Express API endpoints and parameter validation.
- **Mock AI Tests:** Verifying robust graceful local fallback operations when the Gemini API key is missing.
- **Accessibility Tests:** Focus indicator validation and WCAG high-contrast checks.

---

## 🔮 Future Scope

- **Indoor WiFi Trilateration:** Hooking live beacon coordinates into the AI Navigator.
- **Biometric Ticketing integration:** Expediting Gate entry with face-recognition.
- **Dynamic Queue Camera Analysis:** Using Gemini 1.5/2.0 vision models to compute food line lengths on live camera feeds.

---

## 📄 License

This project is licensed under the Apache-2.0 License - see the `LICENSE` file for details.
