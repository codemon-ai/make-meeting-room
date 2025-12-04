#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import dayjs from 'dayjs';
import { getGroupwareBrowserService } from './services/groupware-browser.js';
import {
  displayAvailability,
  displayReservationResult,
  showLoading,
  hideLoading,
  showError,
  showSuccess,
  updateProgress,
  completeProgress,
} from './services/display.js';
import { parseDate, parseTimeRange, formatDateDisplay } from './utils/date.js';
import { validateConfig, TARGET_ROOMS, WORK_HOURS } from './config.js';
import { CliOptions, TimeSlot, RoomAvailability } from './types/index.js';

const program = new Command();

program
  .name('meeting-room')
  .description('회의실 예약 자동화 CLI - 그룹웨어 예약 및 Google Calendar 연동')
  .version('1.0.0');

program
  .option('-c, --check <date>', '빈 회의실 조회 (today, tomorrow, YYYY-MM-DD)')
  .option('-d, --date <date>', '예약 날짜 (today, tomorrow, YYYY-MM-DD)')
  .option('-t, --time <range>', '시간 범위 (예: 10:00-11:00)')
  .option('-r, --room <name>', '회의실 이름 (예: R3.1)')
  .option('--title <title>', '예약명')
  .option('--content <content>', '예약 내용')
  .option('--calendar', 'Google Calendar에 등록')
  .option('--headless', '브라우저 창 숨기기 (서버 모드)');

program.parse();

const options = program.opts<CliOptions>();

async function main() {
  console.log(chalk.bold.cyan('\n🏢 회의실 예약 시스템\n'));

  // 설정 검증
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    showError('설정 오류:');
    configValidation.errors.forEach((err) => console.log(chalk.red(`  - ${err}`)));
    console.log(chalk.gray('\n.env 파일에 GW_USER_ID와 GW_PASSWORD를 설정하세요.'));
    process.exit(1);
  }

  // 그룹웨어 로그인 (브라우저 기반)
  const gw = getGroupwareBrowserService();

  // headless 모드 설정
  if (options.headless) {
    gw.setHeadless(true);
  }

  const loginSuccess = await gw.login(undefined, undefined, updateProgress);
  completeProgress();

  if (!loginSuccess) {
    showError('그룹웨어 로그인에 실패했습니다.');
    process.exit(1);
  }

  // 명령줄 옵션 처리
  if (options.check) {
    await handleCheck(gw, options);
  } else if (options.date && options.time && options.room && options.title) {
    await handleDirectReservation(gw, options);
  } else {
    await handleInteractiveMode(gw);
  }
}

/**
 * 빈 회의실 조회 모드
 */
async function handleCheck(gw: ReturnType<typeof getGroupwareBrowserService>, options: CliOptions) {
  const date = parseDate(options.check!);
  const filterTime = options.time ? parseTimeRange(options.time) : undefined;

  showLoading('회의실 현황 조회 중');
  const availabilities = await gw.getAvailability(date);
  hideLoading();

  displayAvailability(availabilities, filterTime);
}

/**
 * 직접 예약 모드
 */
async function handleDirectReservation(
  gw: ReturnType<typeof getGroupwareBrowserService>,
  options: CliOptions
) {
  const date = parseDate(options.date!);
  const timeRange = parseTimeRange(options.time!);
  const roomName = options.room!;
  const title = options.title!;

  // 회의실 resSeq 조회
  const resSeq = gw.getResSeq(roomName);
  if (!resSeq) {
    showError(`회의실 "${roomName}"을 찾을 수 없습니다.`);
    console.log(chalk.gray('사용 가능한 회의실:'));
    TARGET_ROOMS.forEach((r) => console.log(chalk.gray(`  - ${r.name}`)));
    process.exit(1);
  }

  // 예약 가능 여부 확인
  showLoading('예약 가능 여부 확인 중');
  const availabilities = await gw.getAvailability(date);
  hideLoading();

  const roomAvail = availabilities.find((a) => a.room.name === roomName);
  if (!roomAvail) {
    showError('회의실 정보를 조회할 수 없습니다.');
    process.exit(1);
  }

  const isAvailable = checkSlotAvailable(timeRange, roomAvail);
  if (!isAvailable) {
    showError(`${roomName} 회의실은 ${timeRange.start}-${timeRange.end}에 이미 예약되어 있습니다.`);
    displayAvailability([roomAvail]);
    process.exit(1);
  }

  // 예약 실행
  showLoading('예약 진행 중');
  const result = await gw.reserveRoom({
    resSeq,
    title,
    content: options.content,
    fromDate: date,
    fromTime: timeRange.start,
    toDate: date,
    toTime: timeRange.end,
  });
  hideLoading();

  displayReservationResult(
    result.success,
    roomName,
    date,
    timeRange.start,
    timeRange.end,
    result.message
  );

  if (!result.success) {
    process.exit(1);
  }
}

