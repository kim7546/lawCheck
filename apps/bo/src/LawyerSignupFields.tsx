import { RequiredMark } from './RequiredMark';

export function LawyerSignupFields({ busy }: { busy: boolean }) {
  return (
    <fieldset className="lawyer-signup-fields" disabled={busy}>
      <legend>변호사 가입 정보</legend>
      <p className="muted">
        <RequiredMark /> 표시는 필수 입력 항목입니다. 나머지 정보는 선택 사항입니다.
      </p>
      <label>
        <span>
          <RequiredMark />
          클로즈 베타 가입코드
        </span>
        <input
          name="betaSignupCode"
          autoComplete="off"
          inputMode="numeric"
          required
          maxLength={100}
          placeholder="전달받은 가입코드 입력"
          aria-describedby="beta-code-guide"
        />
      </label>
      <p id="beta-code-guide" className="muted">
        클로즈 베타 참여를 위해 전달받은 가입코드를 입력해 주세요.
      </p>
      <label>
        <span>
          <RequiredMark />
          이름
        </span>
        <input name="name" autoComplete="name" maxLength={100} required />
      </label>
      <label>
        <span>
          <RequiredMark />
          아이디
        </span>
        <input
          name="username"
          autoComplete="username"
          minLength={4}
          maxLength={30}
          pattern="[A-Za-z][A-Za-z0-9_]{3,29}"
          required
          placeholder="영문으로 시작하는 영문·숫자·밑줄 4~30자"
          aria-describedby="username-guide"
        />
      </label>
      <p id="username-guide" className="muted">
        아이디는 대소문자를 구분하지 않습니다.
      </p>
      <label>
        <span>
          <RequiredMark />
          이메일
        </span>
        <input name="email" type="email" autoComplete="email" maxLength={254} required />
      </label>
      <label>
        <span>
          <RequiredMark />
          비밀번호
        </span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          required
          placeholder="10자 이상 입력"
        />
      </label>
      <label>
        <span>
          <RequiredMark />
          비밀번호 확인
        </span>
        <input
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          required
          placeholder="비밀번호를 한 번 더 입력"
        />
      </label>
      <label>
        휴대전화
        <input
          name="mobilePhone"
          type="tel"
          autoComplete="mobile tel"
          maxLength={20}
          placeholder="010-1234-5678"
        />
      </label>
      <label>
        변호사 등록 번호
        <input name="registrationNumber" autoComplete="off" maxLength={50} />
      </label>
      <label>
        변호사 신분증 이미지
        <input type="file" accept="image/*" disabled aria-describedby="lawyer-image-guide" />
      </label>
      <p className="muted" id="lawyer-image-guide">
        준비 중 · 이미지 업로드는 추후 지원됩니다. 지금은 제출하지 않습니다.
      </p>
      <label>
        발급번호
        <input name="issueNumber" autoComplete="off" maxLength={100} />
      </label>
      <label>
        소속 법무법인/사무소명
        <input name="officeName" autoComplete="organization" maxLength={200} />
      </label>
      <label>
        주소
        <input
          name="address"
          autoComplete="street-address"
          maxLength={500}
          placeholder="소속 법무법인 또는 사무소 주소와 상세주소"
        />
      </label>
      <label>
        대표전화
        <input
          name="officePhone"
          type="tel"
          autoComplete="work tel"
          maxLength={20}
          placeholder="02-1234-5678"
        />
      </label>
    </fieldset>
  );
}
