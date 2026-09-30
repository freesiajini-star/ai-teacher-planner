# Firebase 연결 순서

1. Firebase Console에서 프로젝트를 만듭니다.
2. 웹 앱을 추가합니다.
3. Firebase AI Logic에서 Gemini Developer API를 활성화합니다.
4. Authentication에서 익명 로그인(Anonymous)을 활성화합니다.
5. Firestore Database를 생성합니다.
6. 웹 앱의 Firebase config를 `js/app.js`의 `firebaseConfig`에 붙여넣습니다.
7. GitHub Pages에 다시 업로드합니다.

현재 버전:
- PDF / 이미지 / TXT → Firebase AI Logic + Gemini 분석 가능
- HWP / HWPX → 파일 종류를 인식하지만 변환 어댑터는 다음 단계에서 연결
- 분석 결과를 Firestore `importSources`에 저장
- 다음 단계에서 "검토 → 모두 반영" 데이터 파이프라인을 연결

주의:
Firebase AI Logic의 인라인 멀티모달 요청은 총 20MB 제한이 있습니다. 큰 파일은 Cloud Storage + Agent Platform Gemini API 방식으로 확장할 수 있습니다.
