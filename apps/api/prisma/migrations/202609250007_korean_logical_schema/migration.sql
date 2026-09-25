BEGIN;

COMMENT ON TABLE public."common_code_groups" IS '공통 코드 그룹: 전문가 직역, 요금제 등 코드 분류 관리';
COMMENT ON COLUMN public."common_code_groups"."code" IS '공통 코드 그룹 코드';
COMMENT ON COLUMN public."common_code_groups"."name" IS '공통 코드 그룹명';
COMMENT ON COLUMN public."common_code_groups"."description" IS '상세 설명';
COMMENT ON COLUMN public."common_code_groups"."sort_order" IS '표시 순서: 작은 값부터 정렬';
COMMENT ON COLUMN public."common_code_groups"."is_active" IS '사용 여부';
COMMENT ON COLUMN public."common_code_groups"."created_at" IS '생성 일시';
COMMENT ON COLUMN public."common_code_groups"."updated_at" IS '최종 수정 일시';

COMMENT ON TABLE public."common_code_details" IS '공통 코드 상세: 그룹별 코드값, 표시명, 정렬 및 사용 여부 관리';
COMMENT ON COLUMN public."common_code_details"."group_code" IS '공통 코드 그룹 코드';
COMMENT ON COLUMN public."common_code_details"."code" IS '공통 코드 상세 코드: 그룹 내 고유값';
COMMENT ON COLUMN public."common_code_details"."name" IS '공통 코드 표시명';
COMMENT ON COLUMN public."common_code_details"."description" IS '상세 설명';
COMMENT ON COLUMN public."common_code_details"."sort_order" IS '표시 순서: 작은 값부터 정렬';
COMMENT ON COLUMN public."common_code_details"."is_active" IS '사용 여부';
COMMENT ON COLUMN public."common_code_details"."created_at" IS '생성 일시';
COMMENT ON COLUMN public."common_code_details"."updated_at" IS '최종 수정 일시';

COMMENT ON TABLE public."expert_consents" IS '전문가 가입 동의 이력: 동의한 약관의 종류, 버전, 원문과 시각 보관';
COMMENT ON COLUMN public."expert_consents"."id" IS '전문가 가입 동의 이력 식별자';
COMMENT ON COLUMN public."expert_consents"."account_id" IS '전문가 회원 식별자';
COMMENT ON COLUMN public."expert_consents"."kind" IS '동의 종류: TERMS 이용약관, PRIVACY 개인정보 수집·이용, EXPERT_POLICY 전문가 활동 약정';
COMMENT ON COLUMN public."expert_consents"."version" IS '동의 문안 버전';
COMMENT ON COLUMN public."expert_consents"."document" IS '동의 문안 원본: 제목과 본문을 담은 JSON';
COMMENT ON COLUMN public."expert_consents"."accepted_at" IS '동의 일시';

COMMENT ON TABLE public."community_posts" IS '전문가 커뮤니티 게시글: Office 회원의 자유 게시글';
COMMENT ON COLUMN public."community_posts"."id" IS '전문가 커뮤니티 게시글 식별자';
COMMENT ON COLUMN public."community_posts"."author_id" IS '작성 전문가 회원 식별자';
COMMENT ON COLUMN public."community_posts"."title" IS '게시글 제목';
COMMENT ON COLUMN public."community_posts"."content" IS '본문 내용';
COMMENT ON COLUMN public."community_posts"."created_at" IS '생성 일시';

COMMENT ON TABLE public."community_replies" IS '전문가 커뮤니티 댓글: 게시글에 등록한 답글';
COMMENT ON COLUMN public."community_replies"."id" IS '전문가 커뮤니티 댓글 식별자';
COMMENT ON COLUMN public."community_replies"."post_id" IS '커뮤니티 게시글 식별자';
COMMENT ON COLUMN public."community_replies"."author_id" IS '작성 전문가 회원 식별자';
COMMENT ON COLUMN public."community_replies"."content" IS '댓글 본문';
COMMENT ON COLUMN public."community_replies"."created_at" IS '생성 일시';

