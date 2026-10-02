// Reviewer preview on the home page: "coming soon" for the public, plus
// questions from the Sheet behind an access code. Started by index.html when
// the page isn't an event check-in.
window.Preview = { start: function () {
  'use strict';

  var CODE_KEY = 'previewCode'; // remembered for this browser tab only
  var code = null;

  function $(id) { return document.getElementById(id); }

  function show(id) {
    ['gate', 'survey', 'thanks'].forEach(function (s) { $(s).hidden = s !== id; });
    window.scrollTo(0, 0);
  }

  function setBusy(button, label) {
    if (label) { button.dataset.label = button.textContent; button.textContent = label; }
    else if (button.dataset.label) { button.textContent = button.dataset.label; }
    button.disabled = !!label;
  }

  function remember(value) {
    try { value ? sessionStorage.setItem(CODE_KEY, value) : sessionStorage.removeItem(CODE_KEY); } catch (e) {}
  }

  /* ── Access code ── */

  function revealCodeForm() {
    $('show-code').hidden = true;
    $('code-form').hidden = false;
  }

  $('show-code').addEventListener('click', function () {
    revealCodeForm();
    $('code').focus();
  });

  $('code-form').addEventListener('submit', function (e) {
    e.preventDefault();
    unlock($('code').value.trim());
  });

  function unlock(value) {
    if (!value) return;
    var button = $('code-form').querySelector('button');
    $('code-err').textContent = '';
    setBusy(button, 'Checking…');
    App.api('previewUnlock', { code: value })
      .then(function (data) {
        code = value;
        remember(value);
        renderSurvey(data);
        show('survey');
      })
      .catch(function (err) {
        remember(null);
        revealCodeForm();
        $('code-err').textContent = err.message;
      })
      .then(function () { setBusy(button, null); });
  }

  /* ── Questions ── */

  function renderSurvey(data) {
    $('intro').textContent = data.intro || '';
    var list = $('questions');
    list.textContent = '';
    data.questions.forEach(function (q, i) {
      var card = document.createElement('section');
      card.className = 'card';
      card.dataset.question = q.question;

      var title = document.createElement('h2');
      title.textContent = q.question;
      card.appendChild(title);

      q.choices.forEach(function (choice) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice';
        b.textContent = choice;
        b.setAttribute('aria-pressed', 'false');
        card.appendChild(b);
      });

      var wrap = document.createElement('div');
      wrap.className = 'ig';
      var note = document.createElement('textarea');
      note.id = 'note-' + i;
      note.placeholder = q.choices.length ? 'Add a note (optional)' : 'Your answer';
      note.setAttribute('aria-label', q.choices.length ? 'Note' : 'Answer');
      wrap.appendChild(note);
      card.appendChild(wrap);

      list.appendChild(card);
    });
  }

  // Tapping a choice selects it; tapping it again clears it.
  $('questions').addEventListener('click', function (e) {
    var b = e.target.closest('.choice');
    if (!b) return;
    var wasOn = b.getAttribute('aria-pressed') === 'true';
    b.parentNode.querySelectorAll('.choice').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
    if (!wasOn) b.setAttribute('aria-pressed', 'true');
  });

  $('survey').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('name').value.trim();
    var answers = Array.prototype.map.call($('questions').children, function (card) {
      var picked = card.querySelector('.choice[aria-pressed="true"]');
      return {
        question: card.dataset.question,
        answer: picked ? picked.textContent : '',
        note: card.querySelector('textarea').value.trim()
      };
    });
    $('survey-err').textContent = '';
    if (!name) { $('survey-err').textContent = 'Please enter your name.'; $('name').focus(); return; }
    if (!answers.some(function (a) { return a.answer || a.note; })) {
      $('survey-err').textContent = 'Please answer at least one question.';
      return;
    }
    var button = $('survey').querySelector('button[type=submit]');
    setBusy(button, 'Sending…');
    App.api('previewSubmit', { code: code, name: name, answers: answers })
      .then(function (data) {
        $('thanks-msg').textContent = 'Thanks, ' + name + '. Your ' + data.saved +
          (data.saved === 1 ? ' answer is' : ' answers are') + ' saved.';
        show('thanks');
      })
      .catch(function (err) { $('survey-err').textContent = err.message; })
      .then(function () { setBusy(button, null); });
  });

  $('again').addEventListener('click', function () {
    $('questions').querySelectorAll('.choice').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
    $('questions').querySelectorAll('textarea').forEach(function (t) { t.value = ''; });
    show('survey');
  });

  /* ── Start ── */

  if (!App.isConfigured) {
    $('show-code').hidden = true;
  } else {
    var saved = null;
    try { saved = sessionStorage.getItem(CODE_KEY); } catch (e) {}
    if (saved) { $('code').value = saved; revealCodeForm(); unlock(saved); }
  }
} };
