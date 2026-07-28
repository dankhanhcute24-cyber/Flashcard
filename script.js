// ============================================================
// CẤU HÌNH CHUNG
// ============================================================

const STORAGE_KEY = "flashcardAppData"; // key dùng để lưu toàn bộ dữ liệu app vào localStorage
const MAX_CARDS_PER_DECK = 12000; // số thẻ tối đa cho phép trong 1 bộ thẻ
const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024; // ~5MB - mức giới hạn phổ biến của localStorage trên trình duyệt
const STORAGE_WARNING_RATIO = 0.8; // cảnh báo khi dùng hết 80% giới hạn ước tính ở trên

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
  updateStorageWarning();
}

function getActiveDeck() {
  return appState.decks.find((deck) => deck.id === appState.activeDeckId);
}

function generateDeckId() {
  return "deck_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Ước tính dung lượng đang dùng và hiện cảnh báo nếu gần chạm giới hạn localStorage
function updateStorageWarning() {
  const sizeBytes = new Blob([JSON.stringify(appState)]).size;
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
// TRẠNG THÁI CHÍNH CỦA APP
// ============================================================

let appState = loadAppState();
let cards = getActiveDeck().cards; // luôn trỏ tới mảng thẻ của bộ thẻ đang chọn
let currentIndex = 0;
let isFlipped = false;

const cardEl = document.getElementById("card");
const cardContentEl = document.getElementById("cardContent");
const counterEl = document.getElementById("counter");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const speakBtn = document.getElementById("speakBtn");
const excelFileInput = document.getElementById("excelFile");
const deckSelectEl = document.getElementById("deckSelect");
const newDeckBtn = document.getElementById("newDeckBtn");
const deleteDeckBtn = document.getElementById("deleteDeckBtn");
const storageWarningEl = document.getElementById("storageWarning");

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
  if (cards.length === 0) {
    cardContentEl.innerHTML = `<p class="empty-state">Bộ thẻ này chưa có thẻ nào.<br>Hãy tải file Excel để thêm từ vựng.</p>`;
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

// Xóa bộ thẻ đang chọn (có xác nhận trước khi xóa)
deleteDeckBtn.addEventListener("click", () => {
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

// ============================================================
// TƯƠNG TÁC VỚI THẺ (lật thẻ, chuyển thẻ)
// ============================================================

// Lật thẻ khi bấm vào
cardEl.addEventListener("click", () => {
  isFlipped = !isFlipped;
  renderCard();
});

// Chuyển sang thẻ tiếp theo
nextBtn.addEventListener("click", () => {
  if (cards.length === 0) return;
  currentIndex = (currentIndex + 1) % cards.length;
  isFlipped = false;
  renderCard();
  speakCurrentWord();
});

// Quay lại thẻ trước đó
prevBtn.addEventListener("click", () => {
  if (cards.length === 0) return;
  currentIndex = (currentIndex - 1 + cards.length) % cards.length;
  isFlipped = false;
  renderCard();
  speakCurrentWord();
});

// Đọc lại từ hiện tại theo yêu cầu
speakBtn.addEventListener("click", speakCurrentWord);

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
// KHỞI TẠO KHI TẢI TRANG
// ============================================================

renderDeckSelect();
renderCard();
speakCurrentWord();
