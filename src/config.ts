import dotenv from 'dotenv';
import { MeetingRoom } from './types/index.js';

dotenv.config();

// 그룹웨어 설정
export const GW_CONFIG = {
  baseUrl: 'https://gw.rsquare.co.kr',
  loginUrl: '/gw/uat/uia/egovLoginUsr.do',
  scheduleBaseUrl: '/schedule',
  endpoints: {
    resourceTree: '/WebResource/SearchEmpResourceTree',
    reservationList: '/WebResource/SearchCalResourceReservationList',
    calResourceList: '/WebResource/GetCalResourceListFull',
    insertReservation: '/WebResource/InsertResourceReservation',
  },
};

// 사용자 인증 정보
export const AUTH_CONFIG = {
  userId: process.env.GW_USER_ID || '',
  password: process.env.GW_PASSWORD || '',
};

// 사용자 정보 (예약 시 resSubscriberList에 사용)
// 로그인 후 API 응답에서 동적으로 가져오거나 환경변수로 설정
export const USER_INFO = {
  userType: process.env.GW_USER_TYPE || '10',
  orgType: process.env.GW_ORG_TYPE || 'U',
  groupSeq: process.env.GW_GROUP_SEQ || 'rsquare',
  compSeq: process.env.GW_COMP_SEQ || '1000',
  deptSeq: process.env.GW_DEPT_SEQ || '',
  empSeq: process.env.GW_EMP_SEQ || '',
  empName: process.env.GW_EMP_NAME || '',
  loginId: process.env.GW_USER_ID || '',
  deptName: process.env.GW_DEPT_NAME || '',
  dutyCode: process.env.GW_DUTY_CODE || '',
  path: process.env.GW_PATH || '',
  superKey: process.env.GW_SUPER_KEY || '',
};

// 대상 회의실 목록 (가산빌딩 2~3층)
// resSeq는 API 호출로 동적으로 확인 필요
export const TARGET_ROOMS: MeetingRoom[] = [
  { resSeq: 0, name: 'R2.1', floor: '2F', location: '가산빌딩' },
  { resSeq: 0, name: 'R2.2', floor: '2F', location: '가산빌딩' },
  { resSeq: 102, name: 'R3.1', floor: '3F', location: '가산빌딩' },  // 확인됨
  { resSeq: 0, name: 'R3.2', floor: '3F', location: '가산빌딩' },
  { resSeq: 0, name: 'R3.3', floor: '3F', location: '가산빌딩' },
  { resSeq: 0, name: 'R3.5', floor: '3F', location: '가산빌딩' },
];

// 업무 시간 설정
export const WORK_HOURS = {
  start: '09:00',
  end: '18:00',
};

// 예약 시간 단위 (분)
export const TIME_SLOT_INTERVAL = 30;

// Google Calendar 설정
export const GOOGLE_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback',
  scopes: ['https://www.googleapis.com/auth/calendar.events'],
  timeZone: 'Asia/Seoul',
};

// Slack 설정
export const SLACK_CONFIG = {
  botToken: process.env.SLACK_BOT_TOKEN || '',
  signingSecret: process.env.SLACK_SIGNING_SECRET || '',
  appToken: process.env.SLACK_APP_TOKEN || '',
};

// 설정 검증
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!AUTH_CONFIG.userId) {
    errors.push('GW_USER_ID 환경변수가 설정되지 않았습니다.');
  }
  if (!AUTH_CONFIG.password) {
    errors.push('GW_PASSWORD 환경변수가 설정되지 않았습니다.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
