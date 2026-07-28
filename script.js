// Danh sách 5 thẻ từ vựng mẫu
const cards = [
  { hanzi: "你好", pinyin: "nǐ hǎo", meaning: "Xin chào" },
  { hanzi: "谢谢", pinyin: "xiè xiè", meaning: "Cảm ơn" },
  { hanzi: "朋友", pinyin: "péng yǒu", meaning: "Bạn bè" },
  { hanzi: "学习", pinyin: "xué xí", meaning: "Học tập" },
  { hanzi: "水", pinyin: "shuǐ", meaning: "Nước" }
];

let currentIndex = 0;
let isFlipped = false;

const cardEl = document.getElementById("card");
const cardContentEl = document.getElementById("cardContent");
const counterEl = document.getElementById("counter");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const speakBtn = document.getElementById("speakBtn");

// Hiển thị thẻ hiện tại (mặt trước hoặc mặt sau tùy isFlipped)
function renderCard() {
  const card = cards[currentIndex];

  if (isFlipped) {
    cardContentEl.innerHTML = `<p class="meaning">${card.meaning}</p>`;
  } else {
    cardContentEl.innerHTML = `
      <p class="hanzi">${card.hanzi}</p>
      <p class="pinyin">${card.pinyin}</p>
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
