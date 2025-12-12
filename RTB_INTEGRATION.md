# RTB RAG 기능 통합 가이드

## 개요

기존 회의실 예약 봇에 RTB(부동산 중개 시스템) 문서 기반 RAG 질문 기능을 통합합니다.

### 배경
- Slack Socket Mode는 하나의 App Token으로 하나의 WebSocket 연결만 유지
- 별도 봇으로 운영 시 토큰 충돌 발생
- 기존 봇에 통합하여 해결

### 동작 방식
```
@봇 회의실 오늘              → 기존: 회의실 조회
@봇 회의실 예약 ...          → 기존: 회의실 예약
@봇 빌딩이란?                → 신규: RTB RAG 질문
@봇 매물 테이블 구조 알려줘   → 신규: RTB RAG 질문
```

---

## 수정 파일

| 파일 | 수정 내용 |
|------|----------|
| `src/slack-server.ts` | ParsedCommand 타입, parseCommand 함수, RTB 핸들러 |
| `src/services/slack-format.ts` | 도움말 메시지에 RTB 사용법 추가 |

---

## 1. slack-server.ts 수정

### 1.1 ParsedCommand 인터페이스 확장 (~40줄)

**현재:**
```typescript
interface ParsedCommand {
  type: 'check' | 'reserve' | 'schedule' | 'help' | 'unknown';
  date?: string;
  time?: string;
  room?: string;
  duration?: number;
  title?: string;
  attendeeIds?: string[];
  error?: string;
}
```

**수정:**
```typescript
interface ParsedCommand {
  type: 'check' | 'reserve' | 'schedule' | 'help' | 'rtb' | 'unknown';  // 'rtb' 추가
  date?: string;
  time?: string;
  room?: string;
  duration?: number;
  title?: string;
  attendeeIds?: string[];
  question?: string;  // RTB 질문 내용 추가
  error?: string;
}
```

### 1.2 parseCommand 함수 수정 (~114-117줄)

**현재:**
```typescript
// "회의실" 또는 "일정" 키워드가 없으면 unknown
if (!cleanText.includes('회의실') && !cleanText.includes('일정')) {
  return { type: 'unknown' };
}
```

**수정:**
```typescript
// "회의실" 또는 "일정" 키워드가 없으면 RTB 질문으로 처리
if (!cleanText.includes('회의실') && !cleanText.includes('일정')) {
  const question = cleanText.trim();
  if (question.length > 0) {
    return { type: 'rtb', question };
  }
  return { type: 'unknown' };
}
```

### 1.3 app_mention 핸들러에 RTB 라우팅 추가 (~279줄 뒤, schedule 핸들러 다음)

**추가:**
```typescript
  // RTB 질문 명령
  if (command.type === 'rtb' && command.question) {
    await handleRTBQuestion(
      event.channel,
      threadTs,
      client,
      say,
      command.question
    );
    return;
  }
});
```

### 1.4 handleRTBQuestion 함수 추가 (파일 하단, handleSchedule 함수 뒤)

```typescript
import axios from 'axios';  // 파일 상단에 import 추가

// ... 기존 코드 ...

/**
 * RTB RAG 질문 핸들러
 * n8n webhook을 통해 Claude API로 질문 전달
 */
async function handleRTBQuestion(
  channel: string,
  threadTs: string,
  client: typeof app.client,
  say: (args: { text: string; thread_ts: string }) => Promise<{ ts?: string }>,
  question: string
) {
  // 로딩 메시지
  const loadingMsg = await say({
    text: '🔍 RTB 문서에서 답변 생성 중...',
    thread_ts: threadTs,
  });

  try {
    // n8n RAG webhook 호출 (서버 내부 통신이므로 localhost 사용)
    const response = await axios.post(
      'http://localhost:5678/webhook/rtb-assistant',
      { question },
      {
        timeout: 60000,  // 60초 타임아웃
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const answer = response.data?.answer || '답변을 생성할 수 없습니다.';

    // 답변 메시지로 업데이트
    await client.chat.update({
      channel,
      ts: loadingMsg.ts!,
      text: answer,
    });

    console.log(`[RTB] 질문: ${question.substring(0, 50)}...`);
  } catch (error) {
    console.error('[RTB] 오류:', error);

    const errorMessage = axios.isAxiosError(error)
      ? `❌ RTB 답변 생성 실패 (${error.response?.status || 'timeout'})`
      : '❌ RTB 답변 생성 중 오류가 발생했습니다.';

    await client.chat.update({
      channel,
      ts: loadingMsg.ts!,
      text: errorMessage,
    });
  }
}
```

