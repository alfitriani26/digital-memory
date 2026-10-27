// Alat kolase untuk tamu: pilih foto, pilih layout, pilih template, lalu unduh hasilnya.
// Semuanya digambar di canvas 1080 x 1350 (rasio 4:5), langsung di browser tanpa server.
// Dipanggil dari guest.js lewat openStudio({ code, info, photos }).

const CW = 1080;
const CH = 1350;
const MAX_PICK = 6;

// ---------- layout: tiap kotak ditulis sebagai [x, y, lebar, tinggi] dalam skala 0 sampai 1 ----------
const LAYOUTS = {
  '1': { label: '1 foto', slots: [[0, 0, 1, 1]] },
  '2v': { label: '2 atas-bawah', slots: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
  '2h': { label: '2 kiri-kanan', slots: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
  '3a': { label: '1 besar + 2', slots: [[0, 0, 1, 0.58], [0, 0.58, 0.5, 0.42], [0.5, 0.58, 0.5, 0.42]] },
  '3s': { label: '3 baris', slots: [[0, 0, 1, 1 / 3], [0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 1 / 3]] },
  '4g': { label: 'Grid 2×2', slots: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  '4s': { label: 'Strip 4 foto', slots: [0, 0.25, 0.5, 0.75].map((y) => [0, y, 1, 0.25]) },
  '5a': { label: '1 besar + 4', slots: [[0, 0, 1, 0.4], [0, 0.4, 0.5, 0.3], [0.5, 0.4, 0.5, 0.3], [0, 0.7, 0.5, 0.3], [0.5, 0.7, 0.5, 0.3]] },
  '6g': { label: 'Grid 2×3', slots: [0, 1 / 3, 2 / 3].flatMap((y) => [[0, y, 0.5, 1 / 3], [0.5, y, 0.5, 1 / 3]]) },
};
const layoutsFor = (n) => Object.keys(LAYOUTS).filter((k) => LAYOUTS[k].slots.length === n);

// ---------- alat gambar kecil ----------
function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function flower(ctx, x, y, r, petal, center) {
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((i * Math.PI) / 3);
    ctx.fillStyle = petal;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.55, r * 0.32, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = center;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function leaf(ctx, x, y, len, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, len, len * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function sparkle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.28;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

function diamond(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}

// ---------- tema bawaan (kunci harus sama dengan THEME_KEYS di server: floral, y2k, cream, elegant) ----------
const THEMES = {
  floral: {
    name: 'Floral',
    text: '#b4566f',
    frame: { color: '#ffffff', border: 12, radius: 18 },
    draw(ctx) {
      const g = ctx.createLinearGradient(0, 0, CW, CH);
      g.addColorStop(0, '#fbe3ea');
      g.addColorStop(1, '#fff6f2');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CW, CH);
      const pink = '#f4b6c8', deep = '#e98aa6', yellow = '#ffd98a', green = '#a9cfa0';
      leaf(ctx, 150, 110, 70, 0.6, green); leaf(ctx, 60, 190, 60, -0.4, green);
      flower(ctx, 90, 90, 80, pink, yellow); flower(ctx, 200, 60, 46, deep, yellow); flower(ctx, 50, 200, 44, deep, yellow);
      leaf(ctx, CW - 150, 110, 70, -0.6, green); leaf(ctx, CW - 60, 190, 60, 0.4, green);
      flower(ctx, CW - 90, 90, 80, pink, yellow); flower(ctx, CW - 200, 60, 46, deep, yellow); flower(ctx, CW - 50, 200, 44, deep, yellow);
      leaf(ctx, 130, CH - 90, 70, -0.6, green);
      flower(ctx, 90, CH - 80, 70, pink, yellow); flower(ctx, 210, CH - 50, 40, deep, yellow);
      leaf(ctx, CW - 130, CH - 90, 70, 0.6, green);
      flower(ctx, CW - 90, CH - 80, 70, pink, yellow); flower(ctx, CW - 210, CH - 50, 40, deep, yellow);
      ctx.strokeStyle = '#e8a0b4';
      ctx.lineWidth = 5;
      roundRect(ctx, 30, 30, CW - 60, CH - 60, 26);
      ctx.stroke();
    },
  },
  y2k: {
    name: 'Y2K',
    text: '#ffffff',
    frame: { color: '#ffffff', border: 14, radius: 30 },
    draw(ctx) {
      const g = ctx.createLinearGradient(0, 0, CW, CH);
      g.addColorStop(0, '#c9b6ff');
      g.addColorStop(0.55, '#ff9bdc');
      g.addColorStop(1, '#8ff0ff');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CW, CH);
      const bubbles = [[130, 120, 70], [950, 200, 50], [90, 1180, 60], [980, 1150, 90], [900, 70, 30], [200, 1290, 34]];
      bubbles.forEach(([x, y, r]) => {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4; ctx.stroke();
      });
      [[60, 340, 34], [1020, 480, 28], [70, 900, 30], [1010, 860, 36], [540, 62, 26], [300, 1250, 26], [800, 1280, 34]].forEach(([x, y, r]) => sparkle(ctx, x, y, r, '#ffffff'));
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10;
      roundRect(ctx, 24, 24, CW - 48, CH - 48, 44); ctx.stroke();
      ctx.strokeStyle = '#ff5cc8'; ctx.lineWidth = 4;
      roundRect(ctx, 42, 42, CW - 84, CH - 84, 34); ctx.stroke();
    },
  },
  cream: {
    name: 'Krem',
    text: '#7a5c36',
    frame: { color: '#ffffff', border: 10, radius: 6 },
    draw(ctx) {
      ctx.fillStyle = '#f6ead7';
      ctx.fillRect(0, 0, CW, CH);
      ctx.strokeStyle = '#b89968'; ctx.lineWidth = 3;
      ctx.strokeRect(30, 30, CW - 60, CH - 60);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(46, 46, CW - 92, CH - 92);
      ctx.fillStyle = '#b89968';
      [[30, 30], [CW - 30, 30], [30, CH - 30], [CW - 30, CH - 30]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = 'rgba(184,153,104,0.35)';
      for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(120 + i * 105, CH - 70, 4, 0, Math.PI * 2); ctx.fill(); }
    },
  },
  elegant: {
    name: 'Elegan',
    text: '#d8b96e',
    frame: { color: '#c9a55c', border: 6, radius: 4 },
    draw(ctx) {
      ctx.fillStyle = '#2b2430';
      ctx.fillRect(0, 0, CW, CH);
      const gold = '#c9a55c';
      ctx.strokeStyle = gold; ctx.lineWidth = 4;
      ctx.strokeRect(30, 30, CW - 60, CH - 60);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(46, 46, CW - 92, CH - 92);
      [[46, 46], [CW - 46, 46], [46, CH - 46], [CW - 46, CH - 46]].forEach(([x, y]) => diamond(ctx, x, y, 16, gold));
      diamond(ctx, CW / 2, 46, 10, gold);
      diamond(ctx, CW / 2, CH - 46, 10, gold);
    },
  },
};

// ---------- menggambar kolase ----------
const imageCache = new Map();
function loadImage(url) {
  if (!imageCache.has(url)) {
    imageCache.set(
      url,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Gambar gagal dimuat.'));
        img.src = url;
      })
    );
  }
  return imageCache.get(url);
}

function drawPhoto(ctx, img, r, frame, shadow) {
  const b = frame.border;
  if (b > 0) {
    ctx.save();
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; }
    ctx.fillStyle = frame.color;
    roundRect(ctx, r.x, r.y, r.w, r.h, frame.radius);
    ctx.fill();
    ctx.restore();
  }
  const ix = r.x + b, iy = r.y + b, iw = r.w - 2 * b, ih = r.h - 2 * b;
  ctx.save();
  roundRect(ctx, ix, iy, iw, ih, Math.max(0, frame.radius - b));
  ctx.clip();
  const scale = Math.max(iw / img.width, ih / img.height); // isi penuh kotak, kelebihan dipotong dari tengah
  const sw = iw / scale, sh = ih / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, ix, iy, iw, ih);
  ctx.restore();
}

