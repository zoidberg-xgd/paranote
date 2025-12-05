/**
 * browser-forge.js - 智能浏览器指纹生成器
 * 
 * 模仿 browserforge 的方法，生成真实的浏览器指纹和 HTTP 头
 * 用于绕过反爬虫检测
 */

// 支持的浏览器配置
const BROWSERS = {
  chrome: {
    name: 'Chrome',
    versions: [120, 121, 122, 123, 124, 125],
    weight: 0.65, // 市场份额权重
  },
  firefox: {
    name: 'Firefox',
    versions: [121, 122, 123, 124, 125],
    weight: 0.08,
  },
  safari: {
    name: 'Safari',
    versions: [16, 17],
    weight: 0.18,
  },
  edge: {
    name: 'Edge',
    versions: [120, 121, 122, 123, 124],
    weight: 0.09,
  },
};

// 支持的操作系统
const OPERATING_SYSTEMS = {
  windows: {
    name: 'Windows',
    versions: ['10.0', '11.0'],
    weight: 0.72,
    platform: 'Win32',
  },
  macos: {
    name: 'macOS',
    versions: ['10_15_7', '11_0', '12_0', '13_0', '14_0'],
    weight: 0.16,
    platform: 'MacIntel',
  },
  linux: {
    name: 'Linux',
    versions: ['x86_64'],
    weight: 0.03,
    platform: 'Linux x86_64',
  },
  android: {
    name: 'Android',
    versions: ['12', '13', '14'],
    weight: 0.06,
    platform: 'Linux armv8l',
  },
  ios: {
    name: 'iOS',
    versions: ['16_0', '17_0'],
    weight: 0.03,
    platform: 'iPhone',
  },
};

// 设备类型
const DEVICES = {
  desktop: { weight: 0.58 },
  mobile: { weight: 0.42 },
};

// 语言配置
const LOCALES = [
  'en-US',
  'en-GB',
  'zh-CN',
  'zh-TW',
  'ja-JP',
  'ko-KR',
  'de-DE',
  'fr-FR',
  'es-ES',
  'ru-RU',
];

// 屏幕分辨率
const SCREEN_RESOLUTIONS = {
  desktop: [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 2560, height: 1440 },
    { width: 1280, height: 720 },
  ],
  mobile: [
    { width: 390, height: 844 },
    { width: 393, height: 873 },
    { width: 412, height: 915 },
    { width: 360, height: 800 },
    { width: 414, height: 896 },
  ],
};

/**
 * 基于权重的随机选择
 */
function weightedRandom(items) {
  const weights = Object.values(items).map(i => i.weight || 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  
  const keys = Object.keys(items);
  for (let i = 0; i < keys.length; i++) {
    random -= items[keys[i]].weight || 1;
    if (random <= 0) {
      return { key: keys[i], value: items[keys[i]] };
    }
  }
  return { key: keys[0], value: items[keys[0]] };
}

/**
 * 随机选择数组元素
 */
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 生成 Chrome User-Agent
 */
function generateChromeUA(version, os, osVersion, device) {
  const webkitVersion = '537.36';
  
  if (os === 'windows') {
    return `Mozilla/5.0 (Windows NT ${osVersion}; Win64; x64) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/${webkitVersion}`;
  } else if (os === 'macos') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${osVersion}) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/${webkitVersion}`;
  } else if (os === 'linux') {
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/${webkitVersion}`;
  } else if (os === 'android') {
    return `Mozilla/5.0 (Linux; Android ${osVersion}; Pixel 7) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${version}.0.0.0 Mobile Safari/${webkitVersion}`;
  } else if (os === 'ios') {
    return `Mozilla/5.0 (iPhone; CPU iPhone OS ${osVersion} like Mac OS X) AppleWebKit/${webkitVersion} (KHTML, like Gecko) CriOS/${version}.0.0.0 Mobile/15E148 Safari/${webkitVersion}`;
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/${webkitVersion}`;
}

/**
 * 生成 Firefox User-Agent
 */
function generateFirefoxUA(version, os, osVersion, device) {
  if (os === 'windows') {
    return `Mozilla/5.0 (Windows NT ${osVersion}; Win64; x64; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
  } else if (os === 'macos') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${osVersion}; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
  } else if (os === 'linux') {
    return `Mozilla/5.0 (X11; Linux x86_64; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
  } else if (os === 'android') {
    return `Mozilla/5.0 (Android ${osVersion}; Mobile; rv:${version}.0) Gecko/${version}.0 Firefox/${version}.0`;
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`;
}

/**
 * 生成 Safari User-Agent
 */
