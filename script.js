// ============================================================
// CẤU HÌNH CHUNG
// ============================================================

const STORAGE_KEY = "flashcardAppData"; // key dùng để lưu toàn bộ dữ liệu app vào localStorage
const MAX_CARDS_PER_DECK = 12000; // số thẻ tối đa cho phép trong 1 bộ thẻ
const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024; // ~5MB - mức giới hạn phổ biến của localStorage trên trình duyệt
const STORAGE_WARNING_RATIO = 0.8; // cảnh báo khi dùng hết 80% giới hạn ước tính ở trên

const SWIPE_THRESHOLD = 60; // px - vuốt xa hơn mức này mới tính là "chuyển thẻ"
const TAP_THRESHOLD = 8; // px - xê dịch dưới mức này vẫn coi là "bấm" (lật thẻ), không phải vuốt
const SWIPE_ANIMATION_MS = 250; // thời gian (ms) cho hiệu ứng thẻ trượt ra/vào - phải khớp giữa CSS và setTimeout

const LONG_PRESS_MS = 600; // giữ yên khoảng thời gian này mới tính là "nhấn giữ"
const LONG_PRESS_MOVE_THRESHOLD = 10; // px - di chuyển quá mức này trong lúc giữ thì hủy (đang vuốt, không phải giữ yên)

const CONTENT_SCALE_STEP = 0.05; // mỗi bước thu nhỏ chữ đi 5%
const MIN_CONTENT_SCALE = 0.55; // không thu nhỏ chữ xuống dưới 55% cỡ gốc, tránh chữ bé đến mức khó đọc
const COUNTER_RESERVED_HEIGHT = 24; // px - chừa chỗ cho chỉ số vị trí thẻ ở góc dưới, tránh bị nội dung dài đè lên

const NEW_DECK_OPTION_VALUE = "__new_deck__"; // giá trị đặc biệt của dòng "➕ Tạo bộ mới" trong dropdown
const TOOLTIP_AUTO_HIDE_MS = 3000; // tự ẩn tooltip sau chừng này nếu người dùng không chạm ra chỗ khác

const MAX_SEGMENT_WORD_LEN = 8; // độ dài cụm từ dài nhất thử tra khi tách câu ví dụ thành pinyin

// ============================================================
// DỮ LIỆU MẶC ĐỊNH (dùng khi mở app lần đầu, chưa có gì trong localStorage)
// ============================================================

function createDefaultState() {
  return {
    activeDeckId: "deck_default",
    // Id các bộ thẻ ĐANG CHỜ xóa trên Firestore (đã xóa xong ở máy này, lệnh
    // xóa trên đám mây có thể chưa thành công) - xem giải thích đầy đủ ở
    // applyRemoteFullState() và retryPendingDeckDeletions() bên dưới.
    pendingDeletedDeckIds: [],
    decks: [
      {
        id: "deck_default",
        name: "Bộ mẫu",
        cards: [
          {
            hanzi: "你好",
            pinyin: "nǐ hǎo",
            meaning: "Xin chào",
            example: {
              hanzi: "你好，很高兴认识你。",
              pinyin: "nǐ hǎo hěn gāo xìng rèn shi nǐ",
              meaning: "Xin chào, rất vui được quen bạn."
            }
          },
          {
            hanzi: "谢谢",
            pinyin: "xiè xiè",
            meaning: "Cảm ơn",
            example: {
              hanzi: "谢谢你的帮助。",
              pinyin: "xiè xiè nǐ de bāng zhù",
              meaning: "Cảm ơn sự giúp đỡ của bạn."
            }
          },
          {
            hanzi: "朋友",
            pinyin: "péng yǒu",
            meaning: "Bạn bè",
            example: {
              hanzi: "他是我的好朋友。",
              pinyin: "tā shì wǒ de hǎo péng yǒu",
              meaning: "Anh ấy là bạn tốt của tôi."
            }
          },
          {
            hanzi: "学习",
            pinyin: "xué xí",
            meaning: "Học tập",
            example: {
              hanzi: "我每天都学习中文。",
              pinyin: "wǒ měi tiān dōu xué xí zhōng wén",
              meaning: "Tôi học tiếng Trung mỗi ngày."
            }
          },
          {
            hanzi: "水",
            pinyin: "shuǐ",
            meaning: "Nước",
            example: {
              hanzi: "请给我一杯水。",
              pinyin: "qǐng gěi wǒ yī bēi shuǐ",
              meaning: "Làm ơn cho tôi một cốc nước."
            }
          }
        ]
      }
    ]
  };
}

// ============================================================
// LƯU / ĐỌC DỮ LIỆU TỪ localStorage
//
// Toàn bộ dữ liệu app (mọi bộ thẻ + bộ thẻ nào đang được chọn) được gói
// trong 1 object "appState" duy nhất, rồi lưu vào localStorage dưới 1 key
// (STORAGE_KEY) dạng chuỗi JSON. Cấu trúc:
// {
//   activeDeckId: "deck_xxx",       // id của bộ thẻ đang mở
//   decks: [
//     { id: "deck_xxx", name: "Tên bộ thẻ", cards: [ {hanzi, pinyin, meaning, example}, ... ] },
//     ...
//   ]
// }
// ============================================================

function loadAppState() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    const initial = createDefaultState();
    saveAppState(initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(saved);
    // Dữ liệu lưu từ TRƯỚC KHI có tính năng này sẽ chưa có field
    // "pendingDeletedDeckIds" - luôn đảm bảo có mảng hợp lệ để các chỗ dùng
    // sau (applyRemoteFullState, retryPendingDeckDeletions...) không phải tự
    // kiểm tra undefined ở mọi nơi.
    if (!Array.isArray(parsed.pendingDeletedDeckIds)) parsed.pendingDeletedDeckIds = [];
    return parsed;
  } catch (error) {
    // Dữ liệu trong localStorage bị hỏng/không đọc được -> tạo lại từ đầu
    const initial = createDefaultState();
    saveAppState(initial);
    return initial;
  }
}

function saveAppState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    alert("Không thể lưu dữ liệu: bộ nhớ trình duyệt đã đầy. Hãy xóa bớt bộ thẻ không cần thiết rồi thử lại.");
  }
  updateStorageWarning(state);

  // Nếu đã đăng nhập, đẩy luôn thay đổi này lên Firestore để đồng bộ sang
  // các thiết bị khác. Nếu chưa đăng nhập, hàm này tự bỏ qua (no-op) -
  // app vẫn hoạt động 100% bằng localStorage như trước, không bắt buộc đăng nhập.
  syncActiveDeckToCloud();
}

function getActiveDeck() {
  return appState.decks.find((deck) => deck.id === appState.activeDeckId);
}