function drawCaption(ctx, text, color) {
  if (!text) return;
  let size = 58;
  ctx.font = `italic ${size}px Georgia, 'Times New Roman', serif`;
  while (ctx.measureText(text).width > CW - 200 && size > 26) {
    size -= 2;
    ctx.font = `italic ${size}px Georgia, 'Times New Roman', serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, CW / 2, CH - 135);
}

// Menggambar latar sebuah template (tema bawaan atau gambar pemilik). template = null berarti polos putih.
function drawTemplateBackground(ctx, template, bgImage) {
  if (template && template.kind === 'theme' && THEMES[template.theme_key]) {
    THEMES[template.theme_key].draw(ctx);
  } else if (template && template.kind === 'image' && bgImage) {
    const s = Math.max(CW / bgImage.width, CH / bgImage.height);
    const w = bgImage.width * s, h = bgImage.height * s;
    ctx.drawImage(bgImage, (CW - w) / 2, (CH - h) / 2, w, h);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CW, CH);
  }
}

// Menggambar seluruh kolase ke canvas.
// options: { images: [HTMLImageElement], layout: '4g', template: {...} | null, bgImage: HTMLImageElement | null, caption: '...' }
function drawCollage(canvas, options) {
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');
  const { images, layout, template, bgImage, caption } = options;
  const hasTemplate = !!template;
  drawTemplateBackground(ctx, template, bgImage);
  if (hasTemplate && template.kind === 'image') {
    // gradasi gelap di bawah supaya tulisan putih mudah dibaca di atas gambar apa pun
    const g = ctx.createLinearGradient(0, CH - 330, 0, CH);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, CH - 330, CW, 330);
  }

  if (!images.length) {
    ctx.fillStyle = hasTemplate && template.kind === 'theme' && template.theme_key === 'elegant' ? '#d8b96e' : '#8a7f8e';
    ctx.font = "40px system-ui, 'Segoe UI', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Pilih foto untuk memulai', CW / 2, CH / 2);
    return;
  }

  const def = LAYOUTS[layout] || LAYOUTS['1'];
  const area = hasTemplate ? { x: 90, y: 110, w: 900, h: 1010 } : { x: 30, y: 30, w: 1020, h: 1290 };
  const gap = hasTemplate ? 22 : 10;
  let frame = { color: '#ffffff', border: 0, radius: 0 };
  let captionColor = '#7a7280';
  if (hasTemplate) {
    if (template.kind === 'theme' && THEMES[template.theme_key]) {
      frame = THEMES[template.theme_key].frame;
      captionColor = THEMES[template.theme_key].text;
    } else {
      frame = { color: '#ffffff', border: 12, radius: 14 };
      captionColor = '#ffffff';
    }
  }

  def.slots.forEach((slot, i) => {
    const img = images[i];
    if (!img) return;
    // Celah antar foto: hanya sisi yang bersebelahan dengan kotak lain yang dikecilkan setengah celah
    let x0 = area.x + slot[0] * area.w;
    let x1 = x0 + slot[2] * area.w;
    let y0 = area.y + slot[1] * area.h;
    let y1 = y0 + slot[3] * area.h;
    if (slot[0] > 0.001) x0 += gap / 2;
    if (slot[0] + slot[2] < 0.999) x1 -= gap / 2;
    if (slot[1] > 0.001) y0 += gap / 2;
    if (slot[1] + slot[3] < 0.999) y1 -= gap / 2;
    const r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    drawPhoto(ctx, img, r, frame, hasTemplate);
  });

  if (hasTemplate) drawCaption(ctx, caption, captionColor);
}

// ---------- jendela alat kolase ----------
function openStudio({ code, info, photos }) {
  const templates = (info && info.templates) || [];
  const usable = photos.filter((p) => p.media_type === 'image' && p.can_use && p.use_url);

  const st = { picked: [], layout: null, tpl: -1, caption: '', captionTouched: false, token: 0 };

  const m = openModal(
    `
    <h2>Buat kolase</h2>
    <div class="stack">
      <div class="alert alert-info small">Kamu bisa memakai foto milikmu dan foto publik yang diizinkan pemiliknya. Video tidak bisa dimasukkan ke kolase, tapi bisa diunduh satu per satu dari galeri.</div>
      <div class="stack" style="gap:6px"><b>1. Pilih foto (maksimal ${MAX_PICK})</b><div class="pick-grid" id="s-pick"></div></div>
      <div class="stack" style="gap:6px"><b>2. Pilih layout</b><div class="row" id="s-layouts"></div></div>
      <div class="stack" style="gap:6px"><b>3. Pilih template</b><div class="tpl-grid" id="s-tpl"></div></div>
      <div class="field" id="s-caption-box"><label for="s-caption">Tulisan di bawah kolase</label><input id="s-caption" type="text" maxlength="80" /></div>
      <div class="studio-preview"><canvas id="s-canvas" width="${CW}" height="${CH}"></canvas></div>
      <div class="row">
        <button class="btn btn-primary grow" type="button" id="s-download" disabled>Unduh kolase</button>
        <button class="btn grow hidden" type="button" id="s-share">Bagikan</button>
      </div>
    </div>`,
    { wide: true }
  );
  const box = m.box;
  const canvas = $('#s-canvas', box);

  // 1. pilih foto
  const pickGrid = $('#s-pick', box);
  if (!usable.length) {
    pickGrid.outerHTML = '<div class="empty">Belum ada foto yang bisa dipakai. Unggah fotomu dulu, atau tunggu tamu lain mengizinkan fotonya dipakai.</div>';
  } else {
    usable.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pick';
      b.innerHTML = `<img src="${esc(p.thumb_url)}" alt="" /><span class="n hidden"></span>`;
      b.addEventListener('click', () => {
        const i = st.picked.indexOf(p.id);
        if (i >= 0) st.picked.splice(i, 1);
        else if (st.picked.length >= MAX_PICK) return toast(`Maksimal ${MAX_PICK} foto.`, true);
        else st.picked.push(p.id);
        syncPicks();
      });
      b.dataset.id = p.id;
      pickGrid.appendChild(b);
    });
  }

  function syncPicks() {
    $$('.pick', box).forEach((b) => {
      const i = st.picked.indexOf(Number(b.dataset.id));
      b.classList.toggle('on', i >= 0);
      const n = $('.n', b);
      n.classList.toggle('hidden', i < 0);
      n.textContent = i + 1;
    });
    const options = layoutsFor(st.picked.length);
    if (!options.includes(st.layout)) st.layout = options[0] || null;
    renderLayouts(options);
    render();
  }

  // 2. layout
  function renderLayouts(options) {
    const row = $('#s-layouts', box);
    if (!st.picked.length) {
      row.innerHTML = '<span class="hint">Pilih foto dulu. Pilihan layout menyesuaikan jumlah fotonya.</span>';
      return;
    }
    if (!options.length) {
      row.innerHTML = '<span class="hint">Belum ada layout untuk jumlah foto ini. Pilih 1, 2, 3, 4, 5, atau 6 foto.</span>';
      return;
    }
    row.innerHTML = '';
    options.forEach((key) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'chip' + (key === st.layout ? ' active' : '');
      c.textContent = LAYOUTS[key].label;
      c.addEventListener('click', () => { st.layout = key; renderLayouts(options); render(); });
      row.appendChild(c);
    });
  }

  // 3. template
  const tplGrid = $('#s-tpl', box);
  function addTemplateTile(label, drawThumb, index) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tpl' + (index === st.tpl ? ' active' : '');
    const thumb = drawThumb();
    b.appendChild(thumb);
    const span = document.createElement('span');
    span.textContent = label;
    b.appendChild(span);
    b.addEventListener('click', () => {
      st.tpl = index;
      $$('.tpl', box).forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      if (!st.captionTouched) {
        st.caption = index >= 0 ? templates[index].caption || (info && info.title) || '' : '';
        $('#s-caption', box).value = st.caption;
      }
      $('#s-caption-box', box).classList.toggle('hidden', index < 0);
      render();
    });
    tplGrid.appendChild(b);
  }
  const themeThumb = (key) => () => {
    const c = document.createElement('canvas');
    c.width = 216; c.height = 270;
    const ctx = c.getContext('2d');
    ctx.scale(0.2, 0.2);
    THEMES[key].draw(ctx);
    return c;
  };
  addTemplateTile('Tanpa template', () => {
    const d = document.createElement('div');
    d.style.cssText = 'aspect-ratio:4/5;background:#fff;display:flex;align-items:center;justify-content:center;font-size:1.6rem';
    d.textContent = '▭';
    return d;
  }, -1);
  templates.forEach((t, i) => {
    if (t.kind === 'theme' && THEMES[t.theme_key]) addTemplateTile(t.name, themeThumb(t.theme_key), i);
    else if (t.kind === 'image') {
      addTemplateTile(t.name, () => {
        const img = document.createElement('img');
        img.src = t.image_url;
        img.alt = '';
        return img;
      }, i);
    }
  });
  $('#s-caption-box', box).classList.add('hidden');
  $('#s-caption', box).addEventListener('input', (e) => {
    st.caption = e.target.value;
    st.captionTouched = true;
    render();
  });

  // gambar kolase di canvas
  async function render() {
    const token = ++st.token;
    const template = st.tpl >= 0 ? templates[st.tpl] : null;
    try {
      const chosen = st.picked.map((id) => usable.find((p) => p.id === id));
      const [images, bgImage] = await Promise.all([
        Promise.all(chosen.map((p) => loadImage(p.use_url))),
        template && template.kind === 'image' ? loadImage(template.image_url) : Promise.resolve(null),
      ]);
      if (token !== st.token) return; // pilihan sudah berubah lagi, abaikan hasil lama
      const ready = images.length > 0 && images.length === (LAYOUTS[st.layout] || { slots: [] }).slots.length;
      drawCollage(canvas, { images: ready ? images : [], layout: st.layout, template, bgImage, caption: st.caption });
      $('#s-download', box).disabled = !ready;
      $('#s-share', box).disabled = !ready;
    } catch (e) {
      toast(e.message, true);
    }
  }

  function toBlob() {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  }

  $('#s-download', box).addEventListener('click', async () => {
    const blob = await toBlob();
    if (!blob) return toast('Gagal membuat gambar kolase.', true);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kolase-${code}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast('Kolase diunduh.');
  });

  // Tombol Bagikan hanya muncul di perangkat yang mendukungnya (umumnya HP)
  if (navigator.canShare && navigator.share) {
    try {
      const probe = new File([''], 'x.jpg', { type: 'image/jpeg' });
      if (navigator.canShare({ files: [probe] })) $('#s-share', box).classList.remove('hidden');
    } catch (e) { /* tidak didukung */ }
  }
  $('#s-share', box).addEventListener('click', async () => {
    const blob = await toBlob();
    if (!blob) return;
    try {
      await navigator.share({ files: [new File([blob], `kolase-${code}.jpg`, { type: 'image/jpeg' })], title: info ? info.title : 'Kolase' });
    } catch (e) { /* dibatalkan */ }
  });

  syncPicks();
}