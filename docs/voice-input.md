# FO 음성 입력

FO의 마이크 버튼으로 말하면 인식 중인 문장을 보여 줍니다. `말하기 완료`를 누르면 최종 문장을 질문란에 추가합니다. 사용자가 금액·날짜·이름을 확인하거나 수정하고 전송해야 기존 채팅 API를 호출합니다. 답변 낭독과 자동 연속 대화는 이번 범위에 포함하지 않습니다.

## 설정과 연결

- API의 기존 `OPENAI_API_KEY`와 DB 연결을 사용합니다. `VOICE_INPUT_ENABLED=false`이면 버튼을 숨기고 세션 발급도 거절합니다. 미설정 시에는 활성화하되, 키나 저장소가 없으면 공개 설정에서 비활성 상태를 반환합니다.
- 마이크에는 HTTPS 또는 localhost와 브라우저의 마이크 권한이 필요합니다. FO에 OpenAI 키를 등록하지 않습니다.
- FO → `POST /api/v1/voice/session` → OpenAI `POST /v1/realtime/client_secrets` 순서로 연결 인증정보를 발급합니다. 브라우저 소유 대화와 사무실, 활성화된 질문 제한을 검사합니다. 발급 자체는 질문 횟수를 차감하지 않습니다.
- 인증정보는 60초 동안 새 연결을 만들 수 있습니다. 브라우저가 이를 메모리에서만 사용하여 `POST /v1/realtime/calls`로 WebRTC를 연결합니다. 일반 API 키와 OpenAI의 전체 응답은 브라우저에 전달하지 않습니다. 인증정보 응답에는 `Cache-Control: no-store`를 적용합니다.
- `gpt-live-transcribe`, `languages: ["ko"]`, `delay: "low"`를 사용합니다. 서버 VAD를 지원하지 않는 모델이므로 `turn_detection: null`로 설정하고 완료 버튼으로 버퍼를 commit합니다.
- 최종 결과를 `item_id`로 해당 commit과 연결하고, `event_id`가 같은 이벤트를 무시합니다. 부분 인식과 최종 결과의 차이를 반영한 뒤 질문란에 넣습니다.

## 사용과 저장

- 연결·인식·최종 결과 대기 중에는 질문 전송을 잠급니다. 기존 작성 내용은 그대로 두고 최종 음성 문장을 덧붙입니다.
- 첫 버전의 화면은 한 번에 최대 2분을 입력받고 자동으로 마무리합니다. 연결 대기는 30초, 완료 결과 대기는 15초입니다.
- 취소, 새 대화, 다른 대화 선택, 페이지 이탈, 화면이 백그라운드로 바뀌면 마이크와 연결을 닫습니다. 늦게 허용된 마이크도 즉시 닫고 이전 연결의 늦은 결과를 무시합니다.
- 연결이 끊기면 인식 중인 문장을 남기고 `인식한 내용 사용`으로 직접 가져올 수 있습니다. 자동 전송하지 않습니다.
- 2,000자를 초과한 결과는 자르지 않고 질문란에 넣어 수정할 수 있게 합니다. 2,000자 이하로 줄여야 전송할 수 있습니다.
- 앱은 녹음 파일을 저장하지 않습니다. 음성은 OpenAI로 전송되고, 사용자가 확인하여 전송한 텍스트만 기존 `chat_messages`에 질문으로 저장합니다. DB migration은 필요하지 않습니다.

## 운영 제한

세션 발급은 API 프로세스당 브라우저별 5회/분, 전체 60회/분으로 제한하며 같은 브라우저의 동시 발급 요청을 차단합니다. 다중 인스턴스에서는 각 프로세스별 제한이므로 공유 저장소를 사용하는 전역 한도로 오해하지 않아야 합니다.

60초는 인증정보의 신규 연결 유효기간이며 이미 시작한 세션의 만료 시간이 아닙니다. 2분 종료는 FO의 동작 정책이며 서버가 강제하는 과금 상한이 아닙니다. OpenAI client secret의 세션 설정은 클라이언트에서 변경할 수 있으므로 이를 모델/비용 제한 수단으로 사용하지 않습니다. 운영 비용의 강제 통제가 필요하면 서버가 WebRTC 연결을 초기화하고 세션을 추적·종료하는 구조 또는 서버 중계를 추가합니다.

로그와 오류 응답에 인증정보, SDP, 음성, 전사 원문, OpenAI 오류 원문을 기록하지 않습니다. 실제 한국어 인식 품질은 마이크·발음·주변 소음에 따라 별도 확인해야 합니다.

## 검증

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx playwright test tests/voice.spec.ts tests/first-page.spec.ts tests/fo-history.spec.ts
```

자동 테스트는 OpenAI와 마이크를 모의 처리하여 실제 오디오 전송·비용 없이 인식 결과 반영, 명시적 전송, 권한 거부, 연결 오류, 취소, 대화 전환, 중복·순서가 바뀐 이벤트, 시간·글자 제한을 검증합니다. 실제 기기의 마이크와 Safari 동작까지 검증한 것으로 간주하지 않습니다.

실기기 확인: Chrome/Edge, Android Chrome, iOS Safari에서 마이크 허용·거부, 금액·날짜·부정 표현, 소음, 입력 중 화면 잠금, 재연결, 대화 이동, 질문 전송·새로고침 복원을 확인합니다.

참고: [Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription), [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=realtime).
