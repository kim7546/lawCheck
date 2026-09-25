import type { OfficeSignupPolicy } from '@lawcheck/contracts';
import { ChatError } from './chat.js';
import type { Prisma, PrismaClient } from '@prisma/client';

// Change the version whenever a document changes. Saved snapshots preserve prior wording.
export const officeSignupPolicy: Pick<OfficeSignupPolicy, 'officeGroup' | 'agreements'> = {
  officeGroup: 'LAWYER',
  agreements: [
    {
      kind: 'TERMS',
      version: '2026-09-25.1',
      title: 'Office 서비스 이용약관',
      paragraphs: [
        '1. 목적 및 서비스: 이 약관은 AI QAVER Office의 회원가입, AI 답변 검증, 커뮤니티 이용에 관한 기본 사항을 정합니다. 현재 변호사 그룹의 Free 서비스를 제공하며, 회원가입으로 유료 요금제 계약이나 자동 결제가 발생하지 않습니다.',
        '2. 가입과 계정: 회원은 본인의 정확한 이름, 이메일, 전문가 그룹을 입력하고 계정과 비밀번호를 안전하게 관리해야 합니다. 타인의 명의나 자격을 도용하거나 계정을 양도·공유해서는 안 됩니다. 전문가 그룹 선택만으로 본인확인이나 자격 인증이 완료되는 것은 아닙니다.',
        '3. 이용 범위: 검증 의견은 제공된 질문과 자료에 대한 검토이며, 개별 사건의 위임계약이나 결과 보장을 의미하지 않습니다. 구체적 수임·상담은 별도 합의가 필요합니다. 회원은 자신의 검증 의견에 대한 근거와 적용 범위를 확인합니다.',
        '4. 게시물: 회원은 자신이 작성한 게시물의 권리를 보유합니다. 서비스는 검증 결과 전달과 커뮤니티 운영에 필요한 범위에서 게시물을 저장하고 표시합니다. 검증 의견과 작성자 이름은 질문자에게, 커뮤니티 글·답글과 작성자 이름은 Office 회원에게 표시됩니다.',
        '5. 금지행위 및 이용 제한: 타인의 개인정보·비밀 유출, 저작권 침해, 허위 자격 표시, 광고성 도배, 서비스 방해는 금지합니다. 위반 시 필요한 범위에서 게시물 접근 또는 이용을 제한할 수 있으며, 긴급한 보호 조치가 필요한 경우를 제외하고 사유를 알리고 소명 기회를 제공합니다.',
        '6. 서비스 변경과 종료: 기능 변경·중단 및 약관 변경 시 적용 내용과 시점을 사전에 안내합니다. 회원에게 불리한 중요한 변경은 별도로 알리고 필요한 동의를 받습니다. 탈퇴 또는 이용계약 종료 시 개인정보는 고지된 보유기간과 법령에 따라 처리합니다.',
        '7. 책임과 분쟁: 운영자와 회원은 자신의 귀책사유에 따른 책임을 관계 법령에 따라 부담합니다. 이 약관은 운영자의 법정 책임을 일괄 면제하지 않습니다. 분쟁에는 대한민국 법령을 적용하고 관할은 관계 법령에 따릅니다.',
      ],
    },
    {
      kind: 'PRIVACY',
      version: '2026-09-25.4',
      title: '개인정보 수집·이용 동의',
      paragraphs: [
        '수집·이용 목적: Office 회원 식별과 로그인, 전문가 그룹별 서비스 제공, 변호사 가입 정보와 소속 정보 관리, 회원 연락, 검증 답변 및 커뮤니티 작성자 표시, 가입 동의 내역 확인에 사용합니다. 등록번호와 발급번호 입력만으로 자격 인증이 완료되는 것은 아닙니다.',
        '수집 항목: 필수 항목은 이름, 아이디, 이메일, 비밀번호(일방향 해시로 저장), 클로즈 베타 가입코드, 선택한 전문가 그룹, 동의 항목·문안·버전·동의 시각입니다. 휴대전화, 변호사 등록 번호, 발급번호, 소속 법무법인/사무소명, 주소, 대표전화는 선택 입력 시에만 수집합니다. 가입코드는 클로즈 베타 가입 자격 확인과 참여 정보 관리에 사용합니다. 비밀번호 확인은 일치 여부를 확인하는 데만 사용하며 저장하지 않습니다. 서비스 이용 중 로그인 세션, 검증 의견, 커뮤니티 글·답글과 작성 시각이 저장됩니다.',
        '보유·이용 기간: 회원 탈퇴 또는 수집 목적 달성 시까지 보유하며, 목적이 달성되면 지체 없이 파기합니다. 법령상 별도 보존이 필요한 경우에는 해당 법령에서 정한 항목과 기간에 한해 분리 보관합니다.',
        '동의 거부 권리 및 불이익: 개인정보 수집·이용에 동의하지 않을 권리가 있습니다. 필수 정보의 수집·이용에 동의하지 않으면 Office 회원가입이 제한됩니다. 선택 정보를 입력하지 않아도 회원가입할 수 있습니다.',
        '권리 및 이용 안내: 회원은 자신의 개인정보에 대한 열람·정정·삭제·처리정지 및 동의 철회를 요구할 수 있습니다. 작성자 이름은 검증 질문자 또는 Office 회원에게 표시되므로 이름과 게시물에 불필요한 개인정보를 넣지 마세요.',
        '현재 가입 단계에서는 주민등록번호, 변호사 신분증 이미지, 자격증 사본을 수집하지 않습니다. 향후 이미지 제출이나 본인확인 등으로 추가 정보를 수집하거나 별도 동의가 필요한 제공·처리를 하는 경우, 그 내용과 필요한 동의를 별도로 안내합니다. 이 동의에는 광고·마케팅 수신 동의가 포함되지 않습니다.',
      ],
    },
    {
      kind: 'EXPERT_POLICY',
      version: '2026-09-25.1',
      title: '전문가 활동 및 비밀유지 약정',
      paragraphs: [
        '본인은 선택한 전문가 그룹에 해당하는 자격과 활동 상태를 사실대로 기재하며, 자격·등록 상태가 변경되거나 활동이 제한되는 경우 해당 자격을 전제로 한 검증 활동을 중단합니다. 그룹 선택은 자격 인증을 대신하지 않습니다.',
        '질문과 자료는 검증에 필요한 범위에서만 이용하며, 질문자나 제3자의 개인정보·비밀을 외부에 유출하거나 커뮤니티에 재게시하지 않습니다. 이해충돌 또는 검증하기 어려운 사정이 있으면 해당 검증에 참여하지 않습니다.',
        'AI 답변을 그대로 신뢰하지 않고 관련 근거와 사실관계를 직접 확인합니다. 검증의 한계, 추가 확인이 필요한 사항을 알리고 허위·과장된 결과 보장이나 부당한 수임 유도를 하지 않습니다.',
        '관련 법령과 직역별 윤리·비밀유지 의무를 준수합니다. 회원가입과 이 약정만으로 자격 확인, 운영자의 전문가 인증 또는 개별 사건의 위임계약이 성립하지 않음을 확인합니다.',
      ],
    },
  ],
};