COMMENT ON TABLE public."expert_accounts" IS '전문가 회원: Office 로그인 계정, 직역, 요금제 및 관리 권한';
COMMENT ON COLUMN public."expert_accounts"."username" IS '로그인 아이디: 소문자로 정규화한 영문·숫자·밑줄';
COMMENT ON COLUMN public."expert_accounts"."expert_group" IS '전문가 직역 코드: EXPERT_GROUP 그룹의 상세 코드';
COMMENT ON COLUMN public."expert_accounts"."expert_code_group" IS '전문가 직역의 공통 코드 그룹: EXPERT_GROUP 고정';
COMMENT ON COLUMN public."expert_accounts"."can_manage_codes" IS '공통 코드 관리 권한 여부';
COMMENT ON COLUMN public."expert_accounts"."plan" IS '요금제 코드: FREE, PRO, BUSINESS';
COMMENT ON COLUMN public."expert_accounts"."plan_code_group" IS '요금제의 공통 코드 그룹: PLAN 고정';
COMMENT ON COLUMN public."expert_accounts"."id" IS '전문가 회원 식별자';
COMMENT ON COLUMN public."expert_accounts"."email" IS '이메일 주소';
COMMENT ON COLUMN public."expert_accounts"."name" IS '전문가 이름';
COMMENT ON COLUMN public."expert_accounts"."password_hash" IS '비밀번호 해시: 솔트와 키 유도 결과 저장, 평문 저장 금지';
COMMENT ON COLUMN public."expert_accounts"."created_at" IS '생성 일시';

COMMENT ON TABLE public."expert_lawyer_profiles" IS '변호사 회원 상세: 변호사 가입 양식의 자격 정보와 사무소 연락처';
COMMENT ON COLUMN public."expert_lawyer_profiles"."account_id" IS '전문가 회원 식별자';
COMMENT ON COLUMN public."expert_lawyer_profiles"."mobile_phone" IS '휴대전화 번호: 구분 기호를 제거한 숫자';
COMMENT ON COLUMN public."expert_lawyer_profiles"."registration_number" IS '변호사 등록 번호: 앞자리 0을 보존하는 문자열';
COMMENT ON COLUMN public."expert_lawyer_profiles"."issue_number" IS '변호사 신분증 발급번호: 자격 검증 완료를 의미하지 않음';
COMMENT ON COLUMN public."expert_lawyer_profiles"."office_name" IS '소속 법무법인 또는 사무소명';
COMMENT ON COLUMN public."expert_lawyer_profiles"."address" IS '사무소 주소';
COMMENT ON COLUMN public."expert_lawyer_profiles"."office_phone" IS '사무소 대표전화: 구분 기호를 제거한 숫자';
COMMENT ON COLUMN public."expert_lawyer_profiles"."created_at" IS '생성 일시';

COMMENT ON TABLE public."expert_login_sessions" IS '전문가 로그인 세션: 인증 토큰 해시와 만료 시각';
COMMENT ON COLUMN public."expert_login_sessions"."id" IS '전문가 로그인 세션 식별자';
COMMENT ON COLUMN public."expert_login_sessions"."account_id" IS '전문가 회원 식별자';
COMMENT ON COLUMN public."expert_login_sessions"."token_hash" IS '인증 토큰의 SHA-256 해시: 원문 토큰 저장 금지';
COMMENT ON COLUMN public."expert_login_sessions"."expires_at" IS '만료 일시';

COMMENT ON TABLE public."review_board_posts" IS '검증 요청 게시글: 이용자가 검증을 요청한 질문과 인공지능 답변 원문';
COMMENT ON COLUMN public."review_board_posts"."id" IS '검증 요청 게시글 식별자';
COMMENT ON COLUMN public."review_board_posts"."session_id" IS '채팅 세션 식별자';
COMMENT ON COLUMN public."review_board_posts"."answer_message_id" IS '검증 대상 인공지능 답변 메시지 식별자';
COMMENT ON COLUMN public."review_board_posts"."question" IS '검증 요청 당시 질문 원문';
COMMENT ON COLUMN public."review_board_posts"."ai_answer" IS '검증 요청 당시 인공지능 답변 원문';
COMMENT ON COLUMN public."review_board_posts"."requester_email" IS '검증 요청자 이메일';
COMMENT ON COLUMN public."review_board_posts"."created_at" IS '생성 일시';