/**
 * 대화형 모드
 */
async function handleInteractiveMode(gw: ReturnType<typeof getGroupwareBrowserService>) {
  // 1. 날짜 선택
  const { dateChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'dateChoice',
      message: '날짜를 선택하세요:',
      choices: [
        { name: `오늘 (${dayjs().format('YYYY-MM-DD')})`, value: 'today' },
        { name: `내일 (${dayjs().add(1, 'day').format('YYYY-MM-DD')})`, value: 'tomorrow' },
        { name: '직접 입력', value: 'custom' },
      ],
    },
  ]);

  let date: string;
  if (dateChoice === 'custom') {
    const { customDate } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customDate',
        message: '날짜를 입력하세요 (YYYY-MM-DD):',
        validate: (input) => {
          try {
            parseDate(input);
            return true;
          } catch {
            return '올바른 날짜 형식을 입력하세요 (YYYY-MM-DD)';
          }
        },
      },
    ]);
    date = parseDate(customDate);
  } else {
    date = parseDate(dateChoice);
  }

  // 2. 빈 회의실 현황 표시
  showLoading('회의실 현황 조회 중');
  const availabilities = await gw.getAvailability(date);
  hideLoading();

  displayAvailability(availabilities);

  // 3. 예약 진행 여부 확인
  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: '예약을 진행하시겠습니까?',
      default: true,
    },
  ]);

  if (!proceed) {
    console.log(chalk.gray('\n예약을 취소했습니다.\n'));
    return;
  }

  // 4. 회의실 선택
  const availableRooms = availabilities
    .filter((a) => a.availableSlots.length > 0)
    .map((a) => a.room.name);

  if (availableRooms.length === 0) {
    showError('예약 가능한 회의실이 없습니다.');
    return;
  }

  const { roomName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'roomName',
      message: '회의실을 선택하세요:',
      choices: availableRooms,
    },
  ]);

  const selectedRoom = availabilities.find((a) => a.room.name === roomName)!;

  // 5. 시간대 선택
  const timeChoices = generateTimeChoices(selectedRoom);

  const { timeSlot } = await inquirer.prompt([
    {
      type: 'list',
      name: 'timeSlot',
      message: '시간대를 선택하세요:',
      choices: timeChoices,
    },
  ]);

  // 6. 종료 시간 선택
  const { endTime } = await inquirer.prompt([
    {
      type: 'list',
      name: 'endTime',
      message: '종료 시간을 선택하세요:',
      choices: generateEndTimeChoices(timeSlot, selectedRoom),
    },
  ]);

  // 7. 예약명 입력
  const { title } = await inquirer.prompt([
    {
      type: 'input',
      name: 'title',
      message: '예약명을 입력하세요:',
      validate: (input) => (input.trim() ? true : '예약명을 입력하세요'),
    },
  ]);

  // 8. 예약 내용 입력 (선택)
  const { content } = await inquirer.prompt([
    {
      type: 'input',
      name: 'content',
      message: '예약 내용 (선택사항):',
    },
  ]);

  // 9. 확인
  console.log();
  console.log(chalk.bold('📋 예약 정보 확인'));
  console.log(chalk.white(`   회의실: ${roomName}`));
  console.log(chalk.white(`   일시: ${formatDateDisplay(date)} ${timeSlot} - ${endTime}`));
  console.log(chalk.white(`   예약명: ${title}`));
  if (content) {
    console.log(chalk.white(`   내용: ${content}`));
  }
  console.log();

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: '예약을 진행하시겠습니까?',
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.gray('\n예약을 취소했습니다.\n'));
    return;
  }

  // 10. 예약 실행
  const resSeq = gw.getResSeq(roomName);
  if (!resSeq) {
    showError('회의실 정보를 찾을 수 없습니다.');
    return;
  }

  showLoading('예약 진행 중');
  const result = await gw.reserveRoom({
    resSeq,
    title,
    content: content || undefined,
    fromDate: date,
    fromTime: timeSlot,
    toDate: date,
    toTime: endTime,
  });
  hideLoading();

  displayReservationResult(result.success, roomName, date, timeSlot, endTime, result.message);
}