function generateDeckId() {
  return "deck_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Ước tính dung lượng đang dùng và hiện cảnh báo nếu gần chạm giới hạn localStorage
function updateStorageWarning(state) {
  const sizeBytes = new Blob([JSON.stringify(state)]).size;
  const percent = (sizeBytes / STORAGE_LIMIT_BYTES) * 100;

  if (percent >= STORAGE_WARNING_RATIO * 100) {
    storageWarningEl.hidden = false;
    storageWarningEl.textContent =
      `⚠️ Dữ liệu đang chiếm khoảng ${percent.toFixed(0)}% giới hạn lưu trữ của trình duyệt (~5MB). ` +
      `Hãy cân nhắc xóa bớt bộ thẻ không cần thiết để tránh mất dữ liệu.`;
  } else {
    storageWarningEl.hidden = true;
  }
}

// ============================================================
// THAM CHIẾU CÁC PHẦN TỬ TRÊN TRANG
// (phải lấy trước khi gọi loadAppState(), vì loadAppState() có thể gọi
// updateStorageWarning() ngay bên trong, và hàm đó cần dùng storageWarningEl)
// ============================================================

const cardEl = document.getElementById("card");
const cardContentEl = document.getElementById("cardContent");
const counterEl = document.getElementById("counter");
const speakBtn = document.getElementById("speakBtn");
const excelFileInput = document.getElementById("excelFile");
const uploadTooltipWrap = document.getElementById("uploadTooltipWrap");
const deckSelectEl = document.getElementById("deckSelect");
const deckSelectWrap = document.getElementById("deckSelectWrap");
const deleteDeckBtn = document.getElementById("deleteDeckBtn");
const deckDeletePopover = document.getElementById("deckDeletePopover");
const storageWarningEl = document.getElementById("storageWarning");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authUserEl = document.getElementById("authUser");
const authAvatarEl = document.getElementById("authAvatar");
const authNameEl = document.getElementById("authName");
const syncStatusEl = document.getElementById("syncStatus");

const addCardBtn = document.getElementById("addCardBtn");
const editCardBtn = document.getElementById("editCardBtn");
const deleteCardBtn = document.getElementById("deleteCardBtn");
const cardDeletePopover = document.getElementById("cardDeletePopover");

const cardFormOverlay = document.getElementById("cardFormOverlay");
const cardForm = document.getElementById("cardForm");
const cardFormTitleEl = document.getElementById("cardFormTitle");
const cancelFormBtn = document.getElementById("cancelFormBtn");
const formHanziEl = document.getElementById("formHanzi");
const formPinyinEl = document.getElementById("formPinyin");
const formMeaningEl = document.getElementById("formMeaning");
const formExampleHanziEl = document.getElementById("formExampleHanzi");
const formExamplePinyinEl = document.getElementById("formExamplePinyin");
const formExampleMeaningEl = document.getElementById("formExampleMeaning");

// ============================================================
// TRẠNG THÁI ĐỒNG BỘ FIREBASE (khai báo SỚM, trước loadAppState() bên dưới)
//
// saveAppState() (định nghĩa ở trên) gọi syncActiveDeckToCloud() - hàm đó đọc
// các biến "firebaseReady/currentUser/..." này. loadAppState() có thể gọi
// saveAppState() NGAY TỪ NHỮNG DÒNG ĐẦU TIÊN của app (khi chưa có gì trong
// localStorage), tức là trước khi trình duyệt kịp chạy tới phần khai báo ở
// cuối file - nên các biến `let` này BẮT BUỘC phải khai báo ở đây (trước khi
// gọi loadAppState() phía dưới), nếu không sẽ bị lỗi "Cannot access before
// initialization" (JavaScript "temporal dead zone" của let/const).
// Toàn bộ logic gán giá trị/xử lý các biến này nằm ở phần
// "ĐĂNG NHẬP GOOGLE & ĐỒNG BỘ DỮ LIỆU QUA FIREBASE" cuối file.
// ============================================================

let firebaseAuth = null;
let firebaseDb = null;
let firestoreFns = null;
let currentUser = null;
let unsubscribeSnapshot = null;
let firebaseReady = false;

// Vài _syncId GẦN ĐÂY (không chỉ 1 cái gần nhất) do CHÍNH máy này ghi lên
// Firestore - xem giải thích đầy đủ ở writeMetaToCloud()/onSnapshot bên dưới.
let recentMetaWriteIds = [];

// Bộ nhớ đệm: JSON của mảng "cards" mỗi bộ thẻ ĐÃ đồng bộ lên Firestore
// THÀNH CÔNG lần gần nhất (deckId -> JSON string). Dùng để BỎ QUA việc ghi
// lại toàn bộ thẻ của 1 bộ khi nội dung bộ đó KHÔNG hề thay đổi (ví dụ chỉ
// đơn giản là chuyển sang xem bộ đó, hoặc sửa 1 bộ KHÁC) - tránh ghi lại
// hàng nghìn document một cách lãng phí (và tốn quota ghi của Firestore)
// mỗi khi người dùng chỉ đổi bộ thẻ đang xem.
const lastSyncedCardsJSON = {};

// Số thẻ THIẾT BỊ NÀY biết chắc đã đồng bộ khớp lần gần nhất cho mỗi bộ thẻ
// (deckId -> số thẻ). Dùng để quyết định writeDeckToCloud() có cần đọc lại
// toàn bộ document thẻ (getDocs, tốn kém) để dọn thẻ dư hay không - xem giải
// thích ở writeDeckToCloud() bên dưới.
const lastSyncedCardCount = {};

// ============================================================
// TRẠNG THÁI CHÍNH CỦA APP
// ============================================================

let appState = loadAppState();
let cards = getActiveDeck().cards; // luôn trỏ tới mảng thẻ của bộ thẻ đang chọn
let currentIndex = 0;
let isFlipped = false;

// Trạng thái theo dõi cử chỉ kéo/vuốt trên thẻ
let isDragging = false;
let dragStartX = 0;
let dragCurrentX = 0;

// Trạng thái theo dõi cử chỉ "nhấn giữ" trên thẻ (để hiện nút xóa thẻ)
let cardLongPressTimer = null;
let cardLongPressTriggered = false;

// Trạng thái theo dõi cử chỉ "nhấn giữ" trên dropdown bộ thẻ (để hiện nút xóa bộ)
let deckLongPressTimer = null;
let deckPressStartX = 0;
let deckPressStartY = 0;

// null = đang thêm thẻ mới, số = đang sửa thẻ ở vị trí đó trong mảng "cards"
let editingCardIndex = null;

// ============================================================
// TÔ MÀU PINYIN THEO THANH ĐIỆU
// ============================================================

// Các ký tự pinyin có dấu, xếp theo từng thanh điệu
// Thanh 1 = dấu ngang (ā), Thanh 2 = dấu sắc (á), Thanh 3 = dấu móc (ǎ), Thanh 4 = dấu huyền (à)
const TONE_CHARACTERS = {
  1: "āēīōūǖĀĒĪŌŪǕ",
  2: "áéíóúǘÁÉÍÓÚǗ",
  3: "ǎěǐǒǔǚǍĚǏǑǓǙ",
  4: "àèìòùǜÀÈÌÒÙǛ"
};

// Xác định thanh điệu của 1 âm tiết pinyin bằng cách xem trong âm tiết
// có chứa ký tự có dấu nào thuộc nhóm thanh 1/2/3/4 hay không.
// Nếu không tìm thấy dấu nào (ví dụ "de", "le") thì coi là thanh nhẹ.
function getTone(syllable) {
  for (const tone of [1, 2, 3, 4]) {
    for (const char of syllable) {
      if (TONE_CHARACTERS[tone].includes(char)) {
        return tone;
      }
    }
  }
  return 0; // thanh nhẹ (không dấu)
}

// Tách pinyin thành từng âm tiết (theo khoảng trắng) rồi bọc mỗi âm tiết
// trong 1 thẻ <span> có class tương ứng với thanh điệu để tô màu bằng CSS
function renderPinyinByTone(pinyin) {
  return pinyin
    .split(" ")
    .map((syllable) => {
      const tone = getTone(syllable);
      const toneClass = tone === 0 ? "tone-neutral" : `tone-${tone}`;
      return `<span class="${toneClass}">${syllable}</span>`;
    })
    .join(" ");
}

// ============================================================
// HIỂN THỊ THẺ
// ============================================================

// Hiển thị thẻ hiện tại (mặt trước hoặc mặt sau tùy isFlipped)
function renderCard() {
  // Chỉ cho phép Sửa khi bộ thẻ có ít nhất 1 thẻ đang được xem
  const hasCards = cards.length > 0;
  editCardBtn.disabled = !hasCards;

  if (!hasCards) {
    cardContentEl.innerHTML = `<p class="empty-state">Bộ thẻ này chưa có thẻ nào.<br>Bấm "➕ Thêm thẻ" hoặc tải file Excel để thêm từ vựng.</p>`;
    counterEl.textContent = "0 / 0";
    counterEl.classList.remove("show");
    return;
  }

  const card = cards[currentIndex];

  if (isFlipped) {
    // Chỉ hiện khối câu ví dụ nếu thẻ có dữ liệu ví dụ (file Excel có thể không điền đủ)
    const hasExample = card.example && card.example.hanzi;
    const exampleHTML = hasExample
      ? `
      <div class="example">
        <p class="example-hanzi">${card.example.hanzi}</p>
        <p class="example-pinyin">${renderPinyinByTone(card.example.pinyin)}</p>
        <p class="example-meaning">${card.example.meaning}</p>
      </div>`
      : "";

    cardContentEl.innerHTML = `
      <p class="meaning">${card.meaning}</p>
      ${exampleHTML}
    `;
  } else {
    cardContentEl.innerHTML = `
      <p class="hanzi">${card.hanzi}</p>
      <p class="pinyin pinyin-front">${card.pinyin}</p>
    `;
  }

  // Chỉ hiện chỉ số vị trí thẻ ở mặt sau (mặt đáp án), ẩn ở mặt trước
  counterEl.classList.toggle("show", isFlipped);
  counterEl.textContent = `${currentIndex + 1} / ${cards.length}`;
  fitCardText();
}

// Thẻ có kích thước CỐ ĐỊNH (xem CSS .card), nên khi nội dung dài (từ nhiều chữ,
// câu ví dụ dài...) có thể bị tràn ra ngoài. Hàm này tự giảm dần cỡ chữ
// (thông qua biến CSS --content-scale, nhân vào mọi font-size trong thẻ) cho tới
// khi nội dung vừa khít chiều cao thẻ, hoặc tới khi chạm mức thu nhỏ tối thiểu.
function fitCardText() {
  let scale = 1;
  cardEl.style.setProperty("--content-scale", scale);

  // Chừa thêm khoảng trống bằng chiều cao chỉ số vị trí thẻ (góc dưới bên phải),
  // để nội dung dài không bị chữ đó đè lên
  const availableHeight = cardEl.clientHeight - COUNTER_RESERVED_HEIGHT;

  // Đọc cardEl.clientHeight/cardContentEl.scrollHeight sẽ ép trình duyệt tính lại
  // layout ngay lập tức, nên phép so sánh dưới đây luôn phản ánh đúng trạng thái mới nhất
  while (cardContentEl.scrollHeight > availableHeight && scale > MIN_CONTENT_SCALE) {
    scale = Math.max(MIN_CONTENT_SCALE, scale - CONTENT_SCALE_STEP);
    cardEl.style.setProperty("--content-scale", scale);
  }
}

// ------------------------------------------------------------
// CHỌN GIỌNG ĐỌC TIẾNG TRUNG
//
// TRƯỚC ĐÂY: chỉ set utterance.lang = "zh-CN", KHÔNG chỉ định utterance.voice
// cụ thể -> trình duyệt/hệ điều hành tự chọn "giọng mặc định cho zh-CN", và
// giọng mặc định này KHÁC NHAU giữa các thiết bị (Windows/macOS/Android/iOS
// đều có bộ giọng TTS riêng), thậm chí có thể đổi sau khi trình duyệt/hệ điều
// hành cập nhật - đây là lý do "giọng đọc tự đổi khác so với trước", KHÔNG
// phải do gọi API bên thứ 3 (Web Speech API chạy hoàn toàn phía trình duyệt).
//
// BÂY GIỜ: dò theo 1 DANH SÁCH ƯU TIÊN các giọng tiếng Trung phổ biến, xếp
// theo từng nền tảng - thử lần lượt cho tới khi tìm được giọng máy THỰC SỰ
// CÓ. Không giọng nào trong danh sách khớp thì mới rơi về bất kỳ giọng zh-CN
// nào máy có, rồi mới tới bất kỳ giọng tiếng Trung nào (zh-TW, zh-HK...), và
// CHỈ khi không còn lựa chọn nào mới để trình duyệt tự chọn mặc định như cũ.
// Luôn log rõ giọng thực tế đã chọn ra console - để việc "rơi về mặc định"
// (nếu có) LUÔN nhìn thấy được, không im lặng trôi qua.
// ------------------------------------------------------------

const PREFERRED_ZH_VOICE_NAMES = [
  // Windows (Edge/Chrome) - giọng "Online (Natural)" đời mới, cần mạng nhưng chất lượng tốt nhất
  "Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)",
  "Microsoft Yunxi Online (Natural) - Chinese (Mainland)",
  // Windows - giọng desktop cài sẵn offline, không cần mạng
  "Microsoft Huihui Desktop - Chinese (Simplified)",
  "Microsoft Kangkang Desktop - Chinese (Simplified)",
  "Microsoft Yaoyao",
  // macOS / iOS (Safari) - giọng tiếng Trung phổ thông chuẩn của Apple
  "Tingting",
  "Ting-Ting",
  // Android / ChromeOS / Chrome nói chung (đăng nhập Google TTS) - giọng phổ thông Trung Quốc đại lục
  "Google 普通话（中国大陆）",
  "Google Chinese (China)"
];

let cachedVoices = [];
function refreshVoiceList() {
  if ("speechSynthesis" in window) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
}

if ("speechSynthesis" in window) {
  refreshVoiceList();
  // QUAN TRỌNG: nhiều trình duyệt (đặc biệt Chrome) nạp danh sách giọng đọc
  // BẤT ĐỒNG BỘ - lần gọi getVoices() đầu tiên ngay lúc tải trang thường trả
  // về mảng RỖNG dù máy có sẵn giọng tiếng Trung. Phải lắng nghe sự kiện
  // "voiceschanged" để cập nhật lại khi danh sách thật sự đã sẵn sàng - nếu
  // bỏ qua bước này, app sẽ luôn "âm thầm" rơi về giọng mặc định dù giọng
  // mong muốn thực ra có tồn tại trên máy, chỉ là chưa kịp nạp xong.
  window.speechSynthesis.onvoiceschanged = refreshVoiceList;
}

let loggedVoiceChoiceOnce = false;

// Trả về 1 SpeechSynthesisVoice phù hợp nhất máy hiện có, hoặc null nếu nên
// để trình duyệt tự chọn mặc định (xem PREFERRED_ZH_VOICE_NAMES ở trên)
function pickChineseVoice() {
  if (cachedVoices.length === 0) refreshVoiceList(); // thử lại phòng khi "voiceschanged" chưa kịp bắn

  for (const preferredName of PREFERRED_ZH_VOICE_NAMES) {
    const match = cachedVoices.find((v) => v.name.toLowerCase().includes(preferredName.toLowerCase()));
    if (match) return match;
  }

  const exactZhCN = cachedVoices.find((v) => v.lang === "zh-CN");
  if (exactZhCN) return exactZhCN;

  const anyChinese = cachedVoices.find((v) => v.lang && v.lang.toLowerCase().startsWith("zh"));
  if (anyChinese) return anyChinese;

  return null;
}

// Đọc to từ tiếng Trung bằng giọng đọc có sẵn của trình duyệt
function speakCurrentWord() {
  if (cards.length === 0) return;
  if (!("speechSynthesis" in window)) return; // trình duyệt không hỗ trợ thì bỏ qua

  const text = cards[currentIndex].hanzi;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";

  const voice = pickChineseVoice();
  if (voice) {
    utterance.voice = voice;
  }

  // Chỉ log 1 lần (không phải mỗi lần đọc từ) để không rác console, nhưng đủ
  // để kiểm tra được giọng thực tế đang dùng trên từng thiết bị (mở DevTools
  // Console, bấm "Đọc lại" 1 lần, xem dòng log này)
  if (!loggedVoiceChoiceOnce) {
    loggedVoiceChoiceOnce = true;
    console.log(
      voice
        ? `[TTS] Đang dùng giọng: "${voice.name}" (${voice.lang})`
        : `[TTS] Không tìm thấy giọng tiếng Trung nào phù hợp trên thiết bị này trong ${cachedVoices.length} giọng có sẵn - dùng giọng mặc định của trình duyệt cho "zh-CN".`
    );
  }

  window.speechSynthesis.cancel(); // dừng giọng đọc đang phát (nếu có) trước khi đọc câu mới
  window.speechSynthesis.speak(utterance);
}

// ============================================================
// DANH SÁCH BỘ THẺ (deck) - hiển thị dropdown + chuyển đổi
// ============================================================

function renderDeckSelect() {
  deckSelectEl.innerHTML = "";

  // Dòng đầu tiên luôn là lựa chọn đặc biệt "Tạo bộ mới", không phải 1 bộ thẻ thật
  const newOption = document.createElement("option");
  newOption.value = NEW_DECK_OPTION_VALUE;
  newOption.textContent = "➕ Tạo bộ mới";
  deckSelectEl.appendChild(newOption);

  appState.decks.forEach((deck) => {
    const option = document.createElement("option");
    option.value = deck.id;
    option.textContent = `${deck.name} (${deck.cards.length} thẻ)`;
    if (deck.id === appState.activeDeckId) {
      option.selected = true;
    }
    deckSelectEl.appendChild(option);
  });
}

// Tạo bộ thẻ mới (rỗng), rồi chuyển sang bộ đó luôn
function createNewDeck() {
  const name = prompt("Nhập tên bộ thẻ mới:");
  if (!name || !name.trim()) return; // người dùng bấm Cancel hoặc để trống tên

  const newDeck = { id: generateDeckId(), name: name.trim(), cards: [] };
  appState.decks.push(newDeck);
  appState.activeDeckId = newDeck.id;
  cards = newDeck.cards;
  currentIndex = 0;
  isFlipped = false;

  saveAppState(appState);
  renderCard();
}

// Chuyển sang bộ thẻ khác khi chọn trong dropdown (hoặc mở form tạo bộ mới
// nếu chọn đúng dòng "➕ Tạo bộ mới" - dòng đó không phải 1 bộ thẻ thật)
deckSelectEl.addEventListener("change", (event) => {
  if (event.target.value === NEW_DECK_OPTION_VALUE) {
    createNewDeck();
    renderDeckSelect(); // vẽ lại để dropdown tự chọn về đúng bộ đang active (dù tạo mới hay bấm Cancel)
    return;
  }

  closeCardDeletePopover();
  closeDeckDeletePopover();

  appState.activeDeckId = event.target.value;
  cards = getActiveDeck().cards;
  currentIndex = 0;
  isFlipped = false;

  saveAppState(appState);
  renderCard();
  speakCurrentWord();
});

// Xóa bộ thẻ đang chọn (có xác nhận trước khi xóa) - nút này nằm trong popover,
// chỉ hiện ra khi nhấn giữ vào dropdown (xem phần "NHẤN GIỮ ĐỂ XÓA" bên dưới)
deleteDeckBtn.addEventListener("click", () => {
  closeDeckDeletePopover();

  if (appState.decks.length <= 1) {
    alert("Không thể xóa vì đây là bộ thẻ duy nhất còn lại.");
    return;
  }

  const activeDeck = getActiveDeck();
  const confirmed = confirm(
    `Bạn có chắc muốn xóa bộ thẻ "${activeDeck.name}" (${activeDeck.cards.length} thẻ)?\nThao tác này không thể hoàn tác.`
  );
  if (!confirmed) return;

  // Đánh dấu NGAY (trước khi gọi deleteDeckFromCloud) là bộ này đang chờ xóa
  // trên đám mây - để nếu lệnh xóa bên dưới thất bại (mất mạng, hết quota...)
  // và app tải dữ liệu cũ về sau đó, applyRemoteFullState() biết mà KHÔNG cho
  // bộ này "sống lại" trên chính máy vừa xóa. Xem retryPendingDeckDeletions().
  if (!appState.pendingDeletedDeckIds.includes(activeDeck.id)) {
    appState.pendingDeletedDeckIds.push(activeDeck.id);
  }
  deleteDeckFromCloud(activeDeck.id, activeDeck.name); // xóa hẳn bộ này + toàn bộ thẻ của nó trên Firestore

  appState.decks = appState.decks.filter((deck) => deck.id !== activeDeck.id);
  appState.activeDeckId = appState.decks[0].id;
  cards = getActiveDeck().cards;
  currentIndex = 0;
  isFlipped = false;

  saveAppState(appState);
  renderDeckSelect();
  renderCard();
  speakCurrentWord();
});

// ------------------------------------------------------------
// Nhấn giữ vào dropdown bộ thẻ để hiện nút "🗑 Xóa bộ này"
// ------------------------------------------------------------

function openDeckDeletePopover() {
  deckDeletePopover.hidden = false;
  deckDeletePopover.classList.add("open");
}

function closeDeckDeletePopover() {
  deckDeletePopover.hidden = true;
  deckDeletePopover.classList.remove("open");
}

deckSelectWrap.addEventListener("pointerdown", (event) => {
  deckPressStartX = event.clientX;
  deckPressStartY = event.clientY;

  deckLongPressTimer = setTimeout(() => {
    deckLongPressTimer = null;
    deckSelectEl.blur(); // đóng dropdown gốc nếu lỡ đang mở, tránh chồng lấn giao diện
    openDeckDeletePopover();
  }, LONG_PRESS_MS);
});

deckSelectWrap.addEventListener("pointermove", (event) => {
  if (!deckLongPressTimer) return;
  const dx = Math.abs(event.clientX - deckPressStartX);
  const dy = Math.abs(event.clientY - deckPressStartY);
  if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
    clearTimeout(deckLongPressTimer);
    deckLongPressTimer = null;
  }
});

