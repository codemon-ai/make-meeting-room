# 회의실 예약 CLI - 프로젝트 컨텍스트

## 개요

그룹웨어(gw.rsquare.co.kr) 회의실 예약 현황을 조회하고 예약하는 CLI 도구.
Playwright를 사용하여 브라우저 자동화로 그룹웨어에 로그인하고 API를 호출한다.

## 핵심 파일

- `src/index.ts` - CLI 엔트리포인트, Commander.js로 옵션 파싱
- `src/services/groupware-browser.ts` - 그룹웨어 로그인 및 API 호출 (핵심 로직)
- `src/config.ts` - 회의실 목록, 업무시간 설정
- `src/types/index.ts` - TypeScript 타입 정의

## 그룹웨어 API

### 예약 조회 API

```
POST /schedule/WebResource/GetCalResourceListFull
Body: { start: "YYYY-MM-DDTHH:mm:ss", end: "YYYY-MM-DDTHH:mm:ss", favoriteYn: "N" }
```

응답의 `result.resList`에서 각 예약 정보 추출:
- `resName`: 회의실 이름
- `startDate`: 시작 시간 (로컬 형식: "2025-12-05 10:00:00")
- `resEndDate`: 종료 시간 (ISO 형식: "2025-12-05T10:30:00.000Z")
- `empName`: 예약자 이름

### 예약 생성 API

```
POST /schedule/WebResource/InsertResourceReservation
```

## 주의사항

- 로그인 후 `일정` → `회의실예약` 메뉴로 이동해야 API 호출 가능
- API는 서버에서 날짜 필터링을 하지 않음 → 클라이언트에서 필터링 필요
- `endDate` 필드가 비어있는 경우 `resEndDate` (ISO 형식) 사용

## 빌드 및 실행

```bash
npm run build           # TypeScript 컴파일
npm start -- --check today --headless  # 실행
```

## 예정된 작업

### Google Calendar 연동
- `--calendar` 옵션으로 예약 시 Google Calendar에 자동 등록
- OAuth2 인증 필요 (credentials.json, token.json)

### Slack Bot 연동 (RTB AI Bot)
- `src/slack-server.ts` - Slack Bolt 서버 구현 완료
- Socket Mode 사용 (포트 오픈 불필요)
- 개인 Mac에서 PM2로 상시 운영 예정
- 사용법: `@봇이름 회의실 [오늘|내일|YYYY-MM-DD]`
