import { RoomAvailability } from '../types/index.js';
import { formatDateDisplay } from '../utils/date.js';

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text: string;
    emoji?: boolean;
  }>;
}

/**
 * 회의실 가용 현황을 Slack Block Kit 포맷으로 변환
 */
export function formatSlackBlocks(availabilities: RoomAvailability[], date: string): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  // 헤더
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `📅 ${formatDateDisplay(date)} 회의실 현황`,
      emoji: true,
    },
  });

  blocks.push({ type: 'divider' });

  // 각 회의실별 정보
  for (const avail of availabilities) {
    const roomText = formatRoomStatus(avail);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: roomText,
      },
    });
  }

  // 푸터
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `🔄 조회 시각: ${new Date().toLocaleTimeString('ko-KR')}`,
      },
    ],
  });

  return blocks;
}

/**
 * 단일 회의실 상태를 포맷팅
 */
function formatRoomStatus(avail: RoomAvailability): string {
  const lines: string[] = [];

  // 회의실 이름
  lines.push(`*🏢 ${avail.room.name} (${avail.room.floor})*`);

  // 종일 가능한 경우
  if (
    avail.availableSlots.length === 1 &&
    avail.availableSlots[0].start === '09:00' &&
    avail.availableSlots[0].end === '18:00' &&
    avail.reservations.length === 0
  ) {
    lines.push('✅ 종일 가능');
    return lines.join('\n');
  }

  // 시간대별 상태 생성 (각 슬롯 한 줄씩)
  const timeSlots = generateTimelineSlots(avail);

  for (const slot of timeSlots) {
    if (slot.available) {
      lines.push(`✅ ${slot.start}-${slot.end}`);
    } else {
      lines.push(`❌ ${slot.start}-${slot.end} _${slot.reserverName}_`);
    }
  }

  return lines.join('\n');
}

interface TimelineSlot {
  start: string;
  end: string;
  available: boolean;
  reserverName?: string;
}

/**
 * 시간대별 슬롯 생성 (예약 + 가용 시간 병합)
 */
function generateTimelineSlots(avail: RoomAvailability): TimelineSlot[] {
  const slots: TimelineSlot[] = [];

  // 예약과 가용 슬롯을 시간순으로 병합
  const allEvents: Array<{
    start: string;
    end: string;
    type: 'available' | 'reserved';
    name?: string;
  }> = [];

  // 가용 슬롯 추가
  for (const slot of avail.availableSlots) {
    allEvents.push({
      start: slot.start,
      end: slot.end,
      type: 'available',
    });
  }

  // 예약 추가
  for (const res of avail.reservations) {
    allEvents.push({
      start: res.startTime,
      end: res.endTime,
      type: 'reserved',
      name: res.reserverName,
    });
  }

  // 시작 시간순 정렬
  allEvents.sort((a, b) => a.start.localeCompare(b.start));

  // 중복 제거 및 변환
  for (const event of allEvents) {
    slots.push({
      start: event.start,
      end: event.end,
      available: event.type === 'available',
      reserverName: event.name,
    });
  }

  return slots;
}

/**
 * 간단한 텍스트 포맷 (Block Kit 미지원 환경용)
 */