COMMENT ON TABLE public."review_contributions" IS '전문가별 검증 답변: 요청별 전문가의 검토 상태와 제출 답변';
COMMENT ON COLUMN public."review_contributions"."id" IS '전문가별 검증 답변 식별자';
COMMENT ON COLUMN public."review_contributions"."post_id" IS '검증 요청 게시글 식별자';
COMMENT ON COLUMN public."review_contributions"."expert_id" IS '검증 담당 전문가 회원 식별자';
COMMENT ON COLUMN public."review_contributions"."status" IS '전문가별 검증 상태: REVIEWING 검토 중, COMPLETED 답변 완료';
COMMENT ON COLUMN public."review_contributions"."reply" IS '전문가 검증 답변 내용';
COMMENT ON COLUMN public."review_contributions"."created_at" IS '생성 일시';
COMMENT ON COLUMN public."review_contributions"."completed_at" IS '처리 완료 일시';

COMMENT ON TABLE public."review_choices" IS '검증 답변 선택: 요청자가 최종 선택한 전문가 답변';
COMMENT ON COLUMN public."review_choices"."post_id" IS '검증 요청 게시글 식별자';
COMMENT ON COLUMN public."review_choices"."contribution_id" IS '전문가별 검증 답변 식별자';
COMMENT ON COLUMN public."review_choices"."selected_at" IS '답변 선택 일시';

COMMENT ON TABLE public."fo_browsers" IS '이용자 브라우저: 익명 이용자의 대화 소유권과 현재 대화 관리';
COMMENT ON COLUMN public."fo_browsers"."id" IS '이용자 브라우저 식별자';
COMMENT ON COLUMN public."fo_browsers"."token_hash" IS '인증 토큰의 SHA-256 해시: 원문 토큰 저장 금지';
COMMENT ON COLUMN public."fo_browsers"."active_session_id" IS '현재 선택한 채팅 세션 식별자';
COMMENT ON COLUMN public."fo_browsers"."expires_at" IS '만료 일시';

COMMENT ON TABLE public."fo_conversations" IS '이용자 대화 목록: 브라우저와 채팅 세션의 연결';
COMMENT ON COLUMN public."fo_conversations"."id" IS '이용자 대화 목록 식별자';
COMMENT ON COLUMN public."fo_conversations"."browser_id" IS '이용자 브라우저 식별자';
COMMENT ON COLUMN public."fo_conversations"."session_id" IS '채팅 세션 식별자';
COMMENT ON COLUMN public."fo_conversations"."created_at" IS '생성 일시';

COMMENT ON TABLE public."fo_review_reads" IS '검증 답변 읽음 이력: 브라우저별 답변 열람 시각';
COMMENT ON COLUMN public."fo_review_reads"."browser_id" IS '이용자 브라우저 식별자';
COMMENT ON COLUMN public."fo_review_reads"."contribution_id" IS '전문가별 검증 답변 식별자';
COMMENT ON COLUMN public."fo_review_reads"."read_at" IS '답변 읽음 일시';

COMMENT ON TABLE public."law_offices" IS '법률사무소: 사무소 식별, 운영 상태 및 서비스 설정';
COMMENT ON COLUMN public."law_offices"."id" IS '법률사무소 식별자';
COMMENT ON COLUMN public."law_offices"."code" IS '법률사무소 코드';
COMMENT ON COLUMN public."law_offices"."name" IS '법률사무소명';
COMMENT ON COLUMN public."law_offices"."is_active" IS '사용 여부';
COMMENT ON COLUMN public."law_offices"."contact_email" IS '사무소 대표 이메일';
COMMENT ON COLUMN public."law_offices"."phone" IS '사무소 전화번호';
COMMENT ON COLUMN public."law_offices"."status" IS '사무소 상태: ACTIVE 운영, SUSPENDED 중지, CLOSED 폐업';
COMMENT ON COLUMN public."law_offices"."settings" IS '사무소별 서비스 설정 JSON';
COMMENT ON COLUMN public."law_offices"."created_at" IS '생성 일시';
COMMENT ON COLUMN public."law_offices"."updated_at" IS '최종 수정 일시';