deckSelectWrap.addEventListener("pointerup", () => {
  if (deckLongPressTimer) {
    clearTimeout(deckLongPressTimer);
    deckLongPressTimer = null;
  }
});

deckSelectWrap.addEventListener("pointercancel", () => {
  if (deckLongPressTimer) {
    clearTimeout(deckLongPressTimer);
    deckLongPressTimer = null;
  }
});

// Bấm ra ngoài popover xóa bộ (và ngoài luôn cả dropdown) để đóng lại, không xóa gì cả
document.addEventListener("click", (event) => {
  if (
    deckDeletePopover.classList.contains("open") &&
    !deckDeletePopover.contains(event.target) &&
    !deckSelectWrap.contains(event.target)
  ) {
    closeDeckDeletePopover();
  }
});

// ============================================================
// TƯƠNG TÁC VỚI THẺ (lật thẻ, chuyển thẻ)
// ============================================================

// Chuyển sang thẻ tiếp theo - dùng cho thao tác vuốt sang trái
function goToNextCard() {
  if (cards.length === 0) return;
  closeCardDeletePopover();
  currentIndex = (currentIndex + 1) % cards.length;
  isFlipped = false;
  renderCard();
  speakCurrentWord();
}

// Quay lại thẻ trước đó - dùng cho thao tác vuốt sang phải
function goToPrevCard() {
  if (cards.length === 0) return;
  closeCardDeletePopover();
  currentIndex = (currentIndex - 1 + cards.length) % cards.length;
  isFlipped = false;
  renderCard();
  speakCurrentWord();
}

// Đọc lại từ hiện tại theo yêu cầu
speakBtn.addEventListener("click", speakCurrentWord);

// ------------------------------------------------------------
// Bấm / Vuốt / Nhấn giữ trên thẻ (hỗ trợ cả cảm ứng và chuột)
//
// Cách phân biệt 3 thao tác - cả 3 đều bắt đầu bằng pointerdown, chỉ khác
// nhau ở QUÃNG ĐƯỜNG di chuyển và THỜI GIAN giữ trước khi thả tay/chuột ra:
//   - Thả ra sớm (trước LONG_PRESS_MS) và gần như không di chuyển
//     (< TAP_THRESHOLD)                    -> "bấm"      -> lật thẻ
//   - Thả ra sớm nhưng di chuyển đủ xa
//     (>= SWIPE_THRESHOLD)                 -> "vuốt"     -> chuyển thẻ
//   - Giữ yên (di chuyển < LONG_PRESS_MOVE_THRESHOLD) đủ LONG_PRESS_MS
//     mà CHƯA thả ra                       -> "nhấn giữ" -> hiện nút xóa thẻ
// Hễ người dùng bắt đầu di chuyển đáng kể (đang vuốt), bộ đếm "nhấn giữ"
// bị hủy ngay để không bị nhầm vuốt thành nhấn giữ.
// ------------------------------------------------------------

// Xóa transform/transition đã gán bằng JS, trả quyền điều khiển giao diện
// lại cho CSS (để hiệu ứng hover phóng to thẻ ở trạng thái nghỉ vẫn hoạt động)
function clearCardTransform() {
  cardEl.style.transition = "";
  cardEl.style.transform = "";
}

// Cho thẻ hiện tại trượt hẳn ra khỏi màn hình, đổi sang thẻ kế/trước,
// rồi cho thẻ mới trượt vào từ phía đối diện
function animateSwipeChange(goingNext) {
  const flyDistance = goingNext ? -520 : 520;
  cardEl.style.transform = `translateX(${flyDistance}px) rotate(${flyDistance / 24}deg)`;

  setTimeout(() => {
    if (goingNext) {
      goToNextCard();
    } else {
      goToPrevCard();
    }

    // Đặt thẻ (đã có nội dung mới) sang phía đối diện mà không có hiệu ứng, để chuẩn bị trượt vào
    cardEl.style.transition = "none";
    cardEl.style.transform = `translateX(${-flyDistance}px)`;

    // Ép trình duyệt áp dụng vị trí trên ngay lập tức trước khi bật lại transition bên dưới,
    // nếu không trình duyệt có thể gộp 2 thay đổi lại và bỏ qua hiệu ứng trượt vào
    void cardEl.offsetWidth;

    cardEl.style.transition = `transform ${SWIPE_ANIMATION_MS}ms ease`;
    cardEl.style.transform = "translateX(0)";

    setTimeout(clearCardTransform, SWIPE_ANIMATION_MS);
  }, SWIPE_ANIMATION_MS);
}

cardEl.addEventListener("pointerdown", (event) => {
  if (cards.length === 0) return;
  closeCardDeletePopover(); // đang bấm mới thì đóng popover xóa của lần giữ trước (nếu còn sót)

  isDragging = true;
  dragStartX = event.clientX;
  dragCurrentX = 0;
  cardLongPressTriggered = false;

  cardEl.setPointerCapture(event.pointerId); // giữ nhận sự kiện dù con trỏ đi ra ngoài phạm vi thẻ
  cardEl.style.transition = "none"; // tắt hiệu ứng mượt trong lúc đang kéo để thẻ bám sát ngón tay/chuột

  // Bắt đầu đếm giờ "nhấn giữ" - nếu giữ đủ lâu mà chưa thả ra thì hiện nút xóa
  cardLongPressTimer = setTimeout(() => {
    cardLongPressTimer = null;
    cardLongPressTriggered = true;
    openCardDeletePopover();
  }, LONG_PRESS_MS);
});

cardEl.addEventListener("pointermove", (event) => {
  if (!isDragging) return;
  dragCurrentX = event.clientX - dragStartX;

  // Di chuyển đủ nhiều nghĩa là người dùng đang vuốt, không phải giữ yên -> hủy đếm giờ nhấn giữ
  if (cardLongPressTimer && Math.abs(dragCurrentX) > LONG_PRESS_MOVE_THRESHOLD) {
    clearTimeout(cardLongPressTimer);
    cardLongPressTimer = null;
  }

  cardEl.style.transform = `translateX(${dragCurrentX}px) rotate(${dragCurrentX / 24}deg)`;
});

cardEl.addEventListener("pointerup", (event) => {
  if (!isDragging) return;
  isDragging = false;
  cardEl.releasePointerCapture(event.pointerId);

  if (cardLongPressTimer) {
    clearTimeout(cardLongPressTimer);
    cardLongPressTimer = null;
  }

  const distance = Math.abs(dragCurrentX);
  const draggedX = dragCurrentX;
  dragCurrentX = 0;

  cardEl.style.transition = `transform ${SWIPE_ANIMATION_MS}ms ease`;

  if (cardLongPressTriggered) {
    // Đã hiện popup xóa rồi (do giữ đủ lâu) -> chỉ đưa thẻ về đúng vị trí,
    // không lật cũng không chuyển thẻ
    cardEl.style.transform = "translateX(0)";
    setTimeout(clearCardTransform, SWIPE_ANIMATION_MS);
  } else if (distance < TAP_THRESHOLD) {
    // Gần như không di chuyển -> tính là 1 cú bấm -> lật thẻ
    cardEl.style.transform = "translateX(0)";
    setTimeout(clearCardTransform, SWIPE_ANIMATION_MS);
    isFlipped = !isFlipped;
    renderCard();
  } else if (distance >= SWIPE_THRESHOLD) {
    // Vuốt đủ xa -> chuyển thẻ theo đúng hướng vừa vuốt
    animateSwipeChange(draggedX < 0);
  } else {
    // Vuốt chưa đủ xa -> thẻ tự trượt về vị trí cũ, không đổi thẻ
    cardEl.style.transform = "translateX(0)";
    setTimeout(clearCardTransform, SWIPE_ANIMATION_MS);
  }
});

// Cử chỉ bị hủy giữa chừng (ví dụ có thông báo hệ thống hiện lên) -> đưa thẻ về vị trí cũ an toàn
cardEl.addEventListener("pointercancel", () => {
  isDragging = false;
  dragCurrentX = 0;
  if (cardLongPressTimer) {
    clearTimeout(cardLongPressTimer);
    cardLongPressTimer = null;
  }
  cardEl.style.transition = `transform ${SWIPE_ANIMATION_MS}ms ease`;
  cardEl.style.transform = "translateX(0)";
  setTimeout(clearCardTransform, SWIPE_ANIMATION_MS);
});

// ------------------------------------------------------------
// Popover "🗑 Xóa thẻ này" - hiện ra khi nhấn giữ đủ lâu vào thẻ
// ------------------------------------------------------------

function openCardDeletePopover() {
  cardDeletePopover.hidden = false;
  cardDeletePopover.classList.add("open");
}

function closeCardDeletePopover() {
  cardDeletePopover.hidden = true;
  cardDeletePopover.classList.remove("open");
}

// Sự kiện trên popover phải dừng lại ở đây (stopPropagation), không cho "nổi bọt"
// lên tới #card - nếu không, bấm vào popover sẽ vô tình kích hoạt lại logic
// bấm/vuốt/giữ của thẻ bên dưới
cardDeletePopover.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

// Bấm vào vùng nền tối (ngoài nút xóa) để đóng popover, không xóa gì cả
cardDeletePopover.addEventListener("click", (event) => {
  if (event.target === cardDeletePopover) {
    closeCardDeletePopover();
  }
});

// ============================================================
// NHẬP DỮ LIỆU TỪ FILE EXCEL (vào bộ thẻ đang được chọn)
// ============================================================

// Đọc file Excel người dùng tải lên và thay thế toàn bộ thẻ của BỘ THẺ ĐANG CHỌN
// Thứ tự cột bắt buộc: Chữ Hán | Pinyin | Nghĩa | Câu ví dụ | Pinyin câu ví dụ | Nghĩa câu ví dụ
// Dòng đầu tiên của file được coi là dòng tiêu đề nên sẽ bị bỏ qua.
excelFileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });

      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];

      // header: 1 -> đọc mỗi dòng thành 1 mảng theo đúng thứ tự cột, không dựa vào tên tiêu đề
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const dataRows = rows.slice(1); // bỏ dòng tiêu đề (dòng đầu tiên)

      let newCards = dataRows
        .filter((row) => row.length > 0 && row[0]) // bỏ các dòng trống
        .map((row) => ({
          hanzi: String(row[0] ?? "").trim(),
          pinyin: String(row[1] ?? "").trim(),
          meaning: String(row[2] ?? "").trim(),
          example: {
            hanzi: String(row[3] ?? "").trim(),
            pinyin: String(row[4] ?? "").trim(),
            meaning: String(row[5] ?? "").trim()
          }
        }));

      if (newCards.length === 0) {
        alert("Không tìm thấy dữ liệu hợp lệ trong file Excel. Vui lòng kiểm tra lại định dạng file.");
        return;
      }

      if (newCards.length > MAX_CARDS_PER_DECK) {
        alert(
          `File có ${newCards.length} thẻ, vượt quá giới hạn ${MAX_CARDS_PER_DECK} thẻ/bộ thẻ. ` +
          `Chỉ ${MAX_CARDS_PER_DECK} thẻ đầu tiên được nhập.`
        );
        newCards = newCards.slice(0, MAX_CARDS_PER_DECK);
      }

      const activeDeck = getActiveDeck();

      // Nếu bộ thẻ đang chọn đã có sẵn thẻ, hỏi xác nhận trước khi ghi đè để tránh mất dữ liệu do bấm nhầm
      if (activeDeck.cards.length > 0) {
        const confirmed = confirm(
          `Bộ thẻ "${activeDeck.name}" hiện có ${activeDeck.cards.length} thẻ.\n` +
          `Tải file này sẽ XÓA và THAY THẾ toàn bộ số thẻ đó bằng ${newCards.length} thẻ mới từ file Excel.\n` +
          `Bạn có chắc chắn muốn tiếp tục?`
        );
        if (!confirmed) return;
      }

      activeDeck.cards = newCards;
      cards = activeDeck.cards;
      currentIndex = 0;
      isFlipped = false;

      saveAppState(appState);
      renderDeckSelect();
      renderCard();
      speakCurrentWord();
    } catch (error) {
      alert("Không đọc được file này. Vui lòng chọn đúng file Excel (.xlsx hoặc .xls).");
    }
  };

  reader.readAsArrayBuffer(file);
  event.target.value = ""; // cho phép chọn lại đúng file này lần nữa nếu cần
});

