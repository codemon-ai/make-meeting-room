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
    '*러닝타임*: 0.5(30분), 1(1시간), 1.5(1시간30분), 2(2시간)...',
    '*시간 형식*: 4자리 (0930, 1000, 1430)',
    '*날짜 형식*: 6자리 (251210) 또는 오늘/내일',
  ].join('\n');
}
