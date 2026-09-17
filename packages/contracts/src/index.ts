export interface HealthResponse {
  success: true;
  data: { service: 'lawcheck-api'; status: 'ok'; mode: 'prototype' };
}

export interface PublicConfig {
  officeName: string;
  mode: 'prototype';
  maxQuestions: number;
}

export interface ChatTurn {
  id: string;
  question: string;
  answer: string;
  requested: boolean;
}
