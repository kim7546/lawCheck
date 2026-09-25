import { officeSignupPolicy as documents } from '../apps/api/src/signup-policy';
export const officeSignupPolicy = {
  ...documents,
  groups: [
    { code: 'LAWYER', name: '변호사', signupEnabled: true },
    { code: 'LABOR_ATTORNEY', name: '노무사', signupEnabled: false },
    { code: 'PATENT_ATTORNEY', name: '변리사', signupEnabled: false },
    { code: 'TAX_ACCOUNTANT', name: '세무사', signupEnabled: false },
  ],
};
