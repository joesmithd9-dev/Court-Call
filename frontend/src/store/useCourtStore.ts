import { create } from 'zustand';
import type { Matter, MatterStatus, CourtDayState, CourtStatus } from '../lib/types.js';
import { auditLog } from '../lib/audit.js';

// ─── Demo Data ──────────────────────────────────────────────────────────────

const DEMO_MATTERS: Matter[] = [
  { id: '1', position: 1, title: 'DPP v Thomas Murphy', titlePublic: 'DPP v Murphy', caseReference: 'MNG-2026-041', matterType: 'Hearing', estimatedMinutes: 15, status: 'HEARING', predictedStart: null, calledAt: '10:28', actualStartTime: '2026-04-07T10:30:00Z', actualEndTime: null, isReady: true, isPresent: true, publicNote: 'Arraignment', privacyLevel: 'public', parties: 'DPP / Murphy', counselNames: ['Mr. Brennan SC', 'Ms. Daly BL'] },
  { id: '2', position: 2, title: 'DPP v Patricia Byrne', titlePublic: 'DPP v Byrne', caseReference: 'MNG-2026-055', matterType: 'Bail', estimatedMinutes: 10, status: 'PENDING', predictedStart: '10:45', calledAt: null, actualStartTime: null, actualEndTime: null, isReady: true, isPresent: true, publicNote: 'Bail application', privacyLevel: 'public', parties: 'DPP / Byrne', counselNames: ['Ms. Nolan BL'] },
  { id: '3', position: 3, title: 'Margaret Smith v Robert Jones', titlePublic: 'Smith v Jones', caseReference: 'MNG-2026-078', matterType: 'Hearing', estimatedMinutes: 30, status: 'PENDING', predictedStart: '10:55', calledAt: null, actualStartTime: null, actualEndTime: null, isReady: true, isPresent: true, publicNote: null, privacyLevel: 'public', parties: 'Smith / Jones', counselNames: ['Mr. Walsh SC', 'Mr. Healy BL'] },
  { id: '4', position: 4, title: 'DPP v Sean O\'Brien', titlePublic: 'DPP v O\'Brien', caseReference: 'MNG-2026-032', matterType: 'Sentence', estimatedMinutes: 20, status: 'PENDING', predictedStart: '11:25', calledAt: null, actualStartTime: null, actualEndTime: null, isReady: false, isPresent: true, publicNote: 'Sentencing — s.15 Misuse of Drugs Act', privacyLevel: 'public', parties: 'DPP / O\'Brien', counselNames: [] },
  { id: '5', position: 5, title: 'In the matter of a Ward of Court (Minor)', titlePublic: 'Wardship Application', caseReference: 'MNG-2026-WC-003', matterType: 'Motion', estimatedMinutes: 45, status: 'PENDING', predictedStart: '11:45', calledAt: null, actualStartTime: null, actualEndTime: null, isReady: true, isPresent: true, publicNote: null, privacyLevel: 'restricted', parties: null, counselNames: ['Ms. Murray SC'] },
  { id: '6', position: 6, title: 'DPP v Ciara Gallagher', titlePublic: 'DPP v Gallagher', caseReference: 'MNG-2026-061', matterType: 'Mention', estimatedMinutes: 5, status: 'PENDING', predictedStart: '12:30', calledAt: null, actualStartTime: null, actualEndTime: null, isReady: true, isPresent: true, publicNote: 'Bench warrant check', privacyLevel: 'public', parties: 'DPP / Gallagher', counselNames: [] },
  { id: '7', position: 7, title: 'Re: Family Law Proceedings (Confidential)', titlePublic: 'Family Law Application', caseReference: 'MNG-2026-FL-019', matterType: 'Directions', estimatedMinutes: 15, status: 'PENDING', predictedStart: '12:35', calledAt: null, actualStartTime: null, actualEndTime: null, isReady: true, isPresent: false, publicNote: null, privacyLevel: 'sealed', parties: null, counselNames: [] },
  { id: '8', position: 8, title: 'ACC Bank v Liam Doyle', titlePublic: 'ACC Bank v Doyle', caseReference: 'MNG-2026-CC-044', matterType: 'Consent', estimatedMinutes: 5, status: 'PENDING', predictedStart: '12:50', calledAt: null, actualStartTime: null, actualEndTime: null, isReady: true, isPresent: true, publicNote: 'Consent order — strike out', privacyLevel: 'public', parties: 'ACC Bank / Doyle', counselNames: [] },
  { id: '9', position: 9, title: 'DPP v Michael Connolly', titlePublic: 'DPP v Connolly', caseReference: 'MNG-2026-045', matterType: 'Hearing', estimatedMinutes: 60, status: 'PENDING', predictedStart: '12:55', calledAt: null, actualStartTime: null, actualEndTime: null, isReady: false, isPresent: false, publicNote: 'Contested hearing — Road Traffic Act', privacyLevel: 'public', parties: 'DPP / Connolly', counselNames: ['Mr. Reilly BL', 'Ms. Quinn BL'] },
  { id: '10', position: 10, title: 'Kelly v Monaghan County Council', titlePublic: 'Kelly v MCC', caseReference: 'MNG-2026-CC-051', matterType: 'Motion', estimatedMinutes: 20, status: 'UNANSWERED', predictedStart: null, calledAt: '10:12', actualStartTime: null, actualEndTime: null, isReady: false, isPresent: false, publicNote: 'Discovery motion', privacyLevel: 'public', parties: 'Kelly / MCC', counselNames: [] },
  { id: '11', position: 11, title: 'DPP v Fiona Maguire', titlePublic: 'DPP v Maguire', caseReference: 'MNG-2026-072', matterType: 'Mention', estimatedMinutes: 5, status: 'UNANSWERED', predictedStart: null, calledAt: '10:15', actualStartTime: null, actualEndTime: null, isReady: false, isPresent: false, publicNote: null, privacyLevel: 'public', parties: 'DPP / Maguire', counselNames: [] },
  { id: '12', position: 12, title: 'DPP v Brendan Tierney', titlePublic: 'DPP v Tierney', caseReference: 'MNG-2026-088', matterType: 'Bail', estimatedMinutes: 10, status: 'CONCLUDED', predictedStart: null, calledAt: '10:05', actualStartTime: '2026-04-07T10:05:00Z', actualEndTime: '2026-04-07T10:18:00Z', isReady: true, isPresent: true, publicNote: 'Bail granted — conditions applied', privacyLevel: 'public', parties: 'DPP / Tierney', counselNames: ['Mr. Flynn BL'] },
];

