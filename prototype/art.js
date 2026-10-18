// 原创卡通形象和图形，全部是代码画的 SVG，不用外部图片。
(function (root) {
  'use strict';
  const INK = '#18173a';

  // 每个角色的长相。jersey/num 为函数时按玩家当前队服取值。
  const LOOKS = {
    me: { skin: '#f6c9a0', hair: '#2a1b12', style: 'spiky', jersey: '#ff7a1a', num: '?' },
    alex: { skin: '#eab38a', hair: '#8a5226', style: 'swoop', band: '#38cfff', jersey: '#2d8cff', num: 5 },
    ben: { skin: '#8a5636', hair: '#1a1210', style: 'curly', jersey: '#31d17c', num: 9 },
    coach: { skin: '#f0c08f', hair: '#3a2a20', style: 'cap', cap: '#ff4d5e', jersey: '#ff7a1a', whistle: true, stache: true },
    mia: { skin: '#f8d2ae', hair: '#6b3a22', style: 'ponytail', bow: '#ff6fb5', jersey: '#ff6fb5', mic: true },
    hawk: { skin: '#d9a37a', hair: '#c22437', style: 'mohawk', jersey: '#ff4d5e', angry: true, num: '' },
  };

  function hair(l) {
    const h = l.hair;
    switch (l.style) {
      case 'spiky':
        return `<path d="M22 44 L20 24 L30 30 L32 12 L42 24 L50 8 L56 24 L68 12 L68 30 L80 24 L78 44 Q66 30 50 31 Q34 30 22 44Z" fill="${h}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
      case 'swoop':
        return `<path d="M21 46 Q17 14 50 13 Q83 14 79 42 Q72 26 46 30 Q30 33 21 46Z" fill="${h}" stroke="${INK}" stroke-width="3"/>
          <path d="M22 37 Q50 27 78 37 L78 43 Q50 33 22 43Z" fill="${l.band}" stroke="${INK}" stroke-width="2.5"/>`;
      case 'curly': {
        let c = '';
        for (const [x, y] of [[26, 32], [33, 21], [43, 15], [54, 14], [65, 18], [73, 27], [77, 37], [23, 41]]) c += `<circle cx="${x}" cy="${y}" r="9" fill="${h}" stroke="${INK}" stroke-width="3"/>`;
        return c + `<path d="M24 40 Q50 18 76 40 Q50 28 24 40Z" fill="${h}"/>`;
      }
      case 'cap':
        return `<path d="M21 40 Q22 11 50 11 Q78 11 79 40 Z" fill="${l.cap}" stroke="${INK}" stroke-width="3"/>
          <path d="M60 37 Q82 34 94 40 Q90 46 66 44 Z" fill="${l.cap}" stroke="${INK}" stroke-width="3"/>
          <circle cx="50" cy="12" r="3" fill="${INK}"/>
          <text x="46" y="32" font-family="Lilita One, Arial Rounded MT Bold, sans-serif" font-size="13" fill="#fff" text-anchor="middle">S</text>`;
      case 'ponytail':
        return `<ellipse cx="83" cy="42" rx="9" ry="17" fill="${l.hair}" stroke="${INK}" stroke-width="3"/>
          <path d="M21 46 Q18 13 50 13 Q82 13 79 46 Q72 28 50 27 Q30 27 21 46Z" fill="${h}" stroke="${INK}" stroke-width="3"/>
          <path d="M74 24 l10 -8 l2 12 Z M74 24 l-2 -12 l12 4 Z" fill="${l.bow}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
      case 'mohawk':
        return `<path d="M42 30 L40 6 L50 12 L54 4 L60 12 L58 30 Z" fill="${h}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
      default:
        return '';
    }
  }

  function faceInner(id, opts) {
    const l = Object.assign({}, LOOKS[id] || LOOKS.me, opts || {});
    const eyes = l.angry
      ? `<path d="M33 38 L46 43 M67 38 L54 43" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`
      : `<path d="M34 38 Q40 34 46 38 M54 38 Q60 34 66 38" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    const num = l.num === '' || l.num == null ? '' : `<text x="50" y="97" text-anchor="middle" font-family="Lilita One, Arial Rounded MT Bold, sans-serif" font-size="15" fill="#fff" stroke="${INK}" stroke-width="1">${l.num}</text>`;
    return `
      <path d="M12 102 Q14 76 50 73 Q86 76 88 102 Z" fill="${l.jersey}" stroke="${INK}" stroke-width="3"/>
      <path d="M38 74 Q50 86 62 74" fill="none" stroke="#fff" stroke-width="3"/>
      ${num}
      ${l.whistle ? `<path d="M40 76 Q50 90 60 76" fill="none" stroke="#fff" stroke-width="1.5"/><rect x="54" y="84" width="10" height="7" rx="2" fill="#c9ced8" stroke="${INK}" stroke-width="2"/>` : ''}
      <circle cx="22" cy="49" r="7" fill="${l.skin}" stroke="${INK}" stroke-width="3"/>
      <circle cx="78" cy="49" r="7" fill="${l.skin}" stroke="${INK}" stroke-width="3"/>
      <circle cx="50" cy="46" r="29" fill="${l.skin}" stroke="${INK}" stroke-width="3"/>
      ${hair(l)}
      ${eyes}
      <ellipse cx="40" cy="47" rx="4.2" ry="5.6" fill="${INK}"/><circle cx="41.6" cy="45" r="1.6" fill="#fff"/>
      <ellipse cx="60" cy="47" rx="4.2" ry="5.6" fill="${INK}"/><circle cx="61.6" cy="45" r="1.6" fill="#fff"/>
      <circle cx="32" cy="57" r="4.5" fill="#ff6f8e" opacity=".35"/><circle cx="68" cy="57" r="4.5" fill="#ff6f8e" opacity=".35"/>
      ${l.stache ? `<path d="M40 58 Q50 53 60 58 Q55 61 50 58 Q45 61 40 58Z" fill="${l.hair}" stroke="${INK}" stroke-width="1.5"/>` : ''}
      <path class="m-closed" d="${l.angry ? 'M42 64 Q50 60 58 64' : 'M41 61 Q50 69 59 61'}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
      <ellipse class="m-open" cx="50" cy="64" rx="6.5" ry="5" fill="#8a1d2c" stroke="${INK}" stroke-width="2.5"/>
      ${l.mic ? `<rect x="80" y="64" width="8" height="22" rx="3" fill="${INK}" transform="rotate(-18 84 75)"/><circle cx="80" cy="62" r="7" fill="#9aa3b5" stroke="${INK}" stroke-width="2.5"/>` : ''}`;
  }

  function face(id, opts, cls) {
    return `<svg class="face ${cls || ''}" data-who="${id}" viewBox="0 0 100 100" aria-hidden="true">${faceInner(id, opts)}</svg>`;
  }

  // 球场上的圆形头像令牌（放进球场 SVG 里用）
  function token(id, opts, ring) {
    const l = Object.assign({}, LOOKS[id] || LOOKS.me, opts || {});
    return `<circle r="6.6" fill="${l.jersey}" stroke="${INK}" stroke-width=".9"/>
      <clipPath id="clip-${id}${opts && opts.key ? opts.key : ''}"><circle r="6"/></clipPath>
      <g clip-path="url(#clip-${id}${opts && opts.key ? opts.key : ''})"><g transform="translate(-6.5 -5.8) scale(.13)">${faceInner(id, Object.assign({}, opts, { num: '' }))}</g></g>
      ${ring ? `<circle class="ring" r="8.6" fill="none" stroke="#ffd23f" stroke-width="1.4"/>` : ''}`;
  }

  function badge(name, primary) {
    const initial = (name || 'S').trim().charAt(0).toUpperCase();
    return `<svg viewBox="0 0 100 112" aria-label="队徽">
      <path d="M50 4 L92 18 L88 70 Q82 96 50 108 Q18 96 12 70 L8 18 Z" fill="${primary || '#ff7a1a'}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M50 14 L82 25 L79 68 Q74 88 50 98 Q26 88 21 68 L18 25 Z" fill="#ffd23f" stroke="${INK}" stroke-width="3"/>
      <circle cx="50" cy="56" r="24" fill="#ff7a1a" stroke="${INK}" stroke-width="3.5"/>
      <path d="M26 56 H74 M50 32 V80 M33 39 Q45 56 33 73 M67 39 Q55 56 67 73" fill="none" stroke="${INK}" stroke-width="3"/>
      <text x="50" y="66" text-anchor="middle" font-family="Lilita One, Arial Rounded MT Bold, sans-serif" font-size="30" fill="#fff" stroke="${INK}" stroke-width="2">${initial}</text>
    </svg>`;
  }

  function jersey(hex, num, team) {
    return `<svg viewBox="0 0 120 110" width="190" height="174" aria-label="队服">
      <path d="M36 8 L50 4 Q60 16 70 4 L84 8 L112 28 L98 48 L88 40 L88 104 L32 104 L32 40 L22 48 L8 28 Z" fill="${hex}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M50 4 Q60 18 70 4" fill="none" stroke="#fff" stroke-width="4"/>
      <path d="M32 40 L32 104 M88 40 L88 104" stroke="#fff" stroke-width="3" opacity=".6"/>
      <text x="60" y="36" text-anchor="middle" font-family="Lilita One, Arial Rounded MT Bold, sans-serif" font-size="11" fill="#fff" stroke="${INK}" stroke-width=".8">${String(team || '').toUpperCase().slice(0, 14)}</text>
      <text x="60" y="84" text-anchor="middle" font-family="Lilita One, Arial Rounded MT Bold, sans-serif" font-size="44" fill="#fff" stroke="${INK}" stroke-width="2.5">${num}</text>
    </svg>`;
  }

  function star(fill) {
    return `<svg viewBox="0 0 100 110" aria-hidden="true">
      <path d="M50 4 L90 18 L86 66 Q80 92 50 106 Q20 92 14 66 L10 18 Z" fill="${fill}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M50 28 L57 46 L76 47 L61 59 L66 78 L50 67 L34 78 L39 59 L24 47 L43 46 Z" fill="#ffd23f" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    </svg>`;
  }

  const ICONS = {
    ball: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M6 5.5c3 3.5 3 9.5 0 13M18 5.5c-3 3.5-3 9.5 0 13"/></svg>`,
    shirt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M8 3l-5 3 2 5 2-1v11h10V10l2 1 2-5-5-3c-1 2-2.5 3-4 3S9 5 8 3z"/></svg>`,
    chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
    sound: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12"/></svg>`,
    mute: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>`,
  };

  root.Art = { LOOKS, face, faceInner, token, badge, jersey, star, ICONS };
})(typeof self !== 'undefined' ? self : this);
