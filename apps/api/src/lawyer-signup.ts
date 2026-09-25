import { ChatError } from './chat.js';

const fail = (message: string) => new ChatError(400, 'INVALID_LAWYER_SIGNUP', message);
const BETA_SIGNUP_CODE = '1004';
function required(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw fail(`${label} 항목을 1~${max}자로 입력해 주세요.`);
  return value.trim();
}
function optional(value: unknown, label: string, max: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > max)
    throw fail(`${label} 항목은 ${max}자 이내로 입력해 주세요.`);
  return value.trim() || null;
}
export function validateLawyerSignup(body: Record<string, unknown>) {
  const betaSignupCode =
    typeof body.betaSignupCode === 'string' && body.betaSignupCode.length <= 100
      ? body.betaSignupCode.trim()
      : '';
  if (betaSignupCode !== BETA_SIGNUP_CODE)
    throw new ChatError(400, 'INVALID_BETA_SIGNUP_CODE', '클로즈 베타 가입코드를 확인해 주세요.');
  const username = required(body.username, '아이디', 30).toLowerCase();
  if (!/^[a-z][a-z0-9_]{3,29}$/.test(username))
    throw fail('아이디는 영문으로 시작하는 영문·숫자·밑줄 4~30자로 입력해 주세요.');
  if (typeof body.passwordConfirmation !== 'string' || body.passwordConfirmation !== body.password)
    throw fail('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
  if (
    body.lawyerProfile != null &&
    (typeof body.lawyerProfile !== 'object' || Array.isArray(body.lawyerProfile))
  )
    throw fail('변호사 가입 정보를 입력해 주세요.');
  const profile = (body.lawyerProfile ?? {}) as Record<string, unknown>;
  if (body.lawyerIdImage !== undefined || profile.idImage !== undefined)
    throw fail('변호사 신분증 이미지 업로드는 아직 지원하지 않습니다.');
  const mobilePhone = optional(profile.mobilePhone, '휴대전화', 20)?.replace(/[ ()-]/g, '') ?? null;
  const officePhone = optional(profile.officePhone, '대표전화', 20)?.replace(/[ ()-]/g, '') ?? null;
  if (mobilePhone !== null && !/^(010\d{8}|01[16789]\d{7,8})$/.test(mobilePhone))
    throw fail('휴대전화 번호를 확인해 주세요. 예: 010-1234-5678');
  if (officePhone !== null && !/^(0\d{8,10}|1\d{7})$/.test(officePhone))
    throw fail('대표전화 번호를 확인해 주세요. 예: 02-1234-5678');
  const details = {
    mobilePhone,
    registrationNumber: optional(profile.registrationNumber, '변호사 등록 번호', 50),
    issueNumber: optional(profile.issueNumber, '발급번호', 100),
    officeName: optional(profile.officeName, '소속 법무법인/사무소명', 200),
    address: optional(profile.address, '주소', 500),
    officePhone,
  };
  return {
    username,
    betaSignupCode,
    profile: details,
  };
}