// ------------------------------------------------------------
// Tooltip cho nút "Tải file Excel"
//
// Trên máy tính: tooltip hiện/ẩn hoàn toàn bằng CSS (:hover), không cần JS.
//
// Trên thiết bị cảm ứng không có "di chuột", nên tooltip được thiết kế hiện
// ra khi CHẠM GIỮ (long press) vào nút, dùng chung ngưỡng thời gian
// LONG_PRESS_MS như các cử chỉ nhấn giữ khác trong app (thẻ, dropdown bộ thẻ)
// để nhất quán. Chạm nhanh (thả tay trước LONG_PRESS_MS) thì không hiện
// tooltip và hộp thoại chọn file vẫn mở bình thường như một cú chạm thường.
// Nếu đã hiện tooltip do giữ lâu, việc thả tay ra sẽ KHÔNG mở hộp thoại chọn
// file nữa (chặn bằng preventDefault) - vì lúc đó người dùng chỉ đang muốn
// đọc chú thích, không phải đang cố bấm nút.
// ------------------------------------------------------------

let uploadTooltipTimer = null;
let uploadTooltipTriggered = false;

uploadTooltipWrap.addEventListener(
  "touchstart",
  () => {
    uploadTooltipTriggered = false;
    uploadTooltipTimer = setTimeout(() => {
      uploadTooltipTimer = null;
      uploadTooltipTriggered = true;
      uploadTooltipWrap.classList.add("show-tooltip");
      setTimeout(() => uploadTooltipWrap.classList.remove("show-tooltip"), TOOLTIP_AUTO_HIDE_MS);
    }, LONG_PRESS_MS);
  },
  { passive: true }
);

uploadTooltipWrap.addEventListener("touchend", (event) => {
  if (uploadTooltipTimer) {
    clearTimeout(uploadTooltipTimer);
    uploadTooltipTimer = null;
  }
  if (uploadTooltipTriggered) {
    event.preventDefault(); // đã hiện tooltip do giữ lâu -> không mở hộp thoại chọn file khi thả tay
  }
});

// Chạm ra chỗ khác trên trang để tắt tooltip sớm hơn thời gian tự ẩn
document.addEventListener(
  "touchstart",
  (event) => {
    if (uploadTooltipWrap.classList.contains("show-tooltip") && !uploadTooltipWrap.contains(event.target)) {
      uploadTooltipWrap.classList.remove("show-tooltip");
    }
  },
  { passive: true }
);

// ============================================================
// THÊM / SỬA / XÓA TỪNG THẺ BẰNG TAY (áp dụng cho bộ thẻ đang chọn)
// ============================================================

// ------------------------------------------------------------
// Tự động điền pinyin từ dữ liệu CC-CEDICT (biến toàn cục CEDICT_PINYIN,
// nạp sẵn từ file cedict-pinyin.js - xem index.html). Dùng CHUNG 1 hàm tách
// từ cho cả ô "Chữ Hán" (1 từ) và ô "Câu ví dụ - Chữ Hán" (nhiều từ liên
// tiếp), để cả 2 nơi đều ưu tiên nhận diện từ ghép giống nhau.
//
// Cách xử lý: dùng thuật toán "khớp tối đa hướng trước" (forward maximum
// matching) - một cách tách từ tiếng Trung đơn giản, không cần thư viện NLP:
// tại mỗi vị trí trong chuỗi, thử tra cụm DÀI NHẤT có thể trước (tối đa
// MAX_SEGMENT_WORD_LEN chữ), giảm dần xuống 1 chữ cho tới khi tìm thấy trong
// từ điển. Nhờ luôn ưu tiên cụm dài nhất, từ ghép nhiều chữ như "认识" hay
// "高兴" sẽ được tra đúng pinyin của CẢ TỪ ("rènshi", "gāoxìng") ngay từ bước
// thử "2 chữ", trước khi thuật toán kịp tách nhỏ xuống "1 chữ" (chỉ tra
// riêng lẻ khi không tìm được cụm ghép nào chứa nó) - nên không còn bị tách
// rời sai thanh điệu như tra từng chữ đơn lẻ nữa.
// ------------------------------------------------------------

function lookupHanziPinyin(text) {
  if (!text || typeof CEDICT_PINYIN === "undefined") return "";

  const chars = Array.from(text);
  const tokens = [];
  let i = 0;

  while (i < chars.length) {
    let matched = false;
    const maxLen = Math.min(MAX_SEGMENT_WORD_LEN, chars.length - i);

    // Thử cụm dài nhất trước, ngắn dần - khớp được cụm dài hơn thì dừng ngay
    for (let len = maxLen; len >= 1; len--) {
      const chunk = chars.slice(i, i + len).join("");
      if (CEDICT_PINYIN[chunk]) {
        // CC-CEDICT luôn ghi mỗi âm tiết cách nhau bằng dấu cách, kể cả khi
        // cả cụm là 1 từ ghép (vd "我们" lưu là "wǒ men") - phải xóa dấu cách
        // bên trong ở đây thì các âm tiết của CÙNG 1 từ mới dính liền nhau
        // ("wǒmen"), còn dấu cách GIỮA các từ khác nhau vẫn do tokens.join(" ")
        // ở cuối hàm đảm nhiệm như bình thường.
        tokens.push(CEDICT_PINYIN[chunk].replace(/ /g, ""));
        i += len;
        matched = true;
        break;
      }
    }

    if (!matched) {
      const ch = chars[i];
      const isHanzi = /[一-鿿]/.test(ch);

      if (!isHanzi && tokens.length > 0) {
        // Dấu câu (， 。 ...) hoặc ký tự khác không phải chữ Hán -> gắn liền
        // vào cuối từ pinyin ngay trước đó, giữ đúng vị trí, không tách rời bằng khoảng trắng
        tokens[tokens.length - 1] += ch;
      } else {
        // Chữ Hán hiếm không tra được (kể cả khi ghép với chữ xung quanh) ->
        // giữ nguyên chữ đó làm 1 "từ" riêng, để thấy rõ vị trí cần tự bổ
        // sung pinyin, không bị lẫn vào chữ khác
        tokens.push(ch);
      }
      i += 1;
    }
  }

  return tokens.join(" ");
}

// Rời khỏi ô "Chữ Hán" (blur) -> tự động điền pinyin, nhưng CHỈ khi ô pinyin
// đang trống - để không ghi đè pinyin người dùng đã tự gõ hoặc đã chỉnh sửa
formHanziEl.addEventListener("blur", () => {
  if (formPinyinEl.value.trim()) return;
  const pinyin = lookupHanziPinyin(formHanziEl.value.trim());
  if (pinyin) {
    formPinyinEl.value = pinyin;
  }
});

// Rời khỏi ô "Câu ví dụ - Chữ Hán" (blur) -> tự động điền, chỉ khi ô pinyin
// câu ví dụ đang trống (không ghi đè pinyin đã tự gõ/chỉnh sửa)
formExampleHanziEl.addEventListener("blur", () => {
  if (formExamplePinyinEl.value.trim()) return;
  const pinyin = lookupHanziPinyin(formExampleHanziEl.value.trim());
  if (pinyin) {
    formExamplePinyinEl.value = pinyin;
  }
});

// Mở form ở chế độ "Thêm thẻ mới" - các ô nhập để trống
function openAddCardForm() {
  closeCardDeletePopover();
  closeDeckDeletePopover();

  editingCardIndex = null;
  cardFormTitleEl.textContent = "Thêm thẻ mới";
  cardForm.reset();
  cardFormOverlay.classList.add("open");
  formHanziEl.focus();
}

// Mở form ở chế độ "Sửa thẻ" - điền sẵn thông tin của thẻ đang xem
function openEditCardForm() {
  if (cards.length === 0) return;
  closeCardDeletePopover();
  closeDeckDeletePopover();

  editingCardIndex = currentIndex;
  const card = cards[currentIndex];

  cardFormTitleEl.textContent = "Sửa thẻ";
  formHanziEl.value = card.hanzi;
  formPinyinEl.value = card.pinyin;
  formMeaningEl.value = card.meaning;
  formExampleHanziEl.value = card.example ? card.example.hanzi : "";
  formExamplePinyinEl.value = card.example ? card.example.pinyin : "";
  formExampleMeaningEl.value = card.example ? card.example.meaning : "";

  cardFormOverlay.classList.add("open");
  formHanziEl.focus();
}

function closeCardForm() {
  cardFormOverlay.classList.remove("open");
  cardForm.reset();
  editingCardIndex = null;
}

addCardBtn.addEventListener("click", openAddCardForm);
editCardBtn.addEventListener("click", openEditCardForm);
cancelFormBtn.addEventListener("click", closeCardForm);

// Bấm ra vùng nền tối bên ngoài form để đóng (không tính bấm bên trong form)
cardFormOverlay.addEventListener("click", (event) => {
  if (event.target === cardFormOverlay) {
    closeCardForm();
  }
});

// Bấm phím Esc để đóng form/popover đang mở cho nhanh
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (cardFormOverlay.classList.contains("open")) closeCardForm();
  if (cardDeletePopover.classList.contains("open")) closeCardDeletePopover();
  if (deckDeletePopover.classList.contains("open")) closeDeckDeletePopover();
});

// Lưu thẻ khi bấm nút "Lưu" trong form (thêm mới hoặc cập nhật thẻ đang sửa)
cardForm.addEventListener("submit", (event) => {
  event.preventDefault(); // chặn hành vi tải lại trang mặc định của form

  const hanzi = formHanziEl.value.trim();
  const pinyin = formPinyinEl.value.trim();
  const meaning = formMeaningEl.value.trim();

  if (!hanzi || !pinyin || !meaning) {
    alert("Vui lòng điền đủ Chữ Hán, Pinyin và Nghĩa tiếng Việt.");
    return;
  }

  const newCard = {
    hanzi,
    pinyin,
    meaning,
    example: {
      hanzi: formExampleHanziEl.value.trim(),
      pinyin: formExamplePinyinEl.value.trim(),
      meaning: formExampleMeaningEl.value.trim()
    }
  };

  if (editingCardIndex === null) {
    // Đang thêm thẻ mới
    if (cards.length >= MAX_CARDS_PER_DECK) {
      alert(`Bộ thẻ đã đạt giới hạn ${MAX_CARDS_PER_DECK} thẻ, không thể thêm nữa.`);
      return;
    }
    cards.push(newCard);
    currentIndex = cards.length - 1; // hiện luôn thẻ vừa thêm
  } else {
    // Đang sửa thẻ có sẵn
    cards[editingCardIndex] = newCard;
    currentIndex = editingCardIndex;
  }

  isFlipped = false;

  saveAppState(appState);
  renderDeckSelect();
  renderCard();
  speakCurrentWord();
  closeCardForm();
});

// Xóa thẻ đang xem khỏi bộ thẻ (có xác nhận trước khi xóa) - nút này nằm
// trong popover, chỉ hiện ra khi nhấn giữ vào thẻ khoảng 0.6 giây
deleteCardBtn.addEventListener("click", () => {
  closeCardDeletePopover();
  if (cards.length === 0) return;

  const card = cards[currentIndex];
  const confirmed = confirm(`Bạn có chắc muốn xóa thẻ "${card.hanzi}" (${card.meaning})?\nThao tác này không thể hoàn tác.`);
  if (!confirmed) return;

  cards.splice(currentIndex, 1);
  if (currentIndex >= cards.length) {
    currentIndex = Math.max(0, cards.length - 1);
  }
  isFlipped = false;

  saveAppState(appState);
  renderDeckSelect();
  renderCard();
  speakCurrentWord();
});

