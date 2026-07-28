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
const deckSelectEl = document.getElementById("deckSelect");
const deckSelectWrap = document.getElementById("deckSelectWrap");
const newDeckBtn = document.getElementById("newDeckBtn");
const deleteDeckBtn = document.getElementById("deleteDeckBtn");
const deckDeletePopover = document.getElementById("deckDeletePopover");
const storageWarningEl = document.getElementById("storageWarning");

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

  counterEl.textContent = `${currentIndex + 1} / ${cards.length}`;
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

// Chuyển sang bộ thẻ khác khi chọn trong dropdown
deckSelectEl.addEventListener("change", (event) => {
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

// Tạo bộ thẻ mới (rỗng), rồi chuyển sang bộ đó luôn
newDeckBtn.addEventListener("click", () => {
  const name = prompt("Nhập tên bộ thẻ mới:");
  if (!name || !name.trim()) return; // người dùng bấm Cancel hoặc để trống tên

  const newDeck = { id: generateDeckId(), name: name.trim(), cards: [] };
  appState.decks.push(newDeck);
  appState.activeDeckId = newDeck.id;
  cards = newDeck.cards;
  currentIndex = 0;
  isFlipped = false;

  saveAppState(appState);
  renderDeckSelect();
  renderCard();
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

// ============================================================
// THÊM / SỬA / XÓA TỪNG THẺ BẰNG TAY (áp dụng cho bộ thẻ đang chọn)
// ============================================================

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
// KHỞI TẠO KHI TẢI TRANG
// ============================================================

renderDeckSelect();
renderCard();
speakCurrentWord();