COMMENT ON TABLE public."lawyers" IS '사무소 소속 변호사: 사무소별 배정형 검증의 자격 승인 및 배정 대상';
COMMENT ON COLUMN public."lawyers"."id" IS '사무소 소속 변호사 식별자';
COMMENT ON COLUMN public."lawyers"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."lawyers"."name" IS '변호사 이름';
COMMENT ON COLUMN public."lawyers"."email" IS '이메일 주소';
COMMENT ON COLUMN public."lawyers"."registration_number" IS '변호사 등록 번호: 앞자리 0을 보존하는 문자열';
COMMENT ON COLUMN public."lawyers"."approval_status" IS '자격 승인 상태: PENDING 대기, APPROVED 승인, REJECTED 반려';
COMMENT ON COLUMN public."lawyers"."is_active" IS '사용 여부';
COMMENT ON COLUMN public."lawyers"."assignment_enabled" IS '검증 요청 배정 가능 여부';
COMMENT ON COLUMN public."lawyers"."receive_verification_email" IS '검증 초대 이메일 수신 여부';
COMMENT ON COLUMN public."lawyers"."created_at" IS '생성 일시';
COMMENT ON COLUMN public."lawyers"."updated_at" IS '최종 수정 일시';

COMMENT ON TABLE public."staff_accounts" IS '사무소 직원 계정: 사무소별 관리자의 역할과 인증 정보';
COMMENT ON COLUMN public."staff_accounts"."id" IS '사무소 직원 계정 식별자';
COMMENT ON COLUMN public."staff_accounts"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."staff_accounts"."lawyer_id" IS '사무소 소속 변호사 식별자';
COMMENT ON COLUMN public."staff_accounts"."email" IS '이메일 주소';
COMMENT ON COLUMN public."staff_accounts"."password_hash" IS '비밀번호 해시: 솔트와 키 유도 결과 저장, 평문 저장 금지';
COMMENT ON COLUMN public."staff_accounts"."role" IS '직원 역할: OFFICE_ADMIN 사무소 관리자, DISPATCHER 배정 담당, LAWYER 변호사';
COMMENT ON COLUMN public."staff_accounts"."status" IS '직원 계정 상태: ACTIVE 사용, SUSPENDED 중지, CLOSED 폐쇄';
COMMENT ON COLUMN public."staff_accounts"."created_at" IS '생성 일시';
COMMENT ON COLUMN public."staff_accounts"."updated_at" IS '최종 수정 일시';

COMMENT ON TABLE public."staff_sessions" IS '사무소 직원 로그인 세션: 직원 계정의 인증 만료 및 폐기 관리';
COMMENT ON COLUMN public."staff_sessions"."id" IS '사무소 직원 로그인 세션 식별자';
COMMENT ON COLUMN public."staff_sessions"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."staff_sessions"."staff_account_id" IS '사무소 직원 계정 식별자';
COMMENT ON COLUMN public."staff_sessions"."token_hash" IS '인증 토큰의 SHA-256 해시: 원문 토큰 저장 금지';
COMMENT ON COLUMN public."staff_sessions"."expires_at" IS '만료 일시';
COMMENT ON COLUMN public."staff_sessions"."revoked_at" IS '인증 폐기 일시: NULL이면 미폐기';
COMMENT ON COLUMN public."staff_sessions"."created_at" IS '생성 일시';

COMMENT ON TABLE public."lawyer_employments" IS '변호사 재직 이력: 사무소 소속 변호사의 입사와 퇴사 기간';
COMMENT ON COLUMN public."lawyer_employments"."id" IS '변호사 재직 이력 식별자';
COMMENT ON COLUMN public."lawyer_employments"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."lawyer_employments"."lawyer_id" IS '사무소 소속 변호사 식별자';
COMMENT ON COLUMN public."lawyer_employments"."starts_at" IS '입사 일시';
COMMENT ON COLUMN public."lawyer_employments"."ends_at" IS '퇴사 일시: NULL이면 종료 미정';
COMMENT ON COLUMN public."lawyer_employments"."status" IS '재직 상태: SCHEDULED 입사 예정, ACTIVE 재직, ENDED 퇴사, CANCELLED 취소';
COMMENT ON COLUMN public."lawyer_employments"."created_by" IS '등록한 직원 계정 식별자';
COMMENT ON COLUMN public."lawyer_employments"."created_at" IS '생성 일시';
COMMENT ON COLUMN public."lawyer_employments"."updated_at" IS '최종 수정 일시';