// ============================================================
// ĐĂNG NHẬP GOOGLE & ĐỒNG BỘ DỮ LIỆU QUA FIREBASE (không bắt buộc)
//
// Toàn bộ phần này CHỈ chạy thêm bên cạnh cơ chế localStorage có sẵn ở trên,
// không thay thế nó:
//   - Chưa đăng nhập  -> app hoạt động y hệt như trước (chỉ lưu localStorage).
//   - Đã đăng nhập    -> mỗi lần saveAppState() được gọi (thêm/sửa/xóa thẻ,
//     đổi bộ thẻ, tải Excel...) dữ liệu vẫn lưu localStorage NHƯ CŨ, đồng
//     thời được ghi thêm lên Firestore (syncActiveDeckToCloud - gọi ở cuối
//     saveAppState() phía trên). Khi mở app trên thiết bị khác và đăng nhập
//     cùng tài khoản Google, dữ liệu trên Firestore được tải về và thay thế
//     dữ liệu cục bộ (xem applyRemoteFullState).
//
// Dùng dynamic import() (thay vì thẻ <script type="module">) để tải SDK
// Firebase ngay bên trong file script.js bình thường này - nhờ vậy mọi biến
// (appState, cards, currentIndex...) vẫn dùng chung, không cần "lộ" chúng ra
// window hay tách file riêng.
// ============================================================

// Cấu hình dự án Firebase - lấy từ Firebase Console > Project settings.
// Đây không phải bí mật cần giấu (apiKey của Firebase Web SDK được thiết kế
// để lộ công khai trong code phía trình duyệt) - thứ thực sự bảo vệ dữ liệu
// là Firestore Security Rules (đã cấu hình ở Firebase Console, xem hướng dẫn
// đi kèm) chứ không phải việc giấu config này.
const firebaseConfig = {
  apiKey: "AIzaSyBQxTkKlQhN2N6QRLVfaT0ZdRgsSPeox9o",
  authDomain: "flashcard-tieng-trung-cc9ef.firebaseapp.com",
  projectId: "flashcard-tieng-trung-cc9ef",
  storageBucket: "flashcard-tieng-trung-cc9ef.firebasestorage.app",
  messagingSenderId: "832859185811",
  appId: "1:832859185811:web:c689013d76e0030ff86366"
};

const FIREBASE_SDK_VERSION = "10.12.2";

// Firestore giới hạn TỐI ĐA 500 thao tác ghi/xóa trong 1 "batch" (1 lần commit
// nguyên tử) - dùng 450 để chừa khoảng an toàn.
const FIRESTORE_BATCH_CHUNK_SIZE = 450;

// (Các biến firebaseAuth/firebaseDb/firestoreFns/currentUser/unsubscribeSnapshot/
// firebaseReady/recentMetaWriteIds/lastSyncedCardsJSON đã được khai báo sớm hơn ở
// phần "TRẠNG THÁI ĐỒNG BỘ FIREBASE" phía trên, ngay trước loadAppState())

// ------------------------------------------------------------
// CẤU TRÚC LƯU TRỮ TRÊN FIRESTORE
//
// TRƯỚC ĐÂY: mỗi user 1 document DUY NHẤT (users/{uid}) chứa TOÀN BỘ mọi bộ
// thẻ + mọi thẻ dồn vào 1 field "decks" (mảng lồng mảng). Cách này có 1 lỗi
// nghiêm trọng: Firestore giới hạn MỖI DOCUMENT tối đa ~1MB. Một bộ thẻ lớn
// (ví dụ ~1800 thẻ HSK6 có câu ví dụ) đã xấp xỉ 1MB CHỈ RIÊNG bộ đó - cộng
// thêm các bộ khác trong CÙNG 1 document là chắc chắn vượt giới hạn, khiến
// Firestore từ chối ghi ("Chưa đồng bộ được lên đám mây").
//
// BÂY GIỜ: tách nhỏ ra nhiều document, mỗi document chỉ chứa 1 phần nhỏ:
//   users/{uid}                              - { activeDeckId, deckOrder }
//     (nhẹ, chỉ chứa id/thứ tự bộ thẻ - KHÔNG BAO GIỜ có nguy cơ vượt 1MB
//     dù có bao nhiêu bộ/thẻ đi nữa)
//   users/{uid}/decks/{deckId}               - { name }
//   users/{uid}/decks/{deckId}/cards/{index} - { hanzi, pinyin, meaning, example }
//     (MỖI THẺ 1 document riêng - dù bộ có 12.000 thẻ, mỗi document vẫn chỉ
//     vài trăm byte, không thể nào chạm giới hạn 1MB)
// Ghi nhiều thẻ dùng writeBatch(), chia thành từng đợt tối đa
// FIRESTORE_BATCH_CHUNK_SIZE thẻ/đợt (giới hạn của Firestore là 500 thao
// tác/batch) - ghi TUẦN TỰ từng đợt, đợt nào lỗi thì DỪNG NGAY, không đụng gì
// tới dữ liệu cục bộ đang hiển thị, và báo rõ đã ghi được bao nhiêu thẻ.
// ------------------------------------------------------------

function cardDocId(index) {
  return String(index);
}

// Ghi appState xuống localStorage (KHÔNG đụng gì tới Firestore) - dùng ở
// những chỗ chỉ cần lưu cục bộ 1 thay đổi nhỏ (ví dụ đánh dấu 1 bộ "đã từng
// đồng bộ thành công"), tránh lặp lại cùng 1 đoạn try/catch nhiều nơi.
function persistLocalStorageOnly() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (error) {
    // Bỏ qua - đây chỉ là lưu cache cục bộ, dữ liệu gốc vẫn còn trên Firestore
  }
  updateStorageWarning(appState);
}

// Đánh dấu 1 bộ thẻ là "đã đồng bộ khớp" SAU KHI xác nhận ghi/đọc thành công
// (KHÔNG BAO GIỜ gọi hàm này TRƯỚC khi có xác nhận, để tránh đánh dấu lạc
// quan/race condition). "syncedOnce" là cờ BỀN (lưu trong appState, xuống cả
// localStorage) đánh dấu "bộ thẻ này CHẮC CHẮN đã từng tồn tại thật trên
// Firestore" - dùng để phân biệt "bộ mới tạo, chưa kịp đồng bộ" (chưa có cờ)
// với "bộ đã bị xóa ở thiết bị khác" (đã từng có cờ, giờ biến mất khỏi
// deckOrder) trong applyRemoteFullState() bên dưới - xem giải thích ở đó.
function markDeckSynced(deck) {
  lastSyncedCardsJSON[deck.id] = JSON.stringify(deck.cards);
  lastSyncedCardCount[deck.id] = deck.cards.length;
  pendingRetryDeckIds.delete(deck.id);
  retryBackoffState.delete(deck.id);
  if (!deck.syncedOnce) {
    deck.syncedOnce = true;
    persistLocalStorageOnly();
  }
}

// Các bộ thẻ ĐANG CẦN thử ghi lại lên Firestore (lần ghi trước thất bại giữa
// chừng, hoặc lúc tải về phát hiện dữ liệu trên đám mây "dở dang" so với máy
// này) - xem retryPendingDeckSyncs() bên dưới. Không cần lưu bền qua lần tải
// lại trang: nếu tải lại trang mà vẫn còn dở dang, lần đồng bộ đầy đủ tiếp
// theo (handleAuthChange) sẽ tự phát hiện lại và thêm vào đây.
const pendingRetryDeckIds = new Set();

// Lịch tăng dần thời gian chờ giữa các lần thử lại tự động cho 1 bộ thẻ cứ
// thất bại liên tục (1 phút -> 5 phút -> 15 phút -> 1 giờ, từ lần thứ 5 trở
// đi giữ nguyên 1 giờ). Sau MAX_RETRY_ATTEMPTS lần thất bại LIÊN TIẾP, app
// TỰ DỪNG thử lại tự động (tránh vòng lặp vô hạn tốn quota Firestore nếu có
// lỗi không thể tự hết, ví dụ sai quyền/Rules) và báo rõ cho người dùng biết,
// thay vì âm thầm thử mãi mỗi 60 giây như trước - đây chính là nguyên nhân
// khiến app từng vượt hạn mức đọc/ghi miễn phí của Firestore trong 24h.
const RETRY_BACKOFF_SCHEDULE_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000];
const MAX_RETRY_ATTEMPTS = 6;
const retryBackoffState = new Map(); // deckId -> { attempts, nextRetryAt }

let syncStatusHideTimer = null;
// persistent = true -> thông báo LỖI, không tự ẩn (để chắc chắn người dùng
// nhìn thấy), chỉ biến mất khi có 1 lần showSyncStatus khác gọi đè lên.
// persistent = false (mặc định) -> thông báo tiến trình/thành công bình
// thường, tự ẩn sau 2.5 giây như trước.
function showSyncStatus(text, persistent = false) {
  syncStatusEl.textContent = text;
  syncStatusEl.hidden = false;
  if (syncStatusHideTimer) {
    clearTimeout(syncStatusHideTimer);
    syncStatusHideTimer = null;
  }
  if (!persistent) {
    syncStatusHideTimer = setTimeout(() => {
      syncStatusEl.hidden = true;
    }, 2500);
  }
}

// Số _syncId gần đây tối đa cần nhớ để nhận ra "tiếng vọng" của chính máy
// này - xem giải thích ở onSnapshot bên dưới. Vài lần ghi dồn dập (sửa liên
// tiếp mấy thẻ) là đủ để cần nhớ hơn 1 cái, nhưng không cần nhớ quá nhiều.
const RECENT_META_WRITE_ID_LIMIT = 8;

// Ghi document nhỏ "users/{uid}" (chỉ activeDeckId + thứ tự các bộ thẻ) -
// document này luôn nhỏ, không bao giờ có nguy cơ vượt giới hạn dung lượng.
function writeMetaToCloud() {
  if (!firebaseReady || !currentUser || !firestoreFns) return;

  const { doc, setDoc } = firestoreFns;
  const syncId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  // Nhớ lại NHIỀU _syncId gần đây (không ghi đè chỉ 1 cái) - nếu ghi liên
  // tiếp dồn dập (ví dụ sửa liền vài thẻ), xác nhận (ack) của lần ghi TRƯỚC
  // có thể về SAU khi đã có lần ghi MỚI HƠN - so khớp với danh sách nhiều
  // _syncId gần đây thay vì chỉ 1 cái mới nhất tránh nhận nhầm ack đến muộn
  // của chính mình là "thay đổi thật từ thiết bị khác" (từng khiến app tự
  // tải lại toàn bộ mọi bộ thẻ + mọi thẻ một cách không cần thiết).
  recentMetaWriteIds.push(syncId);
  if (recentMetaWriteIds.length > RECENT_META_WRITE_ID_LIMIT) recentMetaWriteIds.shift();

  const metaRef = doc(firebaseDb, "users", currentUser.uid);
  setDoc(metaRef, {
    activeDeckId: appState.activeDeckId,
    deckOrder: appState.decks.map((deck) => deck.id),
    _syncId: syncId
  }).catch((error) => {
    console.warn("Lỗi đồng bộ danh sách bộ thẻ lên Firestore:", error);
    showSyncStatus("⚠️ Chưa đồng bộ được danh sách bộ thẻ lên đám mây.", true);
  });
}