function generateSafariUA(version, os, osVersion, device) {
  const webkitVersion = '605.1.15';
  
  if (os === 'macos') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${osVersion}) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Version/${version}.0 Safari/${webkitVersion}`;
  } else if (os === 'ios') {
    return `Mozilla/5.0 (iPhone; CPU iPhone OS ${osVersion} like Mac OS X) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Version/${version}.0 Mobile/15E148 Safari/${webkitVersion}`;
  }
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Version/${version}.0 Safari/${webkitVersion}`;
}

/**
 * 生成 Edge User-Agent
 */
function generateEdgeUA(version, os, osVersion, device) {
  const webkitVersion = '537.36';
  const chromeVersion = version;
  
  if (os === 'windows') {
    return `Mozilla/5.0 (Windows NT ${osVersion}; Win64; x64) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/${webkitVersion} Edg/${version}.0.0.0`;
  } else if (os === 'macos') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${osVersion}) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/${webkitVersion} Edg/${version}.0.0.0`;
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/${webkitVersion} Edg/${version}.0.0.0`;
}

/**
 * 生成 User-Agent
 */
function generateUserAgent(browser, version, os, osVersion, device) {
  switch (browser) {
    case 'chrome':
      return generateChromeUA(version, os, osVersion, device);
    case 'firefox':
      return generateFirefoxUA(version, os, osVersion, device);
    case 'safari':
      return generateSafariUA(version, os, osVersion, device);
    case 'edge':
      return generateEdgeUA(version, os, osVersion, device);
    default:
      return generateChromeUA(version, os, osVersion, device);
  }
}

/**
 * 生成 sec-ch-ua 头
 */
function generateSecChUa(browser, version) {
  if (browser === 'chrome') {
    return `"Chromium";v="${version}", "Not(A:Brand";v="24", "Google Chrome";v="${version}"`;
  } else if (browser === 'edge') {
    return `"Chromium";v="${version}", "Not(A:Brand";v="24", "Microsoft Edge";v="${version}"`;
  }
  return '';
}

/**
 * 生成 Accept-Language 头
 */
function generateAcceptLanguage(locale) {
  const primary = locale;
  const lang = locale.split('-')[0];
  
  if (primary === lang) {
    return `${primary};q=1.0`;
  }
  return `${primary};q=1.0, ${lang};q=0.9`;
}

/**
 * 生成完整的 HTTP 头
 */
function generateHeaders(options = {}) {
  const {
    browser: browserOpt,
    os: osOpt,
    device: deviceOpt,
    locale: localeOpt,
  } = options;

  // 选择浏览器
  const browserChoice = browserOpt 
    ? { key: browserOpt, value: BROWSERS[browserOpt] }
    : weightedRandom(BROWSERS);
  const browser = browserChoice.key;
  const browserVersion = randomChoice(browserChoice.value.versions);

  // 选择操作系统
  let osChoice;
  if (osOpt) {
    osChoice = { key: osOpt, value: OPERATING_SYSTEMS[osOpt] };
  } else {
    // Safari 只能在 macOS/iOS
    if (browser === 'safari') {
      osChoice = Math.random() > 0.3 
        ? { key: 'macos', value: OPERATING_SYSTEMS.macos }
        : { key: 'ios', value: OPERATING_SYSTEMS.ios };
    } else {
      osChoice = weightedRandom(OPERATING_SYSTEMS);
    }
  }
  const os = osChoice.key;
  const osVersion = randomChoice(osChoice.value.versions);

  // 选择设备类型
  const device = deviceOpt || (os === 'android' || os === 'ios' ? 'mobile' : 'desktop');

  // 选择语言
  const locale = localeOpt || randomChoice(LOCALES);

  // 生成 User-Agent
  const userAgent = generateUserAgent(browser, browserVersion, os, osVersion, device);

  // 构建 HTTP 头
  const headers = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': generateAcceptLanguage(locale),
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  };

  // Chromium 特有的头
  if (browser === 'chrome' || browser === 'edge') {
    headers['sec-ch-ua'] = generateSecChUa(browser, browserVersion);
    headers['sec-ch-ua-mobile'] = device === 'mobile' ? '?1' : '?0';
    headers['sec-ch-ua-platform'] = `"${OPERATING_SYSTEMS[os].name}"`;
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = 'none';
    headers['Sec-Fetch-User'] = '?1';
  }

  return {
    headers,
    fingerprint: {
      browser,
      browserVersion,
      os,
      osVersion,
      device,
      locale,
      userAgent,
    },
  };
}

/**
 * 生成浏览器指纹
 */