const DEMO_COURT: CourtDayState = {
  id: 'demo-court-day-1',
  courtName: 'District Court No. 1 — Monaghan',
  judgeName: 'Judge McBride',
  date: new Date().toISOString().split('T')[0],
  status: 'LIVE',
  lastSequence: 14,
};

// ─── Store ──────────────────────────────────────────────────────────────────

interface CourtStore {
  court: CourtDayState;
  matters: Matter[];

  // ── Selectors ──
  activeMatter: () => Matter | null;
  pendingMatters: () => Matter[];
  unansweredMatters: () => Matter[];
  concludedMatters: () => Matter[];
  nextMatters: () => Matter[];
  mattersByType: () => Record<string, Matter[]>;
  mattersByDuration: () => Record<string, Matter[]>;
  gapFillerMatters: (maxMinutes: number) => Matter[];

  // ── Mutations ──
  startMatter: (id: string) => void;
  concludeMatter: (id: string) => void;
  adjournMatter: (id: string) => void;
  letStandMatter: (id: string) => void;
  callMatter: (id: string) => void;
  markUnanswered: (id: string) => void;
  addTime: (id: string, minutes: number) => void;
  setReady: (id: string, ready: boolean) => void;
  setPresent: (id: string, present: boolean) => void;
  setDuration: (id: string, minutes: number) => void;
  reorderMatter: (id: string, newPosition: number) => void;
  startNext: () => void;
  emergencyRecess: () => void;
  judgeRose: () => void;
  atLunch: () => void;
  resumeCourt: () => void;
  concludeDay: () => void;