// Ghi 1 BỘ THẺ lên Firestore: document tên bộ + MỖI THẺ 1 document riêng
// trong subcollection "cards" (đánh số theo vị trí trong mảng), rồi đóng dấu
// "cardCount" (số thẻ THỰC SỰ đã ghi xong) lên document bộ thẻ - CHỈ đóng dấu
// này SAU KHI toàn bộ quá trình (mọi đợt ghi thẻ + dọn thẻ dư) đã thành công.
// "cardCount" chính là cách để lần đọc SAU (fetchDecksByIds) biết được dữ
// liệu trên Firestore có ĐANG GHI DỞ DANG hay không - xem giải thích ở đó.
// Trả về true/false để nơi gọi biết có nên cập nhật lastSyncedCardsJSON hay không.
async function writeDeckToCloud(deck) {
  if (!firebaseReady || !currentUser || !firestoreFns) return false;

  const { doc, collection, getDocs, writeBatch } = firestoreFns;
  const deckRef = doc(firebaseDb, "users", currentUser.uid, "decks", deck.id);
  const cardsColRef = collection(deckRef, "cards");
  const totalCards = deck.cards.length;
  let writtenCount = 0;

  showSyncStatus("⏳ Đang đồng bộ...");

  try {
    // merge: true - CHƯA đụng tới field "cardCount" (nếu có từ lần đồng bộ
    // trước) ở bước này. Nhờ vậy, nếu quá trình bên dưới thất bại giữa chừng,
    // "cardCount" cũ (nếu có) vẫn còn nguyên và sẽ KHÔNG khớp với số document
    // thẻ thực tế lúc này -> lần đọc sau tự phát hiện được là dữ liệu dở dang.
    const metaBatch = writeBatch(firebaseDb);
    metaBatch.set(deckRef, { name: deck.name }, { merge: true });
    await metaBatch.commit();

    // Ghi từng đợt tối đa FIRESTORE_BATCH_CHUNK_SIZE thẻ, TUẦN TỰ (đợt sau
    // chỉ chạy khi đợt trước đã ghi THÀNH CÔNG) - nếu 1 đợt lỗi giữa chừng
    // (mất mạng, hết quota...), dừng ngay tại đây, KHÔNG động vào dữ liệu cục
    // bộ (biến "cards" trên máy vẫn còn nguyên như trước khi gọi hàm này).
    for (let start = 0; start < totalCards; start += FIRESTORE_BATCH_CHUNK_SIZE) {
      const end = Math.min(start + FIRESTORE_BATCH_CHUNK_SIZE, totalCards);
      const batch = writeBatch(firebaseDb);
      for (let i = start; i < end; i++) {
        const card = deck.cards[i];
        batch.set(doc(cardsColRef, cardDocId(i)), {
          hanzi: card.hanzi || "",
          pinyin: card.pinyin || "",
          meaning: card.meaning || "",
          example: {
            hanzi: (card.example && card.example.hanzi) || "",
            pinyin: (card.example && card.example.pinyin) || "",
            meaning: (card.example && card.example.meaning) || ""
          }
        });
      }
      await batch.commit();
      writtenCount = end;
    }

    // Dọn các document thẻ CŨ dư ra (nếu bộ vừa bị rút ngắn - ví dụ xóa bớt
    // thẻ, hoặc tải đè file Excel mới ít thẻ hơn) - CHỈ làm bước này SAU KHI
    // toàn bộ thẻ MỚI đã ghi thành công ở trên, để không lỡ xóa mất thẻ cũ
    // trong lúc việc ghi thẻ mới đang thất bại giữa chừng.
    //
    // CHỈ đọc lại (getDocs) khi bộ CÓ THỂ đã bị rút ngắn so với lần đồng bộ
    // thành công gần nhất mà CHÍNH máy này biết chắc (totalCards nhỏ hơn), hoặc
    // khi máy này chưa từng biết số thẻ cũ (lần đầu, đọc 1 lần cho chắc).
    // Trường hợp phổ biến nhất - sửa nội dung thẻ hoặc THÊM thẻ mới, KHÔNG
    // xóa thẻ nào - bỏ qua hẳn bước đọc tốn kém này, vì chắc chắn không có gì
    // để dọn. Đây là 1 trong các nguyên nhân khiến app vượt hạn mức đọc miễn
    // phí của Firestore: trước đây MỌI lần sửa 1 thẻ trong bộ lớn đều phải
    // đọc lại TOÀN BỘ document thẻ của bộ đó.
    //
    // Đánh đổi: nếu 1 THIẾT BỊ KHÁC từng ghi thêm thẻ mà máy này chưa biết,
    // rồi máy này ghi đè với ít thẻ hơn NHƯNG vẫn >= số máy này biết, có thể
    // sót lại vài document thừa trên Firestore. Vô hại về mặt dữ liệu (không
    // gây mất/sai dữ liệu) - lần đọc sau sẽ phát hiện qua "cardCount" không
    // khớp (coi là dữ liệu khả nghi, không áp dụng nhầm) và tự dọn lại ở lần
    // ghi kế tiếp khi cần.
    const knownPreviousCount = lastSyncedCardCount[deck.id];
    const mightHaveStaleDocs = knownPreviousCount === undefined || totalCards < knownPreviousCount;

    if (mightHaveStaleDocs) {
      const existingSnap = await getDocs(cardsColRef);
      const staleDocs = existingSnap.docs.filter((d) => Number(d.id) >= totalCards);
      for (let i = 0; i < staleDocs.length; i += FIRESTORE_BATCH_CHUNK_SIZE) {
        const batch = writeBatch(firebaseDb);
        staleDocs.slice(i, i + FIRESTORE_BATCH_CHUNK_SIZE).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // MỌI bước ở trên đã thành công -> giờ mới đóng dấu "hoàn tất" với đúng
    // số thẻ thực tế. Đây là bước CUỐI CÙNG, cố tình tách riêng để nếu chính
    // bước đóng dấu này lỡ thất bại (hiếm), lần đọc sau vẫn coi là dở dang
    // (an toàn hơn là đóng dấu nhầm "xong" khi chưa chắc chắn).
    const stampBatch = writeBatch(firebaseDb);
    stampBatch.set(deckRef, { name: deck.name, cardCount: totalCards }, { merge: true });
    await stampBatch.commit();

    markDeckSynced(deck);
    showSyncStatus("☁️ Đã đồng bộ");
    return true;
  } catch (error) {
    console.warn(`Lỗi đồng bộ bộ thẻ "${deck.name}" lên Firestore:`, error);
    // Đánh dấu bộ này ĐANG CẦN thử ghi lại - retryPendingDeckSyncs() sẽ tự
    // động thử lại khi có mạng trở lại (sự kiện "online") hoặc theo chu kỳ,
    // KHÔNG cần người dùng phải tự sửa 1 thẻ nào đó để "kích hoạt" nữa.
    pendingRetryDeckIds.add(deck.id);
    showSyncStatus(
      `⚠️ Đồng bộ bộ "${deck.name}" thất bại giữa chừng: đã ghi được ${writtenCount}/${totalCards} thẻ lên đám mây, ` +
        `còn ${totalCards - writtenCount} thẻ chưa đồng bộ. Dữ liệu trên máy này vẫn giữ nguyên đầy đủ, không mất gì - ` +
        `app sẽ tự thử đồng bộ lại khi có mạng ổn định.`,
      true
    );
    return false;
  }
}

// Xóa hẳn 1 bộ thẻ trên Firestore (document tên bộ + toàn bộ document thẻ
// trong subcollection "cards") - gọi khi người dùng bấm "Xóa bộ này", hoặc từ
// retryPendingDeckDeletions() khi thử lại 1 lệnh xóa trước đó thất bại. Trả
// về true/false để nơi gọi biết có nên gỡ deckId khỏi pendingDeletedDeckIds
// hay còn phải thử lại.
async function deleteDeckFromCloud(deckId, deckName) {
  if (!firebaseReady || !currentUser || !firestoreFns) return false;

  const { doc, collection, getDocs, writeBatch, deleteDoc } = firestoreFns;
  try {
    const deckRef = doc(firebaseDb, "users", currentUser.uid, "decks", deckId);
    const cardsColRef = collection(deckRef, "cards");
    const existingSnap = await getDocs(cardsColRef);

    for (let i = 0; i < existingSnap.docs.length; i += FIRESTORE_BATCH_CHUNK_SIZE) {
      const batch = writeBatch(firebaseDb);
      existingSnap.docs.slice(i, i + FIRESTORE_BATCH_CHUNK_SIZE).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await deleteDoc(deckRef);
    delete lastSyncedCardsJSON[deckId];
    delete lastSyncedCardCount[deckId];
    pendingRetryDeckIds.delete(deckId);
    retryBackoffState.delete(deckId);

    // Lệnh xóa trên đám mây đã CHẮC CHẮN thành công - giờ mới gỡ khỏi hàng
    // chờ "đang chờ xóa", để applyRemoteFullState() không còn cần chặn bộ
    // này nữa (dù server có trả về gì cũng không còn ảnh hưởng, vì bộ đã
    // thực sự không còn tồn tại trên Firestore).
    const idx = appState.pendingDeletedDeckIds.indexOf(deckId);
    if (idx !== -1) {
      appState.pendingDeletedDeckIds.splice(idx, 1);
      persistLocalStorageOnly();
    }
    deleteRetryBackoffState.delete(deckId);
    return true;
  } catch (error) {
    console.warn(`Lỗi xóa bộ thẻ "${deckName}" trên Firestore:`, error);
    showSyncStatus(`⚠️ Xóa bộ "${deckName}" trên đám mây thất bại - có thể cần thử lại khi có mạng.`, true);
    return false;
  }
}

// Thử ghi lại các bộ thẻ đang nằm trong "hàng chờ" pendingRetryDeckIds (lần
// ghi/đọc trước phát hiện dở dang - xem writeDeckToCloud/applyRemoteFullState)
// lên Firestore. Gọi khi: (1) trình duyệt báo có mạng trở lại (sự kiện
// "online"), (2) định kỳ mỗi ít phút làm lưới an toàn (phòng khi sự kiện
// "online" không bắn ra dù thực ra kết nối đã ổn - ví dụ vẫn nối wifi nhưng
// wifi đó mất Internet rồi có lại), (3) ngay sau khi vừa phát hiện ra dữ liệu
// khả nghi. Không cần người dùng phải tự làm gì (sửa 1 thẻ...) để "kích hoạt"
// nữa như phiên bản trước.
let retryInFlight = false;
async function retryPendingDeckSyncs() {
  if (retryInFlight) return; // tránh chạy chồng nhiều lần cùng lúc (sự kiện online + interval trùng thời điểm)
  if (pendingRetryDeckIds.size === 0) return;
  if (!firebaseReady || !currentUser || !firestoreFns) return;

  retryInFlight = true;
  try {
    const now = Date.now();

    for (const deckId of [...pendingRetryDeckIds]) {
      const deck = appState.decks.find((d) => d.id === deckId);
      if (!deck) {
        // Bộ đã không còn trên máy này nữa (ví dụ người dùng tự xóa trong
        // lúc chờ) - không cần thử lại nữa
        pendingRetryDeckIds.delete(deckId);
        retryBackoffState.delete(deckId);
        continue;
      }

      // Chưa tới giờ thử lại theo lịch backoff của riêng bộ này - bỏ qua lần
      // lặp này, để dành cho lần setInterval/online tiếp theo
      const backoff = retryBackoffState.get(deckId);
      if (backoff && now < backoff.nextRetryAt) continue;

      const ok = await writeDeckToCloud(deck); // thành công thì tự markDeckSynced() xóa khỏi cả 2 Map/Set bên trong
      if (ok) continue;

      // Thất bại - tính số lần thất bại LIÊN TIẾP, hoặc dừng hẳn nếu đã chạm
      // giới hạn (KHÔNG để vòng lặp thử mãi vô hạn - đây chính là nguyên
      // nhân gây vượt hạn mức Firestore trước đây).
      const attempts = (backoff ? backoff.attempts : 0) + 1;
      if (attempts >= MAX_RETRY_ATTEMPTS) {
        pendingRetryDeckIds.delete(deckId);
        retryBackoffState.delete(deckId);
        showSyncStatus(
          `⚠️ Bộ "${deck.name}" đã thử đồng bộ ${attempts} lần liên tiếp đều thất bại - đã TẠM DỪNG tự động thử lại để tránh tốn quota. ` +
            `Dữ liệu trên máy này vẫn còn nguyên vẹn. Hãy kiểm tra kết nối mạng, sau đó sửa lại 1 thẻ bất kỳ trong bộ này (hoặc tải lại trang) để thử đồng bộ lại.`,
          true
        );
      } else {
        const delayMs = RETRY_BACKOFF_SCHEDULE_MS[Math.min(attempts - 1, RETRY_BACKOFF_SCHEDULE_MS.length - 1)];
        retryBackoffState.set(deckId, { attempts, nextRetryAt: now + delayMs });
      }
    }
  } finally {
    retryInFlight = false;
  }
}

// Lịch backoff/trạng thái thử lại riêng cho LỆNH XÓA (deckId -> { attempts,
// nextRetryAt }) - tách khỏi retryBackoffState (dùng cho ghi nội dung) vì 2
// việc có quy tắc dừng khác nhau, xem retryPendingDeckDeletions() bên dưới.
// Không cần lưu bền: nếu tải lại trang, appState.pendingDeletedDeckIds (ĐÃ
// lưu bền) vẫn còn nguyên, app sẽ thử lại ngay từ đầu (attempts = 0).
const deleteRetryBackoffState = new Map();

// Thử xóa lại các bộ thẻ đang nằm trong appState.pendingDeletedDeckIds (lệnh
// xóa trước đó thất bại giữa chừng - mất mạng, hết quota...). Gọi ở CÙNG các
// thời điểm với retryPendingDeckSyncs() (có mạng trở lại, lưới an toàn định
// kỳ, vừa đăng nhập/mở lại app).
//
// KHÁC với retryPendingDeckSyncs(): KHÔNG có giới hạn số lần thử liên tiếp.
// Lý do: 1 bộ ghi thất bại thì dữ liệu VẪN CÒN trên máy, người dùng có thể tự
// sửa 1 thẻ để "kích hoạt" thử lại thủ công nếu app đã tự dừng. Nhưng 1 bộ đã
// XÓA thì đã biến mất khỏi giao diện - người dùng KHÔNG CÒN CÁCH NÀO để tự
// kích hoạt lại nếu app dừng thử, nên phải tiếp tục thử (giãn cách dần theo
// RETRY_BACKOFF_SCHEDULE_MS, giữ nguyên 1 giờ/lần sau khi hết lịch) cho tới
// khi thành công hoặc người dùng đăng xuất.
let deleteRetryInFlight = false;
async function retryPendingDeckDeletions() {
  if (deleteRetryInFlight) return; // tránh chạy chồng nhiều lần cùng lúc
  if (appState.pendingDeletedDeckIds.length === 0) return;
  if (!firebaseReady || !currentUser || !firestoreFns) return;

  deleteRetryInFlight = true;
  try {
    const now = Date.now();

    for (const deckId of [...appState.pendingDeletedDeckIds]) {
      // Chưa tới giờ thử lại theo lịch backoff của riêng bộ này - bỏ qua lần
      // lặp này, để dành cho lần setInterval/online tiếp theo
      const backoff = deleteRetryBackoffState.get(deckId);
      if (backoff && now < backoff.nextRetryAt) continue;

      const ok = await deleteDeckFromCloud(deckId, deckId); // thành công thì tự gỡ khỏi pendingDeletedDeckIds bên trong
      if (ok) continue;

      const attempts = (backoff ? backoff.attempts : 0) + 1;
      const delayMs = RETRY_BACKOFF_SCHEDULE_MS[Math.min(attempts - 1, RETRY_BACKOFF_SCHEDULE_MS.length - 1)];
      deleteRetryBackoffState.set(deckId, { attempts, nextRetryAt: now + delayMs });
    }
  } finally {
    deleteRetryInFlight = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (pendingRetryDeckIds.size > 0) {
      showSyncStatus("🌐 Đã có mạng trở lại - đang thử đồng bộ lại phần còn thiếu...");
      retryPendingDeckSyncs();
    }
    if (appState.pendingDeletedDeckIds.length > 0) {
      retryPendingDeckDeletions();
    }
  });

  // Lưới an toàn định kỳ - phòng khi sự kiện "online" của trình duyệt không
  // đáng tin cậy 100% (ví dụ mất Internet nhưng vẫn nối wifi nội bộ)
  setInterval(retryPendingDeckSyncs, 60000);
  setInterval(retryPendingDeckDeletions, 60000);
}

// Đồng bộ bộ thẻ ĐANG XEM lên Firestore (gọi từ saveAppState() ở trên, sau
// MỌI thao tác thêm/sửa/xóa thẻ, đổi bộ, tải Excel...). Luôn ghi lại document
// meta (nhỏ, rẻ), nhưng CHỈ ghi lại toàn bộ thẻ của bộ đang xem nếu nội dung
// bộ đó thực sự thay đổi so với lần đồng bộ gần nhất - tránh việc chỉ đơn
// giản CHUYỂN SANG XEM 1 bộ thẻ lớn (ví dụ 1800 thẻ) cũng bị ghi lại toàn bộ
// 1800 document một cách lãng phí.
function syncActiveDeckToCloud() {
  // QUAN TRỌNG: phải kiểm tra và thoát sớm ở đây, TRƯỚC KHI đụng vào
  // getActiveDeck() (đọc biến toàn cục "appState"). Hàm này được gọi từ
  // saveAppState(), mà saveAppState() có thể được gọi RẤT SỚM lúc khởi động
  // app (từ bên trong loadAppState(), khi chưa có gì trong localStorage) -
  // tức là TRƯỚC KHI dòng "let appState = loadAppState();" kịp gán xong giá
  // trị cho appState. Nếu gọi getActiveDeck() lúc đó sẽ bị lỗi "Cannot access
  // 'appState' before initialization" và làm SẬP TOÀN BỘ APP ngay từ đầu.
  // Vì Firebase chỉ sẵn sàng (firebaseReady = true) sau khi initFirebase()
  // tải xong SDK (luôn xảy ra SAU khi appState đã khởi tạo xong), kiểm tra
  // firebaseReady trước tiên ở đây loại bỏ hoàn toàn nguy cơ đó.
  if (!firebaseReady || !currentUser || !firestoreFns) return;

  writeMetaToCloud();

  const deck = getActiveDeck();
  if (!deck) return;

  const cardsJSON = JSON.stringify(deck.cards);
  if (lastSyncedCardsJSON[deck.id] === cardsJSON) return;

  writeDeckToCloud(deck); // tự đánh dấu markDeckSynced() bên trong nếu thành công
}

// Tải danh sách bộ thẻ (theo đúng id trong deckOrder) kèm TOÀN BỘ thẻ của
// từng bộ từ Firestore về. Dùng chung cho cả lúc đăng nhập và lúc phát hiện
// thay đổi từ thiết bị khác.
//
// Mỗi bộ trả về kèm cờ "inconsistent": true nếu số document thẻ đọc được
// KHÔNG khớp với "cardCount" đã đóng dấu trên document bộ thẻ (xem
// writeDeckToCloud) - nghĩa là lần ghi gần nhất lên Firestore (từ BẤT KỲ
// thiết bị nào) đã DỞ DANG, dữ liệu hiện KHÔNG đáng tin cậy 100%. Bộ thẻ nào
// chưa từng được ghi bằng phiên bản code có "cardCount" (dữ liệu cũ, đồng bộ
// từ trước khi có cơ chế này) thì không có gì để so sánh - coi như bình
// thường, không báo nghi ngờ (tránh báo nhầm hàng loạt cho dữ liệu cũ).
async function fetchDecksByIds(uid, deckIds) {
  const { doc, getDoc, collection, getDocs } = firestoreFns;
  const decks = [];

  for (const deckId of deckIds) {
    const deckRef = doc(firebaseDb, "users", uid, "decks", deckId);
    const deckSnap = await getDoc(deckRef);
    if (!deckSnap.exists()) continue; // tham chiếu cũ tới bộ đã bị xóa - bỏ qua

    const deckData = deckSnap.data();
    const cardsSnap = await getDocs(collection(deckRef, "cards"));
    const cards = cardsSnap.docs
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((d) => d.data());

    const declaredCount = deckData.cardCount;
    const inconsistent = typeof declaredCount === "number" && declaredCount !== cards.length;

    decks.push({ id: deckId, name: deckData.name || deckId, cards, inconsistent });
  }

  return decks;
}

// Áp dụng dữ liệu tải từ Firestore vào app (khi vừa đăng nhập, hoặc khi một
// thiết bị khác vừa thay đổi dữ liệu). Không gọi speakCurrentWord() ở đây vì
// việc dữ liệu bất chợt cập nhật (do thiết bị khác) không nên tự phát âm
// thanh. Trả về số bộ thẻ bị coi là "khả nghi" (rỗng bất thường HOẶC dở
// dang) - nếu > 0, nơi gọi nên báo cho người dùng biết.
function applyRemoteFullState(remote) {
  const localDecksById = new Map(appState.decks.map((deck) => [deck.id, deck]));
  const pendingDeletedIds = new Set(appState.pendingDeletedDeckIds);
  let suspiciousCount = 0;

  // CHỐT AN TOÀN #0 - BỘ ĐANG CHỜ XÓA TRÊN CHÍNH MÁY NÀY: nếu người dùng vừa
  // bấm xóa 1 bộ (đã biến mất khỏi appState.decks + được ghi vào
  // pendingDeletedDeckIds - xem nút "Xóa bộ này") nhưng lệnh xóa trên
  // Firestore CHƯA chắc đã thành công (mất mạng, hết quota...), server có thể
  // vẫn còn trả về bộ đó. Loại thẳng nó ra khỏi dữ liệu tải về ở đây - TUYỆT
  // ĐỐI không cho "sống lại" trên chính máy vừa xóa. deleteDeckFromCloud()
  // (qua retryPendingDeckDeletions()) sẽ tự thử xóa lại cho tới khi thành
  // công thật sự, lúc đó mới gỡ khỏi pendingDeletedDeckIds.
  const remoteDecksToApply = remote.decks.filter((remoteDeck) => {
    if (pendingDeletedIds.has(remoteDeck.id)) {
      console.warn(
        `Bộ thẻ (id: ${remoteDeck.id}) đang chờ xóa trên máy này - bỏ qua dữ liệu tải về từ đám mây, không cho sống lại.`
      );
      return false;
    }
    return true;
  });

  // CHỐT AN TOÀN THEO TỪNG BỘ THẺ RIÊNG LẺ - áp dụng cho 2 kiểu dữ liệu khả
  // nghi (xem VẤN ĐỀ 1 và 2 đã điều tra):
  //   (a) remote CÓ 0 thẻ trong khi máy đang có thẻ thật cho đúng bộ đó
  //   (b) remote "inconsistent" (số thẻ đọc được KHÔNG khớp "cardCount" đã
  //       đóng dấu - nghĩa là 1 lần ghi trước đó, từ 1 thiết bị BẤT KỲ, đã
  //       dở dang) - đây chính là kiểu lỗi khiến "mất hơn 1000/10000+ thẻ":
  //       máy A ghi dở dang do mất mạng, máy B tải về đúng phần dở dang đó
  //       tưởng là dữ liệu thật rồi ghi đè lên bản đầy đủ của máy B.
  // Cả 2 trường hợp: GIỮ NGUYÊN dữ liệu của RIÊNG bộ đó trên máy này (nếu máy
  // đang có dữ liệu), các bộ KHÁC vẫn cập nhật bình thường, đồng thời đưa bộ
  // đó vào hàng chờ để TỰ ĐỘNG thử ghi lại đầy đủ lên Firestore khi có mạng
  // ổn định (retryPendingDeckSyncs) - không cần người dùng tự làm gì thêm.
  const safeDecks = remoteDecksToApply.map((remoteDeck) => {
    const localDeck = localDecksById.get(remoteDeck.id);
    const remoteCardCount = Array.isArray(remoteDeck.cards) ? remoteDeck.cards.length : 0;
    const isEmptyButLocalHasData = remoteCardCount === 0 && localDeck && localDeck.cards.length > 0;
    const isInconsistent = remoteDeck.inconsistent === true;

    if (isEmptyButLocalHasData || isInconsistent) {
      suspiciousCount++;
      if (localDeck) {
        console.warn(
          isInconsistent
            ? `Bộ thẻ "${remoteDeck.name}" tải từ Firestore về KHÔNG khớp số thẻ đã đóng dấu (dữ liệu dở dang, có thể do 1 thiết bị khác ghi bị gián đoạn) - đã giữ nguyên ${localDeck.cards.length} thẻ trên máy này, không ghi đè, sẽ tự đồng bộ lại khi có mạng.`
            : `Bộ thẻ "${remoteDeck.name}" tải từ Firestore về rỗng (0 thẻ) trong khi máy này đang có ${localDeck.cards.length} thẻ - đã giữ nguyên dữ liệu của bộ này trên máy, không ghi đè.`
        );
        pendingRetryDeckIds.add(remoteDeck.id); // để dữ liệu ĐẦY ĐỦ của máy này được đẩy lại lên khi có mạng
        return localDeck;
      }
      // Máy này chưa từng có bộ này (ví dụ thiết bị mới) -> không có gì để
      // giữ thay thế, đành áp dụng tạm dữ liệu khả nghi này (còn hơn không
      // có gì), nhưng vẫn báo rõ để người dùng biết có thể chưa đầy đủ.
      console.warn(`Bộ thẻ "${remoteDeck.name}" có thể chưa đồng bộ đầy đủ trên đám mây - đã tải tạm, sẽ tự kiểm tra lại.`);
    }
    return remoteDeck;
  });

  // Mọi bộ vừa xác nhận TỒN TẠI THẬT trên Firestore (dù nội dung có khả nghi
  // hay không) đều được đánh dấu syncedOnce - để nếu SAU NÀY nó biến mất
  // khỏi deckOrder, ta biết chắc đó là bị XÓA thật, không phải "chưa kịp
  // đồng bộ" (xem đoạn phân loại newLocalOnlyDecks ngay bên dưới).
  // QUAN TRỌNG: phải đánh dấu trên object THỰC SỰ nằm trong safeDecks (object
  // đó có thể là remoteDeck HOẶC localDeck tùy nhánh khả nghi ở trên) - không
  // phải trên localDeck gốc, nếu không sẽ đánh dấu nhầm lên 1 object đã bị
  // thay thế/loại bỏ, không có tác dụng gì.
  remote.decks.forEach((remoteDeck) => {
    const finalDeck = safeDecks.find((d) => d.id === remoteDeck.id);
    if (finalDeck) finalDeck.syncedOnce = true;
  });

  // Bộ thẻ có trên máy này nhưng KHÔNG có trong danh sách remote.decks lần
  // này - có 2 khả năng hoàn toàn khác nhau, phải phân biệt rõ:
  //   (a) deck.syncedOnce chưa từng bật -> THẬT SỰ mới tạo, chưa kịp đồng bộ
  //       lần nào -> giữ lại trên máy này, tranh thủ đẩy lên đám mây.
  //   (b) deck.syncedOnce đã bật (đã từng được xác nhận tồn tại thật trên
  //       Firestore ở 1 lần đồng bộ TRƯỚC ĐÓ) -> giờ không còn trong
  //       deckOrder nữa -> ĐÃ BỊ XÓA Ở THIẾT BỊ KHÁC -> xóa theo ở máy này,
  //       TUYỆT ĐỐI KHÔNG đẩy lại lên (đây chính là nguyên nhân khiến "bộ
  //       thẻ đã xóa tự động xuất hiện trở lại" trước đây).
  const remoteIds = new Set(remote.decks.map((deck) => deck.id));
  const newLocalOnlyDecks = [];
  appState.decks.forEach((deck) => {
    if (remoteIds.has(deck.id)) return;
    if (deck.syncedOnce) {
      console.warn(`Bộ thẻ "${deck.name}" đã bị xóa ở thiết bị khác - đồng bộ theo, bỏ khỏi máy này.`);
    } else {
      newLocalOnlyDecks.push(deck);
    }
  });

  const finalDecks = [...safeDecks, ...newLocalOnlyDecks];

  appState = {
    activeDeckId:
      remote.activeDeckId && finalDecks.some((deck) => deck.id === remote.activeDeckId)
        ? remote.activeDeckId
        : finalDecks[0]
          ? finalDecks[0].id
          : null,
    decks: finalDecks,
    // QUAN TRỌNG: phải mang theo pendingDeletedDeckIds sang object appState
    // MỚI này - nếu không, mọi lệnh xóa đang chờ (deleteDeckBtn) sẽ bị "quên"
    // ngay khi có 1 lần tải dữ liệu khác từ cloud xảy ra xen giữa, mở lại
    // đúng lỗi "sống lại" mà pendingDeletedDeckIds được thêm vào để chặn.
    pendingDeletedDeckIds: [...pendingDeletedIds]
  };

  cards = getActiveDeck() ? getActiveDeck().cards : [];
  currentIndex = 0;
  isFlipped = false;

  // Đánh dấu các bộ ĐÁNG TIN CẬY (không nằm trong danh sách khả nghi ở trên)
  // là "đã khớp đồng bộ", để nếu người dùng chỉ chuyển sang xem 1 bộ lớn
  // ngay sau khi đăng nhập, syncActiveDeckToCloud() không ghi lại vô ích
  // toàn bộ thẻ của bộ đó. Bộ khả nghi thì CỐ TÌNH không đánh dấu ở đây -
  // pendingRetryDeckIds đã lo phần tự đồng bộ lại cho chúng.
  finalDecks.forEach((deck) => {
    if (!pendingRetryDeckIds.has(deck.id)) {
      lastSyncedCardsJSON[deck.id] = JSON.stringify(deck.cards);
    }
  });

  persistLocalStorageOnly();
  renderDeckSelect();
  renderCard();

  if (newLocalOnlyDecks.length > 0) {
    newLocalOnlyDecks.forEach((deck) => writeDeckToCloud(deck)); // tự markDeckSynced() bên trong nếu thành công
    writeMetaToCloud();
  }

  if (pendingRetryDeckIds.size > 0) {
    retryPendingDeckSyncs(); // thử ngay (ví dụ mạng thực ra vẫn ổn, chỉ là lần đọc trước đó gặp bản dở dang)
  }
  if (appState.pendingDeletedDeckIds.length > 0) {
    retryPendingDeckDeletions();
  }

  return suspiciousCount;
}

// Chạy khi trạng thái đăng nhập thay đổi (đăng nhập, đăng xuất, hoặc lúc
// Firebase tự khôi phục phiên đăng nhập cũ khi mở lại app)
async function handleAuthChange(user) {
  currentUser = user;

  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }

  if (!user) {
    loginBtn.hidden = false;
    authUserEl.hidden = true;
    syncStatusEl.hidden = true;
    return;
  }

  loginBtn.hidden = true;
  authUserEl.hidden = false;
  authAvatarEl.src = user.photoURL || "";
  authNameEl.textContent = user.displayName || user.email || "";

  const { doc, getDoc, onSnapshot } = firestoreFns;
  const metaRef = doc(firebaseDb, "users", user.uid);

  showSyncStatus("⏳ Đang tải dữ liệu...");

  try {
    const metaSnap = await getDoc(metaRef);

    if (!metaSnap.exists()) {
      // Tài khoản này CHƯA TỪNG đồng bộ (chắc chắn, không phải do lỗi đọc -
      // getDoc ném lỗi ở catch bên dưới nếu có sự cố) -> đẩy TOÀN BỘ dữ liệu
      // hiện có trên máy này (mọi bộ thẻ, kể cả bộ mẫu) lên làm dữ liệu gốc
      writeMetaToCloud();
      for (const deck of appState.decks) {
        await writeDeckToCloud(deck); // tự đánh dấu markDeckSynced() bên trong nếu thành công
      }
      showSyncStatus("☁️ Đã đồng bộ");
    } else {
      const metaData = metaSnap.data();
      const deckOrder = Array.isArray(metaData.deckOrder) ? metaData.deckOrder : [];

      if (deckOrder.length === 0) {
        // App KHÔNG BAO GIỜ tự tạo ra trạng thái "0 bộ thẻ" (luôn giữ lại ít
        // nhất 1 bộ, xem nút "Xóa bộ này") nên đây chắc chắn là dữ liệu bị
        // lỗi/ghi dở dang, KHÔNG PHẢI người dùng thật sự đã xóa hết mọi bộ
        // thẻ -> không đụng vào gì, chỉ báo lỗi, giữ nguyên dữ liệu hiện có.
        console.warn("Danh sách bộ thẻ trên Firestore rỗng bất thường - giữ nguyên dữ liệu trên máy.", metaData);
        showSyncStatus("⚠️ Dữ liệu đám mây đang trống bất thường - đã giữ nguyên dữ liệu trên máy này.", true);
      } else {
        const remoteDecks = await fetchDecksByIds(user.uid, deckOrder);
        const suspiciousCount = applyRemoteFullState({ activeDeckId: metaData.activeDeckId, decks: remoteDecks });
        showSyncStatus(
          suspiciousCount > 0
            ? `⚠️ ${suspiciousCount} bộ thẻ tải về bị rỗng bất thường - đã giữ nguyên dữ liệu cũ cho (các) bộ đó.`
            : "☁️ Đã đồng bộ",
          suspiciousCount > 0
        );
      }
    }
  } catch (error) {
    console.warn("Lỗi tải dữ liệu từ Firestore:", error);
    showSyncStatus(
      "⚠️ Không tải được dữ liệu đám mây (mất mạng hoặc hết phiên đăng nhập) - đang dùng dữ liệu trên máy, chưa đồng bộ.",
      true
    );
  }

  // Đăng nhập/mở lại app là 1 thời điểm tốt để thử đồng bộ nốt các bộ còn
  // dở dang từ trước (nếu có) - không cần đợi tới sự kiện "online" hay lưới
  // an toàn định kỳ.
  retryPendingDeckSyncs();
  retryPendingDeckDeletions();

  // Lắng nghe THAY ĐỔI CẤU TRÚC (bộ thẻ nào đang có, đang xem bộ nào) từ CÁC
  // THIẾT BỊ KHÁC. Chỉ lắng nghe document NHỎ "users/{uid}" (không lắng nghe
  // từng thẻ) nên KHÔNG BAO GIỜ có nguy cơ vượt giới hạn dung lượng Firestore
  // dù bộ thẻ có bao nhiêu nghìn thẻ đi nữa.
  // Lưu ý: sửa/thêm/xóa TỪNG THẺ ở thiết bị khác sẽ được tải về đầy đủ vào
  // lần MỞ APP/ĐĂNG NHẬP tiếp theo trên máy này, nhưng sẽ KHÔNG tự đẩy sang
  // ngay lập tức nếu máy này đang mở sẵn app cùng lúc (đánh đổi để đơn giản
  // hoá và tránh phải theo dõi hàng chục nghìn thẻ cùng lúc theo thời gian
  // thực - nếu cần, có thể bổ sung sau).
  unsubscribeSnapshot = onSnapshot(
    metaRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      // _syncId khớp với 1 trong vài lần ghi GẦN ĐÂY của CHÍNH máy này -> đây
      // chỉ là xác nhận (ack, có thể đến hơi muộn) của (1 trong) các thao
      // tác vừa lưu, không phải thay đổi từ nơi khác
      if (data._syncId && recentMetaWriteIds.includes(data._syncId)) return;
      if (snap.metadata.hasPendingWrites) return;

      const deckOrder = Array.isArray(data.deckOrder) ? data.deckOrder : [];
      if (deckOrder.length === 0) return; // dữ liệu rỗng bất thường - xem giải thích ở trên, bỏ qua

      // TỐI ƯU QUAN TRỌNG - NGUYÊN NHÂN GỐC CỦA VIỆC VƯỢT HẠN MỨC ĐỌC:
      // onSnapshot BẮT BUỘC bắn ra ít nhất 1 lần ngay khi vừa đăng ký (kể cả
      // khi KHÔNG CÓ gì thay đổi thật - đây là hành vi mặc định của Firestore,
      // không phải lỗi), và bắn lại MỖI KHI document "users/{uid}" đổi - kể cả
      // khi chỉ "activeDeckId" đổi (tức là 1 THIẾT BỊ KHÁC chỉ đơn giản chuyển
      // sang xem 1 bộ thẻ khác, KHÔNG hề thêm/xóa bộ nào). Trước đây, MỌI lần
      // bắn callback đều gọi fetchDecksByIds() - đọc LẠI TOÀN BỘ document của
      // MỌI bộ thẻ + MỌI thẻ trong từng bộ (getDocs cả subcollection "cards"),
      // dù thực ra chẳng có gì thay đổi ngoài "đang xem bộ nào". Nếu người
      // dùng mở app trên 2+ thiết bị cùng lúc (điện thoại + iPad...) và chỉ
      // đơn giản CHUYỂN QUA LẠI GIỮA CÁC BỘ THẺ khi học (thao tác rất bình
      // thường, không phải "thao tác nhiều"), MỖI lần chuyển bộ ở 1 thiết bị
      // sẽ khiến MỌI thiết bị khác đang mở app tự động tải lại TOÀN BỘ hàng
      // nghìn thẻ - đây chính là kiểu vòng lặp khiến lượt đọc tăng vọt lên
      // hàng trăm nghìn dù không ai chủ động làm gì nhiều.
      //
      // Sửa: so sánh TẬP HỢP id các bộ thẻ vừa nhận với tập hợp đang có trên
      // máy này. Nếu HOÀN TOÀN GIỐNG NHAU (không bộ nào được thêm/xóa ở nơi
      // khác), thay đổi duy nhất CÓ THỂ có là "activeDeckId" - áp dụng ngay
      // tại chỗ (rẻ, không cần Firestore), KHÔNG gọi fetchDecksByIds(). CHỈ
      // khi tập hợp id THỰC SỰ khác (có bộ được thêm/xóa ở thiết bị khác) mới
      // cần tải lại đầy đủ như cũ.
      const localDeckIds = new Set(appState.decks.map((deck) => deck.id));
      const deckSetUnchanged =
        localDeckIds.size === deckOrder.length && deckOrder.every((id) => localDeckIds.has(id));

      if (deckSetUnchanged) {
        if (
          data.activeDeckId &&
          data.activeDeckId !== appState.activeDeckId &&
          appState.decks.some((deck) => deck.id === data.activeDeckId)
        ) {
          appState.activeDeckId = data.activeDeckId;
          cards = getActiveDeck().cards;
          currentIndex = 0;
          isFlipped = false;
          persistLocalStorageOnly();
          renderDeckSelect();
          renderCard();
        }
        return;
      }

      fetchDecksByIds(user.uid, deckOrder)
        .then((remoteDecks) => {
          const suspiciousCount = applyRemoteFullState({ activeDeckId: data.activeDeckId, decks: remoteDecks });
          if (suspiciousCount > 0) {
            showSyncStatus(
              `⚠️ ${suspiciousCount} bộ thẻ tải về bị rỗng bất thường - đã giữ nguyên dữ liệu cũ cho (các) bộ đó.`,
              true
            );
          }
        })
        .catch((error) => {
          console.warn("Lỗi tải lại dữ liệu sau khi phát hiện thay đổi từ thiết bị khác:", error);
        });
    },
    (error) => {
      console.warn("Mất kết nối đồng bộ Firestore:", error);
      showSyncStatus(
        "⚠️ Mất kết nối đồng bộ - dữ liệu trên máy vẫn được giữ nguyên, sẽ tự đồng bộ lại khi có mạng.",
        true
      );
    }
  );
}

