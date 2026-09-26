# AI QAVER 웹 브랜드 적용

기준: `AI_QAVER_CI_BI_회사소개_브랜드가이드_Ver1.0.pdf` 2–3페이지.

| 역할                                         | 표준색    |
| -------------------------------------------- | --------- |
| AIQ Navy · 제목, BO 메뉴                     | `#0B1F3B` |
| Q Blue · 주요 버튼, 선택 상태                | `#2563EB` |
| Sky Blue · 강조 테두리, 어두운 배경의 보조색 | `#93C5FD` |
| Light Gray · 페이지 배경                     | `#F3F6FA` |
| Charcoal · 본문과 보조 설명                  | `#4B5563` |

FO·BO·Admin은 `packages/brand/tokens.css`를 공유합니다. 표면·테두리에 사용하는 연한 색은 표준색의 UI 보조색이며 추가 CI 표준색이 아닙니다.

세 서비스의 본문·메뉴·제목과 입력창·버튼에 Pretendard Variable 웹폰트를 공통 적용합니다. `packages/brand/fonts/PretendardVariable.woff2`를 각 서비스의 빌드에 포함하여 같은 서비스에서 제공하며, 별도 CDN 설정이나 환경변수는 필요하지 않습니다. `font-display: swap`을 사용해 로딩 중에는 시스템 글꼴로 먼저 표시합니다.

폰트는 [Pretendard 공식 저장소 v1.3.9](https://github.com/orioncactus/pretendard/tree/v1.3.9)의 가변 WOFF2 원본입니다. 원본 경로는 `packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2`이며 SIL Open Font License 1.1 전문을 `packages/brand/fonts/OFL.txt`에 함께 보관합니다. 폰트 파일의 SHA-256은 `9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4`입니다.

`apps/{fo,bo}/public/brand`의 로고와 심벌은 PDF 2페이지 원본 영역을 렌더링한 이미지입니다. 로고 비율과 원본 색을 유지하며 흰 배경과 여백을 확보합니다. 원본 벡터 파일을 확보하면 같은 경로의 고해상도 에셋으로 교체할 수 있습니다.

서비스 표기는 `aiqaver.com`, 로고 표기는 가이드의 `AI QAVER`를 따릅니다. 내부 npm 워크스페이스 이름과 API 계약은 유지합니다.

검증: `npm run build -w @lawcheck/fo`, `npm run build -w @lawcheck/bo`, `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`.
기본 E2E 브라우저는 기존 Microsoft Edge이며, 환경변수로 설치된 Chrome을 선택할 수 있습니다.