COMMENT ON TABLE public."lawyer_leaves" IS '변호사 휴가 이력: 검증 배정에서 제외할 휴가 기간과 승인 상태';
COMMENT ON COLUMN public."lawyer_leaves"."id" IS '변호사 휴가 이력 식별자';
COMMENT ON COLUMN public."lawyer_leaves"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."lawyer_leaves"."lawyer_id" IS '사무소 소속 변호사 식별자';
COMMENT ON COLUMN public."lawyer_leaves"."starts_at" IS '휴가 시작 일시';
COMMENT ON COLUMN public."lawyer_leaves"."ends_at" IS '휴가 종료 일시';
COMMENT ON COLUMN public."lawyer_leaves"."status" IS '휴가 상태: PENDING 승인 대기, APPROVED 승인, CANCELLED 취소';
COMMENT ON COLUMN public."lawyer_leaves"."approved_by" IS '승인한 직원 계정 식별자';
COMMENT ON COLUMN public."lawyer_leaves"."created_at" IS '생성 일시';
COMMENT ON COLUMN public."lawyer_leaves"."updated_at" IS '최종 수정 일시';

COMMENT ON TABLE public."chat_sessions" IS '채팅 세션: 익명 대화의 질문 횟수, 소속 사무소 및 만료 관리';
COMMENT ON COLUMN public."chat_sessions"."id" IS '채팅 세션 식별자';
COMMENT ON COLUMN public."chat_sessions"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."chat_sessions"."session_token_hash" IS '채팅 세션 토큰의 SHA-256 해시';
COMMENT ON COLUMN public."chat_sessions"."question_count" IS '사용한 질문 횟수';
COMMENT ON COLUMN public."chat_sessions"."max_question_count" IS '최대 질문 횟수: NULL이면 제한 없음';
COMMENT ON COLUMN public."chat_sessions"."expires_at" IS '만료 일시';
COMMENT ON COLUMN public."chat_sessions"."created_at" IS '생성 일시';
COMMENT ON COLUMN public."chat_sessions"."updated_at" IS '최종 수정 일시';

COMMENT ON TABLE public."chat_messages" IS '채팅 메시지: 이용자 질문, 인공지능 답변 및 처리 상태';
COMMENT ON COLUMN public."chat_messages"."id" IS '채팅 메시지 식별자';
COMMENT ON COLUMN public."chat_messages"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."chat_messages"."session_id" IS '채팅 세션 식별자';
COMMENT ON COLUMN public."chat_messages"."parent_message_id" IS '상위 메시지 식별자: 인공지능 답변이 대응하는 질문';
COMMENT ON COLUMN public."chat_messages"."request_key" IS '질문 재시도 중복 방지 키: 클라이언트가 질문별 생성하며 자동 생성 메시지는 NULL';
COMMENT ON COLUMN public."chat_messages"."role" IS '메시지 작성 주체: USER 이용자, ASSISTANT 인공지능, SYSTEM 시스템';
COMMENT ON COLUMN public."chat_messages"."message_type" IS '메시지 종류: USER_QUESTION 질문, AI_ANSWER 답변, NON_LEGAL_NOTICE 비법률 안내, SYSTEM_NOTICE 시스템 안내';
COMMENT ON COLUMN public."chat_messages"."content" IS '본문 내용';
COMMENT ON COLUMN public."chat_messages"."sanitized_content" IS '개인정보 등을 정제한 메시지 내용';
COMMENT ON COLUMN public."chat_messages"."sequence_no" IS '채팅 세션 내 메시지 순번';
COMMENT ON COLUMN public."chat_messages"."processing_status" IS '메시지 처리 상태: RECEIVED 접수, PROCESSING 처리 중, COMPLETED 완료, FAILED 실패';
COMMENT ON COLUMN public."chat_messages"."metadata" IS '메시지 부가 정보 JSON';
COMMENT ON COLUMN public."chat_messages"."created_at" IS '생성 일시';