// Tải SDK Firebase (dùng dynamic import nên không cần thêm <script> nào
// trong index.html) và gắn các sự kiện đăng nhập/đăng xuất. Nếu có lỗi (ví
// dụ đang mở file trực tiếp bằng file:// thay vì qua server, hoặc mất mạng),
// app vẫn dùng được bình thường với localStorage - chỉ tính năng đồng bộ bị tắt.
async function initFirebase() {
  try {
    const { initializeApp } = await import(
      `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`
    );
    const authModule = await import(
      `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`
    );
    const firestoreModule = await import(
      `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`
    );

    const app = initializeApp(firebaseConfig);
    firebaseAuth = authModule.getAuth(app);
    firebaseDb = firestoreModule.getFirestore(app);
    firestoreFns = firestoreModule;
    firebaseReady = true;

    authModule.onAuthStateChanged(firebaseAuth, handleAuthChange);

    loginBtn.addEventListener("click", () => {
      const provider = new authModule.GoogleAuthProvider();
      authModule.signInWithPopup(firebaseAuth, provider).catch((error) => {
        if (
          error.code === "auth/popup-blocked" ||
          error.code === "auth/operation-not-supported-in-this-environment"
        ) {
          // Trình duyệt (thường gặp trên điện thoại) chặn popup -> chuyển
          // sang cách đăng nhập bằng chuyển hướng trang (redirect)
          authModule.signInWithRedirect(firebaseAuth, provider);
        } else if (
          error.code !== "auth/cancelled-popup-request" &&
          error.code !== "auth/popup-closed-by-user"
        ) {
          alert("Đăng nhập thất bại: " + error.message);
        }
      });
    });

    logoutBtn.addEventListener("click", () => {
      authModule.signOut(firebaseAuth);
    });

    // Xử lý kết quả của luồng đăng nhập bằng redirect ở trên (nếu có) -
    // onAuthStateChanged phía trên sẽ tự nhận được user sau bước này
    try {
      await authModule.getRedirectResult(firebaseAuth);
    } catch (error) {
      console.warn("Không lấy được kết quả đăng nhập redirect:", error);
    }
  } catch (error) {
    console.warn("Không khởi tạo được Firebase - app vẫn hoạt động bình thường với localStorage.", error);
  }
}

// ============================================================
// KHỞI TẠO KHI TẢI TRANG
// ============================================================

renderDeckSelect();
renderCard();
speakCurrentWord();
initFirebase();
