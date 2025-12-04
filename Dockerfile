# Playwright가 포함된 공식 이미지 사용
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# 작업 디렉토리 설정
WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 프로덕션 의존성만 설치
RUN npm ci --only=production

# 빌드된 파일 복사
COPY dist ./dist

# 환경변수 설정
ENV NODE_ENV=production

# 헬스체크 (선택사항)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Slack 서버 실행
CMD ["node", "dist/slack-server.js"]
