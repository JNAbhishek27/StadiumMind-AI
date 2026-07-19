export type FacilityType = 'gate' | 'food' | 'restroom' | 'emergency' | 'transport' | 'sustainability' | 'merchandise';

export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  location: string; // E.g., "Level 1, Section 112", "Gate B Outer"
  coordinates: [number, number]; // [x, y] for custom stadium blueprint or [lat, lng] for Map
  description: string;
  congestionScore: number; // 0 - 100
  accessibilityRoute: boolean;
  nearestRestroom: string;
  estimatedQueueTime: number; // minutes
}

export interface RouteRequest {
  from: string;
  to: string;
  accessibilityRequired: boolean;
}

export interface RouteResponse {
  steps: string[];
  walkingTime: number; // minutes
  congestionScore: number;
  accessibilityRoute: boolean;
  nearestRestroom: string;
  directionsText: string;
  aiExplanation: string;
}

export interface CrowdZone {
  id: string;
  name: string; // E.g., "North Stand", "South Gate", "East Concourse"
  coordinates: [number, number];
  currentCongestion: number; // 0 - 100
  predictedCongestion20: number;
  predictedCongestion40: number;
  predictedCongestion60: number;
  trend: 'up' | 'down' | 'stable';
  explanation: string;
}

export interface TransportOption {
  mode: 'bus' | 'metro' | 'taxi' | 'walking' | 'parking';
  name: string; // E.g., "Metro Line A", "Parking Lot C"
  status: 'normal' | 'delayed' | 'congested' | 'fast';
  durationMinutes: number;
  congestionLevel: number; // 0 - 100
  cost: string; // "Free with Ticket", "$10", etc.
  carbonSavingKg: number; // CO2 savings in kg
  recommendationReason: string;
}

export interface EmergencyReport {
  id: string;
  type: 'medical' | 'lost_child' | 'fire' | 'security';
  location: string;
  details: string;
  timestamp: string;
  status: 'pending' | 'dispatched' | 'resolved';
  nearestEmergencyPoint: string;
  recommendedAction: string;
  alertLevel: 'low' | 'medium' | 'high' | 'critical';
  alertsRaised: string[];
}

export interface SustainabilitySavings {
  refillsCount: number;
  recycledItemsCount: number;
  kilometersWalked: number;
  totalCarbonSavedKg: number;
}

export interface DashboardInsights {
  liveSummary: string;
  riskAnalysis: string;
  recommendedActions: string[];
  resourceAllocation: {
    securityStaff: number;
    volunteers: number;
    medicalTeams: number;
  };
  timestamp: string;
}

export interface SmartQAResponse {
  answer: string;
  groundingSources: string[];
}

export interface TranslationResponse {
  translatedText: string;
  detectedLanguage: string;
}
