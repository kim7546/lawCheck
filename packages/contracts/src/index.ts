export interface HealthResponse {
  success: true;
  data: { service: 'lawcheck-api'; status: 'ok'; mode: 'prototype' };
}

export type ExpertGroupCode = string;
export interface AdminIdentity {
  id: string;
  name: string;
  email: string;
  username: string | null;
}
export interface AdminUser extends AdminIdentity {
  expertGroup: string | null;
  expertCode: { name: string } | null;
  plan: string;
  planCode: { name: string };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  adminProfile: { isActive: boolean } | null;
  lawyerProfile: { officeName: string | null } | null;
}
export interface AdminUsersPage {
  items: AdminUser[];
  total: number;
  page: number;
}
export const questionTopics = [
  { code: 'realEstate', label: '부동산·임대차' },
  { code: 'labor', label: '노동·직장' },
  { code: 'money', label: '민사·금전' },
  { code: 'family', label: '가사·생활' },
  { code: 'criminal', label: '형사·범죄' },
  { code: 'business', label: '사업·세무' },
  { code: 'other', label: '기타·미분류' },
  { code: 'nonLegal', label: '비법률 질문' },
] as const;
export type QuestionTopic = (typeof questionTopics)[number]['code'];
export interface AdminQuestionPeriod {
  startDate: string;
  endDate: string;
}
export interface AdminQuestion {
  id: string;
  content: string;
  createdAt: string;
  processingStatus: 'RECEIVED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  topic: QuestionTopic;
  answers: {
    id: string;
    content: string;
    createdAt: string;
    kind: 'AI' | 'NOTICE' | 'EXPERT';
    author: string;
  }[];
}
export interface AdminQuestionsPage extends AdminQuestionPeriod {
  items: AdminQuestion[];
  total: number;
  page: number;
  pageSize: number;
}
export interface AdminQuestionStatistics extends AdminQuestionPeriod {
  total: number;
  topics: { topic: QuestionTopic; count: number; percentage: number }[];
}
export interface BoMenuRecord {
  key: 'dashboard' | 'reviews' | 'community' | 'codes';
  label: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}
export interface AdminSummary {
  days: number;
  since: string;
  generatedAt: string;
  questions: number;
  requests: number;
  verified: number;
  waiting: number;
  reviewing: number;
  overdue: number;
  completedAnswers: number;
  selectedAnswers: number;
  completionRate: number | null;
  selectionRate: number | null;
  averageHours: number | null;
  activeExperts: number;
  daily: { date: string; questions: number; requests: number; verified: number }[];
  experts: {
    id: string;
    name: string;
    group: string;
    reviewing: number;
    completed: number;
    selected: number;
  }[];
}
export interface CommonCodeRecord {
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}
export type OfficeConsentKind = 'TERMS' | 'PRIVACY' | 'EXPERT_POLICY';
export interface OfficeSignupConsent {
  expertGroup: ExpertGroupCode;
  consents: { kind: OfficeConsentKind; version: string; accepted: true }[];
}
export interface OfficeSignupPolicy {
  officeGroup: ExpertGroupCode;
  groups: { code: ExpertGroupCode; name: string; signupEnabled: boolean }[];
  agreements: { kind: OfficeConsentKind; version: string; title: string; paragraphs: string[] }[];
}

export interface PublicConfig {
  officeName: string;
  mode: 'prototype';
  maxQuestions: number;
  questionLimitEnabled: boolean;
  remainingQuestions?: number | null;
}

export interface ChatTurn {
  answerMessageId?: string;
  id: string;
  question: string;
  answer: string;
  requested: boolean;
  isLegalQuestion?: boolean;
  status?: 'pending' | 'complete' | 'error';
}

export interface ChatRequest {
  question: string;
  history: { question: string; answer: string }[];
}

export interface ChatAnswer {
  answer: string;
  isLegalQuestion: boolean;
}

export type ChatResponse =
  | {
      success: true;
      data: ChatAnswer & {
        remainingQuestions?: number | null;
        answerMessageId?: string;
        sessionId?: string;
      };
    }
  | { success: false; error: { code: string; message: string } };