export function formatSlackText(availabilities: RoomAvailability[], date: string): string {
  const lines: string[] = [];

  lines.push(`📅 ${formatDateDisplay(date)} 회의실 현황`);
  lines.push('─'.repeat(30));

  for (const avail of availabilities) {
    lines.push('');
    lines.push(`🏢 ${avail.room.name} (${avail.room.floor})`);

    if (
      avail.availableSlots.length === 1 &&
      avail.availableSlots[0].start === '09:00' &&
      avail.availableSlots[0].end === '18:00' &&
      avail.reservations.length === 0
    ) {
      lines.push('  ✅ 종일 가능');
      continue;
    }

    const timeSlots = generateTimelineSlots(avail);
    for (const slot of timeSlots) {
      if (slot.available) {
        lines.push(`  ✅ ${slot.start}-${slot.end}`);
      } else {
        lines.push(`  ❌ ${slot.start}-${slot.end} (${slot.reserverName})`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * 예약 성공 메시지 포맷
 */
export function formatReservationSuccess(
  roomName: string,
  floor: string,
  date: string,
  startTime: string,
  endTime: string,
  title: string,
  calendarInfo?: { eventLink?: string; attendeeCount?: number }
): string {
  const lines = [
    '✅ *예약 완료!*',
    '',
    `   회의실: ${roomName} (${floor})`,
    `   일시: ${formatDateDisplay(date)} ${startTime} - ${endTime}`,
    `   예약명: ${title}`,
  ];

  if (calendarInfo) {
    lines.push('');
    lines.push('📅 *캘린더 일정 생성됨*');
    if (calendarInfo.attendeeCount && calendarInfo.attendeeCount > 0) {
      lines.push(`   참석자 ${calendarInfo.attendeeCount}명에게 초대 발송`);
    }
    if (calendarInfo.eventLink) {
      lines.push(`   <${calendarInfo.eventLink}|캘린더에서 보기>`);
    }
  }

  return lines.join('\n');
}

/**
 * 예약 실패 메시지 포맷
 */
export function formatReservationError(message: string): string {
  return `❌ *예약 실패*\n\n   ${message}`;
}

/**
 * 일정 생성 성공 메시지 포맷 (캘린더만)
 */
export function formatScheduleSuccess(
  date: string,
  startTime: string,
  endTime: string,
  title: string,
  attendeeEmails: string[],
  eventLink?: string
): string {
  const lines = [
    '✅ *일정 생성 완료!*',
    '',
    `   일시: ${formatDateDisplay(date)} ${startTime} - ${endTime}`,
    `   제목: ${title}`,
  ];

  if (attendeeEmails.length > 0) {
    lines.push(`   참석자: ${attendeeEmails.length}명에게 초대 발송`);
  }

  if (eventLink) {
    lines.push('');
    lines.push(`📅 <${eventLink}|캘린더에서 보기>`);
  }

  return lines.join('\n');
}

/**
 * 일정 생성 실패 메시지 포맷 (캘린더만)
 */
export function formatScheduleError(message: string): string {
  return `❌ *일정 생성 실패*\n\n   ${message}`;
}

/**
 * 도움말 메시지 포맷
 */
export function formatHelpMessage(): string {
  return [
    '*🏢 회의실 예약 봇 사용법*',
    '',
    '*조회*',
    '`@봇 회의실 오늘` - 오늘 현황',
    '`@봇 회의실 내일` - 내일 현황',
    '`@봇 회의실 251210` - 2025-12-10 현황',
    '`@봇 회의실 251210 1000` - 해당일 10:00 기준 현황',
    '',
    '*예약* (회의실 + 캘린더 초대)',
    '`@봇 회의실 예약 251210 1000 R3.1 1` - 10:00~11:00 (1시간)',
    '`@봇 회의실 예약 251210 1000 R3.1 1 "팀 미팅"` - 예약명 지정',
    '`@봇 회의실 예약 251210 1000 R3.1 1 "팀 미팅" @user1 @user2` - 참석자 초대',
    '',
    '*일정* (캘린더만, 회의실 없음)',
    '`@봇 일정 251210 1000 1 "주간 회의" @user1 @user2`',
    '',
    '*📋 회의록*',
    '`@봇 회의록` 또는 `@봇 회의록 목록` - 최근 회의록',
    '`@봇 회의록 검색 [키워드]` - 벡터 검색',
    '`@봇 회의록 [ID]` - 상세 조회',
    '',
    '*📚 RTB 문서 질문*',
    '`@봇 빌딩이란?` - RTB 용어 질문',
    '`@봇 매물 테이블 구조 알려줘` - 테이블/API 질문',
    '`@봇 딜 상태 종류가 뭐야?` - 비즈니스 로직 질문',
    '',
    '💡 "회의실", "일정", "회의록" 키워드 없이 질문하면 RTB 문서 기반으로 답변합니다.',
    '',
    '*러닝타임*: 0.5(30분), 1(1시간), 1.5(1시간30분), 2(2시간)...',
    '*시간 형식*: 4자리 (0930, 1000, 1430)',
    '*날짜 형식*: 6자리 (251210), 슬래시(25/12/10) 또는 오늘/내일',
  ].join('\n');
}

/**
 * 마크다운 테이블을 슬랙 텍스트로 변환 (수평 나열 형식)
 *
 * | 시간 | 배치명 | 목적 |
 * |------|--------|------|
 * | 03:00 | DeleteBounced | 삭제 |
 *
 * → *시간* • *배치명* • *목적*
 *   03:00 • DeleteBounced • 삭제
 */
function convertTableToSlack(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 테이블 헤더 감지 (| col1 | col2 | 형식)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      // 테이블 시작
      const tableLines: string[] = [];

      // 테이블 전체 수집
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }

      // 테이블 변환
      const converted = parseAndConvertTable(tableLines);
      result.push(...converted);
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
}

/**
 * 테이블 라인 배열을 파싱하여 슬랙 형식으로 변환
 */
function parseAndConvertTable(tableLines: string[]): string[] {
  if (tableLines.length === 0) return [];

  const result: string[] = [];

  for (let i = 0; i < tableLines.length; i++) {
    const line = tableLines[i].trim();

    // 구분선 제거 (|---|---|)
    if (/^\|[\s\-:|]+\|$/.test(line)) {
      continue;
    }

    // 셀 파싱
    const cells = line
      .split('|')
      .slice(1, -1) // 앞뒤 빈 문자열 제거
      .map((cell) => cell.trim());

    if (cells.length === 0) continue;

    // 첫 번째 행(헤더)은 볼드 처리
    if (i === 0) {
      const headerCells = cells.map((cell) => `*${cell}*`);
      result.push(headerCells.join(' • '));
    } else {
      result.push(cells.join(' • '));
    }
  }

  return result;
}

/**
 * 마크다운을 슬랙 mrkdwn 형식으로 변환
 *
 * 변환 규칙:
 * - 헤더: # ## ### #### → *볼드*
 * - 볼드: **text** → *text*
 * - 이탤릭: _text_ → _text_ (동일)
 * - 취소선: ~~text~~ → ~text~
 * - 링크: [text](url) → <url|text>
 * - 코드: `code` → `code` (동일)
 * - 테이블: | col | → 수평 나열
 */
export function convertMarkdownToSlack(markdown: string): string {
  let result = markdown;

  // 1. 코드 블록 보호 (변환에서 제외)
  const codeBlocks: string[] = [];
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // 2. 인라인 코드 보호
  const inlineCodes: string[] = [];
  result = result.replace(/`[^`]+`/g, (match) => {
    inlineCodes.push(match);
    return `__INLINE_CODE_${inlineCodes.length - 1}__`;
  });

  // 3. 테이블 처리 (먼저 처리해야 | 문자 손상 방지)
  result = convertTableToSlack(result);

  // 4. 헤더 변환: #### text → *text*
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // 5. 볼드 변환: **text** → *text*
  result = result.replace(/\*\*([^*]+)\*\*/g, '*$1*');

  // 6. 취소선: ~~text~~ → ~text~
  result = result.replace(/~~([^~]+)~~/g, '~$1~');

  // 7. 링크 변환: [text](url) → <url|text>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');

  // 8. 코드 블록 복원
  codeBlocks.forEach((block, i) => {
    result = result.replace(`__CODE_BLOCK_${i}__`, block);
  });

  // 9. 인라인 코드 복원
  inlineCodes.forEach((code, i) => {
    result = result.replace(`__INLINE_CODE_${i}__`, code);
  });

  return result;
}