COMMENT ON TABLE public."verification_requests" IS '사무소 배정형 검증 요청: 질문과 답변의 원문, 담당 변호사 및 처리 상태';
COMMENT ON COLUMN public."verification_requests"."id" IS '사무소 배정형 검증 요청 식별자';
COMMENT ON COLUMN public."verification_requests"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."verification_requests"."session_id" IS '채팅 세션 식별자';
COMMENT ON COLUMN public."verification_requests"."question_message_id" IS '검증 대상 질문 메시지 식별자';
COMMENT ON COLUMN public."verification_requests"."ai_answer_message_id" IS '검증 대상 인공지능 답변 메시지 식별자';
COMMENT ON COLUMN public."verification_requests"."requester_email" IS '검증 요청자 이메일';
COMMENT ON COLUMN public."verification_requests"."additional_context" IS '요청자가 추가한 상황 설명';
COMMENT ON COLUMN public."verification_requests"."question_snapshot" IS '검증 요청 시점의 질문 원문 사본';
COMMENT ON COLUMN public."verification_requests"."ai_answer_snapshot" IS '검증 요청 시점의 인공지능 답변 원문 사본';
COMMENT ON COLUMN public."verification_requests"."status" IS '검증 처리 상태: REQUESTED 요청, ASSIGNED 배정, REVIEWING 검토, ANSWERED 답변, EXPIRED 만료, REJECTED 반려';
COMMENT ON COLUMN public."verification_requests"."assigned_lawyer_id" IS '현재 배정된 사무소 소속 변호사 식별자';
COMMENT ON COLUMN public."verification_requests"."assignment_version" IS '검증 배정 버전: 재배정 시 증가';
COMMENT ON COLUMN public."verification_requests"."requested_at" IS '검증 요청 일시';
COMMENT ON COLUMN public."verification_requests"."assigned_at" IS '담당자 배정 일시';
COMMENT ON COLUMN public."verification_requests"."claimed_at" IS '담당자의 검토 수락 일시';
COMMENT ON COLUMN public."verification_requests"."completed_at" IS '처리 완료 일시';
COMMENT ON COLUMN public."verification_requests"."expires_at" IS '만료 일시';
COMMENT ON COLUMN public."verification_requests"."created_at" IS '생성 일시';
COMMENT ON COLUMN public."verification_requests"."updated_at" IS '최종 수정 일시';

COMMENT ON TABLE public."review_invitations" IS '변호사 검증 초대: 배정된 변호사의 검토 링크 인증 정보';
COMMENT ON COLUMN public."review_invitations"."id" IS '변호사 검증 초대 식별자';
COMMENT ON COLUMN public."review_invitations"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."review_invitations"."verification_request_id" IS '사무소 배정형 검증 요청 식별자';
COMMENT ON COLUMN public."review_invitations"."lawyer_id" IS '사무소 소속 변호사 식별자';
COMMENT ON COLUMN public."review_invitations"."assignment_version" IS '검증 배정 버전: 재배정 시 증가';
COMMENT ON COLUMN public."review_invitations"."token_hash" IS '인증 토큰의 SHA-256 해시: 원문 토큰 저장 금지';
COMMENT ON COLUMN public."review_invitations"."expires_at" IS '만료 일시';
COMMENT ON COLUMN public."review_invitations"."revoked_at" IS '인증 폐기 일시: NULL이면 미폐기';
COMMENT ON COLUMN public."review_invitations"."created_at" IS '생성 일시';

COMMENT ON TABLE public."review_sessions" IS '변호사 검증 세션: 초대 링크로 생성한 검토 인증 세션';
COMMENT ON COLUMN public."review_sessions"."id" IS '변호사 검증 세션 식별자';
COMMENT ON COLUMN public."review_sessions"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."review_sessions"."verification_request_id" IS '사무소 배정형 검증 요청 식별자';
COMMENT ON COLUMN public."review_sessions"."invitation_id" IS '변호사 검증 초대 식별자';
COMMENT ON COLUMN public."review_sessions"."token_hash" IS '인증 토큰의 SHA-256 해시: 원문 토큰 저장 금지';
COMMENT ON COLUMN public."review_sessions"."expires_at" IS '만료 일시';
COMMENT ON COLUMN public."review_sessions"."revoked_at" IS '인증 폐기 일시: NULL이면 미폐기';
COMMENT ON COLUMN public."review_sessions"."created_at" IS '생성 일시';

