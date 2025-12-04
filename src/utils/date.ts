import dayjs from 'dayjs';
import { TimeSlot } from '../types/index.js';
import { WORK_HOURS, TIME_SLOT_INTERVAL } from '../config.js';

/**
 * 날짜 문자열 파싱 (today, tomorrow, YYYY-MM-DD)
 */
export function parseDate(dateStr: string): string {
  const lower = dateStr.toLowerCase();

  if (lower === 'today') {
    return dayjs().format('YYYY-MM-DD');
  }
  if (lower === 'tomorrow') {
    return dayjs().add(1, 'day').format('YYYY-MM-DD');
  }

  // YYYY-MM-DD 형식 검증
  const parsed = dayjs(dateStr, 'YYYY-MM-DD', true);
  if (!parsed.isValid()) {
    throw new Error(`잘못된 날짜 형식입니다: ${dateStr}. YYYY-MM-DD 형식을 사용하세요.`);
  }

  return parsed.format('YYYY-MM-DD');
}

/**
 * 시간 범위 파싱 (예: "10:00-11:00")
 */
export function parseTimeRange(timeStr: string): TimeSlot {
  const match = timeStr.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (!match) {
    throw new Error(`잘못된 시간 형식입니다: ${timeStr}. HH:MM-HH:MM 형식을 사용하세요.`);
  }

  return {
    start: match[1],
    end: match[2],
  };
}

/**
 * 시간을 분으로 변환
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 분을 시간 문자열로 변환
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * 예약된 시간대에서 빈 시간대 계산
 */
export function calculateAvailableSlots(
  reservations: { startTime: string; endTime: string }[],
  workStart: string = WORK_HOURS.start,
  workEnd: string = WORK_HOURS.end
): TimeSlot[] {
  const available: TimeSlot[] = [];

  // 예약을 시작 시간 기준으로 정렬
  const sorted = [...reservations].sort((a, b) =>
    timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );

  let currentStart = timeToMinutes(workStart);
  const endOfDay = timeToMinutes(workEnd);

  for (const reservation of sorted) {
    const resStart = timeToMinutes(reservation.startTime);
    const resEnd = timeToMinutes(reservation.endTime);

    // 현재 위치와 예약 시작 사이에 빈 시간이 있으면 추가
    if (currentStart < resStart) {
      available.push({
        start: minutesToTime(currentStart),
        end: minutesToTime(resStart),
      });
    }

    // 다음 탐색 시작점을 예약 종료 시간으로 이동
    currentStart = Math.max(currentStart, resEnd);
  }

  // 마지막 예약 이후부터 업무 종료까지 빈 시간이 있으면 추가
  if (currentStart < endOfDay) {
    available.push({
      start: minutesToTime(currentStart),
      end: minutesToTime(endOfDay),
    });
  }

  return available;
}

/**
 * 시간대 겹침 확인
 */
export function isTimeOverlap(
  slot1: TimeSlot,
  slot2: TimeSlot
): boolean {
  const start1 = timeToMinutes(slot1.start);
  const end1 = timeToMinutes(slot1.end);
  const start2 = timeToMinutes(slot2.start);
  const end2 = timeToMinutes(slot2.end);

  return start1 < end2 && start2 < end1;
}

/**
 * 특정 시간대가 빈 시간에 포함되는지 확인
 */
export function isSlotAvailable(
  requestedSlot: TimeSlot,
  availableSlots: TimeSlot[]
): boolean {
  const reqStart = timeToMinutes(requestedSlot.start);
  const reqEnd = timeToMinutes(requestedSlot.end);

  return availableSlots.some(slot => {
    const slotStart = timeToMinutes(slot.start);
    const slotEnd = timeToMinutes(slot.end);
    return reqStart >= slotStart && reqEnd <= slotEnd;
  });
}

/**
 * 오늘/내일 등 날짜를 보기 좋게 포맷
 */
export function formatDateDisplay(dateStr: string): string {
  const date = dayjs(dateStr);
  const today = dayjs().startOf('day');
  const tomorrow = today.add(1, 'day');

  if (date.isSame(today, 'day')) {
    return `오늘 (${date.format('YYYY-MM-DD')})`;
  }
  if (date.isSame(tomorrow, 'day')) {
    return `내일 (${date.format('YYYY-MM-DD')})`;
  }

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayNames[date.day()];

  return `${date.format('YYYY-MM-DD')} (${dayName})`;
}

/**
 * ISO 8601 형식으로 변환 (Google Calendar용)
 */
export function toISODateTime(date: string, time: string): string {
  return dayjs(`${date} ${time}`, 'YYYY-MM-DD HH:mm').toISOString();
}
