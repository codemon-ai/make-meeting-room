# 서버 배포

현재 변경사항을 커밋하고 서버에 배포해주세요.

## 단계

1. `git status`로 변경사항 확인
2. 변경된 파일이 있으면 커밋 (커밋 메시지는 변경 내용 요약)
3. `git push`로 원격 저장소에 푸시
4. SSH로 서버 접속하여 배포:
   ```bash
   ssh coffeemon@222.235.28.15 "export PATH=/usr/local/bin:\$PATH && cd /Users/coffeemon/workspace/make-meeting-room && git pull && npm run build && pm2 restart mr-slack"
   ```
5. 배포 결과 확인 (PM2 상태)
