import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { CookieJar } from 'tough-cookie';
import {
  MeetingRoom,
  Reservation,
  ReservationParams,
  ReservationResult,
  RoomAvailability,
  GWApiResponse,
  CalResourceReservation,
  TimeSlot,
} from '../types/index.js';
import { GW_CONFIG, TARGET_ROOMS, AUTH_CONFIG, USER_INFO } from '../config.js';
import { calculateAvailableSlots } from '../utils/date.js';

export class GroupwareService {
  private cookieJar: CookieJar;
  private client: AxiosInstance;
  private isLoggedIn: boolean = false;
  private roomSeqMap: Map<string, number> = new Map();

  constructor() {
    this.cookieJar = new CookieJar();
    this.client = axios.create({
      baseURL: GW_CONFIG.baseUrl,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    // 요청 인터셉터: 쿠키 추가
    this.client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
      const url = `${config.baseURL || ''}${config.url || ''}`;
      const cookies = await this.cookieJar.getCookieString(url);
      if (cookies) {
        config.headers.set('Cookie', cookies);
      }
      return config;
    });

    // 응답 인터셉터: Set-Cookie 저장
    this.client.interceptors.response.use(async (response) => {
      const setCookies = response.headers['set-cookie'];
      if (setCookies) {
        const url = response.config.url || '';
        const baseUrl = response.config.baseURL || '';
        const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
        for (const cookie of setCookies) {
          await this.cookieJar.setCookie(cookie, fullUrl);
        }
      }
      return response;
    });
  }

  /**
   * 그룹웨어 로그인
   */
  async login(userId?: string, password?: string): Promise<boolean> {
    const id = userId || AUTH_CONFIG.userId;
    const pw = password || AUTH_CONFIG.password;

    if (!id || !pw) {
      throw new Error('로그인 정보가 설정되지 않았습니다. .env 파일을 확인하세요.');
    }

    try {
      // 1. 로그인 페이지 접근 (세션 쿠키 획득)
      await this.client.get('/gw/uat/uia/egovLoginUsr.do');

      // 2. actionLogin.do로 POST 요청 (실제 로그인 플로우)
      const formData = new URLSearchParams();
      formData.append('userId', id);
      formData.append('password', pw);
      formData.append('userSe', 'USER');

      const actionResponse = await this.client.post(
        '/gw/uat/uia/actionLogin.do',
        formData.toString(),
        {
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400,
        }
      );

      // 3. 로그인 성공 확인 - userMain.do에 접근 가능한지 확인
      const mainResponse = await this.client.get('/gw/userMain.do', {
        maxRedirects: 5,
      });

      // 응답 URL이나 내용으로 로그인 성공 여부 판단
      const responseUrl = mainResponse.request?.res?.responseUrl || '';
      const responseData = typeof mainResponse.data === 'string' ? mainResponse.data : '';

      this.isLoggedIn = mainResponse.status === 200 &&
        (responseUrl.includes('userMain.do') || responseData.includes('userMain'));

      if (this.isLoggedIn) {
        // 4. 일정 메뉴에 접근하여 schedule 세션 활성화
        try {
          await this.client.post('/gw/bizbox.do', 'selectedMenuNo=300000000', {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          });
        } catch {
          // 무시
        }

        // 5. 회의실 예약 페이지에 접근 (세션 초기화)
        try {
          await this.client.get('/schedule/Views/Common/resource/calendar?menu_no=302020000');
        } catch {
          // 무시
        }

        // 회의실 resSeq 매핑 로드
        await this.loadRoomSeqMap();
      }

      return this.isLoggedIn;
    } catch (error) {
      console.error('로그인 오류:', error);
      return false;
    }
  }

