import { google, calendar_v3 } from 'googleapis';

// Google Calendar 설정
const GOOGLE_CONFIG = {
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  calendarUser: process.env.GOOGLE_CALENDAR_USER || '', // impersonation 대상 사용자
};

let calendarClient: calendar_v3.Calendar | null = null;

/**
 * Google Calendar 클라이언트 초기화 (Service Account + Domain-wide Delegation)
 */
export async function initGoogleCalendar(): Promise<boolean> {
  if (!GOOGLE_CONFIG.serviceAccountEmail || !GOOGLE_CONFIG.privateKey) {
    console.log('Google Calendar 설정이 없습니다. 캘린더 기능 비활성화.');
    return false;
  }

  try {
    const auth = new google.auth.JWT({
      email: GOOGLE_CONFIG.serviceAccountEmail,
      key: GOOGLE_CONFIG.privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: GOOGLE_CONFIG.calendarUser, // impersonation
    });

    await auth.authorize();
    calendarClient = google.calendar({ version: 'v3', auth });
    console.log('Google Calendar 인증 완료');
    return true;
  } catch (error) {
    console.error('Google Calendar 인증 실패:', error);
    return false;
  }
}

/**
 * Google Calendar 활성화 여부
 */
export function isCalendarEnabled(): boolean {
  return calendarClient !== null;
}

/**
 * 캘린더 일정 생성 인터페이스
 */
export interface CalendarEventInput {
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  location?: string;
  attendees: string[]; // 이메일 배열
}

/**
 * 캘린더 일정 생성 결과
 */
export interface CalendarEventResult {
  success: boolean;
  eventId?: string;
  eventLink?: string;
  message: string;
}

/**
 * Google Calendar 일정 생성
 */
export async function createCalendarEvent(
  organizerEmail: string,
  event: CalendarEventInput
): Promise<CalendarEventResult> {
  if (!calendarClient) {
    return {
      success: false,
      message: 'Google Calendar가 설정되지 않았습니다.',
    };
  }

  try {
    // organizer impersonation을 위한 새 클라이언트 생성
    const auth = new google.auth.JWT({
      email: GOOGLE_CONFIG.serviceAccountEmail,
      key: GOOGLE_CONFIG.privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: organizerEmail,
    });

    await auth.authorize();
    const userCalendar = google.calendar({ version: 'v3', auth });

    // 일정 데이터 구성
    const startDateTime = `${event.date}T${event.startTime}:00`;
    const endDateTime = `${event.date}T${event.endTime}:00`;

    const calendarEvent: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: {
        dateTime: startDateTime,
        timeZone: 'Asia/Seoul',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'Asia/Seoul',
      },
      attendees: event.attendees.map((email) => ({
        email,
        responseStatus: 'needsAction',
      })),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 10 },
          { method: 'email', minutes: 30 },
        ],
      },
    };

    const response = await userCalendar.events.insert({
      calendarId: 'primary',
      requestBody: calendarEvent,
      sendUpdates: 'all', // 참석자에게 초대 이메일 발송
    });

    return {
      success: true,
      eventId: response.data.id || undefined,
      eventLink: response.data.htmlLink || undefined,
      message: '캘린더 일정이 생성되었습니다.',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('캘린더 일정 생성 실패:', errorMessage);
    return {
      success: false,
      message: `캘린더 일정 생성 실패: ${errorMessage}`,
    };
  }
}

/**
 * Slack 사용자 ID로 이메일 조회
 */
export async function getEmailsFromSlackMentions(
  slackClient: { users: { info: (args: { user: string }) => Promise<{ user?: { profile?: { email?: string } } }> } },
  userIds: string[]
): Promise<string[]> {
  const emails: string[] = [];

  for (const userId of userIds) {
    try {
      const result = await slackClient.users.info({ user: userId });
      const email = result.user?.profile?.email;
      if (email) {
        emails.push(email);
      }
    } catch (error) {
      console.error(`Slack 사용자 이메일 조회 실패 (${userId}):`, error);
    }
  }

  return emails;
}

/**
 * 텍스트에서 Slack 멘션 추출 (<@U12345> 형식)
 */
export function extractSlackMentions(text: string): string[] {
  const mentionRegex = /<@([A-Z0-9]+)>/gi;
  const matches = text.matchAll(mentionRegex);
  const userIds: string[] = [];

  for (const match of matches) {
    userIds.push(match[1]);
  }

  // 첫 번째는 봇 멘션이므로 제외
  return userIds.slice(1);
}