---

## 2. slack-format.ts 수정

### 2.1 formatHelpMessage 함수에 RTB 사용법 추가

**현재 도움말에 추가:**
```typescript
export function formatHelpMessage(): string {
  return [
    '*🏢 회의실 예약 봇 사용법*',
    '',
    // ... 기존 회의실 관련 도움말 ...
    '',
    '*📚 RTB 문서 질문*',
    '`@봇 빌딩이란?` - RTB 용어 질문',
    '`@봇 매물 테이블 구조 알려줘` - 테이블/API 질문',
    '`@봇 딜 상태 종류가 뭐야?` - 비즈니스 로직 질문',
    '',
    '💡 "회의실", "일정" 키워드 없이 질문하면 RTB 문서 기반으로 답변합니다.',
  ].join('\n');
}
```

---

## 3. 의존성 확인

`package.json`에 axios가 이미 있는지 확인:

```bash
npm list axios
```

없으면 설치:
```bash
npm install axios
```

---

## 4. 배포 순서

### Step 1: 기존 rtb-slack-bot 중지 (서버에서)
```bash
export PATH=/usr/local/bin:$PATH
pm2 stop rtb-slack-bot
pm2 delete rtb-slack-bot
pm2 save
```

### Step 2: 로컬에서 코드 수정 및 빌드 테스트
```bash
cd /Users/yong150/workspace/codemon/make-meeting-room
# 위 수정 사항 적용 후
npm run build
```

### Step 3: Git 커밋 및 Push
```bash
git add -A
git commit -m "feat: RTB RAG 질문 기능 통합"
git push
```

### Step 4: 서버에 배포
```bash
ssh coffeemon@222.235.28.15 "cd /Users/coffeemon/workspace/make-meeting-room && git pull"
ssh coffeemon@222.235.28.15 "export PATH=/usr/local/bin:\$PATH && cd /Users/coffeemon/workspace/make-meeting-room && npm run build"
ssh coffeemon@222.235.28.15 "export PATH=/usr/local/bin:\$PATH && pm2 restart mr-slack"
```

### Step 5: 로그 확인
```bash
ssh coffeemon@222.235.28.15 "export PATH=/usr/local/bin:\$PATH && pm2 logs mr-slack --lines 20"
```

---

## 5. 테스트

슬랙에서 봇 멘션:

```
# 기존 기능 테스트
@봇 회의실 오늘
@봇 회의실 도움말

# RTB 질문 테스트
@봇 빌딩이란?
@봇 매물 테이블 구조 알려줘
@봇 딜 상태 종류가 뭐야?
@봇 인증 절차가 어떻게 되나요?
```

---

## 6. n8n 워크플로우 확인

RTB 질문이 작동하려면 n8n에서 `RTB RAG Assistant` 워크플로우가 **Active** 상태여야 합니다.

- n8n URL: http://222.235.28.15:5678
- Webhook path: `/webhook/rtb-assistant`
- 입력: `{ "question": "질문 내용" }`
- 출력: `{ "answer": "답변 내용", ... }`

---

## 7. 트러블슈팅

### RTB 질문에 응답이 없음
1. n8n 워크플로우가 Active인지 확인
2. PM2 로그 확인: `pm2 logs mr-slack`
3. n8n 로그 확인

### 타임아웃 발생
- 현재 60초 타임아웃 설정
- 대용량 문서 처리 시 시간이 오래 걸릴 수 있음
- 필요시 타임아웃 값 조정

### 기존 회의실 기능 동작 안함
- parseCommand 함수의 조건 순서 확인
- "회의실", "일정" 키워드 체크가 RTB 분기보다 먼저 와야 함