  // ── Status updater ──
  updateMatterStatus: (id: string, status: MatterStatus) => void;
  updateCourtStatus: (status: CourtStatus) => void;
}

export const useCourtStore = create<CourtStore>((set, get) => ({
  court: DEMO_COURT,
  matters: DEMO_MATTERS,

  // ── Selectors ──────────────────────────────────────────────────────────

  activeMatter: () => {
    const m = get().matters;
    return m.find(x => x.status === 'HEARING') ?? m.find(x => x.status === 'CALLING') ?? null;
  },

  pendingMatters: () =>
    get().matters
      .filter(x => x.status === 'PENDING' || x.status === 'NOT_BEFORE' || x.status === 'LET_STAND')
      .sort((a, b) => a.position - b.position),

  unansweredMatters: () =>
    get().matters.filter(x => x.status === 'UNANSWERED').sort((a, b) => a.position - b.position),

  concludedMatters: () =>
    get().matters.filter(x => x.status === 'CONCLUDED' || x.status === 'ADJOURNED').sort((a, b) => a.position - b.position),

  nextMatters: () =>
    get().matters
      .filter(x => x.status === 'PENDING')
      .sort((a, b) => a.position - b.position)
      .slice(0, 5),

  mattersByType: () => {
    const groups: Record<string, Matter[]> = {};
    for (const m of get().matters.filter(x => x.status !== 'UNANSWERED' && x.status !== 'CONCLUDED' && x.status !== 'ADJOURNED')) {
      (groups[m.matterType] ??= []).push(m);
    }
    return groups;
  },

  mattersByDuration: () => {
    const buckets: Record<string, Matter[]> = { '≤5m': [], '6–10m': [], '11–20m': [], '21–30m': [], '>30m': [] };
    for (const m of get().matters.filter(x => x.status !== 'UNANSWERED' && x.status !== 'CONCLUDED' && x.status !== 'ADJOURNED')) {
      const d = m.estimatedMinutes;
      if (d <= 5) buckets['≤5m'].push(m);
      else if (d <= 10) buckets['6–10m'].push(m);
      else if (d <= 20) buckets['11–20m'].push(m);
      else if (d <= 30) buckets['21–30m'].push(m);
      else buckets['>30m'].push(m);
    }
    return buckets;
  },

  gapFillerMatters: (maxMinutes: number) =>
    get().matters
      .filter(x => x.status === 'PENDING' && x.estimatedMinutes <= maxMinutes)
      .sort((a, b) => a.estimatedMinutes - b.estimatedMinutes),

  // ── Mutations ─────────────────────────────────────────────────────────

  updateMatterStatus: (id, status) => {
    auditLog('MATTER_STATUS_CHANGE', { matterId: id, newStatus: status });
    set(s => ({
      matters: s.matters.map(m => m.id === id ? { ...m, status } : m),
    }));
  },

  updateCourtStatus: (status) => {
    auditLog('COURT_STATUS_CHANGE', { newStatus: status });
    set(s => ({ court: { ...s.court, status } }));
  },

  startMatter: (id) => {
    const current = get().activeMatter();
    auditLog('START_MATTER', { matterId: id, previousActive: current?.id ?? null });
    set(s => ({
      matters: s.matters.map(m => {
        if (m.id === id) return { ...m, status: 'HEARING' as MatterStatus, actualStartTime: new Date().toISOString(), calledAt: m.calledAt ?? new Date().toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }) };
        if (m.status === 'HEARING' || m.status === 'CALLING') return { ...m, status: 'CONCLUDED' as MatterStatus, actualEndTime: new Date().toISOString() };
        return m;
      }),
    }));
  },

  concludeMatter: (id) => {
    auditLog('CONCLUDE_MATTER', { matterId: id });
    set(s => ({
      matters: s.matters.map(m => m.id === id ? { ...m, status: 'CONCLUDED' as MatterStatus, actualEndTime: new Date().toISOString() } : m),
    }));
  },

  adjournMatter: (id) => {
    auditLog('ADJOURN_MATTER', { matterId: id });
    set(s => ({
      matters: s.matters.map(m => m.id === id ? { ...m, status: 'ADJOURNED' as MatterStatus, actualEndTime: new Date().toISOString() } : m),
    }));
  },

  letStandMatter: (id) => {
    auditLog('LET_STAND_MATTER', { matterId: id });
    set(s => ({
      matters: s.matters.map(m => m.id === id ? { ...m, status: 'LET_STAND' as MatterStatus } : m),
    }));
  },

  callMatter: (id) => {
    auditLog('CALL_MATTER', { matterId: id });
    set(s => ({
      matters: s.matters.map(m => m.id === id ? { ...m, status: 'CALLING' as MatterStatus, calledAt: new Date().toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }) } : m),
    }));
  },

  markUnanswered: (id) => {
    auditLog('MARK_UNANSWERED', { matterId: id });
    set(s => ({
      matters: s.matters.map(m => m.id === id ? { ...m, status: 'UNANSWERED' as MatterStatus } : m),
    }));
  },

  addTime: (id, minutes) => {
    auditLog('ADD_TIME', { matterId: id, minutes });
    set(s => ({
      matters: s.matters.map(m => m.id === id ? { ...m, estimatedMinutes: m.estimatedMinutes + minutes } : m),
    }));
  },

  setReady: (id, ready) => {
    auditLog('SET_READY', { matterId: id, ready });
    set(s => ({
      matters: s.matters.map(m => m.id === id ? { ...m, isReady: ready } : m),
    }));
  },

  setPresent: (id, present) => {
    auditLog('SET_PRESENT', { matterId: id, present });
    set(s => ({
      matters: s.matters.map(m => m.id === id ? { ...m, isPresent: present } : m),
    }));
  },

  setDuration: (id, minutes) => {
    auditLog('SET_DURATION', { matterId: id, minutes });
    set(s => ({
      matters: s.matters.map(m => m.id === id ? { ...m, estimatedMinutes: minutes } : m),
    }));
  },

  reorderMatter: (id, newPosition) => {
    auditLog('REORDER_MATTER', { matterId: id, newPosition });
    set(s => {
      const matters = [...s.matters];
      const idx = matters.findIndex(m => m.id === id);
      if (idx === -1) return s;
      const [item] = matters.splice(idx, 1);
      item.position = newPosition;
      // Reindex positions
      matters.splice(newPosition - 1, 0, item);
      return { matters: matters.map((m, i) => ({ ...m, position: i + 1 })) };
    });
  },

  startNext: () => {
    const next = get().pendingMatters()[0];
    if (next) get().startMatter(next.id);
  },

  emergencyRecess: () => {
    auditLog('EMERGENCY_RECESS', { courtId: get().court.id });
    set(s => ({
      court: { ...s.court, status: 'PAUSED' as CourtStatus },
      matters: s.matters.map(m =>
        m.status === 'HEARING' || m.status === 'CALLING'
          ? { ...m, status: 'PENDING' as MatterStatus, actualStartTime: null, actualEndTime: null }
          : m
      ),
    }));
  },

  judgeRose: () => {
    auditLog('JUDGE_ROSE', { courtId: get().court.id });
    set(s => ({ court: { ...s.court, status: 'JUDGE_ROSE' as CourtStatus } }));
  },

  atLunch: () => {
    auditLog('AT_LUNCH', { courtId: get().court.id });
    set(s => ({ court: { ...s.court, status: 'AT_LUNCH' as CourtStatus } }));
  },

  resumeCourt: () => {
    auditLog('RESUME_COURT', { courtId: get().court.id });
    set(s => ({ court: { ...s.court, status: 'LIVE' as CourtStatus } }));
  },

  concludeDay: () => {
    auditLog('CONCLUDE_DAY', { courtId: get().court.id });
    set(s => ({ court: { ...s.court, status: 'CONCLUDED' as CourtStatus } }));
  },
}));
