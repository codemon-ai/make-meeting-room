# 회의실 예약 CLI

그룹웨어(gw.rsquare.co.kr) 회의실 예약 현황 조회 및 예약 자동화 CLI 도구

## 기능

- 회의실 예약 현황 조회 (오늘/내일/특정 날짜)
- 회의실 예약 (대화형 모드 / 직접 지정)
- Headless 모드 지원 (서버 환경)

### 예정된 기능

- [ ] Google Calendar 연동
- [ ] Slack Bot 연동 (RTB AI Bot)

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
GW_USER_ID=your_user_id
GW_PASSWORD=your_password
```

## 사용법

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

### 특정 시간대 조회

```bash
# 오늘 10:00-11:00 가능한 회의실
npm start -- --check today --time 10:00-11:00
```

### 직접 예약

```bash
npm start -- --date today --time 10:00-11:00 --room R3.1 --title "팀 미팅"
```

### 대화형 모드

```bash
npm start
```

날짜 선택 → 회의실 현황 확인 → 회의실 선택 → 시간 선택 → 예약명 입력 → 예약 완료

## 회의실 목록

| 회의실 | 층 | 위치 |
|--------|-----|------|
| R2.1 | 2F | 가산빌딩 |
| R2.2 | 2F | 가산빌딩 |
| R3.1 | 3F | 가산빌딩 |
| R3.2 | 3F | 가산빌딩 |
| R3.3 | 3F | 가산빌딩 |
| R3.5 | 3F | 가산빌딩 |

## 개발

```bash
# 개발 모드 (TypeScript 직접 실행)
npm run dev -- --check today

# 빌드
npm run build
```

## 프로젝트 구조

```
src/
├── index.ts                    # CLI 엔트리포인트
├── config.ts                   # 설정 (회의실 목록, 업무시간 등)
├── types/
│   └── index.ts                # TypeScript 타입 정의
├── services/
│   ├── groupware-browser.ts    # Playwright 기반 그룹웨어 서비스
│   ├── display.ts              # CLI 출력 포맷팅
│   └── slack-format.ts         # Slack 메시지 포맷 (예정)
├── utils/
│   └── date.ts                 # 날짜/시간 유틸리티
└── slack-server.ts             # Slack Bot 서버 (예정)
```

## 기술 스택

- Node.js + TypeScript
- Playwright (브라우저 자동화)
- Commander.js (CLI 파서)
- Inquirer.js (대화형 프롬프트)
- Chalk (터미널 색상)
