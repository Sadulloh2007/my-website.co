// Инициализация темы
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-theme', savedTheme);
}

// Переключатель темы
document.getElementById('theme-toggle').addEventListener('click', () => {
  const currentTheme = document.body.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
});

// Конфигурация API (прямые URL)
const BINANCE_API = 'https://api.binance.com/api/v3';
const CBR_API     = 'https://www.cbr-xml-daily.ru/daily_json.js';
const NBT_API     = 'https://nbt.tj/api/exchange';

// Проверяем, что не запущено по file://
if (window.location.protocol === 'file:') {
  console.warn('Запустите проект через HTTP (например: python3 -m http.server), иначе CORS-блокировка для NBT API.');
}

// Получение курсов с обработкой ошибок для мобильных устройств
async function fetchRates() {
  try {
    // Добавляем индикатор загрузки для мобильных устройств
    const rateElements = document.querySelectorAll('.rate');
    rateElements.forEach(el => {
      el.textContent = '...';
      el.style.color = '';
    });

    // Binance и ЦБ РФ
    const [binRes, cbrRes] = await Promise.all([
      fetch(`${BINANCE_API}/ticker/bookTicker?symbol=USDTRUB`),
      fetch(CBR_API)
    ]);

    if (!binRes.ok) throw new Error(`Binance: HTTP ${binRes.status}`);
    if (!cbrRes.ok) throw new Error(`CBR: HTTP ${cbrRes.status}`);

    const binData = await binRes.json();
    const { bidPrice: usdtBuy, askPrice: usdtSell } = binData;

    const cbrText = await cbrRes.text();
    const cbr = JSON.parse(cbrText);

    // Прямая попытка получить NBT (может заблокировать CORS)
    let smnToUsd;
    try {
      const nbtRes = await fetch(NBT_API, {
        // Используем mode: 'no-cors' как запасной вариант для мобильных
        ...(isMobileDevice() ? { mode: 'no-cors' } : {})
      });
      if (!nbtRes.ok) throw new Error(`NBT: HTTP ${nbtRes.status}`);
      const nbtJson = await nbtRes.json();
      const nbtList = Array.isArray(nbtJson) ? nbtJson : (nbtJson.rates || []);
      smnToUsd = nbtList.find(c => c.code === 'USD')?.buy;
      if (!smnToUsd) throw new Error('NBT: USD не найден');
    } catch (e) {
      console.warn('Не удалось получить курс SMN из NBT API, используем запасной (10.5):', e);
      smnToUsd = 10.5;  // запасное значение
    }

    // Расчёт курсов
    const usdToRub = cbr.Valute.USD.Value;
    const smnToRub = (1 / smnToUsd) * usdToRub;

    return {
      USDT: { buy: parseFloat(usdtBuy), sell: parseFloat(usdtSell) },
      USD:  { buy: usdToRub * 1.02, sell: usdToRub * 0.98 },
      EUR:  { buy: cbr.Valute.EUR.Value * 1.02, sell: cbr.Valute.EUR.Value * 0.98 },
      SMN:  { buy: smnToRub * 0.97, sell: smnToRub * 1.03 }
    };

  } catch (error) {
    console.error('fetchRates failed:', error);
    showError(error.message);
    return null;
  }
}

// Проверка мобильного устройства для оптимизации запросов
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Показать ошибку (ставим «—» и красим)
function showError(message) {
  const errorElements = document.querySelectorAll('.rate');
  errorElements.forEach(el => {
    el.textContent = '—';
    el.style.color = '#ef4444';
  });
  
  // Для мобильных устройств показываем более информативное сообщение
  if (isMobileDevice()) {
    // Показываем оповещение только если не в режиме тихого обновления
    if (!message.includes('silent')) {
      alert('Не удалось получить курсы валют. Пожалуйста, проверьте подключение к интернету.');
    }
  }
  
  console.error(message);
}

