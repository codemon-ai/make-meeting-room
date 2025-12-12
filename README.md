# 회의실 예약 CLI & Slack Bot

그룹웨어(gw.rsquare.co.kr) 회의실 예약 현황 조회 및 예약 자동화 CLI/Slack Bot

## 기능

- 회의실 예약 현황 조회 (오늘/내일/특정 날짜)
- 회의실 예약 (대화형 모드 / 직접 지정)
- Google Calendar 연동 (일정 생성 + 참석자 초대)
- RTB 문서 기반 RAG 질문 응답
- 회의록 저장/조회/검색 (벡터 DB)
- Headless 모드 지원 (서버 환경)

## 설치

```bash
npm install
npx playwright install chromium
npm run build
```

## 환경 설정

`.env` 파일 생성:

```bash
cp .env.example .env
```

`.env` 파일 편집:

```env
# 그룹웨어 로그인
GW_USER_ID=your_user_id
GW_PASSWORD=your_password

# Slack Bot
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...

# Google Calendar (선택)
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_USER=user@rsquare.co.kr
```

## CLI 사용법

### 회의실 현황 조회

```bash
# 오늘 회의실 현황
npm start -- --check today

# 내일 회의실 현황
npm start -- --check tomorrow

# 특정 날짜 회의실 현황
npm start -- --check 2025-12-10

# Headless 모드 (브라우저 창 안 띄움)
npm start -- --check today --headless
```

### 직접 예약

```bash
npm start -- --date today --time 10:00-11:00 --room R3.1 --title "팀 미팅"
```

## Slack Bot 사용법

### 회의실 조회

```
@봇 회의실 오늘              # 오늘 현황
@봇 회의실 내일              # 내일 현황
@봇 회의실 251210            # 2025-12-10 현황
@봇 회의실 251210 1000       # 해당일 10:00 기준 현황
```

### 회의실 예약 (+ 캘린더 초대)

```
@봇 회의실 예약 251210 1000 R3.1 1              # 10:00~11:00 (1시간)
@봇 회의실 예약 251210 1000 R3.1 0.5            # 10:00~10:30 (30분)
@봇 회의실 예약 251210 1000 R3.1 1 "팀 미팅"    # 예약명 지정
@봇 회의실 예약 251210 1000 R3.1 1 "팀 미팅" @user1 @user2  # 참석자 초대
```

### 캘린더 일정 (회의실 없이)

```
@봇 일정 251210 1000 1 "주간 회의" @user1 @user2
```

### 회의록

```
@봇 회의록                   # 최근 회의록 목록
@봇 회의록 목록              # 최근 회의록 목록
@봇 회의록 검색 OKR          # 벡터 검색
@봇 회의록 1                 # ID 1번 상세 조회
```

### RTB 문서 질문

```
@봇 빌딩이란?                # RTB 용어 질문
@봇 매물 테이블 구조 알려줘   # 테이블/API 질문
@봇 딜 상태 종류가 뭐야?      # 비즈니스 로직 질문
```

> "회의실", "일정", "회의록" 키워드 없이 질문하면 RTB 문서 기반으로 답변합니다.

### 도움말

```
@봇 회의실 도움말
@봇 회의실 help
```

### 입력 형식

| 입력 | 의미 |
|------|------|
| `251210` | 2025-12-10 |
| `25/12/10` | 2025-12-10 (슬래시 형식) |
| `오늘` | 오늘 |
| `내일` | 내일 |
| `0930` | 09:30 (4자리 필수) |
| `1430` | 14:30 |
| `0.5` | 30분 |
| `1` | 1시간 |
| `1.5` | 1시간 30분 |

## 회의실 목록

| 회의실 | 층 | 위치 |
|--------|-----|------|
| R2.1 | 2F | 가산빌딩 |
| R2.2 | 2F | 가산빌딩 |
| R3.1 | 3F | 가산빌딩 |
| R3.2 | 3F | 가산빌딩 |
| R3.3 | 3F | 가산빌딩 |
| R3.5 | 3F | 가산빌딩 |

## Slack Bot 운영 (PM2)

### 시작

```bash
pm2 start npm --name "mr-slack" -- run slack
```

### 관리

```bash
pm2 status              # 상태 확인
pm2 logs mr-slack       # 로그 확인
pm2 restart mr-slack    # 재시작
pm2 stop mr-slack       # 중지
```

### 부팅 시 자동 시작

```bash
pm2 startup
pm2 save
```

## 회의록 시스템 (n8n)

회의록 저장/조회 기능은 n8n 워크플로우가 필요합니다.

### 사전 요구사항

- PostgreSQL (`meeting_notes` 테이블)
- Qdrant (벡터 DB)
- Ollama (`nomic-embed-text` 모델)
- n8n

### n8n 워크플로우 import

1. n8n 웹 UI 접속
2. Workflows → Import from File
3. `n8n-workflows/` 폴더의 JSON 파일 import:
   - `meeting-notes-storage.json` - 저장 API
   - `meeting-notes-query.json` - 조회/검색 API
   - `meeting-notes-ui.json` - 웹 UI
4. PostgreSQL Credential 설정
5. 각 워크플로우 Active

### API 엔드포인트

| Endpoint | 설명 |
|----------|------|
| `POST /webhook/meeting-notes` | 회의록 저장 |
| `GET /webhook/meeting-notes-list` | 목록 조회 |
| `GET /webhook/meeting-notes-detail?id=N` | 단건 조회 |
| `POST /webhook/meeting-notes-search` | 벡터 검색 |
| `GET /webhook/meeting-notes-ui` | 웹 UI |

### 회의록 저장 예시

```bash
curl -X POST http://localhost:5678/webhook/meeting-notes \
  -H "Content-Type: application/json" \
  -d '{
    "title": "주간 팀 미팅",
    "content": "1. 프로젝트 진행 상황\n2. 이슈 논의",
    "meeting_date": "2025-12-12",
    "type": "meeting",
    "source": "manual"
  }'
```

## 프로젝트 구조

```
src/
├── index.ts                    # CLI 엔트리포인트
├── config.ts                   # 설정 (회의실 목록, 업무시간 등)
├── slack-server.ts             # Slack Bot 서버
├── types/
│   └── index.ts                # TypeScript 타입 정의
├── services/
│   ├── groupware-browser.ts    # Playwright 기반 그룹웨어 서비스
│   ├── google-calendar.ts      # Google Calendar 연동
│   ├── display.ts              # CLI 출력 포맷팅
│   └── slack-format.ts         # Slack 메시지 포맷 + 마크다운 변환
├── utils/
│   └── date.ts                 # 날짜/시간 유틸리티
n8n-workflows/
├── meeting-notes-storage.json  # 회의록 저장 워크플로우
├── meeting-notes-query.json    # 회의록 조회 워크플로우
├── meeting-notes-ui.json       # 회의록 웹 UI 워크플로우
└── README.md                   # n8n 설정 가이드
```

## 기술 스택

- Node.js + TypeScript
- Playwright (브라우저 자동화)
- Commander.js (CLI 파서)
- Inquirer.js (대화형 프롬프트)
- Chalk (터미널 색상)
- Slack Bolt (Slack Bot, Socket Mode)
- Google Calendar API (Service Account)
- PostgreSQL + Qdrant + Ollama (회의록 RAG)
- n8n (워크플로우 자동화)