COMMENT ON TABLE public."assignment_history" IS '검증 배정 이력: 담당 변호사 변경과 변경 사유 기록';
COMMENT ON COLUMN public."assignment_history"."id" IS '검증 배정 이력 식별자';
COMMENT ON COLUMN public."assignment_history"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."assignment_history"."verification_request_id" IS '사무소 배정형 검증 요청 식별자';
COMMENT ON COLUMN public."assignment_history"."assignment_version" IS '검증 배정 버전: 재배정 시 증가';
COMMENT ON COLUMN public."assignment_history"."from_lawyer_id" IS '변경 전 담당 변호사 식별자';
COMMENT ON COLUMN public."assignment_history"."to_lawyer_id" IS '변경 후 담당 변호사 식별자';
COMMENT ON COLUMN public."assignment_history"."reason" IS '담당자 변경 사유';
COMMENT ON COLUMN public."assignment_history"."actor_staff_id" IS '배정 변경을 수행한 직원 계정 식별자';
COMMENT ON COLUMN public."assignment_history"."created_at" IS '생성 일시';

COMMENT ON TABLE public."lawyer_replies" IS '사무소 배정형 변호사 답변: 배정 버전에 따른 검증 결과와 제출 내용';
COMMENT ON COLUMN public."lawyer_replies"."id" IS '사무소 배정형 변호사 답변 식별자';
COMMENT ON COLUMN public."lawyer_replies"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."lawyer_replies"."verification_request_id" IS '사무소 배정형 검증 요청 식별자';
COMMENT ON COLUMN public."lawyer_replies"."lawyer_id" IS '사무소 소속 변호사 식별자';
COMMENT ON COLUMN public."lawyer_replies"."assignment_version" IS '검증 배정 버전: 재배정 시 증가';
COMMENT ON COLUMN public."lawyer_replies"."result_type" IS '검증 결과: GENERALLY_VALID 대체로 타당, PARTIALLY_VALID 일부 타당, IMPORTANT_OMISSION 중요 누락, MORE_FACTS_NEEDED 사실 보완 필요, CONSULTATION_RECOMMENDED 상담 권장, AI_ANSWER_INAPPROPRIATE 부적절한 답변';
COMMENT ON COLUMN public."lawyer_replies"."reply_body" IS '변호사 검증 답변 본문';
COMMENT ON COLUMN public."lawyer_replies"."submitted_at" IS '검증 답변 제출 일시';

COMMENT ON TABLE public."email_outbox" IS '이메일 발송 대기열: 검증 초대와 답변 알림의 발송 및 재시도 관리';
COMMENT ON COLUMN public."email_outbox"."id" IS '이메일 발송 대기열 식별자';
COMMENT ON COLUMN public."email_outbox"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."email_outbox"."verification_request_id" IS '사무소 배정형 검증 요청 식별자';
COMMENT ON COLUMN public."email_outbox"."invitation_id" IS '변호사 검증 초대 식별자';
COMMENT ON COLUMN public."email_outbox"."reply_id" IS '변호사 제출 답변 식별자';
COMMENT ON COLUMN public."email_outbox"."recipient" IS '수신자 이메일 주소';
COMMENT ON COLUMN public."email_outbox"."event_type" IS '이메일 종류: LAWYER_REVIEW_INVITATION 검증 초대, USER_LAWYER_REPLY 답변 알림';
COMMENT ON COLUMN public."email_outbox"."deduplication_key" IS '이메일 중복 발송 방지 키';
COMMENT ON COLUMN public."email_outbox"."status" IS '발송 상태: PENDING 대기, SENDING 발송 중, SENT 성공, FAILED 실패, CANCELLED 취소';
COMMENT ON COLUMN public."email_outbox"."attempt_count" IS '누적 발송 시도 횟수';
COMMENT ON COLUMN public."email_outbox"."next_attempt_at" IS '다음 발송 시도 예정 일시';
COMMENT ON COLUMN public."email_outbox"."lease_until" IS '발송 작업 점유 만료 일시';
COMMENT ON COLUMN public."email_outbox"."provider_message_id" IS '이메일 제공자가 부여한 메시지 식별자';
COMMENT ON COLUMN public."email_outbox"."last_error_code" IS '마지막 발송 오류 코드';
COMMENT ON COLUMN public."email_outbox"."encrypted_payload" IS '인증된 암호화 방식으로 보호한 발송 데이터: 초대 URL과 토큰의 평문 저장 금지';
COMMENT ON COLUMN public."email_outbox"."sent_at" IS '발송 성공 일시';
COMMENT ON COLUMN public."email_outbox"."created_at" IS '생성 일시';

