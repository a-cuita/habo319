// Share a walk as a picture (S6-P5, |Q645 (a), |Q646 (a)): its map, with the
// walk's squares in their Litter Index colours and its GPX track; the date,
// pounds, miles and Litter Index; your handle with your level as a badge; and
// HABO's name. On a phone, the phone's share sheet (Facebook among its
// choices); where there isn't one, Download picture. Achievements will share
// the same way (S6-P6).
window.LitterShare = (function () {
  'use strict';
  var G = window.LitterGeo;
  var W = 1080, H = 1350, MAP_H = 880, TILE = 256;
  var TILES = 'https://tile.openstreetmap.org/';

  // Can this browser hand a picture to the phone's share sheet?
  function canShare() {
    try {
      var f = new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' });
      return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [f] }));
    } catch (e) { return false; }
  }
  function label() { return canShare() ? 'Share' : 'Download picture'; }

  // Web Mercator pixels at zoom z.
  function px(lat, lon, z) {
    var s = TILE * Math.pow(2, z), r = lat * Math.PI / 180;
    return { x: (lon + 180) / 360 * s, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * s };
  }

  // What the walk covers: its track's points and its squares' corners.
  function extent(walk) {
    var pts = [];
    (walk.track || []).forEach(function (p) { pts.push([p[0], p[1]]); });
    (walk.stretches || []).forEach(function (s) { (s.cells || []).forEach(function (c) { var b = G.cellBounds(c); pts.push(b[0], b[1]); }); });
    if (!pts.length) return null;
    var lat = pts.map(function (p) { return p[0]; }), lon = pts.map(function (p) { return p[1]; });
    return { s: Math.min.apply(null, lat), n: Math.max.apply(null, lat), w: Math.min.apply(null, lon), e: Math.max.apply(null, lon) };
  }

  function loadTile(z, x, y) {
    return new Promise(function (resolve) {
      var n = Math.pow(2, z), img = new Image(), done = false;
      img.crossOrigin = 'anonymous';
      var end = function (ok) { if (done) return; done = true; resolve(ok ? img : null); };
      img.onload = function () { end(true); };
      img.onerror = function () { end(false); };
      setTimeout(function () { end(false); }, 8000);
      img.src = TILES + z + '/' + ((x % n) + n) % n + '/' + y + '.png';
    });
  }

  // The map part: OpenStreetMap's tiles, the walk's squares, and its track.
  function drawMap(ctx, walk) {
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, 0, W, MAP_H);
    var b = extent(walk);
    if (!b) return Promise.resolve(false);
    // The closest zoom that fits the walk, up to OpenStreetMap's 19; a short
    // walk is then enlarged, up to 4 times, so it fills the picture.
    var pad = 0.18, z = 19, a, c;
    for (; z > 3; z--) {
      a = px(b.n, b.w, z); c = px(b.s, b.e, z);
      if ((c.x - a.x) * (1 + 2 * pad) <= W && (c.y - a.y) * (1 + 2 * pad) <= MAP_H) break;
    }
    a = px(b.n, b.w, z); c = px(b.s, b.e, z);
    var k = z === 19 ? Math.max(1, Math.min(4, W / Math.max(1, (c.x - a.x) * (1 + 2 * pad)), MAP_H / Math.max(1, (c.y - a.y) * (1 + 2 * pad)))) : 1;
    var T = TILE * k;
    var ox = (a.x + c.x) / 2 * k - W / 2, oy = (a.y + c.y) / 2 * k - MAP_H / 2;
    var at = function (lat, lon) { var p = px(lat, lon, z); return { x: p.x * k - ox, y: p.y * k - oy }; };
    var jobs = [];
    for (var tx = Math.floor(ox / T); tx * T < ox + W; tx++) {
      for (var ty = Math.floor(oy / T); ty * T < oy + MAP_H; ty++) {
        (function (tx, ty) {
          jobs.push(loadTile(z, tx, ty).then(function (img) { return { img: img, x: tx * T - ox, y: ty * T - oy }; }));
        })(tx, ty);
      }
    }
    return Promise.all(jobs).then(function (tiles) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, MAP_H); ctx.clip();
      var drawn = 0;
      tiles.forEach(function (t) { if (t.img) { ctx.drawImage(t.img, t.x, t.y, T + 0.5, T + 0.5); drawn++; } });
      // Each weighing's squares, in its Litter Index colour.
      (walk.stretches || []).forEach(function (s) {
        if (s.discarded || s.index == null) return;
        ctx.fillStyle = G.indexColour(s.index, walk.colours || ['#2c7bb6', '#f6e8c3', '#8c510a']);
        ctx.globalAlpha = 0.6;
        (s.cells || []).forEach(function (cell) {
          var q = G.cellBounds(cell), p1 = at(q[1][0], q[0][1]), p2 = at(q[0][0], q[1][1]);
          ctx.fillRect(p1.x, p1.y, Math.max(2, p2.x - p1.x), Math.max(2, p2.y - p1.y));
        });
        ctx.globalAlpha = 1;
      });
      // The GPX track, where you walked; the paused parts lighter.
      G.trackRuns(walk.track || []).forEach(function (run) {
        ctx.beginPath();
        run.pts.forEach(function (p, i) { var q = at(p[0], p[1]); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
        ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = run.paused ? 'rgba(107,114,128,0.7)' : '#111827';
        ctx.stroke();
      });
      ctx.restore();
      // OpenStreetMap's credit, as its tiles ask.
      ctx.font = '600 22px system-ui, sans-serif';
      var credit = '© OpenStreetMap contributors', cw = ctx.measureText(credit).width;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(W - cw - 24, MAP_H - 38, cw + 24, 38);
      ctx.fillStyle = '#374151';
      ctx.fillText(credit, W - cw - 12, MAP_H - 12);
      if (look.scale) drawScale(ctx, walk.colours || ['#2c7bb6', '#f6e8c3', '#8c510a']);
      return drawn > 0;
    });
  }

  // The scale (Jeremy, Nov 6: "can we get the scale of the measurement in
  // the image?"; "agree" to the Litter Index, 0 to 10): the map's colours as
  // a bar, in the map's bottom-left corner.
  function drawScale(ctx, colours) {
    var x = 24, w = 420, h = 104, y = MAP_H - h - 20, bx = x + 20, bw = w - 40, by = y + 44, bh = 22;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    roundRect(ctx, x, y, w, h, 14); ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Litter Index', bx, y + 32);
    var g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    for (var i = 0; i <= 10; i++) g.addColorStop(i / 10, G.indexColour(i, colours));
    ctx.fillStyle = g;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.5; ctx.strokeRect(bx, by, bw, bh);
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText('0 clean', bx, by + bh + 26);
    ctx.textAlign = 'center'; ctx.fillText('5', bx + bw / 2, by + bh + 26);
    ctx.textAlign = 'right'; ctx.fillText('10+', bx + bw, by + bh + 26);
    ctx.textAlign = 'left';
  }

  // A walk's Litter Index: its weighings' readings, weighted by their miles.
  function walkIndex(walk) {
    var t = 0, m = 0;
    (walk.stretches || []).forEach(function (s) {
      if (s.discarded || s.index == null) return;
      var mi = (Number(s.streetMi) || 0) + (Number(s.offMi) || 0) || 0.0001;
      t += s.index * mi; m += mi;
    });
    return m ? t / m : null;
  }
  function round(v, d) { var k = Math.pow(10, d); return Math.round(v * k) / k; }
  // What the picture shows, as admins set it in Settings (S6-P5 round 2): a
  // layout, each part on or off on top of it, and the app's name.
  var look = { numbers: true, index: true, scale: true, when: true, who: true, name: true, appName: 'HABO Litter Collection' };
  function setLook(l) { if (l && typeof l === 'object') look = Object.assign({}, look, l); }
  // "10:02 to 10:19 AM", or "11:50 AM to 12:20 PM".
  function times(a, b) {
    var t = function (ms) { return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
    if (!b || b <= a) return t(a);
    var s = t(a), e = t(b), am = / (AM|PM)$/;
    return (s.match(am) || [])[1] === (e.match(am) || [])[1] ? s.replace(am, '') + ' to ' + e : s + ' to ' + e;
  }

  // The words under the map.
  function drawWords(ctx, walk) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, MAP_H, W, H - MAP_H);
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, MAP_H, W, 10);
    var x = 60, y = MAP_H + 92;
    ctx.fillStyle = '#111827';
    ctx.font = '800 70px system-ui, sans-serif';
    if (look.numbers) {
      ctx.fillText(round(walk.pounds || 0, 2) + ' lb  ·  ' + round(walk.miles || 0, 2) + ' mi', x, y);
      y += 74;
    }
    var idx = look.index ? walkIndex(walk) : null;
    ctx.font = '700 44px system-ui, sans-serif';
    if (idx != null) {
      ctx.fillStyle = G.indexColour(idx, walk.colours || ['#2c7bb6', '#f6e8c3', '#8c510a']);
      ctx.fillRect(x, y - 36, 40, 40);
      ctx.strokeStyle = '#111827'; ctx.lineWidth = 2; ctx.strokeRect(x, y - 36, 40, 40);
      ctx.fillStyle = '#111827';
      ctx.fillText('Litter Index ' + idx.toFixed(1), x + 58, y);
      y += 64;
    }
    ctx.font = '500 38px system-ui, sans-serif';
    ctx.fillStyle = '#374151';
    var day = new Date(walk.started || Date.now()).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    // And its time, start to end (Jeremy, Nov 6: "the time should be on there too"; "agree").
    if (look.when) {
      ctx.fillText(day + (walk.started ? '  ·  ' + times(walk.started, walk.ended) : ''), x, y);
      y += 70;
    }
    // Your handle, with your level as a badge.
    ctx.font = '800 46px system-ui, sans-serif';
    ctx.fillStyle = '#111827';
    var who = look.who ? walk.handle || '' : '';
    if (who) ctx.fillText(who, x, y);
    if (look.who && walk.level != null) {
      var hw = ctx.measureText(who).width, badge = 'Level ' + walk.level;
      ctx.font = '800 32px system-ui, sans-serif';
      var bw = ctx.measureText(badge).width + 36, bx = x + hw + 22, by = y - 38;
      ctx.fillStyle = '#fef3c7'; ctx.strokeStyle = '#b45309'; ctx.lineWidth = 3;
      roundRect(ctx, bx, by, bw, 48, 24); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#78350f';
      ctx.fillText(badge, bx + 18, by + 35);
    }
    // The app's name, from Settings (S6-P5 round 2, |Q687 (a)).
    if (look.name) {
      ctx.font = '800 36px system-ui, sans-serif';
      ctx.fillStyle = '#15803d';
      ctx.fillText('🌱 ' + look.appName, x, H - 50);
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // The picture, as a PNG blob.
  function picture(walk) {
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    return drawMap(ctx, walk).then(function () {
      drawWords(ctx, walk);
      return new Promise(function (resolve, reject) {
        try { canvas.toBlob(function (b) { if (b) resolve(b); else reject(new Error('The picture couldn\'t be made.')); }, 'image/png'); }
        catch (e) { reject(new Error('The picture couldn\'t be made.')); }
      });
    });
  }

  function ymdOf(ms) { var d = new Date(ms || Date.now()); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  // A picture handed to the phone's share sheet, or downloaded.
  function deliver(blob, name, title, text) {
    var file = new File([blob], name, { type: 'image/png' });
    if (canShare()) {
      return navigator.share({ files: [file], title: title, text: text })
        .then(function () { return 'shared'; }, function (e) { if (e && e.name === 'AbortError') return 'cancelled'; throw e; });
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return Promise.resolve('downloaded');
  }
  function toBlob(canvas) {
    return new Promise(function (resolve, reject) {
      try { canvas.toBlob(function (b) { if (b) resolve(b); else reject(new Error('The picture couldn\'t be made.')); }, 'image/png'); }
      catch (e) { reject(new Error('The picture couldn\'t be made.')); }
    });
  }

  // Makes the picture, then shares it or downloads it. `walk`: { started,
  // pounds, miles, track, stretches, handle, level, colours }.
  function walkPicture(walk) {
    return picture(walk).then(function (blob) {
      return deliver(blob, 'habo-litter-walk-' + ymdOf(walk.started) + '.png', 'My HABO litter walk', round(walk.pounds || 0, 2) + ' lb of litter collected with HABO.');
    });
  }

  // A badge or a streak (S6-P6, |Q647's addendum, |Q648): `b`: { badge (an
  // emoji), title, line, handle, level, when }.
  function badgePicture(b) {
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#ecfdf5'); g.addColorStop(1, '#fef3c7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, 0, W, 14);
    ctx.textAlign = 'center';
    // The badge, in a ring.
    ctx.beginPath(); ctx.arc(W / 2, 400, 230, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 14; ctx.strokeStyle = '#b45309'; ctx.stroke();
    ctx.font = '240px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111827';
    ctx.fillText(b.badge || '🏅', W / 2, 410);
    ctx.textBaseline = 'alphabetic';
    ctx.font = '800 76px system-ui, sans-serif';
    wrap(ctx, b.title || '', W / 2, 760, W - 120, 86);
    ctx.font = '500 42px system-ui, sans-serif';
    ctx.fillStyle = '#374151';
    var y = wrap(ctx, b.line || '', W / 2, 900, W - 160, 54);
    ctx.font = '500 36px system-ui, sans-serif';
    ctx.fillText(new Date(b.when || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), W / 2, y + 30);
    // Your handle, with your level.
    ctx.font = '800 46px system-ui, sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText((b.handle || '') + (b.level != null ? '  ·  Level ' + b.level : ''), W / 2, H - 150);
    ctx.font = '800 36px system-ui, sans-serif';
    ctx.fillStyle = '#15803d';
    ctx.fillText('🌱 ' + look.appName, W / 2, H - 70);
    var name = 'habo-litter-' + String(b.title || 'badge').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + ymdOf(b.when) + '.png';
    return toBlob(canvas).then(function (blob) { return deliver(blob, name, b.title || 'My HABO badge', (b.title || '') + ': ' + (b.line || '') + ' With HABO.'); });
  }
  // Centred lines, wrapped to a width. Returns the last line's y.
  function wrap(ctx, text, x, y, width, step) {
    var words = String(text).split(' '), line = '', lines = [];
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    lines.forEach(function (l, i) { ctx.fillText(l, x, y + i * step); });
    return y + (lines.length - 1) * step + step;
  }

  return { walkPicture: walkPicture, badgePicture: badgePicture, label: label, canShare: canShare, setLook: setLook, look: function () { return look; } };
})();