// Обновление курсов на странице
async function updateRates(silent = false) {
  try {
    // Добавляем анимацию кнопки обновления
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn.classList.add('rotate');
    
    const rates = await fetchRates();
    if (!rates) {
      refreshBtn.classList.remove('rotate');
      return;
    }

    Object.entries(rates).forEach(([currency, data]) => {
      const buyElem = document.getElementById(`${currency.toLowerCase()}-buy`);
      const sellElem = document.getElementById(`${currency.toLowerCase()}-sell`);
      if (!buyElem || !sellElem) return;

      buyElem.textContent = data.buy.toFixed(2);
      sellElem.textContent = data.sell.toFixed(2);
      buyElem.style.color = '';
      sellElem.style.color = '';

      [buyElem, sellElem].forEach(el => {
        el.classList.add('updated');
        setTimeout(() => el.classList.remove('updated'), 500);
      });
    });

    // Обновляем конвертер
    convertCurrency();
    
    // Останавливаем анимацию кнопки
    setTimeout(() => {
      refreshBtn.classList.remove('rotate');
    }, 600);
    
  } catch (error) {
    showError(silent ? 'silent error' : error.message);
  }
}

// Конвертация валют
function convertCurrency() {
  const rates = {
    USDT: parseFloat(document.getElementById('usdt-buy').textContent) || 0,
    USD: parseFloat(document.getElementById('usd-buy').textContent) || 0,
    EUR: parseFloat(document.getElementById('eur-buy').textContent) || 0,
    SMN: parseFloat(document.getElementById('smn-buy').textContent) || 0,
    RUB: 1
  };
  
  const amount = parseFloat(document.getElementById('amount').value) || 0;
  const from = document.getElementById('from-currency').value;
  const to = document.getElementById('to-currency').value;

  if (rates[from] && rates[to] && amount > 0) {
    const result = (amount * rates[from]) / rates[to];
    document.getElementById('result').value = result.toLocaleString('ru-RU', {
      maximumFractionDigits: 2
    });
  }
}

// Обработчики событий
document.getElementById('swap-currencies').addEventListener('click', () => {
  const from = document.getElementById('from-currency');
  const to = document.getElementById('to-currency');
  [from.value, to.value] = [to.value, from.value];
  convertCurrency();
  const btn = document.getElementById('swap-currencies');
  btn.classList.add('rotate');
  setTimeout(() => btn.classList.remove('rotate'), 600);
});

// Добавляем обработчики с проверкой на мобильные устройства
function setupEventListeners() {
  // Общие обработчики
  document.getElementById('amount').addEventListener('input', convertCurrency);
  document.getElementById('from-currency').addEventListener('change', convertCurrency);
  document.getElementById('to-currency').addEventListener('change', convertCurrency);
  document.getElementById('refresh-btn').addEventListener('click', () => updateRates());
  
  // Оптимизация для мобильных устройств - добавляем debounce для input
  if (isMobileDevice()) {
    const amountInput = document.getElementById('amount');
    let debounceTimeout;
    
    amountInput.addEventListener('input', () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(convertCurrency, 300);
    });
  }

  // Добавляем обработчик ориентации для мобильных устройств
  if (isMobileDevice()) {
    window.addEventListener('orientationchange', () => {
      // Небольшая задержка для завершения изменения ориентации
      setTimeout(() => {
        adjustMobileLayout();
      }, 200);
    });
  }
}

// Оптимизация для мобильных устройств при изменении ориентации
function adjustMobileLayout() {
  const isLandscape = window.innerWidth > window.innerHeight;
  const gridContainer = document.querySelector('.currencies-grid');
  
  if (isLandscape && window.innerWidth < 1024) {
    gridContainer.style.gridTemplateColumns = 'repeat(4, 1fr)';
  } else if (window.innerWidth < 768) {
    gridContainer.style.gridTemplateColumns = 'repeat(1, 1fr)';
  } else if (window.innerWidth < 1024) {
    gridContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
  } else {
    gridContainer.style.gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
  }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  adjustMobileLayout(); // Начальная настройка макета
  updateRates();
  
  // Оптимизация интервала обновления для мобильных
  const updateInterval = isMobileDevice() ? 600000 : 300000; // 10 мин для мобильных, 5 мин для десктопов
  setInterval(() => updateRates(true), updateInterval);
});