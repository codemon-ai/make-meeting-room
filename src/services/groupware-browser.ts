import { chromium, Browser, Page, BrowserContext } from 'playwright';
import {
  MeetingRoom,
  Reservation,
  ReservationParams,
  ReservationResult,
  RoomAvailability,
  CalResourceReservation,
} from '../types/index.js';
import { GW_CONFIG, TARGET_ROOMS, AUTH_CONFIG, USER_INFO } from '../config.js';
import { calculateAvailableSlots } from '../utils/date.js';

export class GroupwareBrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isLoggedIn: boolean = false;
  private roomSeqMap: Map<string, number> = new Map();
  private headless: boolean = false;

  /**
   * headless 모드 설정
   */
  setHeadless(headless: boolean): void {
    this.headless = headless;
  }

  /**
   * 브라우저 초기화
   */
  private async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.headless,
      });
      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      });
      this.page = await this.context.newPage();

      // 팝업 창 자동 닫기
      this.context.on('page', async (newPage) => {
        await newPage.close();
      });
    }
  }

  /**
   * 브라우저 종료
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  /**
   * 그룹웨어 로그인
   * @param userId 사용자 ID (기본: 환경변수)
   * @param password 비밀번호 (기본: 환경변수)
   * @param onProgress 진행 상황 콜백
   */
  async login(
    userId?: string,
    password?: string,
    onProgress?: (message: string) => void
  ): Promise<boolean> {
    const id = userId || AUTH_CONFIG.userId;
    const pw = password || AUTH_CONFIG.password;
    const log = onProgress || (() => {});

    if (!id || !pw) {
      throw new Error('로그인 정보가 설정되지 않았습니다. .env 파일을 확인하세요.');
    }

    try {
      log('브라우저 시작 중...');
      await this.initBrowser();
      if (!this.page) throw new Error('브라우저 초기화 실패');

      // 1. 로그인 페이지 접근
      log('로그인 페이지 접속 중...');
      await this.page.goto(`${GW_CONFIG.baseUrl}/gw/uat/uia/egovLoginUsr.do`, {
        waitUntil: 'networkidle',
      });

      // 2. 로그인 폼 입력 (getByRole 사용 - MCP와 동일)
      log('로그인 정보 입력 중...');
      await this.page.getByRole('textbox', { name: '아이디 입력' }).fill(id);
      await this.page.getByRole('textbox', { name: '패스워드 입력' }).fill(pw);


      // 3. actionLogin() 함수 호출로 로그인 실행
      log('로그인 요청 중...');
      await this.page.evaluate('actionLogin()');

      // 4. 로그인 성공 후 리디렉션 완료 대기
      log('인증 확인 중...');
      await this.page.waitForTimeout(3000);

      // 리디렉션이 진행 중이면 최종 목적지까지 대기
      for (let i = 0; i < 10; i++) {
        const url = this.page.url();
        if (url.includes('userMain.do')) {
          break;
        }
          await this.page.waitForTimeout(1000);
      }

      this.isLoggedIn = this.page.url().includes('userMain.do');

      if (this.isLoggedIn) {
        // 5. 일정 메뉴로 이동 (cell 요소 클릭)
        log('일정 메뉴 이동 중...');
        await this.page.getByRole('cell', { name: '일정' }).click();
        await this.page.waitForTimeout(1500);

        // 6. 회의실예약 메뉴 펼치기
        log('회의실예약 메뉴 탐색 중...');
        await this.page.locator('span').filter({ hasText: '회의실예약' }).first().click();
        await this.page.waitForTimeout(500);

        // 7. 회의실예약 링크 클릭
        await this.page.getByRole('link', { name: '회의실예약' }).first().click();
        await this.page.waitForTimeout(2000);

        // 8. 회의실 resSeq 매핑 로드
        log('회의실 정보 로딩 중...');
        await this.loadRoomSeqMap();
      }

      return this.isLoggedIn;
    } catch {
      return false;
    }
  }

  /**
   * 회의실 resSeq 매핑 로드
   */
  private async loadRoomSeqMap(): Promise<void> {
    if (!this.page || !this.context) {
      this.setDefaultRoomSeqMap();
      return;
    }

    try {
      // iframe 내에서 API 호출하여 데이터 가져오기
      const response = await this.page.evaluate(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/schedule/WebResource/SearchEmpResourceTree`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          credentials: 'include',
        });
        return res.json();
      }, GW_CONFIG.baseUrl) as { result?: unknown };

      if (response?.result) {
        this.parseResourceTree(response.result);
      }

      // API 응답이 없거나 파싱 후 맵이 비어있으면 기본값 사용
      if (this.roomSeqMap.size === 0) {
        this.setDefaultRoomSeqMap();
      }
    } catch {
      this.setDefaultRoomSeqMap();
    }
  }

  /**
   * 기본 회의실 resSeq 매핑 설정
   */
  private setDefaultRoomSeqMap(): void {
    this.roomSeqMap.set('R2.1', 100);
    this.roomSeqMap.set('R2.2', 101);
    this.roomSeqMap.set('R3.1', 102);
    this.roomSeqMap.set('R3.2', 103);
    this.roomSeqMap.set('R3.3', 104);
    this.roomSeqMap.set('R3.5', 106);
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
   * 특정 날짜의 모든 회의실 가용 현황 조회
   * GetCalResourceListFull API를 사용하여 전체 예약을 조회하고 클라이언트에서 필터링
   */
  async getAvailability(date: string): Promise<RoomAvailability[]> {
    if (!this.isLoggedIn || !this.page) {
      throw new Error('로그인이 필요합니다.');
    }

    try {
      const rooms = this.getMeetingRooms();
      const targetRoomNames = new Set(rooms.map((r) => r.name));

      // GetCalResourceListFull API로 전체 예약 조회
      const data = await this.page.evaluate(
        async ({ baseUrl, date }) => {
          const res = await fetch(`${baseUrl}/schedule/WebResource/GetCalResourceListFull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              start: `${date}T00:00:00`,
              end: `${date}T23:59:59`,
              favoriteYn: 'N',
            }),
            credentials: 'include',
          });
          return res.json();
        },
        { baseUrl: GW_CONFIG.baseUrl, date }
      );

      // API 응답 구조: { resultCode, resultMessage, result: { resConfig, resList: [...] } }
      type ApiResponse = {
        resultCode?: string | number;
        result?: {
          resList?: Array<{
            resSeq?: string | number;
            resName?: string;
            reqText?: string;
            startDate?: string; // 로컬 형식: "2025-12-05 10:00:00"
            endDate?: string; // 일부 응답에서 사용
            resStartDate?: string; // ISO 형식: "2025-12-05T10:00:00.000Z"
            resEndDate?: string; // ISO 형식: "2025-12-05T10:30:00.000Z"
            empName?: string;
            alldayYn?: string;
          }>;
        };
      };

      const response = data as ApiResponse;
      const resList = response?.result?.resList || [];

      // 회의실별 예약 그룹화
      const reservationsByRoom = new Map<string, Reservation[]>();
      for (const room of rooms) {
        reservationsByRoom.set(room.name, []);
      }

      // 예약 데이터 파싱 및 필터링
      for (const item of resList) {
        const roomName = item.resName || '';

        // 대상 회의실만 필터링
        if (!targetRoomNames.has(roomName)) {
          continue;
        }

        // startDate 형식: "2025-12-05 09:00:00"
        // resEndDate 형식: "2025-12-05T10:30:00.000Z" (ISO)
        const startDateStr = item.startDate || '';
        const endDateStr = item.endDate || '';
        const resEndDateStr = item.resEndDate || '';

        // 해당 날짜의 예약만 필터링
        if (!startDateStr.startsWith(date)) {
          continue;
        }

        // 시간 추출 (HH:mm)
        // startDate에서 시간 추출: "2025-12-05 10:00:00" -> "10:00"
        const startMatch = startDateStr.match(/(\d{2}:\d{2}):\d{2}$/);

        // endDate 또는 resEndDate에서 시간 추출
        let endMatch = endDateStr.match(/(\d{2}:\d{2}):\d{2}$/);
        if (!endMatch && resEndDateStr) {
          // ISO 형식에서 시간 추출: "2025-12-05T10:30:00.000Z" -> "10:30"
          const isoMatch = resEndDateStr.match(/T(\d{2}:\d{2})/);
          if (isoMatch) {
            endMatch = isoMatch;
          }
        }

        let startTime = startMatch ? startMatch[1] : '';
        let endTime = endMatch ? endMatch[1] : '';

        // 종일 예약 처리
        if (item.alldayYn === 'Y') {
          startTime = '09:00';
          endTime = '18:00';
        }

        if (startTime && endTime) {
          const resSeq =
            typeof item.resSeq === 'string' ? parseInt(item.resSeq, 10) : item.resSeq || 0;

          reservationsByRoom.get(roomName)!.push({
            resSeq,
            roomName,
            title: item.reqText || '',
            date,
            startTime,
            endTime,
            reserverName: item.empName || '',
            reserverId: '',
          });
        }
      }

      // 각 회의실별 가용 시간 계산
      const availabilities: RoomAvailability[] = [];
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
    if (!this.isLoggedIn || !this.page) {
      throw new Error('로그인이 필요합니다.');
    }

    try {
      // 회의실 이름 조회 (resSeq로부터)
      const roomName = this.getRoomNameBySeq(params.resSeq);

      // InsertResourceReservation API 호출
      const response = (await this.page.evaluate(
        async ({ baseUrl, params, userInfo, roomName }) => {
          const payload = {
            resSeq: String(params.resSeq),
            reqText: params.title,
            descText: params.content || '',
            alldayYn: 'N',
            apprYn: 'N',
            startDate: `${params.fromDate} ${params.fromTime}:00`,
            endDate: `${params.toDate} ${params.toTime}:00`,
            resName: roomName,
            resSubscriberList: [userInfo],
          };

          const res = await fetch(`${baseUrl}/schedule/WebResource/InsertResourceReservation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            credentials: 'include',
          });
          return res.json();
        },
        { baseUrl: GW_CONFIG.baseUrl, params, userInfo: USER_INFO, roomName }
      )) as { resultCode?: number | string; resultMessage?: string; result?: unknown; status?: string } | string;

      // 응답 확인
      const isSuccess =
        response === 'SUCCESS' ||
        (typeof response === 'object' &&
          response !== null &&
          (response.resultCode === 0 ||
            response.resultCode === '0' ||
            response.resultMessage === 'SUCCESS' ||
            response.result === 'SUCCESS' ||
            response.status === 'SUCCESS' ||
            (typeof response.result === 'string' && response.result.includes('SUCCESS'))));

      if (isSuccess) {
        return {
          success: true,
          message: '예약이 완료되었습니다.',
          reservationId: typeof response === 'string' ? '' : String(response?.result || ''),
        };
      } else {
        const errorMsg =
          typeof response === 'string'
            ? response
            : response?.resultMessage || String(response?.result) || '예약에 실패했습니다.';
        return {
          success: false,
          message: errorMsg,
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
    // 기본 매핑에서도 확인
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
let instance: GroupwareBrowserService | null = null;

export function getGroupwareBrowserService(): GroupwareBrowserService {
  if (!instance) {
    instance = new GroupwareBrowserService();
  }
  return instance;
}