export async function getOfficeSignupPolicy(
  db: PrismaClient | Prisma.TransactionClient,
): Promise<OfficeSignupPolicy> {
  const group = await db.commonCodeGroup.findUnique({
    where: { code: 'EXPERT_GROUP' },
    include: { details: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] } },
  });
  if (!group)
    throw new ChatError(503, 'CODE_CONFIG_MISSING', '전문가 그룹 설정을 불러오지 못했습니다.');
  return {
    ...officeSignupPolicy,
    groups: group.details.map((item) => ({
      code: item.code,
      name: item.name,
      signupEnabled:
        group.isActive && item.isActive && item.code === officeSignupPolicy.officeGroup,
    })),
  };
}

export function validateOfficeSignup(
  policy: OfficeSignupPolicy,
  group: unknown,
  consents: unknown,
) {
  const selected = policy.groups.find((item) => item.code === group);
  if (!selected?.signupEnabled || selected.code !== officeSignupPolicy.officeGroup)
    throw new ChatError(400, 'INVALID_EXPERT_GROUP', '현재 변호사 그룹만 가입할 수 있습니다.');
  if (
    !Array.isArray(consents) ||
    consents.length !== officeSignupPolicy.agreements.length ||
    !officeSignupPolicy.agreements.every((document) =>
      consents.some((value: unknown) => {
        if (!value || typeof value !== 'object') return false;
        const entry = value as Record<string, unknown>;
        return (
          entry.kind === document.kind &&
          entry.version === document.version &&
          entry.accepted === true
        );
      }),
    )
  )
    throw new ChatError(
      400,
      'CONSENT_REQUIRED',
      '현재 버전의 필수 약관을 모두 확인하고 동의해 주세요. 페이지를 새로고침하면 최신 약관을 확인할 수 있습니다.',
    );
  return selected.code;
}