function generateFingerprint(options = {}) {
  const { headers, fingerprint } = generateHeaders(options);
  const { device, os, browser, browserVersion } = fingerprint;

  // 屏幕分辨率
  const resolution = randomChoice(SCREEN_RESOLUTIONS[device] || SCREEN_RESOLUTIONS.desktop);

  // Navigator 属性
  const navigator = {
    userAgent: fingerprint.userAgent,
    language: fingerprint.locale,
    languages: [fingerprint.locale, fingerprint.locale.split('-')[0]],
    platform: OPERATING_SYSTEMS[os].platform,
    hardwareConcurrency: randomChoice([2, 4, 6, 8, 12, 16]),
    deviceMemory: randomChoice([2, 4, 8, 16]),
    maxTouchPoints: device === 'mobile' ? randomChoice([1, 5, 10]) : 0,
    webdriver: false,
    cookieEnabled: true,
    doNotTrack: null,
  };

  // Screen 属性
  const screen = {
    width: resolution.width,
    height: resolution.height,
    availWidth: resolution.width,
    availHeight: resolution.height - (device === 'desktop' ? randomChoice([30, 40, 50]) : 0),
    colorDepth: 24,
    pixelDepth: 24,
    devicePixelRatio: device === 'mobile' ? randomChoice([2, 3]) : randomChoice([1, 1.25, 1.5, 2]),
  };

  // WebGL 信息
  const webgl = {
    vendor: browser === 'firefox' ? 'Mozilla' : 'Google Inc.',
    renderer: randomChoice([
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0)',
      'Apple GPU',
      'Mali-G78',
    ]),
  };

  // 时区
  const timezone = {
    offset: randomChoice([-480, -420, -360, -300, -240, 0, 60, 120, 480, 540]),
    name: randomChoice(['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Shanghai', 'Asia/Tokyo']),
  };

  return {
    headers,
    navigator,
    screen,
    webgl,
    timezone,
    fingerprint,
  };
}

/**
 * 生成 Puppeteer 启动参数
 */
function generatePuppeteerArgs(fingerprint) {
  const { screen, navigator, timezone } = fingerprint;
  
  return [
    `--window-size=${screen.width},${screen.height}`,
    `--lang=${navigator.language}`,
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
    '--disable-web-security',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
  ];
}

/**
 * 生成 Puppeteer 页面注入脚本
 */
function generateInjectionScript(fingerprint) {
  const { navigator: nav, screen: scr, webgl, timezone } = fingerprint;
  
  return `
    // Override navigator properties
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ${JSON.stringify(nav.languages)} });
    Object.defineProperty(navigator, 'platform', { get: () => '${nav.platform}' });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${nav.hardwareConcurrency} });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => ${nav.deviceMemory} });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => ${nav.maxTouchPoints} });
    
    // Override screen properties
    Object.defineProperty(screen, 'width', { get: () => ${scr.width} });
    Object.defineProperty(screen, 'height', { get: () => ${scr.height} });
    Object.defineProperty(screen, 'availWidth', { get: () => ${scr.availWidth} });
    Object.defineProperty(screen, 'availHeight', { get: () => ${scr.availHeight} });
    Object.defineProperty(screen, 'colorDepth', { get: () => ${scr.colorDepth} });
    Object.defineProperty(screen, 'pixelDepth', { get: () => ${scr.pixelDepth} });
    Object.defineProperty(window, 'devicePixelRatio', { get: () => ${scr.devicePixelRatio} });
    
    // Override WebGL
    const getParameterProxyHandler = {
      apply: function(target, thisArg, args) {
        const param = args[0];
        const gl = thisArg;
        if (param === 37445) return '${webgl.vendor}';
        if (param === 37446) return '${webgl.renderer}';
        return Reflect.apply(target, thisArg, args);
      }
    };
    
    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = new Proxy(originalGetParameter, getParameterProxyHandler);
    
    if (typeof WebGL2RenderingContext !== 'undefined') {
      const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = new Proxy(originalGetParameter2, getParameterProxyHandler);
    }
    
    // Override timezone
    const originalDateTimeFormat = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function(locales, options) {
      options = options || {};
      options.timeZone = options.timeZone || '${timezone.name}';
      return new originalDateTimeFormat(locales, options);
    };
    
    // Override Date.prototype.getTimezoneOffset
    Date.prototype.getTimezoneOffset = function() {
      return ${timezone.offset};
    };
    
    // Remove automation indicators
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    
    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
    
    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ];
        plugins.length = 3;
        return plugins;
      }
    });
    
    console.log('[BrowserForge] Fingerprint injected');
  `;
}

export {
  generateHeaders,
  generateFingerprint,
  generatePuppeteerArgs,
  generateInjectionScript,
  BROWSERS,
  OPERATING_SYSTEMS,
  DEVICES,
  LOCALES,
};
