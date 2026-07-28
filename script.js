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
    return JSON.parse(saved);
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
  writeStateToCloud(state);
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
// saveAppState() (định nghĩa ở trên) gọi writeStateToCloud() - hàm đó đọc
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
let firestoreDocRef = null;
let currentUser = null;
let unsubscribeSnapshot = null;
let firebaseReady = false;
let lastWriteId = null;

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

// Đọc to từ tiếng Trung bằng giọng đọc có sẵn của trình duyệt
function speakCurrentWord() {
  if (cards.length === 0) return;
  if (!("speechSynthesis" in window)) return; // trình duyệt không hỗ trợ thì bỏ qua

  const text = cards[currentIndex].hanzi;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";

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
//     thời được ghi thêm lên Firestore (writeStateToCloud - gọi ở cuối
//     saveAppState() phía trên). Khi mở app trên thiết bị khác và đăng nhập
//     cùng tài khoản Google, dữ liệu trên Firestore được tải về và thay thế
//     dữ liệu cục bộ (xem applyRemoteState).
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

// (Các biến firebaseAuth/firebaseDb/firestoreFns/firestoreDocRef/currentUser/
// unsubscribeSnapshot/firebaseReady/lastWriteId đã được khai báo sớm hơn ở
// phần "TRẠNG THÁI ĐỒNG BỘ FIREBASE" phía trên, ngay trước loadAppState())

let syncStatusHideTimer = null;
function showSyncStatus(text) {
  syncStatusEl.textContent = text;
  syncStatusEl.hidden = false;
  if (syncStatusHideTimer) clearTimeout(syncStatusHideTimer);
  syncStatusHideTimer = setTimeout(() => {
    syncStatusEl.hidden = true;
  }, 2500);
}

// Ghi state hiện tại lên Firestore (bỏ qua nếu chưa đăng nhập/Firebase chưa sẵn sàng)
function writeStateToCloud(state) {
  if (!firebaseReady || !currentUser || !firestoreDocRef || !firestoreFns) return;

  const syncId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  lastWriteId = syncId;

  const { setDoc } = firestoreFns;
  showSyncStatus("⏳ Đang đồng bộ...");
  setDoc(firestoreDocRef, {
    activeDeckId: state.activeDeckId,
    decks: state.decks,
    _syncId: syncId
  })
    .then(() => showSyncStatus("☁️ Đã đồng bộ"))
    .catch((error) => {
      console.warn("Lỗi đồng bộ lên Firestore:", error);
      showSyncStatus("⚠️ Chưa đồng bộ được lên đám mây");
    });
}

// Áp dụng dữ liệu tải từ Firestore vào app (khi vừa đăng nhập, hoặc khi một
// thiết bị khác vừa thay đổi dữ liệu). Không gọi speakCurrentWord() ở đây vì
// việc dữ liệu bất chợt cập nhật (do thiết bị khác) không nên tự phát âm thanh.
function applyRemoteState(data) {
  appState = {
    activeDeckId: data.activeDeckId,
    decks: Array.isArray(data.decks) ? data.decks : []
  };

  if (!getActiveDeck() && appState.decks.length > 0) {
    appState.activeDeckId = appState.decks[0].id;
  }

  cards = getActiveDeck() ? getActiveDeck().cards : [];
  currentIndex = 0;
  isFlipped = false;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (error) {
    // Bỏ qua - dữ liệu vẫn còn nguyên trên Firestore, không mất gì
  }
  updateStorageWarning(appState);

  renderDeckSelect();
  renderCard();
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
    firestoreDocRef = null;
    return;
  }

  loginBtn.hidden = true;
  authUserEl.hidden = false;
  authAvatarEl.src = user.photoURL || "";
  authNameEl.textContent = user.displayName || user.email || "";

  const { doc, getDoc, onSnapshot } = firestoreFns;
  firestoreDocRef = doc(firebaseDb, "users", user.uid);

  showSyncStatus("⏳ Đang tải dữ liệu...");

  try {
    const snap = await getDoc(firestoreDocRef);
    const data = snap.exists() ? snap.data() : null;

    if (data && Array.isArray(data.decks) && data.decks.length > 0) {
      // Tài khoản này đã có dữ liệu trên đám mây (ví dụ đã đăng nhập từ máy
      // khác trước đó) -> tải về, thay thế dữ liệu đang có trên máy này
      applyRemoteState(data);
    } else {
      // Lần đầu đăng nhập bằng tài khoản này, đám mây chưa có gì -> đẩy dữ
      // liệu hiện có trên máy này (kể cả bộ thẻ mẫu) lên làm dữ liệu gốc
      writeStateToCloud(appState);
    }
    showSyncStatus("☁️ Đã đồng bộ");
  } catch (error) {
    console.warn("Lỗi tải dữ liệu từ Firestore:", error);
    showSyncStatus("⚠️ Không tải được dữ liệu đám mây - đang dùng dữ liệu trên máy");
  }

  // Lắng nghe thay đổi xảy ra trên CÁC THIẾT BỊ KHÁC (đăng nhập cùng tài
  // khoản) để tự động cập nhật ngay cả khi app đang mở sẵn ở đây
  unsubscribeSnapshot = onSnapshot(
    firestoreDocRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      // _syncId trùng với lần ghi gần nhất của CHÍNH máy này -> đây chỉ là
      // xác nhận (ack) của thao tác vừa lưu, không phải thay đổi từ nơi
      // khác -> bỏ qua để tránh tự reset về thẻ đầu tiên khi đang xem dở
      if (data._syncId && data._syncId === lastWriteId) return;
      if (snap.metadata.hasPendingWrites) return;

      applyRemoteState(data);
    },
    (error) => {
      console.warn("Mất kết nối đồng bộ Firestore:", error);
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
