export interface HealthResponse {
  success: true;
  data: { service: 'lawcheck-api'; status: 'ok'; mode: 'prototype' };
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
