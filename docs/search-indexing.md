# FO·BO·Admin 검색엔진 노출 설정

세 앱 모두 기본적으로 검색 결과에 색인되지 않도록 설정합니다. 각 앱의 `SEARCH_ENGINE_INDEXING_ENABLED` 환경변수로 변경합니다.

| 값                                | 동작                                 |
| --------------------------------- | ------------------------------------ |
| `false`, 미설정, 빈 값, 잘못된 값 | 검색 색인 차단 (`noindex, nofollow`) |
| `true`                            | 검색 색인 허용 (`index, follow`)     |

값 앞뒤 공백과 대소문자는 무시합니다. API나 DB 설정은 필요하지 않습니다.

## 로컬 개발

저장소 루트 `.env`에 아래 값을 추가하고 `npm run dev`를 재시작합니다.

```dotenv
SEARCH_ENGINE_INDEXING_ENABLED=false
```

로컬 개발·빌드에서는 루트 `.env`를 공통 기본값으로 사용합니다. 각 앱의 `.env` 또는 `.env.[mode]`로 해당 앱만 덮어쓸 수 있으며, 실행 프로세스의 환경변수가 최우선입니다. 예를 들어 `apps/fo/.env`에 `SEARCH_ENGINE_INDEXING_ENABLED=true`를 두면 FO만 허용할 수 있습니다. 환경변수는 브라우저 코드에 노출하지 않습니다.

## Railway / 배포

1. FO·BO·Admin 각 서비스의 Variables에 `SEARCH_ENGINE_INDEXING_ENABLED=false`를 설정합니다. 생략해도 차단합니다.
2. 추후 검색을 허용할 서비스만 `SEARCH_ENGINE_INDEXING_ENABLED=true`로 바꿉니다.
3. 변경한 값이 빌드와 실행 환경 모두에 적용되도록 **재빌드·재배포**합니다. 실행 중인 preview만 재시작하면 이전 빌드의 HTML 태그는 바뀌지 않습니다.

배포용 preview는 실행 환경변수만 읽으며 로컬 `.env`는 사용하지 않습니다. 정적 호스팅에 `dist`만 올리는 경우에도 환경변수를 바꾼 뒤 다시 빌드하여 업로드해야 합니다. `.env.example`을 수정하는 것만으로 배포 설정이 바뀌지는 않습니다.

## 적용 범위와 검증

- JavaScript 실행 전부터 읽을 수 있도록 개발 HTML과 빌드된 `index.html`에 `robots` 메타 태그를 추가합니다. SPA의 하위 경로에도 동일하게 적용됩니다.
- 개발 서버와 배포용 preview는 페이지 및 정적 파일 응답에 `X-Robots-Tag` 헤더를 보냅니다.
- `/robots.txt`는 개발·preview·빌드 결과 모두 `User-agent: *`와 `Allow: /`를 제공합니다. 크롤러가 페이지의 `noindex` 지시를 읽어야 검색 결과에서 제외할 수 있기 때문입니다. `Disallow: /`로 접근까지 막으면 외부 링크만으로 URL이 검색 결과에 남을 수 있습니다. [Google 공식 noindex 안내](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- 검색 허용은 검색엔진의 색인을 허용하는 설정이며 검색 노출 시점을 보장하지 않습니다. 이미 등록된 검색 결과의 제외도 검색엔진의 재수집 이후 반영됩니다. [Google 공식 처리 안내](https://developers.google.com/search/docs/crawling-indexing/block-indexing#debugging)

`npm run test:search-indexing`은 DB 없이 FO·BO·Admin의 개발 서버, 빌드 HTML, preview 응답을 검사합니다. 기본 차단, 명시적 차단, 허용, 잘못된 값, 하위 경로, HEAD 요청, 정적 파일 및 `robots.txt`를 확인합니다.
