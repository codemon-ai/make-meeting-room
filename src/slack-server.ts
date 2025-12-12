import { App, LogLevel } from '@slack/bolt';
import axios from 'axios';
import { getGroupwareBrowserService } from './services/groupware-browser.js';
import { parseDate, formatDateDisplay, parseShortTime, calculateEndTime } from './utils/date.js';
import {
  formatSlackBlocks,
  formatSlackText,
  formatReservationSuccess,
  formatReservationError,
  formatHelpMessage,
  formatScheduleSuccess,
  formatScheduleError,
  convertMarkdownToSlack,
} from './services/slack-format.js';
import { SLACK_CONFIG, validateConfig, TARGET_ROOMS } from './config.js';
import {
  initGoogleCalendar,
  isCalendarEnabled,
  createCalendarEvent,
  getEmailsFromSlackMentions,
  extractSlackMentions,
} from './services/google-calendar.js';

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

// headless 모드 활성화
gw.setHeadless(true);

/**
 * 명령어 파싱 결과 타입
 */
interface ParsedCommand {
  type: 'check' | 'reserve' | 'schedule' | 'help' | 'rtb' | 'meeting_notes' | 'unknown';
  date?: string;
  time?: string;
  room?: string;
  duration?: number;
  title?: string;
  attendeeIds?: string[]; // Slack 사용자 ID 배열
  question?: string; // RTB 질문 내용
  meetingNotesAction?: 'list' | 'search' | 'detail'; // 회의록 액션
  meetingNotesQuery?: string; // 검색어 또는 ID
  error?: string;
}

/**
 * 멘션 텍스트에서 명령어 파싱
 *
 * 조회:
 * - @봇 회의실 오늘
 * - @봇 회의실 251210
 * - @봇 회의실 251210 1000
 *
 * 예약 (+ 캘린더):
 * - @봇 회의실 예약 251210 1000 R3.1 1
 * - @봇 회의실 예약 251210 1000 R3.1 0.5 "팀 미팅" @user1 @user2
 *
 * 일정 (캘린더만):
 * - @봇 일정 251210 1000 1 "주간 회의" @user1 @user2
 *
 * 도움말:
 * - @봇 회의실 도움말
 * - @봇 회의실 help
 */
