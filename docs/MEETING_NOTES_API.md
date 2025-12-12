# 회의록 저장 시스템 API 가이드

회의록을 저장하고 검색할 수 있는 API 시스템입니다.

## 접속 정보

| 서비스 | URL |
|--------|-----|
| API Base | `http://222.235.28.15:5678/webhook` |
| 웹 UI | `http://222.235.28.15:5678/webhook/meeting-notes-ui` |
| Slack | `@RTB AI Bot 회의록 [명령어]` |

---

## 웹 UI

브라우저에서 바로 접속하여 회의록을 조회하고 검색할 수 있습니다.

```
http://222.235.28.15:5678/webhook/meeting-notes-ui
```

### 기능
- 최근 회의록 목록 (최대 50개)
- 벡터 검색 (의미 기반 검색)
- 상세 내용 보기

---

## API 엔드포인트

### 1. 회의록 저장

새 회의록을 저장합니다. 자동으로 벡터 임베딩이 생성되어 검색에 사용됩니다.

```
POST /webhook/meeting-notes
Content-Type: application/json
```

#### 요청 본문

```json
{
  "title": "주간 팀 미팅",
  "content": "1. 프로젝트 진행 상황 공유\n2. 이슈 논의\n3. 다음 주 계획",
  "meeting_date": "2025-12-12",
  "type": "meeting",
  "source": "manual"
}
```

#### 필드 설명

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `title` | string | O | 회의록 제목 |
| `content` | string | O | 회의록 내용 (길이 제한 없음) |
| `meeting_date` | string | X | 회의 날짜 (YYYY-MM-DD) |
| `type` | string | X | 문서 유형 (기본값: `original`) |
| `source` | string | X | 출처 (기본값: `api`) |
| `parent_id` | number | X | 원문 ID (요약본인 경우) |

#### type 값

| 값 | 설명 |
|----|------|
| `original` | 원문 (전체 녹취/기록) |
| `summary` | AI 요약본 |
| `meeting` | 구조화된 회의록 |
| `action_items` | 액션 아이템만 |

#### source 값

| 값 | 설명 |
|----|------|
| `api` | API 호출 |
| `slack` | Slack에서 입력 |
| `manual` | 수동 입력 |
| `recording` | 녹음 변환 |

#### 응답

```json
{
  "success": true,
  "id": 1,
  "title": "주간 팀 미팅",
  "type": "meeting"
}
```

#### 예시 (curl)

```bash
curl -X POST http://222.235.28.15:5678/webhook/meeting-notes \
  -H "Content-Type: application/json" \
  -d '{
    "title": "2024년 4분기 OKR 리뷰",
    "content": "## 참석자\n- 김철수, 이영희, 박민수\n\n## 논의 내용\n1. Q4 목표 달성률 검토\n2. Q1 OKR 초안 논의\n\n## 액션 아이템\n- [ ] Q1 OKR 초안 작성 (김철수, 12/15까지)\n- [ ] 팀별 피드백 수집 (이영희, 12/18까지)",
    "meeting_date": "2025-12-12",
    "type": "meeting",
    "source": "manual"
  }'
```

---

### 2. 회의록 목록 조회

최근 회의록 20개를 조회합니다.

```
GET /webhook/meeting-notes-list
```

#### 응답

```json
{
  "success": true,
  "data": [
    {
      "id": 3,
      "title": "주간 팀 미팅",
      "type": "meeting",
      "source": "manual",
      "meeting_date": "2025-12-12",
      "created_at": "2025-12-12T10:30:00.000Z"
    },
    {
      "id": 2,
      "title": "프로젝트 킥오프",
      "type": "meeting",
      "source": "api",
      "meeting_date": "2025-12-10",
      "created_at": "2025-12-10T14:00:00.000Z"
    }
  ]
}
```

#### 예시 (curl)

```bash
curl http://222.235.28.15:5678/webhook/meeting-notes-list
```

---

### 3. 회의록 상세 조회

특정 ID의 회의록을 조회합니다.

```
GET /webhook/meeting-notes-detail?id={id}
```

#### 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `id` | number | O | 회의록 ID |

#### 응답

```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "주간 팀 미팅",
    "content": "1. 프로젝트 진행 상황 공유\n2. 이슈 논의...",
    "type": "meeting",
    "source": "manual",
    "meeting_date": "2025-12-12",
    "parent_id": null,
    "created_at": "2025-12-12T10:30:00.000Z",
    "updated_at": "2025-12-12T10:30:00.000Z"
  }
}
```

