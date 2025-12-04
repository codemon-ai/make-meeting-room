module.exports = {
  apps: [
    {
      name: 'meeting-room-bot',
      script: 'dist/slack-server.js',
      // 프로젝트 디렉토리 (Mac에서 실제 경로로 수정 필요)
      // cwd: '/Users/<username>/meeting-room-bot',

      // 환경변수
      env: {
        NODE_ENV: 'production',
      },

      // 자동 재시작 설정
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000, // 재시작 간 5초 대기

      // 메모리 제한 (500MB 초과 시 재시작)
      max_memory_restart: '500M',

      // 로그 설정
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // 크래시 시 지수 백오프
      exp_backoff_restart_delay: 100,

      // 인스턴스 (단일 인스턴스 권장 - Playwright 브라우저 공유)
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
