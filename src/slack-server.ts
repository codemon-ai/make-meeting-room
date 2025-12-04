import { App, LogLevel } from '@slack/bolt';
import { getGroupwareBrowserService } from './services/groupware-browser.js';
import { parseDate, formatDateDisplay } from './utils/date.js';
import { formatSlackBlocks, formatSlackText } from './services/slack-format.js';
import { SLACK_CONFIG, validateConfig } from './config.js';

// Slack Bolt 앱 초기화
const app = new App({
  token: SLACK_CONFIG.botToken,
  signingSecret: SLACK_CONFIG.signingSecret,
  socketMode: true,
  appToken: SLACK_CONFIG.appToken,
  logLevel: LogLevel.INFO,
});

// 그룹웨어 서비스 인스턴스
const gw = getGroupwareBrowserService();

/**
 * @봇 회의실 [날짜] 멘션 핸들러
 *
 * 예시:
 * - @봇 회의실 → 오늘
 * - @봇 회의실 오늘 → 오늘
 * - @봇 회의실 내일 → 내일
 * - @봇 회의실 2025-12-05 → 특정 날짜
 */
app.event('app_mention', async ({ event, client, say }) => {
  const text = event.text.toLowerCase();

  // "회의실" 키워드가 없으면 무시
  if (!text.includes('회의실')) {
    return;
  }

  // 날짜 파싱
  const dateMatch = text.match(/회의실\s*(오늘|내일|today|tomorrow|\d{4}-\d{2}-\d{2})?/i);
  const dateInput = dateMatch?.[1] || 'today';

  let date: string;
  try {
    date = parseDate(dateInput);
  } catch {
    await say({
      text: '❌ 날짜 형식이 올바르지 않습니다. (예: 오늘, 내일, 2025-12-05)',
      thread_ts: event.thread_ts || event.ts,
    });
    return;
  }

  // 즉시 "조회 중" 메시지 전송
  const loadingMsg = await say({
    text: `🔍 ${formatDateDisplay(date)} 회의실 현황 조회 중...`,
    thread_ts: event.thread_ts || event.ts,
  });

  try {
    // 로그인 확인 (세션이 없거나 만료된 경우)
    if (!gw.isAuthenticated()) {
      console.log('🔐 그룹웨어 재로그인 중...');
      const loginSuccess = await gw.login();
      if (!loginSuccess) {
        throw new Error('그룹웨어 로그인 실패');
      }
    }

    // 회의실 현황 조회
    const availabilities = await gw.getAvailability(date);

    if (availabilities.length === 0) {
      throw new Error('회의실 정보를 조회할 수 없습니다.');
    }

    // Slack Block Kit 포맷으로 메시지 업데이트
    const blocks = formatSlackBlocks(availabilities, date);
    const fallbackText = formatSlackText(availabilities, date);

    await client.chat.update({
      channel: event.channel,
      ts: loadingMsg.ts!,
      blocks: blocks as never[],
      text: fallbackText,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('회의실 조회 오류:', errorMessage);

    await client.chat.update({
      channel: event.channel,
      ts: loadingMsg.ts!,
      text: `❌ 조회 실패: ${errorMessage}`,
    });
  }
});

/**
 * 서버 시작 시 그룹웨어 로그인
 */
async function initGroupware(): Promise<boolean> {
  console.log('🔐 그룹웨어 로그인 시도...');
  const success = await gw.login();
  if (success) {
    console.log('✅ 그룹웨어 로그인 완료');
  } else {
    console.error('❌ 그룹웨어 로그인 실패');
  }
  return success;
}

/**
 * 주기적으로 세션 유지 (30분마다)
 */
function startSessionKeepAlive(): void {
  setInterval(
    async () => {
      if (!gw.isAuthenticated()) {
        console.log('🔄 세션 만료, 재로그인 시도...');
        await initGroupware();
      }
    },
    30 * 60 * 1000
  ); // 30분
}

/**
 * 메인 함수
 */
async function main(): Promise<void> {
  console.log('🚀 회의실 조회 Slack Bot 시작...');

  // 설정 검증
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    console.error('❌ 설정 오류:');
    configValidation.errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  // Slack 설정 검증
  if (!SLACK_CONFIG.botToken || !SLACK_CONFIG.signingSecret || !SLACK_CONFIG.appToken) {
    console.error('❌ Slack 설정이 누락되었습니다.');
    console.error('  필요한 환경변수: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_APP_TOKEN');
    process.exit(1);
  }

  // 그룹웨어 로그인
  const loginSuccess = await initGroupware();
  if (!loginSuccess) {
    console.error('❌ 그룹웨어 초기 로그인 실패. 서버를 계속 시작합니다.');
  }

  // 세션 유지 타이머 시작
  startSessionKeepAlive();

  // Slack 앱 시작
  await app.start();
  console.log('⚡️ Slack Bot 서버 실행 중');
  console.log('📢 사용법: @봇이름 회의실 [오늘|내일|YYYY-MM-DD]');
}

// 에러 핸들링
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('SIGINT', async () => {
  console.log('🛑 서버 종료 중...');
  await gw.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 서버 종료 중...');
  await gw.close();
  process.exit(0);
});

// 실행
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
