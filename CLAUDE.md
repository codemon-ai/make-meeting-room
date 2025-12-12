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

## Slack Bot (RTB AI Bot)

`src/slack-server.ts` - Slack Bolt 서버, Socket Mode 사용

### 명령어

#### 조회
```
@봇 회의실 오늘              # 오늘 현황
@봇 회의실 내일              # 내일 현황
@봇 회의실 251210            # 2025-12-10 현황
@봇 회의실 251210 1000       # 해당일 10:00 기준 현황
```

#### 예약
```
@봇 회의실 예약 251210 1000 R3.1 1        # 10:00~11:00 (1시간)
@봇 회의실 예약 251210 1000 R3.1 0.5      # 10:00~10:30 (30분)
@봇 회의실 예약 251210 1000 R3.1 1 "팀 미팅"  # 예약명 지정
```

#### 도움말
```
@봇 회의실 도움말
@봇 회의실 사용법
@봇 회의실 help
```

### 입력 형식

| 입력 | 의미 |
|------|------|
| `251210` | 2025-12-10 |
| `25/12/10` | 2025-12-10 (슬래시 형식) |
| `2025/12/10` | 2025-12-10 (전체 연도) |
| `오늘` | 오늘 |
| `내일` | 내일 |
| `0930` | 09:30 (4자리 필수) |
| `1430` | 14:30 |

- 러닝타임: 0.5(30분), 1(1시간), 1.5(1시간30분), 2(2시간)...
- 예약명 생략 시: "사용자닉네임 미팅" 자동 설정

### 운영

```bash
# PM2로 실행
pm2 start npm --name "mr-slack" -- run start:slack

# 로그 확인
pm2 logs mr-slack

# 재시작
pm2 restart mr-slack
```

### 서버 환경 (coffeemon@222.235.28.15)

```bash
# node/npm PATH 설정 필요
export PATH=/usr/local/bin:$PATH

# 배포
cd /Users/coffeemon/workspace/make-meeting-room
git pull
npm run build
pm2 restart mr-slack
```

### 필요 환경변수

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
```

## Google Calendar 연동

### 기능
- 회의실 예약 시 Google Calendar 일정 자동 생성 + 참석자 초대
- 회의실 없이 캘린더 일정만 생성 가능

### 명령어
```
# 회의실 예약 + 캘린더 초대
@봇 회의실 예약 251210 1000 R3.1 1 "팀 미팅" @user1 @user2

# 캘린더만 (회의실 없음)
@봇 일정 251210 1000 1 "주간 회의" @user1 @user2
```

### 인증: Service Account + 도메인 전체 위임
- `keys/rsquare.co.kr_rsquare-74c13e34d255.json` - Service Account 키
- Slack 멘션 → Slack API로 이메일 조회 → Google Calendar attendees

### 환경변수
```
GOOGLE_SERVICE_ACCOUNT_EMAIL=rtb-team@rsquare.rsquare.co.kr.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_USER=yong150@rsquare.co.kr
```

### Google Admin Console 설정 (필수)
1. admin.google.com > 보안 > API 제어 > 도메인 전체 위임
2. 클라이언트 ID: `106465973951455423387`
3. OAuth 범위: `https://www.googleapis.com/auth/calendar`

### 관련 파일
- `src/services/google-calendar.ts` - Calendar API 연동
- `src/slack-server.ts` - 일정 명령어 파싱, @멘션 처리

## RTB RAG 질문 기능

### 개요
"회의실", "일정", "회의록" 키워드 없이 질문하면 RTB 문서 기반 RAG로 답변 생성.
n8n webhook (`http://localhost:5678/webhook/rtb-assistant`)을 통해 처리.

### 명령어
```
@봇 빌딩이란?                  # RTB 용어 질문
@봇 매물 테이블 구조 알려줘     # 테이블/API 질문
@봇 딜 상태 종류가 뭐야?        # 비즈니스 로직 질문
```

### 동작 방식
1. Slack 멘션 수신
2. "회의실", "일정", "회의록" 키워드 없으면 RTB 질문으로 라우팅
3. n8n RAG webhook 호출 (60초 타임아웃)
4. 답변 메시지 업데이트

### 관련 파일
- `src/slack-server.ts` - `handleRTBQuestion` 함수
- `RTB_INTEGRATION.md` - 통합 가이드 문서

## 회의록 저장/조회 시스템

### 개요
회의록을 PostgreSQL에 저장하고 Qdrant 벡터 DB로 의미 검색을 지원.
Ollama (nomic-embed-text)로 임베딩 생성.

### Slack 명령어
```
@봇 회의록                     # 최근 목록
@봇 회의록 목록                 # 최근 목록
@봇 회의록 검색 OKR             # 벡터 검색
@봇 회의록 7                    # ID 7번 상세 조회
```

### API 엔드포인트
| Endpoint | Method | 설명 |
|----------|--------|------|
| `/webhook/meeting-notes` | POST | 회의록 저장 |
| `/webhook/meeting-notes-list` | GET | 목록 조회 |
| `/webhook/meeting-notes-detail?id=N` | GET | 상세 조회 |
| `/webhook/meeting-notes-search` | POST | 벡터 검색 |
| `/webhook/meeting-notes-ui` | GET | 웹 UI |
| `/webhook/meeting-notes-reindex` | POST | 전체 재색인 |

### n8n 워크플로우
- `n8n-workflows/meeting-notes-storage.json` - 저장 (PostgreSQL + Ollama + Qdrant)
- `n8n-workflows/meeting-notes-query.json` - 조회/검색
- `n8n-workflows/meeting-notes-ui.json` - 웹 UI
- `n8n-workflows/meeting-notes-reindex.json` - 재색인

### Docker 컨테이너 (222.235.28.15)
- `postgres` - PostgreSQL (meeting_notes 테이블)
- `ollama` - Ollama (nomic-embed-text 모델)
- `qdrant` - Qdrant (meeting_notes 컬렉션)
- `n8n` - n8n 워크플로우

### 테스트
```bash
bash n8n-workflows/test-api.sh all      # 전체 테스트
bash n8n-workflows/test-api.sh reindex  # 재색인
```

### 관련 문서
- `docs/MEETING_NOTES_API.md` - API 개발자 가이드

## 예정된 작업

### Public 배포
- 레포 public 전환 후 curl 설치 가능
- `curl -fsSL https://raw.githubusercontent.com/dev-rsquare/make-meeting-room/main/install.sh | bash`
