// Danh sách 5 thẻ từ vựng mẫu
// Mỗi thẻ có thêm "example" là 1 câu ví dụ ngắn dùng từ đó.
// Muốn thêm/sửa câu ví dụ cho từ nào, chỉ cần sửa object "example" của từ đó.
const cards = [
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
];

let currentIndex = 0;
let isFlipped = false;

const cardEl = document.getElementById("card");
const cardContentEl = document.getElementById("cardContent");
const counterEl = document.getElementById("counter");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const speakBtn = document.getElementById("speakBtn");

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

// Hiển thị thẻ hiện tại (mặt trước hoặc mặt sau tùy isFlipped)
function renderCard() {
  const card = cards[currentIndex];

  if (isFlipped) {
    cardContentEl.innerHTML = `
      <p class="meaning">${card.meaning}</p>
      <div class="example">
        <p class="example-hanzi">${card.example.hanzi}</p>
        <p class="example-pinyin">${renderPinyinByTone(card.example.pinyin)}</p>
        <p class="example-meaning">${card.example.meaning}</p>
      </div>
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
  if (!("speechSynthesis" in window)) return; // trình duyệt không hỗ trợ thì bỏ qua

  const text = cards[currentIndex].hanzi;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";

  window.speechSynthesis.cancel(); // dừng giọng đọc đang phát (nếu có) trước khi đọc câu mới
  window.speechSynthesis.speak(utterance);
}

// Lật thẻ khi bấm vào
cardEl.addEventListener("click", () => {
  isFlipped = !isFlipped;
  renderCard();
});

// Chuyển sang thẻ tiếp theo
nextBtn.addEventListener("click", () => {
  currentIndex = (currentIndex + 1) % cards.length;
  isFlipped = false;
  renderCard();
  speakCurrentWord();
});

// Quay lại thẻ trước đó
prevBtn.addEventListener("click", () => {
  currentIndex = (currentIndex - 1 + cards.length) % cards.length;
  isFlipped = false;
  renderCard();
  speakCurrentWord();
});

// Đọc lại từ hiện tại theo yêu cầu
speakBtn.addEventListener("click", speakCurrentWord);

// Khởi tạo khi tải trang
renderCard();
speakCurrentWord();
