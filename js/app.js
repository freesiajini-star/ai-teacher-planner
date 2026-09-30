import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

/*
  1) Firebase Console에서 웹 앱을 만든 뒤 아래 firebaseConfig를 교체하세요.
  2) Firebase AI Logic에서 Gemini Developer API를 활성화하세요.
  3) Authentication에서 익명 로그인을 활성화하세요.
  4) Firestore Database를 생성하세요.
*/
const firebaseConfig = {
  apiKey: "PASTE_FIREBASE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

const configured = !Object.values(firebaseConfig).some(v => v.startsWith("PASTE_"));
let app, model, db, auth;

if (configured) {
  try {
    app = initializeApp(firebaseConfig);
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    model = getGenerativeModel(ai, { model: "gemini-3.8-flash" });
    db = getFirestore(app);
    auth = getAuth(app);
    signInAnonymously(auth).catch(console.error);
  } catch (e) { console.error(e); }
}

const modal = document.getElementById("importModal");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const status = document.getElementById("analysisStatus");
const resultBox = document.getElementById("resultBox");

document.getElementById("openImport").onclick = () => modal.classList.add("open");
document.getElementById("closeImport").onclick = () => modal.classList.remove("open");
document.getElementById("cancelImport").onclick = () => modal.classList.remove("open");

function renderFiles(files) {
  fileList.innerHTML = "";
  [...files].forEach(file => {
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `<span>${file.name}</span><span>${file.type || "알 수 없는 형식"} · ${(file.size/1024/1024).toFixed(1)}MB</span>`;
    fileList.appendChild(row);
  });
}
fileInput.addEventListener("change", e => renderFiles(e.target.files));

const dropzone = document.getElementById("dropzone");
dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.style.borderColor = "#6878e8"; });
dropzone.addEventListener("dragleave", () => dropzone.style.borderColor = "#b8c0d4");
dropzone.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.style.borderColor = "#b8c0d4";
  if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; renderFiles(e.dataTransfer.files); }
});

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fileToPart(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { inlineData: { data: bytesToBase64(bytes), mimeType: file.type || "application/octet-stream" } };
}

function promptFor(fileNames) {
  return `당신은 초등학교 교사의 교육자료를 구조화하는 AI입니다.
다음 파일들을 분석하여 앱 데이터로 옮길 후보를 찾아주세요.

중요 규칙:
1. 과목명과 활동명/단원명/주제명을 구별하세요.
2. 학교자율시간처럼 학교가 독자적으로 만든 과목명도 정식 과목 후보로 인정하세요.
3. 문서의 표 제목, 상하위 관계, 반복 위치, 차시와의 관계를 우선 근거로 판단하세요.
4. 확실하지 않은 항목은 confidence를 low 또는 medium으로 표시하고 확정하지 마세요.
5. 반복 일정과 특정 날짜 예외를 구별하세요.
6. 학사일정은 날짜, 종료일, 행사명, 대상 학년, 교시/시간, 비고를 가능한 범위에서 추출하세요.
7. 시간표는 요일, 교시, 과목, 담당자 후보, 장소 후보를 추출하세요.
8. 원문에 없는 정보는 만들지 마세요.

반드시 JSON 하나만 반환하세요. 형식:
{
  "school": {"name": "", "schoolYear": ""},
  "subjects": [{"name":"","kind":"기본과목|학교자율시간|기타","confidence":"high|medium|low","evidence":""}],
  "timetable": [{"weekday":"","period":"","subject":"","teacher":"","room":"","note":"","confidence":"high|medium|low"}],
  "academicEvents": [{"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","title":"","grades":[],"period":"","note":"","confidence":"high|medium|low"}],
  "curriculumItems": [{"subject":"","unit":"","activity":"","periods":"","confidence":"high|medium|low"}],
  "uncertainItems": [{"text":"","question":"","choices":[]}]
}
분석 대상 파일: ${fileNames.join(", ")}.`;
}

async function analyzeFiles(files) {
  if (!configured || !model) {
    throw new Error("Firebase가 아직 연결되지 않았습니다. firebaseConfig를 먼저 설정하세요.");
  }

  const parts = [promptFor([...files].map(f => f.name))];

  for (const file of files) {
    if (file.size > 18 * 1024 * 1024) {
      throw new Error(`${file.name}: 현재 초기 버전의 인라인 분석 한도(약 18MB)를 넘었습니다.`);
    }

    const mime = file.type;
    if (mime === "application/pdf" || mime.startsWith("image/") || mime === "text/plain") {
      parts.push(await fileToPart(file));
    } else if (file.name.toLowerCase().endsWith(".hwpx")) {
      parts.push({
        text: `HWPX 파일 ${file.name}은(는) 다음 단계에서 ZIP/XML 텍스트 추출 어댑터를 연결합니다. 현재는 원본 파일을 그대로 AI 멀티모달 입력으로 보낼 수 없습니다.`
      });
    } else if (file.name.toLowerCase().endsWith(".hwp")) {
      parts.push({
        text: `HWP 파일 ${file.name}은(는) 현재 웹 브라우저에서 직접 분석하지 않고 HWP 변환 어댑터를 거쳐 분석하도록 설계합니다. 원문을 임의로 추정하지 마세요.`
      });
    } else {
      parts.push({ text: `지원 어댑터가 아직 없는 파일: ${file.name}` });
    }
  }

  const result = await model.generateContent(parts);
  return result.response.text();
}

document.getElementById("analyzeButton").onclick = async () => {
  if (!fileInput.files.length) {
    status.textContent = "먼저 학교 자료를 선택해주세요.";
    return;
  }
  resultBox.classList.remove("show");
  status.textContent = "AI가 자료의 구조와 내용을 분석하고 있습니다...";
  try {
    const text = await analyzeFiles(fileInput.files);
    resultBox.textContent = text;
    resultBox.classList.add("show");
    status.textContent = "분석 완료. 다음 단계에서는 이 결과를 검토 화면으로 보여주고 [모두 반영]으로 저장합니다.";

    if (db) {
      await addDoc(collection(db, "importSources"), {
        files: [...fileInput.files].map(f => ({ name: f.name, size: f.size, type: f.type })),
        rawAnalysis: text,
        createdAt: serverTimestamp()
      });
    }
  } catch (e) {
    console.error(e);
    status.textContent = `분석하지 못했습니다: ${e.message}`;
  }
};

document.querySelectorAll(".supply-card input").forEach(input => {
  input.addEventListener("change", () => {
    const label = input.closest("label");
    label.style.textDecoration = input.checked ? "line-through" : "none";
    label.style.opacity = input.checked ? ".48" : "1";
  });
});
