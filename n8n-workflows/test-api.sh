#!/bin/bash

# 회의록 API 테스트 스크립트
# 사용법: ./test-api.sh [command]
# 서버에서 실행: ssh coffeemon@222.235.28.15 'bash -s' < test-api.sh [command]

BASE_URL="${BASE_URL:-http://localhost:5678/webhook}"

case "$1" in
  save|insert|add)
    echo "=== 회의록 저장 테스트 ==="
    curl -s -X POST "$BASE_URL/meeting-notes" \
      -H "Content-Type: application/json" \
      -d '{
        "title": "2024년 4분기 OKR 리뷰",
        "content": "참석자: 김철수, 이영희, 박민수\n\n논의 내용:\n1. Q4 목표 달성률 검토 (85% 달성)\n2. Q1 OKR 초안 논의\n\n액션 아이템:\n- Q1 OKR 초안 작성 (김철수, 12/15까지)",
        "meeting_date": "2025-12-12",
        "type": "meeting",
        "source": "manual"
      }'
    echo ""
    ;;

  list)
    echo "=== 회의록 목록 조회 ==="
    curl -s "$BASE_URL/meeting-notes-list"
    echo ""
    ;;

  detail)
    ID="${2:-1}"
    echo "=== 회의록 상세 조회 (ID: $ID) ==="
    curl -s "$BASE_URL/meeting-notes-detail?id=$ID"
    echo ""
    ;;

  search)
    QUERY="${2:-OKR}"
    echo "=== 회의록 검색 (Query: $QUERY) ==="
    curl -s -X POST "$BASE_URL/meeting-notes-search" \
      -H "Content-Type: application/json" \
      -d "{\"query\": \"$QUERY\"}"
    echo ""
    ;;

  ui)
    echo "=== 웹 UI 접속 ==="
    echo "브라우저에서 열기: $BASE_URL/meeting-notes-ui"
    ;;

  ollama)
    echo "=== Ollama 연결 테스트 ==="
    curl -s "http://localhost:11434/api/tags"
    echo ""
    ;;

  qdrant)
    echo "=== Qdrant 연결 테스트 ==="
    curl -s "http://localhost:6333/collections/meeting_notes"
    echo ""
    ;;

  postgres)
    echo "=== PostgreSQL 데이터 확인 ==="
    docker exec postgres psql -U admin -d maindb -c "SELECT id, title, type, source, created_at FROM meeting_notes ORDER BY id DESC LIMIT 5;"
    ;;

  *)
    echo "회의록 API 테스트 스크립트"
    echo ""
    echo "사용법: $0 [command] [args]"
    echo ""
    echo "Commands:"
    echo "  save              회의록 저장 테스트"
    echo "  list              회의록 목록 조회"
    echo "  detail [id]       회의록 상세 조회 (기본: 1)"
    echo "  search [query]    회의록 검색 (기본: OKR)"
    echo "  ui                웹 UI URL 출력"
    echo "  ollama            Ollama 연결 테스트"
    echo "  qdrant            Qdrant 연결 테스트"
    echo "  postgres          PostgreSQL 데이터 확인"
    echo ""
    echo "환경변수:"
    echo "  BASE_URL          API 베이스 URL (기본: http://localhost:5678/webhook)"
    echo ""
    echo "예시:"
    echo "  $0 save"
    echo "  $0 search 프로젝트"
    echo "  BASE_URL=http://222.235.28.15:5678/webhook $0 list"
    ;;
esac
