export type MatterType =
  | 'Mention'
  | 'Bail'
  | 'Consent'
  | 'Directions'
  | 'Hearing'
  | 'Sentence'
  | 'Motion'
  | 'Other';

export type MatterStatus =
  | 'PENDING'
  | 'CALLING'
  | 'HEARING'
  | 'CONCLUDED'
  | 'UNANSWERED'
  | 'ADJOURNED'
  | 'LET_STAND'
  | 'STOOD_DOWN'
  | 'NOT_BEFORE';

export type PrivacyLevel = 'public' | 'restricted' | 'sealed';

export type CourtStatus = 'SETUP' | 'LIVE' | 'JUDGE_ROSE' | 'AT_LUNCH' | 'PAUSED' | 'CONCLUDED';

export interface Matter {
  id: string;
  position: number;
  title: string;
  titlePublic: string;
  caseReference: string | null;
  matterType: MatterType;
  estimatedMinutes: number;
  status: MatterStatus;
  predictedStart: string | null;
  calledAt: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  isReady: boolean;
  isPresent: boolean;
  publicNote: string | null;
  privacyLevel: PrivacyLevel;
  parties: string | null;
  counselNames: string[];
}

export interface CourtDayState {
  id: string;
  courtName: string;
  judgeName: string;
  date: string;
  status: CourtStatus;
  lastSequence: number;
}

export type ViewRole = 'registrar' | 'judge' | 'public';