function parseCommand(text: string): ParsedCommand {
  // @멘션 추출 (첫 번째는 봇)
  const attendeeIds = extractSlackMentions(text);

  // 봇 멘션 제거 (예: <@U12345> 회의실 ...)
  // Slack tel 링크 제거 (예: <tel:2512121300|251212 1300> → 251212 1300)
  const cleanText = text
    .replace(/<@[A-Z0-9]+>/gi, '')
    .replace(/<tel:[^|]+\|([^>]+)>/gi, '$1')
    .trim();

  // 도움말
  if (cleanText.includes('도움말') || cleanText.includes('사용법') || cleanText.includes('help') || cleanText.includes('?')) {
    return { type: 'help' };
  }

  // 일정 명령어 파싱 (캘린더만)
  // 형식: 일정 251210 1000 1 "회의명" [@user1 @user2]
  const scheduleMatch = cleanText.match(
    /일정\s+(\S+)\s+(\d{4})\s+([\d.]+)\s+[""]([^""]+)[""]/i
  );

  if (scheduleMatch) {
    const [, dateInput, timeInput, durationStr, title] = scheduleMatch;

    try {
      const date = parseDate(dateInput);
      const startTime = parseShortTime(timeInput);
      const duration = parseFloat(durationStr);

      if (duration < 0.5 || duration > 8) {
        return { type: 'schedule', error: '러닝타임은 0.5~8시간 범위로 입력하세요.' };
      }

      return {
        type: 'schedule',
        date,
        time: startTime,
        duration,
        title,
        attendeeIds,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '입력 형식 오류';
      return { type: 'schedule', error: errorMsg };
    }
  }

  // 회의록 명령어 파싱
  // 형식: 회의록 목록 | 회의록 검색 [키워드] | 회의록 [ID]
  if (cleanText.includes('회의록')) {
    const listMatch = cleanText.match(/회의록\s+목록/i);
    if (listMatch) {
      return { type: 'meeting_notes', meetingNotesAction: 'list' };
    }

    const searchMatch = cleanText.match(/회의록\s+검색\s+(.+)/i);
    if (searchMatch) {
      return { type: 'meeting_notes', meetingNotesAction: 'search', meetingNotesQuery: searchMatch[1].trim() };
    }

    const detailMatch = cleanText.match(/회의록\s+(\d+)/i);
    if (detailMatch) {
      return { type: 'meeting_notes', meetingNotesAction: 'detail', meetingNotesQuery: detailMatch[1] };
    }

    // "회의록"만 입력한 경우 목록 표시
    return { type: 'meeting_notes', meetingNotesAction: 'list' };
  }

  // "회의실" 키워드가 없고, "일정" 명령어 형식도 아니면 RTB 질문으로 처리
  // "일정"이 포함되어도 "일정 251210 1000..." 형식이 아니면 일반 질문으로 취급
  const isScheduleCommand = /^일정\s+\S+\s+\d{4}/.test(cleanText);
  if (!cleanText.includes('회의실') && !isScheduleCommand) {
    const question = cleanText.trim();
    if (question.length > 0) {
      return { type: 'rtb', question };
    }
    return { type: 'unknown' };
  }

  // 예약 명령어 파싱
  // 형식: 회의실 예약 251210 1000 R3.1 1 "예약명" [@user1 @user2]
  const reserveMatch = cleanText.match(
    /회의실\s+예약\s+(\S+)\s+(\d{4})\s+(R\d\.\d)\s+([\d.]+)(?:\s+[""]([^""]+)[""])?/i
  );

  if (reserveMatch) {
    const [, dateInput, timeInput, room, durationStr, title] = reserveMatch;

    try {
      const date = parseDate(dateInput);
      const startTime = parseShortTime(timeInput);
      const duration = parseFloat(durationStr);

      if (duration < 0.5 || duration > 8) {
        return { type: 'reserve', error: '러닝타임은 0.5~8시간 범위로 입력하세요.' };
      }

      // 30분 단위 검증
      if ((duration * 2) % 1 !== 0) {
        return { type: 'reserve', error: '러닝타임은 30분 단위로 입력하세요. (0.5, 1, 1.5, 2...)' };
      }

      // 회의실 존재 확인
      const roomExists = TARGET_ROOMS.some((r) => r.name.toLowerCase() === room.toLowerCase());
      if (!roomExists) {
        const roomList = TARGET_ROOMS.map((r) => r.name).join(', ');
        return { type: 'reserve', error: `회의실 "${room}"을 찾을 수 없습니다. 가능한 회의실: ${roomList}` };
      }

      return {
        type: 'reserve',
        date,
        time: startTime,
        room: room.toUpperCase(),
        duration,
        title,
        attendeeIds,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '입력 형식 오류';
      return { type: 'reserve', error: errorMsg };
    }
  }

  // 조회 명령어 파싱
  // 형식: 회의실 251210 [1000]
  const checkMatch = cleanText.match(/회의실\s+(\S+)(?:\s+(\d{4}))?/i);

  if (checkMatch) {
    const [, dateInput, timeInput] = checkMatch;

    // "예약" 키워드가 있으면 예약 형식 오류
    if (dateInput === '예약') {
      return {
        type: 'reserve',
        error: '예약 형식: @봇 회의실 예약 251210 1000 R3.1 1 "예약명"',
      };
    }

    try {
      const date = parseDate(dateInput);
      const time = timeInput ? parseShortTime(timeInput) : undefined;
      return { type: 'check', date, time };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '날짜 형식 오류';
      return { type: 'check', error: errorMsg };
    }
  }

  // 기본: 오늘 조회
  return { type: 'check', date: parseDate('오늘') };
}

/**
 * @봇 회의실 멘션 핸들러
 */
app.event('app_mention', async ({ event, client, say }) => {
  const text = event.text;
  const command = parseCommand(text);

  // 스레드 ts 설정
  const threadTs = event.thread_ts || event.ts;

  // unknown 명령어는 무시
  if (command.type === 'unknown') {
    return;
  }

  // 도움말
  if (command.type === 'help') {
    await say({
      text: formatHelpMessage(),
      thread_ts: threadTs,
    });
    return;
  }

  // 파싱 에러 처리
  if (command.error) {
    await say({
      text: `❌ ${command.error}`,
      thread_ts: threadTs,
    });
    return;
  }

  // 조회 명령
  if (command.type === 'check' && command.date) {
    await handleCheck(event.channel, threadTs, client, say, command.date, command.time);
    return;
  }

  // Slack 사용자 정보 가져오기 (예약명 기본값용, 캘린더 organizer용)
  let userName = '사용자';
  let userEmail = '';
  if (event.user) {
    try {
      const userInfo = await client.users.info({ user: event.user });
      userName = userInfo.user?.real_name || userInfo.user?.name || '사용자';
      userEmail = userInfo.user?.profile?.email || '';
    } catch {
      // 사용자 정보 조회 실패 시 기본값 사용
    }
  }

  // 예약 명령
  if (command.type === 'reserve' && command.date && command.time && command.room && command.duration) {
    const title = command.title || `${userName} 미팅`;

    await handleReserve(
      event.channel,
      threadTs,
      client,
      say,
      command.date,
      command.time,
      command.room,
      command.duration,
      title,
      userEmail,
      command.attendeeIds || []
    );
    return;
  }

  // 일정 명령 (캘린더만)
  if (command.type === 'schedule' && command.date && command.time && command.duration && command.title) {
    await handleSchedule(
      event.channel,
      threadTs,
      client,
      say,
      command.date,
      command.time,
      command.duration,
      command.title,
      userEmail,
      command.attendeeIds || []
    );
    return;
  }

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

  // 회의록 명령
  if (command.type === 'meeting_notes' && command.meetingNotesAction) {
    await handleMeetingNotes(
      event.channel,
      threadTs,
      client,
      say,
      command.meetingNotesAction,
      command.meetingNotesQuery
    );
    return;
  }
});

/**
 * 회의실 현황 조회 핸들러
 */
async function handleCheck(
  channel: string,
  threadTs: string,
  client: typeof app.client,
  say: (args: { text: string; thread_ts: string; blocks?: unknown[] }) => Promise<{ ts?: string }>,
  date: string,
  filterTime?: string
) {
  // 즉시 "조회 중" 메시지 전송
  const loadingMsg = await say({
    text: `🔍 ${formatDateDisplay(date)} 회의실 현황 조회 중...`,
    thread_ts: threadTs,
  });

  try {
    // 로그인 확인
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
    let fallbackText = formatSlackText(availabilities, date);

    // 시간 필터가 있으면 추가 정보 표시
    if (filterTime) {
      fallbackText += `\n\n📍 기준 시간: ${filterTime}`;
    }

    await client.chat.update({
      channel,
      ts: loadingMsg.ts!,
      blocks: blocks as never[],
      text: fallbackText,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('회의실 조회 오류:', errorMessage);

    await client.chat.update({
      channel,
      ts: loadingMsg.ts!,
      text: `❌ 조회 실패: ${errorMessage}`,
    });
  }
}

/**
 * 회의실 예약 핸들러
 */
async function handleReserve(
  channel: string,
  threadTs: string,
  client: typeof app.client,
  say: (args: { text: string; thread_ts: string }) => Promise<{ ts?: string }>,
  date: string,
  startTime: string,
  roomName: string,
  duration: number,
  title: string,
  organizerEmail: string,
  attendeeIds: string[]
) {
  const endTime = calculateEndTime(startTime, duration);

  // 즉시 "예약 중" 메시지 전송
  const loadingMsg = await say({
    text: `🔄 ${roomName} 예약 중... (${formatDateDisplay(date)} ${startTime}-${endTime})`,
    thread_ts: threadTs,
  });

  try {
    // 로그인 확인
    if (!gw.isAuthenticated()) {
      console.log('🔐 그룹웨어 재로그인 중...');
      const loginSuccess = await gw.login();
      if (!loginSuccess) {
        throw new Error('그룹웨어 로그인 실패');
      }
    }

    // 회의실 resSeq 조회
    const resSeq = gw.getResSeq(roomName);
    if (!resSeq) {
      throw new Error(`회의실 "${roomName}"을 찾을 수 없습니다.`);
    }

    // 회의실 정보 가져오기
    const roomInfo = TARGET_ROOMS.find((r) => r.name === roomName);
    const floor = roomInfo?.floor || '';

    // 예약 가능 여부 확인
    const availabilities = await gw.getAvailability(date);
    const roomAvail = availabilities.find((a) => a.room.name === roomName);

    if (!roomAvail) {
      throw new Error('회의실 정보를 조회할 수 없습니다.');
    }

    // 예약 충돌 확인
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    const conflicting = roomAvail.reservations.find((res) => {
      const resStart = timeToMinutes(res.startTime);
      const resEnd = timeToMinutes(res.endTime);
      return startMinutes < resEnd && endMinutes > resStart;
    });

    if (conflicting) {
      throw new Error(
        `해당 시간에 이미 예약이 있습니다.\n` +
          `   ❌ ${conflicting.startTime}-${conflicting.endTime} (${conflicting.reserverName})`
      );
    }

    // 예약 실행
    const result = await gw.reserveRoom({
      resSeq,
      title,
      fromDate: date,
      fromTime: startTime,
      toDate: date,
      toTime: endTime,
    });

    if (!result.success) {
      throw new Error(result.message);
    }

    // 예약 성공 메시지
    let successMessage = formatReservationSuccess(roomName, floor, date, startTime, endTime, title);

    // Google Calendar 일정 생성 (설정된 경우)
    if (isCalendarEnabled() && organizerEmail) {
      const attendeeEmails = await getEmailsFromSlackMentions(client, attendeeIds);

      const calendarResult = await createCalendarEvent(organizerEmail, {
        title: `[${roomName}] ${title}`,
        description: `회의실: ${roomName} (${floor})\n그룹웨어 예약 완료`,
        date,
        startTime,
        endTime,
        location: `${roomName} (${floor})`,
        attendees: attendeeEmails,
      });

      if (calendarResult.success) {
        successMessage += `\n\n📅 Google Calendar 일정 생성 완료`;
        if (attendeeEmails.length > 0) {
          successMessage += `\n   초대: ${attendeeEmails.join(', ')}`;
        }
      } else {
        successMessage += `\n\n⚠️ 캘린더 일정 생성 실패: ${calendarResult.message}`;
      }
    }

    await client.chat.update({
      channel,
      ts: loadingMsg.ts!,
      text: successMessage,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('회의실 예약 오류:', errorMessage);

    await client.chat.update({
      channel,
      ts: loadingMsg.ts!,
      text: formatReservationError(errorMessage),
    });
  }
}

/**
 * 캘린더 일정 생성 핸들러 (회의실 없이)
 */
async function handleSchedule(
  channel: string,
  threadTs: string,
  client: typeof app.client,
  say: (args: { text: string; thread_ts: string }) => Promise<{ ts?: string }>,
  date: string,
  startTime: string,
  duration: number,
  title: string,
  organizerEmail: string,
  attendeeIds: string[]
) {
  const endTime = calculateEndTime(startTime, duration);

  // 즉시 "일정 생성 중" 메시지 전송
  const loadingMsg = await say({
    text: `📅 일정 생성 중... (${formatDateDisplay(date)} ${startTime}-${endTime})`,
    thread_ts: threadTs,
  });

  try {
    if (!isCalendarEnabled()) {
      throw new Error('Google Calendar가 설정되지 않았습니다.');
    }

    if (!organizerEmail) {
      throw new Error('사용자 이메일을 조회할 수 없습니다.');
    }

    // 참석자 이메일 조회
    const attendeeEmails = await getEmailsFromSlackMentions(client, attendeeIds);

    // 캘린더 일정 생성
    const calendarResult = await createCalendarEvent(organizerEmail, {
      title,
      date,
      startTime,
      endTime,
      attendees: attendeeEmails,
    });

    if (!calendarResult.success) {
      throw new Error(calendarResult.message);
    }

    await client.chat.update({
      channel,
      ts: loadingMsg.ts!,
      text: formatScheduleSuccess(date, startTime, endTime, title, attendeeEmails),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('일정 생성 오류:', errorMessage);

    await client.chat.update({
      channel,
      ts: loadingMsg.ts!,
      text: formatScheduleError(errorMessage),
    });
  }
}

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
        timeout: 60000, // 60초 타임아웃
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const rawAnswer = response.data?.answer || '답변을 생성할 수 없습니다.';
    const answer = convertMarkdownToSlack(rawAnswer);

    // Slack 메시지 길이 제한 (500자씩 분할하여 빠르게 전송)
    const MAX_LENGTH = 500;

    // 긴 답변: 분할해서 전송
    const chunks = splitMessage(answer, MAX_LENGTH);
    console.log(`[RTB] 답변 길이: ${answer.length}자, 청크 수: ${chunks.length}, 첫 청크: ${chunks[0].length}자`);

    // 첫 번째 청크로 로딩 메시지 업데이트
    await client.chat.update({
      channel,
      ts: loadingMsg.ts!,
      text: chunks[0],
    });

    // 나머지 청크는 새 메시지로 전송
    for (let i = 1; i < chunks.length; i++) {
      await say({
        text: chunks[i],
        thread_ts: threadTs,
      });
    }

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

/**
 * 회의록 핸들러
 * n8n webhook을 통해 회의록 목록/검색/상세 조회
 */
async function handleMeetingNotes(
  channel: string,
  threadTs: string,
  client: typeof app.client,
  say: (args: { text: string; thread_ts: string }) => Promise<{ ts?: string }>,
  action: 'list' | 'search' | 'detail',
  query?: string
) {
  const loadingMsg = await say({
    text: action === 'search' ? `🔍 "${query}" 검색 중...` : '📋 회의록 조회 중...',
    thread_ts: threadTs,
  });

  try {
    let responseText = '';

    if (action === 'list') {
      // 목록 조회
      const response = await axios.get('http://localhost:5678/webhook/meeting-notes-list', {
        timeout: 30000,
      });

      const notes = response.data?.data || [];
      if (notes.length === 0) {
        responseText = '📋 저장된 회의록이 없습니다.';
      } else {
        responseText = '*📋 최근 회의록*\n\n';
        for (const note of notes.slice(0, 10)) {
          const dateStr = note.meeting_date || new Date(note.created_at).toLocaleDateString('ko-KR');
          responseText += `• *[${note.id}]* ${note.title || '제목 없음'} (${note.type}) - ${dateStr}\n`;
        }
        responseText += '\n💡 상세 조회: `@봇 회의록 [ID]`';
      }
    } else if (action === 'search' && query) {
      // 벡터 검색
      const response = await axios.post(
        'http://localhost:5678/webhook/meeting-notes-search',
        { query },
        { timeout: 30000, headers: { 'Content-Type': 'application/json' } }
      );

      const results = response.data?.results || [];
      if (results.length === 0) {
        responseText = `🔍 "${query}"에 대한 검색 결과가 없습니다.`;
      } else {
        responseText = `*🔍 "${query}" 검색 결과*\n\n`;
        for (const r of results.slice(0, 5)) {
          const score = (r.score * 100).toFixed(1);
          responseText += `• *[${r.payload.postgres_id}]* ${r.payload.title || '제목 없음'} (유사도: ${score}%)\n`;
          if (r.payload.content) {
            responseText += `  _${r.payload.content.substring(0, 100)}..._\n`;
          }
        }
        responseText += '\n💡 상세 조회: `@봇 회의록 [ID]`';
      }
    } else if (action === 'detail' && query) {
      // 단건 조회
      const response = await axios.get(`http://localhost:5678/webhook/meeting-notes-detail?id=${query}`, {
        timeout: 30000,
      });

      const note = response.data?.data;
      if (!note) {
        responseText = `❌ ID ${query}번 회의록을 찾을 수 없습니다.`;
      } else {
        const dateStr = note.meeting_date || new Date(note.created_at).toLocaleDateString('ko-KR');
        responseText = `*📄 회의록 #${note.id}*\n\n`;
        responseText += `*제목:* ${note.title || '제목 없음'}\n`;
        responseText += `*유형:* ${note.type} | *출처:* ${note.source}\n`;
        responseText += `*날짜:* ${dateStr}\n\n`;
        responseText += `*내용:*\n${note.content || '(내용 없음)'}`;
      }
    }

    // 메시지 분할 전송
    const chunks = splitMessage(responseText, 500);
    await client.chat.update({
      channel,
      ts: loadingMsg.ts!,
      text: chunks[0],
    });

    for (let i = 1; i < chunks.length; i++) {
      await say({ text: chunks[i], thread_ts: threadTs });
    }

    console.log(`[MeetingNotes] ${action}: ${query || 'list'}`);
  } catch (error) {
    console.error('[MeetingNotes] 오류:', error);

    const errorMessage = axios.isAxiosError(error)
      ? `❌ 회의록 조회 실패 (${error.response?.status || 'timeout'})`
      : '❌ 회의록 조회 중 오류가 발생했습니다.';

    await client.chat.update({
      channel,
      ts: loadingMsg.ts!,
      text: errorMessage,
    });
  }
}

/**
 * 긴 메시지를 적절한 위치에서 분할
 */
function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // 줄바꿈 기준으로 자르기 시도
    let splitIndex = remaining.lastIndexOf('\n', maxLength);

    // 줄바꿈이 없으면 공백 기준
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }

    // 공백도 없으면 강제로 자르기
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}

/**
 * 시간을 분으로 변환 (로컬 헬퍼)
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

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
  console.log('🚀 회의실 예약 Slack Bot 시작...');

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

  // Google Calendar 초기화
  const calendarEnabled = await initGoogleCalendar();
  if (calendarEnabled) {
    console.log('📅 Google Calendar 연동 활성화');
  } else {
    console.log('📅 Google Calendar 연동 비활성화 (설정 없음)');
  }

  // 세션 유지 타이머 시작
  startSessionKeepAlive();

  // Slack 앱 시작
  await app.start();
  console.log('⚡️ Slack Bot 서버 실행 중');
  console.log('');
  console.log('📢 사용법:');
  console.log('   @봇 회의실 오늘              - 오늘 현황');
  console.log('   @봇 회의실 251210            - 특정 날짜 현황');
  console.log('   @봇 회의실 예약 251210 1000 R3.1 1  - 예약');
  console.log('   @봇 회의실 도움말            - 도움말');
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
