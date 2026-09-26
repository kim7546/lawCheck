import type { BoMenuRecord } from '@lawcheck/contracts';
export const boMenus: BoMenuRecord[] = [
  {
    key: 'dashboard',
    label: '대시보드',
    sortOrder: 10,
    isActive: true,
    updatedAt: '2026-09-26T00:00:00Z',
  },
  {
    key: 'reviews',
    label: '검증요청 게시판',
    sortOrder: 20,
    isActive: true,
    updatedAt: '2026-09-26T00:00:00Z',
  },
  {
    key: 'community',
    label: '커뮤니티',
    sortOrder: 30,
    isActive: true,
    updatedAt: '2026-09-26T00:00:00Z',
  },
  {
    key: 'codes',
    label: '공통 코드 관리',
    sortOrder: 40,
    isActive: true,
    updatedAt: '2026-09-26T00:00:00Z',
  },
];