#### 예시 (curl)

```bash
curl "http://222.235.28.15:5678/webhook/meeting-notes-detail?id=1"
```

---

### 4. 회의록 검색 (벡터 검색)

의미 기반으로 관련 회의록을 검색합니다. 키워드 일치가 아닌 의미적 유사도로 검색합니다.

```
POST /webhook/meeting-notes-search
Content-Type: application/json
```

#### 요청 본문

```json
{
  "query": "OKR 목표 설정"
}
```

#### 응답

```json
{
  "success": true,
  "results": [
    {
      "id": 1,
      "score": 0.89,
      "payload": {
        "postgres_id": 1,
        "title": "2024년 4분기 OKR 리뷰",
        "content": "## 참석자\n- 김철수, 이영희...",
        "type": "meeting",
        "source": "manual",
        "meeting_date": "2025-12-12"
      }
    },
    {
      "id": 3,
      "score": 0.72,
      "payload": {
        "postgres_id": 3,
        "title": "팀 목표 수립 회의",
        "content": "...",
        "type": "meeting",
        "source": "api",
        "meeting_date": "2025-12-05"
      }
    }
  ]
}
```

#### score 설명

- `1.0`: 완전 일치
- `0.8+`: 매우 관련 있음
- `0.6-0.8`: 관련 있음
- `0.6 미만`: 약간 관련 있음

#### 예시 (curl)

```bash
curl -X POST http://222.235.28.15:5678/webhook/meeting-notes-search \
  -H "Content-Type: application/json" \
  -d '{"query": "프로젝트 일정 지연"}'
```

---

## Slack에서 사용

Slack에서 `@RTB AI Bot`을 멘션하여 사용할 수 있습니다.

```
@RTB AI Bot 회의록                    # 최근 회의록 목록
@RTB AI Bot 회의록 목록               # 최근 회의록 목록
@RTB AI Bot 회의록 검색 OKR           # "OKR" 관련 회의록 검색
@RTB AI Bot 회의록 1                  # ID 1번 회의록 상세 보기
```

---

## 사용 예시

### Python

```python
import requests

# 회의록 저장
response = requests.post(
    "http://222.235.28.15:5678/webhook/meeting-notes",
    json={
        "title": "스프린트 리뷰",
        "content": "## 완료된 작업\n- 로그인 기능 구현\n- API 연동",
        "meeting_date": "2025-12-12",
        "type": "meeting"
    }
)
print(response.json())

# 검색
response = requests.post(
    "http://222.235.28.15:5678/webhook/meeting-notes-search",
    json={"query": "스프린트 완료 작업"}
)
for result in response.json()["results"]:
    print(f"[{result['score']:.2f}] {result['payload']['title']}")
```

### JavaScript/TypeScript

```typescript
// 회의록 저장
const saveResponse = await fetch("http://222.235.28.15:5678/webhook/meeting-notes", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "데일리 스탠드업",
    content: "- 어제: API 개발 완료\n- 오늘: 테스트 작성\n- 블로커: 없음",
    meeting_date: "2025-12-12",
    type: "meeting"
  })
});
const saveResult = await saveResponse.json();
console.log("저장 완료:", saveResult.id);

// 검색
const searchResponse = await fetch("http://222.235.28.15:5678/webhook/meeting-notes-search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "API 개발" })
});
const searchResult = await searchResponse.json();
searchResult.results.forEach(r => {
  console.log(`[${(r.score * 100).toFixed(0)}%] ${r.payload.title}`);
});
```

---

## 데이터 구조

### meeting_notes 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | SERIAL | Primary Key |
| `title` | VARCHAR(255) | 제목 |
| `content` | TEXT | 내용 |
| `meeting_date` | DATE | 회의 날짜 |
| `type` | VARCHAR(50) | 문서 유형 |
| `source` | VARCHAR(50) | 출처 |
| `parent_id` | INTEGER | 원문 ID (FK) |
| `created_at` | TIMESTAMP | 생성일시 |
| `updated_at` | TIMESTAMP | 수정일시 |

### 벡터 검색 (Qdrant)

- Collection: `meeting_notes`
- Vector size: 768 (nomic-embed-text)
- Distance: Cosine similarity

---

## 문의

문제가 있거나 기능 요청이 있으면 Slack `#dev-tools` 채널로 문의해주세요.
