# Meeting Notes Storage - n8n Workflow

회의록을 PostgreSQL에 저장하고, Ollama 임베딩을 생성하여 Qdrant에 벡터 저장하는 워크플로우.

## 아키텍처

```
API 요청 → Webhook → PostgreSQL (원문 저장)
                          ↓
                    Ollama (임베딩 생성)
                          ↓
                    Qdrant (벡터 저장)
                          ↓
                    응답 반환
```

## 사전 준비

### 1. PostgreSQL 테이블 생성

```bash
# 서버에서 실행
psql -U postgres -d your_database -f setup-meeting-notes.sql
```

### 2. Qdrant 컬렉션 생성

```bash
# 서버에서 실행
chmod +x setup-qdrant-collection.sh
./setup-qdrant-collection.sh
```

### 3. n8n 워크플로우 import

1. n8n 웹 UI 접속 (http://222.235.28.15:5678)
2. 좌측 메뉴 → Workflows → Import
3. `meeting-notes-storage.json` 파일 선택
4. PostgreSQL Credential 설정
5. 워크플로우 Active 설정

## API 사용법

### 회의록 저장

```bash
curl -X POST http://localhost:5678/webhook/meeting-notes \
  -H "Content-Type: application/json" \
  -d '{
    "title": "주간 팀 미팅",
    "content": "1. 프로젝트 진행 상황 공유\n2. 이슈 논의\n3. 다음 주 계획",
    "meeting_date": "2025-12-12"
  }'
```

### 응답 예시

```json
{
  "success": true,
  "id": 1,
  "message": "Meeting notes saved successfully"
}
```

## 벡터 검색 (RAG 용)

저장된 회의록을 검색할 때는 Qdrant API 사용:

```bash
# 1. 검색 쿼리 임베딩 생성
EMBEDDING=$(curl -s http://localhost:11434/api/embeddings \
  -d '{"model": "nomic-embed-text", "prompt": "프로젝트 진행 상황"}' \
  | jq -c '.embedding')

# 2. Qdrant에서 유사 문서 검색
curl -X POST http://localhost:6333/collections/meeting_notes/points/search \
  -H "Content-Type: application/json" \
  -d "{
    \"vector\": $EMBEDDING,
    \"limit\": 5,
    \"with_payload\": true
  }"
```

## 트러블슈팅

### Ollama 연결 실패
- Ollama 서비스 확인: `curl http://localhost:11434/api/tags`
- nomic-embed-text 모델 확인: `ollama list`

### Qdrant 연결 실패
- Qdrant 서비스 확인: `curl http://localhost:6333/collections`
- 컬렉션 존재 확인: `curl http://localhost:6333/collections/meeting_notes`

### PostgreSQL 연결 실패
- n8n의 PostgreSQL Credential 설정 확인
- 테이블 존재 확인: `\dt meeting_notes`
