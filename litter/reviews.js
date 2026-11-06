// Reviews in Admin Mode (S5-P19 B, |Q584, |Q593 (a)): each segment
// submitted to be public, on its map, with every move on it. An Apprentice
// recommends Approve or Decline, with the XP it should earn and a note; a
// Builder or above approves or declines it. Approve makes it public and gives
// the player that XP; Decline needs a note, which the player sees.
window.LitterReviews = function (app) {
  'use strict';
  var $ = app.$;
  var view = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function when(ms) {
    return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function open() {
    app.show('v-reviews');
    window.scrollTo(0, 0);
    $('reviews-list').textContent = '';
    $('reviews-note').textContent = 'Loading the reviews…';
    return app.api('reviewsLoad', { token: app.myToken() }).then(use, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
      $('reviews-note').textContent = err.message;
    });
  }
  function use(d) {
    view = d;
    var box = $('reviews-list');
    box.textContent = '';
    var waiting = d.reviews.filter(function (r) { return r.open; }).length;
    $('reviews-note').textContent = (waiting ? (waiting === 1 ? '1 waits' : waiting + ' wait') + ' for a review.' : 'Nothing waits for a review.') +
      (d.canDecide ? ' As a ' + d.rank + ', you approve or decline.' : ' As an ' + d.rank + ', you recommend; a Builder or above decides.');
    d.reviews.forEach(function (r) { box.appendChild(card(r)); });
    setTimeout(function () { if (app.drawSmallMaps) app.drawSmallMaps(box); }, 0);
  }

  function moveLine(m) {
    return when(m.time) + ' · ' + m.by + ' (' + m.rank + '): ' + m.move + (m.xp != null && m.move !== 'Declined' && m.move !== 'Recommends Decline' ? ', ' + m.xp + ' XP' : '') + (m.note ? '. "' + m.note + '"' : '');
  }

  function card(r) {
    var box = el('section', 'card lt-review ' + r.state.toLowerCase());
    box.id = 'rv-' + r.id;
    box.appendChild(el('p', 'lt-col-head', r.name));
    box.appendChild(el('p', 'small lt-review-state', r.state + ' · ' + r.kind + ' · ' + r.squares.length + ' squares · ' + Math.round(r.miles * 100) / 100 + ' mi'));
    box.appendChild(el('p', 'muted small', (r.addition ? 'Asked by ' : 'Submitted by ') + r.by + (r.proposed ? ', ' + when(r.proposed) : '')));
    if (r.addition && r.askNote) box.appendChild(el('p', 'small', '"' + r.askNote + '"'));
    if (app.smallMap) {
      // An addition (S5-U17, |M711): the segment in its colour, the piece to add in orange.
      if (r.addition) {
        var colourOf = {};
        r.squares.forEach(function (x) { colourOf[x] = '#c2410c'; });
        box.appendChild(app.smallMap(r.name, (r.targetSquares || []).concat(r.squares), { kind: 'public', colourOf: colourOf }));
        box.appendChild(el('p', 'muted small', 'Orange: the piece to add.'));
      } else box.appendChild(app.smallMap(r.name, r.squares, { kind: 'public' }));
    }
    if (r.moves.length) {
      var list = el('div', 'lt-review-moves');
      r.moves.forEach(function (m) { list.appendChild(el('p', 'small lt-review-move', moveLine(m))); });
      box.appendChild(list);
    }
    if (r.open) box.appendChild(form(r));
    // Talked through in the Forum (S5-P28): its topic, linked both ways.
    if (app.openForum) {
      var f = el('button', 'btn btn-secondary lt-review-forum', 'Open in the Forum');
      f.type = 'button';
      f.addEventListener('click', function () { app.openForum(r.id); });
      box.appendChild(f);
    }
    return box;
  }

  // What this admin can do: recommend, or approve or decline.
  function form(r) {
    var f = el('div', 'lt-review-form');
    var xpRow = el('div', 'ig'), xpLabel = el('label', null, 'XP for ' + r.by + ' (0 to ' + view.maxXp + ')'), xp = el('input', 'lt-review-xp');
    xp.type = 'number'; xp.min = 0; xp.max = view.maxXp; xp.step = 1; xp.inputMode = 'numeric'; xp.id = 'rv-xp-' + r.id; xpLabel.htmlFor = xp.id;
    if (r.recommendedXp != null) xp.value = r.recommendedXp;
    xpRow.appendChild(xpLabel); xpRow.appendChild(xp);
    var noteRow = el('div', 'ig'), noteLabel = el('label', null, 'Note' + (view.canDecide ? ' (the player sees it if you decline)' : '')), note = el('textarea', 'lt-review-note');
    note.id = 'rv-note-' + r.id; noteLabel.htmlFor = note.id; note.rows = 2; note.maxLength = 1000;
    noteRow.appendChild(noteLabel); noteRow.appendChild(note);
    f.appendChild(xpRow); f.appendChild(noteRow);
    var err = el('p', 'err');
    err.id = 'rv-err-' + r.id;
    err.setAttribute('role', 'alert');
    var go = function (b, body, done) {
      app.busy(b, err.id, function () {
        return app.api('reviewMove', Object.assign({ token: app.myToken(), segmentId: r.id, xp: xp.value, note: note.value }, body)).then(function (d) {
          use(d);
          app.notice(done);
        });
      });
    };
    var row = el('div', 'lt-review-buttons');
    if (view.canDecide) {
      var yes = el('button', 'btn btn-primary lt-review-approve', 'Approve'), no = el('button', 'btn btn-secondary lt-review-decline', 'Decline');
      yes.type = 'button'; no.type = 'button';
      yes.addEventListener('click', function () { go(yes, { move: 'approve' }, r.addition ? r.name.replace(/^Add to /, '') + ' has the piece added now, and ' + r.by + ' earns ' + xp.value + ' XP.' : r.name + ' is public now, and ' + r.by + ' earns ' + xp.value + ' XP.'); });
      no.addEventListener('click', function () { go(no, { move: 'decline' }, r.addition ? 'Declined: the piece isn\'t added to ' + r.name.replace(/^Add to /, '') + '.' : r.name + ' is declined. ' + r.by + ' sees your note, and can submit it again.'); });
      row.appendChild(yes); row.appendChild(no);
    } else {
      var ry = el('button', 'btn btn-primary lt-review-rec-approve', 'Recommend Approve'), rn = el('button', 'btn btn-secondary lt-review-rec-decline', 'Recommend Decline');
      ry.type = 'button'; rn.type = 'button';
      ry.addEventListener('click', function () { go(ry, { move: 'recommend', recommend: 'Approve' }, 'Recommended: approve ' + r.name + '. A Builder or above decides.'); });
      rn.addEventListener('click', function () { go(rn, { move: 'recommend', recommend: 'Decline' }, 'Recommended: decline ' + r.name + '. A Builder or above decides.'); });
      row.appendChild(ry); row.appendChild(rn);
    }
    f.appendChild(row);
    f.appendChild(err);
    return f;
  }

  // The Reviews button, in the Admin Mode box while Admin Mode is on.
  function sync() { $('me-go-reviews').hidden = !$('cl-sim').checked; }
  $('cl-sim').addEventListener('change', sync);
  $('me-go-reviews').addEventListener('click', function () { if (app.closePanel) app.closePanel(); app.notice(''); open(); });
  $('reviews-back').addEventListener('click', function () { if (app.back) app.back(); });

  return { open: open, sync: sync };
};