COMMENT ON TABLE public."email_delivery_attempts" IS '이메일 발송 시도 이력: 시도별 결과, 오류와 처리 시간';
COMMENT ON COLUMN public."email_delivery_attempts"."id" IS '이메일 발송 시도 이력 식별자';
COMMENT ON COLUMN public."email_delivery_attempts"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."email_delivery_attempts"."email_outbox_id" IS '이메일 발송 대기열 식별자';
COMMENT ON COLUMN public."email_delivery_attempts"."attempt_no" IS '발송 시도 순번';
COMMENT ON COLUMN public."email_delivery_attempts"."status" IS '발송 상태: PENDING 대기, SENDING 발송 중, SENT 성공, FAILED 실패, CANCELLED 취소';
COMMENT ON COLUMN public."email_delivery_attempts"."provider_message_id" IS '이메일 제공자가 부여한 메시지 식별자';
COMMENT ON COLUMN public."email_delivery_attempts"."error_code" IS '발송 오류 코드';
COMMENT ON COLUMN public."email_delivery_attempts"."started_at" IS '발송 시도 시작 일시';
COMMENT ON COLUMN public."email_delivery_attempts"."finished_at" IS '발송 시도 종료 일시';

COMMENT ON TABLE public."audit_logs" IS '감사 이력: 사무소별 행위 주체와 업무 변경 대상 기록';
COMMENT ON COLUMN public."audit_logs"."id" IS '감사 이력 식별자';
COMMENT ON COLUMN public."audit_logs"."law_office_id" IS '소속 법률사무소 식별자';
COMMENT ON COLUMN public."audit_logs"."actor_type" IS '행위 주체 종류: ANONYMOUS_SESSION 익명 이용자, STAFF 직원, LAWYER_REVIEW_SESSION 검토 변호사, SYSTEM 시스템';
COMMENT ON COLUMN public."audit_logs"."actor_id" IS '행위 주체 식별자: 시스템 행위는 NULL 가능';
COMMENT ON COLUMN public."audit_logs"."action" IS '수행한 업무 행위 코드';
COMMENT ON COLUMN public."audit_logs"."entity_type" IS '업무 대상 종류';
COMMENT ON COLUMN public."audit_logs"."entity_id" IS '업무 대상 식별자';
COMMENT ON COLUMN public."audit_logs"."created_at" IS '생성 일시';

DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    COMMENT ON TABLE public._prisma_migrations IS '스키마 변경 이력: Prisma가 관리하는 마이그레이션 적용 기록';
    COMMENT ON COLUMN public._prisma_migrations.id IS '마이그레이션 실행 식별자';
    COMMENT ON COLUMN public._prisma_migrations.checksum IS '마이그레이션 파일의 무결성 해시';
    COMMENT ON COLUMN public._prisma_migrations.finished_at IS '적용 완료 일시';
    COMMENT ON COLUMN public._prisma_migrations.migration_name IS '마이그레이션 이름';
    COMMENT ON COLUMN public._prisma_migrations.logs IS '실행 로그와 오류 상세';
    COMMENT ON COLUMN public._prisma_migrations.rolled_back_at IS '롤백 처리 일시';
    COMMENT ON COLUMN public._prisma_migrations.started_at IS '적용 시작 일시';
    COMMENT ON COLUMN public._prisma_migrations.applied_steps_count IS '적용한 단계 수';
  END IF;
END $$;

COMMIT;
