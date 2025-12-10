#!/bin/bash

# 회의실 예약 CLI (mr) 설치 스크립트
# 사용법: curl -fsSL https://raw.githubusercontent.com/dev-rsquare/make-meeting-room/main/install.sh | bash

set -e

echo ""
echo "🏢 회의실 예약 CLI (mr) 설치를 시작합니다..."
echo ""

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 설치 디렉토리
INSTALL_DIR="$HOME/.mr-meeting-room"
BIN_DIR="/usr/local/bin"

# 1. Node.js 설치 확인
echo "📦 Node.js 확인 중..."
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js가 설치되어 있지 않습니다.${NC}"

    # Homebrew 확인
    if ! command -v brew &> /dev/null; then
        echo -e "${RED}Homebrew가 필요합니다. 먼저 Homebrew를 설치하세요:${NC}"
        echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        exit 1
    fi

    echo "Homebrew로 Node.js를 설치합니다..."
    brew install node
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js $NODE_VERSION${NC}"

# 2. 기존 설치 제거
if [ -d "$INSTALL_DIR" ]; then
    echo "기존 설치를 업데이트합니다..."
    rm -rf "$INSTALL_DIR"
fi

# 3. 레포지토리 클론
echo ""
echo "📥 프로젝트 다운로드 중..."
git clone --depth 1 https://github.com/dev-rsquare/make-meeting-room.git "$INSTALL_DIR" 2>/dev/null || {
    echo -e "${RED}다운로드 실패. Git이 설치되어 있는지 확인하세요.${NC}"
    exit 1
}
echo -e "${GREEN}✓ 다운로드 완료${NC}"

# 4. 의존성 설치
echo ""
echo "📦 의존성 설치 중..."
cd "$INSTALL_DIR"
npm install --silent
echo -e "${GREEN}✓ 의존성 설치 완료${NC}"

# 5. TypeScript 빌드
echo ""
echo "🔨 빌드 중..."
npm run build --silent
echo -e "${GREEN}✓ 빌드 완료${NC}"

# 6. Playwright 브라우저 설치
echo ""
echo "🌐 브라우저 설치 중... (시간이 좀 걸릴 수 있습니다)"
npx playwright install chromium
echo -e "${GREEN}✓ 브라우저 설치 완료${NC}"

# 7. mr 명령어 등록
echo ""
echo "⚙️  명령어 등록 중..."

# bin/mr이 있으면 사용, 없으면 직접 생성
if [ ! -f "$INSTALL_DIR/bin/mr" ]; then
    mkdir -p "$INSTALL_DIR/bin"
    cat > "$INSTALL_DIR/bin/mr" << 'EOF'
#!/bin/bash
# 회의실 예약 CLI 실행 래퍼

INSTALL_DIR="$HOME/.mr-meeting-room"

# headless 모드 기본 활성화
export MR_HEADLESS=true

# Node.js로 실행
cd "$INSTALL_DIR"
node dist/index.js "$@"
EOF
    chmod +x "$INSTALL_DIR/bin/mr"
fi

# /usr/local/bin에 심링크 생성
if [ -L "$BIN_DIR/mr" ]; then
    rm "$BIN_DIR/mr"
fi

# sudo 필요 여부 확인
if [ -w "$BIN_DIR" ]; then
    ln -sf "$INSTALL_DIR/bin/mr" "$BIN_DIR/mr"
else
    echo "관리자 권한이 필요합니다..."
    sudo ln -sf "$INSTALL_DIR/bin/mr" "$BIN_DIR/mr"
fi

echo -e "${GREEN}✓ 명령어 등록 완료${NC}"

# 8. 완료 메시지
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ 설치가 완료되었습니다!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "사용법:"
echo "  mr              대화형 모드로 실행"
echo "  mr 오늘         오늘 회의실 현황 조회"
echo "  mr 내일         내일 회의실 현황 조회"
echo "  mr --help       도움말 표시"
echo ""
echo "처음 실행 시 그룹웨어 계정 설정이 필요합니다."
echo ""