/**
 * 시간대 선택지 생성
 */
function generateTimeChoices(roomAvail: RoomAvailability): string[] {
  const choices: string[] = [];

  for (const slot of roomAvail.availableSlots) {
    let current = slot.start;
    while (current < slot.end) {
      choices.push(current);
      // 30분 단위 증가
      const [h, m] = current.split(':').map(Number);
      const nextMinutes = h * 60 + m + 30;
      current = `${Math.floor(nextMinutes / 60).toString().padStart(2, '0')}:${(nextMinutes % 60).toString().padStart(2, '0')}`;
    }
  }

  return choices;
}

/**
 * 종료 시간 선택지 생성
 */
function generateEndTimeChoices(startTime: string, roomAvail: RoomAvailability): string[] {
  const choices: string[] = [];
  const [startH, startM] = startTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;

  // 해당 시작 시간이 포함된 빈 시간 슬롯 찾기
  const containingSlot = roomAvail.availableSlots.find((slot) => {
    const slotStart = parseInt(slot.start.split(':')[0]) * 60 + parseInt(slot.start.split(':')[1]);
    const slotEnd = parseInt(slot.end.split(':')[0]) * 60 + parseInt(slot.end.split(':')[1]);
    return startMinutes >= slotStart && startMinutes < slotEnd;
  });

  if (!containingSlot) return [];

  const slotEndMinutes = parseInt(containingSlot.end.split(':')[0]) * 60 + parseInt(containingSlot.end.split(':')[1]);

  // 시작 시간 + 30분부터 슬롯 종료 시간까지
  let current = startMinutes + 30;
  while (current <= slotEndMinutes) {
    const timeStr = `${Math.floor(current / 60).toString().padStart(2, '0')}:${(current % 60).toString().padStart(2, '0')}`;
    const duration = current - startMinutes;
    const durationStr = duration >= 60 ? `${Math.floor(duration / 60)}시간${duration % 60 ? ` ${duration % 60}분` : ''}` : `${duration}분`;
    choices.push({ name: `${timeStr} (${durationStr})`, value: timeStr } as unknown as string);
    current += 30;
  }

  return choices;
}

/**
 * 시간대가 예약 가능한지 확인
 * 업무시간 내: availableSlots에 포함되어야 함
 * 업무시간 외: 기존 예약과 충돌하지 않으면 가능
 */
function checkSlotAvailable(slot: TimeSlot, roomAvail: RoomAvailability): boolean {
  const reqStart = parseInt(slot.start.split(':')[0]) * 60 + parseInt(slot.start.split(':')[1]);
  const reqEnd = parseInt(slot.end.split(':')[0]) * 60 + parseInt(slot.end.split(':')[1]);
  const workStart = parseInt(WORK_HOURS.start.split(':')[0]) * 60 + parseInt(WORK_HOURS.start.split(':')[1]);
  const workEnd = parseInt(WORK_HOURS.end.split(':')[0]) * 60 + parseInt(WORK_HOURS.end.split(':')[1]);

  // 업무시간 내의 요청은 availableSlots에서 확인
  if (reqStart >= workStart && reqEnd <= workEnd) {
    return roomAvail.availableSlots.some((avail) => {
      const availStart = parseInt(avail.start.split(':')[0]) * 60 + parseInt(avail.start.split(':')[1]);
      const availEnd = parseInt(avail.end.split(':')[0]) * 60 + parseInt(avail.end.split(':')[1]);
      return reqStart >= availStart && reqEnd <= availEnd;
    });
  }

  // 업무시간 외의 요청은 기존 예약과 충돌 여부만 확인
  return !roomAvail.reservations.some((res) => {
    const resStart = parseInt(res.startTime.split(':')[0]) * 60 + parseInt(res.startTime.split(':')[1]);
    const resEnd = parseInt(res.endTime.split(':')[0]) * 60 + parseInt(res.endTime.split(':')[1]);
    // 시간대가 겹치는지 확인
    return reqStart < resEnd && reqEnd > resStart;
  });
}

// 실행
main()
  .catch((error) => {
    showError(error.message);
    process.exit(1);
  })
  .finally(async () => {
    // 브라우저 정리
    const gw = getGroupwareBrowserService();
    await gw.close();
  });
