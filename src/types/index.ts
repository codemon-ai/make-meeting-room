// 회의실 정보
export interface MeetingRoom {
  resSeq: number;        // 자원 고유 ID
  name: string;          // 회의실 이름 (예: R3.1)
  floor: string;         // 층 (예: 3F)
  location: string;      // 위치 (예: 가산빌딩)
}

// 시간 슬롯
export interface TimeSlot {
  start: string;         // "09:00"
  end: string;           // "10:00"
}

// 예약 정보
export interface Reservation {
  resSeq: number;
  roomName: string;
  title: string;
  content?: string;
  date: string;          // "2025-12-03"
  startTime: string;     // "09:00"
  endTime: string;       // "10:00"
  reserverName: string;  // 예약자 이름
  reserverId: string;    // 예약자 ID
}

// 회의실 가용 상태
export interface RoomAvailability {
  room: MeetingRoom;
  date: string;
  reservations: Reservation[];
  availableSlots: TimeSlot[];
}

// 예약 요청 파라미터
export interface ReservationParams {
  resSeq: number;
  title: string;
  content?: string;
  fromDate: string;      // "2025-12-03"
  fromTime: string;      // "09:00"
  toDate: string;        // "2025-12-03"
  toTime: string;        // "10:00"
  userId?: string;       // 사용자 ID (기본: 로그인 사용자)
}

// 예약 결과
export interface ReservationResult {
  success: boolean;
  message: string;
  reservationId?: string;
}

// 그룹웨어 API 응답
export interface GWApiResponse<T = unknown> {
  resultCode: number;
  resultMessage: string;
  result: T;
}

// 그룹웨어 자원 트리 노드
export interface ResourceTreeNode {
  resSeq: number;
  resNm: string;         // 자원 이름
  parentSeq: number;
  level: number;
  children?: ResourceTreeNode[];
}

// 그룹웨어 예약 현황 응답 (GetCalResourceListFull API)
export interface CalResourceReservation {
  resSeq?: number;
  resNm?: string;
  title?: string;
  reqText?: string;      // 예약명 (다른 API 형식)
  fromDate?: string;
  fromTime?: string;
  toDate?: string;
  toTime?: string;
  start?: string;        // ISO 형식: "2025-12-03T09:00:00"
  end?: string;          // ISO 형식: "2025-12-03T10:00:00"
  startDate?: string;    // "2025-12-03 09:00:00" 형식
  endDate?: string;      // "2025-12-03 10:00:00" 형식
  allDay?: boolean;      // 종일 여부
  allDayYn?: string;     // 'Y' or 'N'
  regEmpNm?: string;     // 등록자 이름
  regEmpId?: string;     // 등록자 ID
  useEmpNm?: string;     // 사용자 이름
  useEmpId?: string;     // 사용자 ID
  empName?: string;      // 예약자 이름 (다른 API 형식)
}

// CLI 옵션
export interface CliOptions {
  check?: string;        // 빈 회의실 조회 날짜
  date?: string;         // 예약 날짜
  time?: string;         // 예약 시간 (예: "10:00-11:00")
  room?: string;         // 회의실 이름 (예: R3.1)
  title?: string;        // 예약명
  content?: string;      // 예약 내용
  calendar?: boolean;    // Google Calendar 등록 여부
  headless?: boolean;    // 브라우저 창 숨기기 (서버 모드)
}

// Google Calendar 이벤트
export interface CalendarEvent {
  summary: string;       // 제목
  description?: string;  // 설명
  location?: string;     // 장소 (회의실)
  start: {
    dateTime: string;    // ISO 8601 형식
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
}
