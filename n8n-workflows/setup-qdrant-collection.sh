#!/bin/bash
# Qdrant 컬렉션 생성
# 서버에서 실행: bash setup-qdrant-collection.sh

QDRANT_URL="http://localhost:6333"
COLLECTION_NAME="meeting_notes"

# nomic-embed-text 모델은 768 차원 벡터 생성
VECTOR_SIZE=768

echo "Creating Qdrant collection: $COLLECTION_NAME"

curl -X PUT "${QDRANT_URL}/collections/${COLLECTION_NAME}" \
  -H "Content-Type: application/json" \
  -d "{
    \"vectors\": {
      \"size\": ${VECTOR_SIZE},
      \"distance\": \"Cosine\"
    }
  }"

echo ""
echo "Collection created successfully!"
echo ""

# 컬렉션 정보 확인
echo "Collection info:"
curl -s "${QDRANT_URL}/collections/${COLLECTION_NAME}" | python3 -m json.tool 2>/dev/null || curl -s "${QDRANT_URL}/collections/${COLLECTION_NAME}"
