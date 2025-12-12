#!/bin/bash

# 회의록 API 테스트 스크립트
# 사용법: ./test-api.sh [command] [args]

BASE_URL="${BASE_URL:-http://222.235.28.15:5678/webhook}"

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
  echo ""
  echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
  echo -e "${GREEN}$1${NC}"
}

print_error() {
  echo -e "${RED}$1${NC}"
}

case "$1" in
  save|insert|add)
    TITLE="${2:-테스트 회의록}"
    CONTENT="${3:-테스트 내용입니다.}"
    print_header "회의록 저장"
    curl -s -X POST "$BASE_URL/meeting-notes" \
      -H "Content-Type: application/json" \
      -d "{
        \"title\": \"$TITLE\",
        \"content\": \"$CONTENT\",
        \"meeting_date\": \"$(date +%Y-%m-%d)\",
        \"type\": \"meeting\",
        \"source\": \"manual\"
      }" | python3 -m json.tool 2>/dev/null || cat
    echo ""
    ;;

  list)
    print_header "회의록 목록 조회"
    curl -s "$BASE_URL/meeting-notes-list" | python3 -m json.tool 2>/dev/null || cat
    echo ""
    ;;

  detail)
    ID="${2:-1}"
    print_header "회의록 상세 조회 (ID: $ID)"
    curl -s "$BASE_URL/meeting-notes-detail?id=$ID" | python3 -m json.tool 2>/dev/null || cat
    echo ""
    ;;

  search)
    QUERY="${2:-OKR}"
    print_header "회의록 검색 (Query: $QUERY)"
    curl -s -X POST "$BASE_URL/meeting-notes-search" \
      -H "Content-Type: application/json" \
      -d "{\"query\": \"$QUERY\"}" | python3 -m json.tool 2>/dev/null || cat
    echo ""
    ;;

  ui)
    print_header "웹 UI"
    echo "브라우저에서 열기: $BASE_URL/meeting-notes-ui"
    ;;

  all)
    print_header "전체 API 테스트"

    # 1. 저장
    echo -e "\n${BLUE}[1/4] 회의록 저장${NC}"
    SAVE_RESULT=$(curl -s -X POST "$BASE_URL/meeting-notes" \
      -H "Content-Type: application/json" \
      -d "{
        \"title\": \"API 테스트 - $(date +%H:%M:%S)\",
        \"content\": \"자동 테스트로 생성된 회의록입니다.\n\n## 테스트 항목\n- 저장\n- 목록 조회\n- 상세 조회\n- 검색\",
        \"meeting_date\": \"$(date +%Y-%m-%d)\",
        \"type\": \"meeting\",
        \"source\": \"test\"
      }")
    echo "$SAVE_RESULT" | python3 -m json.tool 2>/dev/null || echo "$SAVE_RESULT"

    # ID 추출
    NEW_ID=$(echo "$SAVE_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', 1))" 2>/dev/null || echo "1")

    # 2. 목록
    echo -e "\n${BLUE}[2/4] 목록 조회${NC}"
    curl -s "$BASE_URL/meeting-notes-list" | python3 -m json.tool 2>/dev/null || cat

    # 3. 상세
    echo -e "\n${BLUE}[3/4] 상세 조회 (ID: $NEW_ID)${NC}"
    curl -s "$BASE_URL/meeting-notes-detail?id=$NEW_ID" | python3 -m json.tool 2>/dev/null || cat

    # 4. 검색
    echo -e "\n${BLUE}[4/4] 벡터 검색 (Query: 테스트)${NC}"
    curl -s -X POST "$BASE_URL/meeting-notes-search" \
      -H "Content-Type: application/json" \
      -d '{"query": "테스트"}' | python3 -m json.tool 2>/dev/null || cat

    echo -e "\n${GREEN}전체 테스트 완료!${NC}"
    ;;

  ollama)
    print_header "Ollama 연결 테스트"
    echo "Note: Docker 내부에서만 접근 가능 (ollama:11434)"
    curl -s "http://localhost:11434/api/tags" 2>/dev/null | python3 -m json.tool || echo "localhost에서 접근 불가 (Docker 내부 전용)"
    ;;

  qdrant)
    print_header "Qdrant 연결 테스트"
    echo "Note: Docker 내부에서만 접근 가능 (qdrant:6333)"
    curl -s "http://localhost:6333/collections/meeting_notes" 2>/dev/null | python3 -m json.tool || echo "localhost에서 접근 불가 (Docker 내부 전용)"
    ;;

  reindex)
    print_header "회의록 재색인"
    echo "PostgreSQL → Ollama → Qdrant 전체 재색인 실행..."
    curl -s -X POST "$BASE_URL/meeting-notes-reindex" \
      -H "Content-Type: application/json" \
      -d '{}' | python3 -m json.tool 2>/dev/null || cat
    echo ""
    ;;

  *)
    echo "회의록 API 테스트 스크립트"
    echo ""
    echo "사용법: $0 [command] [args]"
    echo ""
    echo "Commands:"
    echo "  save [title] [content]  회의록 저장"
    echo "  list                    회의록 목록 조회"
    echo "  detail [id]             회의록 상세 조회 (기본: 1)"
    echo "  search [query]          회의록 벡터 검색 (기본: OKR)"
    echo "  ui                      웹 UI URL 출력"
    echo "  all                     전체 API 테스트 (저장→목록→상세→검색)"
    echo "  reindex                 전체 데이터 재색인 (Qdrant)"
    echo "  ollama                  Ollama 연결 테스트"
    echo "  qdrant                  Qdrant 연결 테스트"
    echo ""
    echo "환경변수:"
    echo "  BASE_URL                API 베이스 URL (기본: http://222.235.28.15:5678/webhook)"
    echo ""
    echo "예시:"
    echo "  $0 all                              # 전체 테스트"
    echo "  $0 save \"주간 회의\" \"내용...\"       # 회의록 저장"
    echo "  $0 search \"프로젝트 일정\"           # 검색"
    echo "  $0 detail 6                         # ID 6 상세 조회"
    ;;
esac