  /**
   * 회의실 resSeq 매핑 로드
   */
  private async loadRoomSeqMap(): Promise<void> {
    try {
      const response = await this.client.post<GWApiResponse>(
        `${GW_CONFIG.scheduleBaseUrl}${GW_CONFIG.endpoints.resourceTree}`,
        {},
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (response.data?.result) {
        this.parseResourceTree(response.data.result);
      }
    } catch (error) {
      console.warn('회의실 목록 로드 실패, 기본 매핑 사용');
      // 기본 매핑 사용 (R3.1 = 102 확인됨)
      this.roomSeqMap.set('R3.1', 102);
    }
  }

  /**
   * 리소스 트리 파싱하여 회의실 resSeq 추출
   */
  private parseResourceTree(data: unknown): void {
    const traverse = (node: Record<string, unknown>): void => {
      const resNm = node.resNm as string;
      const resSeq = node.resSeq as number;

      if (resNm && resSeq && TARGET_ROOMS.some((r) => r.name === resNm)) {
        this.roomSeqMap.set(resNm, resSeq);
      }

      const children = node.children as Record<string, unknown>[] | undefined;
      if (children) {
        children.forEach(traverse);
      }
    };

    if (Array.isArray(data)) {
      data.forEach((node) => traverse(node as Record<string, unknown>));
    } else if (typeof data === 'object' && data !== null) {
      traverse(data as Record<string, unknown>);
    }
  }

  /**
   * 회의실 resSeq 조회
   */
  getResSeq(roomName: string): number | undefined {
    return this.roomSeqMap.get(roomName);
  }

  /**
   * 대상 회의실 목록 반환 (resSeq 포함)
   */
  getMeetingRooms(): MeetingRoom[] {
    return TARGET_ROOMS.map((room) => ({
      ...room,
      resSeq: this.roomSeqMap.get(room.name) || room.resSeq,
    }));
  }

  /**
   * 특정 날짜의 모든 회의실 가용 현황 조회 (GetCalResourceListFull API 사용)
   */
  async getAvailability(date: string): Promise<RoomAvailability[]> {
    if (!this.isLoggedIn) {
      throw new Error('로그인이 필요합니다.');
    }

    try {
      // GetCalResourceListFull API로 모든 예약 정보 조회
      const response = await this.client.post<unknown>(
        `${GW_CONFIG.scheduleBaseUrl}${GW_CONFIG.endpoints.calResourceList}`,
        {
          start: `${date}T00:00:00`,
          end: `${date}T23:59:59`,
          favoriteYn: 'N',
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const data = response.data as CalResourceReservation[];
      const rooms = this.getMeetingRooms();
      const availabilities: RoomAvailability[] = [];

      // 대상 회의실 이름 목록
      const targetRoomNames = new Set(rooms.map(r => r.name));

      // 회의실별 예약 그룹화
      const reservationsByRoom = new Map<string, Reservation[]>();

      if (Array.isArray(data)) {
        for (const item of data) {
          const roomName = item.resNm || item.title?.match(/\[(.*?)\]/)?.[1];
          if (!roomName || !targetRoomNames.has(roomName)) continue;

          if (!reservationsByRoom.has(roomName)) {
            reservationsByRoom.set(roomName, []);
          }

          // 시간 파싱 (start/end는 ISO 형식 또는 HH:mm 형식)
          let startTime = item.fromTime || '';
          let endTime = item.toTime || '';

          // ISO 형식에서 시간 추출
          if (item.start) {
            const startMatch = item.start.match(/T(\d{2}:\d{2})/);
            if (startMatch) startTime = startMatch[1];
          }
          if (item.end) {
            const endMatch = item.end.match(/T(\d{2}:\d{2})/);
            if (endMatch) endTime = endMatch[1];
          }

          // 종일 예약 처리
          if (item.allDay || item.allDayYn === 'Y') {
            startTime = '09:00';
            endTime = '18:00';
          }

          if (startTime && endTime) {
            reservationsByRoom.get(roomName)!.push({
              resSeq: item.resSeq || 0,
              roomName,
              title: item.title || '',
              date,
              startTime,
              endTime,
              reserverName: item.useEmpNm || item.regEmpNm || '',
              reserverId: item.useEmpId || item.regEmpId || '',
            });
          }
        }
      }

      // 각 회의실별 가용 시간 계산
      for (const room of rooms) {
        const reservations = reservationsByRoom.get(room.name) || [];
        const availableSlots = calculateAvailableSlots(reservations);

        availabilities.push({
          room,
          date,
          reservations,
          availableSlots,
        });
      }

      return availabilities;
    } catch (error) {
      console.error('회의실 현황 조회 오류:', error);
      return [];
    }
  }

  /**
   * 회의실 예약
   */
  async reserveRoom(params: ReservationParams): Promise<ReservationResult> {
    if (!this.isLoggedIn) {
      throw new Error('로그인이 필요합니다.');
    }

    try {
      // 회의실 이름 조회
      const roomName = this.getRoomNameBySeq(params.resSeq);

      // InsertResourceReservation API 호출
      const payload = {
        resSeq: String(params.resSeq),
        reqText: params.title,
        descText: params.content || '',
        alldayYn: 'N',
        apprYn: 'N',
        startDate: `${params.fromDate} ${params.fromTime}:00`,
        endDate: `${params.toDate} ${params.toTime}:00`,
        resName: roomName,
        resSubscriberList: [USER_INFO],
      };

      const response = await this.client.post<GWApiResponse>(
        `${GW_CONFIG.scheduleBaseUrl}${GW_CONFIG.endpoints.insertReservation}`,
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (response.data?.resultCode === 0 || String(response.data?.resultCode) === '0') {
        return {
          success: true,
          message: '예약이 완료되었습니다.',
          reservationId: String(response.data.result),
        };
      } else {
        return {
          success: false,
          message: response.data?.resultMessage || '예약에 실패했습니다.',
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      return {
        success: false,
        message: `예약 오류: ${message}`,
      };
    }
  }

  /**
   * resSeq로 회의실 이름 조회
   */
  private getRoomNameBySeq(resSeq: number): string {
    for (const [name, seq] of this.roomSeqMap.entries()) {
      if (seq === resSeq) {
        return name;
      }
    }
    const room = TARGET_ROOMS.find((r) => r.resSeq === resSeq);
    return room?.name || '';
  }

  /**
   * 로그인 상태 확인
   */
  isAuthenticated(): boolean {
    return this.isLoggedIn;
  }
}

// 싱글톤 인스턴스
let instance: GroupwareService | null = null;

export function getGroupwareService(): GroupwareService {
  if (!instance) {
    instance = new GroupwareService();
  }
  return instance;
}
