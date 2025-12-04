import chalk from 'chalk';
import { RoomAvailability, TimeSlot, Reservation } from '../types/index.js';
import { formatDateDisplay, timeToMinutes } from '../utils/date.js';
import { WORK_HOURS } from '../config.js';

/**
 * 회의실 가용 현황 출력
 */
export function displayAvailability(
  availabilities: RoomAvailability[],
  filterTime?: TimeSlot
): void {
  if (availabilities.length === 0) {
    console.log(chalk.yellow('조회된 회의실이 없습니다.'));
    return;
  }

  const date = availabilities[0].date;
  console.log();
  console.log(chalk.bold.blue(`📅 ${formatDateDisplay(date)} 회의실 현황`));
  console.log(chalk.gray('─'.repeat(50)));

  for (const availability of availabilities) {
    displayRoomStatus(availability, filterTime);
  }

  console.log();
}

/**
 * 개별 회의실 상태 출력
 */
function displayRoomStatus(
  availability: RoomAvailability,
  filterTime?: TimeSlot
): void {
  const { room, reservations, availableSlots } = availability;

  console.log();
  console.log(chalk.bold.white(`${room.name}`), chalk.gray(`(${room.floor})`));

  // 필터 시간대가 있으면 해당 시간만 표시
  if (filterTime) {
    const isAvailable = isSlotInAvailable(filterTime, availableSlots);
    if (isAvailable) {
      console.log(chalk.green(`  ✅ ${filterTime.start} - ${filterTime.end} 예약 가능`));
    } else {
      const conflicting = findConflictingReservation(filterTime, reservations);
      if (conflicting) {
        console.log(chalk.red(`  ❌ ${filterTime.start} - ${filterTime.end} 예약됨: ${conflicting.reserverName}`));
      } else {
        console.log(chalk.red(`  ❌ ${filterTime.start} - ${filterTime.end} 예약 불가`));
      }
    }
    return;
  }

  // 전체 시간대 표시
  const timeline = buildTimeline(reservations, availableSlots);

  for (const slot of timeline) {
    if (slot.type === 'available') {
      if (slot.start === WORK_HOURS.start && slot.end === WORK_HOURS.end) {
        console.log(chalk.green(`  ✅ 종일 가능`));
      } else {
        console.log(chalk.green(`  ✅ ${slot.start} - ${slot.end}`));
      }
    } else {
      console.log(chalk.red(`  ❌ ${slot.start} - ${slot.end}`) + chalk.gray(` (${slot.reserverName})`));
    }
  }

  if (timeline.length === 0) {
    console.log(chalk.yellow(`  ⚠️ 정보 없음`));
  }
}

interface TimelineSlot {
  type: 'available' | 'reserved';
  start: string;
  end: string;
  reserverName?: string;
}

/**
 * 예약과 빈 시간을 시간순으로 정렬하여 타임라인 생성
 */
function buildTimeline(
  reservations: Reservation[],
  availableSlots: TimeSlot[]
): TimelineSlot[] {
  const timeline: TimelineSlot[] = [];

  // 빈 시간 추가
  for (const slot of availableSlots) {
    timeline.push({
      type: 'available',
      start: slot.start,
      end: slot.end,
    });
  }

  // 예약 추가
  for (const res of reservations) {
    timeline.push({
      type: 'reserved',
      start: res.startTime,
      end: res.endTime,
      reserverName: res.reserverName,
    });
  }

  // 시작 시간 기준 정렬
  timeline.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  return timeline;
}

/**
 * 요청 시간대가 빈 시간에 포함되는지 확인
 */
function isSlotInAvailable(slot: TimeSlot, availableSlots: TimeSlot[]): boolean {
  const reqStart = timeToMinutes(slot.start);
  const reqEnd = timeToMinutes(slot.end);

  return availableSlots.some((avail) => {
    const availStart = timeToMinutes(avail.start);
    const availEnd = timeToMinutes(avail.end);
    return reqStart >= availStart && reqEnd <= availEnd;
  });
}

/**
 * 충돌하는 예약 찾기
 */
function findConflictingReservation(
  slot: TimeSlot,
  reservations: Reservation[]
): Reservation | undefined {
  const reqStart = timeToMinutes(slot.start);
  const reqEnd = timeToMinutes(slot.end);

  return reservations.find((res) => {
    const resStart = timeToMinutes(res.startTime);
    const resEnd = timeToMinutes(res.endTime);
    return reqStart < resEnd && reqEnd > resStart;
  });
}

/**
 * 예약 결과 출력
 */
export function displayReservationResult(
  success: boolean,
  roomName: string,
  date: string,
  startTime: string,
  endTime: string,
  message: string
): void {
  console.log();
  if (success) {
    console.log(chalk.bold.green('✅ 예약 완료!'));
    console.log(chalk.white(`   회의실: ${roomName}`));
    console.log(chalk.white(`   일시: ${formatDateDisplay(date)} ${startTime} - ${endTime}`));
  } else {
    console.log(chalk.bold.red('❌ 예약 실패'));
    console.log(chalk.red(`   ${message}`));
  }
  console.log();
}

/**
 * 로딩 메시지 출력
 */
export function showLoading(message: string): void {
  process.stdout.write(chalk.gray(`${message}...`));
}

/**
 * 로딩 완료
 */
export function hideLoading(): void {
  process.stdout.write(chalk.gray(' 완료\n'));
}

/**
 * 진행 상황 업데이트 (같은 줄에서 갱신)
 */
export function updateProgress(message: string): void {
  // 현재 줄을 지우고 새 메시지 출력
  process.stdout.write(`\r${chalk.gray(message)}`.padEnd(60));
}

/**
 * 진행 상황 완료
 */
export function completeProgress(): void {
  process.stdout.write('\n');
}

/**
 * 에러 출력
 */
export function showError(message: string): void {
  console.log(chalk.red(`\n❌ ${message}\n`));
}

/**
 * 성공 메시지 출력
 */
export function showSuccess(message: string): void {
  console.log(chalk.green(`\n✅ ${message}\n`));
}
